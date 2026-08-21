import { createSignal } from "solid-js";
import type { CreditPackId, Interval, PlanId } from "@model/billing";
import type { BillingState } from "@app/api";
import { api } from "@app/api";
import { capture, register } from "@ui/analytics";

const [billing, setBilling] = createSignal<BillingState | null>(null);
export { billing };

// Two generations' worth. Below this the next thing the user tries is likely to be refused, which
// is the moment worth knowing about; the wall itself is credits_exhausted.
const lowAt = (perGeneration: number): number => perGeneration * 2;

let wasLow = false;

export async function loadBilling(): Promise<void> {
    try {
        const state = await api.getBilling();
        setBilling(state);
        // Rides every subsequent event, so behaviour near the credit wall is visible and not only
        // behaviour at it.
        register({ plan_id: state.plan, credits_remaining: state.credits.balance });
        // On the crossing, not on every read, or a low balance would report once per page load.
        const threshold = lowAt(state.credits.perGeneration);
        const low = state.credits.balance <= threshold;
        if (low && !wasLow)
            capture("credit_balance_low", {
                credits_remaining: state.credits.balance,
                threshold,
            });
        wasLow = low;
    } catch {
        // signed out / no workspace — callers treat null as "free / unknown"
    }
}

// Read by the pricing page to tell a visit that converted from one that was abandoned.
const [checkoutStarted, setCheckoutStarted] = createSignal(false);
export { checkoutStarted };

export async function startCheckout(opts: {
    plan: PlanId;
    interval?: Interval;
    seats?: number;
}): Promise<void> {
    setCheckoutStarted(true);
    try {
        const { url } = await api.checkout(opts);
        if (url) window.location.href = url;
        else setCheckoutStarted(false); // nothing to go to, so the visit is still abandonable
    } catch (e) {
        setCheckoutStarted(false);
        throw e;
    }
}

export async function changePlan(opts: {
    plan?: PlanId;
    interval?: Interval;
    seats?: number;
}): Promise<void> {
    await api.changePlan(opts);
    await loadBilling();
}

export async function resumePlan(): Promise<void> {
    await api.resumePlan();
    await loadBilling();
}

export async function startTopUp(pack: CreditPackId): Promise<void> {
    const { url } = await api.topUp(pack);
    if (url) window.location.href = url;
}

export async function openPortal(from: string): Promise<void> {
    capture("billing_portal_opened", { from }, { beacon: true });
    const { url } = await api.portal();
    if (url) window.location.href = url;
}
