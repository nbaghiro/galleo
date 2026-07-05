import type { Component } from "solid-js";
import { createEffect, createMemo, createSignal, For, onCleanup, Show } from "solid-js";
import { Portal } from "solid-js/web";
import type { Tokens } from "@themes/theme";
import { luminance, mix, mixWhite } from "@themes/theme";

// The shared input widgets for the inspector + format bar: a theme-aware Dropdown and the ColorPicker
// (with its on-theme swatch palettes). Both use only theme CSS-var classes, so they match whatever theme
// is active in their DOM context.

// ── Dropdown ─────────────────────────────────────────────────────────────────
// A theme-aware dropdown replacing native <select>. The menu is portaled + fixed-positioned from the
// trigger's rect, so it never clips inside a scrolling panel and isn't mis-placed by transformed
// ancestors (e.g. the translate-x format bar). `data-galleo-toolbar` keeps the inline text editor alive
// when its style dropdown is used mid-edit.
type Rect = { left: number; top: number; width: number; up: boolean };

// The menu is portaled to <body>, escaping the themed studio/app subtree — so the active theme's CSS
// vars don't reach it and it falls back to defaults. We copy the resolved vars off the trigger (which
// lives in the themed context) onto the menu, so its bg + option fonts match the surrounding chrome.
const THEME_VARS = [
    "--color-canvas",
    "--color-panel",
    "--color-line",
    "--color-ink",
    "--color-soft",
    "--color-muted",
    "--color-accent",
    "--color-onaccent",
    "--border-width",
    "--shadow",
    "--radius",
    "--font-display",
    "--font-body",
    "--font-mono",
    "--hw",
];

const readThemeVars = (el: HTMLElement): Record<string, string> => {
    const cs = getComputedStyle(el);
    const out: Record<string, string> = {};
    for (const name of THEME_VARS) {
        const val = cs.getPropertyValue(name).trim();
        if (val) out[name] = val;
    }
    return out;
};

const CHEVRON = (
    <svg
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2.2"
        stroke-linecap="round"
        stroke-linejoin="round"
        class="flex-none text-muted"
    >
        <path d="M6 9l6 6 6-6" />
    </svg>
);
const CHECK = (
    <svg
        width="13"
        height="13"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2.4"
        stroke-linecap="round"
        stroke-linejoin="round"
        class="flex-none"
    >
        <path d="M5 12.5 10 17 19 7" />
    </svg>
);

