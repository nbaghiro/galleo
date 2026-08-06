import Stripe from "stripe";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import type { CreditPackId, Interval, PlanId } from "@model/billing";
import {
    CREDIT_PACKS,
    CREDITS_PER_GENERATION,
    creditLimitFor,
    limitsFor,
    packFor,
    planFor,
    visiblePlans,
} from "@model/billing";
import type { MeterParams, ToolId, Usage } from "@model/credits";
import { costOf, describeUsage, estimateCost } from "@model/credits";
import { db } from "../db/client";
import { schema } from "../db/schema";
import { appUrl } from "../utils/env";
import { chargeCredits } from "./credits";
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

export async function billingSummary(ws: WorkspaceRow) {
    const limits = limitsFor(ws.plan);
    const rows = await db
        .select({ id: schema.artifacts.id })
        .from(schema.artifacts)
        .where(and(eq(schema.artifacts.workspaceId, ws.id), isNull(schema.artifacts.trashedAt)));
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
        },
        topUps: planFor(ws.plan).ai.creditTopUpsAllowed
            ? CREDIT_PACKS.filter((p) => !!packPriceId(p.id))
            : [],
        usage: { artifacts: rows.length, maxArtifacts: limits.maxArtifacts },
        seats: ws.seats,
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
    | { effect: "cancel_at_period_end" | "upgraded" | "changed" };

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

    // seats can't drop below the people using them — remove members first
    if (tp.billing.model === "per_seat" && targetSeats < curSeats) {
        const memberRows = await db
            .select({ userId: schema.members.userId })
            .from(schema.members)
            .where(eq(schema.members.workspaceId, ws.id));
        if (targetSeats < memberRows.length)
            return { error: "seats-below-members", members: memberRows.length };
    }

    const upgrading = RANK[targetPlan] > RANK[curPlan] || targetSeats > curSeats;
    await stripe().subscriptions.update(subscriptionId, {
        items: [{ id: item.id, price: newPrice, quantity: targetSeats }],
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
    await stripe().subscriptions.update(subscriptionId, { cancel_at_period_end: false });
    await db
        .update(schema.workspaces)
        .set({ cancelAtPeriodEnd: false })
        .where(eq(schema.workspaces.id, ws.id));
}

export async function creditLedger(workspaceId: string) {
    const rows = await db
        .select()
        .from(schema.credits)
        .where(eq(schema.credits.workspaceId, workspaceId))
        .orderBy(desc(schema.credits.createdAt))
        .limit(50);
    return rows.map((r) => ({
        delta: r.delta,
        reason: r.reason,
        balanceAfter: r.balanceAfter,
        at: r.createdAt,
    }));
}

// A spend can be priced three ways: from measured usage, from a tool id + meter, or as a flat amount.
export function spendCredits(
    ws: WorkspaceRow,
    req: { amount?: number; action?: ToolId; meter?: MeterParams; usage?: Usage },
) {
    const cost = Math.max(
        1,
        req.usage
            ? costOf(req.usage)
            : req.action
              ? estimateCost(req.action, req.meter)
              : (req.amount ?? CREDITS_PER_GENERATION),
    );
    const reason = req.action ?? (req.usage ? describeUsage(req.usage) : "spend");
    return chargeCredits(ws, cost, reason);
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
    if (event.type === "checkout.session.completed") {
        const s = event.data.object as Stripe.Checkout.Session;
        const subId = typeof s.subscription === "string" ? s.subscription : s.subscription?.id;
        if (s.mode !== "payment" && subId)
            checkoutSub = await stripe().subscriptions.retrieve(subId);
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
                creditsResetAt: monthOut(),
            })
            .where(eq(schema.workspaces.id, wsId));
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
        await tx
            .update(schema.workspaces)
            .set({
                ...(plan ? { plan } : {}),
                planStatus: activeStatus(sub.status),
                stripeSubscriptionId: sub.id,
                seats: seatsOf(sub),
                planPeriodEnd: subPeriodEnd(sub),
                cancelAtPeriodEnd: sub.cancel_at_period_end,
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
                .set({ planStatus: "active", aiCreditsUsed: 0, creditsResetAt: monthOut() })
                .where(eq(schema.workspaces.id, ws.id));
            if (ws.aiCreditsUsed > 0)
                await tx.insert(schema.credits).values({
                    workspaceId: ws.id,
                    delta: ws.aiCreditsUsed,
                    reason: "renewal-reset",
                    balanceAfter: creditLimitFor(ws),
                });
        } else if (ws.planStatus === "past_due") {
            await tx
                .update(schema.workspaces)
                .set({ planStatus: "active" })
                .where(eq(schema.workspaces.id, ws.id));
        }
    }
}
