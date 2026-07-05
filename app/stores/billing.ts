import { createSignal } from "solid-js";
import type { PlanId } from "@model/billing";
import type { BillingState } from "../api";
import { api, ApiError } from "../api";

// The workspace's billing state (plan · usage · catalog), loaded on demand for the pricing page + the
// plan badge, and the Stripe hand-offs. Kept out of the main library store since it's its own concern.
const [billing, setBilling] = createSignal<BillingState | null>(null);
export { billing };

export async function loadBilling(): Promise<void> {
    try {
        setBilling(await api.getBilling());
    } catch {
        // signed out / no workspace — leave it null; callers treat that as "free / unknown"
    }
}

// Redirect to Stripe Checkout for a plan (the browser leaves the SPA and comes back to /pricing).
export async function startCheckout(plan: PlanId): Promise<void> {
    const { url } = await api.checkout(plan);
    if (url) window.location.href = url;
}

// Open the Stripe customer portal to manage/cancel the subscription.
export async function openPortal(): Promise<void> {
    const { url } = await api.portal();
    if (url) window.location.href = url;
}

// Reserve AI credits before a generation. Returns false when the allowance is spent (the caller should
// then send the user to the pricing page), true once the spend is recorded.
export async function spendGenerationCredit(): Promise<boolean> {
    try {
        await api.spendCredits();
        await loadBilling();
        return true;
    } catch (e) {
        if (e instanceof ApiError && e.status === 402) return false;
        throw e;
    }
}
