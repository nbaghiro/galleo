import type { Component } from "solid-js";
import { createMemo, createSignal, For, onMount, Show } from "solid-js";
import { useNavigate, useSearchParams } from "@solidjs/router";
import type { AddOn, PlanId } from "@model/billing";
import { PLAN_ORDER, ROLLOVER_CAP_MONTHS } from "@model/billing";
import { PRICED_TOOLS, costRange, isMetered, typicalCost } from "@model/tools";
import { asOrigin } from "@model/analytics";
import { capture } from "@ui/analytics";
import { Badge, Button, Eyebrow, IconButton, Spinner } from "@ui/button";
import { ConfirmModal } from "@ui/overlay";
import { Meter } from "@ui/status";
import { isCoarsePointer } from "@ui/viewport";
import { CreditActivity, previewEntries } from "@app/components/CreditActivity";
import { Sidebar, SidebarToggle } from "@app/components/Sidebar";
import { UpgradePageContent } from "@app/components/UpgradePlans";
import {
    anyBillingBusy,
    billing,
    billingBusy,
    changePlan,
    dismissBillingError,
    dismissLastChange,
    lastChange,
    ledgerEntries,
    loadBilling,
    loadLedger,
    mutationError,
    openPortal,
    resumePlan,
    runBilling,
    startTopUp,
} from "@app/stores/billing";
import { canManageBilling, loadWorkspace, workspaceState } from "@app/stores/workspace";

