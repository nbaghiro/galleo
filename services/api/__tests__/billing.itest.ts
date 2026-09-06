import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import type Stripe from "stripe";
import { grantFor, PLAN_ORDER, PLANS, rolloverCapFor } from "@model/billing";
import { estimateCost } from "@model/tools";
import { authed, jsonInit, request, seedUser } from "@services/__tests__/harness";
import { stripeLineItems } from "@services/__tests__/stripe-fixtures";
import { db } from "@services/db/client";
import { schema } from "@services/db/schema";
import { chargeCredits, settleCredits } from "@services/core/ledger";
import { unitPricesFor } from "@services/core/models";
import { reserve } from "@services/core/spend";

// Mocked at the package boundary, so the `new Stripe(key)` in services/core/billing.ts hands back
// this stub; the pure price↔plan helpers still run for real off the stubbed env.
const stripeMock = vi.hoisted(() => ({
    customers: { create: vi.fn() },
    checkout: { sessions: { create: vi.fn(), listLineItems: vi.fn() } },
    billingPortal: { sessions: { create: vi.fn() } },
    subscriptions: { retrieve: vi.fn(), update: vi.fn() },
    webhooks: { constructEvent: vi.fn() },
}));

// A function, not an arrow: `new Stripe(key)` needs something constructible.
vi.mock("stripe", () => ({
    default: vi.fn(function StripeCtor() {
        return stripeMock;
    }),
}));

const PRICE = {
    proMonth: "price_pro_month",
    proYear: "price_pro_year",
    premiumMonth: "price_premium_month",
    premiumYear: "price_premium_year",
    credit: "price_credit",
} as const;

const prices = () => unitPricesFor();
const PRO = PLANS.pro.ai.monthlyCredits;
const PREMIUM = PLANS.premium.ai.monthlyCredits;

function configureStripe(): void {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test");
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_test");
    vi.stubEnv("STRIPE_PRICE_PRO_MONTH", PRICE.proMonth);
    vi.stubEnv("STRIPE_PRICE_PRO_YEAR", PRICE.proYear);
    vi.stubEnv("STRIPE_PRICE_PREMIUM_MONTH", PRICE.premiumMonth);
    vi.stubEnv("STRIPE_PRICE_PREMIUM_YEAR", PRICE.premiumYear);
    vi.stubEnv("STRIPE_PRICE_CREDIT", PRICE.credit);
}

/**
 * The webhook envelope, which is all the route destructures. Not `Stripe.Event`: that is a union
 * over every event type, so no single member fits a helper whose `type` is a string.
 */
type WebhookEvent = { id: string; type: string; data: { object: unknown } };

/** A paid credit purchase: the credit line item Stripe charged for, and a settled payment. */
function creditPurchase(
    workspaceId: string,
    credits: number,
    o: { id?: string; paymentStatus?: string; priceId?: string } = {},
): WebhookEvent {
    stripeMock.checkout.sessions.listLineItems.mockResolvedValue(
        stripeLineItems([{ priceId: o.priceId ?? PRICE.credit, quantity: credits }]),
    );
    return stripeEvent("checkout.session.completed", {
        id: o.id ?? "cs_credits",
        mode: "payment",
        payment_status: o.paymentStatus ?? "paid",
        client_reference_id: workspaceId,
        payment_intent: "pi_1",
    });
}

const YEAR_2030 = 1893456000; // fixed future unix seconds; keeps period-end assertions deterministic

type SubOverrides = {
    id?: string;
    priceId?: string;
    status?: Stripe.Subscription.Status;
    periodEnd?: number;
    cancelAtPeriodEnd?: boolean;
    metadata?: Record<string, string>;
};

type LiveSubItem = {
    id: string;
    price: { id: string };
    quantity: number;
    current_period_end: number;
};

/**
 * The parts of a live subscription the handler reads. Not `Stripe.Subscription`: that is 46 required
 * fields over nested resources, and asserting past them turns off checking on the fixture itself, so
 * a mistyped key would reach the handler as `undefined` instead of failing the build. `items` admits
 * `undefined` because a live sub arriving without them is one of the cases under test.
 */
type LiveSub = {
    id: string;
    status: Stripe.Subscription.Status;
    cancel_at_period_end: boolean;
    metadata: Stripe.Metadata;
    items: { data: LiveSubItem[] } | undefined;
};

function fakeSub(o: SubOverrides = {}): LiveSub {
    return {
        id: o.id ?? "sub_1",
        status: o.status ?? "active",
        cancel_at_period_end: o.cancelAtPeriodEnd ?? false,
        metadata: o.metadata ?? {},
        items: {
            data: [
                {
                    id: "si_1",
                    price: { id: o.priceId ?? PRICE.proMonth },
                    quantity: 1,
                    current_period_end: o.periodEnd ?? YEAR_2030,
                },
            ],
        },
    };
}

// A subscription checkout keys its grant on the session id; a subscription update keys on the event.
const stripeEvent = (type: string, object: unknown, id = "evt_test"): WebhookEvent => ({
    id,
    type,
    data: { object },
});

async function setWs(
    id: string,
    fields: Partial<typeof schema.workspaces.$inferInsert>,
): Promise<void> {
    await db.update(schema.workspaces).set(fields).where(eq(schema.workspaces.id, id));
}

async function getWs(id: string) {
    const [ws] = await db.select().from(schema.workspaces).where(eq(schema.workspaces.id, id));
    return ws!;
}

const ledgerOf = (workspaceId: string) =>
    db.select().from(schema.credits).where(eq(schema.credits.workspaceId, workspaceId));

// Subscription events sync from a fresh retrieve, so the mocked live sub is what the handler sees.
function postSubEvent(
    type: "customer.subscription.updated" | "customer.subscription.deleted",
    sub: LiveSub,
    id = "evt_test",
): Promise<Response> {
    stripeMock.subscriptions.retrieve.mockResolvedValue(sub);
    return postWebhook(stripeEvent(type, { id: sub.id }, id));
}

