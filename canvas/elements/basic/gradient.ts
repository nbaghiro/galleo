import type { ElementSpec, LayoutCtx } from "@elements/spec";
import type { EngineNode } from "@engine/node";
import { register } from "@elements/spec";
import { fixed, grow } from "@model/geometry";

interface GradientData {
    from?: string;
    to?: string;
    angle?: number;
    height?: number;
}

export const gradientElement: ElementSpec<GradientData> = {
    type: "gradient",
    label: "Gradient",
    frame: true,
    category: "basic",
    tier: "primitive",
    create: () => ({ from: "#9a4f24", to: "#f4f0e8", angle: 135, height: 200 }),
    layout: (d: GradientData, ctx: LayoutCtx): EngineNode => ({
        w: grow(),
        h: fixed(d.height ?? 200),
        fill: {
            gradient: {
                from: d.from ?? ctx.theme.accent,
                to: d.to ?? ctx.theme.surface,
                angle: d.angle ?? 135,
            },
            radius: Math.round(ctx.theme.radius / 1.5),
        },
    }),
    resize: { height: { key: "height", min: 80, max: 480, step: 10 } },
    controls: [
        { key: "from", label: "From", control: "color" },
        { key: "to", label: "To", control: "color" },
        {
            key: "angle",
            label: "Angle",
            control: "slider",
            min: 0,
            max: 360,
            step: 5,
            unit: "°",
            group: "Shape",
        },
    ],
    skeleton: (): EngineNode => ({
        w: grow(),
        h: fixed(44),
        fill: { gradient: { from: "#ded8ca", to: "#f1ede3", angle: 135 }, radius: 8 },
    }),
};

register(gradientElement);
