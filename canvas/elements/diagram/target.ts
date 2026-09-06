import type { EngineNode } from "@engine/node";
import type { LayoutCtx } from "@elements/spec";
import { fixed, grow } from "@model/geometry";
import {
    PAD,
    cellHeights,
    circlePoints,
    decorate,
    diagramCell,
    itemRegions,
    itemColors,
    registerDiagram,
    stackedPaint,
    type ResolvedDiagram,
} from "./utils";

const MIN_BAND = 20;

// outside in: item 0 is the widest scope, the last is the bullseye. n+1 entries, ending at 0.
const radii = (n: number, R: number): number[] =>
    Array.from({ length: n + 1 }, (_, i) => (R * (n - i)) / n);

const outerR = (W: number, H: number): number =>
    Math.max(1, Math.min(W - PAD * 2, H - PAD * 2) / 2);

function arrange(
    diagram: ResolvedDiagram,
    ctx: LayoutCtx,
    kids: EngineNode[],
    height: number,
): EngineNode {
    const items = diagram.items;
    const n = items.length;
    if (n === 0) return { w: grow(), h: fixed(height) };
    const cols = itemColors(items, ctx.theme);
    const W = ctx.availWidth;
    const r = radii(n, outerR(W, height));
    const cx = W / 2;
    const cy = height / 2;

    const cells = items.map((item, i) => {
        const outer = r[i]!;
        const inner = r[i + 1]!;
        const last = i === n - 1;
        // every ring but the bullseye labels its upper band, so no two labels collide
        const dy = last ? 0 : -(outer + inner) / 2;
        const chord = Math.sqrt(Math.max(1, outer * outer - dy * dy));
        // chord is the band's half-width, so this is most of its real span: the old 1.5 left a
        // quarter of the ring unused and wrapped labels that had room to sit on one line
        const w = Math.max(40, chord * 1.8);
        // the bullseye's inner radius is 0 by construction, so its band is sized by its own circle
        const h = Math.max(MIN_BAND, last ? outer * 1.4 : outer - inner);
        // a band is only as deep as its own ring: a detail that does not fit is dropped rather
        // than painted across the ring inside it, which is where it used to be clipped
        const fits = cellHeights(ctx, item, Math.max(24, w - 12)).full <= h;
        const paint = stackedPaint(cols[i]!, ctx.theme, diagram.options.style, item.emphasis);
        const cell = diagramCell(kids[i * 2], fits ? kids[i * 2 + 1] : undefined, paint, {
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
                    const br = radii(n, outerR(box.w, box.h));
                    // outermost first, so each inner ring paints over the one containing it
                    items.forEach((item, i) => {
                        const p = stackedPaint(
                            cols[i]!,
                            ctx.theme,
                            diagram.options.style,
                            item.emphasis,
                        );
                        g.circle(box.w / 2, box.h / 2, br[i]!, {
                            fill: p.fill,
                            gradient: p.gradient,
                            stroke: p.stroke ?? ctx.theme.surface,
                            width: p.width ?? 1.5,
                        });
                    });
                },
                -1,
                // full circles in the same order: the last-wins scan lands a point on the
                // innermost ring containing it, so no annulus geometry is needed
                (box) => {
                    const br = radii(n, outerR(box.w, box.h));
                    return itemRegions(ctx, n, (i) => circlePoints(box.w / 2, box.h / 2, br[i]!));
                },
            ),
        ],
    };
}

registerDiagram({ id: "target", label: "Target rings", arrange });
