import type { Component, JSX } from "solid-js";
import {
    createContext,
    createEffect,
    createSignal,
    onCleanup,
    onMount,
    Show,
    splitProps,
    useContext,
} from "solid-js";
import { Dynamic, Portal } from "solid-js/web";
import { Button, IconButton } from "./button";
import { OWNER_ATTR } from "./gesture";
import { CloseIcon } from "./icons";
import { installKeyDispatcher, pushScope } from "./keys";
import { trapFocus } from "./focus";
import { isCoarsePointer, isPhone } from "./viewport";
import { Z } from "./z";

// A portaled panel escapes the themed subtree, so copy the theme vars off the anchor onto it.
type Rect = { left: number; top: number; width: number; up: boolean };

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
    "--radius-xs",
    "--radius-sm",
    "--radius-md",
    "--radius-lg",
    "--radius-xl",
    "--radius-2xl",
    "--radius-3xl",
    "--font-display",
    "--font-body",
    "--font-mono",
    "--hw",
];

function readThemeVars(el: HTMLElement): Record<string, string> {
    const cs = getComputedStyle(el);
    const out: Record<string, string> = {};
    for (const name of THEME_VARS) {
        const val = cs.getPropertyValue(name).trim();
        if (val) out[name] = val;
    }
    return out;
}

const OwnerContext = createContext<string>();

// Names the surface everything inside belongs to, so a popover opened from it stays attributable
// once it portals away (see OWNER_ATTR in ./gesture). Context, not a prop chained through Menu and
// Dropdown: a nested popover is still rendered inside this scope, so ownership inherits by itself.
export const OverlayOwner: Component<{ token: string; children: JSX.Element }> = (props) => (
    <OwnerContext.Provider value={props.token}>{props.children}</OwnerContext.Provider>
);

