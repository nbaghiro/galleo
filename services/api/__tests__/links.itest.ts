import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { authed, jsonInit, request, seedUser } from "@services/__tests__/harness";
import { db } from "@services/db/client";
import { schema } from "@services/db/schema";

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

interface LinkJson {
    id: string;
    slug: string;
    name: string | null;
    visibility: string;
    hasPassword: boolean;
    url: string;
    viewCount: number;
    lastViewedAt: string | null;
    recipients: { id: string; email: string; url: string; lastViewedAt: string | null }[];
}

async function createLink(
    userId: string,
    artifactId: string,
    body: Record<string, unknown> = {},
): Promise<LinkJson> {
    const res = await authed(userId, `/artifacts/${artifactId}/links`, jsonInit("POST", body));
    expect(res.status).toBe(200);
    return ((await res.json()) as { link: LinkJson }).link;
}

async function artifactLinks(userId: string, artifactId: string): Promise<LinkJson[]> {
    const res = await authed(userId, `/artifacts/${artifactId}/links`);
    expect(res.status).toBe(200);
    return ((await res.json()) as { links: LinkJson[] }).links;
}

async function seedShared(
    body: Record<string, unknown> = {},
    plan = "pro",
): Promise<{
    userId: string;
    workspaceId: string;
    artifactId: string;
    slug: string;
    linkId: string;
}> {
    const { userId, workspaceId } = await seedUser({ plan });
    const artifactId = await insertArtifact(workspaceId);
    const link = await createLink(userId, artifactId, body);
    return { userId, workspaceId, artifactId, slug: link.slug, linkId: link.id };
}

// distinct UAs → distinct cookieless view sessions (the key hashes day|ip|ua|link)
const UA_DESKTOP = { headers: { "user-agent": "Mozilla/5.0 (Macintosh) TestBrowser/1.0" } };
const UA_MOBILE = { headers: { "user-agent": "Mozilla/5.0 (iPhone; Mobile) TestBrowser/2.0" } };

describe("create links — POST /artifacts/:id/links", () => {
    it("serves the live draft: edits show on the public URL with no republish", async () => {
        const { userId, workspaceId } = await seedUser({ plan: "pro" });
        const id = await insertArtifact(workspaceId);
        const link = await createLink(userId, id);

        const before = (await (await request(`/p/${link.slug}/content`)).json()) as {
            content: { sections: unknown[] };
        };
        expect(before.content.sections).toHaveLength(0);

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

        const after = (await (await request(`/p/${link.slug}/content`)).json()) as {
            content: { sections: unknown[] };
        };
        expect(after.content.sections).toHaveLength(1);
    });

    it("creates many links per artifact, each with its own slug and policy", async () => {
        const { userId, workspaceId } = await seedUser({ plan: "pro" });
        const id = await insertArtifact(workspaceId);

        const pub = await createLink(userId, id, { name: "Twitter", visibility: "public" });
        const prot = await createLink(userId, id, {
            visibility: "protected",
            password: "pw-secret",
        });
        const priv = await createLink(userId, id, {
            visibility: "private",
            recipients: ["friend@example.com"],
        });

        expect(new Set([pub.slug, prot.slug, priv.slug]).size).toBe(3);

        const list = await artifactLinks(userId, id);
        expect(list).toHaveLength(3);
        expect(list.map((l) => l.id)).toEqual([priv.id, prot.id, pub.id]); // newest first

        expect((await request(`/p/${pub.slug}/content`)).status).toBe(200);
        expect((await request(`/p/${prot.slug}/content`)).status).toBe(401);
        expect((await request(`/p/${prot.slug}/content?pw=pw-secret`)).status).toBe(200);
        expect((await request(`/p/${priv.slug}/content`)).status).toBe(404);
        const token = priv.recipients[0]!.url.split("?k=")[1];
        expect((await request(`/p/${priv.slug}/content?k=${token}`)).status).toBe(200);
    });

    it("stores a trimmed name; missing/blank name is null", async () => {
        const { userId, workspaceId } = await seedUser({ plan: "pro" });
        const id = await insertArtifact(workspaceId);
        const named = await createLink(userId, id, { name: "  Investor update  " });
        expect(named.name).toBe("Investor update");
        const bare = await createLink(userId, id, { name: "   " });
        expect(bare.name).toBeNull();
    });

    it("requires a password for a protected link (400)", async () => {
        const { userId, workspaceId } = await seedUser({ plan: "pro" });
        const id = await insertArtifact(workspaceId);
        const res = await authed(
            userId,
            `/artifacts/${id}/links`,
            jsonInit("POST", { visibility: "protected" }),
        );
        expect(res.status).toBe(400);
    });

    it("blocks creating links on a plan without public links (402, upgrade:true)", async () => {
        const { userId, workspaceId } = await seedUser({ plan: "free" });
        const id = await insertArtifact(workspaceId);
        const res = await authed(userId, `/artifacts/${id}/links`, jsonInit("POST", {}));
        expect(res.status).toBe(402);
        expect(((await res.json()) as { upgrade?: boolean }).upgrade).toBe(true);
    });

    it("404s for an artifact in another workspace", async () => {
        const { workspaceId } = await seedUser({ plan: "pro" });
        const id = await insertArtifact(workspaceId);
        const stranger = await seedUser({ plan: "pro" });
        const res = await authed(stranger.userId, `/artifacts/${id}/links`, jsonInit("POST", {}));
        expect(res.status).toBe(404);
    });
});

