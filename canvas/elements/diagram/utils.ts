import type { DrawContext, DrawTextStyle } from "@engine/node";
import type { Tokens } from "@themes";
import { fontStack } from "@themes";
import { hierarchy, tree, type HierarchyPointNode } from "d3-hierarchy";

// Authored/persisted diagram data (artifact JSONB).
export interface DiagramData {
    type?: string; // process | cycle | pyramid | funnel | timeline | venn | quadrant | matrix | tree | org | mindmap | flow
    kind?: string; // legacy discriminant (process | pyramid | funnel | cycle)
    items: string; // labels, newline- or comma-separated
    links?: string; // edges: "A->B, B->C" (flow) or "Parent>Child" (tree/org/mindmap)
    palette?: "ramp" | "categorical"; // node fills: accent ramp (mono) or hue-rotated (multi)
    height?: number;
}

export interface DiagNode {
    id: string;
    label: string;
}

export interface DiagEdge {
    from: string; // node id (= label)
    to: string;
    label?: string;
}

export interface ResolvedDiagram {
    type: string;
    items: string[];
    nodes: DiagNode[];
    edges: DiagEdge[];
}

export interface DiagramCtx {
    g: DrawContext;
    W: number;
    H: number;
    theme: Tokens;
    colors: (n: number) => string[];
}

export interface DiagramType {
    id: string;
    label: string;
    render: (diagram: ResolvedDiagram, ctx: DiagramCtx) => void;
}

export type Renderer = (diagram: ResolvedDiagram, ctx: DiagramCtx) => void;

// Mirrors the chart registry (@elements/chart/utils).
const registry = new Map<string, DiagramType>();

export function registerDiagram(type: DiagramType): void {
    registry.set(type.id, type);
}

export function getDiagram(id: string): DiagramType | undefined {
    return registry.get(id);
}

export function diagramTypeOptions(): { label: string; value: string }[] {
    return [...registry.values()].map((t) => ({ label: t.label, value: t.id }));
}

function splitItems(s: string | undefined): string[] {
    return (s ?? "")
        .split(/[\n,]/)
        .map((x) => x.trim())
        .filter(Boolean);
}

// "From->To" / "From>To", optional ":label" tail (e.g. "A->B:yes").
function parseEdges(links: string | undefined): DiagEdge[] {
    return (links ?? "")
        .split(/[\n,]/)
        .map((e) => e.trim())
        .filter(Boolean)
        .map((e): DiagEdge | null => {
            const [pair, label] = e.split(":");
            const parts = (pair ?? "").split(/->|>/).map((p) => p.trim());
            if (parts.length < 2 || !parts[0] || !parts[1]) return null;
            return { from: parts[0], to: parts[1], label: label?.trim() || undefined };
        })
        .filter((e): e is DiagEdge => e !== null);
}

const LEGACY_KIND: Record<string, string> = {
    process: "process",
    pyramid: "pyramid",
    funnel: "funnel",
    cycle: "cycle",
};

export function normalizeDiagram(d: DiagramData): ResolvedDiagram {
    const type = d.type ?? (d.kind ? (LEGACY_KIND[d.kind] ?? d.kind) : "process");
    const items = splitItems(d.items);
    return {
        type,
        items,
        nodes: items.map((label) => ({ id: label, label })),
        edges: parseEdges(d.links),
    };
}

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
    fill?: string;
    stroke?: string;
    ink?: string;
    radius?: number;
    width?: number; // stroke width
}

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

export const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

// narrowTop → pyramid (triangle); else funnel (wide top).
export function bandStack(narrowTop: boolean): Renderer {
    return (diagram, ctx) => {
        const { g, W, H, theme } = ctx;
        const items = diagram.items;
        if (items.length === 0) return;
        const cols = ctx.colors(items.length);
        const n = items.length;
        const pad = 16;
        const top = pad;
        const bottom = H - pad;
        const bandH = (bottom - top) / n;
        const cx = W / 2;
        const wide = W / 2 - pad;
        const narrow = wide * 0.14;
        const halfAt = (y: number): number => {
            const t = (y - top) / (bottom - top);
            return narrowTop ? narrow + (wide - narrow) * t : wide - (wide - narrow) * t;
        };
        items.forEach((label, i) => {
            const y0 = top + i * bandH;
            const y1 = y0 + bandH - 3;
            const h0 = halfAt(y0);
            const h1 = halfAt(y1);
            g.path(
                (p) => {
                    p.moveTo(cx - h0, y0);
                    p.lineTo(cx + h0, y0);
                    p.lineTo(cx + h1, y1);
                    p.lineTo(cx - h1, y1);
                    p.closePath();
                },
                { fill: cols[i]! },
            );
            const my = (y0 + y1) / 2;
            const mw = Math.max(24, halfAt(my) * 2 - 12);
            centerLabel(g, label, cx, my, mw, nodeText(theme, { fill: theme.onAccent }));
        });
    };
}

