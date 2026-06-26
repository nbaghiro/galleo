import type { EngineNode } from "@engine/node";
import type { Size } from "@model/content";
import { fit, grow, percent } from "@model/size";

// Predefined section layouts. Each compiles its cell contents into an EngineNode (row of cells with
// per-cell width). Spacing is via per-cell padding (gutter), so cell widths sum to the full width
// without gap math. Custom grids + spanning come later.

const GUTTER = 14;
const pad = (n: number) => ({ top: n, right: n, bottom: n, left: n });

const cellBox = (w: Size, content: EngineNode): EngineNode => ({
    w,
    h: fit(),
    padding: pad(GUTTER),
    direction: "col",
    children: [content],
});

const rowSec = (children: EngineNode[]): EngineNode => ({
    w: grow(),
    h: fit(),
    direction: "row",
    gap: 0,
    alignY: "center",
    children,
});

export interface Template {
    id: string;
    cells: string[];
    build: (contents: EngineNode[]) => EngineNode;
}

const full: Template = {
    id: "full",
    cells: ["a"],
    build: (c) => rowSec([cellBox(grow(), c[0]!)]),
};

export const TEMPLATES: Record<string, Template> = {
    full,
    "split-6040": {
        id: "split-6040",
        cells: ["a", "b"],
        build: (c) => rowSec([cellBox(percent(0.6), c[0]!), cellBox(percent(0.4), c[1]!)]),
    },
    "split-4060": {
        id: "split-4060",
        cells: ["a", "b"],
        build: (c) => rowSec([cellBox(percent(0.4), c[0]!), cellBox(percent(0.6), c[1]!)]),
    },
    "two-col": {
        id: "two-col",
        cells: ["a", "b"],
        build: (c) => rowSec([cellBox(percent(0.5), c[0]!), cellBox(percent(0.5), c[1]!)]),
    },
    "three-up": {
        id: "three-up",
        cells: ["a", "b", "c"],
        build: (c) =>
            rowSec([cellBox(percent(1 / 3), c[0]!), cellBox(percent(1 / 3), c[1]!), cellBox(percent(1 / 3), c[2]!)]),
    },
};

export const fallbackTemplate = full;
