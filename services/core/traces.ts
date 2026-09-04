import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { and, desc, eq, isNull, lte, sql } from "drizzle-orm";
import type { Patch } from "@model/ai";
import type { ArtifactContent } from "@model/artifact";
import type { ToolId, ToolSurface } from "@model/tools";
import type { ModelCall, ModelSpan, ToolSpan, Trace, TraceStatus } from "@model/trace";
import { modelCalls, stripBodies, tokensOf } from "@model/trace";
import { db } from "@services/db/client";
import { schema } from "@services/db/schema";
import { DEMO_EMAIL } from "@services/db/seed/workspaces";
import type { AiFailureReason } from "@model/analytics";
import { capture } from "@services/utils/analytics";

// The trace is opened by the executor around every root tool call and closed when the call
// settles, so a record exists for every surface without any route remembering to write one. The
// meter hands it every model call, the hold hands it the settled credits, and a nested call (the
// chat agent's sub-tools, ctx.use) becomes a child span rather than a second trace. What is kept
// is decided here at close: the bodies stay only at `full`, which is the eval account's calls and
// any call that did not end well.

export const TRACE_CAP = 1000; // rows kept per workspace; pruned on write
// a full-level input larger than this is replaced by its size: a chat call carries the open
// artifact and the history, which the content column and the thread already hold
const INPUT_CAP = 32_000;
// tools whose input carries no content, so keeping it at metrics tells the whole story of the call
const INPUT_KEPT = new Set<ToolId>([
    "set-format",
    "set-theme",
    "reorder-section",
    "remove-section",
    "pick-version",
    "read-generation",
    "finish-generation",
]);

export interface TraceStore {
    save(trace: Trace): Promise<void>;
    /** Whether this person's calls keep their bodies whatever the outcome. */
    full(userId: string | null): Promise<boolean>;
}

interface Live {
    trace: Trace;
    start: number;
    full: boolean;
    kept: boolean; // a store will receive it, so the id is worth handing back
}

const live = new AsyncLocalStorage<Live>();
const parent = new AsyncLocalStorage<string>(); // the tool span in progress

// process-wide, set by the entry point: the executor must not choose a database itself, and a
// unit test that registers nothing runs every trace in memory and drops it
let sink: TraceStore | null = null;
export function setTraceStore(store: TraceStore | null): void {
    sink = store;
}

export const tracing = (): boolean => live.getStore() !== undefined;

interface TraceRoot {
    tool: ToolId;
    surface: ToolSurface;
    principal: { userId: string; ws: { id: string } } | null;
    models: Record<string, string>;
}

export interface SpanHandle {
    id: string;
    /** the trace this call is part of, when a store will keep it */
    traceId: string | null;
    note(fields: {
        generationId?: string;
        artifactId?: string;
        input?: unknown;
        content?: ArtifactContent | null;
    }): void;
    patched(patch: Patch): void;
    /** the outcome the executor decided; a throw is recorded by the tracer itself */
    end(status: TraceStatus, error?: string): void;
}

const pending = new Set<Promise<void>>();

/** Awaits every write in flight, for a harness about to exit and for tests. */
export const flushTraces = (): Promise<void> => Promise.all([...pending]).then(() => undefined);

export async function traceCall<T>(
    root: TraceRoot,
    run: (span: SpanHandle) => Promise<T>,
): Promise<T> {
    const open = live.getStore();
    if (open) return child(open, root.tool, root.surface, run);
    const store = sink;
    const full = store ? await store.full(root.principal?.userId ?? null) : false;
    const start = Date.now();
    const id = randomUUID();
    const span: ToolSpan = {
        kind: "tool",
        id,
        parent: null,
        at: 0,
        tool: root.tool,
        surface: root.surface,
        ms: 0,
        status: "ok",
    };
    const state: Live = {
        trace: {
            id,
            workspaceId: root.principal?.ws.id ?? null,
            userId: root.principal?.userId ?? null,
            surface: root.surface,
            tool: root.tool,
            generationId: null,
            artifactId: null,
            level: "metrics",
            status: "ok",
            error: null,
            models: root.models,
            tokensIn: 0,
            tokensOut: 0,
            credits: 0,
            ms: 0,
            at: new Date(start).toISOString(),
            spans: [span],
            input: null,
            content: null,
        },
        start,
        full,
        kept: !!store,
    };
    try {
        return await live.run(state, () => parent.run(id, () => run(handleFor(state, span))));
    } catch (e) {
        failed(span, e);
        throw e;
    } finally {
        close(state, store);
    }
}

