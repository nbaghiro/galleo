import type { Patch, TurnEvent } from "@model/ai";
import { applyContentOps, emptyPatch } from "@model/ai";
import type { ArtifactContent } from "@model/artifact";
import type { Usage } from "@model/credits";
import { featuresFor } from "@model/billing";
import type { MeterParams, ToolId, ToolScope, ToolSurface } from "@model/tools";
import type { ModelTier } from "@model/billing";
import { scopeFor, sectionsForLength, TOOLS } from "@model/tools";
import { pricesFor, reserve } from "@services/core/spend";
import type { ModelOverrides } from "@services/core/models";
import { modelMap } from "@services/core/models";
import type { SpanHandle } from "@services/core/traces";
import { traceCall } from "@services/core/traces";
import { getTool, makeContext } from "./tools";
import type { ToolContext, ToolPrincipal } from "./tools";
import { generationSize } from "./tools/generation";
import "./tools/register"; // side-effect: every tool body is present wherever a call can arrive

// The one envelope around a tool call: the surface check, the granted scope, the plan entitlement,
// the input schema, the generation it acts on, the credit hold, the patches it makes, and the
// trace that records all of it. Every caller goes through here — the chat agent, the direct
// routes, and the MCP server — so a tool costs the same, validates the same, lands the same and is
// recorded the same however it was reached. The bodies live in ./tools/*, the registry in
// ./tools.ts; this file owns only what happens around them.

export type { ToolPrincipal } from "./tools";

export interface ToolRun {
    id: ToolId;
    surface: ToolSurface;
    input: unknown; // untrusted: the tool's own schema is what parses it
}

export interface RunToolOptions {
    ctx: Omit<ToolContext, "use" | "tier">;
    size?: MeterParams; // scales the estimate for metered tools the executor cannot size itself
    models?: ModelOverrides;
    // Who holds the credits. "caller" means an enclosing turn already reserved for this work, which
    // is what keeps a chat turn on one reservation rather than one per tool call.
    holds?: "self" | "caller";
    // Whether the patches a tool makes are persisted here. False is the agent's `after` policy:
    // the change is forwarded as a proposal and lands only once the user approves it.
    apply?: boolean;
    onEvent?: (event: TurnEvent) => void;
    // Fires once the credits are held and the body is about to run, so a route that streams can
    // answer a refusal with a status and open its stream only for a run that will produce events.
    onHeld?: () => void;
    // Flat-priced assets the run made; tokens are metered for us, so only these need reporting.
    // Handed the result when the body returned one, and nothing when it threw part way.
    produced?: (result: unknown) => Usage;
}

type Outcome<R> =
    | {
          ok: true;
          result: R;
          patches: Patch[]; // what the run changed, applied or not
          artifactId?: string; // the artifact the run acted on when the server held it
          generationId?: string;
      }
    | { ok: false; reason: "unknown-tool" | "wrong-surface" }
    // the granted set did not cover this tool; `needs` is what would have
    | { ok: false; reason: "scope"; needs: ToolScope }
    // the workspace's plan does not carry the entitlement this tool is gated on
    | { ok: false; reason: "entitlement"; feature: string }
    | { ok: false; reason: "bad-input"; issues: string[] }
    | { ok: false; reason: "not-found"; message: string }
    // another writer holds the generation; the caller waits for the section in flight to land
    | { ok: false; reason: "busy" }
    | { ok: false; reason: "credits"; remaining: number; capped?: number };

// `traceId` names the trace the call is part of, present when a store will keep it
export type ToolOutcome<R> = Outcome<R> & { traceId?: string };

// one writer at a time per generation, so two sections are never written against each other; a
// finish takes the same lease, so a stop pressed mid-beat lets the beat land before the run closes
const WRITERS = new Set<ToolId>(["write-beat", "write-beats", "finish-generation"]);

// The units a call is expected to produce, for the hold. Generation writes are sized off the
// generation itself, which only the executor has loaded; everything else takes the caller's word.
function sizeOf(id: ToolId, input: unknown, ctx: ToolContext, given?: MeterParams): MeterParams {
    const gen = generationSize(id, input, ctx.generation);
    if (gen) return { ...given, ...gen };
    if (id === "generate-artifact") {
        const g = input as { length?: string; imageSource?: "stock" | "ai" };
        const n = sectionsForLength(g.length);
        return {
            length: g.length,
            imageSource: g.imageSource,
            ...(ctx.maxSections ? { sections: Math.min(n, ctx.maxSections) } : {}),
            ...given,
        };
    }
    return given ?? {};
}

/**
 * `principal` is null for a public tool, which has no account to bill or gate: it runs at the free
 * plan's model tier and never opens the ledger. The catalog decides which those are, and
 * `check:tools` refuses to let a priced tool claim to be one.
 */
export async function runTool<R = unknown>(
    call: ToolRun,
    principal: ToolPrincipal | null,
    opts: RunToolOptions,
): Promise<ToolOutcome<R>> {
    // a public tool has no plan behind it, so it runs at the free tier's model choice
    const tier = featuresFor(principal?.ws ?? { plan: null }).textModelTier;
    return traceCall(
        { tool: call.id, surface: call.surface, principal, models: modelMap(tier, opts.models) },
        async (span) => {
            const out = await execute<R>(call, principal, opts, tier, span);
            span.end(out.ok ? "ok" : "refused", out.ok ? undefined : out.reason);
            return span.traceId ? { ...out, traceId: span.traceId } : out;
        },
    );
}

