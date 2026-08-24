import type { DrawContext, DrawTextStyle, MeasureText, Rect } from "@engine/node";
import type { Tokens } from "@themes";
import { accentRamp, fontStack, mix } from "@themes";
import { scaleBand, scaleLinear, scalePoint } from "d3-scale";
import { curveCatmullRom, curveLinear } from "d3-shape";
import type { CurveFactory } from "d3-shape";
import { bool, num, str } from "@elements/coerce";

export interface ChartData {
    type?: string;
    values: string; // series by newline, points by comma
    categories?: string; // comma-separated
    seriesNames?: string; // comma-separated
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
    stacked: boolean;
    smooth: boolean;
    showValues: boolean;
    showGrid: boolean;
}

export interface ResolvedChart {
    type: string;
    series: Series[];
    categories: string[];
    options: ChartOptions;
}

// local-origin size: plots draw from 0,0
export interface PlotCtx {
    g: DrawContext;
    W: number;
    H: number;
    theme: Tokens;
    opts: ChartOptions;
    colors: (n: number) => string[];
}

// One datum's mark, as both the painter and the hit test see it. `index` is the row the data editor
// shows for it (a category for series charts, an item for label/value, a point for scatter), so a
// grouped bar reports one span per series under one index.
export interface DatumSpan {
    index: number;
    series: number;
    value: number;
    box: Rect;
    points?: [number, number][]; // set where a box would lie about the mark (a wedge)
}

export interface ChartType {
    id: string;
    label: string;
    render: (chart: ResolvedChart, ctx: PlotCtx) => void;
    // The same geometry `render` paints, reported rather than drawn. Absent = this type has no
    // addressable datums yet (heatmap cells, radar rings, the single-value gauges).
    spans?: (chart: ResolvedChart, ctx: PlotCtx) => DatumSpan[];
}

// Point marks are a few px across; a hit area that small is unusable, so it floors at cursor size.
export const HIT_R = 9;

export const pointSpan = (
    index: number,
    series: number,
    value: number,
    cx: number,
    cy: number,
    r: number,
): DatumSpan => {
    const hit = Math.max(r, HIT_R);
    return { index, series, value, box: { x: cx - hit, y: cy - hit, w: hit * 2, h: hit * 2 } };
};

export const polyBox = (points: [number, number][]): Rect => {
    const xs = points.map((p) => p[0]);
    const ys = points.map((p) => p[1]);
    const x = Math.min(...xs);
    const y = Math.min(...ys);
    return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
};

// Measurement-only context: the frame helpers paint while they compute, and `spans` wants the
// geometry without the paint. Text metrics come from the engine's own measurer, so the frame a
// span sits in is pixel-identical to the painted one.
export function probeContext(measure: MeasureText): DrawContext {
    const noop = (): void => {};
    return {
        rect: noop,
        line: noop,
        circle: noop,
        polyline: noop,
        wedge: noop,
        path: noop,
        text: noop,
        measureText: (text, s) => ({
            width: measure(
                {
                    text,
                    fontId: s.font ?? "system-ui, sans-serif",
                    size: s.size ?? 12,
                    weight: s.weight ?? 400,
                    wrap: "none",
                },
                Number.POSITIVE_INFINITY,
            ).width,
        }),
    };
}

const registry = new Map<string, ChartType>();

export function registerChart(type: ChartType): void {
    registry.set(type.id, type);
}

export function getChart(id: string): ChartType | undefined {
    return registry.get(id);
}

// in registration order
export function chartTypeOptions(): { label: string; value: string }[] {
    return [...registry.values()].map((t) => ({ label: t.label, value: t.id }));
}

function splitList(s: string | undefined): string[] {
    return (s ?? "")
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean);
}

// a single-line `values` parses to one series
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

export function toChartData(raw: unknown): ChartData {
    const d = (raw ?? {}) as Record<string, unknown>;
    return {
        type: str(d.type),
        values: str(d.values) ?? "",
        categories: str(d.categories),
        seriesNames: str(d.seriesNames),
        stacked: bool(d.stacked),
        smooth: bool(d.smooth),
        showValues: bool(d.showValues),
        showGrid: bool(d.showGrid),
        height: num(d.height),
    };
}

export function normalize(d: ChartData): ResolvedChart {
    const type = d.type ?? "bar";
    return {
        type,
        series: parseSeries(d.values, splitList(d.seriesNames)),
        categories: splitList(d.categories),
        options: {
            stacked: d.stacked ?? false,
            smooth: d.smooth ?? false,
            showValues: d.showValues ?? false,
            showGrid: d.showGrid ?? true,
        },
    };
}

