import type { DrawContext, DrawTextStyle, Rect } from "@engine/node";
import type { Tokens } from "@themes/theme";
import { fontStack, hexA, hexToRgb, luminance, mix } from "@themes/theme";
import { scaleBand, scaleLinear, scalePoint } from "d3-scale";
import { curveCatmullRom, curveLinear } from "d3-shape";
import type { CurveFactory } from "d3-shape";

// ── Types ─────────────────────────────────────────────────────────────────────

export type PaletteMode = "ramp" | "categorical";

// Authored/persisted chart data (lives in the artifact JSONB). String-based for now so the shared text
// inspector + legacy `{ kind, values, height }` charts keep working; a structured/grid editor replaces
// the strings later. `values` holds one series per line, points comma-separated within a line.
export interface ChartData {
    type?: string; // bar | line | area | pie | donut | radar
    kind?: string; // legacy discriminant (bar | line | pie) — folded into `type` on normalize
    values: string; // series by newline, points by comma
    categories?: string; // x-axis labels, comma-separated
    seriesNames?: string; // legend labels, comma-separated
    palette?: PaletteMode;
    stacked?: boolean;
    smooth?: boolean;
    showValues?: boolean;
    showGrid?: boolean;
    height?: number;
}

export interface Series {
    name: string;
    points: number[];
}

export interface ChartOptions {
    palette: PaletteMode;
    stacked: boolean;
    smooth: boolean;
    showValues: boolean;
    showGrid: boolean;
}

// A chart after parsing + defaulting — the single shape every plot renders from.
export interface ResolvedChart {
    type: string;
    series: Series[];
    categories: string[];
    options: ChartOptions;
}

// The surface handed to a plot: local-origin size (draw from 0,0), theme tokens, resolved options, and
// a palette factory (n colors derived from the theme accent per the active palette mode).
export interface PlotCtx {
    g: DrawContext;
    W: number;
    H: number;
    theme: Tokens;
    opts: ChartOptions;
    colors: (n: number) => string[];
}

// A registered chart type. Adding one = a single entry + registerChart() — no engine/element change.
export interface ChartType {
    id: string;
    label: string;
    render: (chart: ResolvedChart, ctx: PlotCtx) => void;
}

// ── Registry ──────────────────────────────────────────────────────────────────

// The chart-type registry — mirrors the element registry (@elements/spec). Each type module
// (bar.ts, line.ts, …) registers its type at import; render.ts imports them for the side effect.
const registry = new Map<string, ChartType>();

export function registerChart(type: ChartType): void {
    registry.set(type.id, type);
}

export function getChart(id: string): ChartType | undefined {
    return registry.get(id);
}

// Options for the element's "Type" control, in registration order (bar · line · area · pie · donut · radar).
export function chartTypeOptions(): { label: string; value: string }[] {
    return [...registry.values()].map((t) => ({ label: t.label, value: t.id }));
}

// ── Data ──────────────────────────────────────────────────────────────────────

function splitList(s: string | undefined): string[] {
    return (s ?? "")
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean);
}

// One series per line, points comma-separated. A single-line `values` (the legacy shape) parses to one
// series — so existing `{ kind, values }` charts keep rendering unchanged.
function parseSeries(values: string, names: string[]): Series[] {
    return (values ?? "")
        .split("\n")
        .map((row) =>
            row
                .split(",")
                .map((c) => parseFloat(c.trim()))
                .filter((n) => Number.isFinite(n)),
        )
        .filter((points) => points.length > 0)
        .map((points, i) => ({ name: names[i] ?? `Series ${i + 1}`, points }));
}

const LEGACY_KIND: Record<string, string> = { bar: "bar", line: "line", pie: "pie" };

export function normalize(d: ChartData): ResolvedChart {
    const type = d.type ?? (d.kind ? (LEGACY_KIND[d.kind] ?? d.kind) : "bar");
    const palette: PaletteMode = d.palette === "categorical" ? "categorical" : "ramp";
    return {
        type,
        series: parseSeries(d.values, splitList(d.seriesNames)),
        categories: splitList(d.categories),
        options: {
            palette,
            stacked: d.stacked ?? false,
            smooth: d.smooth ?? false,
            showValues: d.showValues ?? false,
            showGrid: d.showGrid ?? true,
        },
    };
}

