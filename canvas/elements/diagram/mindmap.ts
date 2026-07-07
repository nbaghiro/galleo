import { type HierarchyPointNode } from "d3-hierarchy";
import {
    boxWidth,
    buildTree,
    drawNode,
    layoutTree,
    registerDiagram,
    type DiagramCtx,
    type ResolvedDiagram,
    type TreeDatum,
} from "./utils";

// A mind map: root anchored left-center, branches fanning rightward. Curved links + node strokes are
// tinted per top-level branch from the theme palette.
function renderMindmap(diagram: ResolvedDiagram, ctx: DiagramCtx): void {
    const { g, W, H, theme } = ctx;
    if (diagram.nodes.length === 0) return;
    const data = buildTree(diagram);
    if (!data) return;

    const nodeH = 32;
    const nodeW = boxWidth(
        g,
        theme,
        diagram.nodes.map((n) => n.label),
        104,
        84,
        138,
    );
    const { root, placed } = layoutTree(data, W, H, nodeW, nodeH, true);
    const pos = new Map(placed.map((p) => [p.node, p] as const));

    // Map every descendant to the index of its top-level branch (root's direct child).
    const branchOf = new Map<HierarchyPointNode<TreeDatum>, number>();
    const branches = root.children ?? [];
    branches.forEach((child, i) => {
        for (const d of child.descendants()) branchOf.set(d, i);
    });
    const cols = ctx.colors(Math.max(1, branches.length));
    const branchColor = (n: HierarchyPointNode<TreeDatum>): string =>
        cols[(branchOf.get(n) ?? 0) % cols.length]!;

    for (const l of root.links()) {
        const s = pos.get(l.source);
        const t = pos.get(l.target);
        if (!s || !t) continue;
        const x1 = s.cx + nodeW / 2;
        const x2 = t.cx - nodeW / 2;
        const mx = (x1 + x2) / 2;
        g.path(
            (p) => {
                p.moveTo(x1, s.cy);
                p.bezierCurveTo(mx, s.cy, mx, t.cy, x2, t.cy);
            },
            { stroke: branchColor(l.target), width: 1.8 },
        );
    }

    for (const p of placed) {
        const isRoot = p.node.depth === 0;
        drawNode(g, p.cx - nodeW / 2, p.cy - nodeH / 2, nodeW, nodeH, p.node.data.label, theme, {
            radius: 16,
            fill: isRoot ? theme.accent : theme.surface,
            stroke: isRoot ? theme.accent : branchColor(p.node),
            ink: isRoot ? theme.onAccent : theme.ink,
        });
    }
}

registerDiagram({ id: "mindmap", label: "Mind map", render: renderMindmap });
