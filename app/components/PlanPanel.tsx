import type { Component } from "solid-js";
import { createMemo, createSignal, For, Show } from "solid-js";
import type { AddOn, PlanId } from "@model/billing";
import { ROLLOVER_CAP_MONTHS } from "@model/billing";
import { PRICED_TOOLS, costRange, isMetered, typicalCost } from "@model/tools";
import { Badge, Eyebrow, IconButton, Spinner } from "@ui/button";
import { ConfirmModal } from "@ui/overlay";
import { Meter } from "@ui/status";
import { isCoarsePointer } from "@ui/viewport";
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
    openPortal,
    resumePlan,
    runBilling,
} from "@app/stores/billing";
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
        return limit > 0 ? Math.floor(limit / cost) : null;
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

    // Stepping a seat invoices real money, so it asks first; the modal quotes the catalog's numbers.
    const [seatConfirm, setSeatConfirm] = createSignal<{ addOn: AddOn; next: number } | null>(null);
    const applySeatConfirm = (): void => {
        const pick = seatConfirm();
        const included = b()?.includedSeats;
        if (!pick || included === undefined) return;
        setSeatConfirm(null);
        void run(`addon:${pick.addOn.id}`, () =>
            changePlan({ seats: included + Math.max(0, pick.next) }),
        );
    };
    const seatAdding = (): boolean => {
        const pick = seatConfirm();
        return !!pick && pick.next > (b()?.addOnQuantities[pick.addOn.id] ?? 0);
    };

    const CHANGE_COPY: Record<string, string> = {
        upgraded: "Your upgrade is active.",
        changed: "Your plan change is applied.",
        scheduled:
            "Your change is scheduled for the end of the billing period. You keep your current plan until then.",
        cancel_at_period_end: "Your plan switches to Free at the end of the billing period.",
    };

    const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

    // a state row inside the current-plan card: the sentence and the one action that resolves it
    const StateRow: Component<{
        text: string;
        action: string;
        actingLabel: string;
        busyKey: string;
        onAct: () => void;
        tone?: "accent";
    }> = (props) => (
        <div
            class={`flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3 text-[13px] ${
                props.tone === "accent" ? "bg-accent/10" : ""
            }`}
        >
            <span>{props.text}</span>
            <button
                class="flex-none inline-flex items-center gap-1.5 rounded-lg border border-line bg-canvas px-3 py-1.5 font-semibold hover:border-accent disabled:opacity-60"
                disabled={anyBusy() || !canManage()}
                onClick={props.onAct}
            >
                <Show when={busy(props.busyKey)}>
                    <Spinner size={13} tone="current" />
                </Show>
                {busy(props.busyKey) ? props.actingLabel : props.action}
            </button>
        </div>
    );

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
                                                    {state().cancelAtPeriodEnd ||
                                                    state().status === "canceled"
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
                                {/* add-ons are subscription quantities, so they go through
                                    change-plan the same way a plan change does */}
                                <Show when={state().addOns.length > 0 && ready()}>
                                    <div class="mt-2.5 flex flex-col gap-1.5">
                                        <For each={state().addOns}>
                                            {(addOn) => {
                                                const qty = (): number =>
                                                    state().addOnQuantities[addOn.id] ?? 0;
                                                const key = `addon:${addOn.id}`;
                                                return (
                                                    <div class="flex items-center gap-1.5 text-[11.5px]">
                                                        <span class="flex-1 truncate text-soft">
                                                            {addOn.label} · +
                                                            {addOn.credits.toLocaleString()} cr · $
                                                            {addOn.priceUsd}/mo
                                                        </span>
                                                        <Show when={busy(key)}>
                                                            <Spinner size={11} tone="current" />
                                                        </Show>
                                                        <IconButton
                                                            size={
                                                                isCoarsePointer() ? "touch" : "xs"
                                                            }
                                                            rounded="md"
                                                            bordered
                                                            disabled={
                                                                anyBusy() ||
                                                                !canManage() ||
                                                                qty() === 0
                                                            }
                                                            onClick={() =>
                                                                setSeatConfirm({
                                                                    addOn,
                                                                    next: qty() - 1,
                                                                })
                                                            }
                                                            title={`One fewer ${addOn.label}`}
                                                        >
                                                            −
                                                        </IconButton>
                                                        <span class="w-4 text-center font-semibold tabular-nums">
                                                            {qty()}
                                                        </span>
                                                        <IconButton
                                                            size={
                                                                isCoarsePointer() ? "touch" : "xs"
                                                            }
                                                            rounded="md"
                                                            bordered
                                                            disabled={anyBusy() || !canManage()}
                                                            onClick={() =>
                                                                setSeatConfirm({
                                                                    addOn,
                                                                    next: qty() + 1,
                                                                })
                                                            }
                                                            title={`One more ${addOn.label}`}
                                                        >
                                                            +
                                                        </IconButton>
                                                    </div>
                                                );
                                            }}
                                        </For>
                                    </div>
                                </Show>
                            </div>

                            <Show when={state().status === "past_due"}>
                                <StateRow
                                    text="Your last payment failed. Update your payment method to keep your plan."
                                    action="Update payment →"
                                    actingLabel="Opening…"
                                    busyKey="portal"
                                    tone="accent"
                                    onAct={() => void run("portal", () => openPortal("plan"))}
                                />
                            </Show>
                            <Show when={state().scheduledChange}>
                                {(sc) => (
                                    <StateRow
                                        text={`Your plan switches to ${cap(sc().plan)}${
                                            sc().seats > 1 ? ` (${sc().seats} seats)` : ""
                                        } on ${new Date(
                                            sc().at,
                                        ).toLocaleDateString()}. You keep what you paid for until then.`}
                                        action="Keep current plan"
                                        actingLabel="Keeping…"
                                        busyKey="resume"
                                        onAct={() => void run("resume", resumePlan)}
                                    />
                                )}
                            </Show>
                            <Show when={pendingCancel()}>
                                <StateRow
                                    text={`Your ${cap(state().plan)} plan is set to switch to Free${
                                        state().periodEnd
                                            ? ` on ${new Date(state().periodEnd!).toLocaleDateString()}`
                                            : ""
                                    }. You keep everything until then.`}
                                    action="Resume plan"
                                    actingLabel="Resuming…"
                                    busyKey="resume"
                                    onAct={() => void run("resume", resumePlan)}
                                />
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

            <section class="mt-12">
                <h2 class="text-[16px] font-bold tracking-[-0.01em]">What your credits buy</h2>
                <p class="mt-0.5 text-[13px] text-muted">
                    Every AI action draws from your monthly credits, and bigger jobs cost more.
                </p>
                <div class="mt-4 overflow-hidden rounded-xl border border-line bg-panel">
                    <For each={PRICED_TOOLS}>
                        {(a, i) => {
                            const r = costRange(a.id);
                            const cost = r.min === r.max ? `${r.min}` : `${r.min}–${r.max}`;
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
                                            <Show when={!a.live}>
                                                <Badge
                                                    tone="outline"
                                                    size="xs"
                                                    uppercase
                                                    weight="medium"
                                                >
                                                    soon
                                                </Badge>
                                            </Show>
                                        </div>
                                        <div class="truncate text-[12px] text-muted">
                                            {a.summary}
                                        </div>
                                    </div>
                                    <div class="flex-none text-right tabular-nums">
                                        <div class="text-[13px] font-semibold text-ink">
                                            {cost}{" "}
                                            <span class="text-[11px] font-normal text-muted">
                                                {r.max === 1 ? "credit" : "credits"}
                                            </span>
                                        </div>
                                        <Show when={perMonth(typicalCost(a.id))}>
                                            {(n) => (
                                                <div class="text-[11px] text-muted">≈{n()}/mo</div>
                                            )}
                                        </Show>
                                    </div>
                                </div>
                            );
                        }}
                    </For>
                </div>
            </section>

            <Show when={seatConfirm()}>
                {(pick) => (
                    <ConfirmModal
                        title={seatAdding() ? "Add a seat?" : "Remove a seat?"}
                        body={
                            seatAdding()
                                ? `One more seat costs $${pick().addOn.priceUsd} a month and adds ${pick().addOn.credits.toLocaleString()} credits to each monthly grant. The seat is invoiced now.`
                                : "One fewer seat from the end of the billing period. You keep what you paid for until then."
                        }
                        confirmLabel={seatAdding() ? "Add the seat" : "Remove the seat"}
                        onConfirm={applySeatConfirm}
                        onCancel={() => setSeatConfirm(null)}
                    />
                )}
            </Show>
        </>
    );
};
