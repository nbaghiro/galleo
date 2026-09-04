import type { DrawContext, DrawStyle, EngineNode, PathSink, Rect } from "@engine/node";
import type { LayoutCtx } from "@elements/spec";
import type { BoxInsets } from "@model/geometry";
import { fit, fixed, grow, percent } from "@model/geometry";
import type { Tokens } from "@themes";
import type { DiagramNumbers, DiagramShape, DiagramStyle } from "@model/elements";
import { accentRamp, fontStack, inkOn, luminance, mix, pageMix, reachContrast } from "@themes";
import { bool, num, oneOf, str } from "@elements/coerce";
import { DIAGRAM_NUMBERS, DIAGRAM_SHAPES, DIAGRAM_STYLES, THEME_ROLES } from "@model/elements";
import { ICON_LIBRARY, drawIcon } from "@elements/media/vector";
import { hierarchy, tree, type HierarchyPointNode } from "d3-hierarchy";

// Per-item presentation, positional beside the text encoding of `items` (index i styles item i).
// Kept out of the item grammar so styling never leaks into a field users type into; truncated or
// padded to the item count at normalize, so an AI rewrite of `items` degrades safely.
export interface DiagItemMeta {
    color?: string; // hex, or a theme color role name ("accent", "ink", ...)
    emphasis?: boolean; // promote this item's node to the solid treatment
    icon?: string; // ICON_LIBRARY key, rendered by types that support node icons
    weight?: number; // width ratio vs row siblings (1 = equal), honored by `weights` types
}

// Authored/persisted diagram data (artifact JSONB).
export interface DiagramData {
    type?: string; // registered diagram id; one of the renderers in @elements/diagram/
    items: string; // one entry per line (or comma-separated): "Label | detail | value"
    itemsMeta?: DiagItemMeta[]; // positional per-item styling
    links?: string; // "Parent>Child" edges building the org hierarchy (the one graph type)
    axes?: string; // quadrant/matrix axis captions: "x low, x high, y low, y high"
    style?: DiagramStyle; // node treatment: solid | tinted | card | outline
    shape?: DiagramShape; // node silhouette for the node-row types
    numbers?: DiagramNumbers; // leading-edge ornament badge
    height?: number;
}

export interface DiagItem {
    label: string;
    body?: string;
    value?: number;
    color?: string; // resolved per-item override (from itemsMeta)
    emphasis?: boolean;
    icon?: string;
    weight?: number;
}

// a usable weight is finite and positive; anything else means "equal share"
export const itemWeight = (it: DiagItem | undefined): number =>
    it?.weight !== undefined && Number.isFinite(it.weight) && it.weight > 0 ? it.weight : 1;

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
    style: DiagramStyle;
    shape?: DiagramShape; // unset = each renderer's own default silhouette
    numbers: DiagramNumbers;
}

export interface ResolvedDiagram {
    type: string;
    items: DiagItem[];
    nodes: DiagNode[];
    edges: DiagEdge[];
    axes: string[];
    options: DiagramOptions;
}

// Every type composes: `arrange` returns real engine children (label + detail text per item) laid
// out by the engine, plus an optional float `decorate` surface painting only chrome (connectors,
// bands, silhouettes) behind them. kids[i*2] is item i's label, kids[i*2+1] its detail.
export interface DiagramType {
    id: string;
    label: string;
    // per-item icons render in this type's cells; false where the geometry has no room (bands)
    icons?: false;
    // this type distributes row width by item weight, so the divider gesture can resize its cells
    weights?: true;
    arrange: (
        diagram: ResolvedDiagram,
        ctx: LayoutCtx,
        kids: EngineNode[],
        height: number,
    ) => EngineNode;
}

// Mirrors the chart registry (@elements/chart/utils).
const registry = new Map<string, DiagramType>();

export function registerDiagram(type: DiagramType): void {
    registry.set(type.id, type);
}

export function getDiagram(id: string): DiagramType | undefined {
    return registry.get(id);
}

