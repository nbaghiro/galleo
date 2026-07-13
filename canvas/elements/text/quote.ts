import type { ElementSpec, LayoutCtx } from "@elements/spec";
import type { EngineNode } from "@engine/node";
import type { ElementInstance } from "@model/artifact";
import { register, getElement } from "@elements/spec";
import { fit, grow } from "@model/geometry";

interface QuoteData {
    children: ElementInstance[];
}

const arrangeQuote = (_d: QuoteData, _ctx: LayoutCtx, kids: EngineNode[]): EngineNode => ({
    w: grow(),
    h: fit(),
    direction: "col",
    gap: 10,
    children: kids,
});

function composeQuote(d: QuoteData, ctx: LayoutCtx): EngineNode[] {
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
            { type: "text", data: { text: "Taste is the only moat left.", style: "h3" } },
            { type: "text", data: { text: "— the thesis", style: "caption" } },
        ],
    }),
    layout: (d, ctx) => arrangeQuote(d, ctx, composeQuote(d, ctx)),
    container: {
        children: (d) => d.children,
        arrange: arrangeQuote,
        withChildren: (d, children) => ({ ...d, children }),
    },
    controls: [],
};

register(quoteElement);
