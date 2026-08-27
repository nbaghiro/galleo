import type { Region } from "@engine/node";
import type { ArtifactAccess, ElementAddress, Target } from "@model/artifact";
import { atLeast } from "@model/artifact";
import type {
    ArtifactContent,
    ArtifactShell,
    ElementInstance,
    Section,
    SectionNotes,
    SectionOp,
    SectionSummary,
} from "@model/artifact";
import type { PlanId, PlanLimits } from "@model/billing";
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
    addressesEqual,
    applySectionOps,
    comparePaths,
    contentWithElementIds,
    diffSections,
    emptyRegion,
    invertOps,
    isAncestorAddress,
    narrowOps,
    sectionWithElementIds,
    targetsEqual,
} from "@model/artifact";
import { isDesktop, isPhone } from "@ui/viewport";
import type { NarrationSource, SoundtrackSource } from "@ui/narration";
import { capture } from "@ui/analytics";
import { asFormat, charsBucket, type ElementCategory } from "@model/analytics";
import { getElement } from "@elements/spec";
import { profileFor } from "@engine/profile";
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

// The autofit scale each section was painted at (1 = authored size). Render-time only, like the
// tops: nothing here is stored, and the inspector keeps showing authored values.
const [sectionFits, setSectionFits] = createSignal<number[]>([]);
export { sectionFits, setSectionFits };

// getters call their signal, so a read stays reactive
export const editor = {
    get artifact(): ArtifactContent {
        return content();
    },
    get sectionTops(): number[] {
        return sectionTops();
    },
    get sectionFits(): number[] {
        return sectionFits();
    },
};

/** What the canvas painted this section's type at, for chrome that must match it. */
export function sectionFitScale(id: string): number {
    const i = editor.artifact.sections.findIndex((s) => s.id === id);
    return (i >= 0 ? editor.sectionFits[i] : 1) ?? 1;
}

// Held while an inline edit is open, so a keystroke that crosses a wrap boundary cannot re-solve
// the scale and resize the type under the caret. Dropped on commit, which re-solves.
const [fitFreeze, setFitFreeze] = createSignal<{ id: string; scale: number } | null>(null);
export { fitFreeze };

export const editorTheme = (): Theme => resolveTheme(editor.artifact.theme);
export const editorTokens = (): Tokens => editorTheme().tokens;
export const editorAccent = (): string => editorTokens().accent;

const [canvasEl, setCanvasEl] = createSignal<HTMLElement | null>(null);
export { canvasEl, setCanvasEl };

// the width the stack is laid out at; the minimap reads it so a thumb wraps text identically
const [canvasContentWidth, setCanvasContentWidth] = createSignal(1120);
export { canvasContentWidth, setCanvasContentWidth };

// The canvas's left gutter in client px: the padding the board is inset by. That band is paintable
// (a scroll container clips at its padding box, not its content box) though unreachable by scroll,
// so a handle may clamp against it to sit outside a full-bleed section. Written by each draw.
const [boardGutterL, setBoardGutterL] = createSignal(28);
export { boardGutterL, setBoardGutterL };

// The margin handles an element wears while the pointer is on it: the drag grip off its left edge,
// the comment chip off its right. They are read as a pair, so the geometry is stated once here
// rather than once per panel. It drifted the first time each owned its own, by 2px horizontally,
// which is small enough to look like sloppiness and big enough to see.

/** How far outside the element's edge a handle sits, on either side. */
export const HANDLE_GAP = 10;
/** The pill itself (h-5). Width is each handle's own, since a bubble needs squarer room than dots. */
export const HANDLE_H = 20;
// The pill plus slack. Each handle's container is a hover bridge spanning the gap to its element,
// and the extra height is what catches a pointer wobbling vertically while it crosses.
export const HANDLE_BRIDGE_H = 26;
/**
 * Where a handle's pill sits against the box it belongs to: flush with its top edge, which is what
 * "the handle for this block" means and what puts the pair level with its first line of content.
 * The selection outline is drawn at the box itself, so flush here reads as flush on screen.
 *
 * One exception, and only one: a box shorter than the pill, where flush would leave the handle
 * hanging out of the bottom. There it centres, so it overhangs evenly instead of pointing at
 * nothing. An earlier version centred inside a band at the top of every box, which fixed a one-line
 * element and inset every tall one by 10px for no reason anybody could see.
 */
