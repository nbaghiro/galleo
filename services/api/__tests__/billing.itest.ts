import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import type Stripe from "stripe";
import { CREDITS_PER_GENERATION, limitsFor, visiblePlans } from "@model/billing";
import { authed, jsonInit, request, seedUser } from "../../__tests__/harness";
import { db, schema } from "../../schema";

// The one external oracle we fake: the live Stripe SDK client (mocked at the package boundary, so the
// `new Stripe(key)` in services/billing/stripe.ts hands back this stub). The pure price↔plan helpers
// (priceIdFor / planForPrice / intervalForPrice / stripeReady) run for real off the stubbed env, so
// mapping bugs still surface here — only the network calls are stand-ins.
const stripeMock = vi.hoisted(() => ({
    customers: { create: vi.fn() },
    checkout: { sessions: { create: vi.fn() } },
    billingPortal: { sessions: { create: vi.fn() } },
    subscriptions: { retrieve: vi.fn(), update: vi.fn() },
    webhooks: { constructEvent: vi.fn() },
}));

// `new Stripe(key)` must call a constructor — a function that returns stripeMock (arrows can't be `new`ed).
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
} as const;

function configureStripe(): void {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test");
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_test");
    vi.stubEnv("STRIPE_PRICE_PRO_MONTH", PRICE.proMonth);
    vi.stubEnv("STRIPE_PRICE_PRO_YEAR", PRICE.proYear);
    vi.stubEnv("STRIPE_PRICE_PREMIUM_MONTH", PRICE.premiumMonth);
    vi.stubEnv("STRIPE_PRICE_PREMIUM_YEAR", PRICE.premiumYear);
}

const YEAR_2030 = 1893456000; // fixed future unix seconds; keeps period-end assertions deterministic

type SubOverrides = {
    id?: string;
    priceId?: string;
    quantity?: number;
    status?: Stripe.Subscription.Status;
    periodEnd?: number;
    cancelAtPeriodEnd?: boolean;
};

function fakeSub(o: SubOverrides = {}): Stripe.Subscription {
    return {
        id: o.id ?? "sub_1",
        status: o.status ?? "active",
        cancel_at_period_end: o.cancelAtPeriodEnd ?? false,
        items: {
            data: [
                {
                    id: "si_1",
                    price: { id: o.priceId ?? PRICE.proMonth },
                    quantity: o.quantity ?? 1,
                    current_period_end: o.periodEnd ?? YEAR_2030,
                },
            ],
        },
    } as unknown as Stripe.Subscription;
}

// id feeds the webhook's idempotency claim; unique per test (the DB is truncated between tests), and
// reused verbatim to simulate a Stripe redelivery.
const stripeEvent = (type: string, object: unknown, id = "evt_test"): Stripe.Event =>
    ({ id, type, data: { object } }) as unknown as Stripe.Event;

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

// Deliver an event to the webhook. constructEvent is faked to return `ev`, so signature verification
// is bypassed — the handler logic (the thing under test) still runs against the real DB.
function postWebhook(ev: Stripe.Event): Promise<Response> {
    stripeMock.webhooks.constructEvent.mockReturnValue(ev);
    return request("/billing/webhook", {
        method: "POST",
        headers: { "stripe-signature": "sig", "Content-Type": "application/json" },
        body: "{}",
    });
}

