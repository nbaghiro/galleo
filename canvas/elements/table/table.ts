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
    cells: ElementInstance[]; // exactly rows * cols, row-major
}

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
        header: !!d.header,
        lines: d.lines ?? "rows",
        zebra: !!d.zebra,
        density: d.density ?? "cozy",
    };
}

const PAD: Record<Density, BoxInsets> = {
    compact: { top: 6, bottom: 6, left: 10, right: 10 },
    cozy: { top: 9, bottom: 9, left: 13, right: 13 },
    roomy: { top: 13, bottom: 13, left: 18, right: 18 },
};
const MIN_CELL_TEXT_H = 20; // keep empty cell's text region clickable

// padding lives on the wrapper, not the text leaf (a leaf drops its own padding) so inline-edit stays aligned
function arrangeTable(g: Grid, ctx: LayoutCtx, kids: EngineNode[]): EngineNode {
    const pad = PAD[g.density];
    const line = ctx.theme.line;
    const gridLines = g.lines === "grid";
    const cell = (k: EngineNode, row: number): EngineNode => {
        k.w = grow();
        k.h = fit(MIN_CELL_TEXT_H);
        // table owns row weight/tone so cells read uniformly
        if (k.text) {
            const head = g.header && row === 0;
            k.text.weight = head ? 700 : 400;
            k.text.color = head ? ctx.theme.ink : ctx.theme.soft;
        }
        return {
            w: percent(1 / g.cols),
            h: fit(),
            padding: pad,
            ...(gridLines ? { fill: { border: { color: line, width: 1 } } } : {}),
            children: [k],
        };
    };
    const children: EngineNode[] = [];
    for (let r = 0; r < g.rows; r++) {
        if (r > 0 && g.lines === "rows")
            children.push({ w: grow(), h: fixed(1), fill: { color: line } });
        const rowCells = kids.slice(r * g.cols, r * g.cols + g.cols).map((k) => cell(k, r));
        children.push({
            w: grow(),
            h: fit(),
            direction: "row",
            ...(g.zebra && r % 2 === 1 ? { fill: { color: hexA(ctx.theme.ink, 0.05) } } : {}),
            children: rowCells,
        });
    }
    return {
        w: grow(),
        h: fit(),
        direction: "col",
        fill: {
            color: ctx.theme.surface,
            radius: Math.round(ctx.theme.radius / 2),
            ...(g.lines === "none" ? {} : { border: { color: line, width: 1 } }),
        },
        children,
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
    tier: "smart",
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
                cells,
            };
        },
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
};

register(tableElement);
