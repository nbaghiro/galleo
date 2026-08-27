import { DEMO_EMAIL } from "@services/db/seed/workspaces";
import type { ModelSpan } from "@model/ai";
import type { ArtifactContent } from "@model/artifact";
import type { EvalJudgement } from "@model/eval";
import { and, desc, eq, lt, sql } from "drizzle-orm";
import type { EvalCheck, EvalConfig, EvalRun, EvalRunSummary, EvalStatus } from "@model/eval";
import type { Section } from "@model/artifact";
import { LEAD_SECTIONS, tokensOf } from "@model/eval";
import { db } from "@services/db/client";
import { schema } from "@services/db/schema";

// Who can reach the playground. A single seeded account rather than a role or an env var: there is
// no staff concept in @model/workspace, and the eval tools are not something a customer should be
// able to switch on. Every eval route 404s for anyone else.
const EVAL_ACCOUNT = DEMO_EMAIL;

export const isEvalAdmin = (user: { email: string }): boolean =>
    user.email.toLowerCase() === EVAL_ACCOUNT;

interface RecordRun {
    workspaceId: string;
    sessionId?: string | null;
    checks?: EvalCheck[];
    content?: ArtifactContent | null;
    userId: string;
    artifactId?: string | null;
    config: EvalConfig;
    spans: ModelSpan[];
    status: EvalStatus;
    error?: string;
    credits: number;
    ms: number;
}

/**
 * Records a turn. Turns that share a session fold into one run: the studio writes a section per
 * turn, but the thing worth evaluating is the artifact, so spans accumulate and the later turn's
 * content and checks replace the earlier ones. Without a session each turn is its own run.
 */
