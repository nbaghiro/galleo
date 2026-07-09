// The AI contract — everything `model` defines for the AI layer, in three parts: (1) the streamed
// turn PROTOCOL (turns, patches, events) the generation runtime emits and the studio consumes; (2) the
// authoring CATALOG (the elements + grids the LLM writes against, with hints) that seeds the system
// prompt and the validator; (3) the ACTION catalog + metered PRICING (what each AI action costs). Pure —
// no IO, no engine. The generic credit math it prices against lives in @model/credits.

import type {
    ArtifactContent,
    Cell,
    ElementInstance,
    Section,
    SectionBackground,
} from "@model/artifact";
import {
    BULLET_MARKERS,
    BUTTON_VARIANTS,
    CALLOUT_TONES,
    CARD_STYLES,
    CHART_TYPES,
    DIAGRAM_TYPES,
    FLEX_DIRECTION,
    GRID_TEMPLATES,
    IMAGE_FIT,
    TEXT_ALIGN,
    TEXT_STYLES,
} from "@model/elements";
import type { Usage } from "@model/credits";
import { costOf } from "@model/credits";

// ============================================================================================
// 1. THE TURN PROTOCOL — the streamed turn contract (runtime emits · log persists · studio consumes)
// ============================================================================================

// The turn protocol — the single contract shared across the boundary: the runtime (services/ai/run)
// emits it, the event log persists it, and the studio Console + canvas consume it. Pure (no IO, no
// engine). Swapping the client-side simulator for the real LLM runtime changes nothing on the client,
// because both speak exactly this.

// --- turns: what the client asks the AI to do ---

export type TurnKind = "generate" | "edit" | "section" | "chat";
export type Surface = "deck" | "doc" | "web";

export interface GenerateInput {
    prompt: string;
    surface: Surface;
    theme: string;
    goal?: string;
    audience?: string;
    tone?: string;
    length?: string;
    contextRefs?: string[]; // ids of attached context (doc/url) in the artifact's ContextPack
}

export interface EditInput {
    instruction: string; // a whole-artifact revision ("make it punchier", "add a competition slide")
}

export interface SectionInput {
    instruction: string; // what the new section should be about (the user's prompt)
    afterId: string | null; // insert the new section after this id (null ⇒ at the front)
    content: ArtifactContent; // the current artifact — for neighbor context, surface/theme, and id allocation
}

// What the chat agent is looking at. Assembled on the client each message. The full `content` rides along
// for server-side tools (edit/add a section need the real tree), but the MODEL only ever sees the compact
// digest + focus derived from it — so the model's context stays cheap regardless of artifact size.
export interface ChatFocus {
    kind: "element" | "cell" | "section" | "none";
    sectionId?: string;
    cell?: string;
    elementType?: string; // the selected element's type (stat, image, …)
    headline?: string; // the focused section/element's first text, for grounding
}

// A compact picture of the user's workspace, sent when NO artifact is open (the library / templates / trash
// views) so the agent can ground itself — reference their recent work, size the workspace, help them start
// something — instead of only knowing "no artifact is open".
export interface ChatLibrary {
    view?: string; // where they are: "library" | "templates" | "trash" | "shared"
    artifactCount?: number; // how many artifacts they have
    recent?: { title: string; format: string }[]; // a few most-recent titles, for grounding
    folder?: string; // the folder they're filtered to, if any
}

export interface ChatContext {
    surface: "editor" | "library"; // where the chat is being used
    artifactId?: string;
    content?: ArtifactContent; // the open artifact (editor surface) — server derives the digest for the model
    focus?: ChatFocus;
    library?: ChatLibrary; // present on the "library" surface (no open artifact) — the workspace summary
    plan?: string; // workspace plan, so the agent can hint at gated capabilities
}

export interface ChatTurnRef {
    role: "user" | "assistant";
    text: string; // prior messages, compacted (widgets aren't replayed to the model)
}

export interface ChatInput {
    message: string;
    context: ChatContext;
    history?: ChatTurnRef[];
}

// A rich block in an assistant message — a chat response is an ordered list of these. Text streams in as
// `chat.text` deltas; the widget blocks arrive whole as `chat.block`. `proposal` carries a mutation the user
// applies or discards (with a real section preview); `preview` shows content without changing anything.
export type ChatBlock =
    | { type: "text"; text: string }
    | { type: "suggestions"; items: string[] }
    | { type: "proposal"; summary: string; patch: Patch; preview?: Section }
    | { type: "preview"; section?: Section; format?: string }
    | { type: "sections"; sections: Section[]; format?: string }; // a scrollable carousel of existing sections

