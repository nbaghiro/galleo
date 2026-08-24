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
import type { DatumSpan, PlotCtx, ResolvedChart } from "./utils";

interface BarFrame {
    cats: string[];
    plot: { x: number; y: number; w: number; h: number };
    x: (v: number) => number;
    by: (i: number) => number; // top edge of category i's band
    bw: number;
    ticks: number[];
    values: boolean; // a value label sits past each bar's end
}

// Horizontal bars need their own frame: the category labels run down the left gutter, and a value
// label eats width off the right, so cartesianFrame's vertical geometry does not apply.
function barFrame(chart: ResolvedChart, ctx: PlotCtx): BarFrame | null {
    const { g, W, H, theme, opts } = ctx;
    const cats = catList(chart);
    if (!cats.length || !chart.series.length) return null;
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
    return {
        cats,
        plot,
        x,
        by: (i) => band(cats[i] ?? "") ?? plot.y,
        bw: band.bandwidth(),
        ticks: x.ticks(4),
        values,
    };
}

// The one geometry pass: the painter fills these boxes, the hit test reports them.
function barBoxes(chart: ResolvedChart, f: BarFrame, stacked: boolean): DatumSpan[] {
    const iw = f.bw / chart.series.length;
    const out: DatumSpan[] = [];
    f.cats.forEach((_, ci) => {
        const by = f.by(ci);
        if (stacked) {
            let acc = 0;
            chart.series.forEach((s, si) => {
                const v = Math.max(0, s.points[ci] ?? 0);
                if (v <= 0) return;
                const x0 = f.x(acc);
                acc += v;
                out.push({
                    index: ci,
                    series: si,
                    value: v,
                    box: { x: x0, y: by, w: Math.max(1, f.x(acc) - x0), h: f.bw },
                });
            });
            return;
        }
        chart.series.forEach((s, si) => {
            const v = Math.max(0, s.points[ci] ?? 0);
            const w = f.x(v) - f.plot.x;
            if (w <= 0) return;
            out.push({
                index: ci,
                series: si,
                value: v,
                box: { x: f.plot.x, y: by + si * iw, w, h: Math.max(1, iw - 2) },
            });
        });
    });
    return out;
}

function drawBar(chart: ResolvedChart, ctx: PlotCtx): void {
    const { g, theme, opts } = ctx;
    const f = barFrame(chart, ctx);
    if (!f) return;
    const cols = ctx.colors(chart.series.length);
    const { plot } = f;
    if (opts.showGrid)
        f.ticks.forEach((t) =>
            g.line(f.x(t), plot.y, f.x(t), plot.y + plot.h, { stroke: gridColor(theme), width: 1 }),
        );
    f.ticks.forEach((t) =>
        g.text(
            fmt(t),
            f.x(t),
            plot.y + plot.h + 6,
            labelStyle(theme, { align: "center", baseline: "top" }),
        ),
    );
    g.line(plot.x, plot.y, plot.x, plot.y + plot.h, { stroke: theme.line, width: 1.2 });

    const iw = f.bw / chart.series.length;
    const spans = barBoxes(chart, f, opts.stacked);
    f.cats.forEach((c, ci) => {
        g.text(
            c,
            plot.x - 8,
            f.by(ci) + f.bw / 2,
            labelStyle(theme, { align: "end", baseline: "middle" }),
        );
        for (const d of spans) {
            if (d.index !== ci) continue;
            g.rect(d.box.x, d.box.y, d.box.w, d.box.h, {
                fill: cols[d.series]!,
                radius: opts.stacked ? 2 : Math.min(3, iw / 3),
            });
            if (f.values)
                g.text(
                    fmt(d.value),
                    d.box.x + d.box.w + 5,
                    d.box.y + iw / 2,
                    labelStyle(theme, { align: "start", baseline: "middle", font: uiFont(theme) }),
                );
        }
    });
}

registerChart({
    id: "bar",
    label: "Bar",
    render: drawBar,
    spans: (chart, ctx) => {
        const f = barFrame(chart, ctx);
        return f ? barBoxes(chart, f, ctx.opts.stacked) : [];
    },
});
