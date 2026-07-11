import type { Align, EngineNode, MeasureText, Rect, Region, RenderCommand } from "@engine/node";
import type { Size } from "@model/geometry";

// The working node the box solver builds and mutates: a back-pointer to the immutable input
// EngineNode plus its resolved box (x/y/w/h), filled in across three passes (widths -> heights ->
// positions), then flattened to render commands. Internal to this module.
interface LayoutNode {
    node: EngineNode;
    x: number;
    y: number;
    w: number;
    h: number;
    children: LayoutNode[];
}

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

// --- Clay-style grow/shrink sizing along the main axis ---

// A child's resolvable size range on one axis: its natural `base`, the `min` it can shrink to, the `max`
// it can grow to, and whether it participates in growing. Fixed/percent are exact (min == base == max).
interface Span {
    base: number;
    min: number;
    max: number;
    grow: boolean;
}

// Grow/shrink children to fit `avail` (Clay's grow/shrink pass). Underflow → grow the `grow` children
// toward max, sharing the surplus; overflow → shrink any child still above its min toward min, sharing the
// deficit. Fixed/percent (min == base == max) never move; once everything is at its limit the remainder
// just overflows (nothing left to give). Returns the resolved sizes, index-aligned with `spans`.
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

// --- intrinsic ("fit") width: the natural content width a node wants ---

function intrinsicWidth(n: EngineNode, measure: MeasureText): number {
    if (n.text) return measure(n.text, Number.POSITIVE_INFINITY).width;
    const kids = n.children ?? [];
    if (kids.length === 0) return 0; // image/fill/surface have no intrinsic width here
    const childW = (c: EngineNode): number =>
        c.w.mode === "fixed" ? c.w.value : c.w.mode === "fit" ? intrinsicWidth(c, measure) : 0;
    if (isRow(n)) {
        const gaps = (n.gap ?? 0) * Math.max(0, kids.length - 1);
        return padX(n) + gaps + kids.reduce((sum, c) => sum + childW(c), 0);
    }
    return padX(n) + kids.reduce((mx, c) => Math.max(mx, childW(c)), 0);
}

// --- pass 1: widths (top-down; parent assigns each child's final width) ---

// A child's width range for the main-axis distribute. percent/fit resolve against `avail` (the row's
// space after gaps), so 60% + 40% + a gap fills exactly; fit carries its content width as base and can
// shrink to `min` on overflow (which reflows its text taller in the height pass).
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

// Cross-axis width for a column's children (each sizes independently to the column's content width; no
// grow/shrink between siblings). grow fills, others take their intrinsic/percent/fixed width.
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
    const ln: LayoutNode = { node, x: 0, y: 0, w, h: 0, children: [] };
    const kids = node.children ?? [];
    if (kids.length === 0) return ln;

    const contentW = Math.max(0, w - padX(node));
    if (isRow(node)) {
        // Only flow children share the row's width; floats are sized independently against the content box.
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

// --- pass 2: heights (text measured at its resolved width; grow shares leftover) ---

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
    // Aspect-ratio boxes size their height from width/aspect regardless of content — a video's play
    // button or an image's overlay caption is a child, but the box must still hold its 16:9 (etc). Any
    // children are laid out within the resolved box and placed via align.
    if (node.aspect) {
        ln.h = resolveHeight(node.h, assignedH, ln.w / node.aspect);
        const inner = Math.max(0, ln.h - padY(node));
        for (const c of ln.children) layoutHeights(c, inner, measure);
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
        // Measure non-grow children first to establish the row's cross height; grow-height children
        // then stretch to it. In a `fit` row that height is the tallest sibling (not the container) —
        // otherwise a `grow` bar would fill the unbounded measurement height.
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
        return;
    }

    // column: non-grow children resolve to their natural height; grow children start at their floor and
    // fill the leftover (up to max) via the same grow/shrink pass. fit children keep their content height
    // (pinned min == base == max) — vertical shrink would clip content, which is a clip-container concern.
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
}

// --- pass 3: positions (top-down) ---

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
    // Floating children are placed over the flow, aligned within the content box + a dx/dy offset.
    for (const c of ln.children) {
        if (!c.node.float) continue;
        const f = c.node.float;
        const fx = x + cl + mainOffset(contentW - c.w, f.x) + (f.dx ?? 0);
        const fy = y + ct + mainOffset(contentH - c.h, f.y) + (f.dy ?? 0);
        layoutPositions(c, fx, fy);
    }
}

// --- flatten to render commands (background fill first, then children) ---

function emit(ln: LayoutNode, commands: RenderCommand[], regions: Region[], opacity = 1): void {
    const { node } = ln;
    const acc = node.opacity !== undefined ? opacity * node.opacity : opacity;
    const o = acc < 1 ? acc : undefined; // carried on each command in the subtree
    const box: Rect = { x: ln.x, y: ln.y, w: ln.w, h: ln.h };
    if (node.id)
        regions.push({ id: node.id, box, radius: node.fill?.radius ?? node.image?.radius });
    if (node.fill) commands.push({ kind: "rect", box, fill: node.fill, id: node.id, opacity: o });
    if (node.image)
        commands.push({ kind: "image", box, image: node.image, id: node.id, opacity: o });
    if (node.text) commands.push({ kind: "text", box, text: node.text, id: node.id, opacity: o });
    if (node.surface)
        commands.push({ kind: "surface", box, paint: node.surface.paint, id: node.id, opacity: o });
    // Flow first, then floats (ascending `z`) so an attached overlay paints on top of its parent's content.
    for (const c of ln.children) if (!c.node.float) emit(c, commands, regions, acc);
    ln.children
        .filter((c) => c.node.float)
        .sort((a, b) => (a.node.float?.z ?? 0) - (b.node.float?.z ?? 0))
        .forEach((c) => emit(c, commands, regions, acc));
}

// Resolve a node tree into absolute-positioned paint commands + interaction regions (for nodes
// carrying an id) within a container rect.
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

// --- pagination ---

// Pagination/fragmentation: slice a tall flow of render commands into fixed-height pages. Greedy
// "good, not optimal" (the doc's recommended first cut): break at the lowest command bottom-edge
// that lies within the page and doesn't cut through any other command; hard-break only when a single
// block is taller than the page. Each returned page's commands are offset to start at y = 0.

const EPS = 0.5;

function shiftY(c: RenderCommand, dy: number): RenderCommand {
    return { ...c, box: { ...c.box, y: c.box.y + dy } };
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
            // candidate breaks: every command's bottom edge that falls inside this page
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