describe("public read — GET /p/:slug/content access policy", () => {
    it("404s (never reveals) for an unknown slug", async () => {
        const res = await request("/p/does-not-exist/content");
        expect(res.status).toBe(404);
    });

    it("404s once the owning artifact is trashed", async () => {
        const { slug, artifactId } = await seedShared({ visibility: "public" });
        expect((await request(`/p/${slug}/content`)).status).toBe(200);
        await db
            .update(schema.artifacts)
            .set({ trashedAt: new Date() })
            .where(eq(schema.artifacts.id, artifactId));
        expect((await request(`/p/${slug}/content`)).status).toBe(404);
    });

    it("protected: 401 needsPassword without/with a wrong password, 200 with the right one", async () => {
        const { slug } = await seedShared({ visibility: "protected", password: "s3cret-pw" });

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
        const { slug } = await seedShared({ visibility: "protected", password: "s3cret-pw" });
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
        const { userId, slug, artifactId } = await seedShared({
            visibility: "private",
            recipients: ["friend@example.com"],
        });

        const [link] = await artifactLinks(userId, artifactId);
        const token = link!.recipients[0]!.url.split("?k=")[1];
        expect(token).toBeTruthy();

        expect((await request(`/p/${slug}/content`)).status).toBe(404);
        expect((await request(`/p/${slug}/content?k=not-a-real-token`)).status).toBe(404);
        expect((await request(`/p/${slug}/content?k=${token}`)).status).toBe(200);
    });

    it("branded flag reflects the owner's removeBranding grant", async () => {
        const pro = await seedShared({ visibility: "public" });
        const proBody = (await (await request(`/p/${pro.slug}/content`)).json()) as {
            branded: boolean;
        };
        expect(proBody.branded).toBe(false);

        // free workspace: publicLinks override, no removeBranding → branded:true
        const free = await seedUser({ plan: "free" });
        await db
            .update(schema.workspaces)
            .set({
                featureOverrides: {
                    publicLinks: true,
                } as typeof schema.workspaces.$inferInsert.featureOverrides,
            })
            .where(eq(schema.workspaces.id, free.workspaceId));
        const freeArtifact = await insertArtifact(free.workspaceId);
        const freeLink = await createLink(free.userId, freeArtifact);
        const freeBody = (await (await request(`/p/${freeLink.slug}/content`)).json()) as {
            branded: boolean;
        };
        expect(freeBody.branded).toBe(true);
    });
});

