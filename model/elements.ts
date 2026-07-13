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
    "cycle",
    "pyramid",
    "funnel",
    "timeline",
    "venn",
    "quadrant",
    "matrix",
    "tree",
    "org",
    "mindmap",
    "flow",
] as const;
export type DiagramType = (typeof DIAGRAM_TYPES)[number];

export const GRAPH_DIAGRAM_TYPES = ["flow", "tree", "org", "mindmap"] as const;

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
