import type { ArtifactContent, ElementInstance, Section, SectionBackground } from "@model/artifact";
import { LAYOUT_PRESETS, removeAtPath, updateAtPath } from "@model/section";
import {
    BULLET_MARKERS,
    BUTTON_VARIANTS,
    CALLOUT_TONES,
    CARD_STYLES,
    CHART_TYPES,
    DIAGRAM_TYPES,
    FLEX_DIRECTION,
    IMAGE_FIT,
    TEXT_ALIGN,
    TEXT_STYLES,
} from "@model/elements";

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
    contextRefs?: string[]; // ids into the artifact's ContextPack
    source?: string;
    sourceArtifactId?: string;
    imageSource?: "stock" | "ai"; // stock (default, free) or AI-generated
}

export interface EditInput {
    instruction: string; // whole-artifact revision
}

export interface SectionInput {
    instruction: string;
    afterId: string | null; // insert after this id; null ⇒ front
    content: ArtifactContent; // the current artifact, for context + id allocation
}

export interface ChatFocus {
    kind: "element" | "section" | "none";
    sectionId?: string;
    path?: number[];
    elementType?: string;
    headline?: string; // first text, for grounding
}

// sent when no artifact is open
export interface ChatLibrary {
    view?: string; // "library" | "templates" | "trash" | "shared"
    artifactCount?: number;
    recent?: { title: string; format: string }[];
    folder?: string;
    folders?: { id: string; name: string }[]; // so the agent can resolve a move target
}

// agent proposes; the client executes them (destructive ones via a confirm card)
export type WorkspaceAction =
    | { kind: "rename"; id: string; title: string }
    | { kind: "move"; id: string; folderId: string | null } // null ⇒ remove from any folder
    | { kind: "duplicate"; id: string }
    | { kind: "trash"; id: string } // destructive → confirmed
    | { kind: "restore"; id: string }
    | { kind: "create-folder"; name: string }
    // client ROUTES to the guarded UI (Share modal / export) — never publishes/downloads directly
    | { kind: "share"; id: string }
    | { kind: "export"; id: string };

export interface ArtifactRef {
    id: string;
    title: string;
    format: string; // "deck" | "doc" | "web"
    updatedAt?: string;
}

export interface ChatContext {
    surface: "editor" | "library";
    artifactId?: string;
    content?: ArtifactContent; // the open artifact; server derives the model's digest from it
    focus?: ChatFocus;
    library?: ChatLibrary; // present on the "library" surface (no open artifact)
    plan?: string; // so the agent can hint at gated capabilities
    credits?: { remaining: number; limit: number }; // so the agent can answer "how many left"
}

export interface TemplateRef {
    id: string;
    name: string;
    category: string;
}

export interface ChatTurnRef {
    role: "user" | "assistant";
    text: string; // compacted; widgets aren't replayed to the model
}

export interface ChatInput {
    message: string;
    context: ChatContext;
    history?: ChatTurnRef[];
}

// a generation brief the user confirms before anything is built
export interface GenBrief {
    prompt: string;
    surface: Surface;
    length?: string; // "Short" | "Standard" | "In-depth"
    goal?: string;
    audience?: string;
    tone?: string;
    sourceFromMessage?: boolean; // build from the user's last pasted message
    sourceArtifactId?: string;
}

// a chat response is an ordered list of these
export type ChatBlock =
    | { type: "text"; text: string }
    | { type: "suggestions"; items: string[] }
    // targetArtifactId ⇒ apply to a named library artifact; absent ⇒ the open artifact / in-chat draft
    | {
          type: "proposal";
          summary: string;
          patch: Patch;
          preview?: Section;
          targetArtifactId?: string;
          theme?: string;
          format?: string;
      }
    | { type: "preview"; section?: Section; format?: string }
    | { type: "sections"; sections: Section[]; format?: string } // a carousel of existing sections
    | { type: "brief"; brief: GenBrief } // a proposed generation the user confirms
    | { type: "artifacts"; items: ArtifactRef[] } // library search results — a pick-list
    | { type: "templates"; items: TemplateRef[] } // starter templates — a pick-list
    | { type: "action"; action: WorkspaceAction }; // a workspace action the client runs (or confirms)

export type TurnRequest =
    | { kind: "generate"; input: GenerateInput }
    | { kind: "edit"; input: EditInput }
    | { kind: "section"; input: SectionInput }
    | { kind: "chat"; input: ChatInput };

