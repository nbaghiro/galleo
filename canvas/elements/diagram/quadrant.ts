import { hexA } from "@themes";
import { centerLabel, nodeText, registerDiagram, type Renderer } from "./utils";

const quadrant: Renderer = (diagram, ctx) => {
    const { g, W, H, theme } = ctx;
    const items = diagram.items.slice(0, 4);
    if (items.length === 0) return;
    const cols = ctx.colors(4);
    const pad = 16;
    const x0 = pad;
    const y0 = pad;
    const x1 = W - pad;
    const y1 = H - pad;
    const mx = (x0 + x1) / 2;
    const my = (y0 + y1) / 2;
    const qw = (x1 - x0) / 2;
    const qh = (y1 - y0) / 2;
    const quads: [number, number][] = [
        [x0, y0],
        [mx, y0],
        [x0, my],
        [mx, my],
    ];
    quads.forEach((q, i) => g.rect(q[0], q[1], qw, qh, { fill: hexA(cols[i]!, 0.06) }));
    g.line(mx, y0, mx, y1, { stroke: theme.line, width: 1.5 });
    g.line(x0, my, x1, my, { stroke: theme.line, width: 1.5 });
    items.forEach((label, i) => {
        const q = quads[i]!;
        centerLabel(g, label, q[0] + qw / 2, q[1] + qh / 2, qw - 16, nodeText(theme));
    });
};

registerDiagram({ id: "quadrant", label: "Quadrant", render: quadrant });