export const Dropdown: Component<{
    value: string;
    options: { label: string; value: string; font?: string }[];
    onChange: (v: string) => void;
    compact?: boolean;
    placeholder?: string;
}> = (props) => {
    const [open, setOpen] = createSignal(false);
    const [rect, setRect] = createSignal<Rect | null>(null);
    const [vars, setVars] = createSignal<Record<string, string>>({});
    const [cursor, setCursor] = createSignal(0);
    let trigger!: HTMLButtonElement;

    const currentOpt = createMemo(() => props.options.find((o) => o.value === props.value));
    const current = (): string => currentOpt()?.label ?? props.placeholder ?? props.value;
    const fontStyle = (f?: string): { "font-family": string } | undefined =>
        f ? { "font-family": `'${f}'` } : undefined;

    const openMenu = (): void => {
        const r = trigger.getBoundingClientRect();
        const estH = Math.min(props.options.length * 34 + 8, 300);
        const up = r.bottom + estH > window.innerHeight && r.top > estH;
        setRect({ left: r.left, top: up ? r.top - 4 : r.bottom + 4, width: r.width, up });
        setVars(readThemeVars(trigger));
        setCursor(
            Math.max(
                0,
                props.options.findIndex((o) => o.value === props.value),
            ),
        );
        setOpen(true);
    };
    const pick = (v: string): void => {
        props.onChange(v);
        setOpen(false);
    };

    // Keyboard: arrows move the cursor, Enter picks, Esc closes.
    createEffect(() => {
        if (!open()) return;
        const onKey = (e: KeyboardEvent): void => {
            if (e.key === "Escape") {
                e.preventDefault();
                setOpen(false);
            } else if (e.key === "ArrowDown") {
                e.preventDefault();
                setCursor((c) => Math.min(props.options.length - 1, c + 1));
            } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setCursor((c) => Math.max(0, c - 1));
            } else if (e.key === "Enter") {
                e.preventDefault();
                const o = props.options[cursor()];
                if (o) pick(o.value);
            }
        };
        window.addEventListener("keydown", onKey);
        onCleanup(() => window.removeEventListener("keydown", onKey));
    });

    const triggerCls = (): string =>
        props.compact
            ? "flex max-w-[150px] items-center gap-1 rounded-md border border-line bg-canvas px-1.5 py-1 text-[12px] text-ink transition-colors hover:border-accent"
            : "flex w-full items-center justify-between gap-1 rounded-md border border-line bg-canvas px-2 py-1.5 text-[13px] text-ink transition-colors hover:border-accent";

    return (
        <>
            <button
                ref={trigger}
                type="button"
                class={triggerCls()}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => (open() ? setOpen(false) : openMenu())}
            >
                <span
                    class="min-w-0 flex-1 truncate text-left"
                    style={fontStyle(currentOpt()?.font)}
                >
                    {current()}
                </span>
                {CHEVRON}
            </button>
            <Show when={open() && rect()}>
                {(r) => (
                    <Portal>
                        <div
                            data-galleo-toolbar="true"
                            class="fixed inset-0 z-[70]"
                            onPointerDown={() => setOpen(false)}
                        />
                        <div
                            data-galleo-toolbar="true"
                            class="fixed z-[71] max-h-[300px] overflow-y-auto rounded-lg border border-line bg-panel p-1 font-body text-ink shadow-2xl"
                            style={{
                                ...vars(),
                                left: `${r().left}px`,
                                "min-width": `${Math.max(r().width, 140)}px`,
                                ...(r().up
                                    ? { bottom: `${window.innerHeight - r().top}px` }
                                    : { top: `${r().top}px` }),
                            }}
                        >
                            <For each={props.options}>
                                {(o, i) => (
                                    <button
                                        type="button"
                                        class={`flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[13px] transition-colors ${
                                            o.value === props.value
                                                ? "font-semibold text-accent"
                                                : "text-ink"
                                        } ${i() === cursor() ? "bg-canvas" : "hover:bg-canvas"}`}
                                        onMouseEnter={() => setCursor(i())}
                                        onMouseDown={(e) => e.preventDefault()}
                                        onClick={() => pick(o.value)}
                                    >
                                        <span
                                            class="min-w-0 flex-1 truncate"
                                            style={fontStyle(o.font)}
                                        >
                                            {o.label}
                                        </span>
                                        <Show when={o.value === props.value}>{CHECK}</Show>
                                    </button>
                                )}
                            </For>
                        </div>
                    </Portal>
                )}
            </Show>
        </>
    );
};

// ── ColorPicker ──────────────────────────────────────────────────────────────
// The one color-selection UI, shared by the inline text-format popovers (mark color + highlight) and the
// inspector's `color` fields. It renders a row of caller-supplied swatches, a native color well + hex
// readout for anything custom, and an optional remove/reset affordance. `keepFocus` guards mid-edit use
// inside a contenteditable toolbar: swatch/remove mousedown is prevented so the selection stays put,
// while the native well is left focusable so its OS picker can open.

export interface ColorSwatch {
    label?: string;
    color: string;
}

const isHex = (v?: string): boolean => !!v && /^#[0-9a-fA-F]{6}$/.test(v);

