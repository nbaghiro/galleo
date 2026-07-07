import { registerChart, numericAxes } from "./utils";
import type { PlotCtx, ResolvedChart } from "./utils";

// Numeric X/Y points: series[0] = X, series[1] = Y (paired by index); one series → index is X. All
// point-pairs share a single accent color.
function drawScatter(chart: ResolvedChart, ctx: PlotCtx): void {
    const { g, W, H, theme, opts } = ctx;
    const single = chart.series.length < 2;
    const first = chart.series[0]?.points ?? [];
    const xs = single ? first.map((_, i) => i) : first;
    const ys = single ? first : (chart.series[1]?.points ?? []);
    const n = Math.min(xs.length, ys.length);
    if (n === 0) return;
    const color = ctx.colors(1)[0]!;
    const f = numericAxes(g, W, H, theme, xs.slice(0, n), ys.slice(0, n), opts.showGrid);
    for (let i = 0; i < n; i++)
        g.circle(f.x(xs[i]!), f.y(ys[i]!), 4, { fill: theme.surface, stroke: color, width: 2 });
}

registerChart({ id: "scatter", label: "Scatter", render: drawScatter });