// constructEvent is faked, so signature verification is bypassed and the handler still runs for real.
function postWebhook(ev: WebhookEvent): Promise<Response> {
    stripeMock.webhooks.constructEvent.mockReturnValue(ev);
    return request("/billing/webhook", {
        method: "POST",
        headers: { "stripe-signature": "sig", "Content-Type": "application/json" },
        body: "{}",
    });
}

function subscriptionCheckout(workspaceId: string, sub: LiveSub, sessionId = "cs_1"): WebhookEvent {
    stripeMock.subscriptions.retrieve.mockResolvedValue(sub);
    return stripeEvent("checkout.session.completed", {
        id: sessionId,
        mode: "subscription",
        client_reference_id: workspaceId,
        subscription: sub.id,
        customer: "cus_1",
    });
}

const future = () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

beforeEach(() => {
    configureStripe();
    stripeMock.customers.create.mockResolvedValue({ id: "cus_1" });
    stripeMock.checkout.sessions.create.mockResolvedValue({
        url: "https://checkout.stripe.test/s",
    });
    stripeMock.billingPortal.sessions.create.mockResolvedValue({
        url: "https://portal.stripe.test/s",
    });
    stripeMock.subscriptions.update.mockResolvedValue(fakeSub());
});

afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetAllMocks();
});

describe("GET /billing", () => {
    it("401s without a session", async () => {
        const res = await request("/billing");
        expect(res.status).toBe(401);
    });

    it("reports plan, credit allowance, catalog and stripeReady for a free workspace", async () => {
        const { userId } = await seedUser();
        const res = await authed(userId, "/billing");
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.plan).toBe("free");
        expect(body.credits.monthlyGrant).toBe(PLANS.free.ai.monthlyCredits);
        expect(body.credits.perGeneration).toBe(estimateCost("generate-artifact", {}, prices()));
        expect(body.catalog).toHaveLength(PLAN_ORDER.length);
        expect(body.stripeReady).toBe(true);
    });

    it("reports stripeReady false when the server has no keys", async () => {
        vi.stubEnv("STRIPE_SECRET_KEY", undefined);
        const { userId } = await seedUser();
        const res = await authed(userId, "/billing");
        expect((await res.json()).stripeReady).toBe(false);
    });
});

describe("POST /billing/checkout", () => {
    it("creates a customer, persists it, and opens a subscription checkout session", async () => {
        const { userId, workspaceId } = await seedUser();
        const res = await authed(
            userId,
            "/billing/checkout",
            jsonInit("POST", { plan: "pro", interval: "month" }),
        );
        expect(res.status).toBe(200);
        expect((await res.json()).url).toBe("https://checkout.stripe.test/s");

        expect(stripeMock.customers.create).toHaveBeenCalledTimes(1);
        expect(await getWs(workspaceId)).toMatchObject({ stripeCustomerId: "cus_1" });
        expect(stripeMock.checkout.sessions.create).toHaveBeenCalledWith(
            expect.objectContaining({
                mode: "subscription",
                customer: "cus_1",
                client_reference_id: workspaceId,
                line_items: [{ price: PRICE.proMonth, quantity: 1 }],
            }),
        );
    });

    it("reuses an existing Stripe customer instead of creating a second", async () => {
        const { userId, workspaceId } = await seedUser();
        await setWs(workspaceId, { stripeCustomerId: "cus_existing" });
        const res = await authed(userId, "/billing/checkout", jsonInit("POST", { plan: "pro" }));
        expect(res.status).toBe(200);
        expect(stripeMock.customers.create).not.toHaveBeenCalled();
        expect(stripeMock.checkout.sessions.create).toHaveBeenCalledWith(
            expect.objectContaining({ customer: "cus_existing" }),
        );
    });

    it("uses the annual price when interval=year", async () => {
        const { userId } = await seedUser();
        await authed(
            userId,
            "/billing/checkout",
            jsonInit("POST", { plan: "pro", interval: "year" }),
        );
        expect(stripeMock.checkout.sessions.create).toHaveBeenCalledWith(
            expect.objectContaining({ line_items: [{ price: PRICE.proYear, quantity: 1 }] }),
        );
    });

    it("rejects the free plan", async () => {
        const { userId } = await seedUser();
        const res = await authed(userId, "/billing/checkout", jsonInit("POST", { plan: "free" }));
        expect(res.status).toBe(400);
    });

    it("refuses an annual checkout when no annual price is configured, rather than booking monthly", async () => {
        vi.stubEnv("STRIPE_PRICE_PRO_YEAR", undefined);
        const { userId } = await seedUser();
        const res = await authed(
            userId,
            "/billing/checkout",
            jsonInit("POST", { plan: "pro", interval: "year" }),
        );
        expect(res.status).toBe(400);
        expect(stripeMock.checkout.sessions.create).not.toHaveBeenCalled();
    });

    it("503s when billing is not configured", async () => {
        vi.stubEnv("STRIPE_SECRET_KEY", undefined);
        const { userId } = await seedUser();
        const res = await authed(userId, "/billing/checkout", jsonInit("POST", { plan: "pro" }));
        expect(res.status).toBe(503);
        expect(stripeMock.checkout.sessions.create).not.toHaveBeenCalled();
    });
});

