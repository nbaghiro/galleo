import "dotenv/config";
import { createHash } from "node:crypto";
import { and, eq, inArray, notInArray } from "drizzle-orm";
import type { ArtifactContent, GenMeta } from "@model/artifact";
import type { PlanId } from "@model/billing";
import { isCreditQuantity, monthlyGrantFor, planFor, resolveFeatures } from "@model/billing";
import { TEMPLATE_INDEX } from "@model/templates";
import { THEMES } from "@themes";
import { assertDatabaseUrl, db } from "./client";
import { schema } from "./schema";
import { contentColumns } from "@services/core/artifacts";
import { syncArtifactAssets } from "@services/core/media";
import { hashPassword } from "@services/utils/auth";
import { appUrl, out as log, warn } from "@services/utils/env";
import { createWorkspaceForUser, type WorkspaceRow } from "@services/core/accounts";
import { addArtifactItem, addTextItem, createContext } from "@services/core/context";
import { embeddingReady } from "@services/core/ai/provider";
import { modelFor } from "@services/core/models";
import { templateBody } from "@services/core/templates";
import { seedShelf } from "@services/core/voices";
import { CORPUS_TITLES } from "./seed/artifacts";
import { DEMO_ASSETS } from "./seed/assets";
import { DEMO_CONTEXTS } from "./seed/contexts";
import type { DocEntry, DocRef, Person, WorkspaceSpec } from "./seed/workspaces";
import {
    COUNTRIES,
    DEMO_EMAIL,
    DEMO_PASSWORD,
    PEOPLE,
    REFERRERS,
    RETIRED_EMAILS,
    RETIRED_SLUGS,
    WORKSPACES,
    refKey,
} from "./seed/workspaces";
import { aria } from "@services/core/ai/corpus/aria";
import { fieldnotes } from "@services/core/ai/corpus/fieldnotes";
import { galleo } from "@services/core/ai/corpus/galleo";
import { helios } from "@services/core/ai/corpus/helios";
import { lumen } from "@services/core/ai/corpus/lumen";
import { slowweb } from "@services/core/ai/corpus/slowweb";
import { terra } from "@services/core/ai/corpus/terra";

const DAY = 86_400_000;
const HOUR = 3_600_000;
// negative = the future
const ago = (days: number): Date => new Date(Date.now() - days * DAY);
// must match WINDOW_MS in core/ledger.ts
const WINDOW_MS = 30 * DAY;
// must match INVITE_TTL_DAYS in core/workspaces.ts
const INVITE_TTL_DAYS = 14;

const handle = (email: string): string => email.split("@")[0] ?? email;

// must match hashToken in core/workspaces.ts (invites store only the hash)
const sha256 = (raw: string): string => createHash("sha256").update(raw).digest("hex");

// derived, not random, so the accept URL survives a reseed and can be pasted into /invite/:token
const inviteToken = (slug: string, email: string): string => `${slug}-${handle(email)}-demo`;

// The bodies only; their titles are seed data and live in seed/artifacts.ts beside the rest of it.
const CORPUS: Record<string, ArtifactContent> = {
    galleo,
    aria,
    terra,
    lumen,
    slowweb,
    helios,
    fieldnotes,
};

interface Doc {
    title: string;
    artifact: ArtifactContent;
}

function docFor(ref: DocRef): Doc {
    if ("corpus" in ref) {
        const artifact = CORPUS[ref.corpus];
        const title = CORPUS_TITLES[ref.corpus];
        if (!artifact || !title) throw new Error(`no corpus artifact "${ref.corpus}"`);
        return { title, artifact };
    }
    const t = TEMPLATE_INDEX.find((x) => x.id === ref.template);
    const artifact = templateBody(ref.template);
    if (!t || !artifact) throw new Error(`no template "${ref.template}"`);
    return { title: t.name, artifact };
}

