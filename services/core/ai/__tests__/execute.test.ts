import { describe, expect, it } from "vitest";
import type { TurnEvent } from "@model/ai";
import type { WorkspaceCreditFields } from "@services/core/ledger";
import type { Brief } from "@model/ai";
import type { ToolId } from "@model/tools";
import { TOOLS } from "@model/tools";
import { getTool, implement } from "@services/core/ai/tools";
import { runTool } from "@services/core/ai/execute";
import { memoryGenerationStore } from "@services/core/generations";
import { flushTraces, memoryTraceStore, setTraceStore } from "@services/core/traces";

// the executor loads the whole registry; the stubs below replace the bodies this test drives

const ws: WorkspaceCreditFields = { id: "ws1", plan: null, seats: 1 };
const principal = { userId: "u1", ws, role: "owner" as const };
const base = { ctx: { image: {} } };

// free (no `usage` or `meter` in its definition), so reserve takes the zero-cost path and the
// ledger is never opened
implement("show-sections", async function* (_input, ctx): AsyncGenerator<TurnEvent, number> {
    yield { type: "narration", text: "looking" };
    return ctx.artifact?.sections.length ?? 0;
});

// priced, so reaching the ledger would need a database this test has none of
implement("rewrite-text", async function* (): AsyncGenerator<TurnEvent, string> {
    return "rewritten";
});

// entitlement-gated (requires: "voiceNarration"), and it must not run on a plan without it
implement("narrate-artifact", async function* (): AsyncGenerator<TurnEvent, string> {
    throw new Error("the entitlement gate let a call through");
});

describe("runTool", () => {
    it("refuses a tool the catalog defines but nothing implements", async () => {
        const out = await runTool(
            { id: "pick-arc", surface: "direct", input: {} },
            principal,
            base,
        );
        expect(out).toEqual({ ok: false, reason: "unknown-tool" });
    });

    it("refuses a tool the definition does not offer on this surface", async () => {
        // rewrite-text needs a client to apply its result, so it is not on mcp
        const out = await runTool(
            { id: "rewrite-text", surface: "mcp", input: { text: "hi", instruction: "shorter" } },
            principal,
            { ...base, holds: "caller" },
        );
        expect(out).toEqual({ ok: false, reason: "wrong-surface" });
    });

    it("allows a tool the definition does offer there", async () => {
        const out = await runTool(
            { id: "show-sections", surface: "mcp", input: {} },
            principal,
            base,
        );
        expect(out).toEqual({ ok: true, result: 0, patches: [] });
    });

    it("parses with the tool's own schema and reports what failed", async () => {
        const out = await runTool(
            { id: "rewrite-text", surface: "direct", input: { text: 42 } },
            principal,
            { ...base, holds: "caller" },
        );
        expect(out.ok).toBe(false);
        if (out.ok) throw new Error("expected a rejection");
        expect(out.reason).toBe("bad-input");
        if (out.reason !== "bad-input") throw new Error("expected bad-input");
        expect(out.issues.join(" ")).toMatch(/text/);
    });

    it("runs a free tool and hands back its result", async () => {
        const out = await runTool(
            { id: "show-sections", surface: "direct", input: {} },
            principal,
            {
                ...base,
                ctx: { image: {}, artifact: { format: "deck", theme: "studio", sections: [] } },
            },
        );
        expect(out).toEqual({ ok: true, result: 0, patches: [] });
    });

    it("forwards the events the tool yields on its way to the result", async () => {
        const seen: TurnEvent[] = [];
        await runTool({ id: "show-sections", surface: "direct", input: {} }, principal, {
            ...base,
            onEvent: (e) => seen.push(e),
        });
        expect(seen).toEqual([{ type: "narration", text: "looking" }]);
    });

    // The scope gate: a principal that carries granted scopes is a delegated caller (an MCP token),
    // and what it was not granted must not reach the schema, the ledger, or the body.
    it("refuses a tool the granted scopes do not cover, and names the one that would", async () => {
        const out = await runTool(
            { id: "show-sections", surface: "mcp", input: {} },
            { ...principal, scopes: ["artifacts:write"] },
            base,
        );
        expect(out).toEqual({ ok: false, reason: "scope", needs: "artifacts:read" });
    });

    it("lets a granted scope through", async () => {
        const out = await runTool(
            { id: "show-sections", surface: "mcp", input: {} },
            { ...principal, scopes: ["artifacts:read"] },
            base,
        );
        expect(out).toEqual({ ok: true, result: 0, patches: [] });
    });

    // A session in the product carries the whole set, so the gate is skipped rather than granted:
    // absent means "not delegated", which is not the same as "granted nothing".
    it("does not gate a caller acting as themselves", async () => {
        const out = await runTool(
            { id: "show-sections", surface: "mcp", input: {} },
            principal,
            base,
        );
        expect(out).toEqual({ ok: true, result: 0, patches: [] });
    });

    // Ahead of the schema on purpose: a caller that may not run this must not learn whether its
    // arguments were well formed.
    it("checks the scope before it parses the input", async () => {
        const out = await runTool(
            { id: "rewrite-text", surface: "direct", input: { text: 42 } },
            { ...principal, scopes: ["artifacts:read"] },
            { ...base, holds: "caller" },
        );
        expect(out).toEqual({ ok: false, reason: "scope", needs: "artifacts:write" });
    });

    // The plan gate lives here rather than in each route, so it answers the same on every surface.
    // The plan gate lives in the executor rather than in each route, so it answers the same on
    // every surface and a route that forgets it cannot let a call through.
    it("refuses a tool the workspace's plan does not carry", async () => {
        const out = await runTool(
            { id: "narrate-artifact", surface: "direct", input: {} },
            principal,
            { ...base, holds: "caller" },
        );
        expect(out).toEqual({ ok: false, reason: "entitlement", feature: "voiceNarration" });
    });

    it("bills nothing of its own when an enclosing turn already holds the credits", async () => {
        // rewrite-text is priced, so a reservation here would open the ledger and there is no
        // database in a unit test: succeeding is the proof that none was taken
        const out = await runTool(
            {
                id: "rewrite-text",
                surface: "direct",
                input: { text: "hello", instruction: "shorter" },
            },
            principal,
            { ...base, holds: "caller" },
        );
        expect(out).toEqual({ ok: true, result: "rewritten", patches: [] });
    });
});

