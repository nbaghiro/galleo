import type { Component, JSX } from "solid-js";
import { createContext, createSignal, useContext } from "solid-js";
import { Popover } from "./overlay";
import { Eyebrow } from "./button";

// Anchored action menus — the Topbar / library dropdowns. `Menu` owns the open state + trigger ref +
// Popover; `MenuItem`/`MenuLabel`/`MenuSeparator` are the rows. Built on Popover so every menu is portaled
// (clip-safe), theme-snapshotted, backdrop-+Esc-dismissable, and flips up near the viewport bottom — the
// chrome no view should re-implement. Clicking a MenuItem closes the menu (via context); non-item content
// (e.g. a rename input) stays open.

const MenuCloseContext = createContext<() => void>();

export const Menu: Component<{
    // The trigger renders the anchor button: wire `ref` to it and `toggle` to its click.
    trigger: (o: {
        open: boolean;
        toggle: () => void;
        ref: (el: HTMLElement) => void;
    }) => JSX.Element;
    align?: "start" | "end"; // right-align (end) for menus that hang off a right-edge trigger
    width?: number; // fixed panel width
    minWidth?: number;
    estHeight?: number;
    toolbar?: boolean; // keep an inline text editor alive when used mid-edit
    panelClass?: string;
    children: JSX.Element;
}> = (props) => {
    const [open, setOpen] = createSignal(false);
    let anchor: HTMLElement | undefined;
    return (
        <>
            {props.trigger({
                open: open(),
                toggle: () => setOpen((o) => !o),
                ref: (el) => (anchor = el),
            })}
            <Popover
                anchor={() => anchor}
                open={open()}
                onClose={() => setOpen(false)}
                align={props.align}
                fixedWidth={props.width}
                minWidth={props.minWidth}
                estHeight={props.estHeight}
                toolbar={props.toolbar}
                panelClass={`p-1.5 ${props.panelClass ?? ""}`}
            >
                <MenuCloseContext.Provider value={() => setOpen(false)}>
                    {props.children}
                </MenuCloseContext.Provider>
            </Popover>
        </>
    );
};

type ItemTone = "default" | "accent" | "danger";
export const MenuItem: Component<{
    icon?: JSX.Element;
    tone?: ItemTone;
    selected?: boolean; // current/checked row (accent, semibold)
    disabled?: boolean;
    trailing?: JSX.Element; // right-aligned meta (e.g. a "saved" tag)
    onClick?: () => void;
    children: JSX.Element;
}> = (props) => {
    const close = useContext(MenuCloseContext);
    const tone = (): string =>
        props.selected
            ? "font-semibold text-accent"
            : props.tone === "danger"
              ? "text-[#C0392B] hover:bg-[#C0392B]/10"
              : props.tone === "accent"
                ? "text-accent hover:bg-canvas"
                : "text-soft hover:bg-canvas hover:text-ink";
    return (
        <button
            type="button"
            disabled={props.disabled}
            class={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-[13px] transition-colors disabled:pointer-events-none disabled:opacity-40 ${tone()}`}
            onClick={() => {
                props.onClick?.();
                close?.();
            }}
        >
            {props.icon}
            <span class="min-w-0 flex-1 truncate">{props.children}</span>
            {props.trailing}
        </button>
    );
};

// The mono-uppercase section label inside a menu (= Eyebrow, pre-padded to align with the rows).
export const MenuLabel: Component<{ children: JSX.Element }> = (props) => (
    <Eyebrow as="div" tracking="wide" class="px-2.5 pb-1 pt-1">
        {props.children}
    </Eyebrow>
);

export const MenuSeparator: Component = () => <div class="my-1 h-px bg-line" />;
