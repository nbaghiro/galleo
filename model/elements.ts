export const TEXT_STYLES = [
    "h1",
    "subtitle",
    "h2",
    "h3",
    "body",
    "caption",
    "quote",
    "label",
] as const;
export type TextStyle = (typeof TEXT_STYLES)[number];

export const TEXT_ALIGN = ["start", "center", "end"] as const;
export type TextAlign = (typeof TEXT_ALIGN)[number];

export const BULLET_MARKERS = ["dot", "number", "dash", "check"] as const;
export type BulletMarker = (typeof BULLET_MARKERS)[number];

export const CALLOUT_TONES = [
    "note",
    "info",
    "tip",
    "success",
    "warn",
    "caution",
    "question",
] as const;
export type CalloutTone = (typeof CALLOUT_TONES)[number];

// media source kinds live on the picker in @model/media, not here

export const IMAGE_FIT = ["cover", "contain"] as const;
export type ImageFit = (typeof IMAGE_FIT)[number];

export const CARD_STYLES = ["solid", "outline", "sideline", "topline", "plain"] as const;
export type CardStyle = (typeof CARD_STYLES)[number];

// rounded (default) uses the theme radius; sharp is crisp
export const CARD_SHAPES = ["sharp", "rounded"] as const;
export type CardShape = (typeof CARD_SHAPES)[number];

export const FLEX_DIRECTION = ["row", "col"] as const;
export type FlexDirection = (typeof FLEX_DIRECTION)[number];

export const BUTTON_VARIANTS = ["filled", "outline", "soft", "ghost"] as const;
export type ButtonVariant = (typeof BUTTON_VARIANTS)[number];

export const BUTTON_SIZES = ["sm", "md", "lg"] as const;
export type ButtonSize = (typeof BUTTON_SIZES)[number];

// rounded (default) tracks the theme radius; sharp is crisp; pill is fully round
export const BUTTON_SHAPES = ["sharp", "rounded", "pill"] as const;
export type ButtonShape = (typeof BUTTON_SHAPES)[number];

// data.type discriminant; kept in lockstep with the canvas chart registry (drift guard)
export const CHART_TYPES = [
    "bar",
    "column",
    "line",
    "area",
    "pie",
    "donut",
    "radar",
    "scatter",
    "bubble",
    "funnel",
    "gauge",
    "heatmap",
    "treemap",
] as const;
export type ChartType = (typeof CHART_TYPES)[number];

// data.type discriminant; kept in lockstep with the canvas diagram registry; graph types read links
export const DIAGRAM_TYPES = [
    "process",
    "steps",
    "cycle",
    "pyramid",
    "funnel",
    "timeline",
    "roadmap",
    "venn",
    "quadrant",
    "matrix",
    "hub",
    "target",
    "honeycomb",
    "tree",
    "org",
    "mindmap",
    "flow",
] as const;
export type DiagramType = (typeof DIAGRAM_TYPES)[number];

export const GRAPH_DIAGRAM_TYPES = ["flow", "tree", "org", "mindmap"] as const;

export const DIAGRAM_FLOWS = ["down", "right"] as const;
export type DiagramFlow = (typeof DIAGRAM_FLOWS)[number];

// outline planning vocabulary; one block leads each column
export const BLOCK_KINDS = [
    "text",
    "bullets",
    "image",
    "stat",
    "chart",
    "diagram",
    "table",
    "quote",
    "cards",
] as const;
export type BlockKind = (typeof BLOCK_KINDS)[number];

// SVG is only an ingest format (parseSvg → Vector); this IR is what gets stored and painted

// the Tokens color fields; must stay in sync with @themes Tokens
export type ThemeRole =
    | "bg"
    | "surface"
    | "ink"
    | "soft"
    | "muted"
    | "accent"
    | "onAccent"
    | "line";

// a role recolors with the theme; `currentColor` resolves to the tint
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

// vb = viewBox: [minX, minY, width, height]
export interface Vector {
    vb: [number, number, number, number];
    nodes: VNode[];
}

export const EMPTY_VECTOR: Vector = { vb: [0, 0, 24, 24], nodes: [] };
