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

// Matches the Icon element + icon picker; body uses `currentColor`, tinted to the label color at layout.
interface IconGlyph {
    id: string;
    body: string;
    vb: string;
}

interface ButtonData {
    label: string;
    variant?: ButtonVariant;
    size?: ButtonSize;
    shape?: ButtonShape;
    href?: string; // click-through wired per surface
    icon?: IconGlyph;
}

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

// rounded (default) clamps the theme radius so a very round theme doesn't read as a pill.
function shapeRadius(shape: ButtonShape | undefined, h: number, themeRadius: number): number {
    if (shape === "sharp") return 2;
    if (shape === "pill") return Math.round(h / 2);
    return Math.max(4, Math.min(14, Math.round(themeRadius)));
}

export const buttonElement: ElementSpec<ButtonData> = {
    type: "button",
    label: "Button",
    category: "basic",
    tier: "primitive",
    // Seed style/size/shape so the segmented controls show active state immediately.
    create: () => ({ label: "Get started", variant: "filled", size: "md", shape: "rounded" }),
    layout: (d: ButtonData, ctx: LayoutCtx): EngineNode => {
        const sz = SIZES[d.size ?? "md"];
        const variant = d.variant ?? "filled";
        const accent = ctx.theme.accent;
        const radius = shapeRadius(d.shape, sz.h, ctx.theme.radius);

        // Non-filled variants sit on the page, so label/icon read in the accent itself, not onAccent.
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
    // fit-width pill collapses under auto-skeletonize, so draw a pill directly.
    skeleton: (_ctx: LayoutCtx): EngineNode => pill(0.45, 38),
};

register(buttonElement);