export type TurnRequest =
    | { kind: "generate"; input: GenerateInput }
    | { kind: "edit"; input: EditInput }
    | { kind: "section"; input: SectionInput }
    | { kind: "chat"; input: ChatInput };

export type TurnStatus = "pending" | "running" | "done" | "error" | "canceled";

export const isKind = (k: string): k is TurnKind =>
    k === "generate" || k === "edit" || k === "section" || k === "chat";

// --- patches: the ordered structural ops a turn produces ---
// Generate streams `addSection`s; regenerate-a-section is one `replaceSection`; edit-a-block is one
// `replaceElement`. The same model powers streaming, surgical edits, history, and undo (every op has a
// structural inverse).

export type PatchOp =
    | { op: "setMeta"; theme?: string; format?: string; background?: SectionBackground | null }
    | { op: "addSection"; afterId?: string | null; section: Section } // afterId null/absent ⇒ append
    | { op: "replaceSection"; id: string; section: Section }
    | { op: "removeSection"; id: string }
    | { op: "moveSection"; id: string; afterId: string | null } // null ⇒ move to front
    | { op: "replaceElement"; sectionId: string; cell: string; element: ElementInstance | null } // null ⇒ clear
    | { op: "setSectionBackground"; sectionId: string; background: SectionBackground | null };

export type Patch = PatchOp[];

const cloneSections = (sections: Section[]): Section[] =>
    sections.map((s) => ({ ...s, cells: { ...s.cells } }));

function insertAfter(
    sections: Section[],
    afterId: string | null | undefined,
    section: Section,
): Section[] {
    const without = sections.filter((s) => s.id !== section.id); // re-add (move) is allowed
    if (afterId == null) return afterId === null ? [section, ...without] : [...without, section];
    const idx = without.findIndex((s) => s.id === afterId);
    if (idx < 0) return [...without, section]; // unknown anchor ⇒ append
    return [...without.slice(0, idx + 1), section, ...without.slice(idx + 1)];
}

function applyOp(content: ArtifactContent, op: PatchOp): ArtifactContent {
    switch (op.op) {
        case "setMeta": {
            const next = { ...content };
            if (op.theme !== undefined) next.theme = op.theme;
            if (op.format !== undefined) next.format = op.format;
            if (op.background !== undefined) next.background = op.background ?? undefined;
            return next;
        }
        case "addSection":
            return { ...content, sections: insertAfter(content.sections, op.afterId, op.section) };
        case "replaceSection":
            return {
                ...content,
                sections: content.sections.map((s) => (s.id === op.id ? op.section : s)),
            };
        case "removeSection":
            return { ...content, sections: content.sections.filter((s) => s.id !== op.id) };
        case "moveSection": {
            const target = content.sections.find((s) => s.id === op.id);
            if (!target) return content;
            return { ...content, sections: insertAfter(content.sections, op.afterId, target) };
        }
        case "replaceElement":
            return {
                ...content,
                sections: content.sections.map((s) => {
                    if (s.id !== op.sectionId) return s;
                    const cells: Record<string, Cell> = { ...s.cells };
                    cells[op.cell] = op.element ? { element: op.element } : {};
                    return { ...s, cells };
                }),
            };
        case "setSectionBackground":
            return {
                ...content,
                sections: content.sections.map((s) =>
                    s.id === op.sectionId ? { ...s, background: op.background ?? undefined } : s,
                ),
            };
    }
}

// Apply a patch immutably — returns a new ArtifactContent, never mutates the input.
export function applyPatch(content: ArtifactContent, patch: Patch): ArtifactContent {
    let next: ArtifactContent = { ...content, sections: cloneSections(content.sections) };
    for (const op of patch) next = applyOp(next, op);
    return next;
}

// --- events: the streamed protocol the runtime emits + the client consumes ---

export type Phase =
    | "intake"
    | "spine"
    | "outline"
    | "plan"
    | "build"
    | "edit"
    | "research"
    | "compose"
    | "done";

export type SectionStatus = "queued" | "active" | "writing" | "image" | "done";

export interface Beat {
    id: string;
    label: string;
    role: string;
    grid?: string; // planned layout id — lets the client shape a section skeleton before content lands
    image?: boolean; // carries a prominent image (drives the sourcing step + ghost)
    blocks?: string[]; // the block kind leading each grid cell, in cell order — skeleton + writer both honor it
}

