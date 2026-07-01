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

// --- auto-skeletonize: turn any element's layout output into a ghost ---

// Ghost palette — defaults to the editor's neutral tones; the live-build skeleton passes theme-derived
// colors so the placeholder respects the active artifact theme (dark on dark, etc.).
export interface GhostColors {
    bar: string; // text/leaf placeholders
    panel: string; // container/section backgrounds
    line: string; // borders
}
const DEFAULT_GHOST: GhostColors = { bar: GHOST, panel: GHOST_PANEL, line: GHOST_LINE };

function textBars(text: string, size: number, color: string): EngineNode[] {
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
            fill: { color, radius: Math.min(4, h / 2) },
        });
    }
    return out;
}

export function skeletonize(node: EngineNode, colors: GhostColors = DEFAULT_GHOST): EngineNode {
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
            children: textBars(node.text.text, node.text.size, colors.bar),
        };
    }
    // a media LEAF (an image/surface element with no children) → a single ghost panel sized like it
    if ((node.image || node.surface) && !node.children) {
        return {
            ...base,
            aspect: base.aspect ?? 16 / 9,
            fill: { color: colors.bar, radius: node.image?.radius ?? 8 },
        };
    }
    // any container — INCLUDING a section that carries a background image — ghosts its panel and
    // recurses into its children, so it keeps its real height + grid instead of collapsing to a 16:9 box.
    const out: EngineNode = { ...base };
    if (node.fill || node.image || node.surface) {
        out.fill = {
            color: colors.panel,
            radius: node.fill?.radius ?? node.image?.radius,
            border: node.fill?.border
                ? { color: colors.line, width: node.fill.border.width }
                : undefined,
        };
    }
    if (node.children) out.children = node.children.map((c) => skeletonize(c, colors));
    return out;
}

export function skeletonFor(spec: ElementSpec, ctx: LayoutCtx): EngineNode {
    if (spec.skeleton) return spec.skeleton(ctx);
    return skeletonize(spec.layout(spec.create(), ctx));
}