// model ids come from the registry, so provenance can't name a model we no longer install
function genMetaFor(entry: DocEntry, doc: Doc): GenMeta | null {
    if (!entry.ai) return null;
    return {
        at: ago(entry.ai.daysAgo).toISOString(),
        models: { outline: modelFor("outline"), section: modelFor("section") },
        prompt: entry.ai.prompt,
        surface: entry.ai.surface,
        theme: doc.artifact.theme,
        length: "Standard",
    };
}

async function upsertUser(p: Person): Promise<string> {
    const patch = {
        name: p.name,
        avatarUrl: p.avatar,
        passwordHash: hashPassword(DEMO_PASSWORD),
        emailVerifiedAt: new Date(),
    };
    const [existing] = await db
        .select({ id: schema.users.id })
        .from(schema.users)
        .where(eq(schema.users.email, p.email));
    if (existing) {
        await db.update(schema.users).set(patch).where(eq(schema.users.id, existing.id));
        return existing.id;
    }
    const [created] = await db
        .insert(schema.users)
        .values({ email: p.email, ...patch })
        .returning({ id: schema.users.id });
    if (!created) throw new Error(`failed to create user "${p.email}"`);
    return created.id;
}

// Found by slug, then every column the spec owns is rewritten: a workspace that the app has been
// clicked around in must converge back onto the spec, not keep its drifted plan and counters.
async function upsertWorkspace(spec: WorkspaceSpec, ownerId: string): Promise<WorkspaceRow> {
    if (spec.windowStartedDaysAgo * DAY >= WINDOW_MS)
        throw new Error(
            `"${spec.slug}": credit window already lapsed; the first read would roll it`,
        );
    const [found] = await db
        .select({ id: schema.workspaces.id })
        .from(schema.workspaces)
        .where(eq(schema.workspaces.slug, spec.slug));
    const id =
        found?.id ??
        (
            await createWorkspaceForUser(ownerId, {
                name: spec.name,
                slug: spec.slug,
                plan: spec.plan,
            })
        ).id;

    const periodEnd = spec.periodEndInDays === undefined ? null : ago(-spec.periodEndInDays);
    const startedAt = ago(spec.windowStartedDaysAgo);
    const [row] = await db
        .update(schema.workspaces)
        .set({
            name: spec.name,
            ownerId,
            plan: spec.plan,
            seats: Math.max(spec.seats, planFor(spec.plan).billing.includedSeats),
            planStatus: spec.planStatus ?? "active",
            planPeriodEnd: periodEnd,
            cancelAtPeriodEnd: spec.cancelAtPeriodEnd ?? false,
            scheduledChange:
                spec.scheduledChange && periodEnd
                    ? { ...spec.scheduledChange, at: periodEnd.toISOString() }
                    : null,
            featureOverrides: spec.featureOverrides ?? null,
            // on for the demo, off for a real workspace until someone asks: a seeded piece should
            // already be ready to speak, since a demo is exactly where the wait would be noticed
            prepareAudio: spec.prepareAudio ?? true,
            aiCreditsBalance: 0, // seedLedger replays the real opening balance
            creditsStartedAt: startedAt,
            creditsResetAt: new Date(startedAt.getTime() + WINDOW_MS),
        })
        .where(eq(schema.workspaces.id, id))
        .returning();
    if (!row) throw new Error(`failed to write workspace "${spec.slug}"`);
    return row;
}

