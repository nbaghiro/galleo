import type { ArtifactContent, Section } from "@model/artifact";
import type { TurnEvent, Beat as PlanBeat, GenerateInput, Phase as TurnPhase } from "@model/ai";
import { createSignal } from "solid-js";
import { createStore } from "solid-js/store";
import { applyPatch } from "@model/ai";
import { streamTurn } from "../api";
import { persistArtifact } from "./library";

// The generation session — a reactive store the generate modal subscribes to. `startRealSession` runs a
// generate turn (POST /ai/turn) and streams the backend's TurnEvents through `dispatch`, so the modal
// fills in section by section. "Open in editor" persists the result and navigates to it.

export type Surface = "deck" | "doc" | "web";

export interface Brief {
    prompt: string;
    surface: Surface;
    theme: string;
    goal: string;
    audience: string;
    tone: string;
    length: string;
}

export type SectionStatus = "queued" | "active" | "writing" | "image" | "done";
export type BeatStatus = "upcoming" | "active" | "done";
export type Phase = "idle" | "building" | "done" | "error";

export interface Beat {
    id: string;
    label: string;
    role: string;
    status: BeatStatus;
}
export interface SectionSlot {
    id: string;
    status: SectionStatus;
    layout: string; // the planned layout preset — drives the skeleton shape before content lands
    image: boolean; // whether this beat carries an image
    blocks: string[]; // the block leading each column, in order — the exact planned layout
    section: Section | null; // populated when its content patch lands
}
export interface Narration {
    id: number;
    text: string;
    mono?: string; // a technical token rendered in mono
    sub?: string; // a follow-up line
    done: boolean; // false = the currently-streaming line
}

interface SessionState {
    phase: Phase;
    turnPhase: TurnPhase | null; // the backend's fine-grained phase (intake → outline → build → done)
    brief: Brief | null;
    theme: string;
    format: string;
    beats: Beat[];
    sections: SectionSlot[];
    narration: Narration[];
    activeSection: string | null;
    finalContent: ArtifactContent | null;
    error: string;
}

const initial: SessionState = {
    phase: "idle",
    turnPhase: null,
    brief: null,
    theme: "studio",
    format: "deck",
    beats: [],
    sections: [],
    narration: [],
    activeSection: null,
    finalContent: null,
    error: "",
};

export const [gen, setGen] = createStore<SessionState>({ ...initial });

export const placedSections = (): Section[] =>
    gen.sections.filter((s) => s.status === "done" && s.section).map((s) => s.section as Section);

export const doneBeats = (): number => gen.beats.filter((b) => b.status === "done").length;

export const activeStatus = (): SectionStatus | null => {
    const a = gen.sections.find((s) => s.id === gen.activeSection);
    return a ? a.status : null;
};

// ---------- store helpers ----------

const clip = (s: string, n: number): string =>
    s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s;

let narrId = 0;
const pushNarration = (text: string, mono?: string): void => {
    narrId += 1;
    setGen("narration", (arr) =>
        arr.map((x) => ({ ...x, done: true })).concat({ id: narrId, text, mono, done: false }),
    );
};
const narrSub = (sub: string): void => {
    if (gen.narration.length) setGen("narration", gen.narration.length - 1, "sub", sub);
};
const markBeat = (id: string, status: BeatStatus): void =>
    setGen("beats", (b) => b.id === id, "status", status);
const setStatus = (i: number, status: SectionStatus): void =>
    setGen("sections", i, "status", status);

// ---------- open state (the generate modal, mounted once in the app shell) ----------

let abort: AbortController | null = null;

const [generateOpen, setGenerateOpen] = createSignal(false);
export { generateOpen };

export function openGenerate(): void {
    resetSession();
    setGenerateOpen(true);
}
export function closeGenerate(): void {
    cancelSession();
    setGenerateOpen(false);
}

export function cancelSession(): void {
    abort?.abort();
    abort = null;
}
export function resetSession(): void {
    cancelSession();
    setGen({ ...initial, beats: [], sections: [], narration: [] });
}

// Apply one TurnEvent to the store; returns the accumulating artifact content.
function dispatch(ev: TurnEvent, content: ArtifactContent): ArtifactContent {
    switch (ev.type) {
        case "plan":
            setGen({
                beats: ev.beats.map((b: PlanBeat) => ({
                    id: b.id,
                    label: clip(b.label, 30),
                    role: b.role,
                    status: "upcoming" as BeatStatus,
                })),
                sections: ev.beats.map((b: PlanBeat) => ({
                    id: b.id,
                    status: "queued" as SectionStatus,
                    layout: b.layout ?? "full",
                    image: b.image ?? false,
                    blocks: b.blocks ?? [],
                    section: null,
                })),
            });
            break;
        case "section.status": {
            const i = gen.sections.findIndex((s) => s.id === ev.id);
            if (i >= 0) setStatus(i, ev.status);
            markBeat(ev.id, ev.status === "done" ? "done" : "active");
            if (ev.status === "active") setGen("activeSection", ev.id);
            break;
        }
        case "phase":
            setGen("turnPhase", ev.name);
            break;
        case "narration":
            pushNarration(ev.text, ev.mono);
            if (ev.sub) narrSub(ev.sub);
            break;
        case "patch": {
            content = applyPatch(content, ev.ops);
            for (const op of ev.ops) {
                if (op.op === "addSection") {
                    const i = gen.sections.findIndex((s) => s.id === op.section.id);
                    if (i >= 0) setGen("sections", i, "section", op.section);
                }
            }
            setGen("finalContent", content);
            break;
        }
        case "turn.done":
            setGen("narration", (arr) => arr.map((x) => ({ ...x, done: true })));
            setGen({ phase: "done", finalContent: content, activeSection: null });
            break;
        case "error":
            setGen({ phase: "error", error: ev.message });
            break;
    }
    return content;
}

// Real generation: run a `generate` turn and stream the backend's TurnEvents (POST /ai/turn) into
// `dispatch`, accumulating the artifact in `finalContent`. saveGenerated then persists it.
export async function startRealSession(input: GenerateInput): Promise<void> {
    resetSession();
    const controller = new AbortController();
    abort = controller;
    setGen({
        phase: "building",
        brief: {
            prompt: input.prompt,
            surface: input.surface,
            theme: input.theme,
            goal: input.goal ?? "",
            audience: input.audience ?? "",
            tone: input.tone ?? "",
            length: input.length ?? "",
        },
        theme: input.theme,
        format: input.surface,
        error: "",
    });
    let content: ArtifactContent = { format: input.surface, theme: input.theme, sections: [] };
    try {
        await streamTurn(
            { kind: "generate", input },
            (ev) => {
                content = dispatch(ev, content);
            },
            controller.signal,
        );
    } catch (e) {
        if (controller.signal.aborted) return;
        setGen({ phase: "error", error: e instanceof Error ? e.message : "Generation failed." });
    }
}

// "Open" persists the streamed artifact as a fresh library artifact and returns its id to navigate to. An
// optional `formatId` overrides the surface (the modal passes the currently-previewed format, so opening
// honors the live preview switcher) — the content is surface-agnostic, so it renders correctly either way.
// Persistence goes through the shared library helper — the same single create path the in-chat draft uses.
export async function saveGenerated(formatId?: string): Promise<string | null> {
    const base = gen.finalContent;
    if (!base) return null;
    const content = formatId ? { ...base, format: formatId } : base;
    return persistArtifact(content);
}
