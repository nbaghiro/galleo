import type { ArtifactContent, Section, GenMeta, ElementInstance } from "@model/artifact";
import type {
    Beat,
    BriefRead,
    ChatGeneration,
    GenerateInput,
    OutlinePatch,
    Patch,
    PlanOutline,
    SectionStatus,
    TurnEvent,
    Phase as TurnPhase,
} from "@model/ai";
import { createSignal } from "solid-js";
import { createStore, produce } from "solid-js/store";
import { applyPatch } from "@model/ai";
import { api, streamTurn } from "../api";
import { loadBilling } from "./billing";
import { bindChatTarget } from "./chat";
import { appTheme } from "./theme";
import { reportError } from "./errors";
import {
    attachArtifact,
    beginRun,
    currentRunSteps,
    nameRun,
    noteStep,
    unitRates,
} from "./model-usage";
import { persistArtifact, updateArtifactContent } from "./library";
import {
    buildCost,
    coverageMap,
    insertBeatAfter,
    makeBeat,
    moveBeat,
    newBeatId,
    pointFromQuestion,
    briefCost as rawBriefCost,
    planCost as rawPlanCost,
    removeBeat,
    reorderBeat,
    sectionCost as rawSectionCost,
    updateBeat,
} from "./generate-plan";

export type Surface = "deck" | "doc" | "web";

// "idle" means no session.
export type Stage = "idle" | "intake" | "planning" | "outline" | "building" | "done" | "error";

export type SlotStatus = SectionStatus | "skipped";

export interface SectionSlot {
    id: string;
    status: SlotStatus;
    layout: string;
    image: boolean;
    blocks: string[]; // the block leading each column, in order
    versions: Section[]; // every take kept
    active: number; // index into versions
    working: boolean; // a regeneration in flight for this slot
}

export interface Narration {
    id: number;
    text: string;
    mono?: string;
    sub?: string;
    done: boolean; // false = the currently-streaming line
}

interface SessionState {
    stage: Stage;
    errorStage: Stage; // where the error hit, so retry re-enters the right step
    error: string;
    brief: GenerateInput;
    briefLoading: boolean;
    briefFailed: boolean; // the read didn't come back; offer a retry rather than blank fields
    briefDirty: boolean; // edited after planning: the arc no longer matches it
    clarify: string | null; // the expansion's one optional question
    title: string;
    backdrop: string | null;
    beats: Beat[];
    selectedBeat: string | null;
    planning: boolean;
    slots: SectionSlot[];
    activeSection: string | null;
    paused: boolean; // the loop is parked between sections
    steer: string; // applies to every section written from here on
    content: ArtifactContent;
    draftId: string | null;
    spent: number; // credits actually committed this session
    narration: Narration[];
    turnPhase: TurnPhase | null;
}

const emptyBrief = (): GenerateInput => ({ prompt: "", surface: "deck", theme: "studio" });

const clip = (s: string, n: number): string =>
    s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s;

const firstTextOf = (section: Section): string => {
    const visit = (el: ElementInstance | undefined): string => {
        if (!el) return "";
        const d = el.data as { text?: string; children?: ElementInstance[] };
        if (typeof d.text === "string" && d.text.trim()) return d.text.trim();
        for (const k of d.children ?? []) {
            const t = visit(k);
            if (t) return t;
        }
        return "";
    };
    return visit(section.root);
};

const initial = (): SessionState => ({
    stage: "idle",
    errorStage: "idle",
    error: "",
    brief: emptyBrief(),
    briefLoading: false,
    briefFailed: false,
    briefDirty: false,
    clarify: null,
    title: "",
    backdrop: null,
    beats: [],
    selectedBeat: null,
    planning: false,
    slots: [],
    activeSection: null,
    paused: false,
    steer: "",
    content: { format: "deck", theme: "studio", sections: [] },
    draftId: null,
    spent: 0,
    narration: [],
    turnPhase: null,
});

export const [gen, setGen] = createStore<SessionState>(initial());

export const slotSection = (slot: SectionSlot): Section | null =>
    slot.versions[slot.active] ?? null;

