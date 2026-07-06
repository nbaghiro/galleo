import type { DrawContext } from "@engine/node";
import type { Tokens } from "@themes/theme";
import { mix } from "@themes/theme";
import { hierarchy, tree, type HierarchyPointNode } from "d3-hierarchy";
import { drawNode, nodeText } from "./chrome";
import { registerDiagram } from "./registry";
import type { DiagramCtx, ResolvedDiagram } from "./types";

// The nested shape d3-hierarchy lays out — one per diagram node, `children` in parent→child order.
interface TreeDatum {
    label: string;
    children: TreeDatum[];
}

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

// Fold `nodes` + `edges` into a rooted tree. Root = the node that is never an edge `to`; with no edges
// the first node becomes the root and the rest its direct children (a star). Cycles/diamonds are cut by
// visiting each node once.
function buildTree(diagram: ResolvedDiagram): TreeDatum | null {
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

// One measured, uniform box width for the whole tree (clamped so long labels wrap instead of overflowing).
function boxWidth(
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

interface Placed {
    node: HierarchyPointNode<TreeDatum>;
    cx: number;
    cy: number;
}

// Run a d3 `tree()` layout at natural node spacing, then uniformly scale it to fit the (W,H) box (never
// upscaling past the natural gaps). `horizontal` swaps the axes for a left→right mind-map orientation.
function layoutTree(
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

// A top-down tree: rounded boxes joined by smooth vertical S-curves.
function renderTree(diagram: ResolvedDiagram, ctx: DiagramCtx): void {
    const { g, W, H, theme } = ctx;
    if (diagram.nodes.length === 0) return;
    const data = buildTree(diagram);
    if (!data) return;

    const nodeH = 34;
    const nodeW = boxWidth(
        g,
        theme,
        diagram.nodes.map((n) => n.label),
        96,
        80,
        132,
    );
    const { root, placed } = layoutTree(data, W, H, nodeW, nodeH, false);
    const pos = new Map(placed.map((p) => [p.node, p] as const));
    const link = mix(theme.line, theme.surface, 0.2);

    for (const l of root.links()) {
        const s = pos.get(l.source);
        const t = pos.get(l.target);
        if (!s || !t) continue;
        const y1 = s.cy + nodeH / 2;
        const y2 = t.cy - nodeH / 2;
        const my = (y1 + y2) / 2;
        g.path(
            (p) => {
                p.moveTo(s.cx, y1);
                p.bezierCurveTo(s.cx, my, t.cx, my, t.cx, y2);
            },
            { stroke: link, width: 1.5 },
        );
    }

    for (const p of placed) {
        drawNode(g, p.cx - nodeW / 2, p.cy - nodeH / 2, nodeW, nodeH, p.node.data.label, theme, {
            radius: 10,
        });
    }
}

// An org chart: square-ish boxes, orthogonal (vertical→horizontal→vertical) elbows, accent-filled root.
function renderOrg(diagram: ResolvedDiagram, ctx: DiagramCtx): void {
    const { g, W, H, theme } = ctx;
    if (diagram.nodes.length === 0) return;
    const data = buildTree(diagram);
    if (!data) return;

    const nodeH = 42;
    const nodeW = boxWidth(
        g,
        theme,
        diagram.nodes.map((n) => n.label),
        92,
        82,
        128,
    );
    const { root, placed } = layoutTree(data, W, H, nodeW, nodeH, false);
    const pos = new Map(placed.map((p) => [p.node, p] as const));

    for (const l of root.links()) {
        const s = pos.get(l.source);
        const t = pos.get(l.target);
        if (!s || !t) continue;
        const y1 = s.cy + nodeH / 2;
        const y2 = t.cy - nodeH / 2;
        const my = (y1 + y2) / 2;
        g.polyline(
            [
                [s.cx, y1],
                [s.cx, my],
                [t.cx, my],
                [t.cx, y2],
            ],
            { stroke: theme.accent, width: 1.5 },
        );
    }

    for (const p of placed) {
        const isRoot = p.node.depth === 0;
        drawNode(g, p.cx - nodeW / 2, p.cy - nodeH / 2, nodeW, nodeH, p.node.data.label, theme, {
            radius: 6,
            fill: isRoot ? theme.accent : theme.surface,
            stroke: theme.accent,
            ink: isRoot ? theme.onAccent : theme.ink,
        });
    }
}

// A mind map: root anchored left-center, branches fanning rightward. Curved links + node strokes are
// tinted per top-level branch from the theme palette.
function renderMindmap(diagram: ResolvedDiagram, ctx: DiagramCtx): void {
    const { g, W, H, theme } = ctx;
    if (diagram.nodes.length === 0) return;
    const data = buildTree(diagram);
    if (!data) return;

    const nodeH = 32;
    const nodeW = boxWidth(
        g,
        theme,
        diagram.nodes.map((n) => n.label),
        104,
        84,
        138,
    );
    const { root, placed } = layoutTree(data, W, H, nodeW, nodeH, true);
    const pos = new Map(placed.map((p) => [p.node, p] as const));

    // Map every descendant to the index of its top-level branch (root's direct child).
    const branchOf = new Map<HierarchyPointNode<TreeDatum>, number>();
    const branches = root.children ?? [];
    branches.forEach((child, i) => {
        for (const d of child.descendants()) branchOf.set(d, i);
    });
    const cols = ctx.colors(Math.max(1, branches.length));
    const branchColor = (n: HierarchyPointNode<TreeDatum>): string =>
        cols[(branchOf.get(n) ?? 0) % cols.length]!;

    for (const l of root.links()) {
        const s = pos.get(l.source);
        const t = pos.get(l.target);
        if (!s || !t) continue;
        const x1 = s.cx + nodeW / 2;
        const x2 = t.cx - nodeW / 2;
        const mx = (x1 + x2) / 2;
        g.path(
            (p) => {
                p.moveTo(x1, s.cy);
                p.bezierCurveTo(mx, s.cy, mx, t.cy, x2, t.cy);
            },
            { stroke: branchColor(l.target), width: 1.8 },
        );
    }

    for (const p of placed) {
        const isRoot = p.node.depth === 0;
        drawNode(g, p.cx - nodeW / 2, p.cy - nodeH / 2, nodeW, nodeH, p.node.data.label, theme, {
            radius: 16,
            fill: isRoot ? theme.accent : theme.surface,
            stroke: isRoot ? theme.accent : branchColor(p.node),
            ink: isRoot ? theme.onAccent : theme.ink,
        });
    }
}

registerDiagram({ id: "tree", label: "Tree", render: renderTree });
registerDiagram({ id: "org", label: "Org chart", render: renderOrg });
registerDiagram({ id: "mindmap", label: "Mind map", render: renderMindmap });
