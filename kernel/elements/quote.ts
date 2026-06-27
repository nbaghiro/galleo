import type { ElementSpec, LayoutCtx } from "@elements/element-spec";
import type { EngineNode } from "@engine/node";
import type { ElementInstance } from "@model/content";
import { getElement, register } from "@elements/registry";
import { fit, grow } from "@model/size";

// A quote is a statement + attribution — both real text children.
interface QuoteData {
    children: ElementInstance[];
}

const arrange = (_d: QuoteData, _ctx: LayoutCtx, kids: EngineNode[]): EngineNode => ({
    w: grow(),
    h: fit(),
    direction: "col",
    gap: 10,
    children: kids,
});

function compose(d: QuoteData, ctx: LayoutCtx): EngineNode[] {
    return d.children.map((inst): EngineNode => {
        const spec = getElement(inst.type);
        return spec ? spec.layout(inst.data, ctx) : { w: grow(), h: fit(10) };
    });
}

export const quoteElement: ElementSpec<QuoteData> = {
    type: "quote",
    label: "Quote",
    category: "text",
    tier: "smart",
    create: () => ({
        children: [
            { type: "text", data: { text: "Taste is the only moat left.", style: "title" } },
            { type: "text", data: { text: "— the thesis", style: "byline" } },
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

register(quoteElement);
