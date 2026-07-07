import type { EngineNode } from "@engine/node";
import { register, bar } from "@elements/spec";
import { fit, grow } from "@model/geometry";
import { composite, t, at } from "@elements/composite/shared";

// --- faq: a list of question + answer pairs (all shown; correct for deck/doc/site + print) ---
export const faqElement = composite(
    "faq",
    "FAQ",
    () => ({
        children: [
            t("What is Galleo?", "h3"),
            t("One canvas that renders as a deck, a doc, or a site — authored once.", "body"),
            t("Can I export?", "h3"),
            t("Yes — PDF, PNG, and print, pixel-for-pixel with what you edit.", "body"),
            t("Is it themeable?", "h3"),
            t("Themes are data; switching one repaints every block instantly.", "body"),
        ],
    }),
    (_d, _ctx, kids) => {
        const pairs: EngineNode[] = [];
        for (let i = 0; i < kids.length; i += 2) {
            pairs.push({
                w: grow(),
                h: fit(),
                direction: "col",
                gap: 4,
                children: [at(kids, i), at(kids, i + 1)],
            });
        }
        return { w: grow(), h: fit(), direction: "col", gap: 16, children: pairs };
    },
    (): EngineNode => ({
        w: grow(),
        h: fit(),
        direction: "col",
        gap: 16,
        children: [
            {
                w: grow(),
                h: fit(),
                direction: "col",
                gap: 4,
                children: [bar(0.5, 10), bar(1, 7), bar(0.8, 7)],
            },
            {
                w: grow(),
                h: fit(),
                direction: "col",
                gap: 4,
                children: [bar(0.45, 10), bar(1, 7), bar(0.7, 7)],
            },
        ],
    }),
);
register(faqElement);
