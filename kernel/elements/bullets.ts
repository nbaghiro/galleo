import type { ElementSpec, LayoutCtx } from "@elements/element-spec";
import type { EngineNode } from "@engine/node";
import type { ElementInstance } from "@model/content";
import { getElement, register } from "@elements/registry";
import { fit, fixed, grow } from "@model/size";

// A bullet list whose items are real text children (each selectable/editable). The markers are
// arrangement decoration, not elements.
interface BulletsData {
    children: ElementInstance[];
}

const marker = (): EngineNode => ({ w: fixed(8), h: fixed(8), fill: { color: "#9a4f24", radius: 99 } });

const arrange = (_d: BulletsData, _ctx: LayoutCtx, kids: EngineNode[]): EngineNode => ({
    w: grow(),
    h: fit(),
    direction: "col",
    gap: 12,
    children: kids.map((k): EngineNode => ({
        w: grow(),
        h: fit(),
        direction: "row",
        gap: 12,
        alignY: "start",
        children: [marker(), k],
    })),
});

function compose(d: BulletsData, ctx: LayoutCtx): EngineNode[] {
    return d.children.map((inst): EngineNode => {
        const spec = getElement(inst.type);
        return spec ? spec.layout(inst.data, ctx) : { w: grow(), h: fit(10) };
    });
}

export const bulletsElement: ElementSpec<BulletsData> = {
    type: "bullets",
    label: "Bullet list",
    category: "text",
    tier: "smart",
    create: () => ({
        children: [
            { type: "text", data: { text: "First point", style: "body" } },
            { type: "text", data: { text: "Second point", style: "body" } },
            { type: "text", data: { text: "Third point", style: "body" } },
        ],
    }),
    layout: (d, ctx) => arrange(d, ctx, compose(d, ctx)),
    container: { children: (d) => d.children, arrange, withChildren: (d, children) => ({ ...d, children }) },
    controls: [],
};

register(bulletsElement);
