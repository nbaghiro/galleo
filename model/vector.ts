// Backend-abstract, theme-aware vector document. The renderer maps `vb` (viewBox) into the target box
// and resolves each Paint against the active theme, so one Vector recolors across themes. SVG is only an
// ingest format (parseSvg → Vector); this IR is what gets stored and painted.

// Color roles == the Tokens color fields (kept in sync with @themes Tokens).
export type ThemeRole =
    | "bg"
    | "surface"
    | "ink"
    | "soft"
    | "muted"
    | "accent"
    | "onAccent"
    | "line";

// A color: a theme role (recolors with the theme), a literal, `none`, or SVG `currentColor` (→ the tint).
export type Paint = { role: ThemeRole } | { color: string } | "none" | "currentColor";

export interface VStyle {
    fill?: Paint;
    stroke?: Paint;
    width?: number; // stroke width, in viewBox units
    cap?: "butt" | "round" | "square";
    join?: "miter" | "round" | "bevel";
    dash?: number[];
    fillRule?: "nonzero" | "evenodd";
    opacity?: number; // 0..1, folded into fill + stroke alpha
}

export interface VTransform {
    translate?: [number, number];
    scale?: [number, number];
    rotate?: number; // degrees, about the origin
    matrix?: [number, number, number, number, number, number]; // a b c d e f
}

export type VNode =
    | { t: "path"; d: string; style: VStyle; tf?: VTransform }
    | {
          t: "rect";
          x: number;
          y: number;
          w: number;
          h: number;
          rx?: number;
          style: VStyle;
          tf?: VTransform;
      }
    | {
          t: "ellipse";
          cx: number;
          cy: number;
          rx: number;
          ry: number;
          style: VStyle;
          tf?: VTransform;
      }
    | { t: "line"; x1: number; y1: number; x2: number; y2: number; style: VStyle; tf?: VTransform }
    | { t: "poly"; pts: [number, number][]; closed: boolean; style: VStyle; tf?: VTransform }
    | { t: "group"; children: VNode[]; style?: VStyle; tf?: VTransform };

// vb: [minX, minY, width, height].
export interface Vector {
    vb: [number, number, number, number];
    nodes: VNode[];
}

export const EMPTY_VECTOR: Vector = { vb: [0, 0, 24, 24], nodes: [] };
