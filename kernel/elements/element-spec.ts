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
    options?: { label: string; value: string }[];
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
