import { register } from "@elements/spec";
import { fit, grow } from "@model/geometry";
import { composite, t, avatar, at } from "@elements/composite/shared";

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
                w: grow(),
                h: fit(),
                direction: "row",
                gap: 12,
                alignY: "center",
                children: [
                    at(kids, 1),
                    // grow, not fit: the name and role are grow-width text, so a fit column around
                    // them measures to nothing and the attribution paints at zero width
                    {
                        w: grow(),
                        h: fit(),
                        direction: "col",
                        gap: 2,
                        children: [at(kids, 2), at(kids, 3)],
                    },
                ],
            },
        ],
    }),
);
register(testimonialElement);
