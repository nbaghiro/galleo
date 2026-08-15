import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import type Stripe from "stripe";
import {
    ADD_ONS,
    CREDITS_PER_GENERATION,
    PLANS,
    limitsFor,
    seatsFor,
    visiblePlans,
} from "@model/billing";
import { authed, jsonInit, request, seedUser } from "@services/__tests__/harness";
import { db } from "@services/db/client";
import { schema } from "@services/db/schema";
import { chargeCredits, settleCredits } from "@services/core/ledger";
import { reserve } from "@services/core/spend";

// Mocked at the package boundary, so the `new Stripe(key)` in services/billing/stripe.ts hands back
// this stub; the pure price↔plan helpers still run for real off the stubbed env.
const stripeMock = vi.hoisted(() => ({
    customers: { create: vi.fn() },
    checkout: { sessions: { create: vi.fn() } },
    billingPortal: { sessions: { create: vi.fn() } },
    subscriptions: { retrieve: vi.fn(), update: vi.fn(), cancel: vi.fn() },
    subscriptionSchedules: { create: vi.fn(), update: vi.fn(), release: vi.fn() },
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
    addOns?: { priceId: string; quantity: number }[]; // extra items beside the plan's own
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
                ...(o.addOns ?? []).map((a, i) => ({
                    id: `si_addon_${i}`,
                    price: { id: a.priceId },
                    quantity: a.quantity,
                    current_period_end: o.periodEnd ?? YEAR_2030,
                })),
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
        expect(body.credits.limit).toBe(limitsFor("free").includedCredits);
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

    // the plan line is always quantity 1; seats ride their own item (see the add-on suite)
    it("keeps the plan line at quantity 1 whatever the seat count", async () => {
        const { userId } = await seedUser();
        await authed(userId, "/billing/checkout", jsonInit("POST", { plan: "pro", seats: 3 }));
        expect(stripeMock.checkout.sessions.create).toHaveBeenCalledWith(
            expect.objectContaining({ line_items: [{ price: PRICE.proMonth, quantity: 1 }] }),
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
    /** `extraSeats` becomes a seat add-on item, the way a real team subscription carries one. */
    async function withSubscription(plan: string, priceId: string, extraSeats = 0) {
        const seed = await seedUser({ plan });
        await setWs(seed.workspaceId, {
            stripeCustomerId: "cus_1",
            stripeSubscriptionId: "sub_1",
            seats: seatsFor(plan, extraSeats),
        });
        stripeMock.subscriptions.retrieve.mockResolvedValue(
            fakeSub({
                priceId,
                addOns: extraSeats
                    ? [{ priceId: "price_seat_month", quantity: extraSeats }]
                    : undefined,
            }),
        );
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

    it("parks premium→pro at period end — a paid tier runs out, it doesn't shrink", async () => {
        const { userId, workspaceId } = await withSubscription("premium", PRICE.premiumMonth);
        stripeMock.subscriptionSchedules.create.mockResolvedValue({ id: "sched_1" });
        stripeMock.subscriptionSchedules.update.mockResolvedValue({ id: "sched_1" });
        const res = await authed(userId, "/billing/change-plan", jsonInit("POST", { plan: "pro" }));
        expect((await res.json()).effect).toBe("scheduled");
        expect(stripeMock.subscriptions.update).not.toHaveBeenCalled();
        expect((await getWs(workspaceId)).scheduledChange).toMatchObject({ plan: "pro" });
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
        vi.stubEnv("STRIPE_PRICE_SEAT_MONTH", "price_seat_month");
        const { userId } = await withSubscription("premium", PRICE.premiumMonth);
        const incl = PLANS.premium.billing.includedSeats;
        const res = await authed(
            userId,
            "/billing/change-plan",
            jsonInit("POST", { plan: "premium", seats: incl + 2 }),
        );
        expect((await res.json()).effect).toBe("upgraded");
        expect(stripeMock.subscriptions.update).toHaveBeenCalledWith(
            "sub_1",
            expect.objectContaining({
                proration_behavior: "always_invoice",
                items: [
                    { id: "si_1", price: PRICE.premiumMonth, quantity: 1 },
                    { price: "price_seat_month", quantity: 2 },
                ],
            }),
        );
    });

    it("parks a seat decrease at period end too", async () => {
        vi.stubEnv("STRIPE_PRICE_SEAT_MONTH", "price_seat_month");
        const { userId, workspaceId } = await withSubscription("premium", PRICE.premiumMonth, 3);
        stripeMock.subscriptionSchedules.create.mockResolvedValue({ id: "sched_1" });
        stripeMock.subscriptionSchedules.update.mockResolvedValue({ id: "sched_1" });
        const incl = PLANS.premium.billing.includedSeats;
        const res = await authed(
            userId,
            "/billing/change-plan",
            jsonInit("POST", { plan: "premium", seats: incl }),
        );
        expect((await res.json()).effect).toBe("scheduled");
        expect((await getWs(workspaceId)).scheduledChange).toMatchObject({ seats: incl });
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

// The client-priced POST /billing/spend route is gone: every paid action now reserves through
// core/spend.ts, so the caller names a tool and the server prices it from the catalog.
describe("reserving a priced action", () => {
    const future = () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    it("prices the named action from the catalog", async () => {
        const { userId, workspaceId } = await seedUser();
        await setWs(workspaceId, { aiCreditsUsed: 0, creditsResetAt: future() });
        const held = await reserve(await getWs(workspaceId), userId, "generate-theme");
        expect(held.ok).toBe(true);
        expect((await getWs(workspaceId)).aiCreditsUsed).toBe(4); // generate-theme = 4
    });

    it("refuses and charges nothing once the monthly allowance is exhausted", async () => {
        const { userId, workspaceId } = await seedUser();
        const limit = limitsFor("free").includedCredits;
        await setWs(workspaceId, { aiCreditsUsed: limit, creditsResetAt: future() });
        const held = await reserve(await getWs(workspaceId), userId, "generate-theme");
        expect(held.ok).toBe(false);
        expect(held.ok === false && held.remaining).toBe(0);
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
            seats: 1, // Pro includes one; the plan item's quantity is not a seat count
            creditBlocks: 0,
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

    it("widens the pool by the seat add-on, counting only seats beyond the included ones", async () => {
        const { userId, workspaceId } = await seedUser({ plan: "premium" });
        const incl = PLANS.premium.billing.includedSeats;
        await setWs(workspaceId, { seats: incl + 2, creditsResetAt: future() });
        const res = await authed(userId, "/billing");
        expect((await res.json()).credits.limit).toBe(
            PLANS.premium.ai.includedCredits + 2 * ADD_ONS.seat.credits,
        );
    });

    // seats a plan does not sell must not grant credits, or a lapsed subscription keeps its pool
    it("ignores seats on a plan that does not sell them", async () => {
        const { userId, workspaceId } = await seedUser({ plan: "pro" });
        await setWs(workspaceId, { seats: 9, creditsResetAt: future() });
        const res = await authed(userId, "/billing");
        expect((await res.json()).credits.limit).toBe(limitsFor("pro").includedCredits);
    });

    it("widens the pool by credit blocks", async () => {
        const { userId, workspaceId } = await seedUser({ plan: "pro" });
        await setWs(workspaceId, { creditBlocks: 3, creditsResetAt: future() });
        const res = await authed(userId, "/billing");
        expect((await res.json()).credits.limit).toBe(
            limitsFor("pro").includedCredits + 3 * ADD_ONS.credits.credits,
        );
    });

    it("gates spend against the widened pool, not the plan's own allowance", async () => {
        const { userId, workspaceId } = await seedUser({ plan: "pro" });
        const base = limitsFor("pro").includedCredits;
        await setWs(workspaceId, {
            creditBlocks: 1,
            aiCreditsUsed: base + 100, // past the plan's own allowance, inside the block
            creditsResetAt: future(),
        });
        const held = await reserve(await getWs(workspaceId), userId, "generate-theme");
        expect(held.ok).toBe(true);
        expect((await getWs(workspaceId)).aiCreditsUsed).toBe(base + 104);
    });

    it("exactly one of two concurrent near-limit spends wins", async () => {
        const { userId, workspaceId } = await seedUser();
        const limit = limitsFor("free").includedCredits;
        await setWs(workspaceId, { aiCreditsUsed: limit - 50, creditsResetAt: future() });
        await setWs(workspaceId, { aiCreditsUsed: limit - 4, creditsResetAt: future() });
        const ws = await getWs(workspaceId);
        const [a, b] = await Promise.all([
            reserve(ws, userId, "generate-theme"),
            reserve(ws, userId, "generate-theme"),
        ]);
        expect([a.ok, b.ok].sort()).toEqual([false, true]);
        expect((await getWs(workspaceId)).aiCreditsUsed).toBe(limit);
    });

    it("writes a ledger row per charge with the remaining balance", async () => {
        const { userId, workspaceId } = await seedUser();
        await setWs(workspaceId, { aiCreditsUsed: 0, creditsResetAt: future() });
        await reserve(await getWs(workspaceId), userId, "generate-theme");
        const rows = await db
            .select()
            .from(schema.credits)
            .where(eq(schema.credits.workspaceId, workspaceId));
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({
            delta: -4, // generate-theme = 1 theme unit
            reason: "generate-theme",
            balanceAfter: limitsFor("free").includedCredits - 4,
        });
    });

    it("settleCredits refunds an over-reserve relative to the live row", async () => {
        const { workspaceId } = await seedUser();
        await setWs(workspaceId, { aiCreditsUsed: 0, creditsResetAt: future() });
        const ws = await getWs(workspaceId);
        const charged = await chargeCredits(ws, 50, "generate-image");
        expect(charged.ok).toBe(true);
        // a parallel spend lands while the "stream" runs — the settle must not clobber it
        await chargeCredits(ws, 10, "ask-assistant");
        await settleCredits(ws, charged.entryId!, -20);
        expect((await getWs(workspaceId)).aiCreditsUsed).toBe(40);
        const rows = await db
            .select()
            .from(schema.credits)
            .where(eq(schema.credits.workspaceId, workspaceId));
        // the image charge was rewritten from -50 to -30; the parallel spend is untouched
        expect(rows.map((r) => r.delta).sort((x, y) => x - y)).toEqual([-30, -10]);
    });

    it("chargeCredits rejects without side effects once the pool is exhausted", async () => {
        const { workspaceId } = await seedUser();
        const limit = limitsFor("free").includedCredits;
        await setWs(workspaceId, { aiCreditsUsed: limit, creditsResetAt: future() });
        const ws = await getWs(workspaceId);
        const res = await chargeCredits(ws, 1, "ask-assistant");
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
        await reserve(await getWs(workspaceId), userId, "generate-theme");
        await reserve(await getWs(workspaceId), userId, "rewrite-text");
        const res = await authed(userId, "/billing/ledger");
        expect(res.status).toBe(200);
        const { entries } = await res.json();
        expect(entries).toHaveLength(2);
        expect(entries[0]).toMatchObject({ delta: -1 }); // rewrite-text, newest first
        expect(entries[1]).toMatchObject({ delta: -4 }); // generate-theme
    });
});

describe("recurring add-ons", () => {
    const stubAddOns = (): void => {
        vi.stubEnv("STRIPE_PRICE_SEAT_MONTH", "price_seat_month");
        vi.stubEnv("STRIPE_PRICE_CREDITS_MONTH", "price_credits_month");
    };

    it("offers only the add-ons the plan actually sells", async () => {
        stubAddOns();
        const premium = await seedUser({ plan: "premium" });
        const pro = await seedUser({ plan: "pro" });
        const free = await seedUser({ plan: "free" });
        const ids = async (u: { userId: string }): Promise<string[]> =>
            (await (await authed(u.userId, "/billing")).json()).addOns.map(
                (a: { id: string }) => a.id,
            );
        expect(await ids(premium)).toEqual(["seat", "credits"]);
        expect(await ids(pro)).toEqual(["credits"]); // Pro is solo, so no seat add-on
        expect(await ids(free)).toEqual([]);
    });

    it("checkout carries the add-ons as their own subscription lines", async () => {
        stubAddOns();
        const { userId, workspaceId } = await seedUser({ plan: "free" });
        await setWs(workspaceId, { stripeCustomerId: "cus_1" });
        const incl = PLANS.premium.billing.includedSeats;
        await authed(
            userId,
            "/billing/checkout",
            jsonInit("POST", { plan: "premium", seats: incl + 2, creditBlocks: 3 }),
        );
        expect(stripeMock.checkout.sessions.create).toHaveBeenCalledWith(
            expect.objectContaining({
                mode: "subscription",
                line_items: [
                    { price: PRICE.premiumMonth, quantity: 1 },
                    { price: "price_seat_month", quantity: 2 },
                    { price: "price_credits_month", quantity: 3 },
                ],
            }),
        );
    });

    it("omits an add-on line the plan does not sell", async () => {
        stubAddOns();
        const { userId, workspaceId } = await seedUser({ plan: "free" });
        await setWs(workspaceId, { stripeCustomerId: "cus_1" });
        await authed(
            userId,
            "/billing/checkout",
            jsonInit("POST", { plan: "pro", seats: 5, creditBlocks: 1 }),
        );
        expect(stripeMock.checkout.sessions.create).toHaveBeenCalledWith(
            expect.objectContaining({
                line_items: [
                    { price: PRICE.proMonth, quantity: 1 },
                    { price: "price_credits_month", quantity: 1 },
                ],
            }),
        );
    });

    it("the webhook reads seats and blocks off their own items", async () => {
        stubAddOns();
        const { workspaceId } = await seedUser({ plan: "free" });
        stripeMock.subscriptions.retrieve.mockResolvedValue(
            fakeSub({
                id: "sub_addons",
                priceId: PRICE.premiumMonth,
                addOns: [
                    { priceId: "price_seat_month", quantity: 4 },
                    { priceId: "price_credits_month", quantity: 2 },
                ],
            }),
        );
        await postWebhook(
            stripeEvent(
                "checkout.session.completed",
                {
                    mode: "subscription",
                    subscription: "sub_addons",
                    client_reference_id: workspaceId,
                    customer: "cus_1",
                },
                "evt_addons",
            ),
        );
        const ws = await getWs(workspaceId);
        expect(ws.plan).toBe("premium");
        expect(ws.seats).toBe(PLANS.premium.billing.includedSeats + 4);
        expect(ws.creditBlocks).toBe(2);
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
        vi.stubEnv("STRIPE_PRICE_SEAT_MONTH", "price_seat_month");
        const { userId, workspaceId } = await seedUser({ plan: "premium" });
        await setWs(workspaceId, { stripeCustomerId: "cus_1", stripeSubscriptionId: "sub_1" });
        // Premium includes 3 seats, so a breach needs a 4th person holding one
        for (const n of [1, 2, 3]) {
            const [mate] = await db
                .insert(schema.users)
                .values({ email: `seatmate${n}-${workspaceId.slice(0, 8)}@test.local` })
                .returning();
            await db.insert(schema.members).values({ workspaceId, userId: mate!.id });
        }
        stripeMock.subscriptions.retrieve.mockResolvedValue(
            fakeSub({
                priceId: PRICE.premiumMonth,
                addOns: [{ priceId: "price_seat_month", quantity: 5 }],
            }),
        );
        const res = await authed(
            userId,
            "/billing/change-plan",
            jsonInit("POST", { plan: "premium", seats: 1 }),
        );
        expect(res.status).toBe(400);
        expect((await res.json()).error).toContain("4 members");
        expect(stripeMock.subscriptions.update).not.toHaveBeenCalled();
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

    it("cancels a superseded subscription when a checkout replaces it", async () => {
        const { workspaceId } = await seedUser({ plan: "pro" });
        await setWs(workspaceId, { stripeSubscriptionId: "sub_old", stripeCustomerId: "cus_1" });
        stripeMock.subscriptions.retrieve.mockResolvedValue(
            fakeSub({ id: "sub_new", priceId: PRICE.premiumMonth }),
        );
        stripeMock.subscriptions.cancel.mockResolvedValue({});
        const res = await postWebhook(
            stripeEvent(
                "checkout.session.completed",
                {
                    mode: "subscription",
                    subscription: "sub_new",
                    client_reference_id: workspaceId,
                    customer: "cus_1",
                },
                "evt_supersede",
            ),
        );
        expect(res.status).toBe(200);
        expect(stripeMock.subscriptions.cancel).toHaveBeenCalledWith("sub_old");
        expect((await getWs(workspaceId)).stripeSubscriptionId).toBe("sub_new");
    });

    it("a checkout that wipes usage writes an upgrade-reset audit row", async () => {
        const { workspaceId } = await seedUser({ plan: "free" });
        await setWs(workspaceId, { aiCreditsUsed: 120 });
        stripeMock.subscriptions.retrieve.mockResolvedValue(
            fakeSub({ id: "sub_up", priceId: PRICE.proMonth }),
        );
        await postWebhook(
            stripeEvent(
                "checkout.session.completed",
                {
                    mode: "subscription",
                    subscription: "sub_up",
                    client_reference_id: workspaceId,
                    customer: "cus_1",
                },
                "evt_upgrade_reset",
            ),
        );
        const rows = await db
            .select()
            .from(schema.credits)
            .where(eq(schema.credits.workspaceId, workspaceId));
        const reset = rows.find((r) => r.reason === "upgrade-reset");
        expect(reset).toBeTruthy();
        expect(reset!.delta).toBe(120);
        expect(reset!.userId).toBeNull();
        expect(reset!.balanceAfter).toBe(limitsFor("pro").includedCredits);
        expect((await getWs(workspaceId)).aiCreditsUsed).toBe(0);
    });

    it("seat reduction counts unexpired invites as held seats", async () => {
        vi.stubEnv("STRIPE_PRICE_SEAT_MONTH", "price_seat_month");
        const { userId, workspaceId } = await seedUser({ plan: "premium" });
        await setWs(workspaceId, { stripeSubscriptionId: "sub_1", seats: 8 });
        for (const n of [1, 2]) {
            const [mate] = await db
                .insert(schema.users)
                .values({ email: `held${n}-${workspaceId.slice(0, 8)}@test.local` })
                .returning();
            await db.insert(schema.members).values({ workspaceId, userId: mate!.id });
        }
        await db.insert(schema.invites).values({
            workspaceId,
            email: "held@test.local",
            tokenHash: "hash-held",
            invitedBy: userId,
            expiresAt: new Date(Date.now() + 86400_000),
        });
        stripeMock.subscriptions.retrieve.mockResolvedValue(
            fakeSub({
                priceId: PRICE.premiumMonth,
                addOns: [{ priceId: "price_seat_month", quantity: 5 }],
            }),
        );
        // 3 members + 1 pending invite = 4 held, one past the 3 Premium includes
        const res = await authed(
            userId,
            "/billing/change-plan",
            jsonInit("POST", { plan: "premium", seats: 1 }),
        );
        expect(res.status).toBe(400);
        expect((await res.json()).error).toContain("4 members");
    });
});

describe("scheduled downgrades", () => {
    // 2 seats beyond the plan's included ones, carried on their own add-on item
    const EXTRA = 2;
    const arm = (
        workspaceId: string,
        sub = fakeSub({
            priceId: PRICE.premiumMonth,
            addOns: [{ priceId: "price_seat_month", quantity: EXTRA }],
        }),
    ) => {
        vi.stubEnv("STRIPE_PRICE_SEAT_MONTH", "price_seat_month");
        stripeMock.subscriptions.retrieve.mockResolvedValue(sub);
        stripeMock.subscriptionSchedules.create.mockResolvedValue({ id: "sched_1" });
        stripeMock.subscriptionSchedules.update.mockResolvedValue({ id: "sched_1" });
        return setWs(workspaceId, {
            plan: "premium",
            seats: seatsFor("premium", EXTRA),
            stripeSubscriptionId: "sub_1",
        });
    };

    it("a tier downgrade parks at period end instead of applying now", async () => {
        const { userId, workspaceId } = await seedUser({ plan: "premium" });
        await arm(workspaceId);
        const res = await authed(
            userId,
            "/billing/change-plan",
            jsonInit("POST", { plan: "pro", seats: 1 }),
        );
        expect(res.status).toBe(200);
        expect((await res.json()).effect).toBe("scheduled");
        expect(stripeMock.subscriptionSchedules.create).toHaveBeenCalledWith({
            from_subscription: "sub_1",
        });
        expect(stripeMock.subscriptions.update).not.toHaveBeenCalled(); // nothing changes today

        const ws = await getWs(workspaceId);
        expect(ws.plan).toBe("premium"); // still what they paid for
        expect(ws.scheduledChange).toMatchObject({ plan: "pro", seats: 1 });
    });

    it("a seat reduction parks the same way", async () => {
        const { userId, workspaceId } = await seedUser({ plan: "premium" });
        await arm(workspaceId);
        const res = await authed(
            userId,
            "/billing/change-plan",
            jsonInit("POST", { plan: "premium", seats: seatsFor("premium", 0) }),
        );
        expect((await res.json()).effect).toBe("scheduled");
        expect((await getWs(workspaceId)).scheduledChange).toMatchObject({
            plan: "premium",
            seats: seatsFor("premium", 0),
        });
    });

    it("resume releases the schedule and clears the parked change", async () => {
        const { userId, workspaceId } = await seedUser({ plan: "premium" });
        await arm(workspaceId);
        await authed(userId, "/billing/change-plan", jsonInit("POST", { plan: "pro", seats: 1 }));
        stripeMock.subscriptions.retrieve.mockResolvedValue({
            ...fakeSub({ priceId: PRICE.premiumMonth, quantity: 2 }),
            schedule: "sched_1",
        });
        const res = await authed(userId, "/billing/resume", jsonInit("POST", {}));
        expect(res.status).toBe(200);
        expect(stripeMock.subscriptionSchedules.release).toHaveBeenCalledWith("sched_1");
        expect((await getWs(workspaceId)).scheduledChange).toBeNull();
    });

    it("the phase landing clears the parked change via subscription.updated", async () => {
        const { userId, workspaceId } = await seedUser({ plan: "premium" });
        await arm(workspaceId);
        await authed(userId, "/billing/change-plan", jsonInit("POST", { plan: "pro", seats: 1 }));

        await postWebhook(
            stripeEvent(
                "customer.subscription.updated",
                fakeSub({ id: "sub_1", priceId: PRICE.proMonth }),
                "evt_phase_landed",
            ),
        );
        const ws = await getWs(workspaceId);
        expect(ws.plan).toBe("pro");
        expect(ws.scheduledChange).toBeNull();
    });

    it("an unrelated subscription.updated keeps the parked change", async () => {
        const { userId, workspaceId } = await seedUser({ plan: "premium" });
        await arm(workspaceId);
        await authed(userId, "/billing/change-plan", jsonInit("POST", { plan: "pro", seats: 1 }));

        await postWebhook(
            stripeEvent(
                "customer.subscription.updated",
                fakeSub({ id: "sub_1", priceId: PRICE.premiumMonth, quantity: 2 }),
                "evt_unrelated_update",
            ),
        );
        expect((await getWs(workspaceId)).scheduledChange).toMatchObject({ plan: "pro" });
    });

    it("upgrades stay immediate", async () => {
        const { userId, workspaceId } = await seedUser({ plan: "pro" });
        await setWs(workspaceId, { plan: "pro", seats: 1, stripeSubscriptionId: "sub_1" });
        stripeMock.subscriptions.retrieve.mockResolvedValue(
            fakeSub({ priceId: PRICE.proMonth, quantity: 1 }),
        );
        const res = await authed(
            userId,
            "/billing/change-plan",
            jsonInit("POST", { plan: "premium" }),
        );
        expect((await res.json()).effect).toBe("upgraded");
        expect(stripeMock.subscriptionSchedules.create).not.toHaveBeenCalled();
    });
});
