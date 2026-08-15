import Stripe from "stripe";
import { and, desc, eq, gt, isNotNull, isNull, sql } from "drizzle-orm";
import type { CreditPackId, Interval, PlanId, ScheduledChange } from "@model/billing";
import {
    CREDIT_PACKS,
    CREDITS_PER_GENERATION,
    creditLimitFor,
    featuresFor,
    limitsFor,
    packFor,
    planFor,
    visiblePlans,
} from "@model/billing";
import { db } from "@services/db/client";
import { warn } from "@services/utils/env";
import { schema } from "@services/db/schema";
import { appUrl } from "@services/utils/env";
import type { WorkspaceRow } from "./accounts";

// Plans, subscriptions, credit packs, and the Stripe webhook that keeps the workspace row in step
// with what Stripe believes. api/billing.ts is the HTTP surface; every decision lives here.

// lazy: built on first use so a missing key doesn't crash boot
let client: Stripe | undefined;

export function stripe(): Stripe {
    if (!client) {
        const key = process.env.STRIPE_SECRET_KEY;
        if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
        // pinned to the SDK's own version so account-level default changes can't shift wire shapes
        client = new Stripe(key, { apiVersion: "2026-06-24.dahlia" });
    }
    return client;
}

export function stripeReady(): boolean {
    return !!(
        process.env.STRIPE_SECRET_KEY &&
        process.env.STRIPE_PRICE_PRO_MONTH &&
        process.env.STRIPE_PRICE_PREMIUM_MONTH
    );
}

function priceEnvKey(plan: PlanId, interval: Interval): string | null {
    if (plan === "pro")
        return interval === "year" ? "STRIPE_PRICE_PRO_YEAR" : "STRIPE_PRICE_PRO_MONTH";
    if (plan === "premium")
        return interval === "year" ? "STRIPE_PRICE_PREMIUM_YEAR" : "STRIPE_PRICE_PREMIUM_MONTH";
    return null;
}

export function priceIdFor(plan: PlanId, interval: Interval = "month"): string | undefined {
    const key = priceEnvKey(plan, interval);
    const id = key ? process.env[key] : undefined;
    if (id) return id;
    // annual missing → fall back to monthly so checkout still works
    return interval === "year" ? priceIdFor(plan, "month") : undefined;
}

const PACK_ENV: Record<CreditPackId, string> = {
    "pack-1k": "STRIPE_PRICE_PACK_1K",
    "pack-5k": "STRIPE_PRICE_PACK_5K",
};

export function packPriceId(pack: CreditPackId): string | undefined {
    return process.env[PACK_ENV[pack]] || undefined;
}

function priceMap(): Array<{ id: string; plan: PlanId; interval: Interval }> {
    const rows: Array<[PlanId, Interval, string | undefined]> = [
        ["pro", "month", process.env.STRIPE_PRICE_PRO_MONTH],
        ["pro", "year", process.env.STRIPE_PRICE_PRO_YEAR],
        ["premium", "month", process.env.STRIPE_PRICE_PREMIUM_MONTH],
        ["premium", "year", process.env.STRIPE_PRICE_PREMIUM_YEAR],
    ];
    return rows
        .filter((r): r is [PlanId, Interval, string] => !!r[2])
        .map(([plan, interval, id]) => ({ id, plan, interval }));
}

export function planForPrice(priceId: string | undefined | null): PlanId | null {
    if (!priceId) return null;
    return priceMap().find((p) => p.id === priceId)?.plan ?? null;
}

export function intervalForPrice(priceId: string | undefined | null): Interval | null {
    if (!priceId) return null;
    return priceMap().find((p) => p.id === priceId)?.interval ?? null;
}

const monthOut = (): Date => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
const RANK: Record<PlanId, number> = { free: 0, pro: 1, premium: 2 };

// Stripe moved current_period_end onto the subscription item in recent API versions; month-out fallback.
function subPeriodEnd(sub: Stripe.Subscription): Date {
    const ts = sub.items.data[0]?.current_period_end;
    return ts ? new Date(ts * 1000) : monthOut();
}

