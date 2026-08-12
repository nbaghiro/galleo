import type { EngineNode } from "@engine/node";
import type { LayoutCtx } from "@elements/spec";
import { fit, fixed, grow } from "@model/geometry";
import {
    PAD,
    diagramCell,
    itemColors,
    nodeFont,
    nodePaint,
    registerDiagram,
    type ResolvedDiagram,
} from "./utils";

const GAP = 8;
const LANE_H = 18;

// axis-end caption in its own reserved lane, never over a cell
const caption = (
    text: string,
    theme: LayoutCtx["theme"],
    align: "start" | "center" | "end",
): EngineNode => ({
    w: align === "center" ? grow() : fit(),
    h: fixed(LANE_H),
    text: {
        text,
        fontId: nodeFont(theme),
        size: 10.5,
        weight: 500,
        color: theme.muted,
        align: align === "center" ? "center" : align,
        wrap: "none",
    },
});

// a pure engine 2x2: four tinted cells; the axis captions own thin lanes above, between, and
// below the grid (floated captions lapped the cells — the caption-clearance invariant)
function arrange(
    diagram: ResolvedDiagram,
    ctx: LayoutCtx,
    kids: EngineNode[],
    height: number,
): EngineNode {
    const items = diagram.items.slice(0, 4);
    const cols = itemColors(diagram.items, ctx.theme);
    const [xLo, xHi, yLo, yHi] = diagram.axes;
    const cell = (i: number): EngineNode =>
        diagramCell(
            kids[i * 2],
            kids[i * 2 + 1],
            nodePaint(cols[i]!, ctx.theme, {
                style: items[i]?.emphasis ? "solid" : "tinted",
                emphasis: items[i]?.emphasis,
            }),
            { radius: 8 },
        );
    const row = (a: number, b: number): EngineNode => ({
        w: grow(),
        h: grow(),
        direction: "row",
        gap: GAP,
        children: [a, b].filter((i) => i < items.length).map(cell),
    });
    const lanes: EngineNode[] = [];
    if (yHi) lanes.push(caption(yHi, ctx.theme, "center"));
    lanes.push(row(0, 1));
    if (xLo || xHi) {
        lanes.push({
            w: grow(),
            h: fixed(LANE_H),
            direction: "row",
            children: [
                caption(xLo ?? "", ctx.theme, "start"),
                { w: grow(), h: fixed(LANE_H) },
                caption(xHi ?? "", ctx.theme, "end"),
            ],
        });
    }
    lanes.push(row(2, 3));
    if (yLo) lanes.push(caption(yLo, ctx.theme, "center"));
    return {
        w: grow(),
        h: fixed(height),
        direction: "col",
        gap: GAP / 2,
        padding: { top: PAD, bottom: PAD, left: PAD, right: PAD },
        children: lanes,
    };
}

registerDiagram({ id: "quadrant", label: "Quadrant", arrange });
