import type { ArtifactContent } from "@model/content";

const ACCENT = "#9a4f24";
const INK = "#211c16";

// The open artifact: an ordered list of variable-height sections. In-memory for now; persistence
// (services/data) arrives later.

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
                                    data: {
                                        children: [
                                            { type: "text", data: { text: "Blocks, not slides", style: "body" } },
                                            { type: "text", data: { text: "Themes that aren’t slop", style: "body" } },
                                            { type: "text", data: { text: "An agent with actual taste", style: "body" } },
                                        ],
                                    },
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
                a: {
                    element: {
                        type: "stat",
                        data: {
                            children: [
                                { type: "text", data: { text: "30s", style: "stat" } },
                                { type: "text", data: { text: "prompt → first draft", style: "caption" } },
                            ],
                        },
                    },
                },
                b: {
                    element: {
                        type: "stat",
                        data: {
                            children: [
                                { type: "text", data: { text: "22", style: "stat" } },
                                { type: "text", data: { text: "built-in themes", style: "caption" } },
                            ],
                        },
                    },
                },
                c: {
                    element: {
                        type: "stat",
                        data: {
                            children: [
                                { type: "text", data: { text: "4-in-1", style: "stat" } },
                                { type: "text", data: { text: "deck · doc · site · social", style: "caption" } },
                            ],
                        },
                    },
                },
            },
        },
        {
            id: "s4",
            grid: "full",
            cells: {
                a: {
                    element: {
                        type: "quote",
                        data: {
                            children: [
                                { type: "text", data: { text: "Speed made everyone a publisher. Taste is the only moat left.", style: "title" } },
                                { type: "text", data: { text: "— the Galleo thesis", style: "byline" } },
                            ],
                        },
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
