import { hexA } from "@themes";
import { centerLabel, nodeText, registerDiagram, type Renderer } from "./utils";

const SETS = 3; // circles; a 4th item captions the shared centre

const venn: Renderer = (diagram, ctx) => {
    const { g, W, H, theme } = ctx;
    const sets = diagram.items.slice(0, SETS);
    if (sets.length === 0) return;
    const centre = diagram.items[SETS];
    const n = sets.length;
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
        centerLabel(g, sets[i]!.label, lx, ly, r, nodeText(theme, { fill: theme.ink }));
    });
    // a 4th item names where the sets overlap
    if (centre && n === SETS)
        centerLabel(
            g,
            centre.label,
            cx,
            cy + off * 0.12,
            r * 0.8,
            nodeText(theme, { fill: theme.ink, size: 12 }),
        );
};

registerDiagram({ id: "venn", label: "Venn", render: venn });
