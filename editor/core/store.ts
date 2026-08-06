import type { Region } from "@engine/node";
import type { ElementAddress, Target } from "@model/artifact";
import type {
    ArtifactContent,
    ArtifactShell,
    ElementInstance,
    Section,
    SectionSummary,
} from "@model/artifact";
import type { PlanLimits } from "@model/billing";
import type { TurnEvent, TurnRequest } from "@model/ai";
import type { IconPick, MediaItem, MediaKind } from "@model/media";
import { createSignal } from "solid-js";
import type { Theme, Tokens } from "@themes";
import { duplicateSection, insertSection, moveSection, removeSection } from "@elements/ops";
import { emptyRegion, targetsEqual } from "@model/artifact";
import { isDesktop } from "@ui/viewport";
import { resolveTheme } from "@themes";

const EMPTY_ARTIFACT: ArtifactContent = {
    format: "deck",
    theme: "studio",
    sections: [{ id: "s-1", root: emptyRegion() }],
};

// immutable: every write replaces the whole tree, so undo just keeps past values
const [content, setContent] = createSignal<ArtifactContent>(EMPTY_ARTIFACT);
export { content };

// transient geometry the canvas reports, not undoable
const [sectionTops, setSectionTops] = createSignal<number[]>([]);
export { sectionTops, setSectionTops };

// getters call their signal, so a read stays reactive
export const editor = {
    get artifact(): ArtifactContent {
        return content();
    },
    get sectionTops(): number[] {
        return sectionTops();
    },
};

export const editorTheme = (): Theme => resolveTheme(editor.artifact.theme);
export const editorTokens = (): Tokens => editorTheme().tokens;
export const editorAccent = (): string => editorTokens().accent;

const [canvasEl, setCanvasEl] = createSignal<HTMLElement | null>(null);
export { canvasEl, setCanvasEl };

// the width the stack is laid out at; the minimap reads it so a thumb wraps text identically
const [canvasContentWidth, setCanvasContentWidth] = createSignal(1120);
export { canvasContentWidth, setCanvasContentWidth };

// painted stage element, in content coords
const [stageEl, setStageEl] = createSignal<HTMLElement | null>(null);
export { stageEl, setStageEl };

export const [regions, setRegions] = createSignal<Region[]>([]);
export const [selection, setSelection] = createSignal<Target | null>(null, {
    equals: targetsEqual,
});
export const [hover, setHover] = createSignal<Target | null>(null, { equals: targetsEqual });

// defaults are the most-restrictive Free set, so a studio with no host never leaks paid exports
export type ExportFeatures = Pick<PlanLimits, "exportFormats" | "removeBranding" | "publicLinks">;
const [features, setFeatures] = createSignal<ExportFeatures>({
    exportFormats: ["png"],
    removeBranding: false,
    publicLinks: false,
});
export { features, setFeatures };

// the title rides in the snapshot, so one undo stack covers content edits and renames
interface DocSnapshot {
    content: ArtifactContent;
    title: string;
}
const past: DocSnapshot[] = [];
const future: DocSnapshot[] = [];
const HISTORY_CAP = 120;

// bumped when the stacks change, so canUndo/canRedo stay reactive
const [historyTick, setHistoryTick] = createSignal(0);
const bumpHistory = (): void => {
    setHistoryTick((n) => n + 1);
};
export const canUndo = (): boolean => {
    historyTick();
    return past.length > 0;
};
export const canRedo = (): boolean => {
    historyTick();
    return future.length > 0;
};

// bumped on every edit; the canvas reads it to force a redraw
const [editSeq, setEditSeq] = createSignal(0);
export { editSeq };
const bumpSeq = (): void => {
    setEditSeq((n) => n + 1);
};

const snapshot = (): DocSnapshot => ({ content: content(), title: currentTitle() });

// consecutive commits with the same key (within the idle window) fold into one undo step
let coalesceKey: string | null = null;
let coalesceTimer = 0;
const armCoalesce = (key: string): void => {
    coalesceKey = key;
    window.clearTimeout(coalesceTimer);
    coalesceTimer = window.setTimeout(() => {
        coalesceKey = null;
    }, 500);
};

