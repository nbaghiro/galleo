import { scaleBand, scaleLinear } from "d3-scale";
import { registerChart, catList, fmt, gridColor, labelStyle, legendRow } from "./utils";
import type { PlotCtx, ResolvedChart } from "./utils";

function drawColumn(chart: ResolvedChart, ctx: PlotCtx): void {
    const { g, W, H, theme, opts } = ctx;
    const cats = catList(chart);
    if (!cats.length || !chart.series.length) return;
    const cols = ctx.colors(chart.series.length);
    const pad = 10;
    let top = pad;
    if (chart.series.length > 1)
        top += legendRow(
            g,
            W,
            pad - 4,
            chart.series.map((s, i) => ({ name: s.name, color: cols[i]! })),
            theme,
        );
    const catW = Math.max(0, ...cats.map((c) => g.measureText(c, labelStyle(theme)).width));
    const left = pad + Math.ceil(catW) + 8;
    const bottom = 22;
    const plot = {
        x: left,
        y: top,
        w: Math.max(1, W - left - pad),
        h: Math.max(1, H - top - bottom),
    };
    const max = Math.max(1, ...chart.series.flatMap((s) => s.points.map((v) => Math.max(0, v))));
    const x = scaleLinear()
        .domain([0, max])
        .nice()
        .range([plot.x, plot.x + plot.w]);
    const band = scaleBand<string>()
        .domain(cats)
        .range([plot.y, plot.y + plot.h])
        .paddingInner(0.28)
        .paddingOuter(0.14);
    const bw = band.bandwidth();
    const ticks = x.ticks(4);
    if (opts.showGrid)
        ticks.forEach((t) =>
            g.line(x(t), plot.y, x(t), plot.y + plot.h, { stroke: gridColor(theme), width: 1 }),
        );
    ticks.forEach((t) =>
        g.text(
            fmt(t),
            x(t),
            plot.y + plot.h + 6,
            labelStyle(theme, { align: "center", baseline: "top" }),
        ),
    );
    g.line(plot.x, plot.y, plot.x, plot.y + plot.h, { stroke: theme.line, width: 1.2 });
    const iw = bw / chart.series.length;
    cats.forEach((c, ci) => {
        const by = band(c) ?? plot.y;
        g.text(c, plot.x - 8, by + bw / 2, labelStyle(theme, { align: "end", baseline: "middle" }));
        chart.series.forEach((s, si) => {
            const w = x(Math.max(0, s.points[ci] ?? 0)) - plot.x;
            if (w <= 0) return;
            g.rect(plot.x, by + si * iw, w, Math.max(1, iw - 2), {
                fill: cols[si]!,
                radius: Math.min(3, iw / 3),
            });
        });
    });
}

registerChart({ id: "column", label: "Column", render: drawColumn });