// Portaled + fixed off the anchor, so it never clips in a scroller or shifts under a transform.
// `toolbar` tags nodes with `data-galleo-toolbar` so an inline text editor stays alive mid-edit.
export const Popover: Component<{
    anchor?: () => HTMLElement | undefined; // element anchor (menus/dropdowns)
    at?: () => { x: number; y: number } | undefined; // cursor/point anchor (context menus)
    open: boolean;
    onClose: () => void;
    estHeight?: number;
    minWidth?: number; // min-width = max(anchorWidth, minWidth); ignored when fixedWidth is set
    fixedWidth?: number; // panel is exactly this wide, left clamped into the viewport
    align?: "start" | "end" | "center"; // edge/center aligned to the anchor (default start = left; center needs fixedWidth)
    panelClass?: string;
    bare?: boolean; // the consumer paints its own surface, so drop the panel chrome
    toolbar?: boolean;
    children: JSX.Element;
}> = (props) => {
    const [rect, setRect] = createSignal<Rect | null>(null);
    const [vars, setVars] = createSignal<Record<string, string>>({});
    const owner = useContext(OwnerContext);

    createEffect(() => {
        if (!props.open) return;
        const estH = props.estHeight ?? 240;
        const pt = props.at?.();
        if (pt) {
            const up = pt.y + estH > window.innerHeight && pt.y > estH;
            const w = props.fixedWidth ?? props.minWidth ?? 180;
            const left = Math.max(8, Math.min(pt.x, window.innerWidth - w - 8));
            setRect({ left, top: pt.y, width: 0, up });
            // The element under the point is inside the themed tree; <html> carries no theme vars.
            const under = document.elementFromPoint(pt.x, pt.y) as HTMLElement | null;
            setVars(readThemeVars(props.anchor?.() ?? under ?? document.documentElement));
            return;
        }
        const el = props.anchor?.();
        if (!el) return;
        const r = el.getBoundingClientRect();
        const up = r.bottom + estH > window.innerHeight && r.top > estH;
        setRect({ left: r.left, top: up ? r.top - 4 : r.bottom + 4, width: r.width, up });
        setVars(readThemeVars(el));
    });

    // Exclusive so the menu's own arrow/enter keys aren't shadowed by shortcuts underneath.
    createEffect(() => {
        if (!props.open) return;
        installKeyDispatcher();
        onCleanup(pushScope("popover", { exclusive: true, onEscape: () => props.onClose() }));
    });

    // Element fullscreen paints the fullscreen subtree and nothing else, so a panel portaled to
    // <body> over a fullscreen present surface is in the DOM and simply never appears. Read as the
    // Portal is created, which is the moment the panel opens.
    const portalMount = (): Node => document.fullscreenElement ?? document.body;

    // both portaled nodes carry it: pressing the scrim dismisses this popover, not whatever owns it
    const stamp = (): Record<string, string> => ({
        ...(props.toolbar ? { "data-galleo-toolbar": "true" } : {}),
        ...(owner ? { [OWNER_ATTR]: owner } : {}),
    });

    return (
        <Show when={props.open && rect()}>
            {(r) => (
                <Portal mount={portalMount()}>
                    <div
                        {...stamp()}
                        class="fixed inset-0 z-popover"
                        onPointerDown={() => props.onClose()}
                    />
                    <div
                        {...stamp()}
                        class={`fixed z-popover overflow-y-auto font-body text-ink ${props.bare ? "" : "rounded-lg border border-line bg-panel shadow-2xl"} ${props.panelClass ?? ""}`}
                        style={{
                            ...vars(),
                            // end = right-edge aligned; center (needs fixedWidth) = anchor midpoint; else left, all clamped.
                            ...(props.align === "end"
                                ? {
                                      right: `${Math.max(8, window.innerWidth - (r().left + r().width))}px`,
                                  }
                                : props.align === "center" && props.fixedWidth
                                  ? {
                                        left: `${Math.max(8, Math.min(r().left + r().width / 2 - props.fixedWidth / 2, window.innerWidth - props.fixedWidth - 8))}px`,
                                    }
                                  : {
                                        left: `${
                                            props.fixedWidth
                                                ? Math.max(
                                                      8,
                                                      Math.min(
                                                          r().left,
                                                          window.innerWidth - props.fixedWidth - 12,
                                                      ),
                                                  )
                                                : r().left
                                        }px`,
                                    }),
                            ...(props.fixedWidth
                                ? { width: `${props.fixedWidth}px` }
                                : {
                                      "min-width": `${Math.max(r().width, props.minWidth ?? 140)}px`,
                                  }),
                            // Pin to the open side and cap height to the space available there so it never runs off-screen.
                            ...(r().up
                                ? {
                                      bottom: `${window.innerHeight - r().top}px`,
                                      "max-height": `${Math.max(120, r().top - 12)}px`,
                                  }
                                : {
                                      top: `${r().top}px`,
                                      "max-height": `${Math.max(120, window.innerHeight - r().top - 12)}px`,
                                  }),
                        }}
                    >
                        {props.children}
                    </div>
                </Portal>
            )}
        </Show>
    );
};

// Inline (not portaled) so it inherits the theme; `vars` stamps a snapshot outside a themed tree.
type ModalSize = "sm" | "md" | "lg" | "xl" | "full" | "screen";
const MODAL_W: Record<ModalSize, string> = {
    sm: "max-w-100",
    md: "max-w-130",
    lg: "max-w-180",
    xl: "max-w-240",
    full: "max-w-380",
    screen: "max-w-none h-full",
};
// "screen" fills the viewport, so the inset padding, radius and border would only cut into it
const SCREEN = "screen" as const;
type Scrim = "dim" | "blur" | "light";
const SCRIM: Record<Scrim, string> = {
    dim: "bg-black/50",
    blur: "bg-black/45 backdrop-blur-sm",
    light: "bg-black/25",
};
type Surface = "panel" | "canvas";
const SURFACE: Record<Surface, string> = { panel: "bg-panel", canvas: "bg-canvas" };

