import type { ElementSpec, LayoutCtx } from "@elements/element-spec";
import type { EngineNode } from "@engine/node";
import type { ElementInstance } from "@model/content";
import { getElement, register } from "@elements/registry";
import { fit, fixed, grow } from "@model/size";
import { fontStack } from "@themes/theme";

type Marker = "dot" | "number" | "dash" | "check";

interface BulletsData {
    children: ElementInstance[];
    marker?: Marker;
}

function markerNode(marker: Marker, i: number, ctx: LayoutCtx): EngineNode {
    const t = (text: string, color: string, weight?: number): EngineNode => ({
        w: fit(),
        h: fit(),
        text: { text, fontId: fontStack("mono", ctx.theme), size: 14, weight, color, align: "start", wrap: "none" },
    });
    if (marker === "number") return t(`${i + 1}.`, ctx.theme.accent, 600);
    if (marker === "dash") return t("—", ctx.theme.muted);
    if (marker === "check") return t("✓", ctx.theme.accent, 700);
    return { w: fixed(8), h: fixed(8), fill: { color: ctx.theme.accent, radius: 99 } };
}

const arrange = (d: BulletsData, ctx: LayoutCtx, kids: EngineNode[]): EngineNode => ({
    w: grow(),
    h: fit(),
    direction: "col",
    gap: 12,
    children: kids.map((k, i): EngineNode => ({
        w: grow(),
        h: fit(),
        direction: "row",
        gap: 12,
        alignY: "start",
        children: [markerNode(d.marker ?? "dot", i, ctx), k],
    })),
});

function compose(d: BulletsData, ctx: LayoutCtx): EngineNode[] {
    return d.children.map((inst): EngineNode => {
        const spec = getElement(inst.type);
        return spec ? spec.layout(inst.data, ctx) : { w: grow(), h: fit(10) };
    });
}

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
    layout: (d, ctx) => arrange(d, ctx, compose(d, ctx)),
    container: { children: (d) => d.children, arrange, withChildren: (d, children) => ({ ...d, children }) },
    controls: [
        {
            key: "marker",
            label: "Marker",
            control: "segmented",
            options: [
                { label: "•", value: "dot" },
                { label: "1.", value: "number" },
                { label: "–", value: "dash" },
                { label: "✓", value: "check" },
            ],
        },
    ],
};

register(bulletsElement);
