import type { Component } from "solid-js";
import { For, Show } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { Button, Eyebrow, Spinner } from "@ui/button";
import { canTopUp, PLAN_ORDER, PLANS } from "@model/billing";
import { CreditActivity, previewEntries } from "./CreditActivity";
import { PaymentReturnNotice, PolicyRow, SettingsSection as Section } from "./settings";
import { UpgradeButton } from "./Upgrade";
import {
    anyBillingBusy,
    billing,
    billingBusy,
    dismissBillingError,
    ledgerEntries,
    mutationError,
    openPortal,
    runBilling,
    startTopUp,
} from "@app/stores/billing";
import { canManageBilling, workspaceState } from "@app/stores/workspace";

// The Billing tab of workspace settings: where money moves. Payment method and invoices, credit
// top-ups, and the ledger. What the workspace is subscribed to is the sibling Plan tab, PlanPanel.tsx.
// Data loading and the Stripe-return consumption live in the settings shell, which mounts once.

export const BillingPanel: Component = () => {
    const navigate = useNavigate();
    // the sellers are read off the catalog, not written into copy
    const packSellers = (): string =>
        PLAN_ORDER.filter(canTopUp)
            .map((id) => PLANS[id].name)
            .join(" and ");

    const b = billing;
    const ready = (): boolean => b()?.stripeReady ?? false;
    const busy = billingBusy;
    const anyBusy = anyBillingBusy;
    const run = runBilling;
    const canManage = canManageBilling;

    return (
        <>
            <Show when={workspaceState() && !canManage()}>
                <div class="mb-5 rounded-xl border border-line bg-panel px-4 py-3 text-[13px] text-soft">
                    Only the workspace owner can manage billing. Balances and history are shown
                    read-only.
                </div>
            </Show>
            <Show when={mutationError()}>
                {(err) => (
                    <div class="mb-5 flex items-start justify-between gap-3 rounded-xl border border-fail/40 bg-fail/10 px-4 py-3 text-[13px] text-ink">
                        <span>{err().message}</span>
                        <button
                            class="flex-none font-semibold text-soft hover:text-ink"
                            onClick={dismissBillingError}
                            title="Dismiss"
                        >
                            ✕
                        </button>
                    </div>
                )}
            </Show>
            <PaymentReturnNotice />

            <Section title="Payment">
                <Show
                    when={b()?.hasCustomer}
                    fallback={
                        <p class="text-[12.5px] text-muted">
                            No payment method on file yet. Subscribing to a plan adds one.
                        </p>
                    }
                >
                    <div class="rounded-xl border border-line bg-panel px-4 py-1">
                        <PolicyRow
                            label="Payment method and invoices"
                            hint="Cards, receipts, and past invoices live in the Stripe portal. Cancelling your subscription is there too."
                        >
                            <Button
                                variant="outline"
                                disabled={anyBusy() || !canManage()}
                                onClick={() => void run("portal", () => openPortal("billing"))}
                            >
                                <Show when={busy("portal")}>
                                    <Spinner size={13} tone="current" />
                                </Show>
                                {busy("portal") ? "Opening…" : "Open Stripe portal →"}
                            </Button>
                        </PolicyRow>
                    </div>
                </Show>
            </Section>

            <Show when={b()}>
                {(state) => (
                    <Section title="Credits">
                        {/* the out-of-credits modal links straight here */}
                        <div
                            id="credits"
                            class="scroll-mt-6 rounded-xl border border-line bg-panel px-4 py-3"
                        >
                            <Eyebrow as="div">Balance</Eyebrow>
                            <div class="mt-1 flex items-baseline gap-1.5 tabular-nums">
                                <span class="text-[20px] font-bold">
                                    {state().credits.balance.toLocaleString()}
                                </span>
                                <span class="text-[13px] text-muted">credits banked</span>
                            </div>
                            <div class="mt-1 text-[11px] text-muted">
                                +{state().credits.monthlyGrant.toLocaleString()} from your plan on{" "}
                                {new Date(state().credits.resetAt).toLocaleDateString()}
                            </div>
                            {/* bought credits leave for Checkout rather than changing the
                                subscription, and are charged by quantity at one flat rate */}
                            <Show when={ready() ? state().creditSale : null}>
                                {(sale) => (
                                    <div class="mt-3 border-t border-line pt-3">
                                        <div class="flex flex-wrap items-center gap-1.5">
                                            <For each={sale().presets}>
                                                {(n) => (
                                                    <Button
                                                        variant="tool"
                                                        size="sm"
                                                        disabled={anyBusy() || !canManage()}
                                                        loading={busy(`credits:${n}`)}
                                                        onClick={() =>
                                                            void run(`credits:${n}`, () =>
                                                                startTopUp(n),
                                                            )
                                                        }
                                                    >
                                                        +{n.toLocaleString()} · $
                                                        {(n * sale().usdPerCredit).toFixed(2)}
                                                    </Button>
                                                )}
                                            </For>
                                        </div>
                                        <div class="mt-1.5 text-[11px] text-muted">
                                            ${sale().usdPerCredit.toFixed(2)} a credit. Bought
                                            credits never expire and are not refundable.
                                        </div>
                                    </div>
                                )}
                            </Show>
                            <Show when={!state().creditSale && state().plan === "free"}>
                                <div class="mt-2.5 flex flex-wrap items-center gap-2 text-[11px] text-muted">
                                    <span>
                                        Buying credits is available on {packSellers()}. Pick a plan
                                        to unlock it.
                                    </span>
                                    <UpgradeButton variant="link" label="See plans" />
                                </div>
                            </Show>
                        </div>
                    </Section>
                )}
            </Show>

            <Section title="Credit activity">
                <Show
                    when={ledgerEntries().length}
                    fallback={<p class="text-[12.5px] text-muted">No credit activity yet.</p>}
                >
                    <CreditActivity entries={previewEntries(ledgerEntries())} variant="preview" />
                    <button
                        class="mt-2 text-[12px] font-medium text-soft underline hover:text-ink"
                        onClick={() => navigate("/settings/billing/activity")}
                    >
                        View all
                    </button>
                </Show>
            </Section>
        </>
    );
};
