// Shape taxonomy + parse/serialize for the visual data editor. Every chart/diagram type maps to one of
// a few "data shapes"; the editor renders the matching grid and serializes back to the element's existing
// string fields (values/categories/seriesNames · items/links) — no storage migration, full back-compat.

import { normalize as normalizeChart, catList } from "@elements/chart/utils";
import { normalizeDiagram } from "@elements/diagram/utils";
import type { ChartData } from "@elements/chart/utils";
import type { DiagramData } from "@elements/diagram/utils";

export type Shape =
    | "series"
    | "labelValue"
    | "points"
    | "matrix"
    | "scalar"
    | "list"
    | "hierarchy"
    | "graph";
export type Kind = "chart" | "diagram";

const CHART_SHAPE: Record<string, Shape> = {
    bar: "series",
    column: "series",
    line: "series",
    area: "series",
    radar: "series",
    pie: "labelValue",
    donut: "labelValue",
    funnel: "labelValue",
    treemap: "labelValue",
    scatter: "points",
    bubble: "points",
    heatmap: "matrix",
    gauge: "scalar",
};
const DIAGRAM_SHAPE: Record<string, Shape> = {
    process: "list",
    cycle: "list",
    pyramid: "list",
    funnel: "list",
    timeline: "list",
    venn: "list",
    quadrant: "list",
    matrix: "list",
    tree: "hierarchy",
    org: "hierarchy",
    mindmap: "hierarchy",
    flow: "graph",
};

// The data shape for an element, or undefined if it has no visual data editor. `category` disambiguates
// the funnel collision (a funnel chart is label→value; a funnel diagram is a plain list).
export function dataShapeFor(category: string, type: string): Shape | undefined {
    if (category === "chart") return CHART_SHAPE[type] ?? "series";
    if (category === "diagram") return DIAGRAM_SHAPE[type] ?? "list";
    return undefined;
}

// Models hold every cell as a string (parsed to numbers only on serialize) so text inputs never fight
// numeric coercion mid-keystroke.
export interface SeriesModel {
    categories: string[];
    series: { name: string; values: string[] }[];
}
export interface KvModel {
    items: { label: string; value: string }[];
}
export interface PointsModel {
    dims: number; // 2 = scatter (X,Y), 3 = bubble (X,Y,Size)
    points: { x: string; y: string; size: string }[];
}
export interface MatrixModel {
    rows: string[];
    cols: string[];
    cells: string[][];
}
export interface ScalarModel {
    value: string;
    max: string;
}
export interface ListModel {
    items: string[];
}
export interface HierModel {
    nodes: { label: string; parent: string }[];
}
export interface GraphModel {
    nodes: string[];
    edges: { from: string; to: string; label: string }[];
}
export type DataModel =
    | SeriesModel
    | KvModel
    | PointsModel
    | MatrixModel
    | ScalarModel
    | ListModel
    | HierModel
    | GraphModel;

const s = (n: number): string => String(n);

export function parseModel(kind: Kind, shape: Shape, data: Record<string, unknown>): DataModel {
    if (kind === "chart") {
        const r = normalizeChart(data as unknown as ChartData);
        const cats = catList(r);
        if (shape === "labelValue") {
            const pts = r.series[0]?.points ?? [];
            return { items: cats.map((label, i) => ({ label, value: s(pts[i] ?? 0) })) };
        }
        if (shape === "points") {
            const xs = r.series[0]?.points ?? [];
            const ys = r.series[1]?.points ?? [];
            const zs = r.series[2]?.points ?? [];
            const n = Math.max(1, xs.length, ys.length);
            return {
                dims: data.type === "bubble" ? 3 : 2,
                points: Array.from({ length: n }, (_, i) => ({
                    x: s(xs[i] ?? 0),
                    y: s(ys[i] ?? 0),
                    size: s(zs[i] ?? 0),
                })),
            };
        }
        if (shape === "matrix") {
            return {
                rows: r.series.map((x) => x.name),
                cols: cats,
                cells: r.series.map((x) => cats.map((_, i) => s(x.points[i] ?? 0))),
            };
        }
        if (shape === "scalar") {
            const p = r.series[0]?.points ?? [];
            return { value: s(p[0] ?? 0), max: s(p[1] ?? 100) };
        }
        return {
            categories: cats,
            series: r.series.map((x) => ({
                name: x.name,
                values: cats.map((_, i) => s(x.points[i] ?? 0)),
            })),
        };
    }
    const r = normalizeDiagram(data as unknown as DiagramData);
    if (shape === "hierarchy") {
        const parentOf: Record<string, string> = {};
        r.edges.forEach((e) => (parentOf[e.to] = e.from));
        return { nodes: r.nodes.map((n) => ({ label: n.label, parent: parentOf[n.id] ?? "" })) };
    }
    if (shape === "graph") {
        return {
            nodes: r.nodes.map((n) => n.label),
            edges: r.edges.map((e) => ({ from: e.from, to: e.to, label: e.label ?? "" })),
        };
    }
    return { items: [...r.items] };
}

