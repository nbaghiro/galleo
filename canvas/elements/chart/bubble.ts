import { hexA } from "@themes";
import { registerChart, numericAxes } from "./utils";
import type { PlotCtx, ResolvedChart } from "./utils";

// Scatter plus a third series of magnitudes → bubble radius (~4..22px across the size range). Translucent
// fill, solid stroke.
function drawBubble(chart: ResolvedChart, ctx: PlotCtx): void {
    const { g, W, H, theme, opts } = ctx;
    const xs = chart.series[0]?.points ?? [];
    const ys = chart.series[1]?.points ?? [];
    const sizes = chart.series[2]?.points ?? [];
    const n = Math.min(xs.length, ys.length);
    if (n === 0) return;
    const color = ctx.colors(1)[0]!;
    const f = numericAxes(g, W, H, theme, xs.slice(0, n), ys.slice(0, n), opts.showGrid);
    const known = sizes.slice(0, n).filter((v) => Number.isFinite(v));
    const sMin = Math.min(...known);
    const sMax = Math.max(...known);
    const rOf = (v: number): number => {
        if (!Number.isFinite(v) || sMax <= sMin) return 12;
        return 4 + ((v - sMin) / (sMax - sMin)) * 18;
    };
    for (let i = 0; i < n; i++)
        g.circle(f.x(xs[i]!), f.y(ys[i]!), rOf(sizes[i] ?? NaN), {
            fill: hexA(color, 0.5),
            stroke: color,
            width: 1.5,
        });
}

registerChart({ id: "bubble", label: "Bubble", render: drawBubble });
