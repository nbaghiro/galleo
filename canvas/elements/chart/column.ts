import { registerChart, cartesianFrame, catList, fmt, uiFont } from "./utils";
import type { DatumSpan, Frame, PlotCtx, ResolvedChart } from "./utils";

// The one geometry pass: the painter fills these boxes, the hit test reports them.
function columnBoxes(chart: ResolvedChart, f: Frame, stacked: boolean): DatumSpan[] {
    const cats = catList(chart);
    const out: DatumSpan[] = [];
    if (stacked) {
        cats.forEach((_, ci) => {
            let acc = 0;
            chart.series.forEach((s, si) => {
                const v = Math.max(0, s.points[ci] ?? 0);
                if (v <= 0) return;
                const yTop = f.y(acc + v);
                out.push({
                    index: ci,
                    series: si,
                    value: v,
                    box: { x: f.x(ci), y: yTop, w: f.bw, h: f.y(acc) - yTop },
                });
                acc += v;
            });
        });
        return out;
    }
    const iw = f.bw / chart.series.length;
    chart.series.forEach((s, si) => {
        cats.forEach((_, ci) => {
            const v = Math.max(0, s.points[ci] ?? 0);
            const top = f.y(v);
            const h = f.yTop - top;
            if (h <= 0) return;
            out.push({
                index: ci,
                series: si,
                value: v,
                box: { x: f.x(ci) + si * iw, y: top, w: Math.max(1, iw - 2), h },
            });
        });
    });
    return out;
}

const frameOf = (chart: ResolvedChart, ctx: PlotCtx): Frame =>
    cartesianFrame(ctx.g, ctx.W, ctx.H, chart, ctx.colors(chart.series.length), ctx.theme, "band");

function drawColumn(chart: ResolvedChart, ctx: PlotCtx): void {
    const { g, theme, opts } = ctx;
    const cols = ctx.colors(chart.series.length);
    const f = frameOf(chart, ctx);
    const groups = chart.series.length;
    const iw = f.bw / groups;
    for (const d of columnBoxes(chart, f, opts.stacked)) {
        g.rect(d.box.x, d.box.y, d.box.w, d.box.h, {
            fill: cols[d.series]!,
            radius: opts.stacked ? 2 : Math.min(3, iw / 3),
        });
        if (!opts.stacked && opts.showValues && groups === 1)
            g.text(fmt(d.value), d.box.x + iw / 2, d.box.y - 4, {
                fill: theme.muted,
                size: 10,
                font: uiFont(theme),
                align: "center",
                baseline: "bottom",
            });
    }
}

registerChart({
    id: "column",
    label: "Column",
    render: drawColumn,
    spans: (chart, ctx) => columnBoxes(chart, frameOf(chart, ctx), ctx.opts.stacked),
});