export type TurnEvent =
    | { type: "turn.start"; kind: TurnKind }
    | { type: "phase"; name: Phase }
    | { type: "narration"; text: string; mono?: string; sub?: string } // the Console terminal lines
    | { type: "plan"; beats: Beat[] }
    | { type: "section.status"; id: string; status: SectionStatus }
    | { type: "patch"; ops: Patch } // apply to the canvas as it streams
    | { type: "reply"; text: string } // chat/research answer
    | { type: "chat.text"; delta: string } // streamed assistant prose (appended to the message's text)
    | { type: "chat.tool"; blockId: string; tool: string; title: string } // a tool started → a widget shell appears
    | { type: "chat.nested"; blockId: string; event: TurnEvent } // a capability event routed to a block's widget
    | { type: "chat.block"; blockId: string; block: ChatBlock } // a finished widget block
    | { type: "turn.done"; summary?: string }
    | { type: "error"; message: string };

// A persisted event = an TurnEvent plus its monotonic sequence in the turn's log (the SSE resume cursor).
export interface LoggedEvent {
    seq: number;
    event: TurnEvent;
}

// ============================================================================================
// 2. THE AUTHORING CATALOG — the elements + grids the LLM writes against (seeds prompt + validator)
// ============================================================================================

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
                desc: "which diagram. For a LINEAR sequence of steps use `process` (connected steps, reads left-to-right) — NOT `flow`. `cycle` = a repeating loop; `funnel` = narrowing stages; `pyramid` = layered levels; `timeline` = dated milestones; `matrix`/`quadrant` = a 2×2; `venn` = overlapping sets. Reserve the graph types (`flow`, `tree`, `org`, `mindmap`) for genuine BRANCHING relationships — they require the `links` field.",
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

// ============================================================================================
// 3. AI ACTIONS + METERED PRICING — what each user-facing AI action costs (prices via @model/credits)
// ============================================================================================

// The catalog of user-facing AI actions and how each is priced — one edge-safe source of truth shared by
// the backend (which charges) and the app (which showcases costs). Pricing rides on the generic metered
// engine in @model/credits: an action declares the *units of work* it does (via a base `usage` and, when its
// cost scales with the job, a `meter`), and the credit cost is just `costOf(usage)`. So a long artifact
// costs more than a short one, an edit over a big deck costs more than over a small one, and four image
// variations cost four times one — all without any per-action special-casing.

export type AiActionId =
    | "generate"
    | "edit"
    | "regenerate-section"
    | "edit-element"
    | "continue"
    | "rewrite"
    | "translate"
    | "translate-artifact"
    | "generate-theme"
    | "generate-image"
    | "chat"
    | "retitle"
    | "summarize"
    | "alt-text"
    | "speaker-notes";

export type AiActionCategory = "create" | "edit" | "text" | "media" | "theme" | "assist";

export interface AiActionInfo {
    id: AiActionId;
    label: string; // shown in the UI
    description: string; // one line, for the pricing table + tooltips
    category: AiActionCategory;
    usage: Usage; // the typical units this action does → its typical credit cost via costOf()
    live?: boolean; // a prompt builder (+ eventually a route) exists; false/undefined = planned
}

// The knobs a metered action scales by. All optional; a meter reads the ones it cares about and falls back
// to a sensible default (so an estimate works before exact counts are known).
export interface MeterParams {
    length?: string; // "Short" | "Standard" | "In-depth" — the intake length chip (generate)
    sections?: number; // sections to write / reason over (generate, edit, continue)
    images?: number; // images generated within a generation
    textRuns?: number; // text elements to translate (translate-artifact)
    variations?: number; // image variations (generate-image)
}

// The intake length chip → an expected section count (the demos run ~18; templates ~12; a short deck ~7).
export function sectionsForLength(length?: string): number {
    const l = (length ?? "").toLowerCase();
    if (l.startsWith("short")) return 7;
    if (l.startsWith("in") || l.startsWith("deep") || l.startsWith("long")) return 18;
    return 12;
}

