import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import type Stripe from "stripe";
import {
    ADD_ONS,
    MAX_CREDIT_PURCHASE,
    MIN_CREDIT_PURCHASE,
    CREDITS_PER_GENERATION,
    PLANS,
    limitsFor,
    rolloverCapFor,
    seatsFor,
    visiblePlans,
} from "@model/billing";
import { authed, jsonInit, request, seedUser } from "@services/__tests__/harness";
import { stripeLineItems } from "@services/__tests__/stripe-fixtures";
import { db } from "@services/db/client";
import { schema } from "@services/db/schema";
import { chargeCredits, settleCredits } from "@services/core/ledger";
import { reserve } from "@services/core/spend";

// Mocked at the package boundary, so the `new Stripe(key)` in services/billing/stripe.ts hands back
// this stub; the pure price↔plan helpers still run for real off the stubbed env.
const stripeMock = vi.hoisted(() => ({
    customers: { create: vi.fn() },
    checkout: { sessions: { create: vi.fn(), listLineItems: vi.fn(), list: vi.fn() } },
    charges: { retrieve: vi.fn() },
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
    credit: "price_credit",
} as const;

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
    quantity?: number;
    status?: Stripe.Subscription.Status;
    periodEnd?: number;
    cancelAtPeriodEnd?: boolean;
    metadata?: Record<string, string>;
    addOns?: { priceId: string; quantity: number }[]; // extra items beside the plan's own
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
    };
}