export const ColorPicker: Component<{
    value?: string;
    swatches: ColorSwatch[];
    onChange: (value: string | undefined) => void;
    // Discrete pick (a swatch or the remove affordance) — lets a transient popover dismiss itself. The
    // continuous native well fires only `onChange`, so it can keep the popover open for live picking.
    onPick?: () => void;
    // Label for the remove/reset affordance; omit to hide it.
    clearLabel?: string;
    // Keep the remove/reset affordance visible with no value set (popover "Remove" vs inspector "Reset").
    clearWhenEmpty?: boolean;
    // Prevent mousedown-blur on swatches/remove so an external contenteditable keeps focus + selection.
    keepFocus?: boolean;
}> = (props) => {
    const noBlur = (e: MouseEvent): void => {
        if (props.keepFocus) e.preventDefault();
    };
    const showClear = (): boolean =>
        !!props.clearLabel && (props.clearWhenEmpty === true || !!props.value);
    const pick = (value: string | undefined): void => {
        props.onChange(value);
        props.onPick?.();
    };
    return (
        <div class="flex flex-col gap-2">
            <div class="flex flex-wrap gap-1.5">
                <For each={props.swatches}>
                    {(s) => (
                        <button
                            type="button"
                            title={s.label ?? s.color}
                            onMouseDown={noBlur}
                            onClick={() => pick(s.color)}
                            class={`h-6 w-6 rounded-full border transition ${
                                props.value === s.color
                                    ? "border-accent ring-2 ring-accent/40"
                                    : "border-line hover:scale-110"
                            }`}
                            style={{ background: s.color }}
                        />
                    )}
                </For>
            </div>
            <div class="flex items-center gap-2">
                <label class="relative h-7 w-9 flex-none cursor-pointer overflow-hidden rounded border border-line">
                    <span
                        class="block h-full w-full"
                        style={{ background: props.value ?? "#000" }}
                    />
                    <input
                        type="color"
                        class="absolute inset-0 cursor-pointer opacity-0"
                        value={isHex(props.value) ? props.value : "#000000"}
                        onInput={(e) => props.onChange(e.currentTarget.value)}
                    />
                </label>
                <span class="min-w-0 flex-1 truncate font-mono text-[12px] text-muted">
                    {props.value ?? "—"}
                </span>
                <Show when={showClear()}>
                    <button
                        type="button"
                        title={props.clearLabel}
                        onMouseDown={noBlur}
                        onClick={() => pick(undefined)}
                        class="flex-none text-[11px] font-semibold text-muted hover:text-ink"
                    >
                        {props.clearLabel}
                    </button>
                </Show>
            </div>
        </div>
    );
};

// ── on-theme palettes ────────────────────────────────────────────────────────

// Text-color swatches: the theme's own readable ink/accent/soft/muted/surface tokens plus a deepened and
// a lightened accent, so overrides stay on-palette.
export function textColorSwatches(t: Tokens): ColorSwatch[] {
    return [
        { label: "Ink", color: t.ink },
        { label: "Accent", color: t.accent },
        { label: "Deep accent", color: mix(t.accent, t.ink, 0.45) },
        { label: "Light accent", color: mixWhite(t.accent, 0.35) },
        { label: "Soft", color: t.soft },
        { label: "Muted", color: t.muted },
        { label: "Surface", color: t.surface },
    ];
}

// A small set of on-brand highlight hues — the theme accent plus amber/green/blue/pink/violet.
const HL_HUES = ["#f59e0b", "#10b981", "#3b82f6", "#ec4899", "#8b5cf6"];

// Highlight swatches: each hue tinted toward the theme's surface so it harmonizes and stays legible
// under the ink text. On light themes this yields soft pastels; on dark themes, muted low-key tints
// (light ink still reads on top).
export function highlightSwatches(t: Tokens): ColorSwatch[] {
    const toward = luminance(t.surface) < 0.5 ? 0.52 : 0.66;
    return [t.accent, ...HL_HUES].map((hue) => ({ color: mix(hue, t.surface, toward) }));
}
