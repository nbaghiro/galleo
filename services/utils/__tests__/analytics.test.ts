import { gunzipSync } from "node:zlib";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Transport } from "@services/utils/analytics";
import {
    analyticsEnabled,
    capture,
    identify,
    identifyWorkspace,
    initAnalytics,
    shutdownAnalytics,
    withRequestId,
} from "@services/utils/analytics";

interface Sent {
    url: string;
    body: string;
}

// The transport is the seam: network IO, which the mocking contract allows. Everything above it,
// including the batching and the payload shape, runs for real.
const recorder = (into: Sent[]): Transport => {
    return async (url, options) => {
        // The real client gzips its batches, so the test reads what production actually posts.
        const raw = options.body;
        const body =
            typeof raw === "string"
                ? raw
                : raw
                  ? gunzipSync(Buffer.from(await raw.arrayBuffer())).toString("utf8")
                  : "";
        into.push({ url, body });
        return { status: 200, text: async () => "{}", json: async () => ({ status: 1 }) };
    };
};

interface WireEvent {
    event: string;
    distinct_id: string;
    properties: Record<string, unknown>;
}

// Not every request carries a batch: the client also asks the host questions with no body at all.
const events = (sent: Sent[]): WireEvent[] =>
    sent
        .filter((s) => s.body.startsWith("{"))
        .flatMap((s) => (JSON.parse(s.body) as { batch?: WireEvent[] }).batch ?? []);

const named = (sent: Sent[], event: string): WireEvent | undefined =>
    events(sent).find((e) => e.event === event);

const ctx = { userId: "user_1", workspaceId: "ws_1" };

describe("server analytics", () => {
    let sent: Sent[];
    let realFetch: typeof globalThis.fetch;
    let networkCalls: number;

    beforeEach(() => {
        sent = [];
        networkCalls = 0;
        delete process.env.POSTHOG_KEY;
        delete process.env.POSTHOG_HOST;
        realFetch = globalThis.fetch;
        globalThis.fetch = ((...args: Parameters<typeof globalThis.fetch>) => {
            networkCalls += 1;
            return realFetch(...args);
        }) as typeof globalThis.fetch;
    });

    afterEach(async () => {
        await shutdownAnalytics();
        globalThis.fetch = realFetch;
    });

    it("stays inert with no key: nothing is enabled and nothing reaches the network", async () => {
        initAnalytics();
        expect(analyticsEnabled()).toBe(false);
        capture(ctx, "logged_out", {});
        identify("user_1", { email_verified: true });
        identifyWorkspace("ws_1", { seats_total: 3 });
        await shutdownAnalytics();
        expect(networkCalls).toBe(0);
    });

    it("sends the event name, the properties and the workspace group", async () => {
        initAnalytics({ key: "phc_test", fetch: recorder(sent) });
        expect(analyticsEnabled()).toBe(true);
        capture(ctx, "credits_exhausted", {
            plan_id: "free",
            blocked_tool_id: "generate-artifact",
            upgrade_offered: true,
            topup_offered: false,
            credits_remaining: 0,
        });
        await shutdownAnalytics();

        const event = named(sent, "credits_exhausted");
        expect(event).toBeDefined();
        expect(event?.distinct_id).toBe("user_1");
        expect(event?.properties.blocked_tool_id).toBe("generate-artifact");
        expect(event?.properties.credits_remaining).toBe(0);
        expect(event?.properties.$groups).toEqual({ workspace: "ws_1" });
        // groups are a paid add-on, so the flat property is what aggregates on the free tier
        expect(event?.properties.workspace_id).toBe("ws_1");
    });

    it("merges super properties under the event's own", async () => {
        initAnalytics({ key: "phc_test", fetch: recorder(sent) });
        capture(
            { ...ctx, superProps: { plan_id: "pro", app_build: "abc1234", credits_remaining: 12 } },
            "paywall_hit",
            { feature: "customThemes", plan_id: "free", upgrade_offered: true },
        );
        await shutdownAnalytics();

        const props = named(sent, "paywall_hit")?.properties;
        expect(props?.app_build).toBe("abc1234");
        expect(props?.credits_remaining).toBe(12);
        // the event's own plan_id wins over the super property, so the wall reports the plan it hit
        expect(props?.plan_id).toBe("free");
    });

    it("identifies the person and the workspace separately", async () => {
        initAnalytics({ key: "phc_test", fetch: recorder(sent) });
        identify("user_1", { signup_method: "google", email_verified: true });
        identifyWorkspace("ws_1", { plan_id: "premium", seats_total: 5 });
        await shutdownAnalytics();

        const person = named(sent, "$identify");
        expect((person?.properties.$set as Record<string, unknown>).signup_method).toBe("google");
        // the server has no viewport and no client IP, so it tells the host not to infer a location
        expect(person?.properties.$geoip_disable).toBe(true);

        const group = named(sent, "$groupidentify")?.properties;
        expect(group?.$group_type).toBe("workspace");
        expect(group?.$group_key).toBe("ws_1");
        expect((group?.$group_set as Record<string, unknown>).plan_id).toBe("premium");
    });

    // The whole point of the async-local scope: nothing threads the id, so it has to survive being
    // captured from somewhere arbitrarily deep in the request's own async chain.
    it("carries the request id down to a capture nested under awaits", async () => {
        initAnalytics({ key: "phc_test", fetch: recorder(sent) });
        const deep = async (): Promise<void> => {
            await Promise.resolve();
            await new Promise((r) => setTimeout(r, 1));
            capture(ctx, "logged_out", {});
        };
        await withRequestId("req_abc", () => deep());
        await shutdownAnalytics();
        expect(named(sent, "logged_out")?.properties.request_id).toBe("req_abc");
    });

    it("keeps two overlapping requests apart", async () => {
        initAnalytics({ key: "phc_test", fetch: recorder(sent) });
        const emit = async (id: string, event: "logged_out" | "password_changed"): Promise<void> =>
            withRequestId(id, async () => {
                await new Promise((r) => setTimeout(r, id === "req_slow" ? 5 : 1));
                capture(ctx, event, {});
            });
        await Promise.all([emit("req_slow", "logged_out"), emit("req_fast", "password_changed")]);
        await shutdownAnalytics();
        expect(named(sent, "logged_out")?.properties.request_id).toBe("req_slow");
        expect(named(sent, "password_changed")?.properties.request_id).toBe("req_fast");
    });

    it("says nothing about a request when there is none", async () => {
        initAnalytics({ key: "phc_test", fetch: recorder(sent) });
        capture(ctx, "logged_out", {});
        await shutdownAnalytics();
        expect(named(sent, "logged_out")?.properties.request_id).toBeUndefined();
    });

    // The point of app_build: bounding a regression to a deploy works on both sides or neither.
    it("stamps every server event with the build it came from", async () => {
        initAnalytics({ key: "phc_test", fetch: recorder(sent) });
        capture(ctx, "logged_out", {});
        await shutdownAnalytics();
        expect(named(sent, "logged_out")?.properties.app_build).toBe("local");
    });

    it("picks the key up from the environment when nothing is passed", async () => {
        process.env.POSTHOG_KEY = "phc_from_env";
        initAnalytics();
        expect(analyticsEnabled()).toBe(true);
    });
});