export async function recordRun(r: RecordRun): Promise<string | null> {
    const { input, output } = tokensOf(r.spans);
    return db.transaction(async (tx) => {
        if (r.sessionId) {
            const [open] = await tx
                .select({ id: schema.evalRuns.id })
                .from(schema.evalRuns)
                .where(
                    and(
                        eq(schema.evalRuns.workspaceId, r.workspaceId),
                        eq(schema.evalRuns.sessionId, r.sessionId),
                    ),
                );
            if (open) {
                await tx
                    .update(schema.evalRuns)
                    .set({
                        spans: sql`${schema.evalRuns.spans} || ${JSON.stringify(r.spans)}::jsonb`,
                        tokensIn: sql`${schema.evalRuns.tokensIn} + ${input}`,
                        tokensOut: sql`${schema.evalRuns.tokensOut} + ${output}`,
                        ms: sql`${schema.evalRuns.ms} + ${r.ms}`,
                        credits: sql`${schema.evalRuns.credits} + ${r.credits}`,
                        // the later turn knows the whole artifact, so its checks supersede
                        ...(r.content ? { content: r.content, checks: r.checks ?? [] } : {}),
                        ...(r.status === "ok" ? {} : { status: r.status, error: r.error ?? null }),
                    })
                    .where(eq(schema.evalRuns.id, open.id));
                return open.id;
            }
        }
        const [row] = await tx
            .insert(schema.evalRuns)
            .values({
                workspaceId: r.workspaceId,
                userId: r.userId,
                sessionId: r.sessionId ?? null,
                artifactId: r.artifactId ?? null,
                config: r.config,
                spans: r.spans,
                checks: r.checks ?? [],
                content: r.content ?? null,
                status: r.status,
                error: r.error ?? null,
                tokensIn: input,
                tokensOut: output,
                credits: r.credits,
                ms: r.ms,
            })
            .returning({ id: schema.evalRuns.id });
        return row?.id ?? null;
    });
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
            failedChecks: sql<string[]>`(
                select coalesce(jsonb_agg(distinct e->>'id'), '[]'::jsonb)
                from jsonb_array_elements(coalesce(${schema.evalRuns.checks}, '[]'::jsonb)) e
                where not (e->>'pass')::boolean
            )`,
            judgedTargets: sql<number>`coalesce(jsonb_array_length(${schema.evalRuns.judgements}), 0)`,
            // the same yes-share scoreOf() computes, averaged over the targets a run judged
            lead: sql<Section[]>`(
                select coalesce(jsonb_agg(s order by ord), '[]'::jsonb)
                from (
                    select s, ord
                    from jsonb_array_elements(coalesce(${schema.evalRuns.content}->'sections', '[]'::jsonb))
                         with ordinality as t(s, ord)
                    order by ord
                    limit ${LEAD_SECTIONS}
                ) lead
            )`,
            sections: sql<{ id: string; score: number | null; failed: string[] }[]>`(
                select coalesce(jsonb_agg(jsonb_build_object(
                    'id', sec->>'id',
                    'score', (
                        select round(avg(case when (a->>'yes')::boolean then 1.0 else 0.0 end), 4)
                        from jsonb_array_elements(coalesce(${schema.evalRuns.judgements}, '[]'::jsonb)) j,
                             jsonb_array_elements(j->'answers') a
                        where j->>'target' = 'section:' || (sec->>'id')
                    ),
                    'failed', (
                        select coalesce(jsonb_agg(c->>'id'), '[]'::jsonb)
                        from jsonb_array_elements(coalesce(${schema.evalRuns.checks}, '[]'::jsonb)) c
                        where c->>'target' = 'section:' || (sec->>'id') and not (c->>'pass')::boolean
                    )
                ) order by ord), '[]'::jsonb)
                from jsonb_array_elements(coalesce(${schema.evalRuns.content}->'sections', '[]'::jsonb))
                     with ordinality as t(sec, ord)
            )`,
            judgeScore: sql<number | null>`(
                select avg(t.score) from (
                    select (
                        select count(*) filter (where (a->>'yes')::boolean)::float8
                             / nullif(count(*), 0)
                        from jsonb_array_elements(j->'answers') a
                    ) as score
                    from jsonb_array_elements(coalesce(${schema.evalRuns.judgements}, '[]'::jsonb)) j
                ) t
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
            failedChecks: r.failedChecks ?? [],
            judgedTargets: Number(r.judgedTargets),
            judgeScore: r.judgeScore === null ? null : Number(r.judgeScore),
            lead: r.lead ?? [],
            sections: (r.sections ?? []).map((x) => ({
                id: x.id,
                score: x.score === null ? null : Number(x.score),
                failed: x.failed ?? [],
            })),
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
            content: schema.evalRuns.content,
            judgements: schema.evalRuns.judgements,
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
        content: r.content ?? null,
        judgements: r.judgements ?? [],
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

/**
 * Merge checks computed outside the server into a run. Layout-derived checks need the engine, which
 * services may not import, so the app computes them and posts them here. Replaces by id so a repost
 * corrects rather than duplicates.
 */
export async function mergeChecks(
    workspaceId: string,
    id: string,
    incoming: EvalCheck[],
): Promise<boolean> {
    const [row] = await db
        .select({ checks: schema.evalRuns.checks })
        .from(schema.evalRuns)
        .where(and(eq(schema.evalRuns.workspaceId, workspaceId), eq(schema.evalRuns.id, id)));
    if (!row) return false;
    const replaced = new Set(incoming.map((c) => c.id));
    const kept = (row.checks ?? []).filter((c) => !replaced.has(c.id));
    await db
        .update(schema.evalRuns)
        .set({ checks: [...kept, ...incoming] })
        .where(eq(schema.evalRuns.id, id));
    return true;
}

/** Replaces a run's judgements wholesale: re-judging is a fresh verdict, not an addition. */
export async function saveJudgements(
    workspaceId: string,
    id: string,
    judgements: EvalJudgement[],
): Promise<boolean> {
    const rows = await db
        .update(schema.evalRuns)
        .set({ judgements })
        .where(and(eq(schema.evalRuns.workspaceId, workspaceId), eq(schema.evalRuns.id, id)))
        .returning({ id: schema.evalRuns.id });
    return rows.length > 0;
}
