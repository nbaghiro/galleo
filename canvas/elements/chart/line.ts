import { line as d3line } from "d3-shape";
import { registerChart, cartesianFrame, curveFor } from "./utils";
import type { PlotCtx, ResolvedChart, Sink } from "./utils";

function drawLine(chart: ResolvedChart, ctx: PlotCtx): void {
    const { g, W, H, theme, opts } = ctx;
    const cols = ctx.colors(chart.series.length);
    const f = cartesianFrame(g, W, H, chart, cols, theme, "point");
    chart.series.forEach((s, si) => {
        const gen = d3line<number>()
            .x((_, i) => f.x(i))
            .y((v) => f.y(Math.max(0, v)))
            .curve(curveFor(opts.smooth));
        g.path((p) => gen.context(p as Sink)(s.points), { stroke: cols[si]!, width: 2.4 });
        s.points.forEach((v, i) =>
            g.circle(f.x(i), f.y(Math.max(0, v)), 3.1, {
                fill: theme.surface,
                stroke: cols[si]!,
                width: 1.8,
            }),
        );
    });
}

registerChart({ id: "line", label: "Line", render: drawLine });
