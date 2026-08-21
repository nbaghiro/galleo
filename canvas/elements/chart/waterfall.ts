import { scaleBand, scaleLinear } from "d3-scale";
import { registerChart, catList, fmt, gridColor, labelStyle, uiFont } from "./utils";
import type { PlotCtx, ResolvedChart } from "./utils";

// each point is a delta; bars float between the running totals either side of it
function drawWaterfall(chart: ResolvedChart, ctx: PlotCtx): void {
    const { g, W, H, theme, opts } = ctx;
    const pts = chart.series[0]?.points ?? [];
    if (!pts.length) return;
    const cats = catList(chart);
    const cols = ctx.colors(3);
    let acc = 0;
    const bars = pts.map((v) => {
        const from = acc;
        acc += v;
        return { from, to: acc, v };
    });
    const lo = Math.min(0, ...bars.map((b) => Math.min(b.from, b.to)));
    const hi = Math.max(0, ...bars.map((b) => Math.max(b.from, b.to)));
    const pad = 10;
    const nice = scaleLinear().domain([lo, hi]).nice();
    const ticks = nice.ticks(4);
    const tickW = Math.max(0, ...ticks.map((t) => g.measureText(fmt(t), labelStyle(theme)).width));
    const left = pad + Math.ceil(tickW) + 6;
    const plot = {
        x: left,
        y: pad,
        w: Math.max(1, W - left - pad),
        h: Math.max(1, H - pad - 20),
    };
    const y = scaleLinear()
        .domain(nice.domain())
        .range([plot.y + plot.h, plot.y]);
    const band = scaleBand<string>()
        .domain(cats)
        .range([plot.x, plot.x + plot.w])
        .paddingInner(0.32)
        .paddingOuter(0.16);
    const bw = band.bandwidth();

    if (opts.showGrid)
        ticks.forEach((t) =>
            g.line(plot.x, y(t), plot.x + plot.w, y(t), { stroke: gridColor(theme), width: 1 }),
        );
    ticks.forEach((t) =>
        g.text(fmt(t), plot.x - 6, y(t), labelStyle(theme, { align: "end", baseline: "middle" })),
    );
    g.line(plot.x, y(0), plot.x + plot.w, y(0), { stroke: theme.line, width: 1.2 });

    bars.forEach((b, i) => {
        const x = band(cats[i] ?? "") ?? plot.x;
        const top = y(Math.max(b.from, b.to));
        const h = Math.max(1, Math.abs(y(b.from) - y(b.to)));
        g.rect(x, top, bw, h, { fill: b.v >= 0 ? cols[0]! : cols[2]!, radius: 2 });
        if (i < bars.length - 1)
            g.line(x + bw, y(b.to), (band(cats[i + 1] ?? "") ?? plot.x) + bw, y(b.to), {
                stroke: theme.line,
                width: 1,
                dash: [3, 3],
            });
        g.text(
            cats[i] ?? "",
            x + bw / 2,
            plot.y + plot.h + 6,
            labelStyle(theme, { align: "center", baseline: "top" }),
        );
        if (opts.showValues)
            g.text(fmt(b.v), x + bw / 2, top - 4, {
                fill: theme.muted,
                size: 10,
                font: uiFont(theme),
                align: "center",
                baseline: "bottom",
            });
    });
}

registerChart({ id: "waterfall", label: "Waterfall", render: drawWaterfall });
