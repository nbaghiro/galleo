import { childrenOf } from "@elements/ops";
import { CONTRAST_FLOOR, SPARSE_BELOW, diagnoseSection } from "@canvas/render/diagnose";
import { measureText } from "@canvas/render/commands";
import { FIT_FLOOR, profileFor } from "@engine/profile";
import { resolveTheme } from "@themes";
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
import { api, setTraceSession, streamTurn } from "@app/api";
import { loadBilling } from "./billing";
import { bindChatTarget, resetThread } from "./chat";
import { appTheme } from "./theme";
import { preferredFormat } from "@app/stores/onboarding";
import { reportError } from "./errors";
import { asBeatRole, asStudioEntry } from "@model/analytics";
import { capture } from "@ui/analytics";
import { checklistVisible, onboardingNeeded, sinceStart, stepDone } from "./onboarding";
import {
    attachArtifact,
    beginRun,
    currentRunSteps,
    nameRun,
    noteStep,
    unitPrices,
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
    withDerivedBlocks,
} from "./generate-plan";

export type Surface = "deck" | "doc" | "web";

// "idle" means no session.
export type Stage = "idle" | "intake" | "planning" | "outline" | "building" | "done" | "error";

// "failed" is the studio's own, not the server's: it marks a beat the build could not land
// and carried on past, so the card falls back to its outline form with Write still on it.
export type SlotStatus = SectionStatus | "skipped" | "failed";

export interface SectionSlot {
    id: string;
    status: SlotStatus;
    layout: string;
    image: boolean;
    blocks: string[]; // the block leading each column, in order
    versions: Section[]; // every take kept
    active: number; // index into versions
    working: boolean; // a regeneration in flight for this slot
    issues: string[]; // measured layout problems on the active take; empty = clean
    imagesMs?: number; // how long this section's image resolution took, server-measured
    preview?: Section; // the build's live partial paint; cleared the moment a real take lands
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
    planStreamed: boolean; // this plan's partials have arrived; tells a live stream from a stale board
    // how many planned sections are on the board; null is the resting state and shows every one
    revealed: number | null;
    content: ArtifactContent;
    draftId: string | null;
    spent: number; // credits actually committed this session
    narration: Narration[];
    turnPhase: TurnPhase | null;
}

const emptyBrief = (): GenerateInput => ({ prompt: "", surface: "deck", theme: "studio" });

// Asked of the registry rather than read off `data.children`: a grid keeps cells and a diagram keeps
// nodes, so the raw walk would undercount exactly the sections that have the most in them.
const countElements = (el: ElementInstance | undefined): number =>
    el ? 1 + (childrenOf(el) ?? []).reduce((n, k) => n + countElements(k), 0) : 0;

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
    planStreamed: false,
    revealed: null,
    content: { format: "deck", theme: "studio", sections: [] },
    draftId: null,
    spent: 0,
    narration: [],
    turnPhase: null,
});

export const [gen, setGen] = createStore<SessionState>(initial());

// What the funnel needs that the session state does not otherwise keep: when the run started, and
// the shape it took. Credits here are the client's own committed estimate, which is what the user
// was shown; the authoritative charge rides ai_action_completed from the server.
const run = {
    startedAt: 0,
    planStartedAt: 0,
    firstBeatAt: 0,
    steers: 0,
    paused: false,
    outlineEdited: false,
};

const resetRun = (): void => {
    run.startedAt = Date.now();
    run.planStartedAt = 0;
    run.steers = 0;
    run.paused = false;
    run.outlineEdited = false;
};

const outlineEdited = (edit: "rename" | "reorder" | "add" | "remove"): void => {
    run.outlineEdited = true;
    capture("generation_outline_edited", { edit, beat_count: gen.beats.length });
};

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
    return buildCost(unbuilt, gen.brief.imageSource, unitPrices());
};
// the preview must quote what the run will actually cost, so it prices the picked models
export const briefCost = (): number => rawBriefCost(unitPrices());
export const planCost = (): number => rawPlanCost(unitPrices());
export const sectionCost = (): number => rawSectionCost(unitPrices());

const controllers = new Set<AbortController>();
let narrId = 0;
let buildRunning = false;

