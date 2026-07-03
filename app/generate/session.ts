import type { ArtifactContent, Section } from "@model/content";
import type { AgentEvent, Beat as PlanBeat, GenerateInput } from "@protocol/agent";
import { createStore } from "solid-js/store";
import { applyPatch } from "@protocol/agent";

// The live-generation session — a reactive store the intake + build screens subscribe to, driven by the
// real backend agent pipeline. `startSession` POSTs a turn and reads its SSE stream of AgentEvents
// (narration, plan, section status, content patches), populating this store live. The artifact is saved
// server-side as it composes, so "open in editor" just navigates to the returned id.

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
    grid: string; // the planned grid — drives the skeleton shape before content lands
    image: boolean; // whether this beat carries an image
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
    brief: Brief | null;
    theme: string;
    format: string;
    beats: Beat[];
    sections: SectionSlot[];
    narration: Narration[];
    activeSection: string | null;
    finalContent: ArtifactContent | null;
    artifactId: string | null; // the server-saved artifact for this turn
    error: string;
}

const initial: SessionState = {
    phase: "idle",
    brief: null,
    theme: "studio",
    format: "deck",
    beats: [],
    sections: [],
    narration: [],
    activeSection: null,
    finalContent: null,
    artifactId: null,
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

// ---------- the source (the real backend turn, streamed over SSE) ----------

let abort: AbortController | null = null;

export function cancelSession(): void {
    abort?.abort();
    abort = null;
}
export function resetSession(): void {
    cancelSession();
    setGen({ ...initial, beats: [], sections: [], narration: [] });
}

// Parse one SSE frame ("event: …\n data: …") into its event name + data payload.
function parseFrame(frame: string): { event?: string; data?: string } {
    let event: string | undefined;
    const data: string[] = [];
    for (const line of frame.split("\n")) {
        if (line.startsWith("event:")) event = line.slice(6).trim();
        else if (line.startsWith("data:")) data.push(line.slice(5).replace(/^ /, ""));
    }
    return { event, data: data.length ? data.join("\n") : undefined };
}

// Apply one AgentEvent to the store; returns the accumulating artifact content.
function dispatch(ev: AgentEvent, content: ArtifactContent): ArtifactContent {
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
                    grid: b.grid ?? "full",
                    image: b.image ?? false,
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

async function consume(brief: Brief, signal: AbortSignal): Promise<void> {
    const input: GenerateInput = {
        prompt: brief.prompt,
        surface: brief.surface,
        theme: brief.theme,
        goal: brief.goal || undefined,
        audience: brief.audience || undefined,
        tone: brief.tone || undefined,
        length: brief.length || undefined,
    };
    const res = await fetch("/api/turns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ kind: "generate", input, quality: "auto" }),
        signal,
    });
    if (!res.ok || !res.body) throw new Error(`turn failed (${res.status})`);

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    let content: ArtifactContent = { format: brief.surface, theme: brief.theme, sections: [] };
    for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let i = buf.indexOf("\n\n");
        while (i >= 0) {
            const { event, data } = parseFrame(buf.slice(0, i));
            buf = buf.slice(i + 2);
            if (data) {
                if (event === "turn") {
                    setGen("artifactId", (JSON.parse(data) as { artifactId: string }).artifactId);
                } else {
                    content = dispatch(JSON.parse(data) as AgentEvent, content);
                }
            }
            i = buf.indexOf("\n\n");
        }
    }
}

export async function startSession(brief: Brief): Promise<void> {
    resetSession();
    abort = new AbortController();
    setGen({ phase: "building", brief, theme: brief.theme, format: brief.surface, error: "" });
    try {
        await consume(brief, abort.signal);
    } catch (e) {
        if (!abort?.signal.aborted)
            setGen({
                phase: "error",
                error: (e as Error)?.message?.includes("turn failed")
                    ? "Couldn't reach the generator — is the API running?"
                    : "Generation failed — try again.",
            });
    }
}

// The artifact is saved server-side as the turn composes — "open" just navigates to it.
export async function saveGenerated(): Promise<string | null> {
    return gen.artifactId;
}
