import type { BoxInsets, Size } from "@model/geometry";
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

// A path builder — the subset of the Canvas 2D path API that `DrawContext.path` exposes. It is
// structurally a slice of `CanvasRenderingContext2D` (so the canvas backend passes its context
// straight through) and is exactly what d3-shape's generators render into via `.context()`, letting
// charts emit arbitrary curves/arcs without a per-shape primitive. A future vector backend implements
// the same methods against its own path sink.
export interface PathSink {
    moveTo(x: number, y: number): void;
    lineTo(x: number, y: number): void;
    bezierCurveTo(
        cp1x: number,
        cp1y: number,
        cp2x: number,
        cp2y: number,
        x: number,
        y: number,
    ): void;
    quadraticCurveTo(cpx: number, cpy: number, x: number, y: number): void;
    arc(cx: number, cy: number, r: number, startRad: number, endRad: number, ccw?: boolean): void;
    arcTo(x1: number, y1: number, x2: number, y2: number, r: number): void;
    rect(x: number, y: number, w: number, h: number): void;
    closePath(): void;
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
    // Build one arbitrary path (lines/beziers/arcs) then fill/stroke it per `style`. The path is begun
    // and closed by the backend; `build` only issues sink calls. Powers donut arcs, smoothed lines,
    // and any d3-shape generator.
    path(build: (sink: PathSink) => void, style: DrawStyle): void;
    text(text: string, x: number, y: number, style: DrawTextStyle): void;
    // Measure a string's advance width in the given text style — for laying out axis labels + legends
    // inside a surface (the immediate-mode paint has no DOM to measure against).
    measureText(text: string, style: DrawTextStyle): { width: number };
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
    zoom?: number; // scale the image within its clipped frame (>1 crops in); set only by image elements
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
