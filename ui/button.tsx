import type { Component, JSX } from "solid-js";
import { splitProps, Show } from "solid-js";
import { Dynamic } from "solid-js/web";

// Action + label atoms. All styling flows through theme CSS-var utilities (text-ink, bg-accent,
// text-onaccent, border-line, …) so every one recolors with the active theme, matching the app exactly.

type Rounded = "md" | "lg" | "xl" | "full";
const ROUNDED: Record<Rounded, string> = {
    md: "rounded-md",
    lg: "rounded-lg",
    xl: "rounded-xl",
    full: "rounded-full",
};

// ── Spinner ──
type SpinnerTone = "accent" | "current" | "line";
const SPINNER_TONE: Record<SpinnerTone, string> = {
    accent: "border-line border-t-accent",
    current: "border-current border-t-transparent",
    line: "border-line border-t-ink",
};

export const Spinner: Component<{ size?: number; tone?: SpinnerTone }> = (props) => (
    <span
        class={`inline-block animate-spin rounded-full border-2 ${SPINNER_TONE[props.tone ?? "accent"]}`}
        style={{ width: `${props.size ?? 16}px`, height: `${props.size ?? 16}px` }}
    />
);

// ── Button ──
type ButtonVariant = "primary" | "outline" | "tool" | "ghost" | "danger" | "dangerGhost" | "link";
type ButtonSize = "sm" | "md" | "lg";

const BTN_SIZE: Record<ButtonSize, string> = {
    sm: "px-3 py-1.5 text-[12px]",
    md: "px-4 py-2 text-[13px]",
    lg: "px-4 py-2.5 text-[13.5px]",
};
const BTN_VARIANT: Record<ButtonVariant, string> = {
    primary: "bg-accent text-onaccent hover:opacity-90",
    outline: "border border-line text-soft hover:border-accent hover:text-ink",
    tool: "border border-line bg-canvas text-soft hover:border-accent hover:text-ink",
    ghost: "text-soft hover:bg-canvas hover:text-ink",
    danger: "text-white hover:brightness-110", // semantic red set via style (not a theme token)
    dangerGhost: "text-[#C0392B] hover:bg-[#C0392B]/10", // red text, tinted hover, no fill/border
    link: "text-[13px] text-accent underline-offset-2 hover:underline", // inline text link (no box)
};

export const Button: Component<
    JSX.ButtonHTMLAttributes<HTMLButtonElement> & {
        variant?: ButtonVariant;
        size?: ButtonSize;
        rounded?: Rounded;
        loading?: boolean;
    }
> = (props) => {
    const [local, rest] = splitProps(props, [
        "variant",
        "size",
        "rounded",
        "loading",
        "class",
        "children",
        "disabled",
    ]);
    const link = (): boolean => local.variant === "link";
    const cls = (): string =>
        [
            "inline-flex items-center justify-center gap-1.5 font-semibold transition-colors disabled:pointer-events-none disabled:opacity-60",
            // `link` is a boxless inline text link — no padding/rounding.
            link() ? "" : BTN_SIZE[local.size ?? "md"],
            link() ? "" : ROUNDED[local.rounded ?? "lg"],
            BTN_VARIANT[local.variant ?? "primary"],
            local.class ?? "",
        ].join(" ");
    return (
        <button
            {...rest}
            class={cls()}
            disabled={local.disabled || local.loading}
            style={local.variant === "danger" ? { background: "#C0392B" } : undefined}
        >
            <Show when={local.loading}>
                <Spinner size={14} tone="current" />
            </Show>
            {local.children}
        </button>
    );
};

// ── IconButton ──
type IconButtonSize = "2xs" | "xs" | "sm" | "md" | "lg" | "xl";
type IconButtonTone = "muted" | "soft" | "ink" | "accent" | "tool" | "danger" | "onDark";
const IB_SIZE: Record<IconButtonSize, string> = {
    "2xs": "h-3.5 w-3.5",
    xs: "h-5 w-5",
    sm: "h-6 w-6",
    md: "h-7 w-7",
    lg: "h-8 w-8",
    xl: "h-9 w-9",
};
// Auto-width variant (icon + optional label / stacked swatch): fixed height, min-width, horizontal pad.
const IB_AUTO: Record<IconButtonSize, string> = {
    "2xs": "h-3.5 min-w-3.5 px-1",
    xs: "h-5 min-w-5 px-1",
    sm: "h-6 min-w-6 px-1",
    md: "h-7 min-w-7 px-1",
    lg: "h-8 min-w-8 px-1",
    xl: "h-9 min-w-9 px-1",
};
const IB_TONE: Record<IconButtonTone, string> = {
    muted: "text-muted hover:bg-canvas hover:text-ink",
    soft: "text-soft hover:bg-canvas hover:text-ink",
    ink: "text-ink hover:bg-canvas",
    accent: "text-accent hover:bg-canvas",
    // bordered outline affordance — hovers to accent border + text, no bg fill (pair with `bordered`).
    tool: "text-soft hover:border-accent hover:text-accent",
    // semantic red (matches Button `danger`; set via arbitrary value, not a theme token).
    danger: "text-[#C0392B] hover:bg-[#C0392B]/10",
    onDark: "text-white/80 hover:bg-white/10",
};

export const IconButton: Component<
    JSX.ButtonHTMLAttributes<HTMLButtonElement> & {
        size?: IconButtonSize;
        rounded?: Rounded;
        tone?: IconButtonTone;
        active?: boolean;
        bordered?: boolean;
        auto?: boolean; // auto-width (min-width + horizontal pad) instead of a square box
    }
