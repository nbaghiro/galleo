import { createHash, randomBytes } from "node:crypto";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { ArtifactContent } from "@model/artifact";
import type { PlanId } from "@model/billing";
import { resolveFeatures } from "@model/billing";
import { db } from "../db/client";
import { schema } from "../db/schema";
import { hashPassword, verifyPassword } from "../utils/auth";
import { appUrl } from "../utils/env";
import { sendShareInvite } from "./mail";

// Share links: creation, recipients, analytics, and the read the public viewer performs. The routes
// in api/links.ts do the gating and the response shaping; the access decisions themselves live here
// because "not found" and "wrong password" have to be indistinguishable from outside.

export const VISIBILITIES = new Set(["public", "protected", "private"]);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SLUG_ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789"; // no look-alikes (0/o/1/l)

export interface LinkBody {
    name?: string | null;
    visibility?: string;
    password?: string | null;
    recipients?: unknown;
    message?: string | null;
}

export const cleanName = (raw: unknown): string | null =>
    typeof raw === "string" && raw.trim() ? raw.trim().slice(0, 120) : null;

export function cleanEmails(raw: unknown): string[] {
    if (!Array.isArray(raw)) return [];
    const seen = new Set<string>();
    for (const e of raw) {
        if (typeof e !== "string") continue;
        const v = e.trim().toLowerCase();
        if (EMAIL_RE.test(v)) seen.add(v);
    }
    return [...seen].slice(0, 100);
}

// What a request tells us about an anonymous viewer. The raw IP/UA never reach the database: they
// only feed the session hash below.
export interface ViewerContext {
    ip: string;
    userAgent: string | undefined;
    referrer: string | undefined;
    country: string | null;
}

