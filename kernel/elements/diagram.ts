import type { ElementSpec, LayoutCtx } from "@elements/element-spec";
import type { DrawContext, EngineNode, Rect } from "@engine/node";
import type { Tokens } from "@themes/theme";
import { register } from "@elements/registry";
import { GHOST } from "@elements/skeleton";
import { fixed, grow } from "@model/size";

type DiagramKind = "process" | "pyramid" | "funnel" | "cycle";

interface DiagramData {
    kind: DiagramKind;
    items: string;
    height?: number;
}

const SANS = "system-ui, -apple-system, sans-serif";

function items(s: string): string[] {
    return s.split(",").map((x) => x.trim()).filter(Boolean);
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
            g.text(label, x + bw / 2, y + bh / 2, { fill: t.ink, size: 14, weight: 600, font: SANS, align: "center", baseline: "middle" });
            if (i < n - 1) g.line(x + bw + 3, box.h / 2, x + bw + gap - 3, box.h / 2, { stroke: t.accent, width: 2 });
        });
        return;
    }

    if (d.kind === "pyramid" || d.kind === "funnel") {
        const rh = Math.min((box.h - pad * 2) / n, 58);
        const top = pad + ((box.h - pad * 2) - rh * n) / 2;
        its.forEach((label, i) => {
            const frac = d.kind === "pyramid" ? (i + 1) / n : (n - i) / n;
            const w = (box.w - pad * 2) * Math.max(0.18, frac);
            const x = box.w / 2 - w / 2;
            const y = top + i * rh;
            const filled = i % 2 === 1;
            g.rect(x, y + 3, w, rh - 6, { fill: filled ? t.accent : t.surface, stroke: t.accent, width: 1.5, radius: 8 });
            g.text(label, box.w / 2, y + rh / 2, { fill: filled ? t.onAccent : t.ink, size: 13, weight: 600, font: SANS, align: "center", baseline: "middle" });
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
        g.text(label, x, y, { fill: t.ink, size: 12, weight: 600, font: SANS, align: "center", baseline: "middle" });
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
        { key: "height", label: "Height", control: "slider", min: 140, max: 420, step: 10, unit: "px", group: "Frame" },
    ],
    skeleton: (): EngineNode => ({
        w: grow(),
        h: fixed(52),
        direction: "row",
        gap: 10,
        alignY: "center",
        padding: { top: 8, right: 10, bottom: 8, left: 10 },
        children: [0, 1, 2].map((): EngineNode => ({ w: grow(), h: fixed(30), fill: { color: GHOST, radius: 6 } })),
    }),
};

register(diagramElement);
