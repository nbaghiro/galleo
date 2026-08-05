import type { ElementSpec, LayoutCtx } from "@elements/spec";
import type { EngineNode } from "@engine/node";
import type { ElementInstance } from "@model/artifact";
import { getElement, register } from "@elements/spec";
import { stacksAtWidth } from "@engine/profile";
import { fit, grow } from "@model/geometry";
import type { FlexDirection } from "@model/elements";
import { DIRECTION_OPTIONS } from "@elements/composite/shared";

type Align = "start" | "center" | "end";

interface GroupData {
    children: ElementInstance[];
    direction?: FlexDirection;
    align?: Align; // cross-axis
}

// infer container cross-align from all-centered/all-end text children
function inferredAlign(d: GroupData): Align | undefined {
    const aligns = d.children
        .filter((c) => c.type === "text")
        .map((c) => (c.data as { align?: string }).align)
        .filter((a): a is string => !!a);
    if (aligns.length && aligns.every((a) => a === "center")) return "center";
    if (aligns.length && aligns.every((a) => a === "end")) return "end";
    return undefined;
}

const crossAlign = (d: GroupData): Align | undefined => d.align ?? inferredAlign(d);

// column fractions describe a row; once stacked each block owns the full width
const unfraction = (n: EngineNode): EngineNode =>
    n.w.mode === "percent" ? { ...n, w: grow() } : n;

const arrangeGroup = (d: GroupData, ctx: LayoutCtx, kids: EngineNode[]): EngineNode => {
    const stacked = d.direction === "row" && stacksAtWidth(ctx.format, ctx.availWidth);
    const dir: FlexDirection = stacked ? "col" : (d.direction ?? "col");
    // a stacked row's explicit `align` was a row-axis instruction, so only the text inference survives
    const cross = stacked ? inferredAlign(d) : dir === "col" ? crossAlign(d) : d.align;
    return {
        w: grow(),
        h: fit(),
        direction: dir,
        gap: 14,
        alignX: dir === "row" ? undefined : cross,
        alignY: dir === "row" ? cross : undefined,
        children: stacked ? kids.map(unfraction) : kids,
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
    bar: ["direction", "align"],
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
    ],
};

register(groupElement);
