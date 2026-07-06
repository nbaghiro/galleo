// Chart rendering entry point. Importing this registers every chart type (via the grouped modules
// below) and exposes the single `renderChart` a surface element paints through — so charts flow through
// the DOM, 2D-canvas, and PDF backends unchanged (they all invoke the same DrawContext).
import "./cartesian";
import "./radial";
import "./more";
import "./treemap";

import type { DrawContext, Rect } from "@engine/node";
import type { Tokens } from "@themes/theme";
import type { ChartData } from "./types";
import { normalize } from "./data";
import { getChart } from "./registry";
import { seriesColors } from "./palette";

export function renderChart(g: DrawContext, box: Rect, data: ChartData, theme: Tokens): void {
    const chart = normalize(data);
    if (!chart.series.some((s) => s.points.length > 0)) return;
    const type = getChart(chart.type) ?? getChart("bar");
    if (!type) return;
    type.render(chart, {
        g,
        W: box.w,
        H: box.h,
        theme,
        opts: chart.options,
        colors: (n) => seriesColors(theme, n, chart.options.palette),
    });
}

export { chartTypeOptions } from "./registry";
export type { ChartData } from "./types";