describe("POST /billing/topup", () => {
    it("opens a payment checkout for a preset quantity", async () => {
        const { userId } = await seedUser({ plan: "pro" });
        stripeMock.customers.create.mockResolvedValue({ id: "cus_topup" });
        stripeMock.checkout.sessions.create.mockResolvedValue({ url: "https://pay/x" });
        const res = await authed(userId, "/billing/topup", jsonInit("POST", { credits: 2000 }));
        expect(res.status).toBe(200);
        const args = stripeMock.checkout.sessions.create.mock.calls.at(-1)![0];
        expect(args.mode).toBe("payment");
        // one price standing for one credit, charged by quantity
        expect(args.line_items).toEqual([{ price: PRICE.credit, quantity: 2000 }]);
    });

    it("rejects a quantity that is not a preset before reaching Stripe", async () => {
        const { userId } = await seedUser({ plan: "pro" });
        for (const credits of [1500, 10.5, 0, 5_000_000]) {
            const res = await authed(userId, "/billing/topup", jsonInit("POST", { credits }));
            expect(res.status).toBe(400);
        }
        expect(stripeMock.checkout.sessions.create).not.toHaveBeenCalled();
    });

    it("503s when no credit price is configured", async () => {
        vi.stubEnv("STRIPE_PRICE_CREDIT", "");
        const { userId } = await seedUser({ plan: "pro" });
        stripeMock.customers.create.mockResolvedValue({ id: "cus_topup" });
        const res = await authed(userId, "/billing/topup", jsonInit("POST", { credits: 500 }));
        expect(res.status).toBe(503);
    });

    // Free cannot buy credits at all, so the wall is a 402 with an upgrade rather than a price error
    it("402s on a plan that does not sell credits", async () => {
        const { userId } = await seedUser({ plan: "free" });
        const res = await authed(userId, "/billing/topup", jsonInit("POST", { credits: 500 }));
        expect(res.status).toBe(402);
    });
});

describe("POST /billing/portal", () => {
    it("opens a portal session for a workspace with a customer", async () => {
        const { userId, workspaceId } = await seedUser({ plan: "pro" });
        await setWs(workspaceId, { stripeCustomerId: "cus_1" });
        const res = await authed(userId, "/billing/portal", jsonInit("POST", {}));
        expect(res.status).toBe(200);
        expect((await res.json()).url).toBe("https://portal.stripe.test/s");
        expect(stripeMock.billingPortal.sessions.create).toHaveBeenCalledWith(
            expect.objectContaining({ customer: "cus_1" }),
        );
    });

    it("400s when the workspace has no Stripe customer", async () => {
        const { userId } = await seedUser({ plan: "pro" });
        const res = await authed(userId, "/billing/portal", jsonInit("POST", {}));
        expect(res.status).toBe(400);
    });
});

describe("POST /billing/change-plan", () => {
    async function withSubscription(plan: string, priceId: string) {
        const seed = await seedUser({ plan });
        await setWs(seed.workspaceId, { stripeCustomerId: "cus_1", stripeSubscriptionId: "sub_1" });
        stripeMock.subscriptions.retrieve.mockResolvedValue(fakeSub({ priceId }));
        return seed;
    }

    it("upgrades pro→premium immediately (always_invoice proration)", async () => {
        const { userId } = await withSubscription("pro", PRICE.proMonth);
        const res = await authed(
            userId,
            "/billing/change-plan",
            jsonInit("POST", { plan: "premium", interval: "month" }),
        );
        expect(res.status).toBe(200);
        expect((await res.json()).effect).toBe("upgraded");
        expect(stripeMock.subscriptions.update).toHaveBeenCalledWith(
            "sub_1",
            expect.objectContaining({
                proration_behavior: "always_invoice",
                cancel_at_period_end: false,
                items: [{ id: "si_1", price: PRICE.premiumMonth, quantity: 1 }],
            }),
        );
    });

    // what was paid for and not used comes back as a proration credit on the next invoice
    it("downgrades premium→pro now, as a proration credit", async () => {
        const { userId } = await withSubscription("premium", PRICE.premiumMonth);
        const res = await authed(userId, "/billing/change-plan", jsonInit("POST", { plan: "pro" }));
        expect((await res.json()).effect).toBe("changed");
        expect(stripeMock.subscriptions.update).toHaveBeenCalledWith(
            "sub_1",
            expect.objectContaining({
                proration_behavior: "create_prorations",
                items: [{ id: "si_1", price: PRICE.proMonth, quantity: 1 }],
            }),
        );
    });

    it("downgrades to free by scheduling cancel-at-period-end (no immediate item swap)", async () => {
        const { userId, workspaceId } = await withSubscription("pro", PRICE.proMonth);
        const res = await authed(
            userId,
            "/billing/change-plan",
            jsonInit("POST", { plan: "free" }),
        );
        expect((await res.json()).effect).toBe("cancel_at_period_end");
        expect(stripeMock.subscriptions.update).toHaveBeenCalledWith(
            "sub_1",
            expect.objectContaining({ cancel_at_period_end: true }),
        );
        // Reflected immediately so the UI can show "ends <date>" without waiting on the webhook.
        expect((await getWs(workspaceId)).cancelAtPeriodEnd).toBe(true);
    });

    it("clears a pending cancel when switching to another paid plan", async () => {
        const { userId, workspaceId } = await withSubscription("pro", PRICE.proMonth);
        await setWs(workspaceId, { cancelAtPeriodEnd: true });
        await authed(userId, "/billing/change-plan", jsonInit("POST", { plan: "premium" }));
        expect(stripeMock.subscriptions.update).toHaveBeenCalledWith(
            "sub_1",
            expect.objectContaining({ cancel_at_period_end: false }),
        );
        expect((await getWs(workspaceId)).cancelAtPeriodEnd).toBe(false);
    });

    it("switches monthly→annual on the same plan (non-upgrade proration, new price id)", async () => {
        const { userId } = await withSubscription("pro", PRICE.proMonth);
        const res = await authed(
            userId,
            "/billing/change-plan",
            jsonInit("POST", { interval: "year" }),
        );
        expect((await res.json()).effect).toBe("changed");
        expect(stripeMock.subscriptions.update).toHaveBeenCalledWith(
            "sub_1",
            expect.objectContaining({
                proration_behavior: "create_prorations",
                items: [{ id: "si_1", price: PRICE.proYear, quantity: 1 }],
            }),
        );
    });

    it("400s with useCheckout when there is no active subscription to change", async () => {
        const { userId } = await seedUser({ plan: "free" });
        const res = await authed(userId, "/billing/change-plan", jsonInit("POST", { plan: "pro" }));
        expect(res.status).toBe(400);
        expect((await res.json()).useCheckout).toBe(true);
        expect(stripeMock.subscriptions.update).not.toHaveBeenCalled();
    });
});

