import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { authed, jsonInit, request, seedUser } from "../../__tests__/harness";
import { db, schema } from "../../schema";

const CONTENT = { format: "deck", theme: "studio", sections: [] };

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

        const again = await authed(userId, `/artifacts/${id}/publish`, jsonInit("POST", {}));
        expect(again.status).toBe(200);
        expect(await versionCount(id)).toBe(1);

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
        expect((await request(`/p/${slug}/content`)).status).toBe(200);
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
        const pro = await publish({ visibility: "public" }, { plan: "pro" });
        const proBody = (await (await request(`/p/${pro.slug}/content`)).json()) as {
            branded: boolean;
        };
        expect(proBody.branded).toBe(false);

        // free workspace: publicLinks override, no removeBranding → branded:true
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

describe("link management — list / get / update / recipients / unpublish", () => {
    async function publish(body: Record<string, unknown> = {}): Promise<{
        userId: string;
        workspaceId: string;
        artifactId: string;
        slug: string;
        linkId: string;
    }> {
        const { userId, workspaceId } = await seedUser({ plan: "pro" });
        const artifactId = await insertArtifact(workspaceId);
        const res = await authed(
            userId,
            `/artifacts/${artifactId}/publish`,
            jsonInit("POST", body),
        );
        expect(res.status).toBe(200);
        const { slug } = (await res.json()) as { slug: string };
        const [link] = await db
            .select({ id: schema.links.id })
            .from(schema.links)
            .where(eq(schema.links.artifactId, artifactId));
        return { userId, workspaceId, artifactId, slug, linkId: link!.id };
    }

    it("GET /links lists the workspace's published links with recipient counts", async () => {
        const { userId, workspaceId, linkId } = await publish({ visibility: "public" });
        const a2 = await insertArtifact(workspaceId);
        await authed(
            userId,
            `/artifacts/${a2}/publish`,
            jsonInit("POST", { visibility: "public" }),
        );
        // a recipient that has already opened the link → openedCount 1
        await db.insert(schema.linkRecipients).values({
            linkId,
            email: "seen@example.com",
            token: "tok-open",
            lastViewedAt: new Date(),
        });

        const res = await authed(userId, "/links");
        expect(res.status).toBe(200);
        const { links } = (await res.json()) as {
            links: { id: string; url: string; recipientCount: number; openedCount: number }[];
        };
        expect(links).toHaveLength(2);
        const first = links.find((l) => l.id === linkId)!;
        expect(first.recipientCount).toBe(1);
        expect(first.openedCount).toBe(1);
        expect(first.url).toContain("/p/");
    });

    it("GET /links excludes trashed artifacts' links", async () => {
        const { userId, artifactId } = await publish({ visibility: "public" });
        await db
            .update(schema.artifacts)
            .set({ trashedAt: new Date() })
            .where(eq(schema.artifacts.id, artifactId));
        const { links } = (await (await authed(userId, "/links")).json()) as { links: unknown[] };
        expect(links).toHaveLength(0);
    });

    it("GET /links/:artifactId returns the link + recipients; null for a foreign artifact", async () => {
        const { userId, artifactId, linkId } = await publish({
            visibility: "protected",
            password: "pw-secret",
        });
        await db
            .insert(schema.linkRecipients)
            .values({ linkId, email: "r@example.com", token: "tok-r" });

        const res = await authed(userId, `/links/${artifactId}`);
        expect(res.status).toBe(200);
        const { link } = (await res.json()) as {
            link: { hasPassword: boolean; recipients: { email: string }[] } | null;
        };
        expect(link!.hasPassword).toBe(true);
        expect(link!.recipients.map((r) => r.email)).toContain("r@example.com");

        const stranger = await seedUser({ plan: "pro" });
        const foreign = (await (await authed(stranger.userId, `/links/${artifactId}`)).json()) as {
            link: null;
        };
        expect(foreign.link).toBeNull();
    });

    it("PATCH /links/:id switches visibility and manages the password", async () => {
        const { userId, linkId } = await publish({ visibility: "public" });

        // public → protected requires a password
        const noPw = await authed(
            userId,
            `/links/${linkId}`,
            jsonInit("PATCH", { visibility: "protected" }),
        );
        expect(noPw.status).toBe(400);

        const withPw = await authed(
            userId,
            `/links/${linkId}`,
            jsonInit("PATCH", { visibility: "protected", password: "pw-secret" }),
        );
        expect(withPw.status).toBe(200);
        expect(((await withPw.json()) as { link: { hasPassword: boolean } }).link.hasPassword).toBe(
            true,
        );

        // protected → public clears the stored password
        const backPublic = await authed(
            userId,
            `/links/${linkId}`,
            jsonInit("PATCH", { visibility: "public" }),
        );
        const body = (await backPublic.json()) as {
            link: { visibility: string; hasPassword: boolean };
        };
        expect(body.link.visibility).toBe("public");
        expect(body.link.hasPassword).toBe(false);
    });

    it("PATCH /links/:id 404s for a link in another workspace", async () => {
        const { linkId } = await publish({ visibility: "public" });
        const stranger = await seedUser({ plan: "pro" });
        const res = await authed(
            stranger.userId,
            `/links/${linkId}`,
            jsonInit("PATCH", { visibility: "public" }),
        );
        expect(res.status).toBe(404);
    });

    it("POST /links/:id/recipients adds unique recipients and dedups repeats", async () => {
        const { userId, linkId } = await publish({ visibility: "private" });

        const first = await authed(
            userId,
            `/links/${linkId}/recipients`,
            jsonInit("POST", { emails: ["Ann@Example.com", " ann@example.com ", "not-an-email"] }),
        );
        expect(first.status).toBe(200);
        const added = (await first.json()) as { recipients: { email: string; url: string }[] };
        expect(added.recipients).toHaveLength(1); // deduped + invalid dropped
        expect(added.recipients[0]!.email).toBe("ann@example.com");
        expect(added.recipients[0]!.url).toContain("?k=");

        // re-inviting the same email is a no-op (onConflictDoNothing)
        const again = await authed(
            userId,
            `/links/${linkId}/recipients`,
            jsonInit("POST", { emails: ["ann@example.com"] }),
        );
        expect(((await again.json()) as { recipients: unknown[] }).recipients).toHaveLength(0);

        const rows = await db
            .select()
            .from(schema.linkRecipients)
            .where(eq(schema.linkRecipients.linkId, linkId));
        expect(rows).toHaveLength(1);
    });

    it("POST /links/:id/recipients 400s when no valid emails are given", async () => {
        const { userId, linkId } = await publish({ visibility: "private" });
        const res = await authed(
            userId,
            `/links/${linkId}/recipients`,
            jsonInit("POST", { emails: ["nope"] }),
        );
        expect(res.status).toBe(400);
    });

    it("DELETE /links/:id/recipients/:rid removes a single recipient", async () => {
        const { userId, linkId } = await publish({ visibility: "private" });
        const [rec] = await db
            .insert(schema.linkRecipients)
            .values({ linkId, email: "gone@example.com", token: "tok-gone" })
            .returning({ id: schema.linkRecipients.id });
        const res = await authed(
            userId,
            `/links/${linkId}/recipients/${rec!.id}`,
            jsonInit("DELETE", {}),
        );
        expect(res.status).toBe(200);
        const rows = await db
            .select()
            .from(schema.linkRecipients)
            .where(eq(schema.linkRecipients.linkId, linkId));
        expect(rows).toHaveLength(0);
    });

    it("POST /artifacts/:id/unpublish deletes the link and takes the public URL dark", async () => {
        const { userId, artifactId, slug } = await publish({ visibility: "public" });
        expect((await request(`/p/${slug}/content`)).status).toBe(200);

        const res = await authed(
            userId,
            `/artifacts/${artifactId}/unpublish`,
            jsonInit("POST", {}),
        );
        expect(res.status).toBe(200);

        expect((await request(`/p/${slug}/content`)).status).toBe(404);
        const rows = await db
            .select()
            .from(schema.links)
            .where(eq(schema.links.artifactId, artifactId));
        expect(rows).toHaveLength(0);
        const [art] = await db
            .select({ v: schema.artifacts.publishedVersionId })
            .from(schema.artifacts)
            .where(eq(schema.artifacts.id, artifactId));
        expect(art!.v).toBeNull();
    });

    it("unpublish 404s for a foreign artifact", async () => {
        const { artifactId } = await publish({ visibility: "public" });
        const stranger = await seedUser({ plan: "pro" });
        const res = await authed(
            stranger.userId,
            `/artifacts/${artifactId}/unpublish`,
            jsonInit("POST", {}),
        );
        expect(res.status).toBe(404);
    });
});
