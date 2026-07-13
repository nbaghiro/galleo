import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { authed, jsonInit, request, seedUser } from "../../test/harness";
import { db, schema } from "../../schema";

// Integration: the public sharing routes. Publishing is a paid feature (free plan can't), so most tests
// seed a `pro` workspace; the unauthenticated /p/:slug/content surface is driven with the plain `request`
// helper (no cookie). Mail is unconfigured, so invite sends are silent no-ops — publishing still succeeds.

const CONTENT = { format: "deck", theme: "studio", sections: [] };

// A live artifact owned by `workspaceId`, with a readable draftContent.
async function insertArtifact(
    workspaceId: string,
    content: unknown = CONTENT,
    over: Partial<typeof schema.artifacts.$inferInsert> = {},
): Promise<string> {
    const [a] = await db
        .insert(schema.artifacts)
        .values({
            workspaceId,
            formatId: "deck",
            themeId: "studio",
            draftContent: content as typeof schema.artifacts.$inferInsert.draftContent,
            ...over,
        })
        .returning({ id: schema.artifacts.id });
    return a!.id;
}

const versionCount = async (artifactId: string): Promise<number> =>
    (
        await db
            .select({ id: schema.versions.id })
            .from(schema.versions)
            .where(eq(schema.versions.artifactId, artifactId))
    ).length;

describe("publish — version reuse vs snapshot", () => {
    it("reuses the current version when content is unchanged, snapshots a new one after an edit", async () => {
        const { userId, workspaceId } = await seedUser({ plan: "pro" });
        const id = await insertArtifact(workspaceId);

        const first = await authed(userId, `/artifacts/${id}/publish`, jsonInit("POST", {}));
        expect(first.status).toBe(200);
        expect(await versionCount(id)).toBe(1);
        const [afterFirst] = await db
            .select({ v: schema.artifacts.publishedVersionId })
            .from(schema.artifacts)
            .where(eq(schema.artifacts.id, id));
        const v1 = afterFirst!.v;
        expect(v1).toBeTruthy();

        // Re-publish, content unchanged → reuse the same version row (no history bloat).
        const again = await authed(userId, `/artifacts/${id}/publish`, jsonInit("POST", {}));
        expect(again.status).toBe(200);
        expect(await versionCount(id)).toBe(1);

        // Edit the draft, then publish → a brand-new snapshot the link now points at.
        await db
            .update(schema.artifacts)
            .set({
                draftContent: {
                    format: "deck",
                    theme: "studio",
                    sections: [
                        { id: "s1", root: { type: "text", data: { text: "new", style: "h1" } } },
                    ],
                } as typeof schema.artifacts.$inferInsert.draftContent,
            })
            .where(eq(schema.artifacts.id, id));

        const third = await authed(userId, `/artifacts/${id}/publish`, jsonInit("POST", {}));
        expect(third.status).toBe(200);
        expect(await versionCount(id)).toBe(2);
        const [afterEdit] = await db
            .select({ v: schema.artifacts.publishedVersionId })
            .from(schema.artifacts)
            .where(eq(schema.artifacts.id, id));
        expect(afterEdit!.v).toBeTruthy();
        expect(afterEdit!.v).not.toBe(v1);
    });

    it("blocks publishing on a plan without public links (402, upgrade:true)", async () => {
        const { userId, workspaceId } = await seedUser({ plan: "free" });
        const id = await insertArtifact(workspaceId);
        const res = await authed(userId, `/artifacts/${id}/publish`, jsonInit("POST", {}));
        expect(res.status).toBe(402);
        expect(((await res.json()) as { upgrade?: boolean }).upgrade).toBe(true);
    });
});

