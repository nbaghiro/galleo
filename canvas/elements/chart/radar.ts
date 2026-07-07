import { hexA, mix } from "@themes";
import { registerChart, catList, legendRow, uiFont } from "./utils";
import type { PlotCtx, ResolvedChart } from "./utils";

function drawRadar(chart: ResolvedChart, ctx: PlotCtx): void {
    const { g, W, H, theme } = ctx;
    const cats = catList(chart);
    const N = cats.length;
    if (N < 3) return;
    const cols = ctx.colors(chart.series.length);
    const legendH = chart.series.length > 1 ? 22 : 0;
    if (legendH)
        legendRow(
            g,
            W,
            4,
            chart.series.map((s, i) => ({ name: s.name, color: cols[i]! })),
            theme,
        );
    const cx = W / 2;
    const cy = legendH + (H - legendH) / 2;
    const R = Math.max(6, Math.min(W, H - legendH) / 2 - 22);
    const max = Math.max(1, ...chart.series.flatMap((s) => s.points));
    const pt = (i: number, rad: number): [number, number] => {
        const a = -Math.PI / 2 + (i / N) * Math.PI * 2;
        return [cx + Math.cos(a) * rad, cy + Math.sin(a) * rad];
    };

    if (chart.options.showGrid)
        for (let k = 1; k <= 3; k++) {
            const ring = Array.from({ length: N }, (_, i) => pt(i, (R * k) / 3));
            g.polyline([...ring, ring[0]!], {
                stroke: mix(theme.line, theme.surface, 0.4),
                width: 1,
            });
        }
    for (let i = 0; i < N; i++) {
        const [x, y] = pt(i, R);
        g.line(cx, cy, x, y, { stroke: mix(theme.line, theme.surface, 0.25), width: 1 });
    }
    chart.series.forEach((s, si) => {
        const poly = Array.from({ length: N }, (_, i) =>
            pt(i, (R * Math.max(0, s.points[i] ?? 0)) / max),
        );
        g.polyline([...poly, poly[0]!], {
            fill: hexA(cols[si]!, chart.series.length > 1 ? 0.12 : 0.16),
        });
        g.polyline([...poly, poly[0]!], { stroke: cols[si]!, width: 2 });
        poly.forEach((p) =>
            g.circle(p[0], p[1], 2.8, { fill: theme.surface, stroke: cols[si]!, width: 1.6 }),
        );
    });
    for (let i = 0; i < N; i++) {
        const [x, y] = pt(i, R + 13);
        const a = -Math.PI / 2 + (i / N) * Math.PI * 2;
        const align = Math.abs(Math.cos(a)) < 0.3 ? "center" : Math.cos(a) > 0 ? "start" : "end";
        g.text(cats[i] ?? "", x, y, {
            fill: theme.muted,
            size: 10,
            font: uiFont(theme),
            align,
            baseline: "middle",
        });
    }
}

registerChart({ id: "radar", label: "Radar", render: drawRadar });
