import type { EngineNode } from "@engine/node";
import { register, bar } from "@elements/spec";
import { fit, grow } from "@model/geometry";
import { at, composite, pad, t } from "@elements/composite/shared";

export const comparisonElement = composite(
    "comparison",
    "Comparison",
    () => ({
        children: [
            t("Before", "h3", "center"),
            t("Three tools, four handoffs, and a deck that drifts from the doc.", "body", "center"),
            t("After", "h3", "center"),
            t("One source, every format, in sync by construction.", "body", "center"),
        ],
    }),
    (_d, ctx, kids) => {
        const panel = (i: number): EngineNode => ({
            w: grow(),
            h: grow(),
            direction: "col",
            gap: 10,
            padding: pad(20),
            fill: {
                color: ctx.theme.surface,
                radius: ctx.theme.radius,
                border: { color: ctx.theme.line, width: 1 },
            },
            children: [at(kids, i), at(kids, i + 1)],
        });
        return { w: grow(), h: fit(), direction: "row", gap: 16, children: [panel(0), panel(2)] };
    },
    (): EngineNode => {
        const ghost = (): EngineNode => ({
            w: grow(),
            h: fit(),
            direction: "col",
            gap: 10,
            padding: pad(20),
            children: [bar(0.5, 13), bar(1, 8), bar(0.8, 8)],
        });
        return { w: grow(), h: fit(), direction: "row", gap: 16, children: [ghost(), ghost()] };
    },
);
register(comparisonElement);
