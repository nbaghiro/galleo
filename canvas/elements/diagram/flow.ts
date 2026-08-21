import type { DrawContext, EngineNode } from "@engine/node";
import type { LayoutCtx } from "@elements/spec";
import type { Tokens } from "@themes";
import { mix } from "@themes";
import { fixed, grow } from "@model/geometry";
import {
    PAD,
    cellChrome,
    cellHeights,
    clamp,
    decorate,
    diagramCell,
    drawLink,
    drawShape,
    getNodeShape,
    itemColors,
    labelWidth,
    nodeFont,
    nodePaint,
    registerDiagram,
    type DiagEdge,
    type NodeShape,
    type ResolvedDiagram,
} from "./utils";

const GAP = 22;
const MIN_RANK_GAP = 16;
const MAX_H = 72; // a rank's share caps this; past it the detail hides rather than spilling

// A label phrased as a question branches; a node nothing points at (or that points nowhere) ends a
// path. Shapes are inferred so the author never has to learn a second syntax.
function shapeOf(label: string, terminal: boolean): NodeShape {
    if (label.trim().endsWith("?")) return "diamond";
    return terminal ? "pill" : "rounded";
}

// longest-path ranking over a topological sweep; nodes left in a cycle keep the rank they reached
function ranks(ids: string[], edges: DiagEdge[]): Map<string, number> {
    const rank = new Map(ids.map((id) => [id, 0]));
    const indeg = new Map(ids.map((id) => [id, 0]));
    const out = new Map<string, string[]>();
    for (const e of edges) {
        if (!rank.has(e.from) || !rank.has(e.to) || e.from === e.to) continue;
        const list = out.get(e.from);
        if (list) list.push(e.to);
        else out.set(e.from, [e.to]);
        indeg.set(e.to, (indeg.get(e.to) ?? 0) + 1);
    }
    const queue = ids.filter((id) => (indeg.get(id) ?? 0) === 0);
    const seen = new Set<string>();
    while (queue.length) {
        const id = queue.shift()!;
        if (seen.has(id)) continue;
        seen.add(id);
        for (const to of out.get(id) ?? []) {
            rank.set(to, Math.max(rank.get(to) ?? 0, (rank.get(id) ?? 0) + 1));
            const left = (indeg.get(to) ?? 1) - 1;
            indeg.set(to, left);
            if (left <= 0) queue.push(to);
        }
    }
    return rank;
}

// two barycentre passes: enough to untangle the graph sizes a slide can hold
function ordered(ids: string[], edges: DiagEdge[], rank: Map<string, number>): string[][] {
    const depth = Math.max(0, ...ids.map((id) => rank.get(id) ?? 0));
    const byRank: string[][] = Array.from({ length: depth + 1 }, () => []);
    for (const id of ids) byRank[rank.get(id) ?? 0]!.push(id);
    const pos = new Map<string, number>();
    byRank.forEach((r) => r.forEach((id, i) => pos.set(id, i)));
    for (let pass = 0; pass < 2; pass++) {
        for (let k = 1; k < byRank.length; k++) {
            const bary = new Map<string, number>();
            for (const id of byRank[k]!) {
                const preds = edges
                    .filter((e) => e.to === id && (rank.get(e.from) ?? 0) < k)
                    .map((e) => pos.get(e.from) ?? 0);
                bary.set(
                    id,
                    preds.length
                        ? preds.reduce((a, b) => a + b, 0) / preds.length
                        : (pos.get(id) ?? 0),
                );
            }
            byRank[k]!.sort((a, b) => (bary.get(a) ?? 0) - (bary.get(b) ?? 0));
            byRank[k]!.forEach((id, i) => pos.set(id, i));
        }
    }
    return byRank;
}

