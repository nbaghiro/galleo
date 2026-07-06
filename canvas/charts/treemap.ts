import type { DrawTextStyle } from "@engine/node";
import { hierarchy, treemap } from "d3-hierarchy";
import { registerChart } from "./registry";
import { fmt, uiFont } from "./chrome";
import { catList } from "./data";
import type { PlotCtx, ResolvedChart } from "./types";

// d3-hierarchy's data is any-shaped; typing the leaf datum keeps the layout free of `any` casts.
interface Leaf {
    name: string;
    value: number;
    children?: Leaf[];
}

// A single-level treemap: leaves = series[0] points (labels from the categories), each sized by value and
// packed into the box. Cells get a palette color and, when large enough, a clipped label + value.
function drawTreemap(chart: ResolvedChart, ctx: PlotCtx): void {
    const { g, W, H, theme } = ctx;
    const points = (chart.series[0]?.points ?? []).map((v) => Math.max(0, v));
    if (!points.some((v) => v > 0)) return;
    const cats = catList(chart);
    const leaves: Leaf[] = points.map((value, i) => ({ name: cats[i] ?? `#${i + 1}`, value }));
    const cols = ctx.colors(leaves.length);
    const root = hierarchy<Leaf>({ name: "", value: 0, children: leaves }).sum((d) => d.value);
    const laid = treemap<Leaf>()
        .size([Math.max(1, W), Math.max(1, H)])
        .padding(2)(root);
    laid.leaves().forEach((leaf, i) => {
        const w = leaf.x1 - leaf.x0;
        const h = leaf.y1 - leaf.y0;
        if (w <= 0 || h <= 0) return;
        g.rect(leaf.x0, leaf.y0, w, h, { fill: cols[i]!, radius: 3 });
        if (w < 46 || h < 24) return;
        const style: DrawTextStyle = {
            fill: theme.onAccent,
            size: 11,
            weight: 600,
            font: uiFont(theme),
            align: "start",
            baseline: "top",
        };
        const name = leaf.data.name;
        const room = Math.max(1, Math.floor((w - 12) / 6.2));
        const clipped = name.length > room ? `${name.slice(0, Math.max(1, room - 1))}…` : name;
        g.text(clipped, leaf.x0 + 6, leaf.y0 + 6, style);
        g.text(fmt(leaf.value ?? 0), leaf.x0 + 6, leaf.y0 + 20, {
            ...style,
            size: 10,
            weight: 400,
        });
    });
}

registerChart({ id: "treemap", label: "Treemap", render: drawTreemap });
