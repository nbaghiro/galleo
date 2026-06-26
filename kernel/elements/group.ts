import type { ElementSpec, LayoutCtx } from "@elements/element-spec";
import type { EngineNode } from "@engine/node";
import type { ElementInstance } from "@model/content";
import { getElement, register } from "@elements/registry";
import { fit, grow } from "@model/size";

// A transparent container that stacks several elements inside one cell (no background of its own).

interface GroupData {
    children: ElementInstance[];
    direction?: "row" | "col";
    gap?: number;
}

export const groupElement: ElementSpec<GroupData> = {
    type: "group",
    label: "Group",
    category: "container",
    tier: "container",
    create: () => ({ children: [] }),
    layout: (d: GroupData, ctx: LayoutCtx): EngineNode => ({
        w: grow(),
        h: fit(),
        direction: d.direction ?? "col",
        gap: d.gap ?? 14,
        children: d.children.map((inst): EngineNode => {
            const spec = getElement(inst.type);
            if (!spec) return { w: grow(), h: fit(20) };
            return spec.layout(inst.data, ctx);
        }),
    }),
    controls: [],
};

register(groupElement);
