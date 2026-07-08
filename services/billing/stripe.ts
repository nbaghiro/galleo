import Stripe from "stripe";
import type { Interval, PlanId } from "@model/billing";

// Lazy Stripe client — built on first use so a missing key doesn't crash boot. Everything is env-driven,
// so the code runs (and QA can sign in) before the Stripe account exists; the billing routes just report
// "not configured" until STRIPE_SECRET_KEY + the price ids are set.
let client: Stripe | undefined;

export function stripe(): Stripe {
    if (!client) {
        const key = process.env.STRIPE_SECRET_KEY;
        if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
        client = new Stripe(key);
    }
    return client;
}

// Billing is live once the secret + the paid tiers' monthly price ids are present. (Annual prices are
// optional — checkout falls back to monthly if an annual id is missing.)
export function stripeReady(): boolean {
    return !!(
        process.env.STRIPE_SECRET_KEY &&
        process.env.STRIPE_PRICE_PRO_MONTH &&
        process.env.STRIPE_PRICE_PREMIUM_MONTH
    );
}

// The env key holding a plan+interval's Stripe price id, or null for free (no price). Read at call time
// so a restart with new env is enough — no rebuild.
function priceEnvKey(plan: PlanId, interval: Interval): string | null {
    if (plan === "pro")
        return interval === "year" ? "STRIPE_PRICE_PRO_YEAR" : "STRIPE_PRICE_PRO_MONTH";
    if (plan === "premium")
        return interval === "year" ? "STRIPE_PRICE_PREMIUM_YEAR" : "STRIPE_PRICE_PREMIUM_MONTH";
    return null;
}

// plan (+ interval) → Stripe price id. Falls back to the monthly price when an annual id isn't set.
export function priceIdFor(plan: PlanId, interval: Interval = "month"): string | undefined {
    const key = priceEnvKey(plan, interval);
    const id = key ? process.env[key] : undefined;
    if (id) return id;
    // annual missing → fall back to monthly so checkout still works
    return interval === "year" ? priceIdFor(plan, "month") : undefined;
}

// Every configured price id, mapped back to its plan + interval (used by the webhook + change-plan to
// read a subscription's current tier/interval).
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

// Stripe price id → our plan id (the webhook maps a subscription back to a plan).
export function planForPrice(priceId: string | undefined | null): PlanId | null {
    if (!priceId) return null;
    return priceMap().find((p) => p.id === priceId)?.plan ?? null;
}

// Stripe price id → billing interval (month/year), for interval-aware change-plan + display.
export function intervalForPrice(priceId: string | undefined | null): Interval | null {
    if (!priceId) return null;
    return priceMap().find((p) => p.id === priceId)?.interval ?? null;
}
