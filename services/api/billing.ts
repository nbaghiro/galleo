import { Hono } from "hono";
import { and, eq, isNull } from "drizzle-orm";
import { getCookie } from "hono/cookie";
import type Stripe from "stripe";
import type { Interval, PlanId } from "@model/billing";
import { visiblePlans, limitsFor, planFor, CREDITS_PER_GENERATION } from "@model/billing";
import type { ToolId, MeterParams } from "@model/tools";
import { estimateCost } from "@model/tools";
import type { Usage } from "@model/credits";
import { costOf } from "@model/credits";
import { db, schema } from "../schema";
import { SESSION_COOKIE } from "../auth";
import { currentUser, currentWorkspace, readJson } from "./context";
import { stripe, stripeReady, priceIdFor, planForPrice, intervalForPrice } from "../billing/stripe";

export const billing = new Hono();

const APP_URL = process.env.APP_URL ?? "http://localhost:8600";
const monthOut = (): Date => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
const RANK: Record<PlanId, number> = { free: 0, pro: 1, premium: 2 };

// Stripe moved current_period_end onto the subscription item in recent API versions; month-out fallback.
function subPeriodEnd(sub: Stripe.Subscription): Date {
    const ts = sub.items.data[0]?.current_period_end;
    return ts ? new Date(ts * 1000) : monthOut();
}

billing.get("/billing", async (c) => {
    const u = await currentUser(getCookie(c, SESSION_COOKIE));
    if (!u) return c.json({ error: "unauthorized" }, 401);
    const ws = await currentWorkspace(u.id);
    if (!ws) return c.json({ error: "no workspace" }, 400);
    const limits = limitsFor(ws.plan);
    const rows = await db
        .select({ id: schema.artifacts.id })
        .from(schema.artifacts)
        .where(and(eq(schema.artifacts.workspaceId, ws.id), isNull(schema.artifacts.trashedAt)));
    return c.json({
        plan: ws.plan,
        status: ws.planStatus,
        periodEnd: ws.planPeriodEnd,
        credits: {
            used: ws.aiCreditsUsed,
            limit: limits.aiCreditsPerMonth,
            perGeneration: CREDITS_PER_GENERATION,
        },
        usage: { artifacts: rows.length, maxArtifacts: limits.maxArtifacts },
        seats: ws.seats,
        catalog: visiblePlans(),
        stripeReady: stripeReady(),
    });
});

billing.post("/billing/checkout", async (c) => {
    const u = await currentUser(getCookie(c, SESSION_COOKIE));
    if (!u) return c.json({ error: "unauthorized" }, 401);
    const ws = await currentWorkspace(u.id);
    if (!ws) return c.json({ error: "no workspace" }, 400);
    if (!stripeReady()) return c.json({ error: "billing not configured" }, 503);
    const { plan, interval, seats } = await readJson<{
        plan?: PlanId;
        interval?: Interval;
        seats?: number;
    }>(c);
    if (!plan || plan === "free") return c.json({ error: "invalid plan" }, 400);
    const price = priceIdFor(plan, interval ?? "month");
    if (!price) return c.json({ error: "invalid plan" }, 400);
    const p = planFor(plan);
    const quantity =
        p.billing.model === "per_seat"
            ? Math.max(seats ?? p.billing.minSeats, p.billing.minSeats)
            : 1;

    let customerId = ws.stripeCustomerId;
    if (!customerId) {
        const customer = await stripe().customers.create({
            email: u.email,
            name: ws.name,
            metadata: { workspaceId: ws.id },
        });
        customerId = customer.id;
        await db
            .update(schema.workspaces)
            .set({ stripeCustomerId: customerId })
            .where(eq(schema.workspaces.id, ws.id));
    }

    const session = await stripe().checkout.sessions.create({
        mode: "subscription",
        customer: customerId,
        line_items: [{ price, quantity }],
        client_reference_id: ws.id,
        subscription_data: { metadata: { workspaceId: ws.id } },
        allow_promotion_codes: true,
        custom_text: {
            submit: { message: "Change or cancel your plan anytime from Billing." },
        },
        success_url: `${APP_URL}/app/pricing?status=success`,
        cancel_url: `${APP_URL}/app/pricing?status=cancel`,
    });
    return c.json({ url: session.url });
});

