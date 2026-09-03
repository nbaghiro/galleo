import type {
    Align,
    EngineNode,
    MeasureText,
    Rect,
    Region,
    RenderCommand,
    Rotation,
} from "@engine/node";
import type { Size } from "@model/geometry";

// Mutable working node: the resolved box, filled across the three passes, then flattened to commands.
interface LayoutNode {
    node: EngineNode;
    x: number;
    y: number;
    w: number;
    h: number;
    children: LayoutNode[];
    // The height pass adds axes here for a bounded box shorter than its content; `emit` reads this, not `node.clip`.
    clip?: { x?: boolean; y?: boolean };
}

const mergeClip = (
    a: { x?: boolean; y?: boolean } | undefined,
    b: { x?: boolean; y?: boolean },
): { x?: boolean; y?: boolean } => ({ x: a?.x || b.x, y: a?.y || b.y });

const padX = (n: EngineNode): number => (n.padding?.left ?? 0) + (n.padding?.right ?? 0);
const padY = (n: EngineNode): number => (n.padding?.top ?? 0) + (n.padding?.bottom ?? 0);
const isRow = (n: EngineNode): boolean => n.direction === "row";
const isGrid = (n: EngineNode): boolean => n.direction === "grid";
const colCount = (n: EngineNode): number => Math.max(1, Math.round(n.columns ?? 1));

const spanOf = (n: EngineNode, cols: number): number =>
    Math.max(1, Math.min(cols, Math.round(n.span ?? 1)));

interface Placed<T> {
    item: T;
    row: number;
    col: number;
    span: number;
}

// Row-major fill: a cell takes `span` consecutive tracks and wraps to the next row when the
// current one cannot hold it. With no spans this is exactly column k % cols, row floor(k / cols).
function placeGrid<T>(flow: T[], cols: number, span: (t: T) => number): Placed<T>[] {
    const out: Placed<T>[] = [];
    let row = 0;
    let col = 0;
    for (const item of flow) {
        const s = span(item);
        if (col + s > cols) {
            row++;
            col = 0;
        }
        out.push({ item, row, col, span: s });
        col += s;
        if (col >= cols) {
            row++;
            col = 0;
        }
    }
    return out;
}

// Track membership for sizing: single-track cells only. A spanner is sized by its tracks and never
// sizes them — the rule that keeps track solving single-pass — so a track populated only by
// spanners sizes as empty, which is visible and author-fixable rather than a silent wrong answer.
function trackMembers<T>(placed: Placed<T>[], cols: number): T[][] {
    const out: T[][] = Array.from({ length: cols }, () => []);
    for (const p of placed) if (p.span === 1) out[p.col]!.push(p.item);
    return out;
}

function placedRows<T>(placed: Placed<T>[]): Placed<T>[][] {
    const out: Placed<T>[][] = [];
    for (const p of placed) (out[p.row] ??= []).push(p);
    return out;
}
const clamp = (v: number, s: Size): number => {
    let out = v;
    if (s.mode === "fit" || s.mode === "grow") {
        if (s.min !== undefined) out = Math.max(out, s.min);
        if (s.max !== undefined) out = Math.min(out, s.max);
    }
    return out;
};

// Fixed/percent are exact: min == base == max.
interface Span {
    base: number;
    min: number;
    max: number;
    grow: boolean;
}

// Grow/shrink into `avail`; fixed/percent never move, so at the limits the remainder overflows.
function distribute(spans: Span[], avail: number): number[] {
    const size = spans.map((s) => s.base);
    let slack = avail - size.reduce((a, b) => a + b, 0);
    let guard = 0;
    while (Math.abs(slack) > 0.5 && guard++ < 64) {
        const growing = slack > 0;
        const movable = spans.flatMap((s, i) =>
            growing
                ? s.grow && size[i]! < s.max - 0.5
                    ? [i]
                    : []
                : size[i]! > s.min + 0.5
                  ? [i]
                  : [],
        );
        if (!movable.length) break;
        const step = slack / movable.length;
        let moved = 0;
        for (const i of movable) {
            const room = growing ? spans[i]!.max - size[i]! : spans[i]!.min - size[i]!;
            const delta = growing ? Math.min(step, room) : Math.max(step, room);
            size[i]! += delta;
            moved += delta;
        }
        slack -= moved;
        if (Math.abs(moved) < 0.5) break;
    }
    return size;
}

