import type { ElementSpec, LayoutCtx } from "@elements/spec";
import type { EngineNode } from "@engine/node";
import type { ElementInstance } from "@model/artifact";
import { register, getElement } from "@elements/spec";
import type { BoxInsets } from "@model/geometry";
import { fit, fixed, grow, percent } from "@model/geometry";
import { hexA } from "@themes";

type Lines = "rows" | "grid" | "none";
type Density = "compact" | "cozy" | "roomy";

interface TableData {
    cols?: number;
    rows?: number;
    header?: boolean;
    lines?: Lines;
    zebra?: boolean;
    density?: Density;
    cells?: ElementInstance[];
    data?: string; // legacy: rows by newline, cells by comma
    clamp?: number;
    widths?: number[]; // per column, percent of the table; absent = each column fits its content
}

const MAX_COLS = 8;
const MAX_ROWS = 20;
const clampInt = (n: number, lo: number, hi: number): number =>
    Math.max(lo, Math.min(hi, Math.round(n) || lo));
const emptyCell = (): ElementInstance => ({ type: "text", data: { text: "", style: "caption" } });
const textCell = (text: string): ElementInstance => ({
    type: "text",
    data: { text, style: "caption" },
});

function parseLegacy(data: string): string[][] {
    return data
        .split("\n")
        .map((r) => r.split(",").map((c) => c.trim()))
        .filter((r) => r.some((c) => c.length > 0));
}

interface Grid {
    cols: number;
    rows: number;
    header: boolean;
    lines: Lines;
    zebra: boolean;
    density: Density;
    clamp?: number; // clamp every text cell to N lines; 0/absent = unbounded
    widths?: number[]; // exactly cols entries summing to 100, or absent
    cells: ElementInstance[]; // exactly rows * cols, row-major
}

// authored widths are kept only while they still describe this column count
const widthsFor = (d: TableData, cols: number): number[] | undefined =>
    Array.isArray(d.widths) && d.widths.length === cols && d.widths.every((w) => w > 0)
        ? d.widths
        : undefined;

function grid(d: TableData): Grid {
    let cols: number;
    let rows: number;
    let cells: ElementInstance[];
    if (Array.isArray(d.cells)) {
        cols = clampInt(d.cols ?? 1, 1, MAX_COLS);
        rows = clampInt(d.rows ?? Math.ceil(d.cells.length / cols), 1, MAX_ROWS);
        cells = d.cells.slice(0, rows * cols);
        while (cells.length < rows * cols) cells.push(emptyCell());
    } else {
        const table = parseLegacy(d.data ?? "");
        cols = clampInt(Math.max(1, ...table.map((r) => r.length)), 1, MAX_COLS);
        rows = clampInt(Math.max(1, table.length), 1, MAX_ROWS);
        cells = [];
        for (let r = 0; r < rows; r++)
            for (let c = 0; c < cols; c++) cells.push(textCell(table[r]?.[c] ?? ""));
    }
    return {
        cols,
        rows,
        cells,
        header: d.header !== false,
        lines: d.lines ?? "rows",
        zebra: !!d.zebra,
        density: d.density ?? "cozy",
        clamp: d.clamp,
        widths: widthsFor(d, cols),
    };
}

// A divider drag between two columns re-splits their combined share; the rest keep theirs. The
// starting shares are the authored ones, else an even split, so the first drag has a baseline.
function resizeColumns(d: TableData, entries: { slot: number; pct: number }[]): TableData {
    const g = grid(d);
    const widths = (g.widths ?? Array.from({ length: g.cols }, () => 100 / g.cols)).map((w) =>
        Math.round(w),
    );
    const touched = new Set<number>();
    for (const e of entries)
        if (e.slot >= 0 && e.slot < widths.length) {
            widths[e.slot] = e.pct;
            touched.add(e.slot);
        }
    // the pair's shares are conserved by the drag; whatever rounding leaves over lands on a column
    // the drag did not touch, so the row still sums to the table
    const rest = widths.map((_, i) => i).filter((i) => !touched.has(i));
    const absorber = rest.length ? rest[rest.length - 1]! : widths.length - 1;
    widths[absorber] = (widths[absorber] ?? 0) + 100 - widths.reduce((a, b) => a + b, 0);
    return { ...d, widths };
}

const PAD: Record<Density, BoxInsets> = {
    compact: { top: 6, bottom: 6, left: 10, right: 10 },
    cozy: { top: 9, bottom: 9, left: 13, right: 13 },
    roomy: { top: 13, bottom: 13, left: 18, right: 18 },
};
const MIN_CELL_TEXT_H = 20; // keep empty cell's text region clickable
const MIN_COL = 56; // a long column may not crush its neighbours out of existence

