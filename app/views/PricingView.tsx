import type { Component } from "solid-js";
import { createMemo, createResource, createSignal, For, onMount, Show } from "solid-js";
import { useSearchParams } from "@solidjs/router";
import type { Interval, Plan, PlanId } from "@model/billing";
import { PRICED_TOOLS, costRange, isMetered, typicalCost } from "@model/tools";
import { CheckIcon } from "@ui/icons";
import { Badge, Eyebrow, Spinner } from "@ui/button";
import { TextField } from "@ui/inputs";
import { Meter } from "@ui/status";
import { Sidebar, SidebarToggle } from "../components/Sidebar";
import { api } from "../api";
import {
    billing,
    changePlan,
    loadBilling,
    openPortal,
    resumePlan,
    startCheckout,
    startTopUp,
} from "../stores/billing";

export const PricingView: Component = () => {
    const [params] = useSearchParams();
    onMount(loadBilling);

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

    const usagePct = createMemo(() => {
        const c = b()?.credits;
        if (!c || c.limit <= 0) return 0;
        return Math.min(100, Math.round((c.used / c.limit) * 100));
    });

    // how many of an action the monthly credit allowance buys
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

    const pick = (plan: Plan): void => {
        if (plan.id === current()) return;
        if (plan.id === "free") {
            void run(plan.id, () => changePlan({ plan: "free" })); // cancel at period end
            return;
        }
        const opts = {
            plan: plan.id,
            interval: interval(),
            seats: perSeat(plan) ? seatsFor(plan) : undefined,
        };
        // free → paid needs Checkout (collect a payment method); paid → paid is an in-app change.
        void run(plan.id, () => (current() === "free" ? startCheckout(opts) : changePlan(opts)));
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
                            🎉 Payment received — your plan updates the moment Stripe confirms it
                            (usually a second or two). Refresh if it still shows the old tier.
                        </div>
                    </Show>
                    <Show when={params.status === "topup-success"}>
                        <div class="mb-5 rounded-xl border border-accent/30 bg-accent/10 px-4 py-3 text-[13px] text-ink">
                            🎉 Credits purchased — they land in your bonus balance the moment Stripe
                            confirms the payment (usually a second or two).
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
                                class="flex-none inline-flex items-center gap-1.5 rounded-lg border border-line bg-panel px-3 py-1.5 font-semibold hover:border-accent disabled:opacity-60"
                                disabled={anyBusy()}
                                onClick={() => void run("portal", openPortal)}
                            >
                                <Show when={busy("portal")}>
                                    <Spinner size={13} tone="current" />
                                </Show>
                                {busy("portal") ? "Opening…" : "Update payment →"}
                            </button>
                        </div>
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
                                <div class="rounded-xl border border-line bg-panel px-4 py-3">
                                    <Eyebrow as="div">AI credits this month</Eyebrow>
                                    <div class="mt-1 flex items-baseline gap-1.5 tabular-nums">
                                        <span class="text-[20px] font-bold">
                                            {state().credits.used}
                                        </span>
                                        <span class="text-[13px] text-muted">
                                            / {state().credits.limit}
                                        </span>
                                        <Show when={state().credits.bonus > 0}>
                                            <span class="text-[12px] font-semibold text-accent">
                                                +{state().credits.bonus} bonus
                                            </span>
                                        </Show>
                                    </div>
                                    <Meter value={usagePct()} trackTone="canvas" class="mt-2" />
                                    <Show when={state().topUps.length > 0 && ready()}>
                                        <div class="mt-2.5 flex flex-wrap items-center gap-1.5">
                                            <For each={state().topUps}>
                                                {(pack) => (
                                                    <button
                                                        class="inline-flex items-center gap-1 rounded-md border border-line bg-canvas px-2 py-1 text-[11.5px] font-semibold hover:border-accent disabled:opacity-60"
                                                        disabled={anyBusy()}
                                                        onClick={() =>
                                                            void run(`topup:${pack.id}`, () =>
                                                                startTopUp(pack.id),
                                                            )
                                                        }
                                                    >
                                                        <Show when={busy(`topup:${pack.id}`)}>
                                                            <Spinner size={11} tone="current" />
                                                        </Show>
                                                        +{pack.credits.toLocaleString()} · $
                                                        {pack.priceUsd}
                                                    </button>
                                                )}
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

                    <Show when={(ledger() ?? []).length > 0}>
                        <div class="mb-8 rounded-xl border border-line bg-panel px-4 py-3 sm:max-w-130">
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

                    <div class="grid gap-4 md:grid-cols-3">
                        <For each={b()?.catalog ?? []}>
                            {(plan) => {
                                const isCurrent = (): boolean => plan.id === current();
                                // paying users see THEIR tier featured; Pro is the upsell card only for free
                                const featured = (): boolean =>
                                    plan.id === (current() === "free" ? "pro" : current());
                                return (
                                    <div
                                        class={`flex flex-col rounded-2xl border p-5 ${
                                            featured()
                                                ? "border-accent shadow-lg"
                                                : "border-line bg-panel"
                                        }`}
                                    >
                                        <div class="flex items-center justify-between">
                                            <span class="text-[15px] font-bold">{plan.name}</span>
                                            <Show
                                                when={isCurrent()}
                                                fallback={
                                                    <Show when={plan.badge && current() === "free"}>
                                                        <Badge tone="accentSolid">
                                                            {plan.badge}
                                                        </Badge>
                                                    </Show>
                                                }
                                            >
                                                <Badge tone="accentSolid">Your plan</Badge>
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
                                            class={`mt-5 inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-[13px] font-semibold transition-colors disabled:opacity-50 ${
                                                isCurrent()
                                                    ? "border border-line text-soft"
                                                    : featured()
                                                      ? "bg-accent text-onaccent hover:opacity-90"
                                                      : "border border-line text-ink hover:border-accent"
                                            }`}
                                            disabled={
                                                isCurrent() ||
                                                (plan.id !== "free" && !ready()) ||
                                                anyBusy()
                                            }
                                            onClick={() => pick(plan)}
                                        >
                                            <Show when={busy(plan.id)}>
                                                <Spinner size={14} tone="current" />
                                            </Show>
                                            {busy(plan.id) ? "Processing…" : ctaLabel(plan)}
                                        </button>
                                    </div>
                                );
                            }}
                        </For>
                    </div>

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
                            class="mt-6 inline-flex items-center gap-1.5 text-[13px] font-medium text-soft underline hover:text-ink disabled:opacity-60"
                            disabled={anyBusy()}
                            onClick={() => void run("portal", openPortal)}
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
