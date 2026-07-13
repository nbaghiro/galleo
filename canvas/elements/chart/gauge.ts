import { registerChart, catList, fmt, gridColor, labelStyle, uiFont } from "./utils";
import type { PlotCtx, ResolvedChart } from "./utils";

function drawGauge(chart: ResolvedChart, ctx: PlotCtx): void {
    const { g, W, H, theme } = ctx;
    const pts = chart.series[0]?.points ?? [];
    if (!pts.length) return;
    const value = pts[0]!;
    const max = pts[1] ?? 100;
    const frac = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
    const cx = W / 2;
    const R = Math.max(6, Math.min(W / 2 - 12, H - 40));
    const cy = 14 + R;
    const thick = Math.max(6, R * 0.24);
    const ring = (a0: number, a1: number, color: string): void =>
        g.path(
            (p) => {
                p.arc(cx, cy, R, a0, a1);
                p.arc(cx, cy, R - thick, a1, a0, true);
                p.closePath();
            },
            { fill: color },
        );
    ring(Math.PI, 2 * Math.PI, gridColor(theme));
    if (frac > 0) ring(Math.PI, Math.PI + frac * Math.PI, theme.accent);
    const size = Math.min(28, R * 0.5);
    g.text(fmt(value), cx, cy + 6, {
        fill: theme.ink,
        size,
        weight: 600,
        font: uiFont(theme),
        align: "center",
        baseline: "top",
    });
    const cat = catList(chart)[0];
    if (cat)
        g.text(cat, cx, cy + 10 + size, labelStyle(theme, { align: "center", baseline: "top" }));
}

registerChart({ id: "gauge", label: "Gauge", render: drawGauge });
