import {
    boxWidth,
    buildTree,
    drawNode,
    layoutTree,
    registerDiagram,
    type DiagramCtx,
    type ResolvedDiagram,
} from "./utils";

function renderOrg(diagram: ResolvedDiagram, ctx: DiagramCtx): void {
    const { g, W, H, theme } = ctx;
    if (diagram.nodes.length === 0) return;
    const data = buildTree(diagram);
    if (!data) return;

    const nodeH = 42;
    const nodeW = boxWidth(
        g,
        theme,
        diagram.nodes.map((n) => n.label),
        92,
        82,
        128,
    );
    const { root, placed } = layoutTree(data, W, H, nodeW, nodeH, false);
    const pos = new Map(placed.map((p) => [p.node, p] as const));

    for (const l of root.links()) {
        const s = pos.get(l.source);
        const t = pos.get(l.target);
        if (!s || !t) continue;
        const y1 = s.cy + nodeH / 2;
        const y2 = t.cy - nodeH / 2;
        const my = (y1 + y2) / 2;
        g.polyline(
            [
                [s.cx, y1],
                [s.cx, my],
                [t.cx, my],
                [t.cx, y2],
            ],
            { stroke: theme.accent, width: 1.5 },
        );
    }

    for (const p of placed) {
        const isRoot = p.node.depth === 0;
        drawNode(g, p.cx - nodeW / 2, p.cy - nodeH / 2, nodeW, nodeH, p.node.data.label, theme, {
            radius: 6,
            fill: isRoot ? theme.accent : theme.surface,
            stroke: theme.accent,
            ink: isRoot ? theme.onAccent : theme.ink,
        });
    }
}

registerDiagram({ id: "org", label: "Org chart", render: renderOrg });
