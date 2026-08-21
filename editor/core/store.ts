import type { Region } from "@engine/node";
import type { ArtifactAccess, ElementAddress, Target } from "@model/artifact";
import { atLeast } from "@model/artifact";
import type {
    ArtifactContent,
    ArtifactShell,
    ElementInstance,
    Section,
    SectionOp,
    SectionSummary,
} from "@model/artifact";
import type { PlanLimits } from "@model/billing";
import type { TurnEvent, TurnRequest } from "@model/ai";
import type { IconPick, MediaCredit, MediaItem, MediaKind } from "@model/media";
import { createSignal } from "solid-js";
import type { Theme, Tokens } from "@themes";
import {
    childrenOf,
    duplicateSection,
    getElementAt,
    insertSection,
    moveSection,
    removeSection,
    setArtifactFormat,
} from "@elements/ops";
import {
    applySectionOps,
    contentWithElementIds,
    diffSections,
    emptyRegion,
    invertOps,
    narrowOps,
    sectionWithElementIds,
    targetsEqual,
} from "@model/artifact";
import { isDesktop } from "@ui/viewport";
import { capture } from "@ui/analytics";
import { asFormat, charsBucket, type ElementCategory } from "@model/analytics";
import { getElement } from "@elements/spec";
import { resolveTheme, THEMES } from "@themes";

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

// view-only: author a paged artifact at its slide shape instead of at each section's natural height
export const [slideFrame, setSlideFrame] = createSignal(false);

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

// History is per-user inverse ops, not document snapshots: replaying one person's undo must not roll
// back what someone else wrote in between. Each entry carries what it did and what puts it back, plus
// the title change riding along so a rename undoes with the edits around it.
interface HistoryEntry {
    forward: SectionOp[];
    inverse: SectionOp[];
    title?: { before: string; after: string };
    // what a remote write had touched when this was recorded; a later remote write on the same
    // target makes the entry unsafe to replay
    marks: Map<string, number>;
}
const past: HistoryEntry[] = [];
const future: HistoryEntry[] = [];
const HISTORY_CAP = 120;

// Bumped whenever a remote write lands on a target, so undo can tell "still mine" from "someone
// rewrote this". Keyed the same way pending local writes are: per data key, per section otherwise.
const remoteMarks = new Map<string, number>();
let remoteTick = 0;

function writeKeys(ops: SectionOp[]): string[] {
    const out: string[] = [];
    for (const op of ops) {
        if (op.kind === "data")
            for (const key of Object.keys(op.keys))
                out.push(`${op.sectionId}|${op.elementId}|${key}`);
        else if (op.kind === "set") out.push(op.section.id);
        else if (op.kind === "insert") out.push(op.section.id);
        else if (op.kind === "remove") out.push(op.id);
        else out.push("*"); // order and shell are document-wide
    }
    return out;
}

const markRemote = (ops: SectionOp[]): void => {
    remoteTick += 1;
    for (const key of writeKeys(ops)) remoteMarks.set(key, remoteTick);
};

const marksFor = (ops: SectionOp[]): Map<string, number> =>
    new Map(writeKeys(ops).map((key) => [key, remoteMarks.get(key) ?? 0]));

// A remote write since this entry was recorded means replaying it would clobber someone else's work,
// so the entry is dropped and undo moves on to the one behind it.
const stillMine = (entry: HistoryEntry): boolean => {
    for (const [key, at] of entry.marks) if ((remoteMarks.get(key) ?? 0) !== at) return false;
    return !entry.marks.has("*") || (remoteMarks.get("*") ?? 0) === entry.marks.get("*");
};

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

function pushEntry(entry: HistoryEntry, coalesce = false): void {
    const last = past.at(-1);
    if (coalesce && last) {
        // one interaction, one undo step: the merged entry undoes the whole run at once
        last.forward = [...last.forward, ...entry.forward];
        last.inverse = [...entry.inverse, ...last.inverse];
        if (entry.title)
            last.title = {
                before: last.title?.before ?? entry.title.before,
                after: entry.title.after,
            };
        for (const [key, at] of entry.marks) if (!last.marks.has(key)) last.marks.set(key, at);
        bumpHistory();
        return;
    }
    past.push(entry);
    if (past.length > HISTORY_CAP) past.shift();
    future.length = 0;
    bumpHistory();
}

