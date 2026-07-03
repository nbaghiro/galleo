import type { ElementSpec, LayoutCtx } from "@elements/element-spec";
import type { EngineNode } from "@engine/node";
import type { ElementInstance } from "@model/content";
import { getElement, register } from "@elements/registry";
import { fit, grow } from "@model/size";

// A stat is a value + caption — both real text children, so each is independently selectable/editable.
interface StatData {
    children: ElementInstance[];
}

const arrange = (_d: StatData, _ctx: LayoutCtx, kids: EngineNode[]): EngineNode => ({
    w: grow(),
    h: fit(),
    direction: "col",
    gap: 6,
    children: kids,
});

function compose(d: StatData, ctx: LayoutCtx): EngineNode[] {
    return d.children.map((inst): EngineNode => {
        const spec = getElement(inst.type);
        return spec ? spec.layout(inst.data, ctx) : { w: grow(), h: fit(10) };
    });
}

export const statElement: ElementSpec<StatData> = {
    type: "stat",
    label: "Stat",
    category: "data",
    tier: "smart",
    create: () => ({
        children: [
            { type: "text", data: { text: "30s", style: "h1" } },
            { type: "text", data: { text: "prompt → first draft", style: "caption" } },
        ],
    }),
    layout: (d, ctx) => arrange(d, ctx, compose(d, ctx)),
    container: {
        children: (d) => d.children,
        arrange,
        withChildren: (d, children) => ({ ...d, children }),
    },
    controls: [],
};

register(statElement);
