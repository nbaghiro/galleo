import { hexA } from "@themes";
import { captionText, centerLabel, nodeText, registerDiagram, type Renderer } from "./utils";

// `axes` = x low, x high, y low, y high. On the axis ends: no text rotation, so a side gutter would clip
const quadrant: Renderer = (diagram, ctx) => {
    const { g, W, H, theme } = ctx;
    const items = diagram.items.slice(0, 4);
    if (items.length === 0) return;
    const cols = ctx.colors(4);
    const [xLow, xHigh, yLow, yHigh] = diagram.axes;
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
    items.forEach((item, i) => {
        const q = quads[i]!;
        centerLabel(g, item.label, q[0] + qw / 2, q[1] + qh / 2, qw - 16, nodeText(theme));
    });

    const cap = captionText(theme, { fill: theme.muted, size: 10.5, weight: 600 });
    if (xLow) g.text(xLow, x0 + 8, my - 10, { ...cap, align: "start" });
    if (xHigh) g.text(xHigh, x1 - 8, my - 10, { ...cap, align: "end" });
    if (yHigh) g.text(yHigh, mx + 9, y0 + 10, { ...cap, align: "start" });
    if (yLow) g.text(yLow, mx + 9, y1 - 10, { ...cap, align: "start" });
};

registerDiagram({ id: "quadrant", label: "Quadrant", render: quadrant });