export const builtCount = (): number => gen.slots.filter((s) => s.versions.length > 0).length;

export const queuedCount = (): number => gen.slots.filter((s) => s.status === "queued").length;

// a run in flight owns the canvas: editing underneath it can change a beat mid-write
export const runLocked = (): boolean =>
    gen.stage === "building" && !gen.paused && (!!gen.activeSection || queuedCount() > 0);

export const coverage = (): Map<string, string[]> =>
    coverageMap(gen.brief.mustInclude ?? [], gen.beats);

export const remainingBuildCost = (): number => {
    const unbuilt = gen.beats.filter((b) => {
        const slot = gen.slots.find((s) => s.id === b.id);
        return !slot || slot.versions.length === 0;
    });
    return buildCost(unbuilt, gen.brief.imageSource, unitRates());
};
// the preview must quote what the run will actually cost, so it prices the picked models
export const briefCost = (): number => rawBriefCost(unitRates());
export const planCost = (): number => rawPlanCost(unitRates());
export const sectionCost = (): number => rawSectionCost(unitRates());

const controllers = new Set<AbortController>();
let narrId = 0;
let buildRunning = false;

const [generateOpen, setGenerateOpen] = createSignal(false);
export { generateOpen };

// `prompt` seeds the intake, for entry points that already carry an intent (the ⌘K query)
export function openGenerate(prompt?: string): void {
    resetSession();
    // the studio is stamped with the session's theme, so the intake starts in the user's, not the default
    setGen({ stage: "intake", content: { format: "deck", theme: appTheme(), sections: [] } });
    if (prompt) setGen("brief", "prompt", prompt);
    setGenerateOpen(true);
}
export function closeGenerate(): void {
    cancelSession();
    unbindTarget?.();
    unbindTarget = null;
    setGenerateOpen(false);
}
export function cancelSession(): void {
    for (const c of controllers) c.abort();
    controllers.clear();
    buildRunning = false;
}
export function resetSession(): void {
    cancelSession();
    unbindTarget?.(); // the agent goes back to the editor / library
    unbindTarget = null;
    setGen(initial());
}

const track = (): AbortController => {
    const c = new AbortController();
    controllers.add(c);
    return c;
};

const fail = (stage: Stage, message: string, cause?: unknown): void => {
    setGen({ stage: "error", errorStage: stage, error: message });
    reportError(cause ?? new Error(message), message);
};

const isAbort = (e: unknown): boolean =>
    e instanceof DOMException ? e.name === "AbortError" : false;

export function retry(): void {
    const from = gen.errorStage;
    setGen({ stage: from, error: "" });
    if (from === "planning") void startPlan();
    else if (from === "building") {
        setGen({ stage: "building", paused: false });
        void buildLoop();
    }
}

const pushNarration = (text: string, mono?: string, sub?: string): void => {
    narrId += 1;
    setGen("narration", (arr) =>
        arr.map((x) => ({ ...x, done: true })).concat({ id: narrId, text, mono, sub, done: false }),
    );
};

const slotIndex = (id: string): number => gen.slots.findIndex((s) => s.id === id);

function applyOps(ev: Extract<TurnEvent, { type: "patch" }>): void {
    setGen("content", applyPatch(gen.content, ev.ops));
    for (const op of ev.ops) {
        if (op.op === "addSection" || op.op === "replaceSection") {
            const section = op.section;
            const i = slotIndex(section.id);
            if (i < 0) continue;
            setGen(
                "slots",
                i,
                produce((slot) => {
                    slot.versions.push(section);
                    slot.active = slot.versions.length - 1;
                }),
            );
        }
    }
}

const beatFor = (section: Section): Beat => ({
    id: section.id,
    label: clip(firstTextOf(section) || "New section", 30),
    role: "detail",
    layout: "full",
    blocks: ["text"],
});

const landedSlot = (section: Section): SectionSlot => ({
    id: section.id,
    status: "done",
    layout: "full",
    image: false,
    blocks: [],
    versions: [section],
    active: 0,
    working: false,
});

