import { Hono } from "hono";
import { and, eq } from "drizzle-orm";
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

// Public sharing. One `links` row = one published share; `visibility` is the access policy
// (public | protected | private). Every view — of every type — resolves through GET /p/:slug/content and
// keys on the same link, so view analytics (04) is uniform. Private links grant access per recipient via
// an unguessable token (link_recipients), so the viewer stays unauthenticated.
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

// A short, collision-checked slug for the public URL.
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

// A per-recipient access token (128-bit, URL-safe). Possession of the token = access to a private link.
const newToken = (): string => randomBytes(24).toString("base64url");

const publicUrl = (slug: string, token?: string): string =>
    `${APP_URL}/p/${slug}${token ? `?k=${token}` : ""}`;

// The password hash to store: only `protected` links carry one; a new password re-hashes, otherwise the
// existing hash is kept (so toggling other fields doesn't wipe it).
function passwordFor(
    visibility: string,
    provided: string | null | undefined,
    existing: string | null,
): string | null {
    if (visibility !== "protected") return null;
    if (provided) return hashPassword(provided);
    return existing;
}

// Validate + normalize a batch of recipient emails (lowercased, de-duped, capped).
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

// Load a link by id, but only if its artifact belongs to the given workspace (tenant guard for the
// authenticated Share routes).
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

// Insert new recipients (skipping any email already invited on this link), send each their invite, and
// return the newly added ones. Delivery failures never break publishing — the URLs are returned anyway.
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

// ── Publish: snapshot the draft into a version + upsert the public link ──────────────────────────────
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

    // Snapshot the current draft into an immutable version, then point the artifact + link at it.
    const [version] = await db
        .insert(schema.versions)
        .values({ artifactId, content: artifact.draftContent, label: "published", authorId: u.id })
        .returning({ id: schema.versions.id });
    if (!version) return c.json({ error: "publish failed" }, 500);
    await db
        .update(schema.artifacts)
        .set({ publishedVersionId: version.id })
        .where(and(eq(schema.artifacts.id, artifactId), eq(schema.artifacts.workspaceId, ws.id)));

    const password = passwordFor(visibility, body.password, existing?.password ?? null);
    let link: OwnedLink;
    if (existing) {
        const [row] = await db
            .update(schema.links)
            .set({ visibility, password, publishedVersionId: version.id })
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
                publishedVersionId: version.id,
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

// ── Current publish state for the Share UI ───────────────────────────────────────────────────────────
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

// ── Change visibility / password ─────────────────────────────────────────────────────────────────────
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

// ── Add a batch of email recipients (private links) ──────────────────────────────────────────────────
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

// ── Revoke a recipient (their token stops working immediately) ───────────────────────────────────────
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

// ── Unpublish: drop the link (recipients cascade) + clear the published pointer (history kept) ───────
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

// ── UNAUTHENTICATED public read — the one anonymous surface ──────────────────────────────────────────
links.get("/p/:slug/content", async (c) => {
    const [link] = await db
        .select()
        .from(schema.links)
        .where(eq(schema.links.slug, c.req.param("slug")));
    if (!link || !link.publishedVersionId) return c.json({ error: "not found" }, 404);

    // Access policy. Never reveal existence on a failed private/unknown check → 404.
    let recipientId: string | null = null;
    if (link.visibility === "protected") {
        const pw = c.req.query("pw");
        if (!pw || !verifyPassword(pw, link.password))
            return c.json({ error: "password required", needsPassword: true }, 401);
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

    const [artifact] = await db
        .select({ title: schema.artifacts.title, workspaceId: schema.artifacts.workspaceId })
        .from(schema.artifacts)
        .where(eq(schema.artifacts.id, link.artifactId));
    if (!artifact) return c.json({ error: "not found" }, 404);

    // Branding is the OWNER's entitlement — an anonymous viewer has no plan of its own.
    const [ownerWs] = await db
        .select({
            plan: schema.workspaces.plan,
            featureOverrides: schema.workspaces.featureOverrides,
        })
        .from(schema.workspaces)
        .where(eq(schema.workspaces.id, artifact.workspaceId));
    const branded = ownerWs
        ? !resolveFeatures(
              (ownerWs.plan ?? "free") as PlanId,
              ownerWs.featureOverrides ?? undefined,
          ).removeBranding
        : true;

    // A workspace custom theme won't be in the anonymous viewer's registry — ship its record so the
    // viewer can registerThemes() before painting. Built-in ids (non-uuid) are already in the registry.
    let customTheme = null;
    if (typeof content.theme === "string" && UUID_RE.test(content.theme)) {
        const [t] = await db
            .select()
            .from(schema.themes)
            .where(
                and(
                    eq(schema.themes.id, content.theme),
                    eq(schema.themes.workspaceId, artifact.workspaceId),
                ),
            );
        if (t)
            customTheme = {
                id: t.id,
                name: t.name,
                tag: t.mood ?? "custom",
                dark: t.isDark,
                tokens: t.tokens,
            };
    }

    // View analytics (04) hooks in here: a fire-and-forget insert into artifact_views keyed by
    // link.id (+ recipientId for private). We already track per-recipient "opened" for the Share UI:
    if (recipientId)
        void db
            .update(schema.linkRecipients)
            .set({ lastViewedAt: new Date() })
            .where(eq(schema.linkRecipients.id, recipientId));

    return c.json({ title: artifact.title, content, branded, customTheme });
});