/** A sub-tool run through `ctx.use`: a child span, with every model call it makes under it. */
export async function* traceUse<T, R>(
    tool: ToolId,
    make: () => AsyncGenerator<T, R>,
): AsyncGenerator<T, R> {
    const open = live.getStore();
    if (!open) return yield* make();
    const span = childSpan(open, tool, "internal");
    const t0 = Date.now();
    try {
        // each step is driven inside the span's scope: the context a generator body sees is the
        // one its `next()` was called from, so wrapping only the creation would attribute nothing
        const gen = await parent.run(span.id, async () => make());
        for (;;) {
            const step = await parent.run(span.id, () => gen.next());
            if (step.done) return step.value;
            yield step.value;
        }
    } catch (e) {
        failed(span, e);
        throw e;
    } finally {
        span.ms = Date.now() - t0;
    }
}

export function noteModel(span: ModelSpan): void {
    const open = live.getStore();
    if (!open) return;
    open.trace.spans.push({
        kind: "model",
        id: randomUUID(),
        parent: parent.getStore() ?? open.trace.id,
        // recorded when the call returned, so its start is that much earlier
        at: Math.max(0, Date.now() - open.start - span.ms),
        ...span,
    });
}

/** A body notes something about its own run on the tool span in progress. */
export function flag(name: string): void {
    const open = live.getStore();
    if (!open) return;
    const id = parent.getStore() ?? open.trace.id;
    const span = open.trace.spans.find((s) => s.id === id);
    if (span?.kind === "tool") span.flags = [...(span.flags ?? []), name];
}

export function noteCredits(settled: number): void {
    const open = live.getStore();
    if (open) open.trace.credits += settled;
}

function childSpan(open: Live, tool: ToolId, surface: ToolSurface): ToolSpan {
    const span: ToolSpan = {
        kind: "tool",
        id: randomUUID(),
        parent: parent.getStore() ?? open.trace.id,
        at: Date.now() - open.start,
        tool,
        surface,
        ms: 0,
        status: "ok",
    };
    open.trace.spans.push(span);
    return span;
}

async function child<T>(
    open: Live,
    tool: ToolId,
    surface: ToolSurface,
    run: (span: SpanHandle) => Promise<T>,
): Promise<T> {
    const span = childSpan(open, tool, surface);
    const t0 = Date.now();
    try {
        return await parent.run(span.id, () => run(handleFor(open, span)));
    } catch (e) {
        failed(span, e);
        throw e;
    } finally {
        span.ms = Date.now() - t0;
    }
}

function handleFor(state: Live, span: ToolSpan): SpanHandle {
    const root = span.parent === null;
    return {
        id: span.id,
        traceId: state.kept ? state.trace.id : null,
        note: (fields) => {
            if (!root) return; // the subject and the bodies are the root call's
            const t = state.trace;
            if (fields.generationId) t.generationId = fields.generationId;
            if (fields.artifactId) t.artifactId = fields.artifactId;
            if ("input" in fields) t.input = fields.input ?? null;
            if ("content" in fields) t.content = fields.content ?? null;
        },
        patched: (patch) => {
            const c = span.patches ?? { artifact: 0, generation: 0, workspace: false };
            c.artifact += patch.artifact?.length ?? 0;
            c.generation += patch.generation?.length ?? 0;
            c.workspace = c.workspace || !!patch.workspace;
            span.patches = c;
        },
        end: (status, error) => {
            span.status = status;
            if (error) span.error = error;
        },
    };
}

function failed(span: ToolSpan, e: unknown): void {
    const message = e instanceof Error ? e.message : String(e);
    span.status = /abort|cancell?ed/i.test(message) ? "aborted" : "error";
    span.error = message;
}

