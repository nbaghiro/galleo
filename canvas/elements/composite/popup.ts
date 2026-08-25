import type { ElementSpec, LayoutCtx } from "@elements/spec";
import type { DrawContext, EngineNode, MeasureText, Rect } from "@engine/node";
import { intrinsicWidth } from "@engine/layout";
import type { ElementAddress, ElementInstance } from "@model/artifact";
import type { PopupVariant } from "@model/elements";
import { register } from "@elements/spec";
import { bool, oneOf, str } from "@elements/coerce";
import { composeElement } from "@elements/compose";
import { hitRegionId, parseTarget } from "@model/artifact";
import { POPUP_VARIANTS } from "@model/elements";
import { fit, fixed, grow } from "@model/geometry";
import { fontStack, hexA } from "@themes";
import { t } from "@elements/composite/shared";

// The panel never paints in flow, on any surface: it would stretch its section and clip to the
// trigger's slot, which in a pinned nav is unusable. `layout` paints the trigger alone and `open`
// only turns the chevron; the floating panel is `panelNode`, composed and painted by whichever
// surface can float it (the portal in ui/live for playback, the canvas overlay in the editor).
// Exports and thumbnails therefore show the closed trigger: a popup's content is transient UI.
export interface PopupData {
    children: ElementInstance[];
    label?: string;
    variant?: PopupVariant;
    open?: boolean;
}

/** Stored data is unknown at the playback boundary, so the surface narrows before composing. */
export const popupData = (d: Record<string, unknown>): PopupData => ({
    children: Array.isArray(d.children) ? d.children : [],
    label: str(d.label),
    variant: oneOf(d.variant, POPUP_VARIANTS),
    open: bool(d.open),
});

const TRIGGER_H = 38;
const CHEVRON = 13;
const DEFAULT_LABEL = "Details";
export const PANEL_MIN_W = 260;
const MENU_MIN_W = 180;
export const PANEL_MAX_W = 400;

/** The floating panel's width: as wide as it asks for, inside what the surface can give it. */
export const panelWidth = (avail: number): number =>
    Math.max(PANEL_MIN_W, Math.min(PANEL_MAX_W, avail));

// The engine assigns the container width to the root outright, so a panel that should hug its
// content is sized here, above the layout call: a menu takes its widest item (the buttons are
// fit-width, so the intrinsic is real), a content panel keeps the full clamp since wrapped text's
// intrinsic is its unwrapped width.
export function panelHugWidth(
    d: PopupData,
    node: EngineNode,
    measure: MeasureText,
    avail: number,
): number {
    const max = panelWidth(avail);
    if (variantOf(d) !== "menu") return max;
    return Math.max(MENU_MIN_W, Math.min(Math.ceil(intrinsicWidth(node, measure)), max));
}

const PANEL_PAD: Record<PopupVariant, number> = { panel: 18, menu: 8 };
const PANEL_GAP: Record<PopupVariant, number> = { panel: 12, menu: 4 };

const chevron =
    (color: string, open: boolean) =>
    (g: DrawContext, box: Rect): void => {
        const s = Math.min(box.w, box.h);
        const cx = box.x + box.w / 2;
        const cy = box.y + box.h / 2;
        const dx = s * 0.28;
        const dy = s * 0.15;
        const k = open ? -1 : 1;
        g.polyline(
            [
                [cx - dx, cy - dy * k],
                [cx, cy + dy * k],
                [cx + dx, cy - dy * k],
            ],
            { stroke: color, width: Math.max(1.25, s * 0.12), cap: "round", join: "round" },
        );
    };

const clampRadius = (r: number, lo: number, hi: number): number =>
    Math.max(lo, Math.min(hi, Math.round(r)));

const variantOf = (d: PopupData): PopupVariant => d.variant ?? "panel";

