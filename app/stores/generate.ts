import type { ArtifactContent, Section } from "@model/artifact";
import type { TurnEvent, Beat as PlanBeat, GenerateInput, Phase as TurnPhase } from "@model/ai";
import { createSignal } from "solid-js";
import { createStore } from "solid-js/store";
import { applyPatch } from "@model/ai";
import { streamTurn } from "../api";
import { persistArtifact } from "./library";

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
    layout: string;
    image: boolean;
    blocks: string[]; // the block leading each column, in order
    section: Section | null;
}
export interface Narration {
    id: number;
    text: string;
    mono?: string;
    sub?: string;
    done: boolean; // false = the currently-streaming line
}

interface SessionState {
    phase: Phase;
    turnPhase: TurnPhase | null; // backend's fine-grained phase (intake → outline → build → done)
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

// optional formatId overrides the surface (the modal's live preview format)
export async function saveGenerated(formatId?: string): Promise<string | null> {
    const base = gen.finalContent;
    if (!base) return null;
    const content = formatId ? { ...base, format: formatId } : base;
    return persistArtifact(content);
}