const ModalCloseCtx = createContext<() => void>();

export const Modal: Component<{
    onClose: () => void;
    size?: ModalSize;
    scrim?: Scrim;
    surface?: Surface;
    /** "inline": the consumer places <ModalClose /> in its own topbar row instead of the floating X */
    close?: "floating" | "inline";
    z?: number;
    animate?: boolean;
    vars?: JSX.CSSProperties;
    class?: string;
    children: JSX.Element;
}> = (props) => {
    let panel!: HTMLDivElement;
    // big surfaces take the whole phone screen; small alerts stay centered cards
    const phoneFull = (): boolean => isPhone() && ["lg", "xl", "full"].includes(props.size ?? "md");
    onMount(() => {
        const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
        if (props.animate !== false && !reduced) {
            const entrance = panel.animate(
                [
                    { opacity: 0, transform: "translateY(8px) scale(0.98)" },
                    { opacity: 1, transform: "none" },
                ],
                { duration: 190, easing: "cubic-bezier(.2,.7,.2,1)", fill: "both" },
            );
            // release it once settled: a filling transform animation keeps the panel a containing
            // block for fixed descendants, which re-anchors a nested Modal to this panel instead of
            // the viewport (the final frame is the natural style, so cancelling is invisible)
            entrance.finished.then(
                () => entrance.cancel(),
                () => undefined,
            );
        }
        installKeyDispatcher();
        const disposeScope = pushScope("modal", {
            exclusive: true,
            onEscape: () => props.onClose(),
        });
        const disposeTrap = trapFocus(panel);
        onCleanup(() => {
            disposeScope();
            disposeTrap();
        });
    });
    return (
        <div
            class="fixed inset-0 flex items-center justify-center text-ink"
            classList={{ "p-4": props.size !== SCREEN && !phoneFull() }}
            style={{ "z-index": props.z ?? Z.modal, ...(props.vars ?? {}) }}
        >
            <div
                class={`absolute inset-0 ${SCRIM[props.scrim ?? "blur"]}`}
                onClick={() => props.onClose()}
            />
            <div
                ref={panel}
                role="dialog"
                aria-modal="true"
                tabindex="-1"
                class={`relative w-full outline-none ${phoneFull() ? "h-full max-w-none" : MODAL_W[props.size ?? "md"]} ${SURFACE[props.surface ?? "panel"]} ${props.class ?? ""}`}
                classList={{
                    "rounded-2xl border border-line shadow-2xl":
                        props.size !== SCREEN && !phoneFull(),
                }}
            >
                <ModalCloseCtx.Provider value={() => props.onClose()}>
                    {props.children}
                </ModalCloseCtx.Provider>
                {/* phone chrome, kept everywhere on the scrimless "screen" size; desktop cards
                    close by Escape or the scrim. Consumers never add their own — a surface with
                    its own topbar places this same button in the row via <ModalClose />. */}
                <Show when={props.close !== "inline" && (isPhone() || props.size === SCREEN)}>
                    <IconButton
                        size={isCoarsePointer() ? "touch" : "lg"}
                        tone="muted"
                        rounded="md"
                        class="absolute right-2 top-2 z-20"
                        title="Close"
                        onClick={() => props.onClose()}
                    >
                        <CloseIcon size={15} />
                    </IconButton>
                </Show>
            </div>
        </div>
    );
};

// The Modal-owned close, for close="inline": sits in the consumer's topbar row so it centers and
// sizes with the row's other controls instead of floating over them.
export const ModalClose: Component = () => {
    const close = useContext(ModalCloseCtx);
    return (
        <IconButton
            size={isCoarsePointer() ? "touch" : "lg"}
            tone="muted"
            rounded="md"
            class="flex-none"
            title="Close"
            onClick={() => close?.()}
        >
            <CloseIcon size={15} />
        </IconButton>
    );
};

