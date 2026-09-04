import { gunzipSync } from "node:zlib";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { TurnEvent } from "@model/ai";
import { TOOLS } from "@model/tools";
import type { Transport } from "@services/utils/analytics";
import { initAnalytics, shutdownAnalytics } from "@services/utils/analytics";
import { implement } from "@services/core/ai/tools";
import { runTool } from "@services/core/ai/execute";

// Every metered action passes through `reserve`, which reports that it started, and every call
// closes a trace, which reports what it did. A free tool takes the path that never reaches the
// ledger, which is what lets this run without a database.
const FREE_TOOL = "show-sections";
const THROWING_TOOL = "find-templates"; // free too, and public

interface WireEvent {
    event: string;
    properties: Record<string, unknown>;
}

const ws = { id: "ws_1", plan: "free", seats: 1 };
const principal = { userId: "user_1", ws, role: "owner" as const };

implement(FREE_TOOL, async function* (): AsyncGenerator<TurnEvent, number> {
    return 0;
});
implement(THROWING_TOOL, async function* (input): AsyncGenerator<TurnEvent, never> {
    throw new Error((input as { query?: string }).query ?? "failed");
});

describe("the metered-run seam", () => {
    let events: WireEvent[];

    beforeEach(() => {
        events = [];
        const transport: Transport = async (_url, options) => {
            const raw = options.body;
            const body =
                typeof raw === "string"
                    ? raw
                    : raw
                      ? gunzipSync(Buffer.from(await raw.arrayBuffer())).toString("utf8")
                      : "";
            if (body.startsWith("{"))
                events.push(...((JSON.parse(body) as { batch?: WireEvent[] }).batch ?? []));
            return { status: 200, text: async () => "{}", json: async () => ({}) };
        };
        initAnalytics({ key: "phc_test", fetch: transport });
    });

    afterEach(async () => {
        await shutdownAnalytics();
    });

    const named = (event: string): WireEvent | undefined => events.find((e) => e.event === event);

    it("reports a run starting and completing, with the tool it was", async () => {
        const out = await runTool({ id: FREE_TOOL, surface: "direct", input: {} }, principal, {
            ctx: { image: {} },
        });
        expect(out.ok).toBe(true);
        await shutdownAnalytics();

        const started = named("ai_action_started");
        expect(started?.properties.tool_id).toBe(FREE_TOOL);
        expect(started?.properties.estimated_credits).toBe(0);

        const done = named("ai_action_completed");
        expect(done?.properties.tool_id).toBe(FREE_TOOL);
        // a tool we chose to give away must never reach the ledger, so it settles at nothing
        expect(done?.properties.credits_charged).toBe(0);
        expect(done?.properties.input_tokens).toBe(0);
        expect(done?.properties.cached).toBe(false);
        expect(typeof done?.properties.ms).toBe("number");
        expect(named("ai_action_failed")).toBeUndefined();
    });

    // The property used to be read off the catalog, which lists "agent" first for every tool the MCP
    // server exposes, so a run from a desktop client was indistinguishable from one in the chat rail.
    it("reports the surface the call arrived on, not the first one the catalog declares", async () => {
        expect(TOOLS[FREE_TOOL].surfaces[0]).toBe("agent");
        await runTool({ id: FREE_TOOL, surface: "mcp", input: {} }, principal, {
            ctx: { image: {} },
        });
        await shutdownAnalytics();

        expect(named("ai_action_started")?.properties.tool_surface).toBe("mcp");
    });

    it("classifies a provider refusal as retryable and lets the error through", async () => {
        await expect(
            runTool(
                {
                    id: THROWING_TOOL,
                    surface: "direct",
                    input: { query: "429 rate limit exceeded" },
                },
                principal,
                { ctx: { image: {} } },
            ),
        ).rejects.toThrow(/rate limit/);
        await shutdownAnalytics();

        const failed = named("ai_action_failed");
        expect(failed?.properties.reason).toBe("rate_limited");
        expect(failed?.properties.retryable).toBe(true);
        expect(named("ai_action_completed")).toBeUndefined();
    });

    // A user closing the tab is not a reliability problem, so it must not read as one.
    it("does not count a cancelled run as a retryable failure", async () => {
        await expect(
            runTool(
                {
                    id: THROWING_TOOL,
                    surface: "direct",
                    input: { query: "The operation was aborted" },
                },
                principal,
                { ctx: { image: {} } },
            ),
        ).rejects.toThrow();
        await shutdownAnalytics();

        expect(named("ai_action_failed")?.properties.reason).toBe("aborted");
        expect(named("ai_action_failed")?.properties.retryable).toBe(false);
    });

    it("says nothing about a run that was refused before it ran", async () => {
        // rewrite-text is priced, so the ledger would be needed; a wrong surface refuses first
        const out = await runTool(
            { id: "rewrite-text", surface: "mcp", input: { text: "hi", instruction: "shorter" } },
            principal,
            { ctx: { image: {} } },
        );
        expect(out.ok).toBe(false);
        await shutdownAnalytics();
        expect(named("ai_action_completed")).toBeUndefined();
        expect(named("ai_action_failed")).toBeUndefined();
    });

    it("says nothing at all when no key is configured", async () => {
        await shutdownAnalytics();
        delete process.env.POSTHOG_KEY;
        initAnalytics();
        await runTool({ id: FREE_TOOL, surface: "direct", input: {} }, principal, {
            ctx: { image: {} },
        });
        await shutdownAnalytics();
        expect(events).toHaveLength(0);
    });
});
