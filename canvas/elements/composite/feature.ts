import type { EngineNode } from "@engine/node";
import { register, bar, dot } from "@elements/spec";
import { fit, grow } from "@model/geometry";
import { composite, t } from "@elements/composite/shared";

// --- feature: icon + heading + body, stacked ---
export const featureElement = composite(
    "feature",
    "Feature",
    () => ({
        children: [
            t("⚡", "h1"),
            t("Fast by default", "h3"),
            t("Sub-second layout keeps editing fluid at any size.", "body"),
        ],
    }),
    (_d, _ctx, kids) => ({ w: grow(), h: fit(), direction: "col", gap: 10, children: kids }),
    (): EngineNode => ({
        w: grow(),
        h: fit(),
        direction: "col",
        gap: 10,
        children: [dot(40), bar(0.6, 13), bar(1, 8), bar(0.85, 8)],
    }),
);
register(featureElement);
