import type { DrawContext, DrawTextStyle } from "@engine/node";
import type { Tokens } from "@themes/theme";
import { fontStack } from "@themes/theme";

export const nodeFont = (t: Tokens): string => fontStack("ui", t);

export const nodeText = (theme: Tokens, extra?: Partial<DrawTextStyle>): DrawTextStyle => ({
    fill: theme.ink,
    size: 13,
    weight: 600,
    font: nodeFont(theme),
    align: "center",
    baseline: "middle",
    ...extra,
});

// Greedy word wrap against measured widths — for labels inside fixed-width nodes.
export function wrapLabel(
    g: DrawContext,
    text: string,
    maxWidth: number,
    style: DrawTextStyle,
): string[] {
    const words = text.split(/\s+/).filter(Boolean);
    if (words.length === 0) return [""];
    const lines: string[] = [];
    let line = "";
    for (const w of words) {
        const cand = line === "" ? w : `${line} ${w}`;
        if (g.measureText(cand, style).width > maxWidth && line !== "") {
            lines.push(line);
            line = w;
        } else {
            line = cand;
        }
    }
    lines.push(line);
    return lines;
}

// Centered, wrapped multi-line label inside the box (cx, cy) with the given style.
export function centerLabel(
    g: DrawContext,
    text: string,
    cx: number,
    cy: number,
    maxWidth: number,
    style: DrawTextStyle,
    lineHeight = 15,
): void {
    const lines = wrapLabel(g, text, maxWidth, style);
    const top = cy - ((lines.length - 1) * lineHeight) / 2;
    lines.forEach((ln, i) => g.text(ln, cx, top + i * lineHeight, style));
}

export interface NodeStyle {
    fill?: string; // box fill (default theme.surface)
    stroke?: string; // box stroke (default theme.accent)
    ink?: string; // label color (default theme.ink)
    radius?: number;
    width?: number; // stroke width
}

// A labeled rounded-rect node — the diagram workhorse. Fill/stroke/label default to theme tokens.
export function drawNode(
    g: DrawContext,
    x: number,
    y: number,
    w: number,
    h: number,
    label: string,
    theme: Tokens,
    ns: NodeStyle = {},
): void {
    g.rect(x, y, w, h, {
        fill: ns.fill ?? theme.surface,
        stroke: ns.stroke ?? theme.accent,
        width: ns.width ?? 1.5,
        radius: ns.radius ?? 10,
    });
    centerLabel(
        g,
        label,
        x + w / 2,
        y + h / 2,
        w - 14,
        nodeText(theme, { fill: ns.ink ?? theme.ink }),
    );
}

// A line from (x1,y1) to (x2,y2) capped with a filled arrowhead at the end.
export function arrow(
    g: DrawContext,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    color: string,
    width = 2,
    head = 6,
): void {
    g.line(x1, y1, x2, y2, { stroke: color, width });
    const a = Math.atan2(y2 - y1, x2 - x1);
    g.polyline(
        [
            [x2, y2],
            [x2 - head * Math.cos(a - 0.42), y2 - head * Math.sin(a - 0.42)],
            [x2 - head * Math.cos(a + 0.42), y2 - head * Math.sin(a + 0.42)],
        ],
        { fill: color },
    );
}

// A poly-line edge (already-computed points) capped with an arrowhead at the last segment.
export function arrowPath(
    g: DrawContext,
    points: [number, number][],
    color: string,
    width = 2,
    head = 6,
): void {
    if (points.length < 2) return;
    g.polyline(points, { stroke: color, width });
    const [x2, y2] = points[points.length - 1]!;
    const [x1, y1] = points[points.length - 2]!;
    const a = Math.atan2(y2 - y1, x2 - x1);
    g.polyline(
        [
            [x2, y2],
            [x2 - head * Math.cos(a - 0.42), y2 - head * Math.sin(a - 0.42)],
            [x2 - head * Math.cos(a + 0.42), y2 - head * Math.sin(a + 0.42)],
        ],
        { fill: color },
    );
}
