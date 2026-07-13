import { Hono } from "hono";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { getCookie } from "hono/cookie";
import { randomBytes } from "node:crypto";
import type { ArtifactContent } from "@model/artifact";
import { can, resolveFeatures } from "@model/features";
import type { PlanId } from "@model/billing";
import { db, schema } from "../schema";
import { SESSION_COOKIE, hashPassword, verifyPassword } from "../auth";
import { featuresFor } from "../features";
import { currentUser, currentWorkspace, firstWorkspaceId, readJson } from "./context";
import { sendShareInvite } from "../mail/send";

// One links row = one published share (visibility: public | protected | private).
export const links = new Hono();

const APP_URL = process.env.APP_URL ?? "http://localhost:8600";
const VISIBILITIES = new Set(["public", "protected", "private"]);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SLUG_ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789"; // no look-alikes (0/o/1/l)

interface PublishBody {
    visibility?: string;
    password?: string | null;
    recipients?: unknown;
    message?: string | null;
}

function newSlug(len = 8): string {
    const b = randomBytes(len);
    let s = "";
    for (let i = 0; i < len; i++) s += SLUG_ALPHABET[b[i]! % SLUG_ALPHABET.length];
    return s;
}

async function uniqueSlug(): Promise<string> {
    for (let i = 0; i < 6; i++) {
        const s = newSlug();
        const [hit] = await db
            .select({ id: schema.links.id })
            .from(schema.links)
            .where(eq(schema.links.slug, s));
        if (!hit) return s;
    }
    return newSlug(14); // vanishingly unlikely to collide
}

// Per-recipient token; possession = access to a private link.
const newToken = (): string => randomBytes(24).toString("base64url");

const publicUrl = (slug: string, token?: string): string =>
    `${APP_URL}/p/${slug}${token ? `?k=${token}` : ""}`;

// In-memory brute-force guard for protected-link passwords; per-process (single node), keyed by slug.
const PW_MAX_FAILS = 8;
const PW_WINDOW_MS = 10 * 60 * 1000;
const pwFails = new Map<string, { count: number; resetAt: number }>();

function pwLocked(slug: string): boolean {
    const e = pwFails.get(slug);
    if (!e) return false;
    if (Date.now() > e.resetAt) {
        pwFails.delete(slug);
        return false;
    }
    return e.count >= PW_MAX_FAILS;
}
function pwFail(slug: string): void {
    const now = Date.now();
    const e = pwFails.get(slug);
    if (!e || now > e.resetAt) pwFails.set(slug, { count: 1, resetAt: now + PW_WINDOW_MS });
    else e.count += 1;
}

// Only protected links carry a hash; keep the existing one when no new password is given (don't wipe on other edits).
function passwordFor(
    visibility: string,
    provided: string | null | undefined,
    existing: string | null,
): string | null {
    if (visibility !== "protected") return null;
    if (provided) return hashPassword(provided);
    return existing;
}

function cleanEmails(raw: unknown): string[] {
    if (!Array.isArray(raw)) return [];
    const seen = new Set<string>();
    for (const e of raw) {
        if (typeof e !== "string") continue;
        const v = e.trim().toLowerCase();
        if (EMAIL_RE.test(v)) seen.add(v);
    }
    return [...seen].slice(0, 100);
}

interface OwnedLink {
    id: string;
    artifactId: string;
    slug: string;
    visibility: string;
    password: string | null;
    publishedVersionId: string | null;
}

// Load a link only if its artifact belongs to the workspace (tenant guard).
async function ownedLink(linkId: string, ws: string): Promise<OwnedLink | null> {
    const [row] = await db
        .select({ link: schema.links, workspaceId: schema.artifacts.workspaceId })
        .from(schema.links)
        .innerJoin(schema.artifacts, eq(schema.links.artifactId, schema.artifacts.id))
        .where(eq(schema.links.id, linkId));
    if (!row || row.workspaceId !== ws) return null;
    return row.link;
}

