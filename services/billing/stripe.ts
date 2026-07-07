import Stripe from "stripe";
import type { PlanId } from "@model/billing";

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

// Billing is live only once the secret + both paid price ids are present.
export function stripeReady(): boolean {
    return !!(
        process.env.STRIPE_SECRET_KEY &&
        process.env.STRIPE_PRICE_PRO &&
        process.env.STRIPE_PRICE_PREMIUM
    );
}

// plan → Stripe price id (set after creating the products in the dashboard). Read at call time so a
// restart with new env is enough; no rebuild.
export function priceIdFor(plan: PlanId): string | undefined {
    if (plan === "pro") return process.env.STRIPE_PRICE_PRO;
    if (plan === "premium") return process.env.STRIPE_PRICE_PREMIUM;
    return undefined; // free has no price
}

// Stripe price id → our plan id (used by the webhook to map a subscription back to a plan).
export function planForPrice(priceId: string | undefined | null): PlanId | null {
    if (!priceId) return null;
    if (priceId === process.env.STRIPE_PRICE_PRO) return "pro";
    if (priceId === process.env.STRIPE_PRICE_PREMIUM) return "premium";
    return null;
}
