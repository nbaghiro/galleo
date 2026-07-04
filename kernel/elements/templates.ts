import type { Size } from "@model/artifact";
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