function pushPast(s: DocSnapshot): void {
    past.push(s);
    if (past.length > HISTORY_CAP) past.shift();
    future.length = 0;
    coalesceKey = null;
    bumpHistory();
}

export function commit(next: ArtifactContent, opts?: { coalesce?: string }): void {
    const key = opts?.coalesce;
    if (key && key === coalesceKey) {
        // same interaction: keep the single history entry
        setContent(next);
        bumpSeq();
        armCoalesce(key);
        return;
    }
    pushPast(snapshot());
    setContent(next);
    bumpSeq();
    if (key) armCoalesce(key);
}

// baselines the undo step on `base`, for when the live tree holds a transient value (a skeleton)
export function commitOver(base: ArtifactContent, next: ArtifactContent): void {
    pushPast({ content: base, title: currentTitle() });
    setContent(next);
    bumpSeq();
}

// previewing swaps the rendered theme but not the saved one, and skips editSeq, so it never autosaves
const [previewingTheme, setPreviewingTheme] = createSignal(false);
export { previewingTheme };
let savedThemeUnderPreview: string | null = null;

export function startThemePreview(themeId: string): void {
    if (themeId === content().theme) return;
    savedThemeUnderPreview = content().theme;
    setContent({ ...content(), theme: themeId });
    setPreviewingTheme(true);
}

// recorded against the pre-preview theme, so promoting is undoable
export function keepPreviewedTheme(): void {
    if (!previewingTheme()) return;
    const prevTheme = savedThemeUnderPreview;
    savedThemeUnderPreview = null;
    setPreviewingTheme(false);
    if (prevTheme !== null && prevTheme !== content().theme)
        pushPast({ content: { ...content(), theme: prevTheme }, title: currentTitle() });
    bumpSeq();
}

export function endThemePreview(): void {
    if (savedThemeUnderPreview !== null)
        setContent({ ...content(), theme: savedThemeUnderPreview });
    savedThemeUnderPreview = null;
    setPreviewingTheme(false);
}

export function previewSavedTheme(): string | null {
    return savedThemeUnderPreview;
}

export function themeForPersist(): string {
    return savedThemeUnderPreview ?? content().theme;
}

export function undo(): void {
    const prev = past.pop();
    if (prev === undefined) return;
    coalesceKey = null;
    future.push(snapshot());
    setContent(hydrate(prev.content));
    restoreTitle(prev.title);
    bumpSeq();
    bumpHistory();
}

export function redo(): void {
    const next = future.pop();
    if (next === undefined) return;
    coalesceKey = null;
    past.push(snapshot());
    setContent(hydrate(next.content));
    restoreTitle(next.title);
    bumpSeq();
    bumpHistory();
}

// live keystrokes update the artifact without touching history; one entry is recorded when it ends
const [editing, setEditing] = createSignal<ElementAddress | null>(null);
export { editing };

// viewport point where editing started; the caret goes there
const [editCaret, setEditCaret] = createSignal<{ x: number; y: number } | null>(null);
export { editCaret };

let editBefore: ArtifactContent | null = null;

export function startEditing(addr: ElementAddress, caret?: { x: number; y: number }): void {
    editBefore = editor.artifact;
    setEditCaret(caret ?? null);
    // hover updates are suppressed while editing, so a stale value would strand the hover chrome
    setHover(null);
    setEditing(addr);
}

export function stopEditing(): void {
    if (editBefore && editBefore !== editor.artifact)
        pushPast({ content: editBefore, title: currentTitle() });
    editBefore = null;
    setEditing(null);
}

// a focused contenteditable won't reliably repaint an in-place change; a fresh mount always paints
export function remountEditing(): void {
    setEditing((a) => (a ? { ...a } : a));
}

export function setArtifactLive(next: ArtifactContent): void {
    setContent(next);
    bumpSeq();
}

