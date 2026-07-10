import { createSignal } from "solid-js";
import type { Interval, PlanId } from "@model/billing";
import type { ToolId, MeterParams } from "@model/tools";
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

// Redirect to Stripe Checkout for a plan (the browser leaves the SPA and comes back to /pricing). Used
// for free → paid; per-seat plans pass a seat count and the billing interval.
export async function startCheckout(opts: {
    plan: PlanId;
    interval?: Interval;
    seats?: number;
}): Promise<void> {
    const { url } = await api.checkout(opts);
    if (url) window.location.href = url;
}

// In-app tier / interval / seat change on an existing subscription (no redirect). Reloads billing after.
export async function changePlan(opts: {
    plan?: PlanId;
    interval?: Interval;
    seats?: number;
}): Promise<void> {
    await api.changePlan(opts);
    await loadBilling();
}

// Open the Stripe customer portal to manage payment method / invoices / cancel.
export async function openPortal(): Promise<void> {
    const { url } = await api.portal();
    if (url) window.location.href = url;
}

// Reserve credits for a tool (priced from the @model/tools catalog). Pass a `meter` for size-aware tools
// (e.g. the generation length) so the gate reserves the real cost. Returns false when the allowance is spent
// (the caller should send the user to pricing), true once the spend is recorded.
export async function spendCredit(action: ToolId, meter?: MeterParams): Promise<boolean> {
    try {
        await api.spendCredits({ action, meter });
        await loadBilling();
        return true;
    } catch (e) {
        if (e instanceof ApiError && e.status === 402) return false;
        throw e;
    }
}

// The intake flow's gate — a generation, priced by the chosen length (pass e.g. { length: "In-depth" }).
export const spendGenerationCredit = (meter?: MeterParams): Promise<boolean> =>
    spendCredit("generate-artifact", meter);
