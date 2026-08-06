import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import type Stripe from "stripe";
import { CREDITS_PER_GENERATION, PLANS, limitsFor, visiblePlans } from "@model/billing";
import { authed, jsonInit, request, seedUser } from "../../__tests__/harness";
import { db } from "../../db/client";
import { schema } from "../../db/schema";
import { chargeCredits, settleCredits } from "../../core/credits";

// Mocked at the package boundary, so the `new Stripe(key)` in services/billing/stripe.ts hands back
// this stub; the pure price↔plan helpers still run for real off the stubbed env.
const stripeMock = vi.hoisted(() => ({
    customers: { create: vi.fn() },
    checkout: { sessions: { create: vi.fn() } },
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
    metadata?: Record<string, string>;
};

function fakeSub(o: SubOverrides = {}): Stripe.Subscription {
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
                    quantity: o.quantity ?? 1,
                    current_period_end: o.periodEnd ?? YEAR_2030,
                },
            ],
        },
    } as unknown as Stripe.Subscription;
}

// The id feeds the webhook's idempotency claim; reused verbatim to simulate a redelivery.
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

// constructEvent is faked, so signature verification is bypassed and the handler still runs for real.
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

describe("credit engine", () => {
    const future = () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    it("scales the credit pool by purchased seats on per-seat plans", async () => {
        const { userId, workspaceId } = await seedUser({ plan: "pro" });
        await setWs(workspaceId, { seats: 3, creditsResetAt: future() });
        const res = await authed(userId, "/billing");
        expect((await res.json()).credits.limit).toBe(limitsFor("pro").aiCreditsPerMonth * 3);
    });

    it("gates spend against the seat-scaled pool, not the per-seat base", async () => {
        const { userId, workspaceId } = await seedUser({ plan: "pro" });
        const perSeat = limitsFor("pro").aiCreditsPerMonth;
        await setWs(workspaceId, {
            seats: 2,
            aiCreditsUsed: perSeat + 100, // over one seat's worth, well inside two
            creditsResetAt: future(),
        });
        const res = await authed(userId, "/billing/spend", jsonInit("POST", { amount: 50 }));
        expect(res.status).toBe(200);
        expect((await res.json()).remaining).toBe(perSeat * 2 - (perSeat + 150));
    });

    it("exactly one of two concurrent near-limit spends wins", async () => {
        const { userId, workspaceId } = await seedUser();
        const limit = limitsFor("free").aiCreditsPerMonth;
        await setWs(workspaceId, { aiCreditsUsed: limit - 50, creditsResetAt: future() });
        const [a, b] = await Promise.all([
            authed(userId, "/billing/spend", jsonInit("POST", { amount: 30 })),
            authed(userId, "/billing/spend", jsonInit("POST", { amount: 30 })),
        ]);
        const statuses = [a.status, b.status].sort();
        expect(statuses).toEqual([200, 402]);
        expect((await getWs(workspaceId)).aiCreditsUsed).toBe(limit - 20);
    });

    it("writes a ledger row per charge with the remaining balance", async () => {
        const { userId, workspaceId } = await seedUser();
        await setWs(workspaceId, { aiCreditsUsed: 0, creditsResetAt: future() });
        await authed(userId, "/billing/spend", jsonInit("POST", { action: "generate-theme" }));
        const rows = await db
            .select()
            .from(schema.credits)
            .where(eq(schema.credits.workspaceId, workspaceId));
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({
            delta: -4, // generate-theme = 1 theme unit
            reason: "generate-theme",
            balanceAfter: limitsFor("free").aiCreditsPerMonth - 4,
        });
    });

    it("settleCredits refunds an over-reserve relative to the live row", async () => {
        const { workspaceId } = await seedUser();
        await setWs(workspaceId, { aiCreditsUsed: 0, creditsResetAt: future() });
        const ws = await getWs(workspaceId);
        const charged = await chargeCredits(ws, 50, "generate-image");
        expect(charged.ok).toBe(true);
        // a parallel spend lands while the "stream" runs — the settle must not clobber it
        await chargeCredits(ws, 10, "rewrite-text");
        await settleCredits(ws, -20, "generate-image:settle");
        expect((await getWs(workspaceId)).aiCreditsUsed).toBe(40);
        const rows = await db
            .select()
            .from(schema.credits)
            .where(eq(schema.credits.workspaceId, workspaceId));
        expect(rows.map((r) => r.delta).sort((x, y) => x - y)).toEqual([-50, -10, 20]);
    });

    it("chargeCredits rejects without side effects once the pool is exhausted", async () => {
        const { workspaceId } = await seedUser();
        const limit = limitsFor("free").aiCreditsPerMonth;
        await setWs(workspaceId, { aiCreditsUsed: limit, creditsResetAt: future() });
        const ws = await getWs(workspaceId);
        const res = await chargeCredits(ws, 1, "rewrite-text");
        expect(res).toMatchObject({ ok: false, remaining: 0 });
        expect((await getWs(workspaceId)).aiCreditsUsed).toBe(limit);
        const rows = await db
            .select()
            .from(schema.credits)
            .where(eq(schema.credits.workspaceId, workspaceId));
        expect(rows).toHaveLength(0);
    });
});

