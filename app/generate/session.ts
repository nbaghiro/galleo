import type { ArtifactContent, Section } from "@model/content";
import { createStore } from "solid-js/store";
import { walkElements } from "@elements/walk";
import { api } from "../data/api";

// The live-generation session — a reactive store the intake + build screens subscribe to, driven by a
// pluggable GenerationSource. Today the only source is a SIMULATOR (it reveals a real template through
// the narrated build), but it emits exactly the events the real LLM pipeline will, so that pipeline can
// be dropped in behind the same store without touching the UI.

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
    grid: string; // the planned grid — known upfront, drives the skeleton shape
    image: boolean; // whether this beat carries an image (drives the "sourcing" step + ghost)
    section: Section | null; // populated when its content lands
}
export interface Narration {
    id: number;
    text: string;
    mono?: string; // a technical token rendered in mono (e.g. the grid id)
    sub?: string; // a follow-up line (e.g. the image query)
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

// ---------- content helpers ----------

const TITLE_STYLES = new Set(["display", "h2", "title"]);
const clip = (s: string, n: number): string =>
    s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s;
const trimLabel = (s: string): string => clip(s, 30);

// Walk a section's cells + nested group children for its best headline (a display/title line, else the
// first non-eyebrow line) — templates wrap cover copy inside group elements.
const sectionHeadline = (s: Section): string => {
    let headline = "";
    let first = "";
    walkElements(s, (el) => {
        if (headline || el.type !== "text") return;
        const d = el.data as { text?: string; style?: string };
        const txt = (d.text ?? "").replace(/\s+/g, " ").trim();
        if (!txt) return;
        if (d.style && TITLE_STYLES.has(d.style)) headline = txt;
        else if (!first && d.style !== "eyebrow") first = txt;
    });
    return headline || first;
};

const hasImage = (s: Section): boolean =>
    s.background?.kind === "image" ||
    Object.values(s.cells).some((c) => c.element?.type === "image");

// every element type in a section (recursing groups) → a friendly breakdown for the narration
const TYPE_NAME: Record<string, string> = {
    text: "text block",
    image: "image",
    stat: "stat",
    bullets: "list",
    card: "card",
    quote: "quote",
    button: "button",
    divider: "rule",
    badge: "tag",
};
const describeElements = (s: Section): string => {
    const counts: Record<string, number> = {};
    walkElements(s, (el) => {
        if (el.type !== "group") counts[el.type] = (counts[el.type] ?? 0) + 1;
    });
    const parts = Object.entries(counts).map(([t, c]) => {
        const name = TYPE_NAME[t] ?? t;
        return c > 1 ? `${c} ${name}s` : `1 ${name}`;
    });
    return parts.join(", ") || "laid out";
};

const ARC = ["scene", "tension", "turn", "proof", "momentum", "close"];
const roleAt = (i: number, n: number): string => {
    if (n <= 1) return "scene";
    return ARC[Math.round((i / (n - 1)) * (ARC.length - 1))] ?? "scene";
};
// human phrasings the agent narrates with — the role's title, its storytelling intent, the grid choice.
const ROLE_TITLE: Record<string, string> = {
    scene: "Setting the scene",
    tension: "Naming the tension",
    turn: "The turn",
    proof: "The proof",
    momentum: "Building momentum",
    close: "The ask",
};
const ROLE_INTENT: Record<string, string> = {
    scene: "the hook — earn the next thirty seconds",
    tension: "the problem your reader already feels",
    turn: "what changes the moment they choose you",
    proof: "evidence that's hard to argue with",
    momentum: "the shape of what becomes possible",
    close: "one clear action to take now",
};
const GRID_NAME: Record<string, string> = {
    full: "full-bleed",
    "split-6040": "split 60/40",
    "split-4060": "split 40/60",
    "two-col": "two columns",
    "three-up": "three-up",
};
const GRID_REASON: Record<string, string> = {
    full: "full-bleed for impact",
    "split-6040": "the image carries the mood",
    "split-4060": "text leads, image supports",
    "two-col": "two columns for density",
    "three-up": "a triplet reads as scale",
};
const IMG_TREATMENT = [
    "soft duotone, low scrim",
    "warm grade, gentle vignette",
    "editorial crop, muted tone",
    "cinematic, deep shadow",
];
const SURFACE_WORD: Record<string, string> = { deck: "deck", doc: "document", web: "website" };

const imageQuery = (s: Section): string => {
    const words = sectionHeadline(s)
        .toLowerCase()
        .replace(/[^a-z0-9 ]/g, "")
        .split(/\s+/)
        .filter(Boolean);
    return words.length ? words.slice(0, 4).join(" ") : "editorial photography";
};

// ---------- the source (simulator) ----------

let timers: number[] = [];
const at = (ms: number, fn: () => void): void => {
    timers.push(window.setTimeout(fn, ms));
};
export function cancelSession(): void {
    timers.forEach((t) => window.clearTimeout(t));
    timers = [];
}
export function resetSession(): void {
    cancelSession();
    setGen({ ...initial, beats: [], sections: [], narration: [] });
}

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

// Choose the template that best matches the brief's surface + prompt (keyword overlap), and recolor it
// to the chosen theme. Stands in for the real planner until the LLM pipeline lands.
async function pickContent(brief: Brief): Promise<ArtifactContent> {
    const { templates } = await api.listTemplates();
    const onSurface = templates.filter((t) => t.content.format === brief.surface);
    const pool = onSurface.length ? onSurface : templates;
    const terms = brief.prompt
        .toLowerCase()
        .split(/\s+/)
        .filter((w) => w.length > 3);
    const score = (hay: string): number =>
        terms.reduce((n, w) => (hay.toLowerCase().includes(w) ? n + 1 : n), 0);
    const ranked = pool
        .map((t) => ({ t, s: score(`${t.name} ${t.category} ${t.description}`) }))
        .sort((a, b) => b.s - a.s);
    const best = ranked[0]?.t;
    if (!best) throw new Error("no templates");
    return { ...best.content, theme: brief.theme };
}

function runTimeline(brief: Brief, content: ArtifactContent): void {
    const secs = content.sections;
    const n = secs.length;
    const beats: Beat[] = secs.map((s, i) => ({
        id: s.id,
        label: trimLabel(sectionHeadline(s)) || `Beat ${i + 1}`,
        role: roleAt(i, n),
        status: "upcoming",
    }));
    setGen({
        beats,
        sections: secs.map((s) => ({
            id: s.id,
            status: "queued",
            grid: s.grid,
            image: hasImage(s),
            section: null,
        })),
        format: content.format,
        theme: content.theme,
    });

    // the narration the agent "thinks out loud" — read the brief, plan the arc, then per beat: announce
    // the role + intent, choose the layout (+ why), write the real headline, source imagery, confirm.
    const surface = SURFACE_WORD[brief.surface] ?? "artifact";
    pushNarration(`Reading the brief`);
    narrSub(
        [
            "a " + surface,
            brief.goal && `to ${brief.goal.toLowerCase()}`,
            brief.audience && `for ${brief.audience.toLowerCase()}`,
        ]
            .filter(Boolean)
            .join(" ") + (brief.tone ? ` · ${brief.tone.toLowerCase()} tone` : ""),
    );
    let t = 260;
    at(t, () => {
        pushNarration(`Planning the story arc`, ` ${n} beats`);
        narrSub(beats.map((b) => b.role).join("  →  "));
    });
    t += 640;

    secs.forEach((s, i) => {
        const role = beats[i]?.role ?? "scene";
        const img = hasImage(s);
        const head = sectionHeadline(s);
        at(t, () => {
            markBeat(s.id, "active");
            setStatus(i, "active");
            setGen("sections", i, "section", s); // available for the skeleton (real geometry)
            setGen("activeSection", s.id);
            pushNarration(`Beat ${i + 1}/${n} · ${ROLE_TITLE[role] ?? role}`);
            narrSub(ROLE_INTENT[role] ?? "");
        });
        t += 460;
        at(t, () => {
            pushNarration(`Composing the layout →`, ` ${GRID_NAME[s.grid] ?? s.grid}`);
            narrSub(GRID_REASON[s.grid] ?? "");
        });
        t += 480;
        at(t, () => {
            setStatus(i, "writing");
            pushNarration(role === "scene" ? `Writing the headline` : `Writing the copy`);
            narrSub(head ? `“${clip(head, 52)}”` : "drafting the supporting lines");
        });
        t += 540;
        if (img) {
            at(t, () => {
                setStatus(i, "image");
                pushNarration(`Sourcing imagery`);
                narrSub(`${imageQuery(s)} · ${IMG_TREATMENT[i % IMG_TREATMENT.length] ?? ""}`);
            });
            t += 560;
        }
        at(t, () => {
            setStatus(i, "done");
            setGen("sections", i, "section", s);
            markBeat(s.id, "done");
            pushNarration(`Beat ${i + 1} placed`, ` ✓`);
            narrSub(describeElements(s));
        });
        t += 440;
    });
    at(t + 220, () => {
        setGen("narration", (arr) => arr.map((x) => ({ ...x, done: true })));
        pushNarration(`Composed ${n} sections — ready to open`, ` ✓`);
        setGen("narration", gen.narration.length - 1, "done", true);
        setGen({ phase: "done", finalContent: content, activeSection: null });
    });
}

export async function startSession(brief: Brief): Promise<void> {
    resetSession();
    setGen({ phase: "building", brief, theme: brief.theme, format: brief.surface, error: "" });
    try {
        const content = await pickContent(brief);
        runTimeline(brief, content);
    } catch {
        setGen({ phase: "error", error: "Couldn't start generation — try again." });
    }
}

// A short, library-friendly title — the deck's own cover headline (via sectionHeadline, which walks the
// cover's groups), not the long brief. The prompt is the description; the title is the name.
const deriveTitle = (content: ArtifactContent, prompt: string): string => {
    const cover = content.sections[0];
    const clause = (prompt.split(/[—–.\n]/)[0] ?? prompt).trim();
    return clip((cover ? sectionHeadline(cover) : "") || clause || "Generated artifact", 64);
};

// Persist the finished artifact and hand back its id for the editor.
export async function saveGenerated(): Promise<string | null> {
    const c = gen.finalContent;
    if (!c) return null;
    const { id } = await api.createArtifact({
        title: deriveTitle(c, gen.brief?.prompt ?? ""),
        formatId: c.format,
        themeId: c.theme,
        draftContent: c,
    });
    return id;
}
