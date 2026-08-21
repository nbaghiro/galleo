import type { ElementSpec, LayoutCtx } from "@elements/spec";
import type { EngineNode } from "@engine/node";
import type { ElementInstance } from "@model/artifact";
import type { BulletMarker } from "@model/elements";
import { register, getElement } from "@elements/spec";
import { fit, grow, fixed } from "@model/geometry";
import { fontStack } from "@themes";
import { hitRegionId, parseTarget } from "@model/artifact";
import { BULLET_MARKERS } from "@model/elements";
import { drawIcon, ICON_LIBRARY } from "@elements/media/vector";

interface BulletsData {
    children: ElementInstance[];
    marker?: BulletMarker;
}

const CHECKBOX = 16;

// glyph markers are vector, not text: a mono-font "✓" changes shape and weight with every theme
const iconMarker = (name: string, color: string, size = 14): EngineNode => ({
    w: fixed(size),
    h: fixed(size),
    surface: { paint: (g) => drawIcon(g, ICON_LIBRARY[name]!, 0, 0, size, color) },
});

function markerNode(marker: BulletMarker, i: number, ctx: LayoutCtx, checked: boolean): EngineNode {
    const t = (text: string, color: string, weight?: number): EngineNode => ({
        w: fit(),
        h: fit(),
        text: {
            text,
            fontId: fontStack("mono", ctx.theme),
            size: 14,
            weight,
            color,
            align: "start",
            wrap: "none",
        },
    });
    if (marker === "number") return t(`${i + 1}.`, ctx.theme.accent, 600);
    if (marker === "dash") return t("—", ctx.theme.muted);
    if (marker === "check") return iconMarker("check", ctx.theme.accent);
    if (marker === "arrow") return iconMarker("arrow", ctx.theme.accent);
    if (marker === "checkbox") {
        if (!checked)
            return {
                w: fixed(CHECKBOX),
                h: fixed(CHECKBOX),
                fill: { radius: 4, border: { color: ctx.theme.muted, width: 1.5 } },
            };
        return {
            w: fixed(CHECKBOX),
            h: fixed(CHECKBOX),
            alignX: "center",
            alignY: "center",
            fill: { color: ctx.theme.accent, radius: 4 },
            children: [iconMarker("check", ctx.theme.onAccent, 11)],
        };
    }
    return { w: fixed(8), h: fixed(8), fill: { color: ctx.theme.accent, radius: 99 } };
}

// the marker centres on the child's FIRST LINE box, not the row top: a top-aligned 8px dot floats
// visibly above a ~23px line's glyphs (the line's leading sits above the caps)
function alignedMarker(marker: EngineNode, k: EngineNode): EngineNode {
    const line = k.text ? (k.text.lineHeight ?? k.text.size * 1.35) : undefined;
    if (!line) return marker;
    return { w: fit(), h: fixed(line), alignY: "center", children: [marker] };
}

const isChecked = (inst: ElementInstance | undefined): boolean =>
    (inst?.data as { checked?: unknown } | undefined)?.checked === true;

const arrangeBullets = (d: BulletsData, ctx: LayoutCtx, kids: EngineNode[]): EngineNode => ({
    w: grow(),
    h: fit(),
    direction: "col",
    gap: 12,
    children: kids.map((k, i): EngineNode => {
        const marker = d.marker ?? "dot";
        const wrapper = alignedMarker(markerNode(marker, i, ctx, isChecked(d.children[i])), k);
        // a checkbox is clickable: the line-height wrapper becomes an affordance region the
        // editor toggles, addressed at the child whose data carries `checked`
        if (marker === "checkbox" && k.id) {
            const t = parseTarget(k.id);
            if (t?.kind === "element") wrapper.id = hitRegionId("checkbox", t.address);
        }
        return {
            w: grow(),
            h: fit(),
            direction: "row",
            gap: 12,
            alignY: "start",
            children: [wrapper, k],
        };
    }),
});

function composeBullets(d: BulletsData, ctx: LayoutCtx): EngineNode[] {
    return d.children.map((inst): EngineNode => {
        const spec = getElement(inst.type);
        return spec ? spec.layout(inst.data, ctx) : { w: grow(), h: fit(10) };
    });
}

const MARKER_LABELS: Record<BulletMarker, string> = {
    dot: "•",
    number: "1.",
    dash: "—",
    check: "✓",
    arrow: "→",
    checkbox: "☑",
};

export const bulletsElement: ElementSpec<BulletsData> = {
    type: "bullets",
    label: "List",
    category: "text",
    tier: "unit",
    create: () => ({
        children: [
            { type: "text", data: { text: "First point", style: "body" } },
            { type: "text", data: { text: "Second point", style: "body" } },
            { type: "text", data: { text: "Third point", style: "body" } },
        ],
        marker: "dot",
    }),
    layout: (d, ctx) => arrangeBullets(d, ctx, composeBullets(d, ctx)),
    container: {
        children: (d) => d.children,
        arrange: arrangeBullets,
        withChildren: (d, children) => ({ ...d, children }),
    },
    bar: ["marker"], // every control on the bar keeps the element inline (no docked panel)
    controls: [
        {
            key: "marker",
            label: "Marker",
            control: "segmented",
            options: BULLET_MARKERS.map((v) => ({ value: v, label: MARKER_LABELS[v] })),
        },
    ],
};

register(bulletsElement);