// The caller's net spend since the window opened: charges minus refunds. Only user-attributed rows
// exist for spends/settles (grants and resets are system rows), so a plain sum nets naturally.
async function spendThisCycle(ws: WorkspaceRow, userId: string): Promise<number> {
    const [row] = await db
        .select({ total: sql<string>`COALESCE(SUM(-${schema.credits.delta}), 0)` })
        .from(schema.credits)
        .where(
            and(
                eq(schema.credits.workspaceId, ws.id),
                eq(schema.credits.userId, userId),
                gt(schema.credits.createdAt, ws.creditsStartedAt),
            ),
        );
    return Math.max(0, Number(row?.total ?? 0));
}

export async function billingSummary(ws: WorkspaceRow, userId: string) {
    const limits = limitsFor(ws.plan);
    const capMb = featuresFor(ws).storageMb; // overrides can widen storage per workspace
    const [[artifactCount], [storage], mySpend] = await Promise.all([
        db
            .select({ n: sql<string>`count(*)` })
            .from(schema.artifacts)
            .where(
                and(eq(schema.artifacts.workspaceId, ws.id), isNull(schema.artifacts.trashedAt)),
            ),
        db
            .select({ total: sql<string>`COALESCE(SUM(${schema.assets.bytes}), 0)` })
            .from(schema.assets)
            .where(and(eq(schema.assets.workspaceId, ws.id), isNotNull(schema.assets.data))),
        spendThisCycle(ws, userId),
    ]);
    return {
        plan: ws.plan,
        status: ws.planStatus,
        periodEnd: ws.planPeriodEnd,
        cancelAtPeriodEnd: ws.cancelAtPeriodEnd,
        credits: {
            used: ws.aiCreditsUsed,
            limit: creditLimitFor(ws),
            bonus: ws.aiCreditsBonus,
            perGeneration: CREDITS_PER_GENERATION,
            resetAt: ws.creditsResetAt,
            mySpend,
        },
        topUps: planFor(ws.plan).ai.creditTopUpsAllowed
            ? CREDIT_PACKS.filter((p) => !!packPriceId(p.id))
            : [],
        usage: {
            artifacts: Number(artifactCount?.n ?? 0),
            maxArtifacts: limits.maxArtifacts,
            storageMb: Math.round(Number(storage?.total ?? 0) / (1024 * 1024)),
            maxStorageMb: capMb,
        },
        seats: ws.seats,
        scheduledChange: ws.scheduledChange ?? null,
        catalog: visiblePlans(),
        stripeReady: stripeReady(),
    };
}

async function ensureCustomer(
    ws: { id: string; name: string; stripeCustomerId: string | null },
    email: string,
): Promise<string> {
    if (ws.stripeCustomerId) return ws.stripeCustomerId;
    const customer = await stripe().customers.create({
        email,
        name: ws.name,
        metadata: { workspaceId: ws.id },
    });
    await db
        .update(schema.workspaces)
        .set({ stripeCustomerId: customer.id })
        .where(eq(schema.workspaces.id, ws.id));
    return customer.id;
}

export async function checkoutUrl(
    ws: WorkspaceRow,
    email: string,
    want: { plan?: PlanId; interval?: Interval; seats?: number },
): Promise<string | null | { error: "invalid-plan" }> {
    if (!want.plan || want.plan === "free") return { error: "invalid-plan" };
    const price = priceIdFor(want.plan, want.interval ?? "month");
    if (!price) return { error: "invalid-plan" };
    const p = planFor(want.plan);
    const quantity =
        p.billing.model === "per_seat"
            ? Math.max(want.seats ?? p.billing.minSeats, p.billing.minSeats)
            : 1;
    const customerId = await ensureCustomer(ws, email);
    const session = await stripe().checkout.sessions.create({
        mode: "subscription",
        customer: customerId,
        line_items: [{ price, quantity }],
        client_reference_id: ws.id,
        subscription_data: {
            metadata: { workspaceId: ws.id },
            // 0 in the catalog today; activeStatus already maps "trialing" → active if we set one.
            ...(p.billing.trialDays > 0 ? { trial_period_days: p.billing.trialDays } : {}),
        },
        allow_promotion_codes: true,
        custom_text: {
            submit: { message: "Change or cancel your plan anytime from Billing." },
        },
        success_url: appUrl("/pricing?status=success"),
        cancel_url: appUrl("/pricing?status=cancel"),
    });
    return session.url;
}

export type TopupResult =
    | { error: "invalid-pack" }
    | { error: "not-configured" }
    | { url: string | null };