const [generateOpen, setGenerateOpen] = createSignal(false);
export { generateOpen };

// `prompt` seeds the intake, for entry points that already carry an intent (the ⌘K query)
export function openGenerate(prompt?: string, from = "library"): void {
    resetSession();
    // The console is the one chat thread, so without this a new run opens holding the last one:
    // the library's conversation, or the previous generation's, neither of which is about this
    // piece. It aborts an in-flight turn too, which is the right end for a run being abandoned.
    resetThread();
    // the studio is stamped with the session's theme, so the intake starts in the user's, not the default
    // the format the first session asked for, so the studio opens on what they said they were making
    setGen({
        stage: "intake",
        content: { format: preferredFormat() ?? "deck", theme: appTheme(), sections: [] },
    });
    if (prompt) setGen("brief", "prompt", prompt);
    setTraceSession(crypto.randomUUID());
    setGenerateOpen(true);
    resetRun();
    capture("generation_intake_opened", {
        from,
        format: preferredFormat() ?? "deck",
        prefilled: !!prompt,
    });
    if (checklistVisible() || onboardingNeeded())
        capture("onboarding_studio_opened", { from: asStudioEntry(from) });
}
export function closeGenerate(): void {
    stopReveal();
    // The most important event in this funnel: one that records only successes cannot show where
    // we lose people. Read before the teardown, which resets the stage.
    if (gen.stage !== "idle" && gen.stage !== "done")
        capture("generation_abandoned", {
            stage: gen.stage,
            sections_built: builtCount(),
            ms: Date.now() - run.startedAt,
        });
    setTraceSession(null);
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
    stopReveal();
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
    capture("generation_failed", { stage, reason: message });
    // no synthetic cause: describeError would print it back as “what came back”, and a
    // modal quoting its own title tells nobody anything
    reportError(cause, message);
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
                    slot.preview = undefined;
                }),
            );
            queueMicrotask(() => auditSection(section));
        }
    }
}

/**
 * The look-at-what-you-made half the server cannot do: the browser holds the engine, so a landed
 * section is measured the way the reader will see it. Triage bar only: offline eval keeps the
 * strict one, and here a section is flagged when it is visibly broken, not merely imperfect.
 */
function auditSection(section: Section): void {
    const i = slotIndex(section.id);
    if (i < 0 || gen.slots[i]!.versions[gen.slots[i]!.active]?.id !== section.id) return;
    try {
        auditNow(section, i);
    } catch {
        // no measurement, no flag: a diagnostics failure must never break a generation
    }
}

function auditNow(section: Section, i: number): void {
    const profile = profileFor(gen.content);
    const width =
        typeof profile.width === "number" ? profile.width : (profile.maxContentWidth ?? 1180);
    const theme = resolveTheme(gen.content.theme ?? gen.brief.theme).tokens;
    const fit = diagnoseSection(section, width, measureText, theme, profile);
    const issues: string[] = [];
    if (fit.overflow > 0 && fit.fitScale <= FIT_FLOOR + 0.001)
        issues.push(
            `spills ${Math.round(fit.overflow)}px past the slide even at the smallest type; fewer words or fewer blocks`,
        );
    if (fit.minContrast !== null && fit.minContrast < CONTRAST_FLOOR)
        issues.push(
            `text contrast ${fit.minContrast.toFixed(1)}:1, under the ${CONTRAST_FLOOR}:1 floor; a darker scrim or a lighter tone`,
        );
    if (fit.fill !== null && fit.fill < SPARSE_BELOW)
        issues.push(
            `fills only ${Math.round(fit.fill * 100)}% of the slide; the idea needs more substance or a fuller layout`,
        );
    setGen("slots", i, "issues", issues);
    if (issues.length)
        capture("generation_section_flagged", {
            format: gen.brief.surface,
            overflow: fit.overflow > 0 && fit.fitScale <= FIT_FLOOR + 0.001,
            contrast: fit.minContrast !== null && fit.minContrast < CONTRAST_FLOOR,
            sparse: fit.fill !== null && fit.fill < SPARSE_BELOW,
        });
}