// FK-safe order. visits.ref has no FK (it spans artifacts and templates), so those rows are dropped
// by hand, the way core/artifacts.ts does on a real delete. eval_runs are left alone: the eval
// seeder owns them, and a workspace reseed must not destroy them.
async function wipeWorkspace(wsId: string): Promise<void> {
    const owned = await db
        .select({ id: schema.artifacts.id })
        .from(schema.artifacts)
        .where(eq(schema.artifacts.workspaceId, wsId));
    await db.delete(schema.chunks).where(eq(schema.chunks.workspaceId, wsId));
    await db.delete(schema.chatMessages).where(eq(schema.chatMessages.workspaceId, wsId));
    await db.delete(schema.contexts).where(eq(schema.contexts.workspaceId, wsId)); // items cascade
    if (owned.length)
        await db.delete(schema.visits).where(
            and(
                eq(schema.visits.kind, "artifact"),
                inArray(
                    schema.visits.ref,
                    owned.map((a) => a.id),
                ),
            ),
        );
    await db.delete(schema.credits).where(eq(schema.credits.workspaceId, wsId));
    await db.delete(schema.invites).where(eq(schema.invites.workspaceId, wsId));
    await db.delete(schema.artifacts).where(eq(schema.artifacts.workspaceId, wsId)); // links cascade
    await db.delete(schema.folders).where(eq(schema.folders.workspaceId, wsId));
    await db.delete(schema.assets).where(eq(schema.assets.workspaceId, wsId));
    await db.delete(schema.themes).where(eq(schema.themes.workspaceId, wsId));
}

// Reconciled rather than wiped, so members.created_at (the "joined" column, and currentWorkspace's
// fallback order) stays stable across reseeds.
async function syncMembers(
    wsId: string,
    ownerId: string,
    spec: WorkspaceSpec,
    ids: Map<string, string>,
): Promise<void> {
    const keep = [ownerId];
    await db
        .insert(schema.members)
        .values({ workspaceId: wsId, userId: ownerId, role: "owner" })
        .onConflictDoUpdate({
            target: [schema.members.workspaceId, schema.members.userId],
            set: { role: "owner" },
        });
    for (const m of spec.members) {
        const userId = ids.get(m.email);
        if (!userId) throw new Error(`no seeded user "${m.email}"`);
        keep.push(userId);
        await db
            .insert(schema.members)
            .values({ workspaceId: wsId, userId, role: m.role })
            .onConflictDoUpdate({
                target: [schema.members.workspaceId, schema.members.userId],
                set: { role: m.role },
            });
    }
    await db
        .delete(schema.members)
        .where(and(eq(schema.members.workspaceId, wsId), notInArray(schema.members.userId, keep)));
}

async function seedInvites(
    wsId: string,
    inviterId: string,
    spec: WorkspaceSpec,
): Promise<string[]> {
    const urls: string[] = [];
    for (const i of spec.invites ?? []) {
        const raw = inviteToken(spec.slug, i.email);
        await db.insert(schema.invites).values({
            workspaceId: wsId,
            email: i.email,
            role: i.role,
            tokenHash: sha256(raw),
            invitedBy: inviterId,
            expiresAt: ago(i.sentDaysAgo - INVITE_TTL_DAYS),
            createdAt: ago(i.sentDaysAgo),
        });
        urls.push(appUrl(`/invite/${raw}`));
    }
    return urls;
}

interface SeededDocs {
    byRef: Map<string, string>; // refKey → artifact id
    byTitle: Map<string, string>; // title → artifact id, for the contexts' artifactTitles
}

async function seedArtifacts(
    wsId: string,
    createdBy: string,
    spec: WorkspaceSpec,
): Promise<SeededDocs> {
    const byRef = new Map<string, string>();
    const byTitle = new Map<string, string>();
    let n = 0;
    for (const group of spec.folders ?? []) {
        let folderId: string | null = null;
        if (group.folder) {
            const [f] = await db
                .insert(schema.folders)
                .values({ workspaceId: wsId, name: group.folder })
                .returning({ id: schema.folders.id });
            folderId = f?.id ?? null;
        }
        for (const entry of group.docs) {
            const d = docFor(entry.ref);
            const touched = new Date(Date.now() - n * 9 * HOUR); // a varied library order
            const { columns, assetIds } = await contentColumns(wsId, d.artifact, db);
            const [row] = await db
                .insert(schema.artifacts)
                .values({
                    workspaceId: wsId,
                    title: d.title,
                    ...columns,
                    folderId,
                    createdBy,
                    aiMeta: genMetaFor(entry, d),
                    createdAt: new Date(touched.getTime() - 3 * DAY),
                    updatedAt: touched,
                })
                .returning({ id: schema.artifacts.id });
            if (row) {
                byRef.set(refKey(entry.ref), row.id);
                byTitle.set(d.title, row.id);
                await syncArtifactAssets(row.id, assetIds, db);
            }
            n++;
        }
    }
    for (const t of spec.trashed ?? []) {
        const d = docFor(t.ref);
        const { columns } = await contentColumns(wsId, d.artifact, db);
        await db.insert(schema.artifacts).values({
            workspaceId: wsId,
            title: d.title,
            ...columns,
            createdBy,
            createdAt: ago(t.daysAgo + 20),
            updatedAt: ago(t.daysAgo),
            trashedAt: ago(t.daysAgo),
        });
    }
    return { byRef, byTitle };
}