// Payment-mode Checkout; the webhook grants the credits on completion.
export async function topupUrl(
    ws: WorkspaceRow,
    email: string,
    packId: CreditPackId | undefined,
): Promise<TopupResult> {
    const pack = packFor(packId);
    if (!pack) return { error: "invalid-pack" };
    const price = packPriceId(pack.id);
    if (!price) return { error: "not-configured" };
    const customerId = await ensureCustomer(ws, email);
    const session = await stripe().checkout.sessions.create({
        mode: "payment",
        customer: customerId,
        line_items: [{ price, quantity: 1 }],
        client_reference_id: ws.id,
        metadata: { workspaceId: ws.id, pack: pack.id },
        success_url: appUrl("/pricing?status=topup-success"),
        cancel_url: appUrl("/pricing?status=cancel"),
    });
    return { url: session.url };
}

export async function portalUrl(customerId: string): Promise<string | null> {
    const session = await stripe().billingPortal.sessions.create({
        customer: customerId,
        return_url: appUrl("/pricing"),
        ...(process.env.STRIPE_PORTAL_CONFIG
            ? { configuration: process.env.STRIPE_PORTAL_CONFIG }
            : {}),
    });
    return session.url;
}

export type ChangePlanResult =
    | { error: "no-item" }
    | { error: "invalid-plan" }
    | { error: "seats-below-members"; members: number }
    | { effect: "cancel_at_period_end" | "upgraded" | "changed" | "scheduled"; at?: string };

// Downgrade to Free cancels at period end; an upgrade invoices immediately, other changes prorate.
export async function changePlan(
    ws: WorkspaceRow,
    subscriptionId: string,
    want: { plan?: PlanId; interval?: Interval; seats?: number },
): Promise<ChangePlanResult> {
    if (want.plan === "free") {
        await stripe().subscriptions.update(subscriptionId, { cancel_at_period_end: true });
        // Reflect immediately; the subscription.updated webhook re-syncs it authoritatively.
        await db
            .update(schema.workspaces)
            .set({ cancelAtPeriodEnd: true })
            .where(eq(schema.workspaces.id, ws.id));
        return { effect: "cancel_at_period_end" };
    }

    const sub = await stripe().subscriptions.retrieve(subscriptionId);
    const item = sub.items.data[0];
    if (!item) return { error: "no-item" };
    const curPlan = planForPrice(item.price.id) ?? ((ws.plan ?? "free") as PlanId);
    const curInterval = intervalForPrice(item.price.id) ?? "month";
    const curSeats = item.quantity ?? 1;

    const targetPlan = want.plan ?? curPlan;
    const targetInterval = want.interval ?? curInterval;
    const tp = planFor(targetPlan);
    const targetSeats =
        tp.billing.model === "per_seat" ? Math.max(want.seats ?? curSeats, tp.billing.minSeats) : 1;
    const newPrice = priceIdFor(targetPlan, targetInterval);
    if (!newPrice) return { error: "invalid-plan" };

    // seats can't drop below the people using or holding them — an unexpired invite reserves its seat
    if (tp.billing.model === "per_seat" && targetSeats < curSeats) {
        const [memberRows, invites] = await Promise.all([
            db
                .select({ userId: schema.members.userId })
                .from(schema.members)
                .where(eq(schema.members.workspaceId, ws.id)),
            db
                .select({ id: schema.invites.id })
                .from(schema.invites)
                .where(
                    and(
                        eq(schema.invites.workspaceId, ws.id),
                        isNull(schema.invites.acceptedAt),
                        gt(schema.invites.expiresAt, new Date()),
                    ),
                ),
        ]);
        const held = memberRows.length + invites.length;
        if (targetSeats < held) return { error: "seats-below-members", members: held };
    }

    // What you paid for, you keep: a lower tier or fewer seats waits for the period boundary via a
    // subscription schedule; more capability (or an interval switch alone) applies now, prorated.
    const downgrade = RANK[targetPlan] < RANK[curPlan] || targetSeats < curSeats;
    if (downgrade) {
        const at = subPeriodEnd(sub);
        const schedule =
            sub.schedule && typeof sub.schedule === "string"
                ? sub.schedule
                : (await stripe().subscriptionSchedules.create({ from_subscription: sub.id })).id;
        await stripe().subscriptionSchedules.update(schedule, {
            end_behavior: "release",
            phases: [
                {
                    items: [{ price: item.price.id, quantity: curSeats }],
                    end_date: Math.floor(at.getTime() / 1000),
                },
                { items: [{ price: newPrice, quantity: targetSeats }] },
            ],
        });
        const scheduledChange: ScheduledChange = {
            plan: targetPlan,
            interval: targetInterval,
            seats: targetSeats,
            at: at.toISOString(),
        };
        await db
            .update(schema.workspaces)
            .set({ scheduledChange, cancelAtPeriodEnd: false })
            .where(eq(schema.workspaces.id, ws.id));
        return { effect: "scheduled", at: scheduledChange.at };
    }

    const upgrading = RANK[targetPlan] > RANK[curPlan] || targetSeats > curSeats;
    await stripe().subscriptions.update(subscriptionId, {
        items: [{ id: item.id, price: newPrice, quantity: targetSeats }],
        cancel_at_period_end: false,
        proration_behavior: upgrading ? "always_invoice" : "create_prorations",
    });
    await db
        .update(schema.workspaces)
        .set({ cancelAtPeriodEnd: false, scheduledChange: null })
        .where(eq(schema.workspaces.id, ws.id));
    return { effect: upgrading ? "upgraded" : "changed" };
}

