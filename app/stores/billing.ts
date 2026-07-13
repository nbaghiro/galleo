import { createSignal } from "solid-js";
import type { Interval, PlanId } from "@model/billing";
import type { ToolId, MeterParams } from "@model/tools";
import type { BillingState } from "../api";
import { api, ApiError } from "../api";

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

export async function openPortal(): Promise<void> {
    const { url } = await api.portal();
    if (url) window.location.href = url;
}

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

export const spendGenerationCredit = (meter?: MeterParams): Promise<boolean> =>
    spendCredit("generate-artifact", meter);