describe("view analytics — sessions in link_views", () => {
    it("dedups same-viewer reloads into one view; a distinct viewer adds another", async () => {
        const { userId, artifactId, slug, linkId } = await seedShared({ visibility: "public" });

        expect((await request(`/p/${slug}/content`, UA_DESKTOP)).status).toBe(200);
        expect((await request(`/p/${slug}/content`, UA_DESKTOP)).status).toBe(200);
        let [link] = await artifactLinks(userId, artifactId);
        expect(link!.viewCount).toBe(1);

        expect((await request(`/p/${slug}/content`, UA_MOBILE)).status).toBe(200);
        [link] = await artifactLinks(userId, artifactId);
        expect(link!.viewCount).toBe(2);
        expect(link!.lastViewedAt).toBeTruthy();

        const { links } = (await (await authed(userId, "/links")).json()) as {
            links: { id: string; viewCount: number }[];
        };
        expect(links.find((l) => l.id === linkId)!.viewCount).toBe(2);
    });

    it("owner previews are never logged", async () => {
        const { userId, artifactId, slug } = await seedShared({ visibility: "public" });
        expect((await authed(userId, `/p/${slug}/content`)).status).toBe(200);
        const [link] = await artifactLinks(userId, artifactId);
        expect(link!.viewCount).toBe(0);
    });

    it("gated protected reads don't count as views", async () => {
        const { userId, artifactId, slug } = await seedShared({
            visibility: "protected",
            password: "pw-secret",
        });
        expect((await request(`/p/${slug}/content`)).status).toBe(401);
        expect((await request(`/p/${slug}/content?pw=nope`)).status).toBe(401);
        const [link] = await artifactLinks(userId, artifactId);
        expect(link!.viewCount).toBe(0);
    });

    it("private views record the recipient, stamp lastViewedAt, and dedup reloads", async () => {
        const { userId, artifactId, slug, linkId } = await seedShared({
            visibility: "private",
            recipients: ["friend@example.com"],
        });
        const [before] = await artifactLinks(userId, artifactId);
        const rec = before!.recipients[0]!;
        expect(rec.lastViewedAt).toBeNull();

        const token = rec.url.split("?k=")[1];
        expect((await request(`/p/${slug}/content?k=${token}`, UA_DESKTOP)).status).toBe(200);
        expect((await request(`/p/${slug}/content?k=${token}`, UA_DESKTOP)).status).toBe(200);

        const [after] = await artifactLinks(userId, artifactId);
        expect(after!.viewCount).toBe(1);
        expect(after!.recipients[0]!.lastViewedAt).toBeTruthy();

        const views = await db
            .select()
            .from(schema.linkViews)
            .where(eq(schema.linkViews.linkId, linkId));
        expect(views).toHaveLength(1);
        expect(views[0]!.recipientId).toBe(rec.id);
        expect(views[0]!.sessionKey).toBeTruthy();
    });
});

