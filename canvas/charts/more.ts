import type { DrawContext } from "@engine/node";
import type { Tokens } from "@themes/theme";
import { hexA, luminance } from "@themes/theme";
import { scaleBand, scaleLinear } from "d3-scale";
import { registerChart } from "./registry";
import { fmt, gridColor, labelStyle, legendRow, uiFont } from "./chrome";
import { catList } from "./data";
import type { PlotCtx, ResolvedChart } from "./types";

// Scatter + bubble share one pair of linear axes. Draws the ticks/gridlines/baseline and returns the
// value→pixel scales the marks plot against (mirrors chrome's `cartesianFrame`, but both axes numeric).
interface NumFrame {
    x: (v: number) => number;
    y: (v: number) => number;
}
function numericAxes(
    g: DrawContext,
    W: number,
    H: number,
    theme: Tokens,
    xs: number[],
    ys: number[],
    grid: boolean,
): NumFrame {
    const pad = 12;
    const yBase = scaleLinear()
        .domain([Math.min(0, ...ys), Math.max(1, ...ys)])
        .nice();
    const yt = yBase.ticks(4);
    const tickW = Math.max(0, ...yt.map((t) => g.measureText(fmt(t), labelStyle(theme)).width));
    const left = pad + Math.ceil(tickW) + 6;
    const bottom = 20;
    const plot = {
        x: left,
        y: pad,
        w: Math.max(1, W - left - pad),
        h: Math.max(1, H - pad - bottom),
    };
    const x = scaleLinear()
        .domain([Math.min(0, ...xs), Math.max(1, ...xs)])
        .nice()
        .range([plot.x, plot.x + plot.w]);
    const y = scaleLinear()
        .domain(yBase.domain())
        .range([plot.y + plot.h, plot.y]);
    const xt = x.ticks(4);
    if (grid) {
        yt.forEach((t) =>
            g.line(plot.x, y(t), plot.x + plot.w, y(t), { stroke: gridColor(theme), width: 1 }),
        );
        xt.forEach((t) =>
            g.line(x(t), plot.y, x(t), plot.y + plot.h, { stroke: gridColor(theme), width: 1 }),
        );
    }
    yt.forEach((t) =>
        g.text(fmt(t), plot.x - 6, y(t), labelStyle(theme, { align: "end", baseline: "middle" })),
    );
    xt.forEach((t) =>
        g.text(
            fmt(t),
            x(t),
            plot.y + plot.h + 6,
            labelStyle(theme, { align: "center", baseline: "top" }),
        ),
    );
    const base = y(yBase.domain()[0] ?? 0);
    g.line(plot.x, base, plot.x + plot.w, base, { stroke: theme.line, width: 1.2 });
    return { x, y };
}

// Horizontal bars: categories down the y-axis (band scale), values along x (linear, nice). Multi-series
// grouped within each band; a legend appears when there is more than one series.
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

// Numeric X/Y points: series[0] = X, series[1] = Y (paired by index); one series → index is X. All
// point-pairs share a single accent color.
function drawScatter(chart: ResolvedChart, ctx: PlotCtx): void {
    const { g, W, H, theme, opts } = ctx;
    const single = chart.series.length < 2;
    const first = chart.series[0]?.points ?? [];
    const xs = single ? first.map((_, i) => i) : first;
    const ys = single ? first : (chart.series[1]?.points ?? []);
    const n = Math.min(xs.length, ys.length);
    if (n === 0) return;
    const color = ctx.colors(1)[0]!;
    const f = numericAxes(g, W, H, theme, xs.slice(0, n), ys.slice(0, n), opts.showGrid);
    for (let i = 0; i < n; i++)
        g.circle(f.x(xs[i]!), f.y(ys[i]!), 4, { fill: theme.surface, stroke: color, width: 2 });
}

