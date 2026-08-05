import { Hono } from "hono";
import type { Context } from "hono";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { getCookie } from "hono/cookie";
import { createHash, randomBytes } from "node:crypto";
import type { ArtifactContent } from "@model/artifact";
import { resolveFeatures } from "@model/features";
import type { PlanId } from "@model/billing";
import { db, schema } from "../schema";
import { SESSION_COOKIE, hashPassword, verifyPassword } from "../auth";
import { requireFeature } from "../features";
import { currentUser, currentWorkspace, firstWorkspaceId, readJson } from "./context";
import { sendShareInvite } from "../mail/send";

export const links = new Hono();

const APP_URL = process.env.APP_URL ?? "http://localhost:8600";
const VISIBILITIES = new Set(["public", "protected", "private"]);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SLUG_ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789"; // no look-alikes (0/o/1/l)

interface LinkBody {
    name?: string | null;
    visibility?: string;
    password?: string | null;
    recipients?: unknown;
    message?: string | null;
}

const cleanName = (raw: unknown): string | null =>
    typeof raw === "string" && raw.trim() ? raw.trim().slice(0, 120) : null;

// Cookieless view dedup: same viewer + link + UTC day → same key; the raw IP/UA never touch the DB.
const SESSION_PEPPER = process.env.SESSION_SECRET ?? "galleo-views";
function viewSessionKey(c: Context, linkId: string): string {
    const ip = c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
    const ua = c.req.header("user-agent") ?? "";
    const day = new Date().toISOString().slice(0, 10);
    return createHash("sha256")
        .update(`${day}|${ip}|${ua}|${linkId}|${SESSION_PEPPER}`)
        .digest("base64url")
        .slice(0, 24);
}

// hostname only — enough for "where did they come from", nothing identifying
function refHost(raw: string | undefined): string {
    if (!raw) return "direct";
    try {
        return new URL(raw).hostname || "direct";
    } catch {
        return "direct";
    }
}

const deviceOf = (ua: string | undefined): string =>
    ua && /Mobi|Android|iPhone|iPad/i.test(ua) ? "mobile" : "desktop";

// populated when deployed behind a geo-aware proxy (Cloudflare/Vercel); null in dev
const countryOf = (c: Context): string | null =>
    c.req.header("cf-ipcountry") ?? c.req.header("x-vercel-ip-country") ?? null;

async function isWorkspaceMember(userId: string, workspaceId: string): Promise<boolean> {
    const [m] = await db
        .select({ userId: schema.members.userId })
        .from(schema.members)
        .where(and(eq(schema.members.workspaceId, workspaceId), eq(schema.members.userId, userId)));
    return !!m;
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

// Only protected links carry a hash; keep the existing one so an unrelated edit doesn't wipe it.
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
    name: string | null;
    visibility: string;
    password: string | null;
    createdAt: Date;
}

interface LinkStats {
    viewCount: number;
    lastViewedAt: Date | null;
}

async function statsFor(linkIds: string[]): Promise<Map<string, LinkStats>> {
    if (!linkIds.length) return new Map();
    const rows = await db
        .select({
            linkId: schema.linkViews.linkId,
            viewCount: sql<number>`count(*)::int`,
            lastViewedAt: sql<Date | null>`max(coalesce(last_seen_at, viewed_at))`,
        })
        .from(schema.linkViews)
        .where(inArray(schema.linkViews.linkId, linkIds))
        .groupBy(schema.linkViews.linkId);
    return new Map(
        rows.map((r) => [r.linkId, { viewCount: r.viewCount, lastViewedAt: r.lastViewedAt }]),
    );
}

