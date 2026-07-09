import type { Component, JSX } from "solid-js";
import { Show } from "solid-js";

// Small status/feedback primitives shared across the app chrome: a usage/quota meter, a status dot, and a
// centered empty state. All style through theme utilities so they recolor with the active theme.

// ── Meter ── a usage/quota bar: theme-line/canvas track + accent fill sized by value/max.
export const Meter: Component<{
    value: number;
    max?: number; // default 100 (value is then a raw percentage)
    trackTone?: "line" | "canvas";
    class?: string;
}> = (props) => {
    const pct = (): number => Math.max(0, Math.min(100, (props.value / (props.max ?? 100)) * 100));
    return (
        <div
            class={`h-1.5 overflow-hidden rounded-full ${props.trackTone === "canvas" ? "bg-canvas" : "bg-line"} ${props.class ?? ""}`}
        >
            <div
                class="h-full rounded-full bg-accent transition-all"
                style={{ width: `${pct()}%` }}
            />
        </div>
    );
};

// ── StatusDot ── a small round status marker (solid or hollow ring), optionally pulsing (live/active).
type DotTone = "accent" | "soft" | "line";
const DOT_SOLID: Record<DotTone, string> = {
    accent: "bg-accent",
    soft: "bg-soft",
    line: "bg-line",
};
const DOT_RING: Record<DotTone, string> = {
    accent: "border border-accent",
    soft: "border border-soft",
    line: "border border-line",
};
export const StatusDot: Component<{
    tone?: DotTone;
    pulse?: boolean;
    ring?: boolean; // hollow ring instead of a solid fill
    fill?: boolean; // ring + accent fill (the "current step" marker)
    size?: number; // px (default 6 = h-1.5 w-1.5)
    class?: string;
}> = (props) => (
    <span
        class={`inline-block flex-none rounded-full ${props.pulse ? "animate-pulse" : ""} ${
            props.ring
                ? `${DOT_RING[props.tone ?? "accent"]} ${props.fill ? DOT_SOLID[props.tone ?? "accent"] : ""}`
                : DOT_SOLID[props.tone ?? "accent"]
        } ${props.class ?? ""}`}
        style={{ width: `${props.size ?? 6}px`, height: `${props.size ?? 6}px` }}
    />
);

// ── EmptyState ── a centered "nothing here" block: optional icon, a title line, optional subtitle + action.
export const EmptyState: Component<{
    icon?: JSX.Element;
    title: JSX.Element;
    subtitle?: JSX.Element;
    action?: JSX.Element;
    class?: string;
}> = (props) => (
    <div class={`flex flex-col items-center justify-center gap-1 text-center ${props.class ?? ""}`}>
        <Show when={props.icon}>
            <div class="mb-2 text-muted">{props.icon}</div>
        </Show>
        <div class="text-[13.5px] font-medium text-ink">{props.title}</div>
        <Show when={props.subtitle}>
            <div class="text-[12px] text-muted">{props.subtitle}</div>
        </Show>
        <Show when={props.action}>
            <div class="mt-2">{props.action}</div>
        </Show>
    </div>
);