export function diagramSupportsIcons(id: string): boolean {
    return getDiagram(id)?.icons !== false;
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

function toItemMeta(raw: unknown): DiagItemMeta[] | undefined {
    if (!Array.isArray(raw)) return undefined;
    return raw.map((entry) => {
        const m = (entry ?? {}) as Record<string, unknown>;
        return {
            color: str(m.color),
            emphasis: bool(m.emphasis),
            icon: str(m.icon),
            weight: num(m.weight),
        };
    });
}

export function toDiagramData(raw: unknown): DiagramData {
    const d = (raw ?? {}) as Record<string, unknown>;
    return {
        type: str(d.type),
        items: str(d.items) ?? "",
        itemsMeta: toItemMeta(d.itemsMeta),
        links: str(d.links),
        axes: str(d.axes),
        style: oneOf(d.style, DIAGRAM_STYLES),
        shape: oneOf(d.shape, DIAGRAM_SHAPES),
        numbers: oneOf(d.numbers, DIAGRAM_NUMBERS),
        height: num(d.height),
    };
}

// hex passes through; a theme role name resolves against the tokens; anything else is dropped
export function resolveItemColor(c: string | undefined, theme: Tokens): string | undefined {
    if (!c) return undefined;
    if (/^#[0-9a-fA-F]{3,8}$/.test(c)) return c;
    const role = oneOf(c, THEME_ROLES);
    return role ? theme[role] : undefined;
}

export function normalizeDiagram(d: DiagramData): ResolvedDiagram {
    const type = d.type ?? "process";
    const items = splitLines(d.items).map(parseItem);
    // positional: meta[i] styles items[i]; excess meta is ignored, missing meta means unstyled
    d.itemsMeta?.slice(0, items.length).forEach((m, i) => {
        const it = items[i]!;
        if (m.color) it.color = m.color;
        if (m.emphasis !== undefined) it.emphasis = m.emphasis;
        if (m.icon) it.icon = m.icon;
        if (m.weight !== undefined && Number.isFinite(m.weight) && m.weight > 0)
            it.weight = m.weight;
    });
    return {
        type,
        items,
        nodes: items.map((i) => ({ id: i.label, label: i.label })),
        edges: parseEdges(d.links),
        axes: splitLines(d.axes),
        options: {
            style: d.style ?? "solid",
            shape: d.shape,
            numbers: d.numbers ?? "none",
        },
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

// single-line label advance width through the engine's own measurer, for sizing cells before layout
export function labelWidth(ctx: LayoutCtx, text: string, size = NODE_TEXT, weight = 600): number {
    return ctx.measure({ text, fontId: nodeFont(ctx.theme), size, weight, wrap: "none" }, Infinity)
        .width;
}

export function maxLabelWidth(ctx: LayoutCtx, items: DiagItem[]): number {
    return Math.max(0, ...items.map((i) => labelWidth(ctx, i.label)));
}

// Diagram fills: the shared page-aware opaque ramp (charts use the same one via seriesColors)
export function diagramColors(theme: Tokens, n: number): string[] {
    return accentRamp(theme, Math.max(1, n));
}

export interface NodePaint {
    fill?: string;
    stroke?: string;
    width?: number;
    gradient?: DrawStyle["gradient"]; // solid treatment depth
    shadow?: DrawStyle["shadow"]; // card treatment elevation
    ink: string; // label color that reads on the resolved fill
    dim: string; // supporting-text color on the same fill
    iconInk: string; // icon stroke: the item color where the fill leaves room, else the label ink
}

export interface NodePaintOpts extends Partial<
    Pick<NodePaint, "fill" | "stroke" | "ink" | "width">
> {
    style?: DiagramStyle; // artifact-wide treatment (ctx.opts.style)
    emphasis?: boolean; // per-item promotion to solid, whatever the style
}

// a hex fill takes the depth-gradient / wash math; a non-hex (rgba on a dark section) stays flat
const isHexColor = (c: string): boolean => /^#[0-9a-fA-F]{6}$/.test(c);

// The four node treatments. `solid` is the chart-mark look with a slight downward gradient for
// depth; `tinted` is an opaque wash of the node color; `card` is paper + hairline + soft shadow
// (the item color shows through badges/icons, not the fill); `outline` is stroke-only. Explicit
// fill/stroke/ink overrides (flow's terminals, the hub centre) always win over the treatment.
export function nodePaint(color: string, theme: Tokens, over?: NodePaintOpts): NodePaint {
    const style: DiagramStyle = over?.emphasis ? "solid" : (over?.style ?? "solid");
    if (!over?.fill && style === "tinted") {
        // wash toward the page, not toward white: a white wash on a dark theme is a solid card
        const fill = isHexColor(color) ? pageMix(color, theme, 0.78) : color;
        const ink = over?.ink ?? inkOn(fill, theme);
        return {
            fill,
            stroke: over?.stroke,
            width: over?.width,
            ink,
            dim: dimFor(ink, fill, theme),
            iconInk: color,
        };
    }
    if (!over?.fill && style === "card") {
        return {
            fill: theme.surface,
            stroke: over?.stroke ?? theme.line,
            width: over?.width ?? 1,
            shadow: { blur: 10, dy: 2, color: "rgba(15,18,20,0.12)" },
            ink: over?.ink ?? theme.ink,
            dim: theme.muted,
            iconInk: color,
        };
    }
    if (!over?.fill && style === "outline") {
        return {
            fill: undefined,
            stroke: over?.stroke ?? color,
            width: over?.width ?? 1.5,
            ink: over?.ink ?? theme.ink,
            dim: theme.muted,
            iconInk: color,
        };
    }
    const fill = over?.fill ?? color;
    const ink = over?.ink ?? inkOn(fill, theme);
    return {
        fill,
        stroke: over?.stroke,
        width: over?.width,
        // depth: a slight darkening toward the bottom edge; flat when the fill isn't plain hex
        gradient: isHexColor(fill)
            ? { from: fill, to: mix(fill, "#000000", 0.1), angle: 180 }
            : undefined,
        ink,
        dim: dimFor(ink, fill, theme),
        // the fill is the item color itself, so the icon differentiates by ink like the label
        iconInk: ink,
    };
}

// supporting-text ink beside `ink` on `fill`: the theme's muted where it already reads, stepped
// toward the label ink's pole until it clears 3:1 (theme.muted is calibrated against the surface,
// not a mid-ramp tint — the washed-detail bug the contrast invariant catches)
function dimFor(ink: string, fill: string, theme: Tokens): string {
    if (!isHexColor(fill)) return theme.muted;
    const toward = luminance(ink) < 0.5 ? "#000000" : "#ffffff";
    return reachContrast(theme.muted, fill, 3, toward);
}

export const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

export const PAD = 14; // one inset for every type; charts get theirs from cartesianFrame

export const frame = (W: number, H: number, pad = PAD): Rect => ({
    x: pad,
    y: pad,
    w: Math.max(1, W - pad * 2),
    h: Math.max(1, H - pad * 2),
});

export const NODE_RADIUS = 6; // charts round marks 2-3px; nodes are bigger, so a touch more
export const NODE_TEXT = 12;

// A silhouette is box-parametric (a chevron's notch derives from the node's height), so shapes are
// registered as PathSink builders rather than fixed-viewBox vectors — the same sink the Vector IR,
// d3 generators, and all four render backends already speak. Adding a shape = one registration;
// every diagram type consumes the registry uniformly:
//   - `engineRadius` present → the shape is an engine fill (rounded corners), and composed cells
//     carry it directly, treatments included;
//   - absent → the cell composes transparent and the type's decorate surface paints the silhouette
//     with the full DrawStyle (gradient, shadow) via `drawShape`.
// `insetX` is the horizontal text inset the silhouette eats at a given node height, applied to the
// cell padding so labels clear the points.

export type NodeShape = "rounded" | "pill" | "chevron" | "hexagon" | "diamond";

export interface NodeShapeDef {
    id: NodeShape;
    build: (p: PathSink, b: Rect, o?: { first?: boolean }) => void;
    insetX: (h: number) => number;
    engineRadius?: (h: number) => number;
    // proportion limit (h/w): beyond it the silhouette degenerates (a pill becomes an egg, a
    // chevron a lozenge). Types with taller cells must fall back to rounded or cap the band.
    maxAspect?: number;
}

const shapeRegistry = new Map<string, NodeShapeDef>();

export function registerNodeShape(def: NodeShapeDef): void {
    shapeRegistry.set(def.id, def);
}

export function getNodeShape(id: string | undefined): NodeShapeDef {
    return (id && shapeRegistry.get(id)) || shapeRegistry.get("rounded")!;
}

export function nodeShapeIds(): string[] {
    return [...shapeRegistry.keys()];
}

// silhouette + NodePaint in one stroke, for decorate surfaces
export function drawShape(
    g: DrawContext,
    id: string | undefined,
    b: Rect,
    paint: NodePaint,
    o?: { first?: boolean },
): void {
    const def = getNodeShape(id);
    g.path((p) => def.build(p, b, o), {
        fill: paint.fill,
        stroke: paint.stroke,
        width: paint.width,
        gradient: paint.gradient,
        shadow: paint.shadow,
    });
}

const NOTCH = 0.34; // point depth, as a fraction of the node height
const notchOf = (b: Rect): number => Math.min(b.h * NOTCH, b.w / 2);

const roundedRect = (p: PathSink, b: Rect, r: number): void => {
    const rr = Math.max(0, Math.min(r, b.w / 2, b.h / 2));
    p.moveTo(b.x + rr, b.y);
    p.lineTo(b.x + b.w - rr, b.y);
    p.arcTo(b.x + b.w, b.y, b.x + b.w, b.y + rr, rr);
    p.lineTo(b.x + b.w, b.y + b.h - rr);
    p.arcTo(b.x + b.w, b.y + b.h, b.x + b.w - rr, b.y + b.h, rr);
    p.lineTo(b.x + rr, b.y + b.h);
    p.arcTo(b.x, b.y + b.h, b.x, b.y + b.h - rr, rr);
    p.lineTo(b.x, b.y + rr);
    p.arcTo(b.x, b.y, b.x + rr, b.y, rr);
    p.closePath();
};

registerNodeShape({
    id: "rounded",
    build: (p, b) => roundedRect(p, b, NODE_RADIUS),
    insetX: () => 0,
    engineRadius: () => NODE_RADIUS,
});

registerNodeShape({
    id: "pill",
    build: (p, b) => roundedRect(p, b, b.h / 2),
    insetX: (h) => h / 4,
    engineRadius: (h) => h / 2,
    maxAspect: 0.9,
});

registerNodeShape({
    id: "chevron",
    // arrow band: flat top/bottom, right point, matching left indent (flat on the first item)
    build: (p, b, o) => {
        const notch = notchOf(b);
        p.moveTo(b.x, b.y);
        p.lineTo(b.x + b.w - notch, b.y);
        p.lineTo(b.x + b.w, b.y + b.h / 2);
        p.lineTo(b.x + b.w - notch, b.y + b.h);
        p.lineTo(b.x, b.y + b.h);
        if (!o?.first) p.lineTo(b.x + notch, b.y + b.h / 2);
        p.closePath();
    },
    insetX: (h) => h * NOTCH,
    maxAspect: 0.8,
});

registerNodeShape({
    id: "hexagon",
    build: (p, b) => {
        const notch = notchOf(b);
        p.moveTo(b.x + notch, b.y);
        p.lineTo(b.x + b.w - notch, b.y);
        p.lineTo(b.x + b.w, b.y + b.h / 2);
        p.lineTo(b.x + b.w - notch, b.y + b.h);
        p.lineTo(b.x + notch, b.y + b.h);
        p.lineTo(b.x, b.y + b.h / 2);
        p.closePath();
    },
    insetX: (h) => h * NOTCH,
    maxAspect: 0.8,
});

// assigned by renderers (a flowchart decision), not authored
registerNodeShape({
    id: "diamond",
    build: (p, b) => {
        p.moveTo(b.x + b.w / 2, b.y);
        p.lineTo(b.x + b.w, b.y + b.h / 2);
        p.lineTo(b.x + b.w / 2, b.y + b.h);
        p.lineTo(b.x, b.y + b.h / 2);
        p.closePath();
    },
    insetX: (h) => h / 2,
    maxAspect: 1.4,
});

export const BADGE_R = 10;

// leading-edge ornament: a solid disc of the item color with a surface ring, so it reads on any
// treatment (on card/tinted/outline nodes the badge is where the item color shows). Callers place
// it fully inside their surface — surfaces clip at their box, so an overhanging disc renders cut.
export const badgeX = (cellX: number, shapeInset: number): number =>
    cellX + shapeInset + BADGE_R + 2;

export function drawNodeBadge(
    g: DrawContext,
    cx: number,
    cy: number,
    text: string,
    color: string,
    theme: Tokens,
): void {
    g.circle(cx, cy, BADGE_R, { fill: color, stroke: theme.surface, width: 1.5 });
    g.text(text, cx, cy, {
        fill: inkOn(color, theme),
        size: 10.5,
        weight: 700,
        font: nodeFont(theme),
        align: "center",
        baseline: "middle",
    });
}

// the badge text for item i under the `numbers` option; undefined = no badge
export function badgeText(numbers: DiagramNumbers, i: number): string | undefined {
    if (numbers === "number") return String(i + 1);
    if (numbers === "letter") return String.fromCharCode(65 + (i % 26));
    return undefined;
}

// an icon in the badge's disc treatment, for markers that live on chrome (a timeline's spine)
export function drawIconBadge(
    g: DrawContext,
    cx: number,
    cy: number,
    icon: string,
    color: string,
    theme: Tokens,
): boolean {
    const glyph = ICON_LIBRARY[icon];
    if (!glyph) return false;
    g.circle(cx, cy, BADGE_R + 1, { fill: color, stroke: theme.surface, width: 1.5 });
    const s = 12;
    drawIcon(g, glyph, cx - s / 2, cy - s / 2, s, inkOn(color, theme));
    return true;
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

// per-item fills: the opaque ramp punctured by itemsMeta color overrides
export function itemColors(items: DiagItem[], theme: Tokens): string[] {
    return diagramColors(theme, items.length).map(
        (c, i) => resolveItemColor(items[i]?.color, theme) ?? c,
    );
}

// The one cell every type composes: the item's real label/detail children over a treatment fill.
// The element owns tone, as the table owns its cells' — nodes read uniformly however text is styled.
// `transparent` skips the fill for cells whose silhouette a decorate surface paints instead.
export interface CellOpts {
    radius?: number;
    transparent?: boolean;
    pad?: BoxInsets;
    // silhouette-aware composition: an engine-fillable shape carries its radius on the cell fill;
    // an angled one composes transparent (the decorate surface paints it) and insets the text
    shape?: string;
    cellH?: number; // the fixed node height the shape's inset/radius derive from
    badged?: boolean; // a numbering disc sits inside the leading edge; keep the label clear of it
    icon?: string; // ICON_LIBRARY key: a leading glyph in paint.iconInk; replaces the number badge
    iconY?: "center" | "start"; // top-anchored cells (a steps tread) keep the icon with the label
}

export const ICON_S = 16;
const ICON_GAP = 6;

const CELL_PAD: BoxInsets = { top: 8, bottom: 8, left: 10, right: 10 };

export function diagramCell(
    label: EngineNode | undefined,
    detail: EngineNode | undefined,
    paint: NodePaint,
    o: CellOpts = {},
): EngineNode {
    let radius = o.radius;
    let transparent = o.transparent ?? false;
    let pad = o.pad;
    if (o.shape) {
        const def = getNodeShape(o.shape);
        const h = o.cellH ?? 46;
        if (def.engineRadius) {
            radius = radius ?? def.engineRadius(h);
        } else {
            transparent = true;
        }
        const inset = def.insetX(h);
        if (inset > 0) {
            const base = pad ?? CELL_PAD;
            pad = { ...base, left: base.left + inset, right: base.right + inset };
        }
    }
    const glyph = o.icon ? ICON_LIBRARY[o.icon] : undefined;
    if (glyph) {
        // the icon takes the badge's leading slot, so the two never stack up an inset
        const base = pad ?? CELL_PAD;
        pad = { ...base, left: base.left + ICON_S + ICON_GAP };
    } else if (o.badged) {
        const base = pad ?? CELL_PAD;
        pad = { ...base, left: base.left + BADGE_R * 2 + 2 };
    }
    // A fixed-height cell (a funnel band, a process node) budgets its text to the lines that fit,
    // so a long label ellipsizes and a detail the box cannot hold stands down, rather than the
    // engine clipping either mid-word. Types that size their own cells pass no cellH and are
    // unaffected.
    const LABEL_LH = NODE_TEXT * 1.35;
    const DETAIL_LH = 11 * 1.35;
    const avail = o.cellH ? o.cellH - CELL_PAD_Y : Number.POSITIVE_INFINITY;
    // the label is capped at two lines but budgeted as one, the common case, so a normal node keeps
    // its detail; only a genuinely short cell drops it
    const labelLines = o.cellH ? clamp(Math.floor(avail / LABEL_LH), 1, 2) : 0;
    const detailLines = o.cellH
        ? Math.floor((avail - LABEL_LH - CELL_LINE_GAP) / DETAIL_LH)
        : Infinity;
    const kids: EngineNode[] = [];
    if (label?.text) {
        label.text.size = NODE_TEXT;
        label.text.weight = 600;
        label.text.color = paint.ink;
        label.text.align = "center";
        if (o.cellH) label.text.maxLines = labelLines;
        label.w = grow();
        label.h = fit(14);
        kids.push(label);
    }
    // an empty detail slot must not reserve a text row: the label would sit above center; a detail
    // the fixed cell has no room for stands down rather than clipping
    if (detail?.text && detail.text.text.trim() !== "" && detailLines >= 1) {
        detail.text.size = 11;
        detail.text.weight = 500;
        detail.text.color = paint.dim;
        detail.text.align = "center";
        if (o.cellH) detail.text.maxLines = Math.min(detailLines, 3);
        detail.w = grow();
        detail.h = fit(14);
        kids.push(detail);
    }
    if (glyph) {
        const ink = paint.iconInk;
        // floated into the padding band the inset reserved, vertically centred with the text
        kids.push({
            w: fixed(ICON_S),
            h: fixed(ICON_S),
            float: { x: "start", y: o.iconY ?? "center", dx: -(ICON_S + ICON_GAP) },
            surface: { paint: (g) => drawIcon(g, glyph, 0, 0, ICON_S, ink) },
        });
    }
    const node: EngineNode = {
        w: grow(),
        h: grow(),
        padding: pad ?? CELL_PAD,
        alignY: "center",
        gap: 2,
        children: kids,
    };
    if (!transparent) {
        // NodePaint mapped onto the engine FillLeaf (the CSS gradient angle convention: 180 = the
        // same top-to-bottom depth painted nodes get)
        node.fill = {
            color: paint.fill,
            gradient: paint.gradient
                ? { from: paint.gradient.from, to: paint.gradient.to, angle: 180 }
                : undefined,
            border: paint.stroke ? { color: paint.stroke, width: paint.width ?? 1 } : undefined,
            shadow: paint.shadow
                ? `0 ${paint.shadow.dy}px ${paint.shadow.blur}px ${paint.shadow.color}`
                : undefined,
            radius: radius ?? NODE_RADIUS,
        };
    }
    return node;
}

export const CELL_PAD_Y = 16; // diagramCell's top + bottom padding
const CELL_LINE_GAP = 2; // its label/detail gap

// Horizontal space a cell spends before its text: padding, the silhouette's inset at that height,
// and a leading icon. What is left is the width the label actually wraps at.
export function cellChrome(shape: string | undefined, cellH: number, icon?: string): number {
    return 20 + 2 * getNodeShape(shape).insetX(cellH) + (icon ? ICON_S + ICON_GAP : 0);
}

// Height a cell needs for its label alone, and for label plus detail, measured at that width. The
// float-positioned types size their cells from this and hide a detail the box cannot hold.
export function cellHeights(
    ctx: LayoutCtx,
    item: DiagItem,
    innerW: number,
): { label: number; full: number } {
    const font = nodeFont(ctx.theme);
    const w = Math.max(24, innerW);
    const at = (text: string, size: number, weight: number): number =>
        ctx.measure({ text, fontId: font, size, weight, wrap: "words" }, w).height;
    const label = at(item.label, NODE_TEXT, 600) + CELL_PAD_Y;
    const body = item.body ? at(item.body, 11, 500) : 0;
    return { label, full: body ? label + CELL_LINE_GAP + body : label };
}

// chrome behind the composed cells: a full-size float whose surface paints connectors/bands/badges
// from the same geometry the cells were arranged with
export function decorate(paint: (g: DrawContext, box: Rect) => void, z = -1): EngineNode {
    return { w: grow(), h: grow(), float: { x: "start", y: "start", z }, surface: { paint } };
}

// pyramid/funnel band geometry, shared by the label rows and the trapezoid decoration.
// narrowTop → pyramid (even taper); else funnel, where item values scale the widths.
export interface Band {
    y0: number;
    y1: number;
    half0: number;
    half1: number;
}

export function bandGeometry(
    items: DiagItem[],
    W: number,
    H: number,
    narrowTop: boolean,
    minHalf?: number[], // per-item floor (a value-scaled band never narrower than its own label)
): { bands: Band[]; cx: number } {
    const n = items.length;
    const box = { x: 0, y: 0, w: W, h: H };
    const bandH = box.h / Math.max(1, n);
    const cx = W / 2;
    const wide = box.w / 2;
    const narrow = wide * 0.14;
    const vals = items.map((i) => i.value);
    const scaled = !narrowTop && vals.every((v) => v !== undefined && v >= 0);
    const max = scaled ? Math.max(...(vals as number[])) || 1 : 1;
    const halfFor = (i: number): number =>
        clamp(Math.max(((vals[i] as number) / max) * wide, minHalf?.[i] ?? 0), narrow, wide);
    const halfAt = (y: number): number => {
        const t = (y - box.y) / (box.h || 1);
        return narrowTop ? narrow + (wide - narrow) * t : wide - (wide - narrow) * t;
    };
    // even a taper with no values never narrows a band below its own label, or the text clips
    const floorAt = (h: number, i: number): number =>
        clamp(Math.max(h, minHalf?.[i] ?? 0), narrow, wide);
    const bands = items.map((_, i) => {
        const y0 = box.y + i * bandH;
        const y1 = y0 + bandH - 3;
        return {
            y0,
            y1,
            half0: scaled ? halfFor(i) : floorAt(halfAt(y0), i),
            half1: scaled ? halfFor(Math.min(i + 1, n - 1)) : floorAt(halfAt(y1), i),
        };
    });
    return { bands, cx };
}

// the shared pyramid/funnel arrange: transparent label rows over decorate-painted trapezoids
export function bandsArrange(narrowTop: boolean): DiagramType["arrange"] {
    return (diagram, ctx, kids, height) => {
        const items = diagram.items;
        const n = items.length;
        const cols = itemColors(items, ctx.theme);
        const contentW = Math.max(1, ctx.availWidth - 32);
        // label floors are absolute px, so the same array serves arrange and the decorate repaint
        const minHalf = items.map((i) => (labelWidth(ctx, i.label) + 24) / 2);
        const geo = bandGeometry(items, contentW, height - 32, narrowTop, minHalf);
        const bandH = (height - 32) / Math.max(1, n);
        return {
            w: grow(),
            h: fixed(height),
            direction: "col",
            padding: { top: 16, bottom: 16, left: 16, right: 16 },
            children: [
                ...items.map((item, i) => {
                    const band = geo.bands[i]!;
                    const paint = nodePaint(cols[i]!, ctx.theme, {
                        style: diagram.options.style,
                        emphasis: item.emphasis,
                    });
                    const cell = diagramCell(kids[i * 2], kids[i * 2 + 1], paint, {
                        transparent: true,
                        pad: { top: 2, bottom: 2, left: 8, right: 8 },
                        cellH: bandH,
                    });
                    cell.w = percent(
                        clamp((Math.min(band.half0, band.half1) * 2) / contentW, 0.14, 0.9),
                    );
                    return {
                        w: grow(),
                        h: fixed(bandH),
                        alignX: "center",
                        alignY: "center",
                        children: [cell],
                    } satisfies EngineNode;
                }),
                decorate((g, box) => {
                    const inner = bandGeometry(items, box.w, box.h, narrowTop, minHalf);
                    items.forEach((_, i) => {
                        const b = inner.bands[i]!;
                        const paint = nodePaint(cols[i]!, ctx.theme, {
                            style: diagram.options.style,
                            emphasis: items[i]?.emphasis,
                        });
                        g.path(
                            (p) => {
                                p.moveTo(inner.cx - b.half0, b.y0);
                                p.lineTo(inner.cx + b.half0, b.y0);
                                p.lineTo(inner.cx + b.half1, b.y1);
                                p.lineTo(inner.cx - b.half1, b.y1);
                                p.closePath();
                            },
                            {
                                fill: paint.fill,
                                stroke: paint.stroke,
                                width: paint.width,
                                gradient: paint.gradient,
                            },
                        );
                    });
                }),
            ],
        };
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

export const treeLeaves = (n: TreeDatum): number =>
    n.children.length === 0 ? 1 : n.children.reduce((sum, c) => sum + treeLeaves(c), 0);

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
