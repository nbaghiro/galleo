import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { authed, jsonInit, request, seedUser } from "../../test/harness";
import { db, schema } from "../../schema";

// Integration: the AI routes with the model provider UNCONFIGURED (no ANTHROPIC/OPENAI/GOOGLE/XAI key) —
// exactly the seam this tier tests. In every metered AI route the `!aiReady()` guard sits at the very top
// (right after the auth + workspace lookups), so with no key the reachable branches are: 401 (no session),
// 400 (no workspace), and 503 (not configured). The downstream branches — request validation (400 per
// kind), the 501 "not built yet", and the credit gate (402) — all sit AFTER that guard, so they are only
// reachable once a provider key is present (the later, keyed tier). See the report for that gap.

const PROVIDER_KEYS = ["ANTHROPIC_API_KEY", "OPENAI_API_KEY", "GOOGLE_API_KEY", "XAI_API_KEY"];
const saved: Record<string, string | undefined> = {};

// Guarantee the documented "unconfigured" invariant regardless of the runner's shell (removes keys only —
// never fakes the LLM), then restore afterwards so nothing leaks to other files.
beforeAll(() => {
    for (const k of PROVIDER_KEYS) {
        saved[k] = process.env[k];
        delete process.env[k];
    }
});
afterAll(() => {
    for (const k of PROVIDER_KEYS) if (saved[k] !== undefined) process.env[k] = saved[k];
});

const generateBody = jsonInit("POST", { kind: "generate", input: { prompt: "Build a deck" } });

describe("AI routes — unconfigured provider", () => {
    it("POST /ai/turn 401s without a session", async () => {
        const res = await request("/ai/turn", generateBody);
        expect(res.status).toBe(401);
    });

    it("POST /ai/turn 400s for an authed user with no workspace", async () => {
        // A user row with no membership → currentWorkspace() returns null before the aiReady() guard.
        const [u] = await db
            .insert(schema.users)
            .values({ email: "no-ws@test.local", passwordHash: "x:y" })
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
});
