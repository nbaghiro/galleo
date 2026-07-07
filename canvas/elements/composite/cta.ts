import type { EngineNode } from "@engine/node";
import { register, bar, pill, GHOST_PANEL } from "@elements/spec";
import { fit, grow } from "@model/geometry";
import { mix } from "@themes/theme";
import { composite, t, button, pad } from "@elements/composite/shared";

// --- cta: heading + subtext + button, centered on a tinted band ---
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
    (): EngineNode => ({
        w: grow(),
        h: fit(),
        direction: "col",
        gap: 10,
        alignX: "center",
        padding: pad(26),
        fill: { color: GHOST_PANEL, radius: 12 },
        children: [bar(0.7, 12), bar(0.5, 8), pill(0.35, 30)],
    }),
);
register(ctaElement);