// Exported for callers that size a floating container to its content before laying it out: the
// solver assigns the container width to the root unconditionally, so hugging happens above it.
export function intrinsicWidth(n: EngineNode, measure: MeasureText): number {
    if (n.text) return measure(n.text, Number.POSITIVE_INFINITY).width;
    if (n.image?.natural) return n.image.natural.w;
    const kids = n.children ?? [];
    if (kids.length === 0) return 0; // a fill/surface (or a sizeless image) has no intrinsic width
    if (isGrid(n)) {
        const cols = colCount(n);
        const placed = placeGrid(
            kids.filter((c) => !c.float),
            cols,
            (c) => spanOf(c, cols),
        );
        const sum = trackMembers(placed, cols).reduce(
            (a, m) => a + columnSpan(m, 0, measure).base,
            0,
        );
        return padX(n) + (n.gap ?? 0) * (cols - 1) + sum;
    }
    const childW = (c: EngineNode): number =>
        c.w.mode === "fixed" ? c.w.value : c.w.mode === "fit" ? intrinsicWidth(c, measure) : 0;
    if (isRow(n)) {
        const gaps = (n.gap ?? 0) * Math.max(0, kids.length - 1);
        return padX(n) + gaps + kids.reduce((sum, c) => sum + childW(c), 0);
    }
    return padX(n) + kids.reduce((mx, c) => Math.max(mx, childW(c)), 0);
}

// `avail` is row space after gaps; fit can shrink to `min`, reflowing its text taller in the height pass.
function widthSpan(c: EngineNode, avail: number, measure: MeasureText): Span {
    switch (c.w.mode) {
        case "fixed":
            return { base: c.w.value, min: c.w.value, max: c.w.value, grow: false };
        case "percent": {
            const v = avail * c.w.value;
            return { base: v, min: v, max: v, grow: false };
        }
        case "fit": {
            const base = clamp(intrinsicWidth(c, measure), c.w);
            return { base, min: c.w.min ?? 0, max: base, grow: false };
        }
        case "grow":
            return {
                base: c.w.min ?? 0,
                min: c.w.min ?? 0,
                max: c.w.max ?? Number.POSITIVE_INFINITY,
                grow: true,
            };
    }
}

// One grid column's shared track, composed from its members: a fixed/percent member pins it, a grow
// member lets it stretch, otherwise it fits the widest member. A non-pinned member also floors the
// track at its own intrinsic width, so a track sizes to content the way a table column does.
function columnSpan(members: EngineNode[], avail: number, measure: MeasureText): Span {
    let pinned = -1;
    let base = 0;
    let min = 0;
    let max = 0;
    let grow = false;
    for (const m of members) {
        const s = widthSpan(m, avail, measure);
        if (m.w.mode === "fixed" || m.w.mode === "percent") {
            pinned = Math.max(pinned, s.base);
            continue;
        }
        base = Math.max(base, s.base, clamp(intrinsicWidth(m, measure), m.w));
        min = Math.max(min, s.min);
        max = Math.max(max, s.max);
        grow ||= s.grow;
    }
    if (pinned >= 0) return { base: pinned, min: pinned, max: pinned, grow: false };
    const b = Math.max(base, min); // a track never starts below a member's floor
    return { base: b, min, max: grow ? Math.max(max, b) : b, grow };
}

// Column children size independently against content width — no grow/shrink between siblings.
function crossWidth(c: EngineNode, contentW: number, measure: MeasureText): number {
    switch (c.w.mode) {
        case "grow":
            return clamp(contentW, c.w);
        case "fixed":
            return c.w.value;
        case "percent":
            return contentW * c.w.value;
        case "fit":
            return clamp(Math.min(intrinsicWidth(c, measure), contentW), c.w);
    }
}

