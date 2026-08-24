import { registerChart, numericAxes, pointSpan } from "./utils";
import type { DatumSpan, PlotCtx, ResolvedChart } from "./utils";

const DOT_R = 4;

// one series is read as y-against-index; two are read as x/y, which is what the data grid edits
function xy(chart: ResolvedChart): { xs: number[]; ys: number[]; n: number } {
    const single = chart.series.length < 2;
    const first = chart.series[0]?.points ?? [];
    const xs = single ? first.map((_, i) => i) : first;
    const ys = single ? first : (chart.series[1]?.points ?? []);
    return { xs, ys, n: Math.min(xs.length, ys.length) };
}

function scatterDots(chart: ResolvedChart, ctx: PlotCtx): DatumSpan[] {
    const { xs, ys, n } = xy(chart);
    if (n === 0) return [];
    const f = numericAxes(
        ctx.g,
        ctx.W,
        ctx.H,
        ctx.theme,
        xs.slice(0, n),
        ys.slice(0, n),
        ctx.opts.showGrid,
    );
    const out: DatumSpan[] = [];
    for (let i = 0; i < n; i++) out.push(pointSpan(i, 0, ys[i]!, f.x(xs[i]!), f.y(ys[i]!), DOT_R));
    return out;
}

function drawScatter(chart: ResolvedChart, ctx: PlotCtx): void {
    const { g, W, H, theme, opts } = ctx;
    const { xs, ys, n } = xy(chart);
    if (n === 0) return;
    const color = ctx.colors(1)[0]!;
    const f = numericAxes(g, W, H, theme, xs.slice(0, n), ys.slice(0, n), opts.showGrid);
    for (let i = 0; i < n; i++)
        g.circle(f.x(xs[i]!), f.y(ys[i]!), DOT_R, { fill: theme.surface, stroke: color, width: 2 });
}

registerChart({ id: "scatter", label: "Scatter", render: drawScatter, spans: scatterDots });
