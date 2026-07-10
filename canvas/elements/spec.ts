// The element system's contracts + machinery — the ElementSpec / SectionSpec schemas, the registry,
// the content-tree walker, and the structural ghost (skeleton) builders. Everything an element module
// needs from the framework. (Merged: element-spec · section-spec · registry · walk · skeleton.)

import type { EngineNode, Rect } from "@engine/node";
import type { ElementInstance, Section } from "@model/artifact";
import type { FormatDescriptor } from "@model/geometry";
import type { Tokens } from "@themes";
import { fit, fixed, grow, percent } from "@model/geometry";

const registry = new Map<string, ElementSpec>();

export function register<Data>(spec: ElementSpec<Data>): void {
    registry.set(spec.type, spec as ElementSpec);
}

export function getElement(type: string): ElementSpec | undefined {
    return registry.get(type);
}

export function listElements(): ElementSpec[] {
    return [...registry.values()];
}

// Visit every element in a section — the root, then recursively any container children — depth-first.
// The single place the content tree's element traversal lives.
export function walkElements(section: Section, visit: (el: ElementInstance) => void): void {
    const recurse = (el?: ElementInstance): void => {
        if (!el) return;
        visit(el);
        const kids = (el.data as { children?: ElementInstance[] }).children;
        if (Array.isArray(kids)) kids.forEach(recurse);
    };
    recurse(section.root);
}

export interface LayoutCtx {
    box: Rect;
    availWidth: number;
    format: FormatDescriptor;
    theme: Tokens;
}

export type ControlKind =
    | "select"
    | "segmented"
    | "align" // left/center/right icon group
    | "slider"
    | "toggle"
    | "color"
    | "number"
    | "text"
    | "media"
    | "icon" // icon glyph picker (Iconify) → sets a nested { id, body, vb }
    | "iconColor" // theme-role color swatches for a themed icon
    | "custom";

export interface ControlField {
    key: string;
    label: string;
    control: ControlKind;
    options?: { label: string; value: string; icon?: string }[]; // select / segmented (icon → shown on the bar)
    min?: number;
    max?: number;
    step?: number;
    unit?: string; // suffix on slider/number values
    multiline?: boolean; // text → textarea
    placeholder?: string;
    icon?: string; // a leading glyph identifying the control on the compact format bar (which drops labels)
    mediaKind?: string; // for `media` controls: the media kind the picker opens for (photo · gif · …)
    group?: string; // optional inspector section heading
    visibleWhen?: (data: Record<string, unknown>) => boolean; // conditional visibility
}

export type ElementTier = "primitive" | "smart" | "container" | "interactive";

// The universal contract: every element (text, image, chart, ...) is one of these.
export interface ElementSpec<Data = unknown> {
    type: string;
    label: string;
    category: string;
    tier: ElementTier;
    create: () => Data;
    layout: (data: Data, ctx: LayoutCtx) => EngineNode;
    controls: ControlField[];
    // Studio-only editing affordances (inert for layout/present/export — read solely by the editor):
    richText?: boolean; // primary text supports inline marks → marks-aware editor + inline mark bar
    bar?: string[]; // control keys (from `controls`) to surface in the on-canvas format bar
    frame?: boolean; // has a visible frame (fill/image) → offer the universal corner-radius bar control

    // Direct-manipulation resize on the canvas (drag handles on the selection box). Width is a universal
    // ElementLayout %; height/aspect drive an explicit data field where the element has one.
    resize?: {
        width?: boolean; // right/corner handle → ElementLayout.width { pct }; defaults on
        height?: { key: string; min: number; max: number; step?: number }; // bottom handle → data[key]
        aspect?: { min: number; max: number }; // bottom handle → data.aspect (width / height)
    };
    fallback?: (data: Data) => Data; // interactive -> static for paged/export
    // Structural ghost shown in the palette + as the drop preview. Optional: if absent, one is
    // derived automatically from layout(create()) via skeletonize() in @elements/spec.
    skeleton?: (ctx: LayoutCtx) => EngineNode;
    // Containers expose their child instances, arrange already-composed child nodes, and immutably
    // swap their children. compose() uses children+arrange to recurse and address nested elements;
    // content ops use children+withChildren to insert/remove generically. `layout` stays the
    // standalone (e.g. skeleton) path.
    container?: {
        children: (data: Data) => ElementInstance[];
        arrange: (data: Data, ctx: LayoutCtx, children: EngineNode[]) => EngineNode;
        withChildren: (data: Data, children: ElementInstance[]) => Data;
    };
}