describe("public read — GET /p/:slug/content access policy", () => {
    // Publish an artifact and return its slug (+ ids) for the anonymous read tests.
    async function publish(
        body: Record<string, unknown>,
        opts: { plan?: string; overrides?: unknown } = {},
    ): Promise<{ slug: string; artifactId: string; userId: string; workspaceId: string }> {
        const { userId, workspaceId } = await seedUser({ plan: opts.plan ?? "pro" });
        if (opts.overrides)
            await db
                .update(schema.workspaces)
                .set({
                    featureOverrides:
                        opts.overrides as typeof schema.workspaces.$inferInsert.featureOverrides,
                })
                .where(eq(schema.workspaces.id, workspaceId));
        const artifactId = await insertArtifact(workspaceId);
        const res = await authed(
            userId,
            `/artifacts/${artifactId}/publish`,
            jsonInit("POST", body),
        );
        expect(res.status).toBe(200);
        const { slug } = (await res.json()) as { slug: string };
        return { slug, artifactId, userId, workspaceId };
    }

    it("404s (never reveals) for an unknown slug", async () => {
        const res = await request("/p/does-not-exist/content");
        expect(res.status).toBe(404);
    });

    it("404s once the owning artifact is trashed", async () => {
        const { slug, artifactId } = await publish({ visibility: "public" });
        // Live → readable.
        expect((await request(`/p/${slug}/content`)).status).toBe(200);
        // Trash it → the link goes dark.
        await db
            .update(schema.artifacts)
            .set({ trashedAt: new Date() })
            .where(eq(schema.artifacts.id, artifactId));
        expect((await request(`/p/${slug}/content`)).status).toBe(404);
    });

    it("protected: 401 needsPassword without/with a wrong password, 200 with the right one", async () => {
        const { slug } = await publish({ visibility: "protected", password: "s3cret-pw" });

        const noPw = await request(`/p/${slug}/content`);
        expect(noPw.status).toBe(401);
        expect(((await noPw.json()) as { needsPassword?: boolean }).needsPassword).toBe(true);

        const wrong = await request(`/p/${slug}/content?pw=nope`);
        expect(wrong.status).toBe(401);

        const right = await request(`/p/${slug}/content?pw=s3cret-pw`);
        expect(right.status).toBe(200);
        const body = (await right.json()) as { content: { format: string } };
        expect(body.content.format).toBe("deck");
    });

    it("protected: locks out with 429 after the wrong-guess threshold", async () => {
        const { slug } = await publish({ visibility: "protected", password: "s3cret-pw" });
        // PW_MAX_FAILS = 8 counted wrong guesses; the 9th attempt is locked.
        for (let i = 0; i < 8; i++) {
            const res = await request(`/p/${slug}/content?pw=wrong`);
            expect(res.status).toBe(401);
        }
        const locked = await request(`/p/${slug}/content?pw=wrong`);
        expect(locked.status).toBe(429);
        expect(((await locked.json()) as { needsPassword?: boolean }).needsPassword).toBe(true);
    });

    it("private: 404 without a token, 200 with a valid recipient token", async () => {
        const { slug, artifactId } = await publish({
            visibility: "private",
            recipients: ["friend@example.com"],
        });

        // Resolve the link + its recipient token straight from the DB.
        const [link] = await db
            .select({ id: schema.links.id })
            .from(schema.links)
            .where(eq(schema.links.artifactId, artifactId));
        const [rec] = await db
            .select({ token: schema.linkRecipients.token })
            .from(schema.linkRecipients)
            .where(eq(schema.linkRecipients.linkId, link!.id));
        expect(rec!.token).toBeTruthy();

        expect((await request(`/p/${slug}/content`)).status).toBe(404);
        expect((await request(`/p/${slug}/content?k=not-a-real-token`)).status).toBe(404);
        expect((await request(`/p/${slug}/content?k=${rec!.token}`)).status).toBe(200);
    });

    it("branded flag reflects the owner's removeBranding grant", async () => {
        // Pro removes branding → branded:false.
        const pro = await publish({ visibility: "public" }, { plan: "pro" });
        const proBody = (await (await request(`/p/${pro.slug}/content`)).json()) as {
            branded: boolean;
        };
        expect(proBody.branded).toBe(false);

        // A free workspace granted publicLinks (but not removeBranding) via an override → branded:true.
        const free = await publish(
            { visibility: "public" },
            { plan: "free", overrides: { publicLinks: true } },
        );
        const freeBody = (await (await request(`/p/${free.slug}/content`)).json()) as {
            branded: boolean;
        };
        expect(freeBody.branded).toBe(true);
    });
});
