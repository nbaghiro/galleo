import { register } from "@elements/spec";
import { fit, grow } from "@model/geometry";
import { mix } from "@themes";
import { composite, t, button, pad } from "@elements/composite/shared";

export const ctaElement = composite(
    "cta",
    "Call to action",
    () => ({
        children: [
            t("Ship your first artifact today", "h2", "center"),
            t("One canvas for decks, docs, and sites.", "body", "center"),
            button("Get started"),
        ],
    }),
    (_d, ctx, kids) => ({
        w: grow(),
        h: fit(),
        direction: "col",
        gap: 12,
        alignX: "center",
        padding: pad(32),
        fill: { color: mix(ctx.theme.surface, ctx.theme.accent, 0.08), radius: ctx.theme.radius },
        children: kids,
    }),
);
register(ctaElement);