// content is the source of truth, but the rail and canvas are driven by beats + slots, so they move with it
export function applyExternalPatch(patch: Patch): void {
    setGen("content", applyPatch(gen.content, patch));
    for (const op of patch) {
        if (op.op === "addSection") {
            if (gen.beats.some((b) => b.id === op.section.id)) continue;
            const at = op.afterId ? gen.beats.findIndex((b) => b.id === op.afterId) : -1;
            const beats = [...gen.beats];
            beats.splice(at < 0 ? beats.length : at + 1, 0, beatFor(op.section));
            setGen("beats", beats);
            setGen("slots", (s) => [...s, landedSlot(op.section)]);
        } else if (op.op === "replaceSection") {
            const i = slotIndex(op.id);
            if (i < 0) continue;
            setGen(
                "slots",
                i,
                produce((slot) => {
                    slot.versions.push(op.section);
                    slot.active = slot.versions.length - 1;
                    slot.status = "done";
                }),
            );
        } else if (op.op === "removeSection") {
            setGen(
                "beats",
                gen.beats.filter((b) => b.id !== op.id),
            );
            setGen(
                "slots",
                gen.slots.filter((s) => s.id !== op.id),
            );
        } else if (op.op === "moveSection") {
            const from = gen.beats.findIndex((b) => b.id === op.id);
            if (from < 0) continue;
            const beats = [...gen.beats];
            const [b] = beats.splice(from, 1);
            const at = op.afterId ? beats.findIndex((x) => x.id === op.afterId) : -1;
            beats.splice(op.afterId === null ? 0 : at < 0 ? beats.length : at + 1, 0, b!);
            setGen("beats", beats);
        }
    }
    void saveDraft();
}

const isWritten = (id: string): boolean =>
    (gen.slots.find((s) => s.id === id)?.versions.length ?? 0) > 0;

function chatGeneration(): ChatGeneration {
    return {
        stage: gen.stage,
        surface: gen.brief.surface,
        prompt: gen.brief.prompt,
        goal: gen.brief.goal,
        audience: gen.brief.audience,
        tone: gen.brief.tone,
        mustInclude: gen.brief.mustInclude,
        steer: gen.steer.trim() || undefined,
        beats: gen.beats.map((b) => ({
            id: b.id,
            label: b.label,
            role: b.role,
            brief: b.brief,
            takeaway: b.takeaway,
            points: b.points,
            written: isWritten(b.id),
        })),
    };
}

// ids the agent invents for new beats are replaced: the studio owns the "s<N>" scheme, and a slot
// may already exist under a colliding name
export function applyBeatOps(ops: OutlinePatch): void {
    for (const op of ops) {
        if (op.op === "addBeat") {
            const beat = { ...op.beat, id: newBeatId(gen.beats) };
            setGen("beats", insertBeatAfter(gen.beats, op.afterId, beat));
        } else if (op.op === "updateBeat") {
            // the beat changes; a written section's prose doesn't
            setGen("beats", updateBeat(gen.beats, op.id, op.patch));
        } else if (op.op === "removeBeat") {
            if (isWritten(op.id)) continue; // written work is only removed deliberately, by hand
            removeBeatById(op.id);
        } else {
            const at = op.afterId === null ? -1 : gen.beats.findIndex((b) => b.id === op.afterId);
            if (op.afterId !== null && at < 0) continue;
            setGen("beats", reorderBeat(gen.beats, op.id, at + 1));
        }
    }
    markBriefDirty();
}

let unbindTarget: (() => void) | null = null;

// bound for the life of the session, so the dock and the console drive one agent over this draft
function bindStudioToChat(): void {
    unbindTarget?.();
    unbindTarget = bindChatTarget({
        label: "this draft",
        content: () => gen.content,
        apply: (patch) => applyExternalPatch(patch),
        artifactId: () => gen.draftId ?? undefined,
        generation: () => (gen.stage === "idle" ? undefined : chatGeneration()),
        applyBeats: (ops) => applyBeatOps(ops),
        writeBeats: (ids) => void buildSections(ids),
        requestPlan: (req) => void planFromChat(req),
        setSteer: (note) => setSteer(note),
        imageSource: () => gen.brief.imageSource,
        focus: () => {
            const id = gen.selectedBeat;
            if (!id) return undefined;
            const section = gen.content.sections.find((s) => s.id === id);
            return {
                kind: "section",
                sectionId: id,
                headline: section ? firstTextOf(section) || undefined : undefined,
            };
        },
    });
}