beforeEach(() => {
    configureStripe();
    stripeMock.customers.create.mockResolvedValue({ id: "cus_1" } as unknown as Stripe.Customer);
    stripeMock.checkout.sessions.create.mockResolvedValue({
        url: "https://checkout.stripe.test/s",
    } as unknown as Stripe.Checkout.Session);
    stripeMock.billingPortal.sessions.create.mockResolvedValue({
        url: "https://portal.stripe.test/s",
    } as unknown as Stripe.BillingPortal.Session);
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
        expect(body.status).toBe("active");
        expect(body.credits.limit).toBe(limitsFor("free").aiCreditsPerMonth);
        expect(body.credits.perGeneration).toBe(CREDITS_PER_GENERATION);
        expect(body.catalog).toHaveLength(visiblePlans().length);
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

    it("passes the requested seat count as the line-item quantity for per-seat plans", async () => {
        const { userId } = await seedUser();
        await authed(userId, "/billing/checkout", jsonInit("POST", { plan: "pro", seats: 3 }));
        expect(stripeMock.checkout.sessions.create).toHaveBeenCalledWith(
            expect.objectContaining({ line_items: [{ price: PRICE.proMonth, quantity: 3 }] }),
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

    it("503s when billing is not configured", async () => {
        vi.stubEnv("STRIPE_SECRET_KEY", undefined);
        const { userId } = await seedUser();
        const res = await authed(userId, "/billing/checkout", jsonInit("POST", { plan: "pro" }));
        expect(res.status).toBe(503);
        expect(stripeMock.checkout.sessions.create).not.toHaveBeenCalled();
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
    async function withSubscription(plan: string, priceId: string, quantity = 1) {
        const seed = await seedUser({ plan });
        await setWs(seed.workspaceId, {
            stripeCustomerId: "cus_1",
            stripeSubscriptionId: "sub_1",
        });
        stripeMock.subscriptions.retrieve.mockResolvedValue(fakeSub({ priceId, quantity }));
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

    it("downgrades premium→pro with create_prorations (credit onto the next invoice)", async () => {
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
        expect(stripeMock.subscriptions.retrieve).not.toHaveBeenCalled();
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

    it("treats a seat increase as an upgrade (always_invoice)", async () => {
        const { userId } = await withSubscription("pro", PRICE.proMonth, 1);
        const res = await authed(
            userId,
            "/billing/change-plan",
            jsonInit("POST", { plan: "pro", seats: 3 }),
        );
        expect((await res.json()).effect).toBe("upgraded");
        expect(stripeMock.subscriptions.update).toHaveBeenCalledWith(
            "sub_1",
            expect.objectContaining({
                proration_behavior: "always_invoice",
                items: [{ id: "si_1", price: PRICE.proMonth, quantity: 3 }],
            }),
        );
    });

    it("treats a seat decrease as a non-upgrade (create_prorations)", async () => {
        const { userId } = await withSubscription("pro", PRICE.proMonth, 3);
        const res = await authed(
            userId,
            "/billing/change-plan",
            jsonInit("POST", { plan: "pro", seats: 1 }),
        );
        expect((await res.json()).effect).toBe("changed");
        expect(stripeMock.subscriptions.update).toHaveBeenCalledWith(
            "sub_1",
            expect.objectContaining({
                proration_behavior: "create_prorations",
                items: [{ id: "si_1", price: PRICE.proMonth, quantity: 1 }],
            }),
        );
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

describe("POST /billing/spend", () => {
    // Keep the credit window in the future so currentWorkspace's lazy rollover can't zero our setup.
    const future = () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    it("decrements credits by the given amount and returns the remaining balance", async () => {
        const { userId, workspaceId } = await seedUser();
        await setWs(workspaceId, { aiCreditsUsed: 0, creditsResetAt: future() });
        const res = await authed(userId, "/billing/spend", jsonInit("POST", { amount: 5 }));
        expect(res.status).toBe(200);
        const limit = limitsFor("free").aiCreditsPerMonth;
        expect((await res.json()).remaining).toBe(limit - 5);
        expect((await getWs(workspaceId)).aiCreditsUsed).toBe(5);
    });

    it("402s and charges nothing once the monthly allowance is exhausted", async () => {
        const { userId, workspaceId } = await seedUser();
        const limit = limitsFor("free").aiCreditsPerMonth;
        await setWs(workspaceId, { aiCreditsUsed: limit, creditsResetAt: future() });
        const res = await authed(userId, "/billing/spend", jsonInit("POST", { amount: 5 }));
        expect(res.status).toBe(402);
        const body = await res.json();
        expect(body.upgrade).toBe(true);
        expect(body.remaining).toBe(0);
        expect((await getWs(workspaceId)).aiCreditsUsed).toBe(limit);
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
        await setWs(workspaceId, { aiCreditsUsed: 99, cancelAtPeriodEnd: true });
        stripeMock.subscriptions.retrieve.mockResolvedValue(
            fakeSub({ id: "sub_1", priceId: PRICE.proMonth, quantity: 2, status: "active" }),
        );
        const res = await postWebhook(
            stripeEvent("checkout.session.completed", {
                client_reference_id: workspaceId,
                subscription: "sub_1",
                customer: "cus_1",
            }),
        );
        expect(res.status).toBe(200);
        expect((await res.json()).received).toBe(true);
        expect(await getWs(workspaceId)).toMatchObject({
            plan: "pro",
            planStatus: "active",
            stripeCustomerId: "cus_1",
            stripeSubscriptionId: "sub_1",
            seats: 2,
            aiCreditsUsed: 0,
            cancelAtPeriodEnd: false,
        });
    });

    it("is idempotent: a redelivered event id is claimed once and not re-applied", async () => {
        const { workspaceId } = await seedUser({ plan: "pro" });
        await setWs(workspaceId, { stripeSubscriptionId: "sub_1", seats: 1 });
        const ev = stripeEvent(
            "customer.subscription.updated",
            fakeSub({ id: "sub_1", priceId: PRICE.premiumMonth, quantity: 3 }),
            "evt_dup",
        );
        const first = await postWebhook(ev);
        expect((await first.json()).received).toBe(true);
        expect(await getWs(workspaceId)).toMatchObject({ plan: "premium", seats: 3 });

        // Simulate drift, then redeliver the exact same event — the claim short-circuits the handler.
        await setWs(workspaceId, { plan: "pro", seats: 1 });
        const second = await postWebhook(ev);
        expect((await second.json()).duplicate).toBe(true);
        expect(await getWs(workspaceId)).toMatchObject({ plan: "pro", seats: 1 });
    });

    it("customer.subscription.updated syncs a scheduled cancel onto the workspace", async () => {
        const { workspaceId } = await seedUser({ plan: "pro" });
        await setWs(workspaceId, { stripeSubscriptionId: "sub_1", cancelAtPeriodEnd: false });
        await postWebhook(
            stripeEvent(
                "customer.subscription.updated",
                fakeSub({ id: "sub_1", priceId: PRICE.proMonth, cancelAtPeriodEnd: true }),
            ),
        );
        expect((await getWs(workspaceId)).cancelAtPeriodEnd).toBe(true);
    });

    it("customer.subscription.updated syncs plan, seats and status for the matching workspace", async () => {
        const { workspaceId } = await seedUser({ plan: "pro" });
        await setWs(workspaceId, { stripeSubscriptionId: "sub_1", seats: 1 });
        await postWebhook(
            stripeEvent(
                "customer.subscription.updated",
                fakeSub({
                    id: "sub_1",
                    priceId: PRICE.premiumMonth,
                    quantity: 3,
                    status: "active",
                }),
            ),
        );
        expect(await getWs(workspaceId)).toMatchObject({
            plan: "premium",
            seats: 3,
            planStatus: "active",
        });
    });

    it("customer.subscription.updated for an unknown subscription is a no-op", async () => {
        const { workspaceId } = await seedUser({ plan: "pro" });
        await setWs(workspaceId, { stripeSubscriptionId: "sub_1", seats: 1 });
        await postWebhook(
            stripeEvent("customer.subscription.updated", fakeSub({ id: "sub_other", quantity: 9 })),
        );
        expect(await getWs(workspaceId)).toMatchObject({ plan: "pro", seats: 1 });
    });

    it("customer.subscription.deleted reverts the workspace to free", async () => {
        const { workspaceId } = await seedUser({ plan: "premium" });
        await setWs(workspaceId, { stripeSubscriptionId: "sub_1", seats: 3 });
        await postWebhook(stripeEvent("customer.subscription.deleted", fakeSub({ id: "sub_1" })));
        expect(await getWs(workspaceId)).toMatchObject({
            plan: "free",
            planStatus: "canceled",
            stripeSubscriptionId: null,
            seats: 1,
        });
    });

    it("invoice.payment_failed marks the workspace past_due", async () => {
        const { workspaceId } = await seedUser({ plan: "pro" });
        await setWs(workspaceId, { stripeCustomerId: "cus_1", planStatus: "active" });
        await postWebhook(stripeEvent("invoice.payment_failed", { customer: "cus_1" }));
        expect((await getWs(workspaceId)).planStatus).toBe("past_due");
    });

    it("invoice.paid clears a past_due workspace back to active", async () => {
        const { workspaceId } = await seedUser({ plan: "pro" });
        await setWs(workspaceId, { stripeCustomerId: "cus_1", planStatus: "past_due" });
        await postWebhook(stripeEvent("invoice.paid", { customer: "cus_1" }));
        expect((await getWs(workspaceId)).planStatus).toBe("active");
    });

    it("invoice.paid leaves an already-active workspace untouched", async () => {
        const { workspaceId } = await seedUser({ plan: "pro" });
        await setWs(workspaceId, { stripeCustomerId: "cus_1", planStatus: "active" });
        await postWebhook(stripeEvent("invoice.paid", { customer: "cus_1" }));
        expect((await getWs(workspaceId)).planStatus).toBe("active");
    });
});
