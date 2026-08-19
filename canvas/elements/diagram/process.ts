import type { DrawContext, EngineNode, Rect } from "@engine/node";
import type { LayoutCtx } from "@elements/spec";
import type { Tokens } from "@themes";
import { fixed, grow } from "@model/geometry";
import {
    PAD,
    badgeText,
    badgeX,
    clamp,
    decorate,
    diagramCell,
    drawLink,
    drawNodeBadge,
    drawShape,
    getNodeShape,
    itemColors,
    itemWeight,
    maxLabelWidth,
    nodePaint,
    registerDiagram,
    type DiagItem,
    type ResolvedDiagram,
} from "./utils";

const GAP = 40;
const ROW_GAP = 26;
const NODE_H = 56;

// One geometry pass, shared by the cell rows and the connector/badge decoration between them.
interface Shape {
    perRow: number;
    rows: number;
    nodeH: number;
    rowGap: number;
}
function shape(n: number, W: number, H: number, gap: number, minW: number): Shape {
    const avail = W - PAD * 2;
    const fits = Math.max(1, Math.min(n, Math.floor((avail + gap) / (minW + gap))));
    // spread evenly once it wraps: 4 steps in a 3-wide row read as 2+2, not 3 and a stranded 1
    const rows = Math.ceil(n / fits);
    const perRow = Math.ceil(n / rows);
    const cell = (H - PAD * 2) / rows;
    const rowGap = Math.min(ROW_GAP, cell * 0.22);
    return { perRow, rows, nodeH: Math.max(1, Math.min(NODE_H, cell - rowGap)), rowGap };
}

// Weighted split with a per-item floor: a cell never squeezes below its own label, so weights can
// never make a label wrap past the cell (the wrap-safety minW gave the uniform layout). Every
// floor ≤ minW ≤ the uniform column, so the floors always fit; the shrink lands on the unclamped
// cells in proportion to their weights.
function rowWidths(ws: number[], floors: number[], avail: number): number[] {
    const clamped = ws.map(() => false);
    for (let pass = 0; pass < ws.length; pass++) {
        const fixedW = floors.reduce((a, f, i) => a + (clamped[i] ? f : 0), 0);
        const freeSum = ws.reduce((a, w, i) => a + (clamped[i] ? 0 : w), 0) || 1;
        let changed = false;
        ws.forEach((w, i) => {
            if (!clamped[i] && ((avail - fixedW) * w) / freeSum < floors[i]!) {
                clamped[i] = true;
                changed = true;
            }
        });
        if (!changed) break;
    }
    const fixedW = floors.reduce((a, f, i) => a + (clamped[i] ? f : 0), 0);
    const freeSum = ws.reduce((a, w, i) => a + (clamped[i] ? 0 : w), 0) || 1;
    return ws.map((w, i) => (clamped[i] ? floors[i]! : ((avail - fixedW) * w) / freeSum));
}

// Per-cell x/w for every item: each row splits its width by item weight (a weightless row divides
// evenly, so a partial last row keeps uniform node sizes exactly as before). One formula, consumed
// by the cell rows and both decorate surfaces, so connectors and silhouettes track resized cells.
function cellRects(
    items: DiagItem[],
    s: Shape,
    W: number,
    gap: number,
    floors: number[],
): { x: number; w: number }[] {
    const uniform = (W - gap * (s.perRow - 1)) / s.perRow;
    const out: { x: number; w: number }[] = [];
    for (let r = 0; r < s.rows; r++) {
        const from = r * s.perRow;
        const slice = items.slice(from, Math.min(items.length, from + s.perRow));
        const ws = slice.map(itemWeight);
        const widths = rowWidths(
            ws,
            slice.map((_, i) => Math.min(floors[from + i]!, uniform)),
            uniform * slice.length,
        );
        let x = 0;
        for (const cw of widths) {
            out.push({ x, w: cw });
            x += cw + gap;
        }
    }
    return out;
}

function links(g: DrawContext, b: Rect, last: boolean, theme: Tokens, gap: number): void {
    if (last) return;
    const cy = b.y + b.h / 2;
    drawLink(
        g,
        [
            [b.x + b.w, cy],
            [b.x + b.w + gap, cy],
        ],
        theme,
        { color: theme.muted, width: 2 },
    );
}

