import { register } from "@elements/spec";
import { fit, grow } from "@model/geometry";
import { composite } from "@elements/composite/shared";

export const quoteElement = composite(
    "quote",
    "Quote",
    () => ({
        children: [
            { type: "text", data: { text: "Taste is the only moat left.", style: "h3" } },
            { type: "text", data: { text: "The thesis", style: "caption" } },
        ],
    }),
    (_d, _ctx, kids) => ({ w: grow(), h: fit(), direction: "col", gap: 10, children: kids }),
    { category: "text", open: true },
);
register(quoteElement);
