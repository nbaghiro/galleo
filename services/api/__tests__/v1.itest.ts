import { beforeEach, describe, expect, it } from "vitest";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@services/db/client";
import { schema } from "@services/db/schema";
import { freshCreditWindow } from "@services/core/ledger";
import { app, authed, jsonInit, request, resetDb, seedUser } from "@services/__tests__/harness";
import { SESSION_COOKIE, makeSession } from "@services/utils/auth";

// The same calls MCP makes, over a resource path and a bearer header. What is asserted here is
// mostly that the two answer the same thing: the surfaces differ in how a caller authenticated and
// in how an answer is phrased, and every decision between those two is the shared call's.

const REDIRECT = "http://localhost:33418/callback";
const verifier = (): string => randomBytes(32).toString("base64url");
const challenge = (v: string): string => createHash("sha256").update(v).digest("base64url");

const form = (body: Record<string, string | string[]>): RequestInit => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(body))
        for (const one of Array.isArray(v) ? v : [v]) params.append(k, one);
    return {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params.toString(),
    };
};

// Every OAuth endpoint is rate limited per address, and the whole suite shares one process, so a
// case that does not pin an address would spend another case's budget. Same shape mcp.itest uses.
let ipN = 0;
const freshIp = (): string => {
    ipN += 1;
    return `10.77.${Math.floor(ipN / 200)}.${(ipN % 200) + 1}`;
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

const consentTokenFrom = (html: string): string =>
    /name="consent" value="([^"]*)"/.exec(html)?.[1] ?? "";

/** The browser half of the flow, walked the way mcp.itest walks it, for the same reason. */
async function grantToken(
    userId: string,
    workspaceIds: string[],
    scope = "artifacts:read",
): Promise<string> {
    const clientId = await registerClient();
    const v = verifier();
    const screen = await withSession(
        userId,
        `/oauth/authorize?${new URLSearchParams({
            client_id: clientId,
            redirect_uri: REDIRECT,
            code_challenge: challenge(v),
            code_challenge_method: "S256",
            scope,
        })}`,
    );
    const consent = await withSession(
        userId,
        "/oauth/consent",
        form({
            client_id: clientId,
            redirect_uri: REDIRECT,
            code_challenge: challenge(v),
            scope,
            ws: workspaceIds,
            default_ws: workspaceIds[0]!,
            consent: consentTokenFrom(await screen.text()),
        }),
    );
    const code = new URL(consent.headers.get("location")!).searchParams.get("code")!;
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
    return ((await res.json()) as { access_token: string }).access_token;
}

// Through the harness app, which mounts v1 the way server.ts does: these routes carry their own
// full paths, so what a case asks for is exactly what production serves.
const api = (path: string, init: RequestInit = {}): Promise<Response> => request(path, init);

