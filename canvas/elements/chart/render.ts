// side-effect imports register each chart type
import "./bar";
import "./line";
import "./area";
import "./pie";
import "./donut";
import "./radar";
import "./column";
import "./scatter";
import "./bubble";
import "./gauge";
import "./heatmap";
import "./treemap";
import "./waterfall";
import "./pack";
import "./progress";

import type { DrawContext, MeasureText, Rect } from "@engine/node";
import type { Tokens } from "@themes";
import type { DatumSpan, PlotCtx, ResolvedChart } from "./utils";
import { normalize, getChart, probeContext, seriesColors, toChartData } from "./utils";

// element data is untyped at runtime (hand-edited JSON, a half-streamed AI element), so narrow it here
function resolve(
    data: unknown,
): { chart: ResolvedChart; type: NonNullable<ReturnType<typeof getChart>> } | null {
    const chart = normalize(toChartData(data));
    if (!chart.series.some((s) => s.points.length > 0)) return null;
    const type = getChart(chart.type) ?? getChart("bar");
    return type ? { chart, type } : null;
}

const plotCtx = (g: DrawContext, box: Rect, chart: ResolvedChart, theme: Tokens): PlotCtx => ({
    g,
    W: box.w,
    H: box.h,
    theme,
    opts: chart.options,
    colors: (n) => seriesColors(theme, n),
});

export function renderChart(g: DrawContext, box: Rect, data: unknown, theme: Tokens): void {
    const r = resolve(data);
    if (!r) return;
    r.type.render(r.chart, plotCtx(g, box, r.chart, theme));
}

/** The datum geometry behind the same pixels; empty for a type that reports none. */
export function chartSpans(
    box: Rect,
    data: unknown,
    theme: Tokens,
    measure: MeasureText,
): DatumSpan[] {
    const r = resolve(data);
    if (!r?.type.spans) return [];
    return r.type.spans(r.chart, plotCtx(probeContext(measure), box, r.chart, theme));
}

export { chartTypeOptions } from "./utils";
export type { ChartData, DatumSpan } from "./utils";
