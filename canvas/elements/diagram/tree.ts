import { mix } from "@themes";
import {
    boxWidth,
    buildTree,
    drawNode,
    fitNodeHeight,
    itemOf,
    labelsOf,
    maxLabelHeight,
    layoutTree,
    nodeText,
    registerDiagram,
    treeDepth,
    type DiagramCtx,
    type ResolvedDiagram,
} from "./utils";

const PAD = 7;

function renderTree(diagram: ResolvedDiagram, ctx: DiagramCtx): void {
    const { g, W, H, theme } = ctx;
    if (diagram.items.length === 0) return;
    const data = buildTree(diagram);
    if (!data) return;

    const nodeW = boxWidth(g, theme, labelsOf(diagram.items), 96, 80, 132);
    // the box grows to the tallest label rather than clipping it against a constant
    const title = nodeText(theme);
    const needed = maxLabelHeight(g, diagram.items, nodeW - PAD * 2, title) + 18;
    const nodeH = fitNodeHeight(needed, 34, H - 24, treeDepth(data), 16);
    const { root, placed } = layoutTree(data, W, H, nodeW, nodeH, false);
    const pos = new Map(placed.map((p) => [p.node, p] as const));
    const link = mix(theme.line, theme.surface, 0.2);

    for (const l of root.links()) {
        const s = pos.get(l.source);
        const t = pos.get(l.target);
        if (!s || !t) continue;
        const y1 = s.cy + nodeH / 2;
        const y2 = t.cy - nodeH / 2;
        const my = (y1 + y2) / 2;
        g.path(
            (p) => {
                p.moveTo(s.cx, y1);
                p.bezierCurveTo(s.cx, my, t.cx, my, t.cx, y2);
            },
            { stroke: link, width: 1.5 },
        );
    }

    for (const p of placed) {
        drawNode(
            g,
            { x: p.cx - nodeW / 2, y: p.cy - nodeH / 2, w: nodeW, h: nodeH },
            itemOf(p.node.data),
            theme,
            { radius: 10, pad: PAD },
        );
    }
}

registerDiagram({ id: "tree", label: "Tree", render: renderTree });
