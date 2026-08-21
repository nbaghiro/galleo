import type { EngineNode } from "@engine/node";
import type { LayoutCtx } from "@elements/spec";
import { fixed, grow } from "@model/geometry";
import { hexA, inkOn, pageMix } from "@themes";
import {
    PAD,
    clamp,
    decorate,
    diagramCell,
    itemColors,
    nodePaint,
    registerDiagram,
    type ResolvedDiagram,
} from "./utils";

// The one place a diagram fill is translucent: an overlap that cannot be seen through is not a
// Venn. Labels sit in the free lobes, so they measure against the single-set wash, not the pile.
const ALPHA = 0.42;
const LOBE = 0.44; // label offset from a circle's centre, away from the overlap

interface Geo {
    r: number;
    centres: [number, number][];
    units: [number, number][];
}

function geometry(sets: number, W: number, H: number): Geo {
    const cx = W / 2;
    const cy = H / 2;
    const halfW = Math.max(1, (W - PAD * 2) / 2);
    const halfH = Math.max(1, (H - PAD * 2) / 2);
    if (sets <= 2) {
        const r = Math.min(halfW / 1.62, halfH);
        const d = r * 0.62;
        return {
            r,
            centres: [
                [cx - d, cy],
                [cx + d, cy],
            ],
            units: [
                [-1, 0],
                [1, 0],
            ],
        };
    }
    const r = Math.min(halfW, halfH) / 1.55;
    const d = r * 0.55;
    const angles = [-Math.PI / 2, Math.PI / 6, (Math.PI * 5) / 6];
    const units = angles.map((a): [number, number] => [Math.cos(a), Math.sin(a)]);
    return { r, centres: units.map(([ux, uy]) => [cx + ux * d, cy + uy * d]), units };
}

function arrange(
    diagram: ResolvedDiagram,
    ctx: LayoutCtx,
    kids: EngineNode[],
    height: number,
): EngineNode {
    const items = diagram.items;
    if (items.length === 0) return { w: grow(), h: fixed(height) };
    const sets = clamp(items.length, 1, 3);
    const cols = itemColors(items, ctx.theme);
    const W = ctx.availWidth;
    const geo = geometry(sets, W, height);

    // an item past the third names the overlap, which is what a three-circle Venn is drawn for
    const place = (i: number): { x: number; y: number; w: number; h: number } => {
        const inside = i >= sets;
        const [ux, uy] = inside ? [0, 0] : geo.units[i]!;
        const [ccx, ccy] = inside ? [W / 2, height / 2] : geo.centres[i]!;
        const w = geo.r * (inside ? 1.1 : 1.2);
        const h = clamp(geo.r * 0.8, 24, height);
        return { x: ccx + ux * geo.r * LOBE - w / 2, y: ccy + uy * geo.r * LOBE - h / 2, w, h };
    };

    const cells = items.slice(0, sets + 1).map((item, i) => {
        const p = place(i);
        const wash =
            i >= sets
                ? pageMix(cols[0]!, ctx.theme, 0.25)
                : pageMix(cols[i]!, ctx.theme, 1 - ALPHA);
        const cell = diagramCell(
            kids[i * 2],
            kids[i * 2 + 1],
            nodePaint(cols[i] ?? cols[0]!, ctx.theme, { ink: inkOn(wash, ctx.theme) }),
            { transparent: true, pad: { top: 2, bottom: 2, left: 6, right: 6 }, icon: item.icon },
        );
        cell.w = fixed(p.w);
        cell.h = fixed(p.h);
        cell.float = { x: "start", y: "start", dx: p.x, dy: p.y, z: 1 };
        return cell;
    });

    return {
        w: grow(),
        h: fixed(height),
        children: [
            ...cells,
            decorate((g, box) => {
                const b = geometry(sets, box.w, box.h);
                b.centres.slice(0, sets).forEach(([bx, by], i) =>
                    g.circle(bx, by, b.r, {
                        fill: hexA(cols[i]!, ALPHA),
                        stroke: cols[i]!,
                        width: 1.5,
                    }),
                );
            }),
        ],
    };
}

registerDiagram({ id: "venn", label: "Venn", arrange });