describe("analytics endpoint + heartbeat", () => {
    const today = (): string => new Date().toISOString().slice(0, 10);

    it("GET /links/:id/analytics 402s without the analytics entitlement", async () => {
        const { userId, linkId } = await seedShared({ visibility: "public" }); // pro plan
        const res = await authed(userId, `/links/${linkId}/analytics`);
        expect(res.status).toBe(402);
        expect(((await res.json()) as { upgrade?: boolean }).upgrade).toBe(true);
    });

    it("404s for a foreign link", async () => {
        const { linkId } = await seedShared({ visibility: "public" }, "premium");
        const stranger = await seedUser({ plan: "premium" });
        const res = await authed(stranger.userId, `/links/${linkId}/analytics`);
        expect(res.status).toBe(404);
    });

    it("reports totals, daily buckets, referrers, and devices", async () => {
        const { userId, slug, linkId } = await seedShared({ visibility: "public" }, "premium");

        const ref = encodeURIComponent("https://twitter.com/galleo/status/1");
        expect((await request(`/p/${slug}/content?ref=${ref}`, UA_DESKTOP)).status).toBe(200);
        expect((await request(`/p/${slug}/content`, UA_MOBILE)).status).toBe(200);

        const res = await authed(userId, `/links/${linkId}/analytics`);
        expect(res.status).toBe(200);
        const data = (await res.json()) as {
            totals: { views: number; lastViewedAt: string | null };
            days: { day: string; views: number }[];
            referrers: { source: string; views: number }[];
            devices: { device: string; views: number }[];
        };
        expect(data.totals.views).toBe(2);
        expect(data.totals.lastViewedAt).toBeTruthy();
        expect(data.days).toEqual([{ day: today(), views: 2 }]);
        expect(data.referrers).toContainEqual({ source: "twitter.com", views: 1 });
        expect(data.referrers).toContainEqual({ source: "direct", views: 1 });
        expect(data.devices).toContainEqual({ device: "desktop", views: 1 });
        expect(data.devices).toContainEqual({ device: "mobile", views: 1 });
    });

    it("heartbeat pings record duration and read depth for an existing session only", async () => {
        const { userId, slug, linkId } = await seedShared({ visibility: "public" }, "premium");
        expect((await request(`/p/${slug}/content`, UA_DESKTOP)).status).toBe(200);

        const ping = await request(`/p/${slug}/ping`, {
            method: "POST",
            headers: { ...UA_DESKTOP.headers, "Content-Type": "application/json" },
            body: JSON.stringify({ u: 3, t: 8 }),
        });
        expect(ping.status).toBe(200);

        const data = (await (await authed(userId, `/links/${linkId}/analytics`)).json()) as {
            totals: { views: number; avgSeconds: number | null; completionPct: number | null };
        };
        expect(data.totals.views).toBe(1);
        expect(data.totals.avgSeconds).not.toBeNull();
        expect(data.totals.completionPct).toBe(50); // (3+1)/8

        // a ping from a viewer with no prior read creates nothing
        await request(`/p/${slug}/ping`, {
            method: "POST",
            headers: { ...UA_MOBILE.headers, "Content-Type": "application/json" },
            body: JSON.stringify({ u: 7, t: 8 }),
        });
        const after = (await (await authed(userId, `/links/${linkId}/analytics`)).json()) as {
            totals: { views: number };
        };
        expect(after.totals.views).toBe(1);

        // unknown slug never reveals anything
        expect((await request(`/p/nope/ping`, { method: "POST" })).status).toBe(200);
    });

    it("GET /artifacts/:id/analytics aggregates across the artifact's links", async () => {
        const { userId, workspaceId, artifactId, slug } = await seedShared(
            { visibility: "public" },
            "premium",
        );
        const second = await createLink(userId, artifactId, { visibility: "public" });
        expect((await request(`/p/${slug}/content`, UA_DESKTOP)).status).toBe(200);
        expect((await request(`/p/${second.slug}/content`, UA_MOBILE)).status).toBe(200);

        const res = await authed(userId, `/artifacts/${artifactId}/analytics`);
        expect(res.status).toBe(200);
        const data = (await res.json()) as {
            totals: { views: number };
            days: { day: string; views: number }[];
            devices: { device: string; views: number }[];
        };
        expect(data.totals.views).toBe(2);
        expect(data.days).toEqual([{ day: today(), views: 2 }]);
        expect(data.devices).toContainEqual({ device: "desktop", views: 1 });
        expect(data.devices).toContainEqual({ device: "mobile", views: 1 });

        // an artifact with no links reports empty analytics
        const bare = await insertArtifact(workspaceId);
        const empty = (await (await authed(userId, `/artifacts/${bare}/analytics`)).json()) as {
            totals: { views: number };
        };
        expect(empty.totals.views).toBe(0);

        // same gate + tenancy rules as the per-link route
        const pro = await seedShared({ visibility: "public" });
        expect((await authed(pro.userId, `/artifacts/${pro.artifactId}/analytics`)).status).toBe(
            402,
        );
        const stranger = await seedUser({ plan: "premium" });
        expect((await authed(stranger.userId, `/artifacts/${artifactId}/analytics`)).status).toBe(
            404,
        );
    });

    it("private analytics lists per-recipient engagement", async () => {
        const { userId, artifactId, slug, linkId } = await seedShared(
            { visibility: "private", recipients: ["friend@example.com"] },
            "premium",
        );
        const [link] = await artifactLinks(userId, artifactId);
        const rec = link!.recipients[0]!;
        const token = rec.url.split("?k=")[1];

        expect((await request(`/p/${slug}/content?k=${token}`, UA_DESKTOP)).status).toBe(200);
        await request(`/p/${slug}/ping`, {
            method: "POST",
            headers: { ...UA_DESKTOP.headers, "Content-Type": "application/json" },
            body: JSON.stringify({ u: 1, t: 4 }),
        });

        const data = (await (await authed(userId, `/links/${linkId}/analytics`)).json()) as {
            recipients?: {
                id: string;
                email: string;
                views: number;
                lastViewedAt: string | null;
                completionPct: number | null;
            }[];
        };
        expect(data.recipients).toHaveLength(1);
        expect(data.recipients![0]!.email).toBe("friend@example.com");
        expect(data.recipients![0]!.views).toBe(1);
        expect(data.recipients![0]!.completionPct).toBe(50); // (1+1)/4
        expect(data.recipients![0]!.lastViewedAt).toBeTruthy();
    });
});

