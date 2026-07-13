import type { Align, EngineNode, MeasureText, Rect, Region, RenderCommand } from "@engine/node";
import type { Size } from "@model/geometry";

// Mutable working node: the input EngineNode + its resolved box, filled across three passes then flattened to commands.
interface LayoutNode {
    node: EngineNode;
    x: number;
    y: number;
    w: number;
    h: number;
    children: LayoutNode[];
    // Explicit `clip` plus an overflow axis the height pass adds for a bounded box shorter than its content; `emit` reads this, not `node.clip`.
    clip?: { x?: boolean; y?: boolean };
}

const mergeClip = (
    a: { x?: boolean; y?: boolean } | undefined,
    b: { x?: boolean; y?: boolean },
): { x?: boolean; y?: boolean } => ({ x: a?.x || b.x, y: a?.y || b.y });

const padX = (n: EngineNode): number => (n.padding?.left ?? 0) + (n.padding?.right ?? 0);
const padY = (n: EngineNode): number => (n.padding?.top ?? 0) + (n.padding?.bottom ?? 0);
const isRow = (n: EngineNode): boolean => n.direction === "row";
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

// Fit children to `avail`: underflow grows `grow` children toward max, overflow shrinks any above min toward min. Fixed/percent never move; at the limits the remainder overflows. Sizes index-aligned with `spans`.
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
    const kids = n.children ?? [];
    if (kids.length === 0) return 0; // image/fill/surface have no intrinsic width
    const childW = (c: EngineNode): number =>
        c.w.mode === "fixed" ? c.w.value : c.w.mode === "fit" ? intrinsicWidth(c, measure) : 0;
    if (isRow(n)) {
        const gaps = (n.gap ?? 0) * Math.max(0, kids.length - 1);
        return padX(n) + gaps + kids.reduce((sum, c) => sum + childW(c), 0);
    }
    return padX(n) + kids.reduce((mx, c) => Math.max(mx, childW(c)), 0);
}

