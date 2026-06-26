import type { BoxInsets, Size } from "@model/content";

export interface Rect {
    x: number;
    y: number;
    w: number;
    h: number;
}

export type Align = "start" | "center" | "end";

// Backend-abstract drawing context — implemented per target (DOM/canvas/PDF) in @render/backend.
export interface DrawContext {
    [key: string]: unknown;
}

// A measured text size. Named `Measured` to avoid clashing with the DOM `TextMetrics` global.
export interface Measured {
    width: number;
    height: number;
}

// Injected into the engine so the kernel stays pure (no DOM). Wraps `text` at `maxWidth`.
export type MeasureText = (leaf: TextLeaf, maxWidth: number) => Measured;

export interface TextLeaf {
    text: string;
    fontId: string;
    size: number;
    weight?: number;
    lineHeight?: number;
    color?: string;
    align?: Align;
    wrap: "words" | "none";
}

export interface ImageLeaf {
    src: string;
    fit: "cover" | "contain";
    radius?: number;
}

export interface FillLeaf {
    color?: string;
    radius?: number;
    border?: { color: string; width: number };
}

export interface SurfaceLeaf {
    paint: (ctx: DrawContext, box: Rect) => void;
}

// The layout primitive: a flex/box node (Clay-style) or a self-painted surface.
// A node may carry a leaf (fill/image/text/surface) AND children (e.g. a panel with a background).
export interface EngineNode {
    id?: string;
    w: Size;
    h: Size;
    aspect?: number;
    direction?: "row" | "col";
    padding?: BoxInsets;
    gap?: number;
    alignX?: Align;
    alignY?: Align;
    text?: TextLeaf;
    image?: ImageLeaf;
    fill?: FillLeaf;
    surface?: SurfaceLeaf;
    children?: EngineNode[];
}