// only fills what the user hasn't stated: a reroll must not overwrite something typed on purpose
function absorbRead(read: BriefRead): void {
    const brief = { ...gen.brief };
    if (!brief.goal?.trim() && read.goal) brief.goal = read.goal;
    if (!brief.audience?.trim() && read.audience) brief.audience = read.audience;
    if (!brief.tone?.trim() && read.tone) brief.tone = read.tone;
    if (!brief.mustInclude?.length && read.mustInclude?.length)
        brief.mustInclude = read.mustInclude;
    setGen("brief", brief);
}

function handleEvent(ev: TurnEvent): void {
    switch (ev.type) {
        case "phase":
            setGen("turnPhase", ev.name);
            break;
        case "narration":
            pushNarration(ev.text, ev.mono, ev.sub);
            break;
        case "plan":
            setGen({
                beats: ev.beats,
                title: ev.title ?? "",
                backdrop: ev.backdrop ?? null,
            });
            if (ev.brief) absorbRead(ev.brief);
            break;
        case "section.status": {
            const i = slotIndex(ev.id);
            if (i >= 0) setGen("slots", i, "status", ev.status);
            if (ev.status === "active") setGen("activeSection", ev.id);
            break;
        }
        case "patch":
            applyOps(ev);
            break;
        case "turn.done":
            setGen("narration", (arr) => arr.map((x) => ({ ...x, done: true })));
            break;
        case "error":
            throw new Error(ev.message);
        default:
            break;
    }
}

async function runTurnStream(
    request: Parameters<typeof streamTurn>[0],
    cost: number,
): Promise<void> {
    const controller = track();
    try {
        await streamTurn(request, handleEvent, controller.signal);
        setGen("spent", (n) => n + cost);
    } finally {
        controllers.delete(controller);
        void loadBilling(); // the sidebar's balance follows every turn, settled or aborted
    }
}

export interface SessionStart {
    prompt: string;
    surface: Surface;
    theme: string;
    length?: string;
    imageSource?: "stock" | "ai";
    source?: string; // pasted material to build FROM
    sourceArtifactId?: string; // repurpose an existing library artifact
    contextIds?: string[]; // attached context-library collections
}

export async function startSession(input: SessionStart): Promise<void> {
    cancelSession();
    setGen({
        ...initial(),
        brief: {
            prompt: input.prompt,
            surface: input.surface,
            theme: input.theme,
            length: input.length,
            imageSource: input.imageSource,
            source: input.source,
            sourceArtifactId: input.sourceArtifactId,
            contextIds: input.contextIds?.length ? input.contextIds : undefined,
        },
        content: { format: input.surface, theme: input.theme, sections: [] },
    });
    beginRun(clip(input.prompt, 60));
    bindStudioToChat();
    await startPlan();
}

// the console's plan commission: fold the shaping note into the brief, run the same plan turn
export async function planFromChat(req: { guidance?: string; andWrite?: boolean }): Promise<void> {
    // a replan over written sections would mint beat ids that collide with existing slots
    if (gen.planning || gen.stage === "building" || builtCount() > 0) return;
    const note = req.guidance?.trim();
    if (note)
        setGen("brief", "clarifications", [
            ...(gen.brief.clarifications ?? []),
            `Shaping note — ${note}`,
        ]);
    await startPlan();
    if (req.andWrite && gen.stage === "outline" && gen.beats.length) startBuild();
}

export function setBriefField(
    field: "prompt" | "goal" | "audience" | "tone" | "length",
    value: string,
): void {
    if (field === "prompt") setGen("brief", "prompt", value);
    else setGen("brief", field, value.trim() ? value : undefined);
    markBriefDirty();
}
export function setMustInclude(points: string[]): void {
    setGen("brief", "mustInclude", points.length ? points : undefined);
    markBriefDirty();
}

