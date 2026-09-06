import { register } from "@elements/spec";
import { fit, grow } from "@model/geometry";
import { composite } from "@elements/composite/shared";

export const statElement = composite(
    "stat",
    "Stat",
    () => ({
        children: [
            { type: "text", data: { text: "30s", style: "h1" } },
            { type: "text", data: { text: "prompt → first draft", style: "caption" } },
        ],
    }),
    (_d, _ctx, kids) => ({ w: grow(), h: fit(), direction: "col", gap: 6, children: kids }),
    { category: "table", open: true },
);
register(statElement);
