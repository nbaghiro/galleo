import type { ElementSpec, LayoutCtx } from "@elements/element-spec";
import type { EngineNode } from "@engine/node";
import { register } from "@elements/registry";
import { fit, grow } from "@model/size";

interface StatData {
    value: string;
    label: string;
}

export const statElement: ElementSpec<StatData> = {
    type: "stat",
    label: "Stat",
    category: "data",
    tier: "smart",
    create: () => ({ value: "30s", label: "prompt → first draft" }),
    layout: (d: StatData, _ctx: LayoutCtx): EngineNode => ({
        w: grow(),
        h: fit(),
        direction: "col",
        gap: 6,
        children: [
            {
                w: grow(),
                h: fit(),
                text: { text: d.value, fontId: "display", size: 44, weight: 600, color: "#211c16", align: "start", wrap: "none" },
            },
            {
                w: grow(),
                h: fit(),
                text: { text: d.label, fontId: "ui", size: 14, color: "#8c8273", align: "start", wrap: "words" },
            },
        ],
    }),
    controls: [
        { key: "value", label: "Value", control: "text" },
        { key: "label", label: "Label", control: "text" },
    ],
};

register(statElement);
