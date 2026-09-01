import type { Component } from "solid-js";
import { createSignal, For, Show } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { Button, Eyebrow, Spinner } from "@ui/button";
import { TextField } from "@ui/inputs";
import {
    isCreditQuantity,
    MAX_CREDIT_PURCHASE,
    MIN_CREDIT_PURCHASE,
    visiblePlans,
} from "@model/billing";
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
import { canManageBilling, updateWorkspaceSettings, workspaceState } from "@app/stores/workspace";

// The Billing tab of workspace settings: where money moves. Payment method and invoices, credit
// top-ups, the ledger, and spending controls. What the workspace is subscribed to is the sibling
// Plan tab, PlanPanel.tsx.
// Data loading and the Stripe-return consumption live in the settings shell, which mounts once.

export const BillingPanel: Component = () => {
    const navigate = useNavigate();
    const packSellers = (): string =>
        visiblePlans()
            .filter((p) => p.billing.sellsCredits)
            .map((p) => p.name)
            .join(" and ");

    const b = billing;
    const ready = (): boolean => b()?.stripeReady ?? false;
    const busy = billingBusy;
    const anyBusy = anyBillingBusy;
    const run = runBilling;
    const canManage = canManageBilling;

    const st = workspaceState;
    const isAdmin = (): boolean => (st()?.role ?? "member") !== "member";
    const memberCap = (): number | null => st()?.workspace.memberCreditCap ?? null;

    // members worth listing against the pool: anyone who spent, or anyone the cap measures
    const spenders = (): { name: string; spend: number; capped: boolean }[] =>
        (st()?.members ?? [])
            .filter((m) => m.spend != null && (m.spend > 0 || memberCap() != null))
            .map((m) => ({
                name: m.name ?? m.email,
                spend: m.spend ?? 0,
                capped: memberCap() != null && m.role === "member",
            }));

    // how many credits the custom field is asking for; presets do not go through it
    const [custom, setCustom] = createSignal("");

    // the cap has a field, so it saves on submit rather than on change like the dropdowns
    const [cap, setCap] = createSignal<string | null>(null);
    const storedCap = (): string => {
        const n = memberCap();
        return n == null ? "" : String(n);
    };
    const capValue = (): string => cap() ?? storedCap();
    const capDirty = (): boolean => cap() !== null && cap() !== storedCap();
    const submitCap = async (e: Event): Promise<void> => {
        e.preventDefault();
        if (!capDirty()) return;
        const raw = capValue().trim();
        const n = Number(raw);
        if (raw && (!Number.isFinite(n) || n < 0)) return;
        await updateWorkspaceSettings({ memberCreditCap: raw ? Math.trunc(n) : null }).catch(
            () => {},
        );
        setCap(null);
    };

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
            <Show when={b()?.status === "past_due"}>
                <div class="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-fail/40 bg-fail/10 px-4 py-3 text-[13px] text-ink">
                    <span>Payment failed. Update your card to keep your plan.</span>
                    <Button
                        variant="outline"
                        disabled={anyBusy() || !canManage()}
                        onClick={() => void run("portal", () => openPortal("billing"))}
                    >
                        <Show when={busy("portal")}>
                            <Spinner size={13} tone="current" />
                        </Show>
                        {busy("portal") ? "Opening…" : "Update payment →"}
                    </Button>
                </div>
            </Show>

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
                                {new Date(state().credits.resetAt).toLocaleDateString()} · you used{" "}
                                {state().credits.mySpend.toLocaleString()} this cycle
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
                                            <form
                                                class="flex items-center gap-1.5"
                                                onSubmit={(e) => {
                                                    e.preventDefault();
                                                    const n = Number(custom());
                                                    if (!isCreditQuantity(n) || anyBusy()) return;
                                                    void run(`credits:custom`, () => startTopUp(n));
                                                }}
                                            >
                                                <TextField
                                                    type="number"
                                                    min={MIN_CREDIT_PURCHASE}
                                                    max={MAX_CREDIT_PURCHASE}
                                                    class="w-24"
                                                    placeholder="Amount"
                                                    aria-label="Credits to buy"
                                                    value={custom()}
                                                    onChange={setCustom}
                                                />
                                                <Button
                                                    type="submit"
                                                    variant="outline"
                                                    size="sm"
                                                    disabled={
                                                        anyBusy() ||
                                                        !canManage() ||
                                                        !isCreditQuantity(Number(custom()))
                                                    }
                                                    loading={busy("credits:custom")}
                                                >
                                                    Buy
                                                </Button>
                                            </form>
                                        </div>
                                        <div class="mt-1.5 text-[11px] text-muted">
                                            ${sale().usdPerCredit.toFixed(2)} a credit, from{" "}
                                            {MIN_CREDIT_PURCHASE.toLocaleString()} to{" "}
                                            {MAX_CREDIT_PURCHASE.toLocaleString()}. Bought credits
                                            never expire.
                                            <Show when={isCreditQuantity(Number(custom()))}>
                                                {" "}
                                                {Number(custom()).toLocaleString()} credits costs $
                                                {(Number(custom()) * sale().usdPerCredit).toFixed(
                                                    2,
                                                )}
                                                .
                                            </Show>
                                        </div>
                                    </div>
                                )}
                            </Show>
                            <Show when={!state().creditSale && state().plan === "free"}>
                                {/* the sellers are read off the catalog, not written into copy */}
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

            <Show when={isAdmin()}>
                <Section title="Spending">
                    <div class="rounded-xl border border-line bg-panel px-4 py-1">
                        <PolicyRow
                            label="Credit limit per member"
                            hint="The most one member can spend from the shared pool each cycle. Admins are never limited. Leave it empty for no limit."
                        >
                            <form class="flex items-center gap-2" onSubmit={submitCap}>
                                <TextField
                                    type="number"
                                    min={0}
                                    class="w-28"
                                    placeholder="No limit"
                                    aria-label="Credit limit per member"
                                    value={capValue()}
                                    onChange={setCap}
                                />
                                <Button type="submit" variant="outline" disabled={!capDirty()}>
                                    Save
                                </Button>
                            </form>
                        </PolicyRow>
                        <Show when={spenders().length}>
                            <div class="border-t border-line py-3">
                                <Eyebrow as="div" class="mb-1.5">
                                    Spent this cycle
                                </Eyebrow>
                                <For each={spenders()}>
                                    {(m) => (
                                        <div class="flex items-center justify-between gap-3 py-0.5 text-[12px]">
                                            <span class="min-w-0 truncate text-soft">{m.name}</span>
                                            <span class="flex-none tabular-nums text-muted">
                                                {m.spend.toLocaleString()}
                                                {m.capped
                                                    ? ` / ${memberCap()!.toLocaleString()}`
                                                    : ""}{" "}
                                                cr
                                            </span>
                                        </div>
                                    )}
                                </For>
                            </div>
                        </Show>
                    </div>
                </Section>
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
