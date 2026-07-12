import type { ElementSpec, LayoutCtx } from "@elements/spec";
import type { EngineNode } from "@engine/node";
import { register, pill } from "@elements/spec";
import { fit, fixed } from "@model/geometry";
import { fontStack, hexA } from "@themes";
import {
    BUTTON_SHAPES,
    BUTTON_SIZES,
    BUTTON_VARIANTS,
    type ButtonShape,
    type ButtonSize,
    type ButtonVariant,
} from "@model/elements";

// The Iconify glyph shape (matches the Icon element + icon picker) — an inner SVG body using
// `currentColor`, resolved to the label color at layout so the icon tints with the button.
interface IconGlyph {
    id: string;
    body: string;
    vb: string;
}

interface ButtonData {
    label: string;
    variant?: ButtonVariant; // filled · outline · soft · ghost (default filled)
    size?: ButtonSize; // sm · md · lg (default md)
    shape?: ButtonShape; // sharp · rounded · pill (default rounded → theme radius)
    href?: string; // link target (stored on the model; click-through is wired per surface)
    icon?: IconGlyph; // optional leading glyph, tinted to the label color
}

// Per-size metrics: box height, horizontal padding, label size, and the leading-icon size + its gap.
const SIZES: Record<
    ButtonSize,
    { h: number; padX: number; font: number; icon: number; gap: number }
> = {
    sm: { h: 34, padX: 14, font: 13, icon: 15, gap: 6 },
    md: { h: 42, padX: 20, font: 14, icon: 16, gap: 8 },
    lg: { h: 52, padX: 26, font: 16, icon: 19, gap: 9 },
};

const VARIANT_LABELS: Record<ButtonVariant, string> = {
    filled: "Filled",
    outline: "Outline",
    soft: "Soft",
    ghost: "Ghost",
};
const SIZE_LABELS: Record<ButtonSize, string> = { sm: "S", md: "M", lg: "L" };
const SHAPE_LABELS: Record<ButtonShape, string> = {
    sharp: "Sharp",
    rounded: "Rounded",
    pill: "Pill",
};

// Corner radius by shape. `rounded` (the default) derives from the theme radius token — clamped to a
// button-appropriate range so a very round theme doesn't read as a pill — which is what makes a button's
// roundness track the selected theme. `sharp` is intentionally crisp; `pill` is half the height.
function shapeRadius(shape: ButtonShape | undefined, h: number, themeRadius: number): number {
    if (shape === "sharp") return 2;
    if (shape === "pill") return Math.round(h / 2);
    return Math.max(4, Math.min(14, Math.round(themeRadius))); // rounded (default)
}

export const buttonElement: ElementSpec<ButtonData> = {
    type: "button",
    label: "Button",
    category: "basic",
    tier: "primitive",
    // Seed the style/size/shape so the segmented controls read their active state immediately (layout
    // still falls back to these same defaults for older buttons that only carry a label + variant).
    create: () => ({ label: "Get started", variant: "filled", size: "md", shape: "rounded" }),
    layout: (d: ButtonData, ctx: LayoutCtx): EngineNode => {
        const sz = SIZES[d.size ?? "md"];
        const variant = d.variant ?? "filled";
        const accent = ctx.theme.accent;
        const radius = shapeRadius(d.shape, sz.h, ctx.theme.radius);

        // filled = solid accent; outline = accent hairline; soft = a low-alpha accent wash; ghost = bare
        // text. Only the filled fill carries the button; every other variant sits on the page, so its
        // label (and icon) reads in the accent itself rather than onAccent.
        const fillColor =
            variant === "filled" ? accent : variant === "soft" ? hexA(accent, 0.14) : "transparent";
        const inkColor = variant === "filled" ? ctx.theme.onAccent : accent;
        const border = variant === "outline" ? { color: accent, width: 1.5 } : undefined;

        const children: EngineNode[] = [];
        if (d.icon?.body) {
            const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${sz.icon}" height="${sz.icon}" viewBox="${d.icon.vb}">${d.icon.body.replaceAll("currentColor", inkColor)}</svg>`;
            children.push({
                w: fixed(sz.icon),
                h: fixed(sz.icon),
                image: { src: `data:image/svg+xml,${encodeURIComponent(svg)}`, fit: "contain" },
            });
        }
        children.push({
            w: fit(),
            h: fit(),
            text: {
                text: d.label,
                fontId: fontStack("ui", ctx.theme),
                size: sz.font,
                weight: 600,
                color: inkColor,
                align: "center",
                wrap: "none",
            },
        });

        return {
            w: fit(),
            h: fixed(sz.h),
            direction: "row",
            gap: d.icon?.body ? sz.gap : 0,
            alignX: "center",
            alignY: "center",
            padding: { top: 0, bottom: 0, left: sz.padX, right: sz.padX },
            fill: { color: fillColor, radius, border },
            children,
        };
    },
    // Bar = just the primary Style toggle (kept uncrowded); Size/Shape/label/link/icon live in the panel.
    bar: ["variant"],
    controls: [
        { key: "label", label: "Label", control: "text" },
        {
            key: "variant",
            label: "Style",
            control: "segmented",
            options: BUTTON_VARIANTS.map((v) => ({ value: v, label: VARIANT_LABELS[v] })),
        },
        {
            key: "size",
            label: "Size",
            control: "segmented",
            options: BUTTON_SIZES.map((v) => ({ value: v, label: SIZE_LABELS[v] })),
        },
        {
            key: "shape",
            label: "Shape",
            control: "segmented",
            options: BUTTON_SHAPES.map((v) => ({ value: v, label: SHAPE_LABELS[v] })),
        },
        { key: "href", label: "Link", control: "text", placeholder: "https://…", group: "Link" },
        { key: "icon", label: "Leading icon", control: "icon", group: "Link" },
    ],
    // Custom ghost: a fit-width pill collapses under auto-skeletonize, so draw a pill directly.
    skeleton: (_ctx: LayoutCtx): EngineNode => pill(0.45, 38),
};

register(buttonElement);
