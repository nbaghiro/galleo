import type { EngineNode } from "@engine/node";
import type { LayoutCtx } from "@elements/spec";
import { fixed, grow } from "@model/geometry";
import {
    PAD,
    decorate,
    diagramCell,
    drawIconBadge,
    itemColors,
    registerDiagram,
    type ResolvedDiagram,
} from "./utils";

const GAP = 12;
const DOT_R = 5;
const LANE_PAD = 14; // clearance between a label stack and the axis line

// a horizontal axis with alternating above/below label stacks; the line and dots are decoration
function arrange(
    diagram: ResolvedDiagram,
    ctx: LayoutCtx,
    kids: EngineNode[],
    height: number,
): EngineNode {
    const n = diagram.items.length;
    const cols = itemColors(diagram.items, ctx.theme);
    const column = (i: number): EngineNode => {
        const above = i % 2 === 0;
        const cell = diagramCell(
            kids[i * 2],
            kids[i * 2 + 1],
            {
                ink: ctx.theme.ink,
                dim: ctx.theme.muted,
                iconInk: cols[i]!,
            },
            { transparent: true, pad: { top: 4, bottom: 4, left: 4, right: 4 } },
        );
        cell.h = grow();
        cell.alignY = above ? "end" : "start";
        const spacer: EngineNode = { w: grow(), h: grow() };
        return {
            w: grow(),
            h: grow(),
            direction: "col",
            children: above
                ? [cell, { w: grow(), h: fixed(LANE_PAD * 2) }, spacer]
                : [spacer, { w: grow(), h: fixed(LANE_PAD * 2) }, cell],
        };
    };
    return {
        w: grow(),
        h: fixed(height),
        direction: "row",
        gap: GAP,
        padding: { top: PAD, bottom: PAD, left: PAD, right: PAD },
        children: [
            ...diagram.items.map((_, i) => column(i)),
            decorate((g, box) => {
                const cy = box.h / 2;
                g.line(0, cy, box.w, cy, { stroke: ctx.theme.line, width: 2 });
                const colW = (box.w - GAP * (n - 1)) / n;
                diagram.items.forEach((item, i) => {
                    const cx = i * (colW + GAP) + colW / 2;
                    // an item's icon upgrades its spine dot to a milestone marker
                    if (item.icon && drawIconBadge(g, cx, cy, item.icon, cols[i]!, ctx.theme))
                        return;
                    g.circle(cx, cy, DOT_R, {
                        fill: cols[i]!,
                        stroke: ctx.theme.surface,
                        width: 2,
                    });
                });
            }, 1),
        ],
    };
}

registerDiagram({ id: "timeline", label: "Timeline", arrange });
