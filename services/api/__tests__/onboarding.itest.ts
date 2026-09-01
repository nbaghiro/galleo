import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@services/db/client";
import { schema } from "@services/db/schema";
import { onboardingState } from "@services/core/onboarding";
import { authed, jsonInit, request, seedUser } from "@services/__tests__/harness";

describe("the derived checklist", () => {
    const stateOf = async (u: { workspaceId: string; userId: string }, prefs: unknown = {}) =>
        onboardingState(u.workspaceId, prefs);

    it("starts with nothing done and the flow owed", async () => {
        const u = await seedUser();
        const s = await stateOf(u);
        expect(s.done).toEqual([]);
        expect(s.needed).toBe(true);
    });

    it("counts an artifact as `make`, and an ai_meta artifact as `ai` too", async () => {
        const u = await seedUser();
        const [a] = await db
            .insert(schema.artifacts)
            .values({
                workspaceId: u.workspaceId,
                title: "T",
                createdBy: u.userId,
            })
            .returning();
        expect((await stateOf(u)).done).toEqual(["make"]);

        await db
            .update(schema.artifacts)
            .set({
                aiMeta: { at: new Date().toISOString(), models: {}, prompt: "p", surface: "deck" },
            })
            .where(eq(schema.artifacts.id, a!.id));
        expect((await stateOf(u)).done).toEqual(["make", "ai"]);
    });

    it("ignores a trashed artifact", async () => {
        const u = await seedUser();
        await db.insert(schema.artifacts).values({
            workspaceId: u.workspaceId,
            title: "T",
            createdBy: u.userId,
            trashedAt: new Date(),
        });
        expect((await stateOf(u)).done).toEqual([]);
    });

    it("counts a workspace theme as `theme` and a link as `send`", async () => {
        const u = await seedUser();
        const [a] = await db
            .insert(schema.artifacts)
            .values({
                workspaceId: u.workspaceId,
                title: "T",
                createdBy: u.userId,
            })
            .returning();
        await db
            .insert(schema.themes)
            .values({ workspaceId: u.workspaceId, name: "Ours", tokens: {} });
        await db
            .insert(schema.links)
            .values({ artifactId: a!.id, slug: `s-${u.userId.slice(0, 8)}` });
        const s = await stateOf(u);
        expect(s.done).toEqual(["make", "theme", "send"]);
    });

    // derived, so it is already correct for an account that predates onboarding
    it("reports a pre-existing workspace as not needing the flow", async () => {
        const u = await seedUser();
        await db.insert(schema.artifacts).values({
            workspaceId: u.workspaceId,
            title: "T",
            createdBy: u.userId,
        });
        expect((await stateOf(u)).needed).toBe(false);
    });

    it("reads the format answer and the dismissal out of prefs", async () => {
        const u = await seedUser();
        const s = await stateOf(u, {
            onboarding: { format: "web", dismissed: true, startedAt: "x" },
        });
        expect(s.format).toBe("web");
        expect(s.dismissed).toBe(true);
        expect(s.needed).toBe(false); // startedAt recorded, so the flow has been through
    });
});

describe("GET /onboarding", () => {
    it("answers the state for the caller's active workspace", async () => {
        const u = await seedUser();
        const res = await authed(u.userId, "/onboarding");
        expect(res.status).toBe(200);
        const body = (await res.json()) as { onboarding: { needed: boolean; done: string[] } };
        expect(body.onboarding.needed).toBe(true);
        expect(body.onboarding.done).toEqual([]);
    });

    it("refuses an anonymous caller", async () => {
        expect((await request("/onboarding")).status).toBe(401);
    });

    it("reflects a format written through the prefs route", async () => {
        const u = await seedUser();
        const patch = await authed(
            u.userId,
            "/me/prefs",
            jsonInit("PATCH", {
                onboarding: { format: "doc", startedAt: "2026-08-17T00:00:00.000Z" },
            }),
        );
        expect(patch.status).toBe(200);
        const res = await authed(u.userId, "/onboarding");
        const body = (await res.json()) as { onboarding: { format?: string; needed: boolean } };
        expect(body.onboarding.format).toBe("doc");
        expect(body.onboarding.needed).toBe(false);
    });
});