interface RecipientView {
    id: string;
    email: string;
    url: string;
    invitedAt: Date;
    lastViewedAt: Date | null;
}

async function recipientsOf(linkId: string, slug: string): Promise<RecipientView[]> {
    const rows = await db
        .select()
        .from(schema.linkRecipients)
        .where(eq(schema.linkRecipients.linkId, linkId));
    return rows.map((r) => ({
        id: r.id,
        email: r.email,
        url: publicUrl(slug, r.token),
        invitedAt: r.invitedAt,
        lastViewedAt: r.lastViewedAt,
    }));
}

// Skip already-invited emails; delivery failures never break publishing (URLs returned anyway).
async function addRecipients(
    link: { id: string; slug: string },
    emails: string[],
    message: string | null,
    ctx: { artifactTitle: string; workspaceName: string; inviterName: string | null },
): Promise<RecipientView[]> {
    const added: RecipientView[] = [];
    for (const email of emails) {
        const [rec] = await db
            .insert(schema.linkRecipients)
            .values({ linkId: link.id, email, token: newToken(), message })
            .onConflictDoNothing({
                target: [schema.linkRecipients.linkId, schema.linkRecipients.email],
            })
            .returning();
        if (!rec) continue; // already invited
        const url = publicUrl(link.slug, rec.token);
        await sendShareInvite({
            to: email,
            artifactTitle: ctx.artifactTitle,
            workspaceName: ctx.workspaceName,
            inviterName: ctx.inviterName,
            url,
            message,
        });
        added.push({
            id: rec.id,
            email,
            url,
            invitedAt: rec.invitedAt,
            lastViewedAt: rec.lastViewedAt,
        });
    }
    return added;
}

links.post("/artifacts/:id/publish", async (c) => {
    const u = await currentUser(getCookie(c, SESSION_COOKIE));
    if (!u) return c.json({ error: "unauthorized" }, 401);
    const ws = await currentWorkspace(u.id);
    if (!ws) return c.json({ error: "no workspace" }, 400);
    if (!can(featuresFor(ws), "publicLinks"))
        return c.json({ error: "Public links are a paid feature — upgrade.", upgrade: true }, 402);

    const artifactId = c.req.param("id");
    const [artifact] = await db
        .select()
        .from(schema.artifacts)
        .where(and(eq(schema.artifacts.id, artifactId), eq(schema.artifacts.workspaceId, ws.id)));
    if (!artifact) return c.json({ error: "not found" }, 404);

    const body = await readJson<PublishBody>(c);
    const [existing] = await db
        .select()
        .from(schema.links)
        .where(eq(schema.links.artifactId, artifactId));
    const visibility =
        body.visibility && VISIBILITIES.has(body.visibility)
            ? body.visibility
            : (existing?.visibility ?? "public");
    if (visibility === "protected" && !body.password && !existing?.password)
        return c.json({ error: "A password is required for a protected link." }, 400);

    // Reuse the current published version when the draft is unchanged, so re-publishes don't bloat history.
    let versionId: string | null = null;
    if (existing?.publishedVersionId) {
        const [cur] = await db
            .select({ content: schema.versions.content })
            .from(schema.versions)
            .where(eq(schema.versions.id, existing.publishedVersionId));
        if (cur && JSON.stringify(cur.content) === JSON.stringify(artifact.draftContent))
            versionId = existing.publishedVersionId;
    }
    if (!versionId) {
        const [version] = await db
            .insert(schema.versions)
            .values({
                artifactId,
                content: artifact.draftContent,
                label: "published",
                authorId: u.id,
            })
            .returning({ id: schema.versions.id });
        if (!version) return c.json({ error: "publish failed" }, 500);
        versionId = version.id;
    }
    await db
        .update(schema.artifacts)
        .set({ publishedVersionId: versionId })
        .where(and(eq(schema.artifacts.id, artifactId), eq(schema.artifacts.workspaceId, ws.id)));

    const password = passwordFor(visibility, body.password, existing?.password ?? null);
    let link: OwnedLink;
    if (existing) {
        const [row] = await db
            .update(schema.links)
            .set({ visibility, password, publishedVersionId: versionId })
            .where(eq(schema.links.id, existing.id))
            .returning();
        link = row!;
    } else {
        const [row] = await db
            .insert(schema.links)
            .values({
                artifactId,
                slug: await uniqueSlug(),
                visibility,
                password,
                publishedVersionId: versionId,
            })
            .returning();
        link = row!;
    }

    let recipients: RecipientView[] | undefined;
    if (visibility === "private") {
        const emails = cleanEmails(body.recipients);
        if (emails.length)
            recipients = await addRecipients(link, emails, body.message ?? null, {
                artifactTitle: artifact.title,
                workspaceName: ws.name,
                inviterName: u.name,
            });
    }

    return c.json({
        slug: link.slug,
        visibility: link.visibility,
        url: publicUrl(link.slug),
        recipients,
    });
});

