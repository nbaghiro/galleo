import { hexA } from "@themes";
import { registerChart, numericAxes } from "./utils";
import type { DatumSpan, NumFrame, PlotCtx, ResolvedChart } from "./utils";

interface BubbleFrame {
    f: NumFrame;
    xs: number[];
    ys: number[];
    n: number;
    r: (i: number) => number;
}

function bubbleFrame(chart: ResolvedChart, ctx: PlotCtx): BubbleFrame | null {
    const xs = chart.series[0]?.points ?? [];
    const ys = chart.series[1]?.points ?? [];
    const sizes = chart.series[2]?.points ?? [];
    const n = Math.min(xs.length, ys.length);
    if (n === 0) return null;
    const f = numericAxes(
        ctx.g,
        ctx.W,
        ctx.H,
        ctx.theme,
        xs.slice(0, n),
        ys.slice(0, n),
        ctx.opts.showGrid,
    );
    const known = sizes.slice(0, n).filter((v) => Number.isFinite(v));
    const sMin = Math.min(...known);
    const sMax = Math.max(...known);
    const rOf = (v: number): number => {
        if (!Number.isFinite(v) || sMax <= sMin) return 12;
        return 4 + ((v - sMin) / (sMax - sMin)) * 18;
    };
    return { f, xs, ys, n, r: (i) => rOf(sizes[i] ?? NaN) };
}

function bubbleDots(chart: ResolvedChart, ctx: PlotCtx): DatumSpan[] {
    const b = bubbleFrame(chart, ctx);
    if (!b) return [];
    const out: DatumSpan[] = [];
    for (let i = 0; i < b.n; i++) {
        const r = b.r(i);
        const cx = b.f.x(b.xs[i]!);
        const cy = b.f.y(b.ys[i]!);
        out.push({
            index: i,
            series: 0,
            value: b.ys[i]!,
            box: { x: cx - r, y: cy - r, w: r * 2, h: r * 2 },
        });
    }
    return out;
}

function drawBubble(chart: ResolvedChart, ctx: PlotCtx): void {
    const { g } = ctx;
    const b = bubbleFrame(chart, ctx);
    if (!b) return;
    const color = ctx.colors(1)[0]!;
    for (let i = 0; i < b.n; i++)
        g.circle(b.f.x(b.xs[i]!), b.f.y(b.ys[i]!), b.r(i), {
            fill: hexA(color, 0.5),
            stroke: color,
            width: 1.5,
        });
}

registerChart({ id: "bubble", label: "Bubble", render: drawBubble, spans: bubbleDots });
