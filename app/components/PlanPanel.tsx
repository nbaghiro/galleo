import type { Component } from "solid-js";
import { createMemo, createSignal, For, Show } from "solid-js";
import type { PlanId } from "@model/billing";
import { clampSeats, planFor, ROLLOVER_CAP_MONTHS, sellsSeats } from "@model/billing";
import { PRICED_TOOLS, isMetered, typicalCost } from "@model/tools";
import { Badge, Button, Eyebrow, Spinner } from "@ui/button";
import { TextField } from "@ui/inputs";
import { ConfirmModal } from "@ui/overlay";
import { Meter } from "@ui/status";
import { PaymentReturnNotice, SettingsSection as Section } from "./settings";
import { UpgradePageContent } from "./UpgradePlans";
import {
    anyBillingBusy,
    billing,
    billingBusy,
    changePlan,
    dismissBillingError,
    dismissLastChange,
    lastChange,
    mutationError,
    resumePlan,
    runBilling,
} from "@app/stores/billing";
import { catalogueReady, unitPrices } from "@app/stores/model-usage";
import { canManageBilling, workspaceState } from "@app/stores/workspace";

// The Plan tab of workspace settings: what the workspace is subscribed to and how to change it.
// Money movement (portal, packs, the ledger) is the sibling Billing tab, BillingPanel.tsx.
// Data loading and the Stripe-return consumption live in the settings shell, which mounts once.

