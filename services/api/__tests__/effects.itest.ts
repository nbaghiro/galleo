import { beforeEach, describe, expect, it } from "vitest";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { app, request, resetDb, seedUser } from "@services/__tests__/harness";
import { SESSION_COOKIE, makeSession } from "@services/utils/auth";
import { createArtifact, readArtifact } from "@services/core/artifacts";

const REDIRECT = "http://localhost:33418/cb";
const form = (b: Record<string, string | string[]>): RequestInit => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(b))
        (Array.isArray(v) ? v : [v]).forEach((x) => p.append(k, x));
    return {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: p.toString(),
    };
};
const sess = (userId: string, path: string, init: RequestInit = {}): Promise<Response> => {
    const headers = new Headers(init.headers);
    headers.set("Cookie", `${SESSION_COOKIE}=${makeSession(userId)}`);
    return Promise.resolve(app.request(path, { ...init, headers }));
};

// one grant, so both tests reach the endpoint the way a directory client does
async function grant(userId: string, workspaceId: string, scope: string): Promise<string> {
    const reg = await request("/oauth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ client_name: "effect", redirect_uris: [REDIRECT] }),
    });
    const clientId = ((await reg.json()) as { client_id: string }).client_id;
    const verifier = randomBytes(32).toString("base64url");
    const challenge = createHash("sha256").update(verifier).digest("base64url");
    const page = await (
        await sess(
            userId,
            `/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(REDIRECT)}&code_challenge=${challenge}&code_challenge_method=S256&scope=${encodeURIComponent(scope)}`,
        )
    ).text();
    const hidden = Object.fromEntries(
        [...page.matchAll(/<input type="hidden" name="([^"]+)" value="([^"]*)"/g)].map((m) => [
            m[1]!,
            m[2]!,
        ]),
    );
    const consent = await sess(
        userId,
        "/oauth/consent",
        form({ ...hidden, ws: workspaceId, default_ws: workspaceId }),
    );
    const code = new URL(consent.headers.get("location")!).searchParams.get("code")!;
    const tok = (await (
        await request(
            "/oauth/token",
            form({
                grant_type: "authorization_code",
                code,
                code_verifier: verifier,
                client_id: clientId,
                redirect_uri: REDIRECT,
            }),
        )
    ).json()) as { access_token: string };
    return tok.access_token;
}

const rpc = async (access: string, method: string, params?: unknown): Promise<unknown> => {
    const res = await app.request("/mcp", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${access}` },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, ...(params ? { params } : {}) }),
    });
    return await res.json();
};

// The write half of the MCP surface: a tool result reaching stored content with no client to apply
// it. Covered here rather than in mcp.itest.ts because what is under test is the effect path
// (load, patch, commit, resync), not the protocol.
describe("the effect path", () => {
    beforeEach(async () => {
        await resetDb();
    });

    it("a write over MCP lands in the stored artifact and bumps seq for the room", async () => {
        const { userId, workspaceId } = await seedUser();
        const artifactId = (await createArtifact(workspaceId, userId, {
            title: "Effect target",
            themeId: "studio",
            formatId: "deck",
            draftContent: {
                format: "deck",
                theme: "studio",
                sections: [{ id: "s1", root: { type: "text", data: { text: "hi" } } }],
            },
        }))!;
        const before = await readArtifact(workspaceId, artifactId);
        const access = await grant(userId, workspaceId, "artifacts:read artifacts:write");

        const out = (await rpc(access, "tools/call", {
            name: "set-theme",
            arguments: { theme: "noir", artifact: artifactId },
        })) as { result: { isError?: boolean } };
        expect(out.result.isError ?? false).toBe(false);

        const row = await readArtifact(workspaceId, artifactId);
        expect((row!.draftContent as { theme: string }).theme).toBe("noir");
        expect(row!.seq).toBeGreaterThan(before!.seq);
    });

    // A WorkspaceAction is an intention until this path carries it out, so what the row did is the
    // only thing that can answer. Trashing something that is not there moved nothing, and used to
    // come back as "Moved to Trash." all the same.
    it("performs a trash, and refuses one that names an artifact there is none of", async () => {
        const { userId, workspaceId } = await seedUser();
        const artifactId = (await createArtifact(workspaceId, userId, {
            title: "Trash target",
            themeId: "studio",
            formatId: "deck",
            draftContent: {
                format: "deck",
                theme: "studio",
                sections: [{ id: "s1", root: { type: "text", data: { text: "bye" } } }],
            },
        }))!;
        const access = await grant(userId, workspaceId, "artifacts:read artifacts:delete");
        const trash = async (
            id: string,
        ): Promise<{ isError?: boolean; content: { text: string }[] }> =>
            (
                (await rpc(access, "tools/call", {
                    name: "trash-artifact",
                    arguments: { artifactId: id },
                })) as { result: { isError?: boolean; content: { text: string }[] } }
            ).result;

        const done = await trash(artifactId);
        expect(done.isError ?? false).toBe(false);
        expect(done.content[0]!.text).toMatch(/Trash/);
        expect((await readArtifact(workspaceId, artifactId))!.trashedAt).not.toBe(null);

        const missing = await trash(randomUUID());
        expect(missing.isError).toBe(true);
        expect(missing.content[0]!.text).toMatch(/not found/);
    });

    it("hands the component a tree to paint, and keeps it out of what the model reads", async () => {
        const { userId, workspaceId } = await seedUser();
        const artifactId = (await createArtifact(workspaceId, userId, {
            title: "Component target",
            themeId: "studio",
            formatId: "deck",
            draftContent: {
                format: "deck",
                theme: "studio",
                sections: [{ id: "s1", root: { type: "text", data: { text: "hello" } } }],
            },
        }))!;
        const access = await grant(userId, workspaceId, "artifacts:read");

        const listed = (await rpc(access, "resources/list")) as {
            result: { resources: { uri: string; mimeType: string }[] };
        };
        expect(listed.result.resources[0]!.mimeType).toBe("text/html;profile=mcp-app");

        const out = (await rpc(access, "tools/call", {
            name: "read-artifact",
            arguments: { id: artifactId },
        })) as {
            result: {
                _meta?: { galleo?: { content?: { sections: unknown[] } } };
                structuredContent: Record<string, unknown>;
            };
        };
        // The paintable tree rides in _meta, which reaches the iframe and not the model. What the
        // model reads is the tool's own answer, prose in this case: read-artifact exists to let it
        // read, so text there is the point. What must not be there is the render tree.
        expect(out.result._meta?.galleo?.content?.sections).toHaveLength(1);
        expect(out.result.structuredContent).not.toHaveProperty("result.sections");
    });
});
