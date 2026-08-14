import type { ArtifactContent, ElementInstance, Section, SectionBackground } from "@model/artifact";
import type { Tokens } from "@model/theme";
import { removeAtPath, updateAtPath } from "@model/artifact";

export type TurnKind = "generate" | "edit" | "section" | "chat" | "plan" | "build";

/**
 * One model call, as the runtime recorded it. Owned here rather than by any one consumer: the
 * meter reads the token fields to bill, and the eval playground reads the rest to explain. The
 * prompt bodies are present only on a traced run, and are clipped at capture.
 */
export interface ModelSpan {
    modelId: string;
    input: number; // tokens
    output: number;
    step: string; // "brief" | "outline" | "plan-section" | "section:<beatId>" | "" when unlabelled
    ms: number;
    system?: string;
    prompt?: string;
    response?: string;
    temperature?: number;
    finishReason?: string;
}
export type Surface = "deck" | "doc" | "web";

export interface GenerateInput {
    prompt: string;
    surface: Surface;
    theme: string;
    goal?: string;
    audience?: string;
    tone?: string;
    length?: string;
    mustInclude?: string[]; // the outline tags beats with these
    clarifications?: string[]; // answered "Q — A" lines from the brief stage
    contextIds?: string[]; // attached context-library collections; retrieval grounds every call
    source?: string;
    sourceArtifactId?: string;
    imageSource?: "stock" | "ai"; // stock is the free default
}

// a structured expansion of a raw prompt the user edits before anything is planned
export interface BriefDraft {
    prompt: string;
    surface?: Surface;
    goal?: string;
    audience?: string;
    tone?: string;
    length?: string;
    mustInclude?: string[];
    clarify?: string; // ONE question, only when the answer would change the outline
}

// the approved plan a build turn writes against
export interface PlanOutline {
    title: string;
    backdrop?: string;
    beats: Beat[];
}

