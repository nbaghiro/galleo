import type { Component } from "solid-js";
import { createMemo, createSignal, For, onMount, Show } from "solid-js";
import { useSearchParams } from "@solidjs/router";
import type { Interval, Plan, PlanId } from "@model/billing";
import { PRICED_TOOLS, costRange, isMetered, typicalCost } from "@model/tools";
import { CheckIcon } from "@ui/icons";
import { Badge, Eyebrow } from "@ui/button";
import { TextField } from "@ui/inputs";
import { Meter } from "@ui/status";
import { Sidebar } from "../components/Sidebar";
import { billing, changePlan, loadBilling, openPortal, startCheckout } from "../stores/billing";

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

    const [interval, setInterval] = createSignal<Interval>("month");
    const [seats, setSeats] = createSignal(1);
    const RANK: Record<PlanId, number> = { free: 0, pro: 1, premium: 2 };
    const perSeat = (plan: Plan): boolean => plan.billing.model === "per_seat";
    const unitPrice = (plan: Plan): number =>
        interval() === "year" ? plan.billing.priceAnnualMonthly : plan.billing.priceMonthly;
    const seatsFor = (plan: Plan): number => Math.max(seats(), plan.billing.minSeats);
    const overLimit = (): boolean => {
        const u = b()?.usage;
        return !!u && u.maxArtifacts >= 0 && u.artifacts > u.maxArtifacts;
    };

    const pick = (plan: Plan): void => {
        if (plan.id === current()) return;
        if (plan.id === "free") {
            changePlan({ plan: "free" }).catch(() => {}); // cancel at period end
            return;
        }
        const opts = {
            plan: plan.id,
            interval: interval(),
            seats: perSeat(plan) ? seatsFor(plan) : undefined,
        };
        // free → paid needs Checkout (collect a payment method); paid → paid is an in-app change.
        (current() === "free" ? startCheckout(opts) : changePlan(opts)).catch(() => {});
    };

    const ctaLabel = (plan: Plan): string => {
        if (plan.id === current()) return "Current plan";
        if (plan.id === "free") return "Downgrade to Free";
        if (current() === "free") return `Upgrade to ${plan.name}`;
        return RANK[plan.id] > RANK[current()]
            ? `Upgrade to ${plan.name}`
            : `Switch to ${plan.name}`;
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
                    <Show when={b()?.status === "past_due"}>
                        <div class="mb-5 flex items-center justify-between gap-3 rounded-xl border border-accent bg-accent/10 px-4 py-3 text-[13px] text-ink">
                            <span>
                                Your last payment failed — update your payment method to keep your
                                plan.
                            </span>
                            <button
                                class="flex-none rounded-lg border border-line bg-panel px-3 py-1.5 font-semibold hover:border-accent"
                                onClick={() => openPortal().catch(() => {})}
                            >
                                Update payment →
                            </button>
                        </div>
                    </Show>
                    <Show when={overLimit()}>
                        <div class="mb-5 rounded-xl border border-line bg-panel px-4 py-3 text-[13px] text-ink">
                            You're over your plan's limits. Your existing work is safe, but you
                            can't create more until you upgrade or remove some.
                        </div>
                    </Show>

                    {/* usage */}
                    <Show when={b()}>
                        {(state) => (
                            <div class="mb-8 grid grid-cols-2 gap-3 sm:max-w-[520px]">
                                <div class="rounded-xl border border-line bg-panel px-4 py-3">
                                    <Eyebrow as="div">AI credits this month</Eyebrow>
                                    <div class="mt-1 flex items-baseline gap-1.5 tabular-nums">
                                        <span class="text-[20px] font-bold">
                                            {state().credits.used}
                                        </span>
                                        <span class="text-[13px] text-muted">
                                            / {state().credits.limit}
                                        </span>
                                    </div>
                                    <Meter value={usagePct()} trackTone="canvas" class="mt-2" />
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
                                                    {state().status === "canceled"
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

                    {/* billing interval + seat count */}
                    <div class="mb-4 flex flex-wrap items-center gap-3">
                        <div class="inline-flex rounded-lg border border-line bg-panel p-0.5 text-[12px] font-semibold">
                            <button
                                class={`rounded-md px-3 py-1 ${interval() === "month" ? "bg-canvas text-ink shadow-sm" : "text-muted"}`}
                                onClick={() => setInterval("month")}
                            >
                                Monthly
                            </button>
                            <button
                                class={`rounded-md px-3 py-1 ${interval() === "year" ? "bg-canvas text-ink shadow-sm" : "text-muted"}`}
                                onClick={() => setInterval("year")}
                            >
                                Annual <span class="text-accent">· save ~2 mo</span>
                            </button>
                        </div>
                        <label class="inline-flex items-center gap-2 text-[12px] text-muted">
                            Seats
                            <TextField
                                type="number"
                                min={1}
                                value={String(seats())}
                                onChange={(v) => setSeats(Math.max(1, Math.floor(Number(v) || 1)))}
                                class="w-16"
                            />
                            <span class="text-[11px]">for per-seat plans</span>
                        </label>
                    </div>

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
                                            <Show when={plan.badge}>
                                                <Badge tone="accentSolid">{plan.badge}</Badge>
                                            </Show>
                                        </div>
                                        <p class="mt-0.5 text-[12.5px] text-muted">
                                            {plan.tagline}
                                        </p>
                                        <div class="mt-3 flex items-baseline gap-1">
                                            <span class="text-[30px] font-bold tracking-[-0.02em]">
                                                ${unitPrice(plan)}
                                            </span>
                                            <span class="text-[13px] text-muted">
                                                {perSeat(plan) ? "/ seat / mo" : "/ mo"}
                                            </span>
                                        </div>
                                        <div class="mt-0.5 min-h-4 text-[11.5px] text-muted">
                                            <Show
                                                when={interval() === "year" && unitPrice(plan) > 0}
                                            >
                                                billed annually
                                            </Show>
                                            <Show when={perSeat(plan) && seats() > 1}>
                                                {" · "}${unitPrice(plan) * seatsFor(plan)}/mo ×{" "}
                                                {seatsFor(plan)} seats
                                            </Show>
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
                                            onClick={() => pick(plan)}
                                        >
                                            {ctaLabel(plan)}
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
