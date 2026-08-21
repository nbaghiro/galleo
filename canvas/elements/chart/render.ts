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

import type { DrawContext, Rect } from "@engine/node";
import type { Tokens } from "@themes";
import { normalize, getChart, seriesColors, toChartData } from "./utils";

// element data is untyped at runtime (hand-edited JSON, a half-streamed AI element), so narrow it here
export function renderChart(g: DrawContext, box: Rect, data: unknown, theme: Tokens): void {
    const chart = normalize(toChartData(data));
    if (!chart.series.some((s) => s.points.length > 0)) return;
    const type = getChart(chart.type) ?? getChart("bar");
    if (!type) return;
    type.render(chart, {
        g,
        W: box.w,
        H: box.h,
        theme,
        opts: chart.options,
        colors: (n) => seriesColors(theme, n),
    });
}

export { chartTypeOptions } from "./utils";
export type { ChartData } from "./utils";