function trigger(d: PopupData, ctx: LayoutCtx, open: boolean): EngineNode {
    return {
        w: fit(),
        h: fixed(TRIGGER_H),
        direction: "row",
        gap: 8,
        alignX: "center",
        alignY: "center",
        padding: { top: 0, bottom: 0, left: 15, right: 13 },
        fill: {
            color: hexA(ctx.theme.ink, 0.05),
            radius: clampRadius(ctx.theme.radius, 4, 14),
            border: { color: ctx.theme.line, width: 1 },
        },
        children: [
            {
                w: fit(),
                h: fit(),
                text: {
                    text: d.label?.trim() || DEFAULT_LABEL,
                    fontId: fontStack("ui", ctx.theme),
                    size: 14,
                    weight: 600,
                    color: ctx.theme.ink,
                    align: "center",
                    wrap: "none",
                },
            },
            {
                w: fixed(CHEVRON),
                h: fixed(CHEVRON),
                surface: { paint: chevron(ctx.theme.muted, open) },
            },
        ],
    };
}

function panelBox(d: PopupData, ctx: LayoutCtx, kids: EngineNode[]): EngineNode {
    const p = PANEL_PAD[variantOf(d)];
    return {
        w: grow(undefined, PANEL_MAX_W),
        h: fit(),
        direction: "col",
        gap: PANEL_GAP[variantOf(d)],
        padding: { top: p, right: p, bottom: p, left: p },
        fill: {
            color: ctx.theme.surface,
            radius: clampRadius(ctx.theme.radius, 6, 16),
            border: { color: ctx.theme.line, width: 1 },
            shadow: ctx.theme.shadow,
        },
        children: kids,
    };
}

/**
 * The floating panel alone, addressed at the popup that owns it, so its children carry the same
 * region ids `composeElement` would have given them in flow. That is what lets the editor's overlay
 * publish them and get selection, drops, comments and inline editing with no per-feature code.
 */
export function panelNode(d: PopupData, ctx: LayoutCtx, at: ElementAddress): EngineNode {
    const pad = PANEL_PAD[variantOf(d)] * 2;
    const inner: LayoutCtx = { ...ctx, availWidth: Math.max(0, ctx.availWidth - pad) };
    const kids = d.children.map((child, i) =>
        composeElement(child, inner, { section: at.section, path: [...at.path, i] }),
    );
    return panelBox(d, inner, kids);
}

function arrangePopup(d: PopupData, ctx: LayoutCtx): EngineNode {
    const chip = trigger(d, ctx, d.open === true);
    // composeElement hands its own region down, which is the element whose `open` a press moves
    const target = parseTarget(ctx.region ?? "");
    if (target?.kind === "element") chip.id = hitRegionId("disclose", target.address);
    // fit, not grow: the trigger's box is what the floating panel anchors under and what a click
    // on the popup selects, so it hugs the chip rather than the row slot the chip sits in
    return { w: fit(), h: fit(), direction: "col", alignX: "start", children: [chip] };
}

const VARIANT_LABELS: Record<PopupVariant, string> = { panel: "Panel", menu: "Menu" };

export const popupElement: ElementSpec<PopupData> = {
    type: "popup",
    label: "Popup",
    category: "composite",
    tier: "container",
    live: true,
    create: () => ({
        label: "Details",
        variant: "panel",
        open: true,
        children: [
            t("What this covers", "h3"),
            t("The extra line a reader asks for, kept out of the way until they do.", "body"),
        ],
    }),
    layout: arrangePopup,
    container: {
        children: (d) => d.children,
        arrange: arrangePopup,
        withChildren: (d, children) => ({ ...d, children }),
    },
    bar: ["label", "variant"],
    controls: [
        { key: "label", label: "Trigger", control: "text", placeholder: DEFAULT_LABEL },
        {
            key: "variant",
            label: "Panel",
            control: "segmented",
            options: POPUP_VARIANTS.map((v) => ({ value: v, label: VARIANT_LABELS[v] })),
        },
        // the panel floats over the canvas rather than in flow, so this opens it for editing; a
        // reader always starts with it shut, and an export prints the trigger alone
        { key: "open", label: "Show panel", control: "toggle" },
    ],
};
register(popupElement);
