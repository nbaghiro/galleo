import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@services/db/client";
import { schema } from "@services/db/schema";
import { SIGNUP_GRANT_CREDITS } from "@model/billing";
import { onboardingState, releaseSignupGrant } from "@services/core/onboarding";
import { authed, jsonInit, request, seedUser } from "@services/__tests__/harness";

const balanceOf = async (workspaceId: string): Promise<number> => {
    const [w] = await db
        .select({ n: schema.workspaces.aiCreditsBalance })
        .from(schema.workspaces)
        .where(eq(schema.workspaces.id, workspaceId));
    return w!.n;
};

const grantRows = async (userId: string): Promise<number> => {
    const rows = await db
        .select({ id: schema.credits.id })
        .from(schema.credits)
        .where(eq(schema.credits.key, `signup:${userId}`));
    return rows.length;
};

describe("the signup grant", () => {
    it("adds the grant to the balance and leaves one ledger row", async () => {
        const u = await seedUser();
        const before = await balanceOf(u.workspaceId);
        expect(await releaseSignupGrant(u.userId)).toBe(true);
        expect(await balanceOf(u.workspaceId)).toBe(before + SIGNUP_GRANT_CREDITS);
        expect(await grantRows(u.userId)).toBe(1);
    });

    // the unique credits.key is what makes this safe; a re-used verify link must not re-pay
    it("pays once however many times it is called", async () => {
        const u = await seedUser();
        const before = await balanceOf(u.workspaceId);
        expect(await releaseSignupGrant(u.userId)).toBe(true);
        expect(await releaseSignupGrant(u.userId)).toBe(false);
        expect(await releaseSignupGrant(u.userId)).toBe(false);
        expect(await balanceOf(u.workspaceId)).toBe(before + SIGNUP_GRANT_CREDITS);
        expect(await grantRows(u.userId)).toBe(1);
    });

    it("survives concurrent calls without double paying", async () => {
        const u = await seedUser();
        const before = await balanceOf(u.workspaceId);
        const results = await Promise.all([
            releaseSignupGrant(u.userId),
            releaseSignupGrant(u.userId),
            releaseSignupGrant(u.userId),
        ]);
        expect(results.filter(Boolean)).toHaveLength(1);
        expect(await balanceOf(u.workspaceId)).toBe(before + SIGNUP_GRANT_CREDITS);
    });

    // the anti-farming rule: keyed on the user, so extra workspaces earn nothing
    it("pays the first owned workspace only, not every workspace a user creates", async () => {
        const u = await seedUser();
        expect(await releaseSignupGrant(u.userId)).toBe(true);
        const [second] = await db
            .insert(schema.workspaces)
            .values({
                name: "Second",
                slug: `ws-second-${u.userId.slice(0, 8)}`,
                ownerId: u.userId,
            })
            .returning();
        expect(await releaseSignupGrant(u.userId)).toBe(false);
        expect(await balanceOf(second!.id)).toBe(0);
    });

    it("does nothing for a user who owns no workspace", async () => {
        const [orphan] = await db
            .insert(schema.users)
            .values({ email: "orphan@test.local" })
            .returning();
        expect(await releaseSignupGrant(orphan!.id)).toBe(false);
        expect(await grantRows(orphan!.id)).toBe(0);
    });
});

describe("the derived checklist", () => {
    const stateOf = async (u: { workspaceId: string; userId: string }, prefs: unknown = {}) =>
        onboardingState(u.workspaceId, u.userId, prefs);

    it("starts with nothing done and the flow owed", async () => {
        const u = await seedUser();
        const s = await stateOf(u);
        expect(s.done).toEqual([]);
        expect(s.needed).toBe(true);
        expect(s.grantReleased).toBe(false);
    });

    it("counts an artifact as `make`, and an ai_meta artifact as `ai` too", async () => {
        const u = await seedUser();
        const [a] = await db
            .insert(schema.artifacts)
            .values({
                workspaceId: u.workspaceId,
                title: "T",
                formatId: "deck",
                themeId: "studio",
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
            formatId: "deck",
            themeId: "studio",
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
                formatId: "deck",
                themeId: "studio",
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
            formatId: "deck",
            themeId: "studio",
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

    it("reports the grant once it is released", async () => {
        const u = await seedUser();
        await releaseSignupGrant(u.userId);
        expect((await stateOf(u)).grantReleased).toBe(true);
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
