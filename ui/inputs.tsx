import type { Component, JSX } from "solid-js";
import { For, Show, splitProps } from "solid-js";
import { Icon } from "./icons";

// Form primitives + panel scaffolding. Label-less atoms (compose with FieldRow/Group); every one styles
// through theme CSS-var utilities so it recolors with the active theme, matching the app.

export const inputCls =
    "w-full rounded-md border border-line bg-canvas px-2 py-1.5 text-[13px] text-ink outline-none focus:border-accent";

// ── layout scaffolding ──
export const PanelHeader: Component<{ title: string; action?: JSX.Element }> = (props) => (
    <div class="mb-4 flex items-center justify-between">
        <span class="font-mono text-[11px] font-semibold uppercase tracking-wider text-muted">
            {props.title}
        </span>
        {props.action}
    </div>
);

export const Group: Component<{ label: string; divider?: boolean; children: JSX.Element }> = (
    props,
) => (
    <div class="mb-4">
        <div
            class={`mb-2.5 text-[10px] font-semibold uppercase tracking-wider text-muted ${
                props.divider ? "border-t border-line pt-3" : ""
            }`}
        >
            {props.label}
        </div>
        {props.children}
    </div>
);

export const FieldRow: Component<{ label?: string; children: JSX.Element }> = (props) => (
    <div class="mb-3.5">
        <Show when={props.label}>
            <label class="mb-1.5 block text-[11px] font-semibold text-muted">{props.label}</label>
        </Show>
        {props.children}
    </div>
);

// A 1px divider — vertical (toolbar separator) or horizontal (row rule). Recolors with the theme line;
// `onDark` uses a translucent white for dark surfaces (present/control bars).
export const Separator: Component<{ vertical?: boolean; onDark?: boolean; class?: string }> = (
    props,
) => (
    <span
        class={`${props.vertical ? "h-5 w-px" : "h-px w-full"} ${props.onDark ? "bg-white/15" : "bg-line"} ${props.class ?? ""}`}
    />
);

// ── atoms ──
const inputCompactCls =
    "w-full rounded-md border border-line bg-canvas px-2 py-1 text-[12px] text-ink outline-none focus:border-accent";

// Native attrs (ref, onKeyDown, onBlur, placeholder, disabled, min/max/step, autofocus…) pass through
// to the underlying <input> — only value/onChange (custom string API), type, and the layout props are local.
export const TextField: Component<
    Omit<JSX.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type" | "class"> & {
        value: string;
        type?: "text" | "password" | "email" | "search" | "url" | "number";
        compact?: boolean;
        icon?: string; // leading icon glyph (search fields)
        class?: string;
        onChange: (v: string) => void;
    }
> = (props) => {
    const [local, rest] = splitProps(props, [
        "value",
        "type",
        "compact",
        "icon",
        "class",
        "onChange",
    ]);
    return (
        <Show
            when={local.icon}
            fallback={
                <input
                    {...rest}
                    type={local.type ?? "text"}
                    class={`${local.compact ? inputCompactCls : inputCls} ${local.class ?? ""}`}
                    value={local.value}
                    onInput={(e) => local.onChange(e.currentTarget.value)}
                />
            }
        >
            <div
                class={`flex items-center gap-2 rounded-md border border-line bg-canvas px-2 ${local.compact ? "py-1" : "py-1.5"} text-ink focus-within:border-accent ${local.class ?? ""}`}
            >
                <Icon name={local.icon!} size={14} />
                <input
                    {...rest}
                    type={local.type ?? "text"}
                    class="min-w-0 flex-1 bg-transparent text-[13px] text-ink outline-none placeholder:text-soft"
                    value={local.value}
                    onInput={(e) => local.onChange(e.currentTarget.value)}
                />
            </div>
        </Show>
    );
};

const TA_ROUND: Record<"md" | "lg" | "xl", string> = {
    md: "rounded-md px-2 py-1.5 text-[13px]",
    lg: "rounded-lg px-3 py-2 text-[13px]",
    xl: "rounded-xl px-3 py-2.5 text-[13.5px]",
};
export const TextArea: Component<
    Omit<
        JSX.TextareaHTMLAttributes<HTMLTextAreaElement>,
        "value" | "onChange" | "rows" | "class"
    > & {
        value: string;
        rows?: number;
        rounded?: "md" | "lg" | "xl"; // default md (== old inputCls look)
        class?: string;
        onChange: (v: string) => void;
    }