// Deterministic (index arithmetic, no RNG), so a reseed doesn't reshuffle the analytics chart.
function viewRows(
    linkId: string,
    slug: string,
    count: number,
    recipientId: string | null,
    offset: number,
): (typeof schema.linkViews.$inferInsert)[] {
    const rows: (typeof schema.linkViews.$inferInsert)[] = [];
    const total = 12;
    for (let i = 0; i < count; i++) {
        const seen = new Date(Date.now() - (6 + (i + offset) * 7) * HOUR);
        rows.push({
            linkId,
            recipientId,
            sessionKey: `seed:${slug}:${offset}:${i}`,
            referrer: REFERRERS[(i + offset) % REFERRERS.length] ?? "direct",
            device: (i + offset) % 4 === 0 ? "mobile" : "desktop",
            country: COUNTRIES[(i * 3 + offset) % COUNTRIES.length] ?? "US",
            viewedAt: seen,
            lastSeenAt: new Date(seen.getTime() + (40 + ((i * 37) % 260)) * 1000),
            maxUnit: (i * 5) % total, // 0-based; analyticsFor reads (max_unit + 1) / unit_total
            unitTotal: total,
        });
    }
    return rows;
}

async function seedLinks(spec: WorkspaceSpec, docs: SeededDocs): Promise<string[]> {
    const urls: string[] = [];
    for (const l of spec.links ?? []) {
        const artifactId = docs.byRef.get(refKey(l.ref));
        if (!artifactId)
            throw new Error(`"${spec.slug}": link "${l.slug}" names an artifact it does not seed`);
        const [link] = await db
            .insert(schema.links)
            .values({
                artifactId,
                slug: l.slug,
                name: l.name,
                visibility: l.visibility,
                password: l.password ? hashPassword(l.password) : null,
                createdAt: ago(l.createdDaysAgo),
            })
            .returning({ id: schema.links.id });
        if (!link) continue;
        urls.push(appUrl(`/p/${l.slug}`));

        const views = viewRows(link.id, l.slug, l.views ?? 0, null, 0);
        let offset = l.views ?? 0;
        for (const r of l.recipients ?? []) {
            // the recipient token is stored raw, so /p/<slug>?k=<token> is testable straight away
            const [rec] = await db
                .insert(schema.linkRecipients)
                .values({
                    linkId: link.id,
                    email: r.email,
                    token: `${l.slug}-${handle(r.email)}`,
                    message: "Sharing this ahead of Thursday.",
                    invitedAt: ago(l.createdDaysAgo),
                    lastViewedAt: r.views ? ago(1) : null,
                })
                .returning({ id: schema.linkRecipients.id });
            if (!rec) continue;
            views.push(...viewRows(link.id, l.slug, r.views, rec.id, offset));
            offset += r.views;
        }
        if (views.length) await db.insert(schema.linkViews).values(views);
    }
    return urls;
}

/**
 * Replays the spec's history oldest-first with the same arithmetic as the live code: a grant adds,
 * a pack adds, a charge subtracts, and nothing is ever cleared. So `balance_after` and
 * `ai_credits_balance` cannot disagree with the rows above them.
 */
