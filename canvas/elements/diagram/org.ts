import {
    boxWidth,
    buildTree,
    drawLink,
    drawNode,
    fitNodeHeight,
    itemOf,
    labelsOf,
    layoutTree,
    maxLabelHeight,
    nodeText,
    registerDiagram,
    treeDepth,
    type DiagramCtx,
    type ResolvedDiagram,
} from "./utils";

const PAD = 7;

function renderOrg(diagram: ResolvedDiagram, ctx: DiagramCtx): void {
    const { g, W, H, theme } = ctx;
    if (diagram.items.length === 0) return;
    const data = buildTree(diagram);
    if (!data) return;

    const nodeW = boxWidth(g, theme, labelsOf(diagram.items), 92, 82, 128);
    // the box grows to the tallest label rather than clipping it against a constant
    const title = nodeText(theme);
    const needed = maxLabelHeight(g, diagram.items, nodeW - PAD * 2, title) + 20;
    const nodeH = fitNodeHeight(needed, 42, H - 24, treeDepth(data), 16);
    const { root, placed } = layoutTree(data, W, H, nodeW, nodeH, false);
    const pos = new Map(placed.map((p) => [p.node, p] as const));
    const depth = Math.max(1, ...placed.map((x) => x.node.depth));
    const cols = ctx.colors(depth + 1);

    for (const l of root.links()) {
        const s = pos.get(l.source);
        const t = pos.get(l.target);
        if (!s || !t) continue;
        const y1 = s.cy + nodeH / 2;
        const y2 = t.cy - nodeH / 2;
        const my = (y1 + y2) / 2;
        drawLink(
            g,
            [
                [s.cx, y1],
                [s.cx, my],
                [t.cx, my],
                [t.cx, y2],
            ],
            theme,
            { color: theme.accent, width: 1.5, head: false },
        );
    }

    for (const p of placed) {
        drawNode(
            g,
            { x: p.cx - nodeW / 2, y: p.cy - nodeH / 2, w: nodeW, h: nodeH },
            itemOf(p.node.data),
            theme,
            { color: cols[p.node.depth % cols.length]!, pad: PAD },
        );
    }
}

registerDiagram({ id: "org", label: "Org chart", render: renderOrg });
