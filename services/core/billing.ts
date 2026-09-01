import Stripe from "stripe";
import type { WorkspaceRole } from "@model/workspace";
import { and, desc, eq, gt, isNotNull, isNull, sql } from "drizzle-orm";
import type { AddOnId, Interval, PlanId, ScheduledChange } from "@model/billing";
import {
    addOnsFor,
    clipGrant,
    CREDIT_PRESETS,
    CREDIT_PRICE_USD,
    CREDITS_PER_GENERATION,
    extraSeatsOf,
    featuresFor,
    isCreditQuantity,
    limitsFor,
    monthlyGrantFor,
    planFor,
    rolloverCapFor,
    seatsFor,
    visiblePlans,
} from "@model/billing";
import { db } from "@services/db/client";
import { warn } from "@services/utils/env";
import { capture, identifyWorkspace } from "@services/utils/analytics";
import { schema } from "@services/db/schema";
import { appUrl } from "@services/utils/env";
import type { WorkspaceRow } from "./accounts";
import { grantOnce, spendThisCycle } from "./ledger";
import type { Tx } from "./ledger";

// Plans, subscriptions, recurring add-ons, and the Stripe webhook that keeps the workspace row in step
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

// No cross-interval fallback: quietly booking monthly against an advertised annual price is a
// bait-and-switch, so an unconfigured interval refuses instead (the UI hides it via `intervals`).
export function priceIdFor(plan: PlanId, interval: Interval = "month"): string | undefined {
    const key = priceEnvKey(plan, interval);
    return (key ? process.env[key] : undefined) || undefined;
}

function addOnEnvKey(_id: AddOnId, interval: Interval): string {
    return interval === "year" ? "STRIPE_PRICE_SEAT_YEAR" : "STRIPE_PRICE_SEAT_MONTH";
}

// One one-off price standing for ONE credit, bought by quantity, so any amount is purchasable
// without a price per size. Not recurring: a bought credit lands in the balance and carries over.
export function creditPriceId(): string | undefined {
    return process.env.STRIPE_PRICE_CREDIT || undefined;
}

// No monthly fallback for the annual key, unlike the plan prices: Stripe rejects a subscription
// whose items disagree on interval, so an unconfigured annual add-on drops its line instead.
export function addOnPriceId(id: AddOnId, interval: Interval = "month"): string | undefined {
    return process.env[addOnEnvKey(id, interval)] || undefined;
}

function addOnMap(): Array<{ id: string; addOn: AddOnId }> {
    const rows: Array<[AddOnId, Interval]> = [
        ["seat", "month"],
        ["seat", "year"],
    ];
    return rows
        .map(([addOn, interval]) => ({ id: process.env[addOnEnvKey(addOn, interval)], addOn }))
        .filter((r): r is { id: string; addOn: AddOnId } => !!r.id);
}

