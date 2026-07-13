import type { EngineNode } from "@engine/node";
import { GHOST } from "@elements/spec";
import { fit, fixed, grow, percent } from "@model/geometry";

const PAD = { top: 8, right: 10, bottom: 8, left: 10 };
const box = (h: number, radius = 6): EngineNode => ({
    w: grow(),
    h: fixed(h),
    fill: { color: GHOST, radius },
});

// Row of bottom-aligned bars (bar / column / histogram).
export const barsSkel = (heights: number[]): EngineNode => ({
    w: grow(),
    h: fit(),
    direction: "row",
    gap: 7,
    alignY: "end",
    padding: PAD,
    children: heights.map((h) => ({ w: grow(), h: fixed(h), fill: { color: GHOST, radius: 3 } })),
});

// A centered disc (pie / donut / gauge / radar / cycle).
export const discSkel = (): EngineNode => ({
    w: grow(),
    h: fit(),
    direction: "row",
    alignX: "center",
    alignY: "center",
    padding: PAD,
    children: [{ w: fixed(84), h: fixed(84), fill: { color: GHOST, radius: 99 } }],
});

// Two side-by-side discs (venn).
export const twinDiscSkel = (): EngineNode => ({
    w: grow(),
    h: fit(),
    direction: "row",
    gap: 0,
    alignX: "center",
    alignY: "center",
    padding: PAD,
    children: [
        { w: fixed(64), h: fixed(64), fill: { color: GHOST, radius: 99 } },
        { w: fixed(64), h: fixed(64), fill: { color: GHOST, radius: 99 } },
    ],
});

// Scattered dots (scatter / bubble).
export const dotsSkel = (): EngineNode => {
    const dot = (d: number): EngineNode => ({
        w: fixed(d),
        h: fixed(d),
        fill: { color: GHOST, radius: 99 },
    });
    const rowOf = (ds: number[], alignY: "start" | "center" | "end"): EngineNode => ({
        w: grow(),
        h: fixed(22),
        direction: "row",
        gap: 14,
        alignX: "center",
        alignY,
        children: ds.map(dot),
    });
    return {
        w: grow(),
        h: fit(),
        direction: "col",
        gap: 4,
        padding: PAD,
        children: [
            rowOf([7, 10, 6], "end"),
            rowOf([9, 6, 11, 7], "center"),
            rowOf([6, 8], "start"),
        ],
    };
};

// Stacked centered bands (funnel / pyramid) — pass width fractions top→bottom.
export const bandsSkel = (widths: number[]): EngineNode => ({
    w: grow(),
    h: fit(),
    direction: "col",
    gap: 5,
    alignX: "center",
    padding: PAD,
    children: widths.map((wf) => ({
        w: percent(wf),
        h: fixed(24),
        fill: { color: GHOST, radius: 4 },
    })),
});

// A row of connected boxes (process / timeline).
export const boxesSkel = (n: number): EngineNode => ({
    w: grow(),
    h: fit(),
    direction: "row",
    gap: 10,
    alignY: "center",
    padding: PAD,
    children: Array.from({ length: n }, () => box(38, 8)),
});

// A rows×cols block grid (heatmap / treemap / matrix / quadrant).
export const gridSkel = (rows: number, cols: number): EngineNode => ({
    w: grow(),
    h: fit(),
    direction: "col",
    gap: 6,
    padding: PAD,
    children: Array.from({ length: rows }, () => ({
        w: grow(),
        h: fixed(30),
        direction: "row" as const,
        gap: 6,
        children: Array.from({ length: cols }, () => box(30, 4)),
    })),
});

// A little hierarchy: one node over a row of children (tree / org / flow / mindmap).
export const treeSkel = (): EngineNode => ({
    w: grow(),
    h: fit(),
    direction: "col",
    gap: 14,
    alignX: "center",
    padding: PAD,
    children: [
        { w: fixed(64), h: fixed(28), fill: { color: GHOST, radius: 6 } },
        {
            w: grow(),
            h: fit(),
            direction: "row",
            gap: 12,
            alignX: "center",
            children: [
                { w: fixed(58), h: fixed(26), fill: { color: GHOST, radius: 6 } },
                { w: fixed(58), h: fixed(26), fill: { color: GHOST, radius: 6 } },
                { w: fixed(58), h: fixed(26), fill: { color: GHOST, radius: 6 } },
            ],
        },
    ],
});