export interface TreeDatum {
    label: string;
    children: TreeDatum[];
}

// Root = the node never used as an edge `to`; with no edges the first node roots a star.
// Cycles/diamonds cut by visiting each node once.
export function buildTree(diagram: ResolvedDiagram): TreeDatum | null {
    const { nodes, edges } = diagram;
    if (nodes.length === 0) return null;
    const labelOf = new Map(nodes.map((n) => [n.id, n.label] as const));

    if (edges.length === 0) {
        const [root, ...rest] = nodes;
        return {
            label: root!.label,
            children: rest.map((n) => ({ label: n.label, children: [] })),
        };
    }

    const kids = new Map<string, string[]>();
    const hasParent = new Set<string>();
    for (const e of edges) {
        const arr = kids.get(e.from);
        if (arr) arr.push(e.to);
        else kids.set(e.from, [e.to]);
        hasParent.add(e.to);
    }

    const rootId = nodes.find((n) => !hasParent.has(n.id))?.id ?? nodes[0]!.id;
    const seen = new Set<string>();
    const build = (id: string): TreeDatum => {
        seen.add(id);
        const children: TreeDatum[] = [];
        for (const c of kids.get(id) ?? []) {
            if (seen.has(c)) continue;
            children.push(build(c));
        }
        return { label: labelOf.get(id) ?? id, children };
    };
    return build(rootId);
}

// Uniform box width for the whole tree; clamped so long labels wrap rather than overflow.
export function boxWidth(
    g: DrawContext,
    theme: Tokens,
    labels: string[],
    base: number,
    min: number,
    max: number,
): number {
    let longest = 0;
    for (const l of labels) longest = Math.max(longest, g.measureText(l, nodeText(theme)).width);
    return clamp(Math.max(base, longest + 24), min, max);
}

export interface Placed {
    node: HierarchyPointNode<TreeDatum>;
    cx: number;
    cy: number;
}

// d3 tree() at natural spacing, uniformly scaled to fit (W,H); never upscales past natural gaps.
// `horizontal` swaps axes for a left→right mind-map.
export function layoutTree(
    data: TreeDatum,
    W: number,
    H: number,
    nodeW: number,
    nodeH: number,
    horizontal: boolean,
): { root: HierarchyPointNode<TreeDatum>; placed: Placed[] } {
    const pad = 16;
    const sep = horizontal ? nodeH + 24 : nodeW + 28; // sibling (cross-axis) separation
    const depth = horizontal ? nodeW + 44 : nodeH + 36; // per-level (main-axis) separation
    const root = tree<TreeDatum>().nodeSize([sep, depth])(hierarchy<TreeDatum>(data));

    const all = root.descendants();
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const n of all) {
        minX = Math.min(minX, n.x);
        maxX = Math.max(maxX, n.x);
        minY = Math.min(minY, n.y);
        maxY = Math.max(maxY, n.y);
    }
    const spanX = maxX - minX; // cross axis (siblings)
    const spanY = maxY - minY; // main axis (depth)

    const crossBox = Math.max(1, horizontal ? H - 2 * pad - nodeH : W - 2 * pad - nodeW);
    const mainBox = Math.max(1, horizontal ? W - 2 * pad - nodeW : H - 2 * pad - nodeH);
    const s = Math.min(
        1,
        spanX > 0 ? crossBox / spanX : Infinity,
        spanY > 0 ? mainBox / spanY : Infinity,
    );
    const midX = (minX + maxX) / 2;

    const placed = all.map((node): Placed => {
        const cross = (node.x - midX) * s;
        const main = (node.y - minY) * s;
        if (horizontal) {
            const base = spanY > 0 ? pad + nodeW / 2 : W / 2;
            return { node, cx: base + main, cy: H / 2 + cross };
        }
        const base = spanY > 0 ? pad + nodeH / 2 : H / 2;
        return { node, cx: W / 2 + cross, cy: base + main };
    });
    return { root, placed };
}
