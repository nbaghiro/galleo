import { gunzipSync } from "node:zlib";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Transport } from "@services/utils/analytics";
import { initAnalytics, shutdownAnalytics } from "@services/utils/analytics";
import { reserve } from "@services/core/spend";

// Every metered action passes through `reserve`, so this is where a new tool becomes measured
// without anyone remembering to instrument it. A free tool takes the path that never reaches the
// ledger, which is what lets this run without a database.
const FREE_TOOL = "set-theme";

interface WireEvent {
    event: string;
    properties: Record<string, unknown>;
}

const ws = { id: "ws_1", plan: "free", seats: 1 };

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

    const run = async (body: () => Promise<string>): Promise<void> => {
        const held = await reserve(ws, "user_1", FREE_TOOL);
        if (!held.ok) throw new Error("a free tool must not be refused");
        await held.settle(body);
    };

    it("reports a run starting and completing, with the tool it was", async () => {
        await run(async () => "done");
        await shutdownAnalytics();

        const started = named("ai_action_started");
        expect(started?.properties.tool_id).toBe(FREE_TOOL);
        expect(started?.properties.estimated_credits).toBe(0);

        const done = named("ai_action_completed");
        expect(done?.properties.tool_id).toBe(FREE_TOOL);
        // a tool we chose to give away must never reach the ledger, so it settles at nothing
        expect(done?.properties.credits_charged).toBe(0);
        expect(done?.properties.input_tokens).toBe(0);
        expect(typeof done?.properties.ms).toBe("number");
        expect(named("ai_action_failed")).toBeUndefined();
    });

    it("classifies a provider refusal as retryable and lets the error through", async () => {
        await expect(
            run(async () => {
                throw new Error("429 rate limit exceeded, try again");
            }),
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
            run(async () => {
                throw new Error("The operation was aborted");
            }),
        ).rejects.toThrow();
        await shutdownAnalytics();

        expect(named("ai_action_failed")?.properties.reason).toBe("aborted");
        expect(named("ai_action_failed")?.properties.retryable).toBe(false);
    });

    it("says nothing at all when no key is configured", async () => {
        await shutdownAnalytics();
        delete process.env.POSTHOG_KEY;
        initAnalytics();
        await run(async () => "done");
        await shutdownAnalytics();
        expect(events).toHaveLength(0);
    });
});
