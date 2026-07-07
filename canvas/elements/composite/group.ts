import type { ElementSpec, LayoutCtx } from "@elements/spec";
import type { EngineNode } from "@engine/node";
import type { ElementInstance } from "@model/artifact";
import { getElement, register, bar } from "@elements/spec";
import { fit, grow } from "@model/geometry";
import type { FlexDirection } from "@model/elements/composite";
import { DIRECTION_OPTIONS } from "@elements/composite/shared";

// A transparent container that stacks several elements inside one cell (no background of its own).

type Align = "start" | "center" | "end";

interface GroupData {
    children: ElementInstance[];
    direction?: FlexDirection;
    gap?: number;
    align?: Align; // cross-axis (across the flow)
    distribute?: Align; // main-axis (along the flow)
    columns?: number; // >1 → arrange children as an N-column grid (the engine has no wrap, so we chunk)
}

const chunk = <T>(arr: T[], n: number): T[][] => {
    const out: T[][] = [];
    for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
    return out;
};

const arrangeGroup = (d: GroupData, _ctx: LayoutCtx, kids: EngineNode[]): EngineNode => {
    const gap = d.gap ?? 14;
    const cols = Math.max(1, Math.min(6, Math.round(Number(d.columns ?? 1))));
    if (cols > 1) {
        return {
            w: grow(),
            h: fit(),
            direction: "col",
            gap,
            children: chunk(kids, cols).map((row): EngineNode => {
                const cells = [...row];
                // Pad short final rows so columns stay aligned across rows.
                while (cells.length < cols) cells.push({ w: grow(), h: fit() });
                return {
                    w: grow(),
                    h: fit(),
                    direction: "row",
                    gap,
                    alignY: d.align ?? "start",
                    children: cells,
                };
            }),
        };
    }
    const dir = d.direction ?? "col";
    return {
        w: grow(),
        h: fit(),
        direction: dir,
        gap,
        alignX: dir === "row" ? d.distribute : d.align,
        alignY: dir === "row" ? d.align : d.distribute,
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
    bar: ["columns", "direction", "align", "distribute"],
    spacing: { gap: { key: "gap", min: 0, max: 48, def: 14 } },
    controls: [
        {
            key: "columns",
            label: "Columns",
            control: "segmented",
            icon: "columns", // leading glyph names the numeric picker on the bar
            options: [1, 2, 3, 4, 5, 6].map((n) => ({ label: `${n} columns`, value: String(n) })),
        },
        {
            key: "direction",
            label: "Direction",
            control: "segmented",
            options: DIRECTION_OPTIONS,
            visibleWhen: (d) => Number(d.columns ?? 1) <= 1,
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
            visibleWhen: (d) => Number(d.columns ?? 1) <= 1,
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
