import { normalize as normalizeChart, catList } from "@elements/chart/utils";
import { formatItems, normalizeDiagram } from "@elements/diagram/utils";
import { toChartData } from "@elements/chart/utils";
import { toDiagramData, type DiagItem, type DiagItemMeta } from "@elements/diagram/utils";

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
    steps: "list",
    cycle: "list",
    pyramid: "list",
    funnel: "list",
    timeline: "list",
    quadrant: "list",
    matrix: "list",
    hub: "list",
    org: "hierarchy",
};

// `category` disambiguates the funnel collision (funnel chart = label→value, funnel diagram = list).
export function dataShapeFor(category: string, type: string): Shape | undefined {
    if (category === "chart") return CHART_SHAPE[type] ?? "series";
    if (category === "diagram") return DIAGRAM_SHAPE[type] ?? "list";
    return undefined;
}

// Each model carries its own `shape`, so DataModel is a discriminated union and serializeModel
// narrows without asserting. Before this, the shape arrived as a sibling argument and every branch
// cast: correct only while the caller kept the two in step, which nothing checked.
// cells stay strings (parsed on serialize) so inputs don't fight numeric coercion mid-keystroke
export interface SeriesModel {
    shape: "series";
    categories: string[];
    series: { name: string; values: string[] }[];
}
export interface KvModel {
    shape: "labelValue";
    items: { label: string; value: string }[];
}
export interface PointsModel {
    shape: "points";
    dims: number; // 2 = scatter (X,Y), 3 = bubble (X,Y,Size)
    points: { x: string; y: string; size: string }[];
}
export interface MatrixModel {
    shape: "matrix";
    rows: string[];
    cols: string[];
    cells: string[][];
}
export interface ScalarModel {
    shape: "scalar";
    value: string;
    max: string;
}
export interface ListModel {
    shape: "list";
    // rows carry their styling meta, so grid row ops (insert/remove) can never misalign it
    items: {
        label: string;
        body: string;
        value: string;
        icon: string; // ICON_LIBRARY key, "" = none
        color: string; // hex override, "" = auto ramp
        emphasis: boolean;
    }[];
}
export interface HierModel {
    shape: "hierarchy";
    // rows mirror ListModel (body/value/meta carried) so a hierarchy edit is lossless too
    nodes: {
        label: string;
        body: string;
        value: string; // carried through, not surfaced: org reads no item values today
        parent: string;
        icon: string;
        color: string;
        emphasis: boolean;
    }[];
}
export interface GraphModel {
    shape: "graph";
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
        const r = normalizeChart(toChartData(data));
        const cats = catList(r);
        if (shape === "labelValue") {
            const pts = r.series[0]?.points ?? [];
            return {
                shape: "labelValue",
                items: cats.map((label, i) => ({ label, value: s(pts[i] ?? 0) })),
            };
        }
        if (shape === "points") {
            const xs = r.series[0]?.points ?? [];
            const ys = r.series[1]?.points ?? [];
            const zs = r.series[2]?.points ?? [];
            const n = Math.max(1, xs.length, ys.length);
            return {
                shape: "points",
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
                shape: "matrix",
                rows: r.series.map((x) => x.name),
                cols: cats,
                cells: r.series.map((x) => cats.map((_, i) => s(x.points[i] ?? 0))),
            };
        }
        if (shape === "scalar") {
            const p = r.series[0]?.points ?? [];
            return { shape: "scalar", value: s(p[0] ?? 0), max: s(p[1] ?? 100) };
        }
        return {
            shape: "series",
            categories: cats,
            series: r.series.map((x) => ({
                name: x.name,
                values: cats.map((_, i) => s(x.points[i] ?? 0)),
            })),
        };
    }
    const r = normalizeDiagram(toDiagramData(data));
    if (shape === "hierarchy") {
        const parentOf: Record<string, string> = {};
        r.edges.forEach((e) => (parentOf[e.to] = e.from));
        return {
            shape: "hierarchy",
            nodes: r.items.map((i) => ({
                label: i.label,
                body: i.body ?? "",
                value: i.value === undefined ? "" : String(i.value),
                parent: parentOf[i.label] ?? "",
                icon: i.icon ?? "",
                color: i.color ?? "",
                emphasis: i.emphasis ?? false,
            })),
        };
    }
    if (shape === "graph") {
        return {
            shape: "graph",
            nodes: r.nodes.map((n) => n.label),
            edges: r.edges.map((e) => ({ from: e.from, to: e.to, label: e.label ?? "" })),
        };
    }
    return {
        shape: "list",
        items: r.items.map((i) => ({
            label: i.label,
            body: i.body ?? "",
            value: i.value === undefined ? "" : String(i.value),
            icon: i.icon ?? "",
            color: i.color ?? "",
            emphasis: i.emphasis ?? false,
        })),
    };
}