links.get("/links", async (c) => {
    const u = await currentUser(getCookie(c, SESSION_COOKIE));
    if (!u) return c.json({ error: "unauthorized" }, 401);
    const ws = await firstWorkspaceId(u.id);
    if (!ws) return c.json({ links: [] });

    const rows = await db
        .select({
            id: schema.links.id,
            artifactId: schema.links.artifactId,
            slug: schema.links.slug,
            visibility: schema.links.visibility,
            createdAt: schema.links.createdAt,
        })
        .from(schema.links)
        .innerJoin(schema.artifacts, eq(schema.links.artifactId, schema.artifacts.id))
        .where(and(eq(schema.artifacts.workspaceId, ws), isNull(schema.artifacts.trashedAt)))
        .orderBy(desc(schema.links.createdAt));

    const ids = rows.map((r) => r.id);
    const counts = ids.length
        ? await db
              .select({
                  linkId: schema.linkRecipients.linkId,
                  invited: sql<number>`count(*)::int`,
                  opened: sql<number>`count(last_viewed_at)::int`, // non-null = has been opened
              })
              .from(schema.linkRecipients)
              .where(inArray(schema.linkRecipients.linkId, ids))
              .groupBy(schema.linkRecipients.linkId)
        : [];
    const countMap = new Map(counts.map((x) => [x.linkId, x]));

    return c.json({
        links: rows.map((r) => ({
            id: r.id,
            artifactId: r.artifactId,
            slug: r.slug,
            visibility: r.visibility,
            url: publicUrl(r.slug),
            recipientCount: countMap.get(r.id)?.invited ?? 0,
            openedCount: countMap.get(r.id)?.opened ?? 0,
            publishedAt: r.createdAt,
        })),
    });
});

links.get("/links/:artifactId", async (c) => {
    const u = await currentUser(getCookie(c, SESSION_COOKIE));
    if (!u) return c.json({ error: "unauthorized" }, 401);
    const ws = await firstWorkspaceId(u.id);
    if (!ws) return c.json({ error: "no workspace" }, 400);

    const artifactId = c.req.param("artifactId");
    const [row] = await db
        .select({ link: schema.links, workspaceId: schema.artifacts.workspaceId })
        .from(schema.links)
        .innerJoin(schema.artifacts, eq(schema.links.artifactId, schema.artifacts.id))
        .where(eq(schema.links.artifactId, artifactId));
    if (!row || row.workspaceId !== ws) return c.json({ link: null });

    const link = row.link;
    return c.json({
        link: {
            id: link.id,
            slug: link.slug,
            visibility: link.visibility,
            hasPassword: !!link.password,
            url: publicUrl(link.slug),
            publishedAt: link.createdAt,
            recipients: await recipientsOf(link.id, link.slug),
        },
    });
});

