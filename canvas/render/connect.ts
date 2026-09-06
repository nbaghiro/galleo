import type { Rect, Region, RenderCommand } from "@engine/node";
import type { ArtifactContent, ConnectionEnd } from "@model/artifact";
import { datumRegionId, elementRegionId, refRegionId } from "@model/artifact";
import type { Tokens } from "@themes";
import { elementIdMap } from "@elements/ops";
import { drawLink } from "@elements/diagram/utils";

// Drawn connections, resolved AFTER layout against the regions a surface already holds: both ends
// or nothing, paint only. The engine never sees them; the output is ordinary surface commands.

const PAD = 8; // route clearance past the boxes, and the arrowhead's breathing room
const HIT = 6; // half-width of the ref: region's hit polygon along the route

export function resolveEnd(
    end: ConnectionEnd,
    byId: Map<string, Region>,
    addrId: string | undefined,
): Rect | null {
    if (!addrId) return null;
    const el = byId.get(addrId);
    if (!el) return null;
    if (end.datum !== undefined) {
        const datum = byId.get(datumRegionId(addrId, end.datum));
        if (datum) return datum.box;
    }
    return el.box;
}

// Facing-edge anchors with one elbow at the midline; overlapping boxes fall back to centers.
export function routePoints(a: Rect, b: Rect): [number, number][] {
    const gapX = Math.max(b.x - (a.x + a.w), a.x - (b.x + b.w));
    const gapY = Math.max(b.y - (a.y + a.h), a.y - (b.y + b.h));
    if (gapX < 0 && gapY < 0) {
        return [
            [a.x + a.w / 2, a.y + a.h / 2],
            [b.x + b.w / 2, b.y + b.h / 2],
        ];
    }
    if (gapX >= gapY) {
        const leftFirst = a.x + a.w / 2 <= b.x + b.w / 2;
        const x0 = leftFirst ? a.x + a.w : a.x;
        const x1 = leftFirst ? b.x : b.x + b.w;
        const y0 = a.y + a.h / 2;
        const y1 = b.y + b.h / 2;
        const mx = (x0 + x1) / 2;
        if (Math.abs(y0 - y1) < 1)
            return [
                [x0, y0],
                [x1, y1],
            ];
        return [
            [x0, y0],
            [mx, y0],
            [mx, y1],
            [x1, y1],
        ];
    }
    const topFirst = a.y + a.h / 2 <= b.y + b.h / 2;
    const y0 = topFirst ? a.y + a.h : a.y;
    const y1 = topFirst ? b.y : b.y + b.h;
    const x0 = a.x + a.w / 2;
    const x1 = b.x + b.w / 2;
    const my = (y0 + y1) / 2;
    if (Math.abs(x0 - x1) < 1)
        return [
            [x0, y0],
            [x1, y1],
        ];
    return [
        [x0, y0],
        [x0, my],
        [x1, my],
        [x1, y1],
    ];
}

// The stroke's outline as one polygon: forward along one offset side, back along the other. The
// miter at a vertex is the sum of its two segment normals, exact for the axis-aligned elbows
// routePoints emits and close enough for the diagonal fallback.
export function routeOutline(points: [number, number][], pad: number): [number, number][] {
    const normals: [number, number][] = [];
    for (let i = 0; i < points.length - 1; i++) {
        const dx = points[i + 1]![0] - points[i]![0];
        const dy = points[i + 1]![1] - points[i]![1];
        const len = Math.hypot(dx, dy) || 1;
        normals.push([(-dy / len) * pad, (dx / len) * pad]);
    }
    const offsetAt = (i: number, sign: 1 | -1): [number, number] => {
        const before = normals[Math.max(0, i - 1)]!;
        const after = normals[Math.min(normals.length - 1, i)]!;
        const nx = i === 0 ? after[0] : i === points.length - 1 ? before[0] : before[0] + after[0];
        const ny = i === 0 ? after[1] : i === points.length - 1 ? before[1] : before[1] + after[1];
        return [points[i]![0] + sign * nx, points[i]![1] + sign * ny];
    };
    const forward = points.map((_, i) => offsetAt(i, 1));
    const back = points.map((_, i) => offsetAt(i, -1)).reverse();
    return [...forward, ...back];
}

const boundsOf = (points: [number, number][], pad: number): Rect => {
    const xs = points.map((p) => p[0]);
    const ys = points.map((p) => p[1]);
    const x = Math.min(...xs) - pad;
    const y = Math.min(...ys) - pad;
    return { x, y, w: Math.max(...xs) - x + pad * 2, h: Math.max(...ys) - y + pad * 2 };
};

export function connectionCommands(
    content: ArtifactContent,
    regions: Region[],
    theme: Tokens,
    // playback: a pinned section's paint moves at scroll time, so a stage-painted arrow into it
    // would detach; those connections are skipped rather than drawn wrong
    opts?: { skipPinned?: boolean },
): { commands: RenderCommand[]; regions: Region[] } {
    const list = content.connections;
    const commands: RenderCommand[] = [];
    const out: Region[] = [];
    if (!list?.length) return { commands, regions: out };
    const pinned = opts?.skipPinned
        ? new Set(content.sections.filter((s) => s.pinned).map((s) => s.id))
        : null;
    const addrs = elementIdMap(content);
    const byId = new Map<string, Region>();
    for (const r of regions) if (!byId.has(r.id)) byId.set(r.id, r);
    const regionIdFor = (element: string): string | undefined => {
        const addr = addrs.get(element);
        return addr && elementRegionId(addr);
    };
    for (const c of list) {
        if (pinned?.size) {
            const sa = addrs.get(c.from.element)?.section;
            const sb = addrs.get(c.to.element)?.section;
            if ((sa && pinned.has(sa)) || (sb && pinned.has(sb))) continue;
        }
        const from = resolveEnd(c.from, byId, regionIdFor(c.from.element));
        const to = resolveEnd(c.to, byId, regionIdFor(c.to.element));
        if (!from || !to) continue;
        const points = routePoints(from, to);
        const box = boundsOf(points, PAD);
        const local = points.map(([px, py]): [number, number] => [px - box.x, py - box.y]);
        const style = c.style;
        commands.push({
            kind: "surface",
            box,
            id: refRegionId(c.id),
            paint: (g) =>
                drawLink(g, local, theme, {
                    color: style?.tone === "accent" ? theme.accent : undefined,
                    head: style?.head !== "none",
                    dashed: style?.dashed,
                    corner: 6,
                }),
        });
        out.push({
            id: refRegionId(c.id),
            box,
            shape: { kind: "poly", points: routeOutline(points, HIT) },
        });
    }
    return { commands, regions: out };
}
