import type { ElementSpec, LayoutCtx } from "@elements/spec";
import type { EngineNode } from "@engine/node";
import { register, pill } from "@elements/spec";
import { fit, fixed } from "@model/geometry";
import { fontStack } from "@themes/theme";
import { BUTTON_VARIANTS, type ButtonVariant } from "@model/elements/basic";

interface ButtonData {
    label: string;
    variant?: ButtonVariant;
}

export const buttonElement: ElementSpec<ButtonData> = {
    type: "button",
    label: "Button",
    frame: true,
    category: "basic",
    tier: "primitive",
    create: () => ({ label: "Get started" }),
    layout: (d: ButtonData, ctx: LayoutCtx): EngineNode => {
        const outline = d.variant === "outline";
        return {
            w: fit(),
            h: fixed(42),
            padding: { top: 0, bottom: 0, left: 20, right: 20 },
            alignX: "center",
            alignY: "center",
            fill: outline
                ? {
                      color: "transparent",
                      radius: 8,
                      border: { color: ctx.theme.accent, width: 1.5 },
                  }
                : { color: ctx.theme.accent, radius: 8 },
            children: [
                {
                    w: fit(),
                    h: fit(),
                    text: {
                        text: d.label,
                        fontId: fontStack("ui", ctx.theme),
                        size: 14,
                        weight: 600,
                        color: outline ? ctx.theme.accent : ctx.theme.onAccent,
                        align: "center",
                        wrap: "none",
                    },
                },
            ],
        };
    },
    controls: [
        { key: "label", label: "Label", control: "text" },
        {
            key: "variant",
            label: "Style",
            control: "segmented",
            options: BUTTON_VARIANTS.map((v) => ({
                value: v,
                label: v === "filled" ? "Filled" : "Outline",
            })),
        },
    ],
    // Custom ghost: a fit-width pill collapses under auto-skeletonize, so draw a pill directly.
    skeleton: (_ctx: LayoutCtx): EngineNode => pill(0.45, 38),
};

register(buttonElement);