// A generation in the context: loaded by the executor off the id in the input, patched through the
// store as each patch is yielded, and leased to one writer at a time.
implement("steer-generation", async function* (input, ctx): AsyncGenerator<TurnEvent, string> {
    yield { type: "patch", patch: { generation: [{ op: "setSteer", note: input.note }] } };
    return ctx.generation?.steer ?? "";
});
implement("write-beat", async function* (input, ctx): AsyncGenerator<TurnEvent, string> {
    if (!ctx.generations?.claim("probe")) return "the lease was free, so a second writer got in";
    ctx.generations.release("probe");
    return input.beatId;
});

const brief: Brief = { prompt: "a deck", surface: "deck", theme: "studio", set: {} };

describe("runTool with a generation", () => {
    it("refuses a generation tool that names no generation, before running anything", async () => {
        const out = await runTool(
            { id: "steer-generation", surface: "direct", input: { note: "x" } },
            principal,
            { ...base, holds: "caller" },
        );
        expect(out).toMatchObject({ ok: false, reason: "bad-input" });
    });

    it("answers not-found for an id the store does not hold", async () => {
        const out = await runTool(
            {
                id: "steer-generation",
                surface: "direct",
                input: { generationId: "nope", note: "x" },
            },
            principal,
            { ...base, holds: "caller", ctx: { image: {}, generations: memoryGenerationStore() } },
        );
        expect(out).toEqual({
            ok: false,
            reason: "not-found",
            message: "That generation was not found.",
        });
    });

    it("loads the generation, applies each patch through the store, and echoes the seq", async () => {
        const store = memoryGenerationStore();
        const { generation } = await store.create({ brief });
        const seen: TurnEvent[] = [];
        const out = await runTool(
            {
                id: "steer-generation",
                surface: "direct",
                input: { generationId: generation.id, note: "shorter" },
            },
            principal,
            {
                ...base,
                holds: "caller",
                ctx: { image: {}, generations: store },
                onEvent: (e) => seen.push(e),
            },
        );
        // the body saw the state after its own patch, which is what lets a composite chain them
        expect(out).toMatchObject({ ok: true, result: "shorter", generationId: generation.id });
        expect(seen).toEqual([
            { type: "patch", patch: { generation: [{ op: "setSteer", note: "shorter" }] }, seq: 1 },
        ]);
        expect((await store.read(generation.id))?.generation.steer).toBe("shorter");
    });

    it("forwards but does not persist when the caller asked not to apply", async () => {
        const store = memoryGenerationStore();
        const { generation } = await store.create({ brief });
        const seen: TurnEvent[] = [];
        const out = await runTool(
            {
                id: "steer-generation",
                surface: "direct",
                input: { generationId: generation.id, note: "shorter" },
            },
            principal,
            {
                ...base,
                holds: "caller",
                apply: false,
                ctx: { image: {}, generations: store },
                onEvent: (e) => seen.push(e),
            },
        );
        expect(out.ok && out.patches).toEqual([
            { generation: [{ op: "setSteer", note: "shorter" }] },
        ]);
        expect(seen[0]).toEqual({
            type: "patch",
            patch: { generation: [{ op: "setSteer", note: "shorter" }] },
        });
        expect((await store.read(generation.id))?.generation.steer).toBe("");
    });

    it("holds the writer lease for a write and refuses a second writer meanwhile", async () => {
        const store = memoryGenerationStore();
        const { generation } = await store.create({ brief });
        expect(await store.claim(generation.id)).toBe(true);
        const busy = await runTool(
            {
                id: "write-beat",
                surface: "direct",
                input: { generationId: generation.id, beatId: "s1" },
            },
            principal,
            { ...base, holds: "caller", ctx: { image: {}, generations: store } },
        );
        expect(busy).toEqual({ ok: false, reason: "busy" });
        await store.release(generation.id);
        const out = await runTool(
            {
                id: "write-beat",
                surface: "direct",
                input: { generationId: generation.id, beatId: "s1" },
            },
            principal,
            { ...base, holds: "caller", ctx: { image: {}, generations: store } },
        );
        expect(out).toMatchObject({ ok: true, result: "s1" });
        // released on the way out
        expect(await store.claim(generation.id)).toBe(true);
    });
});