// an edit after planning means the arc was built against a different brief
function markBriefDirty(): void {
    if (gen.beats.length) setGen("briefDirty", true);
}

// answering has to change the brief: recorded for the planner, and a "yes" also becomes a must-cover point
export function answerClarify(answer: string): void {
    const question = gen.clarify;
    const text = answer.trim();
    if (!question || !text) return;
    setGen("brief", "clarifications", [
        ...(gen.brief.clarifications ?? []),
        `${question} — ${text}`,
    ]);
    if (/^(yes|yep|yeah|sure|please do|do it)\b/i.test(text)) {
        const point = pointFromQuestion(question);
        if (point && !(gen.brief.mustInclude ?? []).includes(point))
            setGen("brief", "mustInclude", [...(gen.brief.mustInclude ?? []), point]);
    }
    setGen("clarify", null);
    markBriefDirty();
}

// a re-read of the same prompt (POST /ai/brief), any time in the session
export async function redraftBrief(): Promise<void> {
    noteStep("brief");
    if (gen.briefLoading) return;
    setGen({ briefLoading: true, briefFailed: false });
    try {
        // hand back the current reading so the model lands somewhere different
        const previous =
            gen.brief.goal && gen.brief.audience && gen.brief.tone
                ? {
                      goal: gen.brief.goal,
                      audience: gen.brief.audience,
                      tone: gen.brief.tone,
                      mustInclude: gen.brief.mustInclude,
                  }
                : undefined;
        const draft = await api.draftBrief(gen.brief.prompt, gen.brief.surface, previous);
        setGen("spent", (n) => n + briefCost());
        if (!draft) setGen("briefFailed", true);
        if (draft)
            setGen("brief", {
                ...gen.brief,
                goal: draft.goal,
                audience: draft.audience,
                tone: draft.tone,
                mustInclude: draft.mustInclude,
            });
        setGen("clarify", draft?.clarify ?? null);
        markBriefDirty();
    } catch (e) {
        setGen("briefFailed", true);
        reportError(e, "Couldn’t read the brief");
    } finally {
        setGen("briefLoading", false);
    }
}

export async function startPlan(): Promise<void> {
    setGen({ stage: "planning", planning: true, clarify: null });
    noteStep("outline");
    try {
        await runTurnStream({ kind: "plan", input: { ...gen.brief } }, planCost());
        if (gen.stage !== "planning") return; // canceled
        setGen({ planning: false, stage: "outline" });
        nameRun(gen.title);
    } catch (e) {
        if (isAbort(e)) return;
        setGen("planning", false);
        fail("planning", "Couldn’t plan the outline", e);
    }
}

export function selectBeat(id: string | null): void {
    setGen("selectedBeat", id);
}
export function patchBeat(id: string, patch: Partial<Beat>): void {
    setGen("beats", updateBeat(gen.beats, id, patch));
}
export function moveBeatDir(id: string, dir: -1 | 1): void {
    setGen("beats", moveBeat(gen.beats, id, dir));
}
export function removeBeatById(id: string): void {
    setGen("beats", removeBeat(gen.beats, id));
    if (gen.selectedBeat === id) setGen("selectedBeat", null);
}
export function addBeatAfter(afterId: string | null): string {
    const beat = makeBeat(newBeatId(gen.beats));
    setGen("beats", insertBeatAfter(gen.beats, afterId, beat));
    setGen("selectedBeat", beat.id);
    return beat.id;
}

const slotFromBeat = (b: Beat): SectionSlot => ({
    id: b.id,
    status: "queued",
    layout: b.layout ?? "full",
    image: b.image ?? false,
    blocks: b.blocks ?? [],
    versions: [],
    active: 0,
    working: false,
});

const outlineForTurn = (): PlanOutline => ({
    title: gen.title,
    backdrop: gen.backdrop ?? undefined,
    beats: gen.beats.map((b) => ({ ...b })),
});

