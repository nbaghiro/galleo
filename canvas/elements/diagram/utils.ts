import type { DrawContext, DrawStyle, DrawTextStyle, PathSink, Rect } from "@engine/node";
import type { Tokens } from "@themes";
import type { DiagramFlow } from "@model/elements";
import { fontStack, luminance } from "@themes";
import { PALETTE_MODES, type PaletteMode } from "@elements/chart/utils";
import { num, oneOf, str } from "@elements/coerce";
import { DIAGRAM_FLOWS } from "@model/elements";
import { hierarchy, tree, type HierarchyPointNode } from "d3-hierarchy";

// Authored/persisted diagram data (artifact JSONB).
export interface DiagramData {
    type?: string; // registered diagram id; one of the renderers in @elements/diagram/
    items: string; // one entry per line (or comma-separated): "Label | detail | value"
    links?: string; // edges: "A->B, B->C" (flow) or "Parent>Child" (tree/org/mindmap)
    axes?: string; // quadrant/matrix axis captions: "x low, x high, y low, y high"
    palette?: PaletteMode; // node fills: accent ramp (mono) or hue-rotated (multi)
    flow?: DiagramFlow; // graph rank direction
    height?: number;
}

export interface DiagItem {
    label: string;
    body?: string;
    value?: number;
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

export interface DiagramOptions {
    flow: DiagramFlow;
}

export interface ResolvedDiagram {
    type: string;
    items: DiagItem[];
    nodes: DiagNode[];
    edges: DiagEdge[];
    axes: string[];
    options: DiagramOptions;
}

export interface DiagramCtx {
    g: DrawContext;
    W: number;
    H: number;
    theme: Tokens;
    opts: DiagramOptions;
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

// newline-split when present, so a detail may contain commas
function splitLines(s: string | undefined): string[] {
    const raw = s ?? "";
    return (raw.includes("\n") ? raw.split("\n") : raw.split(","))
        .map((x) => x.trim())
        .filter(Boolean);
}

// "Label | detail | 42"; later segments optional
function parseItem(line: string): DiagItem {
    const [label = "", body, value] = line.split("|").map((p) => p.trim());
    const n = value === undefined ? NaN : parseFloat(value);
    return { label, body: body || undefined, value: Number.isFinite(n) ? n : undefined };
}

// "From->To" / "From>To", optional ":label" tail (e.g. "A->B:yes").
function parseEdges(links: string | undefined): DiagEdge[] {
    return splitLines(links)
        .map((e): DiagEdge | null => {
            const [pair, label] = e.split(":");
            const parts = (pair ?? "").split(/->|>/).map((p) => p.trim());
            if (parts.length < 2 || !parts[0] || !parts[1]) return null;
            return { from: parts[0], to: parts[1], label: label?.trim() || undefined };
        })
        .filter((e): e is DiagEdge => e !== null);
}

export function toDiagramData(d: Record<string, unknown>): DiagramData {
    return {
        type: str(d.type),
        items: str(d.items) ?? "",
        links: str(d.links),
        axes: str(d.axes),
        palette: oneOf(d.palette, PALETTE_MODES),
        flow: oneOf(d.flow, DIAGRAM_FLOWS),
        height: num(d.height),
    };
}

export function normalizeDiagram(d: DiagramData): ResolvedDiagram {
    const type = d.type ?? "process";
    const items = splitLines(d.items).map(parseItem);
    return {
        type,
        items,
        nodes: items.map((i) => ({ id: i.label, label: i.label })),
        edges: parseEdges(d.links),
        axes: splitLines(d.axes),
        options: { flow: d.flow ?? "down" },
    };
}

export const labelsOf = (items: DiagItem[]): string[] => items.map((i) => i.label);

// inverse of parseItem; newline-joined once any entry has a detail, which may contain commas
export function formatItems(items: DiagItem[]): string {
    const one = (i: DiagItem): string => {
        const parts = [i.label, i.body ?? "", i.value === undefined ? "" : String(i.value)];
        while (parts.length > 1 && parts[parts.length - 1] === "") parts.pop();
        return parts.join(" | ");
    };
    const rich = items.some((i) => i.body || i.value !== undefined);
    return items.map(one).join(rich ? "\n" : ", ");
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

export const captionText = (theme: Tokens, extra?: Partial<DrawTextStyle>): DrawTextStyle => ({
    fill: theme.muted,
    size: 11,
    weight: 500,
    font: nodeFont(theme),
    align: "center",
    baseline: "middle",
    ...extra,
});

export const LINE_H = 15; // shared label line rhythm

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
    lineHeight = LINE_H,
): void {
    const lines = wrapLabel(g, text, maxWidth, style);
    const top = cy - ((lines.length - 1) * lineHeight) / 2;
    lines.forEach((ln, i) => g.text(ln, cx, top + i * lineHeight, style));
}

const BODY_GAP = 3;

// height stackedLabel will occupy, for sizing a box before painting into it
export function labelHeight(
    g: DrawContext,
    item: DiagItem,
    maxWidth: number,
    title: DrawTextStyle,
    body?: DrawTextStyle,
): number {
    const titleH = wrapLabel(g, item.label, maxWidth, title).length * (title.size ?? 13) * 1.25;
    if (!item.body || !body) return titleH;
    const bodyH = wrapLabel(g, item.body, maxWidth, body).length * (body.size ?? 11) * 1.3;
    return titleH + BODY_GAP + bodyH;
}

export function maxLabelHeight(
    g: DrawContext,
    items: DiagItem[],
    maxWidth: number,
    title: DrawTextStyle,
    body?: DrawTextStyle,
): number {
    return Math.max(0, ...items.map((i) => labelHeight(g, i, maxWidth, title, body)));
}

export function stackedLabel(
    g: DrawContext,
    item: DiagItem,
    cx: number,
    cy: number,
    maxWidth: number,
    title: DrawTextStyle,
    body?: DrawTextStyle,
): number {
    const titleLh = (title.size ?? 13) * 1.25;
    const titleLines = wrapLabel(g, item.label, maxWidth, title);
    // no detail → the plain centred label, on centerLabel's own line rhythm
    if (!item.body || !body) {
        centerLabel(g, item.label, cx, cy, maxWidth, title);
        return titleLines.length * LINE_H;
    }
    const bodyLh = (body.size ?? 11) * 1.3;
    const bodyLines = wrapLabel(g, item.body, maxWidth, body);
    const gap = BODY_GAP;
    const total = titleLines.length * titleLh + gap + bodyLines.length * bodyLh;
    let y = cy - total / 2 + titleLh / 2;
    titleLines.forEach((ln) => {
        g.text(ln, cx, y, title);
        y += titleLh;
    });
    y += gap - titleLh / 2 + bodyLh / 2;
    bodyLines.forEach((ln) => {
        g.text(ln, cx, y, body);
        y += bodyLh;
    });
    return total;
}

export interface NodePaint {
    fill?: string;
    stroke?: string;
    width?: number;
    ink: string; // label color that reads on the resolved fill
    dim: string; // supporting-text color on the same fill
}

// solid fill, no outline: the way charts draw a mark
export function nodePaint(color: string, theme: Tokens, over?: Partial<NodePaint>): NodePaint {
    const fill = over?.fill ?? color;
    const dark = luminance(fill) < 0.5;
    const ink = over?.ink ?? (dark ? theme.onAccent : theme.ink);
    // no softer on-accent token exists, so a dark fill differentiates by size/weight (as treemap does)
    return { fill, stroke: over?.stroke, width: over?.width, ink, dim: dark ? ink : theme.muted };
}

export const PAD = 14; // one inset for every type; charts get theirs from cartesianFrame

export const frame = (W: number, H: number, pad = PAD): Rect => ({
    x: pad,
    y: pad,
    w: Math.max(1, W - pad * 2),
    h: Math.max(1, H - pad * 2),
});

// diamond/hexagon are assigned by the renderer, not authored
export const NODE_RADIUS = 6; // charts round marks 2-3px; nodes are bigger, so a touch more
export const NODE_TEXT = 12;

export type NodeShape = "rounded" | "pill" | "hexagon" | "diamond";

const NOTCH = 0.34; // hexagon/diamond point depth, as a fraction of the node height

function shapeInto(p: PathSink, shape: NodeShape, b: Rect): void {
    if (shape === "diamond") {
        p.moveTo(b.x + b.w / 2, b.y);
        p.lineTo(b.x + b.w, b.y + b.h / 2);
        p.lineTo(b.x + b.w / 2, b.y + b.h);
        p.lineTo(b.x, b.y + b.h / 2);
        p.closePath();
        return;
    }
    const notch = Math.min(b.h * NOTCH, b.w / 2);
    p.moveTo(b.x + notch, b.y);
    p.lineTo(b.x + b.w - notch, b.y);
    p.lineTo(b.x + b.w, b.y + b.h / 2);
    p.lineTo(b.x + b.w - notch, b.y + b.h);
    p.lineTo(b.x + notch, b.y + b.h);
    p.lineTo(b.x, b.y + b.h / 2);
    p.closePath();
}

export interface NodeOpts {
    color?: string;
    fill?: string;
    stroke?: string;
    ink?: string;
    shape?: NodeShape;
    radius?: number;
    titleSize?: number;
    pad?: number;
    showBody?: boolean; // a detail line renders only where the caller has sized the box for it
}

export function drawNode(
    g: DrawContext,
    b: Rect,
    item: DiagItem,
    theme: Tokens,
    o: NodeOpts = {},
): void {
    const shape = o.shape ?? "rounded";
    const paint = nodePaint(o.color ?? theme.accent, theme, {
        fill: o.fill,
        stroke: o.stroke,
        ink: o.ink,
    });
    const ds: DrawStyle = { fill: paint.fill, stroke: paint.stroke, width: paint.width };

    const angled = shape === "hexagon" || shape === "diamond";
    if (angled) {
        g.path((p) => shapeInto(p, shape, b), ds);
    } else {
        const radius = shape === "pill" ? b.h / 2 : (o.radius ?? NODE_RADIUS);
        g.rect(b.x, b.y, b.w, b.h, { ...ds, radius });
    }

    // angled silhouettes eat their horizontal extremes, so text insets past the point
    const notch = shape === "diamond" ? b.w / 4 : angled ? b.h * NOTCH : 0;
    const pad = (o.pad ?? 7) + notch;
    const maxW = Math.max(24, b.w - pad * 2);
    const title = nodeText(theme, { fill: paint.ink, size: o.titleSize ?? NODE_TEXT });
    const body = o.showBody ? captionText(theme, { fill: paint.dim, size: 11 }) : undefined;
    stackedLabel(g, item, b.x + b.w / 2, b.y + b.h / 2, maxW, title, body);
}

export const linkColor = (theme: Tokens): string => theme.muted;

const HEAD_SPREAD = 0.42; // half-angle of the arrowhead barbs, radians
const HEAD_SIZE = 6;

function headAt(
    g: DrawContext,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    color: string,
    size: number,
): void {
    const a = Math.atan2(y2 - y1, x2 - x1);
    g.polyline(
        [
            [x2, y2],
            [x2 - size * Math.cos(a - HEAD_SPREAD), y2 - size * Math.sin(a - HEAD_SPREAD)],
            [x2 - size * Math.cos(a + HEAD_SPREAD), y2 - size * Math.sin(a + HEAD_SPREAD)],
        ],
        { fill: color },
    );
}

export interface LinkOpts {
    color?: string;
    width?: number;
    head?: boolean;
    dashed?: boolean;
    corner?: number; // elbow rounding for orthogonal runs
}

export function drawLink(
    g: DrawContext,
    points: [number, number][],
    theme: Tokens,
    o: LinkOpts = {},
): void {
    if (points.length < 2) return;
    const color = o.color ?? linkColor(theme);
    const width = o.width ?? 1.8;
    const corner = o.corner ?? 0; // 0 = straight elbows
    const style: DrawStyle = {
        stroke: color,
        width,
        dash: o.dashed ? [width * 3, width * 2.5] : undefined,
        ...(corner > 0 ? { cap: "round" as const, join: "round" as const } : {}),
    };
    if (points.length === 2) {
        g.line(points[0]![0], points[0]![1], points[1]![0], points[1]![1], style);
    } else if (corner <= 0) {
        g.polyline(points, style);
    } else {
        g.path((p) => {
            p.moveTo(points[0]![0], points[0]![1]);
            for (let i = 1; i < points.length - 1; i++) {
                const [px, py] = points[i - 1]!;
                const [cx, cy] = points[i]!;
                const [nx, ny] = points[i + 1]!;
                const inLen = Math.hypot(cx - px, cy - py) || 1;
                const outLen = Math.hypot(nx - cx, ny - cy) || 1;
                const r = Math.min(corner, inLen / 2, outLen / 2);
                p.lineTo(cx - ((cx - px) / inLen) * r, cy - ((cy - py) / inLen) * r);
                p.quadraticCurveTo(
                    cx,
                    cy,
                    cx + ((nx - cx) / outLen) * r,
                    cy + ((ny - cy) / outLen) * r,
                );
            }
            const last = points[points.length - 1]!;
            p.lineTo(last[0], last[1]);
        }, style);
    }
    if (o.head === false) return;
    const [x2, y2] = points[points.length - 1]!;
    const [x1, y1] = points[points.length - 2]!;
    headAt(g, x1, y1, x2, y2, color, HEAD_SIZE);
}

// on a chip, so it reads where it crosses a connector
export function drawEdgeLabel(
    g: DrawContext,
    x: number,
    y: number,
    text: string,
    theme: Tokens,
): void {
    if (!text) return;
    const style = captionText(theme, { fill: theme.soft, size: 10.5 });
    const w = g.measureText(text, style).width + 12;
    const h = 17;
    g.rect(x - w / 2, y - h / 2, w, h, {
        fill: theme.surface,
        stroke: theme.line,
        width: 1,
        radius: h / 2,
    });
    g.text(text, x, y, style);
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
        const box = frame(W, H, 16);
        const top = box.y;
        const bandH = box.h / n;
        const cx = W / 2;
        const wide = box.w / 2;
        const narrow = wide * 0.14;
        // with values the widths encode them; without, it tapers evenly
        const vals = items.map((i) => i.value);
        const scaled = !narrowTop && vals.every((v) => v !== undefined && v >= 0);
        const max = scaled ? Math.max(...(vals as number[])) || 1 : 1;
        // proportional, but never narrower than the band's own label needs
        const halfFor = (i: number): number => {
            const byValue = ((vals[i] as number) / max) * wide;
            const byLabel = (g.measureText(items[i]!.label, nodeText(theme)).width + 24) / 2;
            return clamp(Math.max(byValue, byLabel), narrow, wide);
        };
        const halfAt = (y: number): number => {
            const t = (y - top) / (box.h || 1);
            return narrowTop ? narrow + (wide - narrow) * t : wide - (wide - narrow) * t;
        };
        items.forEach((item, i) => {
            const y0 = top + i * bandH;
            const y1 = y0 + bandH - 3;
            const h0 = scaled ? halfFor(i) : halfAt(y0);
            const h1 = scaled ? halfFor(Math.min(i + 1, n - 1)) : halfAt(y1);
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
            const mw = Math.max(24, Math.min(h0, h1) * 2 - 12);
            centerLabel(
                g,
                item.label,
                cx,
                my,
                mw,
                nodeText(theme, { fill: luminance(cols[i]!) < 0.5 ? theme.onAccent : theme.ink }),
            );
        });
    };
}

export interface TreeDatum {
    label: string;
    body?: string;
    children: TreeDatum[];
}

// Root = the node never used as an edge `to` (no edges → first node roots a star); cycles cut by
// visiting each node once.
export function buildTree(diagram: ResolvedDiagram): TreeDatum | null {
    const { items, edges } = diagram;
    if (items.length === 0) return null;
    const byId = new Map(items.map((i) => [i.label, i] as const));
    const datum = (id: string): TreeDatum => {
        const it = byId.get(id);
        return { label: it?.label ?? id, body: it?.body, children: [] };
    };

    if (edges.length === 0) {
        const [root, ...rest] = items;
        return {
            label: root!.label,
            body: root!.body,
            children: rest.map((n) => ({ label: n.label, body: n.body, children: [] })),
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

    const rootId = items.find((n) => !hasParent.has(n.label))?.label ?? items[0]!.label;
    const seen = new Set<string>();
    const build = (id: string): TreeDatum => {
        seen.add(id);
        const node = datum(id);
        for (const c of kids.get(id) ?? []) {
            if (seen.has(c)) continue;
            node.children.push(build(c));
        }
        return node;
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

export const treeDepth = (n: TreeDatum): number => 1 + Math.max(0, ...n.children.map(treeDepth));

export const treeLeaves = (n: TreeDatum): number =>
    n.children.length === 0 ? 1 : n.children.reduce((sum, c) => sum + treeLeaves(c), 0);

// fits the tallest label, capped so `slots` rows still fit: positions scale down, boxes don't
export function fitNodeHeight(
    needed: number,
    min: number,
    space: number,
    slots: number,
    gap: number,
): number {
    return clamp(needed, min, Math.max(min, space / Math.max(1, slots) - gap));
}

export interface Placed {
    node: HierarchyPointNode<TreeDatum>;
    cx: number;
    cy: number;
}

// d3 tree() at natural spacing, uniformly scaled to fit (W,H); never upscales past natural gaps.
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

    // centre the natural extent; a shallow tree would otherwise hug the top
    const mainNode = horizontal ? nodeW : nodeH;
    const mainSpace = horizontal ? W : H;
    const base = (mainSpace - (spanY * s + mainNode)) / 2 + mainNode / 2;

    const placed = all.map((node): Placed => {
        const cross = (node.x - midX) * s;
        const main = (node.y - minY) * s;
        return horizontal
            ? { node, cx: base + main, cy: H / 2 + cross }
            : { node, cx: W / 2 + cross, cy: base + main };
    });
    return { root, placed };
}

export const itemOf = (node: TreeDatum): DiagItem => ({ label: node.label, body: node.body });
