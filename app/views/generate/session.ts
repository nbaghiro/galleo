import type { ArtifactContent, ElementInstance, Section } from "@model/artifact";
import type { AgentEvent, Beat as PlanBeat } from "@model/agent";
import { createStore } from "solid-js/store";
import { applyPatch } from "@model/agent";
import { api } from "../../api";
import { DEMO_EXAMPLES, type DemoExample } from "./demo";

// The generation session — a reactive store the intake + build screens subscribe to. A client-side
// simulator (`simulate`) replays a hand-built fixture as a stream of AgentEvents through `dispatch`, so
// the build screen fills in section by section. "Open in editor" persists the result and navigates to it.

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
    demoArtifact = null;
    setGen({ ...initial, beats: [], sections: [], narration: [] });
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

// ---------- demo mode (client-side only): replay a real hand-built fixture ----------
// The fixture picked for the current session — replayed section by section, and saved as a real artifact
// when the user opens it. `simulate` feeds `dispatch` synthetic events off a matched, hand-built fixture.
let demoArtifact: { content: ArtifactContent; title: string } | null = null;

const ROLE_ARC = ["scene", "tension", "turn", "proof", "momentum", "close"];
const roleFor = (i: number, n: number): string =>
    i === 0
        ? "scene"
        : i >= n - 1
          ? "close"
          : (ROLE_ARC[Math.min(i, ROLE_ARC.length - 2)] ?? "proof");

const childrenOf = (inst: ElementInstance): ElementInstance[] => {
    const kids = (inst.data as Record<string, unknown> | undefined)?.children;
    return Array.isArray(kids) ? (kids as ElementInstance[]) : [];
};
const firstText = (inst: ElementInstance | undefined): string | undefined => {
    if (!inst) return undefined;
    const d = inst.data as Record<string, unknown> | undefined;
    if (inst.type === "text" && typeof d?.text === "string") return d.text;
    for (const k of childrenOf(inst)) {
        const found = firstText(k);
        if (found) return found;
    }
    return undefined;
};
const hasImage = (inst: ElementInstance | undefined): boolean =>
    !!inst && (inst.type === "image" || childrenOf(inst).some(hasImage));

const sectionLabel = (s: Section, i: number): string => {
    for (const c of Object.values(s.cells)) {
        const txt = firstText(c.element);
        if (txt) return txt;
    }
    return `Section ${i + 1}`;
};
const sectionHasImage = (s: Section): boolean =>
    s.background?.kind === "image" || Object.values(s.cells).some((c) => hasImage(c.element));

const wait = (ms: number, signal: AbortSignal): Promise<void> =>
    new Promise((resolve, reject) => {
        if (signal.aborted) return reject(new DOMException("aborted", "AbortError"));
        const t = setTimeout(resolve, ms);
        signal.addEventListener(
            "abort",
            () => {
                clearTimeout(t);
                reject(new DOMException("aborted", "AbortError"));
            },
            { once: true },
        );
    });

function pickDemo(brief: Brief): DemoExample {
    const exact = DEMO_EXAMPLES.find((d) => d.prompt.trim() === brief.prompt.trim());
    if (exact) return exact;
    const bySurface = DEMO_EXAMPLES.filter((d) => d.surface === brief.surface);
    const pool = bySurface.length ? bySurface : DEMO_EXAMPLES;
    return pool[Math.floor(Math.random() * pool.length)]!;
}

// Replay a hand-built fixture as if generated — plan, then reveal each section in turn, narrated + timed.
async function simulate(brief: Brief, signal: AbortSignal): Promise<void> {
    const demo = pickDemo(brief);
    const art = demo.artifact;
    demoArtifact = { content: art, title: demo.title };
    setGen({ theme: art.theme, format: art.format }); // render in the fixture's own theme + format

    let content: ArtifactContent = { format: art.format, theme: art.theme, sections: [] };
    const n = art.sections.length;

    content = dispatch(
        { type: "narration", text: "Reading the brief", sub: clip(brief.prompt, 80) },
        content,
    );
    await wait(700, signal);

    const beats: PlanBeat[] = art.sections.map((s, i) => ({
        id: s.id,
        label: clip(sectionLabel(s, i), 40),
        role: roleFor(i, n),
        grid: s.grid,
        image: sectionHasImage(s),
    }));
    content = dispatch({ type: "plan", beats }, content);
    content = dispatch(
        {
            type: "narration",
            text: "Planning the story arc",
            mono: ` ${n} beats`,
            sub: beats.map((b) => b.role).join("  →  "),
        },
        content,
    );
    await wait(650, signal);

    for (let i = 0; i < n; i++) {
        const s = art.sections[i]!;
        const b = beats[i]!;
        content = dispatch({ type: "section.status", id: s.id, status: "active" }, content);
        content = dispatch({ type: "section.status", id: s.id, status: "writing" }, content);
        content = dispatch({ type: "narration", text: b.label, mono: ` · ${b.role}` }, content);
        await wait(340 + Math.floor(Math.random() * 320), signal);
        if (b.image)
            content = dispatch({ type: "section.status", id: s.id, status: "image" }, content);
        content = dispatch({ type: "patch", ops: [{ op: "addSection", section: s }] }, content);
        content = dispatch({ type: "section.status", id: s.id, status: "done" }, content);
        content = dispatch(
            { type: "narration", text: `${b.label} placed`, mono: ` ✓ ${i + 1}/${n}` },
            content,
        );
        await wait(130, signal);
    }

    content = dispatch({ type: "turn.done", summary: `Composed ${n} sections` }, content);
}

export async function startSession(brief: Brief): Promise<void> {
    resetSession();
    const controller = new AbortController();
    abort = controller;
    setGen({ phase: "building", brief, theme: brief.theme, format: brief.surface, error: "" });
    try {
        await simulate(brief, controller.signal);
    } catch {
        if (controller.signal.aborted) return; // canceled — leave the session as-is
        setGen({ phase: "error", error: "Something went off-script — try again." });
    }
}

// "Open" persists the replayed fixture as a fresh artifact (so it lands in the library + editor like a
// real one) and returns its id to navigate to.
export async function saveGenerated(): Promise<string | null> {
    if (!demoArtifact) return null;
    try {
        const { id } = await api.createArtifact({
            title: demoArtifact.title,
            formatId: demoArtifact.content.format,
            themeId: demoArtifact.content.theme,
            draftContent: demoArtifact.content,
            folderId: null,
        });
        return id;
    } catch {
        return null;
    }
}
