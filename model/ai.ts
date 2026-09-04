import type {
    ArtifactContent,
    ElementInstance,
    Section,
    SectionBackground,
    SectionOp,
} from "@model/artifact";
import type { Tokens } from "@model/theme";
import type { MediaItem } from "@model/media";
import { LAYOUT_PRESETS, diffSections, removeAtPath, updateAtPath } from "@model/artifact";

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
    clarifications?: string[]; // answered "Q · A" lines, and shaping notes from the console
    contextIds?: string[]; // attached context-library collections; retrieval grounds every call
    source?: string;
    sourceArtifactId?: string;
    // Borrow a starter's section shapes, never its words: the outline plans the same run of
    // layouts in the same order and writes this brief's own story into them. Named apart from
    // `artifacts.templateId`, which records what a piece was created FROM.
    shapeTemplateId?: string;
    imageSource?: "stock" | "ai"; // stock is the free default
}

export type BriefField = keyof GenerateInput;
export type BriefSource = "user" | "planner";

// The brief a generation is planned and written against, with who set each field: the planner
// fills what the user left blank and never overwrites what they typed.
export interface Brief extends GenerateInput {
    set: Partial<Record<BriefField, BriefSource>>;
}

export interface PlanOutline {
    title: string;
    backdrop?: string;
    beats: Beat[];
}

// The row keeps only settled states. "writing" is a live signal on the stream, so a process that
// dies mid-write leaves a beat queued rather than stuck.
export type BeatStatus = "queued" | "done" | "failed" | "skipped";

export interface BeatState {
    status: BeatStatus;
    versions: Section[]; // every take kept
    active: number; // the one the artifact carries
}

export type GenerationStage = "briefed" | "planning" | "outlined" | "writing" | "done";

// A piece being made: what the artifact cannot hold. The section of record lives in the draft
// artifact's content; this holds the brief, the plan, the standing note and the alternate takes.
export interface Generation {
    id: string;
    workspaceId: string;
    artifactId: string;
    stage: GenerationStage;
    brief: Brief;
    briefVersion: number;
    outline: PlanOutline | null;
    plannedAgainst: number | null; // the brief version the outline came from
    steer: string;
    clarify: string | null; // the planner's one question, until it is answered or skipped
    beats: Record<string, BeatState>;
    seq: number;
    createdAt: string; // ISO
}

export type GenerationOp =
    | { op: "setBrief"; patch: Partial<GenerateInput>; by: BriefSource }
    | { op: "setOutline"; title: string; backdrop?: string; beats: Beat[]; clarify?: string | null }
    | { op: "setClarify"; question: string | null }
    | { op: "addBeat"; afterId: string | null; beat: Beat }
    | { op: "updateBeat"; id: string; patch: Partial<Beat> }
    | { op: "removeBeat"; id: string }
    | { op: "moveBeat"; id: string; afterId: string | null }
    | { op: "setSteer"; note: string }
    | { op: "setBeat"; id: string; status: BeatStatus }
    | { op: "pushVersion"; id: string; section: Section }
    | { op: "pickVersion"; id: string; index: number }
    | { op: "setStage"; stage: GenerationStage };

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
    // the whole multi-selection, anchor first; absent when only one thing is selected
    elements?: { sectionId: string; path: number[] }[];
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

// A card the agent left that the user has not acted on. Listed in the agent's context so a spoken
// approval names it instead of re-emitting the payload.
export interface PendingProposal {
    id: string;
    summary: string;
    tool: string;
    call?: { input: unknown }; // a run the user has not started
    patch?: Patch; // a change that ran and waits to be applied
}