links.patch("/links/:id", async (c) => {
    const u = await currentUser(getCookie(c, SESSION_COOKIE));
    if (!u) return c.json({ error: "unauthorized" }, 401);
    const ws = await firstWorkspaceId(u.id);
    if (!ws) return c.json({ error: "no workspace" }, 400);
    const link = await ownedLink(c.req.param("id"), ws);
    if (!link) return c.json({ error: "not found" }, 404);

    const body = await readJson<PublishBody>(c);
    const visibility =
        body.visibility && VISIBILITIES.has(body.visibility) ? body.visibility : link.visibility;
    if (visibility === "protected" && !body.password && !link.password)
        return c.json({ error: "A password is required for a protected link." }, 400);
    const password = passwordFor(visibility, body.password, link.password);

    const [row] = await db
        .update(schema.links)
        .set({ visibility, password })
        .where(eq(schema.links.id, link.id))
        .returning();
    return c.json({
        link: {
            id: row!.id,
            slug: row!.slug,
            visibility: row!.visibility,
            hasPassword: !!row!.password,
            url: publicUrl(row!.slug),
        },
    });
});

links.post("/links/:id/recipients", async (c) => {
    const u = await currentUser(getCookie(c, SESSION_COOKIE));
    if (!u) return c.json({ error: "unauthorized" }, 401);
    const ws = await currentWorkspace(u.id);
    if (!ws) return c.json({ error: "no workspace" }, 400);
    const link = await ownedLink(c.req.param("id"), ws.id);
    if (!link) return c.json({ error: "not found" }, 404);

    const body = await readJson<{ emails?: unknown; message?: string | null }>(c);
    const emails = cleanEmails(body.emails);
    if (!emails.length) return c.json({ error: "No valid email addresses." }, 400);

    const [artifact] = await db
        .select({ title: schema.artifacts.title })
        .from(schema.artifacts)
        .where(eq(schema.artifacts.id, link.artifactId));
    const added = await addRecipients(link, emails, body.message ?? null, {
        artifactTitle: artifact?.title ?? "a document",
        workspaceName: ws.name,
        inviterName: u.name,
    });
    return c.json({ recipients: added });
});

links.delete("/links/:id/recipients/:rid", async (c) => {
    const u = await currentUser(getCookie(c, SESSION_COOKIE));
    if (!u) return c.json({ error: "unauthorized" }, 401);
    const ws = await firstWorkspaceId(u.id);
    if (!ws) return c.json({ error: "no workspace" }, 400);
    const link = await ownedLink(c.req.param("id"), ws);
    if (!link) return c.json({ error: "not found" }, 404);
    await db
        .delete(schema.linkRecipients)
        .where(
            and(
                eq(schema.linkRecipients.id, c.req.param("rid")),
                eq(schema.linkRecipients.linkId, link.id),
            ),
        );
    return c.json({ ok: true });
});

links.post("/artifacts/:id/unpublish", async (c) => {
    const u = await currentUser(getCookie(c, SESSION_COOKIE));
    if (!u) return c.json({ error: "unauthorized" }, 401);
    const ws = await firstWorkspaceId(u.id);
    if (!ws) return c.json({ error: "no workspace" }, 400);
    const artifactId = c.req.param("id");
    const [artifact] = await db
        .select({ id: schema.artifacts.id })
        .from(schema.artifacts)
        .where(and(eq(schema.artifacts.id, artifactId), eq(schema.artifacts.workspaceId, ws)));
    if (!artifact) return c.json({ error: "not found" }, 404);
    await db.delete(schema.links).where(eq(schema.links.artifactId, artifactId));
    await db
        .update(schema.artifacts)
        .set({ publishedVersionId: null })
        .where(and(eq(schema.artifacts.id, artifactId), eq(schema.artifacts.workspaceId, ws)));
    return c.json({ ok: true });
});

// Custom-theme record for an anonymous viewer to registerThemes(); null for a built-in/unknown/foreign id.
async function customThemeRecord(themeId: unknown, workspaceId: string) {
    if (typeof themeId !== "string" || !UUID_RE.test(themeId)) return null;
    const [t] = await db
        .select()
        .from(schema.themes)
        .where(and(eq(schema.themes.id, themeId), eq(schema.themes.workspaceId, workspaceId)));
    return t
        ? { id: t.id, name: t.name, tag: t.mood ?? "custom", dark: t.isDark, tokens: t.tokens }
        : null;
}

