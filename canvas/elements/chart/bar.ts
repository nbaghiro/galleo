import { registerChart, cartesianFrame, catList, fmt, uiFont } from "./utils";
import type { PlotCtx, ResolvedChart } from "./utils";

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

registerChart({ id: "bar", label: "Bar", render: drawBar });
