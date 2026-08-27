import type { Accessor, Component, JSX } from "solid-js";
import { Show } from "solid-js";
import { useNavigate, useParams } from "@solidjs/router";
import type { TabItem } from "@ui/tabs";
import { Eyebrow } from "@ui/button";
import { checkoutReturn } from "@app/stores/billing";

// The chrome both settings pages share: a titled block, and the tab the route is on. Defined once
// here rather than privately in each view, which is how the two drifted apart in the first place.

export const SettingsSection: Component<{ title: string; children: JSX.Element }> = (props) => (
    <section class="mb-8">
        <Eyebrow as="div" class="mb-2">
            {props.title}
        </Eyebrow>
        {props.children}
    </section>
);

/**
 * The tab a settings route is showing, and how to move to another one. The tab is in the URL so it
 * is linkable and survives a reload, and an unknown or absent one falls back to the first rather
 * than rendering a page with nothing on it.
 *
 * `replace` on navigation, because flipping tabs is not a step someone wants to walk back through.
 */
export function useSettingsTab(
    base: string,
    tabs: readonly TabItem[],
): [Accessor<string>, (id: string) => void] {
    const params = useParams();
    const navigate = useNavigate();
    const active = (): string => {
        const asked = params.tab;
        return tabs.some((t) => t.id === asked) ? asked! : tabs[0]!.id;
    };
    return [active, (id) => navigate(`${base}/${id}`, { replace: true })];
}

// one copy per return state, so the two billing-family tabs cannot drift apart
const RETURN_COPY = {
    plan: "Payment received. Your plan updates the moment Stripe confirms it, usually within a few seconds.",
    topup: "Payment received. Your credits are being added and will show in the balance in a moment.",
    "plan-cancel": "Checkout canceled, no charge. You can upgrade whenever you're ready.",
    "topup-cancel": "Checkout canceled, no charge.",
} as const;

/** The Stripe-return banner; rendered by both billing-family tabs, fed by consumeCheckoutReturn. */
export const PaymentReturnNotice: Component = () => (
    <Show when={checkoutReturn()}>
        {(state) => (
            <div
                class={`mb-5 rounded-xl border px-4 py-3 text-[13px] ${
                    state() === "plan" || state() === "topup"
                        ? "border-accent/30 bg-accent/10 text-ink"
                        : "border-line bg-panel text-soft"
                }`}
            >
                {RETURN_COPY[state()]}
            </div>
        )}
    </Show>
);

export const PolicyRow: Component<{ label: string; hint: string; children: JSX.Element }> = (
    props,
) => (
    <div class="flex flex-col gap-2 border-b border-line py-3 last:border-b-0 sm:flex-row sm:items-center sm:gap-4">
        <div class="min-w-0 flex-1">
            <div class="text-[13px] font-semibold text-ink">{props.label}</div>
            <div class="mt-0.5 text-[11.5px] text-muted">{props.hint}</div>
        </div>
        <div class="flex-none">{props.children}</div>
    </div>
);