// UNAUTHENTICATED public read — the one anonymous surface.
links.get("/p/:slug/content", async (c) => {
    const slug = c.req.param("slug");
    const [link] = await db.select().from(schema.links).where(eq(schema.links.slug, slug));
    if (!link || !link.publishedVersionId) return c.json({ error: "not found" }, 404);

    // Trashed artifact's links go dark → 404 (never reveal existence).
    const [artifact] = await db
        .select({
            title: schema.artifacts.title,
            workspaceId: schema.artifacts.workspaceId,
            trashedAt: schema.artifacts.trashedAt,
        })
        .from(schema.artifacts)
        .where(eq(schema.artifacts.id, link.artifactId));
    if (!artifact || artifact.trashedAt) return c.json({ error: "not found" }, 404);

    // Link is active only while the OWNER's plan grants public links (also drives branding); downgrade to Free deactivates.
    const [ownerWs] = await db
        .select({
            plan: schema.workspaces.plan,
            featureOverrides: schema.workspaces.featureOverrides,
        })
        .from(schema.workspaces)
        .where(eq(schema.workspaces.id, artifact.workspaceId));
    const owner = resolveFeatures(
        (ownerWs?.plan ?? "free") as PlanId,
        ownerWs?.featureOverrides ?? undefined,
    );
    if (!owner.publicLinks) return c.json({ error: "not found" }, 404);
    const branded = !owner.removeBranding;

    // Resolve theme + format up front so the protected password page can be shown in the artifact's theme.
    const [tv] = await db
        .select({
            theme: sql<string>`content->>'theme'`,
            format: sql<string>`content->>'format'`,
        })
        .from(schema.versions)
        .where(eq(schema.versions.id, link.publishedVersionId));
    const themeId = typeof tv?.theme === "string" ? tv.theme : "studio";
    const format = typeof tv?.format === "string" ? tv.format : undefined;
    const customTheme = await customThemeRecord(themeId, artifact.workspaceId);

    // Access policy — failed private/unknown check → 404 (never reveal existence).
    let recipientId: string | null = null;
    if (link.visibility === "protected") {
        if (pwLocked(slug))
            return c.json(
                {
                    error: "Too many attempts. Try again later.",
                    needsPassword: true,
                    theme: themeId,
                    customTheme,
                    format,
                },
                429,
            );
        const pw = c.req.query("pw");
        if (!pw || !verifyPassword(pw, link.password)) {
            if (pw) pwFail(slug); // count only real wrong guesses, not the initial promptless GET
            return c.json(
                {
                    error: "password required",
                    needsPassword: true,
                    theme: themeId,
                    customTheme,
                    format,
                },
                401,
            );
        }
        pwFails.delete(slug);
    } else if (link.visibility === "private") {
        const token = c.req.query("k");
        if (!token) return c.json({ error: "not found" }, 404);
        const [rec] = await db
            .select({ id: schema.linkRecipients.id })
            .from(schema.linkRecipients)
            .where(
                and(
                    eq(schema.linkRecipients.token, token),
                    eq(schema.linkRecipients.linkId, link.id),
                ),
            );
        if (!rec) return c.json({ error: "not found" }, 404);
        recipientId = rec.id;
    }

    const [version] = await db
        .select({ content: schema.versions.content })
        .from(schema.versions)
        .where(eq(schema.versions.id, link.publishedVersionId));
    if (!version) return c.json({ error: "not found" }, 404);
    const content = version.content as ArtifactContent;

    // NB: drizzle builders are lazy — the trailing .catch() (not a bare `void`) is what runs the query.
    if (recipientId)
        void db
            .update(schema.linkRecipients)
            .set({ lastViewedAt: new Date() })
            .where(eq(schema.linkRecipients.id, recipientId))
            .catch(() => {});

    return c.json({ title: artifact.title, content, branded, customTheme });
});
