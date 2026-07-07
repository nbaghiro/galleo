import type { EngineNode } from "@engine/node";
import { register, bar, dot } from "@elements/spec";
import { fit, grow } from "@model/geometry";
import { composite, t, avatar, at, gbar } from "@elements/composite/shared";

// --- testimonial: quote, then avatar + name/role row ---
export const testimonialElement = composite(
    "testimonial",
    "Testimonial",
    () => ({
        children: [
            t(
                "Galleo replaced three tools and made our deck, doc, and site one source of truth.",
                "quote",
            ),
            avatar(52),
            t("Grace Hopper", "body"),
            t("VP Design, Northwind", "caption"),
        ],
    }),
    (_d, _ctx, kids) => ({
        w: grow(),
        h: fit(),
        direction: "col",
        gap: 16,
        children: [
            at(kids, 0),
            {
                w: fit(),
                h: fit(),
                direction: "row",
                gap: 12,
                alignY: "center",
                children: [
                    at(kids, 1),
                    {
                        w: fit(),
                        h: fit(),
                        direction: "col",
                        gap: 2,
                        children: [at(kids, 2), at(kids, 3)],
                    },
                ],
            },
        ],
    }),
    (): EngineNode => ({
        w: grow(),
        h: fit(),
        direction: "col",
        gap: 14,
        children: [
            bar(1, 9),
            bar(0.9, 9),
            {
                w: fit(),
                h: fit(),
                direction: "row",
                gap: 12,
                alignY: "center",
                children: [
                    dot(48),
                    {
                        w: fit(),
                        h: fit(),
                        direction: "col",
                        gap: 5,
                        children: [gbar(100, 9), gbar(70, 7)],
                    },
                ],
            },
        ],
    }),
);
register(testimonialElement);