// The caller's level on the open artifact, pushed in by the shell (editor/ may not import app/).
// Every mutation funnels through commit/commitOver, so gating here covers drag-drop, inline text,
// inspectors, and AI patches alike rather than relying on each surface to hide its own controls.
export const [editAccess, setEditAccess] = createSignal<ArtifactAccess>("edit");
export const canEdit = (): boolean => editAccess() === "edit";
export const canComment = (): boolean => atLeast(editAccess(), "comment");

// Every local write funnels through here: the ops are derived once, narrowed to the finest unit
// that expresses them, recorded with their inverse for undo, and sent to the room.
function record(
    base: ArtifactContent,
    next: ArtifactContent,
    opts?: { coalesce?: string; title?: { before: string; after: string } },
): void {
    const forward = narrowOps(base, diffSections(base, next));
    if (!forward.length && !opts?.title) return; // nothing changed by value; keep the painted objects
    const key = opts?.coalesce;
    const folding = !!key && key === coalesceKey;
    if (!folding) editCount += 1;
    pushEntry(
        {
            forward,
            inverse: invertOps(base, forward),
            marks: marksFor(forward),
            ...(opts?.title ? { title: opts.title } : {}),
        },
        folding,
    );
    if (key) armCoalesce(key);
    else coalesceKey = null;
    setContent(next);
    if (!forward.length) return; // a rename carries no content, so it costs no repaint or write
    bumpSeq();
    emitOps(forward);
}

export function commit(next: ArtifactContent, opts?: { coalesce?: string }): void {
    if (!canEdit()) return;
    record(content(), next, opts);
}