function layoutWidths(node: EngineNode, w: number, measure: MeasureText): LayoutNode {
    const ln: LayoutNode = { node, x: 0, y: 0, w, h: 0, children: [], clip: node.clip };
    const kids = node.children ?? [];
    if (kids.length === 0) return ln;

    const contentW = Math.max(0, w - padX(node));
    if (isGrid(node)) {
        // One shared track per column, solved by the same distribute() a row uses; a spanning
        // cell's width is its tracks plus the gaps between them.
        const cols = colCount(node);
        const gap = node.gap ?? 0;
        const flow = kids.filter((c) => !c.float);
        const avail = Math.max(0, contentW - gap * (cols - 1));
        const placed = placeGrid(flow, cols, (c) => spanOf(c, cols));
        const widths = distribute(
            trackMembers(placed, cols).map((m) => columnSpan(m, avail, measure)),
            avail,
        );
        const at = new Map<EngineNode, Placed<EngineNode>>(placed.map((p) => [p.item, p]));
        for (const c of kids) {
            const p = at.get(c);
            const cw = !p
                ? crossWidth(c, contentW, measure)
                : widths.slice(p.col, p.col + p.span).reduce((a, b) => a + b, 0) +
                  gap * (p.span - 1);
            ln.children.push(layoutWidths(c, cw, measure));
        }
    } else if (isRow(node)) {
        // Flow children share the row's width; floats size independently against the content box.
        const flow = kids.filter((c) => !c.float);
        const gaps = (node.gap ?? 0) * Math.max(0, flow.length - 1);
        const avail = Math.max(0, contentW - gaps);
        const widths = distribute(
            flow.map((c) => widthSpan(c, avail, measure)),
            avail,
        );
        let fi = 0;
        for (const c of kids) {
            const cw = c.float ? crossWidth(c, contentW, measure) : widths[fi++]!;
            ln.children.push(layoutWidths(c, cw, measure));
        }
    } else {
        for (const c of kids) {
            ln.children.push(layoutWidths(c, crossWidth(c, contentW, measure), measure));
        }
    }
    return ln;
}

function resolveHeight(s: Size, assigned: number, intrinsic: number): number {
    switch (s.mode) {
        case "fixed":
            return s.value;
        case "percent":
            return assigned * s.value;
        case "grow":
            return clamp(assigned, s);
        case "fit":
            return clamp(intrinsic, s);
    }
}

