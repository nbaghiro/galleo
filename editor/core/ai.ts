import type { ArtifactContent, ElementInstance, Section } from "@model/artifact";
import type { ElementAddress } from "@model/target";
import type { Beat as PlanBeat, TurnEvent, TurnRequest } from "@model/ai";
import { createStore } from "solid-js/store";
import { applyPatch } from "@model/ai";
import { getElementAt, setElementAt, insertSection } from "@elements/ops";
import { placeholderSection } from "@canvas/elements/blueprint";
import { replaceTextRange, textSelection } from "./text";
import {
    commit,
    commitOver,
    content,
    editing,
    editor,
    getReviseElement,
    getSectionStreamer,
    getSuggestSections,
    getTextAssist,
    setArtifactLive,
    setSelection,
    stopEditing,
    type TextAssistRequest,
} from "./store";

// --- element regeneration ---

const isAtOrUnder = (path: number[], ancestor: number[]): boolean =>
    ancestor.every((v, i) => path[i] === v);

// child of these = a fragment of one composed unit → regenerate the whole parent, not the piece alone
const COUPLED = new Set(["quote", "stat", "bullets"]);
// nothing to regenerate → no affordance
const INERT = new Set(["divider", "video"]);

export function regenTarget(art: ArtifactContent, addr: ElementAddress): ElementAddress | null {
    let a = addr;
    for (;;) {
        if (a.path.length === 0) break;
        const parentAddr: ElementAddress = { ...a, path: a.path.slice(0, -1) };
        const parent = getElementAt(art, parentAddr);
        if (parent && COUPLED.has(parent.type)) {
            a = parentAddr;
            continue;
        }
        break;
    }
    const inst = getElementAt(art, a);
    if (!inst || INERT.has(inst.type)) return null;
    return a;
}

export function canRegenerate(addr: ElementAddress): boolean {
    return getReviseElement() !== null && regenTarget(editor.artifact, addr) !== null;
}

interface ElementGenState {
    addr: ElementAddress | null;
    status: "working" | "error" | null;
    error: string | null;
}

const [elementGen, setElementGen] = createStore<ElementGenState>({
    addr: null,
    status: null,
    error: null,
});
export { elementGen };

export const elementGenBusy = (): boolean => elementGen.status === "working";

let elemErrTimer = 0;

// re-check the target still exists before committing — the user may have edited/undone mid-flight
export async function regenerateElement(addr: ElementAddress, instruction?: string): Promise<void> {
    const reviser = getReviseElement();
    if (!reviser || elementGenBusy()) return;
    const base = content();
    const target = regenTarget(base, addr);
    if (!target) return;
    const current = getElementAt(base, target);
    if (!current) return;

    window.clearTimeout(elemErrTimer);
    setElementGen({ addr: target, status: "working", error: null });
    setSelection({ kind: "element", address: target });

    try {
        const next = await reviser(base, target.section, current, instruction);
        if (getElementAt(content(), target)) {
            // stop editing before commit: the browser won't repaint an in-place change to a live contenteditable
            const ed = editing();
            if (ed && ed.section === target.section && isAtOrUnder(ed.path, target.path))
                stopEditing();
            commit(setElementAt(content(), target, next));
            setSelection({ kind: "element", address: target });
        }
        setElementGen({ addr: null, status: null, error: null });
    } catch (e) {
        setElementGen({
            addr: target,
            status: "error",
            error: e instanceof Error ? e.message : "couldn't regenerate that",
        });
        elemErrTimer = window.setTimeout(
            () => setElementGen({ addr: null, status: null, error: null }),
            2600,
        );
    }
}

// --- section generation ---

// fixed id for the single placeholder (one gen at a time); never collides with a real id
const PLACEHOLDER_ID = "__gen_new__";
export const PLACEHOLDER_SECTION_ID = PLACEHOLDER_ID;

export type SectionGenStage = "prompt" | "planning" | "writing" | "done" | "error";

