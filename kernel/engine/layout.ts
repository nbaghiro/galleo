import type { Align, EngineNode, MeasureText, Rect } from "@engine/node";
import type { Region, RenderCommand } from "@engine/render-command";
import type { Size } from "@model/content";

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

function assignWidth(
    c: EngineNode,
    parentContentW: number,
    fitAvail: number,
    measure: MeasureText,
): number {
    switch (c.w.mode) {
        case "fixed":
            return c.w.value;
        case "percent":
            return parentContentW * c.w.value;
        case "fit":
            return clamp(Math.min(intrinsicWidth(c, measure), fitAvail), c.w);
        case "grow":
            return -1; // resolved by distributing leftover
    }
}

function layoutWidths(node: EngineNode, w: number, measure: MeasureText): LayoutNode {
    const ln: LayoutNode = { node, x: 0, y: 0, w, h: 0, children: [] };
    const kids = node.children ?? [];
    if (kids.length === 0) return ln;

    const contentW = Math.max(0, w - padX(node));
    if (isRow(node)) {
        const gaps = (node.gap ?? 0) * Math.max(0, kids.length - 1);
        const avail = Math.max(0, contentW - gaps);
        const widths = kids.map((c) => assignWidth(c, contentW, avail, measure));
        const fixedSum = widths.filter((x) => x >= 0).reduce((a, b) => a + b, 0);
        const growCount = widths.filter((x) => x < 0).length;
        const growEach = growCount > 0 ? Math.max(0, avail - fixedSum) / growCount : 0;
        kids.forEach((c, i) => {
            const cw = widths[i]! < 0 ? clamp(growEach, c.w) : widths[i]!;
            ln.children.push(layoutWidths(c, cw, measure));
        });
    } else {
        for (const c of kids) {
            const cw =
                c.w.mode === "grow"
                    ? clamp(contentW, c.w)
                    : assignWidth(c, contentW, contentW, measure);
            ln.children.push(layoutWidths(c, cw, measure));
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
    if (!node.children || node.children.length === 0) {
        let intrinsic = 0;
        if (node.text) intrinsic = measure(node.text, ln.w).height;
        else if (node.aspect) intrinsic = ln.w / node.aspect;
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

    // column
    const gaps = (node.gap ?? 0) * Math.max(0, ln.children.length - 1);
    const growKids: LayoutNode[] = [];
    let used = gaps;
    for (const c of ln.children) {
        if (c.node.h.mode === "grow") {
            growKids.push(c);
        } else {
            layoutHeights(c, contentH, measure);
            used += c.h;
        }
    }
    const growEach = growKids.length > 0 ? Math.max(0, contentH - used) / growKids.length : 0;
    for (const c of growKids) layoutHeights(c, growEach, measure);

    const childrenH = ln.children.reduce((sum, c) => sum + c.h, 0) + gaps;
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

    if (isRow(node)) {
        const totalW =
            ln.children.reduce((s, c) => s + c.w, 0) + gap * Math.max(0, ln.children.length - 1);
        let cx = x + cl + mainOffset(contentW - totalW, node.alignX);
        for (const c of ln.children) {
            const cy = y + ct + mainOffset(contentH - c.h, c.node.alignSelf ?? node.alignY);
            layoutPositions(c, cx, cy);
            cx += c.w + gap;
        }
    } else {
        const totalH =
            ln.children.reduce((s, c) => s + c.h, 0) + gap * Math.max(0, ln.children.length - 1);
        let cy = y + ct + mainOffset(contentH - totalH, node.alignY);
        for (const c of ln.children) {
            const cx = x + cl + mainOffset(contentW - c.w, c.node.alignSelf ?? node.alignX);
            layoutPositions(c, cx, cy);
            cy += c.h + gap;
        }
    }
}

// --- flatten to render commands (background fill first, then children) ---

function emit(ln: LayoutNode, commands: RenderCommand[], regions: Region[]): void {
    const { node } = ln;
    const box: Rect = { x: ln.x, y: ln.y, w: ln.w, h: ln.h };
    if (node.id) regions.push({ id: node.id, box });
    if (node.fill) commands.push({ kind: "rect", box, fill: node.fill, id: node.id });
    if (node.image) commands.push({ kind: "image", box, image: node.image, id: node.id });
    if (node.text) commands.push({ kind: "text", box, text: node.text, id: node.id });
    if (node.surface)
        commands.push({ kind: "surface", box, paint: node.surface.paint, id: node.id });
    for (const c of ln.children) emit(c, commands, regions);
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
