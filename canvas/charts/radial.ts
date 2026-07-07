import { hexA, mix } from "@themes/theme";
import { registerChart } from "./registry";
import { fmt, legendRow, uiFont } from "./chrome";
import { catList } from "./data";
import type { PlotCtx, ResolvedChart } from "./types";

// Pie + donut share everything but the inner radius. Both use the first series as the slice values and
// the categories as slice labels. Slices are drawn centered at (cx, cy) with canvas angles (0 = top,
// clockwise) — d3.arc() centers at the origin, which would pin the pie to the box's top-left corner.
function pieLike(donut: boolean) {
    return (chart: ResolvedChart, ctx: PlotCtx): void => {
        const { g, W, H, theme } = ctx;
        const vals = (chart.series[0]?.points ?? []).map((v) => Math.max(0, v));
        const total = vals.reduce((s, v) => s + v, 0);
        if (total <= 0) return;
        const cats = catList(chart);
        const cols = ctx.colors(vals.length);
        const legendH = legendRow(
            g,
            W,
            H - 22,
            vals.map((_, i) => ({ name: cats[i] ?? `#${i + 1}`, color: cols[i]! })),
            theme,
        );
        const cx = W / 2;
        const availH = H - legendH - 6;
        const cy = 6 + availH / 2;
        const R = Math.max(6, Math.min(W, availH) / 2 - 6);
        const rIn = donut ? R * 0.6 : 0;
        const style = (i: number) => ({ fill: cols[i]!, stroke: theme.surface, width: 1.5 });

        let a = -Math.PI / 2;
        vals.forEach((v, i) => {
            const a0 = a;
            const a1 = a + (v / total) * Math.PI * 2;
            a = a1;
            if (donut) {
                g.path((p) => {
                    p.moveTo(cx + Math.cos(a0) * R, cy + Math.sin(a0) * R);
                    p.arc(cx, cy, R, a0, a1, false);
                    p.arc(cx, cy, rIn, a1, a0, true);
                    p.closePath();
                }, style(i));
            } else {
                g.wedge(cx, cy, R, a0, a1, style(i));
            }
        });

        if (donut) {
            g.text(fmt(total), cx, cy, {
                fill: theme.ink,
                size: Math.min(24, R * 0.5),
                weight: 600,
                font: uiFont(theme),
                align: "center",
                baseline: "middle",
            });
        }
    };
}

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

registerChart({ id: "pie", label: "Pie", render: pieLike(false) });
registerChart({ id: "donut", label: "Donut", render: pieLike(true) });
registerChart({ id: "radar", label: "Radar", render: drawRadar });
