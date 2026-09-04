import { describe, expect, it } from "vitest";
import type { Trace } from "@model/trace";
import { seedUser } from "@services/__tests__/harness";
import { generationReport, TRACE_CAP, traceStore, traceSummary } from "@services/core/traces";
import { db } from "@services/db/client";
import { schema } from "@services/db/schema";
import { eq } from "drizzle-orm";

const trace = (over: Partial<Trace>): Trace => ({
    id: crypto.randomUUID(),
    workspaceId: null,
    userId: null,
    surface: "direct",
    tool: "show-sections",
    generationId: null,
    artifactId: null,
    level: "metrics",
    status: "ok",
    error: null,
    models: { outline: "google:gemini-3.5-flash" },
    tokensIn: 10,
    tokensOut: 5,
    credits: 0,
    ms: 100,
    at: new Date().toISOString(),
    spans: [],
    input: null,
    content: null,
    ...over,
});

describe("the trace store", () => {
    it("keeps the newest TRACE_CAP rows per workspace and prunes the rest on write", async () => {
        const { userId, workspaceId } = await seedUser();
        const old = new Date(Date.now() - 60_000);
        const rows = Array.from({ length: TRACE_CAP + 1 }, (_, i) => ({
            ...trace({ workspaceId, userId }),
            at: new Date(old.getTime() + i).toISOString(),
        }));
        await db.insert(schema.traces).values(
            rows.map((t) => ({
                id: t.id,
                workspaceId,
                userId,
                surface: t.surface,
                tool: t.tool,
                level: t.level,
                status: t.status,
                models: t.models,
                tokensIn: t.tokensIn,
                tokensOut: t.tokensOut,
                credits: t.credits,
                ms: t.ms,
                spans: t.spans,
                createdAt: new Date(t.at),
            })),
        );
        await traceStore().save(trace({ workspaceId, userId }));
        const kept = await db
            .select({ id: schema.traces.id })
            .from(schema.traces)
            .where(eq(schema.traces.workspaceId, workspaceId));
        expect(kept).toHaveLength(TRACE_CAP);
    });

    it("keeps bodies for the eval account only", async () => {
        const { userId } = await seedUser();
        const store = traceStore();
        expect(await store.full(userId)).toBe(false);
        expect(await store.full(null)).toBe(false);
    });
});

describe("the analyzer's reads", () => {
    it("summarizes calls, outcomes, the writer's cache and retries, and reports one generation", async () => {
        const { userId, workspaceId } = await seedUser();
        const store = traceStore();
        const generationId = crypto.randomUUID();
        const call = (step: string, cached: number) => ({
            kind: "model" as const,
            id: crypto.randomUUID(),
            parent: "root",
            at: 0,
            modelId: "google:gemini-3.5-flash",
            input: 1000,
            output: 100,
            cached,
            step,
            ms: 500,
        });
        const first = trace({
            workspaceId,
            userId,
            tool: "write-beats",
            generationId,
            tokensIn: 2000,
            tokensOut: 200,
            credits: 14,
            spans: [
                {
                    kind: "tool",
                    id: "root",
                    parent: null,
                    at: 0,
                    tool: "write-beats",
                    surface: "direct",
                    ms: 1000,
                    status: "ok",
                    flags: ["unchecked"],
                },
                call("section:s1", 0),
                { ...call("section:s1", 500), at: 10 }, // a retry of the same beat
                { ...call("section:s2", 900), at: 20 },
            ],
        });
        await store.save(first);
        await store.save(trace({ workspaceId, userId, tool: "read-generation", generationId }));

        const s = await traceSummary({ since: new Date(Date.now() - 60_000), workspaceId });
        const row = s.calls.find((c) => c.tool === "write-beats");
        expect(row).toMatchObject({ calls: 3, traces: 1, tokensIn: 3000, tokensOut: 300 });
        expect(s.outcomes.find((o) => o.tool === "write-beats")).toMatchObject({
            status: "ok",
            count: 1,
            credits: 14,
        });
        expect(s.sections.first).toEqual({ calls: 1, cachedPct: 0 });
        expect(s.sections.later).toEqual({ calls: 2, cachedPct: 70 });
        expect(s.retries).toEqual({ beats: 2, retried: 1, unchecked: 1 });

        const report = await generationReport(generationId);
        expect(report.map((r) => r.tool)).toEqual(["write-beats", "read-generation"]);
        expect(report[0]).toMatchObject({ calls: 3, credits: 14, flags: ["unchecked"] });
    });
});
