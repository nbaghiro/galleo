import Stripe from "stripe";
import { and, desc, eq, isNotNull, isNull, sql } from "drizzle-orm";
import type { ChangeEffect, Interval, PlanId } from "@model/billing";
import {
    canTopUp,
    clipGrant,
    CREDIT_PRESETS,
    CREDIT_PRICE_USD,
    featuresFor,
    grantFor,
    isCreditPreset,
    PLAN_ORDER,
    PLANS,
    planFor,
    planRank,
    rolloverCapFor,
} from "@model/billing";
import { estimateCost } from "@model/tools";
import { db } from "@services/db/client";
import { appUrl, warn } from "@services/utils/env";
import { capture, identifyWorkspace } from "@services/utils/analytics";
import { schema } from "@services/db/schema";
import type { WorkspaceRow } from "./accounts";
import { grantOnce, openWindow } from "./ledger";
import type { Tx } from "./ledger";
import { unitPricesFor } from "./models";

// Plans, subscriptions, credit purchases, and the Stripe webhook that keeps the workspace row in
// step with what Stripe believes. api/billing.ts is the HTTP surface; every decision lives here.

// pinned to the SDK's own version so account-level default changes can't shift wire shapes;
// stripe:setup registers the webhook endpoint on the same version for the same reason
export const STRIPE_API_VERSION = "2026-06-24.dahlia";

/** What consumeWebhook acts on; stripe:setup subscribes the endpoint to exactly these. */
export const WEBHOOK_EVENTS = [
    "checkout.session.completed",
    "checkout.session.async_payment_succeeded",
    "customer.subscription.updated",
    "customer.subscription.deleted",
] as const satisfies readonly Stripe.WebhookEndpointCreateParams.EnabledEvent[];

// lazy: built on first use so a missing key doesn't crash boot
let client: Stripe | undefined;