/** One click on the flag: the measured problems become the rework note, verbatim. */
export function fixSection(id: string): Promise<boolean> {
    const slot = gen.slots.find((sl) => sl.id === id);
    if (!slot?.issues.length) return Promise.resolve(false);
    return regenerateSection(
        id,
        `Measured on the painted section: ${slot.issues.join("; ")}. Rewrite this section to fix that while keeping its idea and voice.`,
    );
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
    issues: [],
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
            const beat = {
                ...op.beat,
                ...withDerivedBlocks(op.beat, op.beat.blocks),
                id: newBeatId(gen.beats),
            };
            setGen("beats", insertBeatAfter(gen.beats, op.afterId, beat));
        } else if (op.op === "updateBeat") {
            // the beat changes; a written section's prose doesn't
            const prev = gen.beats.find((b) => b.id === op.id)?.blocks;
            setGen("beats", updateBeat(gen.beats, op.id, withDerivedBlocks(op.patch, prev)));
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

// ---- the outline's pace -----------------------------------------------------------------------

// The plan streams in the model's chunks, which is not a rhythm anyone wants to watch. The board
// takes one section at a time instead, and never runs past what has actually been planned: how many
// sections a piece needs is the planner's call, so the board only ever shows what it has.

const REVEAL_STEP_MS = 190; // one section at a time while the plan is still coming
const REVEAL_DRAIN_MS = 90; // once it has landed, the rest catch up rather than being waited on

/**
 * The next section to put on the board and how long to hold before the one after it. `null` ends
 * the reveal, the state where every planned beat is shown. Pure, so the pacing is testable.
 */
export function nextReveal(
    at: number,
    planned: number,
    streaming: boolean,
): { at: number; wait: number } | null {
    if (at >= planned) return streaming ? { at, wait: REVEAL_STEP_MS } : null;
    return { at: at + 1, wait: streaming ? REVEAL_STEP_MS : REVEAL_DRAIN_MS };
}

const prefersStill = (): boolean =>
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

let revealTimer: number | undefined;

function stopReveal(): void {
    window.clearTimeout(revealTimer);
    revealTimer = undefined;
    if (gen.revealed !== null) setGen("revealed", null);
}

function tickReveal(): void {
    revealTimer = undefined;
    const at = gen.revealed;
    if (at === null) return;
    if (gen.stage !== "planning" && gen.stage !== "outline") {
        stopReveal();
        return;
    }
    const step = nextReveal(at, gen.beats.length, gen.planning);
    if (!step) {
        stopReveal();
        return;
    }
    if (step.at !== at) setGen("revealed", step.at);
    revealTimer = window.setTimeout(tickReveal, step.wait);
}

function startReveal(): void {
    if (revealTimer !== undefined || prefersStill()) return;
    revealTimer = window.setTimeout(tickReveal, 0);
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
        // the outline streams: paint the board as beats form, so the wait reads as progress. The
        // final "plan" event replaces everything, and the finish handler settles the stage flags.
        case "plan.partial":
            if (!run.firstBeatAt && ev.beats.length) run.firstBeatAt = Date.now();
            setGen({
                beats: ev.beats,
                planStreamed: true,
                ...(ev.title ? { title: ev.title } : {}),
            });
            if (gen.stage === "planning") setGen("stage", "outline");
            startReveal();
            break;
        case "section.timing": {
            const i = slotIndex(ev.id);
            if (i >= 0) setGen("slots", i, "imagesMs", ev.imagesMs);
            break;
        }
        case "section.partial": {
            const i = slotIndex(ev.id);
            if (i >= 0) setGen("slots", i, "preview", ev.section);
            break;
        }
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
    shapeTemplateId?: string; // a starter whose section shapes the outline follows
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
            shapeTemplateId: input.shapeTemplateId,
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
            `Shaping note: ${note}`,
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
        `${question} · ${text}`,
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
    stopReveal();
    setGen({
        stage: "planning",
        planning: true,
        clarify: null,
        planStreamed: false,
        revealed: 0,
        beats: [],
    });
    noteStep("outline");
    run.planStartedAt = Date.now();
    run.firstBeatAt = 0;
    try {
        await runTurnStream({ kind: "plan", input: { ...gen.brief } }, planCost());
        // the stream's own partials flip the stage to "outline" early, so only a stage neither of
        // them produces (a close, a reset) reads as cancellation
        if (gen.stage !== "planning" && gen.stage !== "outline") return; // canceled
        setGen({ planning: false, stage: "outline" });
        capture("generation_planned", {
            format: gen.brief.surface,
            length: gen.brief.length ?? "Standard",
            beat_count: gen.beats.length,
            ms: Date.now() - run.planStartedAt,
            ...(run.firstBeatAt ? { first_beat_ms: run.firstBeatAt - run.planStartedAt } : {}),
            credits_charged: planCost(),
            ...(gen.brief.shapeTemplateId ? { shape_template_id: gen.brief.shapeTemplateId } : {}),
        });
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
    if (patch.label !== undefined) outlineEdited("rename");
}
export function moveBeatDir(id: string, dir: -1 | 1): void {
    setGen("beats", moveBeat(gen.beats, id, dir));
    outlineEdited("reorder");
}
export function removeBeatById(id: string): void {
    setGen("beats", removeBeat(gen.beats, id));
    if (gen.selectedBeat === id) setGen("selectedBeat", null);
    outlineEdited("remove");
}
export function addBeatAfter(afterId: string | null): string {
    const beat = makeBeat(newBeatId(gen.beats));
    setGen("beats", insertBeatAfter(gen.beats, afterId, beat));
    setGen("selectedBeat", beat.id);
    outlineEdited("add");
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
    issues: [],
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

// Slots mirror the beats: one added after the build starts gets a slot on demand, and one whose
// beat has since changed shape follows it. Only the shape is copied. `status`, `versions`, `active`
// and `working` belong to the slot, and rebuilding those would throw away written sections.
function ensureSlots(): void {
    const known = new Set(gen.slots.map((s) => s.id));
    const added = gen.beats.filter((b) => !known.has(b.id)).map(slotFromBeat);
    if (added.length) setGen("slots", [...gen.slots, ...added]);
    for (const b of gen.beats) {
        const i = gen.slots.findIndex((s) => s.id === b.id);
        if (i < 0) continue;
        const shape = slotFromBeat(b);
        const slot = gen.slots[i]!;
        if (slot.layout !== shape.layout) setGen("slots", i, "layout", shape.layout);
        if (slot.image !== shape.image) setGen("slots", i, "image", shape.image);
        if (slot.blocks.join("|") !== shape.blocks.join("|"))
            setGen("slots", i, "blocks", shape.blocks);
    }
}

export function startBuild(): void {
    if (!gen.beats.length) return;
    stopReveal(); // every planned section is on the board once one is being written
    capture("generation_build_started", { mode: "all", beat_count: gen.beats.length });
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
    if (gen.stage === "outline") {
        capture("generation_build_started", { mode: "one", beat_count: gen.beats.length });
        setGen({ stage: "building", paused: true });
    }
    ensureSlots();
    const slot = gen.slots.find((s) => s.id === id);
    if (!slot || slot.versions.length > 0 || slot.working) return;
    try {
        // the same retry the loop gets, and the same landing when it runs out: a click that fails
        // marks its own card and leaves the board alone, rather than putting the studio in the
        // error stage, which is what took the Write button off every card that had not been written
        if (await buildWithRetry(index)) void saveDraft();
        else markFailed(index);
    } catch (e) {
        if (!isAbort(e)) markFailed(index);
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
    const startedAt = Date.now();
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
    const landed = !!slot && slot.versions.length > 0;
    if (landed) {
        const section = slotSection(slot);
        capture("generation_section_built", {
            index,
            ms: Date.now() - startedAt,
            ...(slot.imagesMs !== undefined ? { images_ms: slot.imagesMs } : {}),
            credits_charged: sectionCost(),
            element_count: section ? countElements(section.root) : 0,
            ...(asBeatRole(beat.role) ? { beat_role: asBeatRole(beat.role) } : {}),
        });
    }
    return landed;
}

// a slot caught mid-write goes back to queued, so retry rebuilds it instead of skipping it
function requeueInFlight(): void {
    setGen(
        "slots",
        (s) => s.versions.length === 0 && ["active", "writing", "image"].includes(s.status),
        produce((s: SectionSlot) => {
            s.status = "queued";
            s.preview = undefined; // a half-painted preview must not outlive its run
        }),
    );
}

// the reason the last beat gave up, so a run that lands short can say more than that it did
let reportedFailure: unknown = null;

const missedNote = (n: number): string =>
    n === 1
        ? "One section didn’t come back. Its card is still on the board, ready to write."
        : `${n} sections didn’t come back. Their cards are still on the board, ready to write.`;

const reasonOf = (e: unknown): string | undefined =>
    e instanceof Error && e.message ? clip(e.message, 90) : undefined;

// One beat, with the retry the server cannot do for us: a turn that dies mid-stream takes its
// generator with it, so the second go has to be a second turn. Past that the beat is the problem
// rather than the weather, and the build is better off carrying on without it.
async function buildWithRetry(index: number): Promise<boolean> {
    const beat = gen.beats[index]!;
    for (let attempt = 0; attempt < 2; attempt++) {
        if (attempt > 0) pushNarration(`Retrying “${beat.label}”`);
        try {
            if (await buildOne(index)) return true;
        } catch (e) {
            if (isAbort(e)) throw e;
            reportedFailure = e; // kept for the notice, since nothing else sees the reason
        }
        // paused or closed between the tries: not a failure, and not ours to retry through
        if (gen.stage !== "building" || gen.paused) return false;
    }
    return false;
}

function markFailed(index: number): void {
    const beat = gen.beats[index]!;
    setGen("slots", (s) => s.id === beat.id, "status", "failed");
    capture("generation_section_failed", {
        index,
        attempts: 2,
        ...(asBeatRole(beat.role) ? { beat_role: asBeatRole(beat.role) } : {}),
    });
}

async function buildLoop(): Promise<void> {
    if (buildRunning) return;
    buildRunning = true;
    let failed = 0;
    reportedFailure = null;
    try {
        for (;;) {
            if (gen.stage !== "building" || gen.paused) return;
            const index = gen.beats.findIndex((b) => {
                const slot = gen.slots.find((s) => s.id === b.id);
                return slot?.status === "queued";
            });
            if (index < 0) break;
            if (!(await buildWithRetry(index))) {
                if (gen.stage !== "building" || gen.paused) return; // cancelled or parked mid-try
                // One beat that will not come back is not a reason to abandon the other eleven.
                // It keeps its outline card and its Write button, which is the retry that works.
                markFailed(index);
                failed += 1;
                continue;
            }
            void saveDraft();
            if (gen.stage !== "building") return; // canceled / errored mid-flight
        }
        if (failed) pushNarration(missedNote(failed), undefined, reasonOf(reportedFailure));
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
    if (gen.stage !== "building") return;
    setGen("paused", true);
    run.paused = true;
    capture("generation_paused", { at_index: builtCount() });
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
    const had = gen.steer.trim();
    setGen("steer", text);
    if (text.trim() && text.trim() !== had) {
        run.steers += 1;
        capture("generation_steered", {
            at_index: builtCount(),
            beat_count: gen.beats.length,
        });
    }
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
    if (checklistVisible() && !stepDone("ai"))
        capture("onboarding_first_generation_completed", {
            format: gen.brief.surface,
            section_count: builtCount(),
            credits_charged: gen.spent,
            ...(sinceStart() === undefined ? {} : { ms_since_signup: sinceStart()! }),
        });
    capture("generation_completed", {
        format: gen.brief.surface,
        section_count: builtCount(),
        total_credits: gen.spent,
        total_ms: Date.now() - run.startedAt,
        steer_count: run.steers,
        was_paused: run.paused,
        outline_edited: run.outlineEdited,
    });
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
    if (id) capture("artifact_created", { source: "generated", format: gen.brief.surface });
    if (id) {
        setGen("draftId", id);
        attachArtifact(id);
    }
    return id;
}

// gates the discard warning on close
export const hasUnsavedWork = (): boolean => !gen.draftId && gen.content.sections.length > 0;
