import type { ElementSpec, LayoutCtx } from "@elements/element-spec";
import type { EngineNode } from "@engine/node";
import type { ElementInstance } from "@model/content";
import { getElement, register } from "@elements/registry";
import { fit, grow } from "@model/size";

interface CardData {
    children: ElementInstance[];
    direction?: "row" | "col";
    gap?: number;
    padding?: number;
    bg?: string;
    radius?: number;
}

const arrange = (d: CardData, _ctx: LayoutCtx, kids: EngineNode[]): EngineNode => {
    const p = d.padding ?? 24;
    return {
        w: grow(),
        h: fit(),
        direction: d.direction ?? "col",
        gap: d.gap ?? 12,
        padding: { top: p, right: p, bottom: p, left: p },
        fill: { color: d.bg ?? "#ffffff", radius: d.radius ?? 12, border: { color: "#e6dfd2", width: 1 } },
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
        { key: "gap", label: "Gap", control: "slider" },
        { key: "padding", label: "Padding", control: "slider" },
    ],
};

register(cardElement);