const asClient = (access: string, path: string, init: RequestInit = {}): Promise<Response> => {
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${access}`);
    return api(path, { ...init, headers });
};

interface Answer {
    data?: unknown;
    workspace?: { id: string; name: string };
    artifact?: string;
    error?: string;
    scope?: string;
}

const answer = async (res: Response): Promise<Answer> => (await res.json()) as Answer;

const deck = (heading: string): Record<string, unknown> => ({
    format: "deck",
    theme: "studio",
    sections: [
        {
            id: "s1",
            root: {
                type: "group",
                data: {
                    children: [
                        { type: "text", data: { style: "h1", text: heading } },
                        { type: "text", data: { style: "body", text: "Two lines of copy." } },
                    ],
                },
            },
        },
    ],
});

async function secondWorkspace(userId: string, name: string): Promise<string> {
    const [w] = await db
        .insert(schema.workspaces)
        .values({
            name,
            slug: `ws-${randomBytes(6).toString("hex")}`,
            ownerId: userId,
            plan: "free",
            ...freshCreditWindow(),
        })
        .returning();
    await db.insert(schema.members).values({ workspaceId: w!.id, userId, role: "owner" });
    return w!.id;
}

describe("who the v1 API lets in", () => {
    beforeEach(async () => {
        await resetDb();
    });

    // The reason this surface may not resolve a caller before the shared call: part of the tool
    // catalog is nobody's content, and which part is the shared call's decision to make.
    it("lists the contract with no token: every api tool, its scope, and both schemas", async () => {
        const res = await api("/api/v1/tools");
        expect(res.status).toBe(200);
        const { tools } = (await res.json()) as {
            tools: { name: string; scope: string; input?: unknown; output?: unknown }[];
        };
        expect(tools.map((t) => t.name)).toEqual(
            expect.arrayContaining(["find-templates", "generate-artifact", "read-artifact"]),
        );
        for (const t of tools) {
            expect(t.scope, t.name).toBeTruthy();
            expect(t.input, t.name).toBeDefined();
            expect(t.output, t.name).toBeDefined();
        }
    });

    it("serves the template catalog to a caller with no Authorization header at all", async () => {
        const res = await api("/api/v1/templates");
        expect(res.status).toBe(200);
        const { data } = await answer(res);
        expect(Array.isArray(data)).toBe(true);
        expect((data as unknown[]).length).toBeGreaterThan(0);
    });

    it("narrows the same anonymous catalog read by the query it was given", async () => {
        const all = (await answer(await api("/api/v1/templates"))).data as unknown[];
        const some = (await answer(await api("/api/v1/templates?q=pitch"))).data as unknown[];
        expect(some.length).toBeGreaterThan(0);
        expect(some.length).toBeLessThan(all.length);
    });

    it("asks an anonymous caller to authenticate for a tool that needs an account", async () => {
        const res = await api("/api/v1/artifacts");
        expect(res.status).toBe(401);
        expect(await answer(res)).toEqual({ error: "unauthorized" });
    });

    // A token that is offered and does not verify is a broken client, not an anonymous one, so it
    // is refused even on the route that needs no token at all.
    it("refuses a token that is offered and bad rather than treating it as anonymous", async () => {
        expect((await asClient("not-a-token", "/api/v1/templates")).status).toBe(401);
        expect((await asClient("not-a-token", "/api/v1/artifacts")).status).toBe(401);
    });

    it("refuses a token minted for another resource", async () => {
        const { userId, workspaceId } = await seedUser();
        const access = await grantToken(userId, [workspaceId]);
        await db
            .update(schema.oauthTokens)
            .set({ resource: "https://somewhere.else/mcp" })
            .where(eq(schema.oauthTokens.userId, userId));
        expect((await asClient(access, "/api/v1/workspaces")).status).toBe(401);
    });

    // The credential this surface exists for: issued to a workspace rather than to a browser, so it
    // names no resource and is verified on the other branch of the two.
    it("accepts a machine credential, which is bound to no resource at all", async () => {
        const { userId, workspaceId } = await seedUser({ plan: "premium" });
        const made = await authed(
            userId,
            "/workspace/credentials",
            jsonInit("POST", { name: "CI" }),
        );
        expect(made.status).toBe(201);
        const credential = (await made.json()) as { clientId: string; secret: string };
        const issued = await request(
            "/oauth/token",
            unlimited(
                form({
                    grant_type: "client_credentials",
                    client_id: credential.clientId,
                    client_secret: credential.secret,
                    scope: "artifacts:read",
                }),
            ),
        );
        const { access_token: access } = (await issued.json()) as { access_token: string };
        const res = await asClient(access, "/api/v1/workspaces");
        expect(res.status).toBe(200);
        expect(await answer(res)).toMatchObject({
            data: [{ id: workspaceId, isDefault: true }],
        });
    });
});

describe("reading through the v1 API", () => {
    beforeEach(async () => {
        await resetDb();
    });

    it("lists the workspaces the grant covers, and marks the one it defaults to", async () => {
        const { userId, workspaceId } = await seedUser();
        const other = await secondWorkspace(userId, "Second WS");
        const outside = await secondWorkspace(userId, "Not in the grant");
        const access = await grantToken(userId, [workspaceId, other]);
        const res = await asClient(access, "/api/v1/workspaces");
        expect(res.status).toBe(200);
        const listed = (await answer(res)).data as { id: string; isDefault: boolean }[];
        expect(listed.map((w) => w.id).sort()).toEqual([workspaceId, other].sort());
        expect(listed.find((w) => w.isDefault)?.id).toBe(workspaceId);
        expect(listed.some((w) => w.id === outside)).toBe(false);
    });

    it("finds an artifact by a word in its title, and reads the same one back by id", async () => {
        const { userId, workspaceId } = await seedUser();
        const access = await grantToken(userId, [workspaceId], "artifacts:read artifacts:write");
        const made = await answer(
            await asClient(
                access,
                "/api/v1/artifacts",
                jsonInit("POST", { title: "Kestrel review", content: deck("Kestrel review") }),
            ),
        );
        const id = made.artifact!;

        const found = await asClient(access, "/api/v1/artifacts?q=Kestrel");
        expect(found.status).toBe(200);
        const hits = (await answer(found)).data as { id: string; title: string }[];
        expect(hits.map((h) => h.id)).toEqual([id]);
        expect(hits[0]!.title).toBe("Kestrel review");

        const read = await asClient(access, `/api/v1/artifacts/${id}`);
        expect(read.status).toBe(200);
        const body = await answer(read);
        expect(body.artifact).toBe(id);
        expect(String(body.data)).toContain("Kestrel review");
    });

    it("lists the recent work when the search carries no query", async () => {
        const { userId, workspaceId } = await seedUser();
        const access = await grantToken(userId, [workspaceId], "artifacts:read artifacts:write");
        await asClient(
            access,
            "/api/v1/artifacts",
            jsonInit("POST", { title: "Only one", content: deck("Only one") }),
        );
        const res = await asClient(access, "/api/v1/artifacts");
        expect(res.status).toBe(200);
        expect((await answer(res)).data).toHaveLength(1);
    });

    // The tool body answers a missing artifact in prose, and this surface used to pass that on as a
    // 200 carrying the sentence as its data. The shared call resolves the artifact before the body
    // runs, so a read that names nothing is refused on both surfaces rather than described.
    it("answers a read of an artifact that is not there with 404", async () => {
        const { userId, workspaceId } = await seedUser();
        const access = await grantToken(userId, [workspaceId]);
        const res = await asClient(access, `/api/v1/artifacts/${randomUUID()}`);
        expect(res.status).toBe(404);
        expect(await answer(res)).toEqual({ error: "That artifact was not found." });
    });

    // Postgres refuses to compare a uuid column with something that is not one, so an id a caller
    // invented has to be answered before it reaches a query, or it comes back as a 500.
    it("answers an id that is not an id the same way, not as a server fault", async () => {
        const { userId, workspaceId } = await seedUser();
        const access = await grantToken(userId, [workspaceId]);
        const res = await asClient(access, "/api/v1/artifacts/the-kestrel-one");
        expect(res.status).toBe(404);
    });

    it("names the workspace it acted in on every answer that had one", async () => {
        const { userId, workspaceId } = await seedUser();
        const access = await grantToken(userId, [workspaceId]);
        const res = await asClient(access, "/api/v1/artifacts");
        expect((await answer(res)).workspace).toEqual({ id: workspaceId, name: "Test WS" });
    });
});

describe("what the v1 API refuses", () => {
    beforeEach(async () => {
        await resetDb();
    });

    // The point of answering 403 rather than 401: the credential is good, so what the client does
    // next is widen it, and the scope names what to widen it to.
    it("answers a scope the grant does not carry with 403 and the scope that would satisfy it", async () => {
        const { userId, workspaceId } = await seedUser();
        const access = await grantToken(userId, [workspaceId]);
        const res = await asClient(access, `/api/v1/artifacts/${randomUUID()}`, {
            method: "DELETE",
        });
        expect(res.status).toBe(403);
        expect(await answer(res)).toEqual({
            error: "insufficient_scope",
            scope: "artifacts:delete",
        });
    });

    // Ahead of the workspace lookup, so a refused caller learns nothing about which workspaces the
    // account has.
    it("answers the scope refusal before it looks at the workspace that was named", async () => {
        const { userId, workspaceId } = await seedUser();
        const access = await grantToken(userId, [workspaceId]);
        const res = await asClient(
            access,
            `/api/v1/artifacts/${randomUUID()}?workspace=${randomUUID()}`,
            { method: "DELETE" },
        );
        expect(res.status).toBe(403);
    });

    it("refuses a workspace the grant does not cover instead of falling back to the default", async () => {
        const { userId, workspaceId } = await seedUser();
        const outside = await secondWorkspace(userId, "Not in the grant");
        const access = await grantToken(userId, [workspaceId]);
        const res = await asClient(access, `/api/v1/artifacts?workspace=${outside}`);
        expect(res.status).toBe(400);
        expect((await answer(res)).error).toMatch(/not granted access/);
    });

    it("acts in the workspace the caller names, when the grant covers it", async () => {
        const { userId, workspaceId } = await seedUser();
        const other = await secondWorkspace(userId, "Second WS");
        const access = await grantToken(
            userId,
            [workspaceId, other],
            "artifacts:read artifacts:write",
        );
        const made = await answer(
            await asClient(
                access,
                `/api/v1/artifacts?workspace=${other}`,
                jsonInit("POST", { title: "Filed elsewhere", content: deck("Filed elsewhere") }),
            ),
        );
        expect(made.workspace).toEqual({ id: other, name: "Second WS" });

        const there = await answer(await asClient(access, `/api/v1/artifacts?workspace=${other}`));
        expect((there.data as { id: string }[]).map((h) => h.id)).toEqual([made.artifact]);
        // and the default is untouched by a call that named another one
        const home = await answer(await asClient(access, "/api/v1/artifacts"));
        expect(home.data).toEqual([]);
    });

    it("answers a create whose body is not an artifact as a bad request", async () => {
        const { userId, workspaceId } = await seedUser();
        const access = await grantToken(userId, [workspaceId], "artifacts:read artifacts:write");
        const res = await asClient(
            access,
            "/api/v1/artifacts",
            jsonInit("POST", { title: "No content" }),
        );
        expect(res.status).toBe(400);
        expect((await answer(res)).error).toMatch(/required/);
    });

    it("answers a generate with no prompt as a bad request", async () => {
        const { userId, workspaceId } = await seedUser();
        const access = await grantToken(userId, [workspaceId], "artifacts:read artifacts:write");
        const res = await asClient(access, "/api/v1/artifacts/generate", jsonInit("POST", {}));
        expect(res.status).toBe(400);
        expect((await answer(res)).error).toMatch(/prompt/);
    });

    // No model provider is configured in this suite, so generation reaches one and throws. What is
    // asserted is the envelope: a thrown body comes back as JSON with a status, the way MCP returns
    // one inside its own envelope, rather than as the bare text Hono answers an escaped throw with.
    it("answers a tool body that throws as JSON rather than letting it escape", async () => {
        const { userId, workspaceId } = await seedUser();
        const access = await grantToken(userId, [workspaceId], "artifacts:read artifacts:write");
        const res = await asClient(
            access,
            "/api/v1/artifacts/generate",
            jsonInit("POST", { prompt: "a short deck about kestrels" }),
        );
        expect(res.status).toBe(500);
        expect(res.headers.get("content-type")).toMatch(/application\/json/);
        expect(typeof (await answer(res)).error).toBe("string");
    });
});

describe("writing through the v1 API", () => {
    beforeEach(async () => {
        await resetDb();
    });

    it("creates an artifact and moves the same one to trash", async () => {
        const { userId, workspaceId } = await seedUser();
        const access = await grantToken(
            userId,
            [workspaceId],
            "artifacts:read artifacts:write artifacts:delete",
        );
        const created = await asClient(
            access,
            "/api/v1/artifacts",
            jsonInit("POST", { title: "Wire report", content: deck("Wire report") }),
        );
        expect(created.status).toBe(200);
        const id = (await answer(created)).artifact!;
        const [row] = await db.select().from(schema.artifacts).where(eq(schema.artifacts.id, id));
        expect(row!.title).toBe("Wire report");
        expect(row!.workspaceId).toBe(workspaceId);

        const gone = await asClient(access, `/api/v1/artifacts/${id}`, { method: "DELETE" });
        expect(gone.status).toBe(200);
        const [after] = await db.select().from(schema.artifacts).where(eq(schema.artifacts.id, id));
        expect(after!.trashedAt).not.toBe(null);
        // and the library stops offering it
        expect((await answer(await asClient(access, "/api/v1/artifacts"))).data).toEqual([]);
    });

    // The delete used to answer 200 with the action it would have taken, because performing one
    // ignored what the update reported. Nothing moved, so nothing is what it has to say.
    it("answers a delete that moved no row with 404", async () => {
        const { userId, workspaceId } = await seedUser();
        const access = await grantToken(userId, [workspaceId], "artifacts:read artifacts:delete");
        const res = await asClient(access, `/api/v1/artifacts/${randomUUID()}`, {
            method: "DELETE",
        });
        expect(res.status).toBe(404);
        expect((await answer(res)).error).toBe("That artifact was not found.");
    });
});

// The ceiling on this surface, and the reason it is one bucket rather than two: /mcp and /api/v1
// take the same credential and run the same executor, so a caller cannot hold a budget at each door.
describe("the ceiling on the delegated surface", () => {
    beforeEach(async () => {
        await resetDb();
    });

    it("stops one caller past the ceiling, and spends the same budget over MCP", async () => {
        const ip = "10.55.0.1";
        let last: Response | undefined;
        for (let i = 0; i < 241; i++) last = await api("/api/v1/templates", fromIp(ip));
        expect(last!.status).toBe(429);
        expect(last!.headers.get("retry-after")).toBeTruthy();

        const overMcp = await request(
            "/mcp",
            fromIp(ip, jsonInit("POST", { jsonrpc: "2.0", id: 1, method: "ping" })),
        );
        expect(overMcp.status).toBe(429);
        // and another caller is untouched by it
        expect((await api("/api/v1/templates", unlimited())).status).toBe(200);
    });
});
