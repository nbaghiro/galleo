import { hexA } from "@themes";
import {
    captionText,
    linkColor,
    nodeText,
    registerDiagram,
    stackedLabel,
    type Renderer,
} from "./utils";

// Concentric rings, outermost item first, each captioned on a leader out to the right.
const target: Renderer = (diagram, ctx) => {
    const { g, W, H, theme } = ctx;
    const items = diagram.items;
    if (items.length === 0) return;
    const n = items.length;
    const cols = ctx.colors(n);
    const sideW = Math.min(150, W * 0.32);
    const cx = (W - sideW) / 2;
    const cy = H / 2;
    const rMax = Math.max(24, Math.min((W - sideW) / 2, H / 2) - 10);
    const rAt = (i: number): number => rMax * ((n - i) / n);

    // outermost first, so each inner ring paints over the one containing it
    items.forEach((item, i) => {
        g.circle(cx, cy, rAt(i), { fill: cols[i]!, stroke: theme.surface, width: 1.5 });
        const inner = i < n - 1 ? rAt(i + 1) : 0;
        const band = (rAt(i) - inner) / 2;
        const ly = cy - inner - band;
        const sx = W - sideW + 8;
        g.line(cx + 4, ly, sx - 8, ly, { stroke: hexA(linkColor(theme), 0.45), width: 1 });
        g.circle(cx, ly, 3, { fill: cols[i]! });
        stackedLabel(
            g,
            item,
            sx + (sideW - 16) / 2,
            ly,
            sideW - 16,
            nodeText(theme, { fill: theme.ink, size: 12 }),
            captionText(theme, { fill: theme.muted }),
        );
    });
};

registerDiagram({ id: "target", label: "Target rings", render: target });
