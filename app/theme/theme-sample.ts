import type { ElementInstance, Section } from "@model/artifact";

// One small cover section used to preview a theme (in drawer cards + the builder) — enough content to
// read a theme's surfaces, ink, accent, fonts, and heading weight at a glance.
const tx = (text: string, style: string): ElementInstance => ({
    type: "text",
    data: { text, style },
});
const button = (label: string): ElementInstance => ({ type: "button", data: { label } });
const group = (...children: ElementInstance[]): ElementInstance => ({
    type: "group",
    data: { children },
});

export const THEME_SAMPLE: Section = {
    id: "theme-sample",
    grid: "full",
    cells: {
        a: {
            element: group(
                tx("Galleo · design system", "label"),
                tx("A theme you can feel", "h1"),
                tx(
                    "One token set themes every surface — decks, docs, and sites alike.",
                    "subtitle",
                ),
                button("Get started"),
            ),
        },
    },
};
