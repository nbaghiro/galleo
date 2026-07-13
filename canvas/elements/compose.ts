import type { LayoutCtx } from "@elements/spec";
import type { EngineNode } from "@engine/node";
import type { ElementAddress } from "@model/target";
import type { ElementInstance, Section, SectionBackground } from "@model/artifact";
import type { ElementLayout } from "@model/geometry";
import type { Tokens } from "@themes";
import { getElement } from "@elements/spec";
import { elementRegionId, sectionRegionId } from "@model/target";
import { fit, grow, percent } from "@model/geometry";
import { fontStack, luminance, mixWhite } from "@themes";

const card = (title: string, body: string): ElementInstance => ({
    type: "card",
    data: {
        style: "solid",
        children: [
            { type: "text", data: { text: title, style: "h3" } },
            { type: "text", data: { text: body, style: "body" } },
        ],
    },
});

export interface Preset {
    id: string;
    label: string;
    previewType: string; // element-preview svg key for the thumbnail
    build: () => ElementInstance;
}

export const PRESETS: Preset[] = [
    {
        id: "cards",
        label: "Cards",
        previewType: "cards",
        build: () => ({
            type: "group",
            data: {
                direction: "row",
                children: [
                    card("First idea", "A short supporting line."),
                    card("Second idea", "A short supporting line."),
                    card("Third idea", "A short supporting line."),
                ],
            },
        }),
    },
];

export const GUTTER = 14; // inset around a section column's top-level element (content width = colW - 2*GUTTER)
const pad = (n: number) => ({ top: n, right: n, bottom: n, left: n });

function emptyRegionNode(ctx: LayoutCtx): EngineNode {
    return {
        w: grow(),
        h: fit(90),
        alignX: "center",
        alignY: "center",
        fill: {
            color: ctx.theme.bg,
            radius: 10,
            border: { color: ctx.theme.line, width: 1.5, style: "dashed" },
        },
        children: [
            {
                w: fit(),
                h: fit(),
                text: {
                    text: "+ drop element",
                    fontId: fontStack("mono", ctx.theme),
                    size: 12,
                    color: ctx.theme.muted,
                    align: "center",
                    wrap: "none",
                },
            },
        ],
    };
}

function applyLayout(node: EngineNode, layout: ElementLayout | undefined): EngineNode {
    if (!layout) return node;
    if (layout.width === "fit") node.w = fit();
    else if (layout.width === "fill") node.w = grow();
    else if (layout.width && typeof layout.width === "object")
        node.w = percent(layout.width.pct / 100);
    // fill = stretch to row cross-height; drop aspect so it can grow (images then cover-fill via `fit`)
    if (layout.height === "fill") {
        node.h = grow();
        node.aspect = undefined;
    }
    if (layout.align) node.alignSelf = layout.align;
    if (layout.radius !== undefined) {
        if (node.image) node.image.radius = layout.radius;
        else if (node.fill) node.fill.radius = layout.radius;
    }
    return node;
}

function composeElement(inst: ElementInstance, ctx: LayoutCtx, addr: ElementAddress): EngineNode {
    const spec = getElement(inst.type);
    if (!spec) {
        return {
            id: elementRegionId(addr),
            w: grow(),
            h: fit(40),
            fill: { color: "#f6dede", radius: 6 },
        };
    }
    let node: EngineNode;
    if (spec.container) {
        const childInstances = spec.container.children(inst.data);
        if (childInstances.length === 0) {
            // empty container (empty column / drag-emptied group) → drop region
            node = emptyRegionNode(ctx);
        } else {
            const kids = childInstances.map((child, i) =>
                composeElement(child, ctx, { section: addr.section, path: [...addr.path, i] }),
            );
            node = spec.container.arrange(inst.data, ctx, kids);
        }
    } else {
        node = spec.layout(inst.data, ctx);
    }
    node.id = elementRegionId(addr);
    return applyLayout(node, inst.layout);
}

