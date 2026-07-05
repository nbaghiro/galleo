import type { Component } from "solid-js";
import { createEffect, createMemo, createSignal, For, onCleanup, Show } from "solid-js";
import { Portal } from "solid-js/web";

// App-local copy of the two themed input widgets the app needs (Dropdown + ColorPopover), so app views
// don't reach into `@editor/inspect/*` (a layering leak — editor sits below app). Deliberately duplicated
// for now; the plan to unify these into a shared `@ui` module lives in .docs/ui-component-library.md.
// Both are self-contained (Solid only, no theme import) — they read the active theme's CSS vars off the
// trigger and copy them onto the portaled menu so it matches the surrounding chrome.

type Rect = { left: number; top: number; width: number; up: boolean };

// The menu is portaled to <body>, escaping the themed subtree, so we snapshot the resolved theme vars off
// the trigger and re-apply them on the menu (bg + fonts match the chrome).
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

// A theme-aware dropdown replacing native <select>, portaled + fixed-positioned from the trigger's rect.
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
                        <div class="fixed inset-0 z-[70]" onPointerDown={() => setOpen(false)} />
                        <div
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

export interface ColorSwatch {
    label?: string;
    color: string;
}

const isHex = (v?: string): boolean => !!v && /^#[0-9a-fA-F]{6}$/.test(v);

// A color control as a popup: a compact swatch trigger opening a portaled, theme-matched panel with quick
// swatches, a native well, and an editable hex — any custom color is reachable.
export const ColorPopover: Component<{
    value?: string;
    swatches?: ColorSwatch[];
    onChange: (value: string | undefined) => void;
    clearLabel?: string;
}> = (props) => {
    const [open, setOpen] = createSignal(false);
    const [rect, setRect] = createSignal<Rect | null>(null);
    const [vars, setVars] = createSignal<Record<string, string>>({});
    let trigger!: HTMLButtonElement;

    const openMenu = (): void => {
        const r = trigger.getBoundingClientRect();
        const estH = 190;
        const up = r.bottom + estH > window.innerHeight && r.top > estH;
        setRect({ left: r.left, top: up ? r.top - 4 : r.bottom + 4, width: r.width, up });
        setVars(readThemeVars(trigger));
        setOpen(true);
    };

    createEffect(() => {
        if (!open()) return;
        const onKey = (e: KeyboardEvent): void => {
            if (e.key === "Escape") setOpen(false);
        };
        window.addEventListener("keydown", onKey);
        onCleanup(() => window.removeEventListener("keydown", onKey));
    });

    const pick = (v: string | undefined): void => {
        props.onChange(v);
        setOpen(false);
    };

    return (
        <>
            <button
                ref={trigger}
                type="button"
                class="flex items-center gap-2 rounded-md border border-line bg-canvas px-1.5 py-1 transition-colors hover:border-accent"
                onClick={() => (open() ? setOpen(false) : openMenu())}
            >
                <span
                    class="h-4 w-4 flex-none rounded"
                    style={{
                        background: props.value ?? "transparent",
                        "box-shadow": "inset 0 0 0 1px rgba(0,0,0,.15)",
                    }}
                />
                <span class="font-mono text-[10px] text-muted">
                    {props.value?.toUpperCase() ?? "—"}
                </span>
            </button>
            <Show when={open() && rect()}>
                {(r) => (
                    <Portal>
                        <div class="fixed inset-0 z-[70]" onPointerDown={() => setOpen(false)} />
                        <div
                            class="fixed z-[71] w-[228px] rounded-lg border border-line bg-panel p-2.5 font-body text-ink shadow-2xl"
                            style={{
                                ...vars(),
                                left: `${Math.max(8, Math.min(r().left, window.innerWidth - 240))}px`,
                                ...(r().up
                                    ? { bottom: `${window.innerHeight - r().top}px` }
                                    : { top: `${r().top}px` }),
                            }}
                        >
                            <Show when={props.swatches?.length}>
                                <div class="mb-2.5 flex flex-wrap gap-1.5">
                                    <For each={props.swatches}>
                                        {(s) => (
                                            <button
                                                type="button"
                                                title={s.label ?? s.color}
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
                            </Show>
                            <div class="flex items-center gap-2">
                                <label class="relative h-8 w-10 flex-none cursor-pointer overflow-hidden rounded border border-line">
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
                                <input
                                    type="text"
                                    class="min-w-0 flex-1 rounded-md border border-line bg-canvas px-2 py-1.5 font-mono text-[12px] text-ink outline-none focus:border-accent"
                                    value={props.value ?? ""}
                                    placeholder="#rrggbb"
                                    spellcheck={false}
                                    onInput={(e) => {
                                        const v = e.currentTarget.value.trim();
                                        if (isHex(v)) props.onChange(v);
                                    }}
                                />
                            </div>
                            <Show when={props.clearLabel}>
                                <button
                                    type="button"
                                    class="mt-2 w-full rounded-md py-1 text-[11px] font-semibold text-muted hover:text-ink"
                                    onClick={() => pick(undefined)}
                                >
                                    {props.clearLabel}
                                </button>
                            </Show>
                        </div>
                    </Portal>
                )}
            </Show>
        </>
    );
};
