import type { ElementSpec, LayoutCtx } from "@elements/element-spec";
import type { EngineNode } from "@engine/node";
import type { ElementInstance } from "@model/content";
import { getElement, register } from "@elements/registry";
import { bar } from "@elements/skeleton";
import { fit, grow } from "@model/size";

// A transparent container that stacks several elements inside one cell (no background of its own).

type Align = "start" | "center" | "end";

interface GroupData {
    children: ElementInstance[];
    direction?: "row" | "col";
    gap?: number;
    align?: Align; // cross-axis (across the flow)
    distribute?: Align; // main-axis (along the flow)
}

const arrange = (d: GroupData, _ctx: LayoutCtx, kids: EngineNode[]): EngineNode => {
    const dir = d.direction ?? "col";
    return {
        w: grow(),
        h: fit(),
        direction: dir,
        gap: d.gap ?? 14,
        alignX: dir === "row" ? d.distribute : d.align,
        alignY: dir === "row" ? d.align : d.distribute,
        children: kids,
    };
};

export const groupElement: ElementSpec<GroupData> = {
    type: "group",
    label: "Group",
    category: "container",
    tier: "container",
    create: () => ({ children: [] }),
    layout: (d, ctx) =>
        arrange(
            d,
            ctx,
            d.children.map((inst): EngineNode => {
                const spec = getElement(inst.type);
                return spec ? spec.layout(inst.data, ctx) : { w: grow(), h: fit(20) };
            }),
        ),
    container: {
        children: (d) => d.children,
        arrange,
        withChildren: (d, children) => ({ ...d, children }),
    },
    controls: [
        {
            key: "direction",
            label: "Direction",
            control: "segmented",
            options: [
                { label: "Stack", value: "col" },
                { label: "Row", value: "row" },
            ],
        },
        { key: "gap", label: "Gap", control: "slider", min: 0, max: 48, step: 2, unit: "px" },
        {
            key: "align",
            label: "Align",
            control: "segmented",
            options: [
                { label: "Start", value: "start" },
                { label: "Center", value: "center" },
                { label: "End", value: "end" },
            ],
        },
        {
            key: "distribute",
            label: "Distribute",
            control: "segmented",
            options: [
                { label: "Start", value: "start" },
                { label: "Center", value: "center" },
                { label: "End", value: "end" },
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
