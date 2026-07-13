import type { Component, JSX } from "solid-js";
import { createContext, createSignal, onMount, useContext } from "solid-js";
import { Popover } from "./overlay";
import { Eyebrow } from "./button";

const MenuCloseContext = createContext<() => void>();

export const Menu: Component<{
    trigger: (o: {
        open: boolean;
        toggle: () => void;
        ref: (el: HTMLElement) => void;
    }) => JSX.Element;
    align?: "start" | "end";
    width?: number;
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
                    <MenuList>{props.children}</MenuList>
                </MenuCloseContext.Provider>
            </Popover>
        </>
    );
};

// ↑/↓ wrap focus between menuitems; Enter/Space activate natively (button).
// Exclusive Popover scope keeps these arrows from being shadowed by page shortcuts.
const MenuList: Component<{ children: JSX.Element }> = (props) => {
    let el!: HTMLDivElement;
    onMount(() => {
        el.querySelector<HTMLElement>('[role="menuitem"]:not([disabled])')?.focus();
    });
    const onKeyDown = (e: KeyboardEvent): void => {
        if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
        e.preventDefault();
        const items = Array.from(
            el.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])'),
        );
        if (!items.length) return;
        const i = items.indexOf(document.activeElement as HTMLElement);
        const n =
            e.key === "ArrowDown" ? (i + 1) % items.length : (i - 1 + items.length) % items.length;
        items[n]?.focus();
    };
    return (
        <div ref={el} role="menu" onKeyDown={onKeyDown}>
            {props.children}
        </div>
    );
};

type ItemTone = "default" | "accent" | "danger";
export const MenuItem: Component<{
    icon?: JSX.Element;
    tone?: ItemTone;
    selected?: boolean;
    disabled?: boolean;
    trailing?: JSX.Element;
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
            role="menuitem"
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

export const MenuLabel: Component<{ children: JSX.Element }> = (props) => (
    <Eyebrow as="div" tracking="wide" class="px-2.5 pb-1 pt-1">
        {props.children}
    </Eyebrow>
);

export const MenuSeparator: Component = () => <div class="my-1 h-px bg-line" />;
