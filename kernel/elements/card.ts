import type { ElementSpec, LayoutCtx } from "@elements/element-spec";
import type { EngineNode } from "@engine/node";
import type { ElementInstance } from "@model/content";
import { getElement, register } from "@elements/registry";
import { bar, GHOST_LINE, GHOST_PANEL } from "@elements/skeleton";
import { fit, grow } from "@model/size";

interface CardData {
    children: ElementInstance[];
    direction?: "row" | "col";
    gap?: number;
    padding?: number;
    bg?: string;
    radius?: number;
}

const arrange = (d: CardData, ctx: LayoutCtx, kids: EngineNode[]): EngineNode => {
    const p = d.padding ?? 24;
    return {
        w: grow(),
        h: fit(),
        direction: d.direction ?? "col",
        gap: d.gap ?? 12,
        padding: { top: p, right: p, bottom: p, left: p },
        fill: {
            color: d.bg ?? ctx.theme.surface,
            radius: d.radius ?? 12,
            border: { color: ctx.theme.line, width: 1 },
        },
        children: kids,
    };
};

export const cardElement: ElementSpec<CardData> = {
    type: "card",
    label: "Card",
    category: "container",
    tier: "container",
    create: () => ({ children: [] }),
    layout: (d, ctx) =>
        arrange(
            d,
            ctx,
            d.children.map((inst): EngineNode => {
                const spec = getElement(inst.type);
                if (!spec) throw new Error(`unknown element type: ${inst.type}`);
                return spec.layout(inst.data, ctx);
            }),
        ),
    container: {
        children: (d) => d.children,
        arrange,
        withChildren: (d, children) => ({ ...d, children }),
    },
    controls: [
        {
            key: "direction",
            label: "Direction",
            control: "segmented",
            options: [
                { label: "Stack", value: "col" },
                { label: "Row", value: "row" },
            ],
        },
        { key: "gap", label: "Gap", control: "slider", min: 0, max: 48, step: 2, unit: "px" },
        {
            key: "padding",
            label: "Padding",
            control: "slider",
            min: 0,
            max: 64,
            step: 2,
            unit: "px",
            group: "Appearance",
        },
        {
            key: "radius",
            label: "Corner radius",
            control: "slider",
            min: 0,
            max: 40,
            step: 1,
            unit: "px",
            group: "Appearance",
        },
        { key: "bg", label: "Background", control: "color", group: "Appearance" },
    ],
    skeleton: (): EngineNode => ({
        w: grow(),
        h: fit(),
        direction: "col",
        gap: 8,
        padding: { top: 14, right: 14, bottom: 14, left: 14 },
        fill: { color: GHOST_PANEL, radius: 10, border: { color: GHOST_LINE, width: 1 } },
        children: [bar(0.7, 12), bar(1, 9), bar(0.5, 9)],
    }),
};

register(cardElement);
