import type { ElementSpec, LayoutCtx } from "@elements/element-spec";
import type { DrawContext, EngineNode, Rect } from "@engine/node";
import type { Tokens } from "@themes/theme";
import { register } from "@elements/registry";
import { GHOST } from "@elements/skeleton";
import { fit, fixed, grow } from "@model/size";

type ChartKind = "bar" | "line" | "pie";

interface ChartData {
    kind: ChartKind;
    values: string; // comma-separated numbers (v1 data editor; a grid editor comes later)
    height?: number;
}

function nums(values: string): number[] {
    return values
        .split(",")
        .map((s) => parseFloat(s.trim()))
        .filter((n) => Number.isFinite(n));
}

function hexA(hex: string, a: number): string {
    const h = hex.replace("#", "");
    if (h.length < 6) return hex;
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${a})`;
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
            g.wedge(cx, cy, r, a, a + slice, { fill: hexA(t.accent, Math.max(0.32, 1 - i * 0.16)) });
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
            g.rect(x0 + i * (bw + gap), y0 + h - bh, bw, bh, { fill: t.accent, radius: Math.min(6, bw / 3) });
        });
    } else {
        const n = data.length;
        const step = n > 1 ? w / (n - 1) : 0;
        const pts = data.map((v, i): [number, number] => [x0 + i * step, y0 + h - (v / max) * h]);
        const area: [number, number][] = [[x0, y0 + h], ...pts, [x0 + w, y0 + h]];
        g.polyline(area, { fill: hexA(t.accent, 0.12) });
        g.polyline(pts, { stroke: t.accent, width: 2.5 });
        pts.forEach((p) => g.circle(p[0], p[1], 3.5, { fill: t.surface, stroke: t.accent, width: 2 }));
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
        { key: "height", label: "Height", control: "slider", min: 160, max: 420, step: 10, unit: "px", group: "Frame" },
    ],
    skeleton: (): EngineNode => ({
        w: grow(),
        h: fit(),
        direction: "row",
        gap: 7,
        alignY: "end",
        padding: { top: 8, right: 10, bottom: 8, left: 10 },
        children: [18, 34, 26, 42, 30].map((bh): EngineNode => ({ w: grow(), h: fixed(bh), fill: { color: GHOST, radius: 3 } })),
    }),
};

register(chartElement);
