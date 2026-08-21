import type { EngineNode } from "@engine/node";
import type { LayoutCtx } from "@elements/spec";
import { fixed, grow, percent } from "@model/geometry";
import {
    PAD,
    clamp,
    decorate,
    diagramCell,
    itemColors,
    nodeFont,
    nodePaint,
    registerDiagram,
    type ResolvedDiagram,
} from "./utils";

const GAP = 8;
const HEADER_H = 20;
const DEFAULT_COLS = 4;

interface Lane {
    col: number;
    row: number;
    span: number;
}

// phases laid end to end across the columns, wrapping to a new lane when one no longer fits
function lanes(spans: number[], cols: number): Lane[] {
    const out: Lane[] = [];
    let col = 0;
    let row = 0;
    for (const span of spans) {
        if (col + span > cols) {
            row += 1;
            col = 0;
        }
        out.push({ col, row, span });
        col += span;
    }
    return out;
}

// Columns are percent, never pixels: the engine resolves them against the row's real width, so the
// grid stays inside the element however the box differs from the width compose estimated.
function arrange(
    diagram: ResolvedDiagram,
    ctx: LayoutCtx,
    kids: EngineNode[],
    height: number,
): EngineNode {
    const items = diagram.items;
    const n = items.length;
    if (n === 0) return { w: grow(), h: fixed(height) };
    const cols = Math.max(1, diagram.axes.length || DEFAULT_COLS);
    const colors = itemColors(items, ctx.theme);
    const spans = items.map((i) => clamp(Math.round(i.value ?? 1), 1, cols));
    const placed = lanes(spans, cols);
    const rows = Math.max(...placed.map((l) => l.row)) + 1;
    const headerH = diagram.axes.length ? HEADER_H : 0;
    const laneH = Math.max(18, (height - PAD * 2 - headerH) / rows);

    const byRow: number[][] = Array.from({ length: rows }, () => []);
    placed.forEach((l, i) => byRow[l.row]!.push(i));

    const header: EngineNode = {
        w: grow(),
        h: fixed(headerH),
        direction: "row",
        children: diagram.axes.slice(0, cols).map(
            (text): EngineNode => ({
                w: percent(1 / cols),
                h: fixed(headerH),
                text: {
                    text,
                    fontId: nodeFont(ctx.theme),
                    size: 10.5,
                    weight: 500,
                    color: ctx.theme.muted,
                    align: "center",
                    wrap: "none",
                },
            }),
        ),
    };

    const lane = (r: number): EngineNode => {
        const kidsOut: EngineNode[] = [];
        let cursor = 0;
        for (const i of byRow[r]!) {
            const l = placed[i]!;
            if (l.col > cursor) kidsOut.push({ w: percent((l.col - cursor) / cols), h: grow() });
            const cell = diagramCell(
                kids[i * 2],
                kids[i * 2 + 1],
                nodePaint(colors[i]!, ctx.theme, {
                    style: diagram.options.style,
                    emphasis: items[i]?.emphasis,
                }),
                { icon: items[i]?.icon },
            );
            kidsOut.push({
                w: percent(l.span / cols),
                h: grow(),
                padding: { top: GAP / 2, bottom: GAP / 2, left: GAP / 2, right: GAP / 2 },
                children: [cell],
            });
            cursor = l.col + l.span;
        }
        return { w: grow(), h: fixed(laneH), direction: "row", children: kidsOut };
    };

    return {
        w: grow(),
        h: fixed(height),
        direction: "col",
        padding: { top: PAD, bottom: PAD, left: PAD, right: PAD },
        children: [
            ...(headerH ? [header] : []),
            ...Array.from({ length: rows }, (_, r) => lane(r)),
            // a float is placed in the parent's content box, so this already sits inside the
            // padding the lanes are laid out in: the columns divide its own width, untouched
            decorate((g, box) => {
                for (let c = 0; c <= cols; c++) {
                    const x = (c * box.w) / cols;
                    g.line(x, headerH, x, box.h, { stroke: ctx.theme.line, width: 1 });
                }
            }),
        ],
    };
}

registerDiagram({ id: "roadmap", label: "Roadmap", arrange });