// The catalog. `usage` is the typical case (drives the headline cost); metered actions additionally define a
// `meter` below so the real cost scales with the job.
export const AI_ACTIONS: Record<AiActionId, AiActionInfo> = {
    generate: {
        id: "generate",
        label: "Generate artifact",
        description: "A full deck, doc, or site — scales with length",
        category: "create",
        usage: { plan: 1, section: 12, image: 3 },
        live: true,
    },
    edit: {
        id: "edit",
        label: "Edit whole artifact",
        description: "Revise the piece — scales with its size",
        category: "edit",
        usage: { section: 10 },
        live: true,
    },
    "regenerate-section": {
        id: "regenerate-section",
        label: "Regenerate section",
        description: "Rewrite one section in place",
        category: "edit",
        usage: { section: 1 },
        live: true,
    },
    "edit-element": {
        id: "edit-element",
        label: "Edit element",
        description: "Rework a single element or cell",
        category: "edit",
        usage: { text: 2 },
        live: true,
    },
    continue: {
        id: "continue",
        label: "Add a section",
        description: "Write and insert a new section",
        category: "create",
        usage: { section: 1 },
    },
    rewrite: {
        id: "rewrite",
        label: "Rewrite text",
        description: "Punchier, shorter, clearer, or fixed",
        category: "text",
        usage: { text: 1 },
        live: true,
    },
    translate: {
        id: "translate",
        label: "Translate text",
        description: "Localize a selected passage",
        category: "text",
        usage: { text: 1 },
        live: true,
    },
    "translate-artifact": {
        id: "translate-artifact",
        label: "Translate artifact",
        description: "The whole piece — scales with its length",
        category: "text",
        usage: { text: 12 },
        live: true,
    },
    "generate-theme": {
        id: "generate-theme",
        label: "Generate theme",
        description: "A custom color-and-type theme",
        category: "theme",
        usage: { theme: 1 },
        live: true,
    },
    "generate-image": {
        id: "generate-image",
        label: "Generate image",
        description: "An AI image — scales with variations",
        category: "media",
        usage: { image: 1 },
        live: true,
    },
    chat: {
        id: "chat",
        label: "Ask the assistant",
        description: "A conversational question about your artifact",
        category: "assist",
        usage: { reply: 1 },
        live: true,
    },
    retitle: {
        id: "retitle",
        label: "Suggest a title",
        description: "Name or rename the artifact",
        category: "assist",
        usage: { text: 1 },
    },
    summarize: {
        id: "summarize",
        label: "Summarize",
        description: "Key points or a TL;DR",
        category: "assist",
        usage: { reply: 1 },
    },
    "alt-text": {
        id: "alt-text",
        label: "Image alt text",
        description: "Accessible descriptions for images",
        category: "assist",
        usage: { text: 1 },
    },
    "speaker-notes": {
        id: "speaker-notes",
        label: "Speaker notes",
        description: "Talking points for a deck",
        category: "assist",
        usage: { reply: 1 },
    },
};

// The meters — the actions whose cost scales with the job. Each returns the real expected usage for the
// given params (defaulting gracefully). Actions absent here are fixed-cost (their base `usage`).
const METERS: Partial<Record<AiActionId, (m: MeterParams) => Usage>> = {
    // Generation scales with how many sections (and images) it will produce.
    generate: (m) => {
        const n = m.sections ?? sectionsForLength(m.length);
        return { plan: 1, section: n, image: m.images ?? Math.ceil(n / 4) };
    },
    // A whole-artifact edit reasons over the current artifact, so it scales with its section count.
    edit: (m) => ({ section: Math.max(3, m.sections ?? 10) }),
    // Translating the whole piece scales with how many text runs it has.
    "translate-artifact": (m) => ({ text: Math.max(1, m.textRuns ?? 12) }),
    // Image generation scales with the number of variations requested.
    "generate-image": (m) => ({ image: Math.max(1, m.variations ?? 1) }),
};

// Display order (mirrors the object order above).
export const AI_ACTION_LIST: AiActionInfo[] = Object.values(AI_ACTIONS);

// The real expected usage for an action given the job's size — the meter if it has one, else its base usage.
export function estimateUsage(id: AiActionId, m: MeterParams = {}): Usage {
    const meter = METERS[id];
    return meter ? meter(m) : AI_ACTIONS[id].usage;
}

// The estimated credit cost (what the pre-flight gate reserves and the UI previews).
export function estimateCost(id: AiActionId, m?: MeterParams): number {
    return costOf(estimateUsage(id, m));
}

// The typical (headline) cost, ignoring job size — for a compact showcase number.
export function typicalCost(id: AiActionId): number {
    return costOf(AI_ACTIONS[id].usage);
}

// Whether an action's cost scales with the job (so the UI can show a range, not a single number).
export function isMetered(id: AiActionId): boolean {
    return id in METERS;
}

// The cost range a metered action spans (a small job → a large one); min == max for fixed actions.
const SMALL: MeterParams = { length: "Short", sections: 6, textRuns: 5, images: 2, variations: 1 };
const LARGE: MeterParams = {
    length: "In-depth",
    sections: 20,
    textRuns: 40,
    images: 6,
    variations: 4,
};
export function costRange(id: AiActionId): { min: number; max: number } {
    const meter = METERS[id];
    if (!meter) {
        const c = typicalCost(id);
        return { min: c, max: c };
    }
    return { min: costOf(meter(SMALL)), max: costOf(meter(LARGE)) };
}

// Back-compat: the typical cost of an action (no job size). Prefer estimateCost(id, meter) when the size
// is known, or charge the real usage via costOf() once a run completes.
export function creditsFor(id: AiActionId): number {
    return estimateCost(id);
}