export function handleTop(box: { y: number; h: number }): number {
    return box.y + Math.min(0, (box.h - HANDLE_H) / 2);
}

// View-only: author a paged artifact at its slide shape instead of at each section's natural height.
// Persisted, because it is how someone wants to see every deck rather than a per-visit choice, and
// losing it on refresh means re-framing the canvas after each reload. localStorage rather than the
// account row, for the same reason the library layout lives there: it is a per-device view.
const SLIDE_FRAME_KEY = "galleo:slide-frame";
let storedSlideFrame = false;
try {
    storedSlideFrame = localStorage.getItem(SLIDE_FRAME_KEY) === "1";
} catch {
    /* storage unavailable — use the default */
}
const [slideFrame, setSlideFrameSignal] = createSignal(storedSlideFrame);
export { slideFrame };

export function setSlideFrame(v: boolean | ((prev: boolean) => boolean)): void {
    const next = typeof v === "function" ? v(slideFrame()) : v;
    setSlideFrameSignal(next);
    try {
        localStorage.setItem(SLIDE_FRAME_KEY, next ? "1" : "0");
    } catch {
        /* storage unavailable */
    }
}

// painted stage element, in content coords
const [stageEl, setStageEl] = createSignal<HTMLElement | null>(null);
export { stageEl, setStageEl };

export const [regions, setRegions] = createSignal<Region[]>([]);
const [selection, setSelectionOnly] = createSignal<Target | null>(null, {
    equals: targetsEqual,
});
export { selection };
export const [hover, setHover] = createSignal<Target | null>(null, { equals: targetsEqual });

// The chart datum under the pointer, as a `datum:` region id. One signal for both directions: the
// canvas writes it on hover and the open data grid lights the matching row, and the grid writes it
// on row hover and the canvas outlines every mark that carries the id.
export const [datum, setDatum] = createSignal<string | null>(null);

// Multi-select rides beside the anchor rather than replacing it: `selection` keeps its exact meaning
// and every consumer that genuinely needs one element stays untouched, while the set-aware surfaces
// read `selectedAddresses`. Elements only, and never an element together with its own ancestor.
const [extras, setExtras] = createSignal<ElementAddress[]>([]);
export { extras };

function normalizeExtras(primary: ElementAddress, list: ElementAddress[]): ElementAddress[] {
    const out: ElementAddress[] = [];
    for (const a of list) {
        if (addressesEqual(a, primary)) continue;
        if (isAncestorAddress(a, primary) || isAncestorAddress(primary, a)) continue;
        if (out.some((k) => addressesEqual(k, a) || isAncestorAddress(k, a))) continue;
        for (let i = out.length - 1; i >= 0; i--)
            if (isAncestorAddress(a, out[i]!)) out.splice(i, 1);
        out.push(a);
    }
    return out;
}

/** Every plain selection collapses the set; only the shift gesture below carries it forward. */
export function setSelection(v: Target | null | ((prev: Target | null) => Target | null)): void {
    setSelectionOnly((prev) => (typeof v === "function" ? v(prev) : v));
    if (extras().length) setExtras([]);
}

export function clearExtras(): void {
    if (extras().length) setExtras([]);
}

/** Shift-click: add, remove, or (on the anchor itself) demote and promote the first extra. */
export function toggleExtra(addr: ElementAddress): void {
    const primary = selection();
    if (primary?.kind !== "element") {
        setSelection({ kind: "element", address: addr });
        return;
    }
    if (addressesEqual(primary.address, addr)) {
        const [next, ...rest] = extras();
        setSelectionOnly(next ? { kind: "element", address: next } : null);
        setExtras(rest);
        return;
    }
    const held = extras();
    const without = held.filter((a) => !addressesEqual(a, addr));
    const list = without.length < held.length ? without : [...held, addr];
    setExtras(normalizeExtras(primary.address, list));
}

/** Re-seeds the selection after a batch op: the first address becomes the anchor. */
export function selectMany(addrs: ElementAddress[]): void {
    const [first, ...rest] = addrs;
    setSelectionOnly(first ? { kind: "element", address: first } : null);
    setExtras(first ? normalizeExtras(first, rest) : []);
}