function linkJson(l: OwnedLink, stats?: LinkStats) {
    return {
        id: l.id,
        slug: l.slug,
        name: l.name,
        visibility: l.visibility,
        hasPassword: !!l.password,
        url: publicUrl(l.slug),
        publishedAt: l.createdAt,
        viewCount: stats?.viewCount ?? 0,
        lastViewedAt: stats?.lastViewedAt ?? null,
    };
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

// Create a NEW link every call — one artifact can carry many (per audience/channel analytics).
links.post("/artifacts/:id/links", async (c) => {
    const u = await currentUser(getCookie(c, SESSION_COOKIE));
    if (!u) return c.json({ error: "unauthorized" }, 401);
    const ws = await currentWorkspace(u.id);
    if (!ws) return c.json({ error: "no workspace" }, 400);
    const denied = requireFeature(
        c,
        ws,
        "publicLinks",
        "Public links are a paid feature — upgrade.",
    );
    if (denied) return denied;

    const artifactId = c.req.param("id");
    const [artifact] = await db
        .select({ title: schema.artifacts.title })
        .from(schema.artifacts)
        .where(and(eq(schema.artifacts.id, artifactId), eq(schema.artifacts.workspaceId, ws.id)));
    if (!artifact) return c.json({ error: "not found" }, 404);

    const body = await readJson<LinkBody>(c);
    const visibility =
        body.visibility && VISIBILITIES.has(body.visibility) ? body.visibility : "public";
    if (visibility === "protected" && !body.password)
        return c.json({ error: "A password is required for a protected link." }, 400);

    const [link] = await db
        .insert(schema.links)
        .values({
            artifactId,
            slug: await uniqueSlug(),
            name: cleanName(body.name),
            visibility,
            password: passwordFor(visibility, body.password, null),
        })
        .returning();
    if (!link) return c.json({ error: "create failed" }, 500);

    let recipients: RecipientView[] = [];
    if (visibility === "private") {
        const emails = cleanEmails(body.recipients);
        if (emails.length)
            recipients = await addRecipients(link, emails, body.message ?? null, {
                artifactTitle: artifact.title,
                workspaceName: ws.name,
                inviterName: u.name,
            });
    }

    return c.json({ link: { ...linkJson(link), recipients } });
});

links.get("/artifacts/:id/links", async (c) => {
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

    const rows = await db
        .select()
        .from(schema.links)
        .where(eq(schema.links.artifactId, artifactId))
        .orderBy(desc(schema.links.createdAt));
    const stats = await statsFor(rows.map((r) => r.id));
    const out = await Promise.all(
        rows.map(async (l) => ({
            ...linkJson(l, stats.get(l.id)),
            recipients: await recipientsOf(l.id, l.slug),
        })),
    );
    return c.json({ links: out });
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
            name: schema.links.name,
            visibility: schema.links.visibility,
            createdAt: schema.links.createdAt,
            // joined so the Shared view can render a row without holding the whole library client-side
            title: schema.artifacts.title,
            formatId: schema.artifacts.formatId,
            themeId: schema.artifacts.themeId,
            digest: schema.artifacts.digest,
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
    const stats = await statsFor(ids);

    return c.json({
        links: rows.map((r) => ({
            id: r.id,
            artifactId: r.artifactId,
            artifact: {
                id: r.artifactId,
                title: r.title,
                formatId: r.formatId,
                themeId: r.themeId,
                cover: r.digest?.cover ?? {},
            },
            slug: r.slug,
            name: r.name,
            visibility: r.visibility,
            url: publicUrl(r.slug),
            recipientCount: countMap.get(r.id)?.invited ?? 0,
            openedCount: countMap.get(r.id)?.opened ?? 0,
            viewCount: stats.get(r.id)?.viewCount ?? 0,
            lastViewedAt: stats.get(r.id)?.lastViewedAt ?? null,
            publishedAt: r.createdAt,
        })),
    });
});

links.patch("/links/:id", async (c) => {
    const u = await currentUser(getCookie(c, SESSION_COOKIE));
    if (!u) return c.json({ error: "unauthorized" }, 401);
    const ws = await firstWorkspaceId(u.id);
    if (!ws) return c.json({ error: "no workspace" }, 400);
    const link = await ownedLink(c.req.param("id"), ws);
    if (!link) return c.json({ error: "not found" }, 404);

    const body = await readJson<LinkBody>(c);
    const visibility =
        body.visibility && VISIBILITIES.has(body.visibility) ? body.visibility : link.visibility;
    if (visibility === "protected" && !body.password && !link.password)
        return c.json({ error: "A password is required for a protected link." }, 400);
    const password = passwordFor(visibility, body.password, link.password);
    const name = body.name === undefined ? link.name : cleanName(body.name);

    const [row] = await db
        .update(schema.links)
        .set({ visibility, password, name })
        .where(eq(schema.links.id, link.id))
        .returning();
    const stats = await statsFor([row!.id]);
    return c.json({ link: linkJson(row!, stats.get(row!.id)) });
});

links.delete("/links/:id", async (c) => {
    const u = await currentUser(getCookie(c, SESSION_COOKIE));
    if (!u) return c.json({ error: "unauthorized" }, 401);
    const ws = await firstWorkspaceId(u.id);
    if (!ws) return c.json({ error: "no workspace" }, 400);
    const link = await ownedLink(c.req.param("id"), ws);
    if (!link) return c.json({ error: "not found" }, 404);
    await db.delete(schema.links).where(eq(schema.links.id, link.id));
    return c.json({ ok: true });
});

interface Analytics {
    totals: {
        views: number;
        lastViewedAt: Date | null;
        avgSeconds: number | null;
        completionPct: number | null;
    };
    days: { day: string; views: number }[];
    referrers: { source: string | null; views: number }[];
    devices: { device: string | null; views: number }[];
    recipients?: {
        id: string;
        email: string;
        views: number;
        lastViewedAt: Date | null;
        completionPct: number | null;
    }[];
}

async function analyticsFor(linkIds: string[], privateLinkIds: string[]): Promise<Analytics> {
    const empty: Analytics = {
        totals: { views: 0, lastViewedAt: null, avgSeconds: null, completionPct: null },
        days: [],
        referrers: [],
        devices: [],
        recipients: privateLinkIds.length ? [] : undefined,
    };
    if (!linkIds.length) return empty;

    const lv = schema.linkViews;
    const [totals] = await db
        .select({
            views: sql<number>`count(*)::int`,
            lastViewedAt: sql<Date | null>`max(coalesce(last_seen_at, viewed_at))`,
            avgSeconds: sql<
                number | null
            >`round(avg(extract(epoch from last_seen_at - viewed_at)) filter (where last_seen_at is not null))::int`,
            completionPct: sql<
                number | null
            >`round(avg((max_unit + 1)::float / unit_total) filter (where max_unit is not null and unit_total > 0) * 100)::int`,
        })
        .from(lv)
        .where(inArray(lv.linkId, linkIds));

    const days = await db
        .select({
            day: sql<string>`to_char(viewed_at, 'YYYY-MM-DD')`,
            views: sql<number>`count(*)::int`,
        })
        .from(lv)
        .where(and(inArray(lv.linkId, linkIds), sql`viewed_at > now() - interval '30 days'`))
        .groupBy(sql`to_char(viewed_at, 'YYYY-MM-DD')`)
        .orderBy(sql`to_char(viewed_at, 'YYYY-MM-DD')`);

    const referrers = await db
        .select({ source: lv.referrer, views: sql<number>`count(*)::int` })
        .from(lv)
        .where(and(inArray(lv.linkId, linkIds), sql`referrer is not null`))
        .groupBy(lv.referrer)
        .orderBy(sql`count(*) desc`)
        .limit(8);

    const devices = await db
        .select({ device: lv.device, views: sql<number>`count(*)::int` })
        .from(lv)
        .where(and(inArray(lv.linkId, linkIds), sql`device is not null`))
        .groupBy(lv.device)
        .orderBy(sql`count(*) desc`);

    let recipients: Analytics["recipients"];
    if (privateLinkIds.length) {
        recipients = await db
            .select({
                id: schema.linkRecipients.id,
                email: schema.linkRecipients.email,
                views: sql<number>`count(${lv.id})::int`,
                lastViewedAt: schema.linkRecipients.lastViewedAt,
                completionPct: sql<
                    number | null
                >`round(max((${lv.maxUnit} + 1)::float / nullif(${lv.unitTotal}, 0)) * 100)::int`,
            })
            .from(schema.linkRecipients)
            .leftJoin(
                lv,
                and(
                    eq(lv.recipientId, schema.linkRecipients.id),
                    eq(lv.linkId, schema.linkRecipients.linkId),
                ),
            )
            .where(inArray(schema.linkRecipients.linkId, privateLinkIds))
            .groupBy(schema.linkRecipients.id)
            .orderBy(desc(schema.linkRecipients.invitedAt));
    }

    return {
        totals: {
            views: totals?.views ?? 0,
            lastViewedAt: totals?.lastViewedAt ?? null,
            avgSeconds: totals?.avgSeconds ?? null,
            completionPct: totals?.completionPct ?? null,
        },
        days,
        referrers,
        devices,
        recipients,
    };
}

links.get("/links/:id/analytics", async (c) => {
    const u = await currentUser(getCookie(c, SESSION_COOKIE));
    if (!u) return c.json({ error: "unauthorized" }, 401);
    const ws = await currentWorkspace(u.id);
    if (!ws) return c.json({ error: "no workspace" }, 400);
    const link = await ownedLink(c.req.param("id"), ws.id);
    if (!link) return c.json({ error: "not found" }, 404);
    const denied = requireFeature(c, ws, "analytics", "Analytics is a Premium feature — upgrade.");
    if (denied) return denied;

    return c.json(await analyticsFor([link.id], link.visibility === "private" ? [link.id] : []));
});

links.get("/artifacts/:id/analytics", async (c) => {
    const u = await currentUser(getCookie(c, SESSION_COOKIE));
    if (!u) return c.json({ error: "unauthorized" }, 401);
    const ws = await currentWorkspace(u.id);
    if (!ws) return c.json({ error: "no workspace" }, 400);

    const artifactId = c.req.param("id");
    const [artifact] = await db
        .select({ id: schema.artifacts.id })
        .from(schema.artifacts)
        .where(and(eq(schema.artifacts.id, artifactId), eq(schema.artifacts.workspaceId, ws.id)));
    if (!artifact) return c.json({ error: "not found" }, 404);
    const denied = requireFeature(c, ws, "analytics", "Analytics is a Premium feature — upgrade.");
    if (denied) return denied;

    const rows = await db
        .select({ id: schema.links.id, visibility: schema.links.visibility })
        .from(schema.links)
        .where(eq(schema.links.artifactId, artifactId));
    return c.json(
        await analyticsFor(
            rows.map((r) => r.id),
            rows.filter((r) => r.visibility === "private").map((r) => r.id),
        ),
    );
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

// Null for a built-in/unknown/foreign id; the anonymous viewer feeds this to registerThemes().
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

// UNAUTHENTICATED — always serves the live draft, never a pinned snapshot.
links.get("/p/:slug/content", async (c) => {
    const slug = c.req.param("slug");
    const [link] = await db.select().from(schema.links).where(eq(schema.links.slug, slug));
    if (!link) return c.json({ error: "not found" }, 404);

    // Trashed artifact's links go dark → 404 (never reveal existence).
    const [artifact] = await db
        .select({
            title: schema.artifacts.title,
            workspaceId: schema.artifacts.workspaceId,
            trashedAt: schema.artifacts.trashedAt,
            draftContent: schema.artifacts.draftContent,
        })
        .from(schema.artifacts)
        .where(eq(schema.artifacts.id, link.artifactId));
    if (!artifact || artifact.trashedAt) return c.json({ error: "not found" }, 404);

    // Active only while the OWNER's plan grants public links; a downgrade to Free deactivates it.
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
    const content = artifact.draftContent as ArtifactContent;
    const themeId = typeof content.theme === "string" ? content.theme : "studio";
    const format = typeof content.format === "string" ? content.format : undefined;
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

    try {
        // Owner previews don't count as views.
        const viewer = await currentUser(getCookie(c, SESSION_COOKIE));
        const isOwner = viewer && (await isWorkspaceMember(viewer.id, artifact.workspaceId));
        if (!isOwner) {
            // one row per viewer session; a same-day reload just bumps last_seen_at
            await db
                .insert(schema.linkViews)
                .values({
                    linkId: link.id,
                    recipientId,
                    sessionKey: viewSessionKey(c, link.id),
                    referrer: refHost(c.req.query("ref")?.slice(0, 300)),
                    device: deviceOf(c.req.header("user-agent")),
                    country: countryOf(c),
                    lastSeenAt: new Date(),
                })
                .onConflictDoUpdate({
                    target: [schema.linkViews.linkId, schema.linkViews.sessionKey],
                    set: { lastSeenAt: new Date() },
                });
            if (recipientId)
                await db
                    .update(schema.linkRecipients)
                    .set({ lastViewedAt: new Date() })
                    .where(eq(schema.linkRecipients.id, recipientId));
        }
    } catch {
        /* analytics never blocks the read */
    }

    return c.json({ title: artifact.title, content, branded, customTheme });
});

// UNAUTHENTICATED — only updates an existing session row, so a gated reader can't write anything.
links.post("/p/:slug/ping", async (c) => {
    const [link] = await db
        .select({ id: schema.links.id })
        .from(schema.links)
        .where(eq(schema.links.slug, c.req.param("slug")));
    if (!link) return c.json({ ok: true }); // never reveal
    const body = await readJson<{ u?: number; t?: number }>(c);
    const u =
        typeof body.u === "number" && Number.isInteger(body.u) && body.u >= 0
            ? Math.min(body.u, 999)
            : null;
    const t =
        typeof body.t === "number" && Number.isInteger(body.t) && body.t > 0
            ? Math.min(body.t, 999)
            : null;
    try {
        await db
            .update(schema.linkViews)
            .set({
                lastSeenAt: new Date(),
                ...(u !== null ? { maxUnit: sql`greatest(coalesce(max_unit, 0), ${u})` } : {}),
                ...(t !== null ? { unitTotal: t } : {}),
            })
            .where(
                and(
                    eq(schema.linkViews.linkId, link.id),
                    eq(schema.linkViews.sessionKey, viewSessionKey(c, link.id)),
                ),
            );
    } catch {
        /* analytics never surfaces errors to viewers */
    }
    return c.json({ ok: true });
});
