import type { EngineNode } from "@engine/node";
import type { LayoutCtx } from "@elements/spec";
import { fixed, grow } from "@model/geometry";
import type { PathSink } from "@engine/node";
import { hexA, inkOn, pageMix } from "@themes";
import {
    PAD,
    circlePoints,
    clamp,
    decorate,
    diagramCell,
    itemRegions,
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

// Where every circle overlaps, as a path of arcs. Two sets give a lens between the pair's two
// crossing points; three give a curved triangle whose corners are the crossing points that fall
// inside the third circle. Returns undefined when the sets do not all meet.
function overlap(centres: [number, number][], r: number): ((p: PathSink) => void) | undefined {
    const cross = (a: [number, number], b: [number, number]): [number, number][] => {
        const dx = b[0] - a[0];
        const dy = b[1] - a[1];
        const d = Math.hypot(dx, dy);
        if (d === 0 || d >= 2 * r) return [];
        const h = Math.sqrt(Math.max(0, r * r - (d / 2) * (d / 2)));
        const mx = a[0] + dx / 2;
        const my = a[1] + dy / 2;
        return [
            [mx + (h * dy) / d, my - (h * dx) / d],
            [mx - (h * dy) / d, my + (h * dx) / d],
        ];
    };
    const inAll = (pt: [number, number]): boolean =>
        centres.every((c) => Math.hypot(pt[0] - c[0], pt[1] - c[1]) <= r + 0.5);
    const pts: [number, number][] = [];
    for (let i = 0; i < centres.length; i++)
        for (let j = i + 1; j < centres.length; j++)
            for (const pt of cross(centres[i]!, centres[j]!)) if (inAll(pt)) pts.push(pt);
    if (pts.length < 2) return undefined;
    // walk the corners by angle about their own centroid, so consecutive pairs share one arc
    const gx = pts.reduce((a, p) => a + p[0], 0) / pts.length;
    const gy = pts.reduce((a, p) => a + p[1], 0) / pts.length;
    const ring = [...pts].sort(
        (a, b) => Math.atan2(a[1] - gy, a[0] - gx) - Math.atan2(b[1] - gy, b[0] - gx),
    );
    return (p: PathSink): void => {
        p.moveTo(ring[0]![0], ring[0]![1]);
        for (let k = 1; k <= ring.length; k++) {
            const to = ring[k % ring.length]!;
            // the bounding arc is the one from the circle furthest from this edge's midpoint
            const mid: [number, number] = [
                (ring[k - 1]![0] + to[0]) / 2,
                (ring[k - 1]![1] + to[1]) / 2,
            ];
            const c = centres.reduce((far, cur) =>
                Math.hypot(mid[0] - cur[0], mid[1] - cur[1]) >
                Math.hypot(mid[0] - far[0], mid[1] - far[1])
                    ? cur
                    : far,
            );
            p.arc(
                c[0],
                c[1],
                r,
                Math.atan2(ring[k - 1]![1] - c[1], ring[k - 1]![0] - c[0]),
                Math.atan2(to[1] - c[1], to[0] - c[0]),
            );
        }
        p.closePath();
    };
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
    const cols = itemColors(diagram, ctx.theme);
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
            decorate(
                (g, box) => {
                    const b = geometry(sets, box.w, box.h);
                    b.centres.slice(0, sets).forEach(([bx, by], i) =>
                        g.circle(bx, by, b.r, {
                            fill: hexA(cols[i]!, ALPHA),
                            stroke: cols[i]!,
                            width: 1.5,
                        }),
                    );
                    // The overlap is the claim a Venn is drawn to make, and stacked alpha only
                    // darkens it by accident: two washes at 0.42 land wherever they land. Painting
                    // the region itself gives it an edge and a tone the reader can point at.
                    const lens = overlap(b.centres.slice(0, sets), b.r);
                    if (lens)
                        g.path(lens, {
                            fill: hexA(cols[0]!, ALPHA * 0.5),
                            stroke: pageMix(cols[0]!, ctx.theme, 0.15),
                            width: 1.2,
                        });
                },
                -1,
                (box) => {
                    const b = geometry(sets, box.w, box.h);
                    return itemRegions(ctx, sets, (i) => {
                        const [bx, by] = b.centres[i]!;
                        return circlePoints(bx, by, b.r);
                    });
                },
            ),
        ],
    };
}

registerDiagram({ id: "venn", label: "Venn", arrange });
