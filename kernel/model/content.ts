// Galleo content model — the shared contract every package and app depends on.
// One artifact is a tree of sections -> cells -> elements. Element `data` stays schema-flexible.

export type Id = string;

export type Size =
    | { mode: "fit"; min?: number; max?: number }
    | { mode: "grow"; min?: number; max?: number }
    | { mode: "percent"; value: number }
    | { mode: "fixed"; value: number };

export interface BoxInsets {
    top: number;
    right: number;
    bottom: number;
    left: number;
}

// Per-instance layout (how an element sits in its parent row/column) — independent of element data.
export interface ElementLayout {
    width?: "fit" | "fill" | { pct: number }; // fit content · grow to fill · percent of the row
    height?: "fit" | "fill"; // fit content · stretch to the row's cross-height (match a sibling column)
    align?: "start" | "center" | "end"; // self cross-axis alignment
}

// A registered content component instance; `data` is interpreted by its ElementSpec.
export interface ElementInstance {
    type: string;
    data: unknown;
    layout?: ElementLayout;
}

export interface Cell {
    element?: ElementInstance;
}

export interface SectionBackground {
    kind: "none" | "color" | "gradient" | "image";
    color?: string;
    gradient?: { from: string; to: string; angle?: number };
    image?: string;
    scrim?: number; // 0..1 dark overlay over an image for text legibility
    dark?: boolean; // override auto contrast (light text on dark backgrounds)
}

export interface Section {
    id: Id;
    grid: string; // grid template id, e.g. "split-6040"
    cells: Record<string, Cell>;
    background?: SectionBackground;
    bleed?: boolean; // full-bleed (edge-to-edge) vs a contained card
}

export interface ArtifactContent {
    format: Id;
    theme: Id;
    sections: Section[];
    background?: SectionBackground; // document-level backdrop behind all sections
}

export type ArtifactStatus = "draft" | "published";