describe("POST /billing/resume", () => {
    it("clears the scheduled cancel on Stripe and in the workspace", async () => {
        const { userId, workspaceId } = await seedUser({ plan: "pro" });
        await setWs(workspaceId, { stripeSubscriptionId: "sub_1", cancelAtPeriodEnd: true });
        const res = await authed(userId, "/billing/resume", jsonInit("POST", {}));
        expect(res.status).toBe(200);
        expect(stripeMock.subscriptions.update).toHaveBeenCalledWith(
            "sub_1",
            expect.objectContaining({ cancel_at_period_end: false }),
        );
        expect((await getWs(workspaceId)).cancelAtPeriodEnd).toBe(false);
    });

    it("400s when there is no subscription to resume", async () => {
        const { userId } = await seedUser({ plan: "free" });
        const res = await authed(userId, "/billing/resume", jsonInit("POST", {}));
        expect(res.status).toBe(400);
        expect(stripeMock.subscriptions.update).not.toHaveBeenCalled();
    });
});

describe("reserving a priced action", () => {
    it("prices the named action from the catalog", async () => {
        const { userId, workspaceId } = await seedUser();
        await setWs(workspaceId, { aiCreditsBalance: 100, creditsResetAt: future() });
        const held = await reserve(await getWs(workspaceId), userId, "generate-theme", {
            prices: prices(),
        });
        expect(held.ok).toBe(true);
        expect((await getWs(workspaceId)).aiCreditsBalance).toBe(92); // generate-theme = 8
    });

    it("refuses and charges nothing once the monthly allowance is exhausted", async () => {
        const { userId, workspaceId } = await seedUser();
        await setWs(workspaceId, { aiCreditsBalance: 0, creditsResetAt: future() });
        const held = await reserve(await getWs(workspaceId), userId, "generate-theme", {
            prices: prices(),
        });
        expect(held.ok).toBe(false);
        expect(held.ok === false && held.remaining).toBe(0);
        expect((await getWs(workspaceId)).aiCreditsBalance).toBe(0);
    });

    // start-generation is free but gated on the plan step behind it, so an out-of-credits
    // refusal lands before the doorway opens a draft nothing can afford to fill
    it("refuses a free doorway when the priced step behind it could not be paid for", async () => {
        const { userId, workspaceId } = await seedUser();
        await setWs(workspaceId, { aiCreditsBalance: 0, creditsResetAt: future() });
        const held = await reserve(await getWs(workspaceId), userId, "start-generation", {
            prices: prices(),
        });
        expect(held.ok).toBe(false);
        expect(held.ok === false && held.remaining).toBe(0);
        expect((await getWs(workspaceId)).aiCreditsBalance).toBe(0);
    });

    it("holds nothing for a free doorway whose step is affordable", async () => {
        const { userId, workspaceId } = await seedUser();
        await setWs(workspaceId, { aiCreditsBalance: 100, creditsResetAt: future() });
        const held = await reserve(await getWs(workspaceId), userId, "start-generation", {
            prices: prices(),
        });
        expect(held.ok).toBe(true);
        expect((await getWs(workspaceId)).aiCreditsBalance).toBe(100);
    });
});

