import type { ElementSpec, LayoutCtx } from "@elements/spec";
import type { EngineNode } from "@engine/node";
import type { ElementInstance } from "@model/artifact";
import { getElement, register, bar, GHOST_LINE, GHOST_PANEL } from "@elements/spec";
import { fit, fixed, grow } from "@model/size";

type CardStyle = "solid" | "outline" | "sideline" | "topline" | "plain";

interface CardData {
    children: ElementInstance[];
    direction?: "row" | "col";
    gap?: number;
    padding?: number;
    bg?: string;
    radius?: number;
    style?: CardStyle;
}

// Wrap the card's content stack in the chosen box chrome. Side/top accent lines use cross-axis `grow`
// (the solver stretches grow on the cross axis, so the bar runs the full edge).
const arrangeCard = (d: CardData, ctx: LayoutCtx, kids: EngineNode[]): EngineNode => {
    const t = ctx.theme;
    const p = d.padding ?? 24;
    const inset = { top: p, right: p, bottom: p, left: p };
    const stack = (padding: typeof inset): EngineNode => ({
        w: grow(),
        h: fit(),
        direction: d.direction ?? "col",
        gap: d.gap ?? 12,
        padding,
        children: kids,
    });
    const style = d.style ?? "solid";
    if (style === "plain") return stack({ top: 0, right: 0, bottom: 0, left: 0 });
    if (style === "sideline")
        return {
            w: grow(),
            h: fit(),
            direction: "row",
            children: [
                { w: fixed(3), h: grow(), fill: { color: t.accent } },
                stack({ top: p, right: p, bottom: p, left: p - 3 }),
            ],
        };
    if (style === "topline")
        return {
            w: grow(),
            h: fit(),
            direction: "col",
            children: [{ w: grow(), h: fixed(3), fill: { color: t.accent } }, stack(inset)],
        };
    const fill =
        style === "outline"
            ? { radius: d.radius ?? t.radius, border: { color: t.line, width: 1.5 } }
            : {
                  color: d.bg ?? t.surface,
                  radius: d.radius ?? t.radius,
                  border: { color: t.line, width: 1 },
              };
    return { ...stack(inset), fill };
};

export const cardElement: ElementSpec<CardData> = {
    type: "card",
    label: "Card",
    category: "container",
    tier: "container",
    create: () => ({ children: [] }),
    layout: (d, ctx) =>
        arrangeCard(
            d,
            ctx,
            d.children.map((inst): EngineNode => {
                const spec = getElement(inst.type);
                if (!spec) throw new Error(`unknown element type: ${inst.type}`);
                return spec.layout(inst.data, ctx);
            }),
        ),
    container: {
        children: (d) => d.children,
        arrange: arrangeCard,
        withChildren: (d, children) => ({ ...d, children }),
    },
    bar: ["style", "direction", "radius", "bg"],
    spacing: {
        gap: { key: "gap", min: 0, max: 48, def: 12 },
        padding: { key: "padding", min: 0, max: 64, def: 24 },
    },
    controls: [
        {
            key: "style",
            label: "Style",
            control: "select",
            options: [
                { label: "Solid", value: "solid" },
                { label: "Outline", value: "outline" },
                { label: "Side line", value: "sideline" },
                { label: "Top line", value: "topline" },
                { label: "Plain", value: "plain" },
            ],
        },
        {
            key: "direction",
            label: "Direction",
            control: "segmented",
            options: [
                { label: "Stack", value: "col", icon: "stack" },
                { label: "Row", value: "row", icon: "row" },
            ],
        },
        {
            key: "radius",
            label: "Corner radius",
            control: "slider",
            min: 0,
            max: 40,
            step: 1,
            unit: "px",
            group: "Appearance",
        },
        {
            key: "bg",
            label: "Background",
            control: "color",
            group: "Appearance",
            visibleWhen: (d) => (d.style ?? "solid") === "solid",
        },
    ],
    skeleton: (): EngineNode => ({
        w: grow(),
        h: fit(),
        direction: "col",
        gap: 8,
        padding: { top: 14, right: 14, bottom: 14, left: 14 },
        fill: { color: GHOST_PANEL, radius: 10, border: { color: GHOST_LINE, width: 1 } },
        children: [bar(0.7, 12), bar(1, 9), bar(0.5, 9)],
    }),
};

register(cardElement);

// A transparent container that stacks several elements inside one cell (no background of its own).

type Align = "start" | "center" | "end";

interface GroupData {
    children: ElementInstance[];
    direction?: "row" | "col";
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
    category: "container",
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
            options: [
                { label: "Stack", value: "col", icon: "stack" },
                { label: "Row", value: "row", icon: "row" },
            ],
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
