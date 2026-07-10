import type { ElementSpec, LayoutCtx } from "@elements/spec";
import type { EngineNode } from "@engine/node";
import type { ElementInstance } from "@model/artifact";
import { getElement, register, bar } from "@elements/spec";
import { fit, grow } from "@model/geometry";
import type { FlexDirection } from "@model/elements";
import { DIRECTION_OPTIONS } from "@elements/composite/shared";

// A transparent container that stacks several elements in one flow (no background of its own). A grid of
// columns is expressed as a nested row group (or nested row/col groups), not a special mode here — the same
// nested-flex layout the whole editor uses.

type Align = "start" | "center" | "end";

interface GroupData {
    children: ElementInstance[];
    direction?: FlexDirection;
    gap?: number;
    align?: Align; // cross-axis (across the flow)
    distribute?: Align; // main-axis (along the flow)
}

// The cross-axis alignment for a stacked (column) group. If it isn't set explicitly, infer it from the
// text children: when they're all centered (or all end-aligned) via their own text-align, mirror that onto
// the container so a button or image below them lands the same way instead of stranding at the start — a
// common slip where the copy is centered but its container's alignment is left default. Explicit wins.
function crossAlign(d: GroupData): Align | undefined {
    if (d.align) return d.align;
    const aligns = d.children
        .filter((c) => c.type === "text")
        .map((c) => (c.data as { align?: string }).align)
        .filter((a): a is string => !!a);
    if (aligns.length && aligns.every((a) => a === "center")) return "center";
    if (aligns.length && aligns.every((a) => a === "end")) return "end";
    return undefined;
}

const arrangeGroup = (d: GroupData, _ctx: LayoutCtx, kids: EngineNode[]): EngineNode => {
    const gap = d.gap ?? 14;
    const dir = d.direction ?? "col";
    // A column group's cross axis (horizontal) mirrors centered text; a row group keeps its explicit align.
    const cross = dir === "col" ? crossAlign(d) : d.align;
    return {
        w: grow(),
        h: fit(),
        direction: dir,
        gap,
        alignX: dir === "row" ? d.distribute : cross,
        alignY: dir === "row" ? cross : d.distribute,
        children: kids,
    };
};

export const groupElement: ElementSpec<GroupData> = {
    type: "group",
    label: "Group",
    category: "composite",
    tier: "container",
    create: () => ({ children: [] }),
    layout: (d, ctx) =>
        arrangeGroup(
            d,
            ctx,
            d.children.map((inst): EngineNode => {
                const spec = getElement(inst.type);
                return spec ? spec.layout(inst.data, ctx) : { w: grow(), h: fit(20) };
            }),
        ),
    container: {
        children: (d) => d.children,
        arrange: arrangeGroup,
        withChildren: (d, children) => ({ ...d, children }),
    },
    bar: ["direction", "align", "distribute"],
    controls: [
        {
            key: "direction",
            label: "Direction",
            control: "segmented",
            options: DIRECTION_OPTIONS,
        },
        {
            key: "align",
            label: "Align",
            control: "segmented",
            options: [
                { label: "Align start", value: "start", icon: "alignItemsStart" },
                { label: "Align center", value: "center", icon: "alignItemsCenter" },
                { label: "Align end", value: "end", icon: "alignItemsEnd" },
            ],
        },
        {
            key: "distribute",
            label: "Distribute",
            control: "segmented",
            options: [
                { label: "Distribute start", value: "start", icon: "distStart" },
                { label: "Distribute center", value: "center", icon: "distCenter" },
                { label: "Distribute end", value: "end", icon: "distEnd" },
            ],
        },
    ],
    skeleton: (): EngineNode => ({
        w: grow(),
        h: fit(),
        direction: "col",
        gap: 8,
        children: [bar(0.8, 12), bar(1, 9), bar(0.6, 9)],
    }),
};

register(groupElement);
