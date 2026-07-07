import type { ElementSpec, LayoutCtx } from "@elements/spec";
import type { EngineNode } from "@engine/node";
import type { ElementInstance } from "@model/artifact";
import type { BulletMarker } from "@model/elements/text";
import { register, getElement } from "@elements/spec";
import { fit, grow, fixed } from "@model/geometry";
import { fontStack } from "@themes/theme";
import { BULLET_MARKERS } from "@model/elements/text";

interface BulletsData {
    children: ElementInstance[];
    marker?: BulletMarker;
}

function markerNode(marker: BulletMarker, i: number, ctx: LayoutCtx): EngineNode {
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
    if (marker === "check") return t("✓", ctx.theme.accent, 700);
    return { w: fixed(8), h: fixed(8), fill: { color: ctx.theme.accent, radius: 99 } };
}

const arrangeBullets = (d: BulletsData, ctx: LayoutCtx, kids: EngineNode[]): EngineNode => ({
    w: grow(),
    h: fit(),
    direction: "col",
    gap: 12,
    children: kids.map(
        (k, i): EngineNode => ({
            w: grow(),
            h: fit(),
            direction: "row",
            gap: 12,
            alignY: "start",
            children: [markerNode(d.marker ?? "dot", i, ctx), k],
        }),
    ),
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
    dash: "–",
    check: "✓",
};

export const bulletsElement: ElementSpec<BulletsData> = {
    type: "bullets",
    label: "List",
    category: "text",
    tier: "smart",
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
