import type { BoxInsets, Size } from "@model/artifact";
import type { Run } from "@model/text";

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

// Injected into the engine so it stays pure (no DOM). Wraps `text` at `maxWidth`.
export type MeasureText = (leaf: TextLeaf, maxWidth: number) => Measured;

// The styled run type lives with the rich-text model (`@model/text`, which flattens marks into runs);
// the engine consumes it and re-exports it for the render backends.
export type { Run };

export interface TextLeaf {
    text: string;
    fontId: string;
    size: number;
    weight?: number;
    lineHeight?: number;
    color?: string;
    align?: Align;
    wrap: "words" | "none";
    // Optional styled runs. When present, the leaf paints as this sequence (each run inheriting the
    // base font/size and overriding weight/style/color/etc). Absent → the plain `text` path, unchanged.
    // The concatenation of all `runs[].text` equals `text`.
    runs?: Run[];
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
    shadow?: string; // CSS box-shadow (theme design character)
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
    alignSelf?: Align; // overrides the parent's cross-axis alignment for this child
    text?: TextLeaf;
    image?: ImageLeaf;
    fill?: FillLeaf;
    surface?: SurfaceLeaf;
    children?: EngineNode[];
}

// --- render output (flattened from the node tree) + interaction geometry ---

export type RenderCommand =
    | { kind: "rect"; box: Rect; fill?: FillLeaf; id?: string }
    | { kind: "text"; box: Rect; text: TextLeaf; id?: string }
    | { kind: "image"; box: Rect; image: ImageLeaf; id?: string }
    | { kind: "surface"; box: Rect; paint: SurfaceLeaf["paint"]; id?: string };

// Interaction geometry: the final box of every node that carries an id (sections, cells, elements).
// Separate from paint so selection/hit-testing/overlays don't depend on what was drawn.
export interface Region {
    id: string;
    box: Rect;
    radius?: number; // the corner radius this node actually painted (fill/image), so selection outlines match it
}