// `as` resolves this node against a different height mode than its own: a grid row measures a
// grow-height member at its natural height before stretching it, so the call must be re-entrant.
function layoutHeights(ln: LayoutNode, assignedH: number, measure: MeasureText, as?: Size): void {
    const node = ln.node;
    const h = as ?? node.h;
    ln.clip = node.clip;
    // Aspect boxes take height from width/aspect regardless of content.
    if (node.aspect) {
        ln.h = resolveHeight(h, assignedH, ln.w / node.aspect);
        const inner = Math.max(0, ln.h - padY(node));
        for (const c of ln.children) layoutHeights(c, inner, measure);
        ln.clip = mergeClip(ln.clip, { x: true, y: true }); // fixed-ratio frame crops overflowing children
        return;
    }

    if (!node.children || node.children.length === 0) {
        let intrinsic = 0;
        if (node.text) intrinsic = measure(node.text, ln.w).height;
        ln.h = resolveHeight(h, assignedH, intrinsic);
        return;
    }

    // A box with a height of its own lays its children out inside THAT, not inside whatever the
    // parent offered: otherwise a fixed 600px column hands its children the container's assignment.
    const ownH =
        h.mode === "fixed" ? h.value : h.mode === "percent" ? assignedH * h.value : assignedH;
    const contentH = Math.max(0, ownH - padY(node));
    if (isGrid(node)) {
        const cols = colCount(node);
        const flow = ln.children.filter((c) => !c.node.float);
        const gridRows = placedRows(placeGrid(flow, cols, (c) => spanOf(c.node, cols)));
        let total = (node.rowGap ?? node.gap ?? 0) * Math.max(0, gridRows.length - 1);
        for (const members of gridRows) {
            let rowH = 0;
            const growKids: LayoutNode[] = [];
            for (const { item: c } of members) {
                if (c.node.h.mode === "grow") {
                    // measured as fit first: a row of only grow members has nothing else to stretch to
                    layoutHeights(c, contentH, measure, {
                        mode: "fit",
                        min: c.node.h.min,
                        max: c.node.h.max,
                    });
                    growKids.push(c);
                } else layoutHeights(c, contentH, measure);
                rowH = Math.max(rowH, c.h);
            }
            for (const c of growKids) layoutHeights(c, rowH, measure);
            total += rowH;
        }
        ln.h = resolveHeight(h, assignedH, total + padY(node));
        if (ln.h + 0.5 < total + padY(node)) ln.clip = mergeClip(ln.clip, { y: true });
        layoutFloats(ln, measure);
        return;
    }
    if (isRow(node)) {
        // A `fit` row's cross height is its tallest sibling, not the container's unbounded measurement height.
        let maxH = 0;
        const growKids: LayoutNode[] = [];
        for (const c of ln.children) {
            if (c.node.float) continue;
            if (c.node.h.mode === "grow") {
                growKids.push(c);
                continue;
            }
            layoutHeights(c, contentH, measure);
            maxH = Math.max(maxH, c.h);
        }
        const crossH = h.mode === "fit" ? maxH : contentH;
        for (const c of growKids) {
            layoutHeights(c, crossH, measure);
            maxH = Math.max(maxH, c.h);
        }
        ln.h = resolveHeight(h, assignedH, maxH + padY(node));
        if (ln.h + 0.5 < maxH + padY(node)) ln.clip = mergeClip(ln.clip, { y: true });
        layoutFloats(ln, measure);
        return;
    }

    // Non-grow children pin at their natural height (min == base == max): vertical shrink would clip content.
    const flow = ln.children.filter((c) => !c.node.float);
    const gaps = (node.gap ?? 0) * Math.max(0, flow.length - 1);
    const spans: Span[] = flow.map((c) => {
        if (c.node.h.mode === "grow") {
            const min = c.node.h.min ?? 0;
            return { base: min, min, max: c.node.h.max ?? Number.POSITIVE_INFINITY, grow: true };
        }
        layoutHeights(c, contentH, measure);
        return { base: c.h, min: c.h, max: c.h, grow: false };
    });
    // A `fit` column's height IS its children, so there is no free space to hand out and a grow child
    // sits at its own minimum. Without this it swallows the container's assigned height, which for a
    // section is the 100000 "unbounded" sentinel.
    const target =
        h.mode === "fit"
            ? spans.reduce((sum, sp) => sum + sp.base, 0)
            : Math.max(0, contentH - gaps);
    const heights = distribute(spans, target);
    flow.forEach((c, i) => {
        if (c.node.h.mode === "grow") layoutHeights(c, heights[i]!, measure);
    });

    const childrenH = flow.reduce((sum, c) => sum + c.h, 0) + gaps;
    ln.h = resolveHeight(h, assignedH, childrenH + padY(node));
    if (ln.h + 0.5 < childrenH + padY(node)) ln.clip = mergeClip(ln.clip, { y: true });
    layoutFloats(ln, measure);
}

// Floats resolve against the RESOLVED height, never the assignment: at a fit-height section root
// the assignment is the unbounded sentinel, and a grow-height float must not swallow it.
function layoutFloats(ln: LayoutNode, measure: MeasureText): void {
    const inner = Math.max(0, ln.h - padY(ln.node));
    for (const c of ln.children) if (c.node.float) layoutHeights(c, inner, measure);
}

// "baseline" resolves before this is called; a grid or column treats it as start
const asBoxAlign = (a: Align | "baseline" | undefined): Align | undefined =>
    a === "baseline" ? "start" : a;

// First baseline of a height-resolved subtree, from its own top: a text leaf answers from its
// measured first line; a container from its first flow child's lead plus that child's baseline.
// Null when nothing in the first-child chain carries text.
function firstBaseline(ln: LayoutNode, measure: MeasureText): number | null {
    const n = ln.node;
    if (n.text) {
        const b = measure(n.text, ln.w).lines?.[0]?.baseline;
        return b === undefined ? null : b;
    }
    const first = ln.children.find((c) => !c.node.float);
    if (!first) return null;
    const fb = firstBaseline(first, measure);
    return fb === null ? null : (n.padding?.top ?? 0) + fb;
}

function mainOffset(extra: number, align: Align | undefined): number {
    if (extra <= 0) return 0;
    if (align === "center") return extra / 2;
    if (align === "end") return extra;
    return 0;
}