export function serializeModel(kind: Kind, m: DataModel): Record<string, unknown> {
    if (kind === "chart") {
        if (m.shape === "labelValue") {
            return {
                values: m.items.map((i) => i.value).join(", "),
                categories: m.items.map((i) => i.label).join(", "),
                seriesNames: "",
            };
        }
        if (m.shape === "points") {
            const rows = [m.points.map((p) => p.x).join(", "), m.points.map((p) => p.y).join(", ")];
            if (m.dims === 3) rows.push(m.points.map((p) => p.size).join(", "));
            return { values: rows.join("\n"), categories: "", seriesNames: "" };
        }
        if (m.shape === "matrix") {
            return {
                values: m.cells.map((r) => r.join(", ")).join("\n"),
                categories: m.cols.join(", "),
                seriesNames: m.rows.join(", "),
            };
        }
        if (m.shape === "scalar") {
            return { values: `${m.value}, ${m.max}`, categories: "", seriesNames: "" };
        }
        if (m.shape !== "series") return {};
        return {
            values: m.series.map((r) => r.values.join(", ")).join("\n"),
            categories: m.categories.join(", "),
            seriesNames: m.series.map((r) => r.name).join(", "),
        };
    }
    if (m.shape === "hierarchy") {
        return {
            items: formatItems(m.nodes.map(toDiagItem)),
            links: m.nodes
                .filter((n) => n.parent)
                .map((n) => `${n.parent}>${n.label}`)
                .join(", "),
            itemsMeta: metaOf(m.nodes),
        };
    }
    if (m.shape === "graph") {
        return {
            items: m.nodes.join(", "),
            links: m.edges
                .map((e) => (e.label ? `${e.from}->${e.to}:${e.label}` : `${e.from}->${e.to}`))
                .join(", "),
        };
    }
    if (m.shape !== "list") return {};
    return { items: formatItems(m.items.map(toDiagItem)), itemsMeta: metaOf(m.items) };
}

function toDiagItem(row: { label: string; body: string; value: string }): DiagItem {
    const n = parseFloat(row.value);
    return {
        label: row.label,
        body: row.body || undefined,
        value: Number.isFinite(n) ? n : undefined,
    };
}

// positional meta from grid rows; undefined when nothing is styled — the key is still written, so
// an all-empty grid clears stale meta instead of leaving it behind
function metaOf(
    rows: { icon: string; color: string; emphasis: boolean }[],
): DiagItemMeta[] | undefined {
    const meta: DiagItemMeta[] = rows.map((i) => ({
        ...(i.color ? { color: i.color } : {}),
        ...(i.emphasis ? { emphasis: true } : {}),
        ...(i.icon ? { icon: i.icon } : {}),
    }));
    return meta.some((x) => Object.keys(x).length > 0) ? meta : undefined;
}

// removing a node splices it out of the chain: its children report to its parent
export function removeHierNode(m: HierModel, i: number): void {
    const removed = m.nodes[i];
    if (!removed) return;
    m.nodes.splice(i, 1);
    m.nodes.forEach((n) => {
        if (n.parent === removed.label) n.parent = removed.parent;
    });
}

// the grid owns these; hidden from the inspector so the two don't duplicate
export const DATA_KEYS = new Set(["values", "categories", "seriesNames", "items", "links"]);

// Empty = 0 (valid); non-empty non-finite = invalid.
export function invalidNumber(v: string): boolean {
    const t = v.trim();
    return t !== "" && !Number.isFinite(Number(t));
}

// quadrant is exactly 4 cells; extra rows are ignored
const ITEM_LIMIT: Record<string, number> = { quadrant: 4 };
export function itemLimit(kind: Kind, type: string): number | undefined {
    return kind === "diagram" ? ITEM_LIMIT[type] : undefined;
}
export function limitNote(type: string): string {
    if (type === "quadrant") return "A quadrant uses the first 4 items, one per quadrant.";
    return "";
}

// list entries here carry a numeric weight (band size, lane span, milestone marker)
const VALUED = new Set(["funnel", "pyramid"]);
export const usesItemValue = (kind: Kind, type: string): boolean =>
    kind === "diagram" && VALUED.has(type);
