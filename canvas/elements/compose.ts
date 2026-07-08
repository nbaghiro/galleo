import type { LayoutCtx } from "@elements/spec";
import type { EngineNode } from "@engine/node";
import type { ElementAddress } from "@model/target";
import type { ElementInstance, Section, SectionBackground } from "@model/artifact";
import type { ElementLayout, Size } from "@model/geometry";
import type { Tokens } from "@themes";
import { getElement } from "@elements/spec";
import { cellRegionId, elementRegionId, sectionRegionId } from "@model/target";
import { fit, grow, percent } from "@model/geometry";
import { fontStack, luminance, mixWhite } from "@themes";

// --- section grid templates: predefined per-cell width specs + one-click preset inserts ---
// composeSection() (below) builds each cell's box from these and tags it for selection; spacing is via
// per-cell padding so widths sum to the full width without gap math.

export interface Template {
    id: string;
    cells: string[];
    widths: Size[];
}

const full: Template = { id: "full", cells: ["a"], widths: [grow()] };

export const TEMPLATES: Record<string, Template> = {
    full,
    "split-6040": { id: "split-6040", cells: ["a", "b"], widths: [percent(0.6), percent(0.4)] },
    "split-4060": { id: "split-4060", cells: ["a", "b"], widths: [percent(0.4), percent(0.6)] },
    "two-col": { id: "two-col", cells: ["a", "b"], widths: [percent(0.5), percent(0.5)] },
    "three-up": {
        id: "three-up",
        cells: ["a", "b", "c"],
        widths: [percent(1 / 3), percent(1 / 3), percent(1 / 3)],
    },
};

export const fallbackTemplate = full;

export const TEMPLATE_LABELS: Record<string, string> = {
    full: "Full",
    "split-6040": "60 / 40",
    "split-4060": "40 / 60",
    "two-col": "Two columns",
    "three-up": "Three up",
};

// One-click "smart layout" inserts — pre-built structures assembled from normal, freely-editable
// elements (a group grid of styled cards). Not element types: the picker inserts the built instance,
// after which every piece (each card, its title/body) selects/edits/deletes like any other element.

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
    previewType: string; // element-preview svg key used for the thumbnail
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
                columns: 3,
                children: [
                    card("First idea", "A short supporting line."),
                    card("Second idea", "A short supporting line."),
                    card("Third idea", "A short supporting line."),
                ],
            },
        }),
    },
];

// Compose one Section into an EngineNode tree, tagging section / cell / element nodes with region ids
// (so the engine can report their geometry for selection + drop-targets). Containers recurse here so
// nested elements get addressable paths.

export const GUTTER = 14; // per-cell padding — a top-level element's content width is cellW - 2*GUTTER
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
    else if (layout.width && typeof layout.width === "object")
        node.w = percent(layout.width.pct / 100);
    // Fill = stretch to the row's cross-height; drop any intrinsic aspect so it can grow (images
    // then cover-fill via their `fit`).
    if (layout.height === "fill") {
        node.h = grow();
        node.aspect = undefined;
    }
    if (layout.align) node.alignSelf = layout.align;
    // Universal corner radius: override whatever frame the element painted (its image or its fill).
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
        const kids = spec.container.children(inst.data).map((child, i) =>
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

// An accent dark enough to read as a foreground tone (eyebrows, outline buttons, markers) only on a
// light surface goes invisible over a dark/scrimmed background. Lift it toward a legible luminance
// while keeping its hue; leave already-light or vivid-enough accents untouched.
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

// Over a dark background, content reads in light tones. The accent is lifted only when it's too dark
// to read as a foreground (so eyebrows / outline buttons / markers stay legible); when we lift it, we
// re-pair onAccent dark so solid accent fills (filled buttons, badges, diagram nodes) keep contrast.
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

// The tokens content reads in for a section — light tones over a dark (e.g. image) background, else the
// base theme. Mirrors what composeSection applies, so callers (e.g. the inline text editor) can match.
export function sectionContentTokens(section: Section, theme: Tokens): Tokens {
    return bgIsDark(section.background) ? onDark(theme) : theme;
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
    // Custom column fractions (from a divider drag) override the preset when they match the cell count.
    const custom =
        section.widths && section.widths.length === tmpl.cells.length ? section.widths : null;
    const cells = tmpl.cells.map((cellKey, i): EngineNode => {
        const inst = section.cells[cellKey]?.element;
        const content = inst
            ? composeElement(inst, cctx, { section: section.id, cell: cellKey, path: [] })
            : emptyCell(cctx);
        return {
            id: cellRegionId(section.id, cellKey),
            w: custom ? percent(custom[i]!) : (tmpl.widths[i] ?? grow()),
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

    // A framed section (not full-bleed, not a continuous doc/web merge) wears the theme's card decoration —
    // border + shadow (the design character) — regardless of its background: surface, color, gradient, OR
    // image. Full-bleed and continuous sections merge into the page, so they stay undecorated.
    const framed = !bleed && !continuous;
    const border = framed ? { color: ctx.theme.line, width: ctx.theme.border ?? 1 } : undefined;
    const shadow = framed ? ctx.theme.shadow : undefined;

    if (bg?.kind === "image" && bg.image) {
        // legibility scrim: per-section override → theme default → built-in fallback
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
