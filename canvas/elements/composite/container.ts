import type { ElementSpec, LayoutCtx } from "@elements/spec";
import type { EngineNode } from "@engine/node";
import type { ElementInstance } from "@model/artifact";
import { getElement, register } from "@elements/spec";
import { stacksAtWidth } from "@engine/profile";
import { fit, fixed, grow } from "@model/geometry";
import { CARD_SHAPES, CARD_STYLES } from "@model/elements";
import type { CardShape, CardStyle, FlexDirection } from "@model/elements";
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

export interface ContainerData {
    children: ElementInstance[];
    direction?: FlexDirection;
    align?: Align; // cross-axis
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

const crossAlign = (d: ContainerData): Align | undefined => d.align ?? inferredAlign(d);

// column fractions describe a row; once stacked each block owns the full width
const unfraction = (n: EngineNode): EngineNode =>
    n.w.mode === "percent" ? { ...n, w: grow() } : n;

const bare = (d: ContainerData, ctx: LayoutCtx, kids: EngineNode[]): EngineNode => {
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

// side/top accent lines use cross-axis grow to span the full edge
const surfaced = (d: ContainerData, ctx: LayoutCtx, kids: EngineNode[]): EngineNode => {
    const t = ctx.theme;
    const rad = d.shape === "sharp" ? 2 : t.radius;
    const p = 24;
    const inset = { top: p, right: p, bottom: p, left: p };
    const stack = (padding: typeof inset): EngineNode => ({
        w: grow(),
        h: fit(),
        direction: d.direction ?? "col",
        gap: 12,
        padding,
        children: kids,
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
    bar: ["direction", "align", "surface"],
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