describe("POST /billing/webhook", () => {
    it("400s when the signature header is missing", async () => {
        const res = await request("/billing/webhook", { method: "POST", body: "{}" });
        expect(res.status).toBe(400);
    });

    it("400s when the signature fails verification", async () => {
        stripeMock.webhooks.constructEvent.mockImplementation(() => {
            throw new Error("bad signature");
        });
        const res = await request("/billing/webhook", {
            method: "POST",
            headers: { "stripe-signature": "sig" },
            body: "{}",
        });
        expect(res.status).toBe(400);
    });

    it("checkout.session.completed activates the plan and opens a fresh credit window", async () => {
        const { workspaceId } = await seedUser();
        await setWs(workspaceId, { aiCreditsBalance: 99, cancelAtPeriodEnd: true });
        const ev = subscriptionCheckout(
            workspaceId,
            fakeSub({ id: "sub_1", priceId: PRICE.proMonth }),
        );
        const res = await postWebhook(ev);
        expect(res.status).toBe(200);
        expect((await res.json()).received).toBe(true);
        expect(await getWs(workspaceId)).toMatchObject({
            plan: "pro",
            planInterval: "month",
            stripeCustomerId: "cus_1",
            stripeSubscriptionId: "sub_1",
            aiCreditsBalance: 99 + PRO,
            cancelAtPeriodEnd: false,
        });

        // Redelivery: the grant keys on the checkout session, so nothing re-applies.
        await postWebhook(ev);
        expect((await getWs(workspaceId)).aiCreditsBalance).toBe(99 + PRO);
        const grants = await ledgerOf(workspaceId);
        expect(grants).toHaveLength(1);
        expect(grants[0]).toMatchObject({ reason: "upgrade-grant", key: "cs_1" });
    });

    it("is idempotent: a redelivered subscription event re-syncs from live state, harmlessly", async () => {
        const { workspaceId } = await seedUser({ plan: "pro" });
        await setWs(workspaceId, { stripeSubscriptionId: "sub_1" });
        const sub = fakeSub({ id: "sub_1", priceId: PRICE.premiumMonth });
        const first = await postSubEvent("customer.subscription.updated", sub, "evt_dup");
        expect((await first.json()).received).toBe(true);
        expect(await getWs(workspaceId)).toMatchObject({ plan: "premium" });

        // Simulate drift, then redeliver the exact same event — the handler syncs from the live
        // subscription, so the duplicate converges on Stripe truth instead of re-applying a payload.
        await setWs(workspaceId, { plan: "pro" });
        const second = await postSubEvent("customer.subscription.updated", sub, "evt_dup");
        expect((await second.json()).received).toBe(true);
        expect(await getWs(workspaceId)).toMatchObject({ plan: "premium" });
    });

    it("customer.subscription.updated syncs a scheduled cancel onto the workspace", async () => {
        const { workspaceId } = await seedUser({ plan: "pro" });
        await setWs(workspaceId, { stripeSubscriptionId: "sub_1", cancelAtPeriodEnd: false });
        await postSubEvent(
            "customer.subscription.updated",
            fakeSub({ id: "sub_1", priceId: PRICE.proMonth, cancelAtPeriodEnd: true }),
        );
        expect((await getWs(workspaceId)).cancelAtPeriodEnd).toBe(true);
    });

    it("customer.subscription.updated syncs plan, interval and period end", async () => {
        const { workspaceId } = await seedUser({ plan: "pro" });
        await setWs(workspaceId, { stripeSubscriptionId: "sub_1" });
        await postSubEvent(
            "customer.subscription.updated",
            fakeSub({ id: "sub_1", priceId: PRICE.premiumYear }),
        );
        expect(await getWs(workspaceId)).toMatchObject({
            plan: "premium",
            planInterval: "year",
            planPeriodEnd: new Date(YEAR_2030 * 1000),
        });
    });

    it("customer.subscription.updated for an unknown subscription is a no-op", async () => {
        const { workspaceId } = await seedUser({ plan: "pro" });
        await setWs(workspaceId, { stripeSubscriptionId: "sub_1" });
        await postSubEvent(
            "customer.subscription.updated",
            fakeSub({ id: "sub_other", priceId: PRICE.premiumMonth }),
        );
        expect(await getWs(workspaceId)).toMatchObject({ plan: "pro" });
    });

    it("customer.subscription.deleted reverts the workspace to free", async () => {
        const { workspaceId } = await seedUser({ plan: "premium" });
        await setWs(workspaceId, {
            stripeSubscriptionId: "sub_1",
            planInterval: "month",
            aiCreditsBalance: 777,
        });
        await postSubEvent(
            "customer.subscription.deleted",
            fakeSub({ id: "sub_1", status: "canceled" }),
        );
        expect(await getWs(workspaceId)).toMatchObject({
            plan: "free",
            planInterval: null,
            stripeSubscriptionId: null,
            aiCreditsBalance: 777, // granted or bought, not rented
        });
    });
});

// A subscription that starts granting more than the row did opens a fresh window: paying now
// means credits now, whether the money moved through a checkout or a change to a live sub.
describe("granting on a subscription change", () => {
    it("a tier upgrade via subscription.updated grants the new plan's allowance, once", async () => {
        const { workspaceId } = await seedUser({ plan: "pro" });
        await setWs(workspaceId, { stripeSubscriptionId: "sub_1", aiCreditsBalance: 50 });
        const sub = fakeSub({ id: "sub_1", priceId: PRICE.premiumMonth });
        await postSubEvent("customer.subscription.updated", sub, "evt_up");
        const grant = grantFor({ plan: "premium" });
        expect((await getWs(workspaceId)).aiCreditsBalance).toBe(50 + grant);
        const rows = await ledgerOf(workspaceId);
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({ reason: "upgrade-grant", delta: grant, key: "sub:evt_up" });

        // the redelivery syncs and grants nothing, and so does an unrelated later update
        await postSubEvent("customer.subscription.updated", sub, "evt_up");
        await postSubEvent("customer.subscription.updated", sub, "evt_later");
        expect((await getWs(workspaceId)).aiCreditsBalance).toBe(50 + grant);
        expect(await ledgerOf(workspaceId)).toHaveLength(1);
    });

    it("a renewal or a downgrade syncs without granting", async () => {
        const { workspaceId } = await seedUser({ plan: "premium" });
        await setWs(workspaceId, { stripeSubscriptionId: "sub_1", aiCreditsBalance: 300 });
        // the same shape again: Stripe fires updated at every period boundary
        await postSubEvent(
            "customer.subscription.updated",
            fakeSub({ id: "sub_1", priceId: PRICE.premiumMonth }),
            "evt_renew",
        );
        expect((await getWs(workspaceId)).aiCreditsBalance).toBe(300);
        // a lower tier: what is banked stays, nothing is added
        await postSubEvent(
            "customer.subscription.updated",
            fakeSub({ id: "sub_1", priceId: PRICE.proMonth }),
            "evt_down",
        );
        expect(await getWs(workspaceId)).toMatchObject({ plan: "pro", aiCreditsBalance: 300 });
        expect(await ledgerOf(workspaceId)).toHaveLength(0);
    });
});