export function stripe(): Stripe {
    if (!client) {
        const key = process.env.STRIPE_SECRET_KEY;
        if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
        client = new Stripe(key, { apiVersion: STRIPE_API_VERSION });
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

// No cross-interval fallback: quietly booking monthly against an advertised annual price is a
// bait-and-switch, so an unconfigured interval refuses instead (the UI hides it via `intervals`).
export function priceIdFor(plan: PlanId, interval: Interval = "month"): string | undefined {
    const key = priceEnvKey(plan, interval);
    return (key ? process.env[key] : undefined) || undefined;
}

// One one-off price standing for ONE credit, bought by quantity, so any preset is purchasable
// without a price per size. Not recurring: a bought credit lands in the balance and carries over.
export function creditPriceId(): string | undefined {
    return process.env.STRIPE_PRICE_CREDIT || undefined;
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

/**
 * A subscription is one plan line. Anything unrecognised is ignored, which keeps a manually-added
 * Stripe line from being mistaken for the plan; `plan` is null when no line carries a price we
 * sell, an env misconfiguration the caller keeps the row's plan through.
 */
export interface SubShape {
    plan: PlanId | null;
    interval: Interval;
    itemId: string | null;
}

export function readSub(sub: Stripe.Subscription): SubShape {
    for (const item of sub.items.data) {
        const plan = planForPrice(item.price.id);
        if (plan)
            return { plan, interval: intervalForPrice(item.price.id) ?? "month", itemId: item.id };
    }
    return { plan: null, interval: "month", itemId: null };
}

// Stripe moved current_period_end onto the subscription item in recent API versions.
function subPeriodEnd(sub: Stripe.Subscription): Date | null {
    const ts = sub.items.data[0]?.current_period_end;
    return ts ? new Date(ts * 1000) : null;
}

export async function billingSummary(ws: WorkspaceRow) {
    const feats = featuresFor(ws);
    const [[artifactCount], [storage]] = await Promise.all([
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
    ]);
    const grant = grantFor(ws);
    return {
        plan: ws.plan,
        periodEnd: ws.planPeriodEnd,
        cancelAtPeriodEnd: ws.cancelAtPeriodEnd,
        interval: ws.planInterval ?? null,
        // which billing intervals this deployment can actually sell, so the client never offers one
        intervals: {
            month: !!(priceIdFor("pro", "month") && priceIdFor("premium", "month")),
            year: !!(priceIdFor("pro", "year") && priceIdFor("premium", "year")),
        },
        credits: {
            balance: ws.aiCreditsBalance,
            monthlyGrant: grant,
            perGeneration: estimateCost("generate-artifact", {}, unitPricesFor()),
            resetAt: ws.creditsResetAt,
            rolloverCap: rolloverCapFor(ws),
            // whether the next grant will land short; derived at read time, stored nowhere
            capped:
                clipGrant(grant, ws.aiCreditsBalance, ws.purchasedCredits, rolloverCapFor(ws)) <
                grant,
        },
        usage: {
            artifacts: Number(artifactCount?.n ?? 0),
            maxArtifacts: feats.maxArtifacts,
            storageMb: Math.round(Number(storage?.total ?? 0) / (1024 * 1024)),
            maxStorageMb: feats.storageMb,
        },
        catalog: PLAN_ORDER.map((id) => PLANS[id]),
        // what a credit costs to buy and the quantities offered as buttons; null when the plan
        // cannot buy them or the price is not configured
        creditSale:
            canTopUp(ws.plan) && creditPriceId()
                ? { usdPerCredit: CREDIT_PRICE_USD, presets: CREDIT_PRESETS }
                : null,
        stripeReady: stripeReady(),
        // a churned workspace keeps its customer, and with it the portal's invoice history
        hasCustomer: !!ws.stripeCustomerId,
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

export interface Wanted {
    plan?: PlanId;
    interval?: Interval;
}

export async function checkoutUrl(
    ws: WorkspaceRow,
    email: string,
    want: Wanted,
): Promise<string | null | { error: "invalid-plan" }> {
    if (!want.plan || want.plan === "free") return { error: "invalid-plan" };
    const interval = want.interval ?? "month";
    const price = priceIdFor(want.plan, interval);
    if (!price) return { error: "invalid-plan" };
    capture(payer(ws), "checkout_started", { target_plan: want.plan, interval });
    const customerId = await ensureCustomer(ws, email);
    const session = await stripe().checkout.sessions.create({
        mode: "subscription",
        customer: customerId,
        line_items: [{ price, quantity: 1 }],
        client_reference_id: ws.id,
        subscription_data: { metadata: { workspaceId: ws.id } },
        allow_promotion_codes: true,
        custom_text: {
            submit: { message: "Change or cancel your plan anytime from Billing." },
        },
        success_url: appUrl("/settings/plan?status=success"),
        // the plan rides along so a backed-out checkout can be attributed to what it was for
        cancel_url: appUrl(`/settings/plan?status=cancel&plan=${want.plan}`),
    });
    return session.url;
}

export type TopupResult =
    | { error: "invalid-quantity" }
    | { error: "not-configured" }
    | { url: string | null };

/**
 * Payment-mode Checkout for `credits` credits, bought once, so the webhook adds them to the balance
 * and ends. The quantity is the line item's, which is what the webhook reads back rather than
 * trusting a number we put in metadata.
 */
export async function topupUrl(
    ws: WorkspaceRow,
    email: string,
    credits: number | undefined,
): Promise<TopupResult> {
    if (credits === undefined || !isCreditPreset(credits)) return { error: "invalid-quantity" };
    const price = creditPriceId();
    if (!price) return { error: "not-configured" };
    const customerId = await ensureCustomer(ws, email);
    const session = await stripe().checkout.sessions.create({
        mode: "payment",
        customer: customerId,
        line_items: [{ price, quantity: credits }],
        client_reference_id: ws.id,
        metadata: { workspaceId: ws.id },
        success_url: appUrl("/settings/billing?status=topup-success"),
        // distinct from the plan checkout's cancel so a backed-out purchase is not counted as an
        // abandoned plan checkout
        cancel_url: appUrl("/settings/billing?status=topup-cancel"),
    });
    return { url: session.url };
}

export async function portalUrl(customerId: string): Promise<string | null> {
    const session = await stripe().billingPortal.sessions.create({
        customer: customerId,
        return_url: appUrl("/settings/billing"),
        ...(process.env.STRIPE_PORTAL_CONFIG
            ? { configuration: process.env.STRIPE_PORTAL_CONFIG }
            : {}),
    });
    return session.url;
}

export type ChangePlanResult =
    | { error: "no-item" }
    | { error: "invalid-plan" }
    | { effect: ChangeEffect };

// A move to Free cancels at period end; anything else applies now, invoiced when it buys more and
// prorated as a credit when it buys less. The webhook grants when the subscription starts granting
// more, so an upgrade pays now and gets its credits now.
export async function changePlan(
    ws: WorkspaceRow,
    subscriptionId: string,
    want: Wanted,
): Promise<ChangePlanResult> {
    if (want.plan === "free") {
        await stripe().subscriptions.update(subscriptionId, { cancel_at_period_end: true });
        // reflected immediately; the subscription.updated webhook re-syncs it authoritatively
        await db
            .update(schema.workspaces)
            .set({ cancelAtPeriodEnd: true })
            .where(eq(schema.workspaces.id, ws.id));
        return { effect: "cancel_at_period_end" };
    }

    const cur = readSub(await stripe().subscriptions.retrieve(subscriptionId));
    if (!cur.plan || !cur.itemId) return { error: "no-item" };
    const targetPlan = want.plan ?? cur.plan;
    const targetInterval = want.interval ?? cur.interval;
    const price = priceIdFor(targetPlan, targetInterval);
    if (!price) return { error: "invalid-plan" };

    const upgrading = planRank(targetPlan) > planRank(cur.plan);
    await stripe().subscriptions.update(subscriptionId, {
        items: [{ id: cur.itemId, price, quantity: 1 }],
        cancel_at_period_end: false,
        proration_behavior: upgrading ? "always_invoice" : "create_prorations",
    });
    await db
        .update(schema.workspaces)
        .set({ cancelAtPeriodEnd: false })
        .where(eq(schema.workspaces.id, ws.id));
    return { effect: upgrading ? "upgraded" : "changed" };
}

export async function resumeSubscription(ws: WorkspaceRow, subscriptionId: string): Promise<void> {
    // nothing parked, nothing to resume: no Stripe call, no downgrade_cancelled noise
    if (!ws.cancelAtPeriodEnd) return;
    capture(payer(ws), "downgrade_cancelled", { plan_id: planFor(ws.plan).id });
    await stripe().subscriptions.update(subscriptionId, { cancel_at_period_end: false });
    await db
        .update(schema.workspaces)
        .set({ cancelAtPeriodEnd: false })
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

export type WebhookResult = { error: string } | { received: true };

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
    // Network calls happen before the transaction so no DB connection is held across a round trip.
    // Subscription events sync from freshly retrieved state, not the event payload: any delivery —
    // duplicate, stale, or out of order — converges on what Stripe currently says.
    let checkoutSub: Stripe.Subscription | null = null;
    // How many credits a purchase bought, read off the line item Stripe actually charged for rather
    // than off metadata we wrote, so a tampered or stale session cannot mint credits.
    let boughtCredits = 0;
    let liveSub: Stripe.Subscription | null = null;
    if (
        event.type === "checkout.session.completed" ||
        event.type === "checkout.session.async_payment_succeeded"
    ) {
        const s = event.data.object as Stripe.Checkout.Session;
        const subId = typeof s.subscription === "string" ? s.subscription : s.subscription?.id;
        if (s.mode === "payment") {
            const items = await stripe().checkout.sessions.listLineItems(s.id, { limit: 100 });
            // only the credit line counts: a second one-off product sold through Checkout would
            // otherwise mint credits equal to its quantity
            const credit = creditPriceId();
            boughtCredits = items.data
                .filter((i) => !!credit && i.price?.id === credit)
                .reduce((n, i) => n + (i.quantity ?? 0), 0);
        } else if (subId) checkoutSub = await stripe().subscriptions.retrieve(subId);
    } else if (
        event.type === "customer.subscription.updated" ||
        event.type === "customer.subscription.deleted"
    ) {
        liveSub = await stripe().subscriptions.retrieve(
            (event.data.object as Stripe.Subscription).id,
        );
    }
    // No idempotency claim: sync effects converge on replay, and grants key their own ledger row
    // (credits.key), so a redelivery finds the row and applies nothing. A failure rolls the whole
    // transaction back and Stripe's retry re-runs it.
    await db.transaction((tx) => handleEvent(event, checkoutSub, liveSub, boughtCredits, tx));
    return { received: true };
}

// Grant paths read the row FOR UPDATE so concurrent deliveries serialize on the balance.
async function lockedWorkspace(tx: Tx, id: string): Promise<WorkspaceRow | null> {
    const [ws] = await tx
        .select()
        .from(schema.workspaces)
        .where(eq(schema.workspaces.id, id))
        .for("update");
    return ws ?? null;
}

// What the subscription bills per month, from Stripe's own amounts rather than our catalog, so a
// coupon or a legacy price reports what it really is. Annual is amortised.
function mrrOf(sub: Stripe.Subscription): number {
    let cents = 0;
    for (const item of sub.items.data) {
        const amount = item.price.unit_amount ?? 0;
        const qty = item.quantity ?? 1;
        cents += item.price.recurring?.interval === "year" ? (amount * qty) / 12 : amount * qty;
    }
    return Math.round(cents) / 100;
}

// A plan change has no acting person: it arrives by webhook. The owner is who pays, so it is theirs.
const payer = (ws: { id: string; ownerId: string }) => ({
    userId: ws.ownerId,
    workspaceId: ws.id,
});

/**
 * Sync the row from the live subscription, and open a fresh credit window when the subscription
 * now grants more than the row did: a checkout and a tier rise both mean paying now and getting
 * credits now. The grant claims `key`, so a redelivery syncs and grants nothing. The sync is a
 * set, so any delivery converges on what Stripe currently says.
 */
async function applySubscription(
    tx: Tx,
    ws: WorkspaceRow,
    sub: Stripe.Subscription,
    key: string,
    extra: Partial<typeof schema.workspaces.$inferInsert> = {},
): Promise<void> {
    const shape = readSub(sub);
    // an unmapped price is an env misconfiguration; keep the row's plan and say so
    if (!shape.plan) {
        warn(`[billing] no plan price on subscription ${sub.id}`);
        return;
    }
    const after = { ...ws, plan: shape.plan };
    const synced = {
        ...extra,
        plan: shape.plan,
        planInterval: shape.interval,
        stripeSubscriptionId: sub.id,
        planPeriodEnd: subPeriodEnd(sub),
        cancelAtPeriodEnd: sub.cancel_at_period_end,
    };
    // a redelivery finds its key claimed and grants nothing; the sync still has to land
    const opened =
        grantFor(after) > grantFor(ws)
            ? await openWindow(tx, after, key, "upgrade-grant", synced)
            : null;
    if (!opened)
        await tx.update(schema.workspaces).set(synced).where(eq(schema.workspaces.id, ws.id));

    // The group's own traits, not just the event: a plan change arrives with no client in the
    // request, so nothing else would refresh them until someone next opened the app.
    identifyWorkspace(ws.id, { plan_id: shape.plan });
    const from = planFor(ws.plan).id;
    const fromInterval = ws.planInterval ?? shape.interval;
    if (from !== shape.plan)
        capture(payer(ws), "plan_changed", {
            from_plan: from,
            to_plan: shape.plan,
            from_interval: fromInterval,
            to_interval: shape.interval,
            direction: planRank(shape.plan) > planRank(from) ? "upgrade" : "downgrade",
        });
    else if (fromInterval !== shape.interval)
        capture(payer(ws), "plan_changed", {
            from_plan: from,
            to_plan: shape.plan,
            from_interval: fromInterval,
            to_interval: shape.interval,
            direction: "interval",
        });
}

// Back to Free. Members stay and sit over the solo plan's member cap, soft-locked by the resolver's
// gates; banked credits are untouched, since they were granted or bought, not rented.
async function dropSubscription(tx: Tx, ws: WorkspaceRow): Promise<void> {
    await tx
        .update(schema.workspaces)
        .set({
            plan: "free",
            planInterval: null,
            stripeSubscriptionId: null,
            planPeriodEnd: null,
            cancelAtPeriodEnd: false,
        })
        .where(eq(schema.workspaces.id, ws.id));
    const [count] = await tx
        .select({ n: sql<string>`count(*)` })
        .from(schema.artifacts)
        .where(eq(schema.artifacts.workspaceId, ws.id));
    identifyWorkspace(ws.id, { plan_id: "free" });
    capture(payer(ws), "plan_cancelled", {
        plan_id: planFor(ws.plan).id,
        days_active: Math.round((Date.now() - ws.createdAt.getTime()) / (24 * 3_600_000)),
        artifacts_created: Number(count?.n ?? 0),
    });
}

async function handleEvent(
    event: Stripe.Event,
    checkoutSub: Stripe.Subscription | null,
    liveSub: Stripe.Subscription | null,
    boughtCredits: number,
    tx: Tx,
): Promise<void> {
    if (
        event.type === "checkout.session.completed" ||
        event.type === "checkout.session.async_payment_succeeded"
    ) {
        const s = event.data.object as Stripe.Checkout.Session;
        const wsId = s.client_reference_id ?? s.metadata?.workspaceId;
        if (!wsId) return;
        if (s.mode === "payment") {
            // A delayed method (bank debit) completes the session unpaid and settles later through
            // async_payment_succeeded, so the money has to have landed before the credits do. Both
            // events carry the same session id, and grantOnce keys on it, so only one can grant.
            if (boughtCredits <= 0 || s.payment_status !== "paid") return;
            // the session was created by our API, which offers the presets, but a session made any
            // other way reaches here too: re-check rather than grant an amount we would never sell
            if (!isCreditPreset(boughtCredits)) {
                warn(`[billing] refusing off-catalog credit purchase ${boughtCredits} on ${s.id}`);
                return;
            }
            const ws = await lockedWorkspace(tx, wsId);
            if (!ws) return;
            await grantOnce(tx, ws, {
                key: s.id,
                delta: boughtCredits,
                reason: "topup",
                // bought, not granted: the rollover clip's floor exempts this share
                also: { purchasedCredits: ws.purchasedCredits + boughtCredits },
            });
            capture(payer(ws), "topup_purchased", {
                credits: boughtCredits,
                usd: (s.amount_total ?? 0) / 100,
            });
            return;
        }
        if (!checkoutSub) return;
        const ws = await lockedWorkspace(tx, wsId);
        if (!ws) return;
        const customerId = typeof s.customer === "string" ? s.customer : (s.customer?.id ?? null);
        await applySubscription(tx, ws, checkoutSub, s.id, {
            stripeCustomerId: customerId ?? undefined,
        });
        const shape = readSub(checkoutSub);
        if (shape.plan)
            capture(payer(ws), "checkout_completed", {
                plan_id: shape.plan,
                interval: shape.interval,
                mrr_usd: mrrOf(checkoutSub),
            });
    } else if (
        event.type === "customer.subscription.updated" ||
        event.type === "customer.subscription.deleted"
    ) {
        const sub = liveSub;
        if (!sub) return;
        const [bySub] = await tx
            .select()
            .from(schema.workspaces)
            .where(eq(schema.workspaces.stripeSubscriptionId, sub.id))
            .for("update");
        let ws: WorkspaceRow | null = bySub ?? null;
        // A missed checkout.completed leaves the sub unlinked; adopt it only onto a workspace with
        // NO current sub, so a stale event can't hijack a newer one.
        if (!ws && sub.metadata?.workspaceId) {
            const cand = await lockedWorkspace(tx, sub.metadata.workspaceId);
            if (cand && !cand.stripeSubscriptionId) ws = cand;
        }
        if (!ws) return;
        // a live status of canceled means the subscription is gone (deleted, or an update racing
        // a deletion)
        if (sub.status === "canceled" || sub.status === "incomplete_expired")
            await dropSubscription(tx, ws);
        else await applySubscription(tx, ws, sub, `sub:${event.id}`);
    }
}