function edgeChip(g: DrawContext, x: number, y: number, text: string, theme: Tokens): void {
    const style = {
        fill: theme.soft,
        size: 10.5,
        weight: 500,
        font: nodeFont(theme),
        align: "center" as const,
        baseline: "middle" as const,
    };
    const w = g.measureText(text, style).width + 12;
    g.rect(x - w / 2, y - 8.5, w, 17, {
        fill: theme.surface,
        stroke: theme.line,
        width: 1,
        radius: 8.5,
    });
    g.text(text, x, y, style);
}

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
    const ids = items.map((i) => i.label);
    const index = new Map(ids.map((id, i) => [id, i] as const));
    // an unlinked list still reads as a flow: chain it in authored order
    const edges: DiagEdge[] =
        diagram.edges.length > 0
            ? diagram.edges.filter((e) => index.has(e.from) && index.has(e.to))
            : ids.slice(0, -1).map((from, i) => ({ from, to: ids[i + 1]! }));

    const rank = ranks(ids, edges);
    const byRank = ordered(ids, edges, rank);
    const rows = byRank.length;
    const hasIn = new Set(edges.map((e) => e.to));
    const hasOut = new Set(edges.map((e) => e.from));
    const shapes = new Map(
        ids.map((id) => [id, shapeOf(id, !hasIn.has(id) || !hasOut.has(id))] as const),
    );

    const availH = height - PAD * 2;
    const cap = Math.min(MAX_H, (availH - (rows - 1) * MIN_RANK_GAP) / rows);
    // width covers what the cell spends before its text, so a silhouette inset plus a leading icon
    // can never squeeze a label into a sliver; the inset is taken at the cap, its largest value
    const chromeOf = (id: string, i: number): number =>
        cellChrome(shapes.get(id), cap, items[i]?.icon);
    const widthOf = (id: string, i: number): number =>
        clamp(
            labelWidth(ctx, id) + 6 + chromeOf(id, i),
            shapes.get(id) === "diamond" ? 100 : 88,
            190,
        );
    const widest = Math.max(
        1,
        ...byRank.map(
            (r) =>
                r.reduce((a, id) => a + widthOf(id, index.get(id) ?? 0), 0) + GAP * (r.length - 1),
        ),
    );
    const shrink = Math.min(1, (ctx.availWidth - PAD * 2) / widest);

    const needs = ids.map((id, i) =>
        cellHeights(ctx, items[i]!, widthOf(id, i) * shrink - chromeOf(id, i)),
    );
    const full = Math.max(...needs.map((m) => m.full));
    const nodeH = clamp(
        full <= cap ? full : Math.max(...needs.map((m) => m.label)),
        30,
        Math.max(30, cap),
    );
    const rankGap = rows > 1 ? clamp((availH - rows * nodeH) / (rows - 1), MIN_RANK_GAP, 52) : 0;
    const top = (height - (rows * nodeH + (rows - 1) * rankGap)) / 2;

    const box = new Map<string, { x: number; y: number; w: number; h: number }>();
    byRank.forEach((r, k) => {
        const widths = r.map((id) => widthOf(id, index.get(id) ?? 0) * shrink);
        const total = widths.reduce((a, b) => a + b, 0) + GAP * (r.length - 1);
        let x = (ctx.availWidth - total) / 2;
        r.forEach((id, i) => {
            box.set(id, { x, y: top + k * (nodeH + rankGap), w: widths[i]!, h: nodeH });
            x += widths[i]! + GAP;
        });
    });

    const cells = ids.map((id, i) => {
        const b = box.get(id)!;
        const shape = shapes.get(id)!;
        const cell = diagramCell(
            kids[i * 2],
            needs[i]!.full <= nodeH + 0.5 ? kids[i * 2 + 1] : undefined,
            nodePaint(cols[i]!, ctx.theme, {
                style: diagram.options.style,
                emphasis: items[i]?.emphasis || shape === "pill",
            }),
            { shape, cellH: b.h, icon: items[i]?.icon },
        );
        cell.w = fixed(b.w);
        cell.h = fixed(b.h);
        cell.float = { x: "start", y: "start", dx: b.x, dy: b.y, z: 1 };
        return cell;
    });

    return {
        w: grow(),
        h: fixed(height),
        children: [
            ...cells,
            decorate((g) => {
                const link = mix(ctx.theme.line, ctx.theme.surface, 0.15);
                for (const e of edges) {
                    const a = box.get(e.from);
                    const b = box.get(e.to);
                    if (!a || !b) continue;
                    const forward = b.y > a.y;
                    const y0 = forward ? a.y + a.h : a.y;
                    const y1 = forward ? b.y : b.y + b.h;
                    const mid = (y0 + y1) / 2;
                    drawLink(
                        g,
                        [
                            [a.x + a.w / 2, y0],
                            [a.x + a.w / 2, mid],
                            [b.x + b.w / 2, mid],
                            [b.x + b.w / 2, y1],
                        ],
                        ctx.theme,
                        { color: link, width: 1.6, corner: 6 },
                    );
                    if (e.label)
                        edgeChip(g, (a.x + a.w / 2 + b.x + b.w / 2) / 2, mid, e.label, ctx.theme);
                }
                ids.forEach((id, i) => {
                    const shape = shapes.get(id)!;
                    if (getNodeShape(shape).engineRadius) return;
                    const b = box.get(id)!;
                    drawShape(
                        g,
                        shape,
                        b,
                        nodePaint(cols[i]!, ctx.theme, {
                            style: diagram.options.style,
                            emphasis: items[i]?.emphasis,
                        }),
                    );
                });
            }),
        ],
    };
}

registerDiagram({ id: "flow", label: "Flowchart", arrange });