async function seedLedger(
    ws: WorkspaceRow,
    spec: WorkspaceSpec,
    ids: Map<string, string>,
): Promise<{ balance: number }> {
    const grant = monthlyGrantFor(ws);
    let balance = spec.openingBalance ?? grant;
    const rows: (typeof schema.credits.$inferInsert)[] = [];
    for (const c of [...(spec.ledger ?? [])].sort((a, b) => b.at - a.at)) {
        const createdAt = ago(c.at);
        if (c.kind === "spend") {
            const userId = ids.get(c.by);
            if (!userId) throw new Error(`no seeded user "${c.by}"`);
            // the real gate refuses a charge it can't cover, so a spec that outspends is a spec bug
            if (c.credits > balance)
                throw new Error(
                    `"${spec.slug}": ledger overspends by ${c.credits - balance} credits; ` +
                        `lower the charges, raise the plan, or bank a pack`,
                );
            balance -= c.credits;
            rows.push({
                workspaceId: ws.id,
                userId,
                delta: -c.credits,
                reason: c.tool,
                usage: c.usage,
                balanceAfter: balance,
                createdAt,
            });
        } else if (c.kind === "topup") {
            if (!isCreditQuantity(c.credits))
                throw new Error(`"${spec.slug}": ${c.credits} is not a buyable credit quantity`);
            balance += c.credits;
            rows.push({
                workspaceId: ws.id,
                delta: c.credits,
                reason: "topup",
                balanceAfter: balance,
                createdAt,
            });
        } else {
            balance += grant;
            rows.push({
                workspaceId: ws.id,
                delta: grant,
                reason: "monthly-grant",
                balanceAfter: balance,
                createdAt,
            });
        }
    }
    if (rows.length) await db.insert(schema.credits).values(rows);
    await db
        .update(schema.workspaces)
        .set({ aiCreditsBalance: balance })
        .where(eq(schema.workspaces.id, ws.id));
    return { balance };
}

async function seedThemes(wsId: string, spec: WorkspaceSpec): Promise<void> {
    for (const t of spec.themes ?? []) {
        const base = THEMES[t.from];
        if (!base) throw new Error(`no built-in theme "${t.from}"`);
        await db.insert(schema.themes).values({
            workspaceId: wsId,
            name: t.name,
            tokens: { ...base.tokens, accent: t.accent },
            mood: t.mood,
            isDark: base.dark,
        });
    }
}

async function seedVisits(
    spec: WorkspaceSpec,
    docs: SeededDocs,
    userIds: Map<string, string>,
): Promise<void> {
    const demoId = userIds.get(DEMO_EMAIL);
    if (demoId)
        for (const [i, ref] of (spec.visits ?? []).entries()) {
            const artifactId = docs.byRef.get(refKey(ref));
            if (!artifactId)
                throw new Error(`"${spec.slug}": a visit names an artifact it does not seed`);
            await db
                .insert(schema.visits)
                .values({
                    userId: demoId,
                    kind: "artifact",
                    ref: artifactId,
                    uses: Math.max(1, 3 - i),
                    seenAt: ago(i + 1),
                })
                .onConflictDoNothing();
        }
    for (const t of spec.templateUses ?? []) {
        const userId = userIds.get(t.by);
        if (!userId) throw new Error(`no seeded user "${t.by}"`);
        await db
            .insert(schema.visits)
            .values({ userId, kind: "template", ref: t.templateId, uses: t.uses, seenAt: ago(2) })
            .onConflictDoUpdate({
                target: [schema.visits.userId, schema.visits.kind, schema.visits.ref],
                set: { uses: t.uses, seenAt: ago(2) },
            });
    }
}

