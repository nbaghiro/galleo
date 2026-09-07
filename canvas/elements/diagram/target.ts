import type { EngineNode } from "@engine/node";
import type { LayoutCtx } from "@elements/spec";
import { fixed, grow } from "@model/geometry";
import {
    PAD,
    cellHeights,
    circlePoints,
    decorate,
    diagramCell,
    drawLink,
    itemColors,
    itemRegions,
    markScale,
    registerDiagram,
    stackedPaint,
    type ResolvedDiagram,
} from "./utils";

const MIN_BAND = 20;
const LABEL_COL = 150; // narrowest label column worth breaking the rings out for
const LEAD_GAP = 52; // ring edge to the label column, leaving a real run for the leader
const FAN = 0.96; // half the arc the callouts spread over, radians (~55 degrees)

// outside in: item 0 is the widest scope, the last is the bullseye. n+1 entries, ending at 0.
const radii = (n: number, R: number): number[] =>
    Array.from({ length: n + 1 }, (_, i) => (R * (n - i)) / n);

// A circle only ever uses its box's short side, so in a wide box the rings were drawn small in the
// middle of it with the labels crushed into bands that could not hold them. Given the width for a
// label column, the rings move left and the labels move out onto leader lines, which is the only
// arrangement where a ring label has room to say anything.
const calloutFits = (W: number, H: number): boolean =>
    W - PAD * 2 - (H - PAD * 2) >= LABEL_COL + LEAD_GAP;

const outerR = (W: number, H: number): number =>
    Math.max(
        1,
        Math.min(
            calloutFits(W, H) ? W - PAD * 2 - LABEL_COL - LEAD_GAP : W - PAD * 2,
            H - PAD * 2,
        ) / 2,
    );

const angleAt = (i: number, n: number): number => (n < 2 ? 0 : -FAN + (2 * FAN * i) / (n - 1));

function arrange(
    diagram: ResolvedDiagram,
    ctx: LayoutCtx,
    kids: EngineNode[],
    height: number,
): EngineNode {
    const items = diagram.items;
    const n = items.length;
    if (n === 0) return { w: grow(), h: fixed(height) };
    const cols = itemColors(diagram, ctx.theme);
    const W = ctx.availWidth;
    const ms = markScale(height);
    const callout = calloutFits(W, height);
    const R = outerR(W, height);
    const r = radii(n, R);
    const cx = callout ? PAD + R : W / 2;
    const cy = height / 2;
    const paintOf = (i: number): ReturnType<typeof stackedPaint> =>
        stackedPaint(cols[i]!, ctx.theme, diagram.options.style, items[i]?.emphasis);

    const cells = items.map((item, i) => {
        const outer = r[i]!;
        const inner = r[i + 1]!;
        const last = i === n - 1;
        if (callout) {
            const labelX = cx + R + LEAD_GAP;
            const w = Math.max(60, W - PAD - labelX);
            const need = cellHeights(ctx, item, Math.max(24, w - 12));
            const h = Math.max(MIN_BAND, need.full);
            const cell = diagramCell(
                kids[i * 2],
                kids[i * 2 + 1],
                { ink: ctx.theme.ink, dim: ctx.theme.muted, iconInk: cols[i]! },
                {
                    transparent: true,
                    pad: { top: 2, bottom: 2, left: 6, right: 6 },
                    icon: item.icon,
                    align: "start",
                },
            );
            cell.w = fixed(w);
            cell.h = fixed(h);
            cell.float = {
                x: "start",
                y: "start",
                dx: labelX,
                dy: cy + Math.sin(angleAt(i, n)) * (R + 12) - h / 2,
                z: 1,
            };
            return cell;
        }
        // every ring but the bullseye labels its upper band, so no two labels collide
        const dy = last ? 0 : -(outer + inner) / 2;
        const chord = Math.sqrt(Math.max(1, outer * outer - dy * dy));
        // chord is the band's half-width, so this is most of its real span
        const w = Math.max(40, chord * 1.8);
        const h = Math.max(MIN_BAND, last ? outer * 1.4 : outer - inner);
        // a band is only as deep as its own ring: a detail that does not fit is dropped rather
        // than painted across the ring inside it
        const fits = cellHeights(ctx, item, Math.max(24, w - 12)).full <= h;
        const cell = diagramCell(kids[i * 2], fits ? kids[i * 2 + 1] : undefined, paintOf(i), {
            transparent: true,
            pad: { top: 2, bottom: 2, left: 6, right: 6 },
            icon: item.icon,
        });
        cell.w = fixed(w);
        cell.h = fixed(h);
        cell.float = { x: "start", y: "start", dx: cx - w / 2, dy: cy + dy - h / 2, z: 1 };
        return cell;
    });

    return {
        w: grow(),
        h: fixed(height),
        children: [
            ...cells,
            decorate(
                (g, box) => {
                    const bR = outerR(box.w, box.h);
                    const br = radii(n, bR);
                    const bcx = callout ? PAD + bR : box.w / 2;
                    const bcy = box.h / 2;
                    // outermost first, so each inner ring paints over the one containing it
                    items.forEach((_, i) => {
                        const p = paintOf(i);
                        g.circle(bcx, bcy, br[i]!, {
                            fill: p.fill,
                            gradient: p.gradient,
                            stroke: p.stroke ?? ctx.theme.surface,
                            width: p.width ?? 1.5 * ms,
                        });
                    });
                    if (!callout) return;
                    // leader out along the ring's own angle, then level into its label: the line
                    // is what says which ring a name belongs to once the name has left the ring
                    items.forEach((_, i) => {
                        const a = angleAt(i, n);
                        const mid = (br[i]! + br[i + 1]!) / 2;
                        const y = bcy + Math.sin(a) * (bR + 12);
                        const pts: [number, number][] = [
                            [bcx + Math.cos(a) * mid, bcy + Math.sin(a) * mid],
                            [bcx + bR + 12, y],
                            [bcx + bR + LEAD_GAP - 10, y],
                        ];
                        // cased, the way a route is drawn over a map: one colour cannot read on
                        // both the ring it starts in and the page it ends on, so the line carries
                        // its own ground with it
                        const line = { head: false as const, corner: 10 };
                        drawLink(g, pts, ctx.theme, {
                            ...line,
                            color: ctx.theme.surface,
                            width: 4.5 * ms,
                        });
                        drawLink(g, pts, ctx.theme, { ...line, color: cols[i]!, width: 1.5 * ms });
                    });
                },
                -1,
                // full circles in the same order: the last-wins scan lands a point on the
                // innermost ring containing it, so no annulus geometry is needed
                (box) => {
                    const bR = outerR(box.w, box.h);
                    const br = radii(n, bR);
                    const bcx = callout ? PAD + bR : box.w / 2;
                    return itemRegions(ctx, n, (i) => circlePoints(bcx, box.h / 2, br[i]!));
                },
            ),
        ],
    };
}

registerDiagram({ id: "target", label: "Target rings", arrange });
