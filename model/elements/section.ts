// Section grid templates — the column-layout ids + their cell keys (fill each cell with one element). The
// column *widths* are canvas geometry (Size[] in compose.ts), keyed by these ids. Section-level rather than
// an element category, but part of the same authoring contract, so it sits with the element value-sets.

export interface GridTemplate {
    id: string;
    cells: readonly string[];
}

export const GRID_TEMPLATES: readonly GridTemplate[] = [
    { id: "full", cells: ["a"] },
    { id: "split-6040", cells: ["a", "b"] },
    { id: "split-4060", cells: ["a", "b"] },
    { id: "two-col", cells: ["a", "b"] },
    { id: "three-up", cells: ["a", "b", "c"] },
] as const;

export const GRID_IDS = GRID_TEMPLATES.map((g) => g.id);