> = (props) => {
    const [local, rest] = splitProps(props, [
        "size",
        "rounded",
        "tone",
        "active",
        "bordered",
        "auto",
        "class",
        "children",
    ]);
    const activeCls = (): string =>
        local.tone === "onDark" ? "bg-white/15 text-white" : "bg-accent text-onaccent";
    const cls = (): string =>
        [
            "grid place-items-center transition-colors disabled:pointer-events-none disabled:opacity-40",
            (local.auto ? IB_AUTO : IB_SIZE)[local.size ?? "md"],
            ROUNDED[local.rounded ?? "lg"],
            local.active ? activeCls() : IB_TONE[local.tone ?? "muted"],
            local.bordered ? "border border-line" : "",
            local.class ?? "",
        ].join(" ");
    return (
        <button {...rest} class={cls()}>
            {local.children}
        </button>
    );
};

// ── Chip (interactive tag) ──
type ChipSize = "sm" | "md";
const CHIP_SIZE: Record<ChipSize, string> = {
    sm: "px-2.5 py-0.5 text-[11px]",
    md: "px-3 py-1.5 text-[12.5px]",
};
export const Chip: Component<
    JSX.ButtonHTMLAttributes<HTMLButtonElement> & {
        variant?: "outline" | "solid" | "soft";
        size?: ChipSize;
        selected?: boolean;
        rounded?: "md" | "full";
        onRemove?: () => void; // renders a dismiss affordance after the label
    }
> = (props) => {
    const [local, rest] = splitProps(props, [
        "variant",
        "size",
        "selected",
        "rounded",
        "onRemove",
        "class",
        "children",
    ]);
    const cls = (): string => {
        const base = `inline-flex items-center gap-1 ${local.rounded === "md" ? "rounded-md" : "rounded-full"} ${CHIP_SIZE[local.size ?? "sm"]} transition-colors disabled:pointer-events-none disabled:opacity-40`;
        const tone =
            local.variant === "solid"
                ? `font-semibold ${local.selected ? "bg-accent text-onaccent" : "bg-canvas text-soft hover:text-ink"}`
                : local.variant === "soft"
                  ? `font-medium ${local.selected ? "bg-accent/12 text-accent" : "text-soft hover:text-ink"}`
                  : `border font-medium ${local.selected ? "border-accent text-ink" : "border-line text-muted hover:border-accent hover:text-ink"}`;
        return `${base} ${tone} ${local.class ?? ""}`;
    };
    return (
        <button type="button" {...rest} class={cls()}>
            {local.children}
            <Show when={local.onRemove}>
                <span
                    role="button"
                    aria-label="Remove"
                    class="-mr-0.5 ml-0.5 leading-none opacity-60 hover:opacity-100"
                    onClick={(e) => {
                        e.stopPropagation();
                        local.onRemove!();
                    }}
                >
                    ×
                </span>
            </Show>
        </button>
    );
};

// ── Badge (static marker) ──
type BadgeTone = "accentSoft" | "accentSolid" | "muted" | "outline";
const BADGE_TONE: Record<BadgeTone, string> = {
    accentSoft: "bg-accent/15 text-accent",
    accentSolid: "bg-accent text-onaccent",
    muted: "bg-canvas text-muted",
    outline: "border border-line text-muted",
};
type BadgeSize = "xs" | "sm" | "md";
const BADGE_SIZE: Record<BadgeSize, string> = {
    xs: "px-1.5 py-px text-[9px]",
    sm: "px-2 py-0.5 text-[10px]",
    md: "px-2.5 py-0.5 text-[11px]",
};
export const Badge: Component<{
    tone?: BadgeTone;
    size?: BadgeSize;
    uppercase?: boolean;
    weight?: "medium" | "semibold";
    children: JSX.Element;
}> = (props) => (
    <span
        class={`inline-flex items-center rounded-full ${BADGE_SIZE[props.size ?? "sm"]} ${
            props.weight === "medium" ? "font-medium" : "font-semibold"
        } ${props.uppercase ? "uppercase tracking-[0.1em]" : ""} ${BADGE_TONE[props.tone ?? "accentSoft"]}`}
    >
        {props.children}
    </span>
);

// ── Eyebrow (mono uppercase label) ──
type Tracking = "wide" | "wider" | "widest";
const TRACKING: Record<Tracking, string> = {
    wide: "tracking-[0.12em]",
    wider: "tracking-[0.14em]",
    widest: "tracking-[0.16em]",
};
const EYEBROW_WEIGHT: Record<"normal" | "medium" | "semibold", string> = {
    normal: "font-normal",
    medium: "font-medium",
    semibold: "font-semibold",
};
export const Eyebrow: Component<{
    tracking?: Tracking;
    size?: number;
    as?: "span" | "div";
    mono?: boolean; // default true; false → sans (studio labels)
    weight?: "normal" | "medium" | "semibold"; // default semibold
    tone?: "muted" | "soft"; // default muted
    class?: string;
    children: JSX.Element;
}> = (props) => (
    <Dynamic
        component={props.as ?? "span"}
        class={`${props.mono === false ? "" : "font-mono"} ${EYEBROW_WEIGHT[props.weight ?? "semibold"]} uppercase ${props.tone === "soft" ? "text-soft" : "text-muted"} ${TRACKING[props.tracking ?? "wide"]} ${props.class ?? ""}`}
        style={{ "font-size": `${props.size ?? 10}px` }}
    >
        {props.children}
    </Dynamic>
);