export const ConfirmModal: Component<{
    title: string;
    body: JSX.Element;
    confirmLabel: string;
    onConfirm: () => void;
    onCancel: () => void;
    danger?: boolean;
    busy?: boolean;
    vars?: JSX.CSSProperties;
}> = (props) => (
    <Modal
        size="sm"
        scrim="dim"
        vars={props.vars}
        class="p-6"
        onClose={() => !props.busy && props.onCancel()}
    >
        <h2 class="font-display text-[18px] font-semibold text-ink">{props.title}</h2>
        <p class="mt-2 text-[13.5px] leading-relaxed text-soft">{props.body}</p>
        <div class="mt-5 flex justify-end gap-2.5">
            <Button variant="outline" disabled={props.busy} onClick={() => props.onCancel()}>
                Cancel
            </Button>
            <Button
                variant={props.danger ? "danger" : "primary"}
                loading={props.busy}
                onClick={() => props.onConfirm()}
            >
                {props.confirmLabel}
            </Button>
        </div>
    </Modal>
);

type BarTone = "dark" | "panel";
const BAR_TONE: Record<BarTone, string> = {
    dark: "border border-white/10 bg-black/55 text-white/80",
    panel: "border border-line bg-panel/95 text-ink",
};
type BarRounded = "lg" | "xl" | "2xl" | "full";
const BAR_ROUNDED: Record<BarRounded, string> = {
    lg: "rounded-lg",
    xl: "rounded-xl",
    "2xl": "rounded-2xl",
    full: "rounded-full",
};
type BarShadow = "none" | "lg" | "2xl";
const BAR_SHADOW: Record<BarShadow, string> = { none: "", lg: "shadow-lg", "2xl": "shadow-2xl" };
// Content tokens for a FloatingBar's own row: shared by the editor's section pill and the generation
// studio's outline pill, so the two read as one control surface. icon-row (ui/styles.css) drops the
// icon onto the label's optical center in whatever body font the active theme sets.
export const barAction =
    "inline-flex icon-row gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold text-ink hover:bg-canvas disabled:pointer-events-none disabled:opacity-40";
// the bar's one call to action; same metrics as barAction so it sits level with its neighbours
export const barPrimaryAction =
    "inline-flex icon-row gap-1.5 whitespace-nowrap rounded-full bg-accent px-2.5 py-1 text-[11px] font-semibold text-onaccent hover:opacity-90 disabled:pointer-events-none disabled:opacity-40";
export const barIconAction = "inline-flex items-center rounded-full p-1.5 text-ink hover:bg-canvas";
// stacked chevrons share one slot, so this stays tight rather than a full icon button
export const barStepAction =
    "flex items-center justify-center rounded px-1 leading-none text-muted hover:bg-canvas hover:text-ink disabled:pointer-events-none disabled:opacity-30";
export const barDangerAction =
    "inline-flex items-center rounded-full p-1.5 text-ink hover:bg-red-500/12 hover:text-red-500";

export const FloatingBar: Component<
    JSX.HTMLAttributes<HTMLDivElement> & {
        tone?: BarTone;
        anchor?: "bottomCenter" | "center" | "free";
        rounded?: BarRounded;
        pad?: "sm" | "md" | "lg";
        gap?: "0.5" | "1";
        shadow?: BarShadow;
    }
