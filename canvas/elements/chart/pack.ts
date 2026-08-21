import type { DrawTextStyle } from "@engine/node";
import { inkOn } from "@themes";
import { hierarchy, pack } from "d3-hierarchy";
import { registerChart, catList, fmt, uiFont } from "./utils";
import type { PlotCtx, ResolvedChart } from "./utils";

interface Leaf {
    name: string;
    value: number;
    children?: Leaf[];
}

function drawPack(chart: ResolvedChart, ctx: PlotCtx): void {
    const { g, W, H, theme } = ctx;
    const points = (chart.series[0]?.points ?? []).map((v) => Math.max(0, v));
    if (!points.some((v) => v > 0)) return;
    const cats = catList(chart);
    const leaves: Leaf[] = points.map((value, i) => ({ name: cats[i] ?? `#${i + 1}`, value }));
    const cols = ctx.colors(leaves.length);
    const root = hierarchy<Leaf>({ name: "", value: 0, children: leaves }).sum((d) => d.value);
    const laid = pack<Leaf>()
        .size([Math.max(1, W), Math.max(1, H)])
        .padding(3)(root);

    laid.leaves().forEach((leaf, i) => {
        const r = leaf.r;
        if (r <= 0) return;
        g.circle(leaf.x, leaf.y, r, { fill: cols[i]! });
        if (r < 20) return;
        const style: DrawTextStyle = {
            fill: inkOn(cols[i]!, theme),
            size: Math.min(12, r * 0.34),
            weight: 600,
            font: uiFont(theme),
            align: "center",
            baseline: "middle",
        };
        const room = Math.max(1, Math.floor((r * 1.7) / ((style.size ?? 11) * 0.56)));
        const name = leaf.data.name;
        const clipped = name.length > room ? `${name.slice(0, Math.max(1, room - 1))}…` : name;
        g.text(clipped, leaf.x, leaf.y - (r < 34 ? 0 : 7), style);
        if (r >= 34)
            g.text(fmt(leaf.value ?? 0), leaf.x, leaf.y + 8, {
                ...style,
                size: Math.min(11, r * 0.3),
                weight: 400,
            });
    });
}

registerChart({ id: "pack", label: "Packed circles", render: drawPack });
