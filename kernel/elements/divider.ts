import type { ElementSpec, LayoutCtx } from "@elements/element-spec";
import type { EngineNode } from "@engine/node";
import { register } from "@elements/registry";
import { fixed, grow } from "@model/size";

export const dividerElement: ElementSpec<Record<string, never>> = {
    type: "divider",
    label: "Divider",
    category: "layout",
    tier: "primitive",
    create: () => ({}),
    layout: (_d: Record<string, never>, ctx: LayoutCtx): EngineNode => ({
        w: grow(),
        h: fixed(2),
        fill: { color: ctx.theme.line, radius: 1 },
    }),
    controls: [],
};

register(dividerElement);