// baselines the undo step on `base`, for when the live tree holds a transient value (a skeleton)
export function commitOver(base: ArtifactContent, next: ArtifactContent): void {
    if (!canEdit()) return;
    coalesceKey = null;
    record(base, next);
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
    if (prevTheme !== null && prevTheme !== content().theme) {
        const kept = content();
        capture("theme_changed", {
            theme_id: kept.theme,
            from_theme_id: prevTheme,
            is_custom: !THEMES[kept.theme],
        });
        record({ ...kept, theme: prevTheme }, kept);
        return;
    }
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

// Replays one recorded batch and emits it like any other write, so undo travels to the room the
// same way the edit did. Entries whose target someone else has since rewritten are dropped.
function replay(
    stack: HistoryEntry[],
    other: HistoryEntry[],
    pick: (e: HistoryEntry) => SectionOp[],
    title: (e: HistoryEntry) => string | undefined,
): void {
    coalesceKey = null;
    for (;;) {
        const entry = stack.pop();
        if (!entry) {
            bumpHistory();
            return;
        }
        if (!stillMine(entry)) continue;
        const ops = hydrateOps(pick(entry));
        if (ops.length) {
            const applied = applySectionOps(content(), ops);
            if (!applied.ok) continue; // the document moved out from under it
            setContent(applied.content);
        }
        other.push({ ...entry, marks: marksFor(ops) });
        const t = title(entry);
        if (t !== undefined) restoreTitle(t);
        if (ops.length) {
            bumpSeq();
            emitOps(ops);
        }
        bumpHistory();
        return;
    }
}

export function undo(): void {
    replay(
        past,
        future,
        (e) => e.inverse,
        (e) => e.title?.before,
    );
}

export function redo(): void {
    replay(
        future,
        past,
        (e) => e.forward,
        (e) => e.title?.after,
    );
}

// live keystrokes update the artifact without touching history; one entry is recorded when it ends
const [editing, setEditing] = createSignal<ElementAddress | null>(null);
export { editing };

// viewport point where editing started; the caret goes there
const [editCaret, setEditCaret] = createSignal<{ x: number; y: number } | null>(null);
export { editCaret };

let editBefore: ArtifactContent | null = null;

export function startEditing(addr: ElementAddress, caret?: { x: number; y: number }): void {
    // The presence gate: someone else is already in this element, so entering would be co-typing.
    // Zero latency and it covers every entry point, since they all funnel through here.
    if (enterEditHandler && !enterEditHandler(addr)) return;
    editBefore = editor.artifact;
    editingElementId = getElementIdAt(editor.artifact, addr);
    setEditCaret(caret ?? null);
    // hover updates are suppressed while editing, so a stale value would strand the hover chrome
    setHover(null);
    setEditing(addr);
}

// The collaboration gate around an edit session, registered by the host. `enter` returns false when
// the element is held by someone else (and says so); returning true claims it. No host = solo.
type EnterEdit = (addr: ElementAddress) => boolean;
type LeaveEdit = (addr: ElementAddress) => void;
let enterEditHandler: EnterEdit | null = null;
let leaveEditHandler: LeaveEdit | null = null;

export function onEditSession(enter: EnterEdit, leave: LeaveEdit): void {
    enterEditHandler = enter;
    leaveEditHandler = leave;
}

// Characters under one element, for a bucket. The text itself never leaves the browser.
function textLength(el: ElementInstance | undefined): number {
    if (!el) return 0;
    const own =
        typeof (el.data as { text?: unknown }).text === "string"
            ? (el.data as { text: string }).text.length
            : 0;
    return (childrenOf(el) ?? []).reduce((n, k) => n + textLength(k), own);
}

export function stopEditing(): void {
    const addr = editing();
    // one entry per session: the keystrokes updated the tree live, this is where they become an edit
    if (editBefore && editBefore !== editor.artifact) {
        record(editBefore, editor.artifact);
        // Debounced by construction: a whole typing session is one event, not one per keystroke.
        if (addr) {
            const el = getElementAt(editor.artifact, addr);
            capture("text_edited", {
                element_type: el?.type ?? "",
                chars_delta_bucket: charsBucket(
                    textLength(el) - textLength(getElementAt(editBefore, addr)),
                ),
            });
        }
    }
    editBefore = null;
    editingElementId = undefined;
    setEditing(null);
    if (addr) leaveEditHandler?.(addr);
}

// a focused contenteditable won't reliably repaint an in-place change; a fresh mount always paints
export function remountEditing(): void {
    setEditing((a) => (a ? { ...a } : a));
}

export function setArtifactLive(next: ArtifactContent): void {
    setContent(next);
    bumpSeq();
}

// ---- collaboration: ops out, ops in ---------------------------------------------------------
//
// The room is the persistence driver while it is up, so every local batch goes out here and the
// server's ack is what advances the saved baseline. Remote batches come back through
// applyRemoteOps, which runs the same pure ops local editing does but never records history and
// never re-emits.

type OpsEmitter = (ops: SectionOp[]) => string | null; // the tag, or null when nothing went out
let opsEmitter: OpsEmitter | null = null;

// (write key -> tag) for everything sent but not yet acked. A remote value for a key we are still
// waiting on is discarded: unacked local wins, per key, which is what stops a colour and a
// keystroke on one element from fighting each other on screen.
const pendingByKey = new Map<string, string>();
// (tag -> the content that batch produced) so an ack can hand the autosave baseline forward
const pendingContent = new Map<string, ArtifactContent>();

export function onEmitOps(fn: OpsEmitter): void {
    opsEmitter = fn;
}

export function clearEmitOps(): void {
    opsEmitter = null;
    pendingByKey.clear();
    pendingContent.clear();
}

function emitOps(ops: SectionOp[]): void {
    if (!ops.length) return;
    const tag = opsEmitter?.(ops);
    if (!tag) return;
    pendingContent.set(tag, content());
    for (const key of writeKeys(ops)) pendingByKey.set(key, tag);
}

const clearPending = (tag: string): void => {
    for (const [key, held] of [...pendingByKey]) if (held === tag) pendingByKey.delete(key);
    pendingContent.delete(tag);
};

/** The server holds this batch now; the content it produced is the new save baseline. */
export function opsAcked(tag: string): ArtifactContent | null {
    const at = pendingContent.get(tag) ?? null;
    clearPending(tag);
    return at;
}

export function opsRejected(tag: string): void {
    clearPending(tag);
}

// Drops what we are still waiting on: a remote `data` op loses only its contested keys, a remote
// whole-section `set` loses to a pending local one outright. Structural ops are never dropped,
// because a removal has to land whatever else is in flight.
function admissible(ops: SectionOp[]): SectionOp[] {
    const out: SectionOp[] = [];
    for (const op of ops) {
        if (op.kind === "data") {
            if (pending().has(op.sectionId)) continue; // a placeholder refetches the truth anyway
            const keys: Record<string, unknown> = {};
            let any = false;
            for (const [k, v] of Object.entries(op.keys)) {
                if (pendingByKey.has(`${op.sectionId}|${op.elementId}|${k}`)) continue;
                keys[k] = v;
                any = true;
            }
            if (any) out.push({ ...op, keys });
        } else if (op.kind === "set") {
            if (!pendingByKey.has(op.section.id)) out.push(op);
        } else {
            out.push(op);
        }
    }
    return out;
}

/** False when the batch could not be applied, which is the caller's cue to resync. */
export function applyRemoteOps(ops: SectionOp[]): boolean {
    const usable = admissible(ops);
    markRemote(ops); // even a discarded op means someone else is in here, so undo must know
    if (!usable.length) return true;
    const applied = applySectionOps(content(), usable);
    if (!applied.ok) return false;
    if (unchanged(content(), applied.content)) return true;
    setContent(applied.content);
    // a remote write that fills in a placeholder resolves it, so the window stops asking for it
    for (const op of usable) {
        const filled = op.kind === "set" ? op.section : op.kind === "insert" ? op.section : null;
        if (!filled || !pending().has(filled.id)) continue;
        resolved.set(filled.id, filled);
        setPending((p) => {
            const next = new Map(p);
            next.delete(filled.id);
            return next;
        });
    }
    bumpSeq();
    endSessionIfGone();
    return true;
}

// A batch that resolves to the document already on screen must not repaint: the paint cache and the
// autosave diff both key on identity, so a needless new tree invalidates both for nothing.
const unchanged = (a: ArtifactContent, b: ArtifactContent): boolean =>
    a.sections.length === b.sections.length &&
    a.sections.every((s, i) => s === b.sections[i]) &&
    a.format === b.format &&
    a.theme === b.theme &&
    a.background === b.background &&
    a.page === b.page;

// Deletion wins: if a remote batch removed the element or section someone is typing in, their
// session ends rather than writing into a hole.
// The session counters. Reset when an artifact loads, read when it is torn down: this is the only
// place a session that produced no edits at all is visible. Edits are counted inside `record`, which
// is where a mutation actually becomes one: it has already dropped no-op commits and folded a
// coalesced drag into a single entry, so the count is edits rather than callbacks.
let sessionStartedAt = 0;
let editCount = 0;
let aiActionCount = 0;
let savedCleanly = true;

/** An AI action also produces an edit; `record` counts that half. */
export function noteAiAction(): void {
    aiActionCount += 1;
}

/** The autosave loop's verdict, which is the only place that knows whether the work survived. */
export function noteSaveState(ok: boolean): void {
    savedCleanly = ok;
}

let sessionEndedHandler: (() => void) | null = null;
export function onEditSessionEnded(fn: () => void): void {
    sessionEndedHandler = fn;
}

// the id, not the path: a remote write can leave the path valid while the element that was there
// is gone, and typing into whatever took its place is exactly the surprise this prevents
let editingElementId: string | undefined;

function getElementIdAt(art: ArtifactContent, addr: ElementAddress): string | undefined {
    const section = art.sections.find((s) => s.id === addr.section);
    return section ? getAtPath(section.root, addr.path)?.id : undefined;
}

function endSessionIfGone(): void {
    const addr = editing();
    if (!addr) return;
    const now = content().sections.find((s) => s.id === addr.section);
    const here = now ? getAtPath(now.root, addr.path) : undefined;
    if (here && (editingElementId === undefined || here.id === editingElementId)) return;
    editBefore = null; // the keystrokes had nowhere to land, so they are not an edit to record
    editingElementId = undefined;
    setEditing(null);
    setSelection(null);
    if (sessionStartedAt) {
        // Depends on a page-hide handler and will under-report, so no funnel should use it as a
        // denominator; it is still the only view of a session that was only a glance.
        capture("editor_session_ended", {
            ms: Date.now() - sessionStartedAt,
            format: asFormat(editor.artifact.format),
            section_count: editor.artifact.sections.length,
            edit_count: editCount,
            ai_action_count: aiActionCount,
            saved: savedCleanly,
        });
        sessionStartedAt = 0;
    }
    sessionEndedHandler?.();
}

function getAtPath(root: ElementInstance, path: number[]): ElementInstance | undefined {
    let node: ElementInstance | undefined = root;
    for (const i of path) {
        const data = node?.data as { children?: ElementInstance[] } | undefined;
        const kids: ElementInstance[] | undefined = Array.isArray(data?.children)
            ? data.children
            : undefined;
        node = kids?.[i];
        if (!node) return undefined;
    }
    return node;
}

// An undo can name a section that was a placeholder when the entry was recorded; the swap keeps
// the loaded content rather than putting the stub back on screen.
const hydrateOps = (ops: SectionOp[]): SectionOp[] =>
    ops.map((op) => {
        if (op.kind !== "set" && op.kind !== "insert") return op;
        return stubs.get(op.section.id) === op.section
            ? { ...op, section: resolved.get(op.section.id) ?? op.section }
            : op;
    });

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
    const before = currentTitle();
    const live = content();
    // a rename carries no content ops, so it is its own history entry rather than a snapshot
    record(live, live, { title: { before, after: t } });
    setTitleLocal(t);
    const id = currentArtifactId();
    if (id) persistTitleHandler?.(id, t);
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

// app registers the credits reader (GET /artifacts/:id/credits). Provenance lives on the asset row,
// so the tree cannot answer this and the editor has to ask.
let creditsReader: ((artifactId: string) => Promise<MediaCredit[]>) | null = null;
export function onArtifactCredits(fn: (artifactId: string) => Promise<MediaCredit[]>): void {
    creditsReader = fn;
}
export function artifactCredits(artifactId: string): Promise<MediaCredit[]> {
    return creditsReader?.(artifactId) ?? Promise.resolve([]);
}

// app registers the url adopter (POST /media/link). A url typed into an inspector becomes an asset
// like any other picked media, so the workspace library stays complete.
let linkAdopter: ((url: string) => Promise<string>) | null = null;
export function onAdoptLink(fn: (url: string) => Promise<string>): void {
    linkAdopter = fn;
}
export function adoptLink(url: string): Promise<string> {
    return linkAdopter?.(url) ?? Promise.resolve(url);
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
    sessionStartedAt = Date.now();
    editCount = 0;
    aiActionCount = 0;
    savedCleanly = true;
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
    // The one client-side stamping pass: everything below works with the tree as loaded, and it is
    // identity-preserving, so an already-stamped document (every server write stamps) is untouched.
    setContent(contentWithElementIds(art));
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
    const sections = index.map((entry, i) => {
        const sid = entry.id ?? `s-${i}`;
        const real = bySid.get(sid);
        if (real) return real;
        missing.set(sid, { ...entry, id: sid });
        return { id: sid, root: emptyRegion() };
    });
    loadArtifactContent(id, { ...shell, sections });
    stubs.clear();
    // read the placeholders back out of the loaded tree: stamping ids rebuilds a stub, and it is
    // this object identity that later tells a placeholder from the section that replaced it
    for (const s of editor.artifact.sections) if (missing.has(s.id)) stubs.set(s.id, s);
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
        const loaded = await loadSections(want);
        if (!loaded.length || currentArtifactId() !== forArtifact) return;
        const got = loaded.map(sectionWithElementIds);
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
// slide framing changes a section's height at the same width, so it keys the memo too
const heightKey = (id: string, width: number): string =>
    `${id}@${Math.round(width / 40)}${slideFrame() ? ":slide" : ""}`;

export function rememberHeight(id: string, width: number, height: number): void {
    measured.set(heightKey(id, width), height);
}
export function knownHeight(id: string, width: number): number | undefined {
    return measured.get(heightKey(id, width));
}

function newSectionId(): string {
    return `s-${crypto.randomUUID().slice(0, 8)}`;
}

const CATEGORIES: readonly ElementCategory[] = [
    "text",
    "media",
    "table",
    "composite",
    "basic",
    "chart",
    "diagram",
];

const isCategory = (v: string): v is ElementCategory => CATEGORIES.includes(v as ElementCategory);

// A spec's category is a free string; anything outside the palette's seven reads as basic.
const categoryOf = (type: string): ElementCategory => {
    const c = getElement(type)?.category ?? "";
    return isCategory(c) ? c : "basic";
};

/**
 * Every section that lands reports here, whichever surface put it there.
 *
 * `how` covers the three the taxonomy names. Not every one has a surface yet: the AI path reports
 * from `core/ai.ts`, and there is no template-insert in the editor to report from, so that value
 * waits for the feature rather than the feature waiting for instrumentation.
 */
export function noteSectionAdded(how: "button" | "ai" | "template", atIndex: number): void {
    capture("section_added", {
        how,
        at_index: atIndex,
        section_count: editor.artifact.sections.length,
    });
}

/** Every element that lands in the tree reports here, whichever gesture put it there. */
export function noteElementAdded(type: string, how: "palette" | "drag" | "paste" | "ai"): void {
    capture("element_added", { element_type: type, category: categoryOf(type), how });
}

export function noteElementResized(type: string, kind: "height" | "aspect"): void {
    capture("element_resized", { element_type: type, kind });
}

/** `same_section` separates rearranging one section from moving work between them. */
export function noteElementMoved(type: string, sameSection: boolean): void {
    capture("element_moved", { element_type: type, same_section: sameSection });
}

export function noteElementRemoved(type: string): void {
    capture("element_removed", { element_type: type, category: categoryOf(type) });
}

/** One artifact rendered three ways is the product's premise, so the switch is worth counting. */
export function switchFormat(to: string): void {
    const from = editor.artifact.format;
    if (from === to) return;
    commit(setArtifactFormat(editor.artifact, to));
    capture("format_switched", {
        from: asFormat(from),
        to: asFormat(to),
        section_count: editor.artifact.sections.length,
    });
}

export function addSectionAfter(afterId: string | null): void {
    const sec: Section = { id: newSectionId(), root: emptyRegion() };
    const at = afterId
        ? editor.artifact.sections.findIndex((s) => s.id === afterId) + 1
        : editor.artifact.sections.length;
    commit(insertSection(editor.artifact, at, sec));
    noteSectionAdded("button", at);
    setSelection({ kind: "section", section: sec.id });
}

export function duplicateSectionAt(id: string): void {
    commit(duplicateSection(editor.artifact, id, newSectionId()));
    capture("section_duplicated", {});
}

export function removeSectionAt(id: string): void {
    commit(removeSection(editor.artifact, id));
    capture("section_removed", { section_count_after: editor.artifact.sections.length });
    setSelection(null);
}

export function moveSectionBy(id: string, delta: number): void {
    const secs = editor.artifact.sections;
    const i = secs.findIndex((s) => s.id === id);
    if (i < 0) return;
    // skip a clamped no-op at the ends so it doesn't push a spurious undo entry
    const j = Math.max(0, Math.min(secs.length - 1, i + delta));
    if (j !== i) {
        commit(moveSection(editor.artifact, id, delta));
        capture("section_reordered", { from_index: i, to_index: j });
    }
}

// index is 0..n in the pre-move ordering (drag-to-reorder)
export function moveSectionTo(id: string, index: number): void {
    const i = editor.artifact.sections.findIndex((s) => s.id === id);
    if (i < 0) return;
    const delta = (index > i ? index - 1 : index) - i;
    if (delta !== 0) {
        commit(moveSection(editor.artifact, id, delta));
        capture("section_reordered", { from_index: i, to_index: i + delta });
    }
}

export const [presenting, setPresenting] = createSignal(false);
export const [slideIndex, setSlideIndex] = createSignal(0);

// Presenting is an output, so it counts toward activation the same way an export does.
let presentStartedAt = 0;
let slidesAdvanced = 0;

export function present(): void {
    setSlideIndex(0);
    presentStartedAt = Date.now();
    slidesAdvanced = 0;
    setPresenting(true);
}
export function exitPresent(): void {
    if (presentStartedAt)
        capture("presented", {
            artifact_format: asFormat(editor.artifact.format),
            section_count: editor.artifact.sections.length,
            slides_advanced: slidesAdvanced,
            ms: Date.now() - presentStartedAt,
        });
    presentStartedAt = 0;
    setPresenting(false);
}
export function nextSlide(): void {
    setSlideIndex((i) => {
        const next = Math.min(editor.artifact.sections.length - 1, i + 1);
        if (next !== i) slidesAdvanced += 1;
        return next;
    });
}
export function prevSlide(): void {
    setSlideIndex((i) => Math.max(0, i - 1));
}

// collapsed by default below desktop, where the minimap costs too much canvas
export const [leftOpen, setLeftOpen] = createSignal(isDesktop());
// the open flyout: a category, "search", "inspector", or null
export const [rightTab, setRightTab] = createSignal<string | null>(null);

/**
 * A drag closes the flyout so it stops covering the drop targets, and the selection the drop makes
 * must not spring it back open on top of what was just placed. The flag is consumed by the
 * auto-open effect on the very next selection change, so it suppresses exactly one.
 */
let droppedSelection = false;
export const noteDropSelection = (): void => {
    droppedSelection = true;
};
export const takeDropSelection = (): boolean => {
    const was = droppedSelection;
    droppedSelection = false;
    return was;
};

export function jumpToSection(index: number): void {
    const el = canvasEl();
    if (!el) return;
    const top = editor.sectionTops[index] ?? 0;
    el.scrollTo({ top: Math.max(0, top - 18), behavior: "smooth" });
}