// Leading offset + per-gap addition for `distribute`; zeros mean alignment governs as before.
function spread(
    mode: EngineNode["distribute"],
    extra: number,
    n: number,
): { lead: number; gap: number } {
    if (!mode || extra <= 0.5 || n === 0) return { lead: 0, gap: 0 };
    if (mode === "between") return n < 2 ? { lead: 0, gap: 0 } : { lead: 0, gap: extra / (n - 1) };
    if (mode === "around") return { lead: extra / (2 * n), gap: extra / n };
    return { lead: extra / (n + 1), gap: extra / (n + 1) };
}

function layoutPositions(ln: LayoutNode, x: number, y: number, measure: MeasureText): void {
    ln.x = x;
    ln.y = y;
    const node = ln.node;
    if (ln.children.length === 0) return;

    const cl = node.padding?.left ?? 0;
    const ct = node.padding?.top ?? 0;
    const contentW = Math.max(0, ln.w - padX(node));
    const contentH = Math.max(0, ln.h - padY(node));
    const gap = node.gap ?? 0;
    const flow = ln.children.filter((c) => !c.node.float);

    if (isGrid(node)) {
        const cols = colCount(node);
        const placed = placeGrid(flow, cols, (c) => spanOf(c.node, cols));
        // a laid-out single-span member's width IS its track's solved width
        const colW = trackMembers(placed, cols).map((m) =>
            m.reduce((mx, c) => Math.max(mx, c.w), 0),
        );
        const lead = (col: number): number => {
            let o = 0;
            for (let i = 0; i < col; i++) o += colW[i]! + gap;
            return o;
        };
        const rg = node.rowGap ?? gap;
        let cy = y + ct;
        for (const members of placedRows(placed)) {
            const rowH = members.reduce((mx, p) => Math.max(mx, p.item.h), 0);
            for (const p of members) {
                const off = mainOffset(
                    rowH - p.item.h,
                    asBoxAlign(p.item.node.alignSelf ?? node.alignY),
                );
                layoutPositions(p.item, x + cl + lead(p.col), cy + off, measure);
            }
            cy += rowH + rg;
        }
    } else if (isRow(node)) {
        const totalW = flow.reduce((s, c) => s + c.w, 0) + gap * Math.max(0, flow.length - 1);
        const extra = contentW - totalW;
        const sp = spread(node.distribute, extra, flow.length);
        // children meeting at a baseline share the deepest first baseline among them
        const onBaseline = (c: LayoutNode): boolean =>
            (c.node.alignSelf ?? node.alignY) === "baseline";
        const deepest = flow.reduce((mx, c) => {
            if (!onBaseline(c)) return mx;
            return Math.max(mx, firstBaseline(c, measure) ?? c.h);
        }, 0);
        let cx = x + cl + (node.distribute ? sp.lead : mainOffset(extra, node.alignX));
        for (const c of flow) {
            let cy: number;
            if (onBaseline(c)) {
                const fb = firstBaseline(c, measure);
                cy = y + ct + deepest - (fb ?? c.h); // no baseline: box bottom sits on it
            } else {
                cy =
                    y +
                    ct +
                    mainOffset(contentH - c.h, asBoxAlign(c.node.alignSelf ?? node.alignY));
            }
            layoutPositions(c, cx, cy, measure);
            cx += c.w + gap + sp.gap;
        }
    } else {
        const totalH = flow.reduce((s, c) => s + c.h, 0) + gap * Math.max(0, flow.length - 1);
        const extra = contentH - totalH;
        const sp = spread(node.distribute, extra, flow.length);
        let cy = y + ct + (node.distribute ? sp.lead : mainOffset(extra, asBoxAlign(node.alignY)));
        for (const c of flow) {
            const cx =
                x + cl + mainOffset(contentW - c.w, asBoxAlign(c.node.alignSelf) ?? node.alignX);
            layoutPositions(c, cx, cy, measure);
            cy += c.h + gap + sp.gap;
        }
    }
    for (const c of ln.children) {
        if (!c.node.float) continue;
        const f = c.node.float;
        const fx = x + cl + mainOffset(contentW - c.w, f.x) + (f.dx ?? 0);
        const fy = y + ct + mainOffset(contentH - c.h, f.y) + (f.dy ?? 0);
        layoutPositions(c, fx, fy, measure);
    }
}

const CLIP_INF = 1e7; // stand-in for "unbounded" on a non-clipped axis

