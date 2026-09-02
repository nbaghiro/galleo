import type { ControlField, ElementSpec, LayoutCtx } from "@elements/spec";
import type { EngineNode } from "@engine/node";
import type { ElementInstance } from "@model/artifact";
import { getElement } from "@elements/spec";
import { fit, grow } from "@model/geometry";
import type { FlexDirection } from "@model/elements";

export interface CompositeData {
    children: ElementInstance[];
}

export const t = (text: string, style: string, align?: "start" | "center"): ElementInstance => ({
    type: "text",
    data: align ? { text, style, align } : { text, style },
});
export const avatar = (size: number): ElementInstance => ({
    type: "media",
    data: { kind: "photo", shape: "circle", size },
});
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

export function composite(
    type: string,
    label: string,
    create: () => CompositeData,
    arrange: (d: CompositeData, ctx: LayoutCtx, kids: EngineNode[]) => EngineNode,
): ElementSpec<CompositeData> {
    return {
        type,
        label,
        category: "composite",
        tier: "unit",
        create,
        layout: (d, ctx) => arrange(d, ctx, composeKids(d.children, ctx)),
        container: {
            children: (d) => d.children,
            arrange,
            withChildren: (d, children) => ({ ...d, children }),
            // a smart block is a unit: its children edit in place (testimonial/faq even index
            // into fixed slots), and the block moves whole — unlike the freeform card/group
            closed: true,
        },
        controls: [],
    };
}

const DIRECTION_LABEL: Record<FlexDirection, string> = { col: "Stack", row: "Row", grid: "Grid" };
const DIRECTION_ICON: Record<FlexDirection, string> = { col: "stack", row: "row", grid: "grid" };
const DIRECTION_ORDER: readonly FlexDirection[] = ["col", "row", "grid"]; // UI order, Stack first
export const DIRECTION_OPTIONS: NonNullable<ControlField["options"]> = DIRECTION_ORDER.map((v) => ({
    label: DIRECTION_LABEL[v],
    value: v,
    icon: DIRECTION_ICON[v],
}));
