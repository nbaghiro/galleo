import { centerLabel, nodeText, registerDiagram, type Renderer } from "./utils";

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

registerDiagram({ id: "timeline", label: "Timeline", render: timeline });