interface SectionGenState {
    stage: SectionGenStage | null;
    afterId: string | null;
    beat: PlanBeat | null;
    caption: string;
    error: string | null;
}

const [sectionGen, setSectionGen] = createStore<SectionGenState>({
    stage: null,
    afterId: null,
    beat: null,
    caption: "",
    error: null,
});
export { sectionGen };

export const sectionGenActive = (): boolean => sectionGen.stage !== null;
export const sectionGenGenerating = (): boolean =>
    sectionGen.stage === "planning" || sectionGen.stage === "writing";

let ctrl: AbortController | null = null;
let doneTimer = 0;

export function openSectionPrompt(afterId: string | null): void {
    window.clearTimeout(doneTimer);
    ctrl?.abort();
    ctrl = null;
    removePlaceholder();
    setSectionGen({ stage: "prompt", afterId, beat: null, caption: "", error: null });
}

export function closeSectionGen(): void {
    window.clearTimeout(doneTimer);
    ctrl?.abort();
    ctrl = null;
    removePlaceholder();
    setSectionGen({ stage: null, afterId: null, beat: null, caption: "", error: null });
}

function indexAfter(c: ArtifactContent, afterId: string | null): number {
    if (afterId == null) return 0;
    const i = c.sections.findIndex((s) => s.id === afterId);
    return i < 0 ? c.sections.length : i + 1;
}

function removePlaceholder(): void {
    const c = content();
    if (c.sections.some((s) => s.id === PLACEHOLDER_ID))
        setArtifactLive({ ...c, sections: c.sections.filter((s) => s.id !== PLACEHOLDER_ID) });
}

function putPlaceholder(section: Section): void {
    const c = content();
    if (c.sections.some((s) => s.id === PLACEHOLDER_ID))
        setArtifactLive({
            ...c,
            sections: c.sections.map((s) => (s.id === PLACEHOLDER_ID ? section : s)),
        });
    else setArtifactLive(insertSection(c, indexAfter(c, sectionGen.afterId), section));
}

export async function runSectionGen(instruction: string): Promise<void> {
    const text = instruction.trim();
    const streamer = getSectionStreamer();
    if (!text || !streamer || sectionGenGenerating()) return;
    const afterId = sectionGen.afterId;
    const baseContent = content(); // the real artifact, without any placeholder

    // reserve the slot so its box scrolls in + holds height while planning
    putPlaceholder(placeholderSection({ id: PLACEHOLDER_ID, layout: "full" }));
    setSectionGen({ stage: "planning", caption: "Reading the surrounding sections", error: null });
    setSelection(null);

    ctrl = new AbortController();
    // holder, not a bare `let`: assigned only inside the callback, which CFA can't see → would narrow to `never`
    const out: { section: Section | null } = { section: null };
    const request: TurnRequest = {
        kind: "section",
        input: { instruction: text, afterId, content: baseContent },
    };

    const onEvent = (ev: TurnEvent): void => {
        switch (ev.type) {
            case "narration":
                setSectionGen("caption", ev.text);
                break;
            case "plan": {
                const b = ev.beats[0];
                if (!b) break;
                setSectionGen({ beat: b, stage: "writing" });
                putPlaceholder(
                    placeholderSection({
                        id: PLACEHOLDER_ID,
                        layout: b.layout,
                        blocks: b.blocks,
                        image: b.image,
                    }),
                );
                break;
            }
            case "patch":
                for (const op of ev.ops) if (op.op === "addSection") out.section = op.section;
                break;
            case "error":
                setSectionGen({ stage: "error", error: ev.message });
                break;
        }
    };

    try {
        await streamer(request, onEvent, ctrl.signal);
    } catch (e) {
        if (ctrl?.signal.aborted) {
            removePlaceholder();
            return;
        }
        setSectionGen({
            stage: "error",
            error: e instanceof Error ? e.message : "the section could not be generated",
        });
    } finally {
        ctrl = null;
    }

    if (sectionGen.stage === "error" || !out.section) {
        if (!out.section && sectionGen.stage !== "error")
            setSectionGen({ stage: "error", error: "no section was produced" });
        removePlaceholder();
        return;
    }

    // land against the pre-generation baseline so one undo removes it cleanly (no placeholder left in history)
    const landed = out.section;
    setSectionGen({ stage: "done" });
    doneTimer = window.setTimeout(() => {
        setArtifactLive(baseContent);
        commitOver(
            baseContent,
            applyPatch(baseContent, [{ op: "addSection", afterId, section: landed }]),
        );
        setSelection({ kind: "section", section: landed.id });
        setSectionGen({ stage: null, afterId: null, beat: null, caption: "", error: null });
    }, 800);
}

