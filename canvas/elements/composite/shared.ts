// Composite blocks — pre-structured elements built from real `text`/`icon`/`avatar`/`bullets`/`button`
// children (each individually selectable + editable), following the `stat`/`quote` pattern. They arrange
// their children by position; `container` exposes them for compose recursion + content ops. Category is
// `composite` so they sit in the Composite rail alongside card/group. Each ships a hand-crafted
// `skeleton` (the ghost shown as the live drop preview when added to the canvas).
//
// Shared machinery + helpers used across the composite element files live here.

import type { ControlField, ElementSpec, LayoutCtx } from "@elements/spec";
import type { EngineNode } from "@engine/node";
import type { ElementInstance } from "@model/artifact";
import { getElement, GHOST } from "@elements/spec";
import { fit, fixed, grow } from "@model/geometry";
import { FLEX_DIRECTION } from "@model/elements/composite";
import type { FlexDirection } from "@model/elements/composite";

export interface CompositeData {
    children: ElementInstance[];
}

// --- child-instance builders (author the default content) ---
export const t = (text: string, style: string, align?: "start" | "center"): ElementInstance => ({
    type: "text",
    data: align ? { text, style, align } : { text, style },
});
export const avatar = (size: number): ElementInstance => ({ type: "avatar", data: { size } });
export const button = (label: string): ElementInstance => ({ type: "button", data: { label } });

// Compose each child instance to its render node (recurses through nested containers via their layout).
const composeKids = (children: ElementInstance[], ctx: LayoutCtx): EngineNode[] =>
    children.map((inst): EngineNode => {
        const spec = getElement(inst.type);
        return spec ? spec.layout(inst.data, ctx) : { w: grow(), h: fit(10) };
    });

// Child at index i, or an empty node if the user has deleted it (keeps arrange index-safe).
export const at = (kids: EngineNode[], i: number): EngineNode => kids[i] ?? { w: grow(), h: fit() };

export const pad = (n: number): { top: number; right: number; bottom: number; left: number } => ({
    top: n,
    right: n,
    bottom: n,
    left: n,
});
// A ghost text bar of a fixed width (for skeletons where percent-width can't resolve).
export const gbar = (w: number, h: number): EngineNode => ({
    w: fixed(w),
    h: fixed(h),
    fill: { color: GHOST, radius: Math.min(4, h / 2) },
});

// Build a composite spec from an arrange fn + default children (+ an optional hand-crafted skeleton).
export function composite(
    type: string,
    label: string,
    create: () => CompositeData,
    arrange: (d: CompositeData, ctx: LayoutCtx, kids: EngineNode[]) => EngineNode,
    skeleton?: (ctx: LayoutCtx) => EngineNode,
): ElementSpec<CompositeData> {
    return {
        type,
        label,
        category: "composite",
        tier: "smart",
        create,
        layout: (d, ctx) => arrange(d, ctx, composeKids(d.children, ctx)),
        container: {
            children: (d) => d.children,
            arrange,
            withChildren: (d, children) => ({ ...d, children }),
        },
        controls: [],
        ...(skeleton ? { skeleton } : {}),
    };
}

// The card/group "Direction" segmented options. UI order is Stack (col) then Row (row) — the reverse
// of FLEX_DIRECTION's [row, col] — each with a leading glyph naming it on the compact format bar.
const DIRECTION_LABEL: Record<FlexDirection, string> = { col: "Stack", row: "Row" };
const DIRECTION_ICON: Record<FlexDirection, string> = { col: "stack", row: "row" };
export const DIRECTION_OPTIONS: NonNullable<ControlField["options"]> = [...FLEX_DIRECTION]
    .reverse()
    .map((v) => ({ label: DIRECTION_LABEL[v], value: v, icon: DIRECTION_ICON[v] }));
