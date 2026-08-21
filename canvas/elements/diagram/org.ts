import type { EngineNode } from "@engine/node";
import type { LayoutCtx } from "@elements/spec";
import { fixed, grow } from "@model/geometry";
import {
    buildTree,
    cellChrome,
    cellHeights,
    clamp,
    decorate,
    diagramCell,
    drawLink,
    itemColors,
    layoutTree,
    maxLabelWidth,
    nodePaint,
    registerDiagram,
    treeLeaves,
    type ResolvedDiagram,
} from "./utils";

const MIN_H = 40;
const MAX_H = 64; // taller cells shrink the tree's level gaps; past this a detail hides instead

// `links` ("Parent>Child") builds the hierarchy; cells sit at d3-tree positions, elbows behind
function arrange(
    diagram: ResolvedDiagram,
    ctx: LayoutCtx,
    kids: EngineNode[],
    height: number,
): EngineNode {
    const data = buildTree(diagram);
    if (!data) return { w: grow(), h: fixed(height) };
    const cols = itemColors(diagram.items, ctx.theme);
    const byLabel = new Map(diagram.items.map((it, i) => [it.label, i] as const));
    const leaves = Math.max(1, treeLeaves(data));
    // content-sized, capped by the per-leaf share so wide trees still fit side by side
    const perLeaf = clamp((ctx.availWidth - 32) / leaves - 20, 90, 170);
    const nodeW = clamp(maxLabelWidth(ctx, diagram.items) + 24, 90, perLeaf);

    // cells grow to their measured content, uniformly for the whole tree; a detail that still
    // cannot fit hides rather than spilling the cell
    const needs = diagram.items.map((it) =>
        cellHeights(ctx, it, nodeW - cellChrome(undefined, MAX_H, it.icon)),
    );
    const nodeH = clamp(Math.max(MIN_H, ...needs.map((m) => m.full)), MIN_H, MAX_H);
    const detailFits = (i: number): boolean => (needs[i]?.full ?? 0) <= nodeH + 0.5;

    const { placed } = layoutTree(data, ctx.availWidth, height, nodeW, nodeH, false);

    const cells = placed.map((p) => {
        const i = byLabel.get(p.node.data.label);
        const paint = nodePaint(i !== undefined ? cols[i]! : ctx.theme.accent, ctx.theme, {
            style: diagram.options.style,
            emphasis: p.node.depth === 0 || (i !== undefined && diagram.items[i]?.emphasis),
        });
        const item = i !== undefined ? diagram.items[i] : undefined;
        const cell = diagramCell(
            i !== undefined ? kids[i * 2] : undefined,
            i !== undefined && detailFits(i) ? kids[i * 2 + 1] : undefined,
            paint,
            { icon: item?.icon },
        );
        // a placed node absent from `items` (an edge-only label) still gets its box
        if (i === undefined && cell.children?.length === 0)
            cell.children = [
                {
                    w: grow(),
                    h: fixed(14),
                    text: {
                        text: p.node.data.label,
                        fontId: "system-ui, sans-serif",
                        size: 12,
                        weight: 600,
                        color: paint.ink,
                        align: "center",
                        wrap: "none",
                    },
                },
            ];
        cell.w = fixed(nodeW);
        cell.h = fixed(nodeH);
        cell.float = { x: "start", y: "start", dx: p.cx - nodeW / 2, dy: p.cy - nodeH / 2, z: 1 };
        return cell;
    });

    const pos = new Map(placed.map((p) => [p.node, p] as const));
    return {
        w: grow(),
        h: fixed(height),
        children: [
            ...cells,
            decorate((g) => {
                for (const p of placed) {
                    const parent = p.node.parent;
                    if (!parent) continue;
                    const pp = pos.get(parent);
                    if (!pp) continue;
                    const midY = (pp.cy + nodeH / 2 + (p.cy - nodeH / 2)) / 2;
                    drawLink(
                        g,
                        [
                            [pp.cx, pp.cy + nodeH / 2],
                            [pp.cx, midY],
                            [p.cx, midY],
                            [p.cx, p.cy - nodeH / 2],
                        ],
                        ctx.theme,
                        { color: ctx.theme.line, width: 2, head: false, corner: 6 },
                    );
                }
            }),
        ],
    };
}

registerDiagram({ id: "org", label: "Org chart", arrange });
