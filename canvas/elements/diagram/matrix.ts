import type { EngineNode } from "@engine/node";
import type { LayoutCtx } from "@elements/spec";
import { fixed, grow } from "@model/geometry";
import {
    PAD,
    badgeText,
    badgeX,
    decorate,
    diagramCell,
    drawNodeBadge,
    drawShape,
    getNodeShape,
    itemColors,
    nodeFont,
    nodePaint,
    registerDiagram,
    type ResolvedDiagram,
} from "./utils";

const GAP = 10;
const HEADER_H = 20;

// caption leaf for an axes header; plain engine text, not an editable child
const header = (text: string, theme: LayoutCtx["theme"]): EngineNode => ({
    w: grow(),
    h: fixed(HEADER_H),
    text: {
        text,
        fontId: nodeFont(theme),
        size: 11,
        weight: 500,
        color: theme.muted,
        align: "center",
        wrap: "none",
    },
});

// a near-square grid of cells; `axes` captions the columns, then the rows
function arrange(
    diagram: ResolvedDiagram,
    ctx: LayoutCtx,
    kids: EngineNode[],
    height: number,
): EngineNode {
    const n = diagram.items.length;
    const cols = itemColors(diagram.items, ctx.theme);
    const ncol = Math.max(1, Math.ceil(Math.sqrt(n)));
    const nrow = Math.ceil(n / ncol);
    const colHeaders = diagram.axes.slice(0, ncol);
    const hasHeaders = colHeaders.length > 0;
    const gridH = height - PAD * 2 - (hasHeaders ? HEADER_H + GAP : 0);
    const cellH = gridH / nrow - GAP;
    const nodeShape = diagram.options.shape ?? "rounded";
    const painted = !getNodeShape(nodeShape).engineRadius;
    const inset = getNodeShape(nodeShape).insetX(cellH);
    const badged = diagram.options.numbers !== "none";
    // fixed widths from the decorate grid's own formula: a partial last row keeps uniform cells
    const cellW = (ctx.availWidth - PAD * 2 - GAP * (ncol - 1)) / ncol;
    const rows: EngineNode[] = [];
    if (hasHeaders)
        rows.push({
            w: grow(),
            h: fixed(HEADER_H),
            direction: "row",
            gap: GAP,
            children: Array.from({ length: ncol }, (_, c) =>
                header(colHeaders[c] ?? "", ctx.theme),
            ),
        });
    for (let r = 0; r < nrow; r++) {
        const slice = Array.from({ length: ncol }, (_, c) => r * ncol + c).filter((i) => i < n);
        rows.push({
            w: grow(),
            h: fixed(cellH),
            direction: "row",
            gap: GAP,
            children: slice.map((i) => {
                const cell = diagramCell(
                    kids[i * 2],
                    kids[i * 2 + 1],
                    nodePaint(cols[i]!, ctx.theme, {
                        style: diagram.options.style,
                        emphasis: diagram.items[i]?.emphasis,
                    }),
                    { shape: nodeShape, cellH, badged },
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
        gap: GAP,
        padding: { top: PAD, bottom: PAD, left: PAD, right: PAD },
        children: [
            ...rows,
            decorate((g, box) => {
                if (diagram.options.numbers === "none") return;
                const cellW = (box.w - GAP * (ncol - 1)) / ncol;
                const top = hasHeaders ? HEADER_H + GAP : 0;
                diagram.items.forEach((_, i) => {
                    const badge = badgeText(diagram.options.numbers, i);
                    if (!badge) return;
                    const x = badgeX((i % ncol) * (cellW + GAP), inset);
                    const y = top + Math.floor(i / ncol) * (cellH + GAP) + cellH / 2;
                    drawNodeBadge(g, x, y, badge, cols[i]!, ctx.theme);
                });
            }, 1),
            ...(painted
                ? [
                      decorate((g, box) => {
                          const cellW = (box.w - GAP * (ncol - 1)) / ncol;
                          const top = hasHeaders ? HEADER_H + GAP : 0;
                          diagram.items.forEach((item, i) => {
                              drawShape(
                                  g,
                                  nodeShape,
                                  {
                                      x: (i % ncol) * (cellW + GAP),
                                      y: top + Math.floor(i / ncol) * (cellH + GAP),
                                      w: cellW,
                                      h: cellH,
                                  },
                                  nodePaint(cols[i]!, ctx.theme, {
                                      style: diagram.options.style,
                                      emphasis: item.emphasis,
                                  }),
                              );
                          });
                      }),
                  ]
                : []),
        ],
    };
}

registerDiagram({ id: "matrix", label: "Matrix", arrange });