export function addOnForPrice(priceId: string | undefined | null): AddOnId | null {
    if (!priceId) return null;
    return addOnMap().find((a) => a.id === priceId)?.addOn ?? null;
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

/**
 * A subscription is one plan item plus an optional seat item, so seats are read off the seat item's
 * quantity rather than the plan item's. Anything unrecognised is ignored, which keeps a
 * manually-added Stripe line from being mistaken for an add-on.
 */
export interface SubShape {
    plan: PlanId;
    interval: Interval;
    extraSeats: number;
    planItemId: string | null;
    seatItemId: string | null;
    planPriceId: string | null;
}

export function readSub(sub: Stripe.Subscription): SubShape {
    const out: SubShape = {
        plan: "free",
        interval: "month",
        extraSeats: 0,
        planItemId: null,
        seatItemId: null,
        planPriceId: null,
    };
    for (const item of sub.items.data) {
        const plan = planForPrice(item.price.id);
        if (plan) {
            out.plan = plan;
            out.interval = intervalForPrice(item.price.id) ?? "month";
            out.planItemId = item.id;
            out.planPriceId = item.price.id;
            continue;
        }
        if (addOnForPrice(item.price.id) === "seat") {
            out.extraSeats = item.quantity ?? 0;
            out.seatItemId = item.id;
        }
    }
    return out;
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

export async function billingSummary(ws: WorkspaceRow, userId: string, role?: WorkspaceRole) {
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
        interval: ws.planInterval ?? null,
        // which billing intervals this deployment can actually sell, so the client never offers one
        intervals: {
            month: !!(priceIdFor("pro", "month") && priceIdFor("premium", "month")),
            year: !!(priceIdFor("pro", "year") && priceIdFor("premium", "year")),
        },
        credits: {
            balance: ws.aiCreditsBalance,
            monthlyGrant: monthlyGrantFor(ws),
            perGeneration: CREDITS_PER_GENERATION,
            resetAt: ws.creditsResetAt,
            mySpend,
            // the per-member ceiling as it applies to THIS caller; admins and owners are uncapped
            myCap: role === "member" ? (ws.memberCreditCap ?? null) : null,
            rolloverCap: rolloverCapFor(ws),
            // whether the next grant will land short; derived at read time, stored nowhere
            capped:
                clipGrant(
                    monthlyGrantFor(ws),
                    ws.aiCreditsBalance,
                    ws.purchasedCredits,
                    rolloverCapFor(ws),
                ) < monthlyGrantFor(ws),
        },
        // only what is actually purchasable: the plan must allow it and the price must be configured
        addOns: addOnsFor(ws.plan).filter((a) => !!addOnPriceId(a.id)),
        addOnQuantities: { seat: extraSeatsOf(ws) },
        // what a credit costs to buy and the quantities offered as buttons; empty when the plan
        // cannot buy them or the price is not configured
        creditSale:
            planFor(ws.plan).billing.sellsCredits && creditPriceId()
                ? { usdPerCredit: CREDIT_PRICE_USD, presets: CREDIT_PRESETS }
                : null,
        usage: {
            artifacts: Number(artifactCount?.n ?? 0),
            maxArtifacts: limits.maxArtifacts,
            storageMb: Math.round(Number(storage?.total ?? 0) / (1024 * 1024)),
            maxStorageMb: capMb,
        },
        seats: ws.seats,
        includedSeats: planFor(ws.plan).billing.includedSeats,
        scheduledChange: ws.scheduledChange ?? null,
        catalog: visiblePlans(),
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

/** What a caller asked for; `seats` is the total, including the plan's own included seats. */
export interface Wanted {
    plan?: PlanId;
    interval?: Interval;
    seats?: number;
}

const wantedExtraSeats = (plan: PlanId, want: Wanted): number =>
    Math.max(
        0,
        (want.seats ?? planFor(plan).billing.includedSeats) - planFor(plan).billing.includedSeats,
    );

/** Add-on line items, omitting any at quantity zero so a subscription carries no empty lines. */
function addOnLines(
    plan: PlanId,
    interval: Interval,
    want: Wanted,
): Array<{ price: string; quantity: number }> {
    const sold = new Set(addOnsFor(plan).map((a) => a.id));
    const seats = wantedExtraSeats(plan, want);
    const seatPrice = addOnPriceId("seat", interval);
    return sold.has("seat") && seats > 0 && seatPrice
        ? [{ price: seatPrice, quantity: seats }]
        : [];
}

export async function checkoutUrl(
    ws: WorkspaceRow,
    email: string,
    want: Wanted,
): Promise<string | null | { error: "invalid-plan" | "seats-not-configured" }> {
    if (!want.plan || want.plan === "free") return { error: "invalid-plan" };
    const interval = want.interval ?? "month";
    const price = priceIdFor(want.plan, interval);
    if (!price) return { error: "invalid-plan" };
    // refuse rather than silently bill fewer seats than were asked for (addOnLines drops the line)
    if (
        planFor(want.plan).billing.sellsSeats &&
        wantedExtraSeats(want.plan, want) > 0 &&
        !addOnPriceId("seat", interval)
    )
        return { error: "seats-not-configured" };
    const p = planFor(want.plan);
    capture(payer(ws), "checkout_started", {
        target_plan: want.plan,
        interval,
        seats: want.seats ?? 1,
        addons: want.seats && want.seats > 1 ? ["seat"] : [],
    });
    const customerId = await ensureCustomer(ws, email);
    const session = await stripe().checkout.sessions.create({
        mode: "subscription",
        customer: customerId,
        line_items: [{ price, quantity: 1 }, ...addOnLines(want.plan, interval, want)],
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
    if (credits === undefined || !isCreditQuantity(credits)) return { error: "invalid-quantity" };
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

/**
 * Item updates for the add-ons: change the quantity where the item exists, add it where it doesn't,
 * and delete it when the quantity falls to zero, since Stripe bills a zero-quantity line as a line.
 */
function addOnItemUpdates(
    cur: SubShape,
    plan: PlanId,
    interval: Interval,
    extraSeats: number,
): Stripe.SubscriptionUpdateParams.Item[] {
    const sold = new Set(addOnsFor(plan).map((a) => a.id));
    const out: Stripe.SubscriptionUpdateParams.Item[] = [];
    const reconcile = (id: AddOnId, itemId: string | null, quantity: number): void => {
        const want = sold.has(id) ? Math.max(0, quantity) : 0;
        if (itemId) {
            out.push(want > 0 ? { id: itemId, quantity: want } : { id: itemId, deleted: true });
            return;
        }
        const price = want > 0 ? addOnPriceId(id, interval) : undefined;
        if (price) out.push({ price, quantity: want });
    };
    reconcile("seat", cur.seatItemId, extraSeats);
    return out;
}

export type ChangePlanResult =
    | { error: "no-item" }
    | { error: "invalid-plan" }
    | { error: "seats-not-configured" }
    | { error: "seats-below-members"; members: number }
    | { effect: "cancel_at_period_end" | "upgraded" | "changed" | "scheduled"; at?: string };

// A parked downgrade lives on a subscription schedule; any change taking a different path must
// release it first, or the schedule's second phase fires at period end and downgrades anyway.
async function releaseSchedule(sub: Stripe.Subscription): Promise<void> {
    if (sub.schedule && typeof sub.schedule === "string")
        await stripe().subscriptionSchedules.release(sub.schedule);
}

// Downgrade to Free cancels at period end; an upgrade invoices immediately, other changes prorate.
export async function changePlan(
    ws: WorkspaceRow,
    subscriptionId: string,
    want: Wanted,
): Promise<ChangePlanResult> {
    if (want.plan === "free") {
        await releaseSchedule(await stripe().subscriptions.retrieve(subscriptionId));
        await stripe().subscriptions.update(subscriptionId, { cancel_at_period_end: true });
        // Reflect immediately; the subscription.updated webhook re-syncs it authoritatively.
        await db
            .update(schema.workspaces)
            .set({ cancelAtPeriodEnd: true, scheduledChange: null })
            .where(eq(schema.workspaces.id, ws.id));
        return { effect: "cancel_at_period_end" };
    }

    const sub = await stripe().subscriptions.retrieve(subscriptionId);
    const cur = readSub(sub);
    if (!cur.planItemId || !cur.planPriceId) return { error: "no-item" };
    const curPlan = cur.plan === "free" ? ((ws.plan ?? "free") as PlanId) : cur.plan;
    const curSeats = seatsFor(curPlan, cur.extraSeats);

    const targetPlan = want.plan ?? curPlan;
    const targetInterval = want.interval ?? cur.interval;
    const tp = planFor(targetPlan);
    // a plan that sells no seats lands at its own included count, so a bare tier downgrade from a
    // seated team hits the member floor below and a parked change matches what actually lands
    const targetSeats = tp.billing.sellsSeats
        ? Math.max(want.seats ?? curSeats, tp.billing.includedSeats)
        : tp.billing.includedSeats;
    const targetExtraSeats = tp.billing.sellsSeats ? targetSeats - tp.billing.includedSeats : 0;
    const newPrice = priceIdFor(targetPlan, targetInterval);
    if (!newPrice) return { error: "invalid-plan" };
    if (targetExtraSeats > 0 && !addOnPriceId("seat", targetInterval))
        return { error: "seats-not-configured" };

    // seats can't drop below the people using or holding them — an unexpired invite reserves its seat
    if (targetSeats < curSeats) {
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
    // subscription schedule; more of either applies now, prorated.
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
                    items: [
                        { price: cur.planPriceId, quantity: 1 },
                        ...addOnLines(curPlan, cur.interval, { seats: curSeats }),
                    ],
                    end_date: Math.floor(at.getTime() / 1000),
                },
                {
                    items: [
                        { price: newPrice, quantity: 1 },
                        ...addOnLines(targetPlan, targetInterval, { seats: targetSeats }),
                    ],
                },
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
        capture(payer(ws), "downgrade_scheduled", {
            from_plan: curPlan,
            to_plan: targetPlan,
            effective_at: scheduledChange.at,
        });
        return { effect: "scheduled", at: scheduledChange.at };
    }

    const upgrading = RANK[targetPlan] > RANK[curPlan] || targetSeats > curSeats;
    await releaseSchedule(sub);
    await stripe().subscriptions.update(subscriptionId, {
        items: [
            { id: cur.planItemId, price: newPrice, quantity: 1 },
            ...addOnItemUpdates(cur, targetPlan, targetInterval, targetExtraSeats),
        ],
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
    // nothing parked, nothing to resume: no Stripe call, no downgrade_cancelled noise
    if (!ws.cancelAtPeriodEnd && !ws.scheduledChange) return;
    capture(payer(ws), "downgrade_cancelled", { plan_id: planFor(ws.plan).id });
    if (ws.scheduledChange)
        await releaseSchedule(await stripe().subscriptions.retrieve(subscriptionId));
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
    // Fetched before the claim transaction so no DB connection is held across a network call.
    let checkoutSub: Stripe.Subscription | null = null;
    let supersededSubId: string | null = null;
    // How many credits a purchase bought, read off the line item Stripe actually charged for rather
    // than off metadata we wrote, so a tampered or stale session cannot mint credits.
    let boughtCredits = 0;
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
        }
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
    // A refund or a chargeback on a credit purchase: resolve which purchase it undoes before the
    // transaction, since finding it costs two Stripe round trips.
    let clawback: Clawback | null = null;
    if (event.type === "charge.refunded" || event.type === "charge.dispute.created")
        clawback = await resolveClawback(event);
    // Subscription events sync from freshly retrieved state, not the event payload: any delivery —
    // duplicate, stale, or out of order — converges on what Stripe currently says. Fetched before
    // the transaction so no DB connection is held across a network call.
    let liveSub: Stripe.Subscription | null = null;
    if (
        event.type === "customer.subscription.updated" ||
        event.type === "customer.subscription.deleted"
    ) {
        const sub = event.data.object as Stripe.Subscription;
        liveSub = await stripe().subscriptions.retrieve(sub.id);
    }
    // No idempotency claim: sync effects converge on replay, and grants key their own ledger row
    // (credits.key), so a redelivery finds the row and applies nothing. A failure rolls the whole
    // transaction back and Stripe's retry re-runs it.
    await db.transaction((tx) =>
        handleEvent(event, checkoutSub, liveSub, boughtCredits, clawback, tx),
    );
    // A checkout that replaced a live subscription leaves the old one billing with no workspace
    // attached; cancel it. Best-effort — a failure here is Stripe state to clean up, not a webhook
    // 500. Self-guarding on redelivery: once processed, the workspace's sub already matches.
    if (supersededSubId) {
        try {
            await stripe().subscriptions.cancel(supersededSubId);
            warn(`[billing] canceled superseded subscription ${supersededSubId}`);
        } catch (e) {
            warn(
                `[billing] failed to cancel superseded sub ${supersededSubId}: ${e instanceof Error ? e.message : "unknown"}`,
            );
        }
    }
    return { received: true };
}

/**
 * A credit purchase coming back: `key` claims the clawback so a redelivery cannot take twice, and
 * `grantKey` is the `credits.key` the original grant claimed, which is how we know what was bought.
 */
interface Clawback {
    key: string;
    grantKey: string;
    reason: "refund" | "chargeback";
}

/** The charge a refund or dispute is about, with the Checkout session that granted for it. */
async function resolveClawback(event: Stripe.Event): Promise<Clawback | null> {
    const isRefund = event.type === "charge.refunded";
    const charge = isRefund
        ? (event.data.object as Stripe.Charge)
        : await chargeOfDispute(event.data.object as Stripe.Dispute);
    if (!charge) return null;
    const pi =
        typeof charge.payment_intent === "string"
            ? charge.payment_intent
            : (charge.payment_intent?.id ?? null);
    if (!pi) return null;
    const sessions = await stripe().checkout.sessions.list({ payment_intent: pi, limit: 1 });
    const grantKey = sessions.data[0]?.id;
    if (!grantKey) return null;
    const id = isRefund ? charge.id : (event.data.object as Stripe.Dispute).id;
    return {
        key: `${isRefund ? "refund" : "dispute"}:${id}`,
        grantKey,
        reason: isRefund ? "refund" : "chargeback",
    };
}

async function chargeOfDispute(dispute: Stripe.Dispute): Promise<Stripe.Charge | null> {
    if (typeof dispute.charge !== "string") return dispute.charge ?? null;
    return await stripe().charges.retrieve(dispute.charge);
}

const activeStatus = (s: Stripe.Subscription.Status): string =>
    s === "active" || s === "trialing" ? "active" : s === "past_due" ? "past_due" : "canceled";

async function workspaceBySubId(tx: Tx, subId: string) {
    const [ws] = await tx
        .select()
        .from(schema.workspaces)
        .where(eq(schema.workspaces.stripeSubscriptionId, subId));
    return ws ?? null;
}

// Grant paths read the row FOR UPDATE so concurrent deliveries serialize on the balance.
async function workspaceByCustomer(tx: Tx, customerId: string) {
    const [ws] = await tx
        .select()
        .from(schema.workspaces)
        .where(eq(schema.workspaces.stripeCustomerId, customerId))
        .for("update");
    return ws ?? null;
}

/**
 * The ledger row IS the idempotency claim: a grant keys on the Stripe object that caused it
 * (checkout session, invoice), so a redelivered or duplicated event finds the row and applies
 * nothing — including `also`, the workspace fields that ride along with a first-time grant.
 */
// seats come off the seat item, so the plan item's quantity is always 1
const seatsOf = (sub: Stripe.Subscription): number => {
    const shape = readSub(sub);
    return seatsFor(shape.plan, shape.extraSeats);
};
const invCustomer = (inv: Stripe.Invoice): string | null =>
    typeof inv.customer === "string" ? inv.customer : (inv.customer?.id ?? null);

// Sub events guard on the workspace whose CURRENT sub this is, so a stale update can't resurrect a plan.

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

async function handleEvent(
    event: Stripe.Event,
    checkoutSub: Stripe.Subscription | null,
    liveSub: Stripe.Subscription | null,
    boughtCredits: number,
    clawback: Clawback | null,
    tx: Tx,
): Promise<void> {
    if (
        event.type === "checkout.session.completed" ||
        event.type === "checkout.session.async_payment_succeeded"
    ) {
        const s = event.data.object as Stripe.Checkout.Session;
        const wsId = s.client_reference_id ?? s.metadata?.workspaceId;
        const customerId = typeof s.customer === "string" ? s.customer : (s.customer?.id ?? null);
        if (s.mode === "payment") {
            // The quantity Stripe charged for is the grant; metadata is not trusted with an amount.
            if (!wsId || boughtCredits <= 0) return;
            // A delayed method (bank debit) completes the session unpaid and settles later through
            // async_payment_succeeded, so the money has to have landed before the credits do. Both
            // events carry the same session id, and grantOnce keys on it, so only one can grant.
            if (s.payment_status !== "paid") return;
            // The session was created by our API, which bounds the quantity, but a session made any
            // other way reaches here too: re-check rather than grant an amount we would never sell.
            if (!isCreditQuantity(boughtCredits)) {
                warn(
                    `[billing] refusing out-of-bounds credit purchase ${boughtCredits} on ${s.id}`,
                );
                return;
            }
            const [ws] = await tx
                .select()
                .from(schema.workspaces)
                .where(eq(schema.workspaces.id, wsId))
                .for("update");
            if (ws) {
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
            }
            return;
        }
        if (!wsId || !checkoutSub) return;
        const sub = checkoutSub;
        const { plan, interval } = readSub(sub);
        if (plan === "free") return;
        const [before] = await tx
            .select()
            .from(schema.workspaces)
            .where(eq(schema.workspaces.id, wsId))
            .for("update");
        if (!before) return;
        const shape = { ...before, plan, seats: seatsOf(sub) };
        const grant = clipGrant(
            monthlyGrantFor(shape),
            before.aiCreditsBalance,
            before.purchasedCredits,
            rolloverCapFor(shape),
        );
        await grantOnce(tx, before, {
            key: s.id,
            delta: grant,
            reason: "upgrade-grant",
            also: {
                // pre-grant balance: a spent pack decays instead of absorbing the fresh grant
                purchasedCredits: Math.min(before.purchasedCredits, before.aiCreditsBalance),
                plan,
                planInterval: interval,
                planStatus: activeStatus(sub.status),
                stripeCustomerId: customerId ?? undefined,
                stripeSubscriptionId: sub.id,
                seats: seatsOf(sub),
                planPeriodEnd: subPeriodEnd(sub),
                cancelAtPeriodEnd: sub.cancel_at_period_end,
                // subscribing opens a window and grants on top of whatever is already banked
                creditsStartedAt: new Date(),
                creditsResetAt: monthOut(),
                scheduledChange: null,
            },
        });
        // The group's own traits, not just the event: a plan change arrives with no client in the
        // request, so nothing else would refresh them until someone next opened the app.
        identifyWorkspace(before.id, { plan_id: plan, seats_total: seatsOf(sub) });
        capture(payer(before), "checkout_completed", {
            plan_id: plan,
            interval: intervalForPrice(sub.items.data[0]?.price.id) ?? "month",
            seats: seatsOf(sub),
            mrr_usd: mrrOf(sub),
        });
    } else if (
        event.type === "customer.subscription.updated" ||
        event.type === "customer.subscription.deleted"
    ) {
        const sub = liveSub;
        if (!sub) return;
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
        // A live status of canceled means the subscription is gone (deleted, or an update racing a
        // deletion): back to Free; data kept, over-limit use soft-locked by the resolver's gates.
        if (sub.status === "canceled" || sub.status === "incomplete_expired") {
            await tx
                .update(schema.workspaces)
                .set({
                    plan: "free",
                    planInterval: null,
                    planStatus: "canceled",
                    stripeSubscriptionId: null,
                    // the seat add-on dies with the subscription; members stay and sit over the cap.
                    // Banked credits are untouched: they were granted or bought, not rented.
                    seats: 1,
                    planPeriodEnd: null,
                    cancelAtPeriodEnd: false,
                    scheduledChange: null,
                })
                .where(eq(schema.workspaces.id, ws.id));
            const [count] = await tx
                .select({ n: sql<string>`count(*)` })
                .from(schema.artifacts)
                .where(eq(schema.artifacts.workspaceId, ws.id));
            identifyWorkspace(ws.id, { plan_id: "free", seats_total: 1 });
            capture(payer(ws), "plan_cancelled", {
                plan_id: planFor(ws.plan).id,
                days_active: Math.round((Date.now() - ws.createdAt.getTime()) / (24 * 3_600_000)),
                artifacts_created: Number(count?.n ?? 0),
            });
            return;
        }
        const plan = planForPrice(sub.items.data[0]?.price.id);
        const interval = intervalForPrice(sub.items.data[0]?.price.id);
        // an unmapped price is an env misconfiguration; the sync silently keeps the old plan, so say so
        if (!plan)
            warn(
                `[billing] unknown plan price ${sub.items.data[0]?.price.id ?? "none"} on subscription ${sub.id}`,
            );
        // a scheduled downgrade has landed once the sub matches what was parked
        const sc = ws.scheduledChange;
        const scheduleDone = !!sc && sc.plan === plan && sc.seats === seatsOf(sub);
        await tx
            .update(schema.workspaces)
            .set({
                ...(plan ? { plan } : {}),
                ...(interval ? { planInterval: interval } : {}),
                planStatus: activeStatus(sub.status),
                stripeSubscriptionId: sub.id,
                seats: seatsOf(sub),
                planPeriodEnd: subPeriodEnd(sub),
                cancelAtPeriodEnd: sub.cancel_at_period_end,
                ...(scheduleDone ? { scheduledChange: null } : {}),
            })
            .where(eq(schema.workspaces.id, ws.id));
        const from = planFor(ws.plan).id;
        const to = planFor(plan ?? ws.plan).id;
        identifyWorkspace(ws.id, { plan_id: to, seats_total: seatsOf(sub) });
        const toInterval = interval ?? "month";
        if (from !== to)
            capture(payer(ws), "plan_changed", {
                from_plan: from,
                to_plan: to,
                // The row does not store the interval, so the side we are leaving is only knowable
                // when a scheduled change recorded it.
                from_interval: sc?.interval ?? toInterval,
                to_interval: toInterval,
                direction: RANK[to] > RANK[from] ? "upgrade" : "downgrade",
            });
        else if (sc?.interval && sc.interval !== toInterval)
            capture(payer(ws), "plan_changed", {
                from_plan: from,
                to_plan: to,
                from_interval: sc.interval,
                to_interval: toInterval,
                direction: "interval",
            });
        if (seatsOf(sub) !== ws.seats)
            capture(payer(ws), "seats_changed", {
                from: ws.seats,
                to: seatsOf(sub),
                direction: seatsOf(sub) > ws.seats ? "up" : "down",
            });
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
        // The lazy roll self-heals a missed grant once the webhook grace lapses, and writes no
        // credits.key for the invoice to collide with. So the window itself is the claim: if it
        // already opened at or after this invoice's period, the period has been granted.
        const periodStart = inv.lines?.data[0]?.period?.start;
        const rolledAlready =
            periodStart !== undefined &&
            periodStart !== null &&
            ws.creditsStartedAt.getTime() >= periodStart * 1000;
        if (
            inv.billing_reason === "subscription_cycle" &&
            ws.planInterval !== "year" &&
            !rolledAlready
        ) {
            // Only a monthly cycle renewal grants; other invoices just clear dunning, and an annual
            // renewal too, since the lazy roll owns an annual sub's monthly cadence and granting
            // here as well would double it. The grant adds to what is banked rather than replacing
            // it, the same as rollCreditWindow.
            const grant = clipGrant(
                monthlyGrantFor(ws),
                ws.aiCreditsBalance,
                ws.purchasedCredits,
                rolloverCapFor(ws),
            );
            await grantOnce(tx, ws, {
                key: inv.id,
                delta: grant,
                reason: "renewal-grant",
                also: {
                    planStatus: "active",
                    // pre-grant balance, as rollCreditWindow clamps
                    purchasedCredits: Math.min(ws.purchasedCredits, ws.aiCreditsBalance),
                    creditsStartedAt: new Date(),
                    creditsResetAt: monthOut(),
                },
            });
        } else if (ws.planStatus === "past_due") {
            await tx
                .update(schema.workspaces)
                .set({ planStatus: "active" })
                .where(eq(schema.workspaces.id, ws.id));
        }
    } else if (event.type === "charge.refunded" || event.type === "charge.dispute.created") {
        if (!clawback) return;
        const [granted] = await tx
            .select({ delta: schema.credits.delta, workspaceId: schema.credits.workspaceId })
            .from(schema.credits)
            .where(eq(schema.credits.key, clawback.grantKey));
        // only a credit purchase is clawed back; a refunded subscription invoice is Stripe's to settle
        if (!granted || granted.delta <= 0) return;
        const [ws] = await tx
            .select()
            .from(schema.workspaces)
            .where(eq(schema.workspaces.id, granted.workspaceId))
            .for("update");
        if (!ws) return;
        // Credits already spent cannot come back, so the balance simply floors at zero: the money
        // has gone to the provider and the workspace keeps the work it bought with it.
        const take = Math.min(granted.delta, ws.aiCreditsBalance);
        if (take <= 0) return;
        await grantOnce(tx, ws, {
            key: clawback.key,
            delta: -take,
            reason: clawback.reason,
            // The shield stops protecting a purchase that was handed back, and never exceeds what
            // is actually banked after it: the same invariant every grant site keeps by clamping
            // against the pre-grant balance.
            also: {
                purchasedCredits: Math.max(
                    0,
                    Math.min(ws.purchasedCredits - take, ws.aiCreditsBalance - take),
                ),
            },
        });
        warn(`[billing] ${clawback.reason} took back ${take} credits from ${ws.id}`);
    }
}
