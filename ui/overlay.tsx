import type { Component, JSX } from "solid-js";
import { createEffect, createSignal, onCleanup, onMount, Show, splitProps } from "solid-js";
import { Dynamic, Portal } from "solid-js/web";
import { Button } from "./button";

// Positioned surfaces. `Popover` and `Modal` are the two base primitives every menu/dropdown/dialog
// builds on; `ConfirmModal`/`FloatingBar` are thin composites.

// ── theme-var snapshot (for portaled surfaces) ──
// A portaled panel is reparented to <body>, escaping the themed subtree, so the active theme's CSS vars
// don't reach it. We copy the resolved vars off the anchor (which lives in the themed context) and stamp
// them on the panel, so its colors + fonts match the surrounding chrome in every theme.
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

// ── Popover ──
// A theme-matched panel portaled + fixed-positioned off an anchor (so it never clips inside a scrolling
// panel and isn't mis-placed by transformed ancestors), flipping above the anchor when it would overflow
// the bottom. Backdrop click + Escape dismiss. `toolbar` tags the portaled nodes with
// `data-galleo-toolbar` so an inline text editor stays alive when a control is used mid-edit.
export const Popover: Component<{
    anchor?: () => HTMLElement | undefined; // element anchor (menus/dropdowns)
    at?: () => { x: number; y: number } | undefined; // cursor/point anchor (context menus)
    open: boolean;
    onClose: () => void;
    estHeight?: number;
    minWidth?: number; // min-width = max(anchorWidth, minWidth); ignored when fixedWidth is set
    fixedWidth?: number; // panel is exactly this wide, left clamped into the viewport
    align?: "start" | "end"; // horizontal edge aligned to the anchor (default start = left; end = right)
    panelClass?: string;
    toolbar?: boolean;
    children: JSX.Element;
}> = (props) => {
    const [rect, setRect] = createSignal<Rect | null>(null);
    const [vars, setVars] = createSignal<Record<string, string>>({});

    createEffect(() => {
        if (!props.open) return;
        const estH = props.estHeight ?? 240;
        // Cursor/point anchor: position at the point, flipping up near the viewport bottom. Theme vars
        // are read off the (optional) anchor element, else the document root.
        const pt = props.at?.();
        if (pt) {
            const up = pt.y + estH > window.innerHeight && pt.y > estH;
            // Clamp into the viewport so a menu spawned near the right/bottom edge stays fully on-screen.
            const w = props.fixedWidth ?? props.minWidth ?? 180;
            const left = Math.max(8, Math.min(pt.x, window.innerWidth - w - 8));
            setRect({ left, top: pt.y, width: 0, up });
            setVars(readThemeVars(props.anchor?.() ?? document.documentElement));
            return;
        }
        const el = props.anchor?.();
        if (!el) return;
        const r = el.getBoundingClientRect();
        const up = r.bottom + estH > window.innerHeight && r.top > estH;
        setRect({ left: r.left, top: up ? r.top - 4 : r.bottom + 4, width: r.width, up });
        setVars(readThemeVars(el));
    });

    createEffect(() => {
        if (!props.open) return;
        const onKey = (e: KeyboardEvent): void => {
            if (e.key === "Escape") props.onClose();
        };
        window.addEventListener("keydown", onKey);
        onCleanup(() => window.removeEventListener("keydown", onKey));
    });

    const tb = (): Record<string, string> =>
        props.toolbar ? { "data-galleo-toolbar": "true" } : {};

    return (
        <Show when={props.open && rect()}>
            {(r) => (
                <Portal>
                    <div
                        {...tb()}
                        class="fixed inset-0 z-[70]"
                        onPointerDown={() => props.onClose()}
                    />
                    <div
                        {...tb()}
                        class={`fixed z-[71] rounded-lg border border-line bg-panel font-body text-ink shadow-2xl ${props.panelClass ?? ""}`}
                        style={{
                            ...vars(),
                            // `end` pins the panel's right edge to the anchor's right edge (right-aligned
                            // dropdowns); otherwise left-align, clamped into the viewport for fixedWidth.
                            ...(props.align === "end"
                                ? {
                                      right: `${Math.max(8, window.innerWidth - (r().left + r().width))}px`,
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
                            ...(r().up
                                ? { bottom: `${window.innerHeight - r().top}px` }
                                : { top: `${r().top}px` }),
                        }}
                    >
                        {props.children}
                    </div>
                </Portal>
            )}
        </Show>
    );
};

// ── Modal ──
// A centered panel over a dimmed backdrop. Rendered inline (not portaled) so it inherits the active
// theme from its DOM ancestor; pass `vars` to stamp a theme snapshot when mounted outside a themed tree.
type ModalSize = "sm" | "md" | "lg" | "xl" | "full";
const MODAL_W: Record<ModalSize, string> = {
    sm: "max-w-[400px]",
    md: "max-w-[520px]",
    lg: "max-w-[720px]",
    xl: "max-w-[960px]",
    full: "max-w-[1520px]", // workspace modals (generate / theme / data editor / template preview)
};
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
    surface?: Surface; // panel (default) or canvas ground
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
        const onKey = (e: KeyboardEvent): void => {
            if (e.key === "Escape") props.onClose();
        };
        window.addEventListener("keydown", onKey);
        onCleanup(() => window.removeEventListener("keydown", onKey));
    });
    return (
        <div
            class="fixed inset-0 flex items-center justify-center p-4 text-ink"
            style={{ "z-index": props.z ?? 50, ...(props.vars ?? {}) }}
        >
            <div
                class={`absolute inset-0 ${SCRIM[props.scrim ?? "blur"]}`}
                onClick={() => props.onClose()}
            />
            <div
                ref={panel}
                class={`relative w-full ${MODAL_W[props.size ?? "md"]} rounded-2xl border border-line ${SURFACE[props.surface ?? "panel"]} shadow-2xl ${props.class ?? ""}`}
            >
                {props.children}
            </div>
        </div>
    );
};

// ── ConfirmModal (composite on Modal) ──
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
        z={60}
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

// ── FloatingBar (composite) ──
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
              : "absolute bottom-5 left-1/2 -translate-x-1/2";
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

// ── FloatingPanel ──
// The inline (non-portaled) surface shell — the panel counterpart to FloatingBar. The studio's floating
// asides (element palette, minimap) and inline anchored popovers (toolbar color/link flyouts, the insert
// picker) all share this `border + rounded + bg-panel + shadow + backdrop-blur` chrome. Positioning is the
// consumer's (absolute/fixed via `class`/`style`); this owns only the surface. `shadow="panel"` uses the
// studio's theme-derived `--panel-shadow` (defined at the Studio root); `"2xl"` is a plain lifted popover.
type PanelPad = "none" | "sm" | "md" | "lg";
const PANEL_PAD: Record<PanelPad, string> = {
    none: "",
    sm: "p-1.5",
    md: "p-3",
    lg: "p-[18px]",
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
        bg?: "solid" | "translucent"; // bg-panel vs bg-panel/95 (default translucent)
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
