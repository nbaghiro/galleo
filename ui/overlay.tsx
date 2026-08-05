import type { Component, JSX } from "solid-js";
import { createEffect, createSignal, onCleanup, onMount, Show, splitProps } from "solid-js";
import { Dynamic, Portal } from "solid-js/web";
import { Button } from "./button";
import { installKeyDispatcher, pushScope } from "./keys";
import { trapFocus } from "./focus";
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
    toolbar?: boolean;
    children: JSX.Element;
}> = (props) => {
    const [rect, setRect] = createSignal<Rect | null>(null);
    const [vars, setVars] = createSignal<Record<string, string>>({});

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

    const tb = (): Record<string, string> =>
        props.toolbar ? { "data-galleo-toolbar": "true" } : {};

    return (
        <Show when={props.open && rect()}>
            {(r) => (
                <Portal>
                    <div
                        {...tb()}
                        class="fixed inset-0 z-popover"
                        onPointerDown={() => props.onClose()}
                    />
                    <div
                        {...tb()}
                        class={`fixed z-popover overflow-y-auto rounded-lg border border-line bg-panel font-body text-ink shadow-2xl ${props.panelClass ?? ""}`}
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

export const Modal: Component<{
    onClose: () => void;
    size?: ModalSize;
    scrim?: Scrim;
    surface?: Surface;
    z?: number;
    animate?: boolean;
    vars?: JSX.CSSProperties;
    class?: string;
    children: JSX.Element;
}> = (props) => {
    let panel!: HTMLDivElement;
    onMount(() => {
        const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
        if (props.animate !== false && !reduced)
            panel.animate(
                [
                    { opacity: 0, transform: "translateY(8px) scale(0.98)" },
                    { opacity: 1, transform: "none" },
                ],
                { duration: 190, easing: "cubic-bezier(.2,.7,.2,1)", fill: "both" },
            );
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
            classList={{ "p-4": props.size !== SCREEN }}
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
                class={`relative w-full outline-none ${MODAL_W[props.size ?? "md"]} ${SURFACE[props.surface ?? "panel"]} ${props.class ?? ""}`}
                classList={{
                    "rounded-2xl border border-line shadow-2xl": props.size !== SCREEN,
                }}
            >
                {props.children}
            </div>
        </div>
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
// studio's outline pill, so the two read as one control surface.
export const barAction =
    "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold text-ink hover:bg-canvas disabled:pointer-events-none disabled:opacity-40";
// the bar's one call to action; same metrics as barAction so it sits level with its neighbours
export const barPrimaryAction =
    "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-accent px-2.5 py-1 text-[11px] font-semibold text-onaccent hover:opacity-90 disabled:pointer-events-none disabled:opacity-40";
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
