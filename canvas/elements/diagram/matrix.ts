import { PAD, captionText, drawNode, registerDiagram, stackedLabel, type Renderer } from "./utils";

// `axes` = column headers then row headers; absent, it stays a plain tiled grid
const matrix: Renderer = (diagram, ctx) => {
    const { g, W, H, theme } = ctx;
    const items = diagram.items;
    if (items.length === 0) return;
    const cols = ctx.colors(items.length);
    const n = items.length;
    const ncol = Math.ceil(Math.sqrt(n));
    const nrow = Math.ceil(n / ncol);
    const colHeads = diagram.axes.slice(0, ncol);
    const rowHeads = diagram.axes.slice(ncol, ncol + nrow);
    const headT = colHeads.length ? 20 : 0;
    const headL = rowHeads.length ? 58 : 0;
    const pad = PAD;
    const gap = 12;
    const gridX = pad + headL;
    const gridY = pad + headT;
    const cw = (W - pad * 2 - headL - gap * (ncol - 1)) / ncol;
    const ch = (H - pad * 2 - headT - gap * (nrow - 1)) / nrow;
    const head = captionText(theme, { fill: theme.muted, size: 10.5, weight: 700 });

    colHeads.forEach((label, c) =>
        g.text(label, gridX + c * (cw + gap) + cw / 2, pad + headT / 2, head),
    );
    rowHeads.forEach((label, r) =>
        stackedLabel(
            g,
            { label },
            pad + headL / 2 - 6,
            gridY + r * (ch + gap) + ch / 2,
            headL - 14,
            head,
        ),
    );

    items.forEach((item, i) => {
        const x = gridX + (i % ncol) * (cw + gap);
        const y = gridY + Math.floor(i / ncol) * (ch + gap);
        drawNode(g, { x, y, w: cw, h: ch }, item, theme, {
            color: cols[i]!,
            showBody: !!item.body,
        });
    });
};

registerDiagram({ id: "matrix", label: "Matrix", render: matrix });
