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

// visit every element depth-first: the root, then container children
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
    | "icon" // icon glyph picker (Iconify) → nested { id, body, vb }
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
    icon?: string; // leading glyph on the compact format bar (which drops labels)
    mediaKind?: string; // for `media` controls: the kind the picker opens (photo · gif · …)
    group?: string; // optional inspector section heading
    visibleWhen?: (data: Record<string, unknown>) => boolean;
}

export type ElementTier = "primitive" | "smart" | "container" | "interactive";

export interface ElementSpec<Data = unknown> {
    type: string;
    label: string;
    category: string;
    tier: ElementTier;
    create: () => Data;
    layout: (data: Data, ctx: LayoutCtx) => EngineNode;
    controls: ControlField[];
    // Studio-only editing affordances (inert for layout/present/export):
    richText?: boolean; // primary text supports inline marks → marks-aware editor + mark bar
    bar?: string[]; // control keys to surface in the on-canvas format bar
    frame?: boolean; // has a visible frame (fill/image) → offer the corner-radius control

    // canvas resize handles: width → a universal ElementLayout %; height/aspect → an explicit data field
    resize?: {
        width?: boolean; // right/corner handle → ElementLayout.width { pct }; defaults on
        height?: { key: string; min: number; max: number; step?: number }; // bottom handle → data[key]
        aspect?: { min: number; max: number }; // bottom handle → data.aspect (width / height)
    };
    fallback?: (data: Data) => Data; // interactive -> static for paged/export
    // palette + drop-preview ghost; if absent, derived from layout(create()) via skeletonize()
    skeleton?: (ctx: LayoutCtx) => EngineNode;
    // compose() uses children+arrange to recurse + address nested elements; ops use children+withChildren
    // to insert/remove. `layout` stays the standalone (e.g. skeleton) path.
    container?: {
        children: (data: Data) => ElementInstance[];
        arrange: (data: Data, ctx: LayoutCtx, children: EngineNode[]) => EngineNode;
        withChildren: (data: Data, children: ElementInstance[]) => Data;
    };
}

// section property panel schema (flat scalar props); the studio adapts these flat keys to the structured
// Section (bleed + background) on read/write
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

export const GHOST = "#e3ddce"; // bars / boxes
export const GHOST_PANEL = "#f4f0e8"; // panel backgrounds
export const GHOST_LINE = "#e0d9c8"; // borders

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

// defaults to neutral tones; the live-build skeleton passes theme-derived colors
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
    // a media leaf (image/surface, no children) → a single ghost panel
    if ((node.image || node.surface) && !node.children) {
        return {
            ...base,
            aspect: base.aspect ?? 16 / 9,
            fill: { color: colors.bar, radius: node.image?.radius ?? 8 },
        };
    }
    // any container (incl. a section with a bg image) ghosts its panel + recurses, keeping real height/grid
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
