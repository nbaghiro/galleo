import { createSignal } from "solid-js";
import type { Interval, PlanId } from "@model/billing";
import type { CreditPackId } from "@model/billing";
import type { BillingState } from "../api";
import { api } from "../api";

const [billing, setBilling] = createSignal<BillingState | null>(null);
export { billing };

export async function loadBilling(): Promise<void> {
    try {
        setBilling(await api.getBilling());
    } catch {
        // signed out / no workspace — callers treat null as "free / unknown"
    }
}

export async function startCheckout(opts: {
    plan: PlanId;
    interval?: Interval;
    seats?: number;
}): Promise<void> {
    const { url } = await api.checkout(opts);
    if (url) window.location.href = url;
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

export async function openPortal(): Promise<void> {
    const { url } = await api.portal();
    if (url) window.location.href = url;
}