> = (props) => {
    const [local, rest] = splitProps(props, [
        "tone",
        "anchor",
        "rounded",
        "pad",
        "gap",
        "shadow",
        "class",
        "children",
    ]);
    const anchor = (): string =>
        local.anchor === "free"
            ? ""
            : local.anchor === "center"
              ? "absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
              : // auto-margin centring, not left-1/2: that shrink-to-fits against half the viewport
                "absolute inset-x-3 bottom-[calc(1.25rem+env(safe-area-inset-bottom))] mx-auto w-fit";
    const shadow = (): string =>
        BAR_SHADOW[local.shadow ?? (local.tone === "panel" ? "2xl" : "none")];
    const pad = (): string =>
        local.pad === "sm" ? "p-1" : local.pad === "lg" ? "px-5 py-3" : "px-2 py-1.5";
    return (
        <div
            {...rest}
            class={`flex items-center ${local.gap === "0.5" ? "gap-0.5" : "gap-1"} backdrop-blur-md ${pad()} ${BAR_ROUNDED[local.rounded ?? "xl"]} ${BAR_TONE[local.tone ?? "dark"]} ${shadow()} ${anchor()} ${local.class ?? ""}`}
        >
            {local.children}
        </div>
    );
};

// Inline surface shell, the panel counterpart to FloatingBar; positioning is the consumer's.
type PanelPad = "none" | "sm" | "md" | "lg";
const PANEL_PAD: Record<PanelPad, string> = {
    none: "",
    sm: "p-1.5",
    md: "p-3",
    lg: "p-4.5",
};
type PanelRounded = "lg" | "xl" | "2xl";
const PANEL_ROUNDED: Record<PanelRounded, string> = {
    lg: "rounded-lg",
    xl: "rounded-xl",
    "2xl": "rounded-2xl",
};
/**
 * Non-modal bottom sheet — phone chrome for surfaces that float as panels on wider tiers.
 * No scrim: the content above stays interactive (tap the canvas to reselect while it's open).
 * Positioned fixed, so it must render inside the themed subtree to inherit the CSS vars.
 */
export const Sheet: Component<{
    open: boolean;
    onClose: () => void;
    title: string;
    /** fix the height at half the viewport (lists that should not jump as they filter) */
    tall?: boolean;
    class?: string;
    children: JSX.Element;
}> = (props) => (
    <Show when={props.open}>
        <section
            class={`fixed inset-x-0 bottom-0 z-panel flex flex-col rounded-t-2xl border-t border-line bg-panel pb-[env(safe-area-inset-bottom)] shadow-2xl ${
                props.tall ? "h-[55dvh]" : "max-h-[55dvh]"
            } ${props.class ?? ""}`}
        >
            <header class="flex flex-none items-center justify-between gap-2 border-b border-line py-1 pl-4 pr-2">
                <span class="text-[12px] font-semibold text-ink">{props.title}</span>
                <IconButton
                    size="touch"
                    tone="muted"
                    rounded="md"
                    title="Close"
                    onClick={() => props.onClose()}
                >
                    <CloseIcon size={15} />
                </IconButton>
            </header>
            <div class="min-h-0 flex-1 overflow-y-auto p-4">{props.children}</div>
        </section>
    </Show>
);

export const FloatingPanel: Component<
    JSX.HTMLAttributes<HTMLElement> & {
        as?: "div" | "aside";
        pad?: PanelPad;
        rounded?: PanelRounded;
        shadow?: "panel" | "2xl" | "lg"; // panel = var(--panel-shadow) studio chrome; else a plain lift
        bg?: "solid" | "translucent";
    }
> = (props) => {
    const [local, rest] = splitProps(props, [
        "as",
        "pad",
        "rounded",
        "shadow",
        "bg",
        "class",
        "children",
    ]);
    const shadow = (): string =>
        local.shadow === "panel"
            ? "shadow-[var(--panel-shadow)]"
            : local.shadow === "lg"
              ? "shadow-lg"
              : "shadow-2xl";
    const cls = (): string =>
        [
            "border border-line backdrop-blur-md",
            local.bg === "solid" ? "bg-panel" : "bg-panel/95",
            PANEL_ROUNDED[local.rounded ?? "2xl"],
            PANEL_PAD[local.pad ?? "md"],
            shadow(),
            local.class ?? "",
        ].join(" ");
    return (
        <Dynamic component={local.as ?? "div"} {...rest} class={cls()}>
            {local.children}
        </Dynamic>
    );
};