// Provider wording is all we get back, so the reason is read off it. Order matters: first match wins.
const REASONS: [RegExp, AiFailureReason, boolean][] = [
    [/abort|cancell?ed/i, "aborted", false],
    [/rate.?limit|429|overloaded|quota exceeded/i, "rate_limited", true],
    [/timed out|timeout|ETIMEDOUT|deadline/i, "timeout", true],
    [/did not match schema|no object generated|grammar compilation/i, "invalid_output", true],
    [/no credits|insufficient[_ ]quota|payment/i, "no_credits", false],
];
const failure = (message: string): [AiFailureReason, boolean] => {
    const hit = REASONS.find(([re]) => re.test(message));
    return hit ? [hit[1], hit[2]] : ["provider_error", true];
};

// The model that did most of the writing. A call can touch several, and output tokens are what the
// work actually was, so the biggest producer is the one a latency or failure belongs to.
const dominantModel = (calls: readonly ModelCall[]): string | undefined =>
    calls.reduce<ModelCall | undefined>((a, b) => (!a || b.output > a.output ? b : a), undefined)
        ?.modelId;

// The two events that need the run's outcome are emitted here, off the trace, so the number on
// the event is the number in the row: settled credits, real tokens, the model that answered.
// `ai_action_started` stays with the hold, which is where the estimate is known. A refusal is not
// a failure of the AI and has its own event (`credits_exhausted`) where one is warranted.
function emit(trace: Trace, calls: readonly ModelCall[]): void {
    if (!trace.userId || !trace.workspaceId || trace.status === "refused") return;
    const ctx = { userId: trace.userId, workspaceId: trace.workspaceId };
    const model = dominantModel(calls);
    if (trace.status === "ok") {
        capture(ctx, "ai_action_completed", {
            tool_id: trace.tool,
            credits_charged: trace.credits,
            ms: trace.ms,
            input_tokens: trace.tokensIn,
            output_tokens: trace.tokensOut,
            cached: calls.some((c) => (c.cached ?? 0) > 0),
            ...(model ? { model_id: model } : {}),
        });
        return;
    }
    const [reason, retryable] = failure(trace.error ?? "");
    capture(ctx, "ai_action_failed", {
        tool_id: trace.tool,
        ms: trace.ms,
        reason,
        retryable,
        ...(model ? { model_id: model } : {}),
    });
}

function close(state: Live, store: TraceStore | null): void {
    const { trace, start } = state;
    const root = trace.spans[0] as ToolSpan;
    root.ms = trace.ms = Date.now() - start;
    trace.status = root.status;
    trace.error = root.error ?? null;
    const calls = modelCalls(trace.spans);
    const tokens = tokensOf(calls);
    trace.tokensIn = tokens.input;
    trace.tokensOut = tokens.output;
    emit(trace, calls);
    trace.level = state.full || trace.status !== "ok" ? "full" : "metrics";
    if (trace.level === "metrics") {
        trace.spans = trace.spans.map((s) => (s.kind === "model" ? stripBodies(s) : s));
        if (!INPUT_KEPT.has(trace.tool)) trace.input = null;
        trace.content = null;
    } else if (trace.input !== null) {
        const bytes = JSON.stringify(trace.input)?.length ?? 0;
        if (bytes > INPUT_CAP) trace.input = { clipped: true, bytes };
    }
    if (!store) return;
    // after the outcome is on its way, and never a reason for the call to fail
    const write: Promise<void> = store
        .save(trace)
        .catch(() => undefined)
        .finally(() => {
            pending.delete(write);
        });
    pending.add(write);
}

