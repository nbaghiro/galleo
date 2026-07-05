import type { ElementSpec, LayoutCtx } from "@elements/spec";
import type { DrawContext, EngineNode, Rect } from "@engine/node";
import type { Tokens } from "@themes/theme";
import { register, GHOST, getElement } from "@elements/spec";
import { fit, fixed, grow, percent } from "@model/size";
import { hexA, fontStack } from "@themes/theme";

type ChartKind = "bar" | "line" | "pie";

interface ChartData {
    kind: ChartKind;
    values: string; // comma-separated numbers (a grid data-editor comes later)
    height?: number;
}

function nums(values: string): number[] {
    return values
        .split(",")
        .map((s) => parseFloat(s.trim()))
        .filter((n) => Number.isFinite(n));
}

function drawChart(g: DrawContext, box: Rect, d: ChartData, t: Tokens): void {
    const data = nums(d.values);
    if (data.length === 0) return;
    const pad = 22;
    const x0 = pad;
    const y0 = pad;
    const w = Math.max(1, box.w - pad * 2);
    const h = Math.max(1, box.h - pad * 2);

    if (d.kind === "pie") {
        const total = data.reduce((a, b) => a + b, 0) || 1;
        const cx = box.w / 2;
        const cy = box.h / 2;
        const r = Math.min(box.w, box.h) / 2 - pad;
        let a = -Math.PI / 2;
        data.forEach((v, i) => {
            const slice = (v / total) * Math.PI * 2;
            g.wedge(cx, cy, r, a, a + slice, {
                fill: hexA(t.accent, Math.max(0.32, 1 - i * 0.16)),
            });
            a += slice;
        });
        return;
    }

    const max = Math.max(...data, 1);
    g.line(x0, y0 + h, x0 + w, y0 + h, { stroke: t.line, width: 1 }); // baseline

    if (d.kind === "bar") {
        const n = data.length;
        const gap = Math.min(14, w / (n * 3));
        const bw = (w - gap * (n - 1)) / n;
        data.forEach((v, i) => {
            const bh = (v / max) * h;
            g.rect(x0 + i * (bw + gap), y0 + h - bh, bw, bh, {
                fill: t.accent,
                radius: Math.min(6, bw / 3),
            });
        });
    } else {
        const n = data.length;
        const step = n > 1 ? w / (n - 1) : 0;
        const pts = data.map((v, i): [number, number] => [x0 + i * step, y0 + h - (v / max) * h]);
        const area: [number, number][] = [[x0, y0 + h], ...pts, [x0 + w, y0 + h]];
        g.polyline(area, { fill: hexA(t.accent, 0.12) });
        g.polyline(pts, { stroke: t.accent, width: 2.5 });
        pts.forEach((p) =>
            g.circle(p[0], p[1], 3.5, { fill: t.surface, stroke: t.accent, width: 2 }),
        );
    }
}

export const chartElement: ElementSpec<ChartData> = {
    type: "chart",
    label: "Chart",
    category: "data",
    tier: "smart",
    create: () => ({ kind: "bar", values: "12, 19, 7, 23, 16", height: 240 }),
    layout: (d: ChartData, ctx: LayoutCtx): EngineNode => ({
        w: grow(),
        h: fixed(d.height ?? 240),
        surface: { paint: (g, box) => drawChart(g, box, d, ctx.theme) },
    }),
    resize: { height: { key: "height", min: 160, max: 420, step: 10 } },
    controls: [
        {
            key: "kind",
            label: "Type",
            control: "segmented",
            options: [
                { label: "Bar", value: "bar" },
                { label: "Line", value: "line" },
                { label: "Pie", value: "pie" },
            ],
        },
        { key: "values", label: "Values", control: "text", placeholder: "12, 19, 7, 23" },
    ],
    skeleton: (): EngineNode => ({
        w: grow(),
        h: fit(),
        direction: "row",
        gap: 7,
        alignY: "end",
        padding: { top: 8, right: 10, bottom: 8, left: 10 },
        children: [18, 34, 26, 42, 30].map(
            (bh): EngineNode => ({ w: grow(), h: fixed(bh), fill: { color: GHOST, radius: 3 } }),
        ),
    }),
};

