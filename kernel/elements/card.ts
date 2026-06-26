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

export const cardElement: ElementSpec<CardData> = {
    type: "card",
    label: "Card",
    category: "container",
    tier: "container",
    create: () => ({ children: [] }),
    layout: (data: CardData, ctx: LayoutCtx): EngineNode => {
        const children = data.children.map((inst): EngineNode => {
            const spec = getElement(inst.type);
            if (!spec) throw new Error(`unknown element type: ${inst.type}`);
            return spec.layout(inst.data, ctx);
        });
        const p = data.padding ?? 24;
        return {
            w: grow(),
            h: fit(),
            direction: data.direction ?? "col",
            gap: data.gap ?? 12,
            padding: { top: p, right: p, bottom: p, left: p },
            fill: {
                color: data.bg ?? "#ffffff",
                radius: data.radius ?? 12,
                border: { color: "#e6dfd2", width: 1 },
            },
            children,
        };
    },
    controls: [
        { key: "gap", label: "Gap", control: "slider" },
        { key: "padding", label: "Padding", control: "slider" },
    ],
};

register(cardElement);
