import { hexA } from "@themes";
import { registerChart, catList, fmt, labelStyle } from "./utils";
import type { PlotCtx, ResolvedChart } from "./utils";

function drawHeatmap(chart: ResolvedChart, ctx: PlotCtx): void {
    const { g, W, H, theme, opts } = ctx;
    const rows = chart.series;
    const cols = catList(chart);
    if (!rows.length || !cols.length) return;
    const pad = 8;
    const rowW = Math.max(0, ...rows.map((s) => g.measureText(s.name, labelStyle(theme)).width));
    const left = pad + Math.ceil(rowW) + 8;
    const top = pad + 16;
    const cw = Math.max(1, W - left - pad) / cols.length;
    const ch = Math.max(1, H - top - pad) / rows.length;
    const all = rows.flatMap((s) => s.points.filter((v) => Number.isFinite(v)));
    const lo = Math.min(0, ...all);
    const hi = Math.max(1, ...all);
    cols.forEach((c, ci) =>
        g.text(
            c,
            left + ci * cw + cw / 2,
            top - 4,
            labelStyle(theme, { align: "center", baseline: "bottom" }),
        ),
    );
    rows.forEach((s, ri) => {
        const cy = top + ri * ch;
        g.text(
            s.name,
            left - 8,
            cy + ch / 2,
            labelStyle(theme, { align: "end", baseline: "middle" }),
        );
        cols.forEach((_, ci) => {
            const v = s.points[ci];
            if (v === undefined || !Number.isFinite(v)) return;
            const t = hi === lo ? 1 : (v - lo) / (hi - lo);
            g.rect(left + ci * cw + 1, cy + 1, Math.max(1, cw - 2), Math.max(1, ch - 2), {
                fill: hexA(theme.accent, 0.08 + t * 0.92),
                radius: 2,
            });
            if (opts.showValues)
                g.text(
                    fmt(v),
                    left + ci * cw + cw / 2,
                    cy + ch / 2,
                    labelStyle(theme, {
                        align: "center",
                        baseline: "middle",
                        fill: t > 0.55 ? theme.onAccent : theme.ink,
                    }),
                );
        });
    });
}

registerChart({ id: "heatmap", label: "Heatmap", render: drawHeatmap });
