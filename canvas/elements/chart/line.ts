import { line as d3line } from "d3-shape";
import { registerChart, cartesianFrame, curveFor, pointSpan } from "./utils";
import type { DatumSpan, Frame, PlotCtx, ResolvedChart, Sink } from "./utils";

const frameOf = (chart: ResolvedChart, ctx: PlotCtx): Frame =>
    cartesianFrame(ctx.g, ctx.W, ctx.H, chart, ctx.colors(chart.series.length), ctx.theme, "point");

const DOT_R = 3.1;

function lineDots(chart: ResolvedChart, f: Frame): DatumSpan[] {
    return chart.series.flatMap((s, si) =>
        s.points.map((v, i) => pointSpan(i, si, v, f.x(i), f.y(Math.max(0, v)), DOT_R)),
    );
}

function drawLine(chart: ResolvedChart, ctx: PlotCtx): void {
    const { g, theme, opts } = ctx;
    const cols = ctx.colors(chart.series.length);
    const f = frameOf(chart, ctx);
    chart.series.forEach((s, si) => {
        const gen = d3line<number>()
            .x((_, i) => f.x(i))
            .y((v) => f.y(Math.max(0, v)))
            .curve(curveFor(opts.smooth));
        g.path((p) => gen.context(p as Sink)(s.points), { stroke: cols[si]!, width: 2.4 });
        s.points.forEach((v, i) =>
            g.circle(f.x(i), f.y(Math.max(0, v)), DOT_R, {
                fill: theme.surface,
                stroke: cols[si]!,
                width: 1.8,
            }),
        );
    });
}

registerChart({
    id: "line",
    label: "Line",
    render: drawLine,
    spans: (chart, ctx) => lineDots(chart, frameOf(chart, ctx)),
});
