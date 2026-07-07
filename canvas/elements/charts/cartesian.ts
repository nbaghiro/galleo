import { hexA } from "@themes/theme";
import { area as d3area, curveCatmullRom, curveLinear, line as d3line } from "d3-shape";
import type { CurveFactory } from "d3-shape";
import { registerChart } from "./registry";
import { cartesianFrame, fmt, uiFont, type Frame } from "./chrome";
import { catList } from "./data";
import type { PlotCtx, ResolvedChart } from "./types";

const curveFor = (smooth: boolean): CurveFactory =>
    smooth ? curveCatmullRom.alpha(0.5) : curveLinear;

// d3-shape's generators are typed against CanvasRenderingContext2D; our PathSink is the same structural
// slice, so the bridge is a single localized cast at the `.context()` call.
type Sink = CanvasRenderingContext2D;

function drawBar(chart: ResolvedChart, ctx: PlotCtx): void {
    const { g, W, H, theme, opts } = ctx;
    const cols = ctx.colors(chart.series.length);
    const f = cartesianFrame(g, W, H, chart, cols, theme, "band");
    const cats = catList(chart);

    if (opts.stacked) {
        cats.forEach((_, ci) => {
            let acc = 0;
            chart.series.forEach((s, si) => {
                const v = Math.max(0, s.points[ci] ?? 0);
                if (v <= 0) return;
                const yTop = f.y(acc + v);
                g.rect(f.x(ci), yTop, f.bw, f.y(acc) - yTop, { fill: cols[si]!, radius: 2 });
                acc += v;
            });
        });
        return;
    }

    const groups = chart.series.length;
    const iw = f.bw / groups;
    chart.series.forEach((s, si) => {
        cats.forEach((_, ci) => {
            const v = Math.max(0, s.points[ci] ?? 0);
            const top = f.y(v);
            const h = f.yTop - top;
            if (h <= 0) return;
            const bx = f.x(ci) + si * iw;
            g.rect(bx, top, Math.max(1, iw - 2), h, {
                fill: cols[si]!,
                radius: Math.min(3, iw / 3),
            });
            if (opts.showValues && groups === 1)
                g.text(fmt(v), bx + iw / 2, top - 4, {
                    fill: theme.muted,
                    size: 10,
                    font: uiFont(theme),
                    align: "center",
                    baseline: "bottom",
                });
        });
    });
}

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

registerChart({ id: "bar", label: "Bar", render: drawBar });
registerChart({ id: "line", label: "Line", render: drawLine });
registerChart({ id: "area", label: "Area", render: drawArea });
