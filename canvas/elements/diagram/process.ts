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
    maxLabelWidth,
    nodePaint,
    registerDiagram,
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
    // fixed widths from the same formula the decorate surface uses, so a partial last row keeps
    // uniform node sizes and the connectors stay in the gaps (grow cells would stretch to fill)
    const contentW = ctx.availWidth - PAD * 2;
    const cellW = (contentW - gap * (s.perRow - 1)) / s.perRow;
    const inset = getNodeShape(nodeShape).insetX(s.nodeH);
    const badged = diagram.options.numbers !== "none";
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
                cell.w = fixed(cellW);
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
                const nodeW = (box.w - gap * (s.perRow - 1)) / s.perRow;
                const total = s.rows * s.nodeH + (s.rows - 1) * s.rowGap;
                const top = (box.h - total) / 2;
                for (let i = 0; i < n; i++) {
                    const b = {
                        x: (i % s.perRow) * (nodeW + gap),
                        y: top + Math.floor(i / s.perRow) * (s.nodeH + s.rowGap),
                        w: nodeW,
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
                          const nodeW = (box.w - gap * (s.perRow - 1)) / s.perRow;
                          const total = s.rows * s.nodeH + (s.rows - 1) * s.rowGap;
                          const top = (box.h - total) / 2;
                          for (let i = 0; i < n; i++) {
                              const b = {
                                  x: (i % s.perRow) * (nodeW + gap),
                                  y: top + Math.floor(i / s.perRow) * (s.nodeH + s.rowGap),
                                  w: nodeW,
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

registerDiagram({ id: "process", label: "Process", arrange });
