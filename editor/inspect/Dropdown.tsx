import type { Component } from "solid-js";
import { createEffect, createMemo, createSignal, For, onCleanup, Show } from "solid-js";
import { Portal } from "solid-js/web";

// A theme-aware dropdown replacing native <select>. It uses only theme CSS-var classes, so it matches
// whatever theme is active in its DOM context (the studio's artifact theme or the app's app theme). The
// menu is portaled + fixed-positioned from the trigger's rect, so it never clips inside a scrolling
// panel and isn't mis-placed by transformed ancestors (e.g. the translate-x format bar). `data-galleo-
// toolbar` keeps the inline text editor alive when its style dropdown is used mid-edit.
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