billing.post("/billing/portal", async (c) => {
    const u = await currentUser(getCookie(c, SESSION_COOKIE));
    if (!u) return c.json({ error: "unauthorized" }, 401);
    const ws = await currentWorkspace(u.id);
    if (!ws) return c.json({ error: "no workspace" }, 400);
    if (!ws.stripeCustomerId) return c.json({ error: "no subscription" }, 400);
    const session = await stripe().billingPortal.sessions.create({
        customer: ws.stripeCustomerId,
        return_url: `${APP_URL}/app/pricing`,
        // Configured portal when STRIPE_PORTAL_CONFIG is set; else the account's default.
        ...(process.env.STRIPE_PORTAL_CONFIG
            ? { configuration: process.env.STRIPE_PORTAL_CONFIG }
            : {}),
    });
    return c.json({ url: session.url });
});

// Downgrade to Free = cancel at period end; upgrade invoices immediately (prorated); other changes prorate onto the next invoice.
billing.post("/billing/change-plan", async (c) => {
    const u = await currentUser(getCookie(c, SESSION_COOKIE));
    if (!u) return c.json({ error: "unauthorized" }, 401);
    const ws = await currentWorkspace(u.id);
    if (!ws) return c.json({ error: "no workspace" }, 400);
    if (!ws.stripeSubscriptionId)
        return c.json({ error: "no active subscription", useCheckout: true }, 400);
    const { plan, interval, seats } = await readJson<{
        plan?: PlanId;
        interval?: Interval;
        seats?: number;
    }>(c);

    if (plan === "free") {
        await stripe().subscriptions.update(ws.stripeSubscriptionId, {
            cancel_at_period_end: true,
        });
        return c.json({ ok: true, effect: "cancel_at_period_end" });
    }
    if (!stripeReady()) return c.json({ error: "billing not configured" }, 503);

    const sub = await stripe().subscriptions.retrieve(ws.stripeSubscriptionId);
    const item = sub.items.data[0];
    if (!item) return c.json({ error: "no subscription item" }, 400);
    const curPlan = planForPrice(item.price.id) ?? ((ws.plan ?? "free") as PlanId);
    const curInterval = intervalForPrice(item.price.id) ?? "month";
    const curSeats = item.quantity ?? 1;

    const targetPlan = plan ?? curPlan;
    const targetInterval = interval ?? curInterval;
    const tp = planFor(targetPlan);
    const targetSeats =
        tp.billing.model === "per_seat" ? Math.max(seats ?? curSeats, tp.billing.minSeats) : 1;
    const newPrice = priceIdFor(targetPlan, targetInterval);
    if (!newPrice) return c.json({ error: "invalid plan" }, 400);

    const upgrading = RANK[targetPlan] > RANK[curPlan] || targetSeats > curSeats;
    await stripe().subscriptions.update(ws.stripeSubscriptionId, {
        items: [{ id: item.id, price: newPrice, quantity: targetSeats }],
        cancel_at_period_end: false,
        proration_behavior: upgrading ? "always_invoice" : "create_prorations",
    });
    return c.json({ ok: true, effect: upgrading ? "upgraded" : "changed" });
});

// Cost precedence: exact usage bag → action+meter estimate → raw amount → default generation. 402 when spent.
billing.post("/billing/spend", async (c) => {
    const u = await currentUser(getCookie(c, SESSION_COOKIE));
    if (!u) return c.json({ error: "unauthorized" }, 401);
    const ws = await currentWorkspace(u.id);
    if (!ws) return c.json({ error: "no workspace" }, 400);
    const { amount, action, meter, usage } = await readJson<{
        amount?: number;
        action?: ToolId;
        meter?: MeterParams;
        usage?: Usage;
    }>(c);
    const cost = Math.max(
        1,
        usage
            ? costOf(usage)
            : action
              ? estimateCost(action, meter)
              : (amount ?? CREDITS_PER_GENERATION),
    );
    const limit = limitsFor(ws.plan).aiCreditsPerMonth;
    if (ws.aiCreditsUsed + cost > limit) {
        return c.json(
            {
                error: "out of AI credits",
                upgrade: true,
                remaining: Math.max(0, limit - ws.aiCreditsUsed),
            },
            402,
        );
    }
    await db
        .update(schema.workspaces)
        .set({ aiCreditsUsed: ws.aiCreditsUsed + cost })
        .where(eq(schema.workspaces.id, ws.id));
    return c.json({ remaining: limit - (ws.aiCreditsUsed + cost) });
});