async function seedAssets(wsId: string): Promise<void> {
    const now = Date.now();
    for (const [i, a] of DEMO_ASSETS.entries())
        await db
            .insert(schema.assets)
            .values({
                workspaceId: wsId,
                kind: "image",
                source: a.source,
                origin: a.url,
                width: a.w,
                height: a.h,
                alt: a.alt,
                meta: {
                    thumbUrl: `${a.url}?auto=compress&cs=tinysrgb&w=500`,
                    ...(a.author
                        ? {
                              attribution: {
                                  provider: "Pexels",
                                  author: a.author,
                                  authorUrl: "https://www.pexels.com",
                              },
                          }
                        : {}),
                },
                usedAt: new Date(now - i * HOUR), // newest first in the grid
            })
            .onConflictDoNothing();
}

// re-ingested through the real path (chunk → embed → pgvector), so demo retrieval behaves like
// user-fed material
async function seedContexts(wsId: string, userId: string, docs: SeededDocs): Promise<number> {
    let sources = 0;
    for (const plan of DEMO_CONTEXTS) {
        const { id } = await createContext(wsId, userId, plan.name, plan.description);
        for (const item of plan.items) {
            await addTextItem(wsId, id, userId, item.kind, item.title, item.body);
            sources++;
        }
        for (const title of plan.artifactTitles) {
            const artifactId = docs.byTitle.get(title);
            if (!artifactId) throw new Error(`no seeded artifact titled "${title}"`);
            await addArtifactItem(wsId, id, userId, artifactId);
            sources++;
        }
    }
    return sources;
}

/**
 * Remove what the demo universe used to hold. The seed upserts by slug and by email, so a workspace
 * or an account dropped from the specs would otherwise linger: still in the switcher, still able to
 * log in. Both lists are explicit rather than pattern-matched, because a real signup at a galleo.app
 * address must never be reapable.
 *
 * Runs before the specs are written, so a retired slug can be reused by a new workspace in the same
 * pass. A retired account is only deleted once nothing points at it, which is what the membership
 * and authorship clears below are for.
 */
async function reapRetired(): Promise<void> {
    const stale = await db
        .select({ id: schema.workspaces.id, name: schema.workspaces.name })
        .from(schema.workspaces)
        .where(inArray(schema.workspaces.slug, RETIRED_SLUGS));
    for (const ws of stale) {
        await wipeWorkspace(ws.id);
        await db.delete(schema.invites).where(eq(schema.invites.workspaceId, ws.id));
        await db.delete(schema.members).where(eq(schema.members.workspaceId, ws.id));
        // wipeWorkspace spares eval_runs on purpose, because a reseed must not destroy what the eval
        // seeder owns. A retirement is not a reseed: the row is going, and its runs reference it, so
        // they go with it or the delete below fails on the foreign key.
        await db.delete(schema.evalRuns).where(eq(schema.evalRuns.workspaceId, ws.id));
        await db.delete(schema.workspaces).where(eq(schema.workspaces.id, ws.id));
    }
    if (stale.length) log(`• reaped ${stale.length} retired workspaces`);

    const gone = await db
        .select({ id: schema.users.id })
        .from(schema.users)
        .where(inArray(schema.users.email, RETIRED_EMAILS));
    for (const u of gone) {
        await db.delete(schema.members).where(eq(schema.members.userId, u.id));
        await db.delete(schema.authTokens).where(eq(schema.authTokens.userId, u.id));
        await db.delete(schema.oauthAccounts).where(eq(schema.oauthAccounts.userId, u.id));
        await db.delete(schema.credits).where(eq(schema.credits.userId, u.id));
        // an artifact they authored outlives them; the column is nullable for exactly this
        await db
            .update(schema.artifacts)
            .set({ createdBy: null })
            .where(eq(schema.artifacts.createdBy, u.id));
        await db.delete(schema.users).where(eq(schema.users.id, u.id));
    }
    if (gone.length) log(`• reaped ${gone.length} retired accounts`);
}