register(chartElement);

type DiagramKind = "process" | "pyramid" | "funnel" | "cycle";

interface DiagramData {
    kind: DiagramKind;
    items: string;
    height?: number;
}

const SANS = "system-ui, -apple-system, sans-serif";

function items(s: string): string[] {
    return s
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean);
}

function draw(g: DrawContext, box: Rect, d: DiagramData, t: Tokens): void {
    const its = items(d.items);
    const n = its.length;
    if (n === 0) return;
    const pad = 18;

    if (d.kind === "process") {
        const gap = 16;
        const bw = (box.w - pad * 2 - gap * (n - 1)) / n;
        const bh = Math.min(box.h - pad * 2, 96);
        const y = (box.h - bh) / 2;
        its.forEach((label, i) => {
            const x = pad + i * (bw + gap);
            g.rect(x, y, bw, bh, { fill: t.surface, stroke: t.accent, width: 1.5, radius: 10 });
            g.text(label, x + bw / 2, y + bh / 2, {
                fill: t.ink,
                size: 14,
                weight: 600,
                font: SANS,
                align: "center",
                baseline: "middle",
            });
            if (i < n - 1)
                g.line(x + bw + 3, box.h / 2, x + bw + gap - 3, box.h / 2, {
                    stroke: t.accent,
                    width: 2,
                });
        });
        return;
    }

    if (d.kind === "pyramid" || d.kind === "funnel") {
        const rh = Math.min((box.h - pad * 2) / n, 58);
        const top = pad + (box.h - pad * 2 - rh * n) / 2;
        its.forEach((label, i) => {
            const frac = d.kind === "pyramid" ? (i + 1) / n : (n - i) / n;
            const w = (box.w - pad * 2) * Math.max(0.18, frac);
            const x = box.w / 2 - w / 2;
            const y = top + i * rh;
            const filled = i % 2 === 1;
            g.rect(x, y + 3, w, rh - 6, {
                fill: filled ? t.accent : t.surface,
                stroke: t.accent,
                width: 1.5,
                radius: 8,
            });
            g.text(label, box.w / 2, y + rh / 2, {
                fill: filled ? t.onAccent : t.ink,
                size: 13,
                weight: 600,
                font: SANS,
                align: "center",
                baseline: "middle",
            });
        });
        return;
    }

    // cycle — nodes around a ring
    const cx = box.w / 2;
    const cy = box.h / 2;
    const ring = Math.min(box.w, box.h) / 2 - pad - 20;
    const r = Math.min(40, ring * 0.55);
    its.forEach((label, i) => {
        const a = -Math.PI / 2 + (i / n) * Math.PI * 2;
        const x = cx + Math.cos(a) * ring;
        const y = cy + Math.sin(a) * ring;
        g.circle(x, y, r, { fill: t.surface, stroke: t.accent, width: 1.5 });
        g.text(label, x, y, {
            fill: t.ink,
            size: 12,
            weight: 600,
            font: SANS,
            align: "center",
            baseline: "middle",
        });
    });
}

export const diagramElement: ElementSpec<DiagramData> = {
    type: "diagram",
    label: "Diagram",
    category: "data",
    tier: "smart",
    create: () => ({ kind: "process", items: "Discover, Design, Build, Ship", height: 200 }),
    layout: (d: DiagramData, ctx: LayoutCtx): EngineNode => ({
        w: grow(),
        h: fixed(d.height ?? 200),
        surface: { paint: (g, box) => draw(g, box, d, ctx.theme) },
    }),
    resize: { height: { key: "height", min: 140, max: 420, step: 10 } },
    controls: [
        {
            key: "kind",
            label: "Type",
            control: "segmented",
            options: [
                { label: "Process", value: "process" },
                { label: "Pyramid", value: "pyramid" },
                { label: "Funnel", value: "funnel" },
                { label: "Cycle", value: "cycle" },
            ],
        },
        { key: "items", label: "Steps (comma-sep)", control: "text", placeholder: "A, B, C" },
    ],
    skeleton: (): EngineNode => ({
        w: grow(),
        h: fixed(52),
        direction: "row",
        gap: 10,
        alignY: "center",
        padding: { top: 8, right: 10, bottom: 8, left: 10 },
        children: [0, 1, 2].map(
            (): EngineNode => ({ w: grow(), h: fixed(30), fill: { color: GHOST, radius: 6 } }),
        ),
    }),
};