// Declarative schema for the section property panel — the flat, scalar props (width + background). The
// grid-template picker is inherently visual (live thumbnails), so it stays a bespoke control in the
// studio; everything else renders generically through the shared Field kit, exactly like element
// controls. The studio adapts these flat keys to the structured Section (bleed + background) on
// read/write, and `visibleWhen` handles the background's conditional sub-fields.
export const SECTION_CONTROLS: ControlField[] = [
    {
        key: "bleed",
        label: "Width",
        control: "segmented",
        options: [
            { label: "Contained", value: "contained" },
            { label: "Full-bleed", value: "full" },
        ],
        group: "Width",
    },
    {
        key: "bgKind",
        label: "Background",
        control: "segmented",
        options: [
            { label: "None", value: "none" },
            { label: "Color", value: "color" },
            { label: "Gradient", value: "gradient" },
            { label: "Image", value: "image" },
        ],
        group: "Background",
    },
    {
        key: "bgColor",
        label: "Color",
        control: "color",
        group: "Background",
        visibleWhen: (d) => d.bgKind === "color",
    },
    {
        key: "bgFrom",
        label: "From",
        control: "color",
        group: "Background",
        visibleWhen: (d) => d.bgKind === "gradient",
    },
    {
        key: "bgTo",
        label: "To",
        control: "color",
        group: "Background",
        visibleWhen: (d) => d.bgKind === "gradient",
    },
    {
        key: "bgAngle",
        label: "Angle",
        control: "slider",
        min: 0,
        max: 360,
        step: 5,
        unit: "°",
        group: "Background",
        visibleWhen: (d) => d.bgKind === "gradient",
    },
    {
        key: "bgImage",
        label: "Image",
        control: "media",
        placeholder: "https://… image url",
        group: "Background",
        visibleWhen: (d) => d.bgKind === "image",
    },
    {
        key: "bgScrim",
        label: "Darken",
        control: "slider",
        min: 0,
        max: 0.8,
        step: 0.05,
        group: "Background",
        visibleWhen: (d) => d.bgKind === "image",
    },
];

// Skeletons are structural ghosts shown in the element palette and as drop previews while dragging
// an element over a section. Every element gets one automatically (from layout() of default data,
// ghosted); a spec may override `skeleton` for a richer shape (chart, table, ...).

export const GHOST = "#e3ddce"; // bars / boxes
export const GHOST_PANEL = "#f4f0e8"; // panel backgrounds
export const GHOST_LINE = "#e0d9c8"; // borders

// --- ghost building blocks (reusable by custom skeletons) ---

export const bar = (widthFrac: number, h: number): EngineNode => ({
    w: percent(widthFrac),
    h: fixed(h),
    fill: { color: GHOST, radius: Math.min(4, h / 2) },
});

export const block = (aspect: number): EngineNode => ({
    w: grow(),
    h: fit(),
    aspect,
    fill: { color: GHOST, radius: 8 },
});

export const pill = (widthFrac: number, h: number): EngineNode => ({
    w: percent(widthFrac),
    h: fixed(h),
    fill: { color: GHOST, radius: 99 },
});

export const dot = (d: number): EngineNode => ({
    w: fixed(d),
    h: fixed(d),
    fill: { color: GHOST, radius: 99 },
});

// --- auto-skeletonize: turn any element's layout output into a ghost ---

// Ghost palette — defaults to the editor's neutral tones; the live-build skeleton passes theme-derived
// colors so the placeholder respects the active artifact theme (dark on dark, etc.).
export interface GhostColors {
    bar: string; // text/leaf placeholders
    panel: string; // container/section backgrounds
    line: string; // borders
}
const DEFAULT_GHOST: GhostColors = { bar: GHOST, panel: GHOST_PANEL, line: GHOST_LINE };

function textBars(text: string, size: number, color: string): EngineNode[] {
    const h = Math.max(6, Math.round(size * 0.6));
    const len = text.trim().length || 6;
    const lines = len > 60 ? 3 : len > 20 ? 2 : 1;
    const out: EngineNode[] = [];
    for (let i = 0; i < lines; i++) {
        const last = i === lines - 1;
        const frac = lines === 1 ? Math.min(1, Math.max(0.25, len / 36)) : last ? 0.55 : 1;
        out.push({
            w: percent(frac),
            h: fixed(h),
            fill: { color, radius: Math.min(4, h / 2) },
        });
    }
    return out;
}

export function skeletonize(node: EngineNode, colors: GhostColors = DEFAULT_GHOST): EngineNode {
    const base: EngineNode = {
        w: node.w,
        h: node.h,
        aspect: node.aspect,
        direction: node.direction,
        padding: node.padding,
        gap: node.gap,
        alignX: node.alignX,
        alignY: node.alignY,
    };
    if (node.text) {
        return {
            ...base,
            direction: "col",
            gap: Math.max(6, Math.round(node.text.size * 0.4)),
            children: textBars(node.text.text, node.text.size, colors.bar),
        };
    }
    // a media LEAF (an image/surface element with no children) → a single ghost panel sized like it
    if ((node.image || node.surface) && !node.children) {
        return {
            ...base,
            aspect: base.aspect ?? 16 / 9,
            fill: { color: colors.bar, radius: node.image?.radius ?? 8 },
        };
    }
    // any container — INCLUDING a section that carries a background image — ghosts its panel and
    // recurses into its children, so it keeps its real height + grid instead of collapsing to a 16:9 box.
    const out: EngineNode = { ...base };
    if (node.fill || node.image || node.surface) {
        out.fill = {
            color: colors.panel,
            radius: node.fill?.radius ?? node.image?.radius,
            border: node.fill?.border
                ? { color: colors.line, width: node.fill.border.width }
                : undefined,
        };
    }
    if (node.children) out.children = node.children.map((c) => skeletonize(c, colors));
    return out;
}

export function skeletonFor(spec: ElementSpec, ctx: LayoutCtx): EngineNode {
    if (spec.skeleton) return spec.skeleton(ctx);
    return skeletonize(spec.layout(spec.create(), ctx));
}