// Resume clears both parking lots: the Free cancellation and any scheduled downgrade.
export async function resumeSubscription(ws: WorkspaceRow, subscriptionId: string): Promise<void> {
    if (ws.scheduledChange) {
        const sub = await stripe().subscriptions.retrieve(subscriptionId);
        if (sub.schedule && typeof sub.schedule === "string")
            await stripe().subscriptionSchedules.release(sub.schedule);
    }
    await stripe().subscriptions.update(subscriptionId, { cancel_at_period_end: false });
    await db
        .update(schema.workspaces)
        .set({ cancelAtPeriodEnd: false, scheduledChange: null })
        .where(eq(schema.workspaces.id, ws.id));
}

const LEDGER_PAGE = 30;

export async function creditLedger(workspaceId: string, cursor?: { at: Date; id: string } | null) {
    const rows = await db
        .select({
            id: schema.credits.id,
            delta: schema.credits.delta,
            reason: schema.credits.reason,
            usage: schema.credits.usage,
            balanceAfter: schema.credits.balanceAfter,
            at: schema.credits.createdAt,
            userName: schema.users.name,
            userEmail: schema.users.email,
            userAvatar: schema.users.avatarUrl,
        })
        .from(schema.credits)
        .leftJoin(schema.users, eq(schema.users.id, schema.credits.userId))
        .where(
            and(
                eq(schema.credits.workspaceId, workspaceId),
                cursor
                    ? sql`(${schema.credits.createdAt}, ${schema.credits.id}) < (${cursor.at.toISOString()}::timestamp, ${cursor.id}::uuid)`
                    : undefined,
            ),
        )
        .orderBy(desc(schema.credits.createdAt), desc(schema.credits.id))
        .limit(LEDGER_PAGE + 1);
    const page = rows.slice(0, LEDGER_PAGE);
    const last = page.at(-1);
    return {
        entries: page.map((r) => ({
            delta: r.delta,
            reason: r.reason,
            usage: r.usage,
            balanceAfter: r.balanceAfter,
            at: r.at,
            user: r.userEmail
                ? { name: r.userName, email: r.userEmail, avatarUrl: r.userAvatar }
                : null,
        })),
        nextCursor:
            rows.length > LEDGER_PAGE && last
                ? Buffer.from(JSON.stringify({ at: last.at.toISOString(), id: last.id })).toString(
                      "base64url",
                  )
                : null,
    };
}

export type WebhookResult = { error: string } | { duplicate: boolean };

