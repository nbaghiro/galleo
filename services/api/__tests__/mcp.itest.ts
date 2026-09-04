import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHash, randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@services/db/client";
import { schema } from "@services/db/schema";
import type { ToolId } from "@model/tools";
import { scopeFor, TOOLS } from "@model/tools";
import { toolsFor } from "@services/core/ai/tools";
import { app, jsonInit, request, resetDb, seedUser } from "@services/__tests__/harness";
import { SESSION_COOKIE, makeSession } from "@services/utils/auth";

// The whole external path, as a directory client walks it: register, consent, exchange, call.

const REDIRECT = "http://localhost:33418/callback";
const verifier = (): string => randomBytes(32).toString("base64url");
const challenge = (v: string): string => createHash("sha256").update(v).digest("base64url");

const form = (body: Record<string, string>): RequestInit => ({
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body).toString(),
});

// Every OAuth endpoint is rate limited per address, and the whole suite shares one process, so a
// case that does not pin an address would spend another case's budget. Same shape auth-flows uses.
let ipN = 0;
const freshIp = (): string => {
    ipN += 1;
    return `10.88.${Math.floor(ipN / 200)}.${(ipN % 200) + 1}`;
};
const fromIp = (ip: string, init: RequestInit = {}): RequestInit => {
    const headers = new Headers(init.headers);
    headers.set("cf-connecting-ip", ip);
    return { ...init, headers };
};
const unlimited = (init: RequestInit = {}): RequestInit => fromIp(freshIp(), init);

const withSession = (userId: string, path: string, init: RequestInit = {}): Promise<Response> => {
    const spread = unlimited(init);
    const headers = new Headers(spread.headers);
    headers.set("Cookie", `${SESSION_COOKIE}=${makeSession(userId)}`);
    return Promise.resolve(app.request(path, { ...spread, headers }));
};

async function registerClient(): Promise<string> {
    const res = await request(
        "/oauth/register",
        unlimited(jsonInit("POST", { client_name: "Test client", redirect_uris: [REDIRECT] })),
    );
    return ((await res.json()) as { client_id: string }).client_id;
}

/**
 * The consent form is signed, so a grant is taken the way a browser takes one: load the screen,
 * carry its hidden fields back. Scraping the token rather than minting one is the point, since a
 * form nobody was handed is exactly what the signature refuses.
 */
const consentTokenFrom = (html: string): string =>
    /name="consent" value="([^"]*)"/.exec(html)?.[1] ?? "";

/** The consent screen as a browser gets it, so its hidden fields can be carried back. */
const consentScreen = (
    userId: string,
    clientId: string,
    codeChallenge: string,
    scope: string,
): Promise<Response> =>
    withSession(
        userId,
        `/oauth/authorize?${new URLSearchParams({
            client_id: clientId,
            redirect_uri: REDIRECT,
            code_challenge: codeChallenge,
            code_challenge_method: "S256",
            scope,
        })}`,
    );

/** Walks the browser half of the flow and returns the code the client would receive. */
async function authorizeCode(
    userId: string,
    workspaceId: string,
    clientId: string,
    v: string,
    scope: string,
): Promise<string> {
    const screen = await consentScreen(userId, clientId, challenge(v), scope);
    const consent = await withSession(
        userId,
        "/oauth/consent",
        form({
            client_id: clientId,
            redirect_uri: REDIRECT,
            code_challenge: challenge(v),
            scope,
            ws: workspaceId,
            default_ws: workspaceId,
            consent: consentTokenFrom(await screen.text()),
        }),
    );
    return new URL(consent.headers.get("location")!).searchParams.get("code")!;
}

async function grantToken(
    userId: string,
    workspaceId: string,
    clientId: string,
    scope = "artifacts:read",
): Promise<{ access: string; refresh: string }> {
    const v = verifier();
    const code = await authorizeCode(userId, workspaceId, clientId, v, scope);
    const res = await request(
        "/oauth/token",
        unlimited(
            form({
                grant_type: "authorization_code",
                code,
                code_verifier: v,
                client_id: clientId,
                redirect_uri: REDIRECT,
            }),
        ),
    );
    const body = (await res.json()) as { access_token: string; refresh_token: string };
    return { access: body.access_token, refresh: body.refresh_token };
}