// Intersects the incoming clip with `box` on the bounded axes; an undefined parent is unbounded.
function clipRect(parent: Rect | undefined, box: Rect, cfg: { x?: boolean; y?: boolean }): Rect {
    const l = Math.max(cfg.x ? box.x : -CLIP_INF, parent ? parent.x : -CLIP_INF);
    const t = Math.max(cfg.y ? box.y : -CLIP_INF, parent ? parent.y : -CLIP_INF);
    const r = Math.min(cfg.x ? box.x + box.w : CLIP_INF, parent ? parent.x + parent.w : CLIP_INF);
    const b = Math.min(cfg.y ? box.y + box.h : CLIP_INF, parent ? parent.y + parent.h : CLIP_INF);
    return { x: l, y: t, w: Math.max(0, r - l), h: Math.max(0, b - t) };
}

function emit(
    ln: LayoutNode,
    commands: RenderCommand[],
    regions: Region[],
    measure: MeasureText,
    opacity = 1,
    clip?: Rect,
    link?: string,
    decor = false,
    rot?: Rotation,
): void {
    const { node } = ln;
    const acc = node.opacity !== undefined ? opacity * node.opacity : opacity;
    const o = acc < 1 ? acc : undefined;
    // A link covers everything it wraps: the commands are flat siblings, so a descendant painted
    // over the anchor would otherwise swallow the click.
    const href = node.link ?? link;
    // The outermost rotated node fixes the center; descendants inherit it so the subtree turns as one.
    const spin =
        rot ??
        (node.rotate ? { deg: node.rotate, cx: ln.x + ln.w / 2, cy: ln.y + ln.h / 2 } : undefined);
    const dec = { ...(decor ? { decor: true as const } : {}), ...(spin ? { rotate: spin } : {}) };
    const box: Rect = { x: ln.x, y: ln.y, w: ln.w, h: ln.h };
    if (node.id) {
        const r: Region = { id: node.id, box, radius: node.fill?.radius ?? node.image?.radius };
        regions.push(spin ? rotateRegion(r, spin) : r);
    }
    // A surface reports its own sub-element geometry box-relative; only emit knows where the box sits.
    if (node.surface?.regions)
        for (const r of node.surface.regions({ x: 0, y: 0, w: ln.w, h: ln.h })) {
            const placed = offsetRegion(r, ln.x, ln.y);
            regions.push(spin ? rotateRegion(placed, spin) : placed);
        }
    // This node's paint carries the ancestor clip; descendants also clip to its box.
    if (node.fill)
        commands.push({
            kind: "rect",
            box,
            fill: node.fill,
            id: node.id,
            opacity: o,
            clip,
            link: href,
            ...dec,
        });
    if (node.image)
        commands.push({
            kind: "image",
            box,
            image: node.image,
            id: node.id,
            opacity: o,
            clip,
            link: href,
            ...dec,
        });
    // the memoized measurement at this exact (leaf, width) — the height pass already paid for it
    if (node.text)
        commands.push({
            kind: "text",
            box,
            text: node.text,
            lines: measure(node.text, ln.w).lines,
            id: node.id,
            opacity: o,
            clip,
            link: href,
            ...dec,
        });
    if (node.surface)
        commands.push({
            kind: "surface",
            box,
            paint: node.surface.paint,
            id: node.id,
            opacity: o,
            clip,
            link: href,
            ...dec,
        });
    const childClip = ln.clip ? clipRect(clip, box, ln.clip) : clip;
    // Negative-z floats are decoration and paint under the flow; the rest are overlays on top.
    const floats = ln.children
        .filter((c) => c.node.float)
        .sort((a, b) => (a.node.float?.z ?? 0) - (b.node.float?.z ?? 0));
    for (const c of floats)
        if ((c.node.float?.z ?? 0) < 0)
            emit(c, commands, regions, measure, acc, childClip, href, true, spin);
    for (const c of ln.children)
        if (!c.node.float) emit(c, commands, regions, measure, acc, childClip, href, decor, spin);
    for (const c of floats)
        if ((c.node.float?.z ?? 0) >= 0)
            emit(c, commands, regions, measure, acc, childClip, href, decor, spin);
}

