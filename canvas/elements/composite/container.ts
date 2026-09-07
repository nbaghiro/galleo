import type { ElementSpec, LayoutCtx } from "@elements/spec";
import type { EngineNode } from "@engine/node";
import type { ElementInstance } from "@model/artifact";
import { childrenRaw } from "@model/artifact";
import { getElement, register } from "@elements/spec";
import { stacksAtWidth } from "@engine/profile";
import { fit, grow } from "@model/geometry";
import { hexA } from "@themes";
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
    gap?: number; // between children; absent keeps the bare 14 / surfaced 12 the merge proved on
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
    glass: "Glass",
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

// a row's whole main axis through one key: pack values ride the engine's alignX, spread values
// its distribute, so the two can never contradict
const packOf = (d: ContainerData): Align | undefined =>
    d.justify === "center" || d.justify === "end" ? d.justify : undefined;
const justified = (d: ContainerData, dir: FlexDirection): Partial<EngineNode> => {
    const j = d.justify;
    if (dir !== "row" || !j) return {};
    return j === "center" || j === "end" ? { alignX: j } : { distribute: j };
};

// column fractions describe a row; once stacked each block owns the full width
const unfraction = (n: EngineNode): EngineNode =>
    n.w.mode === "percent" ? { ...n, w: grow() } : n;

const gridCols = (d: ContainerData): number => Math.max(2, Math.min(6, Math.round(d.columns ?? 2)));

/** The clamped column count of a grid container instance, or null for anything else. */
export const gridColumnsOf = (inst?: ElementInstance): number | null =>
    inst?.type === "container" && (inst.data as ContainerData).direction === "grid"
        ? gridCols(inst.data as ContainerData)
        : null;

// A row column whose content is a visual (a chart, diagram, table or image) with no body copy sits
// shorter than a text column beside it, and the cross axis defaults to the top, so it strands its
// empty space at the bottom. Centre such a column when the author left its placement open, so the
// gap reads as breathing room rather than a break. A column the author sized, or one that carries
// body text, is left alone. Only the intent is set; the generic solver does the rest.
const VISUAL = new Set(["chart", "diagram", "table", "image", "media"]);
const STACKED = new Set(["container", "group", "card"]);
const leaves = (inst: ElementInstance): ElementInstance[] =>
    STACKED.has(inst.type) ? (childrenRaw(inst) ?? []).flatMap(leaves) : [inst];
const isBody = (inst: ElementInstance): boolean =>
    inst.type === "bullets" ||
    (inst.type === "text" && ((inst.data as { style?: string }).style ?? "body") === "body") ||
    (inst.type === "text" && (inst.data as { style?: string }).style === "quote");
const visualLed = (inst: ElementInstance): boolean => {
    const ls = leaves(inst);
    return ls.some((l) => VISUAL.has(l.type)) && !ls.some(isBody);
};
// a column whose content is a visual with no body copy: centred vertically, so a fixed-height
// chart or diagram in a taller (filled) column sits in the middle instead of stranded at the top
const visualColumn = (children: ElementInstance[]): boolean => {
    const ls = children.flatMap(leaves);
    return ls.some((l) => VISUAL.has(l.type)) && !ls.some(isBody);
};
function balanceRow(children: ElementInstance[], kids: EngineNode[]): void {
    children.forEach((child, i) => {
        const k = kids[i];
        if (!k || k.float || k.alignSelf !== undefined || k.h.mode === "grow") return;
        if (child.layout?.align || child.layout?.height || child.layout?.pin) return;
        if (visualLed(child)) k.alignSelf = "center";
    });
}

const bare = (d: ContainerData, ctx: LayoutCtx, kids: EngineNode[]): EngineNode => {
    const stacked =
        (d.direction === "row" || d.direction === "grid") &&
        stacksAtWidth(ctx.format, ctx.availWidth);
    const dir: FlexDirection = stacked ? "col" : (d.direction ?? "col");
    if (dir === "row") balanceRow(d.children, kids);
    // a stacked row's explicit `align` was a row-axis instruction, so only the text inference
    // survives; a justify pack keeps its horizontal meaning across the flip and carries over
    return {
        w: grow(),
        h: fit(),
        direction: dir,
        ...(dir === "grid" ? { columns: gridCols(d) } : {}),
        gap: d.gap ?? 14,
        alignX:
            dir === "col" ? (stacked ? (packOf(d) ?? inferredAlign(d)) : colAlign(d)) : undefined,
        alignY: dir === "col" ? (visualColumn(d.children) ? "center" : undefined) : d.align,
        ...justified(d, dir),
        // tracks own widths in a grid: a member's stale row fraction must never pin one
        children: stacked || dir === "grid" ? kids.map(unfraction) : kids,
    };
};