// Scatter plus a third series of magnitudes → bubble radius (~4..22px across the size range). Translucent
// fill, solid stroke.
function drawBubble(chart: ResolvedChart, ctx: PlotCtx): void {
    const { g, W, H, theme, opts } = ctx;
    const xs = chart.series[0]?.points ?? [];
    const ys = chart.series[1]?.points ?? [];
    const sizes = chart.series[2]?.points ?? [];
    const n = Math.min(xs.length, ys.length);
    if (n === 0) return;
    const color = ctx.colors(1)[0]!;
    const f = numericAxes(g, W, H, theme, xs.slice(0, n), ys.slice(0, n), opts.showGrid);
    const known = sizes.slice(0, n).filter((v) => Number.isFinite(v));
    const sMin = Math.min(...known);
    const sMax = Math.max(...known);
    const rOf = (v: number): number => {
        if (!Number.isFinite(v) || sMax <= sMin) return 12;
        return 4 + ((v - sMin) / (sMax - sMin)) * 18;
    };
    for (let i = 0; i < n; i++)
        g.circle(f.x(xs[i]!), f.y(ys[i]!), rOf(sizes[i] ?? NaN), {
            fill: hexA(color, 0.5),
            stroke: color,
            width: 1.5,
        });
}

// Descending funnel stages as centered horizontal bands: each band's top width ∝ its value, its bottom
// width ∝ the next stage, so the shape tapers. Labeled with category + value.
function drawFunnel(chart: ResolvedChart, ctx: PlotCtx): void {
    const { g, W, H, theme } = ctx;
    const vals = (chart.series[0]?.points ?? []).map((v) => Math.max(0, v));
    if (!vals.some((v) => v > 0)) return;
    const cats = catList(chart);
    const cols = ctx.colors(vals.length);
    const max = Math.max(...vals);
    const pad = 12;
    const gap = 3;
    const cx = W / 2;
    const bandH = (H - pad * 2 - gap * (vals.length - 1)) / vals.length;
    const widthOf = (v: number): number => Math.max(2, (v / max) * (W - pad * 2));
    vals.forEach((v, i) => {
        const top = pad + i * (bandH + gap);
        const wTop = widthOf(v) / 2;
        const wBot = widthOf(vals[i + 1] ?? v) / 2;
        g.path(
            (p) => {
                p.moveTo(cx - wTop, top);
                p.lineTo(cx + wTop, top);
                p.lineTo(cx + wBot, top + bandH);
                p.lineTo(cx - wBot, top + bandH);
                p.closePath();
            },
            { fill: cols[i]! },
        );
        g.text(`${cats[i] ?? `#${i + 1}`} · ${fmt(v)}`, cx, top + bandH / 2, {
            fill: luminance(cols[i]!) < 0.5 ? theme.onAccent : theme.ink,
            size: 11,
            weight: 600,
            font: uiFont(theme),
            align: "center",
            baseline: "middle",
        });
    });
}

// Single-value gauge: value = points[0], max = points[1] ?? 100. A 180° track with the value arc filled
// in the accent, value + optional category label centered below the arc.
function drawGauge(chart: ResolvedChart, ctx: PlotCtx): void {
    const { g, W, H, theme } = ctx;
    const pts = chart.series[0]?.points ?? [];
    if (!pts.length) return;
    const value = pts[0]!;
    const max = pts[1] ?? 100;
    const frac = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
    const cx = W / 2;
    const R = Math.max(6, Math.min(W / 2 - 12, H - 40));
    const cy = 14 + R;
    const thick = Math.max(6, R * 0.24);
    const ring = (a0: number, a1: number, color: string): void =>
        g.path(
            (p) => {
                p.arc(cx, cy, R, a0, a1);
                p.arc(cx, cy, R - thick, a1, a0, true);
                p.closePath();
            },
            { fill: color },
        );
    ring(Math.PI, 2 * Math.PI, gridColor(theme));
    if (frac > 0) ring(Math.PI, Math.PI + frac * Math.PI, theme.accent);
    const size = Math.min(28, R * 0.5);
    g.text(fmt(value), cx, cy + 6, {
        fill: theme.ink,
        size,
        weight: 600,
        font: uiFont(theme),
        align: "center",
        baseline: "top",
    });
    const cat = catList(chart)[0];
    if (cat)
        g.text(cat, cx, cy + 10 + size, labelStyle(theme, { align: "center", baseline: "top" }));
}

// Grid heatmap: rows = series (label = series name), columns = categories. Cell opacity encodes the
// value across the whole grid's range; optional value text when `showValues`.
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

registerChart({ id: "column", label: "Column", render: drawColumn });
registerChart({ id: "scatter", label: "Scatter", render: drawScatter });
registerChart({ id: "bubble", label: "Bubble", render: drawBubble });
registerChart({ id: "funnel", label: "Funnel", render: drawFunnel });
registerChart({ id: "gauge", label: "Gauge", render: drawGauge });
registerChart({ id: "heatmap", label: "Heatmap", render: drawHeatmap });