describe("the trace around a call", () => {
    it("records the call when a store is registered, and names it on the outcome", async () => {
        const store = memoryTraceStore();
        setTraceStore(store);
        try {
            const out = await runTool(
                { id: "show-sections", surface: "direct", input: {} },
                principal,
                base,
            );
            await flushTraces();
            expect(out.ok).toBe(true);
            expect(out.traceId).toBe(store.traces[0]!.id);
            expect(store.traces[0]).toMatchObject({
                tool: "show-sections",
                surface: "direct",
                workspaceId: "ws1",
                userId: "u1",
                status: "ok",
                level: "metrics",
            });
            expect(store.traces[0]!.spans[0]).toMatchObject({
                kind: "tool",
                tool: "show-sections",
            });
        } finally {
            setTraceStore(null);
        }
    });

    it("records a refusal with its reason, kept in full so it can be read afterwards", async () => {
        const store = memoryTraceStore();
        setTraceStore(store);
        try {
            const out = await runTool(
                { id: "rewrite-text", surface: "mcp", input: {} },
                principal,
                base,
            );
            await flushTraces();
            expect(out.ok).toBe(false);
            expect(store.traces[0]).toMatchObject({
                status: "refused",
                error: "wrong-surface",
                level: "full",
            });
        } finally {
            setTraceStore(null);
        }
    });

    it("leaves the outcome unnamed when nothing keeps traces", async () => {
        const out = await runTool(
            { id: "show-sections", surface: "direct", input: {} },
            principal,
            base,
        );
        expect(out).not.toHaveProperty("traceId");
    });
});

describe("the registry the executor runs", () => {
    it("has a body for every live tool a caller can reach, the chat turn included", () => {
        const missing = (Object.keys(TOOLS) as ToolId[]).filter(
            (id) =>
                TOOLS[id].live && TOOLS[id].surfaces.some((s) => s !== "internal") && !getTool(id),
        );
        expect(missing).toEqual([]);
    });
});
