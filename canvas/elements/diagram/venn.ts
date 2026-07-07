import { hexA } from "@themes";
import { centerLabel, nodeText, registerDiagram, type Renderer } from "./utils";

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

registerDiagram({ id: "venn", label: "Venn", render: venn });