export function traceStore(): TraceStore {
    let evalUser: Promise<string | null> | null = null;
    const evalUserId = (): Promise<string | null> => {
        evalUser ??= db
            .select({ id: schema.users.id })
            .from(schema.users)
            .where(eq(schema.users.email, DEMO_EMAIL))
            .then((rows) => rows[0]?.id ?? null)
            .catch(() => {
                evalUser = null; // a failed lookup is retried, not remembered
                return null;
            });
        return evalUser;
    };
    return {
        full: async (userId) => !!userId && userId === (await evalUserId()),
        save: async (trace) => {
            await db.insert(schema.traces).values({
                id: trace.id,
                workspaceId: trace.workspaceId,
                userId: trace.userId,
                surface: trace.surface,
                tool: trace.tool,
                generationId: trace.generationId,
                artifactId: trace.artifactId,
                level: trace.level,
                status: trace.status,
                error: trace.error,
                models: trace.models,
                tokensIn: trace.tokensIn,
                tokensOut: trace.tokensOut,
                credits: trace.credits,
                ms: trace.ms,
                spans: trace.spans,
                input: trace.input,
                content: trace.content,
                createdAt: new Date(trace.at),
            });
            await prune(trace.workspaceId);
        },
    };
}

// The cap: rows past the newest TRACE_CAP in this workspace go. Public calls have no workspace and
// are capped as their own group.
async function prune(workspaceId: string | null): Promise<void> {
    const scope = workspaceId
        ? eq(schema.traces.workspaceId, workspaceId)
        : isNull(schema.traces.workspaceId);
    const [edge] = await db
        .select({ at: schema.traces.createdAt })
        .from(schema.traces)
        .where(scope)
        .orderBy(desc(schema.traces.createdAt))
        .offset(TRACE_CAP)
        .limit(1);
    if (!edge) return;
    // the edge is the first row past the cap, so it goes too
    await db.delete(schema.traces).where(and(scope, lte(schema.traces.createdAt, edge.at)));
}

/** The same contract over a list, for tests and for a harness with no database. */
export function memoryTraceStore(opts: { full?: boolean } = {}): TraceStore & { traces: Trace[] } {
    const traces: Trace[] = [];
    return {
        traces,
        full: async () => !!opts.full,
        save: async (trace) => {
            traces.push(trace);
        },
    };
}

// The reads an analyzer wants, kept beside the store because they are the trace concept's own.
// Raw SQL over the spans: a jsonb array of calls is what the row holds, and a query is what
// replaced the playground as the way to read it.

export interface TraceWindow {
    since: Date;
    tool?: ToolId;
    workspaceId?: string;
}

export interface CallRow {
    tool: string;
    model: string;
    traces: number;
    calls: number;
    p50Ms: number;
    p95Ms: number;
    tokensIn: number;
    tokensOut: number;
    cachedPct: number; // share of input the provider served from its cache
}

export interface OutcomeRow {
    tool: string;
    status: string;
    error: string | null;
    count: number;
    credits: number;
    p50Ms: number;
}

export interface TraceSummary {
    calls: CallRow[];
    outcomes: OutcomeRow[];
    // the section writer, read the way its two costs are decided: the cache on the first call of a
    // run versus the rest, and how many beats needed a second call
    sections: {
        first: { calls: number; cachedPct: number };
        later: { calls: number; cachedPct: number };
    };
    retries: { beats: number; retried: number; unchecked: number };
}

const n = (v: unknown): number => (v === null || v === undefined ? 0 : Number(v));

