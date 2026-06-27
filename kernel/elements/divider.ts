import type { ElementSpec, LayoutCtx } from "@elements/element-spec";
import type { EngineNode } from "@engine/node";
import { register } from "@elements/registry";
import { fixed, grow } from "@model/size";

interface DividerData {
    thickness?: number;
    color?: string;
}

export const dividerElement: ElementSpec<DividerData> = {
    type: "divider",
    label: "Divider",
    category: "layout",
    tier: "primitive",
    create: () => ({ thickness: 2 }),
    layout: (d: DividerData, ctx: LayoutCtx): EngineNode => {
        const th = d.thickness ?? 2;
        return {
            w: grow(),
            h: fixed(th),
            fill: { color: d.color ?? ctx.theme.line, radius: Math.max(0.5, th / 2) },
        };
    },
    controls: [
        {
            key: "thickness",
            label: "Thickness",
            control: "slider",
            min: 1,
            max: 10,
            step: 1,
            unit: "px",
        },
        { key: "color", label: "Color override", control: "color", group: "Appearance" },
    ],
};

register(dividerElement);
