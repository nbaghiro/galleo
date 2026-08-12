import type { EngineNode } from "@engine/node";
import type { LayoutCtx } from "@elements/spec";
import { fixed, grow } from "@model/geometry";
import {
    badgeText,
    badgeX,
    clamp,
    decorate,
    diagramCell,
    drawNodeBadge,
    itemColors,
    nodePaint,
    getNodeShape,
    drawShape,
    registerDiagram,
    type ResolvedDiagram,
} from "./utils";

const CELL_H = 42;
const HUB_H = 48;

// the first item is the emphasized centre; the rest ring it as spokes
function arrange(
    diagram: ResolvedDiagram,
    ctx: LayoutCtx,
    kids: EngineNode[],
    height: number,
): EngineNode {
    const [centre, ...spokes] = diagram.items;
    const n = spokes.length;
    const cols = itemColors(diagram.items, ctx.theme);
    const W = ctx.availWidth;
    const cellW = clamp(W / Math.max(3, n), 96, 140);
    const hubW = clamp(cellW * 1.2, 120, 170);
    const rx = Math.max(1, W / 2 - cellW / 2 - 12);
    const ry = Math.max(1, height / 2 - CELL_H / 2 - 12);
    const angle = (i: number): number => -Math.PI / 2 + (i * Math.PI * 2) / Math.max(1, n);
    const at = (a: number): [number, number] => [
        W / 2 + Math.cos(a) * rx,
        height / 2 + Math.sin(a) * ry,
    ];
    const shape = diagram.options.shape ?? "rounded";
    const painted = !getNodeShape(shape).engineRadius;
    const inset = getNodeShape(shape).insetX(CELL_H);
    const badged = diagram.options.numbers !== "none";
    if (!centre) return { w: grow(), h: fixed(height) };

    const hub = diagramCell(
        kids[0],
        kids[1],
        nodePaint(cols[0]!, ctx.theme, { style: diagram.options.style, emphasis: true }),
        { radius: HUB_H / 2 },
    );
    hub.w = fixed(hubW);
    hub.h = fixed(HUB_H);
    hub.float = { x: "center", y: "center", z: 2 };

    const cells = spokes.map((item, s) => {
        const i = s + 1; // item index (centre is 0)
        const [x, y] = at(angle(s));
        const paint = nodePaint(cols[i]!, ctx.theme, {
            style: diagram.options.style,
            emphasis: item.emphasis,
        });
        const cell = diagramCell(kids[i * 2], kids[i * 2 + 1], paint, {
            shape,
            cellH: CELL_H,
            badged,
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
            hub,
            ...cells,
            decorate((g) => {
                const cx = W / 2;
                const cy = height / 2;
                // spokes run edge to edge: from the hub pill's boundary to the spoke cell's,
                // so they never poke through an outline or angled cell behind the label
                const hubRect = {
                    x: cx - hubW / 2,
                    y: cy - HUB_H / 2,
                    w: hubW,
                    h: HUB_H,
                };
                spokes.forEach((item, s) => {
                    const [x, y] = at(angle(s));
                    const cell = { x: x - cellW / 2, y: y - CELL_H / 2, w: cellW, h: CELL_H };
                    const dx = x - cx;
                    const dy = y - cy;
                    // slab entry t for a rect the segment ends inside; exit t for one it starts inside
                    const entry = (r: typeof cell): number => {
                        const txe = dx !== 0 ? ((dx > 0 ? r.x : r.x + r.w) - cx) / dx : -Infinity;
                        const tye = dy !== 0 ? ((dy > 0 ? r.y : r.y + r.h) - cy) / dy : -Infinity;
                        return Math.max(txe, tye);
                    };
                    const exit = (r: typeof cell): number => {
                        const txx = dx !== 0 ? ((dx > 0 ? r.x + r.w : r.x) - cx) / dx : Infinity;
                        const tyx = dy !== 0 ? ((dy > 0 ? r.y + r.h : r.y) - cy) / dy : Infinity;
                        return Math.min(txx, tyx);
                    };
                    const t0 = Math.max(0, Math.min(1, exit(hubRect)));
                    const t1 = Math.max(t0, Math.min(1, entry(cell)));
                    if (t1 - t0 < 0.05) return;
                    g.line(cx + dx * t0, cy + dy * t0, cx + dx * t1, cy + dy * t1, {
                        stroke: ctx.theme.line,
                        width: 2,
                    });
                });
                spokes.forEach((item, s) => {
                    const i = s + 1;
                    const [x, y] = at(angle(s));
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
                    const badge = badgeText(diagram.options.numbers, i);
                    if (badge) drawNodeBadge(g, badgeX(b.x, inset), y, badge, cols[i]!, ctx.theme);
                });
            }),
        ],
    };
}

registerDiagram({ id: "hub", label: "Hub & spoke", arrange });
