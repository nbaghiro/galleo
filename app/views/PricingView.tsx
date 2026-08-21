import type { Component } from "solid-js";
import { createMemo, createResource, createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { useSearchParams } from "@solidjs/router";
import type { PlanId } from "@model/billing";
import { PRICED_TOOLS, costRange, isMetered, typicalCost } from "@model/tools";
import { asOrigin } from "@model/analytics";
import { capture } from "@ui/analytics";
import { Badge, Button, Eyebrow, IconButton, Spinner } from "@ui/button";
import { Meter } from "@ui/status";
import { Sidebar, SidebarToggle } from "@app/components/Sidebar";
import { UpgradePageContent } from "@app/components/UpgradePlans";
import { api } from "@app/api";
import {
    billing,
    changePlan,
    checkoutStarted,
    loadBilling,
    openPortal,
    resumePlan,
    startTopUp,
} from "@app/stores/billing";

export const PricingView: Component = () => {
    let openedAt = 0;
    const [params] = useSearchParams();
    onMount(() => {
        void loadBilling();
        openedAt = Date.now();
        capture("pricing_viewed", {
            from: asOrigin(params.from),
            plan_id: billing()?.plan ?? "free",
        });
    });
    // Not a funnel denominator on its own: it needs a page-hide handler and will under-report.
    onCleanup(() => {
        if (!checkoutStarted())
            capture(
                "checkout_abandoned",
                { target_plan: billing()?.plan ?? "free", ms_on_page: Date.now() - openedAt },
                { beacon: true },
            );
    });

    const [ledger] = createResource(() =>
        api
            .getLedger()
            .then((r) => r.entries)
            .catch(() => []),
    );
    // "generate-artifact:settle" → "generate artifact (adjusted)"
    const reasonLabel = (r: string): string =>
        r.replace(":settle", " (adjusted)").replace(/-/g, " ");

    const b = billing;
    const current = (): PlanId => b()?.plan ?? "free";
    const ready = (): boolean => b()?.stripeReady ?? false;
    // a paid plan set to lapse to Free at period end; it keeps running until then
    const pendingCancel = (): boolean => !!b()?.cancelAtPeriodEnd && current() !== "free";

    const creditsLeft = createMemo(() => b()?.credits.balance ?? 0);

    // how many of an action the monthly credit allowance buys
    const perMonth = (cost: number): number | null => {
        const limit = b()?.credits.balance ?? 0;
        return limit > 0 ? Math.floor(limit / cost) : null;
    };

    const overLimit = (): boolean => {
        const u = b()?.usage;
        return !!u && u.maxArtifacts >= 0 && u.artifacts > u.maxArtifacts;
    };

    // keyed by plan id / "resume" / "portal"; checkout and portal redirect away, so pending simply
    // persists until navigation
    const [pending, setPending] = createSignal<string | null>(null);
    const busy = (key: string): boolean => pending() === key;
    const anyBusy = (): boolean => pending() !== null;
    const run = async (key: string, fn: () => Promise<void>): Promise<void> => {
        if (anyBusy()) return;
        setPending(key);
        try {
            await fn();
        } catch {
            // errors surface via the store / reloaded state; just release the button
        } finally {
            setPending(null);
        }
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

                    <Show when={params.status === "success"}>
                        <div class="mb-5 rounded-xl border border-accent/30 bg-accent/10 px-4 py-3 text-[13px] text-ink">
                            Payment received. Your plan updates the moment Stripe confirms it
                            (usually a second or two). Refresh if it still shows the old tier.
                        </div>
                    </Show>
                    <Show when={params.status === "cancel"}>
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
                        <div class="mb-5 flex items-center justify-between gap-3 rounded-xl border border-accent bg-accent/10 px-4 py-3 text-[13px] text-ink">
                            <span>
                                Your last payment failed. Update your payment method to keep your
                                plan.
                            </span>
                            <button
                                class="flex-none inline-flex items-center gap-1.5 rounded-lg border border-line bg-panel px-3 py-1.5 font-semibold hover:border-accent disabled:opacity-60"
                                disabled={anyBusy()}
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
                            <div class="mb-5 flex items-center justify-between gap-3 rounded-xl border border-line bg-panel px-4 py-3 text-[13px] text-ink">
                                <span>
                                    Your plan switches to{" "}
                                    <span class="font-semibold capitalize">{sc().plan}</span>
                                    {sc().seats > 1 ? ` (${sc().seats} seats)` : ""} on{" "}
                                    {new Date(sc().at).toLocaleDateString()}. You keep what you paid
                                    for until then.
                                </span>
                                <button
                                    class="flex-none inline-flex items-center gap-1.5 rounded-lg border border-line bg-canvas px-3 py-1.5 font-semibold hover:border-accent disabled:opacity-60"
                                    disabled={anyBusy()}
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
                        <div class="mb-5 flex items-center justify-between gap-3 rounded-xl border border-line bg-panel px-4 py-3 text-[13px] text-ink">
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
                                disabled={anyBusy()}
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
                                    {/* the grant is the yardstick, not a cap: a full bar means at
                                        least a month's worth is banked, which is the useful read */}
                                    <Meter
                                        value={creditsLeft()}
                                        max={state().credits.monthlyGrant}
                                        trackTone="canvas"
                                        class="mt-2"
                                    />
                                    <div class="mt-1.5 text-[11px] text-muted">
                                        +{state().credits.monthlyGrant.toLocaleString()} on{" "}
                                        {new Date(state().credits.resetAt).toLocaleDateString()} ·
                                        unspent credits carry over
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
                                                        disabled={anyBusy()}
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

                                    {/* add-ons are subscription quantities, so they go through
                                        change-plan the same way a seat change does */}
                                    <Show when={state().addOns.length > 0 && ready()}>
                                        <div class="mt-2.5 flex flex-col gap-1.5">
                                            <For each={state().addOns}>
                                                {(addOn) => {
                                                    const qty = (): number =>
                                                        state().addOnQuantities[addOn.id] ?? 0;
                                                    const key = `addon:${addOn.id}`;
                                                    const set = (n: number): void => {
                                                        void run(key, () =>
                                                            changePlan({
                                                                seats:
                                                                    state().includedSeats +
                                                                    Math.max(0, n),
                                                            }),
                                                        );
                                                    };
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
                                                                size="xs"
                                                                rounded="md"
                                                                bordered
                                                                disabled={anyBusy() || qty() === 0}
                                                                onClick={() => set(qty() - 1)}
                                                                title={`One fewer ${addOn.label}`}
                                                            >
                                                                −
                                                            </IconButton>
                                                            <span class="w-4 text-center font-semibold tabular-nums">
                                                                {qty()}
                                                            </span>
                                                            <IconButton
                                                                size="xs"
                                                                rounded="md"
                                                                bordered
                                                                disabled={anyBusy()}
                                                                onClick={() => set(qty() + 1)}
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

                    <Show when={(ledger() ?? []).length > 0}>
                        <div class="mt-12 rounded-xl border border-line bg-panel px-4 py-3">
                            <Eyebrow as="div">Recent AI activity</Eyebrow>
                            <ul class="mt-1 divide-y divide-line text-[12.5px]">
                                <For each={(ledger() ?? []).slice(0, 8)}>
                                    {(e) => (
                                        <li class="flex items-center justify-between gap-3 py-1.5 tabular-nums">
                                            <span class="min-w-0 truncate capitalize text-ink">
                                                {reasonLabel(e.reason)}
                                            </span>
                                            <span class="flex-none text-muted">
                                                {new Date(e.at).toLocaleDateString()}
                                            </span>
                                            <span
                                                class={`w-14 flex-none text-right font-semibold ${e.delta > 0 ? "text-accent" : "text-ink"}`}
                                            >
                                                {e.delta > 0 ? `+${e.delta}` : e.delta}
                                            </span>
                                        </li>
                                    )}
                                </For>
                            </ul>
                        </div>
                    </Show>

                    <Show when={current() !== "free"}>
                        <button
                            class="mt-6 inline-flex items-center gap-1.5 text-[13px] font-medium text-soft underline hover:text-ink disabled:opacity-60"
                            disabled={anyBusy()}
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
        </div>
    );
};
