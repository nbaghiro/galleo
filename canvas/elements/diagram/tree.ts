import { mix } from "@themes";
import {
    boxWidth,
    buildTree,
    drawNode,
    layoutTree,
    registerDiagram,
    type DiagramCtx,
    type ResolvedDiagram,
} from "./utils";

function renderTree(diagram: ResolvedDiagram, ctx: DiagramCtx): void {
    const { g, W, H, theme } = ctx;
    if (diagram.nodes.length === 0) return;
    const data = buildTree(diagram);
    if (!data) return;

    const nodeH = 34;
    const nodeW = boxWidth(
        g,
        theme,
        diagram.nodes.map((n) => n.label),
        96,
        80,
        132,
    );
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
        drawNode(g, p.cx - nodeW / 2, p.cy - nodeH / 2, nodeW, nodeH, p.node.data.label, theme, {
            radius: 10,
        });
    }
}

registerDiagram({ id: "tree", label: "Tree", render: renderTree });
