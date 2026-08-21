import { scaleBand, scaleLinear } from "d3-scale";
import {
    registerChart,
    catList,
    fmt,
    gridColor,
    labelStyle,
    legendRow,
    uiFont,
    yMax,
} from "./utils";
import type { PlotCtx, ResolvedChart } from "./utils";

function drawBar(chart: ResolvedChart, ctx: PlotCtx): void {
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
    const single = chart.series.length === 1;
    const values = opts.showValues && single && !opts.stacked;
    // a value label sits past the bar end, so the plot gives up exactly the width it needs
    const valueW = values
        ? Math.max(
              0,
              ...(chart.series[0]?.points ?? []).map(
                  (v) => g.measureText(fmt(Math.max(0, v)), labelStyle(theme)).width,
              ),
          ) + 8
        : 0;
    const plot = {
        x: left,
        y: top,
        w: Math.max(1, W - left - pad - valueW),
        h: Math.max(1, H - top - 22),
    };
    const x = scaleLinear()
        .domain([0, yMax(chart)])
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
        if (opts.stacked) {
            let acc = 0;
            chart.series.forEach((s, si) => {
                const v = Math.max(0, s.points[ci] ?? 0);
                if (v <= 0) return;
                const x0 = x(acc);
                acc += v;
                g.rect(x0, by, Math.max(1, x(acc) - x0), bw, { fill: cols[si]!, radius: 2 });
            });
            return;
        }
        chart.series.forEach((s, si) => {
            const v = Math.max(0, s.points[ci] ?? 0);
            const w = x(v) - plot.x;
            if (w <= 0) return;
            const y0 = by + si * iw;
            g.rect(plot.x, y0, w, Math.max(1, iw - 2), {
                fill: cols[si]!,
                radius: Math.min(3, iw / 3),
            });
            if (values)
                g.text(
                    fmt(v),
                    plot.x + w + 5,
                    y0 + iw / 2,
                    labelStyle(theme, { align: "start", baseline: "middle", font: uiFont(theme) }),
                );
        });
    });
}

registerChart({ id: "bar", label: "Bar", render: drawBar });
