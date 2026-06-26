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

// A registered content component instance; `data` is interpreted by its ElementSpec.
export interface ElementInstance {
    type: string;
    data: unknown;
}

export interface Cell {
    element?: ElementInstance;
}

export interface Section {
    id: Id;
    grid: string; // grid template id, e.g. "split-6040"
    cells: Record<string, Cell>;
}

export interface ArtifactContent {
    format: Id;
    theme: Id;
    sections: Section[];
}

export type ArtifactStatus = "draft" | "published";