// afterId = the previous beat that actually has a section (skipped beats don't anchor)
const afterIdFor = (index: number): string | null => {
    for (let i = index - 1; i >= 0; i--) {
        const slot = gen.slots.find((s) => s.id === gen.beats[i]!.id);
        if (slot && slot.versions.length > 0) return slot.id;
    }
    return null;
};

// slots mirror the beats; one added after the build starts gets a slot on demand
function ensureSlots(): void {
    const known = new Set(gen.slots.map((s) => s.id));
    const added = gen.beats.filter((b) => !known.has(b.id)).map(slotFromBeat);
    if (added.length) setGen("slots", [...gen.slots, ...added]);
}

export function startBuild(): void {
    if (!gen.beats.length) return;
    setGen({
        stage: "building",
        paused: false,
        slots: gen.beats.map(slotFromBeat),
        selectedBeat: null,
    });
    void buildLoop();
}

// anchors off the nearest built beat before it, so an out-of-order write still lands in place
export async function buildSectionNow(id: string): Promise<void> {
    const index = gen.beats.findIndex((b) => b.id === id);
    if (index < 0 || gen.activeSection) return;
    // picking one before pressing Build starts the session parked, so the queue doesn't run away
    if (gen.stage === "outline") setGen({ stage: "building", paused: true });
    ensureSlots();
    const slot = gen.slots.find((s) => s.id === id);
    if (!slot || slot.versions.length > 0 || slot.working) return;
    try {
        const landed = await buildOne(index);
        if (!landed) requeueInFlight();
        void saveDraft();
    } catch (e) {
        if (!isAbort(e)) {
            requeueInFlight();
            fail("building", "Couldn’t write that section", e);
        }
    } finally {
        // nothing is active between one-off writes; a stale id disables every other card's Write button
        setGen("activeSection", null);
    }
}

// sequential on purpose: each section is written with the ones before it already in the content
export async function buildSections(ids: string[]): Promise<void> {
    for (const id of ids) {
        if (gen.stage === "error" || !generateOpen()) return;
        await buildSectionNow(id);
    }
}

async function buildOne(index: number): Promise<boolean> {
    const beat = gen.beats[index]!;
    noteStep("section");
    const anchor =
        index === 0 ? "cover" : index === gen.beats.length - 1 ? ("closer" as const) : undefined;
    await runTurnStream(
        {
            kind: "build",
            input: {
                brief: { ...gen.brief },
                outline: outlineForTurn(),
                beat: { ...beat },
                content: gen.content,
                afterId: afterIdFor(index),
                steer: gen.steer.trim() || undefined,
                anchor,
            },
        },
        sectionCost(),
    );
    const slot = gen.slots.find((s) => s.id === beat.id);
    return !!slot && slot.versions.length > 0;
}

// a slot caught mid-write goes back to queued, so retry rebuilds it instead of skipping it
function requeueInFlight(): void {
    setGen(
        "slots",
        (s) => s.versions.length === 0 && ["active", "writing", "image"].includes(s.status),
        "status",
        "queued",
    );
}

async function buildLoop(): Promise<void> {
    if (buildRunning) return;
    buildRunning = true;
    try {
        for (;;) {
            if (gen.stage !== "building" || gen.paused) return;
            const index = gen.beats.findIndex((b) => {
                const slot = gen.slots.find((s) => s.id === b.id);
                return slot?.status === "queued";
            });
            if (index < 0) break;
            const landed = await buildOne(index);
            if (!landed) {
                requeueInFlight();
                fail("building", "The section didn’t land — try again.");
                return;
            }
            void saveDraft();
            if (gen.stage !== "building") return; // canceled / errored mid-flight
        }
        finishSession();
    } catch (e) {
        if (!isAbort(e) && gen.stage === "building") {
            requeueInFlight();
            fail("building", "The build stopped", e);
        }
    } finally {
        buildRunning = false;
        // every exit, not just the finished one: pausing returns from the top of the loop, and a
        // stale id here disables resume and every card's Write button
        setGen("activeSection", null);
    }
}

