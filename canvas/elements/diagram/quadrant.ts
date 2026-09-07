import type { EngineNode } from "@engine/node";
import type { LayoutCtx } from "@elements/spec";
import { mix } from "@themes";
import { fit, fixed, grow } from "@model/geometry";
import {
    PAD,
    decorate,
    diagramCell,
    drawLink,
    itemColors,
    labelWidth,
    nodeFont,
    nodePaint,
    registerDiagram,
    type ResolvedDiagram,
} from "./utils";

const GAP = 8;
const LANE_H = 18;
const CAP_SIZE = 10.5;

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
        size: CAP_SIZE,
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
    const cols = itemColors(diagram, ctx.theme);
    const [xLo, xHi, yLo, yHi] = diagram.axes;
    const hasX = !!(xLo || xHi);
    const capCount = (yHi ? 1 : 0) + (hasX ? 1 : 0) + (yLo ? 1 : 0);
    const cellH = (height - PAD * 2 - capCount * LANE_H - (GAP / 2) * (1 + capCount)) / 2;
    const cell = (i: number): EngineNode =>
        diagramCell(
            kids[i * 2],
            kids[i * 2 + 1],
            nodePaint(cols[i]!, ctx.theme, {
                style: items[i]?.emphasis ? "solid" : "tinted",
                emphasis: items[i]?.emphasis,
            }),
            { radius: 8, cellH, icon: items[i]?.icon },
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
        children: [
            ...lanes,
            // The captions named two axes that were never drawn, so the four cells read as a grid
            // rather than as a plane. The spines run in the lanes the cells already leave empty,
            // and point the way the captions say the values increase.
            decorate((g, box) => {
                const count = 2 + (yHi ? 1 : 0) + (hasX ? 1 : 0) + (yLo ? 1 : 0);
                const capH = ((yHi ? 1 : 0) + (hasX ? 1 : 0) + (yLo ? 1 : 0)) * LANE_H;
                const rowH = (box.h - capH - (GAP / 2) * (count - 1)) / 2;
                const top = yHi ? LANE_H + GAP / 2 : 0;
                const gapY = top + rowH + GAP / 4 + (hasX ? LANE_H / 2 + GAP / 4 : 0);
                const bottom = top + rowH * 2 + GAP / 2 + (hasX ? LANE_H + GAP / 2 : 0);
                // an axis is chrome the reader is meant to see, so it steps off theme.line,
                // which is calibrated for a hairline between two cells
                const line = { color: mix(ctx.theme.line, ctx.theme.ink, 0.45), width: 1.8 };
                // the captions sit at the ends of this same lane, so the spine runs between them
                // rather than through them: an axis is labelled at its ends, not struck through
                const inset = (text: string | undefined): number =>
                    text ? labelWidth(ctx, text, CAP_SIZE, 500) + 10 : 0;
                drawLink(
                    g,
                    [
                        [inset(xLo), gapY],
                        [box.w - inset(xHi), gapY],
                    ],
                    ctx.theme,
                    line,
                );
                drawLink(
                    g,
                    [
                        [box.w / 2, bottom],
                        [box.w / 2, top],
                    ],
                    ctx.theme,
                    line,
                );
            }, -1),
        ],
    };
}

registerDiagram({ id: "quadrant", label: "Quadrant", arrange, fill: "ground" });
