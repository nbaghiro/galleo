import type { ElementInstance } from "@model/content";

// A sample artifact: a card composed of eyebrow + heading + body + image elements.
// Proves the ElementSpec -> engine -> render-command path end to end.

export const sample: ElementInstance = {
    type: "card",
    data: {
        direction: "col",
        gap: 16,
        padding: 44,
        bg: "#fffdf8",
        radius: 16,
        children: [
            { type: "text", data: { text: "02 — The opportunity", style: "eyebrow", color: "#8a451f" } },
            {
                type: "text",
                data: { text: "The tools got fast. Taste didn’t.", style: "h1", color: "#211c16" },
            },
            {
                type: "text",
                data: {
                    text: "Anyone can generate a deck in thirty seconds — and almost none are worth presenting. Galleo is the editor for people who care how it looks.",
                    style: "body",
                    color: "#4d453a",
                },
            },
            {
                type: "image",
                data: {
                    src: "https://images.unsplash.com/photo-1557672172-298e090bd0f1?auto=format&fit=crop&w=1000&q=70",
                    aspect: 2.4,
                    radius: 10,
                    fit: "cover",
                },
            },
        ],
    },
};