export interface ArtifactSummary {
    id: string;
    title: string;
    themeId?: string;
}
export const [artifacts, setArtifacts] = createSignal<ArtifactSummary[]>([]);
export const [currentArtifactId, setCurrentArtifactId] = createSignal<string | null>(null);

// part of every history snapshot, so a rename undoes and redoes with content edits
export const currentTitle = (): string =>
    artifacts().find((d) => d.id === currentArtifactId())?.title ?? "Untitled";

function setTitleLocal(title: string): void {
    const id = currentArtifactId();
    setArtifacts((list) => list.map((d) => (d.id === id ? { ...d, title } : d)));
}

// app registers title persistence; studio-alone → no-op
let persistTitleHandler: ((id: string, title: string) => void) | null = null;
export function onPersistTitle(fn: (id: string, title: string) => void): void {
    persistTitleHandler = fn;
}
function restoreTitle(title: string): void {
    if (title === currentTitle()) return;
    setTitleLocal(title);
    const id = currentArtifactId();
    if (id) persistTitleHandler?.(id, title);
}

export function renameArtifact(title: string): void {
    const t = title.trim();
    if (!t || t === currentTitle()) return;
    pushPast(snapshot());
    setTitleLocal(t);
    const id = currentArtifactId();
    if (id) persistTitleHandler?.(id, t);
}

let switchHandler: ((id: string) => void) | null = null;
export function onSwitchArtifact(fn: (id: string) => void): void {
    switchHandler = fn;
}
export function requestSwitchArtifact(id: string): void {
    switchHandler?.(id);
}

let homeHandler: (() => void) | null = null;
export function onHome(fn: () => void): void {
    homeHandler = fn;
}
export function requestHome(): void {
    homeHandler?.();
}

// locked export → the pricing page; no host → no-op
let upgradeHandler: (() => void) | null = null;
export function onUpgrade(fn: () => void): void {
    upgradeHandler = fn;
}
export function requestUpgrade(): void {
    upgradeHandler?.();
}

// opens the app-level theme drawer; no host → no-op
let themePickerHandler: (() => void) | null = null;
export function onThemePicker(fn: () => void): void {
    themePickerHandler = fn;
}
export function requestThemePicker(): void {
    themePickerHandler?.();
}

// opens the app-level Share modal; no host → no-op
let shareHandler: (() => void) | null = null;
export function onShare(fn: () => void): void {
    shareHandler = fn;
}
export function requestShare(): void {
    shareHandler?.();
}

// opens the shared media picker; no host → no-op
export interface MediaPickerRequest {
    onPick: (url: string, item?: MediaItem) => void; // item present when picked from the browser (carries the poster/thumb)
    onPickIcon?: (icon: IconPick) => void; // icon delivers a themed-glyph descriptor, not a url
    onRemove?: () => void; // present when a value is already set → picker offers a "Remove" action
    query?: string;
    kind?: MediaKind;
}
let mediaPickerHandler: ((req: MediaPickerRequest) => void) | null = null;
export function onMediaPicker(fn: (req: MediaPickerRequest) => void): void {
    mediaPickerHandler = fn;
}
export function requestMediaPicker(req: MediaPickerRequest): void {
    mediaPickerHandler?.(req);
}

// app registers the AI turn transport (POST /ai/turn, SSE); injected so the editor stays app-free
export type SectionStreamer = (
    request: TurnRequest,
    onEvent: (event: TurnEvent) => void,
    signal?: AbortSignal,
) => Promise<void>;
let sectionStreamer: SectionStreamer | null = null;
export function onSectionStream(fn: SectionStreamer): void {
    sectionStreamer = fn;
}
export function getSectionStreamer(): SectionStreamer | null {
    return sectionStreamer;
}

// app registers the "suggest sections" transport (POST /logic/suggest); no host → popup uses deterministic suggestions
export type SectionSuggester = (content: ArtifactContent) => Promise<string[]>;
let sectionSuggester: SectionSuggester | null = null;
export function onSuggestSections(fn: SectionSuggester): void {
    sectionSuggester = fn;
}
export function getSuggestSections(): SectionSuggester | null {
    return sectionSuggester;
}