async function seed(): Promise<void> {
    assertDatabaseUrl();
    await reapRetired();

    const userIds = new Map<string, string>();
    for (const p of PEOPLE) userIds.set(p.email, await upsertUser(p));
    log(`• ${PEOPLE.length} accounts (all password "${DEMO_PASSWORD}")`);

    const embed = embeddingReady();
    if (!embed) warn("• skipping contexts — no Google key, so nothing can be embedded");

    const links: string[] = [];
    const invites: string[] = [];
    for (const spec of WORKSPACES) {
        const ownerId = userIds.get(spec.ownerEmail);
        if (!ownerId) throw new Error(`no seeded user "${spec.ownerEmail}"`);
        const ws = await upsertWorkspace(spec, ownerId);
        await wipeWorkspace(ws.id);
        await syncMembers(ws.id, ownerId, spec, userIds);
        invites.push(...(await seedInvites(ws.id, ownerId, spec)));

        const docs = await seedArtifacts(ws.id, ownerId, spec);
        await seedThemes(ws.id, spec);
        links.push(...(await seedLinks(spec, docs)));
        await seedVisits(spec, docs, userIds);
        if (spec.assets) await seedAssets(ws.id);
        if (spec.contexts && embed) await seedContexts(ws.id, ownerId, docs);
        const { balance } = await seedLedger(ws, spec, userIds);

        const live = (spec.folders ?? []).reduce((n, g) => n + g.docs.length, 0);
        const role =
            spec.ownerEmail === DEMO_EMAIL
                ? "owner"
                : (spec.members.find((m) => m.email === DEMO_EMAIL)?.role ?? "—");
        const extra = ws.seats - planFor(spec.plan).billing.includedSeats;
        log(
            `• ${spec.name} (${spec.plan}, demo is ${role}) — ${live} artifacts, ` +
                `${spec.members.length + 1} members, ${balance} credits banked ` +
                `(+${monthlyGrantFor(ws)}/mo), ${ws.seats} seats${extra > 0 ? ` (+${extra})` : ""}`,
        );
    }

    // otherwise currentWorkspace falls back to the oldest membership, which is insertion-ordered
    for (const p of PEOPLE) {
        const home =
            WORKSPACES.find((w) => w.ownerEmail === p.email) ??
            WORKSPACES.find((w) => w.members.some((m) => m.email === p.email));
        const userId = userIds.get(p.email);
        if (!home || !userId) continue;
        const [ws] = await db
            .select({ id: schema.workspaces.id })
            .from(schema.workspaces)
            .where(eq(schema.workspaces.slug, home.slug));
        if (ws)
            await db
                .update(schema.users)
                .set({ activeWorkspaceId: ws.id })
                .where(eq(schema.users.id, userId));
    }

    // Adopted from the live library, not from a hardcoded list: the provider's Default voices expire
    // at the end of 2026. Without a key this is a no-op and narration simply stays unavailable.
    const allWorkspaces = await db
        .select({
            id: schema.workspaces.id,
            plan: schema.workspaces.plan,
            featureOverrides: schema.workspaces.featureOverrides,
        })
        .from(schema.workspaces);
    try {
        const adopted = await seedShelf(
            allWorkspaces.map((w) => ({
                id: w.id,
                cap: resolveFeatures(w.plan as PlanId, w.featureOverrides ?? undefined)
                    .maxWorkspaceVoices,
            })),
        );
        if (adopted) log(`• ${adopted} narration voices adopted and shelved`);
    } catch (e) {
        warn(`voices not seeded: ${e instanceof Error ? e.message : String(e)}`);
    }

    log(`\nLog in with:  ${DEMO_EMAIL}  /  ${DEMO_PASSWORD}`);
    if (invites.length) log(`Pending invites:\n  ${invites.join("\n  ")}`);
    if (links.length) log(`Published links:\n  ${links.join("\n  ")}`);
}

seed()
    .then(() => process.exit(0))
    .catch((e: unknown) => {
        warn(String(e));
        process.exit(1);
    });
