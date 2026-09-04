import { CONTRAST_FLOOR, SPARSE_BELOW, diagnoseSection } from "@canvas/render/diagnose";
import { measureText } from "@canvas/render/commands";
import { FIT_FLOOR, profileFor } from "@engine/profile";
import { resolveTheme } from "@themes";
import type { ArtifactContent, Section, ElementInstance } from "@model/artifact";
import type {
    Beat,
    GenerateInput,
    Generation,
    GenerationOp,
    Patch,
    SectionStatus,
    TurnEvent,
    Phase as TurnPhase,
} from "@model/ai";
import { applyPatch, unwrittenBeats } from "@model/ai";
import type { ToolId } from "@model/tools";
import { createSignal } from "solid-js";
import { createStore } from "solid-js/store";
import { ApiError, streamTool } from "@app/api";
import { loadBilling } from "./billing";
import { bindChatTarget, loadThread, setGenerationHost } from "./chat";
import { appTheme } from "./theme";
import { preferredFormat } from "@app/stores/onboarding";
import { reportError } from "./errors";
import { asStudioEntry } from "@model/analytics";
import { capture } from "@ui/analytics";
import { checklistVisible, onboardingNeeded, sinceStart, stepDone } from "./onboarding";
import { attachArtifact, beginRun, nameRun, noteStep, unitPrices } from "./model-usage";
import { loadLibrary } from "./library";
import {
    buildCost,
    coverageMap,
    planCost as rawPlanCost,
    pointFromQuestion,
    sectionCost as rawSectionCost,
} from "./generate-plan";

// The studio's state is a mirror of the generation the server holds. Every control here is a tool
// call, and the mirror moves when the patch the server applied is echoed back, so the board, the
// console and a second tab cannot disagree.

export type Surface = "deck" | "doc" | "web";

// "idle" means no session; "intake" is the composer before a generation exists. The rest are the
// generation's own stages.
export type Stage = "idle" | "intake" | "planning" | "outlined" | "writing" | "done" | "error";

// "failed" and "skipped" are the row's; the live ones ride the stream while a beat is written
export type SlotStatus = SectionStatus | "skipped" | "failed";

export interface SectionSlot {
    id: string;
    status: SlotStatus;
    layout: string;
    image: boolean;
    blocks: string[]; // the block leading each column, in order
    versions: Section[]; // every take kept
    active: number; // index into versions
    working: boolean; // a rework in flight for this slot
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
    generation: Generation | null;
    brief: GenerateInput; // the generation's, or the intake's before one exists
    clarify: string | null; // the planner's one optional question
    title: string;
    backdrop: string | null;
    beats: Beat[];
    selectedBeat: string | null;
    planning: boolean;
    slots: SectionSlot[];
    activeSection: string | null;
    paused: boolean; // a write-all was stopped between sections
    writing: boolean; // a write stream is open
    steer: string; // applies to every section written from here on
    planStreamed: boolean; // this plan's partials have arrived; tells a live stream from a stale board
    // how many planned sections are on the board; null is the resting state and shows every one
    revealed: number | null;
    content: ArtifactContent;
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
    generation: null,
    brief: emptyBrief(),
    clarify: null,
    title: "",
    backdrop: null,
    beats: [],
    selectedBeat: null,
    planning: false,
    slots: [],
    activeSection: null,
    paused: false,
    writing: false,
    steer: "",
    planStreamed: false,
    revealed: null,
    content: { format: "deck", theme: "studio", sections: [] },
    spent: 0,
    narration: [],
    turnPhase: null,
});

export const [gen, setGen] = createStore<SessionState>(initial());

// when the run started, for the events only this side can see (abandoned, failed)
const run = { startedAt: 0 };

const resetRun = (): void => {
    run.startedAt = Date.now();
};

export const slotSection = (slot: SectionSlot): Section | null =>
    slot.versions[slot.active] ?? null;

export const builtCount = (): number => gen.slots.filter((s) => s.versions.length > 0).length;