export function pauseBuild(): void {
    // takes effect at the next section boundary; writes are atomic
    if (gen.stage === "building") setGen("paused", true);
}
export function resumeBuild(): void {
    if (gen.stage !== "building") return;
    setGen("paused", false);
    void buildLoop();
}
export function stopHere(): void {
    if (gen.stage !== "building") return;
    setGen("slots", (s) => s.status === "queued", "status", "skipped");
    setGen({ paused: false, activeSection: null });
    finishSession();
}

export function setSteer(text: string): void {
    setGen("steer", text);
}

export function setActiveVersion(id: string, version: number): void {
    const i = slotIndex(id);
    const slot = gen.slots[i];
    const section = slot?.versions[version];
    if (!slot || !section) return;
    setGen("slots", i, "active", version);
    setGen("content", applyPatch(gen.content, [{ op: "replaceSection", id, section }]));
    void saveDraft();
}

// runs alongside the loop, so review happens in the latency shadow
export async function regenerateSection(id: string, note?: string): Promise<boolean> {
    const beat = gen.beats.find((b) => b.id === id);
    const i = slotIndex(id);
    if (!beat || i < 0 || gen.slots[i]!.working) return false;
    const index = gen.beats.findIndex((b) => b.id === id);
    const anchor =
        index === 0 ? "cover" : index === gen.beats.length - 1 ? ("closer" as const) : undefined;
    setGen("slots", i, "working", true);
    try {
        await runTurnStream(
            {
                kind: "build",
                input: {
                    brief: { ...gen.brief },
                    outline: outlineForTurn(),
                    beat: { ...beat },
                    content: gen.content,
                    afterId: null,
                    steer: gen.steer.trim() || undefined,
                    note: note?.trim() || undefined,
                    anchor,
                    replace: true,
                },
            },
            sectionCost(),
        );
        void saveDraft();
        return true;
    } catch (e) {
        reportError(e, "Couldn’t rework that section");
        return false;
    } finally {
        const j = slotIndex(id);
        if (j >= 0) {
            setGen("slots", j, "working", false);
            // a failed rework leaves the kept version standing, not a stuck "writing" state
            if (gen.slots[j]!.versions.length > 0) setGen("slots", j, "status", "done");
        }
    }
}

export function finishSession(): void {
    setGen({ stage: "done", activeSection: null, paused: false });
    void saveGenerated();
}

async function saveDraft(): Promise<void> {
    if (!gen.draftId) return;
    await updateArtifactContent(gen.draftId, gen.content, gen.title || undefined);
}

// the one point a draft becomes a library artifact; until it runs the session lives in memory, so a
// cancelled generation leaves no stub behind

// the durable record of the run, written with the artifact rather than kept only in this browser
function runMeta(): GenMeta {
    const b = gen.brief;
    return {
        at: new Date().toISOString(),
        models: currentRunSteps(),
        prompt: b.prompt,
        surface: b.surface,
        ...(b.length ? { length: b.length } : {}),
        ...(b.imageSource ? { imageSource: b.imageSource } : {}),
        ...(b.goal ? { goal: b.goal } : {}),
        ...(b.audience ? { audience: b.audience } : {}),
        ...(b.tone ? { tone: b.tone } : {}),
        ...(b.mustInclude?.length ? { mustInclude: [...b.mustInclude] } : {}),
        ...(gen.steer.trim() ? { steer: gen.steer.trim() } : {}),
        ...(b.source ? { source: b.source } : {}),
        beats: gen.beats.map((x) => ({ id: x.id, label: x.label, role: x.role })),
    };
}

export async function saveGenerated(formatId?: string): Promise<string | null> {
    const content = formatId ? { ...gen.content, format: formatId } : gen.content;
    if (!content.sections.length) return null;
    if (gen.draftId) {
        await updateArtifactContent(gen.draftId, content, gen.title || undefined, runMeta());
        attachArtifact(gen.draftId);
        return gen.draftId;
    }
    const id = await persistArtifact(content, gen.title || undefined, null, runMeta());
    if (id) {
        setGen("draftId", id);
        attachArtifact(id);
    }
    return id;
}

// gates the discard warning on close
export const hasUnsavedWork = (): boolean => !gen.draftId && gen.content.sections.length > 0;
