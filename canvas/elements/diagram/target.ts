import type { EngineNode } from "@engine/node";
import type { LayoutCtx } from "@elements/spec";
import { fixed, grow } from "@model/geometry";
import {
    PAD,
    decorate,
    diagramCell,
    itemColors,
    nodePaint,
    registerDiagram,
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
        const w = Math.max(40, chord * 1.5);
        const h = Math.max(MIN_BAND, last ? inner * 1.4 : outer - inner);
        const cell = diagramCell(kids[i * 2], kids[i * 2 + 1], nodePaint(cols[i]!, ctx.theme), {
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
            decorate((g, box) => {
                const br = radii(n, outerR(box.w, box.h));
                // outermost first, so each inner ring paints over the one containing it
                items.forEach((_, i) =>
                    g.circle(box.w / 2, box.h / 2, br[i]!, {
                        fill: cols[i]!,
                        stroke: ctx.theme.surface,
                        width: 1.5,
                    }),
                );
            }),
        ],
    };
}

registerDiagram({ id: "target", label: "Target rings", arrange });