register(diagramElement);

interface TableData {
    data: string; // rows by newline, cells by comma (a grid data-editor comes later)
    header?: boolean;
}

function parse(data: string): string[][] {
    return data
        .split("\n")
        .map((r) => r.split(",").map((c) => c.trim()))
        .filter((r) => r.some((c) => c.length > 0));
}

export const tableElement: ElementSpec<TableData> = {
    type: "table",
    label: "Table",
    category: "data",
    tier: "smart",
    create: () => ({
        data: "Plan,Price,Seats\nStarter,Free,1\nPro,$20,5\nTeam,$50,20",
        header: true,
    }),
    layout: (d: TableData, ctx: LayoutCtx): EngineNode => {
        const rows = parse(d.data);
        const cols = Math.max(1, ...rows.map((r) => r.length));
        const cell = (text: string, head: boolean): EngineNode => ({
            w: percent(1 / cols),
            h: fit(),
            padding: { top: 9, bottom: 9, left: 13, right: 13 },
            children: [
                {
                    w: grow(),
                    h: fit(),
                    text: {
                        text,
                        fontId: fontStack("ui", ctx.theme),
                        size: 14,
                        weight: head ? 700 : 400,
                        color: head ? ctx.theme.ink : ctx.theme.soft,
                        align: "start",
                        wrap: "words",
                    },
                },
            ],
        });
        const children: EngineNode[] = [];
        rows.forEach((row, ri) => {
            const head = !!d.header && ri === 0;
            if (ri > 0) children.push({ w: grow(), h: fixed(1), fill: { color: ctx.theme.line } });
            children.push({
                w: grow(),
                h: fit(),
                direction: "row",
                children: Array.from({ length: cols }, (_, ci) => cell(row[ci] ?? "", head)),
            });
        });
        return {
            w: grow(),
            h: fit(),
            direction: "col",
            fill: {
                color: ctx.theme.surface,
                radius: Math.round(ctx.theme.radius / 2),
                border: { color: ctx.theme.line, width: 1 },
            },
            children,
        };
    },
    controls: [
        {
            key: "data",
            label: "Cells (rows ↵ · cols ,)",
            control: "text",
            multiline: true,
            placeholder: "A,B\n1,2",
        },
        { key: "header", label: "Header row", control: "toggle" },
    ],
};

register(tableElement);
import type { ElementInstance } from "@model/artifact";

// A stat is a value + caption — both real text children, so each is independently selectable/editable.
interface StatData {
    children: ElementInstance[];
}

const arrange = (_d: StatData, _ctx: LayoutCtx, kids: EngineNode[]): EngineNode => ({
    w: grow(),
    h: fit(),
    direction: "col",
    gap: 6,
    children: kids,
});

function compose(d: StatData, ctx: LayoutCtx): EngineNode[] {
    return d.children.map((inst): EngineNode => {
        const spec = getElement(inst.type);
        return spec ? spec.layout(inst.data, ctx) : { w: grow(), h: fit(10) };
    });
}

export const statElement: ElementSpec<StatData> = {
    type: "stat",
    label: "Stat",
    category: "data",
    tier: "smart",
    create: () => ({
        children: [
            { type: "text", data: { text: "30s", style: "h1" } },
            { type: "text", data: { text: "prompt → first draft", style: "caption" } },
        ],
    }),
    layout: (d, ctx) => arrange(d, ctx, compose(d, ctx)),
    container: {
        children: (d) => d.children,
        arrange,
        withChildren: (d, children) => ({ ...d, children }),
    },
    controls: [],
};

register(statElement);