// Unauthenticated at the edge but signature-verified here; the RAW body bytes are required.
export async function consumeWebhook(
    rawBody: string,
    signature: string | undefined,
): Promise<WebhookResult> {
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!signature || !secret) return { error: "webhook not configured" };
    let event: Stripe.Event;
    try {
        event = stripe().webhooks.constructEvent(rawBody, signature, secret);
    } catch {
        return { error: "bad signature" };
    }
    // Fetched before the claim transaction so no DB connection is held across a network call.
    let checkoutSub: Stripe.Subscription | null = null;
    let supersededSubId: string | null = null;
    if (event.type === "checkout.session.completed") {
        const s = event.data.object as Stripe.Checkout.Session;
        const subId = typeof s.subscription === "string" ? s.subscription : s.subscription?.id;
        if (s.mode !== "payment" && subId) {
            checkoutSub = await stripe().subscriptions.retrieve(subId);
            const wsId = s.client_reference_id ?? s.metadata?.workspaceId;
            if (wsId) {
                const [ws] = await db
                    .select({ subId: schema.workspaces.stripeSubscriptionId })
                    .from(schema.workspaces)
                    .where(eq(schema.workspaces.id, wsId));
                if (ws?.subId && ws.subId !== subId) supersededSubId = ws.subId;
            }
        }
    }
    // Claim + effects in ONE transaction: a redelivery finds the claim and no-ops, and any failure
    // rolls the claim back so Stripe's retry re-runs it.
    const duplicate = await db.transaction(async (tx) => {
        const [claimed] = await tx
            .insert(schema.stripeEvents)
            .values({ id: event.id, type: event.type })
            .onConflictDoNothing()
            .returning({ id: schema.stripeEvents.id });
        if (!claimed) return true;
        await handleEvent(event, checkoutSub, tx);
        return false;
    });
    // A checkout that replaced a live subscription leaves the old one billing with no workspace
    // attached; cancel it. Best-effort — a failure here is Stripe state to clean up, not a webhook 500.
    if (!duplicate && supersededSubId) {
        try {
            await stripe().subscriptions.cancel(supersededSubId);
            warn(`[billing] canceled superseded subscription ${supersededSubId}`);
        } catch (e) {
            warn(
                `[billing] failed to cancel superseded sub ${supersededSubId}: ${e instanceof Error ? e.message : "unknown"}`,
            );
        }
    }
    return { duplicate };
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

const activeStatus = (s: Stripe.Subscription.Status): string =>
    s === "active" || s === "trialing" ? "active" : s === "past_due" ? "past_due" : "canceled";

async function workspaceBySubId(tx: Tx, subId: string) {
    const [ws] = await tx
        .select()
        .from(schema.workspaces)
        .where(eq(schema.workspaces.stripeSubscriptionId, subId));
    return ws ?? null;
}

async function workspaceByCustomer(tx: Tx, customerId: string) {
    const [ws] = await tx
        .select()
        .from(schema.workspaces)
        .where(eq(schema.workspaces.stripeCustomerId, customerId));
    return ws ?? null;
}

const seatsOf = (sub: Stripe.Subscription): number => sub.items.data[0]?.quantity ?? 1;
const invCustomer = (inv: Stripe.Invoice): string | null =>
    typeof inv.customer === "string" ? inv.customer : (inv.customer?.id ?? null);