describe("credit engine", () => {
    // a purchased pack lands in the same balance, so spend can exceed a month's grant
    it("spends a balance banked above the monthly grant", async () => {
        const { userId, workspaceId } = await seedUser({ plan: "pro" });
        const banked = PRO * 3;
        await setWs(workspaceId, { aiCreditsBalance: banked, creditsResetAt: future() });
        const held = await reserve(await getWs(workspaceId), userId, "generate-theme", {
            prices: prices(),
        });
        expect(held.ok).toBe(true);
        expect((await getWs(workspaceId)).aiCreditsBalance).toBe(banked - 8);
    });

    it("exactly one of two concurrent near-limit spends wins", async () => {
        const { userId, workspaceId } = await seedUser();
        // exactly one generate-theme's worth, so the two racers contend for a single charge
        await setWs(workspaceId, { aiCreditsBalance: 8, creditsResetAt: future() });
        const ws = await getWs(workspaceId);
        const [a, b] = await Promise.all([
            reserve(ws, userId, "generate-theme", { prices: prices() }),
            reserve(ws, userId, "generate-theme", { prices: prices() }),
        ]);
        expect([a.ok, b.ok].sort()).toEqual([false, true]);
        expect((await getWs(workspaceId)).aiCreditsBalance).toBe(0);
    });

    it("writes a ledger row per charge with the remaining balance", async () => {
        const { userId, workspaceId } = await seedUser();
        await setWs(workspaceId, { aiCreditsBalance: 100, creditsResetAt: future() });
        await reserve(await getWs(workspaceId), userId, "generate-theme", { prices: prices() });
        const rows = await ledgerOf(workspaceId);
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({
            delta: -8, // one theme unit, priced on the default model
            reason: "generate-theme",
            balanceAfter: 92,
        });
    });

    it("settleCredits refunds an over-reserve relative to the live row", async () => {
        const { workspaceId } = await seedUser();
        await setWs(workspaceId, { aiCreditsBalance: 100, creditsResetAt: future() });
        const ws = await getWs(workspaceId);
        const charged = await chargeCredits(ws, 50, "generate-image");
        expect(charged.ok).toBe(true);
        // a parallel spend lands while the "stream" runs — the settle must not clobber it
        await chargeCredits(ws, 10, "ask-assistant");
        await settleCredits(ws, charged.entryId!, -20);
        expect((await getWs(workspaceId)).aiCreditsBalance).toBe(60);
        const rows = await ledgerOf(workspaceId);
        // the image charge was rewritten from -50 to -30; the parallel spend is untouched
        expect(rows.map((r) => r.delta).sort((x, y) => x - y)).toEqual([-30, -10]);
    });

    it("chargeCredits rejects without side effects once the balance is exhausted", async () => {
        const { workspaceId } = await seedUser();
        await setWs(workspaceId, { aiCreditsBalance: 0, creditsResetAt: future() });
        const ws = await getWs(workspaceId);
        const res = await chargeCredits(ws, 1, "ask-assistant");
        expect(res).toMatchObject({ ok: false, remaining: 0 });
        expect((await getWs(workspaceId)).aiCreditsBalance).toBe(0);
        expect(await ledgerOf(workspaceId)).toHaveLength(0);
    });
});

// There is no cron and no invoice path: reading the workspace is what rolls the window, on every
// plan and every interval alike.
describe("the roll on read", () => {
    const lapsed = () => new Date(Date.now() - 1000);

    it("grants a lapsed monthly subscriber on the next read, once", async () => {
        const { userId, workspaceId } = await seedUser({ plan: "pro" });
        await setWs(workspaceId, {
            stripeSubscriptionId: "sub_1",
            planInterval: "month",
            aiCreditsBalance: 40,
            creditsResetAt: lapsed(),
        });
        await authed(userId, "/billing");
        expect((await getWs(workspaceId)).aiCreditsBalance).toBe(40 + PRO);
        await authed(userId, "/billing");
        expect((await getWs(workspaceId)).aiCreditsBalance).toBe(40 + PRO);
        const rows = await ledgerOf(workspaceId);
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({ reason: "monthly-grant", delta: PRO });
        expect(rows[0]!.key).toMatch(/^roll:/);
    });

    it("grants an annual subscriber and a free workspace the same way", async () => {
        const annual = await seedUser({ plan: "premium" });
        await setWs(annual.workspaceId, {
            stripeSubscriptionId: "sub_y",
            planInterval: "year",
            aiCreditsBalance: 0,
            creditsResetAt: lapsed(),
        });
        await authed(annual.userId, "/billing");
        expect((await getWs(annual.workspaceId)).aiCreditsBalance).toBe(PREMIUM);

        const free = await seedUser();
        await setWs(free.workspaceId, { aiCreditsBalance: 10, creditsResetAt: lapsed() });
        await authed(free.userId, "/billing");
        expect((await getWs(free.workspaceId)).aiCreditsBalance).toBe(
            10 + PLANS.free.ai.monthlyCredits,
        );
    });

    it("clips at the rollover cap but still re-anchors the window", async () => {
        const { userId, workspaceId } = await seedUser({ plan: "pro" });
        const cap = rolloverCapFor({ plan: "pro" });
        await setWs(workspaceId, { aiCreditsBalance: cap - 100, creditsResetAt: lapsed() });
        await authed(userId, "/billing");
        const after = await getWs(workspaceId);
        expect(after.aiCreditsBalance).toBe(cap);
        expect(after.creditsResetAt.getTime()).toBeGreaterThan(Date.now());
        expect((await ledgerOf(workspaceId))[0]).toMatchObject({
            reason: "monthly-grant",
            delta: 100,
        });
    });
});

