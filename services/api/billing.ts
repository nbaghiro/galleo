import { Hono } from "hono";
import { and, eq, isNull } from "drizzle-orm";
import { getCookie } from "hono/cookie";
import type Stripe from "stripe";
import type { PlanId } from "@model/billing";
import { PLANS, PLAN_ORDER, limitsFor, CREDITS_PER_GENERATION } from "@model/billing";
import { db, schema } from "../schema";
import { SESSION_COOKIE } from "../auth";
import { currentUser, currentWorkspace, readJson } from "./context";
import { stripe, stripeReady, priceIdFor, planForPrice } from "../billing/stripe";

// Billing: the current plan + usage (for the pricing page + paywalls), Stripe Checkout / customer-portal
// hand-offs, an AI-credit spend gate, and the Stripe webhook that keeps the workspace's plan in sync.
export const billing = new Hono();

// Where Stripe sends the user back to after Checkout / the portal (the app SPA, not the API).
const APP_URL = process.env.APP_URL ?? "http://localhost:8600";
const monthOut = (): Date => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

// GET /billing — the plan, live usage, and the catalog the pricing page renders from.
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
        catalog: PLAN_ORDER.map((id) => PLANS[id]),
        stripeReady: stripeReady(),
    });
});

// POST /billing/checkout — start a subscription Checkout for a plan; returns the hosted-page URL.
billing.post("/billing/checkout", async (c) => {
    const u = await currentUser(getCookie(c, SESSION_COOKIE));
    if (!u) return c.json({ error: "unauthorized" }, 401);
    const ws = await currentWorkspace(u.id);
    if (!ws) return c.json({ error: "no workspace" }, 400);
    if (!stripeReady()) return c.json({ error: "billing not configured" }, 503);
    const { plan } = await readJson<{ plan?: PlanId }>(c);
    const price = plan ? priceIdFor(plan) : undefined;
    if (!price) return c.json({ error: "invalid plan" }, 400);

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
        line_items: [{ price, quantity: 1 }],
        client_reference_id: ws.id,
        allow_promotion_codes: true,
        success_url: `${APP_URL}/app/pricing?status=success`,
        cancel_url: `${APP_URL}/app/pricing?status=cancel`,
    });
    return c.json({ url: session.url });
});

// POST /billing/portal — open the Stripe customer portal to manage/cancel the subscription.
billing.post("/billing/portal", async (c) => {
    const u = await currentUser(getCookie(c, SESSION_COOKIE));
    if (!u) return c.json({ error: "unauthorized" }, 401);
    const ws = await currentWorkspace(u.id);
    if (!ws) return c.json({ error: "no workspace" }, 400);
    if (!ws.stripeCustomerId) return c.json({ error: "no subscription" }, 400);
    const session = await stripe().billingPortal.sessions.create({
        customer: ws.stripeCustomerId,
        return_url: `${APP_URL}/app/pricing`,
    });
    return c.json({ url: session.url });
});

// POST /billing/spend — reserve AI credits before a generation. 402 when the allowance is spent.
billing.post("/billing/spend", async (c) => {
    const u = await currentUser(getCookie(c, SESSION_COOKIE));
    if (!u) return c.json({ error: "unauthorized" }, 401);
    const ws = await currentWorkspace(u.id);
    if (!ws) return c.json({ error: "no workspace" }, 400);
    const { amount } = await readJson<{ amount?: number }>(c);
    const cost = Math.max(1, amount ?? CREDITS_PER_GENERATION);
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

// POST /billing/webhook — Stripe → us: keep the plan in sync. Unauthenticated (verified by signature),
// and it reads the RAW body (constructEvent needs the exact bytes).
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

// --- webhook handling ---

const activeStatus = (s: Stripe.Subscription.Status): string =>
    s === "active" || s === "trialing" ? "active" : s === "past_due" ? "past_due" : "canceled";

async function workspaceBySub(subId: string, customerId: string | null) {
    const [byS] = await db
        .select()
        .from(schema.workspaces)
        .where(eq(schema.workspaces.stripeSubscriptionId, subId));
    if (byS) return byS;
    if (customerId) {
        const [byC] = await db
            .select()
            .from(schema.workspaces)
            .where(eq(schema.workspaces.stripeCustomerId, customerId));
        return byC ?? null;
    }
    return null;
}

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
                planPeriodEnd: monthOut(),
                aiCreditsUsed: 0,
                creditsResetAt: monthOut(),
            })
            .where(eq(schema.workspaces.id, wsId));
    } else if (event.type === "customer.subscription.updated") {
        const sub = event.data.object as Stripe.Subscription;
        const ws = await workspaceBySub(sub.id, sub.customer as string);
        if (!ws) return;
        const plan = planForPrice(sub.items.data[0]?.price.id);
        await db
            .update(schema.workspaces)
            .set({
                ...(plan ? { plan } : {}),
                planStatus: activeStatus(sub.status),
                planPeriodEnd: monthOut(),
            })
            .where(eq(schema.workspaces.id, ws.id));
    } else if (event.type === "customer.subscription.deleted") {
        const sub = event.data.object as Stripe.Subscription;
        const ws = await workspaceBySub(sub.id, sub.customer as string);
        if (!ws) return;
        await db
            .update(schema.workspaces)
            .set({ plan: "free", planStatus: "canceled", stripeSubscriptionId: null })
            .where(eq(schema.workspaces.id, ws.id));
    }
}