const call = async <T>(access: string, method: string, params?: unknown): Promise<T> => {
    const res = await app.request("/mcp", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${access}` },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, ...(params ? { params } : {}) }),
    });
    return (await res.json()) as T;
};

describe("MCP discovery", () => {
    it("challenges an unauthenticated call with the metadata url the client needs", async () => {
        // a tool that needs an account, rather than any call at all: some of the surface is public,
        // so the challenge is what the server asks for, not a blanket refusal at the door
        const res = await request(
            "/mcp",
            jsonInit("POST", {
                jsonrpc: "2.0",
                id: 1,
                method: "tools/call",
                params: { name: "find-artifacts", arguments: {} },
            }),
        );
        expect(res.status).toBe(401);
        expect(res.headers.get("www-authenticate")).toMatch(
            /resource_metadata=".*\/\.well-known\/oauth-protected-resource"/,
        );
    });

    it("advertises only the minimum scope, leaving the rest to step-up", async () => {
        const meta = (await (await request("/.well-known/oauth-protected-resource")).json()) as {
            scopes_supported: string[];
        };
        expect(meta.scopes_supported).toEqual(["artifacts:read"]);
    });

    it("publishes S256 and the endpoints a client discovers it by", async () => {
        const meta = (await (
            await request("/.well-known/oauth-authorization-server")
        ).json()) as Record<string, unknown>;
        expect(meta.code_challenge_methods_supported).toEqual(["S256"]);
        expect(meta.authorization_response_iss_parameter_supported).toBe(true);
    });
});

describe("the authorization code flow", () => {
    beforeEach(async () => {
        await resetDb();
    });

    it("issues a token a client can call with", async () => {
        const { userId, workspaceId } = await seedUser();
        const clientId = await registerClient();
        const { access } = await grantToken(userId, workspaceId, clientId);
        const out = await call<{ result: { serverInfo: { name: string } } }>(access, "initialize");
        expect(out.result.serverInfo.name).toBe("galleo");
    });

    it("refuses a replayed code and a wrong verifier", async () => {
        const { userId, workspaceId } = await seedUser();
        const clientId = await registerClient();
        const v = verifier();
        const code = await authorizeCode(userId, workspaceId, clientId, v, "artifacts:read");
        const exchange = (verifierUsed: string): Promise<Response> =>
            request(
                "/oauth/token",
                unlimited(
                    form({
                        grant_type: "authorization_code",
                        code,
                        code_verifier: verifierUsed,
                        client_id: clientId,
                        redirect_uri: REDIRECT,
                    }),
                ),
            );
        expect((await exchange("nope")).status).toBe(400);
        expect((await exchange(v)).status).toBe(200);
        expect((await exchange(v)).status).toBe(400); // single use
    });

    it("rotates a refresh token, and the spent one stops working", async () => {
        const { userId, workspaceId } = await seedUser();
        const clientId = await registerClient();
        const { refresh } = await grantToken(userId, workspaceId, clientId);
        const spend = (): Promise<Response> =>
            request(
                "/oauth/token",
                unlimited(
                    form({
                        grant_type: "refresh_token",
                        refresh_token: refresh,
                        client_id: clientId,
                    }),
                ),
            );
        expect((await spend()).status).toBe(200);
        expect((await spend()).status).toBe(400);
    });
});

describe("tools over MCP", () => {
    beforeEach(async () => {
        await resetDb();
    });

    // Against the catalog rather than a copy of it: a snapshot of names goes stale the day a tool
    // joins the surface, and what actually has to hold is that the two agree.
    it("lists exactly what the catalog offers on this surface, each naming the scope it needs", async () => {
        const { userId, workspaceId } = await seedUser();
        const { access } = await grantToken(userId, workspaceId, await registerClient());
        const out = await call<{
            result: {
                tools: {
                    name: string;
                    annotations: { readOnlyHint: boolean };
                    _meta: Record<string, string>;
                }[];
            };
        }>(access, "tools/list");
        const names = out.result.tools.map((t) => t.name).sort();
        expect(names).toEqual(
            toolsFor("mcp")
                .map((t) => t.id)
                .sort(),
        );
        for (const t of out.result.tools) {
            expect(t._meta["galleo/scope"]).toBe(scopeFor(t.name as ToolId));
            expect(t.annotations.readOnlyHint).toBe(TOOLS[t.name as ToolId].effect === "read");
        }
    });

    // The whole point of listing a tool a token cannot call: the client is told what would let it.
    it("refuses a call the grant does not cover, and names the scope that would", async () => {
        const { userId, workspaceId } = await seedUser();
        const { access } = await grantToken(userId, workspaceId, await registerClient());
        const res = await app.request("/mcp", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${access}` },
            body: JSON.stringify({
                jsonrpc: "2.0",
                id: 1,
                method: "tools/call",
                params: { name: "rename-artifact", arguments: { id: "x", title: "y" } },
            }),
        });
        expect(res.status).toBe(403);
        expect(res.headers.get("www-authenticate")).toMatch(/scope="artifacts:write"/);
        const body = (await res.json()) as { error: { data: { error: string; scope: string } } };
        expect(body.error.data).toEqual({
            error: "insufficient_scope",
            scope: "artifacts:write",
        });
    });

    it("lets the same client through once it has stepped up", async () => {
        const { userId, workspaceId } = await seedUser();
        const clientId = await registerClient();
        const { access } = await grantToken(
            userId,
            workspaceId,
            clientId,
            "artifacts:read artifacts:write",
        );
        const out = await call<{ result: { isError?: boolean; content: { text: string }[] } }>(
            access,
            "tools/call",
            { name: "rename-artifact", arguments: { id: crypto.randomUUID(), title: "New name" } },
        );
        // it got past the gate: whatever it says now is about the artifact, not the permission
        expect(out.result.content[0]!.text).not.toMatch(/not granted/);
    });

    // trash and restore are one permission, which `effect` alone cannot say: restore is a write.
    it("puts restoring behind the same scope as trashing", async () => {
        expect(scopeFor("restore-artifact")).toBe("artifacts:delete");
        expect(scopeFor("trash-artifact")).toBe("artifacts:delete");
    });

    it("names the workspace it acted in, so the choice is visible in the transcript", async () => {
        const { userId, workspaceId } = await seedUser();
        const { access } = await grantToken(userId, workspaceId, await registerClient());
        const out = await call<{
            result: { structuredContent: { workspace: { id: string } } };
        }>(access, "tools/call", { name: "find-artifacts", arguments: {} });
        expect(out.result.structuredContent.workspace.id).toBe(workspaceId);
    });

    it("refuses a workspace the grant does not cover", async () => {
        const { userId, workspaceId } = await seedUser();
        const other = await seedUser();
        const { access } = await grantToken(userId, workspaceId, await registerClient());
        const out = await call<{ result: { isError: boolean; content: { text: string }[] } }>(
            access,
            "tools/call",
            { name: "find-artifacts", arguments: { workspace: other.workspaceId } },
        );
        expect(out.result.isError).toBe(true);
        expect(out.result.content[0]!.text).toMatch(/not granted access/);
    });

    // Granted the scope it would need, so what refuses it is the surface and nothing else.
    it("refuses a tool the catalog does not put on this surface", async () => {
        const { userId, workspaceId } = await seedUser();
        const { access } = await grantToken(
            userId,
            workspaceId,
            await registerClient(),
            "artifacts:read artifacts:write",
        );
        const out = await call<{ result: { isError: boolean; content: { text: string }[] } }>(
            access,
            "tools/call",
            { name: "rewrite-text", arguments: { text: "hi", instruction: "shorter" } },
        );
        expect(out.result.isError).toBe(true);
        expect(out.result.content[0]!.text).toMatch(/not available over MCP/);
    });

    // It used to answer this as a success carrying the sentence "That artifact was not found." as
    // its result, which left a model parsing prose to find out whether the call had worked. Still a
    // tool result rather than a transport error: the call arrived and ran, and only then failed.
    it("marks a read of an artifact that is not there as a failed call, in the envelope", async () => {
        const { userId, workspaceId } = await seedUser();
        const { access } = await grantToken(userId, workspaceId, await registerClient());
        const res = await app.request("/mcp", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${access}` },
            body: JSON.stringify({
                jsonrpc: "2.0",
                id: 1,
                method: "tools/call",
                params: { name: "read-artifact", arguments: { id: crypto.randomUUID() } },
            }),
        });
        expect(res.status).toBe(200);
        const body = (await res.json()) as {
            result: { isError?: boolean; content: { text: string }[]; structuredContent?: unknown };
        };
        expect(body.result.isError).toBe(true);
        expect(body.result.content[0]!.text).toMatch(/not found/);
        expect(body.result.structuredContent).toBeUndefined();
    });

    // The transport has to stay JSON-RPC even when a body fails, or a client sees a dead socket
    // rather than a failed call. Reaching a real throw is hard from here, so this pins the shape a
    // malformed call comes back in.
    it("answers a bad call inside the envelope rather than as a transport error", async () => {
        const { userId, workspaceId } = await seedUser();
        const { access } = await grantToken(userId, workspaceId, await registerClient());
        const out = await call<{
            jsonrpc: string;
            id: number;
            result: { isError: boolean; content: { text: string }[] };
        }>(access, "tools/call", { name: "read-artifact", arguments: { nonsense: true } });
        expect(out.jsonrpc).toBe("2.0");
        expect(out.id).toBe(1);
        expect(out.result.isError).toBe(true);
    });
});

describe("the authorization server's defences", () => {
    beforeEach(async () => {
        await resetDb();
    });

    it("refuses a consent post that was not handed out by the consent screen", async () => {
        const { userId, workspaceId } = await seedUser();
        const clientId = await registerClient();
        const v = verifier();
        const forged = await withSession(
            userId,
            "/oauth/consent",
            form({
                client_id: clientId,
                redirect_uri: REDIRECT,
                code_challenge: challenge(v),
                scope: "artifacts:read",
                ws: workspaceId,
                default_ws: workspaceId,
                consent: "not-the-one-we-issued",
            }),
        );
        expect(forged.status).toBe(400);
        expect(forged.headers.get("location")).toBe(null);
    });

    // A form is bound to the challenge it was issued against, so one taken from a read-only screen
    // cannot be replayed to approve a different client's request.
    it("refuses a consent form replayed against a different request", async () => {
        const { userId, workspaceId } = await seedUser();
        const clientId = await registerClient();
        const mine = verifier();
        const screen = await consentScreen(userId, clientId, challenge(mine), "artifacts:read");
        const stolen = consentTokenFrom(await screen.text());
        const other = await withSession(
            userId,
            "/oauth/consent",
            form({
                client_id: clientId,
                redirect_uri: REDIRECT,
                code_challenge: challenge(verifier()), // a different challenge
                scope: "artifacts:read",
                ws: workspaceId,
                default_ws: workspaceId,
                consent: stolen,
            }),
        );
        expect(other.status).toBe(400);
    });

    // A password reset revokes every session minted before it. Minting an MCP token is exactly what
    // a revoked session must not still be able to do.
    it("turns away a session the account's password reset revoked", async () => {
        const { userId } = await seedUser();
        await db
            .update(schema.users)
            .set({ passwordChangedAt: new Date(Date.now() + 60_000) })
            .where(eq(schema.users.id, userId));
        const clientId = await registerClient();
        const screen = await consentScreen(
            userId,
            clientId,
            challenge(verifier()),
            "artifacts:read",
        );
        // signed out as far as this flow is concerned, so it is sent to sign in rather than shown a form
        expect(screen.status).toBe(302);
        const post = await withSession(userId, "/oauth/consent", form({ client_id: clientId }));
        expect(post.status).toBe(401);
    });

    it("only registers a redirect uri a code could safely be handed to", async () => {
        const bad = async (uri: string): Promise<number> =>
            (
                await request(
                    "/oauth/register",
                    unlimited(jsonInit("POST", { client_name: "x", redirect_uris: [uri] })),
                )
            ).status;
        expect(await bad("http://evil.example.com/cb")).toBe(400);
        expect(await bad("ftp://example.com/cb")).toBe(400);
        expect(await bad("https://example.com/cb#frag")).toBe(400);
        expect(await bad("not a url")).toBe(400);
        expect(await bad("https://example.com/cb")).toBe(201);
        expect(await bad("http://127.0.0.1:33418/cb")).toBe(201);
    });

    // Replaying a spent refresh token means the credential leaked. The successor cannot be told
    // apart from the thief, so the whole family goes and both are sent back through consent.
    it("kills the whole token family when a spent refresh token is replayed", async () => {
        const { userId, workspaceId } = await seedUser();
        const clientId = await registerClient();
        const { refresh } = await grantToken(userId, workspaceId, clientId);
        const spend = (token: string): Promise<Response> =>
            request(
                "/oauth/token",
                unlimited(
                    form({
                        grant_type: "refresh_token",
                        refresh_token: token,
                        client_id: clientId,
                    }),
                ),
            );
        const rotated = (await (await spend(refresh)).json()) as {
            access_token: string;
            refresh_token: string;
        };
        // the successor works right up until the spent one is presented again
        const before = await call<{ result: unknown }>(rotated.access_token, "ping");
        expect(before.result).toEqual({});
        expect((await spend(refresh)).status).toBe(400);
        expect((await spend(rotated.refresh_token)).status).toBe(400);
        const after = await app.request("/mcp", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${rotated.access_token}`,
            },
            body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping" }),
        });
        expect(after.status).toBe(401);
    });

    // A token is a credential for one audience; presenting it elsewhere is what this stops.
    it("refuses a token minted for another resource", async () => {
        const { userId, workspaceId } = await seedUser();
        const { access } = await grantToken(userId, workspaceId, await registerClient());
        await db
            .update(schema.oauthTokens)
            .set({ resource: "https://somewhere.else/mcp" })
            .where(eq(schema.oauthTokens.userId, userId));
        const res = await app.request("/mcp", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${access}` },
            body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping" }),
        });
        expect(res.status).toBe(401);
    });

    it("lists a connected app and disconnects it", async () => {
        const { userId, workspaceId } = await seedUser();
        const clientId = await registerClient();
        const { access } = await grantToken(userId, workspaceId, clientId);

        const listed = (await (await withSession(userId, "/me/apps")).json()) as {
            apps: { clientId: string; name: string; scopes: string[] }[];
        };
        expect(listed.apps).toHaveLength(1);
        expect(listed.apps[0]!.clientId).toBe(clientId);
        expect(listed.apps[0]!.scopes).toEqual(["artifacts:read"]);

        const gone = await withSession(userId, `/me/apps/${clientId}`, { method: "DELETE" });
        expect(gone.status).toBe(200);
        const after = await app.request("/mcp", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${access}` },
            body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping" }),
        });
        expect(after.status).toBe(401);
        const empty = (await (await withSession(userId, "/me/apps")).json()) as { apps: unknown[] };
        expect(empty.apps).toEqual([]);
    });

    it("takes a token back when a client hands it in", async () => {
        const { userId, workspaceId } = await seedUser();
        const clientId = await registerClient();
        const { access, refresh } = await grantToken(userId, workspaceId, clientId);
        const res = await request(
            "/oauth/revoke",
            unlimited(form({ token: refresh, client_id: clientId })),
        );
        expect(res.status).toBe(200);
        const after = await app.request("/mcp", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${access}` },
            body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping" }),
        });
        expect(after.status).toBe(401);
    });

    // Whether a token exists is not something an unauthenticated caller gets to learn.
    it("answers a revocation for an unknown token the same way", async () => {
        const res = await request(
            "/oauth/revoke",
            unlimited(form({ token: "nope", client_id: "nobody" })),
        );
        expect(res.status).toBe(200);
    });

    // Unauthenticated and it writes a row, so the ceiling is the thing standing between a stranger
    // and an unbounded client table.
    it("stops one address registering clients without end", async () => {
        const ip = "10.99.0.1";
        const attempt = (): Promise<Response> =>
            request(
                "/oauth/register",
                fromIp(ip, jsonInit("POST", { client_name: "x", redirect_uris: [REDIRECT] })),
            );
        let last: Response | undefined;
        for (let i = 0; i < 11; i++) last = await attempt();
        expect(last!.status).toBe(429);
        // another address is untouched by it
        expect(
            (
                await request(
                    "/oauth/register",
                    unlimited(jsonInit("POST", { client_name: "x", redirect_uris: [REDIRECT] })),
                )
            ).status,
        ).toBe(201);
    });
});

// A client that identifies itself by a document it hosts, rather than by a row it registered here.
// The spec prefers this now, and it is what removes a client row per user who connects.
describe("client id metadata documents", () => {
    beforeEach(async () => {
        await resetDb();
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("advertises support, so a client knows to skip registration", async () => {
        const meta = (await (
            await request("/.well-known/oauth-authorization-server")
        ).json()) as Record<string, unknown>;
        expect(meta.client_id_metadata_document_supported).toBe(true);
    });

    it("carries a hosted client through consent to a token, with no row registered", async () => {
        const { userId, workspaceId } = await seedUser();
        const clientId = "https://app.example.com/oauth/galleo.json";
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => ({
                ok: true,
                text: async () =>
                    JSON.stringify({
                        client_id: clientId,
                        client_name: "Hosted Client",
                        redirect_uris: [REDIRECT],
                    }),
                headers: { get: () => null },
            })),
        );

        const v = verifier();
        const page = await withSession(
            userId,
            `/oauth/authorize?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(REDIRECT)}&code_challenge=${challenge(v)}&code_challenge_method=S256`,
        );
        const html = await page.text();
        expect(html).toContain("Hosted Client"); // the name the document gave, on the consent screen

        const hidden = Object.fromEntries(
            [...html.matchAll(/<input type="hidden" name="([^"]+)" value="([^"]*)"/g)].map((m) => [
                m[1]!,
                m[2]!,
            ]),
        );
        const consent = await withSession(
            userId,
            "/oauth/consent",
            form({ ...hidden, ws: workspaceId, default_ws: workspaceId }),
        );
        const code = new URL(consent.headers.get("location")!).searchParams.get("code")!;
        const res = await request(
            "/oauth/token",
            form({
                grant_type: "authorization_code",
                code,
                code_verifier: v,
                client_id: clientId,
                redirect_uri: REDIRECT,
            }),
        );
        expect(res.status).toBe(200);
    });

    it("turns away a redirect uri the hosted document does not list", async () => {
        const { userId } = await seedUser();
        const clientId = "https://app.example.com/oauth/narrow.json";
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => ({
                ok: true,
                text: async () =>
                    JSON.stringify({
                        client_id: clientId,
                        client_name: "Narrow Client",
                        redirect_uris: ["https://app.example.com/only-here"],
                    }),
                headers: { get: () => null },
            })),
        );
        const res = await withSession(
            userId,
            `/oauth/authorize?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(REDIRECT)}&code_challenge=${challenge(verifier())}&code_challenge_method=S256`,
        );
        expect(res.status).toBe(400);
    });
});

// Some of the surface is a curated catalog rather than anybody's content, so a client can look
// before it signs in. This is what makes "required when the server asks" the honest setting.
describe("the public surface", () => {
    beforeEach(async () => {
        await resetDb();
    });

    const anon = async (method: string, params?: unknown): Promise<Response> =>
        app.request("/mcp", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, ...(params ? { params } : {}) }),
        });

    it("answers initialize and tools/list with no token at all", async () => {
        expect((await anon("initialize")).status).toBe(200);
        const listed = (await (await anon("tools/list")).json()) as {
            result: { tools: unknown[] };
        };
        expect(listed.result.tools.length).toBeGreaterThan(0);
    });

    it("publishes an output schema per tool, in the envelope structuredContent carries", async () => {
        const listed = (await (await anon("tools/list")).json()) as {
            result: {
                tools: {
                    name: string;
                    outputSchema?: { properties?: Record<string, unknown>; required?: string[] };
                }[];
            };
        };
        for (const t of listed.result.tools) {
            expect(t.outputSchema, t.name).toBeDefined();
            expect(Object.keys(t.outputSchema!.properties ?? {})).toEqual(
                expect.arrayContaining(["workspace", "artifact", "result"]),
            );
            expect(t.outputSchema!.required).toEqual(["result"]);
        }
    });

    it("runs a public tool for a caller with no account", async () => {
        const res = await anon("tools/call", { name: "find-templates", arguments: {} });
        expect(res.status).toBe(200);
        const body = (await res.json()) as {
            result: { isError?: boolean; content: { text: string }[] };
        };
        expect(body.result.isError ?? false).toBe(false);
        expect(JSON.parse(body.result.content[0]!.text)).not.toHaveLength(0);
    });

    it("challenges a tool that needs an account, which is what starts the sign-in", async () => {
        const res = await anon("tools/call", { name: "find-artifacts", arguments: {} });
        expect(res.status).toBe(401);
        expect(res.headers.get("www-authenticate")).toMatch(/resource_metadata=/);
    });

    it("still refuses a token that is offered and bad, rather than treating it as anonymous", async () => {
        const res = await app.request("/mcp", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: "Bearer not-a-token" },
            body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
        });
        expect(res.status).toBe(401);
    });
});
