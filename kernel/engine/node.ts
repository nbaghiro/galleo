import type { BoxInsets, Size } from "@model/content";

export interface Rect {
    x: number;
    y: number;
    w: number;
    h: number;
}

export type Align = "start" | "center" | "end";

export interface DrawStyle {
    fill?: string;
    stroke?: string;
    width?: number; // stroke width
    radius?: number; // rect corner radius
    dash?: number[];
}

export interface DrawTextStyle {
    fill?: string;
    size?: number;
    font?: string;
    weight?: number;
    align?: "start" | "center" | "end";
    baseline?: "top" | "middle" | "bottom";
}

// Backend-abstract drawing API for self-rendered (surface) elements — charts, diagrams, gauges.
// Implemented per target (canvas in the DOM/PNG backends, vector for PDF/PPTX). Coordinates are
// local to the element's box.
export interface DrawContext {
    rect(x: number, y: number, w: number, h: number, style: DrawStyle): void;
    line(x1: number, y1: number, x2: number, y2: number, style: DrawStyle): void;
    circle(cx: number, cy: number, r: number, style: DrawStyle): void;
    polyline(points: [number, number][], style: DrawStyle): void;
    wedge(
        cx: number,
        cy: number,
        r: number,
        startRad: number,
        endRad: number,
        style: DrawStyle,
    ): void;
    text(text: string, x: number, y: number, style: DrawTextStyle): void;
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
    scrim?: number; // 0..1 dark overlay (for text over a background image)
}

export interface FillLeaf {
    color?: string;
    gradient?: { from: string; to: string; angle?: number };
    radius?: number;
    border?: { color: string; width: number; style?: "solid" | "dashed" };
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
