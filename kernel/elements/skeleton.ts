import type { ElementSpec, LayoutCtx } from "@elements/element-spec";
import type { EngineNode } from "@engine/node";
import { fit, fixed, grow, percent } from "@model/size";

// Skeletons are structural ghosts shown in the element palette and as drop previews while dragging
// an element over a section. Every element gets one automatically (from layout() of default data,
// ghosted); a spec may override `skeleton` for a richer shape (chart, table, ...).

export const GHOST = "#e3ddce"; // bars / boxes
export const GHOST_PANEL = "#f4f0e8"; // panel backgrounds
export const GHOST_LINE = "#e0d9c8"; // borders

// --- ghost building blocks (reusable by custom skeletons) ---

export const bar = (widthFrac: number, h: number): EngineNode => ({
    w: percent(widthFrac),
    h: fixed(h),
    fill: { color: GHOST, radius: Math.min(4, h / 2) },
});

export const block = (aspect: number): EngineNode => ({
    w: grow(),
    h: fit(),
    aspect,
    fill: { color: GHOST, radius: 8 },
});

export const pill = (widthFrac: number, h: number): EngineNode => ({
    w: percent(widthFrac),
    h: fixed(h),
    fill: { color: GHOST, radius: 99 },
});

export const dot = (d: number): EngineNode => ({
    w: fixed(d),
    h: fixed(d),
    fill: { color: GHOST, radius: 99 },
});

export const gcol = (gap: number, children: EngineNode[]): EngineNode => ({
    w: grow(),
    h: fit(),
    direction: "col",
    gap,
    children,
});

export const grow_ = (gap: number, children: EngineNode[]): EngineNode => ({
    w: grow(),
    h: fit(),
    direction: "row",
    gap,
    children,
});

// --- auto-skeletonize: turn any element's layout output into a ghost ---

function textBars(text: string, size: number): EngineNode[] {
    const h = Math.max(6, Math.round(size * 0.6));
    const len = text.trim().length || 6;
    const lines = len > 60 ? 3 : len > 20 ? 2 : 1;
    const out: EngineNode[] = [];
    for (let i = 0; i < lines; i++) {
        const last = i === lines - 1;
        const frac = lines === 1 ? Math.min(1, Math.max(0.25, len / 36)) : last ? 0.55 : 1;
        out.push({
            w: percent(frac),
            h: fixed(h),
            fill: { color: GHOST, radius: Math.min(4, h / 2) },
        });
    }
    return out;
}

export function skeletonize(node: EngineNode): EngineNode {
    const base: EngineNode = {
        w: node.w,
        h: node.h,
        aspect: node.aspect,
        direction: node.direction,
        padding: node.padding,
        gap: node.gap,
        alignX: node.alignX,
        alignY: node.alignY,
    };
    if (node.text) {
        return {
            ...base,
            direction: "col",
            gap: Math.max(6, Math.round(node.text.size * 0.4)),
            children: textBars(node.text.text, node.text.size),
        };
    }
    if (node.image || node.surface) {
        return {
            ...base,
            aspect: base.aspect ?? 16 / 9,
            fill: { color: GHOST, radius: node.image?.radius ?? 8 },
        };
    }
    const out: EngineNode = { ...base };
    if (node.fill) {
        out.fill = {
            color: GHOST_PANEL,
            radius: node.fill.radius,
            border: node.fill.border
                ? { color: GHOST_LINE, width: node.fill.border.width }
                : undefined,
        };
    }
    if (node.children) out.children = node.children.map(skeletonize);
    return out;
}

export function skeletonFor(spec: ElementSpec, ctx: LayoutCtx): EngineNode {
    if (spec.skeleton) return spec.skeleton(ctx);
    return skeletonize(spec.layout(spec.create(), ctx));
}
