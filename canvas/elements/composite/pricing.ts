import type { EngineNode } from "@engine/node";
import type { ElementInstance } from "@model/artifact";
import { register, bar, pill, GHOST_PANEL, GHOST_LINE } from "@elements/spec";
import { fit, grow } from "@model/geometry";
import { composite, t, button, pad } from "@elements/composite/shared";

const checklist = (...items: string[]): ElementInstance => ({
    type: "bullets",
    data: { children: items.map((i) => t(i, "body")), marker: "check" },
});

export const pricingElement = composite(
    "pricing",
    "Pricing",
    () => ({
        children: [
            t("STARTER", "label"),
            t("$0", "h1"),
            checklist("1 workspace", "5 artifacts", "PNG export"),
            button("Choose plan"),
        ],
    }),
    (_d, ctx, kids) => ({
        w: grow(),
        h: fit(),
        direction: "col",
        gap: 14,
        padding: pad(24),
        fill: {
            color: ctx.theme.surface,
            radius: ctx.theme.radius,
            border: { color: ctx.theme.line, width: 1 },
        },
        children: kids,
    }),
    (): EngineNode => ({
        w: grow(),
        h: fit(),
        direction: "col",
        gap: 12,
        padding: pad(20),
        fill: { color: GHOST_PANEL, radius: 12, border: { color: GHOST_LINE, width: 1 } },
        children: [
            bar(0.3, 8),
            bar(0.45, 20),
            bar(0.9, 8),
            bar(0.85, 8),
            bar(0.7, 8),
            pill(0.55, 30),
        ],
    }),
);
register(pricingElement);
