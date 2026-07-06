import type { ElementSpec, LayoutCtx } from "@elements/spec";
import type { EngineNode } from "@engine/node";
import { register, pill, getElement, skeletonize, GHOST } from "@elements/spec";
import { fit, fixed, grow } from "@model/geometry";
import { fontStack, mix } from "@themes/theme";

interface ButtonData {
    label: string;
    variant?: "filled" | "outline";
}

export const buttonElement: ElementSpec<ButtonData> = {
    type: "button",
    label: "Button",
    category: "interactive",
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
            options: [
                { label: "Filled", value: "filled" },
                { label: "Outline", value: "outline" },
            ],
        },
    ],
    // Custom ghost: a fit-width pill collapses under auto-skeletonize, so draw a pill directly.
    skeleton: (_ctx: LayoutCtx): EngineNode => pill(0.45, 38),
};

register(buttonElement);

interface BadgeData {
    text: string;
}

export const badgeElement: ElementSpec<BadgeData> = {
    type: "badge",
    label: "Badge",
    category: "branding",
    tier: "primitive",
    create: () => ({ text: "NEW" }),
    layout: (d: BadgeData, ctx: LayoutCtx): EngineNode => ({
        w: fit(),
        h: fit(),
        padding: { top: 5, bottom: 5, left: 11, right: 11 },
        alignX: "center",
        alignY: "center",
        fill: { color: ctx.theme.bg, radius: 99, border: { color: ctx.theme.accent, width: 1.3 } },
        children: [
            {
                w: fit(),
                h: fit(),
                text: {
                    text: d.text,
                    fontId: fontStack("mono", ctx.theme),
                    size: 11,
                    weight: 700,
                    color: ctx.theme.accent,
                    align: "center",
                    wrap: "none",
                },
            },
        ],
    }),
    controls: [{ key: "text", label: "Text", control: "text" }],
};

register(badgeElement);

// A link/bookmark card (the static fallback for an iframe/embed).
interface EmbedData {
    title?: string;
    url?: string;
}

export const embedElement: ElementSpec<EmbedData> = {
    type: "embed",
    label: "Embed",
    category: "interactive",
    tier: "interactive",
    create: () => ({ title: "Embedded link", url: "https://galleo.app" }),
    layout: (d: EmbedData, ctx: LayoutCtx): EngineNode => ({
        w: grow(),
        h: fit(),
        direction: "row",
        gap: 13,
        alignY: "center",
        padding: { top: 14, bottom: 14, left: 16, right: 16 },
        fill: {
            color: ctx.theme.bg,
            radius: Math.round(ctx.theme.radius / 2),
            border: { color: ctx.theme.line, width: 1 },
        },
        children: [
            {
                w: fit(),
                h: fit(),
                text: {
                    text: "🔗",
                    fontId: fontStack("ui", ctx.theme),
                    size: 20,
                    color: ctx.theme.muted,
                    align: "center",
                    wrap: "none",
                },
            },
            {
                w: grow(),
                h: fit(),
                direction: "col",
                gap: 3,
                children: [
                    {
                        w: grow(),
                        h: fit(),
                        text: {
                            text: d.title ?? "Embedded link",
                            fontId: fontStack("ui", ctx.theme),
                            size: 15,
                            weight: 600,
                            color: ctx.theme.ink,
                            align: "start",
                            wrap: "words",
                        },
                    },
                    {
                        w: grow(),
                        h: fit(),
                        text: {
                            text: d.url ?? "https://…",
                            fontId: fontStack("mono", ctx.theme),
                            size: 12,
                            color: ctx.theme.muted,
                            align: "start",
                            wrap: "none",
                        },
                    },
                ],
            },
        ],
    }),
    controls: [
        { key: "title", label: "Title", control: "text" },
        { key: "url", label: "URL", control: "text", placeholder: "https://…" },
    ],
    fallback: (d) => d,
};

register(embedElement);

interface GradientData {
    from?: string;
    to?: string;
    angle?: number;
    height?: number;
}

