import type { ElementSpec, LayoutCtx } from "@elements/element-spec";
import type { EngineNode } from "@engine/node";
import { register } from "@elements/registry";
import { pill } from "@elements/skeleton";
import { fit, fixed } from "@model/size";

interface ButtonData {
    label: string;
}

export const buttonElement: ElementSpec<ButtonData> = {
    type: "button",
    label: "Button",
    category: "interactive",
    tier: "interactive",
    create: () => ({ label: "Get started" }),
    layout: (d: ButtonData, _ctx: LayoutCtx): EngineNode => ({
        w: fit(),
        h: fixed(42),
        padding: { top: 0, bottom: 0, left: 20, right: 20 },
        alignX: "center",
        alignY: "center",
        fill: { color: "#a8572c", radius: 8 },
        children: [
            {
                w: fit(),
                h: fit(),
                text: { text: d.label, fontId: "ui", size: 14, weight: 600, color: "#ffffff", align: "center", wrap: "none" },
            },
        ],
    }),
    controls: [{ key: "label", label: "Label", control: "text" }],
    // Custom ghost: a fit-width pill collapses under auto-skeletonize, so draw a pill directly.
    skeleton: (_ctx: LayoutCtx): EngineNode => pill(0.45, 38),
};

register(buttonElement);
