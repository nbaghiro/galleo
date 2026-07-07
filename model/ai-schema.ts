// The AI authoring catalog — the element list the LLM writes against, annotated with `when`/`desc` guidance,
// used to (a) render the system-prompt catalog and (b) build the Zod schema that validates what it emits. It
// lives in `model` (not `canvas`) on purpose: `services` may not import `canvas`, but the AI generator runs
// in `services`, so the contract it targets must be model-level. This file is now just the AI-additive
// layer: the shared VALUE-SETS (styles, tones, chart/diagram types, grids) live once per category under
// `@model/elements/*` and are re-exported here for back-compat; this file adds only the authoring guidance.
//
// It intentionally describes only the fields the AI should set — not every studio-only affordance an element
// supports — and emits `chart`/`diagram` with a `data.type` discriminant rather than the palette variants.

import { BULLET_MARKERS, CALLOUT_TONES, TEXT_ALIGN, TEXT_STYLES } from "@model/elements/text";
import { IMAGE_FIT } from "@model/elements/media";
import { CARD_STYLES, FLEX_DIRECTION } from "@model/elements/composite";
import { BUTTON_VARIANTS } from "@model/elements/chrome";
import { CHART_TYPES } from "@model/elements/chart";
import { DIAGRAM_TYPES } from "@model/elements/diagram";
import { GRID_TEMPLATES } from "@model/elements/section";

// Re-export the shared value-sets so existing importers of `@model/ai-schema` keep resolving them here.
export { BULLET_MARKERS, CALLOUT_TONES, TEXT_ALIGN, TEXT_STYLES } from "@model/elements/text";
export { IMAGE_FIT } from "@model/elements/media";
export { CARD_STYLES, FLEX_DIRECTION } from "@model/elements/composite";
export { BUTTON_VARIANTS } from "@model/elements/chrome";
export { CHART_TYPES } from "@model/elements/chart";
export { DIAGRAM_TYPES, GRAPH_DIAGRAM_TYPES } from "@model/elements/diagram";
export { GRID_IDS } from "@model/elements/section";
export type { CalloutTone, TextStyle } from "@model/elements/text";
export type { CardStyle } from "@model/elements/composite";
export type { ChartType } from "@model/elements/chart";
export type { DiagramType } from "@model/elements/diagram";

// --- section grids (structure from @model/elements, authoring guidance added here) ---

export interface GridSchema {
    id: string;
    cells: readonly string[]; // the cell keys this grid exposes (fill each with one element)
    widths: string; // human description of the column split
    when: string; // when to reach for this grid
}

const GRID_HINTS: Record<string, { widths: string; when: string }> = {
    full: {
        widths: "one full-width column",
        when: "a hero, a single statement, one big image, or a centered moment",
    },
    "split-6040": {
        widths: "60% / 40%",
        when: "text-forward with a supporting image/visual on the right",
    },
    "split-4060": {
        widths: "40% / 60%",
        when: "an image/visual on the left, text on the right",
    },
    "two-col": { widths: "50% / 50%", when: "two balanced ideas or a compare/contrast" },
    "three-up": {
        widths: "three equal thirds",
        when: "three features, steps, stats, or cards side by side",
    },
};

export const GRIDS: readonly GridSchema[] = GRID_TEMPLATES.map((t) => {
    const h = GRID_HINTS[t.id] ?? { widths: "", when: "" };
    return { id: t.id, cells: t.cells, widths: h.widths, when: h.when };
});

// --- the element catalog ---

export type FieldType = "string" | "text" | "number" | "boolean" | "enum" | "children";

export interface FieldSpec {
    key: string;
    type: FieldType;
    required?: boolean;
    values?: readonly string[]; // for type "enum"
    default?: string | number | boolean;
    desc: string; // guidance for the LLM (accepted values, string formats, when to set it)
}

export interface ElementSchema {
    type: string; // the ElementInstance.type to emit
    label: string;
    category: string;
    container?: boolean; // true → `data.children` is an array of nested elements
    when: string; // when the AI should reach for this element
    fields: readonly FieldSpec[];
}

const childrenField = (desc: string): FieldSpec => ({
    key: "children",
    type: "children",
    required: true,
    desc,
});

