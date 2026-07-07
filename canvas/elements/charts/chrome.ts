import type { DrawContext, DrawTextStyle, Rect } from "@engine/node";
import type { Tokens } from "@themes/theme";
import { fontStack, mix } from "@themes/theme";
import { scaleBand, scaleLinear, scalePoint } from "d3-scale";
import type { ResolvedChart } from "./types";
import { catList } from "./data";

// Chart labels typeset in the theme's own UI font, so a chart inherits the artifact's typography the
// same way it inherits its colors. The font is loaded by the app; the surface just names it.
export const uiFont = (t: Tokens): string => fontStack("ui", t);

export const labelStyle = (theme: Tokens, extra?: Partial<DrawTextStyle>): DrawTextStyle => ({
    fill: theme.muted,
    size: 11,
    font: uiFont(theme),
    ...extra,
});

// Interior grid lines are a softened line token — lighter than the border-weight `line` so they read as
// scaffolding, not chrome.
export const gridColor = (t: Tokens): string => mix(t.line, t.surface, 0.5);

// Compact number formatting for axis ticks + value labels (1.2k, 3.4M, 42).
export function fmt(n: number): string {
    const a = Math.abs(n);
    if (a >= 1e6) return `${trim(n / 1e6)}M`;
    if (a >= 1e3) return `${trim(n / 1e3)}k`;
    return trim(n);
}
function trim(n: number): string {
    return String(Math.round(n * 10) / 10);
}

// Top of the plot: the y-axis maximum. Per-category sums when stacked, else the overall max value.
export function yMax(chart: ResolvedChart): number {
    if (chart.options.stacked) {
        const cats = catList(chart);
        const sums = cats.map((_, i) =>
            chart.series.reduce((a, s) => a + Math.max(0, s.points[i] ?? 0), 0),
        );
        return Math.max(1, ...sums);
    }
    return Math.max(1, ...chart.series.flatMap((s) => s.points));
}

// A centered single-row legend at `top`. Returns the vertical space it consumed.
export function legendRow(
    g: DrawContext,
    W: number,
    top: number,
    items: { name: string; color: string }[],
    theme: Tokens,
): number {
    const size = 11;
    const sw = 9;
    const swGap = 6;
    const itemGap = 14;
    const style = labelStyle(theme, { size, fill: theme.soft, align: "start", baseline: "middle" });
    const widths = items.map((it) => sw + swGap + g.measureText(it.name, style).width);
    const total = widths.reduce((a, b) => a + b, 0) + itemGap * Math.max(0, items.length - 1);
    let x = Math.max(8, (W - total) / 2);
    const y = top + 7;
    items.forEach((it, i) => {
        g.rect(x, y - sw / 2, sw, sw, { fill: it.color, radius: 2 });
        g.text(it.name, x + sw + swGap, y, style);
        x += widths[i]! + itemGap;
    });
    return 22;
}

export interface Frame {
    plot: Rect;
    x: (i: number) => number; // left edge of category i (band) or the point x (point scale)
    bw: number; // band width; 0 for a point scale
    y: (v: number) => number;
    yTop: number; // pixel y of value 0 (the baseline)
}

// Reserve space for the legend / y-ticks / x-labels, draw all of that chrome, and return the inner plot
// rect plus the x/y scales the marks draw against. Shared by bar, line, and area.
export function cartesianFrame(
    g: DrawContext,
    W: number,
    H: number,
    chart: ResolvedChart,
    colors: string[],
    theme: Tokens,
    xType: "band" | "point",
): Frame {
    const cats = catList(chart);
    const pad = 10;
    let top = pad;
    if (chart.series.length > 1)
        top += legendRow(
            g,
            W,
            pad - 4,
            chart.series.map((s, i) => ({ name: s.name, color: colors[i]! })),
            theme,
        );

    const base = scaleLinear()
        .domain([0, yMax(chart)])
        .nice();
    const niceMax = base.domain()[1] ?? 1;
    const ticks = base.ticks(4);
    const tickW = Math.max(0, ...ticks.map((t) => g.measureText(fmt(t), labelStyle(theme)).width));
    const left = pad + Math.ceil(tickW) + 6;
    const bottom = 20;
    const plot: Rect = {
        x: left,
        y: top,
        w: Math.max(1, W - left - pad),
        h: Math.max(1, H - top - bottom),
    };

    const y = scaleLinear()
        .domain([0, niceMax])
        .range([plot.y + plot.h, plot.y]);
    let xPos: (i: number) => number;
    let bw = 0;
    if (xType === "band") {
        const b = scaleBand<string>()
            .domain(cats)
            .range([plot.x, plot.x + plot.w])
            .paddingInner(0.28)
            .paddingOuter(0.14);
        bw = b.bandwidth();
        xPos = (i) => b(cats[i] ?? "") ?? plot.x;
    } else {
        const p = scalePoint<string>()
            .domain(cats)
            .range([plot.x, plot.x + plot.w])
            .padding(0.5);
        xPos = (i) => p(cats[i] ?? "") ?? plot.x;
    }

    if (chart.options.showGrid)
        ticks.forEach((t) => {
            const yy = y(t);
            g.line(plot.x, yy, plot.x + plot.w, yy, { stroke: gridColor(theme), width: 1 });
            g.text(fmt(t), plot.x - 6, yy, labelStyle(theme, { align: "end", baseline: "middle" }));
        });
    g.line(plot.x, y(0), plot.x + plot.w, y(0), { stroke: theme.line, width: 1.2 });
    cats.forEach((c, i) => {
        const cx = xType === "band" ? xPos(i) + bw / 2 : xPos(i);
        g.text(c, cx, plot.y + plot.h + 6, labelStyle(theme, { align: "center", baseline: "top" }));
    });

    return { plot, x: xPos, bw, y, yTop: y(0) };
}
