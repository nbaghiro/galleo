import type { EngineNode, Rect } from "@engine/node";
import type { FormatDescriptor } from "@model/format";

export interface LayoutCtx {
    box: Rect;
    availWidth: number;
    format: FormatDescriptor;
    tokens: Record<string, unknown>;
    theme: Record<string, unknown>;
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
}