// falls back to 1..n from the longest series when none are authored
export function catList(chart: ResolvedChart): string[] {
    if (chart.categories.length) return chart.categories;
    const n = Math.max(0, ...chart.series.map((s) => s.points.length));
    return Array.from({ length: n }, (_, i) => String(i + 1));
}

// the shared page-aware accent ramp: opaque, so marks can be contrast-tested and take gradients,
// and it recedes toward the page rather than toward white (alpha-fade read as gray mud on a dark
// theme, and vanished entirely for a near-white accent like carbon's)
export function seriesColors(theme: Tokens, n: number): string[] {
    return accentRamp(theme, Math.max(1, n));
}

export const uiFont = (t: Tokens): string => fontStack("ui", t);

export const labelStyle = (theme: Tokens, extra?: Partial<DrawTextStyle>): DrawTextStyle => ({
    fill: theme.muted,
    size: 11,
    font: uiFont(theme),
    ...extra,
});

export const gridColor = (t: Tokens): string => mix(t.line, t.surface, 0.5);

export function fmt(n: number): string {
    const a = Math.abs(n);
    if (a >= 1e6) return `${trim(n / 1e6)}M`;
    if (a >= 1e3) return `${trim(n / 1e3)}k`;
    return trim(n);
}
function trim(n: number): string {
    return String(Math.round(n * 10) / 10);
}

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

// returns the vertical space it consumed
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

export const curveFor = (smooth: boolean): CurveFactory =>
    smooth ? curveCatmullRom.alpha(0.5) : curveLinear;

// d3-shape types against CanvasRenderingContext2D; PathSink is the slice we cast at `.context()`
export type Sink = CanvasRenderingContext2D;

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

interface PieFrame {
    cx: number;
    cy: number;
    R: number;
    rIn: number;
    vals: number[];
    total: number;
    cols: string[];
}

function pieFrame(chart: ResolvedChart, ctx: PlotCtx, donut: boolean): PieFrame | null {
    const { g, W, H, theme } = ctx;
    const vals = (chart.series[0]?.points ?? []).map((v) => Math.max(0, v));
    const total = vals.reduce((s, v) => s + v, 0);
    if (total <= 0) return null;
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
    return { cx, cy, R, rIn: donut ? R * 0.6 : 0, vals, total, cols };
}

// clockwise from 12 o'clock, in the order the values are authored
function wedgeAngles(f: PieFrame): [number, number][] {
    let a = -Math.PI / 2;
    return f.vals.map((v) => {
        const a0 = a;
        a += (v / f.total) * Math.PI * 2;
        return [a0, a];
    });
}

const ARC_STEP = Math.PI / 30; // 6° per segment: close enough to the arc to hit-test against

function arcPoints(cx: number, cy: number, r: number, a0: number, a1: number): [number, number][] {
    const n = Math.max(1, Math.ceil(Math.abs(a1 - a0) / ARC_STEP));
    const out: [number, number][] = [];
    for (let i = 0; i <= n; i++) {
        const a = a0 + ((a1 - a0) * i) / n;
        out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
    }
    return out;
}

// a wedge's bbox covers most of a quadrant, so this is the one family a rect would badly misreport
export function pieSpans(donut: boolean) {
    return (chart: ResolvedChart, ctx: PlotCtx): DatumSpan[] => {
        const f = pieFrame(chart, ctx, donut);
        if (!f) return [];
        return wedgeAngles(f).map(([a0, a1], i) => {
            const outer = arcPoints(f.cx, f.cy, f.R, a0, a1);
            const points: [number, number][] = donut
                ? [...outer, ...arcPoints(f.cx, f.cy, f.rIn, a1, a0)]
                : [...outer, [f.cx, f.cy]];
            return { index: i, series: 0, value: f.vals[i] ?? 0, box: polyBox(points), points };
        });
    };
}

// drawn manually: d3.arc() centers at the origin, which would pin the pie to the top-left
export function pieLike(donut: boolean) {
    return (chart: ResolvedChart, ctx: PlotCtx): void => {
        const { g, theme } = ctx;
        const f = pieFrame(chart, ctx, donut);
        if (!f) return;
        const { cx, cy, R, rIn } = f;
        const style = (i: number) => ({ fill: f.cols[i]!, stroke: theme.surface, width: 1.5 });

        wedgeAngles(f).forEach(([a0, a1], i) => {
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
            g.text(fmt(f.total), cx, cy, {
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