> = (props) => {
    const [local, rest] = splitProps(props, ["value", "rows", "rounded", "class", "onChange"]);
    return (
        <textarea
            {...rest}
            rows={local.rows ?? 3}
            class={`w-full resize-y border border-line bg-canvas leading-snug text-ink outline-none focus:border-accent ${TA_ROUND[local.rounded ?? "md"]} ${local.class ?? ""}`}
            value={local.value}
            onInput={(e) => local.onChange(e.currentTarget.value)}
        />
    );
};

// Borderless spreadsheet-cell input (used by the inspector data grid). Base is the plain cell style;
// `numeric` switches to the tabular monospace variant (left-aligned so value cells sit under their
// column header). Native attrs (ref, onKeyDown, onBlur, placeholder…) pass through; an optional `class`
// composes on top (e.g. a header's font weight or an invalid-value ring).
const cellInputCls =
    "w-full min-w-[72px] bg-transparent px-2.5 py-2 text-[13px] text-ink outline-none focus:bg-canvas";
const cellNumCls = `${cellInputCls} text-left font-mono tabular-nums`;
export const CellInput: Component<
    Omit<JSX.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "class"> & {
        value: string;
        numeric?: boolean;
        class?: string;
        onChange: (v: string) => void;
    }
> = (props) => {
    const [local, rest] = splitProps(props, ["value", "numeric", "class", "onChange"]);
    return (
        <input
            {...rest}
            class={`${local.numeric ? cellNumCls : cellInputCls} ${local.class ?? ""}`}
            value={local.value}
            onInput={(e) => local.onChange(e.currentTarget.value)}
        />
    );
};

export const Toggle: Component<{ value: boolean; onChange: (b: boolean) => void }> = (props) => (
    <button
        onClick={() => props.onChange(!props.value)}
        class={`relative h-5 w-9 rounded-full transition-colors ${props.value ? "bg-accent" : "bg-line"}`}
    >
        <span
            class={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${
                props.value ? "left-[18px]" : "left-0.5"
            }`}
        />
    </button>
);

export const Slider: Component<{
    value: number;
    min: number;
    max: number;
    step?: number;
    unit?: string;
    onChange: (n: number) => void;
}> = (props) => (
    <div class="flex items-center gap-2.5">
        <input
            type="range"
            min={props.min}
            max={props.max}
            step={props.step ?? 1}
            class="h-1.5 flex-1 accent-accent"
            value={props.value}
            onInput={(e) => props.onChange(Number(e.currentTarget.value))}
        />
        <span class="w-11 text-right text-[11px] tabular-nums text-muted">
            {props.value}
            {props.unit ?? ""}
        </span>
    </div>
);

export const Segmented: Component<{
    value: string;
    options: { label: string; value: string; icon?: string }[];
    variant?: "subtle" | "accent"; // subtle = panel-raised active (default); accent = accent-filled active
    onChange: (v: string) => void;
}> = (props) => (
    <div class="flex gap-1 rounded-lg border border-line bg-canvas p-0.5">
        <For each={props.options}>
            {(o) => (
                <button
                    title={o.label}
                    class={`flex flex-1 items-center justify-center truncate rounded-md px-2 py-1 text-[12px] transition-colors ${
                        props.value === o.value
                            ? props.variant === "accent"
                                ? "bg-accent font-semibold text-onaccent"
                                : "bg-panel font-semibold text-ink shadow-sm"
                            : "text-soft hover:text-ink"
                    }`}
                    onClick={() => props.onChange(o.value)}
                >
                    <Show when={o.icon} fallback={o.label}>
                        <Icon name={o.icon!} size={15} />
                    </Show>
                </button>
            )}
        </For>
    </div>
);

const ALIGN_OPTS = [
    { value: "start", icon: "alignLeft", title: "Align left" },
    { value: "center", icon: "alignCenter", title: "Align center" },
    { value: "end", icon: "alignRight", title: "Align right" },
];

// Left/center/right alignment as an icon segmented group. Defaults to "start" when the value is unset.
export const AlignField: Component<{ value: string; onChange: (v: string) => void }> = (props) => {
    const val = (): string => props.value || "start";
    return (
        <div class="flex gap-1 rounded-lg border border-line bg-canvas p-0.5">
            <For each={ALIGN_OPTS}>
                {(o) => (
                    <button
                        title={o.title}
                        class={`flex min-w-8 flex-1 items-center justify-center rounded-md py-1 transition-colors ${
                            val() === o.value
                                ? "bg-panel text-ink shadow-sm"
                                : "text-soft hover:text-ink"
                        }`}
                        onClick={() => props.onChange(o.value)}
                    >
                        <Icon name={o.icon} size={15} />
                    </button>
                )}
            </For>
        </div>
    );
};
