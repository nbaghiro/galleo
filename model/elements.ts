// Element value-sets — the enums the element library reads, grouped by category (matching the
// `canvas/elements/<category>/` folders and the UI palette groups so the taxonomy lines up everywhere).
// Pure data + types; imports nothing. Canvas builds its control options from these consts (with its own
// UI labels); the AI catalog (@model/ai) annotates them. One file, one section per category.

// --- text: the text / bullets / callout elements ---

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

// --- media: image / video / icon. (Media *source* kinds — photo/gif/illustration/… — live on the
// picker in @model/media, not here.) ---

export const IMAGE_FIT = ["cover", "contain"] as const;
export type ImageFit = (typeof IMAGE_FIT)[number];

// --- composite: the container elements (card / group) and the composite presets (feature / profile /
// testimonial / pricing / cta / faq) that arrange other elements ---

export const CARD_STYLES = ["solid", "outline", "sideline", "topline", "plain"] as const;
export type CardStyle = (typeof CARD_STYLES)[number];

export const FLEX_DIRECTION = ["row", "col"] as const;
export type FlexDirection = (typeof FLEX_DIRECTION)[number];

// --- basic: the small standalone elements (button / badge / embed / gradient / divider / spacer /
// shape). `button` carries the shared style/size/shape enums; others are plain scalar fields. ---

export const BUTTON_VARIANTS = ["filled", "outline", "soft", "ghost"] as const;
export type ButtonVariant = (typeof BUTTON_VARIANTS)[number];

export const BUTTON_SIZES = ["sm", "md", "lg"] as const;
export type ButtonSize = (typeof BUTTON_SIZES)[number];

// Roundness as a semantic choice, not a pixel value: `rounded` (the default) tracks the theme's radius
// token, `sharp` is crisp, `pill` is fully round — so a button's corners follow the selected theme.
export const BUTTON_SHAPES = ["sharp", "rounded", "pill"] as const;
export type ButtonShape = (typeof BUTTON_SHAPES)[number];

// --- chart: the `data.type` discriminant (which chart is drawn). The render implementations live in
// the canvas chart registry; this is the emittable set, kept in lockstep via the drift guard. ---

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

// --- diagram: the `data.type` discriminant. Render impls live in the canvas diagram registry; kept in
// lockstep via the drift guard. Graph diagrams read the `links` edge string. ---

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

// The layout vocabulary the outline plans with — the "block" that leads each column, a curated subset of
// the element library (the content-leading types). A beat carries one block per column; the live skeleton
// and the section writer both key off them, so the planned layout and the generated one match by construction.
// (Named layout presets — the column count + width ratios a beat can reach for — live in @model/section.)
export const BLOCK_KINDS = [
    "text", // a headline + supporting copy
    "bullets", // a short list
    "image", // a photo / visual
    "stat", // a big number + label
    "chart", // a data chart
    "diagram", // a process / relationship diagram
    "table", // tabular data
    "quote", // a pulled quote
    "cards", // a small cluster of cards
] as const;
export type BlockKind = (typeof BLOCK_KINDS)[number];
