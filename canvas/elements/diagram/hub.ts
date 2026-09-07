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
    drawNodeBadge,
    itemColors,
    itemRegions,
    labelWidth,
    markScale,
    maxLabelWidth,
    nodePaint,
    getNodeShape,
    drawShape,
    registerDiagram,
    type ResolvedDiagram,
} from "./utils";

const BASE_H = 42;
const BASE_HUB_H = 48;

// the first item is the emphasized centre; the rest ring it as spokes
function arrange(
    diagram: ResolvedDiagram,
    ctx: LayoutCtx,
    kids: EngineNode[],
    height: number,
): EngineNode {
    const [centre, ...spokes] = diagram.items;
    const n = spokes.length;
    const cols = itemColors(diagram, ctx.theme);
    const W = ctx.availWidth;
    const ms = markScale(height);
    const cellH = clamp(BASE_H * ms, BASE_H, Math.max(BASE_H, height * 0.19));
    const hubH = clamp(BASE_HUB_H * ms, BASE_HUB_H, Math.max(BASE_HUB_H, height * 0.24));
    const shape = diagram.options.shape ?? "rounded";
    const painted = !getNodeShape(shape).engineRadius;
    const inset = getNodeShape(shape).insetX(cellH);
    const badged = diagram.options.numbers !== "none";
    if (!centre) return { w: grow(), h: fixed(height) };
    // spokes size to their own labels under the geometric cap; the hub to the centre label
    const cap = clamp(W / Math.max(3, n), 104, 176);
    const need = maxLabelWidth(ctx, spokes) + 24 + inset * 2 + (badged ? BADGE_R * 2 : 0);
    const cellW = clamp(need, Math.min(cap, 96 * ms), cap);
    const hubW = clamp(Math.max(labelWidth(ctx, centre.label) + 28, cellW * 1.2), 130 * ms, 210);
    const rx = Math.max(1, W / 2 - cellW / 2 - 12);
    const ry = Math.max(1, height / 2 - cellH / 2 - 12);
    const angle = (i: number): number => -Math.PI / 2 + (i * Math.PI * 2) / Math.max(1, n);
    const at = (a: number): [number, number] => [
        W / 2 + Math.cos(a) * rx,
        height / 2 + Math.sin(a) * ry,
    ];

    const hub = diagramCell(
        kids[0],
        kids[1],
        nodePaint(cols[0]!, ctx.theme, { style: diagram.options.style, emphasis: true }),
        { radius: hubH / 2, icon: centre.icon },
    );
    hub.w = fixed(hubW);
    hub.h = fixed(hubH);
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
            hub,
            ...cells,
            decorate(
                (g) => {
                    const cx = W / 2;
                    const cy = height / 2;
                    // A spoke radiates from the centre and the hub paints over it (z 2 against the
                    // decorate's -1), so the hub end needs no geometry at all. Exiting the hub's
                    // bounding rect instead left a diagonal spoke starting in a corner the pill's
                    // rounded end had already cut away, which read as a disconnected line.
                    spokes.forEach((item, s) => {
                        const [x, y] = at(angle(s));
                        const cell = { x: x - cellW / 2, y: y - cellH / 2, w: cellW, h: cellH };
                        const dx = x - cx;
                        const dy = y - cy;
                        // slab entry t for a rect the segment ends inside; exit t for one it starts inside
                        const entry = (r: typeof cell): number => {
                            const txe =
                                dx !== 0 ? ((dx > 0 ? r.x : r.x + r.w) - cx) / dx : -Infinity;
                            const tye =
                                dy !== 0 ? ((dy > 0 ? r.y : r.y + r.h) - cy) / dy : -Infinity;
                            return Math.max(txe, tye);
                        };
                        const t1 = Math.min(1, entry(cell));
                        if (t1 < 0.05) return;
                        g.line(cx, cy, cx + dx * t1, cy + dy * t1, {
                            stroke: mix(cols[s + 1]!, ctx.theme.ink, 0.15),
                            width: 2.2 * ms,
                        });
                    });
                    spokes.forEach((item, s) => {
                        const i = s + 1;
                        const [x, y] = at(angle(s));
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
                // item 0 is the hub itself, centred; each spoke sits at its computed angle
                () =>
                    itemRegions(ctx, n + 1, (i) => {
                        if (i === 0)
                            return {
                                x: W / 2 - hubW / 2,
                                y: height / 2 - hubH / 2,
                                w: hubW,
                                h: hubH,
                            };
                        const [x, y] = at(angle(i - 1));
                        return { x: x - cellW / 2, y: y - cellH / 2, w: cellW, h: cellH };
                    }),
            ),
        ],
    };
}

registerDiagram({ id: "hub", label: "Hub & spoke", arrange, fill: "ground" });
