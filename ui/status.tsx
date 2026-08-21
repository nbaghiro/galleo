import type { Component, JSX } from "solid-js";
import type { MediaCredit } from "@model/media";
import { Eyebrow } from "./button";
import { For, Show } from "solid-js";

// pass/fail are the verdict tones, deliberately not the accent (see --color-pass in styles.css)
type FillTone = "accent" | "pass" | "fail";
const METER_FILL: Record<FillTone, string> = {
    accent: "bg-accent",
    pass: "bg-pass",
    fail: "bg-fail",
};

export const Meter: Component<{
    value: number;
    max?: number; // default 100 (value is then a raw percentage)
    tone?: FillTone;
    trackTone?: "line" | "canvas";
    class?: string;
}> = (props) => {
    const pct = (): number => Math.max(0, Math.min(100, (props.value / (props.max ?? 100)) * 100));
    return (
        <div
            class={`h-1.5 overflow-hidden rounded-full ${props.trackTone === "canvas" ? "bg-canvas" : "bg-line"} ${props.class ?? ""}`}
        >
            <div
                class={`h-full rounded-full transition-all ${METER_FILL[props.tone ?? "accent"]}`}
                style={{ width: `${pct()}%` }}
            />
        </div>
    );
};

type DotTone = FillTone | "soft" | "line";
const DOT_SOLID: Record<DotTone, string> = {
    accent: "bg-accent",
    pass: "bg-pass",
    fail: "bg-fail",
    soft: "bg-soft",
    line: "bg-line",
};
const DOT_RING: Record<DotTone, string> = {
    accent: "border border-accent",
    pass: "border border-pass",
    fail: "border border-fail",
    soft: "border border-soft",
    line: "border border-line",
};
export const StatusDot: Component<{
    tone?: DotTone;
    pulse?: boolean;
    ring?: boolean;
    fill?: boolean; // ring + accent fill (the "current step" marker)
    size?: number; // px (default 6)
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

// Where a sourced picture's credit goes when the artifact leaves the app. Providers ask for it to
// be visible next to the work, so it renders on published pages and in exports, not in the editor.
export const MediaCredits: Component<{ credits: MediaCredit[]; class?: string }> = (props) => (
    <Show when={props.credits.length}>
        <div class={`px-5 py-6 text-center text-[11px] text-muted md:px-9 ${props.class ?? ""}`}>
            <Eyebrow as="div" tracking="wider" class="mb-1.5">
                Images
            </Eyebrow>
            <p class="mx-auto max-w-150 leading-relaxed">
                <For each={props.credits}>
                    {(c, i) => (
                        <>
                            <Show when={i()}>
                                <span aria-hidden="true"> · </span>
                            </Show>
                            <Show when={c.authorUrl ?? c.sourceUrl} fallback={<>{creditLine(c)}</>}>
                                <a
                                    href={c.authorUrl ?? c.sourceUrl}
                                    target="_blank"
                                    rel="noopener noreferrer nofollow"
                                    class="text-soft underline decoration-line underline-offset-2 hover:text-ink"
                                >
                                    {creditLine(c)}
                                </a>
                            </Show>
                        </>
                    )}
                </For>
            </p>
        </div>
    </Show>
);

const creditLine = (c: MediaCredit): string =>
    c.author && c.provider ? `${c.author} · ${c.provider}` : (c.author ?? c.provider ?? "");
