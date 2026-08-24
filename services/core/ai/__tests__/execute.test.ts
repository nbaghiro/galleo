import { describe, expect, it } from "vitest";
import type { TurnEvent } from "@model/ai";
import type { WorkspaceCreditFields } from "@services/core/ledger";
import { implement } from "@services/core/ai/tools";
import { runTool } from "@services/core/ai/execute";

// imports the contract rather than the tool modules, so the registry holds only what is set up here

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
    it("refuses a tool the registry has never heard of", async () => {
        const out = await runTool(
            { id: "audition-voice", surface: "direct", input: {} },
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
        expect(out).toEqual({ ok: true, result: 0 });
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
        expect(out).toEqual({ ok: true, result: 0 });
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
        expect(out).toEqual({ ok: true, result: 0 });
    });

    // A session in the product carries the whole set, so the gate is skipped rather than granted:
    // absent means "not delegated", which is not the same as "granted nothing".
    it("does not gate a caller acting as themselves", async () => {
        const out = await runTool(
            { id: "show-sections", surface: "mcp", input: {} },
            principal,
            base,
        );
        expect(out).toEqual({ ok: true, result: 0 });
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
        expect(out).toEqual({ ok: true, result: "rewritten" });
    });
});