describe("webhook hardening", () => {
    it("a credit purchase grants the line item's quantity, once, keyed on the session", async () => {
        const { workspaceId } = await seedUser({ plan: "pro" });
        await setWs(workspaceId, { aiCreditsBalance: 10 });
        const bought = 2000;
        // the grant comes off what Stripe charged for, not off anything we wrote in metadata
        const ev = creditPurchase(workspaceId, bought, { id: "cs_credits_1" });
        await postWebhook(ev);
        await postWebhook(ev);
        const after = await getWs(workspaceId);
        expect(after.aiCreditsBalance).toBe(10 + bought);
        // bought, not granted: exempt from the rollover clip, and not doubled by the redelivery
        expect(after.purchasedCredits).toBe(bought);
        const rows = await ledgerOf(workspaceId);
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({ delta: bought, reason: "topup", key: "cs_credits_1" });
    });

    it("ignores a purchase whose session charged for nothing", async () => {
        const { workspaceId } = await seedUser({ plan: "pro" });
        await setWs(workspaceId, { aiCreditsBalance: 10 });
        stripeMock.checkout.sessions.listLineItems.mockResolvedValue(stripeLineItems([]));
        await postWebhook(
            stripeEvent("checkout.session.completed", {
                id: "cs_credits_empty",
                mode: "payment",
                payment_status: "paid",
                client_reference_id: workspaceId,
            }),
        );
        expect((await getWs(workspaceId)).aiCreditsBalance).toBe(10);
    });

    it("counts only the credit line, so another one-off product cannot mint credits", async () => {
        const { workspaceId } = await seedUser({ plan: "pro" });
        await setWs(workspaceId, { aiCreditsBalance: 10 });
        stripeMock.checkout.sessions.listLineItems.mockResolvedValue(
            stripeLineItems([
                { priceId: PRICE.credit, quantity: 500 },
                { priceId: "price_some_other_product", quantity: 9000 },
            ]),
        );
        await postWebhook(
            stripeEvent("checkout.session.completed", {
                id: "cs_mixed",
                mode: "payment",
                payment_status: "paid",
                client_reference_id: workspaceId,
            }),
        );
        expect((await getWs(workspaceId)).aiCreditsBalance).toBe(10 + 500);
    });

    it("waits for the money: an unpaid session grants nothing until it settles", async () => {
        const { workspaceId } = await seedUser({ plan: "pro" });
        await setWs(workspaceId, { aiCreditsBalance: 10 });
        // a delayed method completes the session before the payment lands
        await postWebhook(
            creditPurchase(workspaceId, 500, { id: "cs_async", paymentStatus: "unpaid" }),
        );
        expect((await getWs(workspaceId)).aiCreditsBalance).toBe(10);

        stripeMock.checkout.sessions.listLineItems.mockResolvedValue(
            stripeLineItems([{ priceId: PRICE.credit, quantity: 500 }]),
        );
        await postWebhook(
            stripeEvent("checkout.session.async_payment_succeeded", {
                id: "cs_async",
                mode: "payment",
                payment_status: "paid",
                client_reference_id: workspaceId,
            }),
        );
        expect((await getWs(workspaceId)).aiCreditsBalance).toBe(10 + 500);
    });

    it("refuses a quantity that is not a preset we sell", async () => {
        const { workspaceId } = await seedUser({ plan: "pro" });
        await setWs(workspaceId, { aiCreditsBalance: 10 });
        // a session made outside our API, where the route's preset check never ran
        await postWebhook(creditPurchase(workspaceId, 5_000_000, { id: "cs_huge" }));
        await postWebhook(creditPurchase(workspaceId, 1500, { id: "cs_odd" }));
        expect((await getWs(workspaceId)).aiCreditsBalance).toBe(10);
    });

    it("an upgrade grant clips against what the new plan may bank", async () => {
        const { workspaceId } = await seedUser();
        // banked far above pro's cap (packless), so subscribing grants nothing extra
        await setWs(workspaceId, { aiCreditsBalance: 5000 });
        await postWebhook(
            subscriptionCheckout(
                workspaceId,
                fakeSub({ id: "sub_clip", priceId: PRICE.proMonth }),
                "cs_clip",
            ),
        );
        const ws = await getWs(workspaceId);
        expect(ws.plan).toBe("pro"); // the sync still lands even when the grant is clipped away
        expect(ws.aiCreditsBalance).toBe(5000);
        expect((await ledgerOf(workspaceId))[0]).toMatchObject({
            reason: "upgrade-grant",
            delta: 0,
            key: "cs_clip",
        });
    });

    it("subscription.updated adopts an unlinked workspace via the metadata backref", async () => {
        const { workspaceId } = await seedUser({ plan: "free" });
        await postSubEvent(
            "customer.subscription.updated",
            fakeSub({ id: "sub_new", priceId: PRICE.proMonth, metadata: { workspaceId } }),
        );
        expect(await getWs(workspaceId)).toMatchObject({
            plan: "pro",
            stripeSubscriptionId: "sub_new",
        });
    });

    it("subscription.updated cannot hijack a workspace already linked to another sub", async () => {
        const { workspaceId } = await seedUser({ plan: "premium" });
        await setWs(workspaceId, { stripeSubscriptionId: "sub_current" });
        await postSubEvent(
            "customer.subscription.updated",
            fakeSub({ id: "sub_stale", priceId: PRICE.proMonth, metadata: { workspaceId } }),
        );
        expect(await getWs(workspaceId)).toMatchObject({
            plan: "premium",
            stripeSubscriptionId: "sub_current",
        });
    });

    it("subscription.deleted clears the stale period end", async () => {
        const { workspaceId } = await seedUser({ plan: "pro" });
        await setWs(workspaceId, {
            stripeSubscriptionId: "sub_1",
            planPeriodEnd: new Date(YEAR_2030 * 1000),
        });
        await postSubEvent(
            "customer.subscription.deleted",
            fakeSub({ id: "sub_1", status: "canceled" }),
        );
        expect((await getWs(workspaceId)).planPeriodEnd).toBeNull();
    });

    it("keeps the row's plan when the live sub carries no price we sell", async () => {
        const { workspaceId } = await seedUser({ plan: "pro" });
        await setWs(workspaceId, { stripeSubscriptionId: "sub_1" });
        await postSubEvent(
            "customer.subscription.updated",
            fakeSub({ id: "sub_1", priceId: "price_from_another_env" }),
        );
        expect(await getWs(workspaceId)).toMatchObject({ plan: "pro" });
    });

    it("a handler failure rolls the transaction back and the redelivery applies", async () => {
        const { workspaceId } = await seedUser({ plan: "pro" });
        await setWs(workspaceId, { stripeSubscriptionId: "sub_1" });
        // malformed live sub → handleEvent throws inside the transaction
        const broken = {
            ...fakeSub({ id: "sub_1", priceId: PRICE.premiumMonth }),
            items: undefined,
        };
        const first = await postSubEvent("customer.subscription.updated", broken, "evt_retry");
        expect(first.status).toBe(500);
        expect(await getWs(workspaceId)).toMatchObject({ plan: "pro" });

        const second = await postSubEvent(
            "customer.subscription.updated",
            fakeSub({ id: "sub_1", priceId: PRICE.premiumMonth }),
            "evt_retry",
        );
        expect((await second.json()).received).toBe(true);
        expect(await getWs(workspaceId)).toMatchObject({ plan: "premium" });
    });

    it("change-plan to free 503s (not 500s) when billing is unconfigured", async () => {
        vi.stubEnv("STRIPE_SECRET_KEY", undefined);
        const { userId, workspaceId } = await seedUser({ plan: "pro" });
        await setWs(workspaceId, { stripeSubscriptionId: "sub_1" });
        const res = await authed(
            userId,
            "/billing/change-plan",
            jsonInit("POST", { plan: "free" }),
        );
        expect(res.status).toBe(503);
    });

    it("resume 503s when billing is unconfigured", async () => {
        vi.stubEnv("STRIPE_SECRET_KEY", undefined);
        const { userId, workspaceId } = await seedUser({ plan: "pro" });
        await setWs(workspaceId, { stripeSubscriptionId: "sub_1", cancelAtPeriodEnd: true });
        const res = await authed(userId, "/billing/resume", jsonInit("POST", {}));
        expect(res.status).toBe(503);
    });
});

