import type { EngineNode } from "@engine/node";
import type { Tokens } from "@themes";
import { fixed, grow, percent } from "@model/geometry";
import { mix } from "@themes";

// The one grey stand-in vocabulary: the colors a placeholder or a skeleton paints in, the bar and
// box primitives, and a per-kind body silhouette so a stat reads as a stat and a chart as bars
// rather than a run of generic bars. The windowed-loading placeholder uses it today; the outline
// ghost (skeletonize) and the palette tiles migrate onto it next (see ghost-stand-in.md).

export interface GhostColors {
    bar: string; // text and leaf placeholders
    panel: string; // container and section backgrounds
    line: string; // borders
    ink: string; // real text shown over a stand-in, e.g. a section's already-known heading
}

export const ghostColors = (theme: Tokens): GhostColors => ({
    bar: mix(theme.surface, theme.ink, 0.16),
    panel: mix(theme.surface, theme.ink, 0.08),
    line: theme.line,
    ink: mix(theme.bg, theme.ink, 0.42),
});

const LINE = 11;
const LINE_GAP = 15;
const BODY_PAD = { top: 16, bottom: 16, left: 16, right: 16 };

export const ghostBar = (c: GhostColors, widthFrac: number, h = LINE): EngineNode => ({
    w: percent(widthFrac),
    h: fixed(h),
    fill: { color: c.bar, radius: Math.min(5, h / 2) },
});

export const ghostBox = (color: string, h: number, radius = 10): EngineNode => ({
    w: grow(),
    h: fixed(Math.max(0, h)),
    fill: { color, radius },
});

// widths cycle so a run of lines reads like prose rather than a bar chart
const WIDTHS = [1, 0.96, 0.99, 0.93, 1, 0.9];
export function ghostParagraph(c: GhostColors, h: number, max = 20): EngineNode[] {
    const n = Math.max(2, Math.min(max, Math.floor(h / (LINE + LINE_GAP))));
    return Array.from({ length: n }, (_, i) =>
        ghostBar(c, i === n - 1 ? 0.45 : (WIDTHS[i % WIDTHS.length] ?? 1)),
    );
}

// The recognizable per-kind silhouette that fills its box: a chart as bars on a baseline, a diagram
// as node boxes, a stat as tiles, a table as a header over rows. Anything else reads as prose.
export function ghostBody(kind: string, c: GhostColors, h: number): EngineNode[] {
    switch (kind) {
        case "chart":
            return [
                {
                    w: grow(),
                    h: fixed(h),
                    direction: "row",
                    gap: 12,
                    alignY: "end",
                    padding: BODY_PAD,
                    fill: { color: c.panel, radius: 12 },
                    children: [0.45, 0.75, 0.3, 1, 0.6].map((f) =>
                        ghostBox(c.bar, (h - 32) * f, 4),
                    ),
                },
            ];
        case "diagram":
            return [
                {
                    w: grow(),
                    h: fixed(h),
                    direction: "row",
                    gap: 14,
                    alignY: "center",
                    padding: BODY_PAD,
                    fill: { color: c.panel, radius: 12 },
                    children: [0.7, 0.45, 0.7].map((f) => ghostBox(c.bar, (h - 32) * f, 8)),
                },
            ];
        case "table":
            return [ghostBox(c.bar, 24, 4), ...ghostParagraph(c, h - 24 - 14)];
        case "media":
            return [ghostBox(c.panel, h, 12)];
        case "stat":
            return [
                {
                    w: grow(),
                    h: fixed(Math.min(h, 160)),
                    direction: "row",
                    gap: 18,
                    children: [0, 1, 2].map(() => ghostBox(c.panel, Math.min(h, 160), 12)),
                },
            ];
        case "quote":
            return [ghostBar(c, 0.92, 18), ghostBar(c, 0.78, 18), ghostBar(c, 0.35, 18)];
        default:
            return ghostParagraph(c, h);
    }
}
