import type { Size, ElementInstance } from "@model/artifact";
import { grow, percent } from "@model/size";

// Predefined section layouts as per-cell width specs. compose() builds the cell boxes (and tags them
// for selection); spacing is via per-cell padding so widths sum to the full width without gap math.
// Custom grids + spanning come later.

export interface Template {
    id: string;
    cells: string[];
    widths: Size[];
}

const full: Template = { id: "full", cells: ["a"], widths: [grow()] };

export const TEMPLATES: Record<string, Template> = {
    full,
    "split-6040": { id: "split-6040", cells: ["a", "b"], widths: [percent(0.6), percent(0.4)] },
    "split-4060": { id: "split-4060", cells: ["a", "b"], widths: [percent(0.4), percent(0.6)] },
    "two-col": { id: "two-col", cells: ["a", "b"], widths: [percent(0.5), percent(0.5)] },
    "three-up": {
        id: "three-up",
        cells: ["a", "b", "c"],
        widths: [percent(1 / 3), percent(1 / 3), percent(1 / 3)],
    },
};

export const fallbackTemplate = full;

export const TEMPLATE_LABELS: Record<string, string> = {
    full: "Full",
    "split-6040": "60 / 40",
    "split-4060": "40 / 60",
    "two-col": "Two columns",
    "three-up": "Three up",
};

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
