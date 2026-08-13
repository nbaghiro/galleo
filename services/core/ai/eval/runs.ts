import { and, desc, eq, lt, sql } from "drizzle-orm";
import type {
    EvalCheck,
    EvalConfig,
    EvalRun,
    EvalRunSummary,
    EvalSpan,
    EvalStatus,
} from "@model/eval";
import { tokensOf } from "@model/eval";
import { db } from "../../../db/client";
import { schema } from "../../../db/schema";

// Admin access is an env allowlist for now: there is no staff role in @model/workspace, and
// inventing one to gate a dev tool is the wrong order.
export function isEvalAdmin(userId: string): boolean {
    const allow = (process.env.EVAL_ADMIN_IDS ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    return allow.includes(userId);
}

export const evalReady = (): boolean => !!process.env.EVAL_ADMIN_IDS?.trim();

export interface RecordRun {
    workspaceId: string;
    checks?: EvalCheck[];
    userId: string;
    artifactId?: string | null;
    config: EvalConfig;
    spans: EvalSpan[];
    status: EvalStatus;
    error?: string;
    credits: number;
    ms: number;
}

export async function recordRun(r: RecordRun): Promise<string | null> {
    const { input, output } = tokensOf(r.spans);
    const [row] = await db
        .insert(schema.evalRuns)
        .values({
            workspaceId: r.workspaceId,
            userId: r.userId,
            artifactId: r.artifactId ?? null,
            config: r.config,
            spans: r.spans,
            checks: r.checks ?? [],
            status: r.status,
            error: r.error ?? null,
            tokensIn: input,
            tokensOut: output,
            credits: r.credits,
            ms: r.ms,
        })
        .returning({ id: schema.evalRuns.id });
    return row?.id ?? null;
}

const PAGE = 30;

/** Spans are the bulk of a run, so the list asks the database for their count instead. */
export async function listRuns(
    workspaceId: string,
    before?: Date,
): Promise<{ runs: EvalRunSummary[]; nextCursor: string | null }> {
    const rows = await db
        .select({
            id: schema.evalRuns.id,
            artifactId: schema.evalRuns.artifactId,
            config: schema.evalRuns.config,
            status: schema.evalRuns.status,
            error: schema.evalRuns.error,
            tokensIn: schema.evalRuns.tokensIn,
            tokensOut: schema.evalRuns.tokensOut,
            credits: schema.evalRuns.credits,
            ms: schema.evalRuns.ms,
            at: schema.evalRuns.createdAt,
            spanCount: sql<number>`jsonb_array_length(${schema.evalRuns.spans})`,
            checksRun: sql<number>`coalesce(jsonb_array_length(${schema.evalRuns.checks}), 0)`,
            checksPassed: sql<number>`(
                select count(*) from jsonb_array_elements(coalesce(${schema.evalRuns.checks}, '[]'::jsonb)) e
                where (e->>'pass')::boolean
            )`,
            userName: schema.users.name,
            userEmail: schema.users.email,
        })
        .from(schema.evalRuns)
        .leftJoin(schema.users, eq(schema.users.id, schema.evalRuns.userId))
        .where(
            and(
                eq(schema.evalRuns.workspaceId, workspaceId),
                before ? lt(schema.evalRuns.createdAt, before) : undefined,
            ),
        )
        .orderBy(desc(schema.evalRuns.createdAt))
        .limit(PAGE + 1);
    const page = rows.slice(0, PAGE);
    return {
        runs: page.map((r) => ({
            id: r.id,
            artifactId: r.artifactId,
            config: r.config,
            status: r.status,
            error: r.error,
            tokensIn: r.tokensIn,
            tokensOut: r.tokensOut,
            credits: r.credits,
            ms: r.ms,
            at: r.at.toISOString(),
            spanCount: Number(r.spanCount),
            checksRun: Number(r.checksRun),
            checksPassed: Number(r.checksPassed),
            user: r.userEmail ? { name: r.userName, email: r.userEmail } : null,
        })),
        nextCursor: rows.length > PAGE ? (page.at(-1)?.at.toISOString() ?? null) : null,
    };
}

export async function getRun(workspaceId: string, id: string): Promise<EvalRun | null> {
    const [r] = await db
        .select({
            id: schema.evalRuns.id,
            artifactId: schema.evalRuns.artifactId,
            config: schema.evalRuns.config,
            spans: schema.evalRuns.spans,
            checks: schema.evalRuns.checks,
            status: schema.evalRuns.status,
            error: schema.evalRuns.error,
            tokensIn: schema.evalRuns.tokensIn,
            tokensOut: schema.evalRuns.tokensOut,
            credits: schema.evalRuns.credits,
            ms: schema.evalRuns.ms,
            at: schema.evalRuns.createdAt,
            userName: schema.users.name,
            userEmail: schema.users.email,
        })
        .from(schema.evalRuns)
        .leftJoin(schema.users, eq(schema.users.id, schema.evalRuns.userId))
        .where(and(eq(schema.evalRuns.workspaceId, workspaceId), eq(schema.evalRuns.id, id)));
    if (!r) return null;
    return {
        id: r.id,
        artifactId: r.artifactId,
        config: r.config,
        spans: r.spans,
        checks: r.checks ?? [],
        status: r.status,
        error: r.error,
        tokensIn: r.tokensIn,
        tokensOut: r.tokensOut,
        credits: r.credits,
        ms: r.ms,
        at: r.at.toISOString(),
        user: r.userEmail ? { name: r.userName, email: r.userEmail } : null,
    };
}

/** Runs are traces, not records of account: prune on age so the table cannot grow without bound. */
export async function pruneRuns(workspaceId: string, keepDays = 30): Promise<void> {
    const cutoff = new Date(Date.now() - keepDays * 24 * 60 * 60 * 1000);
    await db
        .delete(schema.evalRuns)
        .where(
            and(
                eq(schema.evalRuns.workspaceId, workspaceId),
                lt(schema.evalRuns.createdAt, cutoff),
            ),
        );
}