// Sub events guard on the workspace whose CURRENT sub this is, so a stale update can't resurrect a plan.
async function handleEvent(
    event: Stripe.Event,
    checkoutSub: Stripe.Subscription | null,
    tx: Tx,
): Promise<void> {
    if (event.type === "checkout.session.completed") {
        const s = event.data.object as Stripe.Checkout.Session;
        const wsId = s.client_reference_id ?? s.metadata?.workspaceId;
        const customerId = typeof s.customer === "string" ? s.customer : (s.customer?.id ?? null);
        if (s.mode === "payment") {
            // Re-derive the grant from the catalog — never trust a stale metadata credit count.
            const pack = packFor(s.metadata?.pack);
            if (!wsId || !pack) return;
            const [after] = await tx
                .update(schema.workspaces)
                .set({
                    aiCreditsBonus: sql`${schema.workspaces.aiCreditsBonus} + ${pack.credits}`,
                })
                .where(eq(schema.workspaces.id, wsId))
                .returning();
            if (after)
                await tx.insert(schema.credits).values({
                    workspaceId: wsId,
                    delta: pack.credits,
                    reason: `topup:${pack.id}`,
                    balanceAfter:
                        Math.max(0, creditLimitFor(after) - after.aiCreditsUsed) +
                        after.aiCreditsBonus,
                });
            return;
        }
        if (!wsId || !checkoutSub) return;
        const sub = checkoutSub;
        const plan = planForPrice(sub.items.data[0]?.price.id);
        if (!plan) return;
        const [before] = await tx
            .select()
            .from(schema.workspaces)
            .where(eq(schema.workspaces.id, wsId))
            .for("update");
        if (!before) return;
        await tx
            .update(schema.workspaces)
            .set({
                plan,
                planStatus: activeStatus(sub.status),
                stripeCustomerId: customerId ?? undefined,
                stripeSubscriptionId: sub.id,
                seats: seatsOf(sub),
                planPeriodEnd: subPeriodEnd(sub),
                cancelAtPeriodEnd: sub.cancel_at_period_end,
                aiCreditsUsed: 0,
                creditsStartedAt: new Date(),
                creditsResetAt: monthOut(),
                scheduledChange: null,
            })
            .where(eq(schema.workspaces.id, wsId));
        // the wiped usage leaves an audit trail like every other reset
        if (before.aiCreditsUsed > 0)
            await tx.insert(schema.credits).values({
                workspaceId: wsId,
                delta: before.aiCreditsUsed,
                reason: "upgrade-reset",
                balanceAfter:
                    creditLimitFor({ ...before, plan, seats: seatsOf(sub) }) +
                    before.aiCreditsBonus,
            });
    } else if (event.type === "customer.subscription.updated") {
        const sub = event.data.object as Stripe.Subscription;
        let ws = await workspaceBySubId(tx, sub.id);
        // A missed checkout.completed leaves the sub unlinked; adopt it only onto a workspace with
        // NO current sub, so a stale event can't hijack a newer one.
        if (!ws && sub.metadata?.workspaceId) {
            const [cand] = await tx
                .select()
                .from(schema.workspaces)
                .where(eq(schema.workspaces.id, sub.metadata.workspaceId));
            if (cand && !cand.stripeSubscriptionId) ws = cand;
        }
        if (!ws) return;
        const plan = planForPrice(sub.items.data[0]?.price.id);
        // a scheduled downgrade has landed once the sub matches what was parked
        const sc = ws.scheduledChange;
        const scheduleDone = !!sc && sc.plan === plan && sc.seats === seatsOf(sub);
        await tx
            .update(schema.workspaces)
            .set({
                ...(plan ? { plan } : {}),
                planStatus: activeStatus(sub.status),
                stripeSubscriptionId: sub.id,
                seats: seatsOf(sub),
                planPeriodEnd: subPeriodEnd(sub),
                cancelAtPeriodEnd: sub.cancel_at_period_end,
                ...(scheduleDone ? { scheduledChange: null } : {}),
            })
            .where(eq(schema.workspaces.id, ws.id));
    } else if (event.type === "customer.subscription.deleted") {
        const sub = event.data.object as Stripe.Subscription;
        const ws = await workspaceBySubId(tx, sub.id);
        if (!ws) return;
        // Back to Free; data kept, over-limit use soft-locked by the resolver's gates.
        await tx
            .update(schema.workspaces)
            .set({
                plan: "free",
                planStatus: "canceled",
                stripeSubscriptionId: null,
                seats: 1,
                planPeriodEnd: null,
                cancelAtPeriodEnd: false,
                scheduledChange: null,
            })
            .where(eq(schema.workspaces.id, ws.id));
    } else if (event.type === "invoice.payment_failed") {
        const customerId = invCustomer(event.data.object as Stripe.Invoice);
        const ws = customerId ? await workspaceByCustomer(tx, customerId) : null;
        if (ws)
            await tx
                .update(schema.workspaces)
                .set({ planStatus: "past_due" })
                .where(eq(schema.workspaces.id, ws.id));
    } else if (event.type === "invoice.paid") {
        const inv = event.data.object as Stripe.Invoice;
        const customerId = invCustomer(inv);
        const ws = customerId ? await workspaceByCustomer(tx, customerId) : null;
        if (!ws) return;
        if (inv.billing_reason === "subscription_cycle") {
            // Only a cycle renewal opens a fresh credit window; other invoices just clear dunning.
            await tx
                .update(schema.workspaces)
                .set({
                    planStatus: "active",
                    aiCreditsUsed: 0,
                    creditsStartedAt: new Date(),
                    creditsResetAt: monthOut(),
                })
                .where(eq(schema.workspaces.id, ws.id));
            if (ws.aiCreditsUsed > 0)
                await tx.insert(schema.credits).values({
                    workspaceId: ws.id,
                    delta: ws.aiCreditsUsed,
                    reason: "renewal-reset",
                    balanceAfter: creditLimitFor(ws) + ws.aiCreditsBonus,
                });
        } else if (ws.planStatus === "past_due") {
            await tx
                .update(schema.workspaces)
                .set({ planStatus: "active" })
                .where(eq(schema.workspaces.id, ws.id));
        }
    }
}