describe("link management — list / update / recipients / delete", () => {
    it("GET /links lists the workspace's links with names, views, and recipient counts", async () => {
        const { userId, workspaceId, artifactId, linkId } = await seedShared({
            name: "Homepage",
            visibility: "public",
        });
        await createLink(userId, artifactId, { visibility: "public" }); // second link, same artifact
        const a2 = await insertArtifact(workspaceId);
        await createLink(userId, a2, { visibility: "public" });
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
            links: {
                id: string;
                name: string | null;
                url: string;
                recipientCount: number;
                openedCount: number;
                viewCount: number;
            }[];
        };
        expect(links).toHaveLength(3);
        const first = links.find((l) => l.id === linkId)!;
        expect(first.name).toBe("Homepage");
        expect(first.recipientCount).toBe(1);
        expect(first.openedCount).toBe(1);
        expect(first.viewCount).toBe(0);
        expect(first.url).toContain("/p/");
    });

    it("GET /links excludes trashed artifacts' links", async () => {
        const { userId, artifactId } = await seedShared({ visibility: "public" });
        await db
            .update(schema.artifacts)
            .set({ trashedAt: new Date() })
            .where(eq(schema.artifacts.id, artifactId));
        const { links } = (await (await authed(userId, "/links")).json()) as { links: unknown[] };
        expect(links).toHaveLength(0);
    });

    it("GET /artifacts/:id/links 404s for a foreign artifact", async () => {
        const { artifactId } = await seedShared({ visibility: "public" });
        const stranger = await seedUser({ plan: "pro" });
        const res = await authed(stranger.userId, `/artifacts/${artifactId}/links`);
        expect(res.status).toBe(404);
    });

    it("PATCH /links/:id switches visibility and manages the password", async () => {
        const { userId, linkId } = await seedShared({ visibility: "public" });

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

    it("PATCH /links/:id renames: sets, keeps when omitted, clears on null", async () => {
        const { userId, linkId } = await seedShared({ visibility: "public" });

        const named = await authed(
            userId,
            `/links/${linkId}`,
            jsonInit("PATCH", { name: "Board deck" }),
        );
        expect(((await named.json()) as { link: { name: string | null } }).link.name).toBe(
            "Board deck",
        );

        const kept = await authed(
            userId,
            `/links/${linkId}`,
            jsonInit("PATCH", { visibility: "public" }),
        );
        expect(((await kept.json()) as { link: { name: string | null } }).link.name).toBe(
            "Board deck",
        );

        const cleared = await authed(userId, `/links/${linkId}`, jsonInit("PATCH", { name: null }));
        expect(((await cleared.json()) as { link: { name: string | null } }).link.name).toBeNull();
    });

    it("PATCH /links/:id 404s for a link in another workspace", async () => {
        const { linkId } = await seedShared({ visibility: "public" });
        const stranger = await seedUser({ plan: "pro" });
        const res = await authed(
            stranger.userId,
            `/links/${linkId}`,
            jsonInit("PATCH", { visibility: "public" }),
        );
        expect(res.status).toBe(404);
    });

    it("POST /links/:id/recipients adds unique recipients and dedups repeats", async () => {
        const { userId, linkId } = await seedShared({ visibility: "private" });

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
        const { userId, linkId } = await seedShared({ visibility: "private" });
        const res = await authed(
            userId,
            `/links/${linkId}/recipients`,
            jsonInit("POST", { emails: ["nope"] }),
        );
        expect(res.status).toBe(400);
    });

    it("DELETE /links/:id/recipients/:rid removes a single recipient", async () => {
        const { userId, linkId } = await seedShared({ visibility: "private" });
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

    it("DELETE /links/:id takes that URL dark but leaves the artifact's other links live", async () => {
        const { userId, artifactId, slug, linkId } = await seedShared({ visibility: "public" });
        const sibling = await createLink(userId, artifactId, { visibility: "public" });
        expect((await request(`/p/${slug}/content`)).status).toBe(200);

        const res = await authed(userId, `/links/${linkId}`, jsonInit("DELETE", {}));
        expect(res.status).toBe(200);

        expect((await request(`/p/${slug}/content`)).status).toBe(404);
        expect((await request(`/p/${sibling.slug}/content`)).status).toBe(200);
        expect(await artifactLinks(userId, artifactId)).toHaveLength(1);
    });

    it("DELETE /links/:id 404s for a foreign link", async () => {
        const { linkId } = await seedShared({ visibility: "public" });
        const stranger = await seedUser({ plan: "pro" });
        const res = await authed(stranger.userId, `/links/${linkId}`, jsonInit("DELETE", {}));
        expect(res.status).toBe(404);
    });
});
