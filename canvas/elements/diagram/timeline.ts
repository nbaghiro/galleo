import type { EngineNode } from "@engine/node";
import type { LayoutCtx } from "@elements/spec";
import { fixed, grow } from "@model/geometry";
import {
    PAD,
    cellHeights,
    clamp,
    decorate,
    diagramCell,
    drawIconBadge,
    itemColors,
    markScale,
    registerDiagram,
    type ResolvedDiagram,
} from "./utils";

const GAP = 12;
const DOT_R = 5;
const CELL_PAD = 4;
const STEM_GAP = 8; // clearance between a stem's end and the label block it points at

// a horizontal axis with alternating above/below label stacks, each stemmed to its point on it
function arrange(
    diagram: ResolvedDiagram,
    ctx: LayoutCtx,
    kids: EngineNode[],
    height: number,
): EngineNode {
    const n = diagram.items.length;
    const cols = itemColors(diagram.items, ctx.theme);
    const s = markScale(height);
    const colW = (ctx.availWidth - PAD * 2 - GAP * (n - 1)) / Math.max(1, n);
    const innerW = Math.max(24, colW - CELL_PAD * 2);
    // One lane depth for every column, so labels line up either side of the rail rather than
    // stepping with their own text height; capped short of the rail so none can cross it.
    const lane = clamp(
        Math.max(...diagram.items.map((it) => cellHeights(ctx, it, innerW).full)) + CELL_PAD * 2,
        24,
        Math.max(24, height / 2 - PAD - STEM_GAP * 2),
    );
    const column = (i: number): EngineNode => {
        const cell = diagramCell(
            kids[i * 2],
            kids[i * 2 + 1],
            { ink: ctx.theme.ink, dim: ctx.theme.muted, iconInk: cols[i]! },
            {
                transparent: true,
                pad: { top: CELL_PAD, bottom: CELL_PAD, left: CELL_PAD, right: CELL_PAD },
            },
        );
        cell.h = fixed(lane);
        const spacer: EngineNode = { w: grow(), h: grow() };
        return {
            w: grow(),
            h: grow(),
            direction: "col",
            children: i % 2 === 0 ? [cell, spacer] : [spacer, cell],
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
                const w = (box.w - GAP * (n - 1)) / n;
                g.line(0, cy, box.w, cy, { stroke: ctx.theme.line, width: 2 * s });
                diagram.items.forEach((item, i) => {
                    const cx = i * (w + GAP) + w / 2;
                    // the stem is what ties a label to its point on the rail; pushed to the lane's
                    // outer edge without one, the two read as separate rows with a line between
                    const to = i % 2 === 0 ? lane + STEM_GAP : box.h - lane - STEM_GAP;
                    g.line(cx, cy, cx, to, { stroke: cols[i]!, width: 1.5 * s, cap: "round" });
                    if (item.icon && drawIconBadge(g, cx, cy, item.icon, cols[i]!, ctx.theme))
                        return;
                    g.circle(cx, cy, DOT_R * s, {
                        fill: cols[i]!,
                        stroke: ctx.theme.surface,
                        width: 2 * s,
                    });
                });
            }, 1),
        ],
    };
}

registerDiagram({ id: "timeline", label: "Timeline", arrange });
