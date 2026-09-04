import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { authed, jsonInit, request, seedUser } from "@services/__tests__/harness";
import { db } from "@services/db/client";
import { schema } from "@services/db/schema";

const PROVIDER_KEYS = ["ANTHROPIC_API_KEY", "OPENAI_API_KEY", "GOOGLE_API_KEY", "XAI_API_KEY"];
const saved: Record<string, string | undefined> = {};

beforeAll(() => {
    for (const k of PROVIDER_KEYS) {
        saved[k] = process.env[k];
        delete process.env[k];
    }
});
afterAll(() => {
    for (const k of PROVIDER_KEYS) if (saved[k] !== undefined) process.env[k] = saved[k];
});

const generateBody = jsonInit("POST", {
    tool: "generate-artifact",
    input: { prompt: "Build a deck" },
});

describe("AI routes — unconfigured provider", () => {
    it("POST /ai/turn 401s without a session", async () => {
        const res = await request("/ai/turn", generateBody);
        expect(res.status).toBe(401);
    });

    it("POST /ai/turn 400s for an authed user with no workspace", async () => {
        // no membership → currentWorkspace() returns null before the aiReady() guard
        const [u] = await db
            .insert(schema.users)
            .values({ email: "no-ws@test.local", passwordHash: "x:y", emailVerifiedAt: new Date() })
            .returning({ id: schema.users.id });
        const res = await authed(u!.id, "/ai/turn", generateBody);
        expect(res.status).toBe(400);
    });

    it("POST /ai/turn 503s when the model provider is not configured", async () => {
        const { userId } = await seedUser();
        const res = await authed(userId, "/ai/turn", generateBody);
        expect(res.status).toBe(503);
        expect(((await res.json()) as { error: string }).error).toMatch(/not configured/i);
    });

    it("POST /ai/element 503s when unconfigured", async () => {
        const { userId } = await seedUser();
        const res = await authed(
            userId,
            "/ai/element",
            jsonInit("POST", {
                content: { format: "deck", theme: "studio", sections: [{ id: "s1", root: {} }] },
                sectionId: "s1",
                element: { type: "text", data: { text: "hi" } },
            }),
        );
        expect(res.status).toBe(503);
    });

    it("POST /ai/text 503s when unconfigured", async () => {
        const { userId } = await seedUser();
        const res = await authed(
            userId,
            "/ai/text",
            jsonInit("POST", { op: "rewrite", text: "hello", instruction: "punchier" }),
        );
        expect(res.status).toBe(503);
    });

    it("POST /ai/refine 503s when unconfigured", async () => {
        const { userId } = await seedUser();
        const res = await authed(
            userId,
            "/ai/refine",
            jsonInit("POST", { prompt: "a solar array", kind: "image" }),
        );
        expect(res.status).toBe(503);
    });

    it("POST /ai/refine 401s without a session", async () => {
        const res = await request("/ai/refine", jsonInit("POST", { prompt: "x", kind: "image" }));
        expect(res.status).toBe(401);
    });

    it("POST /ai/theme 503s when unconfigured", async () => {
        const { userId } = await seedUser();
        const res = await authed(
            userId,
            "/ai/theme",
            jsonInit("POST", { prompt: "a calm ocean theme" }),
        );
        expect(res.status).toBe(503);
    });

    it("POST /ai/suggest degrades to an empty list when unconfigured (200, not 503)", async () => {
        const { userId } = await seedUser();
        const res = await authed(
            userId,
            "/ai/suggest",
            jsonInit("POST", {
                content: { format: "deck", theme: "studio", sections: [{ id: "s1", root: {} }] },
            }),
        );
        expect(res.status).toBe(200);
        expect((await res.json()) as { suggestions: string[] }).toEqual({ suggestions: [] });
    });

    it("POST /ai/suggest 401s without a session", async () => {
        const res = await request("/ai/suggest", jsonInit("POST", {}));
        expect(res.status).toBe(401);
    });

    // The gate runs before the provider check, so who may act on an artifact is answered the same
    // way whether or not this server has a model configured. It also means a caller who cannot see
    // the artifact is not told what the server is running.
    describe("POST /ai/notes decides access before it decides configuration", () => {
        const notesFor = (artifactId: string) =>
            jsonInit("POST", {
                artifactId,
                content: {
                    format: "deck",
                    theme: "studio",
                    sections: [{ id: "s1", root: { type: "container", data: { children: [] } } }],
                },
            });

        it("404s an artifact the caller has no standing on, rather than 503ing", async () => {
            const owner = await seedUser();
            const stranger = await seedUser();
            const [a] = await db
                .insert(schema.artifacts)
                .values({ workspaceId: owner.workspaceId })
                .returning({ id: schema.artifacts.id });
            const res = await authed(stranger.userId, "/ai/notes", notesFor(a!.id));
            expect(res.status).toBe(404);
        });

        // An invited outsider gets through the gate; what stops them here is only the missing
        // provider, which is the same 503 a member would get.
        it("admits a collaborator granted edit from outside the workspace", async () => {
            const owner = await seedUser();
            const guest = await seedUser();
            const [a] = await db
                .insert(schema.artifacts)
                .values({ workspaceId: owner.workspaceId })
                .returning({ id: schema.artifacts.id });
            await db.insert(schema.artifactGrants).values({
                artifactId: a!.id,
                workspaceId: owner.workspaceId,
                email: "notes-guest@test.local",
                userId: guest.userId,
                access: "edit",
            });
            const res = await authed(guest.userId, "/ai/notes", notesFor(a!.id));
            expect(res.status).toBe(503);
        });

        it("refuses a collaborator who may only comment", async () => {
            const owner = await seedUser();
            const guest = await seedUser();
            const [a] = await db
                .insert(schema.artifacts)
                .values({ workspaceId: owner.workspaceId })
                .returning({ id: schema.artifacts.id });
            await db.insert(schema.artifactGrants).values({
                artifactId: a!.id,
                workspaceId: owner.workspaceId,
                email: "notes-reader@test.local",
                userId: guest.userId,
                access: "comment",
            });
            const res = await authed(guest.userId, "/ai/notes", notesFor(a!.id));
            expect(res.status).toBe(403);
        });
    });
});