function arrange(
    diagram: ResolvedDiagram,
    ctx: LayoutCtx,
    kids: EngineNode[],
    height: number,
): EngineNode {
    const n = diagram.items.length;
    const cols = itemColors(diagram.items, ctx.theme);
    const nodeShape = diagram.options.shape ?? "rounded";
    const painted = !getNodeShape(nodeShape).engineRadius;
    // a chevron band is its own arrow: cells butt together and the connectors go
    const chevron = nodeShape === "chevron";
    const gap = chevron ? 8 : GAP;
    // wrap early enough that the longest label fits a column without squeezing (capped so one
    // long label can't force one-per-row)
    const minW = clamp(maxLabelWidth(ctx, diagram.items) + 28, 96, 200);
    const s = shape(n, ctx.availWidth, height, gap, minW);
    const inset = getNodeShape(nodeShape).insetX(s.nodeH);
    const badged = diagram.options.numbers !== "none";
    // per-item wrap floors: the label plus its cell padding and leading glyph/badge inset; pixel
    // measurements, so the decorate closures reuse the same array against their own box width
    const floors = diagram.items.map(
        (it) => maxLabelWidth(ctx, [it]) + 28 + 2 * inset + (it.icon || badged ? 22 : 0),
    );
    // fixed widths from the same formula the decorate surfaces use, so the connectors stay in the
    // gaps whatever the weights (grow cells would stretch to fill)
    const contentW = ctx.availWidth - PAD * 2;
    const rects = cellRects(diagram.items, s, contentW, gap, floors);
    const rows: EngineNode[] = [];
    for (let r = 0; r < s.rows; r++) {
        const slice = Array.from({ length: s.perRow }, (_, c) => r * s.perRow + c).filter(
            (i) => i < n,
        );
        rows.push({
            w: grow(),
            h: fixed(s.nodeH),
            direction: "row",
            gap,
            children: slice.map((i) => {
                const cell = diagramCell(
                    kids[i * 2],
                    kids[i * 2 + 1],
                    nodePaint(cols[i]!, ctx.theme, {
                        style: diagram.options.style,
                        emphasis: diagram.items[i]?.emphasis,
                    }),
                    { shape: nodeShape, cellH: s.nodeH, badged, icon: diagram.items[i]?.icon },
                );
                cell.w = fixed(rects[i]!.w);
                return cell;
            }),
        });
    }
    return {
        w: grow(),
        h: fixed(height),
        direction: "col",
        alignY: "center",
        gap: s.rowGap,
        padding: { top: PAD, bottom: PAD, left: PAD, right: PAD },
        children: [
            ...rows,
            // structure comes from the same `s` the rows were built with; only the pixel widths
            // come from the real box, so the connectors always land between the boxes above them
            decorate((g, box) => {
                const boxRects = cellRects(diagram.items, s, box.w, gap, floors);
                const total = s.rows * s.nodeH + (s.rows - 1) * s.rowGap;
                const top = (box.h - total) / 2;
                for (let i = 0; i < n; i++) {
                    const b = {
                        x: boxRects[i]!.x,
                        y: top + Math.floor(i / s.perRow) * (s.nodeH + s.rowGap),
                        w: boxRects[i]!.w,
                        h: s.nodeH,
                    };
                    if (!chevron)
                        links(g, b, i % s.perRow >= s.perRow - 1 || i >= n - 1, ctx.theme, gap);
                    // an item's icon takes the leading slot, so its number stands down
                    const badge = diagram.items[i]?.icon
                        ? undefined
                        : badgeText(diagram.options.numbers, i);
                    if (badge)
                        drawNodeBadge(
                            g,
                            badgeX(b.x, inset),
                            b.y + b.h / 2,
                            badge,
                            cols[i]!,
                            ctx.theme,
                        );
                }
            }, 1),
            ...(painted
                ? [
                      decorate((g, box) => {
                          const boxRects = cellRects(diagram.items, s, box.w, gap, floors);
                          const total = s.rows * s.nodeH + (s.rows - 1) * s.rowGap;
                          const top = (box.h - total) / 2;
                          for (let i = 0; i < n; i++) {
                              const b = {
                                  x: boxRects[i]!.x,
                                  y: top + Math.floor(i / s.perRow) * (s.nodeH + s.rowGap),
                                  w: boxRects[i]!.w,
                                  h: s.nodeH,
                              };
                              drawShape(
                                  g,
                                  nodeShape,
                                  b,
                                  nodePaint(cols[i]!, ctx.theme, {
                                      style: diagram.options.style,
                                      emphasis: diagram.items[i]?.emphasis,
                                  }),
                                  { first: i % s.perRow === 0 },
                              );
                          }
                      }),
                  ]
                : []),
        ],
    };
}

registerDiagram({ id: "process", label: "Process", weights: true, arrange });