export interface ChatContext {
    surface: "editor" | "library" | "generate";
    artifactId?: string;
    content?: ArtifactContent; // the open artifact; the server derives the model's digest from it
    focus?: ChatFocus;
    library?: ChatLibrary; // present on the "library" surface (no open artifact)
    generationId?: string; // a run in progress; the server loads it and its draft
    pending?: PendingProposal[]; // cards still waiting on the user
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

// The durable thread. An assistant turn is kept as the events it streamed, compacted, so a client
// replays it through the same reducer that painted it live and the cards come back addressable.
export type ChatThreadMessage =
    | { role: "user"; text: string; at: string }
    | { role: "assistant"; events: TurnEvent[]; at: string };

// what the person did with a card, keyed by proposal id
export type ProposalMark = "applied" | "discarded";

export interface ChatThread {
    id: string;
    key: string; // generation:<id> · artifact:<id> · library
    messages: ChatThreadMessage[];
    marks: Record<string, ProposalMark>;
}

export const threadKey = (ctx: {
    generationId?: string;
    artifactId?: string;
    content?: unknown;
}): string =>
    ctx.generationId
        ? `generation:${ctx.generationId}`
        : ctx.artifactId
          ? `artifact:${ctx.artifactId}`
          : "library";

// a chat response is an ordered list of these
export type ChatBlock =
    | { type: "suggestions"; items: string[] }
    // What a tool proposes. `call` is a run the user approves before it happens (it costs, or it
    // creates); `patch` is a change that already ran and waits to be applied. Exactly one is set.
    | {
          type: "proposal";
          id: string;
          tool: string;
          summary: string;
          cost?: number;
          call?: { input: unknown };
          patch?: Patch;
          preview?: Section;
          targetArtifactId?: string;
          theme?: string;
          format?: string;
      }
    | { type: "sections"; sections: Section[]; format?: string } // a carousel of existing sections
    | { type: "artifacts"; items: ArtifactRef[] } // library search results, a pick-list
    | { type: "templates"; items: TemplateRef[] } // starter templates, a pick-list
    // a designed theme: the client saves it to the workspace, then points the artifact at the new id
    | { type: "theme"; name: string; mood: string; isDark: boolean; tokens: Tokens }
    // a run started from the chat; the card is a view of the generation it names
    | { type: "generation"; generationId: string; artifactId: string }
    // the agent applied a pending card on the person's spoken approval; the card is retired
    | { type: "applied"; proposal: string }
    // `confirm` = wait for a click before the client performs it
    | { type: "action"; action: WorkspaceAction; confirm: boolean };

export type PatchOp =
    | { op: "setMeta"; theme?: string; format?: string; background?: SectionBackground | null }
    | { op: "addSection"; afterId?: string | null; section: Section } // null ⇒ front, absent ⇒ append
    | { op: "replaceSection"; id: string; section: Section }
    | { op: "removeSection"; id: string }
    | { op: "moveSection"; id: string; afterId: string | null } // null ⇒ move to front
    | { op: "replaceElement"; sectionId: string; path: number[]; element: ElementInstance | null } // null ⇒ remove
    | { op: "setSectionBackground"; sectionId: string; background: SectionBackground | null };

// What a tool changes, by target. An object rather than a union because one tool often changes two
// things at once: writing a beat adds a section and marks the beat written, and both must land
// together. A workspace action is carried, not applied here; the caller performs it.
export interface Patch {
    artifact?: PatchOp[];
    generation?: GenerationOp[];
    workspace?: WorkspaceAction;
}

export interface PatchState {
    content?: ArtifactContent;
    generation?: Generation;
}

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
export function applyContentOps(
    content: ArtifactContent,
    ops: readonly PatchOp[],
): ArtifactContent {
    let next: ArtifactContent = { ...content, sections: cloneSections(content.sections) };
    for (const op of ops) next = applyOp(next, op);
    return next;
}

const freshBeat = (): BeatState => ({ status: "queued", versions: [], active: 0 });

function insertBeat(beats: Beat[], afterId: string | null, beat: Beat): Beat[] {
    // idempotent on id, so an echo of an op already applied optimistically changes nothing
    const without = beats.filter((b) => b.id !== beat.id);
    if (afterId === null) return [beat, ...without];
    const i = without.findIndex((b) => b.id === afterId);
    if (i < 0) return [...without, beat];
    return [...without.slice(0, i + 1), beat, ...without.slice(i + 1)];
}

const BRIEF_FIELDS = [
    "prompt",
    "surface",
    "theme",
    "goal",
    "audience",
    "tone",
    "length",
    "mustInclude",
    "clarifications",
    "contextIds",
    "source",
    "sourceArtifactId",
    "shapeTemplateId",
    "imageSource",
] as const satisfies readonly BriefField[];

// The planner fills blanks and never overwrites what the user typed; a user edit is the only thing
// that moves the version, which is what "planned against an older brief" is measured by.
function setBrief(gen: Generation, patch: Partial<GenerateInput>, by: BriefSource): Generation {
    const set = { ...gen.brief.set };
    const accepted: Partial<GenerateInput> = {};
    let changed = false;
    const take = <K extends BriefField>(key: K): void => {
        if (by === "planner" && set[key] === "user") return;
        const value = patch[key];
        if (JSON.stringify(gen.brief[key]) === JSON.stringify(value)) return;
        accepted[key] = value;
        set[key] = by;
        changed = true;
    };
    for (const key of BRIEF_FIELDS) if (key in patch) take(key);
    if (!changed) return gen;
    return {
        ...gen,
        brief: { ...gen.brief, ...accepted, set },
        briefVersion: by === "user" ? gen.briefVersion + 1 : gen.briefVersion,
    };
}

function applyGenerationOp(gen: Generation, op: GenerationOp): Generation {
    const outline = gen.outline;
    const withBeats = (beats: Beat[]): Generation => ({
        ...gen,
        outline: outline ? { ...outline, beats } : { title: "", beats },
    });
    const state = (id: string): BeatState => gen.beats[id] ?? freshBeat();
    switch (op.op) {
        case "setBrief":
            return setBrief(gen, op.patch, op.by);
        case "setOutline": {
            const beats: Record<string, BeatState> = {};
            for (const b of op.beats) beats[b.id] = state(b.id);
            return {
                ...gen,
                outline: { title: op.title, backdrop: op.backdrop, beats: op.beats },
                plannedAgainst: gen.briefVersion,
                clarify: op.clarify ?? null,
                beats,
                stage: "outlined",
            };
        }
        case "setClarify":
            return { ...gen, clarify: op.question };
        case "addBeat": {
            const next = withBeats(insertBeat(outline?.beats ?? [], op.afterId, op.beat));
            return { ...next, beats: { ...gen.beats, [op.beat.id]: state(op.beat.id) } };
        }
        case "updateBeat":
            return withBeats(
                (outline?.beats ?? []).map((b) =>
                    b.id === op.id ? { ...b, ...op.patch, id: b.id } : b,
                ),
            );
        case "removeBeat": {
            const next = withBeats((outline?.beats ?? []).filter((b) => b.id !== op.id));
            const { [op.id]: _gone, ...rest } = gen.beats;
            return { ...next, beats: rest };
        }
        case "moveBeat": {
            const beat = outline?.beats.find((b) => b.id === op.id);
            if (!beat || !outline) return gen;
            return withBeats(insertBeat(outline.beats, op.afterId, beat));
        }
        case "setSteer":
            return { ...gen, steer: op.note };
        case "setBeat":
            return {
                ...gen,
                beats: { ...gen.beats, [op.id]: { ...state(op.id), status: op.status } },
            };
        case "pushVersion": {
            const s = state(op.id);
            const versions = [...s.versions, op.section];
            return {
                ...gen,
                beats: {
                    ...gen.beats,
                    [op.id]: { status: "done", versions, active: versions.length - 1 },
                },
            };
        }
        case "pickVersion": {
            const s = state(op.id);
            if (!s.versions.length) return gen;
            const active = Math.max(0, Math.min(s.versions.length - 1, op.index));
            return { ...gen, beats: { ...gen.beats, [op.id]: { ...s, active } } };
        }
        case "setStage":
            return { ...gen, stage: op.stage };
    }
}

// never mutates the input
export function applyGenerationOps(gen: Generation, ops: readonly GenerationOp[]): Generation {
    let next = gen;
    for (const op of ops) next = applyGenerationOp(next, op);
    return next;
}

// Both halves at once, so a tool that writes a section and marks its beat lands as one change.
// A half whose target is absent from the state is left for whoever holds that target.
/**
 * A patch as the section ops the REST write and the collaboration room speak. The two vocabularies
 * describe the same edits from two sides (a patch names what changed, an op names how the stored
 * document moves), and this is where they meet: apply the patch, diff, and the ops fall out. A
 * server-side write goes through here so collaborators see the change land as ops rather than as
 * a resync, and so nothing about a tool's effect is written twice.
 */
export function toSectionOps(before: ArtifactContent, ops: PatchOp[]): SectionOp[] {
    const had = new Map(before.sections.map((s) => [s.id, JSON.stringify(s)]));
    // the diff reads identity, which the editor keeps and a patch application does not; a section
    // the patch left alone is the same section whatever object it came back in
    return diffSections(before, applyContentOps(before, ops)).filter(
        (op) => op.kind !== "set" || had.get(op.section.id) !== JSON.stringify(op.section),
    );
}

export function applyPatch(state: PatchState, patch: Patch): PatchState {
    return {
        content:
            state.content && patch.artifact?.length
                ? applyContentOps(state.content, patch.artifact)
                : state.content,
        generation:
            state.generation && patch.generation?.length
                ? applyGenerationOps(state.generation, patch.generation)
                : state.generation,
    };
}

export const emptyPatch = (p: Patch): boolean =>
    !p.artifact?.length && !p.generation?.length && !p.workspace;

// the beats written so far, in outline order
export const writtenBeats = (gen: Generation): Beat[] =>
    (gen.outline?.beats ?? []).filter((b) => gen.beats[b.id]?.status === "done");

export const unwrittenBeats = (gen: Generation): Beat[] =>
    (gen.outline?.beats ?? []).filter((b) => {
        const s = gen.beats[b.id]?.status ?? "queued";
        return s === "queued" || s === "failed";
    });

// the section of record for a beat: its active take, or null while it is unwritten
export const beatSection = (gen: Generation, id: string): Section | null => {
    const s = gen.beats[id];
    return s?.versions[s.active] ?? null;
};

export const columnsFor = (layout?: string): number =>
    LAYOUT_PRESETS[layout ?? "full"]?.length ?? 1;

// keeps the blocks that still fit the new column count
export function blocksForLayout(layout: string, prev?: string[]): string[] {
    const n = columnsFor(layout);
    const kept = (prev ?? []).slice(0, n);
    while (kept.length < n) kept.push("text");
    return kept;
}

// A layout change carries a column count, so the blocks leading those columns move with it. Here
// because there are two writers, the outline card and the agent, and only one used to remember.
export function withDerivedBlocks(patch: Partial<Beat>, prev?: string[]): Partial<Beat> {
    if (patch.layout === undefined || patch.blocks !== undefined) return patch;
    return { ...patch, blocks: blocksForLayout(patch.layout, prev) };
}

// fresh non-colliding beat/section id in the outline's "s<N>" scheme
export function newBeatId(beats: readonly Beat[], taken: Iterable<string> = []): string {
    const used = new Set([...beats.map((b) => b.id), ...taken]);
    for (let n = beats.length + 1; ; n++) {
        const id = `s${n}`;
        if (!used.has(id)) return id;
    }
}

export function makeBeat(id: string): Beat {
    return {
        id,
        label: "New section",
        role: "detail",
        layout: "full",
        blocks: ["text"],
        image: false,
        brief: "",
    };
}

export type Phase = "intake" | "outline" | "build" | "compose" | "done";

export type SectionStatus = "queued" | "active" | "writing" | "image" | "done";

// The generate prompt offers the model the first seven; `detail` is only ever chosen by hand in
// the outline editor. `ROLE_WANTS` in ./eval scores seven of the eight.
export const BEAT_ROLES = [
    "scene",
    "tension",
    "turn",
    "proof",
    "objection",
    "momentum",
    "close",
    "detail",
] as const;
export type BeatRole = (typeof BEAT_ROLES)[number];

export interface Beat {
    id: string;
    label: string;
    // stays a string: the model supplies it and can invent one, so narrow with asBeatRole
    role: string;
    layout?: string; // a named layout preset; shapes the pre-content skeleton
    image?: boolean; // carries a prominent image (drives sourcing + ghost)
    blocks?: string[]; // the block kind leading each column, in order
    design?: string; // the id of the template design this section uses, when one was offered
    brief?: string; // one line telling the section writer what this section must say
    takeaway?: string;
    points?: string[]; // the 2–4 concrete moves/claims the section makes, in order
    covers?: string[]; // which of the brief's mustInclude points this beat covers (verbatim)
}

export type TurnEvent =
    | { type: "turn.start"; tool: string }
    | { type: "phase"; name: Phase }
    | { type: "narration"; text: string; mono?: string; sub?: string } // Console terminal lines
    | { type: "plan"; beats: Beat[]; title?: string; backdrop?: string }
    // the outline as it streams: only the beats that have fully formed so far, replaced wholesale
    // each time, so the studio paints the plan while the rest of it is still generating
    | { type: "plan.partial"; beats: Beat[]; title?: string }
    | { type: "section.status"; id: string; status: SectionStatus }
    // how long a landed section's image resolution took; analytics-only, arrives after its patch
    | { type: "section.timing"; id: string; imagesMs: number }
    // a build's live preview: the written section with empty frames where its photographs will
    // land, shown while they are sourced; never stored, the following patch is the section of record
    | { type: "section.partial"; id: string; section: Section }
    // `seq` is the generation's revision after the server applied it; absent when the caller applies
    | { type: "patch"; patch: Patch; seq?: number }
    // a section's narration landed: synthesized now, or served from the cache at no cost
    | { type: "section.audio"; id: string; ms: number; cached: boolean; chars: number }
    // one generated picture or clip, stored in the workspace library; `failed` is a variation lost
    | { type: "media"; item: MediaItem }
    | { type: "media.failed"; reason?: string }
    // one headline per move in the agent's reasoning loop; no label = it just started thinking
    | { type: "chat.thinking"; label?: string }
    | { type: "chat.text"; delta: string } // streamed assistant prose
    // sent again with done:true so a tool that produces no block still closes its widget shell
    | { type: "chat.tool"; blockId: string; tool: string; title: string; done?: boolean }
    | { type: "chat.nested"; blockId: string; event: TurnEvent } // a capability event routed to a block's widget
    | { type: "chat.block"; blockId: string; block: ChatBlock }
    | { type: "turn.done"; summary?: string; result?: unknown; traceId?: string }
    | { type: "error"; message: string };
