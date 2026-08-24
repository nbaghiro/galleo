import type { Align, EngineNode, MeasureText, Rect, Region, RenderCommand } from "@engine/node";
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

// Row-major fill: flow child k sits in column k % cols, row floor(k / cols).
function columnsOf<T>(flow: T[], cols: number): T[][] {
    const out: T[][] = Array.from({ length: cols }, () => []);
    flow.forEach((c, k) => out[k % cols]!.push(c));
    return out;
}
function rowsOf<T>(flow: T[], cols: number): T[][] {
    const out: T[][] = [];
    for (let i = 0; i < flow.length; i += cols) out.push(flow.slice(i, i + cols));
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

function intrinsicWidth(n: EngineNode, measure: MeasureText): number {
    if (n.text) return measure(n.text, Number.POSITIVE_INFINITY).width;
    if (n.image?.natural) return n.image.natural.w;
    const kids = n.children ?? [];
    if (kids.length === 0) return 0; // a fill/surface (or a sizeless image) has no intrinsic width
    if (isGrid(n)) {
        const cols = colCount(n);
        const tracks = columnsOf(
            kids.filter((c) => !c.float),
            cols,
        );
        const sum = tracks.reduce((a, m) => a + columnSpan(m, 0, measure).base, 0);
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
        // One shared track per column, solved by the same distribute() a row uses.
        const cols = colCount(node);
        const flow = kids.filter((c) => !c.float);
        const avail = Math.max(0, contentW - (node.gap ?? 0) * (cols - 1));
        const widths = distribute(
            columnsOf(flow, cols).map((m) => columnSpan(m, avail, measure)),
            avail,
        );
        let fi = 0;
        for (const c of kids) {
            const cw = c.float ? crossWidth(c, contentW, measure) : widths[fi++ % cols]!;
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
        const flow = ln.children.filter((c) => !c.node.float);
        const gridRows = rowsOf(flow, colCount(node));
        let total = (node.rowGap ?? node.gap ?? 0) * Math.max(0, gridRows.length - 1);
        for (const members of gridRows) {
            let rowH = 0;
            const growKids: LayoutNode[] = [];
            for (const c of members) {
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
        for (const c of ln.children) if (c.node.float) layoutHeights(c, contentH, measure);
        ln.h = resolveHeight(h, assignedH, total + padY(node));
        if (ln.h + 0.5 < total + padY(node)) ln.clip = mergeClip(ln.clip, { y: true });
        return;
    }
    if (isRow(node)) {
        // A `fit` row's cross height is its tallest sibling, not the container's unbounded measurement height.
        let maxH = 0;
        const growKids: LayoutNode[] = [];
        for (const c of ln.children) {
            if (c.node.float) {
                layoutHeights(c, contentH, measure); // independent of the row's cross height
                continue;
            }
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
    for (const c of ln.children) if (c.node.float) layoutHeights(c, contentH, measure);

    const childrenH = flow.reduce((sum, c) => sum + c.h, 0) + gaps;
    ln.h = resolveHeight(h, assignedH, childrenH + padY(node));
    if (ln.h + 0.5 < childrenH + padY(node)) ln.clip = mergeClip(ln.clip, { y: true });
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

function layoutPositions(ln: LayoutNode, x: number, y: number): void {
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
        const colW = columnsOf(flow, cols).map((m) => m.reduce((mx, c) => Math.max(mx, c.w), 0));
        const rowH = rowsOf(flow, cols).map((m) => m.reduce((mx, c) => Math.max(mx, c.h), 0));
        const rg = node.rowGap ?? gap;
        let cy = y + ct;
        for (let r = 0; r < rowH.length; r++) {
            let cx = x + cl;
            for (let i = 0; i < cols; i++) {
                const c = flow[r * cols + i];
                if (!c) break;
                const off = mainOffset(rowH[r]! - c.h, c.node.alignSelf ?? node.alignY);
                layoutPositions(c, cx, cy + off);
                cx += colW[i]! + gap;
            }
            cy += rowH[r]! + rg;
        }
    } else if (isRow(node)) {
        const totalW = flow.reduce((s, c) => s + c.w, 0) + gap * Math.max(0, flow.length - 1);
        const extra = contentW - totalW;
        const sp = spread(node.distribute, extra, flow.length);
        let cx = x + cl + (node.distribute ? sp.lead : mainOffset(extra, node.alignX));
        for (const c of flow) {
            const cy = y + ct + mainOffset(contentH - c.h, c.node.alignSelf ?? node.alignY);
            layoutPositions(c, cx, cy);
            cx += c.w + gap + sp.gap;
        }
    } else {
        const totalH = flow.reduce((s, c) => s + c.h, 0) + gap * Math.max(0, flow.length - 1);
        const extra = contentH - totalH;
        const sp = spread(node.distribute, extra, flow.length);
        let cy = y + ct + (node.distribute ? sp.lead : mainOffset(extra, node.alignY));
        for (const c of flow) {
            const cx = x + cl + mainOffset(contentW - c.w, c.node.alignSelf ?? node.alignX);
            layoutPositions(c, cx, cy);
            cy += c.h + gap + sp.gap;
        }
    }
    for (const c of ln.children) {
        if (!c.node.float) continue;
        const f = c.node.float;
        const fx = x + cl + mainOffset(contentW - c.w, f.x) + (f.dx ?? 0);
        const fy = y + ct + mainOffset(contentH - c.h, f.y) + (f.dy ?? 0);
        layoutPositions(c, fx, fy);
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
    opacity = 1,
    clip?: Rect,
    link?: string,
    decor = false,
): void {
    const { node } = ln;
    const acc = node.opacity !== undefined ? opacity * node.opacity : opacity;
    const o = acc < 1 ? acc : undefined;
    // A link covers everything it wraps: the commands are flat siblings, so a descendant painted
    // over the anchor would otherwise swallow the click.
    const href = node.link ?? link;
    const dec = decor ? { decor: true as const } : {};
    const box: Rect = { x: ln.x, y: ln.y, w: ln.w, h: ln.h };
    if (node.id)
        regions.push({ id: node.id, box, radius: node.fill?.radius ?? node.image?.radius });
    // A surface reports its own sub-element geometry box-relative; only emit knows where the box sits.
    if (node.surface?.regions)
        for (const r of node.surface.regions({ x: 0, y: 0, w: ln.w, h: ln.h }))
            regions.push(offsetRegion(r, ln.x, ln.y));
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
    if (node.text)
        commands.push({
            kind: "text",
            box,
            text: node.text,
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
        if ((c.node.float?.z ?? 0) < 0) emit(c, commands, regions, acc, childClip, href, true);
    for (const c of ln.children)
        if (!c.node.float) emit(c, commands, regions, acc, childClip, href, decor);
    for (const c of floats)
        if ((c.node.float?.z ?? 0) >= 0) emit(c, commands, regions, acc, childClip, href, decor);
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
    layoutPositions(ln, container.x, container.y);
    const commands: RenderCommand[] = [];
    const regions: Region[] = [];
    emit(ln, commands, regions);
    return { commands, regions };
}

// Greedy: break at the lowest bottom edge that splits no command; each page's commands shift to y = 0.

const EPS = 0.5;

function shiftY(c: RenderCommand, dy: number): RenderCommand {
    const box = { ...c.box, y: c.box.y + dy };
    return c.clip ? { ...c, box, clip: { ...c.clip, y: c.clip.y + dy } } : { ...c, box };
}

export function fragment(
    commands: RenderCommand[],
    totalHeight: number,
    pageHeight: number,
): RenderCommand[][] {
    if (totalHeight <= pageHeight + EPS || pageHeight <= 0) return [commands.map((c) => c)];

    const sorted = [...commands].sort((a, b) => a.box.y - b.box.y);
    const pages: RenderCommand[][] = [];
    let top = 0;
    let guard = 0;

    while (top < totalHeight - EPS && guard++ < 4096) {
        const limit = top + pageHeight;
        let breakY = Math.min(limit, totalHeight);

        if (limit < totalHeight) {
            const cands = sorted
                .map((c) => c.box.y + c.box.h)
                .filter((y) => y > top + EPS && y <= limit + EPS);
            cands.push(limit); // hard-break fallback
            cands.sort((a, b) => b - a);
            breakY = limit;
            for (const y of cands) {
                if (y <= top + EPS) continue;
                const splits = sorted.some((c) => c.box.y < y - EPS && c.box.y + c.box.h > y + EPS);
                if (!splits) {
                    breakY = y;
                    break;
                }
            }
        }

        const pageCmds = sorted
            .filter((c) => c.box.y < breakY - EPS && c.box.y + c.box.h > top + EPS)
            .map((c) => shiftY(c, -top));
        pages.push(pageCmds);
        top = breakY > top + EPS ? breakY : limit; // always make progress
    }

    return pages;
}
