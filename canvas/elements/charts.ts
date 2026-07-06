import type { ControlField, ElementSpec, LayoutCtx } from "@elements/spec";
import type { EngineNode } from "@engine/node";
import { register } from "@elements/spec";
import { fixed, grow } from "@model/geometry";
import { renderChart, chartTypeOptions } from "@canvas/charts/render";
import type { ChartData } from "@canvas/charts/types";
import { barsSkel, bandsSkel, discSkel, dotsSkel, gridSkel } from "./skeletons";

// Controls shared by every chart element (the per-type palette tiles + the hidden back-compat `chart`).
// The Type select lets you morph within the data-compatible family; per-type toggles ride on visibleWhen.
export const CHART_CONTROLS: ControlField[] = [
    { key: "type", label: "Type", control: "select", options: chartTypeOptions() },
    {
        key: "values",
        label: "Data (rows ↵ · points ,)",
        control: "text",
        multiline: true,
        placeholder: "12, 19, 7, 23",
    },
    { key: "categories", label: "Categories (,)", control: "text", placeholder: "Q1, Q2, Q3, Q4" },
    {
        key: "seriesNames",
        label: "Series (,)",
        control: "text",
        placeholder: "This year, Last year",
    },
    {
        key: "palette",
        label: "Palette",
        control: "segmented",
        options: [
            { label: "Accent", value: "ramp" },
            { label: "Multi-hue", value: "categorical" },
        ],
    },
    {
        key: "stacked",
        label: "Stacked",
        control: "toggle",
        visibleWhen: (d) => d.type === "bar" || d.type === "column" || d.type === "area",
    },
    {
        key: "smooth",
        label: "Smooth",
        control: "toggle",
        visibleWhen: (d) => d.type === "line" || d.type === "area",
    },
    {
        key: "showValues",
        label: "Value labels",
        control: "toggle",
        visibleWhen: (d) => d.type === "bar" || d.type === "column" || d.type === "heatmap",
    },
    {
        key: "showGrid",
        label: "Gridlines",
        control: "toggle",
        visibleWhen: (d) =>
            d.type !== "pie" && d.type !== "donut" && d.type !== "gauge" && d.type !== "treemap",
    },
];

function chartSpec(
    typeKey: string,
    label: string,
    chartType: string,
    preset: Partial<ChartData>,
    skeleton: () => EngineNode,
): ElementSpec<ChartData> {
    return {
        type: typeKey,
        label,
        category: "chart",
        tier: "smart",
        create: (): ChartData => ({
            type: chartType,
            values: "12, 19, 7, 23, 16",
            categories: "",
            seriesNames: "",
            palette: "ramp",
            stacked: false,
            smooth: false,
            showValues: false,
            showGrid: true,
            height: 240,
            ...preset,
        }),
        layout: (d: ChartData, ctx: LayoutCtx): EngineNode => ({
            w: grow(),
            h: fixed(d.height ?? 240),
            surface: { paint: (g, box) => renderChart(g, box, d, ctx.theme) },
        }),
        resize: { height: { key: "height", min: 160, max: 460, step: 10 } },
        controls: CHART_CONTROLS,
        skeleton,
    };
}

const barsGhost = (): EngineNode => barsSkel([18, 34, 26, 42, 30]);
const lineGhost = (): EngineNode => barsSkel([16, 22, 20, 30, 38]);

// Each entry is a palette tile: element type key, label, the chart-registry type it renders, realistic
// default data (so a freshly added chart looks populated), and a matching skeleton ghost.
const VARIANTS: {
    key: string;
    label: string;
    type: string;
    preset: Partial<ChartData>;
    skel: () => EngineNode;
}[] = [
    {
        key: "barChart",
        label: "Bar chart",
        type: "bar",
        preset: {
            values: "48, 62, 55, 71\n34, 45, 47, 60",
            categories: "Q1, Q2, Q3, Q4",
            seriesNames: "2024, 2025",
        },
        skel: barsGhost,
    },
    {
        key: "columnChart",
        label: "Column chart",
        type: "column",
        preset: {
            values: "820, 540, 610, 470",
            categories: "North, South, East, West",
            seriesNames: "Units",
        },
        skel: barsGhost,
    },
    {
        key: "lineChart",
        label: "Line chart",
        type: "line",
        preset: {
            values: "120, 180, 240, 310, 420, 560",
            categories: "Jan, Feb, Mar, Apr, May, Jun",
            seriesNames: "MRR ($k)",
        },
        skel: lineGhost,
    },
    {
        key: "areaChart",
        label: "Area chart",
        type: "area",
        preset: {
            values: "12, 19, 28, 41, 58, 79",
            categories: "Jan, Feb, Mar, Apr, May, Jun",
            seriesNames: "Sessions (k)",
        },
        skel: lineGhost,
    },
    {
        key: "pieChart",
        label: "Pie chart",
        type: "pie",
        preset: { values: "42, 26, 18, 14", categories: "Direct, Organic, Referral, Social" },
        skel: discSkel,
    },
    {
        key: "donutChart",
        label: "Donut chart",
        type: "donut",
        preset: { values: "42, 26, 18, 14", categories: "Direct, Organic, Referral, Social" },
        skel: discSkel,
    },
    {
        key: "radarChart",
        label: "Radar chart",
        type: "radar",
        preset: {
            values: "80, 92, 70, 62, 86, 74",
            categories: "Speed, Design, Support, Price, Docs, API",
        },
        skel: discSkel,
    },
    {
        key: "scatterChart",
        label: "Scatter plot",
        type: "scatter",
        preset: { values: "5, 12, 18, 24, 30, 38, 45\n8, 15, 14, 26, 30, 42, 40" },
        skel: dotsSkel,
    },
    {
        key: "bubbleChart",
        label: "Bubble chart",
        type: "bubble",
        preset: { values: "10, 25, 40, 55, 70\n30, 55, 40, 68, 50\n12, 30, 20, 44, 26" },
        skel: dotsSkel,
    },
    {
        key: "funnelChart",
        label: "Funnel chart",
        type: "funnel",
        preset: {
            values: "1200, 680, 340, 120",
            categories: "Visitors, Leads, Trials, Customers",
        },
        skel: () => bandsSkel([1, 0.78, 0.56, 0.36]),
    },
    {
        key: "gaugeChart",
        label: "Gauge",
        type: "gauge",
        preset: { values: "72, 100", categories: "Satisfaction" },
        skel: discSkel,
    },
    {
        key: "heatmapChart",
        label: "Heatmap",
        type: "heatmap",
        preset: {
            values: "3, 8, 5, 9\n6, 2, 7, 4\n8, 5, 3, 6",
            categories: "9a, 12p, 3p, 6p",
            seriesNames: "Mon, Tue, Wed",
        },
        skel: () => gridSkel(3, 4),
    },
    {
        key: "treemapChart",
        label: "Treemap",
        type: "treemap",
        preset: {
            values: "420, 260, 180, 140, 90, 60",
            categories: "Search, Direct, Social, Email, Referral, Ads",
        },
        skel: () => gridSkel(2, 3),
    },
];

VARIANTS.forEach((v) => register(chartSpec(v.key, v.label, v.type, v.preset, v.skel)));

// Back-compat: the original `chart` element (hidden from the palette in the studio) so existing
// artifacts + demo/template content authored as `{ type: "chart", data: { kind, values } }` keep rendering.
register(
    chartSpec(
        "chart",
        "Chart",
        "bar",
        { values: "48, 62, 55, 71", categories: "Q1, Q2, Q3, Q4" },
        barsGhost,
    ),
);