// Cookieless view dedup: same viewer + link + UTC day → same key.
const SESSION_PEPPER = process.env.SESSION_SECRET ?? "galleo-views";
export function viewSessionKey(linkId: string, v: ViewerContext): string {
    const day = new Date().toISOString().slice(0, 10);
    return createHash("sha256")
        .update(`${day}|${v.ip}|${v.userAgent ?? ""}|${linkId}|${SESSION_PEPPER}`)
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

export async function isWorkspaceMember(userId: string, workspaceId: string): Promise<boolean> {
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
    appUrl(`/p/${slug}${token ? `?k=${token}` : ""}`);

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

export interface OwnedLink {
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

export function linkJson(l: OwnedLink, stats?: LinkStats) {
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
export async function ownedLink(linkId: string, workspaceId: string): Promise<OwnedLink | null> {
    const [row] = await db
        .select({ link: schema.links, workspaceId: schema.artifacts.workspaceId })
        .from(schema.links)
        .innerJoin(schema.artifacts, eq(schema.links.artifactId, schema.artifacts.id))
        .where(eq(schema.links.id, linkId));
    if (!row || row.workspaceId !== workspaceId) return null;
    return row.link;
}

export interface RecipientView {
    id: string;
    email: string;
    url: string;
    invitedAt: Date;
    lastViewedAt: Date | null;
}

export async function recipientsOf(linkId: string, slug: string): Promise<RecipientView[]> {
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
export async function addRecipients(
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

export async function artifactTitleIn(
    workspaceId: string,
    artifactId: string,
): Promise<string | null> {
    const [a] = await db
        .select({ title: schema.artifacts.title })
        .from(schema.artifacts)
        .where(
            and(eq(schema.artifacts.id, artifactId), eq(schema.artifacts.workspaceId, workspaceId)),
        );
    return a?.title ?? null;
}

export async function artifactTitleOf(artifactId: string): Promise<string | null> {
    const [a] = await db
        .select({ title: schema.artifacts.title })
        .from(schema.artifacts)
        .where(eq(schema.artifacts.id, artifactId));
    return a?.title ?? null;
}

// Create a NEW link every call — one artifact can carry many (per audience/channel analytics).
export async function createLink(
    artifactId: string,
    body: LinkBody,
    visibility: string,
): Promise<OwnedLink | null> {
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
    return link ?? null;
}

export async function linksForArtifact(artifactId: string) {
    const rows = await db
        .select()
        .from(schema.links)
        .where(eq(schema.links.artifactId, artifactId))
        .orderBy(desc(schema.links.createdAt));
    const stats = await statsFor(rows.map((r) => r.id));
    return Promise.all(
        rows.map(async (l) => ({
            ...linkJson(l, stats.get(l.id)),
            recipients: await recipientsOf(l.id, l.slug),
        })),
    );
}

// The Shared view's row list: joined so it can render without holding the whole library client-side.
export async function linksForWorkspace(workspaceId: string) {
    const rows = await db
        .select({
            id: schema.links.id,
            artifactId: schema.links.artifactId,
            slug: schema.links.slug,
            name: schema.links.name,
            visibility: schema.links.visibility,
            createdAt: schema.links.createdAt,
            title: schema.artifacts.title,
            formatId: schema.artifacts.formatId,
            themeId: schema.artifacts.themeId,
            digest: schema.artifacts.digest,
        })
        .from(schema.links)
        .innerJoin(schema.artifacts, eq(schema.links.artifactId, schema.artifacts.id))
        .where(
            and(eq(schema.artifacts.workspaceId, workspaceId), isNull(schema.artifacts.trashedAt)),
        )
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

    return rows.map((r) => ({
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
    }));
}

export async function updateLink(link: OwnedLink, body: LinkBody, visibility: string) {
    const password = passwordFor(visibility, body.password, link.password);
    const name = body.name === undefined ? link.name : cleanName(body.name);
    const [row] = await db
        .update(schema.links)
        .set({ visibility, password, name })
        .where(eq(schema.links.id, link.id))
        .returning();
    const stats = await statsFor([row!.id]);
    return linkJson(row!, stats.get(row!.id));
}

export async function deleteLink(id: string): Promise<void> {
    await db.delete(schema.links).where(eq(schema.links.id, id));
}

export async function deleteRecipient(linkId: string, recipientId: string): Promise<void> {
    await db
        .delete(schema.linkRecipients)
        .where(
            and(
                eq(schema.linkRecipients.id, recipientId),
                eq(schema.linkRecipients.linkId, linkId),
            ),
        );
}

export async function linkIdsForArtifact(artifactId: string) {
    return db
        .select({ id: schema.links.id, visibility: schema.links.visibility })
        .from(schema.links)
        .where(eq(schema.links.artifactId, artifactId));
}

export interface Analytics {
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

export async function analyticsFor(
    linkIds: string[],
    privateLinkIds: string[],
): Promise<Analytics> {
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

type CustomThemeRecord = Awaited<ReturnType<typeof customThemeRecord>>;

export type PublicRead =
    | { status: 404 }
    | {
          status: 401 | 429;
          error: string;
          theme: string;
          customTheme: CustomThemeRecord;
          format: string | undefined;
      }
    | {
          status: 200;
          linkId: string;
          workspaceId: string;
          recipientId: string | null;
          title: string;
          content: ArtifactContent;
          branded: boolean;
          customTheme: CustomThemeRecord;
      };

/**
 * The anonymous read behind /p/:slug. Always serves the live draft, never a pinned snapshot, and
 * every failed check answers 404 so a link's existence is never revealed.
 */
export async function publicRead(
    slug: string,
    access: { password?: string; token?: string },
): Promise<PublicRead> {
    const [link] = await db.select().from(schema.links).where(eq(schema.links.slug, slug));
    if (!link) return { status: 404 };

    // A trashed artifact's links go dark.
    const [artifact] = await db
        .select({
            title: schema.artifacts.title,
            workspaceId: schema.artifacts.workspaceId,
            trashedAt: schema.artifacts.trashedAt,
            draftContent: schema.artifacts.draftContent,
        })
        .from(schema.artifacts)
        .where(eq(schema.artifacts.id, link.artifactId));
    if (!artifact || artifact.trashedAt) return { status: 404 };

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
    if (!owner.publicLinks) return { status: 404 };

    // Resolved up front so the protected password page can be shown in the artifact's theme.
    const content = artifact.draftContent as ArtifactContent;
    const themeId = typeof content.theme === "string" ? content.theme : "studio";
    const format = typeof content.format === "string" ? content.format : undefined;
    const customTheme = await customThemeRecord(themeId, artifact.workspaceId);

    let recipientId: string | null = null;
    if (link.visibility === "protected") {
        if (pwLocked(slug))
            return {
                status: 429,
                error: "Too many attempts. Try again later.",
                theme: themeId,
                customTheme,
                format,
            };
        const pw = access.password;
        if (!pw || !verifyPassword(pw, link.password)) {
            if (pw) pwFail(slug); // count only real wrong guesses, not the initial promptless GET
            return {
                status: 401,
                error: "password required",
                theme: themeId,
                customTheme,
                format,
            };
        }
        pwFails.delete(slug);
    } else if (link.visibility === "private") {
        if (!access.token) return { status: 404 };
        const [rec] = await db
            .select({ id: schema.linkRecipients.id })
            .from(schema.linkRecipients)
            .where(
                and(
                    eq(schema.linkRecipients.token, access.token),
                    eq(schema.linkRecipients.linkId, link.id),
                ),
            );
        if (!rec) return { status: 404 };
        recipientId = rec.id;
    }

    return {
        status: 200,
        linkId: link.id,
        workspaceId: artifact.workspaceId,
        recipientId,
        title: artifact.title,
        content,
        branded: !owner.removeBranding,
        customTheme,
    };
}

// One row per viewer session; a same-day reload just bumps last_seen_at. Never throws: analytics
// must not block the read.
export async function recordView(
    linkId: string,
    recipientId: string | null,
    v: ViewerContext,
): Promise<void> {
    try {
        await db
            .insert(schema.linkViews)
            .values({
                linkId,
                recipientId,
                sessionKey: viewSessionKey(linkId, v),
                referrer: refHost(v.referrer?.slice(0, 300)),
                device: deviceOf(v.userAgent),
                country: v.country,
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
    } catch {
        /* analytics never blocks the read */
    }
}

export async function linkIdForSlug(slug: string): Promise<string | null> {
    const [link] = await db
        .select({ id: schema.links.id })
        .from(schema.links)
        .where(eq(schema.links.slug, slug));
    return link?.id ?? null;
}

// Only updates an existing session row, so a gated reader can't write anything.
export async function pingView(
    linkId: string,
    progress: { unit: number | null; total: number | null },
    v: ViewerContext,
): Promise<void> {
    try {
        await db
            .update(schema.linkViews)
            .set({
                lastSeenAt: new Date(),
                ...(progress.unit !== null
                    ? { maxUnit: sql`greatest(coalesce(max_unit, 0), ${progress.unit})` }
                    : {}),
                ...(progress.total !== null ? { unitTotal: progress.total } : {}),
            })
            .where(
                and(
                    eq(schema.linkViews.linkId, linkId),
                    eq(schema.linkViews.sessionKey, viewSessionKey(linkId, v)),
                ),
            );
    } catch {
        /* analytics never surfaces errors to viewers */
    }
}
