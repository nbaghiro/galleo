import type { ElementSpec, LayoutCtx } from "@elements/spec";
import type { EngineNode } from "@engine/node";
import { register } from "@elements/spec";
import { fixed, grow } from "@model/geometry";

interface DividerData {
    thickness?: number;
    color?: string;
}

export const dividerElement: ElementSpec<DividerData> = {
    type: "divider",
    label: "Divider",
    category: "basic",
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
    bar: ["thickness", "color"],
    controls: [
        {
            key: "thickness",
            label: "Thickness",
            control: "select",
            numeric: true,
            icon: "minus",
            options: [1, 2, 3, 4, 6, 8].map((n) => ({ value: String(n), label: `${n}px` })),
        },
        { key: "color", label: "Color override", control: "color" },
    ],
};

register(dividerElement);
