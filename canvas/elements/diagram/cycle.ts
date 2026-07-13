import { hexA } from "@themes";
import { arrowPath, drawNode, registerDiagram, type Renderer } from "./utils";

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

registerDiagram({ id: "cycle", label: "Cycle", render: cycle });
