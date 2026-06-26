import type { ArtifactContent } from "@model/content";

const ACCENT = "#9a4f24";
const INK = "#211c16";

// The open artifact: an ordered list of variable-height sections. This is the in-memory store P1
// renders; persistence (services/data) arrives later.

export const artifact: ArtifactContent = {
    format: "deck",
    theme: "studio",
    sections: [
        {
            id: "s1",
            grid: "full",
            cells: {
                a: {
                    element: {
                        type: "group",
                        data: {
                            gap: 18,
                            children: [
                                { type: "text", data: { text: "GALLEO", style: "eyebrow", color: ACCENT } },
                                { type: "text", data: { text: "The editor for people who care how it looks.", style: "h1", color: INK } },
                                {
                                    type: "text",
                                    data: { text: "One canonical artifact. Deck, doc, and site are just views of it.", style: "body", color: "#5b5346" },
                                },
                            ],
                        },
                    },
                },
            },
        },
        {
            id: "s2",
            grid: "split-6040",
            cells: {
                a: {
                    element: {
                        type: "group",
                        data: {
                            gap: 16,
                            children: [
                                { type: "text", data: { text: "02 — Product", style: "eyebrow", color: ACCENT } },
                                { type: "text", data: { text: "One editor. Every format.", style: "h2", color: INK } },
                                {
                                    type: "bullets",
                                    data: { items: ["Blocks, not slides", "Themes that aren’t slop", "An agent with actual taste"] },
                                },
                            ],
                        },
                    },
                },
                b: {
                    element: {
                        type: "image",
                        data: {
                            src: "https://images.unsplash.com/photo-1557672172-298e090bd0f1?auto=format&fit=crop&w=900&q=70",
                            aspect: 0.82,
                            radius: 14,
                            fit: "cover",
                        },
                    },
                },
            },
        },
        {
            id: "s3",
            grid: "three-up",
            cells: {
                a: { element: { type: "stat", data: { value: "30s", label: "prompt → first draft" } } },
                b: { element: { type: "stat", data: { value: "22", label: "built-in themes" } } },
                c: { element: { type: "stat", data: { value: "4-in-1", label: "deck · doc · site · social" } } },
            },
        },
        {
            id: "s4",
            grid: "full",
            cells: {
                a: {
                    element: {
                        type: "quote",
                        data: { text: "Speed made everyone a publisher. Taste is the only moat left.", by: "— the Galleo thesis" },
                    },
                },
            },
        },
        {
            id: "s5",
            grid: "split-4060",
            cells: {
                a: {},
                b: {
                    element: {
                        type: "group",
                        data: {
                            gap: 18,
                            children: [
                                { type: "text", data: { text: "07 — The ask", style: "eyebrow", color: ACCENT } },
                                { type: "text", data: { text: "Raising a $3M seed to build it.", style: "h2", color: INK } },
                                { type: "button", data: { label: "hello@galleo.app" } },
                            ],
                        },
                    },
                },
            },
        },
    ],
};