// beats still to write: queued, or failed and waiting for another press
export const queuedCount = (): number =>
    gen.slots.filter((s) => s.status === "queued" || s.status === "failed").length;

// a run in flight owns the canvas: editing underneath it can change a beat mid-write
export const runLocked = (): boolean => gen.stage === "writing" && gen.writing && !gen.paused;

export const coverage = (): Map<string, string[]> =>
    coverageMap(gen.brief.mustInclude ?? [], gen.beats);

// the outline was planned against an older brief than the one now on the bar
export const briefStale = (): boolean => {
    const g = gen.generation;
    return !!g && !!g.outline && g.plannedAgainst !== null && g.plannedAgainst < g.briefVersion;
};
// the board shows the stale banner; a write pressed anyway is the person's call, not a refusal
const forced = (): { force?: true } => (briefStale() ? { force: true } : {});

export const generationId = (): string | undefined => gen.generation?.id;
export const artifactId = (): string | undefined => gen.generation?.artifactId;

export const remainingBuildCost = (): number => {
    const unbuilt = gen.generation ? unwrittenBeats(gen.generation) : gen.beats;
    return buildCost(unbuilt, gen.brief.imageSource, unitPrices());
};
// the preview must quote what the run will actually cost, so it prices the picked models
export const planCost = (): number => rawPlanCost(unitPrices());
export const sectionCost = (): number => rawSectionCost(unitPrices());

const controllers = new Set<AbortController>();
let writeController: AbortController | null = null;
let narrId = 0;

const [generateOpen, setGenerateOpen] = createSignal(false);
export { generateOpen };