export const gradientElement: ElementSpec<GradientData> = {
    type: "gradient",
    label: "Gradient",
    category: "decoration",
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

interface DividerData {
    thickness?: number;
    color?: string;
}

export const dividerElement: ElementSpec<DividerData> = {
    type: "divider",
    label: "Divider",
    category: "layout",
    tier: "primitive",
    create: () => ({ thickness: 2 }),
    layout: (d: DividerData, ctx: LayoutCtx): EngineNode => {
        const th = d.thickness ?? 2;
        return {
            w: grow(),
            h: fixed(th),
            fill: { color: d.color ?? ctx.theme.line, radius: Math.max(0.5, th / 2) },
        };
    },
    controls: [
        {
            key: "thickness",
            label: "Thickness",
            control: "slider",
            min: 1,
            max: 10,
            step: 1,
            unit: "px",
        },
        { key: "color", label: "Color override", control: "color", group: "Appearance" },
    ],
};

register(dividerElement);

interface SpacerData {
    height: number;
}

export const spacerElement: ElementSpec<SpacerData> = {
    type: "spacer",
    label: "Spacer",
    category: "layout",
    tier: "primitive",
    create: () => ({ height: 32 }),
    layout: (d: SpacerData, _ctx: LayoutCtx): EngineNode => ({ w: grow(), h: fixed(d.height) }),
    resize: { width: false, height: { key: "height", min: 8, max: 240, step: 4 } },
    controls: [],
    skeleton: (): EngineNode => ({
        w: grow(),
        h: fixed(22),
        fill: { color: "#e8e3d6", radius: 4 },
    }),
};

register(spacerElement);

// The palette-hidden type inserted into a *preview* artifact while dragging over open space.
export const DROP_GHOST = "__dropghost";

interface GhostData {
    type: string; // the dragged element's type, whose skeleton this mirrors
}

// Retint a hand-authored skeleton's GHOST fills to a theme-derived tone, so custom skeletons (charts,
// diagrams, …) match the themed drop preview instead of a fixed light grey.
function retint(node: EngineNode, to: string): EngineNode {
    const out: EngineNode = { ...node };
    if (out.fill?.color === GHOST) out.fill = { ...out.fill, color: to };
    if (out.children) out.children = out.children.map((c) => retint(c, to));
    return out;
}

// Internal, palette-hidden element rendered ONLY as the live drop preview. It lays out the dragged
// element's own structural skeleton inline, so when spliced into a preview artifact the section reflows
// and auto-sizes to the post-drop state — instead of squishing a fixed overlay into the current gap. A
// dashed accent outline + theme-toned ghost mark it as a pending drop. An element that declares a custom
// `skeleton` (chart/diagram shapes) uses it verbatim; everything else auto-skeletonizes its real layout.
export const dropGhostElement: ElementSpec<GhostData> = {
    type: DROP_GHOST,
    label: "Drop preview",
    category: "internal",
    tier: "primitive",
    create: () => ({ type: "text" }),
    layout: (data: GhostData, ctx: LayoutCtx): EngineNode => {
        const spec = getElement(data.type);
        const colors = {
            bar: mix(ctx.theme.surface, ctx.theme.ink, 0.2),
            panel: ctx.theme.surface,
            line: ctx.theme.line,
        };
        const ghost: EngineNode =
            spec && spec.type !== DROP_GHOST
                ? spec.skeleton
                    ? retint(spec.skeleton(ctx), colors.bar)
                    : skeletonize(spec.layout(spec.create(), ctx), colors)
                : skeletonize({ w: grow(), h: fit(28) }, colors);
        return {
            w: grow(),
            h: fit(),
            padding: { top: 8, right: 8, bottom: 8, left: 8 },
            fill: {
                color: `color-mix(in srgb, ${ctx.theme.accent} 8%, transparent)`,
                radius: 10,
                border: { color: ctx.theme.accent, width: 2, style: "dashed" },
            },
            children: [ghost],
        };
    },
    controls: [],
};

register(dropGhostElement);
