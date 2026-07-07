import { hexA } from "@themes";
import { area as d3area, line as d3line } from "d3-shape";
import { registerChart, cartesianFrame, curveFor } from "./utils";
import type { Frame, PlotCtx, ResolvedChart, Sink } from "./utils";

function drawArea(chart: ResolvedChart, ctx: PlotCtx): void {
    const { g, W, H, theme, opts } = ctx;
    const cols = ctx.colors(chart.series.length);
    const f: Frame = cartesianFrame(g, W, H, chart, cols, theme, "point");
    const n = Math.max(0, ...chart.series.map((s) => s.points.length));
    const baseline = new Array<number>(n).fill(0);

    chart.series.forEach((s, si) => {
        const lo = opts.stacked ? [...baseline] : new Array<number>(n).fill(0);
        const hi = lo.map((b, i) => b + Math.max(0, s.points[i] ?? 0));
        const areaGen = d3area<number>()
            .x((_, i) => f.x(i))
            .y0((_, i) => f.y(lo[i] ?? 0))
            .y1((_, i) => f.y(hi[i] ?? 0))
            .curve(curveFor(opts.smooth));
        g.path((p) => areaGen.context(p as Sink)(s.points), {
            fill: hexA(cols[si]!, opts.stacked ? 0.82 : 0.16),
        });
        const topLine = d3line<number>()
            .x((_, i) => f.x(i))
            .y((_, i) => f.y(hi[i] ?? 0))
            .curve(curveFor(opts.smooth));
        g.path((p) => topLine.context(p as Sink)(s.points), { stroke: cols[si]!, width: 2 });
        if (opts.stacked) hi.forEach((v, i) => (baseline[i] = v));
    });
}

registerChart({ id: "area", label: "Area", render: drawArea });