// side/top accent lines use cross-axis grow to span the full edge
const surfaced = (d: ContainerData, ctx: LayoutCtx, kids: EngineNode[]): EngineNode => {
    const t = ctx.theme;
    const circle = d.shape === "circle";
    const rad = d.shape === "sharp" ? 2 : circle ? 9999 : t.radius;
    const p = 24;
    const inset = { top: p, right: p, bottom: p, left: p };
    const dir = d.direction ?? "col";
    if (dir === "row" && !stacksAtWidth(ctx.format, ctx.availWidth)) balanceRow(d.children, kids);
    const stack = (padding: typeof inset): EngineNode => ({
        w: grow(),
        h: fit(),
        // the circle crop clips composed children to the ellipse; the fill's own roundness is `rad`
        ...(circle ? { clip: { x: true, y: true, shape: "ellipse" as const } } : {}),
        direction: dir,
        ...(dir === "grid" ? { columns: gridCols(d) } : {}),
        gap: d.gap ?? 12,
        padding,
        ...justified(d, dir),
        children: dir === "grid" ? kids.map(unfraction) : kids,
    });
    const style = d.surface ?? "solid";
    if (style === "plain") return stack({ top: 0, right: 0, bottom: 0, left: 0 });
    if (style === "sideline")
        return {
            ...stack(inset),
            fill: { border: { color: t.accent, width: 3, sides: ["left"] } },
        };
    if (style === "topline")
        return { ...stack(inset), fill: { border: { color: t.accent, width: 3, sides: ["top"] } } };
    if (style === "glass")
        return {
            ...stack(inset),
            fill: {
                color: hexA(t.surface, 0.55),
                radius: rad,
                border: { color: hexA(t.line, 0.6), width: 1 },
                shadow: { blur: 24, dy: 8, color: "rgba(0,0,0,0.18)" },
                backdropBlur: 14,
            },
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

// the same padding and gaps the two arranges above apply, so compose's estimate and the real box
// agree; only gaps that run across the width count, which is a row's every gap and a grid's tracks
const innerWidth = (d: ContainerData, avail: number, children: number): number => {
    const dir = d.direction ?? "col";
    const gap = d.gap ?? (d.surface ? 12 : 14);
    const cols = dir === "grid" ? gridCols(d) : 1;
    const across = dir === "row" ? Math.max(0, children - 1) : cols - 1;
    // A row's children divide this by their own share, so it stays whole. A grid's tracks are
    // sized from their own members (trackMembers in the solver), so no caller can know a track's
    // width here: an even split is the floor, and sizing a child for less than it gets wastes a
    // little space where sizing it for more paints past the edge.
    return Math.max(1, (avail - (d.surface ? 48 : 0) - gap * across) / cols);
};

export const containerElement: ElementSpec<ContainerData> = {
    type: "container",
    label: "Container",
    category: "composite",
    tier: "container",
    hidden: true,
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
        innerWidth,
    },
    bar: ["direction", "columns", "align", "surface"],
    frame: true,
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
            control: "select",
            numeric: true,
            icon: "grid",
            options: [2, 3, 4, 5, 6].map((n) => ({ value: String(n), label: String(n) })),
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
                { label: "Baseline", value: "baseline", icon: "alignBaseline" },
            ],
        },
        {
            key: "justify",
            label: "Justify",
            control: "select",
            // a column is fit-height, so it never has leftover space to place children in
            visibleWhen: (d) => d.direction === "row",
            options: [
                { label: "Start", value: "" },
                { label: "Center", value: "center" },
                { label: "End", value: "end" },
                { label: "Between", value: "between" },
                { label: "Around", value: "around" },
                { label: "Evenly", value: "evenly" },
            ],
        },
        {
            key: "gap",
            label: "Gap",
            control: "slider",
            min: 0,
            max: 48,
            step: 2,
            unit: "px",
            group: "Layout",
        },
        {
            key: "surface",
            label: "Surface",
            control: "select",
            group: "Appearance",
            placeholder: "None",
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