// `prompt` seeds the intake, for entry points that already carry an intent (the ⌘K query)
export function openGenerate(prompt?: string, from = "library"): void {
    resetSession();
    // the studio is stamped with the session's theme, so the intake starts in the user's, not the default
    // the format the first session asked for, so the studio opens on what they said they were making
    setGen({
        stage: "intake",
        content: { format: preferredFormat() ?? "deck", theme: appTheme(), sections: [] },
    });
    if (prompt) setGen("brief", "prompt", prompt);
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

// the studio over a generation that is already running, from the chat dock's card
export function openStudio(): void {
    if (!gen.generation) return;
    setGenerateOpen(true);
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
    // a write in flight lands server-side; the draft is already in the library
    cancelSession();
    unbindTarget?.();
    unbindTarget = null;
    setGenerateOpen(false);
    void loadLibrary();
}
export function cancelSession(): void {
    for (const c of controllers) c.abort();
    controllers.clear();
    writeController = null;
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
    else if (from === "writing") void writeAll();
}

const pushNarration = (text: string, mono?: string, sub?: string): void => {
    narrId += 1;
    setGen("narration", (arr) =>
        arr.map((x) => ({ ...x, done: true })).concat({ id: narrId, text, mono, sub, done: false }),
    );
};

const slotIndex = (id: string): number => gen.slots.findIndex((s) => s.id === id);

const LIVE: readonly SlotStatus[] = ["active", "writing", "image"];

// what the row says about a beat, folded with what the stream is saying about it right now
function slotFor(beat: Beat, g: Generation, live: SectionSlot | undefined): SectionSlot {
    const state = g.beats[beat.id];
    const rowStatus: SlotStatus = state?.status ?? "queued";
    const status: SlotStatus =
        rowStatus === "queued" && live && LIVE.includes(live.status) ? live.status : rowStatus;
    return {
        id: beat.id,
        status,
        layout: beat.layout ?? "full",
        image: beat.image ?? false,
        blocks: beat.blocks ?? [],
        versions: state?.versions ?? [],
        active: state?.active ?? 0,
        working: live?.working ?? false,
        issues: live?.issues ?? [],
        imagesMs: live?.imagesMs,
        // a landed take retires the words-only preview
        preview: state?.versions.length ? undefined : live?.preview,
    };
}

const stageOf = (g: Generation): Stage => (g.stage === "briefed" ? "outlined" : g.stage);

function briefOf(g: Generation): GenerateInput {
    const { set: _set, ...fields } = g.brief;
    void _set;
    return fields;
}

// the studio state a generation implies; the live stream fields survive on their slots
function syncMirror(g: Generation, content?: ArtifactContent): void {
    const beats = g.outline?.beats ?? (gen.planning ? gen.beats : []);
    const slots = beats.map((b) =>
        slotFor(
            b,
            g,
            gen.slots.find((s) => s.id === b.id),
        ),
    );
    setGen({
        generation: g,
        brief: briefOf(g),
        clarify: g.clarify,
        title: g.outline?.title ?? gen.title,
        backdrop: g.outline?.backdrop ?? gen.backdrop,
        beats,
        steer: g.steer,
        slots,
        ...(content ? { content } : {}),
        // a stream in flight owns the stage until it settles; an error stays until retried
        ...(gen.planning || gen.stage === "error" ? {} : { stage: stageOf(g) }),
    });
    if (gen.selectedBeat && !beats.some((b) => b.id === gen.selectedBeat))
        setGen("selectedBeat", null);
}

function applyMirror(patch: Patch): void {
    const next = applyPatch(
        { content: gen.content, generation: gen.generation ?? undefined },
        patch,
    );
    if (next.content && next.content !== gen.content) setGen("content", next.content);
    if (next.generation) syncMirror(next.generation);
    for (const op of patch.artifact ?? []) {
        if (op.op !== "addSection" && op.op !== "replaceSection") continue;
        const i = slotIndex(op.section.id);
        if (i >= 0) setGen("slots", i, "preview", undefined);
        queueMicrotask(() => auditSection(op.section));
    }
}

/**
 * The look-at-what-you-made half the server cannot do: the browser holds the engine, so a landed
 * section is measured the way the reader will see it. Triage bar only: offline eval keeps the
 * strict one, and here a section is flagged when it is visibly broken, not merely imperfect.
 */
function auditSection(section: Section): void {
    const i = slotIndex(section.id);
    if (i < 0 || slotSection(gen.slots[i]!)?.id !== section.id) return;
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
    if (gen.stage !== "planning" && gen.stage !== "outlined") {
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

function ensureSlot(id: string): number {
    const i = slotIndex(id);
    if (i >= 0) return i;
    const beat = gen.beats.find((b) => b.id === id);
    if (!beat) return -1;
    setGen("slots", (s) => [
        ...s,
        {
            id,
            status: "queued",
            layout: beat.layout ?? "full",
            image: beat.image ?? false,
            blocks: beat.blocks ?? [],
            versions: [],
            active: 0,
            working: false,
            issues: [],
        },
    ]);
    return gen.slots.length - 1;
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
            // the patch that follows settles the mirror; this paints the arc a beat early
            setGen({
                beats: ev.beats,
                title: ev.title ?? gen.title,
                backdrop: ev.backdrop ?? gen.backdrop,
            });
            break;
        // the outline streams: paint the board as beats form, so the wait reads as progress. The
        // final patch replaces everything, and the finish handler settles the stage flags.
        case "plan.partial":
            setGen({
                beats: ev.beats,
                planStreamed: true,
                ...(ev.title ? { title: ev.title } : {}),
            });
            startReveal();
            break;
        case "section.timing": {
            const i = ensureSlot(ev.id);
            if (i >= 0) setGen("slots", i, "imagesMs", ev.imagesMs);
            break;
        }
        case "section.partial": {
            const i = ensureSlot(ev.id);
            if (i >= 0) setGen("slots", i, "preview", ev.section);
            break;
        }
        case "section.status": {
            const i = ensureSlot(ev.id);
            if (i >= 0 && ev.status !== "done") setGen("slots", i, "status", ev.status);
            if (ev.status === "active") setGen("activeSection", ev.id);
            if (ev.status === "done" && gen.activeSection === ev.id) setGen("activeSection", null);
            break;
        }
        case "patch":
            applyMirror(ev.patch);
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

// one tool call over the stream; the mirror follows every event, the result comes back to the caller
async function call<R = unknown>(
    tool: ToolId,
    input: Record<string, unknown>,
    cost = 0,
    controller: AbortController = track(),
): Promise<R | undefined> {
    let result: R | undefined;
    const id = gen.generation?.id;
    try {
        await streamTool(
            tool,
            id && !("generationId" in input) ? { generationId: id, ...input } : input,
            (ev) => {
                if (ev.type === "turn.done") result = ev.result as R | undefined;
                handleEvent(ev);
            },
            { signal: controller.signal },
        );
        setGen("spent", (n) => n + cost);
        return result;
    } finally {
        controllers.delete(controller);
        void loadBilling(); // the sidebar's balance follows every call, settled or aborted
    }
}

// the tool the chat console applies a card through, so its calls move this mirror too
export function runGenerationTool(
    tool: ToolId,
    input: Record<string, unknown>,
    cost = 0,
): Promise<unknown> {
    return call(tool, input, cost);
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
    artifactId?: string; // extend an existing artifact instead of opening a draft
}

// opens the generation, then plans it; the same whether the intake or the chat dock asked
export async function startSession(input: SessionStart): Promise<void> {
    cancelSession();
    const { artifactId: target, ...brief } = input;
    // the stage stays on the intake until the server agrees to open the draft, so a refusal
    // at the door (out of credits gates start-generation) is a modal over the familiar form
    // rather than a stranded studio with an orphaned artifact behind it
    setGen({
        ...initial(),
        stage: "intake",
        brief: {
            ...brief,
            contextIds: input.contextIds?.length ? input.contextIds : undefined,
        },
        content: { format: input.surface, theme: input.theme, sections: [] },
    });
    resetRun();
    beginRun(clip(input.prompt, 60));
    try {
        const started = await call<Generation>("start-generation", {
            ...brief,
            ...(target ? { artifactId: target } : {}),
        });
        if (!started) return; // cancelled
        syncMirror(started, {
            format: started.brief.surface,
            theme: started.brief.theme,
            sections: [],
        });
    } catch (e) {
        if (isAbort(e)) return;
        if (e instanceof ApiError && e.status === 402) {
            capture("generation_failed", { stage: "planning", reason: "out of credits" });
            reportError(e, "Couldn’t start the generation");
            return;
        }
        fail("planning", "Couldn’t start the generation", e);
        return;
    }
    bindStudioToChat();
    await startPlan();
}

// a generation started elsewhere (the chat, another tab) becomes this studio's subject
export async function adoptGeneration(id: string): Promise<void> {
    if (gen.generation?.id === id) return;
    cancelSession();
    setGen({ ...initial(), stage: "outlined" });
    resetRun();
    try {
        const view = await call<GenerationView>("read-generation", { generationId: id });
        if (!view) return;
        syncMirror(view.generation, view.content);
        if (view.writing) void settleAfterWrite();
    } catch (e) {
        if (isAbort(e)) return;
        fail("outlined", "Couldn’t open the generation", e);
        return;
    }
    bindStudioToChat();
}

interface GenerationView {
    generation: Generation;
    content: ArtifactContent;
    writing: boolean;
}

let briefTimer: number | undefined;
let briefPending: Partial<GenerateInput> = {};

// typing lands locally at once and reaches the row a beat later, in one call per pause
function reviseBrief(patch: Partial<GenerateInput>): void {
    setGen("brief", (b) => ({ ...b, ...patch }));
    if (!gen.generation) return;
    briefPending = { ...briefPending, ...patch };
    window.clearTimeout(briefTimer);
    briefTimer = window.setTimeout(() => void flushBrief(), 400);
}

async function flushBrief(): Promise<void> {
    const patch = briefPending;
    briefPending = {};
    if (!Object.keys(patch).length || !gen.generation) return;
    noteStep("brief");
    try {
        await call("revise-brief", { ...patch });
    } catch (e) {
        if (!isAbort(e)) reportError(e, "Couldn’t update the brief");
    }
}

export function setBriefField(
    field: "prompt" | "goal" | "audience" | "tone" | "length",
    value: string,
): void {
    reviseBrief({ [field]: field === "prompt" ? value : value.trim() || undefined });
}
export function setMustInclude(points: string[]): void {
    reviseBrief({ mustInclude: points.length ? points : undefined });
}
export function setSurface(surface: Surface): void {
    reviseBrief({ surface });
}
export function setImageSource(imageSource: "stock" | "ai"): void {
    reviseBrief({ imageSource });
}

// answering has to change the brief: recorded for the planner, and a "yes" also becomes a must-cover point
export function answerClarify(answer: string): void {
    const question = gen.clarify;
    const text = answer.trim();
    if (!question || !text) return;
    const patch: Partial<GenerateInput> = {
        clarifications: [...(gen.brief.clarifications ?? []), `${question} · ${text}`],
    };
    if (/^(yes|yep|yeah|sure|please do|do it)\b/i.test(text)) {
        const point = pointFromQuestion(question);
        if (point && !(gen.brief.mustInclude ?? []).includes(point))
            patch.mustInclude = [...(gen.brief.mustInclude ?? []), point];
    }
    setGen("clarify", null);
    reviseBrief(patch);
    window.clearTimeout(briefTimer);
    void flushBrief();
}
export function skipClarify(): void {
    setGen("clarify", null);
    if (gen.generation)
        void call("revise-brief", { clarifications: gen.brief.clarifications ?? [] });
}

export async function startPlan(): Promise<void> {
    if (!gen.generation) return;
    window.clearTimeout(briefTimer);
    await flushBrief();
    stopReveal();
    setGen({
        stage: "planning",
        planning: true,
        clarify: null,
        planStreamed: false,
        revealed: 0,
        beats: [],
        slots: [],
    });
    noteStep("outline");
    try {
        await call("plan-outline", {}, planCost());
        // a close or a reset mid-stream reads as cancellation
        if (gen.stage !== "planning") return;
        setGen({ planning: false });
        if (gen.generation) syncMirror(gen.generation);
        nameRun(gen.title);
    } catch (e) {
        if (isAbort(e)) return;
        setGen("planning", false);
        // credits ran out between the start and the plan: with nothing ever planned, the
        // intake takes the reader back instead of an empty studio behind the paywall modal
        if (e instanceof ApiError && e.status === 402 && !gen.generation?.outline) {
            setGen({ stage: "intake" });
            capture("generation_failed", { stage: "planning", reason: "out of credits" });
            reportError(e, "Couldn’t plan the outline");
            return;
        }
        fail("planning", "Couldn’t plan the outline", e);
    }
}

export function selectBeat(id: string | null): void {
    setGen("selectedBeat", id);
}

interface OutlineOp {
    op: "add" | "update" | "remove" | "move";
    id?: string;
    afterId?: string | null;
    label?: string;
    role?: string;
    brief?: string;
    takeaway?: string;
    points?: string[];
    layout?: string;
    blocks?: string[];
    image?: boolean;
}

async function reviseOutline(
    summary: string,
    ops: OutlineOp[],
): Promise<{ summary: string; ops: GenerationOp[] } | undefined> {
    if (!gen.generation) return undefined;
    try {
        return await call<{ summary: string; ops: GenerationOp[] }>("revise-outline", {
            summary,
            ops,
        });
    } catch (e) {
        if (!isAbort(e)) reportError(e, "Couldn’t change the outline");
        return undefined;
    }
}

export function patchBeat(id: string, patch: Partial<Beat>): void {
    // paint the edit at once; the echo confirms it
    setGen("beats", (beats) => beats.map((b) => (b.id === id ? { ...b, ...patch, id } : b)));
    void reviseOutline(`Edit “${id}”`, [{ op: "update", id, ...patch }]);
}
export function moveBeatDir(id: string, dir: -1 | 1): void {
    const i = gen.beats.findIndex((b) => b.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= gen.beats.length) return;
    // after the beat now at j when moving down; after the one before j when moving up
    const afterId = dir > 0 ? gen.beats[j]!.id : (gen.beats[j - 1]?.id ?? null);
    void reviseOutline(`Move “${id}”`, [{ op: "move", id, afterId }]);
}
export function removeBeatById(id: string): void {
    if (gen.selectedBeat === id) setGen("selectedBeat", null);
    void reviseOutline(`Remove “${id}”`, [{ op: "remove", id }]);
}
export async function addBeatAfter(afterId: string | null): Promise<string | null> {
    const out = await reviseOutline("Add a section", [
        { op: "add", afterId, label: "New section", role: "detail", layout: "full" },
    ]);
    const added = out?.ops.find((o) => o.op === "addBeat");
    const id = added && added.op === "addBeat" ? added.beat.id : null;
    if (id) setGen("selectedBeat", id);
    return id;
}

export function setSteer(text: string): void {
    setGen("steer", text);
    if (!gen.generation) return;
    void call("steer-generation", { note: text }).catch((e: unknown) => {
        if (!isAbort(e)) reportError(e, "Couldn’t set the steering note");
    });
}

// write every unwritten beat, in order, as one stream; a pause closes the stream between beats
async function writeAll(beatIds?: string[]): Promise<void> {
    if (!gen.generation || gen.writing) return;
    stopReveal();
    setGen({ stage: "writing", paused: false, writing: true, selectedBeat: null });
    noteStep("section");
    writeController = track();
    const controller = writeController;
    const before = builtCount();
    try {
        const out = await call<{ written: string[]; failed: string[] }>(
            "write-beats",
            { ...(beatIds?.length ? { beatIds } : {}), ...forced() },
            remainingBuildCost(),
            controller,
        );
        if (out?.failed.length)
            pushNarration(
                out.failed.length === 1
                    ? "One section didn’t come back. Its card is still on the board, ready to write."
                    : `${out.failed.length} sections didn’t come back. Their cards are still on the board, ready to write.`,
            );
        if (gen.stage === "done") finished();
    } catch (e) {
        if (isAbort(e) || controller.signal.aborted) {
            // paused: the beat in flight lands server-side, so the mirror catches up on it
            setGen("paused", true);
            capture("generation_paused", { at_index: before });
            void settleAfterWrite();
        } else fail("writing", "The build stopped", e);
    } finally {
        setGen({ writing: false, activeSection: null });
        if (writeController === controller) writeController = null;
    }
}

// the stream is closed, but the server is still landing the beat it was on: poll until the writer
// lets go, then take the row as it stands
async function settleAfterWrite(): Promise<void> {
    const id = gen.generation?.id;
    if (!id) return;
    for (let i = 0; i < 40; i++) {
        await new Promise((r) => setTimeout(r, i < 4 ? 400 : 1500));
        if (gen.generation?.id !== id) return;
        try {
            const view = await call<GenerationView>("read-generation", { generationId: id });
            if (!view) return;
            syncMirror(view.generation, view.content);
            if (!view.writing) return;
        } catch {
            return;
        }
    }
}

export function startBuild(): void {
    if (!gen.beats.length) return;
    capture("generation_build_started", { mode: "all", beat_count: gen.beats.length });
    void writeAll();
}

// one beat on its own; the run parks so the queue does not run away
export async function buildSectionNow(id: string): Promise<void> {
    if (!gen.generation || gen.writing) return;
    const slot = gen.slots.find((s) => s.id === id);
    if (slot?.versions.length || slot?.working) return;
    if (gen.stage === "outlined")
        capture("generation_build_started", { mode: "one", beat_count: gen.beats.length });
    setGen({ stage: "writing", paused: true, writing: true });
    noteStep("section");
    try {
        await call("write-beat", { beatId: id, ...forced() }, sectionCost());
    } catch (e) {
        if (!isAbort(e)) {
            setGen("slots", (s) => s.id === id, "status", "failed");
            reportError(e, "Couldn’t write that section");
        }
    } finally {
        setGen({ writing: false, activeSection: null });
        if (gen.generation?.stage === "done") finished();
    }
}

// the console's "write these": the same stream write-all uses, over the named beats
export async function buildSections(ids: string[]): Promise<void> {
    if (!ids.length) return;
    await writeAll(ids);
}

export function pauseBuild(): void {
    // takes effect at the next section boundary; the beat in flight lands
    if (!writeController) return;
    writeController.abort();
}
export function resumeBuild(): void {
    if (gen.stage !== "writing" || gen.writing) return;
    void writeAll();
}
// finishing takes the writer lease, so the beat in flight has to land before the run can close
export async function stopHere(): Promise<void> {
    if (!gen.generation || gen.stage === "done") return;
    if (writeController) {
        writeController.abort();
        await settleAfterWrite();
    }
    try {
        await call("finish-generation", {});
        finished();
    } catch (e) {
        if (!isAbort(e)) reportError(e, "Couldn’t finish the generation");
    }
}

export async function setActiveVersion(id: string, version: number): Promise<void> {
    const slot = gen.slots.find((s) => s.id === id);
    if (!slot?.versions[version]) return;
    try {
        await call("pick-version", { beatId: id, index: version });
    } catch (e) {
        if (!isAbort(e)) reportError(e, "Couldn’t pick that take");
    }
}

// runs alongside a write; the slot shows its own progress
export async function regenerateSection(id: string, note?: string): Promise<boolean> {
    const i = slotIndex(id);
    if (!gen.generation || i < 0 || gen.slots[i]!.working) return false;
    setGen("slots", i, "working", true);
    try {
        await call(
            "write-beat",
            { beatId: id, replace: true, note: note?.trim() || undefined, ...forced() },
            sectionCost(),
        );
        return true;
    } catch (e) {
        if (!isAbort(e)) reportError(e, "Couldn’t rework that section");
        return false;
    } finally {
        const j = slotIndex(id);
        if (j >= 0) setGen("slots", j, "working", false);
    }
}

function finished(): void {
    setGen({ stage: "done", activeSection: null, paused: false });
    if (checklistVisible() && !stepDone("ai"))
        capture("onboarding_first_generation_completed", {
            format: gen.brief.surface,
            section_count: builtCount(),
            credits_charged: gen.spent,
            ...(sinceStart() === undefined ? {} : { ms_since_signup: sinceStart()! }),
        });
    if (gen.generation) attachArtifact(gen.generation.artifactId);
    void loadLibrary();
}

// the piece is already in the library; this closes the run and, when asked, moves its format
export async function saveGenerated(formatId?: string): Promise<string | null> {
    const g = gen.generation;
    if (!g) return null;
    if (formatId && formatId !== gen.content.format)
        await call("apply-patch", { patch: { artifact: [{ op: "setMeta", format: formatId }] } });
    if (gen.stage !== "done") {
        if (writeController) writeController.abort();
        await call("finish-generation", {});
        finished();
    }
    return g.artifactId;
}

let unbindTarget: (() => void) | null = null;

// bound for the life of the session, so the dock and the console drive one agent over this draft;
// the thread for this generation comes with it
function bindStudioToChat(): void {
    unbindTarget?.();
    unbindTarget = bindChatTarget({
        label: "this draft",
        content: () => gen.content,
        artifactId: () => gen.generation?.artifactId,
        generationId: () => gen.generation?.id,
        apply: (patch) => call("apply-patch", { patch }).then(() => undefined),
        run: (tool, input, cost) => call(tool, input, cost),
        mirror: (patch) => applyMirror(patch),
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
    void loadThread();
}

// the chat dock starts and adopts generations through this, since it cannot import the store
setGenerationHost({
    start: (input) => startSession(input),
    adopt: (id) => adoptGeneration(id),
    active: () => gen.generation?.id,
    open: openStudio,
});
