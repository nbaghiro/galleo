import type { EngineNode } from "@engine/node";
import type { LayoutCtx } from "@elements/spec";
import { fixed, grow } from "@model/geometry";
import {
    PAD,
    BADGE_R,
    badgeText,
    badgeX,
    decorate,
    diagramCell,
    drawNodeBadge,
    itemColors,
    nodePaint,
    registerDiagram,
    type ResolvedDiagram,
} from "./utils";

const GAP = 10;
const MIN_H = 44;

// a staircase of bottom-aligned cells, each one step taller than the last
function arrange(
    diagram: ResolvedDiagram,
    ctx: LayoutCtx,
    kids: EngineNode[],
    height: number,
): EngineNode {
    const n = diagram.items.length;
    const cols = itemColors(diagram.items, ctx.theme);
    const span = height - PAD * 2 - MIN_H;
    const stepH = (i: number): number => MIN_H + Math.max(0, span) * ((i + 1) / n);
    // treads vary in height, which degenerates every silhouette (see NodeShapeDef.maxAspect):
    // steps always composes rounded and ignores an authored shape
    const badged = diagram.options.numbers !== "none";
    return {
        w: grow(),
        h: fixed(height),
        direction: "row",
        alignY: "end",
        gap: GAP,
        padding: { top: PAD, bottom: PAD, left: PAD, right: PAD },
        children: [
            ...diagram.items.map((item, i) => {
                const cell = diagramCell(
                    kids[i * 2],
                    kids[i * 2 + 1],
                    nodePaint(cols[i]!, ctx.theme, {
                        style: diagram.options.style,
                        emphasis: item.emphasis,
                    }),
                    {
                        badged,
                        icon: item.icon,
                        iconY: "start",
                        // the label rides the tread, so captions line up with the climb
                        pad: { top: 12, bottom: 8, left: 10, right: 10 },
                    },
                );
                cell.h = fixed(stepH(i));
                cell.alignY = "start";
                return cell;
            }),
            decorate((g, box) => {
                if (diagram.options.numbers === "none") return;
                const stepW = (box.w - GAP * (n - 1)) / n;
                diagram.items.forEach((item, i) => {
                    const badge = item.icon ? undefined : badgeText(diagram.options.numbers, i);
                    const y = box.h - stepH(i) + BADGE_R + 8;
                    if (badge)
                        drawNodeBadge(
                            g,
                            badgeX(i * (stepW + GAP), 0),
                            y,
                            badge,
                            cols[i]!,
                            ctx.theme,
                        );
                });
            }, 1),
        ],
    };
}

registerDiagram({ id: "steps", label: "Steps", arrange });