// Category labels, deriving 1..n from the longest series when none are authored.
export function catList(chart: ResolvedChart): string[] {
    if (chart.categories.length) return chart.categories;
    const n = Math.max(0, ...chart.series.map((s) => s.points.length));
    return Array.from({ length: n }, (_, i) => String(i + 1));
}

// ── Palette ─────────────────────────────────────────────────────────────────────

function rgb2hsl(r: number, g: number, b: number): [number, number, number] {
    r /= 255;
    g /= 255;
    b /= 255;
    const mx = Math.max(r, g, b);
    const mn = Math.min(r, g, b);
    const l = (mx + mn) / 2;
    if (mx === mn) return [0, 0, l];
    const d = mx - mn;
    const s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    const h =
        mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return [(h / 6) * 360, s, l];
}

function hsl2hex(h: number, s: number, l: number): string {
    const hh = ((((h % 360) + 360) % 360) / 360) * 12;
    const chan = (n: number): string => {
        const k = (n + hh) % 12;
        const a = s * Math.min(l, 1 - l);
        const c = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
        return Math.round(c * 255)
            .toString(16)
            .padStart(2, "0");
    };
    return `#${chan(0)}${chan(8)}${chan(4)}`;
}

// N series colors from the single theme accent. "ramp" steps the accent's opacity — monochrome and
// always on-brand (the same trick the old pie chart used per slice). "categorical" rotates the accent's
// hue for distinct-but-related colors, falling back to a lightness ramp when the accent is near-neutral
// (a mono theme should yield a mono chart, faithfully).
export function seriesColors(theme: Tokens, n: number, mode: PaletteMode): string[] {
    const count = Math.max(1, n);
    if (mode === "ramp") {
        const steps = [1, 0.7, 0.48, 0.32, 0.22];
        return Array.from({ length: count }, (_, i) =>
            hexA(theme.accent, steps[i] ?? Math.max(0.16, 1 - i * 0.15)),
        );
    }
    const [h, s, l] = rgb2hsl(...hexToRgb(theme.accent));
    const dark = luminance(theme.bg) < 0.5;
    if (s < 0.14) {
        const base = dark ? 0.62 : 0.42;
        return Array.from({ length: count }, (_, i) =>
            hsl2hex(h, s, Math.max(0.2, Math.min(0.82, base + (i - 1) * 0.13))),
        );
    }
    const offsets = [0, -46, 40, -92, 84];
    const S = Math.max(0.4, Math.min(0.86, s));
    const L = Math.max(0.34, Math.min(dark ? 0.64 : 0.52, l));
    return Array.from({ length: count }, (_, i) => hsl2hex(h + (offsets[i] ?? i * 54), S, L));
}

// ── Chrome ────────────────────────────────────────────────────────────────────

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

// ── Shared plot helpers ─────────────────────────────────────────────────────────

export const curveFor = (smooth: boolean): CurveFactory =>
    smooth ? curveCatmullRom.alpha(0.5) : curveLinear;

// d3-shape's generators are typed against CanvasRenderingContext2D; our PathSink is the same structural
// slice, so the bridge is a single localized cast at the `.context()` call.
export type Sink = CanvasRenderingContext2D;

// Scatter + bubble share one pair of linear axes. Draws the ticks/gridlines/baseline and returns the
// value→pixel scales the marks plot against (mirrors `cartesianFrame`, but both axes numeric).
export interface NumFrame {
    x: (v: number) => number;
    y: (v: number) => number;
}
export function numericAxes(
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

// Pie + donut share everything but the inner radius. Both use the first series as the slice values and
// the categories as slice labels. Slices are drawn centered at (cx, cy) with canvas angles (0 = top,
// clockwise) — d3.arc() centers at the origin, which would pin the pie to the box's top-left corner.
export function pieLike(donut: boolean) {
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