// --- section suggestions ---

function collectTypes(el: ElementInstance | undefined, into: Set<string>): void {
    if (!el) return;
    into.add(el.type);
    const kids = (el.data as { children?: ElementInstance[] }).children;
    if (Array.isArray(kids)) kids.forEach((k) => collectTypes(k, into));
}

function firstText(section: Section): string {
    let found = "";
    const visit = (el?: ElementInstance): void => {
        if (found || !el) return;
        const d = el.data as { text?: string; children?: ElementInstance[] };
        if (typeof d.text === "string" && d.text.trim()) {
            found = d.text.trim();
            return;
        }
        d.children?.forEach(visit);
    };
    visit(section.root);
    return found;
}

function typesOf(content: ArtifactContent): Set<string> {
    const types = new Set<string>();
    for (const s of content.sections) collectTypes(s.root, types);
    return types;
}

export function suggestSections(content: ArtifactContent, n = 6): string[] {
    const t = typesOf(content);
    const has = (kind: string): boolean => t.has(kind);
    const rules: { on: boolean; text: string; w: number }[] = [
        { on: !has("stat"), text: "Add the key numbers as stats", w: 9 },
        { on: !has("button"), text: "Add a closing call-to-action", w: 9 },
        { on: !has("quote"), text: "Add a customer quote", w: 8 },
        { on: has("quote"), text: "Add another voice or testimonial", w: 4 },
        { on: !has("chart"), text: "Visualize a trend in a chart", w: 7 },
        { on: !has("table"), text: "Add a comparison table", w: 6 },
        { on: !has("diagram"), text: "Show the process as a diagram", w: 5 },
        { on: !has("card"), text: "Break the highlights into three cards", w: 4 },
        // evergreen — always eligible, low weight, so short artifacts still fill out
        { on: true, text: "Add a proof or results section", w: 3 },
        { on: true, text: "Add a “how it works” section", w: 2 },
        { on: true, text: "Add an FAQ or objections section", w: 1 },
    ];
    const seen = new Set<string>();
    const out: string[] = [];
    for (const r of rules.filter((r) => r.on).sort((a, b) => b.w - a.w)) {
        if (seen.has(r.text)) continue;
        seen.add(r.text);
        out.push(r.text);
        if (out.length >= n) break;
    }
    return out;
}

// cache key: a suggestion set is reused until the section count or opening headline changes
function cacheKey(id: string, content: ArtifactContent): string {
    const head = content.sections[0] ? firstText(content.sections[0]).slice(0, 48) : "";
    return `${id}:${content.sections.length}:${head}`;
}

const llmCache = new Map<string, string[]>();

export async function fetchSuggestions(
    id: string,
    content: ArtifactContent,
    force = false,
): Promise<string[]> {
    const key = cacheKey(id, content);
    if (!force) {
        const hit = llmCache.get(key);
        if (hit) return hit;
    }
    const handler = getSuggestSections();
    if (!handler) return suggestSections(content);
    try {
        const got = await handler(content);
        const list = got.filter((s) => typeof s === "string" && s.trim()).slice(0, 6);
        const result = list.length ? list : suggestSections(content);
        llmCache.set(key, result);
        return result;
    } catch {
        return suggestSections(content);
    }
}