// The polygon of the region turned about the rotation center; `box` becomes the bounding box, so
// `inRegion`'s box gate still passes and selection chrome has an axis-aligned outline to draw.
// Exported for Present, which recovers regions from paginated commands rather than from emit.
export function rotateRegion(r: Region, rot: Rotation): Region {
    const rad = (rot.deg * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const turn = ([px, py]: [number, number]): [number, number] => [
        rot.cx + (px - rot.cx) * cos - (py - rot.cy) * sin,
        rot.cy + (px - rot.cx) * sin + (py - rot.cy) * cos,
    ];
    const b = r.box;
    const pts: [number, number][] = r.shape?.points ?? [
        [b.x, b.y],
        [b.x + b.w, b.y],
        [b.x + b.w, b.y + b.h],
        [b.x, b.y + b.h],
    ];
    const points = pts.map(turn);
    const xs = points.map((p) => p[0]);
    const ys = points.map((p) => p[1]);
    const x = Math.min(...xs);
    const y = Math.min(...ys);
    return {
        ...r,
        box: { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y },
        shape: { kind: "poly", points },
    };
}

function offsetRegion(r: Region, dx: number, dy: number): Region {
    const box = { x: r.box.x + dx, y: r.box.y + dy, w: r.box.w, h: r.box.h };
    if (!r.shape) return { ...r, box };
    const points = r.shape.points.map(([px, py]): [number, number] => [px + dx, py + dy]);
    return { ...r, box, shape: { kind: "poly", points } };
}

export function layout(
    node: EngineNode,
    container: Rect,
    measure: MeasureText,
): { commands: RenderCommand[]; regions: Region[] } {
    const ln = layoutWidths(node, container.w, measure);
    layoutHeights(ln, container.h, measure);
    layoutPositions(ln, container.x, container.y, measure);
    const commands: RenderCommand[] = [];
    const regions: Region[] = [];
    emit(ln, commands, regions, measure);
    return { commands, regions };
}

// Greedy: break at the lowest bottom edge that splits no command — or, failing that, at a line
// boundary inside a paragraph — and each page's commands shift to y = 0.

const EPS = 0.5;
// a line-boundary break must leave at least this many lines on each side of the cut
const KEEP_LINES = 2;

function shiftY(c: RenderCommand, dy: number): RenderCommand {
    const out = { ...c, box: { ...c.box, y: c.box.y + dy } };
    if (c.clip) out.clip = { ...c.clip, y: c.clip.y + dy };
    // the rotation pivot was baked in stage coordinates at emit time; it must ride the page shift
    if (c.rotate) out.rotate = { ...c.rotate, cy: c.rotate.cy + dy };
    return out;
}

const lineCount = (c: RenderCommand): number =>
    c.kind === "text" && c.lines
        ? c.lineRange
            ? c.lineRange.end - c.lineRange.start
            : c.lines.length
        : 0;

const lineHeightOf = (c: Extract<RenderCommand, { kind: "text" }>): number =>
    c.lines!.length > 1 ? c.lines![1]!.y - c.lines![0]!.y : c.box.h;

// interior line tops (stage space, relative to the command's current window) that keep the guard
function lineBreaks(c: RenderCommand, top: number, limit: number): number[] {
    const count = lineCount(c);
    if (c.kind !== "text" || count < KEEP_LINES * 2) return [];
    const lh = lineHeightOf(c);
    const out: number[] = [];
    for (let i = KEEP_LINES; i <= count - KEEP_LINES; i++) {
        const y = c.box.y + i * lh;
        if (y > top + EPS && y <= limit + EPS) out.push(y);
    }
    return out;
}

// slice the command's current window at [cutStart, cutEnd), indices relative to that window
function lineSlice(
    c: Extract<RenderCommand, { kind: "text" }>,
    cutStart: number,
    cutEnd: number,
): RenderCommand {
    const lh = lineHeightOf(c);
    const base = c.lineRange?.start ?? 0;
    return {
        ...c,
        box: { ...c.box, y: c.box.y + cutStart * lh, h: (cutEnd - cutStart) * lh },
        lineRange: { start: base + cutStart, end: base + cutEnd },
    };
}

/** The command's painted vertical extent: a rotated box's turned corners, else the box itself. */
export function rotatedExtent(c: RenderCommand): { top: number; bottom: number } {
    const b = c.box;
    if (!c.rotate) return { top: b.y, bottom: b.y + b.h };
    const rad = (c.rotate.deg * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const ys = (
        [
            [b.x, b.y],
            [b.x + b.w, b.y],
            [b.x + b.w, b.y + b.h],
            [b.x, b.y + b.h],
        ] as const
    ).map(([px, py]) => c.rotate!.cy + (px - c.rotate!.cx) * sin + (py - c.rotate!.cy) * cos);
    return { top: Math.min(...ys), bottom: Math.max(...ys) };
}

// Emit order is z-order, so pages are assembled in it and never re-sorted; the extents exist only
// to find breaks, and a rotated command breaks by its painted (turned) extent, not its flat box.
interface Win {
    c: RenderCommand;
    top: number;
    bottom: number;
}
const win = (c: RenderCommand): Win => ({ c, ...rotatedExtent(c) });

export function fragment(
    commands: RenderCommand[],
    totalHeight: number,
    pageHeight: number,
): RenderCommand[][] {
    if (totalHeight <= pageHeight + EPS || pageHeight <= 0) return [commands.map((c) => c)];

    let wins = commands.map(win);
    const pages: RenderCommand[][] = [];
    let top = 0;
    let guard = 0;

    while (top < totalHeight - EPS && guard++ < 4096) {
        const limit = top + pageHeight;
        let breakY = Math.min(limit, totalHeight);
        let atLine = false;

        if (limit < totalHeight) {
            const cands = wins
                .map((w) => w.bottom)
                .filter((y) => y > top + EPS && y <= limit + EPS);
            cands.push(limit); // hard-break fallback
            cands.sort((a, b) => b - a);
            breakY = limit;
            for (const y of cands) {
                if (y <= top + EPS) continue;
                const splits = wins.some((w) => w.top < y - EPS && w.bottom > y + EPS);
                if (!splits) {
                    breakY = y;
                    break;
                }
                if (y >= limit - EPS) {
                    // the hard limit would slice glyphs: prefer the lowest line boundary that
                    // splits only text commands, cutting each between lines instead
                    const lines = wins
                        .flatMap((w) => (w.c.rotate ? [] : lineBreaks(w.c, top, limit)))
                        .sort((a, b) => b - a);
                    // a candidate must land on EVERY crossing paragraph's own grid with the guard
                    // kept on both sides, or the cut mis-windows the ones it wasn't derived from
                    const cleanCut = (w: Win, ly: number): boolean => {
                        if (w.top >= ly - EPS || w.bottom <= ly + EPS) return true; // not crossing
                        if (w.c.kind !== "text" || !w.c.lines || w.c.rotate) return false;
                        const lh = lineHeightOf(w.c);
                        const cut = Math.round((ly - w.c.box.y) / lh);
                        return (
                            Math.abs(w.c.box.y + cut * lh - ly) <= EPS &&
                            cut >= KEEP_LINES &&
                            cut <= lineCount(w.c) - KEEP_LINES
                        );
                    };
                    for (const ly of lines) {
                        if (wins.every((w) => cleanCut(w, ly))) {
                            breakY = ly;
                            atLine = true;
                            break;
                        }
                    }
                }
            }
        }

        const pageCmds: RenderCommand[] = [];
        for (const w of wins) {
            if (w.top >= breakY - EPS || w.bottom <= top + EPS) continue;
            const crosses = w.top < breakY - EPS && w.bottom > breakY + EPS;
            if (atLine && crosses && w.c.kind === "text" && w.c.lines && !w.c.rotate) {
                const cut = Math.round((breakY - w.c.box.y) / lineHeightOf(w.c));
                if (cut > 0 && cut < lineCount(w.c))
                    pageCmds.push(shiftY(lineSlice(w.c, 0, cut), -top));
                continue;
            }
            pageCmds.push(shiftY(w.c, -top));
        }
        pages.push(pageCmds);

        if (atLine) {
            // the next page carries each cut command's remaining window
            wins = wins.map((w) => {
                if (!(w.top < breakY - EPS && w.bottom > breakY + EPS)) return w;
                if (w.c.kind !== "text" || !w.c.lines || w.c.rotate) return w;
                const cut = Math.round((breakY - w.c.box.y) / lineHeightOf(w.c));
                return cut > 0 && cut < lineCount(w.c)
                    ? win(lineSlice(w.c, cut, lineCount(w.c)))
                    : w;
            });
        }
        top = breakY > top + EPS ? breakY : limit; // always make progress
    }

    return pages;
}