export const PlanPanel: Component = () => {
    const b = billing;
    const current = (): PlanId => b()?.plan ?? "free";
    const ready = (): boolean => b()?.stripeReady ?? false;
    // a paid plan set to lapse to Free at period end; it keeps running until then
    const pendingCancel = (): boolean => !!b()?.cancelAtPeriodEnd && current() !== "free";

    const creditsLeft = createMemo(() => b()?.credits.balance ?? 0);
    const seatsUsed = createMemo(
        () => (workspaceState()?.members.length ?? 0) + (workspaceState()?.invites.length ?? 0),
    );

    // how many of an action the monthly credit allowance buys
    const perMonth = (cost: number): number | null => {
        const limit = b()?.credits.monthlyGrant ?? 0;
        return limit > 0 && cost > 0 ? Math.floor(limit / cost) : null;
    };

    const overLimit = (): boolean => {
        const u = b()?.usage;
        return !!u && u.maxArtifacts >= 0 && u.artifacts > u.maxArtifacts;
    };

    const busy = billingBusy;
    const anyBusy = anyBillingBusy;
    const run = runBilling;
    const canManage = canManageBilling;

    // the billing-route hints name a different path on this same page, so translate them here
    const errorHint = (): string | null => {
        const r = mutationError()?.remedies;
        if (r?.useChangePlan)
            return "You already have a subscription. Change it with the plan buttons below.";
        if (r?.useCheckout)
            return "There is no active subscription yet. Pick a plan below to subscribe.";
        return null;
    };

    // Seats are the subscription's quantity. Adding invoices real money now, so it asks first;
    // removing waits for nobody and is a proration credit.
    const [seatDraft, setSeatDraft] = createSignal<string | null>(null);
    const [seatConfirm, setSeatConfirm] = createSignal<number | null>(null);
    const seatsNow = (): number => b()?.seats ?? 1;
    const seatValue = (): string => seatDraft() ?? String(seatsNow());
    const seatTarget = (): number => clampSeats(current(), Number(seatValue()) || seatsNow());
    const seatDirty = (): boolean => seatTarget() !== seatsNow();
    const applySeats = (next: number): void => {
        setSeatConfirm(null);
        setSeatDraft(null);
        void run("seats", () => changePlan({ seats: next }));
    };
    const submitSeats = (e: Event): void => {
        e.preventDefault();
        if (!seatDirty()) return;
        if (seatTarget() > seatsNow()) setSeatConfirm(seatTarget());
        else applySeats(seatTarget());
    };
    const seatPrice = (): number => {
        const p = planFor(current()).billing;
        return b()?.interval === "year" ? p.priceAnnualMonthly : p.priceMonthly;
    };

    const CHANGE_COPY: Record<string, string> = {
        upgraded: "Your upgrade is active.",
        changed: "Your plan change is applied.",
        cancel_at_period_end: "Your plan switches to Free at the end of the billing period.",
    };

    const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

    return (
        <>
            <Show when={workspaceState() && !canManage()}>
                <div class="mb-5 rounded-xl border border-line bg-panel px-4 py-3 text-[13px] text-soft">
                    Only the workspace owner can change billing. Plans and usage are shown
                    read-only.
                </div>
            </Show>
            <Show when={mutationError()}>
                {(err) => (
                    <div class="mb-5 flex items-start justify-between gap-3 rounded-xl border border-fail/40 bg-fail/10 px-4 py-3 text-[13px] text-ink">
                        <span>
                            {err().message}
                            <Show when={errorHint()}>
                                {(hint) => <span class="text-soft"> {hint()}</span>}
                            </Show>
                        </span>
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
            <Show when={lastChange()}>
                {(effect) => (
                    <div class="mb-5 flex items-start justify-between gap-3 rounded-xl border border-accent/30 bg-accent/10 px-4 py-3 text-[13px] text-ink">
                        <span>{CHANGE_COPY[effect()] ?? "Your plan is updated."}</span>
                        <button
                            class="flex-none font-semibold text-soft hover:text-ink"
                            onClick={dismissLastChange}
                            title="Dismiss"
                        >
                            ✕
                        </button>
                    </div>
                )}
            </Show>
            <PaymentReturnNotice />
            <Show when={b() && !ready()}>
                <div class="mb-5 rounded-xl border border-line bg-panel px-4 py-3 text-[13px] text-soft">
                    Billing isn't configured on this server yet. The plans below are live, but
                    checkout is disabled until the Stripe keys are set.
                </div>
            </Show>
            <Show when={overLimit()}>
                <div class="mb-5 rounded-xl border border-line bg-panel px-4 py-3 text-[13px] text-ink">
                    You're over your plan's limits. Your existing work is safe, but you can't create
                    more until you upgrade or remove some.
                </div>
            </Show>

            <Show when={b()}>
                {(state) => (
                    <Section title="Current plan">
                        <div class="overflow-hidden rounded-xl border border-line bg-panel">
                            <div class="px-4 py-3">
                                <div class="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                                    <span class="text-[20px] font-bold capitalize">
                                        {state().plan}
                                    </span>
                                    <span class="text-[12px] text-muted">
                                        <Show when={state().interval}>
                                            {(iv) => (
                                                <>
                                                    billed{" "}
                                                    {iv() === "year" ? "annually" : "monthly"}
                                                </>
                                            )}
                                        </Show>
                                        <Show when={state().periodEnd}>
                                            {(end) => (
                                                <>
                                                    {state().interval ? " · " : ""}
                                                    {state().cancelAtPeriodEnd
                                                        ? "ends"
                                                        : "renews"}{" "}
                                                    {new Date(end()).toLocaleDateString()}
                                                </>
                                            )}
                                        </Show>
                                    </span>
                                </div>
                                <div class="mt-1 text-[11.5px] text-muted">
                                    +{state().credits.monthlyGrant.toLocaleString()} credits each
                                    cycle
                                    <Show when={state().seats > 1}>
                                        {" · "}
                                        {seatsUsed()} of {state().seats} seats used
                                    </Show>
                                </div>
                                {/* seats are the subscription's quantity, so they change through
                                    change-plan the same way a plan change does */}
                                <Show when={sellsSeats(state().plan) && ready()}>
                                    <form
                                        class="mt-2.5 flex flex-wrap items-center gap-2 text-[11.5px]"
                                        onSubmit={submitSeats}
                                    >
                                        <span class="text-soft">
                                            Seats · ${seatPrice()} each a month, +
                                            {planFor(
                                                state().plan,
                                            ).ai.creditsPerSeat.toLocaleString()}{" "}
                                            credits each
                                        </span>
                                        <TextField
                                            type="number"
                                            min={planFor(state().plan).billing.minSeats}
                                            max={planFor(state().plan).billing.maxSeats}
                                            class="w-16"
                                            aria-label="Seats"
                                            value={seatValue()}
                                            onChange={setSeatDraft}
                                        />
                                        <Button
                                            type="submit"
                                            variant="outline"
                                            size="sm"
                                            disabled={!seatDirty() || anyBusy() || !canManage()}
                                            loading={busy("seats")}
                                        >
                                            Update seats
                                        </Button>
                                    </form>
                                </Show>
                            </div>

                            <Show when={pendingCancel()}>
                                <div class="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3 text-[13px]">
                                    <span>
                                        Your {cap(state().plan)} plan is set to switch to Free
                                        {state().periodEnd
                                            ? ` on ${new Date(state().periodEnd!).toLocaleDateString()}`
                                            : ""}
                                        . You keep everything until then.
                                    </span>
                                    <button
                                        class="flex-none inline-flex items-center gap-1.5 rounded-lg border border-line bg-canvas px-3 py-1.5 font-semibold hover:border-accent disabled:opacity-60"
                                        disabled={anyBusy() || !canManage()}
                                        onClick={() => void run("resume", resumePlan)}
                                    >
                                        <Show when={busy("resume")}>
                                            <Spinner size={13} tone="current" />
                                        </Show>
                                        {busy("resume") ? "Resuming…" : "Resume plan"}
                                    </button>
                                </div>
                            </Show>
                        </div>
                    </Section>
                )}
            </Show>

            <Show when={b()}>
                {(state) => (
                    <Section title="Usage">
                        <div class="grid grid-cols-2 gap-3 sm:max-w-130">
                            <div class="rounded-xl border border-line bg-panel px-4 py-3">
                                <Eyebrow as="div">AI credits left</Eyebrow>
                                <div class="mt-1 flex items-baseline gap-1.5 tabular-nums">
                                    <span class="text-[20px] font-bold">
                                        {creditsLeft().toLocaleString()}
                                    </span>
                                    <span class="text-[13px] text-muted">banked</span>
                                </div>
                                <Meter
                                    value={creditsLeft()}
                                    max={state().credits.rolloverCap}
                                    trackTone="canvas"
                                    class="mt-2"
                                />
                                <div class="mt-1.5 text-[11px] text-muted">
                                    +{state().credits.monthlyGrant.toLocaleString()} on{" "}
                                    {new Date(state().credits.resetAt).toLocaleDateString()} ·
                                    unspent credits roll over, up to {ROLLOVER_CAP_MONTHS} months of
                                    your plan
                                    {state().credits.capped ? " · at the cap now" : ""}
                                </div>
                            </div>
                            <div class="rounded-xl border border-line bg-panel px-4 py-3">
                                <Eyebrow as="div">Artifacts</Eyebrow>
                                <div class="mt-1 flex items-baseline gap-1.5 tabular-nums">
                                    <span class="text-[20px] font-bold">
                                        {state().usage.artifacts}
                                    </span>
                                    <span class="text-[13px] text-muted">
                                        {state().usage.maxArtifacts < 0
                                            ? "/ ∞"
                                            : `/ ${state().usage.maxArtifacts}`}
                                    </span>
                                </div>
                                <div class="mt-2 text-[11.5px] text-muted">
                                    {state().usage.storageMb} MB
                                    {state().usage.maxStorageMb < 0
                                        ? " / ∞"
                                        : ` / ${state().usage.maxStorageMb} MB`}{" "}
                                    of storage used
                                </div>
                            </div>
                        </div>
                    </Section>
                )}
            </Show>

            <UpgradePageContent />

            {/* the prices arrive with /features; before that a cost would read as the one-credit floor */}
            <Show when={catalogueReady()}>
                <section class="mt-12">
                    <h2 class="text-[16px] font-bold tracking-[-0.01em]">What your credits buy</h2>
                    <p class="mt-0.5 text-[13px] text-muted">
                        Every AI action draws from your monthly credits, priced at the models you
                        run it on. A typical run is shown; one that scales costs more the bigger the
                        job.
                    </p>
                    <div class="mt-4 overflow-hidden rounded-xl border border-line bg-panel">
                        <For each={PRICED_TOOLS}>
                            {(a, i) => {
                                const cost = (): number => typicalCost(a.id, unitPrices());
                                return (
                                    <div
                                        class={`flex items-center gap-3 px-4 py-2.5 ${
                                            i() > 0 ? "border-t border-line" : ""
                                        }`}
                                    >
                                        <div class="min-w-0 flex-1">
                                            <div class="flex items-center gap-2">
                                                <span class="text-[13px] font-medium text-ink">
                                                    {a.title}
                                                </span>
                                                <Show when={isMetered(a.id)}>
                                                    <Badge
                                                        tone="muted"
                                                        size="xs"
                                                        uppercase
                                                        weight="medium"
                                                    >
                                                        scales
                                                    </Badge>
                                                </Show>
                                            </div>
                                            <div class="truncate text-[12px] text-muted">
                                                {a.summary}
                                            </div>
                                        </div>
                                        <div class="flex-none text-right tabular-nums">
                                            <div class="text-[13px] font-semibold text-ink">
                                                {cost()}{" "}
                                                <span class="text-[11px] font-normal text-muted">
                                                    {cost() === 1 ? "credit" : "credits"}
                                                </span>
                                            </div>
                                            <Show when={perMonth(cost())}>
                                                {(n) => (
                                                    <div class="text-[11px] text-muted">
                                                        ≈{n()}/mo
                                                    </div>
                                                )}
                                            </Show>
                                        </div>
                                    </div>
                                );
                            }}
                        </For>
                    </div>
                </section>
            </Show>

            <Show when={seatConfirm()}>
                {(next) => (
                    <ConfirmModal
                        title="Add seats?"
                        body={`${next() - seatsNow()} more ${next() - seatsNow() === 1 ? "seat costs" : "seats cost"} $${seatPrice() * (next() - seatsNow())} a month and ${next() - seatsNow() === 1 ? "adds" : "add"} ${(planFor(current()).ai.creditsPerSeat * (next() - seatsNow())).toLocaleString()} credits to each monthly grant. The difference is invoiced now, and the credits land now.`}
                        confirmLabel="Add the seats"
                        onConfirm={() => applySeats(next())}
                        onCancel={() => setSeatConfirm(null)}
                    />
                )}
            </Show>
        </>
    );
};