export function serializeModel(kind: Kind, shape: Shape, m: DataModel): Record<string, unknown> {
    if (kind === "chart") {
        if (shape === "labelValue") {
            const x = m as KvModel;
            return {
                values: x.items.map((i) => i.value).join(", "),
                categories: x.items.map((i) => i.label).join(", "),
                seriesNames: "",
            };
        }
        if (shape === "points") {
            const x = m as PointsModel;
            const rows = [x.points.map((p) => p.x).join(", "), x.points.map((p) => p.y).join(", ")];
            if (x.dims === 3) rows.push(x.points.map((p) => p.size).join(", "));
            return { values: rows.join("\n"), categories: "", seriesNames: "" };
        }
        if (shape === "matrix") {
            const x = m as MatrixModel;
            return {
                values: x.cells.map((r) => r.join(", ")).join("\n"),
                categories: x.cols.join(", "),
                seriesNames: x.rows.join(", "),
            };
        }
        if (shape === "scalar") {
            const x = m as ScalarModel;
            return { values: `${x.value}, ${x.max}`, categories: "", seriesNames: "" };
        }
        const x = m as SeriesModel;
        return {
            values: x.series.map((r) => r.values.join(", ")).join("\n"),
            categories: x.categories.join(", "),
            seriesNames: x.series.map((r) => r.name).join(", "),
        };
    }
    if (shape === "hierarchy") {
        const x = m as HierModel;
        return {
            items: x.nodes.map((n) => n.label).join(", "),
            links: x.nodes
                .filter((n) => n.parent)
                .map((n) => `${n.parent}>${n.label}`)
                .join(", "),
        };
    }
    if (shape === "graph") {
        const x = m as GraphModel;
        return {
            items: x.nodes.join(", "),
            links: x.edges
                .map((e) => (e.label ? `${e.from}->${e.to}:${e.label}` : `${e.from}->${e.to}`))
                .join(", "),
        };
    }
    return { items: (m as ListModel).items.join(", ") };
}

// Data keys the grid owns — hidden from the inspector so the two don't duplicate.
export const DATA_KEYS = new Set(["values", "categories", "seriesNames", "items", "links"]);

// --- validation (against each type's implicit data spec) ---

// A value cell is invalid when it's non-empty but not a finite number (empty = 0, allowed).
export function invalidNumber(v: string): boolean {
    const t = v.trim();
    return t !== "" && !Number.isFinite(Number(t));
}

// Fixed-count shapes: a Venn renders ≤3 sets, a quadrant exactly 4. Extra rows are ignored on render.
const ITEM_LIMIT: Record<string, number> = { venn: 3, quadrant: 4 };
export function itemLimit(kind: Kind, type: string): number | undefined {
    return kind === "diagram" ? ITEM_LIMIT[type] : undefined;
}
export function limitNote(type: string): string {
    if (type === "venn") return "A Venn diagram shows up to 3 sets — extra items are ignored.";
    if (type === "quadrant") return "A quadrant uses the first 4 items, one per quadrant.";
    return "";
}
