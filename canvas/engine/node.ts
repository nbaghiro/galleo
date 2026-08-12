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
    fillRule?: "nonzero" | "evenodd";
    cap?: "butt" | "round" | "square";
    join?: "miter" | "round" | "bevel";
    // linear fill across the shape's bbox; wins over `fill`. CSS angle: 180 = top → bottom,
    // default 135 (the FillLeaf convention). PDF flattens to the stop midpoint.
    gradient?: { from: string; to: string; angle?: number };
    // soft drop shadow under the fill (canvas + DOM svg only); surfaces clip at their box, so
    // renderers must inset enough for the blur to land
    shadow?: { blur: number; dy: number; color: string };
}

export interface DrawTextStyle {
    fill?: string;
    size?: number;
    font?: string;
    weight?: number;
    align?: "start" | "center" | "end";
    baseline?: "top" | "middle" | "bottom";
}

// Structural subset of CanvasRenderingContext2D, so the 2D context and d3-shape generators fit it directly.
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

// Coordinates are local to the element's box.
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
    // The backend begins and closes the path; `build` only issues sink calls.
    path(build: (sink: PathSink) => void, style: DrawStyle): void;
    text(text: string, x: number, y: number, style: DrawTextStyle): void;
    // Advance width for labels: an immediate-mode paint has no DOM to measure against.
    measureText(text: string, style: DrawTextStyle): { width: number };
}

// Named `Measured` to avoid clashing with the DOM `TextMetrics` global.
export interface Measured {
    width: number;
    height: number;
}

// Injected so the engine stays pure (no DOM).
export type MeasureText = (leaf: TextLeaf, maxWidth: number) => Measured;

// Re-exported from `@model/text` for the render backends.
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
    // Invariant: the concatenation of `runs[].text` equals `text`; absent → the plain `text` path.
    runs?: Run[];
}

export interface ImageLeaf {
    src: string;
    fit: "cover" | "contain";
    radius?: number;
    scrim?: number; // 0..1 dark overlay
    zoom?: number; // >1 crops in; set only by image elements
    border?: { color: string; width: number; style?: "solid" | "dashed" }; // section-card border (theme)
    shadow?: string; // CSS box-shadow
}

export interface FillLeaf {
    color?: string;
    gradient?: { from: string; to: string; angle?: number };
    radius?: number;
    border?: { color: string; width: number; style?: "solid" | "dashed" };
    shadow?: string; // CSS box-shadow
}

export interface SurfaceLeaf {
    paint: (ctx: DrawContext, box: Rect) => void;
}

// A node may carry a leaf (fill/image/text/surface) AND children.
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
    alignSelf?: Align; // overrides the parent's cross-axis alignment
    // Clips descendants on the given axes; the resolved rect rides on each command.
    clip?: { x?: boolean; y?: boolean };
    // Lifted out of the flow (no effect on siblings or fit size). Painted by `z`: negative under
    // the flow (decoration), non-negative above it (overlays), ascending within each side.
    float?: { x?: Align; y?: Align; dx?: number; dy?: number; z?: number };
    opacity?: number; // 0..1, multiplied down the subtree
    text?: TextLeaf;
    image?: ImageLeaf;
    fill?: FillLeaf;
    surface?: SurfaceLeaf;
    children?: EngineNode[];
}

// `clip` is the ancestor-intersected rect the backends honor; absent = no clip.
export type RenderCommand =
    | { kind: "rect"; box: Rect; fill?: FillLeaf; id?: string; opacity?: number; clip?: Rect }
    | { kind: "text"; box: Rect; text: TextLeaf; id?: string; opacity?: number; clip?: Rect }
    | { kind: "image"; box: Rect; image: ImageLeaf; id?: string; opacity?: number; clip?: Rect }
    | {
          kind: "surface";
          box: Rect;
          paint: SurfaceLeaf["paint"];
          id?: string;
          opacity?: number;
          clip?: Rect;
      };

// Separate from paint so selection and hit-testing don't depend on what was drawn.
export interface Region {
    id: string;
    box: Rect;
    radius?: number; // the radius this node actually painted, so selection outlines match it
}