// percent/fit resolve against `avail` (row space after gaps); fit can shrink to `min` on overflow, reflowing its text taller in the height pass.
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
    if (isRow(node)) {
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

function layoutHeights(ln: LayoutNode, assignedH: number, measure: MeasureText): void {
    const node = ln.node;
    // Aspect boxes size height from width/aspect regardless of content; children lay out within the resolved box.
    if (node.aspect) {
        ln.h = resolveHeight(node.h, assignedH, ln.w / node.aspect);
        const inner = Math.max(0, ln.h - padY(node));
        for (const c of ln.children) layoutHeights(c, inner, measure);
        ln.clip = mergeClip(ln.clip, { x: true, y: true }); // fixed-ratio frame crops overflowing children
        return;
    }

    if (!node.children || node.children.length === 0) {
        let intrinsic = 0;
        if (node.text) intrinsic = measure(node.text, ln.w).height;
        ln.h = resolveHeight(node.h, assignedH, intrinsic);
        return;
    }

    const contentH = Math.max(0, assignedH - padY(node));
    if (isRow(node)) {
        // Measure non-grow children first to set the row's cross height, then stretch grow children to it. In a `fit` row it's the tallest sibling, not the container — else a `grow` bar fills the unbounded measurement height.
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
        const crossH = node.h.mode === "fit" ? maxH : contentH;
        for (const c of growKids) {
            layoutHeights(c, crossH, measure);
            maxH = Math.max(maxH, c.h);
        }
        ln.h = resolveHeight(node.h, assignedH, maxH + padY(node));
        // A bounded row shorter than its tallest child clips the vertical overflow.
        if (ln.h + 0.5 < maxH + padY(node)) ln.clip = mergeClip(ln.clip, { y: true });
        return;
    }

    // Non-grow children resolve to natural height; grow children fill the leftover via the grow/shrink pass. fit stays pinned (min == base == max) — vertical shrink would clip content.
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
    const heights = distribute(spans, Math.max(0, contentH - gaps));
    flow.forEach((c, i) => {
        if (c.node.h.mode === "grow") layoutHeights(c, heights[i]!, measure);
    });
    for (const c of ln.children) if (c.node.float) layoutHeights(c, contentH, measure);

    const childrenH = flow.reduce((sum, c) => sum + c.h, 0) + gaps;
    ln.h = resolveHeight(node.h, assignedH, childrenH + padY(node));
    // A bounded column (anything but `fit`) shorter than its content clips the overflow.
    if (ln.h + 0.5 < childrenH + padY(node)) ln.clip = mergeClip(ln.clip, { y: true });
}

function mainOffset(extra: number, align: Align | undefined): number {
    if (extra <= 0) return 0;
    if (align === "center") return extra / 2;
    if (align === "end") return extra;
    return 0;
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

    if (isRow(node)) {
        const totalW = flow.reduce((s, c) => s + c.w, 0) + gap * Math.max(0, flow.length - 1);
        let cx = x + cl + mainOffset(contentW - totalW, node.alignX);
        for (const c of flow) {
            const cy = y + ct + mainOffset(contentH - c.h, c.node.alignSelf ?? node.alignY);
            layoutPositions(c, cx, cy);
            cx += c.w + gap;
        }
    } else {
        const totalH = flow.reduce((s, c) => s + c.h, 0) + gap * Math.max(0, flow.length - 1);
        let cy = y + ct + mainOffset(contentH - totalH, node.alignY);
        for (const c of flow) {
            const cx = x + cl + mainOffset(contentW - c.w, c.node.alignSelf ?? node.alignX);
            layoutPositions(c, cx, cy);
            cy += c.h + gap;
        }
    }
    // Floats placed over the flow, aligned within the content box + a dx/dy offset.
    for (const c of ln.children) {
        if (!c.node.float) continue;
        const f = c.node.float;
        const fx = x + cl + mainOffset(contentW - c.w, f.x) + (f.dx ?? 0);
        const fy = y + ct + mainOffset(contentH - c.h, f.y) + (f.dy ?? 0);
        layoutPositions(c, fx, fy);
    }
}

const CLIP_INF = 1e7; // stand-in for "unbounded" on a non-clipped axis

// Intersect the incoming clip with `box` on the axes this node bounds. Undefined incoming clip = unbounded on both axes.
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
): void {
    const { node } = ln;
    const acc = node.opacity !== undefined ? opacity * node.opacity : opacity;
    const o = acc < 1 ? acc : undefined;
    const box: Rect = { x: ln.x, y: ln.y, w: ln.w, h: ln.h };
    if (node.id)
        regions.push({ id: node.id, box, radius: node.fill?.radius ?? node.image?.radius });
    // This node's paint carries the ancestor clip; descendants also clip to its box.
    if (node.fill)
        commands.push({ kind: "rect", box, fill: node.fill, id: node.id, opacity: o, clip });
    if (node.image)
        commands.push({ kind: "image", box, image: node.image, id: node.id, opacity: o, clip });
    if (node.text)
        commands.push({ kind: "text", box, text: node.text, id: node.id, opacity: o, clip });
    if (node.surface)
        commands.push({
            kind: "surface",
            box,
            paint: node.surface.paint,
            id: node.id,
            opacity: o,
            clip,
        });
    const childClip = ln.clip ? clipRect(clip, box, ln.clip) : clip;
    // Flow first, then floats (ascending `z`) so overlays paint on top.
    for (const c of ln.children) if (!c.node.float) emit(c, commands, regions, acc, childClip);
    ln.children
        .filter((c) => c.node.float)
        .sort((a, b) => (a.node.float?.z ?? 0) - (b.node.float?.z ?? 0))
        .forEach((c) => emit(c, commands, regions, acc, childClip));
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

// Greedy pagination: break at the lowest command bottom-edge inside the page that cuts no other command; hard-break only when a single block is taller than the page. Each page's commands offset to y = 0.

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
            // candidate breaks: bottom edges inside this page
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