export type TurnStatus = "pending" | "running" | "done" | "error" | "canceled";

export const isKind = (k: string): k is TurnKind =>
    k === "generate" || k === "edit" || k === "section" || k === "chat";

export type PatchOp =
    | { op: "setMeta"; theme?: string; format?: string; background?: SectionBackground | null }
    | { op: "addSection"; afterId?: string | null; section: Section } // afterId null/absent ⇒ append
    | { op: "replaceSection"; id: string; section: Section }
    | { op: "removeSection"; id: string }
    | { op: "moveSection"; id: string; afterId: string | null } // null ⇒ move to front
    | { op: "replaceElement"; sectionId: string; path: number[]; element: ElementInstance | null } // null ⇒ remove
    | { op: "setSectionBackground"; sectionId: string; background: SectionBackground | null };

export type Patch = PatchOp[];

// shallow-copy; applyOp swaps immutably, so originals are never mutated
const cloneSections = (sections: Section[]): Section[] => sections.map((s) => ({ ...s }));

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
                    const el = op.element;
                    const root = el
                        ? updateAtPath(s.root, op.path, () => el)
                        : removeAtPath(s.root, op.path);
                    return { ...s, root };
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

// immutable — never mutates the input
export function applyPatch(content: ArtifactContent, patch: Patch): ArtifactContent {
    let next: ArtifactContent = { ...content, sections: cloneSections(content.sections) };
    for (const op of patch) next = applyOp(next, op);
    return next;
}

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
    layout?: string; // a named layout preset; shapes the pre-content skeleton
    image?: boolean; // carries a prominent image (drives sourcing + ghost)
    blocks?: string[]; // the block kind leading each column, in order
}

export type TurnEvent =
    | { type: "turn.start"; kind: TurnKind }
    | { type: "phase"; name: Phase }
    | { type: "narration"; text: string; mono?: string; sub?: string } // Console terminal lines
    | { type: "plan"; beats: Beat[] }
    | { type: "section.status"; id: string; status: SectionStatus }
    | { type: "patch"; ops: Patch } // apply to the canvas as it streams
    | { type: "reply"; text: string } // chat/research answer
    | { type: "chat.reasoning"; delta: string } // streamed thinking tokens
    | { type: "chat.text"; delta: string } // streamed assistant prose
    | { type: "chat.tool"; blockId: string; tool: string; title: string } // a tool started → a widget shell appears
    | { type: "chat.nested"; blockId: string; event: TurnEvent } // a capability event routed to a block's widget
    | { type: "chat.block"; blockId: string; block: ChatBlock } // a finished widget block
    | { type: "turn.done"; summary?: string }
    | { type: "error"; message: string };

// monotonic seq is the SSE resume cursor
export interface LoggedEvent {
    seq: number;
    event: TurnEvent;
}

// guidance only — the model can author custom widths
export interface LayoutPreset {
    id: string;
    columns: number;
    widths: string; // human description of the column split
    when: string;
}

const LAYOUT_HINTS: Record<string, { widths: string; when: string }> = {
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

export const LAYOUTS: readonly LayoutPreset[] = Object.keys(LAYOUT_PRESETS).map((id) => {
    const h = LAYOUT_HINTS[id] ?? { widths: "", when: "" };
    return { id, columns: LAYOUT_PRESETS[id]!.length, widths: h.widths, when: h.when };
});

export type FieldType = "string" | "text" | "number" | "boolean" | "enum" | "children";

export interface FieldSpec {
    key: string;
    type: FieldType;
    required?: boolean;
    values?: readonly string[]; // for type "enum"
    default?: string | number | boolean;
    desc: string; // guidance for the LLM
}

export interface ElementSchema {
    type: string; // the ElementInstance.type to emit
    label: string;
    category: string;
    container?: boolean; // true → data.children holds nested elements
    when: string;
    fields: readonly FieldSpec[];
}

const childrenField = (desc: string): FieldSpec => ({
    key: "children",
    type: "children",
    required: true,
    desc,
});

export const ELEMENTS: readonly ElementSchema[] = [
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
                desc: "filled, outline, soft, or ghost",
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

// excludes the palette-hidden __dropghost + raw chart/diagram variants
export const isEmittableType = (type: string): boolean => ELEMENT_TYPES.includes(type);
