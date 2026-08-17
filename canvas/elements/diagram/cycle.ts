import type { EngineNode } from "@engine/node";
import type { LayoutCtx } from "@elements/spec";
import { fixed, grow } from "@model/geometry";
import {
    BADGE_R,
    badgeText,
    badgeX,
    clamp,
    decorate,
    diagramCell,
    drawLink,
    drawNodeBadge,
    itemColors,
    maxLabelWidth,
    nodePaint,
    getNodeShape,
    drawShape,
    registerDiagram,
    type ResolvedDiagram,
} from "./utils";

const CELL_H = 46;

// fixed-size cells on an ellipse, joined head-to-tail by arc connectors
function arrange(
    diagram: ResolvedDiagram,
    ctx: LayoutCtx,
    kids: EngineNode[],
    height: number,
): EngineNode {
    const n = diagram.items.length;
    const cols = itemColors(diagram.items, ctx.theme);
    const W = ctx.availWidth;
    const shape = diagram.options.shape ?? "rounded";
    const painted = !getNodeShape(shape).engineRadius; // decorate paints the silhouette
    const inset = getNodeShape(shape).insetX(CELL_H);
    const badged = diagram.options.numbers !== "none";
    // content-sized under the geometric cap: short labels tighten the ring, long ones wrap
    const cap = clamp(W / Math.max(3, n), 100, 150);
    const need = maxLabelWidth(ctx, diagram.items) + 24 + inset * 2 + (badged ? BADGE_R * 2 : 0);
    const cellW = clamp(need, 84, cap);
    const rx = Math.max(1, W / 2 - cellW / 2 - 16);
    const ry = Math.max(1, height / 2 - CELL_H / 2 - 16);
    const angle = (i: number): number => -Math.PI / 2 + (i * Math.PI * 2) / Math.max(1, n);
    const at = (a: number): [number, number] => [
        W / 2 + Math.cos(a) * rx,
        height / 2 + Math.sin(a) * ry,
    ];
    const cells = diagram.items.map((item, i) => {
        const [x, y] = at(angle(i));
        const paint = nodePaint(cols[i]!, ctx.theme, {
            style: diagram.options.style,
            emphasis: item.emphasis,
        });
        const cell = diagramCell(kids[i * 2], kids[i * 2 + 1], paint, {
            shape,
            cellH: CELL_H,
            badged,
            icon: item.icon,
        });
        cell.w = fixed(cellW);
        cell.h = fixed(CELL_H);
        cell.float = { x: "start", y: "start", dx: x - cellW / 2, dy: y - CELL_H / 2, z: 1 };
        return cell;
    });
    return {
        w: grow(),
        h: fixed(height),
        children: [
            ...cells,
            decorate((g) => {
                const cellRect = (i: number): { x: number; y: number; w: number; h: number } => {
                    const [x, y] = at(angle(i));
                    return { x: x - cellW / 2, y: y - CELL_H / 2, w: cellW, h: CELL_H };
                };
                const insideRect = (
                    p: [number, number],
                    r: { x: number; y: number; w: number; h: number },
                ): boolean =>
                    p[0] > r.x - 3 &&
                    p[0] < r.x + r.w + 3 &&
                    p[1] > r.y - 3 &&
                    p[1] < r.y + r.h + 3;
                for (let i = 0; i < n && n > 1; i++) {
                    const gapA = (Math.PI * 2) / n;
                    const start = angle(i) + gapA * 0.2;
                    const end = angle(i) + gapA * 0.8;
                    const a = cellRect(i);
                    const b = cellRect((i + 1) % n);
                    // sample the ellipse arc and keep only the stretch clear of both cells, so a
                    // crowded ring never draws its connector through a neighbour
                    const pts: [number, number][] = [];
                    for (let t = 0; t <= 16; t++) {
                        const p = at(start + ((end - start) * t) / 16);
                        if (!insideRect(p, a) && !insideRect(p, b)) pts.push(p);
                    }
                    if (pts.length >= 3)
                        drawLink(g, pts, ctx.theme, { color: ctx.theme.muted, width: 2 });
                }
                diagram.items.forEach((item, i) => {
                    const [x, y] = at(angle(i));
                    const b = { x: x - cellW / 2, y: y - CELL_H / 2, w: cellW, h: CELL_H };
                    if (painted)
                        drawShape(
                            g,
                            shape,
                            b,
                            nodePaint(cols[i]!, ctx.theme, {
                                style: diagram.options.style,
                                emphasis: item.emphasis,
                            }),
                        );
                    const badge = item.icon ? undefined : badgeText(diagram.options.numbers, i);
                    if (badge) drawNodeBadge(g, badgeX(b.x, inset), y, badge, cols[i]!, ctx.theme);
                });
            }),
        ],
    };
}

registerDiagram({ id: "cycle", label: "Cycle", arrange });
