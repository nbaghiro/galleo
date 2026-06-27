import type { LayoutCtx } from "@elements/element-spec";
import type { EngineNode } from "@engine/node";
import type { ElementAddress } from "@model/address";
import type { ElementInstance, ElementLayout, Section, SectionBackground } from "@model/content";
import type { Tokens } from "@themes/theme";
import { getElement } from "@elements/registry";
import { fallbackTemplate, TEMPLATES } from "@elements/templates";
import { cellRegionId, elementRegionId, sectionRegionId } from "@model/address";
import { fit, grow, percent } from "@model/size";
import { fontStack } from "@themes/theme";

// Compose one Section into an EngineNode tree, tagging section / cell / element nodes with region ids
// (so the engine can report their geometry for selection + drop-targets). Containers recurse here so
// nested elements get addressable paths.

const GUTTER = 14;
const pad = (n: number) => ({ top: n, right: n, bottom: n, left: n });

function emptyCell(ctx: LayoutCtx): EngineNode {
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

// Per-instance layout: how the element sits in its parent row/column (width + cross-axis align).
function applyLayout(node: EngineNode, layout: ElementLayout | undefined): EngineNode {
    if (!layout) return node;
    if (layout.width === "fit") node.w = fit();
    else if (layout.width === "fill") node.w = grow();
    else if (layout.width && typeof layout.width === "object") node.w = percent(layout.width.pct / 100);
    // Fill = stretch to the row's cross-height; drop any intrinsic aspect so it can grow (images
    // then cover-fill via their `fit`).
    if (layout.height === "fill") {
        node.h = grow();
        node.aspect = undefined;
    }
    if (layout.align) node.alignSelf = layout.align;
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
        const kids = spec.container
            .children(inst.data)
            .map((child, i) =>
                composeElement(child, ctx, {
                    section: addr.section,
                    cell: addr.cell,
                    path: [...addr.path, i],
                }),
            );
        node = spec.container.arrange(inst.data, ctx, kids);
    } else {
        node = spec.layout(inst.data, ctx);
    }
    node.id = elementRegionId(addr);
    return applyLayout(node, inst.layout);
}

function luminance(hex: string): number {
    const h = hex.replace("#", "");
    if (h.length < 6) return 1;
    return (
        (0.299 * parseInt(h.slice(0, 2), 16) +
            0.587 * parseInt(h.slice(2, 4), 16) +
            0.114 * parseInt(h.slice(4, 6), 16)) /
        255
    );
}

function bgIsDark(bg: SectionBackground | undefined): boolean {
    if (!bg || bg.kind === "none") return false;
    if (bg.dark !== undefined) return bg.dark;
    if (bg.kind === "image") return true; // the scrim makes images dark
    if (bg.kind === "color" && bg.color) return luminance(bg.color) < 0.5;
    if (bg.kind === "gradient" && bg.gradient) return luminance(bg.gradient.from) < 0.5;
    return false;
}

// Over a dark background, content reads in light tones (kept the accent).
function onDark(t: Tokens): Tokens {
    return {
        ...t,
        ink: "#ffffff",
        soft: "rgba(255,255,255,0.86)",
        muted: "rgba(255,255,255,0.64)",
        line: "rgba(255,255,255,0.24)",
        surface: "rgba(255,255,255,0.10)",
        bg: "rgba(255,255,255,0.06)",
    };
}

export function composeSection(section: Section, ctx: LayoutCtx): EngineNode {
    const bg = section.background;
    const bleed = section.bleed ?? false;
    const continuous = ctx.format.kind === "continuous";
    const webBand = ctx.format.id === "web"; // full-bleed band, but content stays in a centered column
    const innerMax = ctx.format.maxContentWidth ?? 1180;
    const contentTheme = bgIsDark(bg) ? onDark(ctx.theme) : ctx.theme;
    const cctx: LayoutCtx = { ...ctx, theme: contentTheme };

    const tmpl = TEMPLATES[section.grid] ?? fallbackTemplate;
    const cells = tmpl.cells.map((cellKey, i): EngineNode => {
        const inst = section.cells[cellKey]?.element;
        const content = inst
            ? composeElement(inst, cctx, { section: section.id, cell: cellKey, path: [] })
            : emptyCell(cctx);
        return {
            id: cellRegionId(section.id, cellKey),
            w: tmpl.widths[i] ?? grow(),
            h: fit(),
            padding: pad(GUTTER),
            direction: "col",
            children: [content],
        };
    });
    const inner: EngineNode = {
        w: webBand ? grow(undefined, innerMax) : grow(),
        h: fit(),
        direction: "row",
        gap: 0,
        alignY: "center",
        children: cells,
    };

    // Continuous formats (doc/web) merge sections into one seamless surface: no card radius/border,
    // and the canvas stacks them with no gap so they read as one scrolling document / fluid site.
    const radius = bleed || continuous ? 0 : ctx.theme.radius;
    const node: EngineNode = {
        id: sectionRegionId(section.id),
        w: grow(),
        h: fit(),
        alignX: webBand ? "center" : undefined, // center the capped content column in the full-width band
        padding: bleed ? { top: 64, bottom: 64, left: 72, right: 72 } : pad(36),
        children: [inner],
    };

    if (bg?.kind === "image" && bg.image) {
        node.image = { src: bg.image, fit: "cover", radius, scrim: bg.scrim ?? 0.45 };
    } else if (bg?.kind === "gradient" && bg.gradient) {
        node.fill = { gradient: bg.gradient, radius };
    } else if (bg?.kind === "color" && bg.color) {
        node.fill = { color: bg.color, radius };
    } else {
        node.fill = continuous
            ? { color: ctx.theme.surface }
            : { color: ctx.theme.surface, radius, border: bleed ? undefined : { color: ctx.theme.line, width: 1 } };
    }
    return node;
}