export const PricingView: Component = () => {
    const [params] = useSearchParams();
    const navigate = useNavigate();
    // The checkout return status, taken off the URL once so a reload does not re-announce a payment.
    const [payment, setPayment] = createSignal<"plan" | "topup" | "cancel" | null>(null);
    onMount(() => {
        void loadBilling();
        void loadLedger();
        if (!workspaceState()) void loadWorkspace(); // the owner check reads the caller's role
        const status = typeof params.status === "string" ? params.status : undefined;
        const known = ["success", "topup-success", "cancel", "topup-cancel"];
        if (status && known.includes(status)) {
            setPayment(
                status === "success" ? "plan" : status === "topup-success" ? "topup" : "cancel",
            );
            // backing out of a plan Checkout that really started; the cancel URL names the plan it
            // was for. A backed-out pack (topup-cancel) is not a plan abandon and stays uncounted.
            if (status === "cancel") {
                const attempted = PLAN_ORDER.find((p) => p === params.plan);
                capture("checkout_abandoned", attempted ? { target_plan: attempted } : {});
            }
            const url = new URL(window.location.href);
            url.searchParams.delete("status");
            url.searchParams.delete("plan");
            window.history.replaceState(null, "", url);
            // the webhook lands a beat behind the redirect; a few refetches catch it without a reload
            if (status === "success" || status === "topup-success")
                for (const wait of [2000, 5000, 9000])
                    window.setTimeout(() => {
                        void loadBilling();
                        void loadLedger();
                    }, wait);
        }
        capture("pricing_viewed", {
            from: asOrigin(params.from),
            plan_id: billing()?.plan ?? "free",
        });
    });

    const b = billing;
    const current = (): PlanId => b()?.plan ?? "free";
    const ready = (): boolean => b()?.stripeReady ?? false;
    // a paid plan set to lapse to Free at period end; it keeps running until then
    const pendingCancel = (): boolean => !!b()?.cancelAtPeriodEnd && current() !== "free";

    const creditsLeft = createMemo(() => b()?.credits.balance ?? 0);

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

    return (
        <div class="flex h-dvh bg-canvas text-ink">
            <Sidebar />
            <main class="min-w-0 flex-1 overflow-y-auto">
                <SidebarToggle />
                <div class="mx-auto max-w-260 px-5 py-6 md:px-8 md:py-10">
                    <header class="mb-6">
                        <h1 class="text-[26px] font-bold tracking-[-0.02em]">Plans</h1>
                        <p class="mt-1 text-[14px] text-muted">
                            Simple, honest tiers. Upgrade or cancel anytime.
                        </p>
                    </header>

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
                    <Show when={payment() === "plan"}>
                        <div class="mb-5 rounded-xl border border-accent/30 bg-accent/10 px-4 py-3 text-[13px] text-ink">
                            Payment received. Your plan updates the moment Stripe confirms it,
                            usually within a few seconds.
                        </div>
                    </Show>
                    <Show when={payment() === "topup"}>
                        <div class="mb-5 rounded-xl border border-accent/30 bg-accent/10 px-4 py-3 text-[13px] text-ink">
                            Payment received. Your credits are being added and will show in the
                            balance in a moment.
                        </div>
                    </Show>
                    <Show when={payment() === "cancel"}>
                        <div class="mb-5 rounded-xl border border-line bg-panel px-4 py-3 text-[13px] text-soft">
                            Checkout canceled, no charge. You can upgrade whenever you're ready.
                        </div>
                    </Show>
                    <Show when={b() && !ready()}>
                        <div class="mb-5 rounded-xl border border-line bg-panel px-4 py-3 text-[13px] text-soft">
                            Billing isn't configured on this server yet. The plans below are live,
                            but checkout is disabled until the Stripe keys are set.
                        </div>
                    </Show>
                    <Show when={b()?.status === "past_due"}>
                        <div class="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-accent bg-accent/10 px-4 py-3 text-[13px] text-ink">
                            <span>
                                Your last payment failed. Update your payment method to keep your
                                plan.
                            </span>
                            <button
                                class="flex-none inline-flex items-center gap-1.5 rounded-lg border border-line bg-panel px-3 py-1.5 font-semibold hover:border-accent disabled:opacity-60"
                                disabled={anyBusy() || !canManage()}
                                onClick={() => void run("portal", () => openPortal("pricing"))}
                            >
                                <Show when={busy("portal")}>
                                    <Spinner size={13} tone="current" />
                                </Show>
                                {busy("portal") ? "Opening…" : "Update payment →"}
                            </button>
                        </div>
                    </Show>
                    <Show when={b()?.scheduledChange}>
                        {(sc) => (
                            <div class="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-panel px-4 py-3 text-[13px] text-ink">
                                <span>
                                    Your plan switches to{" "}
                                    <span class="font-semibold capitalize">{sc().plan}</span>
                                    {sc().seats > 1 ? ` (${sc().seats} seats)` : ""} on{" "}
                                    {new Date(sc().at).toLocaleDateString()}. You keep what you paid
                                    for until then.
                                </span>
                                <button
                                    class="flex-none inline-flex items-center gap-1.5 rounded-lg border border-line bg-canvas px-3 py-1.5 font-semibold hover:border-accent disabled:opacity-60"
                                    disabled={anyBusy() || !canManage()}
                                    onClick={() => void run("resume", resumePlan)}
                                >
                                    <Show when={busy("resume")}>
                                        <Spinner size={13} tone="current" />
                                    </Show>
                                    {busy("resume") ? "Keeping…" : "Keep current plan"}
                                </button>
                            </div>
                        )}
                    </Show>
                    <Show when={pendingCancel()}>
                        <div class="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-panel px-4 py-3 text-[13px] text-ink">
                            <span>
                                Your <span class="font-semibold capitalize">{current()}</span> plan
                                is set to switch to Free
                                <Show when={b()?.periodEnd}>
                                    {(end) => <> on {new Date(end()).toLocaleDateString()}</>}
                                </Show>
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
                    <Show when={overLimit()}>
                        <div class="mb-5 rounded-xl border border-line bg-panel px-4 py-3 text-[13px] text-ink">
                            You're over your plan's limits. Your existing work is safe, but you
                            can't create more until you upgrade or remove some.
                        </div>
                    </Show>

                    <Show when={b()}>
                        {(state) => (
                            <div class="mb-8 grid grid-cols-2 gap-3 sm:max-w-130">
                                {/* the out-of-credits modal links straight here */}
                                <div
                                    id="credits"
                                    class="scroll-mt-6 rounded-xl border border-line bg-panel px-4 py-3"
                                >
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
                                        unspent credits roll over, up to {ROLLOVER_CAP_MONTHS}{" "}
                                        months of your plan
                                        {state().credits.capped ? " · at the cap now" : ""}
                                    </div>
                                    {/* packs are bought once, so they leave for Checkout rather
                                        than changing the subscription */}
                                    <Show when={state().packs.length > 0 && ready()}>
                                        <div class="mt-2.5 flex flex-wrap items-center gap-1.5">
                                            <For each={state().packs}>
                                                {(pack) => (
                                                    <Button
                                                        variant="tool"
                                                        size="sm"
                                                        disabled={anyBusy() || !canManage()}
                                                        loading={busy(`pack:${pack.id}`)}
                                                        onClick={() =>
                                                            void run(`pack:${pack.id}`, () =>
                                                                startTopUp(pack.id),
                                                            )
                                                        }
                                                    >
                                                        +{pack.credits.toLocaleString()} · $
                                                        {pack.priceUsd}
                                                    </Button>
                                                )}
                                            </For>
                                        </div>
                                    </Show>
                                    <Show when={state().packs.length === 0 && current() === "free"}>
                                        <div class="mt-2.5 text-[11px] text-muted">
                                            Credit packs are available on Pro and Premium. Pick a
                                            plan below to unlock them.
                                        </div>
                                    </Show>

                                    {/* add-ons are subscription quantities, so they go through
                                        change-plan the same way a seat change does */}
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
                                                                {addOn.credits.toLocaleString()} cr
                                                                · ${addOn.priceUsd}/mo
                                                            </span>
                                                            <Show when={busy(key)}>
                                                                <Spinner size={11} tone="current" />
                                                            </Show>
                                                            <IconButton
                                                                size={
                                                                    isCoarsePointer()
                                                                        ? "touch"
                                                                        : "xs"
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
                                                                    isCoarsePointer()
                                                                        ? "touch"
                                                                        : "xs"
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
                                        On the{" "}
                                        <span class="font-semibold capitalize text-ink">
                                            {state().plan}
                                        </span>{" "}
                                        plan
                                        <Show when={state().interval}>
                                            {(iv) => (
                                                <>
                                                    {" · billed "}
                                                    {iv() === "year" ? "annually" : "monthly"}
                                                </>
                                            )}
                                        </Show>
                                        <Show when={state().seats > 1}>
                                            {" · "}
                                            {state().seats} seats
                                        </Show>
                                        <Show when={state().periodEnd}>
                                            {(end) => (
                                                <>
                                                    {" · "}
                                                    {state().cancelAtPeriodEnd ||
                                                    state().status === "canceled"
                                                        ? "ends"
                                                        : "renews"}{" "}
                                                    {new Date(end()).toLocaleDateString()}
                                                </>
                                            )}
                                        </Show>
                                    </div>
                                </div>
                            </div>
                        )}
                    </Show>

                    <UpgradePageContent />

                    <section class="mt-12">
                        <h2 class="text-[16px] font-bold tracking-[-0.01em]">
                            What your credits buy
                        </h2>
                        <p class="mt-0.5 text-[13px] text-muted">
                            Every AI action draws from your monthly credits, and bigger jobs cost
                            more.
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

                    <Show when={ledgerEntries().length > 0}>
                        <section class="mt-12">
                            <div class="flex items-center justify-between gap-3">
                                <Eyebrow as="div">Recent AI activity</Eyebrow>
                                <button
                                    class="text-[12px] font-medium text-soft underline hover:text-ink"
                                    onClick={() => navigate("/pricing/activity")}
                                >
                                    View all
                                </button>
                            </div>
                            <CreditActivity
                                entries={previewEntries(ledgerEntries())}
                                variant="preview"
                                class="mt-2"
                            />
                        </section>
                    </Show>

                    {/* any workspace with a customer keeps its invoice history, churned included */}
                    <Show when={b()?.hasCustomer}>
                        <button
                            class="mt-6 inline-flex items-center gap-1.5 text-[13px] font-medium text-soft underline hover:text-ink disabled:opacity-60"
                            disabled={anyBusy() || !canManage()}
                            onClick={() => void run("portal", () => openPortal("pricing"))}
                        >
                            <Show when={busy("portal")}>
                                <Spinner size={13} tone="line" />
                            </Show>
                            {busy("portal")
                                ? "Opening portal…"
                                : "Manage billing / cancel in the Stripe portal →"}
                        </button>
                    </Show>
                </div>
            </main>
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
        </div>
    );
};
