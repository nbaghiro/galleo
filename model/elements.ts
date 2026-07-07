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
// shape). Only `button` carries a shared enum today; others are plain scalar fields. ---

export const BUTTON_VARIANTS = ["filled", "outline"] as const;
export type ButtonVariant = (typeof BUTTON_VARIANTS)[number];

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

// --- section grids: the column-layout ids + their cell keys (fill each cell with one element). The
// column *widths* are canvas geometry (Size[] in compose.ts), keyed by these ids. Section-level rather
// than an element category, but part of the same authoring contract, so it sits with the value-sets. ---

export interface GridTemplate {
    id: string;
    cells: readonly string[];
}

export const GRID_TEMPLATES: readonly GridTemplate[] = [
    { id: "full", cells: ["a"] },
    { id: "split-6040", cells: ["a", "b"] },
    { id: "split-4060", cells: ["a", "b"] },
    { id: "two-col", cells: ["a", "b"] },
    { id: "three-up", cells: ["a", "b", "c"] },
] as const;

export const GRID_IDS = GRID_TEMPLATES.map((g) => g.id);
