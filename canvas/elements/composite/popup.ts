import type { ElementSpec, LayoutCtx } from "@elements/spec";
import type { DrawContext, EngineNode, Rect } from "@engine/node";
import type { ElementInstance } from "@model/artifact";
import type { PopupVariant } from "@model/elements";
import { getElement, register } from "@elements/spec";
import { bool, oneOf, str } from "@elements/coerce";
import { hitRegionId, parseTarget } from "@model/artifact";
import { POPUP_VARIANTS } from "@model/elements";
import { fit, fixed, grow } from "@model/geometry";
import { fontStack, hexA } from "@themes";
import { t } from "@elements/composite/shared";

// `open` is ordinary authored data, so the editor and every static surface (export, thumbnails, the
// corpus) paint the panel in flow below the trigger exactly as stored. Playback seeds it shut and
// floats the same subtree in a portal instead (the popup live component in ui/live).
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
export const PANEL_MAX_W = 400;

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

const composeKids = (d: PopupData, ctx: LayoutCtx): EngineNode[] =>
    d.children.map((inst): EngineNode => {
        const spec = getElement(inst.type);
        return spec ? spec.layout(inst.data, ctx) : { w: grow(), h: fit(10) };
    });

/** The panel alone, for the surface that portals it: no region ids, so nothing in it is addressable. */
export function panelNode(d: PopupData, ctx: LayoutCtx): EngineNode {
    const pad = PANEL_PAD[variantOf(d)] * 2;
    const inner: LayoutCtx = { ...ctx, availWidth: Math.max(0, ctx.availWidth - pad) };
    return panelBox(d, inner, composeKids(d, inner));
}

function arrangePopup(d: PopupData, ctx: LayoutCtx, kids: EngineNode[]): EngineNode {
    const open = d.open === true;
    const chip = trigger(d, ctx, open);
    // a child's address is this element's own, one level down, which is whose `open` the press moves
    const target = parseTarget(kids[0]?.id ?? "");
    if (target?.kind === "element")
        chip.id = hitRegionId("disclose", {
            section: target.address.section,
            path: target.address.path.slice(0, -1),
        });
    return {
        w: grow(undefined, PANEL_MAX_W),
        h: fit(),
        direction: "col",
        gap: 10,
        alignX: "start",
        children: open ? [chip, panelBox(d, ctx, kids)] : [chip],
    };
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
    layout: (d, ctx) => arrangePopup(d, ctx, composeKids(d, ctx)),
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
        { key: "open", label: "Open by default", control: "toggle" },
    ],
};
register(popupElement);
