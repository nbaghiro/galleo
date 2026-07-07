// Chart-category value-sets — the `data.type` discriminant (which chart is drawn). The render
// implementations live in the canvas chart registry; this is the emittable set, kept in lockstep via the
// drift guard.

export const CHART_TYPES = [
    "bar",
    "column",
    "line",
    "area",
    "pie",
    "donut",
    "radar",
    "scatter",
    "bubble",
    "funnel",
    "gauge",
    "heatmap",
    "treemap",
] as const;
export type ChartType = (typeof CHART_TYPES)[number];
