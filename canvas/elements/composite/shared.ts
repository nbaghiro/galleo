import type { ControlField, ElementSpec, LayoutCtx } from "@elements/spec";
import type { EngineNode } from "@engine/node";
import type { ElementInstance } from "@model/artifact";
import { getElement, GHOST } from "@elements/spec";
import { fit, fixed, grow } from "@model/geometry";
import { FLEX_DIRECTION } from "@model/elements";
import type { FlexDirection } from "@model/elements";

export interface CompositeData {
    children: ElementInstance[];
}

export const t = (text: string, style: string, align?: "start" | "center"): ElementInstance => ({
    type: "text",
    data: align ? { text, style, align } : { text, style },
});
export const avatar = (size: number): ElementInstance => ({ type: "avatar", data: { size } });
export const button = (label: string): ElementInstance => ({ type: "button", data: { label } });

const composeKids = (children: ElementInstance[], ctx: LayoutCtx): EngineNode[] =>
    children.map((inst): EngineNode => {
        const spec = getElement(inst.type);
        return spec ? spec.layout(inst.data, ctx) : { w: grow(), h: fit(10) };
    });

// empty node when a child is deleted, keeps arrange index-safe
export const at = (kids: EngineNode[], i: number): EngineNode => kids[i] ?? { w: grow(), h: fit() };

export const pad = (n: number): { top: number; right: number; bottom: number; left: number } => ({
    top: n,
    right: n,
    bottom: n,
    left: n,
});
// fixed-width ghost bar for skeletons where percent can't resolve
export const gbar = (w: number, h: number): EngineNode => ({
    w: fixed(w),
    h: fixed(h),
    fill: { color: GHOST, radius: Math.min(4, h / 2) },
});

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

// UI order Stack (col) then Row — reverse of FLEX_DIRECTION
const DIRECTION_LABEL: Record<FlexDirection, string> = { col: "Stack", row: "Row" };
const DIRECTION_ICON: Record<FlexDirection, string> = { col: "stack", row: "row" };
export const DIRECTION_OPTIONS: NonNullable<ControlField["options"]> = [...FLEX_DIRECTION]
    .reverse()
    .map((v) => ({ label: DIRECTION_LABEL[v], value: v, icon: DIRECTION_ICON[v] }));
