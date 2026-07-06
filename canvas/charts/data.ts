import type { ChartData, ResolvedChart, Series, PaletteMode } from "./types";

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
