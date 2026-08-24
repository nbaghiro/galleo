import { gunzipSync } from "node:zlib";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ToolId } from "@model/tools";
import type { Transport } from "@services/utils/analytics";
import { initAnalytics, shutdownAnalytics } from "@services/utils/analytics";
import { callDelegated, type Grant } from "@services/core/delegated";
import "@services/core/ai/tools/register";

// Every MCP and REST call funnels through callDelegated, refusals included, so this is where the
// delegated surface becomes measured. The refusals below are all decided before a workspace is
// resolved, which is what lets them run without a database.

interface WireEvent {
    event: string;
    properties: Record<string, unknown>;
}

const READ_ONLY: Grant = {
    userId: "user_1",
    workspaceIds: ["ws_1"],
    defaultWorkspaceId: "ws_1",
    scopes: ["artifacts:read"],
};

describe("the delegated-call seam", () => {
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

    const reported = async (): Promise<WireEvent | undefined> => {
        await shutdownAnalytics();
        return events.find((e) => e.event === "delegated_tool_called");
    };

    it("reports a call that was refused for want of a scope, and which scope it needed", async () => {
        const out = await callDelegated(
            { id: "trash-artifact", surface: "mcp", input: { artifact: "a_1" } },
            READ_ONLY,
        );
        expect(out.ok).toBe(false);

        const call = await reported();
        expect(call?.properties.outcome).toBe("scope");
        expect(call?.properties.scope).toBe("artifacts:delete");
        expect(call?.properties.effect).toBe("destructive");
        expect(call?.properties.surface).toBe("mcp");
        expect(call?.properties.authenticated).toBe(true);
        expect(typeof call?.properties.ms).toBe("number");
    });

    it("reports a call that arrived with no token, and mints no profile for it", async () => {
        const out = await callDelegated({ id: "find-artifacts", surface: "api", input: {} }, null);
        expect(out.ok).toBe(false);

        const call = await reported();
        expect(call?.properties.outcome).toBe("needs-auth");
        expect(call?.properties.authenticated).toBe(false);
        expect(call?.properties.$process_person_profile).toBe(false);
    });

    // A caller on the other side of MCP can name anything it likes, so an unknown id is a real
    // outcome rather than a bug, and the catalog has no scope or effect to report for it.
    it("reports a name the catalog does not hold without inventing a scope for it", async () => {
        const out = await callDelegated(
            { id: "not-a-tool" as ToolId, surface: "mcp", input: {} },
            READ_ONLY,
        );
        expect(out.ok).toBe(false);

        const call = await reported();
        expect(call?.properties.outcome).toBe("no-tool");
        expect(call?.properties.scope).toBeUndefined();
        expect(call?.properties.effect).toBeUndefined();
    });

    it("says whether the caller named a workspace or fell through to the grant's default", async () => {
        await callDelegated(
            { id: "trash-artifact", surface: "api", input: { workspace: "ws_1" } },
            READ_ONLY,
        );
        expect((await reported())?.properties.named_workspace).toBe(true);
    });

    it("says nothing at all when no key is configured", async () => {
        await shutdownAnalytics();
        delete process.env.POSTHOG_KEY;
        initAnalytics();
        await callDelegated({ id: "find-artifacts", surface: "mcp", input: {} }, null);
        await shutdownAnalytics();
        expect(events).toHaveLength(0);
    });
});