/** The whole selection in document order; empty unless an element is the anchor. */
export function selectedAddresses(): ElementAddress[] {
    const s = selection();
    if (s?.kind !== "element") return [];
    const order = new Map(editor.artifact.sections.map((sec, i) => [sec.id, i]));
    return [s.address, ...extras()].sort(
        (a, b) =>
            (order.get(a.section) ?? 0) - (order.get(b.section) ?? 0) ||
            comparePaths(a.path, b.path),
    );
}

export const multiSelected = (): boolean => extras().length > 0;

// defaults are the most-restrictive Free set, so a studio with no host never leaks paid exports
export type ExportFeatures = Pick<
    PlanLimits,
    "exportFormats" | "removeBranding" | "publicLinks"
> & {
    // the host's plan, so a wall can name the tier that lifts it (upgradeFor is in @model)
    planId: PlanId;
};
const [features, setFeatures] = createSignal<ExportFeatures>({
    exportFormats: ["png"],
    removeBranding: false,
    publicLinks: false,
    planId: "free",
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
//
// The access gate lives here rather than on each caller. A text session records straight through
// this rather than through `commit`, so a gate on `commit` alone let a viewer type into a document
// they may not change: the batch reached the room, came back rejected, and took their window with
// it on the resync.
//
// `emitFrom` is what the room has already been told. It differs from `base` only for a text
// session, which checkpoints as it goes: the undo entry still spans the whole session, while what
// goes out is the remainder since the last checkpoint.
function record(
    base: ArtifactContent,
    next: ArtifactContent,
    opts?: {
        coalesce?: string;
        title?: { before: string; after: string };
        emitFrom?: ArtifactContent;
    },
): void {
    if (!canEdit()) return;
    const forward = narrowOps(base, diffSections(base, next));
    const from = opts?.emitFrom ?? base;
    // typing a word and deleting it again is nothing to undo, but the room saw the word: the two
    // baselines disagree, and the batch that puts it back has to go out even so
    const outgoing = from === base ? forward : narrowOps(from, diffSections(from, next));
    if (!forward.length && !outgoing.length && !opts?.title) return; // keep the painted objects
    // a structural write invalidates every held path, so the set collapses and the batch op that
    // made the write is the one that re-seeds it
    if (forward.some((op) => op.kind !== "data")) clearExtras();
    if (forward.length || opts?.title) {
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
    }
    setContent(next);
    if (!forward.length && !outgoing.length) return; // a rename costs no repaint or write
    bumpSeq();
    if (outgoing.length) emitOps(outgoing);
}

export function commit(next: ArtifactContent, opts?: { coalesce?: string }): void {
    record(content(), next, opts);
}

// baselines the undo step on `base`, for when the live tree holds a transient value (a skeleton)
export function commitOver(base: ArtifactContent, next: ArtifactContent): void {
    coalesceKey = null;
    record(base, next);
}

/**
 * A write that has to reach the server but is not an edit anyone made. Minting an element id so a
 * comment can anchor to it is the only caller: the id is metadata about the element rather than a
 * change to it, so it records no undo step, but it has to travel like any other batch. Left local,
 * it produced an anchor addressing an id no other reader had, and every op aimed at that element
 * afterwards named something the server did not hold.
 */
export function commitMeta(next: ArtifactContent): void {
    if (!canEdit()) return;
    const base = content();
    const ops = narrowOps(base, diffSections(base, next));
    if (!ops.length) return;
    setContent(next);
    bumpSeq();
    emitOps(ops);
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
        if (ops.length) clearExtras(); // a replayed batch moves paths the same way the edit did
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
    capture("edit_undone", {});
    replay(
        past,
        future,
        (e) => e.inverse,
        (e) => e.title?.before,
    );
}

export function redo(): void {
    capture("edit_redone", {});
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
    // Nothing to type into without edit access: the keystrokes would land in this tab's tree, be
    // refused by the room, and vanish on the resync that followed.
    if (!canEdit()) return;
    // The presence gate: someone else is already in this element, so entering would be co-typing.
    // Zero latency and it covers every entry point, since they all funnel through here.
    if (enterEditHandler && !enterEditHandler(addr)) return;
    editBefore = editor.artifact;
    liveBase = editor.artifact;
    editingElementId = getElementIdAt(editor.artifact, addr);
    setEditCaret(caret ?? null);
    // hover updates are suppressed while editing, so a stale value would strand the hover chrome
    setHover(null);
    setDatum(null);
    clearExtras(); // a session only ever addresses the anchor
    setFitFreeze({ id: addr.section, scale: sectionFitScale(addr.section) });
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
    window.clearTimeout(checkpointTimer);
    checkpointTimer = 0;
    // one entry per session: the keystrokes updated the tree live, this is where they become an edit
    if (editBefore && editBefore !== editor.artifact) {
        record(editBefore, editor.artifact, { emitFrom: liveBase ?? editBefore });
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
    liveBase = null;
    editingElementId = undefined;
    setFitFreeze(null); // the next paint solves the fit again, now that the text has settled
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
    scheduleCheckpoint();
}

// A text session updates the tree on every keystroke and only becomes ops when it ends, so while
// the room is the persistence path a long paragraph would sit in one tab, unsent and unsaved, until
// the writer clicked away: a tab closed mid-sentence lost it, and peers saw the whole paragraph
// arrive in one lump. The session checkpoints as it goes instead. The undo entry still lands once,
// at the end, because `record` takes the emit baseline separately from the history one.
//
// The timer is not reset by later keystrokes, so a continuous typist checkpoints on a cadence
// rather than never.
const CHECKPOINT_MS = 900;
let liveBase: ArtifactContent | null = null; // what the room has been told of the open session
let checkpointTimer = 0;

/** Sends what the open session has produced since the last checkpoint; nothing if none is open. */
export function checkpointLiveEdit(): void {
    window.clearTimeout(checkpointTimer);
    checkpointTimer = 0;
    const base = liveBase;
    if (!base || base === content() || !canEdit()) return;
    const ops = narrowOps(base, diffSections(base, content()));
    // nothing went out (no room open), so the baseline stays put: the HTTP save is carrying this
    // session instead, and the next checkpoint has to still describe the whole of it
    if (!ops.length || emitOps(ops)) liveBase = content();
}

const scheduleCheckpoint = (): void => {
    if (!liveBase || checkpointTimer) return;
    checkpointTimer = window.setTimeout(checkpointLiveEdit, CHECKPOINT_MS);
};

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

/** False when nothing went out (no room, or the socket is down), so the caller can keep its baseline. */
function emitOps(ops: SectionOp[]): boolean {
    if (!ops.length) return false;
    const tag = opsEmitter?.(ops);
    if (!tag) return false;
    pendingContent.set(tag, content());
    for (const key of writeKeys(ops)) pendingByKey.set(key, tag);
    return true;
}

/**
 * The socket went away, so nothing we sent is in flight any more: whatever was unacked is now the
 * HTTP save's problem, and holding those keys pending would go on discarding every remote value for
 * them long after the room came back, on exactly the elements this tab was last editing.
 */
export function opsDropped(): void {
    pendingByKey.clear();
    pendingContent.clear();
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
    if (ops.some((op) => op.kind !== "data")) clearExtras(); // someone else moved the paths
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
//
// The shell is compared generically, for the reason diffSections is: a hand-listed version ignores
// every field added to ArtifactShell after it was written, and ignoring one here meant a remote
// change to it was applied and then dropped, with the next local shell write reverting it.
const unchanged = (a: ArtifactContent, b: ArtifactContent): boolean =>
    a.sections.length === b.sections.length &&
    a.sections.every((s, i) => s === b.sections[i]) &&
    sameShell(a, b);

function sameShell(a: ArtifactContent, b: ArtifactContent): boolean {
    const { sections: _aSections, ...av } = a;
    const { sections: _bSections, ...bv } = b;
    const keys = new Set([...Object.keys(av), ...Object.keys(bv)]);
    return [...keys].every((k) => av[k as keyof ArtifactShell] === bv[k as keyof ArtifactShell]);
}

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
    liveBase = null;
    window.clearTimeout(checkpointTimer);
    checkpointTimer = 0;
    editingElementId = undefined;
    setEditing(null);
    setSelection(null);
    sessionEndedHandler?.();
}

/**
 * The whole editing session is over: the tab is going away, or another artifact is taking its place.
 * Idempotent and only reports when one was open, so a page hide followed by the route unmounting
 * counts once. It rides a page-hide handler and will under-report (a killed tab reports nothing),
 * so no funnel should use it as a denominator; it is still the only view of a session that was only
 * a glance.
 */
export function endEditorSession(): void {
    if (!sessionStartedAt) return;
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
    // The title is content the same way the tree is: without edit access the PATCH is refused, and
    // the name would sit renamed in this tab alone until the next load put it back.
    if (!canEdit()) return;
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

// app registers the Google Slides sender (upload + the consent popup); the editor stays app- and
// Google-free. No host → the export answers with a plain failure instead of hanging.
let slidesSender: ((bytes: Uint8Array) => Promise<{ url: string }>) | null = null;
export function onSlidesExport(fn: (bytes: Uint8Array) => Promise<{ url: string }>): void {
    slidesSender = fn;
}
export function slidesExport(bytes: Uint8Array): Promise<{ url: string }> {
    if (!slidesSender)
        return Promise.reject(new Error("Google Slides export is not available here"));
    return slidesSender(bytes);
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

// app registers the speaker-notes writer (POST /ai/notes, SSE); no host → the Write actions stay hidden
export interface WrittenNote {
    sectionId: string;
    notes: SectionNotes;
}
export type NotesWriter = (
    content: ArtifactContent,
    sectionIds: string[] | undefined,
    onNote: (note: WrittenNote) => void,
    signal?: AbortSignal,
) => Promise<void>;
let notesWriter: NotesWriter | null = null;
export function onWriteNotes(fn: NotesWriter): void {
    notesWriter = fn;
}
export function getWriteNotes(): NotesWriter | null {
    return notesWriter;
}

// app registers the workspace's voice shelf; no host → no voice control on the artifact
export interface ShelfVoice {
    id: string;
    name: string;
    isDefault: boolean;
}
let voiceShelf: (() => ShelfVoice[]) | null = null;
export function onVoiceShelf(fn: () => ShelfVoice[]): void {
    voiceShelf = fn;
}
export const shelfVoices = (): ShelfVoice[] => voiceShelf?.() ?? [];

// app registers the narration builder (POST /artifacts/:id/narration, SSE); no host → no Prepare
export interface NarratedSection {
    sectionId: string;
    ms: number;
    cached: boolean;
}
export type NarrationBuilder = (
    content: ArtifactContent,
    sectionIds: string[] | undefined,
    onSection: (s: NarratedSection) => void,
    signal?: AbortSignal,
) => Promise<void>;
let narrationBuilder: NarrationBuilder | null = null;
export function onPrepareNarration(fn: NarrationBuilder): void {
    narrationBuilder = fn;
}
export function getPrepareNarration(): NarrationBuilder | null {
    return narrationBuilder;
}

// app registers bed composition (POST /artifacts/:id/soundtrack); no host → no picker
export type BedComposer = (opts: {
    preset?: string;
    custom?: boolean;
    lengthMs?: number;
}) => Promise<string>;
let bedComposer: BedComposer | null = null;
export function onComposeBed(fn: BedComposer): void {
    bedComposer = fn;
}
export const getComposeBed = (): BedComposer | null => bedComposer;

let musicPresets:
    | (() => { id: string; name: string; description: string; ready: boolean }[])
    | null = null;
export function onMusicPresets(
    fn: () => { id: string; name: string; description: string; ready: boolean }[],
): void {
    musicPresets = fn;
}
export const getMusicPresets = (): {
    id: string;
    name: string;
    description: string;
    ready: boolean;
}[] => musicPresets?.() ?? [];

// app registers the bed (GET /artifacts/:id/soundtrack); no host → no music control
let soundtrackSource: SoundtrackSource | undefined;
export function onSoundtrack(fn: SoundtrackSource | undefined): void {
    soundtrackSource = fn;
}
export function getSoundtrack(): SoundtrackSource | undefined {
    return soundtrackSource;
}

// app registers the narration source (GET /artifacts/:id/narration); no host → no play control
let narrationSource: NarrationSource | undefined;
export function onNarration(fn: NarrationSource | undefined): void {
    narrationSource = fn;
}
export function getNarration(): NarrationSource | undefined {
    return narrationSource;
}

// app registers element regeneration (POST /ai/element); no host → the Regenerate action stays hidden
// Addressed by path, not by node: the host posts an address the server resolves against the tree it
// was given, which is the same way the agent's own tool names an element.
export type ElementReviser = (
    content: ArtifactContent,
    address: ElementAddress,
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
    endEditorSession(); // a switch ends the session on the artifact being left, counters and all
    window.clearTimeout(checkpointTimer);
    checkpointTimer = 0;
    liveBase = null;
    sessionStartedAt = Date.now();
    editCount = 0;
    aiActionCount = 0;
    savedCleanly = true;
    past.length = 0;
    future.length = 0;
    coalesceKey = null;
    editBefore = null;
    setEditing(null);
    setFitFreeze(null); // the session it belonged to is over, and the geometry is another artifact's
    setSelection(null);
    setHover(null);
    setDatum(null);
    savedThemeUnderPreview = null;
    setPreviewingTheme(false);
    setCurrentArtifactId(id);
    setZoomSignal(readZooms()[id] ?? 1); // the view scale this artifact was last read at
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

/** `count` rides along only for a batch, so a single removal keeps the shape it always had. */
export function noteElementRemoved(type: string, count = 1): void {
    capture("element_removed", {
        element_type: type,
        category: categoryOf(type),
        ...(count > 1 ? { count } : {}),
    });
}

export function noteElementsGrouped(count: number): void {
    capture("elements_grouped", { count });
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

export const [presenting, setPresenting] = createSignal(false);

// Presenting is an output, so it counts toward activation the same way an export does. The surface
// owns the index and reports how far it got, since paged and continuous count different things.
let presentStartedAt = 0;
let slidesAdvanced = 0;

// Whether this run was asked to narrate itself. Read once by the surface as it opens, so "Play with
// voice" and "Present" are the same entry with a different intent rather than two code paths.
export const [presentWithVoice, setPresentWithVoice] = createSignal(false);

export function present(opts: { withVoice?: boolean } = {}): void {
    presentStartedAt = Date.now();
    slidesAdvanced = 0;
    setPresentWithVoice(!!opts.withVoice);
    setPresenting(true);
}
export function notePresentProgress(reached: number): void {
    slidesAdvanced = Math.max(slidesAdvanced, reached);
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
    setPresentWithVoice(false);
    setPresenting(false);
}

// collapsed by default below desktop, where the minimap costs too much canvas
export const [leftOpen, setLeftOpen] = createSignal(isDesktop());
// the open flyout: a category, "search", "inspector", or null
export const [rightTab, setRightTab] = createSignal<string | null>(null);

// Drag-resized, and the canvas reserves it, so a wider rail costs canvas and a narrower one buys it
// back. Per device rather than per account, like the library layout and the slide frame.

export const MINIMAP_MIN_W = 140;
export const MINIMAP_MAX_W = 340;
export const MINIMAP_DEFAULT_W = 182;
const MINIMAP_KEY = "galleo:minimap-width";

export const clampMinimapWidth = (px: number): number =>
    Number.isFinite(px)
        ? Math.round(Math.max(MINIMAP_MIN_W, Math.min(MINIMAP_MAX_W, px)))
        : MINIMAP_DEFAULT_W;

let storedMinimapWidth = MINIMAP_DEFAULT_W;
try {
    const raw = localStorage.getItem(MINIMAP_KEY);
    if (raw) storedMinimapWidth = clampMinimapWidth(Number(raw));
} catch {
    /* storage unavailable — use the default */
}

const [minimapWidth, setMinimapWidthSignal] = createSignal(storedMinimapWidth);
export { minimapWidth };

export function setMinimapWidth(px: number): void {
    const next = clampMinimapWidth(px);
    setMinimapWidthSignal(next);
    try {
        localStorage.setItem(MINIMAP_KEY, String(next));
    } catch {
        /* storage unavailable */
    }
}

// A view scale on the painted stack, not a layout change: the engine keeps laying out at the same
// width, so nothing re-wraps and the zoom is one CSS transform on the stage. Everything the canvas
// publishes (regions, hitboxes, drop slots, section tops) stays in unscaled layout coordinates,
// which is why every client→stage conversion goes through `stagePoint` below.

export const ZOOM_MIN = 0.6;
/**
 * The hard ceiling. The real one is `zoomCeiling`, which is narrower: the stage is laid out to the
 * space it has and then scaled, so anything above the fit scale pushes it wider than the canvas and
 * the piece has to be scrolled sideways to be read.
 */
export const ZOOM_MAX = 2;

export const ZOOM_STEP = 0.1;
const ZOOM_KEY = "galleo:canvas-zoom";
// artifacts remembered; the least recently set falls off rather than the record growing forever
const ZOOM_KEPT = 40;

/** Held inside the range and snapped to whole percents, so stepping never lands on 0.7000000001. */
export const clampZoom = (z: number): number =>
    Number.isFinite(z) ? Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(z * 100) / 100)) : 1;

/**
 * The largest scale at which the piece still fits the width it is given. A format that fills the
 * canvas is already at its ceiling; one with a frame of its own (a deck's page, a document's
 * column) has room to grow into the space beside it.
 *
 * Read by `setZoom` and by the stepper, so neither the buttons nor a restored setting can leave the
 * stack wider than the canvas it is being read in.
 */
export function zoomCeiling(): number {
    const available = canvasContentWidth();
    const profile = profileFor(content());
    const natural = profile.width === "fill" ? available : Math.min(profile.width, available);
    if (!available || !natural) return ZOOM_MAX;
    return Math.min(ZOOM_MAX, Math.max(1, Math.floor((available / natural) * 100) / 100));
}

function readZooms(): Record<string, number> {
    const out: Record<string, number> = {};
    try {
        const raw: unknown = JSON.parse(localStorage.getItem(ZOOM_KEY) ?? "{}");
        if (!raw || typeof raw !== "object") return out;
        for (const [id, z] of Object.entries(raw as Record<string, unknown>))
            if (typeof z === "number") out[id] = clampZoom(z);
    } catch {
        /* storage unavailable, or the entry is not a record — start clean */
    }
    return out;
}

const [zoomSetting, setZoomSignal] = createSignal(1);

/**
 * What the stage is actually scaled by. Phone chrome carries no zoom control (pinch is the
 * platform's own), so a scale carried over from a wider window would be a mode with no way out:
 * the setting is kept, and the stage reads 1:1 until there is a control again.
 */
export const zoom = (): number => (isPhone() ? 1 : zoomSetting());

export function setZoom(z: number): void {
    const next = Math.min(clampZoom(z), zoomCeiling());
    setZoomSignal(next);
    const id = currentArtifactId();
    if (!id) return;
    try {
        const all = readZooms();
        delete all[id]; // re-inserted below, so key order is least-recently-set first
        if (next !== 1) all[id] = next;
        const keys = Object.keys(all);
        for (const k of keys.slice(0, Math.max(0, keys.length - ZOOM_KEPT))) delete all[k];
        localStorage.setItem(ZOOM_KEY, JSON.stringify(all));
    } catch {
        /* storage unavailable */
    }
}

export const zoomBy = (steps: number): void => setZoom(zoomSetting() + steps * ZOOM_STEP);
export const resetZoom = (): void => setZoom(1);

/**
 * Viewport coordinates → stage layout coordinates. `rect` is the stage's client rect, which already
 * carries the zoom transform, so subtracting its origin lands in zoomed pixels and the division is
 * what puts the point back in the space regions and drop slots are measured in.
 */
export const toStage = (
    rect: { left: number; top: number },
    z: number,
    clientX: number,
    clientY: number,
): [number, number] => [(clientX - rect.left) / z, (clientY - rect.top) / z];

/** The same conversion against the live stage; null before the canvas has mounted one. */
export function stagePoint(clientX: number, clientY: number): [number, number] | null {
    const stage = stageEl();
    if (!stage) return null;
    return toStage(stage.getBoundingClientRect(), zoom(), clientX, clientY);
}

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
    // tops are layout coordinates; the scroller measures the zoomed stack
    const top = (editor.sectionTops[index] ?? 0) * zoom();
    el.scrollTo({ top: Math.max(0, top - 18), behavior: "smooth" });
}
