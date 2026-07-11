// The AI contract — everything `model` defines for the AI layer, in two parts: (1) the streamed
// turn PROTOCOL (turns, patches, events) the generation runtime emits and the studio consumes; (2) the
// authoring CATALOG (the elements + grids the LLM writes against, with hints) that seeds the system
// prompt and the validator. Pure — no IO, no engine. The tool catalog + metered pricing (what each tool
// costs) lives in @model/tools; the generic credit math it prices against lives in @model/credits.

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
    source?: string; // raw source material to build FROM (pasted text, or an artifact's extracted text)
    sourceArtifactId?: string; // repurpose an existing artifact — the runtime reads it + uses its text as source
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
    kind: "element" | "section" | "none";
    sectionId?: string;
    path?: number[]; // the focused element's path within the section's root tree
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
    folders?: { id: string; name: string }[]; // the workspace's folders, so the agent can resolve a move target
}

// A workspace management action the agent proposes and the CLIENT executes against its (optimistic) library
// stores — the app owns these mutations, not the server turn. The client decides policy: reversible ones run
// on arrival; destructive ones (trash) go through a confirm card. Targets are real ids (from find-artifacts).
export type WorkspaceAction =
    | { kind: "rename"; id: string; title: string }
    | { kind: "move"; id: string; folderId: string | null } // null ⇒ remove from any folder
    | { kind: "duplicate"; id: string }
    | { kind: "trash"; id: string } // destructive → confirmed
    | { kind: "restore"; id: string }
    | { kind: "create-folder"; name: string }
    // Outward-facing → the client ROUTES to the proper guarded UI (never publishes/downloads directly): a
    // one-click card that opens the Share modal (publishing is opt-in there) or opens the artifact to export.
    | { kind: "share"; id: string }
    | { kind: "export"; id: string };

// A lightweight reference to a library artifact — what `find-artifacts` returns and the `artifacts` block
// renders (a pick-list the user can open). Carries just enough to identify + label it, never the content.
export interface ArtifactRef {
    id: string;
    title: string;
    format: string; // "deck" | "doc" | "web"
    updatedAt?: string;
}

export interface ChatContext {
    surface: "editor" | "library"; // where the chat is being used
    artifactId?: string;
    content?: ArtifactContent; // the open artifact (editor surface) — server derives the digest for the model
    focus?: ChatFocus;
    library?: ChatLibrary; // present on the "library" surface (no open artifact) — the workspace summary
    plan?: string; // workspace plan, so the agent can hint at gated capabilities
    credits?: { remaining: number; limit: number }; // AI credit balance, so the agent can answer "how many left"
}

// A reference to a starter template — what `find-templates` returns and the `templates` block renders (a
// pick-list; picking one starts an in-chat draft from it). Content stays server-side until the user picks.
export interface TemplateRef {
    id: string;
    name: string;
    category: string;
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

// A one-line generation brief the agent hands back for the user to confirm — the `brief` chat block. The
// agent distills the conversation to this; the client renders a "Generate →" card (with a cost estimate),
// and only on click does it run a real `generate` turn into an in-chat draft. Nothing is built or saved
// until the user commits. `theme` is filled by the client (the app theme) at generate time, so the agent
// only owns the editorial choices (what to build, which surface, how long).
export interface GenBrief {
    prompt: string; // the one-sentence brief the generator builds from
    surface: Surface; // deck | doc | web
    length?: string; // "Short" | "Standard" | "In-depth"
    goal?: string;
    audience?: string;
    tone?: string;
    // Source-grounded generation: build FROM material rather than just a topic. The client resolves the
    // source at generate time (avoiding re-emitting long text through the model):
    sourceFromMessage?: boolean; // build from the content the user just pasted (their last message)
    sourceArtifactId?: string; // repurpose an existing artifact (e.g. "turn my report into a deck")
}

// A rich block in an assistant message — a chat response is an ordered list of these. Text streams in as
// `chat.text` deltas; the widget blocks arrive whole as `chat.block`. `proposal` carries a mutation the user
// applies or discards (with a real section preview); `preview` shows content without changing anything.
export type ChatBlock =
    | { type: "text"; text: string }
    | { type: "suggestions"; items: string[] }
    // A mutation the user applies/discards. `targetArtifactId` (+ its theme/format for the preview) makes it
    // apply to a NAMED library artifact instead of the open one / the active draft — the same widget, three
    // targets. Absent target ⇒ the open editor artifact or the live in-chat draft.
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
    | { type: "sections"; sections: Section[]; format?: string } // a scrollable carousel of existing sections
    | { type: "brief"; brief: GenBrief } // a proposed generation the user confirms to build into an in-chat draft
    | { type: "artifacts"; items: ArtifactRef[] } // library search results — a pick-list the user can open
    | { type: "templates"; items: TemplateRef[] } // starter templates — a pick-list that starts a draft
    | { type: "action"; action: WorkspaceAction }; // a workspace management action the client runs (or confirms)

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
    | { op: "replaceElement"; sectionId: string; path: number[]; element: ElementInstance | null } // null ⇒ remove
    | { op: "setSectionBackground"; sectionId: string; background: SectionBackground | null };

export type Patch = PatchOp[];

// Shallow-copy each section wrapper; applyOp only ever swaps `root` for a freshly-built tree (updateAtPath
// is immutable), so the originals are never mutated.
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
    layout?: string; // a named layout preset (its column count + widths) — shapes the pre-content skeleton
    image?: boolean; // carries a prominent image (drives the sourcing step + ghost)
    blocks?: string[]; // the block kind leading each column, in order — skeleton + writer both honor it
}

export type TurnEvent =
    | { type: "turn.start"; kind: TurnKind }
    | { type: "phase"; name: Phase }
    | { type: "narration"; text: string; mono?: string; sub?: string } // the Console terminal lines
    | { type: "plan"; beats: Beat[] }
    | { type: "section.status"; id: string; status: SectionStatus }
    | { type: "patch"; ops: Patch } // apply to the canvas as it streams
    | { type: "reply"; text: string } // chat/research answer
    | { type: "chat.reasoning"; delta: string } // streamed thinking tokens (the collapsible "thinking" bubble)
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

// --- layout presets: named starter column arrangements the writer can reach for (a section's root is a
// row of columns; these are just convenient count + width ratios). Guidance only — the model emits the
// actual recursive tree, and can always author custom widths. ---

export interface LayoutPreset {
    id: string;
    columns: number; // how many top-level columns the preset lays out
    widths: string; // human description of the column split
    when: string; // when to reach for this layout
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

// The element types the AI is allowed to emit (the palette-hidden `__dropghost`, and the raw variant
// chart/diagram element types, are deliberately excluded — emit `chart`/`diagram` with a `data.type`).
export const isEmittableType = (type: string): boolean => ELEMENT_TYPES.includes(type);
