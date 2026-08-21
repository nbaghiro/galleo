import { registerChart, catList, fmt, gridColor, labelStyle, uiFont } from "./utils";
import type { PlotCtx, ResolvedChart } from "./utils";

// one value against its maximum, read as a filled track; the radial form is `gauge`
function drawProgress(chart: ResolvedChart, ctx: PlotCtx): void {
    const { g, W, H, theme } = ctx;
    const pts = chart.series[0]?.points ?? [];
    if (!pts.length) return;
    const value = pts[0]!;
    const max = pts[1] ?? 100;
    const frac = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
    const pad = 12;
    const trackW = Math.max(1, W - pad * 2);
    const thick = Math.max(10, Math.min(28, H * 0.22));
    const cy = H / 2;
    const r = thick / 2;
    g.rect(pad, cy - r, trackW, thick, { fill: gridColor(theme), radius: r });
    if (frac > 0)
        g.rect(pad, cy - r, Math.max(thick, trackW * frac), thick, {
            fill: theme.accent,
            radius: r,
        });
    const size = Math.min(26, H * 0.24);
    g.text(fmt(value), pad, cy - r - 8, {
        fill: theme.ink,
        size,
        weight: 600,
        font: uiFont(theme),
        align: "start",
        baseline: "bottom",
    });
    const cat = catList(chart)[0];
    if (cat) g.text(cat, pad, cy + r + 8, labelStyle(theme, { align: "start", baseline: "top" }));
    g.text(
        `${Math.round(frac * 100)}%`,
        W - pad,
        cy - r - 8,
        labelStyle(theme, { align: "end", baseline: "bottom" }),
    );
}

registerChart({ id: "progress", label: "Progress", render: drawProgress });
