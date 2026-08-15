import type { Component } from "solid-js";
import { createSignal, For, Show } from "solid-js";
import type { Interval, Plan, PlanId } from "@model/billing";
import { ADD_ONS } from "@model/billing";
import { CheckIcon } from "@ui/icons";
import { Badge, Button } from "@ui/button";
import { Segmented, TextField } from "@ui/inputs";
import { billing, changePlan, startCheckout } from "@app/stores/billing";

// The plan grid and the flow behind it, in one place so /pricing and any wall that wants to sell a
// plan without leaving the page render the same thing and take the same path through Stripe.

const RANK: Record<PlanId, number> = { free: 0, pro: 1, premium: 2 };

export const UpgradePageContent: Component<{
    /** Hides the interval and seat controls where the surface is too small to carry them. */
    compact?: boolean;
}> = (props) => {
    const b = billing;
    const current = (): PlanId => b()?.plan ?? "free";
    const ready = (): boolean => b()?.stripeReady ?? false;

    const [interval, setInterval] = createSignal<Interval>("month");
    const [seats, setSeats] = createSignal(1);

    // only a plan that sells seat add-ons responds to the seat control; Free and Pro are solo
    const sellsSeats = (plan: Plan): boolean => plan.billing.sellsSeats;
    const unitPrice = (plan: Plan): number =>
        interval() === "year" ? plan.billing.priceAnnualMonthly : plan.billing.priceMonthly;
    const seatsFor = (plan: Plan): number => Math.max(seats(), plan.billing.includedSeats);
    const extraSeats = (plan: Plan): number => seatsFor(plan) - plan.billing.includedSeats;
    const monthlyTotal = (plan: Plan): number =>
        unitPrice(plan) + (sellsSeats(plan) ? extraSeats(plan) * ADD_ONS.seat.priceUsd : 0);

    // keyed by plan id; checkout redirects away, so pending simply persists until navigation
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
            seats: sellsSeats(plan) ? seatsFor(plan) : undefined,
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
        <>
            <Show when={!props.compact}>
                <div class="mb-4 flex flex-wrap items-center gap-3">
                    <Segmented
                        value={interval()}
                        options={[
                            { label: "Monthly", value: "month" },
                            { label: "Annual", value: "year" },
                        ]}
                        onChange={(v) => setInterval(v as Interval)}
                    />
                    <span class="text-[11px] font-semibold text-accent">
                        annual saves about 2 months
                    </span>
                    <label class="inline-flex items-center gap-2 text-[12px] text-muted">
                        Seats
                        <TextField
                            type="number"
                            min={1}
                            value={String(seats())}
                            onChange={(v) => setSeats(Math.max(1, Math.floor(Number(v) || 1)))}
                            class="w-16"
                        />
                        <span class="text-[11px]">on plans that sell seats</span>
                    </label>
                </div>
            </Show>

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
                                    featured() ? "border-accent shadow-lg" : "border-line bg-panel"
                                }`}
                            >
                                <div class="flex items-center justify-between">
                                    <span class="text-[15px] font-bold">{plan.name}</span>
                                    <Show
                                        when={isCurrent()}
                                        fallback={
                                            <Show when={plan.badge && current() === "free"}>
                                                <Badge tone="accentSolid">{plan.badge}</Badge>
                                            </Show>
                                        }
                                    >
                                        <Badge tone="accentSolid">Your plan</Badge>
                                    </Show>
                                </div>
                                <p class="mt-0.5 text-[12.5px] text-muted">{plan.tagline}</p>
                                <div class="mt-3 flex items-baseline gap-1">
                                    <span class="text-[30px] font-bold tracking-[-0.02em]">
                                        ${unitPrice(plan)}
                                    </span>
                                    <span class="text-[13px] text-muted">/ mo</span>
                                </div>
                                <div class="mt-0.5 min-h-4 text-[11.5px] text-muted">
                                    <Show when={interval() === "year" && unitPrice(plan) > 0}>
                                        billed annually
                                    </Show>
                                    <Show when={plan.billing.includedSeats > 1}>
                                        {" · "}
                                        {plan.billing.includedSeats} seats included
                                    </Show>
                                    <Show when={sellsSeats(plan) && extraSeats(plan) > 0}>
                                        {" · "}${monthlyTotal(plan)}/mo with {extraSeats(plan)}{" "}
                                        extra
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
                                <Button
                                    variant={featured() ? "primary" : "outline"}
                                    size="md"
                                    class="mt-5 w-full"
                                    disabled={
                                        isCurrent() || (plan.id !== "free" && !ready()) || anyBusy()
                                    }
                                    loading={busy(plan.id)}
                                    onClick={() => pick(plan)}
                                >
                                    {busy(plan.id) ? "Processing…" : ctaLabel(plan)}
                                </Button>
                            </div>
                        );
                    }}
                </For>
            </div>
        </>
    );
};
