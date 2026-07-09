import type { Component, JSX } from "solid-js";
import { createEffect, createMemo, createSignal, For, onCleanup, Show } from "solid-js";
import { Popover } from "./overlay";

// A theme-aware dropdown replacing native <select> — the menu is a portaled Popover (theme-snapshotted,
// bottom-flipping), keyboard-navigable. `toolbar` keeps an inline text editor alive when used mid-edit.

const chevron = (): JSX.Element => (
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
const check = (): JSX.Element => (
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
    toolbar?: boolean;
}> = (props) => {
    const [open, setOpen] = createSignal(false);
    const [cursor, setCursor] = createSignal(0);
    let trigger!: HTMLButtonElement;

    const currentOpt = createMemo(() => props.options.find((o) => o.value === props.value));
    const current = (): string => currentOpt()?.label ?? props.placeholder ?? props.value;
    const fontStyle = (f?: string): { "font-family": string } | undefined =>
        f ? { "font-family": `'${f}'` } : undefined;

    const openMenu = (): void => {
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

    // Arrow/Enter navigation while open (Popover already handles Escape + dismiss).
    createEffect(() => {
        if (!open()) return;
        const onKey = (e: KeyboardEvent): void => {
            if (e.key === "ArrowDown") {
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
                {chevron()}
            </button>
            <Popover
                anchor={() => trigger}
                open={open()}
                onClose={() => setOpen(false)}
                estHeight={Math.min(props.options.length * 34 + 8, 300)}
                minWidth={140}
                toolbar={props.toolbar}
                panelClass="max-h-[300px] overflow-y-auto p-1"
            >
                <For each={props.options}>
                    {(o, i) => (
                        <button
                            type="button"
                            class={`flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[13px] transition-colors ${
                                o.value === props.value ? "font-semibold text-accent" : "text-ink"
                            } ${i() === cursor() ? "bg-canvas" : "hover:bg-canvas"}`}
                            onMouseEnter={() => setCursor(i())}
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => pick(o.value)}
                        >
                            <span class="min-w-0 flex-1 truncate" style={fontStyle(o.font)}>
                                {o.label}
                            </span>
                            <Show when={o.value === props.value}>{check()}</Show>
                        </button>
                    )}
                </For>
            </Popover>
        </>
    );
};

export const SelectField: Component<{
    value: string;
    options: { label: string; value: string }[];
    onChange: (v: string) => void;
    compact?: boolean;
    toolbar?: boolean; // keeps an inline text editor alive when used mid-edit
}> = (props) => (
    <Dropdown
        value={props.value}
        options={props.options}
        onChange={props.onChange}
        compact={props.compact}
        toolbar={props.toolbar}
    />
);
