import type { ElementSpec, LayoutCtx } from "@elements/spec";
import type { EngineNode } from "@engine/node";
import type { ElementInstance } from "@model/artifact";
import { getElement, register } from "@elements/spec";
import { stacksAtWidth } from "@engine/profile";
import { fit, fixed, grow } from "@model/geometry";
import { CARD_SHAPES, CARD_STYLES } from "@model/elements";
import type { CardShape, CardStyle, FlexDirection, FlexJustify } from "@model/elements";
import { DIRECTION_OPTIONS } from "@elements/composite/shared";

// The one layout container: everything that holds arbitrary children in a row or a column. It
// replaces the old `group` (bare stack) and `card` (stack with a surface), which differed only by
// that surface, and it is the only element whose tier is "container", so it is the only place a drop
// may land. Everything else with children owns them (see spec.ts's tier field).
//
// Absent `surface` reproduces group's geometry exactly (gap 14, no padding, align inference);
// present reproduces card's (gap 12, padding 24, the style's fill). Kept exact so the merge is
// provably layout-neutral against the eval corpus.

type Align = "start" | "center" | "end";
type CrossAlign = Align | "baseline";

export interface ContainerData {
    children: ElementInstance[];
    direction?: FlexDirection;
    columns?: number; // grid only: shared-width tracks the children fill row-major
    align?: CrossAlign; // cross-axis; "baseline" applies to rows only
    justify?: FlexJustify; // main-axis: spread the leftover space instead of packing
    // absent = a bare stack (what `group` was). Any style = a surface (what `card` was). Flat rather
    // than nested because the control system reads and writes data keys directly.
    surface?: CardStyle;
    bg?: string;
    shape?: CardShape;
}

const SURFACE_LABELS: Record<CardStyle, string> = {
    solid: "Solid",
    outline: "Outline",
    sideline: "Side line",
    topline: "Top line",
    plain: "Plain",
};

// infer cross-align from all-centered/all-end text children
function inferredAlign(d: ContainerData): Align | undefined {
    const aligns = d.children
        .filter((c) => c.type === "text")
        .map((c) => (c.data as { align?: string }).align)
        .filter((a): a is string => !!a);
    if (aligns.length && aligns.every((a) => a === "center")) return "center";
    if (aligns.length && aligns.every((a) => a === "end")) return "end";
    return undefined;
}

// a column's cross axis is horizontal, where a baseline means nothing
const colAlign = (d: ContainerData): Align | undefined =>
    d.align === "baseline" ? inferredAlign(d) : (d.align ?? inferredAlign(d));

// column fractions describe a row; once stacked each block owns the full width
const unfraction = (n: EngineNode): EngineNode =>
    n.w.mode === "percent" ? { ...n, w: grow() } : n;

const gridCols = (d: ContainerData): number => Math.max(2, Math.min(6, Math.round(d.columns ?? 2)));

/** The clamped column count of a grid container instance, or null for anything else. */
export const gridColumnsOf = (inst?: ElementInstance): number | null =>
    inst?.type === "container" && (inst.data as ContainerData).direction === "grid"
        ? gridCols(inst.data as ContainerData)
        : null;

const bare = (d: ContainerData, ctx: LayoutCtx, kids: EngineNode[]): EngineNode => {
    const stacked =
        (d.direction === "row" || d.direction === "grid") &&
        stacksAtWidth(ctx.format, ctx.availWidth);
    const dir: FlexDirection = stacked ? "col" : (d.direction ?? "col");
    // a stacked row's explicit `align` was a row-axis instruction, so only the text inference survives
    return {
        w: grow(),
        h: fit(),
        direction: dir,
        ...(dir === "grid" ? { columns: gridCols(d) } : {}),
        gap: 14,
        alignX: dir === "col" ? (stacked ? inferredAlign(d) : colAlign(d)) : undefined,
        alignY: dir === "col" ? undefined : d.align,
        ...(d.justify && dir === "row" ? { distribute: d.justify } : {}),
        // tracks own widths in a grid: a member's stale row fraction must never pin one
        children: stacked || dir === "grid" ? kids.map(unfraction) : kids,
    };
};

