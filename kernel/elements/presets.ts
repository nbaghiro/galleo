import type { ElementInstance } from "@model/content";

// One-click "smart layout" inserts — pre-built structures assembled from normal, freely-editable
// elements (a group grid of styled cards). Not element types: the picker inserts the built instance,
// after which every piece (each card, its title/body) selects/edits/deletes like any other element.

const card = (title: string, body: string): ElementInstance => ({
    type: "card",
    data: {
        style: "solid",
        children: [
            { type: "text", data: { text: title, style: "h3" } },
            { type: "text", data: { text: body, style: "body" } },
        ],
    },
});

export interface Preset {
    id: string;
    label: string;
    previewType: string; // element-preview svg key used for the thumbnail
    build: () => ElementInstance;
}

export const PRESETS: Preset[] = [
    {
        id: "cards",
        label: "Cards",
        previewType: "cards",
        build: () => ({
            type: "group",
            data: {
                columns: 3,
                children: [
                    card("First idea", "A short supporting line."),
                    card("Second idea", "A short supporting line."),
                    card("Third idea", "A short supporting line."),
                ],
            },
        }),
    },
];