// app registers element regeneration (POST /ai/element); no host → the Regenerate action stays hidden
export type ElementReviser = (
    content: ArtifactContent,
    sectionId: string,
    element: ElementInstance,
    instruction?: string,
) => Promise<ElementInstance>;
let elementReviser: ElementReviser | null = null;
export function onReviseElement(fn: ElementReviser): void {
    elementReviser = fn;
}
export function getReviseElement(): ElementReviser | null {
    return elementReviser;
}

// app registers text rewrite/translate (POST /ai/text); no host → the text AI menu doesn't appear
export interface TextAssistRequest {
    op: "rewrite" | "translate";
    text: string;
    instruction?: string; // rewrite: the directive
    language?: string; // translate: the target language
    context?: string; // full surrounding text when only a sub-range is selected
}
export type TextAssistant = (req: TextAssistRequest) => Promise<string>;
let textAssistant: TextAssistant | null = null;
export function onTextAssist(fn: TextAssistant): void {
    textAssistant = fn;
}
export function getTextAssist(): TextAssistant | null {
    return textAssistant;
}

// no editSeq bump, so loading never autosaves; the canvas redraws off currentArtifactId
export function loadArtifactContent(id: string, art: ArtifactContent): void {
    past.length = 0;
    future.length = 0;
    coalesceKey = null;
    editBefore = null;
    setEditing(null);
    setSelection(null);
    setHover(null);
    savedThemeUnderPreview = null;
    setPreviewingTheme(false);
    setCurrentArtifactId(id);
    setPending(new Map());
    stubs.clear();
    resolved.clear();
    requesting.clear();
    measured.clear();
    setContent(art);
    bumpHistory();
}

// a placeholder is never edited (nothing on screen to select), so swapping in real content skips history

const [pending, setPending] = createSignal<Map<string, SectionSummary>>(new Map());
export { pending };
export const isWindowed = (): boolean => pending().size > 0;

const stubs = new Map<string, Section>(); // the exact placeholder objects, for identity checks
const resolved = new Map<string, Section>(); // what each placeholder became

let loadSections: ((ids: string[]) => Promise<Section[]>) | null = null;
export function onLoadSections(fn: (ids: string[]) => Promise<Section[]>): void {
    loadSections = fn;
}

/** Load an artifact the server sliced: shell + index, with placeholders where content is missing. */
export function loadArtifactWindow(
    id: string,
    shell: ArtifactShell,
    index: SectionSummary[],
    have: Section[],
): void {
    const bySid = new Map(have.map((s) => [s.id, s]));
    const missing = new Map<string, SectionSummary>();
    const nextStubs = new Map<string, Section>();
    const sections = index.map((entry, i) => {
        const sid = entry.id ?? `s-${i}`;
        const real = bySid.get(sid);
        if (real) return real;
        const stub: Section = { id: sid, root: emptyRegion() };
        missing.set(sid, { ...entry, id: sid });
        nextStubs.set(sid, stub);
        return stub;
    });
    loadArtifactContent(id, { ...shell, sections });
    stubs.clear();
    for (const [sid, stub] of nextStubs) stubs.set(sid, stub);
    setPending(missing);
}

const requesting = new Set<string>();

/** Fetch the named placeholders and swap them in. Not an edit: no history entry, no autosave. */
export async function requestSections(ids: string[]): Promise<void> {
    const want = ids.filter((id) => pending().has(id) && !requesting.has(id));
    if (!want.length || !loadSections) return;
    // section ids collide across artifacts, so a response landing after a switch must be dropped
    const forArtifact = currentArtifactId();
    for (const id of want) requesting.add(id);
    try {
        const got = await loadSections(want);
        if (!got.length || currentArtifactId() !== forArtifact) return;
        const by = new Map(got.map((s) => [s.id, s]));
        for (const s of got) resolved.set(s.id, s);
        setContent((c) => ({ ...c, sections: c.sections.map((s) => by.get(s.id) ?? s) }));
        setPending((p) => {
            const next = new Map(p);
            for (const s of got) next.delete(s.id);
            return next;
        });
    } catch {
        /* leave them pending; the next window pass asks again */
    } finally {
        for (const id of want) requesting.delete(id);
    }
}

