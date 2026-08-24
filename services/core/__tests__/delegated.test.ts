import { describe, expect, it } from "vitest";
import { callDelegated, type Grant } from "@services/core/delegated";
import "@services/core/ai/tools/register";

// The tenancy guards that refuse before a workspace is resolved, and so need no database. The other
// half of the rule, that a call these let through goes on to act, is in mcp.itest.ts where there is
// a workspace to act in.

const grantOver = (workspaceIds: string[]): Grant => ({
    userId: "user_1",
    workspaceIds,
    defaultWorkspaceId: workspaceIds[0]!,
    scopes: ["artifacts:read", "artifacts:write", "artifacts:delete"],
});

const refusal = async (grant: Grant, input: Record<string, unknown>): Promise<string> => {
    const out = await callDelegated({ id: "trash-artifact", surface: "mcp", input }, grant);
    return out.ok ? "" : out.message;
};

describe("which workspace a delegated call lands in", () => {
    it("makes a destructive call name its workspace when the grant covers more than one", async () => {
        expect(await refusal(grantOver(["ws_1", "ws_2"]), { artifactId: "a_1" })).toMatch(
            /Name the workspace/,
        );
    });

    it("takes the workspace the caller named over the one the grant defaults to", async () => {
        expect(
            await refusal(grantOver(["ws_1", "ws_2"]), { artifactId: "a_1", workspace: "ws_9" }),
        ).toMatch(/not granted access to workspace ws_9/);
    });
});
