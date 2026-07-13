import { hexA } from "@themes";
import { drawNode, registerDiagram, type Renderer } from "./utils";

const matrix: Renderer = (diagram, ctx) => {
    const { g, W, H, theme } = ctx;
    const items = diagram.items;
    if (items.length === 0) return;
    const cols = ctx.colors(items.length);
    const n = items.length;
    const ncol = Math.ceil(Math.sqrt(n));
    const nrow = Math.ceil(n / ncol);
    const pad = 16;
    const gap = 12;
    const cw = (W - pad * 2 - gap * (ncol - 1)) / ncol;
    const ch = (H - pad * 2 - gap * (nrow - 1)) / nrow;
    items.forEach((label, i) => {
        const x = pad + (i % ncol) * (cw + gap);
        const y = pad + Math.floor(i / ncol) * (ch + gap);
        drawNode(g, x, y, cw, ch, label, theme, { fill: hexA(cols[i]!, 0.14), stroke: cols[i]! });
    });
};

registerDiagram({ id: "matrix", label: "Matrix", render: matrix });
