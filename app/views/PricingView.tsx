import type { Component } from "solid-js";
import { createMemo, For, onMount, Show } from "solid-js";
import { useSearchParams } from "@solidjs/router";
import type { PlanId } from "@model/billing";
import { AI_ACTION_LIST, costRange, isMetered, typicalCost } from "@model/ai-actions";
import { CheckIcon } from "../components/icons";
import { Sidebar } from "../components/Sidebar";
import { billing, loadBilling, openPortal, startCheckout } from "../stores/billing";

// The pricing / upgrade page (/pricing). Renders the plan catalog straight from the backend's
// @model/billing source of truth, shows the workspace's live usage, and hands off to Stripe Checkout /
// the customer portal. Reachable from the sidebar plan badge and from any paywall (a 402 → here).
export const PricingView: Component = () => {
    const [params] = useSearchParams();
    onMount(loadBilling);

    const b = billing;
    const current = (): PlanId => b()?.plan ?? "free";
    const ready = (): boolean => b()?.stripeReady ?? false;

    const usagePct = createMemo(() => {
        const c = b()?.credits;
        if (!c || c.limit <= 0) return 0;
        return Math.min(100, Math.round((c.used / c.limit) * 100));
    });

    // "≈N/mo" — how many of an action this workspace's monthly credit allowance buys.
    const perMonth = (cost: number): number | null => {
        const limit = b()?.credits.limit ?? 0;
        return limit > 0 ? Math.floor(limit / cost) : null;
    };

    const pick = (plan: PlanId): void => {
        if (plan === "free") openPortal().catch(() => {});
        else startCheckout(plan).catch(() => {});
    };

    const ctaLabel = (plan: PlanId): string => {
        if (plan === current()) return "Current plan";
        if (plan === "free") return "Manage / downgrade";
        return `Upgrade to ${plan === "pro" ? "Pro" : "Business"}`;
    };

    return (
        <div class="flex h-screen bg-canvas text-ink">
            <Sidebar />
            <main class="min-w-0 flex-1 overflow-y-auto">
                <div class="mx-auto max-w-[1040px] px-8 py-10">
                    <header class="mb-6">
                        <h1 class="text-[26px] font-bold tracking-[-0.02em]">Plans</h1>
                        <p class="mt-1 text-[14px] text-muted">
                            Simple, honest tiers. Upgrade or cancel anytime.
                        </p>
                    </header>

                    <Show when={params.status === "success"}>
                        <div class="mb-5 rounded-xl border border-accent/30 bg-accent/10 px-4 py-3 text-[13px] text-ink">
                            🎉 Payment received — your plan updates the moment Stripe confirms it
                            (usually a second or two). Refresh if it still shows the old tier.
                        </div>
                    </Show>
                    <Show when={params.status === "cancel"}>
                        <div class="mb-5 rounded-xl border border-line bg-panel px-4 py-3 text-[13px] text-soft">
                            Checkout canceled — no charge. You can upgrade whenever you're ready.
                        </div>
                    </Show>
                    <Show when={b() && !ready()}>
                        <div class="mb-5 rounded-xl border border-line bg-panel px-4 py-3 text-[13px] text-soft">
                            Billing isn't configured on this server yet — the plans below are live,
                            but checkout is disabled until the Stripe keys are set.
                        </div>
                    </Show>

                    {/* usage */}
                    <Show when={b()}>
                        {(state) => (
                            <div class="mb-8 grid grid-cols-2 gap-3 sm:max-w-[520px]">
                                <div class="rounded-xl border border-line bg-panel px-4 py-3">
                                    <div class="font-mono text-[10px] uppercase tracking-[0.12em] text-muted">
                                        AI credits this month
                                    </div>
                                    <div class="mt-1 flex items-baseline gap-1.5 tabular-nums">
                                        <span class="text-[20px] font-bold">
                                            {state().credits.used}
                                        </span>
                                        <span class="text-[13px] text-muted">
                                            / {state().credits.limit}
                                        </span>
                                    </div>
                                    <div class="mt-2 h-1.5 overflow-hidden rounded-full bg-canvas">
                                        <div
                                            class="h-full rounded-full bg-accent transition-all"
                                            style={{ width: `${usagePct()}%` }}
                                        />
                                    </div>
                                </div>
                                <div class="rounded-xl border border-line bg-panel px-4 py-3">
                                    <div class="font-mono text-[10px] uppercase tracking-[0.12em] text-muted">
                                        Artifacts
                                    </div>
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
                                    </div>
                                </div>
                            </div>
                        )}
                    </Show>

                    {/* plan cards */}
                    <div class="grid gap-4 md:grid-cols-3">
                        <For each={b()?.catalog ?? []}>
                            {(plan) => {
                                const isCurrent = (): boolean => plan.id === current();
                                const featured = plan.id === "pro";
                                return (
                                    <div
                                        class={`flex flex-col rounded-2xl border p-5 ${
                                            featured
                                                ? "border-accent shadow-lg"
                                                : "border-line bg-panel"
                                        }`}
                                    >
                                        <div class="flex items-center justify-between">
                                            <span class="text-[15px] font-bold">{plan.name}</span>
                                            <Show when={featured}>
                                                <span class="rounded-full bg-accent px-2 py-0.5 text-[10px] font-semibold text-onaccent">
                                                    Most popular
                                                </span>
                                            </Show>
                                        </div>
                                        <p class="mt-0.5 text-[12.5px] text-muted">
                                            {plan.tagline}
                                        </p>
                                        <div class="mt-3 flex items-baseline gap-1">
                                            <span class="text-[30px] font-bold tracking-[-0.02em]">
                                                ${plan.billing.priceMonthly}
                                            </span>
                                            <span class="text-[13px] text-muted">/ month</span>
                                        </div>
                                        <ul class="mt-4 flex flex-1 flex-col gap-2">
                                            <For each={plan.highlights}>
                                                {(h) => (
                                                    <li class="flex items-start gap-2 text-[13px] text-soft">
                                                        <span class="mt-0.5 flex-none text-accent">
                                                            <CheckIcon size={14} />
                                                        </span>
                                                        {h}
                                                    </li>
                                                )}
                                            </For>
                                        </ul>
                                        <button
                                            class={`mt-5 rounded-lg px-3 py-2 text-[13px] font-semibold transition-colors disabled:opacity-50 ${
                                                isCurrent()
                                                    ? "border border-line text-soft"
                                                    : featured
                                                      ? "bg-accent text-onaccent hover:opacity-90"
                                                      : "border border-line text-ink hover:border-accent"
                                            }`}
                                            disabled={
                                                isCurrent() || (plan.id !== "free" && !ready())
                                            }
                                            onClick={() => pick(plan.id)}
                                        >
                                            {ctaLabel(plan.id)}
                                        </button>
                                    </div>
                                );
                            }}
                        </For>
                    </div>

                    {/* what a credit buys — every AI action mapped to its credit cost */}
                    <section class="mt-12">
                        <h2 class="text-[16px] font-bold tracking-[-0.01em]">
                            What your credits buy
                        </h2>
                        <p class="mt-0.5 text-[13px] text-muted">
                            Every AI action draws from your monthly credits — bigger jobs cost more.
                        </p>
                        <div class="mt-4 overflow-hidden rounded-xl border border-line bg-panel">
                            <For each={AI_ACTION_LIST}>
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
                                                        {a.label}
                                                    </span>
                                                    <Show when={isMetered(a.id)}>
                                                        <span class="rounded-full bg-canvas px-1.5 py-px text-[9px] font-medium uppercase tracking-[0.1em] text-muted">
                                                            scales
                                                        </span>
                                                    </Show>
                                                    <Show when={!a.live}>
                                                        <span class="rounded-full border border-line px-1.5 py-px text-[9px] font-medium uppercase tracking-[0.1em] text-muted">
                                                            soon
                                                        </span>
                                                    </Show>
                                                </div>
                                                <div class="truncate text-[12px] text-muted">
                                                    {a.description}
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

                    <Show when={current() !== "free"}>
                        <button
                            class="mt-6 text-[13px] font-medium text-soft underline hover:text-ink"
                            onClick={() => openPortal().catch(() => {})}
                        >
                            Manage billing / cancel in the Stripe portal →
                        </button>
                    </Show>
                </div>
            </main>
        </div>
    );
};
