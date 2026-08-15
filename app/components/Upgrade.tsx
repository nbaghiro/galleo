import type { Component, JSX } from "solid-js";
import { Show } from "solid-js";
import type { BoolFeature } from "@model/billing";
import { upgradeFor } from "@model/billing";
import { Button } from "@ui/button";
import { EmptyState } from "@ui/status";
import { billing } from "@app/stores/billing";
import { statusOf } from "@app/stores/features";
import { go } from "@app/stores/navigate";

// Every plan wall in the app renders through here, so one surface answers "why can't I do this" and
// one flow answers "then let me pay". Which plan unlocks a feature is derived from the catalog
// (upgradeFor), never written into the copy, so a catalog change cannot leave a view selling the
// wrong tier.

/** The one place a wall sends you; the plan grid and both flows live there. */
export const UPGRADE_ROUTE = "/pricing";

/** Null when nothing sells it: either the caller is already on the top plan, or it is not built. */
const target = (feature?: BoolFeature): ReturnType<typeof upgradeFor> =>
    feature ? upgradeFor(feature, billing()?.plan) : null;

const comingSoon = (feature?: BoolFeature): boolean => !!feature && statusOf(feature) === "planned";

export const UpgradeButton: Component<{
    /** Names the tier in the label and hides the button when nothing sells the feature. */
    feature?: BoolFeature;
    label?: string;
    variant?: "primary" | "outline" | "tool" | "ghost" | "link";
    size?: "sm" | "md" | "lg";
    /** Runs before navigating, for a wall inside a modal that has to close itself first. */
    onBefore?: () => void;
    class?: string;
}> = (props) => {
    const label = (): string => {
        if (props.label) return props.label;
        const plan = target(props.feature);
        return plan ? `Upgrade to ${plan.name}` : "See plans";
    };
    return (
        <Show when={!comingSoon(props.feature)}>
            <Button
                variant={props.variant ?? "primary"}
                size={props.size ?? "sm"}
                class={props.class}
                onClick={() => {
                    props.onBefore?.();
                    go(UPGRADE_ROUTE);
                }}
            >
                {label()}
            </Button>
        </Show>
    );
};

/**
 * The blocked-feature block: what it is, which tier has it, and the way through. Use this wherever a
 * surface is reachable but inert on the current plan, rather than hiding the surface: a wall the
 * user can read is worth more than a control that silently is not there.
 */
export const UpgradeNotice: Component<{
    /** Omit for a wall that no boolean feature describes, such as a model-tier limit. */
    feature?: BoolFeature;
    title: string;
    children: JSX.Element; // what the feature does, in the caller's own words
    onBefore?: () => void;
    /** `inline` sits inside a pane; `block` centres itself in an empty one. */
    layout?: "inline" | "block";
}> = (props) => {
    const plan = (): ReturnType<typeof upgradeFor> => target(props.feature);
    const soon = (): boolean => comingSoon(props.feature);
    const where = (): string =>
        soon() ? "Coming soon." : plan() ? `Available on ${plan()!.name} and above.` : "";

    return (
        <Show
            when={props.layout !== "block"}
            fallback={
                <EmptyState
                    class="mx-auto max-w-85 py-4"
                    title={soon() ? `${props.title} · coming soon` : props.title}
                    subtitle={
                        <span class="leading-relaxed">
                            {props.children} {where()}
                        </span>
                    }
                    action={
                        <UpgradeButton
                            feature={props.feature}
                            onBefore={props.onBefore}
                            variant="primary"
                            size="md"
                        />
                    }
                />
            }
        >
            <div class="flex items-center gap-3 rounded-lg border border-dashed border-line px-3 py-3">
                <span class="flex-1 text-[11.5px] leading-relaxed text-muted">
                    {props.children} {where()}
                </span>
                <UpgradeButton feature={props.feature} onBefore={props.onBefore} variant="tool" />
            </div>
        </Show>
    );
};
