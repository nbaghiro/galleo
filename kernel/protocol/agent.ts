import type {
    ArtifactContent,
    Cell,
    ElementInstance,
    Section,
    SectionBackground,
} from "@model/content";

// The AI agent protocol — the single contract shared across the boundary: the runtime (services/agent)
// emits it, the event log persists it, and the studio Console + canvas consume it. Pure (no IO, no
// engine). Swapping the client-side simulator for the real LLM runtime changes nothing on the client,
// because both speak exactly this. Not yet wired — scaffolding pinned ahead of its consumers.

// --- turns: what the client asks the agent to do ---

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
    instruction: string;
    sectionId: string;
    cell?: string; // narrow to one element/block within the section
}

export interface ChatInput {
    message: string; // conversational turn; may research + propose a patch, or just reply
}

export type TurnRequest =
    | { kind: "generate"; input: GenerateInput }
    | { kind: "edit"; input: EditInput }
    | { kind: "section"; input: SectionInput }
    | { kind: "chat"; input: ChatInput };

export type TurnStatus = "pending" | "running" | "done" | "error" | "canceled";

export const isKind = (k: string): k is TurnKind =>
    k === "generate" || k === "edit" || k === "section" || k === "chat";

// --- patches: the ordered structural ops an agent turn produces ---
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
}

export type AgentEvent =
    | { type: "turn.start"; kind: TurnKind }
    | { type: "phase"; name: Phase }
    | { type: "narration"; text: string; mono?: string; sub?: string } // the Console terminal lines
    | { type: "plan"; beats: Beat[] }
    | { type: "section.status"; id: string; status: SectionStatus }
    | { type: "patch"; ops: Patch } // apply to the canvas as it streams
    | { type: "reply"; text: string } // chat/research answer
    | { type: "turn.done"; summary?: string }
    | { type: "error"; message: string };

// A persisted event = an AgentEvent plus its monotonic sequence in the turn's log (the SSE resume cursor).
export interface LoggedEvent {
    seq: number;
    event: AgentEvent;
}
