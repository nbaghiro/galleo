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

// Structural subset of CanvasRenderingContext2D, so the canvas backend passes its context straight through; also what d3-shape generators render into via `.context()`.
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

// Backend-abstract drawing API for surface elements (charts, diagrams). Coordinates are local to the element's box.
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
    // Advance width for laying out labels inside a surface (immediate-mode paint has no DOM to measure against).
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
    // When present, paints as this sequence (runs inherit base font/size, override weight/color); absent → the plain `text` path. Invariant: concatenation of all `runs[].text` equals `text`.
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
    // Clip descendants to this node's box on the given axes. Inert until set; the engine carries the resolved rect on each command (`RenderCommand.clip`).
    clip?: { x?: boolean; y?: boolean };
    // Lifted OUT of the parent's flex flow (doesn't affect siblings or fit size), positioned by x/y align + dx/dy offset, painted on top (higher `z` later). Inert until set.
    float?: { x?: Align; y?: Align; dx?: number; dy?: number; z?: number };
    opacity?: number; // 0..1, multiplied down the subtree
    text?: TextLeaf;
    image?: ImageLeaf;
    fill?: FillLeaf;
    surface?: SurfaceLeaf;
    children?: EngineNode[];
}

// Effective (ancestor-intersected) clip rect; backends honor it (CSS clip-path / canvas clip). Absent = no clip.
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

// Final box of every node with an id. Separate from paint so selection/hit-testing don't depend on what was drawn.
export interface Region {
    id: string;
    box: Rect;
    radius?: number; // the radius this node actually painted, so selection outlines match it
}
