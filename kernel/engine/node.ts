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

export interface TextLeaf {
    runs: unknown; // resolved by @text/model
    fontId: string;
    size: number;
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
}

export interface SurfaceLeaf {
    paint: (ctx: DrawContext, box: Rect) => void;
}

// The layout primitive: a flex/box node (Clay-style) or a self-painted surface.
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