describe("webhook hardening", () => {
    it("a cycle-renewal invoice re-anchors the credit window and logs the reset", async () => {
        const { workspaceId } = await seedUser({ plan: "pro" });
        await setWs(workspaceId, { stripeCustomerId: "cus_1", aiCreditsUsed: 999 });
        await postWebhook(
            stripeEvent("invoice.paid", {
                customer: "cus_1",
                billing_reason: "subscription_cycle",
            }),
        );
        const ws = await getWs(workspaceId);
        expect(ws.aiCreditsUsed).toBe(0);
        expect(ws.planStatus).toBe("active");
        const rows = await db
            .select()
            .from(schema.credits)
            .where(eq(schema.credits.workspaceId, workspaceId));
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({ delta: 999, reason: "renewal-reset" });
    });

    it("a non-cycle invoice (proration/one-off) leaves the credit window alone", async () => {
        const { workspaceId } = await seedUser({ plan: "pro" });
        await setWs(workspaceId, { stripeCustomerId: "cus_1", aiCreditsUsed: 42 });
        await postWebhook(
            stripeEvent("invoice.paid", {
                customer: "cus_1",
                billing_reason: "subscription_update",
            }),
        );
        expect((await getWs(workspaceId)).aiCreditsUsed).toBe(42);
    });

    it("subscription.updated adopts an unlinked workspace via the metadata backref", async () => {
        const { workspaceId } = await seedUser({ plan: "free" });
        await postWebhook(
            stripeEvent(
                "customer.subscription.updated",
                fakeSub({
                    id: "sub_new",
                    priceId: PRICE.proMonth,
                    metadata: { workspaceId },
                }),
            ),
        );
        expect(await getWs(workspaceId)).toMatchObject({
            plan: "pro",
            stripeSubscriptionId: "sub_new",
        });
    });

    it("subscription.updated cannot hijack a workspace already linked to another sub", async () => {
        const { workspaceId } = await seedUser({ plan: "premium" });
        await setWs(workspaceId, { stripeSubscriptionId: "sub_current" });
        await postWebhook(
            stripeEvent(
                "customer.subscription.updated",
                fakeSub({ id: "sub_stale", priceId: PRICE.proMonth, metadata: { workspaceId } }),
            ),
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
        await postWebhook(stripeEvent("customer.subscription.deleted", fakeSub({ id: "sub_1" })));
        expect((await getWs(workspaceId)).planPeriodEnd).toBeNull();
    });

    it("a handler failure rolls the claim back so the redelivery applies", async () => {
        const { workspaceId } = await seedUser({ plan: "pro" });
        await setWs(workspaceId, { stripeSubscriptionId: "sub_1", seats: 1 });
        // malformed payload → handleEvent throws inside the claim transaction
        const broken = {
            ...fakeSub({ id: "sub_1", priceId: PRICE.premiumMonth, quantity: 3 }),
            items: undefined,
        } as unknown as Stripe.Subscription;
        const first = await postWebhook(
            stripeEvent("customer.subscription.updated", broken, "evt_retry"),
        );
        expect(first.status).toBe(500);
        expect(await getWs(workspaceId)).toMatchObject({ plan: "pro", seats: 1 });

        const second = await postWebhook(
            stripeEvent(
                "customer.subscription.updated",
                fakeSub({ id: "sub_1", priceId: PRICE.premiumMonth, quantity: 3 }),
                "evt_retry",
            ),
        );
        expect((await second.json()).duplicate).toBeUndefined();
        expect(await getWs(workspaceId)).toMatchObject({ plan: "premium", seats: 3 });
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
            .values({ email: `member-${workspaceId.slice(0, 8)}@test.local` })
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
        await setWs(workspaceId, {
            aiCreditsUsed: 0,
            creditsResetAt: new Date(Date.now() + 86400_000),
        });
        await authed(userId, "/billing/spend", jsonInit("POST", { amount: 10 }));
        await authed(userId, "/billing/spend", jsonInit("POST", { amount: 5 }));
        const res = await authed(userId, "/billing/ledger");
        expect(res.status).toBe(200);
        const { entries } = await res.json();
        expect(entries).toHaveLength(2);
        expect(entries[0]).toMatchObject({ delta: -5 });
        expect(entries[1]).toMatchObject({ delta: -10 });
    });
});

describe("credit top-ups", () => {
    const stubPacks = (): void => {
        vi.stubEnv("STRIPE_PRICE_PACK_1K", "price_pack_1k");
        vi.stubEnv("STRIPE_PRICE_PACK_5K", "price_pack_5k");
    };

    it("lists purchasable packs only for plans that allow top-ups", async () => {
        stubPacks();
        const pro = await seedUser({ plan: "pro" });
        const free = await seedUser({ plan: "free" });
        const proBody = await (await authed(pro.userId, "/billing")).json();
        const freeBody = await (await authed(free.userId, "/billing")).json();
        expect(proBody.topUps.map((p: { id: string }) => p.id)).toEqual(["pack-1k", "pack-5k"]);
        expect(freeBody.topUps).toEqual([]);
    });

    it("opens a payment-mode checkout session stamped with the pack", async () => {
        stubPacks();
        const { userId, workspaceId } = await seedUser({ plan: "pro" });
        await setWs(workspaceId, { stripeCustomerId: "cus_1" });
        const res = await authed(userId, "/billing/topup", jsonInit("POST", { pack: "pack-1k" }));
        expect(res.status).toBe(200);
        expect((await res.json()).url).toBe("https://checkout.stripe.test/s");
        expect(stripeMock.checkout.sessions.create).toHaveBeenCalledWith(
            expect.objectContaining({
                mode: "payment",
                customer: "cus_1",
                client_reference_id: workspaceId,
                line_items: [{ price: "price_pack_1k", quantity: 1 }],
                metadata: { workspaceId, pack: "pack-1k" },
            }),
        );
    });

    it("402s a free workspace (plan disallows top-ups)", async () => {
        stubPacks();
        const { userId } = await seedUser({ plan: "free" });
        const res = await authed(userId, "/billing/topup", jsonInit("POST", { pack: "pack-1k" }));
        expect(res.status).toBe(402);
        expect((await res.json()).upgrade).toBe(true);
    });

    it("the payment-mode webhook grants the pack once, redeliveries no-op", async () => {
        const { workspaceId } = await seedUser({ plan: "pro" });
        const ev = stripeEvent(
            "checkout.session.completed",
            {
                mode: "payment",
                client_reference_id: workspaceId,
                metadata: { workspaceId, pack: "pack-1k" },
            },
            "evt_topup",
        );
        await postWebhook(ev);
        expect((await getWs(workspaceId)).aiCreditsBonus).toBe(1000);
        const again = await postWebhook(ev);
        expect((await again.json()).duplicate).toBe(true);
        expect((await getWs(workspaceId)).aiCreditsBonus).toBe(1000);
        const rows = await db
            .select()
            .from(schema.credits)
            .where(eq(schema.credits.workspaceId, workspaceId));
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({ delta: 1000, reason: "topup:pack-1k" });
    });

    it("charges drain the monthly pool first, then bonus", async () => {
        const { userId, workspaceId } = await seedUser();
        const limit = limitsFor("free").aiCreditsPerMonth;
        await setWs(workspaceId, {
            aiCreditsUsed: limit - 10,
            aiCreditsBonus: 50,
            creditsResetAt: new Date(Date.now() + 86400_000),
        });
        const res = await authed(userId, "/billing/spend", jsonInit("POST", { amount: 30 }));
        expect(res.status).toBe(200);
        expect((await res.json()).remaining).toBe(30);
        const ws = await getWs(workspaceId);
        expect(ws.aiCreditsUsed).toBe(limit);
        expect(ws.aiCreditsBonus).toBe(30);
    });

    it("402s only after both pool and bonus are exhausted", async () => {
        const { userId, workspaceId } = await seedUser();
        const limit = limitsFor("free").aiCreditsPerMonth;
        await setWs(workspaceId, {
            aiCreditsUsed: limit,
            aiCreditsBonus: 5,
            creditsResetAt: new Date(Date.now() + 86400_000),
        });
        const ok = await authed(userId, "/billing/spend", jsonInit("POST", { amount: 5 }));
        expect(ok.status).toBe(200);
        const broke = await authed(userId, "/billing/spend", jsonInit("POST", { amount: 1 }));
        expect(broke.status).toBe(402);
    });
});

describe("trials", () => {
    it("checkout passes trial_period_days when the catalog enables a trial", async () => {
        const { userId } = await seedUser();
        const original = PLANS.pro.billing.trialDays;
        PLANS.pro.billing.trialDays = 14;
        try {
            await authed(userId, "/billing/checkout", jsonInit("POST", { plan: "pro" }));
        } finally {
            PLANS.pro.billing.trialDays = original;
        }
        expect(stripeMock.checkout.sessions.create).toHaveBeenCalledWith(
            expect.objectContaining({
                subscription_data: expect.objectContaining({ trial_period_days: 14 }),
            }),
        );
    });

    it("no trial field is sent while the catalog stays at 0 days", async () => {
        const { userId } = await seedUser();
        await authed(userId, "/billing/checkout", jsonInit("POST", { plan: "pro" }));
        const arg = stripeMock.checkout.sessions.create.mock.calls[0]![0] as {
            subscription_data: Record<string, unknown>;
        };
        expect(arg.subscription_data.trial_period_days).toBeUndefined();
    });
});

describe("seat floor", () => {
    it("blocks reducing seats below the active member count", async () => {
        const { userId, workspaceId } = await seedUser({ plan: "pro" });
        await setWs(workspaceId, { stripeCustomerId: "cus_1", stripeSubscriptionId: "sub_1" });
        const [other] = await db
            .insert(schema.users)
            .values({ email: `seatmate-${workspaceId.slice(0, 8)}@test.local` })
            .returning();
        await db.insert(schema.members).values({ workspaceId, userId: other!.id });
        stripeMock.subscriptions.retrieve.mockResolvedValue(
            fakeSub({ priceId: PRICE.proMonth, quantity: 3 }),
        );
        const res = await authed(
            userId,
            "/billing/change-plan",
            jsonInit("POST", { plan: "pro", seats: 1 }),
        );
        expect(res.status).toBe(400);
        expect((await res.json()).error).toContain("2 members");
        expect(stripeMock.subscriptions.update).not.toHaveBeenCalled();
    });
});
