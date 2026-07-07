import { hexA } from "@themes/theme";
import { arrow, arrowPath, centerLabel, drawNode, nodeText } from "./chrome";
import { registerDiagram } from "./registry";
import type { DiagramCtx, ResolvedDiagram } from "./types";

type Renderer = (diagram: ResolvedDiagram, ctx: DiagramCtx) => void;

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

// Nodes evenly placed around an ellipse, arrows arcing clockwise along the ring between neighbours.
const cycle: Renderer = (diagram, ctx) => {
    const { g, W, H, theme } = ctx;
    const items = diagram.items;
    if (items.length === 0) return;
    const cols = ctx.colors(items.length);
    const n = items.length;
    const cx = W / 2;
    const cy = H / 2;
    const nodeW = 100;
    const nodeH = 44;
    const rx = W / 2 - nodeW / 2 - 16;
    const ry = H / 2 - nodeH / 2 - 16;
    const at = (a: number): [number, number] => [cx + Math.cos(a) * rx, cy + Math.sin(a) * ry];
    const gapA = (Math.PI * 2) / n;
    for (let i = 0; i < n && n > 1; i++) {
        const start = -Math.PI / 2 + i * gapA + gapA * 0.28;
        const end = -Math.PI / 2 + (i + 1) * gapA - gapA * 0.28;
        const pts: [number, number][] = [];
        for (let s = 0; s <= 8; s++) pts.push(at(start + ((end - start) * s) / 8));
        arrowPath(g, pts, theme.muted);
    }
    items.forEach((label, i) => {
        const [x, y] = at(-Math.PI / 2 + i * gapA);
        drawNode(g, x - nodeW / 2, y - nodeH / 2, nodeW, nodeH, label, theme, {
            fill: hexA(cols[i]!, 0.14),
            stroke: cols[i]!,
        });
    });
};

// Stacked trapezoid bands forming a triangle (narrowTop → pyramid) or a funnel (wideTop) silhouette.
function bandStack(narrowTop: boolean): Renderer {
    return (diagram, ctx) => {
        const { g, W, H, theme } = ctx;
        const items = diagram.items;
        if (items.length === 0) return;
        const cols = ctx.colors(items.length);
        const n = items.length;
        const pad = 16;
        const top = pad;
        const bottom = H - pad;
        const bandH = (bottom - top) / n;
        const cx = W / 2;
        const wide = W / 2 - pad;
        const narrow = wide * 0.14;
        const halfAt = (y: number): number => {
            const t = (y - top) / (bottom - top);
            return narrowTop ? narrow + (wide - narrow) * t : wide - (wide - narrow) * t;
        };
        items.forEach((label, i) => {
            const y0 = top + i * bandH;
            const y1 = y0 + bandH - 3;
            const h0 = halfAt(y0);
            const h1 = halfAt(y1);
            g.path(
                (p) => {
                    p.moveTo(cx - h0, y0);
                    p.lineTo(cx + h0, y0);
                    p.lineTo(cx + h1, y1);
                    p.lineTo(cx - h1, y1);
                    p.closePath();
                },
                { fill: cols[i]! },
            );
            const my = (y0 + y1) / 2;
            const mw = Math.max(24, halfAt(my) * 2 - 12);
            centerLabel(g, label, cx, my, mw, nodeText(theme, { fill: theme.onAccent }));
        });
    };
}

// Horizontal spine with evenly spaced accent dots; labels alternate above/below on connector stems.
const timeline: Renderer = (diagram, ctx) => {
    const { g, W, H, theme } = ctx;
    const items = diagram.items;
    if (items.length === 0) return;
    const n = items.length;
    const cy = H / 2;
    const padX = 40;
    g.line(padX, cy, W - padX, cy, { stroke: theme.line, width: 2 });
    const step = n > 1 ? (W - padX * 2) / (n - 1) : 0;
    const lw = Math.max(48, Math.min(n > 1 ? step - 8 : 120, 120));
    items.forEach((label, i) => {
        const x = n > 1 ? padX + i * step : W / 2;
        const up = i % 2 === 0;
        const ly = up ? cy - 46 : cy + 46;
        g.line(x, cy, x, up ? ly + 10 : ly - 10, { stroke: theme.line, width: 1 });
        g.circle(x, cy, 5, { fill: theme.accent, stroke: theme.surface, width: 2 });
        centerLabel(g, label, x, ly, lw, nodeText(theme, { fill: theme.ink, size: 12 }));
    });
};

// Two or three overlapping translucent circles; labels sit near each circle's centre.
const venn: Renderer = (diagram, ctx) => {
    const { g, W, H, theme } = ctx;
    const items = diagram.items.slice(0, 3);
    if (items.length === 0) return;
    const n = items.length;
    const cols = ctx.colors(n);
    const cx = W / 2;
    const cy = H / 2;
    const r = Math.min(W, H) / 3.4;
    const off = r * 0.62;
    const centers: [number, number][] =
        n === 1
            ? [[cx, cy]]
            : n === 2
              ? [
                    [cx - off, cy],
                    [cx + off, cy],
                ]
              : [
                    [cx, cy - off * 0.66],
                    [cx - off, cy + off * 0.5],
                    [cx + off, cy + off * 0.5],
                ];
    centers.forEach((c, i) =>
        g.circle(c[0], c[1], r, { fill: hexA(cols[i]!, 0.4), stroke: cols[i]!, width: 1.5 }),
    );
    centers.forEach((c, i) => {
        const dx = c[0] - cx;
        const dy = c[1] - cy;
        const len = Math.hypot(dx, dy) || 1;
        const lx = n === 1 ? cx : c[0] + (dx / len) * r * 0.45;
        const ly = n === 1 ? cy : c[1] + (dy / len) * r * 0.45;
        centerLabel(g, items[i]!, lx, ly, r, nodeText(theme, { fill: theme.ink }));
    });
};

// A 2x2 matrix: faint quadrant tints, crossing axes, and the first four items one per quadrant.
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

// Items in a near-square grid of ceil(sqrt(n)) columns, each a node cell filling the box evenly.
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

registerDiagram({ id: "process", label: "Process", render: process });
registerDiagram({ id: "cycle", label: "Cycle", render: cycle });
registerDiagram({ id: "pyramid", label: "Pyramid", render: bandStack(true) });
registerDiagram({ id: "funnel", label: "Funnel", render: bandStack(false) });
registerDiagram({ id: "timeline", label: "Timeline", render: timeline });
registerDiagram({ id: "venn", label: "Venn", render: venn });
registerDiagram({ id: "quadrant", label: "Quadrant", render: quadrant });
registerDiagram({ id: "matrix", label: "Matrix", render: matrix });
