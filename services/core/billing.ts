import Stripe from "stripe";
import { and, desc, eq, gt, isNotNull, isNull, sql } from "drizzle-orm";
import type { AddOnId, Interval, PlanId, ScheduledChange } from "@model/billing";
import {
    addOnsFor,
    CREDITS_PER_GENERATION,
    creditLimitFor,
    extraSeatsOf,
    featuresFor,
    limitsFor,
    planFor,
    seatsFor,
    visiblePlans,
} from "@model/billing";
import { db } from "@services/db/client";
import { warn } from "@services/utils/env";
import { schema } from "@services/db/schema";
import { appUrl } from "@services/utils/env";
import type { WorkspaceRow } from "./accounts";

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

export function priceIdFor(plan: PlanId, interval: Interval = "month"): string | undefined {
    const key = priceEnvKey(plan, interval);
    const id = key ? process.env[key] : undefined;
    if (id) return id;
    // annual missing → fall back to monthly so checkout still works
    return interval === "year" ? priceIdFor(plan, "month") : undefined;
}

function addOnEnvKey(id: AddOnId, interval: Interval): string {
    const base = id === "seat" ? "STRIPE_PRICE_SEAT" : "STRIPE_PRICE_CREDITS";
    return interval === "year" ? `${base}_YEAR` : `${base}_MONTH`;
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
        ["credits", "month"],
        ["credits", "year"],
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
 * A subscription is one plan item plus optional add-on items, so seats and credit blocks are read
 * off their own quantities rather than the plan item's. Anything unrecognised is ignored, which
 * keeps a manually-added Stripe line from being mistaken for an add-on.
 */
export interface SubShape {
    plan: PlanId;
    interval: Interval;
    extraSeats: number;
    creditBlocks: number;
    planItemId: string | null;
    seatItemId: string | null;
    creditItemId: string | null;
    planPriceId: string | null;
}

export function readSub(sub: Stripe.Subscription): SubShape {
    const out: SubShape = {
        plan: "free",
        interval: "month",
        extraSeats: 0,
        creditBlocks: 0,
        planItemId: null,
        seatItemId: null,
        creditItemId: null,
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
        const addOn = addOnForPrice(item.price.id);
        if (addOn === "seat") {
            out.extraSeats = item.quantity ?? 0;
            out.seatItemId = item.id;
        } else if (addOn === "credits") {
            out.creditBlocks = item.quantity ?? 0;
            out.creditItemId = item.id;
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

// The caller's net spend since the window opened: charges minus refunds. Only user-attributed rows
// exist for spends/settles (grants and resets are system rows), so a plain sum nets naturally.
async function spendThisCycle(ws: WorkspaceRow, userId: string): Promise<number> {
    const [row] = await db
        .select({ total: sql<string>`COALESCE(SUM(-${schema.credits.delta}), 0)` })
        .from(schema.credits)
        .where(
            and(
                eq(schema.credits.workspaceId, ws.id),
                eq(schema.credits.userId, userId),
                gt(schema.credits.createdAt, ws.creditsStartedAt),
            ),
        );
    return Math.max(0, Number(row?.total ?? 0));
}

export async function billingSummary(ws: WorkspaceRow, userId: string) {
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
        credits: {
            used: ws.aiCreditsUsed,
            limit: creditLimitFor(ws),
            perGeneration: CREDITS_PER_GENERATION,
            resetAt: ws.creditsResetAt,
            mySpend,
        },
        // only what is actually purchasable: the plan must allow it and the price must be configured
        addOns: addOnsFor(ws.plan).filter((a) => !!addOnPriceId(a.id)),
        addOnQuantities: { seat: extraSeatsOf(ws), credits: ws.creditBlocks },
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

/** What a caller asked for. Seats are total (plan's own included), blocks are the add-on quantity. */
export interface Wanted {
    plan?: PlanId;
    interval?: Interval;
    seats?: number;
    creditBlocks?: number;
}

const wantedExtraSeats = (plan: PlanId, want: Wanted): number =>
    Math.max(
        0,
        (want.seats ?? planFor(plan).billing.includedSeats) - planFor(plan).billing.includedSeats,
    );

const wantedBlocks = (want: Wanted): number => Math.max(0, want.creditBlocks ?? 0);

/** Add-on line items, omitting any at quantity zero so a subscription carries no empty lines. */
function addOnLines(
    plan: PlanId,
    interval: Interval,
    want: Wanted,
): Array<{ price: string; quantity: number }> {
    const sold = new Set(addOnsFor(plan).map((a) => a.id));
    const lines: Array<{ price: string; quantity: number }> = [];
    const seats = wantedExtraSeats(plan, want);
    const seatPrice = addOnPriceId("seat", interval);
    if (sold.has("seat") && seats > 0 && seatPrice)
        lines.push({ price: seatPrice, quantity: seats });
    const blocks = wantedBlocks(want);
    const creditPrice = addOnPriceId("credits", interval);
    if (sold.has("credits") && blocks > 0 && creditPrice)
        lines.push({ price: creditPrice, quantity: blocks });
    return lines;
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
    const p = planFor(want.plan);
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
        success_url: appUrl("/pricing?status=success"),
        cancel_url: appUrl("/pricing?status=cancel"),
    });
    return session.url;
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

/**
 * Item updates for the add-ons: change the quantity where the item exists, add it where it doesn't,
 * and delete it when the quantity falls to zero, since Stripe bills a zero-quantity line as a line.
 */
function addOnItemUpdates(
    cur: SubShape,
    plan: PlanId,
    interval: Interval,
    extraSeats: number,
    blocks: number,
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
    reconcile("credits", cur.creditItemId, blocks);
    return out;
}

export type ChangePlanResult =
    | { error: "no-item" }
    | { error: "invalid-plan" }
    | { error: "seats-below-members"; members: number }
    | { effect: "cancel_at_period_end" | "upgraded" | "changed" | "scheduled"; at?: string };

// Downgrade to Free cancels at period end; an upgrade invoices immediately, other changes prorate.
export async function changePlan(
    ws: WorkspaceRow,
    subscriptionId: string,
    want: Wanted,
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
    const cur = readSub(sub);
    if (!cur.planItemId || !cur.planPriceId) return { error: "no-item" };
    const curPlan = cur.plan === "free" ? ((ws.plan ?? "free") as PlanId) : cur.plan;
    const curSeats = seatsFor(curPlan, cur.extraSeats);

    const targetPlan = want.plan ?? curPlan;
    const targetInterval = want.interval ?? cur.interval;
    const tp = planFor(targetPlan);
    const targetSeats = Math.max(want.seats ?? curSeats, tp.billing.includedSeats);
    const targetExtraSeats = tp.billing.sellsSeats ? targetSeats - tp.billing.includedSeats : 0;
    const targetBlocks = tp.billing.sellsCredits ? (want.creditBlocks ?? cur.creditBlocks) : 0;
    const newPrice = priceIdFor(targetPlan, targetInterval);
    if (!newPrice) return { error: "invalid-plan" };

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

    // What you paid for, you keep: a lower tier, fewer seats, or fewer credit blocks waits for the
    // period boundary via a subscription schedule; more of anything applies now, prorated.
    const downgrade =
        RANK[targetPlan] < RANK[curPlan] ||
        targetSeats < curSeats ||
        targetBlocks < cur.creditBlocks;
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
                        ...addOnLines(curPlan, cur.interval, {
                            seats: curSeats,
                            creditBlocks: cur.creditBlocks,
                        }),
                    ],
                    end_date: Math.floor(at.getTime() / 1000),
                },
                {
                    items: [
                        { price: newPrice, quantity: 1 },
                        ...addOnLines(targetPlan, targetInterval, {
                            seats: targetSeats,
                            creditBlocks: targetBlocks,
                        }),
                    ],
                },
            ],
        });
        const scheduledChange: ScheduledChange = {
            plan: targetPlan,
            interval: targetInterval,
            seats: targetSeats,
            creditBlocks: targetBlocks,
            at: at.toISOString(),
        };
        await db
            .update(schema.workspaces)
            .set({ scheduledChange, cancelAtPeriodEnd: false })
            .where(eq(schema.workspaces.id, ws.id));
        return { effect: "scheduled", at: scheduledChange.at };
    }

    const upgrading =
        RANK[targetPlan] > RANK[curPlan] ||
        targetSeats > curSeats ||
        targetBlocks > cur.creditBlocks;
    await stripe().subscriptions.update(subscriptionId, {
        items: [
            { id: cur.planItemId, price: newPrice, quantity: 1 },
            ...addOnItemUpdates(cur, targetPlan, targetInterval, targetExtraSeats, targetBlocks),
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
    if (ws.scheduledChange) {
        const sub = await stripe().subscriptions.retrieve(subscriptionId);
        if (sub.schedule && typeof sub.schedule === "string")
            await stripe().subscriptionSchedules.release(sub.schedule);
    }
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
    let supersededSubId: string | null = null;
    if (event.type === "checkout.session.completed") {
        const s = event.data.object as Stripe.Checkout.Session;
        const subId = typeof s.subscription === "string" ? s.subscription : s.subscription?.id;
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
    // A checkout that replaced a live subscription leaves the old one billing with no workspace
    // attached; cancel it. Best-effort — a failure here is Stripe state to clean up, not a webhook 500.
    if (!duplicate && supersededSubId) {
        try {
            await stripe().subscriptions.cancel(supersededSubId);
            warn(`[billing] canceled superseded subscription ${supersededSubId}`);
        } catch (e) {
            warn(
                `[billing] failed to cancel superseded sub ${supersededSubId}: ${e instanceof Error ? e.message : "unknown"}`,
            );
        }
    }
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

// seats and blocks come off their own add-on items, so the plan item's quantity is always 1
const seatsOf = (sub: Stripe.Subscription): number => {
    const shape = readSub(sub);
    return seatsFor(shape.plan, shape.extraSeats);
};
const blocksOf = (sub: Stripe.Subscription): number => readSub(sub).creditBlocks;
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
        if (!wsId || !checkoutSub) return;
        const sub = checkoutSub;
        const plan = readSub(sub).plan;
        if (plan === "free") return;
        const [before] = await tx
            .select()
            .from(schema.workspaces)
            .where(eq(schema.workspaces.id, wsId))
            .for("update");
        if (!before) return;
        await tx
            .update(schema.workspaces)
            .set({
                plan,
                planStatus: activeStatus(sub.status),
                stripeCustomerId: customerId ?? undefined,
                stripeSubscriptionId: sub.id,
                seats: seatsOf(sub),
                creditBlocks: blocksOf(sub),
                planPeriodEnd: subPeriodEnd(sub),
                cancelAtPeriodEnd: sub.cancel_at_period_end,
                aiCreditsUsed: 0,
                creditsStartedAt: new Date(),
                creditsResetAt: monthOut(),
                scheduledChange: null,
            })
            .where(eq(schema.workspaces.id, wsId));
        // the wiped usage leaves an audit trail like every other reset
        if (before.aiCreditsUsed > 0)
            await tx.insert(schema.credits).values({
                workspaceId: wsId,
                delta: before.aiCreditsUsed,
                reason: "upgrade-reset",
                balanceAfter: creditLimitFor({
                    ...before,
                    plan,
                    seats: seatsOf(sub),
                    creditBlocks: blocksOf(sub),
                }),
            });
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
        // a scheduled downgrade has landed once the sub matches what was parked
        const sc = ws.scheduledChange;
        const scheduleDone =
            !!sc &&
            sc.plan === plan &&
            sc.seats === seatsOf(sub) &&
            sc.creditBlocks === blocksOf(sub);
        await tx
            .update(schema.workspaces)
            .set({
                ...(plan ? { plan } : {}),
                planStatus: activeStatus(sub.status),
                stripeSubscriptionId: sub.id,
                seats: seatsOf(sub),
                creditBlocks: blocksOf(sub),
                planPeriodEnd: subPeriodEnd(sub),
                cancelAtPeriodEnd: sub.cancel_at_period_end,
                ...(scheduleDone ? { scheduledChange: null } : {}),
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
                // add-ons die with the subscription; the members stay and simply sit over the cap
                seats: 1,
                creditBlocks: 0,
                planPeriodEnd: null,
                cancelAtPeriodEnd: false,
                scheduledChange: null,
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
                .set({
                    planStatus: "active",
                    aiCreditsUsed: 0,
                    creditsStartedAt: new Date(),
                    creditsResetAt: monthOut(),
                })
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