// --- text assist (rewrite / translate) ---

type Range = { from: number; to: number };

interface TextAssistState {
    busy: boolean;
    error: string | null;
}
const [textAssist, setTextAssist] = createStore<TextAssistState>({ busy: false, error: null });
export { textAssist };
export const textAssistBusy = (): boolean => textAssist.busy;

export const canAssistText = (): boolean => getTextAssist() !== null;

export interface RewritePreset {
    label: string;
    instruction: string;
}

export const REWRITE_PRESETS: RewritePreset[] = [
    {
        label: "Improve writing",
        instruction:
            "Improve the writing — clearer, more polished and compelling — without changing its meaning or length much.",
    },
    {
        label: "Make it punchier",
        instruction: "Make it punchier and more confident: short, declarative, high-impact.",
    },
    {
        label: "Make shorter",
        instruction: "Make it more concise — the same message in noticeably fewer words.",
    },
    {
        label: "Make longer",
        instruction: "Expand it with a little more detail and texture, keeping the same voice.",
    },
    {
        label: "Fix spelling & grammar",
        instruction: "Fix any spelling, grammar, and punctuation mistakes. Change nothing else.",
    },
    { label: "More formal", instruction: "Make the tone more formal and professional." },
    { label: "More casual", instruction: "Make the tone more casual and conversational." },
];

// shortlist only — the model accepts any language name
export const LANGUAGES: string[] = [
    "Spanish",
    "French",
    "German",
    "Italian",
    "Portuguese",
    "Dutch",
    "Chinese (Simplified)",
    "Japanese",
    "Korean",
    "Arabic",
    "Hindi",
    "Russian",
];

let errTimer = 0;

function resolvePassage(
    range?: Range | null,
): { from: number; to: number; text: string; passage: string } | null {
    const addr = editing();
    if (!addr) return null;
    const inst = getElementAt(editor.artifact, addr);
    const text = ((inst?.data as { text?: string })?.text ?? "").toString();
    if (!text) return null;
    const sel = range ?? textSelection();
    let from = sel?.from ?? 0;
    let to = sel?.to ?? 0;
    if (to <= from) {
        from = 0;
        to = text.length; // collapsed caret → whole field
    }
    return { from, to, text, passage: text.slice(from, to) };
}

async function run(
    op: TextAssistRequest["op"],
    extra: { instruction?: string; language?: string },
    range?: Range | null,
): Promise<void> {
    const assist = getTextAssist();
    if (!assist || textAssist.busy) return;
    const r = resolvePassage(range);
    if (!r || !r.passage.trim()) return;
    const context = r.from > 0 || r.to < r.text.length ? r.text : undefined;

    window.clearTimeout(errTimer);
    setTextAssist({ busy: true, error: null });
    try {
        const out = await assist({ op, text: r.passage, context, ...extra });
        // apply only if still editing (the user may have clicked away mid-call)
        if (editing() && out) replaceTextRange(r.from, r.to, out);
        setTextAssist({ busy: false, error: null });
    } catch (e) {
        setTextAssist({
            busy: false,
            error: e instanceof Error ? e.message : "that didn't work",
        });
        errTimer = window.setTimeout(() => setTextAssist("error", null), 2600);
    }
}

// `range` = selection captured at menu-open, so a focus-stealing input doesn't lose the target
export function runRewrite(instruction: string, range?: Range | null): Promise<void> {
    return run("rewrite", { instruction }, range);
}
export function runTranslate(language: string, range?: Range | null): Promise<void> {
    return run("translate", { language }, range);
}

// collapsed range → resolvePassage falls through to the whole field
export function runRegenerate(): Promise<void> {
    return run(
        "rewrite",
        {
            instruction:
                "Rewrite this from scratch — a genuinely fresh, stronger version that makes the same point a different way. Keep it roughly the same length; don't just hand the same text back.",
        },
        { from: 0, to: 0 },
    );
}
