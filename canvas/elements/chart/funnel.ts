import { luminance } from "@themes";
import { registerChart, catList, fmt, uiFont } from "./utils";
import type { PlotCtx, ResolvedChart } from "./utils";

// Descending funnel stages as centered horizontal bands: each band's top width ∝ its value, its bottom
// width ∝ the next stage, so the shape tapers. Labeled with category + value.
function drawFunnel(chart: ResolvedChart, ctx: PlotCtx): void {
    const { g, W, H, theme } = ctx;
    const vals = (chart.series[0]?.points ?? []).map((v) => Math.max(0, v));
    if (!vals.some((v) => v > 0)) return;
    const cats = catList(chart);
    const cols = ctx.colors(vals.length);
    const max = Math.max(...vals);
    const pad = 12;
    const gap = 3;
    const cx = W / 2;
    const bandH = (H - pad * 2 - gap * (vals.length - 1)) / vals.length;
    const widthOf = (v: number): number => Math.max(2, (v / max) * (W - pad * 2));
    vals.forEach((v, i) => {
        const top = pad + i * (bandH + gap);
        const wTop = widthOf(v) / 2;
        const wBot = widthOf(vals[i + 1] ?? v) / 2;
        g.path(
            (p) => {
                p.moveTo(cx - wTop, top);
                p.lineTo(cx + wTop, top);
                p.lineTo(cx + wBot, top + bandH);
                p.lineTo(cx - wBot, top + bandH);
                p.closePath();
            },
            { fill: cols[i]! },
        );
        g.text(`${cats[i] ?? `#${i + 1}`} · ${fmt(v)}`, cx, top + bandH / 2, {
            fill: luminance(cols[i]!) < 0.5 ? theme.onAccent : theme.ink,
            size: 11,
            weight: 600,
            font: uiFont(theme),
            align: "center",
            baseline: "middle",
        });
    });
}

registerChart({ id: "funnel", label: "Funnel", render: drawFunnel });