// One grid of cells rather than a stack of rows, so a column is as wide as its own content across
// every row. That leaves the row chrome per cell: the zebra band is the cell's fill, and a row rule
// is a hairline at the top of each cell in the row (the cells tile, so the rules join up).
// Padding sits on the cell's inner box, not the leaf (a leaf drops its own), so inline-edit stays aligned.
function arrangeTable(g: Grid, ctx: LayoutCtx, kids: EngineNode[]): EngineNode {
    const pad = PAD[g.density];
    const line = ctx.theme.line;
    const gridLines = g.lines === "grid";
    const band = hexA(ctx.theme.ink, 0.05);
    // never floor a column above its even share, or a wide table overflows a phone instead of squeezing
    const minCol = Math.max(1, Math.min(MIN_COL, Math.floor(ctx.availWidth / g.cols)));
    const cell = (k: EngineNode, i: number): EngineNode => {
        const row = Math.floor(i / g.cols);
        const col = i % g.cols;
        // a text cell sizes its column; anything else takes whatever width the column gets
        k.w = k.text ? fit() : grow();
        k.h = fit(MIN_CELL_TEXT_H);
        // table owns row weight/tone so cells read uniformly
        if (k.text) {
            const head = g.header && row === 0;
            k.text.weight = head ? 700 : 400;
            k.text.color = head ? ctx.theme.ink : ctx.theme.soft;
            if (g.clamp && g.clamp > 0) k.text.maxLines = g.clamp;
        }
        const zebra = g.zebra && row % 2 === 1;
        const inner: EngineNode = { w: k.w, h: fit(), padding: pad, children: [k] };
        // an authored width pins the column's track; otherwise the column sizes to its content
        return {
            w: g.widths ? percent(g.widths[col]! / 100) : grow(minCol),
            h: grow(), // every cell takes the row's height, so its band fills the row
            direction: "col",
            alignX: k.text?.align,
            ...(zebra || gridLines
                ? {
                      fill: {
                          ...(zebra ? { color: band } : {}),
                          ...(gridLines ? { border: { color: line, width: 1 } } : {}),
                      },
                  }
                : {}),
            children:
                row > 0 && g.lines === "rows"
                    ? [{ w: grow(), h: fixed(1), fill: { color: line } }, inner]
                    : [inner],
        };
    };
    return {
        w: grow(),
        h: fit(),
        direction: "grid",
        columns: g.cols,
        fill: {
            color: ctx.theme.surface,
            radius: Math.round(ctx.theme.radius / 2),
            ...(g.lines === "none" ? {} : { border: { color: line, width: 1 } }),
        },
        children: kids.map(cell),
    };
}

function composeCells(cells: ElementInstance[], ctx: LayoutCtx): EngineNode[] {
    return cells.map((inst): EngineNode => {
        const spec = getElement(inst.type);
        return spec ? spec.layout(inst.data, ctx) : { w: grow(), h: fit(10) };
    });
}

export const tableElement: ElementSpec<TableData> = {
    type: "table",
    label: "Table",
    category: "table",
    tier: "unit",
    create: () => ({
        cols: 3,
        rows: 4,
        header: true,
        lines: "rows",
        zebra: false,
        density: "cozy",
        cells: [
            "Plan",
            "Price",
            "Seats",
            "Starter",
            "Free",
            "1",
            "Pro",
            "$20",
            "5",
            "Team",
            "$50",
            "20",
        ].map(textCell),
    }),
    layout: (d, ctx) => {
        const g = grid(d);
        return arrangeTable(g, ctx, composeCells(g.cells, ctx));
    },
    container: {
        children: (d) => grid(d).cells,
        arrange: (d, ctx, kids) => arrangeTable(grid(d), ctx, kids),
        withChildren: (d, cells) => {
            const g = grid(d);
            return {
                cols: g.cols,
                rows: g.rows,
                header: g.header,
                lines: g.lines,
                zebra: g.zebra,
                density: g.density,
                ...(g.clamp !== undefined ? { clamp: g.clamp } : {}),
                ...(g.widths ? { widths: g.widths } : {}),
                cells,
            };
        },
        closed: true,
        // a column is a slot: its cells fold into one box, and the divider between two columns
        // writes their widths
        slots: (d) => ({
            of: (i) => i % grid(d).cols,
            resize: (entries) => resizeColumns(d, entries),
        }),
    },
    controls: [
        { key: "rows", label: "Rows", control: "slider", min: 1, max: MAX_ROWS, step: 1 },
        { key: "cols", label: "Columns", control: "slider", min: 1, max: MAX_COLS, step: 1 },
        { key: "header", label: "Header row", control: "toggle", icon: "row" },
        {
            key: "lines",
            label: "Lines",
            control: "segmented",
            icon: "grid",
            options: [
                { label: "Rows", value: "rows" },
                { label: "Grid", value: "grid" },
                { label: "None", value: "none" },
            ],
        },
        { key: "zebra", label: "Zebra rows", control: "toggle", icon: "stack" },
        { key: "clamp", label: "Clamp cells", control: "slider", min: 0, max: 4, step: 1 },
        {
            key: "density",
            label: "Density",
            control: "segmented",
            options: [
                { label: "Compact", value: "compact" },
                { label: "Cozy", value: "cozy" },
                { label: "Roomy", value: "roomy" },
            ],
        },
    ],
    bar: ["header", "lines", "zebra"],
    frame: true,
};

register(tableElement);
