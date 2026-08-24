import { beforeEach, describe, expect, it } from "vitest";
import { resetDb, seedUser } from "@services/__tests__/harness";
import { createArtifact } from "@services/core/artifacts";
import { ARTIFACT_URI, COMPONENTS, LIST_URI } from "@services/core/widget";
import { handleRpc, listTools } from "@services/core/mcp";
import type { AccessGrant } from "@services/core/authorization";

// The two ui:// components, from the resource that serves them to the payload each one is handed.
// Driven through handleRpc rather than the transport: what is under test is the envelope, and the
// OAuth walk to /mcp is already covered by mcp.itest.ts and effects.itest.ts.

const DECK = {
    format: "deck",
    theme: "studio",
    sections: [
        { id: "s1", root: { type: "text", data: { text: "Northwind" } } },
        { id: "s2", root: { type: "text", data: { text: "The market" } } },
    ],
};

interface Envelope {
    structuredContent?: { result?: unknown };
    _meta?: {
        galleo?: {
            kind?: string;
            content?: { sections?: unknown[]; theme?: string; format?: string };
            artifacts?: { id: string; title: string }[];
        };
    };
    isError?: boolean;
}

const readOnly = (userId: string, workspaceId: string): AccessGrant => ({
    userId,
    workspaceIds: [workspaceId],
    defaultWorkspaceId: workspaceId,
    scopes: ["artifacts:read"],
});

const call = async (
    grant: AccessGrant,
    name: string,
    args: Record<string, unknown>,
): Promise<Envelope> => {
    const reply = (await handleRpc(grant, {
        id: 1,
        method: "tools/call",
        params: { name, arguments: args },
    })) as { result: Envelope };
    return reply.result;
};

const uiOf = (name: string): string | undefined => {
    const tool = listTools().find((t) => t.name === name) as
        | { _meta?: { ui?: { resourceUri?: string }; "openai/outputTemplate"?: string } }
        | undefined;
    // both hosts read the same value under their own name, so a mismatch is the bug to catch
    expect(tool?._meta?.ui?.resourceUri).toBe(tool?._meta?.["openai/outputTemplate"]);
    return tool?._meta?.ui?.resourceUri;
};

describe("the ui:// components", () => {
    beforeEach(async () => {
        await resetDb();
    });

    it("advertises both and serves the shell for either uri", async () => {
        const listed = (await handleRpc(null, { id: 1, method: "resources/list" })) as {
            result: { resources: { uri: string; mimeType: string }[] };
        };
        expect(listed.result.resources.map((r) => r.uri)).toEqual(COMPONENTS.map((c) => c.uri));
        expect(
            listed.result.resources.every((r) => r.mimeType === "text/html;profile=mcp-app"),
        ).toBe(true);

        for (const uri of COMPONENTS.map((c) => c.uri)) {
            const read = (await handleRpc(null, {
                id: 1,
                method: "resources/read",
                params: { uri },
            })) as { result: { contents: { uri: string; text: string }[] } };
            expect(read.result.contents[0]!.uri).toBe(uri);
            expect(read.result.contents[0]!.text).toContain("<!doctype html>");
        }

        const missing = (await handleRpc(null, {
            id: 1,
            method: "resources/read",
            params: { uri: "ui://galleo/nope" },
        })) as { error?: { code: number } };
        expect(missing.error?.code).toBe(-32602);
    });

    it("points each tool at the component that can paint its answer", () => {
        expect(uiOf("find-artifacts")).toBe(LIST_URI);
        expect(uiOf("show-sections")).toBe(LIST_URI);
        expect(uiOf("read-artifact")).toBe(ARTIFACT_URI);
        expect(uiOf("set-theme")).toBe(ARTIFACT_URI);
        expect(uiOf("find-templates")).toBeUndefined();
    });

    it("hands the list component rows, and the model the same rows it can act on", async () => {
        const { userId, workspaceId } = await seedUser();
        await createArtifact(workspaceId, userId, {
            title: "Northwind pitch",
            themeId: "studio",
            formatId: "deck",
            draftContent: DECK,
        });

        const out = await call(readOnly(userId, workspaceId), "find-artifacts", {
            query: "Northwind",
        });
        expect(out._meta?.galleo?.kind).toBe("library");
        expect(out._meta?.galleo?.artifacts?.[0]?.title).toBe("Northwind pitch");
        // the ids are what the model calls next, so unlike a render tree they belong in both halves
        expect(out.structuredContent?.result).toEqual(out._meta?.galleo?.artifacts);
    });

    it("paints a carousel from the stored sections and answers the model with the spine", async () => {
        const { userId, workspaceId } = await seedUser();
        const artifactId = (await createArtifact(workspaceId, userId, {
            title: "Carousel target",
            themeId: "studio",
            formatId: "deck",
            draftContent: DECK,
        }))!;

        const out = await call(readOnly(userId, workspaceId), "show-sections", {
            artifact: artifactId,
        });
        expect(out.isError ?? false).toBe(false);
        expect(out._meta?.galleo?.kind).toBe("sections");
        // the theme travels with the tree, or the previews have nothing to paint themselves with
        expect(out._meta?.galleo?.content?.theme).toBe("studio");
        expect(out._meta?.galleo?.content?.format).toBe("deck");
        expect(out._meta?.galleo?.content?.sections).toHaveLength(2);
        // what the model reads names the sections; the trees stay in _meta
        expect(out.structuredContent?.result).toEqual([
            { id: "s1", text: "Northwind" },
            { id: "s2", text: "The market" },
        ]);
    });

    it("asks which artifact rather than answering about none", async () => {
        const { userId, workspaceId } = await seedUser();
        const out = await call(readOnly(userId, workspaceId), "show-sections", {});
        expect(out.isError).toBe(true);
    });
});
