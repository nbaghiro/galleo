import type { Region } from "@engine/node";
import type { ElementAddress, Target } from "@model/target";
import type { ArtifactContent, ElementInstance, Section } from "@model/artifact";
import type { PlanLimits } from "@model/billing";
import type { TurnEvent, TurnRequest } from "@model/ai";
import type { IconPick, MediaKind } from "@model/media";
import { createSignal } from "solid-js";
import type { Theme, Tokens } from "@themes";
import { duplicateSection, insertSection, moveSection, removeSection } from "@elements/ops";
import { emptyRegion } from "@model/section";
import { targetsEqual } from "@model/target";
import { resolveTheme } from "@themes";

// The editor's reactive state: the open artifact + computed section offsets, the current selection /
// hover target, and the geometry regions the canvas reports (in canvas-content coordinates).

// The blank starting artifact; the app replaces it via loadArtifactContent once the real one is fetched
// from the backend. (Persistence + the doc library are the API's job — the studio no longer hardcodes
// demo fixtures or its own localStorage layer.)
const EMPTY_ARTIFACT: ArtifactContent = {
    format: "deck",
    theme: "studio",
    sections: [{ id: "s-1", root: emptyRegion() }],
};

// The open artifact is an immutable value in a plain signal: every write REPLACES the whole tree (content
// ops return a fresh tree with structural sharing), so it is never mutated in place. That is what makes
// undo correct — a history snapshot is just the value, and past values are never touched again.
const [content, setContent] = createSignal<ArtifactContent>(EMPTY_ARTIFACT);
export { content };

// Painted section-top offsets — transient geometry the canvas reports, not undoable.
const [sectionTops, setSectionTops] = createSignal<number[]>([]);
export { sectionTops, setSectionTops };

// Read facade: `editor.artifact` / `editor.sectionTops` stay reactive (each getter calls its signal, so a
// read tracks it). Because `.artifact` returns the immutable value, ops built from `editor.artifact` are
// built from immutable data — history-safe by construction.
export const editor = {
    get artifact(): ArtifactContent {
        return content();
    },
    get sectionTops(): number[] {
        return sectionTops();
    },
};

// The resolved theme for the open artifact — the single place the studio derives its theme from the
// artifact's theme id (reactive: reads editor.artifact.theme).
export const editorTheme = (): Theme => resolveTheme(editor.artifact.theme);
export const editorTokens = (): Tokens => editorTheme().tokens;
export const editorAccent = (): string => editorTokens().accent;

const [canvasEl, setCanvasEl] = createSignal<HTMLElement | null>(null);
export { canvasEl, setCanvasEl };

// The width the canvas currently lays its section stack out at (fullW, panel gutters already removed) —
// set by the canvas on every draw. The minimap reads it so a thumbnail lays out at the editor's exact
// width and is a true scaled-down copy (matching text wraps), not a re-wrap in a narrower box.
const [canvasContentWidth, setCanvasContentWidth] = createSignal(1120);
export { canvasContentWidth, setCanvasContentWidth };

// The painted stage element (content coords for the overlays). Used to width-aware-place the
// floating element inspector beside its element.
const [stageEl, setStageEl] = createSignal<HTMLElement | null>(null);
export { stageEl, setStageEl };

export const [regions, setRegions] = createSignal<Region[]>([]);
export const [selection, setSelection] = createSignal<Target | null>(null, {
    equals: targetsEqual,
});
export const [hover, setHover] = createSignal<Target | null>(null, { equals: targetsEqual });

// Export features — the app pushes these from the workspace plan (@model/billing limits) so the
// export menu can gate paid formats and keep/strip the Galleo mark. The editor stays app-free (data in,
// no import back into app); defaults are the most-restrictive Free set, so a studio with no host still
// gates correctly rather than leaking paid exports.
export type ExportFeatures = Pick<PlanLimits, "exportFormats" | "removeBranding" | "publicLinks">;
const [features, setFeatures] = createSignal<ExportFeatures>({
    exportFormats: ["png"],
    removeBranding: false,
    publicLinks: false, // status-aware value pushed by the app; Free/most-restrictive default
});
export { features, setFeatures };

