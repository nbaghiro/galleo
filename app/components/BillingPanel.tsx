import type { Component } from "solid-js";
import { createSignal, For, Show } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { Button, Eyebrow, Spinner } from "@ui/button";
import { TextField } from "@ui/inputs";
import { Modal } from "@ui/overlay";
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
import { overlayThemeVars } from "@app/stores/theme";

// The Billing tab of workspace settings: where money moves. Payment method and invoices, credit
// top-ups, and the ledger. What the workspace is subscribed to is the sibling Plan tab, PlanPanel.tsx.
// Data loading and the Stripe-return consumption live in the settings shell, which mounts once.

export const BillingPanel: Component = () => {
    const navigate = useNavigate();
    // a pack tile confirms the amount here before it leaves for Stripe checkout, so a click never
    // sends the reader out of the app unexpectedly
    const [pending, setPending] = createSignal<{ credits: number; usd: number } | null>(null);
    // the typed amount beside the presets; a whole number inside the sale's bounds is buyable
    const [custom, setCustom] = createSignal("");
    const customCredits = (bounds: { min: number; max: number }): number | null => {
        const n = Number(custom().replace(/[,\s]/g, ""));
        return custom().trim() && Number.isInteger(n) && n >= bounds.min && n <= bounds.max
            ? n
            : null;
    };
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
                                                            setPending({
                                                                credits: n,
                                                                usd: n * sale().usdPerCredit,
                                                            })
                                                        }
                                                    >
                                                        +{n.toLocaleString()} · $
                                                        {(n * sale().usdPerCredit).toFixed(2)}
                                                    </Button>
                                                )}
                                            </For>
                                        </div>
                                        <div class="mt-2 flex flex-wrap items-center gap-1.5">
                                            <div class="w-40">
                                                <TextField
                                                    compact
                                                    type="number"
                                                    inputmode="numeric"
                                                    min={sale().min}
                                                    max={sale().max}
                                                    step={1}
                                                    placeholder={`${sale().min} to ${sale().max.toLocaleString()}`}
                                                    aria-label="Credits to buy"
                                                    value={custom()}
                                                    onChange={setCustom}
                                                    disabled={anyBusy() || !canManage()}
                                                />
                                            </div>
                                            <Button
                                                variant="tool"
                                                size="sm"
                                                disabled={
                                                    customCredits(sale()) === null ||
                                                    anyBusy() ||
                                                    !canManage()
                                                }
                                                onClick={() => {
                                                    const n = customCredits(sale());
                                                    if (n !== null)
                                                        setPending({
                                                            credits: n,
                                                            usd: n * sale().usdPerCredit,
                                                        });
                                                }}
                                            >
                                                <Show
                                                    when={customCredits(sale())}
                                                    fallback={<>Any amount</>}
                                                >
                                                    {(n) => (
                                                        <>
                                                            +{n().toLocaleString()} · $
                                                            {(n() * sale().usdPerCredit).toFixed(2)}
                                                        </>
                                                    )}
                                                </Show>
                                            </Button>
                                        </div>
                                        <div class="mt-1.5 text-[11px] text-muted">
                                            ${sale().usdPerCredit.toFixed(2)} a credit, any amount
                                            from {sale().min.toLocaleString()} to{" "}
                                            {sale().max.toLocaleString()}. Bought credits never
                                            expire and are not refundable.
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

            <Show when={pending()}>
                {(p) => (
                    <Modal
                        size="sm"
                        scrim="blur"
                        vars={overlayThemeVars()}
                        class="p-5"
                        onClose={() => setPending(null)}
                    >
                        <h2 class="text-[15px] font-semibold text-ink">Buy credits</h2>
                        <p class="mt-1.5 text-[12.5px] leading-relaxed text-soft">
                            {p().credits.toLocaleString()} credits for ${p().usd.toFixed(2)}.
                            Payment is on the next screen. Bought credits never expire and are not
                            refundable.
                        </p>
                        <div class="mt-4 flex items-center justify-end gap-2">
                            <Button variant="outline" size="sm" onClick={() => setPending(null)}>
                                Cancel
                            </Button>
                            <Button
                                variant="primary"
                                size="sm"
                                loading={busy(`credits:${p().credits}`)}
                                onClick={() => {
                                    const n = p().credits;
                                    void run(`credits:${n}`, () => startTopUp(n)).finally(() => {
                                        setPending(null);
                                        setCustom("");
                                    });
                                }}
                            >
                                Go to checkout
                            </Button>
                        </div>
                    </Modal>
                )}
            </Show>
        </>
    );
};