// side/top accent lines use cross-axis grow to span the full edge
const surfaced = (d: ContainerData, ctx: LayoutCtx, kids: EngineNode[]): EngineNode => {
    const t = ctx.theme;
    const rad = d.shape === "sharp" ? 2 : t.radius;
    const p = 24;
    const inset = { top: p, right: p, bottom: p, left: p };
    const dir = d.direction ?? "col";
    const stack = (padding: typeof inset): EngineNode => ({
        w: grow(),
        h: fit(),
        direction: dir,
        ...(dir === "grid" ? { columns: gridCols(d) } : {}),
        gap: 12,
        padding,
        ...(d.justify && dir === "row" ? { distribute: d.justify } : {}),
        children: dir === "grid" ? kids.map(unfraction) : kids,
    });
    const style = d.surface ?? "solid";
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
            ? { radius: rad, border: { color: t.line, width: 1.5 } }
            : {
                  color: d.bg ?? t.surface,
                  radius: rad,
                  border: { color: t.line, width: 1 },
              };
    return { ...stack(inset), fill };
};

const arrangeContainer = (d: ContainerData, ctx: LayoutCtx, kids: EngineNode[]): EngineNode =>
    d.surface ? surfaced(d, ctx, kids) : bare(d, ctx, kids);

export const containerElement: ElementSpec<ContainerData> = {
    type: "container",
    label: "Container",
    category: "composite",
    tier: "container",
    create: () => ({ children: [] }),
    layout: (d, ctx) =>
        arrangeContainer(
            d,
            ctx,
            d.children.map((inst): EngineNode => {
                const spec = getElement(inst.type);
                return spec ? spec.layout(inst.data, ctx) : { w: grow(), h: fit(20) };
            }),
        ),
    container: {
        children: (d) => d.children,
        arrange: arrangeContainer,
        withChildren: (d, children) => ({ ...d, children }),
    },
    bar: ["direction", "columns", "align", "surface"],
    controls: [
        {
            key: "direction",
            label: "Direction",
            control: "segmented",
            options: DIRECTION_OPTIONS,
        },
        {
            key: "columns",
            label: "Columns",
            control: "slider",
            min: 2,
            max: 6,
            step: 1,
            icon: "grid",
            visibleWhen: (d) => d.direction === "grid",
        },
        {
            key: "align",
            label: "Align",
            control: "segmented",
            options: [
                { label: "Align start", value: "start", icon: "alignItemsStart" },
                { label: "Align center", value: "center", icon: "alignItemsCenter" },
                { label: "Align end", value: "end", icon: "alignItemsEnd" },
                { label: "Baseline", value: "baseline" },
            ],
        },
        {
            key: "justify",
            label: "Distribute",
            control: "segmented",
            // a column is fit-height, so it never has leftover space to spread
            visibleWhen: (d) => d.direction === "row",
            options: [
                { label: "Off", value: "" },
                { label: "Between", value: "between" },
                { label: "Around", value: "around" },
                { label: "Evenly", value: "evenly" },
            ],
        },
        {
            key: "surface",
            label: "Surface",
            control: "select",
            group: "Appearance",
            options: CARD_STYLES.map((v) => ({ value: v, label: SURFACE_LABELS[v] })),
        },
        {
            key: "shape",
            label: "Corners",
            control: "segmented",
            group: "Appearance",
            options: CARD_SHAPES.map((v) => ({
                value: v,
                label: v === "sharp" ? "Sharp" : "Rounded",
            })),
            // only solid + outline paint a rounded fill
            visibleWhen: (d) => {
                const s = d.surface as string | undefined;
                return !!s && (s === "solid" || s === "outline");
            },
        },
        {
            key: "bg",
            label: "Background",
            control: "color",
            group: "Appearance",
            visibleWhen: (d) => (d.surface as string | undefined) === "solid",
        },
    ],
};

register(containerElement);