/** Everything, for the operations that cannot work on part of a document: export, present, AI, share. */
export async function ensureAllSections(): Promise<void> {
    while (pending().size) {
        const before = pending().size;
        await requestSections([...pending().keys()]);
        if (pending().size >= before) return; // no progress (offline) — don't spin
    }
}

// a painted height beats the byte estimate on re-reserve; bucketed by width, since height follows it
const measured = new Map<string, number>();
const heightKey = (id: string, width: number): string => `${id}@${Math.round(width / 40)}`;

export function rememberHeight(id: string, width: number, height: number): void {
    measured.set(heightKey(id, width), height);
}
export function knownHeight(id: string, width: number): number | undefined {
    return measured.get(heightKey(id, width));
}

// undo must not restore a placeholder over loaded content; the identity swap keeps edited sections
const hydrate = (art: ArtifactContent): ArtifactContent => {
    if (!resolved.size) return art;
    let changed = false;
    const sections = art.sections.map((s) => {
        if (stubs.get(s.id) !== s) return s;
        const now = resolved.get(s.id);
        if (!now) return s;
        changed = true;
        return now;
    });
    return changed ? { ...art, sections } : art;
};

function newSectionId(): string {
    return `s-${crypto.randomUUID().slice(0, 8)}`;
}

export function addSectionAfter(afterId: string | null): void {
    const sec: Section = { id: newSectionId(), root: emptyRegion() };
    const at = afterId
        ? editor.artifact.sections.findIndex((s) => s.id === afterId) + 1
        : editor.artifact.sections.length;
    commit(insertSection(editor.artifact, at, sec));
    setSelection({ kind: "section", section: sec.id });
}

export function duplicateSectionAt(id: string): void {
    commit(duplicateSection(editor.artifact, id, newSectionId()));
}

export function removeSectionAt(id: string): void {
    commit(removeSection(editor.artifact, id));
    setSelection(null);
}

export function moveSectionBy(id: string, delta: number): void {
    const secs = editor.artifact.sections;
    const i = secs.findIndex((s) => s.id === id);
    if (i < 0) return;
    // skip a clamped no-op at the ends so it doesn't push a spurious undo entry
    const j = Math.max(0, Math.min(secs.length - 1, i + delta));
    if (j !== i) commit(moveSection(editor.artifact, id, delta));
}

// index is 0..n in the pre-move ordering (drag-to-reorder)
export function moveSectionTo(id: string, index: number): void {
    const i = editor.artifact.sections.findIndex((s) => s.id === id);
    if (i < 0) return;
    const delta = (index > i ? index - 1 : index) - i;
    if (delta !== 0) commit(moveSection(editor.artifact, id, delta));
}

export const [presenting, setPresenting] = createSignal(false);
export const [slideIndex, setSlideIndex] = createSignal(0);

export function present(): void {
    setSlideIndex(0);
    setPresenting(true);
}
export function exitPresent(): void {
    setPresenting(false);
}
export function nextSlide(): void {
    setSlideIndex((i) => Math.min(editor.artifact.sections.length - 1, i + 1));
}
export function prevSlide(): void {
    setSlideIndex((i) => Math.max(0, i - 1));
}

// collapsed by default below desktop, where the minimap costs too much canvas
export const [leftOpen, setLeftOpen] = createSignal(isDesktop());
// the open flyout: a category, "search", "inspector", or null
export const [rightTab, setRightTab] = createSignal<string | null>(null);

export function jumpToSection(index: number): void {
    const el = canvasEl();
    if (!el) return;
    const top = editor.sectionTops[index] ?? 0;
    el.scrollTo({ top: Math.max(0, top - 18), behavior: "smooth" });
}