// Event ids carry no idempotency weight (grants key on the Stripe OBJECT ids); kept for realism.
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
        expect(body.status).toBe("active");
        expect(body.credits.monthlyGrant).toBe(limitsFor("free").includedCredits);
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

    it("refuses annual extra seats when the annual seat price is not configured, rather than dropping them", async () => {
        vi.stubEnv("STRIPE_PRICE_SEAT_YEAR", undefined);
        const { userId } = await seedUser();
        const res = await authed(
            userId,
            "/billing/checkout",
            jsonInit("POST", { plan: "premium", interval: "year", seats: 5 }),
        );
        expect(res.status).toBe(400);
        expect(((await res.json()) as { error: string }).error).toContain("seats");
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
    it("opens a payment checkout for the quantity asked for", async () => {
        vi.stubEnv("STRIPE_PRICE_CREDIT", "price_credit");
        const { userId } = await seedUser({ plan: "pro" });
        stripeMock.customers.create.mockResolvedValue({ id: "cus_topup" });
        stripeMock.checkout.sessions.create.mockResolvedValue({ url: "https://pay/x" });
        const res = await authed(userId, "/billing/topup", jsonInit("POST", { credits: 1500 }));
        expect(res.status).toBe(200);
        const args = stripeMock.checkout.sessions.create.mock.calls.at(-1)![0];
        expect(args.mode).toBe("payment");
        // one price standing for one credit, charged by quantity
        expect(args.line_items).toEqual([{ price: "price_credit", quantity: 1500 }]);
    });

    it("rejects a quantity outside the bounds before reaching Stripe", async () => {
        vi.stubEnv("STRIPE_PRICE_CREDIT", "price_credit");
        const { userId } = await seedUser({ plan: "pro" });
        for (const credits of [MIN_CREDIT_PURCHASE - 1, MAX_CREDIT_PURCHASE + 1, 10.5]) {
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
        // the sub is retrieved only to release a parked schedule; none here, so no release
        expect(stripeMock.subscriptionSchedules.release).not.toHaveBeenCalled();
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

    it("refuses an interval switch that would silently drop paid seats", async () => {
        vi.stubEnv("STRIPE_PRICE_SEAT_MONTH", "price_seat_month");
        vi.stubEnv("STRIPE_PRICE_SEAT_YEAR", undefined);
        const { userId } = await withSubscription("premium", PRICE.premiumMonth, 2);
        const res = await authed(
            userId,
            "/billing/change-plan",
            jsonInit("POST", { interval: "year" }),
        );
        expect(res.status).toBe(400);
        expect(stripeMock.subscriptions.update).not.toHaveBeenCalled();
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
        await setWs(workspaceId, { aiCreditsBalance: 100, creditsResetAt: future() });
        const held = await reserve(await getWs(workspaceId), userId, "generate-theme");
        expect(held.ok).toBe(true);
        expect((await getWs(workspaceId)).aiCreditsBalance).toBe(92); // generate-theme = 8
    });

    it("refuses and charges nothing once the monthly allowance is exhausted", async () => {
        const { userId, workspaceId } = await seedUser();
        await setWs(workspaceId, { aiCreditsBalance: 0, creditsResetAt: future() });
        const held = await reserve(await getWs(workspaceId), userId, "generate-theme");
        expect(held.ok).toBe(false);
        expect(held.ok === false && held.remaining).toBe(0);
        expect((await getWs(workspaceId)).aiCreditsBalance).toBe(0);
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
        stripeMock.subscriptions.retrieve.mockResolvedValue(
            fakeSub({ id: "sub_1", priceId: PRICE.proMonth, quantity: 2, status: "active" }),
        );
        const ev = stripeEvent("checkout.session.completed", {
            id: "cs_1",
            client_reference_id: workspaceId,
            subscription: "sub_1",
            customer: "cus_1",
        });
        const res = await postWebhook(ev);
        expect(res.status).toBe(200);
        expect((await res.json()).received).toBe(true);
        expect(await getWs(workspaceId)).toMatchObject({
            plan: "pro",
            planStatus: "active",
            stripeCustomerId: "cus_1",
            stripeSubscriptionId: "sub_1",
            seats: 1, // Pro includes one; the plan item's quantity is not a seat count
            aiCreditsBalance: 99 + PLANS.pro.ai.includedCredits,
            cancelAtPeriodEnd: false,
        });

        // Redelivery: the upgrade grant keys on the checkout session, so nothing re-applies.
        await postWebhook(ev);
        expect((await getWs(workspaceId)).aiCreditsBalance).toBe(99 + PLANS.pro.ai.includedCredits);
        const grants = await db
            .select()
            .from(schema.credits)
            .where(eq(schema.credits.workspaceId, workspaceId));
        expect(grants).toHaveLength(1);
        expect(grants[0]).toMatchObject({ reason: "upgrade-grant", key: "cs_1" });
    });

    it("is idempotent: a redelivered subscription event re-syncs from live state, harmlessly", async () => {
        const { workspaceId } = await seedUser({ plan: "pro" });
        await setWs(workspaceId, { stripeSubscriptionId: "sub_1", seats: 1 });
        const sub = fakeSub({ id: "sub_1", priceId: PRICE.premiumMonth, quantity: 3 });
        const first = await postSubEvent("customer.subscription.updated", sub, "evt_dup");
        expect((await first.json()).received).toBe(true);
        expect(await getWs(workspaceId)).toMatchObject({ plan: "premium", seats: 3 });

        // Simulate drift, then redeliver the exact same event — the handler syncs from the live
        // subscription, so the duplicate converges on Stripe truth instead of re-applying a payload.
        await setWs(workspaceId, { plan: "pro", seats: 1 });
        const second = await postSubEvent("customer.subscription.updated", sub, "evt_dup");
        expect((await second.json()).received).toBe(true);
        expect(await getWs(workspaceId)).toMatchObject({ plan: "premium", seats: 3 });
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

    it("customer.subscription.updated syncs plan, seats and status for the matching workspace", async () => {
        const { workspaceId } = await seedUser({ plan: "pro" });
        await setWs(workspaceId, { stripeSubscriptionId: "sub_1", seats: 1 });
        await postSubEvent(
            "customer.subscription.updated",
            fakeSub({
                id: "sub_1",
                priceId: PRICE.premiumMonth,
                quantity: 3,
                status: "active",
            }),
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
        await postSubEvent(
            "customer.subscription.updated",
            fakeSub({ id: "sub_other", quantity: 9 }),
        );
        expect(await getWs(workspaceId)).toMatchObject({ plan: "pro", seats: 1 });
    });

    it("customer.subscription.deleted reverts the workspace to free", async () => {
        const { workspaceId } = await seedUser({ plan: "premium" });
        await setWs(workspaceId, { stripeSubscriptionId: "sub_1", seats: 3 });
        await postSubEvent(
            "customer.subscription.deleted",
            fakeSub({ id: "sub_1", status: "canceled" }),
        );
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
        expect((await res.json()).credits.monthlyGrant).toBe(
            PLANS.premium.ai.includedCredits + 2 * ADD_ONS.seat.credits,
        );
    });

    // seats a plan does not sell must not grant credits, or a lapsed subscription keeps its pool
    it("ignores seats on a plan that does not sell them", async () => {
        const { userId, workspaceId } = await seedUser({ plan: "pro" });
        await setWs(workspaceId, { seats: 9, creditsResetAt: future() });
        const res = await authed(userId, "/billing");
        expect((await res.json()).credits.monthlyGrant).toBe(limitsFor("pro").includedCredits);
    });

    // a purchased pack lands in the same balance, so spend can exceed a month's grant
    it("spends a balance banked above the monthly grant", async () => {
        const { userId, workspaceId } = await seedUser({ plan: "pro" });
        const banked = limitsFor("pro").includedCredits * 3;
        await setWs(workspaceId, { aiCreditsBalance: banked, creditsResetAt: future() });
        const held = await reserve(await getWs(workspaceId), userId, "generate-theme");
        expect(held.ok).toBe(true);
        expect((await getWs(workspaceId)).aiCreditsBalance).toBe(banked - 8);
    });

    it("exactly one of two concurrent near-limit spends wins", async () => {
        const { userId, workspaceId } = await seedUser();
        // exactly one generate-theme's worth, so the two racers contend for a single charge
        await setWs(workspaceId, { aiCreditsBalance: 8, creditsResetAt: future() });
        const ws = await getWs(workspaceId);
        const [a, b] = await Promise.all([
            reserve(ws, userId, "generate-theme"),
            reserve(ws, userId, "generate-theme"),
        ]);
        expect([a.ok, b.ok].sort()).toEqual([false, true]);
        expect((await getWs(workspaceId)).aiCreditsBalance).toBe(0);
    });

    it("writes a ledger row per charge with the remaining balance", async () => {
        const { userId, workspaceId } = await seedUser();
        await setWs(workspaceId, { aiCreditsBalance: 100, creditsResetAt: future() });
        await reserve(await getWs(workspaceId), userId, "generate-theme");
        const rows = await db
            .select()
            .from(schema.credits)
            .where(eq(schema.credits.workspaceId, workspaceId));
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
        const rows = await db
            .select()
            .from(schema.credits)
            .where(eq(schema.credits.workspaceId, workspaceId));
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
        const rows = await db
            .select()
            .from(schema.credits)
            .where(eq(schema.credits.workspaceId, workspaceId));
        expect(rows).toHaveLength(0);
    });
});

describe("webhook hardening", () => {
    it("a cycle-renewal invoice re-anchors the window and grants on top of the balance", async () => {
        const { workspaceId } = await seedUser({ plan: "pro" });
        // 300 banked keeps the grant under the rollover cap, so this pins the carry, not the clip
        await setWs(workspaceId, { stripeCustomerId: "cus_1", aiCreditsBalance: 300 });
        const ev = stripeEvent("invoice.paid", {
            id: "in_1",
            customer: "cus_1",
            billing_reason: "subscription_cycle",
        });
        await postWebhook(ev);
        const ws = await getWs(workspaceId);
        expect(ws.aiCreditsBalance).toBe(300 + PLANS.pro.ai.includedCredits); // leftovers carry
        expect(ws.planStatus).toBe("active");

        // Redelivery of the same invoice grants nothing: the grant keys on the invoice id.
        await postWebhook(ev);
        expect((await getWs(workspaceId)).aiCreditsBalance).toBe(
            300 + PLANS.pro.ai.includedCredits,
        );
        const rows = await db
            .select()
            .from(schema.credits)
            .where(eq(schema.credits.workspaceId, workspaceId));
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({
            delta: PLANS.pro.ai.includedCredits,
            reason: "renewal-grant",
            key: "in_1",
        });
    });

    it("a credit purchase grants the line item's quantity, once, keyed on the session", async () => {
        const { workspaceId } = await seedUser({ plan: "pro" });
        await setWs(workspaceId, { aiCreditsBalance: 10 });
        const bought = 1500;
        // the grant comes off what Stripe charged for, not off anything we wrote in metadata
        const ev = creditPurchase(workspaceId, bought, { id: "cs_credits_1" });
        await postWebhook(ev);
        await postWebhook(ev);
        const after = await getWs(workspaceId);
        expect(after.aiCreditsBalance).toBe(10 + bought);
        // bought, not granted: exempt from the rollover clip, and not doubled by the redelivery
        expect(after.purchasedCredits).toBe(bought);
        const rows = await db
            .select()
            .from(schema.credits)
            .where(eq(schema.credits.workspaceId, workspaceId));
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({
            delta: bought,
            reason: "topup",
            key: "cs_credits_1",
        });
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

    it("refuses a quantity outside the bounds we sell", async () => {
        const { workspaceId } = await seedUser({ plan: "pro" });
        await setWs(workspaceId, { aiCreditsBalance: 10 });
        // a session made outside our API, where the route's bounds never ran
        await postWebhook(creditPurchase(workspaceId, 5_000_000, { id: "cs_huge" }));
        expect((await getWs(workspaceId)).aiCreditsBalance).toBe(10);
    });

    // A refund is money leaving; the credits it bought have to leave with it, or a buy-spend-refund
    // loop is free AI. Both events resolve the purchase through the session the charge paid for.
    async function buyThen(workspaceId: string, credits: number, sessionId: string): Promise<void> {
        await postWebhook(creditPurchase(workspaceId, credits, { id: sessionId }));
        stripeMock.checkout.sessions.list.mockResolvedValue({ data: [{ id: sessionId }] });
    }

    it("takes the credits back when a purchase is refunded, once", async () => {
        const { workspaceId } = await seedUser({ plan: "pro" });
        await setWs(workspaceId, { aiCreditsBalance: 0, purchasedCredits: 0 });
        await buyThen(workspaceId, 2000, "cs_refund_1");
        expect((await getWs(workspaceId)).aiCreditsBalance).toBe(2000);

        const ev = stripeEvent("charge.refunded", { id: "ch_1", payment_intent: "pi_1" });
        await postWebhook(ev);
        await postWebhook(ev); // redelivery must not take twice
        const after = await getWs(workspaceId);
        expect(after.aiCreditsBalance).toBe(0);
        // the rollover shield must stop protecting a purchase that was handed back
        expect(after.purchasedCredits).toBe(0);
        const rows = await db
            .select()
            .from(schema.credits)
            .where(eq(schema.credits.workspaceId, workspaceId));
        expect(rows.filter((r) => r.reason === "refund")).toHaveLength(1);
        expect(rows.find((r) => r.reason === "refund")).toMatchObject({ delta: -2000 });
    });

    it("floors at zero when the refunded credits are already spent", async () => {
        const { workspaceId } = await seedUser({ plan: "pro" });
        await setWs(workspaceId, { aiCreditsBalance: 0, purchasedCredits: 0 });
        await buyThen(workspaceId, 2000, "cs_refund_2");
        // spent most of them before asking for the money back
        await setWs(workspaceId, { aiCreditsBalance: 300 });

        await postWebhook(stripeEvent("charge.refunded", { id: "ch_2", payment_intent: "pi_1" }));
        const after = await getWs(workspaceId);
        expect(after.aiCreditsBalance).toBe(0);
        expect(after.purchasedCredits).toBe(0);
    });

    it("takes the credits back on a chargeback too", async () => {
        const { workspaceId } = await seedUser({ plan: "pro" });
        await setWs(workspaceId, { aiCreditsBalance: 0, purchasedCredits: 0 });
        await buyThen(workspaceId, 500, "cs_dispute_1");
        stripeMock.charges.retrieve.mockResolvedValue({ id: "ch_3", payment_intent: "pi_1" });

        await postWebhook(
            stripeEvent("charge.dispute.created", { id: "dp_1", charge: "ch_3", amount: 1000 }),
        );
        expect((await getWs(workspaceId)).aiCreditsBalance).toBe(0);
    });

    it("a cycle renewal clips its grant at the rollover cap", async () => {
        const { workspaceId } = await seedUser({ plan: "pro" });
        const cap = rolloverCapFor({ plan: "pro", seats: 1 });
        await setWs(workspaceId, { stripeCustomerId: "cus_1", aiCreditsBalance: cap - 100 });
        await postWebhook(
            stripeEvent("invoice.paid", {
                id: "in_clip",
                customer: "cus_1",
                billing_reason: "subscription_cycle",
            }),
        );
        expect((await getWs(workspaceId)).aiCreditsBalance).toBe(cap);
        const rows = await db
            .select()
            .from(schema.credits)
            .where(eq(schema.credits.workspaceId, workspaceId));
        expect(rows[0]).toMatchObject({ reason: "renewal-grant", delta: 100 });
    });

    it("an upgrade grant clips against what the new plan may bank", async () => {
        const { workspaceId } = await seedUser();
        // banked far above pro's cap (packless), so subscribing grants nothing extra
        await setWs(workspaceId, { aiCreditsBalance: 5000 });
        stripeMock.subscriptions.retrieve.mockResolvedValue(
            fakeSub({ id: "sub_clip", priceId: PRICE.proMonth, quantity: 1, status: "active" }),
        );
        await postWebhook(
            stripeEvent("checkout.session.completed", {
                id: "cs_clip",
                client_reference_id: workspaceId,
                subscription: "sub_clip",
                customer: "cus_clip",
            }),
        );
        const ws = await getWs(workspaceId);
        expect(ws.plan).toBe("pro"); // the sync still lands even when the grant is clipped away
        expect(ws.aiCreditsBalance).toBe(5000);
        const rows = await db
            .select()
            .from(schema.credits)
            .where(eq(schema.credits.workspaceId, workspaceId));
        expect(rows[0]).toMatchObject({ reason: "upgrade-grant", delta: 0, key: "cs_clip" });
    });

    it("a non-cycle invoice (proration/one-off) leaves the credit window alone", async () => {
        const { workspaceId } = await seedUser({ plan: "pro" });
        await setWs(workspaceId, { stripeCustomerId: "cus_1", aiCreditsBalance: 42 });
        await postWebhook(
            stripeEvent("invoice.paid", {
                customer: "cus_1",
                billing_reason: "subscription_update",
            }),
        );
        expect((await getWs(workspaceId)).aiCreditsBalance).toBe(42);
    });

    it("subscription.updated adopts an unlinked workspace via the metadata backref", async () => {
        const { workspaceId } = await seedUser({ plan: "free" });
        await postSubEvent(
            "customer.subscription.updated",
            fakeSub({
                id: "sub_new",
                priceId: PRICE.proMonth,
                metadata: { workspaceId },
            }),
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

    it("a handler failure rolls the transaction back and the redelivery applies", async () => {
        const { workspaceId } = await seedUser({ plan: "pro" });
        await setWs(workspaceId, { stripeSubscriptionId: "sub_1", seats: 1 });
        // malformed live sub → handleEvent throws inside the transaction
        const broken = {
            ...fakeSub({ id: "sub_1", priceId: PRICE.premiumMonth, quantity: 3 }),
            items: undefined,
        };
        const first = await postSubEvent("customer.subscription.updated", broken, "evt_retry");
        expect(first.status).toBe(500);
        expect(await getWs(workspaceId)).toMatchObject({ plan: "pro", seats: 1 });

        const second = await postSubEvent(
            "customer.subscription.updated",
            fakeSub({ id: "sub_1", priceId: PRICE.premiumMonth, quantity: 3 }),
            "evt_retry",
        );
        expect((await second.json()).received).toBe(true);
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

// One granter per interval: the cycle invoice for monthly subs (the flat 30-day window lapses
// early in long months, so rolling on read as well would double the grant), the lazy roll for
// annual subs (their invoice comes once a year).
describe("interval-aware granting", () => {
    it("a live monthly subscription is granted by its invoice, not the lazy roll, inside the webhook grace", async () => {
        const { userId, workspaceId } = await seedUser({ plan: "pro" });
        const lapsed = new Date(Date.now() - 24 * 3600 * 1000);
        await setWs(workspaceId, {
            stripeCustomerId: "cus_1",
            stripeSubscriptionId: "sub_1",
            planInterval: "month",
            aiCreditsBalance: 50,
            creditsStartedAt: new Date(lapsed.getTime() - 30 * 24 * 3600 * 1000),
            creditsResetAt: lapsed,
        });
        // resolving the workspace is what used to roll a lapsed window
        await authed(userId, "/billing");
        expect((await getWs(workspaceId)).aiCreditsBalance).toBe(50);

        await postWebhook(
            stripeEvent("invoice.paid", {
                id: "in_cycle_1",
                customer: "cus_1",
                billing_reason: "subscription_cycle",
            }),
        );
        const ws = await getWs(workspaceId);
        expect(ws.aiCreditsBalance).toBe(50 + PLANS.pro.ai.includedCredits);
        expect(ws.creditsResetAt.getTime()).toBeGreaterThan(Date.now());
        const rows = await db
            .select()
            .from(schema.credits)
            .where(eq(schema.credits.workspaceId, workspaceId));
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({ reason: "renewal-grant" });
    });

    it("self-heals a missed cycle invoice once the webhook grace has passed", async () => {
        const { userId, workspaceId } = await seedUser({ plan: "pro" });
        // past Stripe's ~3-day retry horizon: the invoice is not coming, the roll takes over
        const lapsed = new Date(Date.now() - 4 * 24 * 3600 * 1000);
        await setWs(workspaceId, {
            stripeCustomerId: "cus_1",
            stripeSubscriptionId: "sub_1",
            planInterval: "month",
            aiCreditsBalance: 50,
            creditsStartedAt: new Date(lapsed.getTime() - 30 * 24 * 3600 * 1000),
            creditsResetAt: lapsed,
        });
        await authed(userId, "/billing");
        const ws = await getWs(workspaceId);
        expect(ws.aiCreditsBalance).toBe(50 + PLANS.pro.ai.includedCredits);
        expect(ws.creditsResetAt.getTime()).toBeGreaterThan(Date.now());
    });

    // The failing card case: the roll self-heals, then Stripe's retry finally succeeds. The roll
    // writes no credits.key for the late invoice to collide with, so the window is the claim.
    it("does not grant twice when a late invoice lands after the self-heal roll", async () => {
        const { userId, workspaceId } = await seedUser({ plan: "pro" });
        const lapsed = new Date(Date.now() - 4 * 24 * 3600 * 1000);
        await setWs(workspaceId, {
            stripeCustomerId: "cus_1",
            stripeSubscriptionId: "sub_1",
            planInterval: "month",
            planStatus: "past_due",
            aiCreditsBalance: 50,
            creditsStartedAt: new Date(lapsed.getTime() - 30 * 24 * 3600 * 1000),
            creditsResetAt: lapsed,
        });
        await authed(userId, "/billing");
        const rolled = await getWs(workspaceId);
        expect(rolled.aiCreditsBalance).toBe(50 + PLANS.pro.ai.includedCredits);

        // the retry succeeds days later, for the period the roll already covered
        await postWebhook(
            stripeEvent("invoice.paid", {
                id: "in_late_1",
                customer: "cus_1",
                billing_reason: "subscription_cycle",
                lines: { data: [{ period: { start: Math.floor(lapsed.getTime() / 1000) } }] },
            }),
        );
        const ws = await getWs(workspaceId);
        expect(ws.aiCreditsBalance).toBe(rolled.aiCreditsBalance);
        // the payment still landed, so dunning clears even though the grant was skipped
        expect(ws.planStatus).toBe("active");
        const grants = await db
            .select()
            .from(schema.credits)
            .where(eq(schema.credits.workspaceId, workspaceId));
        expect(grants.filter((r) => r.delta > 0)).toHaveLength(1);
    });

    it("still grants a genuinely new period after a self-heal roll", async () => {
        const { userId, workspaceId } = await seedUser({ plan: "pro" });
        const lapsed = new Date(Date.now() - 4 * 24 * 3600 * 1000);
        await setWs(workspaceId, {
            stripeCustomerId: "cus_1",
            stripeSubscriptionId: "sub_1",
            planInterval: "month",
            aiCreditsBalance: 0,
            creditsStartedAt: new Date(lapsed.getTime() - 30 * 24 * 3600 * 1000),
            creditsResetAt: lapsed,
        });
        await authed(userId, "/billing");
        const rolled = await getWs(workspaceId);

        // the NEXT cycle, whose period opens after the roll did
        await postWebhook(
            stripeEvent("invoice.paid", {
                id: "in_next_1",
                customer: "cus_1",
                billing_reason: "subscription_cycle",
                lines: { data: [{ period: { start: Math.floor(Date.now() / 1000) + 60 } }] },
            }),
        );
        expect((await getWs(workspaceId)).aiCreditsBalance).toBeGreaterThan(
            rolled.aiCreditsBalance,
        );
    });

    it("a live annual subscription rolls lazily and its yearly invoice only clears dunning", async () => {
        const { userId, workspaceId } = await seedUser({ plan: "pro" });
        await setWs(workspaceId, {
            stripeCustomerId: "cus_1",
            stripeSubscriptionId: "sub_1",
            planInterval: "year",
            planStatus: "past_due",
            aiCreditsBalance: 10,
            creditsResetAt: new Date(Date.now() - 1000),
        });
        await authed(userId, "/billing");
        const rolled = await getWs(workspaceId);
        expect(rolled.aiCreditsBalance).toBe(10 + PLANS.pro.ai.includedCredits);

        await postWebhook(
            stripeEvent("invoice.paid", {
                id: "in_year_1",
                customer: "cus_1",
                billing_reason: "subscription_cycle",
            }),
        );
        const ws = await getWs(workspaceId);
        expect(ws.aiCreditsBalance).toBe(rolled.aiCreditsBalance); // no second grant
        expect(ws.planStatus).toBe("active");
        // and the roll's window is left anchored where it was
        expect(ws.creditsResetAt.getTime()).toBe(rolled.creditsResetAt.getTime());
    });

    it("a free workspace still rolls lazily", async () => {
        const { userId, workspaceId } = await seedUser();
        await setWs(workspaceId, {
            aiCreditsBalance: 5,
            creditsResetAt: new Date(Date.now() - 1000),
        });
        await authed(userId, "/billing");
        expect((await getWs(workspaceId)).aiCreditsBalance).toBe(5 + PLANS.free.ai.includedCredits);
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
        await setWs(workspaceId, {
            aiCreditsBalance: 100,
            creditsResetAt: new Date(Date.now() + 86400_000),
        });
        await reserve(await getWs(workspaceId), userId, "generate-theme");
        await reserve(await getWs(workspaceId), userId, "rewrite-text");
        const res = await authed(userId, "/billing/ledger");
        expect(res.status).toBe(200);
        const { entries } = await res.json();
        expect(entries).toHaveLength(2);
        expect(entries[0]).toMatchObject({ delta: -3 }); // rewrite-text, newest first
        expect(entries[1]).toMatchObject({ delta: -8 }); // generate-theme
    });

    it("degrades a parseable but garbage cursor to the first page", async () => {
        const { userId, workspaceId } = await seedUser();
        await setWs(workspaceId, {
            aiCreditsBalance: 100,
            creditsResetAt: new Date(Date.now() + 86400_000),
        });
        await reserve(await getWs(workspaceId), userId, "rewrite-text");
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

describe("recurring add-ons", () => {
    const stubAddOns = (): void => {
        vi.stubEnv("STRIPE_PRICE_SEAT_MONTH", "price_seat_month");
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
        expect(await ids(premium)).toEqual(["seat"]);
        expect(await ids(pro)).toEqual([]); // Pro is solo, so no seat add-on
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
            jsonInit("POST", { plan: "premium", seats: incl + 2 }),
        );
        expect(stripeMock.checkout.sessions.create).toHaveBeenCalledWith(
            expect.objectContaining({
                mode: "subscription",
                line_items: [
                    { price: PRICE.premiumMonth, quantity: 1 },
                    { price: "price_seat_month", quantity: 2 },
                ],
            }),
        );
    });

    it("omits an add-on line the plan does not sell", async () => {
        stubAddOns();
        const { userId, workspaceId } = await seedUser({ plan: "free" });
        await setWs(workspaceId, { stripeCustomerId: "cus_1" });
        await authed(userId, "/billing/checkout", jsonInit("POST", { plan: "pro", seats: 5 }));
        expect(stripeMock.checkout.sessions.create).toHaveBeenCalledWith(
            expect.objectContaining({
                line_items: [{ price: PRICE.proMonth, quantity: 1 }],
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
                addOns: [{ priceId: "price_seat_month", quantity: 4 }],
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

    it("a checkout grants on top of the balance and writes an audit row", async () => {
        const { workspaceId } = await seedUser({ plan: "free" });
        await setWs(workspaceId, { aiCreditsBalance: 120 });
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
        const grant = rows.find((r) => r.reason === "upgrade-grant");
        expect(grant).toBeTruthy();
        expect(grant!.delta).toBe(limitsFor("pro").includedCredits);
        expect(grant!.userId).toBeNull();
        // the 120 they already had is kept: subscribing adds, it does not reset
        expect(grant!.balanceAfter).toBe(120 + limitsFor("pro").includedCredits);
        expect((await getWs(workspaceId)).aiCreditsBalance).toBe(
            120 + limitsFor("pro").includedCredits,
        );
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

        await postSubEvent(
            "customer.subscription.updated",
            fakeSub({ id: "sub_1", priceId: PRICE.proMonth }),
            "evt_phase_landed",
        );
        const ws = await getWs(workspaceId);
        expect(ws.plan).toBe("pro");
        expect(ws.scheduledChange).toBeNull();
    });

    it("an unrelated subscription.updated keeps the parked change", async () => {
        const { userId, workspaceId } = await seedUser({ plan: "premium" });
        await arm(workspaceId);
        await authed(userId, "/billing/change-plan", jsonInit("POST", { plan: "pro", seats: 1 }));

        await postSubEvent(
            "customer.subscription.updated",
            fakeSub({ id: "sub_1", priceId: PRICE.premiumMonth, quantity: 2 }),
            "evt_unrelated_update",
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

    it("an immediate change after a parked downgrade releases the schedule", async () => {
        const { userId, workspaceId } = await seedUser({ plan: "premium" });
        await arm(workspaceId);
        await authed(userId, "/billing/change-plan", jsonInit("POST", { plan: "pro", seats: 1 }));
        // the schedule now manages the sub; without a release its second phase fires at period end
        stripeMock.subscriptions.retrieve.mockResolvedValue({
            ...fakeSub({
                priceId: PRICE.premiumMonth,
                addOns: [{ priceId: "price_seat_month", quantity: EXTRA }],
            }),
            schedule: "sched_1",
        });
        const res = await authed(
            userId,
            "/billing/change-plan",
            jsonInit("POST", { plan: "premium", seats: seatsFor("premium", EXTRA + 1) }),
        );
        expect((await res.json()).effect).toBe("upgraded");
        expect(stripeMock.subscriptionSchedules.release).toHaveBeenCalledWith("sched_1");
        expect((await getWs(workspaceId)).scheduledChange).toBeNull();
    });

    it("cancelling to free while a downgrade is parked releases the schedule too", async () => {
        const { userId, workspaceId } = await seedUser({ plan: "premium" });
        await arm(workspaceId);
        await authed(userId, "/billing/change-plan", jsonInit("POST", { plan: "pro", seats: 1 }));
        stripeMock.subscriptions.retrieve.mockResolvedValue({
            ...fakeSub({ priceId: PRICE.premiumMonth }),
            schedule: "sched_1",
        });
        const res = await authed(
            userId,
            "/billing/change-plan",
            jsonInit("POST", { plan: "free" }),
        );
        expect((await res.json()).effect).toBe("cancel_at_period_end");
        expect(stripeMock.subscriptionSchedules.release).toHaveBeenCalledWith("sched_1");
        const ws = await getWs(workspaceId);
        expect(ws.cancelAtPeriodEnd).toBe(true);
        expect(ws.scheduledChange).toBeNull();
    });

    it("a bare tier downgrade from a seated team still hits the member floor", async () => {
        const { userId, workspaceId } = await seedUser({ plan: "premium" });
        await arm(workspaceId);
        const [other] = await db
            .insert(schema.users)
            .values({ email: `floor-${workspaceId.slice(0, 8)}@test.local` })
            .returning();
        await db.insert(schema.members).values({ workspaceId, userId: other!.id });
        const res = await authed(userId, "/billing/change-plan", jsonInit("POST", { plan: "pro" }));
        expect(res.status).toBe(400);
        expect(((await res.json()) as { error: string }).error).toContain("2 members");
        expect(stripeMock.subscriptionSchedules.update).not.toHaveBeenCalled();
    });

    it("a bare solo premium→pro downgrade parks the target plan's own seat count and clears on landing", async () => {
        const { userId, workspaceId } = await seedUser({ plan: "premium" });
        await arm(workspaceId, fakeSub({ priceId: PRICE.premiumMonth }));
        await setWs(workspaceId, { seats: seatsFor("premium", 0) });
        const res = await authed(userId, "/billing/change-plan", jsonInit("POST", { plan: "pro" }));
        expect((await res.json()).effect).toBe("scheduled");
        expect((await getWs(workspaceId)).scheduledChange).toMatchObject({ plan: "pro", seats: 1 });

        await postSubEvent(
            "customer.subscription.updated",
            fakeSub({ id: "sub_1", priceId: PRICE.proMonth }),
            "evt_bare_landed",
        );
        expect((await getWs(workspaceId)).scheduledChange).toBeNull();
    });
});