export const ELEMENTS: readonly ElementSchema[] = [
    // --- text ---
    {
        type: "text",
        label: "Text",
        category: "text",
        when: "any standalone piece of writing — a title, a paragraph, an eyebrow label, a caption",
        fields: [
            {
                key: "text",
                type: "text",
                required: true,
                desc: "the writing itself; real, specific copy — never lorem ipsum or placeholders",
            },
            {
                key: "style",
                type: "enum",
                required: true,
                values: TEXT_STYLES,
                default: "body",
                desc: "the typographic role; one `h1` per section max",
            },
            {
                key: "align",
                type: "enum",
                values: TEXT_ALIGN,
                desc: "text alignment; omit for default left/start",
            },
        ],
    },
    {
        type: "bullets",
        label: "List",
        category: "text",
        container: true,
        when: "3–6 short parallel points; prefer over a wall of body text",
        fields: [
            childrenField(
                "one `text` element per row, each { type:'text', data:{ text, style:'body' } }",
            ),
            {
                key: "marker",
                type: "enum",
                values: BULLET_MARKERS,
                default: "dot",
                desc: "dot • / number 1. / dash — / check ✓",
            },
        ],
    },
    {
        type: "callout",
        label: "Callout",
        category: "text",
        container: true,
        when: "one point that must stand out — a warning, a tip, a key takeaway",
        fields: [
            childrenField("the callout body, usually one `text` (style 'body')"),
            {
                key: "tone",
                type: "enum",
                values: CALLOUT_TONES,
                default: "note",
                desc: "sets the accent color/meaning",
            },
        ],
    },
    {
        type: "quote",
        label: "Quote",
        category: "text",
        container: true,
        when: "a pulled quotation or testimonial with attribution",
        fields: [
            childrenField(
                "exactly two `text` elements: the quote (style 'h3') then the attribution (style 'caption')",
            ),
        ],
    },
    {
        type: "code",
        label: "Code",
        category: "text",
        when: "a code snippet or monospaced technical content",
        fields: [
            {
                key: "code",
                type: "text",
                required: true,
                desc: "the code; use \\n for line breaks",
            },
        ],
    },

    // --- media ---
    {
        type: "image",
        label: "Image",
        category: "media",
        when: "a photo or illustration; the workhorse visual",
        fields: [
            {
                key: "src",
                type: "string",
                required: true,
                desc: "an image URL; if unknown, use a short descriptive phrase and the module will source/generate it",
            },
            {
                key: "aspect",
                type: "number",
                default: 1.5,
                desc: "width ÷ height (1.5 = landscape, 1 = square, 0.8 = portrait)",
            },
            {
                key: "fit",
                type: "enum",
                values: IMAGE_FIT,
                default: "cover",
                desc: "cover (fill+crop) or contain (letterbox)",
            },
            {
                key: "radius",
                type: "number",
                desc: "corner radius in px; omit to inherit the theme",
            },
        ],
    },
    {
        type: "video",
        label: "Video",
        category: "media",
        when: "an embeddable video (YouTube/Vimeo/mp4)",
        fields: [{ key: "url", type: "string", desc: "the video URL" }],
    },

    // --- data ---
    {
        type: "stat",
        label: "Stat",
        category: "data",
        container: true,
        when: "a single headline number with a label — the most persuasive way to show one metric",
        fields: [
            childrenField(
                "two `text` elements: the value (style 'h1', e.g. '92%') then its label (style 'caption')",
            ),
        ],
    },
    {
        type: "table",
        label: "Table",
        category: "data",
        when: "tabular data — a comparison grid, a pricing matrix, a schedule",
        fields: [
            {
                key: "data",
                type: "text",
                required: true,
                desc: "rows separated by newline (\\n), cells by comma. First row is the header.",
            },
            {
                key: "header",
                type: "boolean",
                default: true,
                desc: "render the first row as a bold header",
            },
        ],
    },

    // --- charts (self-drawn; one element type, the kind chosen by data.type) ---
    {
        type: "chart",
        label: "Chart",
        category: "data",
        when: "quantitative data worth visualizing — trends, comparisons, distributions, proportions",
        fields: [
            {
                key: "type",
                type: "enum",
                required: true,
                values: CHART_TYPES,
                desc: "which chart to draw",
            },
            {
                key: "values",
                type: "text",
                required: true,
                desc: "one series per line (\\n); points comma-separated within a line. e.g. '48, 62, 55, 71' or two lines for two series. scatter=x row+y row; bubble=x+y+size rows; gauge='value, max'.",
            },
            {
                key: "categories",
                type: "string",
                desc: "x-axis / slice labels, comma-separated (match the point count)",
            },
            {
                key: "seriesNames",
                type: "string",
                desc: "legend labels for multi-series charts, comma-separated",
            },
            { key: "stacked", type: "boolean", desc: "stack series (bar/column/area)" },
            { key: "smooth", type: "boolean", desc: "smooth the line (line/area)" },
        ],
    },

    // --- diagrams (self-drawn; one element type, the kind chosen by data.type) ---
    {
        type: "diagram",
        label: "Diagram",
        category: "data",
        when: "a relationship or flow — a process, a cycle, a hierarchy, a funnel, a mind map",
        fields: [
            {
                key: "type",
                type: "enum",
                required: true,
                values: DIAGRAM_TYPES,
                desc: "which diagram to draw",
            },
            {
                key: "items",
                type: "text",
                required: true,
                desc: "the node labels, comma- or newline-separated",
            },
            {
                key: "links",
                type: "text",
                desc: "edges for graph diagrams (flow/tree/org/mindmap) only: 'A->B, B->C', optional ':label' tail e.g. 'A->B:yes'",
            },
        ],
    },

    // --- containers ---
    {
        type: "card",
        label: "Card",
        category: "container",
        container: true,
        when: "group a small cluster of elements into a bordered/filled panel — a feature, a plan, a person",
        fields: [
            childrenField(
                "the card's contents — typically a `text` title (h3) + a `text` body, or a stat",
            ),
            {
                key: "style",
                type: "enum",
                values: CARD_STYLES,
                default: "solid",
                desc: "solid filled / outline / left sideline / top topline / plain",
            },
            {
                key: "direction",
                type: "enum",
                values: FLEX_DIRECTION,
                default: "col",
                desc: "stack children (col) or lay them in a row",
            },
        ],
    },
    {
        type: "group",
        label: "Group",
        category: "container",
        container: true,
        when: "the default way to put several elements in one cell (a stacked title+subtitle+body, or an N-column grid of cards/stats)",
        fields: [
            childrenField("the grouped elements in order"),
            {
                key: "columns",
                type: "number",
                desc: "1–6; >1 lays children out as an N-column grid (great for 3 cards/stats)",
            },
            {
                key: "direction",
                type: "enum",
                values: FLEX_DIRECTION,
                default: "col",
                desc: "stack (col) or row; ignored when columns > 1",
            },
            {
                key: "align",
                type: "enum",
                values: TEXT_ALIGN,
                desc: "cross-axis alignment of children",
            },
        ],
    },

    // --- chrome ---
    {
        type: "button",
        label: "Button",
        category: "interactive",
        when: "a call to action — 'Get started', 'Book a demo'",
        fields: [
            { key: "label", type: "string", required: true, desc: "the button text" },
            {
                key: "variant",
                type: "enum",
                values: BUTTON_VARIANTS,
                default: "filled",
                desc: "filled or outline",
            },
        ],
    },
    {
        type: "badge",
        label: "Badge",
        category: "branding",
        when: "a tiny status pill — 'NEW', 'OUT SEPT 4', a tag",
        fields: [
            { key: "text", type: "string", required: true, desc: "the badge text; keep it short" },
        ],
    },
    {
        type: "divider",
        label: "Divider",
        category: "layout",
        when: "a thin rule to separate content within a cell",
        fields: [{ key: "thickness", type: "number", default: 2, desc: "line thickness in px" }],
    },
] as const;

export const ELEMENT_TYPES = ELEMENTS.map((e) => e.type);

// The element types the AI is allowed to emit (the palette-hidden `__dropghost`, and the raw variant
// chart/diagram element types, are deliberately excluded — emit `chart`/`diagram` with a `data.type`).
export const isEmittableType = (type: string): boolean => ELEMENT_TYPES.includes(type);
