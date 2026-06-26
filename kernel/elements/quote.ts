import type { ElementSpec, LayoutCtx } from "@elements/element-spec";
import type { EngineNode } from "@engine/node";
import { register } from "@elements/registry";
import { fit, grow } from "@model/size";

interface QuoteData {
    text: string;
    by: string;
}

export const quoteElement: ElementSpec<QuoteData> = {
    type: "quote",
    label: "Quote",
    category: "text",
    tier: "smart",
    create: () => ({ text: "Taste is the only moat left.", by: "— the thesis" }),
    layout: (d: QuoteData, _ctx: LayoutCtx): EngineNode => ({
        w: grow(),
        h: fit(),
        direction: "col",
        gap: 10,
        children: [
            {
                w: grow(),
                h: fit(),
                text: { text: d.text, fontId: "display", size: 26, weight: 600, color: "#211c16", align: "start", wrap: "words" },
            },
            {
                w: grow(),
                h: fit(),
                text: { text: d.by, fontId: "mono", size: 14, color: "#8c8273", align: "start", wrap: "none" },
            },
        ],
    }),
    controls: [],
};

register(quoteElement);