describe("owner-only billing mutations", () => {
    async function seedMember(workspaceId: string): Promise<string> {
        const [member] = await db
            .insert(schema.users)
            .values({
                email: `member-${workspaceId.slice(0, 8)}@test.local`,
                emailVerifiedAt: new Date(),
            })
            .returning();
        await db.insert(schema.members).values({ workspaceId, userId: member!.id });
        return member!.id;
    }

    it("a non-owner member can read billing but not mutate it", async () => {
        const { workspaceId } = await seedUser({ plan: "pro" });
        await setWs(workspaceId, {
            stripeCustomerId: "cus_1",
            stripeSubscriptionId: "sub_1",
        });
        const memberId = await seedMember(workspaceId);

        expect((await authed(memberId, "/billing")).status).toBe(200);

        const attempts = await Promise.all([
            authed(memberId, "/billing/checkout", jsonInit("POST", { plan: "pro" })),
            authed(memberId, "/billing/change-plan", jsonInit("POST", { plan: "premium" })),
            authed(memberId, "/billing/resume", jsonInit("POST", {})),
            authed(memberId, "/billing/portal", jsonInit("POST", {})),
        ]);
        for (const res of attempts) expect(res.status).toBe(403);
        expect(stripeMock.subscriptions.update).not.toHaveBeenCalled();
        expect(stripeMock.checkout.sessions.create).not.toHaveBeenCalled();
    });

    it("the owner still passes every gate", async () => {
        const { userId, workspaceId } = await seedUser({ plan: "pro" });
        await setWs(workspaceId, {
            stripeCustomerId: "cus_1",
            stripeSubscriptionId: "sub_1",
            cancelAtPeriodEnd: true,
        });
        const res = await authed(userId, "/billing/resume", jsonInit("POST", {}));
        expect(res.status).toBe(200);
    });
});

describe("GET /billing/ledger", () => {
    it("returns entries newest-first with running balances", async () => {
        const { userId, workspaceId } = await seedUser();
        await setWs(workspaceId, { aiCreditsBalance: 100, creditsResetAt: future() });
        await reserve(await getWs(workspaceId), userId, "generate-theme", { prices: prices() });
        await reserve(await getWs(workspaceId), userId, "rewrite-text", { prices: prices() });
        const res = await authed(userId, "/billing/ledger");
        expect(res.status).toBe(200);
        const { entries } = await res.json();
        expect(entries).toHaveLength(2);
        expect(entries[0]).toMatchObject({ delta: -3 }); // rewrite-text, newest first
        expect(entries[1]).toMatchObject({ delta: -8 }); // generate-theme
    });

    it("degrades a parseable but garbage cursor to the first page", async () => {
        const { userId, workspaceId } = await seedUser();
        await setWs(workspaceId, { aiCreditsBalance: 100, creditsResetAt: future() });
        await reserve(await getWs(workspaceId), userId, "rewrite-text", { prices: prices() });
        const garbage = (v: object): string => Buffer.from(JSON.stringify(v)).toString("base64url");
        for (const cursor of [
            garbage({ at: "not-a-date", id: "11111111-1111-1111-1111-111111111111" }),
            garbage({ at: new Date().toISOString(), id: "not-a-uuid" }),
        ]) {
            const res = await authed(userId, `/billing/ledger?cursor=${cursor}`);
            expect(res.status).toBe(200);
            expect((await res.json()).entries).toHaveLength(1);
        }
    });
});

describe("billing hardening", () => {
    it("409s a checkout while a subscription is live — change-plan is the path", async () => {
        const { userId, workspaceId } = await seedUser({ plan: "pro" });
        await setWs(workspaceId, { stripeSubscriptionId: "sub_live" });
        const res = await authed(
            userId,
            "/billing/checkout",
            jsonInit("POST", { plan: "premium" }),
        );
        expect(res.status).toBe(409);
        expect((await res.json()).useChangePlan).toBe(true);
        expect(stripeMock.checkout.sessions.create).not.toHaveBeenCalled();
    });

    it("a checkout grants on top of the balance and writes an audit row", async () => {
        const { workspaceId } = await seedUser({ plan: "free" });
        await setWs(workspaceId, { aiCreditsBalance: 120 });
        await postWebhook(
            subscriptionCheckout(
                workspaceId,
                fakeSub({ id: "sub_up", priceId: PRICE.proMonth }),
                "cs_up",
            ),
        );
        const grant = (await ledgerOf(workspaceId)).find((r) => r.reason === "upgrade-grant");
        expect(grant).toBeTruthy();
        expect(grant!.delta).toBe(PRO);
        expect(grant!.userId).toBeNull();
        // the 120 they already had is kept: subscribing adds, it does not reset
        expect(grant!.balanceAfter).toBe(120 + PRO);
        expect((await getWs(workspaceId)).aiCreditsBalance).toBe(120 + PRO);
    });
});