export async function traceSummary(w: TraceWindow): Promise<TraceSummary> {
    const scope = sql`${schema.traces.createdAt} > ${w.since.toISOString()}::timestamp${
        w.tool ? sql` and ${schema.traces.tool} = ${w.tool}` : sql``
    }${w.workspaceId ? sql` and ${schema.traces.workspaceId} = ${w.workspaceId}` : sql``}`;
    const calls = await db.execute(sql`
        select ${schema.traces.tool} as tool, s->>'modelId' as model, count(distinct ${schema.traces.id}) as traces, count(*) as calls,
            percentile_cont(0.5) within group (order by (s->>'ms')::int) as p50,
            percentile_cont(0.95) within group (order by (s->>'ms')::int) as p95,
            sum((s->>'input')::int) as tokens_in, sum((s->>'output')::int) as tokens_out,
            round(100.0 * sum(coalesce((s->>'cached')::int, 0)) / nullif(sum((s->>'input')::int), 0)) as cached_pct
        from ${schema.traces}, jsonb_array_elements(${schema.traces.spans}) s
        where s->>'kind' = 'model' and ${scope}
        group by 1, 2 order by calls desc`);
    const outcomes = await db.execute(sql`
        select ${schema.traces.tool} as tool, ${schema.traces.status} as status, ${schema.traces.error} as error, count(*) as count, sum(${schema.traces.credits}) as credits,
            percentile_cont(0.5) within group (order by ${schema.traces.ms}) as p50
        from ${schema.traces} where ${scope}
        group by 1, 2, 3 order by count desc`);
    const sections = await db.execute(sql`
        with calls as (
            select ${schema.traces.id} as id, (s->>'input')::int as inp, coalesce((s->>'cached')::int, 0) as cached,
                row_number() over (partition by ${schema.traces.id} order by (s->>'at')::int) as rn
            from ${schema.traces}, jsonb_array_elements(${schema.traces.spans}) s
            where s->>'kind' = 'model' and s->>'step' like 'section:%' and ${scope})
        select rn = 1 as first, count(*) as calls,
            round(100.0 * sum(cached) / nullif(sum(inp), 0)) as cached_pct
        from calls group by 1`);
    const retries = await db.execute(sql`
        with beats as (
            select ${schema.traces.id} as id, s->>'step' as step, count(*) as n
            from ${schema.traces}, jsonb_array_elements(${schema.traces.spans}) s
            where s->>'kind' = 'model' and s->>'step' like 'section:%' and ${scope}
            group by 1, 2)
        select count(*) as beats, count(*) filter (where n > 1) as retried from beats`);
    const unchecked = await db.execute(sql`
        select count(*) as unchecked
        from ${schema.traces}, jsonb_array_elements(${schema.traces.spans}) s, jsonb_array_elements_text(s->'flags') f
        where s->>'kind' = 'tool' and f = 'unchecked' and ${scope}`);
    const rows = <T>(r: unknown): T[] =>
        (Array.isArray(r) ? r : ((r as { rows?: T[] }).rows ?? [])) as T[];
    const sec = rows<Record<string, unknown>>(sections);
    const pick = (first: boolean): { calls: number; cachedPct: number } => {
        const r = sec.find((x) => x.first === first);
        return { calls: n(r?.calls), cachedPct: n(r?.cached_pct) };
    };
    const rt = rows<Record<string, unknown>>(retries)[0];
    return {
        calls: rows<Record<string, unknown>>(calls).map((r) => ({
            tool: String(r.tool),
            model: String(r.model),
            traces: n(r.traces),
            calls: n(r.calls),
            p50Ms: n(r.p50),
            p95Ms: n(r.p95),
            tokensIn: n(r.tokens_in),
            tokensOut: n(r.tokens_out),
            cachedPct: n(r.cached_pct),
        })),
        outcomes: rows<Record<string, unknown>>(outcomes).map((r) => ({
            tool: String(r.tool),
            status: String(r.status),
            error: r.error === null || r.error === undefined ? null : String(r.error),
            count: n(r.count),
            credits: n(r.credits),
            p50Ms: n(r.p50),
        })),
        sections: { first: pick(true), later: pick(false) },
        retries: {
            beats: n(rt?.beats),
            retried: n(rt?.retried),
            unchecked: n(rows<Record<string, unknown>>(unchecked)[0]?.unchecked),
        },
    };
}

export interface GenerationTraceRow {
    id: string;
    tool: string;
    status: string;
    error: string | null;
    at: string;
    ms: number;
    calls: number;
    tokensIn: number;
    tokensOut: number;
    credits: number;
    flags: string[];
}

/** One generation's calls in order, as its traces recorded them. */
export async function generationReport(generationId: string): Promise<GenerationTraceRow[]> {
    const rows = await db
        .select()
        .from(schema.traces)
        .where(eq(schema.traces.generationId, generationId))
        .orderBy(schema.traces.createdAt);
    return rows.map((r) => ({
        id: r.id,
        tool: r.tool,
        status: r.status,
        error: r.error,
        at: r.createdAt.toISOString(),
        ms: r.ms,
        calls: modelCalls(r.spans).length,
        tokensIn: r.tokensIn,
        tokensOut: r.tokensOut,
        credits: r.credits,
        flags: r.spans.flatMap((s) => (s.kind === "tool" ? (s.flags ?? []) : [])),
    }));
}
