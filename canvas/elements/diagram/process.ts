import { hexA } from "@themes";
import { arrow, drawNode, registerDiagram, type Renderer } from "./utils";

// Horizontal row(s) of boxes, arrows between neighbours, wrapping to further rows when too many fit.
const process: Renderer = (diagram, ctx) => {
    const { g, W, H, theme } = ctx;
    const items = diagram.items;
    if (items.length === 0) return;
    const cols = ctx.colors(items.length);
    const pad = 16;
    const gap = 40;
    const nodeH = 56;
    const rowGap = 26;
    const avail = W - pad * 2;
    const perRow = Math.max(1, Math.min(items.length, Math.floor((avail + gap) / (96 + gap))));
    const rows = Math.ceil(items.length / perRow);
    const nodeW = (avail - gap * (perRow - 1)) / perRow;
    const startY = (H - (rows * nodeH + (rows - 1) * rowGap)) / 2;
    items.forEach((label, i) => {
        const c = i % perRow;
        const x = pad + c * (nodeW + gap);
        const y = startY + Math.floor(i / perRow) * (nodeH + rowGap);
        drawNode(g, x, y, nodeW, nodeH, label, theme, {
            fill: hexA(cols[i]!, 0.14),
            stroke: cols[i]!,
        });
        if (c < perRow - 1 && i < items.length - 1)
            arrow(g, x + nodeW, y + nodeH / 2, x + nodeW + gap, y + nodeH / 2, theme.muted);
    });
};

registerDiagram({ id: "process", label: "Process", render: process });
