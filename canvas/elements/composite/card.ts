import type { ElementSpec, LayoutCtx } from "@elements/spec";
import type { EngineNode } from "@engine/node";
import type { ElementInstance } from "@model/artifact";
import { getElement, register, bar, GHOST_LINE, GHOST_PANEL } from "@elements/spec";
import { fit, fixed, grow } from "@model/geometry";
import { CARD_SHAPES, CARD_STYLES } from "@model/elements";
import type { CardShape, CardStyle, FlexDirection } from "@model/elements";
import { DIRECTION_OPTIONS } from "@elements/composite/shared";

interface CardData {
    children: ElementInstance[];
    direction?: FlexDirection;
    gap?: number;
    padding?: number;
    bg?: string;
    radius?: number; // legacy explicit radius (pre-`shape`); still honored when `shape` is unset
    shape?: CardShape;
    style?: CardStyle;
}

const STYLE_LABELS: Record<CardStyle, string> = {
    solid: "Solid",
    outline: "Outline",
    sideline: "Side line",
    topline: "Top line",
    plain: "Plain",
};

// Wrap the card's content stack in the chosen box chrome. Side/top accent lines use cross-axis `grow`
// (the solver stretches grow on the cross axis, so the bar runs the full edge).
const arrangeCard = (d: CardData, ctx: LayoutCtx, kids: EngineNode[]): EngineNode => {
    const t = ctx.theme;
    // Corner radius from `shape` (sharp → crisp, rounded → theme); else a legacy numeric radius; else theme.
    let rad = d.radius ?? t.radius;
    if (d.shape === "sharp") rad = 2;
    else if (d.shape === "rounded") rad = t.radius;
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
            ? { radius: rad, border: { color: t.line, width: 1.5 } }
            : {
                  color: d.bg ?? t.surface,
                  radius: rad,
                  border: { color: t.line, width: 1 },
              };
    return { ...stack(inset), fill };
};

export const cardElement: ElementSpec<CardData> = {
    type: "card",
    label: "Card",
    category: "composite",
    tier: "container",
    create: () => ({ children: [], shape: "rounded" }),
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
    bar: ["style", "direction", "shape", "bg"],
    controls: [
        {
            key: "style",
            label: "Style",
            control: "select",
            options: CARD_STYLES.map((v) => ({ value: v, label: STYLE_LABELS[v] })),
        },
        {
            key: "direction",
            label: "Direction",
            control: "segmented",
            options: DIRECTION_OPTIONS,
        },
        {
            key: "shape",
            label: "Corners",
            control: "segmented",
            options: CARD_SHAPES.map((v) => ({
                value: v,
                label: v === "sharp" ? "Sharp" : "Rounded",
            })),
            group: "Appearance",
            // Only the solid + outline branches paint a rounded fill; plain/sideline/topline have no frame.
            visibleWhen: (d) => {
                const s = (d.style as string) ?? "solid";
                return s === "solid" || s === "outline";
            },
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
