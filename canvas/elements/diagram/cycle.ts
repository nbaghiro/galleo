import type { EngineNode } from "@engine/node";
import type { LayoutCtx } from "@elements/spec";
import { mix } from "@themes";
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
    itemRegions,
    markScale,
    maxLabelWidth,
    nodePaint,
    getNodeShape,
    drawShape,
    registerDiagram,
    type ResolvedDiagram,
} from "./utils";

const BASE_H = 46;

// fixed-size cells on an ellipse, joined head-to-tail by arc connectors
function arrange(
    diagram: ResolvedDiagram,
    ctx: LayoutCtx,
    kids: EngineNode[],
    height: number,
): EngineNode {
    const n = diagram.items.length;
    const cols = itemColors(diagram, ctx.theme);
    const W = ctx.availWidth;
    const ms = markScale(height);
    const cellH = clamp(BASE_H * ms, BASE_H, Math.max(BASE_H, height * 0.22));
    const shape = diagram.options.shape ?? "rounded";
    const painted = !getNodeShape(shape).engineRadius; // decorate paints the silhouette
    const inset = getNodeShape(shape).insetX(cellH);
    const badged = diagram.options.numbers !== "none";
    // content-sized under the geometric cap: short labels tighten the ring, long ones wrap
    const cap = clamp(W / Math.max(3, n), 110, 190);
    const need = maxLabelWidth(ctx, diagram.items) + 24 + inset * 2 + (badged ? BADGE_R * 2 : 0);
    // a short label still earns a node with presence: the ring was a chain of small pills
    const cellW = clamp(need, Math.min(cap, 100 * ms), cap);
    const rx = Math.max(1, W / 2 - cellW / 2 - 16);
    const ry = Math.max(1, height / 2 - cellH / 2 - 16);
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
            cellH: cellH,
            badged,
            icon: item.icon,
        });
        cell.w = fixed(cellW);
        cell.h = fixed(cellH);
        cell.float = { x: "start", y: "start", dx: x - cellW / 2, dy: y - cellH / 2, z: 1 };
        return cell;
    });
    return {
        w: grow(),
        h: fixed(height),
        children: [
            ...cells,
            decorate(
                (g) => {
                    const cellRect = (
                        i: number,
                    ): { x: number; y: number; w: number; h: number } => {
                        const [x, y] = at(angle(i));
                        return { x: x - cellW / 2, y: y - cellH / 2, w: cellW, h: cellH };
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
                            // the arc belongs to the step it leaves, so the ring reads as flow
                            // rather than as four boxes joined by the same grey wire
                            drawLink(g, pts, ctx.theme, {
                                color: mix(cols[i]!, ctx.theme.ink, 0.2),
                                width: 2.4 * ms,
                            });
                    }
                    diagram.items.forEach((item, i) => {
                        const [x, y] = at(angle(i));
                        const b = { x: x - cellW / 2, y: y - cellH / 2, w: cellW, h: cellH };
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
                        if (badge)
                            drawNodeBadge(g, badgeX(b.x, inset), y, badge, cols[i]!, ctx.theme);
                    });
                },
                -1,
                () =>
                    itemRegions(ctx, n, (i) => {
                        const [x, y] = at(angle(i));
                        return { x: x - cellW / 2, y: y - cellH / 2, w: cellW, h: cellH };
                    }),
            ),
        ],
    };
}

registerDiagram({ id: "cycle", label: "Cycle", arrange });