// Snapshot history. Every edit — content OR host metadata (the artifact title) — goes through this, so a
// single undo stack covers everything. A snapshot pairs the content tree with the title at that instant.
interface DocSnapshot {
    content: ArtifactContent;
    title: string;
}
const past: DocSnapshot[] = [];
const future: DocSnapshot[] = [];
const HISTORY_CAP = 120; // bound the stacks so long sessions don't grow without limit

// Bumped whenever the stacks change, so canUndo/canRedo drive the toolbar buttons reactively.
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

// A monotonic edit counter the canvas reads to force a redraw on every edit, in ANY format — a
// reliable trigger independent of fine-grained store-path tracking through the layout pipeline.
const [editSeq, setEditSeq] = createSignal(0);
export { editSeq };
const bumpSeq = (): void => {
    setEditSeq((n) => n + 1);
};

const snapshot = (): DocSnapshot => ({ content: content(), title: currentTitle() });

// Coalescing: a continuous interaction (dragging a slider, scrubbing a color) commits many times but
// should read as ONE undo step. Callers pass a stable `coalesce` key; consecutive commits with the same
// key (within a short idle window) fold into the first entry instead of stacking new ones.
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
        // same interaction as the previous commit — update content, keep the single history entry
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

// Commit `next` as ONE undo step whose baseline is `base`, not the current live tree. Used when the live
// tree is holding a transient value that must not become the undo target — e.g. the insert-a-section flow
// paints a placeholder skeleton live (via setArtifactLive, no history), then lands the real section with
// this so a single undo removes the whole new section and leaves no placeholder behind.
export function commitOver(base: ArtifactContent, next: ArtifactContent): void {
    pushPast({ content: base, title: currentTitle() });
    setContent(next);
    bumpSeq();
}

// --- theme preview (non-destructive "open in app theme") ---
// Swap the rendered theme so the whole editor recolors, but remember the artifact's real saved theme
// so autosave keeps persisting THAT — until the user explicitly keeps the previewed one. The swap
// doesn't bump editSeq, so previewing on its own never triggers a save.
const [previewingTheme, setPreviewingTheme] = createSignal(false);
export { previewingTheme };
let savedThemeUnderPreview: string | null = null;

export function startThemePreview(themeId: string): void {
    if (themeId === content().theme) return;
    savedThemeUnderPreview = content().theme;
    setContent({ ...content(), theme: themeId });
    setPreviewingTheme(true);
}

// Promote the previewed theme to the artifact's saved theme (persists on the next autosave). Recorded as
// a normal history step (against the pre-preview theme) so keeping a previewed theme is undoable.
export function keepPreviewedTheme(): void {
    if (!previewingTheme()) return;
    const prevTheme = savedThemeUnderPreview;
    savedThemeUnderPreview = null;
    setPreviewingTheme(false);
    if (prevTheme !== null && prevTheme !== content().theme)
        pushPast({ content: { ...content(), theme: prevTheme }, title: currentTitle() });
    bumpSeq();
}

// Drop the preview and restore the saved theme in the live editor (on revert / editor exit).
export function endThemePreview(): void {
    if (savedThemeUnderPreview !== null)
        setContent({ ...content(), theme: savedThemeUnderPreview });
    savedThemeUnderPreview = null;
    setPreviewingTheme(false);
}

// The original saved theme while previewing (for labelling), else null.
export function previewSavedTheme(): string | null {
    return savedThemeUnderPreview;
}

// The theme id autosave must write: the real saved theme while previewing, else the live one.
export function themeForPersist(): string {
    return savedThemeUnderPreview ?? content().theme;
}

export function undo(): void {
    const prev = past.pop();
    if (prev === undefined) return;
    coalesceKey = null;
    future.push(snapshot());
    setContent(prev.content);
    restoreTitle(prev.title);
    bumpSeq();
    bumpHistory();
}

export function redo(): void {
    const next = future.pop();
    if (next === undefined) return;
    coalesceKey = null;
    past.push(snapshot());
    setContent(next.content);
    restoreTitle(next.title);
    bumpSeq();
    bumpHistory();
}

