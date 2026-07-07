import type { DrawContext } from "@engine/node";
import type { Tokens } from "@themes/theme";

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
