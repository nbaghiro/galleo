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

// One styled span on one line; `from` is the source offset into `TextLeaf.text` (UTF-16, the same
// space Mark/cm offsets use), so chrome maps character ranges to pixels without re-deriving a wrap.
export interface TextFrag {
    text: string;
    from: number;
    font: string;
    color?: string;
    underline: boolean;
    strike: boolean;
    code: boolean;
    highlight?: string;
    link?: string;
    x: number; // line-local, pre-align
    width: number;
}

export interface TextLine {
    from: number;
    to: number; // source range rendered; wrap-eaten whitespace falls in the gap to the next line
    y: number; // top, relative to the leaf's box
    baseline: number; // from the line's own top; real font metrics in phase B, painted midline until then
    width: number;
    frags: TextFrag[]; // visual order
}

// Named `Measured` to avoid clashing with the DOM `TextMetrics` global.
export interface Measured {
    width: number;
    height: number;
    lines?: TextLine[]; // per-line geometry for text leaves; the wrap that sized the box
    ascent?: number; // px above the alphabetic baseline, from the leaf's base font bounding box
    descent?: number; // px below it
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
    level?: 1 | 2 | 3; // heading rank (h1/h2/h3); absent = not a heading
    maxLines?: number; // clamp the wrap to this many lines; absent = unbounded
    overflow?: "clip" | "ellipsis"; // what the last clamped line does; default ellipsis
    // Invariant: the concatenation of `runs[].text` equals `text`; absent → the plain `text` path.
    runs?: Run[];
}

export interface ImageLeaf {
    src: string;
    alt?: string;
    natural?: { w: number; h: number }; // pixel size of the source, when known: a `fit` width uses it
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
    // Pure sibling of `paint`: the sub-element hit geometry behind the same pixels, box-relative.
    // `emit` calls it and offsets the result into stage space; the surface owns the ids it mints.
    regions?: (box: Rect) => Region[];
}

// A node may carry a leaf (fill/image/text/surface) AND children.
export interface EngineNode {
    id?: string;
    w: Size;
    h: Size;
    aspect?: number;
    // "grid" fills `columns` shared-width tracks row-major; `gap` is then the column gap.
    direction?: "row" | "col" | "grid";
    columns?: number;
    rowGap?: number; // grid only; defaults to `gap`
    padding?: BoxInsets;
    gap?: number;
    alignX?: Align;
    // "baseline": a row's flow children meet at their deepest first baseline (rows only; a child
    // with no text in its first-child chain sits its box bottom on the shared baseline)
    alignY?: Align | "baseline";
    alignSelf?: Align | "baseline"; // overrides the parent's cross-axis alignment
    // Spreads leftover main-axis space across the flow children instead of aligning it; a `fit` main
    // axis has no leftover and distributes nothing. Floats are unaffected.
    distribute?: "between" | "around" | "evenly";
    // Clips descendants on the given axes; the resolved rect rides on each command.
    clip?: { x?: boolean; y?: boolean };
    // Lifted out of the flow (no effect on siblings or fit size). Painted by `z`: negative under
    // the flow (decoration), non-negative above it (overlays), ascending within each side.
    float?: { x?: Align; y?: Align; dx?: number; dy?: number; z?: number };
    // marks section chrome for composeSection's hoist; the engine itself never reads it. A tag
    // rather than a float-shape sniff, since a pinned element can float with the same shape.
    docked?: boolean;
    // paint-time spin of this subtree about its own box center, degrees clockwise; layout and
    // wrapping stay unrotated, so the box is solved flat and painted turned
    rotate?: number;
    opacity?: number; // 0..1, multiplied down the subtree
    // href for the whole box; inherited by the subtree so a click anywhere inside it navigates
    link?: string;
    text?: TextLeaf;
    image?: ImageLeaf;
    fill?: FillLeaf;
    surface?: SurfaceLeaf;
    children?: EngineNode[];
}

// A rotated subtree paints turned as a unit: every command in it shares the ancestor's center, so
// the group turns together instead of each box spinning in place.
export interface Rotation {
    deg: number; // clockwise
    cx: number;
    cy: number;
}

// `clip` is the ancestor-intersected rect the backends honor; absent = no clip.
// `decor` marks a command emitted from a negative-z float, which `float.z` already defines as
// decoration: it paints, but it is out of the reading order, so the DOM backend hides it from a11y.
export type RenderCommand =
    | {
          kind: "rect";
          box: Rect;
          fill?: FillLeaf;
          rotate?: Rotation;
          id?: string;
          opacity?: number;
          clip?: Rect;
          link?: string;
          decor?: boolean;
      }
    | {
          kind: "text";
          box: Rect;
          text: TextLeaf;
          lines?: TextLine[];
          // a fragmented page's window into `lines`: [start, end). The command is whole otherwise.
          lineRange?: { start: number; end: number };
          rotate?: Rotation;
          id?: string;
          opacity?: number;
          clip?: Rect;
          link?: string;
          decor?: boolean;
      }
    | {
          kind: "image";
          box: Rect;
          image: ImageLeaf;
          rotate?: Rotation;
          id?: string;
          opacity?: number;
          clip?: Rect;
          link?: string;
          decor?: boolean;
      }
    | {
          kind: "surface";
          box: Rect;
          paint: SurfaceLeaf["paint"];
          rotate?: Rotation;
          id?: string;
          opacity?: number;
          clip?: Rect;
          link?: string;
          decor?: boolean;
      };

// Separate from paint so selection and hit-testing don't depend on what was drawn.
export interface Region {
    id: string;
    box: Rect;
    radius?: number; // the radius this node actually painted, so selection outlines match it
    // A non-rectangular hit area (a pie wedge), in the same coordinates as `box`; absent = the box.
    shape?: { kind: "poly"; points: [number, number][] };
}

/** Point-in-region: the polygon when the region carries one, the box otherwise. */
export function inRegion(r: Region, px: number, py: number): boolean {
    const b = r.box;
    if (px < b.x || px > b.x + b.w || py < b.y || py > b.y + b.h) return false;
    const pts = r.shape?.points;
    if (!pts || pts.length < 3) return true;
    // ray casting: count the edges a ray from (px,py) to +x crosses
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const [xi, yi] = pts[i]!;
        const [xj, yj] = pts[j]!;
        if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
}