// Inline text editing: live keystrokes update the artifact WITHOUT touching history; one history
// entry is recorded for the whole edit when it ends (so undo restores the pre-edit text).
const [editing, setEditing] = createSignal<ElementAddress | null>(null);
export { editing };

// Client (viewport) point where the user clicked to start editing — the caret is placed there.
const [editCaret, setEditCaret] = createSignal<{ x: number; y: number } | null>(null);
export { editCaret };

let editBefore: ArtifactContent | null = null;

export function startEditing(addr: ElementAddress, caret?: { x: number; y: number }): void {
    editBefore = editor.artifact;
    setEditCaret(caret ?? null);
    // Clear hover: mouse-move hover updates are suppressed for the whole edit session (Canvas.onPointerMove
    // bails while editing), so any lingering value is stale — it would strand hover chrome (the drag handle,
    // the hover ring) on the previously-hovered element while a DIFFERENT one is being edited. Selection,
    // which tracks the edited element, still drives that chrome to the right place.
    setHover(null);
    setEditing(addr);
}

export function stopEditing(): void {
    if (editBefore && editBefore !== editor.artifact)
        pushPast({ content: editBefore, title: currentTitle() });
    editBefore = null;
    setEditing(null);
}

// Re-mount the inline editor overlay in place — same element, same edit session (history untouched). A fresh
// address reference re-keys the editing <Show>, so the contenteditable is rebuilt from the current model. Used
// after an AI text edit: that change lands in an async continuation, and the browser won't reliably repaint an
// in-place imperative change to a focused contenteditable until the next interaction — a fresh mount always
// paints, so the new text shows immediately.
export function remountEditing(): void {
    setEditing((a) => (a ? { ...a } : a));
}

export function setArtifactLive(next: ArtifactContent): void {
    setContent(next);
    bumpSeq();
}

// --- documents from the backend (the app populates these + handles loading/switching) ---
export interface ArtifactSummary {
    id: string;
    title: string;
    themeId?: string;
}
export const [artifacts, setArtifacts] = createSignal<ArtifactSummary[]>([]);
export const [currentArtifactId, setCurrentArtifactId] = createSignal<string | null>(null);

// The open artifact's title lives in this mirror (the app populates it + owns persistence). It's part of
// every history snapshot, so a rename undoes/redoes right alongside content edits.
export const currentTitle = (): string =>
    artifacts().find((d) => d.id === currentArtifactId())?.title ?? "Untitled";

function setTitleLocal(title: string): void {
    const id = currentArtifactId();
    setArtifacts((list) => list.map((d) => (d.id === id ? { ...d, title } : d)));
}

// The app registers how to persist a title (API write + syncing its library list). Studio-alone → no-op.
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

// Rename the open artifact — one undoable step; content is untouched, only the title + persistence move.
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

// The app registers a handler so the studio's wordmark can navigate back to the library.
let homeHandler: (() => void) | null = null;
export function onHome(fn: () => void): void {
    homeHandler = fn;
}
export function requestHome(): void {
    homeHandler?.();
}

// The app registers a handler so a locked export (a paid format on the Free plan) can send the user to
// the pricing page. No-op when the studio runs without an app host.
let upgradeHandler: (() => void) | null = null;
export function onUpgrade(fn: () => void): void {
    upgradeHandler = fn;
}
export function requestUpgrade(): void {
    upgradeHandler?.();
}

// The app registers a handler so the studio's theme control can open the app-level theme drawer
// (the singular switcher). No-op when the studio runs without an app host.
let themePickerHandler: (() => void) | null = null;
export function onThemePicker(fn: () => void): void {
    themePickerHandler = fn;
}
export function requestThemePicker(): void {
    themePickerHandler?.();
}

// The app registers a handler so the studio's Share control can open the app-level Share modal (publish /
// public links / recipients). No-op when the studio runs without an app host.
let shareHandler: (() => void) | null = null;
export function onShare(fn: () => void): void {
    shareHandler = fn;
}
export function requestShare(): void {
    shareHandler?.();
}

