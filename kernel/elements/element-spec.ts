import type { EngineNode, Rect } from "@engine/node";
import type { ElementInstance } from "@model/content";
import type { FormatDescriptor } from "@model/format";
import type { Tokens } from "@themes/theme";

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
    // Studio-only editing affordances (inert for layout/present/export — read solely by surfaces/studio):
    richText?: boolean; // primary text supports inline marks → marks-aware editor + inline mark bar
    bar?: string[]; // control keys (from `controls`) to surface in the on-canvas format bar
    // Direct-manipulation resize on the canvas (drag handles on the selection box). Width is a universal
    // ElementLayout %; height/aspect drive an explicit data field where the element has one.
    resize?: {
        width?: boolean; // right/corner handle → ElementLayout.width { pct }; defaults on
        height?: { key: string; min: number; max: number; step?: number }; // bottom handle → data[key]
        aspect?: { min: number; max: number }; // bottom handle → data.aspect (width / height)
    };
    // Container spacing handles on the canvas: a handle in the gap between children, and one at the
    // content inset. Each drives an element data field. `def` is the value when the field is unset.
    spacing?: {
        gap?: { key: string; min: number; max: number; def: number };
        padding?: { key: string; min: number; max: number; def: number };
    };
    fallback?: (data: Data) => Data; // interactive -> static for paged/export
    // Structural ghost shown in the palette + as the drop preview. Optional: if absent, one is
    // derived automatically from layout(create()) via skeletonize() in @elements/skeleton.
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