// Unauthenticated (verified by signature); reads the RAW body (constructEvent needs the exact bytes).
billing.post("/billing/webhook", async (c) => {
    const sig = c.req.header("stripe-signature");
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!sig || !secret) return c.json({ error: "webhook not configured" }, 400);
    const body = await c.req.text();
    let event: Stripe.Event;
    try {
        event = stripe().webhooks.constructEvent(body, sig, secret);
    } catch {
        return c.json({ error: "bad signature" }, 400);
    }
    await handleEvent(event);
    return c.json({ received: true });
});

const activeStatus = (s: Stripe.Subscription.Status): string =>
    s === "active" || s === "trialing" ? "active" : s === "past_due" ? "past_due" : "canceled";

async function workspaceBySubId(subId: string) {
    const [ws] = await db
        .select()
        .from(schema.workspaces)
        .where(eq(schema.workspaces.stripeSubscriptionId, subId));
    return ws ?? null;
}

async function workspaceByCustomer(customerId: string) {
    const [ws] = await db
        .select()
        .from(schema.workspaces)
        .where(eq(schema.workspaces.stripeCustomerId, customerId));
    return ws ?? null;
}

const seatsOf = (sub: Stripe.Subscription): number => sub.items.data[0]?.quantity ?? 1;
const invCustomer = (inv: Stripe.Invoice): string | null =>
    typeof inv.customer === "string" ? inv.customer : (inv.customer?.id ?? null);

// Last-write-wins syncs; sub events guard on the workspace whose CURRENT sub this is (a stale update can't resurrect a plan); dunning maps by customer.
async function handleEvent(event: Stripe.Event): Promise<void> {
    if (event.type === "checkout.session.completed") {
        const s = event.data.object as Stripe.Checkout.Session;
        const wsId = s.client_reference_id;
        const subId = typeof s.subscription === "string" ? s.subscription : s.subscription?.id;
        const customerId = typeof s.customer === "string" ? s.customer : (s.customer?.id ?? null);
        if (!wsId || !subId) return;
        const sub = await stripe().subscriptions.retrieve(subId);
        const plan = planForPrice(sub.items.data[0]?.price.id);
        if (!plan) return;
        // A fresh subscription → fresh plan + a fresh monthly credit window.
        await db
            .update(schema.workspaces)
            .set({
                plan,
                planStatus: activeStatus(sub.status),
                stripeCustomerId: customerId ?? undefined,
                stripeSubscriptionId: sub.id,
                seats: seatsOf(sub),
                planPeriodEnd: subPeriodEnd(sub),
                aiCreditsUsed: 0,
                creditsResetAt: monthOut(),
            })
            .where(eq(schema.workspaces.id, wsId));
    } else if (event.type === "customer.subscription.updated") {
        const sub = event.data.object as Stripe.Subscription;
        const ws = await workspaceBySubId(sub.id);
        if (!ws) return;
        const plan = planForPrice(sub.items.data[0]?.price.id);
        await db
            .update(schema.workspaces)
            .set({
                ...(plan ? { plan } : {}),
                planStatus: activeStatus(sub.status),
                seats: seatsOf(sub),
                planPeriodEnd: subPeriodEnd(sub),
            })
            .where(eq(schema.workspaces.id, ws.id));
    } else if (event.type === "customer.subscription.deleted") {
        const sub = event.data.object as Stripe.Subscription;
        const ws = await workspaceBySubId(sub.id);
        if (!ws) return;
        // Back to Free; data kept, over-limit use soft-locked by the resolver's gates.
        await db
            .update(schema.workspaces)
            .set({ plan: "free", planStatus: "canceled", stripeSubscriptionId: null, seats: 1 })
            .where(eq(schema.workspaces.id, ws.id));
    } else if (event.type === "invoice.payment_failed") {
        const customerId = invCustomer(event.data.object as Stripe.Invoice);
        const ws = customerId ? await workspaceByCustomer(customerId) : null;
        if (ws)
            await db
                .update(schema.workspaces)
                .set({ planStatus: "past_due" })
                .where(eq(schema.workspaces.id, ws.id));
    } else if (event.type === "invoice.paid") {
        const customerId = invCustomer(event.data.object as Stripe.Invoice);
        const ws = customerId ? await workspaceByCustomer(customerId) : null;
        if (ws && ws.planStatus === "past_due")
            await db
                .update(schema.workspaces)
                .set({ planStatus: "active" })
                .where(eq(schema.workspaces.id, ws.id));
    }
}