// The app registers a handler so the editor's image controls (image element + section background) can
// open the shared media picker. A request carries the callback that receives the chosen image url and an
// optional starting search query. No-op when the studio runs without an app host.
export interface MediaPickerRequest {
    onPick: (url: string) => void;
    onPickIcon?: (icon: IconPick) => void; // icon kind delivers a themed-glyph descriptor, not a url
    query?: string;
    kind?: MediaKind; // which media kind to open the picker for (photo · gif · illustration · sticker · icon)
}
let mediaPickerHandler: ((req: MediaPickerRequest) => void) | null = null;
export function onMediaPicker(fn: (req: MediaPickerRequest) => void): void {
    mediaPickerHandler = fn;
}
export function requestMediaPicker(req: MediaPickerRequest): void {
    mediaPickerHandler?.(req);
}

// The app registers how to run an AI turn (POST /ai/turn over SSE). The insert-a-section flow streams a
// `section` turn through it; kept as an injected transport so the editor stays app-free (no import of the
// app's api). No host registered → the generate-a-section action is simply unavailable.
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

// The app registers a cheap "suggest sections" transport (POST /ai/suggest) so the insert-a-section popup
// can offer content-specific ideas on demand. Injected (editor stays app-free); no host → the popup falls
// back to its free deterministic suggestions.
export type SectionSuggester = (content: ArtifactContent) => Promise<string[]>;
let sectionSuggester: SectionSuggester | null = null;
export function onSuggestSections(fn: SectionSuggester): void {
    sectionSuggester = fn;
}
export function getSuggestSections(): SectionSuggester | null {
    return sectionSuggester;
}

// The app registers how to regenerate ONE element (POST /ai/element) — a single call returning a fresh
// version of the element to swap in place. Injected so the editor stays app-free; no host registered → the
// ContextBar's Regenerate action stays hidden (see canRegenerate in ai/element-gen).
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

// The app registers how to rewrite / translate ONE passage of selected text (POST /ai/text) — a single fast
// call returning the edited string the editor splices back into the selection. Injected so the editor stays
// app-free; no host → the text AI menu doesn't appear.
export interface TextAssistRequest {
    op: "rewrite" | "translate";
    text: string; // the selected passage to edit
    instruction?: string; // rewrite: the directive (e.g. "make it punchier")
    language?: string; // translate: the target language
    context?: string; // the full surrounding text, when only a sub-range is selected
}
export type TextAssistant = (req: TextAssistRequest) => Promise<string>;
let textAssistant: TextAssistant | null = null;
export function onTextAssist(fn: TextAssistant): void {
    textAssistant = fn;
}
export function getTextAssist(): TextAssistant | null {
    return textAssistant;
}

// Load an artifact (fetched from the API) into the editor. Resets transient state; does NOT bump
// editSeq, so it won't trigger an autosave — the canvas redraws because it also tracks currentArtifactId.
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
    setContent(art);
    bumpHistory();
}

// --- section management ---
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
    commit(moveSection(editor.artifact, id, delta));
}

// Move a section to an absolute drop position (0..n, in the pre-move ordering) — for drag-to-reorder.
export function moveSectionTo(id: string, index: number): void {
    const i = editor.artifact.sections.findIndex((s) => s.id === id);
    if (i < 0) return;
    const delta = (index > i ? index - 1 : index) - i;
    if (delta !== 0) commit(moveSection(editor.artifact, id, delta));
}

// --- present mode ---
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

// --- floating panels (rail + element panel float over a full-width canvas) ---
export const [leftOpen, setLeftOpen] = createSignal(true);
// Right side is an always-on icon rail; rightTab is the open flyout: a category, "search", "inspector", or null.
export const [rightTab, setRightTab] = createSignal<string | null>(null);

export function jumpToSection(index: number): void {
    const el = canvasEl();
    if (!el) return;
    const top = editor.sectionTops[index] ?? 0;
    el.scrollTo({ top: Math.max(0, top - 18), behavior: "smooth" });
}