async function execute<R>(
    call: ToolRun,
    principal: ToolPrincipal | null,
    opts: RunToolOptions,
    tier: ModelTier,
    span: SpanHandle,
): Promise<Outcome<R>> {
    const def = TOOLS[call.id];
    const tool = getTool(call.id);
    if (!def || !tool) return { ok: false, reason: "unknown-tool" };
    if (!def.surfaces.includes(call.surface)) return { ok: false, reason: "wrong-surface" };

    // Before anything is parsed or held: a caller that may not run this tool must not learn whether
    // its arguments were well formed, and must never reach a body that spends credits. A public
    // tool has neither a granted scope nor a plan, so both gates belong to the accounted path.
    const needs = scopeFor(call.id);
    if (principal?.scopes && !principal.scopes.includes(needs))
        return { ok: false, reason: "scope", needs };

    if (principal && def.requires && !featuresFor(principal.ws)[def.requires])
        return { ok: false, reason: "entitlement", feature: def.requires };

    const parsed = tool.input.safeParse(call.input);
    if (!parsed.success)
        return {
            ok: false,
            reason: "bad-input",
            issues: parsed.error.issues.map((i) =>
                i.path.length ? `${i.path.join(".")}: ${i.message}` : i.message,
            ),
        };

    span.note({ input: parsed.data });
    const ctx = makeContext({ ...opts.ctx, tier, principal: principal ?? undefined });
    if (ctx.artifactId) span.note({ artifactId: ctx.artifactId });

    // the generation a tool acts on is loaded here, once, so a body reads state rather than a row
    const generationId = (parsed.data as { generationId?: unknown }).generationId;
    if (typeof generationId === "string" && ctx.generations) {
        const got = await ctx.generations.read(generationId);
        if (!got)
            return { ok: false, reason: "not-found", message: "That generation was not found." };
        ctx.generation = got.generation;
        ctx.artifact = got.content;
        ctx.artifactId = got.generation.artifactId;
        span.note({ generationId: got.generation.id, artifactId: got.generation.artifactId });
    } else if (def.needs?.includes("generation")) {
        return {
            ok: false,
            reason: "bad-input",
            issues: ["generationId: a generation is required"],
        };
    }

    const patches: Patch[] = [];
    // the artifact as this call leaves it, persisted or not, for the trace
    let after: ArtifactContent | undefined;
    // A patch is applied the moment it is yielded, not after the body returns, so a composite that
    // writes several sections lands each as it comes and a later beat reads the earlier ones.
    const applied = async (patch: Patch): Promise<TurnEvent> => {
        let seq: number | undefined;
        const persist =
            opts.apply !== false &&
            ctx.generation &&
            ctx.generations &&
            (patch.generation?.length || patch.artifact?.length);
        if (persist) {
            const next = await ctx.generations!.apply(ctx.generation!.id, patch);
            ctx.generation = next.generation;
            ctx.artifact = next.content;
            after = next.content;
            seq = next.generation.seq;
        } else if (patch.artifact?.length) {
            const base = after ?? ctx.artifact;
            if (base) after = applyContentOps(base, patch.artifact);
        }
        patches.push(patch);
        span.patched(patch);
        return { type: "patch", patch, ...(seq !== undefined ? { seq } : {}) };
    };
    // the registry erases each tool's input type so one map can hold every shape; the value here
    // came out of that same tool's schema a few lines up
    const body = async (): Promise<R> => {
        const gen = (tool.run as (i: unknown, c: ToolContext) => AsyncGenerator<TurnEvent, R>)(
            parsed.data,
            ctx,
        );
        let step = await gen.next();
        while (!step.done) {
            // applied before the listener is consulted: `f?.(await x)` never evaluates x when f is
            // absent, and a run with nobody listening still has to land its patches
            const ev = step.value.type === "patch" ? await applied(step.value.patch) : step.value;
            opts.onEvent?.(ev);
            step = await gen.next();
        }
        if (tool.patch) {
            const p = tool.patch(step.value, parsed.data);
            if (!emptyPatch(p)) {
                const ev = await applied(p);
                opts.onEvent?.(ev);
            }
        }
        return step.value;
    };
    const done = (result: R): Outcome<R> => {
        span.note({ content: after ?? ctx.artifact ?? null });
        return {
            ok: true,
            result,
            patches,
            ...(ctx.artifactId ? { artifactId: ctx.artifactId } : {}),
            ...(ctx.generation ? { generationId: ctx.generation.id } : {}),
        };
    };

    const writes =
        WRITERS.has(call.id) && ctx.generation && ctx.generations ? ctx.generation.id : null;
    if (writes && !(await ctx.generations!.claim(writes))) return { ok: false, reason: "busy" };
    const leased = async (): Promise<R> => {
        try {
            return await body();
        } finally {
            if (writes) await ctx.generations!.release(writes);
        }
    };

    if (opts.holds === "caller" || !principal) {
        opts.onHeld?.();
        return done(await leased());
    }

    const held = await reserve(principal.ws, principal.userId, call.id, {
        size: sizeOf(call.id, parsed.data, ctx, opts.size),
        prices: pricesFor(principal.ws, opts.models ?? {}),
        role: principal.role,
        // the surface the call came in on, so a run from an MCP client is not reported as a chat one
        surface: call.surface,
    });
    if (!held.ok) {
        if (writes) await ctx.generations!.release(writes);
        return { ok: false, reason: "credits", remaining: held.remaining, capped: held.capped };
    }

    opts.onHeld?.();
    return held.settle(async (produced) => {
        let result: R | undefined;
        try {
            result = await leased();
            return done(result);
        } finally {
            // in a finally so a run that made an image and then threw still bills for the image
            const made = opts.produced?.(result);
            if (made) produced(made);
        }
    });
}
