import type { EngineNode, MeasureText, Rect } from "@engine/node";
import type { ElementInstance, Section } from "@model/artifact";
import type { FormatDescriptor } from "@model/geometry";
import type { Tokens } from "@themes";
import { fit, fixed, grow, percent } from "@model/geometry";

const registry = new Map<string, ElementSpec>();

export function register<Data>(spec: ElementSpec<Data>): void {
    registry.set(spec.type, spec as ElementSpec);
}

// `group` and `card` merged into `container`. Stored artifacts are migrated
// (scripts/migrate-container.ts), but the LLM is a client we do not control: it will drift back to
// the old names whatever the prompt says, and an unresolved type paints the pink unknown-element box
// in a customer's deck. Two entries are far cheaper than that.
// Renamed or merged element types, so a row written before the change still resolves. The media
// merge also needs `data.kind`, which the write path fills in (`withMediaKinds`); this keeps the
// registry lookup alive in between.
const LEGACY_TYPES: Record<string, string> = {
    group: "container",
    card: "container",
    image: "media",
    gif: "media",
    illustration: "media",
    sticker: "media",
    video: "media",
    avatar: "media",
    icon: "media",
    graphic: "media",
};

export function getElement(type: string): ElementSpec | undefined {
    return registry.get(type) ?? registry.get(LEGACY_TYPES[type] ?? "");
}

/** The resize contract for this data; a spec may vary it by what it is holding. */
export const resizeOf = (spec: ElementSpec, data: unknown): ResizeSpec | undefined =>
    typeof spec.resize === "function" ? spec.resize(data) : spec.resize;

/** The name a person sees for this data; `labelFor` wins where one element covers several kinds. */
export const labelOf = (spec: ElementSpec, data: unknown): string =>
    spec.labelFor?.(data) ?? spec.label;

/** Whether this data mounts a live overlay. */
export const isLiveData = (spec: ElementSpec, data: unknown): boolean =>
    spec.tier === "interactive" ||
    (typeof spec.live === "function" ? spec.live(data) : spec.live === true);

export function listElements(): ElementSpec[] {
    return [...registry.values()];
}

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
    // the engine's own measurement path, for layouts that must size boxes from text before the
    // solver runs (a diagram's node widths); same source as layout(), so the two can never disagree
    measure: MeasureText;
    plain?: boolean; // read-only render (previews/thumbnails): no editor-only affordances
    // autofit: composed on top of the width ramp, so a section that overflows its frame re-wraps at
    // full width with smaller type instead of being scaled as pixels. 1 (absent) = authored size.
    fitScale?: number;
    // this element's own region id, so a surface can mint sub-element ids under it (chart datums);
    // set by composeElement, absent when a node is laid out outside the compose walk
    region?: string;
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
    | "vector" // paste-SVG import → a parsed Vector (graphic element)
    | "custom";

export interface ControlField {
    key: string;
    label: string;
    control: ControlKind;
    // select / segmented; `icon` shows on the bar, `preview` is inline art for the dropdown row
    options?: { label: string; value: string; icon?: string; preview?: string }[];
    min?: number;
    max?: number;
    step?: number;
    unit?: string; // suffix on slider values; the number field renders none
    multiline?: boolean; // text → textarea
    placeholder?: string;
    icon?: string; // leading glyph on the compact format bar (which drops labels)
    mediaKind?: string; // for `media` controls: the kind the picker opens (photo · gif · …)
    posterKey?: string; // for `media` controls: sibling data key that receives the picked item's still frame
    dimsKey?: string; // for `media` controls: sibling data key that receives the source's { w, h }
    group?: string; // optional inspector section heading
    visibleWhen?: (data: Record<string, unknown>) => boolean;
}

export type ElementTier = "primitive" | "unit" | "container" | "interactive";

export interface ResizeSpec {
    width?: boolean; // right/corner handle → ElementLayout.width { pct }; defaults on
    height?: { key: string; min: number; max: number; step?: number }; // bottom handle → data[key]
    aspect?: { min: number; max: number }; // bottom handle → data.aspect (width / height)
}

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
    // the data key of a plain-string label editable in place (no marks); the arrange publishes the
    // leaf's geometry as a `label:` region so the overlay can sit exactly over the painted text
    inlineText?: string;
    bar?: string[]; // control keys to surface in the on-canvas format bar
    frame?: boolean; // has a visible frame (fill/image) → corner-radius slider in the inspector

    // canvas resize handles: width → a universal ElementLayout %; height/aspect → an explicit data field
    // A function when one element covers shapes that resize differently: media frames a picture by
    // aspect but sizes an icon by its side.
    resize?: ResizeSpec | ((data: Data) => ResizeSpec | undefined);
    // the inspector title when one element covers kinds a person names differently (media's Icon
    // vs Image); absent = the static `label`
    labelFor?: (data: Data) => string;
    fallback?: (data: Data) => Data; // interactive -> static for paged/export
    // playback mounts a live overlay over this element without giving up the editing its tier buys
    live?: boolean | ((data: Data) => boolean);
    // compose() uses children+arrange; ops use children+withChildren; `layout` stands alone
    container?: {
        children: (data: Data) => ElementInstance[];
        arrange: (data: Data, ctx: LayoutCtx, children: EngineNode[]) => EngineNode;
        withChildren: (data: Data, children: ElementInstance[]) => Data;
        // children exist to be selected and edited, not rearranged: the element owns its own slots, so
        // it is a leaf to drag-and-drop and never shows the empty-cell placeholder
        closed?: boolean;
        // A closed container opts the sibling-divider gesture into its own sizing: `of` folds child
        // indices into resizable slots (a diagram cell owns its label + detail children), `resize`
        // maps new slot fractions (pct of the shared row, two entries per drag) onto the data.
        // null = this data doesn't resize (a positioned layout); absent = never resizable.
        slots?: (data: Data) => {
            of: (childIndex: number) => number;
            resize: (entries: { slot: number; pct: number }[]) => Data;
        } | null;
    };
}

// flat scalar props; the studio adapts them to the structured Section on read/write
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
        key: "pinned",
        label: "Pin to top",
        control: "toggle",
        group: "Width",
    },
    {
        // The three tones sit beside the raw kinds because they are what a band should normally be:
        // named against the theme, so the section stays legible in whatever theme it is read under.
        key: "bgKind",
        label: "Background",
        control: "segmented",
        options: [
            { label: "None", value: "none" },
            { label: "Tint", value: "tint" },
            { label: "Contrast", value: "contrast" },
            { label: "Accent", value: "accent" },
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

export const GHOST = "#e3ddce";
export const GHOST_PANEL = "#f4f0e8";
export const GHOST_LINE = "#e0d9c8";

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
        columns: node.columns,
        rowGap: node.rowGap,
        span: node.span,
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
    if ((node.image || node.surface) && !node.children) {
        return {
            ...base,
            aspect: base.aspect ?? 16 / 9,
            fill: { color: colors.bar, radius: node.image?.radius ?? 8 },
        };
    }
    // containers keep their real height/grid and ghost only the panel
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