// lift a too-dark accent toward a legible luminance (keeping hue) so it reads on a dark/scrimmed bg
const ACCENT_DARK_TRIGGER = 0.45;
const ACCENT_LIFT_TARGET = 0.62;
function readableAccentOnDark(hex: string): string {
    if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return hex;
    const l = luminance(hex);
    if (l >= ACCENT_DARK_TRIGGER) return hex;
    return mixWhite(hex, Math.min(1, Math.max(0, (ACCENT_LIFT_TARGET - l) / (1 - l))));
}

function bgIsDark(bg: SectionBackground | undefined): boolean {
    if (!bg || bg.kind === "none") return false;
    if (bg.dark !== undefined) return bg.dark;
    if (bg.kind === "image") return true; // the scrim makes images dark
    if (bg.kind === "color" && bg.color) return luminance(bg.color) < 0.5;
    if (bg.kind === "gradient" && bg.gradient) return luminance(bg.gradient.from) < 0.5;
    return false;
}

// light-on-dark tokens; lift a too-dark accent, then re-pair onAccent dark so solid fills keep contrast
function onDark(t: Tokens): Tokens {
    const accent = readableAccentOnDark(t.accent);
    return {
        ...t,
        ink: "#ffffff",
        soft: "rgba(255,255,255,0.86)",
        muted: "rgba(255,255,255,0.64)",
        line: "rgba(255,255,255,0.24)",
        surface: "rgba(255,255,255,0.10)",
        bg: "rgba(255,255,255,0.06)",
        accent,
        onAccent: accent !== t.accent ? "#0c0c0c" : t.onAccent,
    };
}

// mirrors composeSection's token swap so callers (e.g. the inline text editor) can match
export function sectionContentTokens(section: Section, theme: Tokens): Tokens {
    return bgIsDark(section.background) ? onDark(theme) : theme;
}

export function composeSection(section: Section, ctx: LayoutCtx): EngineNode {
    const bg = section.background;
    const bleed = section.bleed ?? false;
    const continuous = ctx.format.kind === "continuous";
    const webBand = ctx.format.id === "web"; // full-bleed band, content stays in a centered column
    const innerMax = ctx.format.maxContentWidth ?? 1180;
    const contentTheme = bgIsDark(bg) ? onDark(ctx.theme) : ctx.theme;
    const cctx: LayoutCtx = { ...ctx, theme: contentTheme };

    const content = composeElement(section.root, cctx, { section: section.id, path: [] });
    const inner: EngineNode = {
        w: webBand ? grow(undefined, innerMax) : grow(),
        h: fit(),
        padding: pad(GUTTER),
        children: [content],
    };

    // continuous (doc/web) merges sections seamlessly → no card radius/border
    const radius = bleed || continuous ? 0 : ctx.theme.radius;
    const node: EngineNode = {
        id: sectionRegionId(section.id),
        w: grow(),
        h: fit(),
        alignX: webBand ? "center" : undefined,
        padding: bleed ? { top: 64, bottom: 64, left: 72, right: 72 } : pad(36),
        // clip X so an over-wide element is cropped at the section edge, not spilling past the card;
        // height stays unclipped for fit-growth + deck slide-fitting
        clip: { x: true },
        children: [inner],
    };

    // framed sections wear card decoration: shadow always, but the border only on a light bg (over dark a
    // hairline reads as an awkward frame); bleed/continuous merge into the page → undecorated
    const framed = !bleed && !continuous;
    const shadow = framed ? ctx.theme.shadow : undefined;
    const border =
        framed && !bgIsDark(bg)
            ? { color: ctx.theme.line, width: ctx.theme.border ?? 1 }
            : undefined;

    if (bg?.kind === "image" && bg.image) {
        // scrim: per-section override → theme default → fallback
        node.image = {
            src: bg.image,
            fit: "cover",
            radius,
            scrim: bg.scrim ?? ctx.theme.scrim ?? 0.45,
            border,
            shadow,
        };
    } else if (bg?.kind === "gradient" && bg.gradient) {
        node.fill = { gradient: bg.gradient, radius, border, shadow };
    } else if (bg?.kind === "color" && bg.color) {
        node.fill = { color: bg.color, radius, border, shadow };
    } else {
        node.fill = continuous
            ? { color: ctx.theme.surface }
            : { color: ctx.theme.surface, radius, border, shadow };
    }
    return node;
}
