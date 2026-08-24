import { createSignal } from "solid-js";
import type { CreditPackId, Interval, PlanId } from "@model/billing";
import type { BillingState, ChangeEffect, LedgerEntry } from "@app/api";
import { api, ApiError } from "@app/api";
import { capture, register } from "@ui/analytics";

const [billing, setBilling] = createSignal<BillingState | null>(null);
export { billing };

// One busy scope for every billing mutation, shared by the pricing page and the plan grid, so a
// seat change and a plan change cannot run against Stripe concurrently. Checkout and the portal
// redirect away, so their pending state simply persists until navigation.
const [pendingAction, setPendingAction] = createSignal<string | null>(null);
const [mutationError, setMutationError] = createSignal<ApiError | null>(null);
// what the last change did: applied now, parked at period end, or a pending cancel
const [lastChange, setLastChange] = createSignal<ChangeEffect | null>(null);
export { lastChange, mutationError };

export const billingBusy = (key: string): boolean => pendingAction() === key;
export const anyBillingBusy = (): boolean => pendingAction() !== null;
export const dismissBillingError = (): void => {
    setMutationError(null);
};
export const dismissLastChange = (): void => {
    setLastChange(null);
};

export async function runBilling(key: string, fn: () => Promise<void>): Promise<void> {
    if (pendingAction() !== null) return;
    setPendingAction(key);
    setMutationError(null);
    setLastChange(null);
    try {
        await fn();
    } catch (e) {
        setMutationError(
            e instanceof ApiError
                ? e
                : new ApiError(0, e instanceof Error ? e.message : "Something went wrong."),
        );
    } finally {
        setPendingAction(null);
    }
}

// The credit ledger, paged keyset-style by the server (30 rows a page). The pricing page shows the
// head as a preview; the activity page appends the rest through the scroll sentinel.
const [ledgerEntries, setLedgerEntries] = createSignal<LedgerEntry[]>([]);
const [ledgerLoaded, setLedgerLoaded] = createSignal(false);
// null once the history is exhausted; the sentinel reads it to know when to stop
const [ledgerCursor, setLedgerCursor] = createSignal<string | null>(null);
const [ledgerLoadingMore, setLedgerLoadingMore] = createSignal(false);
// the first page failed and there is nothing to show; distinct from a genuinely empty history
const [ledgerError, setLedgerError] = createSignal(false);
export { ledgerCursor, ledgerEntries, ledgerError, ledgerLoaded, ledgerLoadingMore };

// "generate-artifact:settle" → "generate artifact (adjusted)". A settle now rewrites the charge's
// own row, so the suffixes only appear on rows written before that change.
export const ledgerReasonLabel = (r: string): string =>
    r.replace(":settle", " (adjusted)").replace(":refund", " (refunded)").replace(/-/g, " ");

// a page fetched before a reload finished must not be appended; each fetch carries its epoch
let ledgerEpoch = 0;

/** Fetch page one, replacing the list. */
export async function loadLedger(): Promise<void> {
    const mine = ++ledgerEpoch;
    setLedgerError(false);
    try {
        const page = await api.getLedger();
        if (mine !== ledgerEpoch) return;
        setLedgerEntries(page.entries);
        setLedgerCursor(page.nextCursor);
    } catch {
        // keep whatever we have; with nothing, the views need "failed" over "empty"
        if (mine === ledgerEpoch && ledgerEntries().length === 0) setLedgerError(true);
    } finally {
        if (mine === ledgerEpoch) setLedgerLoaded(true);
    }
}

/** Append the next page. No-op while one is in flight or once the history is exhausted. */
export async function loadMoreLedger(): Promise<void> {
    const cursor = ledgerCursor();
    if (!cursor || ledgerLoadingMore()) return;
    const mine = ledgerEpoch;
    setLedgerLoadingMore(true);
    try {
        const page = await api.getLedger(cursor);
        if (mine !== ledgerEpoch) return;
        setLedgerEntries([...ledgerEntries(), ...page.entries]);
        setLedgerCursor(page.nextCursor);
    } catch {
        /* leave the cursor in place so the sentinel can retry */
    } finally {
        setLedgerLoadingMore(false);
    }
}

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
    const res = await api.changePlan(opts);
    setLastChange(res.effect ?? null);
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