// write ONE pre-planned beat of an approved outline (the studio's client-driven build loop)
export interface BuildInput {
    brief: GenerateInput;
    outline: PlanOutline;
    beat: Beat;
    content: ArtifactContent; // the artifact as built so far
    afterId: string | null; // insert after this id; null ⇒ front
    steer?: string; // session-wide, applies from here on
    note?: string; // per-attempt instruction (regenerate-with-note)
    anchor?: "cover" | "closer"; // force a full-bleed background on the piece's bookends
    replace?: boolean; // true ⇒ emit replaceSection (a regeneration), else addSection
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
    // client ROUTES to the guarded UI (Share modal / export), never publishes/downloads directly
    | { kind: "share"; id: string }
    | { kind: "export"; id: string };

export interface ArtifactRef {
    id: string;
    title: string;
    format: string; // "deck" | "doc" | "web"
    updatedAt?: string;
}

// what the planner understood the prompt to be asking for
export interface BriefRead {
    goal?: string;
    audience?: string;
    tone?: string;
    mustInclude?: string[];
}

export interface ChatBeat {
    id: string;
    label: string;
    role: string;
    brief?: string;
    takeaway?: string;
    points?: string[];
    written: boolean;
}

// its presence tells the agent it is INSIDE a run, so proposing a separate new artifact is wrong
export interface ChatGeneration {
    stage: string; // planning · outline · building · review · done
    surface: Surface;
    prompt: string;
    goal?: string;
    audience?: string;
    tone?: string;
    mustInclude?: string[];
    steer?: string; // the standing note already in force, so the agent can amend rather than repeat
    beats: ChatBeat[];
}

// Outline edits are not artifact edits: they change the plan, which only the studio holds.
export type BeatOp =
    | { op: "addBeat"; afterId: string | null; beat: Beat }
    | { op: "updateBeat"; id: string; patch: Partial<Beat> }
    | { op: "removeBeat"; id: string }
    | { op: "moveBeat"; id: string; afterId: string | null };
export type OutlinePatch = BeatOp[];

export interface ChatContext {
    surface: "editor" | "library" | "generate";
    artifactId?: string;
    content?: ArtifactContent; // the open artifact; server derives the model's digest from it
    focus?: ChatFocus;
    library?: ChatLibrary; // present on the "library" surface (no open artifact)
    generation?: ChatGeneration; // present on the "generate" surface (a run in progress)
    contextIds?: string[]; // attached context-library collections
    imageSource?: "stock" | "ai"; // so re-sourcing an image matches how the piece was built
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
    // the user's message already said "build it" — the client starts the run without a click
    approved?: boolean;
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
    | { type: "artifacts"; items: ArtifactRef[] } // library search results, a pick-list
    | { type: "templates"; items: TemplateRef[] } // starter templates, a pick-list
    | { type: "outline"; summary: string; ops: OutlinePatch } // a proposed edit to the live outline
    // a designed theme: the client saves it to the workspace, then points the artifact at the new id
    | { type: "theme"; name: string; mood: string; isDark: boolean; tokens: Tokens }
    | { type: "write"; summary: string; beatIds: string[] } // write these already-planned beats
    // plan (or replan) the run's outline; the studio runs the plan turn when the user starts it
    | { type: "plan"; summary: string; guidance?: string; andWrite?: boolean }
    // a standing note for every section still to be written; "" clears it
    | { type: "steer"; note: string }
    | { type: "action"; action: WorkspaceAction }; // a workspace action the client runs (or confirms)

// `trace` asks the server to record every model call of this turn as an eval run. Honoured only for
// eval admins, so a client setting it changes nothing on its own.
type Traced = { trace?: boolean };

export type TurnRequest = Traced &
    (
        | { kind: "generate"; input: GenerateInput }
        | { kind: "edit"; input: EditInput }
        | { kind: "section"; input: SectionInput }
        | { kind: "chat"; input: ChatInput }
        | { kind: "plan"; input: GenerateInput }
        | { kind: "build"; input: BuildInput }
    );

export const isKind = (k: string): k is TurnKind =>
    k === "generate" ||
    k === "edit" ||
    k === "section" ||
    k === "chat" ||
    k === "plan" ||
    k === "build";

export type PatchOp =
    | { op: "setMeta"; theme?: string; format?: string; background?: SectionBackground | null }
    | { op: "addSection"; afterId?: string | null; section: Section } // null ⇒ front, absent ⇒ append
    | { op: "replaceSection"; id: string; section: Section }
    | { op: "removeSection"; id: string }
    | { op: "moveSection"; id: string; afterId: string | null } // null ⇒ move to front
    | { op: "replaceElement"; sectionId: string; path: number[]; element: ElementInstance | null } // null ⇒ remove
    | { op: "setSectionBackground"; sectionId: string; background: SectionBackground | null };

export type Patch = PatchOp[];

// shallow copy is enough: applyOp swaps immutably, so originals are never mutated
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
            return {
                ...content,
                sections: insertAfter(content.sections, op.afterId, op.section),
            };
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

// never mutates the input
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
    brief?: string; // one line telling the section writer what this section must say
    takeaway?: string;
    points?: string[]; // the 2–4 concrete moves/claims the section makes, in order
    covers?: string[]; // which of the brief's mustInclude points this beat covers (verbatim)
}

export type TurnEvent =
    | { type: "turn.start"; kind: TurnKind }
    | { type: "phase"; name: Phase }
    | { type: "narration"; text: string; mono?: string; sub?: string } // Console terminal lines
    // `brief` is the planner's own reading of the prompt, folded in here to save a second call
    | {
          type: "plan";
          beats: Beat[];
          title?: string;
          backdrop?: string;
          brief?: BriefRead;
      }
    | { type: "section.status"; id: string; status: SectionStatus }
    | { type: "patch"; ops: Patch } // apply to the canvas as it streams
    | { type: "reply"; text: string } // chat/research answer
    // one headline per move in the agent's reasoning loop; no label = it just started thinking
    | { type: "chat.thinking"; label?: string }
    | { type: "chat.text"; delta: string } // streamed assistant prose
    // sent again with done:true so a tool that produces no block still closes its widget shell
    | { type: "chat.tool"; blockId: string; tool: string; title: string; done?: boolean }
    | { type: "chat.nested"; blockId: string; event: TurnEvent } // a capability event routed to a block's widget
    | { type: "chat.block"; blockId: string; block: ChatBlock }
    | { type: "turn.done"; summary?: string }
    | { type: "error"; message: string };

// monotonic seq is the SSE resume cursor
export interface LoggedEvent {
    seq: number;
    event: TurnEvent;
}
