import { createSignal } from "solid-js";
import type { ArtifactContent, ElementAddress, ElementInstance, Id } from "@model/artifact";
import { elementRegionId, newElementId } from "@model/artifact";
import type { CommentAnchor, CommentCreateBody, CommentDto, CommentThread } from "@model/comments";
import { anchorElementId, threadsOf } from "@model/comments";
import type { RunLayout } from "@canvas/render/commands";
import type { Mark } from "@model/text";
import { applyMark, marksWithValue, withoutMarkValue } from "@model/text";
import { elementIdMap, getElementAt, setElementAt, updateDataAt } from "@elements/ops";
import { getElement } from "@elements/spec";
import { say } from "./collab";
import {
    canEdit,
    commit,
    commitMeta,
    editing,
    editor,
    HANDLE_GAP,
    jumpToSection,
    setSelection,
} from "./store";
import { setTextMark } from "./text";

// The comment seam, shaped like the AI transports in ./store: the app pushes the list in and
// registers the writers, so the editor never imports the app or knows who is signed in (author
// identity rides inside the DTOs).

const [comments, setComments] = createSignal<CommentDto[]>([]);
export { comments, setComments };

export const threads = (): CommentThread[] => threadsOf(comments());

// the open thread panel; null = none
export const [activeThreadId, setActiveThreadId] = createSignal<string | null>(null);

// Markers live in a section's right border and appear when that section is hovered. Two signals
// feed the rule: where the pointer is, and what is holding a section open (a hovered marker, or an
// open thread), so moving from the section onto its marker never makes the marker vanish under the
// click that was already on its way.
export const [hoveredSection, setHoveredSection] = createSignal<Id | null>(null);
export const [heldSection, setHeldSection] = createSignal<Id | null>(null);

/**
 * Whether this section's markers are on screen. `held` is every section something is keeping open
 * (a hovered marker, an open thread), so the reveal survives the pointer leaving the section on its
 * way to the marker. Hoverless tiers show everything, having no hover to wait for.
 */
export const markersRevealed = (
    sectionId: Id,
    state: { hovered: Id | null; held: readonly (Id | null)[]; hoverless: boolean },
): boolean => state.hoverless || sectionId === state.hovered || state.held.includes(sectionId);

/**
 * The section whose band contains this stage y, from the tops the canvas published. Bands rather
 * than painted boxes on purpose: the markers sit in the margin beside the section, outside its box,
 * and a reveal that stopped at the box edge would close before the pointer arrived.
 */
export function sectionAtY(tops: number[], ids: Id[], y: number, stageHeight: number): Id | null {
    for (let i = ids.length - 1; i >= 0; i--) {
        const top = tops[i];
        if (top === undefined) continue;
        const bottom = tops[i + 1] ?? stageHeight;
        if (y >= top && y < bottom) return ids[i] ?? null;
    }
    return null;
}

/** A composer with no thread yet: what the next create will anchor to. */
export interface CommentDraft {
    sectionId: string;
    anchor: CommentAnchor;
    quote?: string;
    range?: { from: number; to: number }; // text anchors: the mark to write once the id comes back
}
export const [commentDraft, setCommentDraft] = createSignal<CommentDraft | null>(null);

export function startCommentDraft(draft: CommentDraft): void {
    setActiveThreadId(null);
    setCommentDraft(draft);
}
export function cancelCommentDraft(): void {
    setCommentDraft(null);
}

// An element the user made this session has no id yet (stamping runs on load and on every server
// write), so anchoring to one mints it. Metadata, not an edit: no history entry, though an undo
// past it drops the id and the thread degrades, exactly like the text mark.
//
// It goes out as a write even so. Kept local, the id named an element only this tab knew about: the
// thread orphaned for everyone else at once and for its author on the next load, and every op aimed
// at that element afterwards addressed something the server did not hold, which the room refused.
// Nobody without edit access can persist one, and an anchor that cannot be persisted is an anchor
// that degrades the moment it is made, so there is no id to give back.
function ensureElementId(address: ElementAddress): Id | null {
    const inst = getElementAt(editor.artifact, address);
    if (!inst) return null;
    if (inst.id) return inst.id;
    if (!canEdit()) return null;
    const id = newElementId();
    commitMeta(setElementAt(editor.artifact, address, { ...inst, id }));
    return id;
}

// The layout container is the one exemption: columns and wraps hold blocks side by side without
// owning them. Every unit (a callout, a bullet list, a table, a diagram) owns its children as parts
// of one block, so a comment there belongs to the block, not to a line inside it. Same tier split
// that decides droppability, and for the same reason.
const nestsParts = (inst: ElementInstance): boolean => {
    const spec = getElement(inst.type);
    if (!spec?.container) return false;
    // `container` merged group and card, so tier alone no longer separates them: a surface is what
    // made it a card, one block that owns its children, while a bare stack is the old group.
    if (spec.tier === "container") return !!(inst.data as { surface?: unknown }).surface;
    return true;
};

/**
 * Whether this address is a standalone block, and so somewhere a comment may be created. False for
 * anything inside a composite: a chip floating over one cell of a matrix covers the content it is
 * commenting on, and the thread people actually want is on the card.
 *
 * Creation only. An anchor that already points at a nested part keeps resolving and keeps its
 * marker, because the content it was written against has not gone anywhere.
 *
 * Deliberately NOT `movableAncestor`, which is how the drag grip on the element's other side picks
 * its target. The grip climbs to whatever a structural op may act on, because moving a diagram's
 * label means moving the diagram; a comment means the thing you pointed at, and where that thing is
 * a part rather than a block the answer is to offer nothing rather than to quietly retarget the
 * thread onto its card. The two rules never disagree in practice, and
 * `comment-anchors.test.ts` pins that: wherever the grip climbs, this returns false and there is no
 * chip to misplace. If that stops holding, the two handles start pointing at different boxes.
 */
export function commentableAt(art: ArtifactContent, address: ElementAddress): boolean {
    if (!getElementAt(art, address)) return false;
    for (let depth = 0; depth < address.path.length; depth++) {
        const ancestor = getElementAt(art, {
            section: address.section,
            path: address.path.slice(0, depth),
        });
        if (ancestor && nestsParts(ancestor)) return false;
    }
    return true;
}

/** What a thread shows once the content it pointed at is gone. */
const QUOTE_MAX = 140;
function elementQuote(address: ElementAddress): string | undefined {
    const inst = getElementAt(editor.artifact, address);
    if (!inst) return undefined;
    const text = (inst.data as { text?: unknown }).text;
    if (typeof text === "string" && text.trim()) return text.trim().slice(0, QUOTE_MAX);
    return getElement(inst.type)?.label;
}

function textQuote(
    address: ElementAddress,
    range: { from: number; to: number },
): string | undefined {
    const text = (getElementAt(editor.artifact, address)?.data as { text?: unknown }).text;
    if (typeof text !== "string") return undefined;
    return text.slice(range.from, range.to).trim().slice(0, QUOTE_MAX) || undefined;
}

// What the chip anchors to, read at the press: a live text range on the element wins, else the
// element itself. There is no section anchor to fall back to, so an element that cannot be given
// an id (it is no longer in the tree) yields no draft.
export function captureAnchor(
    address: ElementAddress,
    range?: { from: number; to: number } | null,
): CommentDraft | null {
    const elementId = ensureElementId(address);
    if (!elementId) return null;
    const sectionId = address.section;
    const edit = editing();
    if (range && range.to > range.from && edit && sameAddress(edit, address)) {
        const quote = textQuote(address, range);
        return {
            sectionId,
            anchor: { kind: "text", elementId },
            range: { ...range },
            ...(quote ? { quote } : {}),
        };
    }
    const quote = elementQuote(address);
    return { sectionId, anchor: { kind: "element", elementId }, ...(quote ? { quote } : {}) };
}

// the same key the engine tags a region with, so two addresses compare exactly as the canvas does
const sameAddress = (a: ElementAddress, b: ElementAddress): boolean =>
    elementRegionId(a) === elementRegionId(b);

/** Where a thread points now, or null once its element has left the document. */
export function threadAddress(thread: CommentThread): ElementAddress | undefined {
    return elementIdMap(editor.artifact).get(anchorElementId(thread.root.anchor));
}

/** The live ranges a text thread's mark covers; empty once an edit removed it. */
export function commentMarkRanges(thread: CommentThread): { from: number; to: number }[] {
    if (thread.root.anchor.kind !== "text") return [];
    const address = threadAddress(thread);
    if (!address) return [];
    const marks = (getElementAt(editor.artifact, address)?.data as { marks?: Mark[] }).marks ?? [];
    return marksWithValue(marks, "cm", thread.root.id).map((m) => ({ from: m.from, to: m.to }));
}

// The mark is what joins a text thread to its range, so it is written once the server hands back
// the id. A live edit session owns the contenteditable's DOM, so that case goes through its own op.
export function applyCommentMark(draft: CommentDraft, threadId: string): void {
    if (draft.anchor.kind !== "text" || !draft.range) return;
    const address = elementIdMap(editor.artifact).get(draft.anchor.elementId);
    if (!address) return;
    const edit = editing();
    if (edit && sameAddress(edit, address)) {
        setTextMark("cm", threadId, draft.range);
        return;
    }
    const inst = getElementAt(editor.artifact, address);
    if (!inst) return;
    const data = inst.data as { marks?: Mark[] };
    const marks = applyMark(data.marks ?? [], draft.range.from, draft.range.to, "cm", threadId);
    commit(updateDataAt(editor.artifact, address, { ...data, marks }));
}

/** Deleting a text thread takes its mark with it, through an ordinary undoable commit. */
export function dropCommentMark(thread: CommentThread): void {
    if (thread.root.anchor.kind !== "text") return;
    const address = threadAddress(thread);
    if (!address) return;
    const data = getElementAt(editor.artifact, address)?.data as { marks?: Mark[] } | undefined;
    if (!data?.marks?.length) return;
    const marks = withoutMarkValue(data.marks, "cm", thread.root.id);
    if (marks.length === data.marks.length) return;
    commit(updateDataAt(editor.artifact, address, { ...data, marks }));
}

/** Opening a thread puts its context back on screen: the anchored element is selected again. */
export function expandThread(thread: CommentThread, opts?: { scroll?: boolean }): void {
    setCommentDraft(null);
    setActiveThreadId(thread.root.id);
    const address = threadAddress(thread);
    if (opts?.scroll) {
        const section = address?.section ?? thread.root.sectionId;
        const i = editor.artifact.sections.findIndex((s) => s.id === section);
        if (i >= 0) jumpToSection(i);
    }
    if (address) setSelection({ kind: "element", address });
}

type Creator = (input: CommentCreateBody) => Promise<CommentDto | null>;
type Replier = (root: CommentDto, body: string) => Promise<void>;
type Resolver = (id: string, resolved: boolean) => Promise<void>;
type Rewriter = (id: string, body: string) => Promise<void>;
type Remover = (id: string) => Promise<void>;

let creator: Creator | null = null;
let replier: Replier | null = null;
let resolver: Resolver | null = null;
let rewriter: Rewriter | null = null;
let remover: Remover | null = null;

// a signal, not a read of `creator`: the chrome that shows only with a host has to repaint when one
// registers, which can happen after the editor has already mounted
const [available, setAvailable] = createSignal(false);

export function onCommentCreate(fn: Creator): void {
    creator = fn;
    setAvailable(true);
}
export function onCommentReply(fn: Replier): void {
    replier = fn;
}
export function onCommentResolve(fn: Resolver): void {
    resolver = fn;
}
export function onCommentEdit(fn: Rewriter): void {
    rewriter = fn;
}
export function onCommentDelete(fn: Remover): void {
    remover = fn;
}

/** Cleared when the host unmounts, so a stale route can't keep writing. */
export function clearCommentHandlers(): void {
    creator = null;
    replier = null;
    resolver = null;
    rewriter = null;
    remover = null;
    setAvailable(false);
    setComments([]);
    setActiveThreadId(null);
    setCommentDraft(null);
}

/** No host (the studio alone) → no comment chrome at all. */
export const commentsAvailable = available;

export const createComment = async (input: CommentCreateBody): Promise<CommentDto | null> =>
    (await creator?.(input)) ?? null;
export const replyToThread = async (root: CommentDto, body: string): Promise<void> =>
    replier?.(root, body);
export const resolveThread = async (id: string, resolved: boolean): Promise<void> =>
    resolver?.(id, resolved);
export const editComment = async (id: string, body: string): Promise<void> => rewriter?.(id, body);
export const deleteComment = async (id: string): Promise<void> => remover?.(id);

// Resolving has to read as something that happened: the panel goes, the marker leaves the margin
// (resolved threads are hidden until a section's chip asks for them), and the line that says so
// carries the way back, since the thread is otherwise a click deeper than it was a moment ago.
// Reopening puts the panel back up, so taking it back lands where the thread was.
export async function setThreadResolved(thread: CommentThread, resolved: boolean): Promise<void> {
    const id = thread.root.id;
    if (resolved) setActiveThreadId(null);
    await resolveThread(id, resolved);
    if (!resolved) {
        setActiveThreadId(id);
        return;
    }
    say("Thread resolved", { label: "Reopen", run: () => void setThreadResolved(thread, false) });
}

// ---- placement ------------------------------------------------------------------------------
//
// Where the margin markers land, in stage coordinates at scale 1. Pure on purpose: the canvas hands
// it geometry the engine already published, so nothing here reads the DOM or a signal.

export const MARKER_SIZE = 28; // the chip itself (size-7)
export const MARKER_GAP = 12; // between a section's right edge and the chip

// The creation chip mirrors the drag grip across the element rather than joining the thread rail:
// the same gap out from the edge, the same height, and a little more width because a speech bubble
// needs squarer room than a grip's column of dots and looked pinched in the grip's own box.
export const CHIP_GAP = HANDLE_GAP;
export const CHIP_W = 20; // w-5; the one measurement that is the chip's own rather than shared
export const MARKER_SPACING = 32; // the least vertical distance two chips may sit at

export const PANEL_EDGE = 6; // keep a clamped chip or panel this far inside the stage

/**
 * A chip sits just outside the right edge it belongs to, mirroring the drag grip on the left. Which
 * edge that is depends on what the chip is about: a thread marker takes its section's, so a rail of
 * them lines up however wide the content inside is, while the creation chip takes its own element's,
 * so the offer to comment stays beside the thing it is offering about rather than out at the margin.
 *
 * A bleed section runs the full stage width and a narrow deck leaves under a chip's worth of margin,
 * so the natural x would put the chip outside the scroller, where it never paints. The clamp keeps
 * it just inside, the same trade the element grip makes on the left edge.
 */
export function markerX(
    rightOf: number,
    stageWidth: number,
    gap = MARKER_GAP,
    size = MARKER_SIZE,
): number {
    const wanted = rightOf + gap;
    return Math.max(PANEL_EDGE, Math.min(wanted, stageWidth - size - PANEL_EDGE));
}

/**
 * Ties in the lane break by rank before they break by id, so what a reader is looking at keeps the
 * place they found it in and everything else gives way: a live thread first, then a resolved one
 * kept for reference, then the offer to start a new one, which is the least settled thing there.
 */
export const RANK_LIVE = 0;
export const RANK_RESOLVED = 1;
export const RANK_NEW = 2;

/**
 * The creation chip goes through the same placement pass the thread markers do, under this reserved
 * id, rather than by a rule of its own.
 *
 * It used to straddle the selected element's top-right corner, which put a 28px chip on top of the
 * content it was offering to comment on: over a pill or a short heading it covered the last word.
 * It now sits just outside that element's right edge, mirroring the drag grip on the left, so the
 * two affordances for a selected thing frame it rather than cover it. Sharing the pass is what
 * stops it landing under a marker when the element runs the full width of its section and the two
 * edges coincide.
 *
 * It carries `RANK_NEW`, so it loses every tie: selecting an element must not shove an existing
 * thread's marker out of the place the reader already found it in.
 */
export const CHIP_REQUEST_ID = "~new";

export const PANEL_GAP = 8; // between the opener and the panel it opened

// A popover against whatever opened it: a margin marker, the orphan stack, or the chip on an
// element's corner. Right of the anchor by preference, flipped left when the right side would run
// off the stage, and clamped vertically so a panel opened near the bottom stays readable. Stage
// coordinates throughout, so the panel scrolls with the content it belongs to.
export function panelAt(
    anchor: { x: number; y: number; w?: number },
    panel: { w: number; h: number },
    stage: { w: number; h: number },
): { x: number; y: number } {
    const right = anchor.x + (anchor.w ?? MARKER_SIZE) + PANEL_GAP;
    const fits = right + panel.w + PANEL_EDGE <= stage.w;
    const x = fits ? right : anchor.x - panel.w - PANEL_GAP;
    const lastX = Math.max(PANEL_EDGE, stage.w - panel.w - PANEL_EDGE);
    const lastY = Math.max(PANEL_EDGE, stage.h - panel.h - PANEL_EDGE);
    return {
        x: Math.min(Math.max(x, PANEL_EDGE), lastX),
        y: Math.min(Math.max(anchor.y - 6, PANEL_EDGE), lastY),
    };
}

// One collapsed chip is left at a section's border, for the orphans: threads whose element is gone
// and which therefore have nowhere of their own to sit. Resolved threads used to need one too,
// since they were hidden until it asked for them; they now stay in the lane at their own anchor,
// dimmed and marked, so the only stack left is the one for content that no longer exists.

export interface MarkerRequest {
    id: string;
    y: number; // where the anchored content actually sits
    rightOf: number; // the right edge this chip sits just outside; see markerX
    // A thread marker takes the rail's gap and size; the creation chip carries the drag grip's, so
    // the two handles on an element sit the same distance out on either side of it.
    gap?: number;
    size?: number;
    rank?: number; // who gives way on a tie; see RANK_LIVE and its neighbours
}

export interface PlacedMarker {
    id: string;
    x: number;
    y: number;
}

// Greedy push-down: markers keep document order and each drops to clear the one above, so two
// comments on the same line stack instead of hiding one another. Ties break on id, so the order
// does not shuffle between paints.
export function placeMarkers(requests: MarkerRequest[], stageWidth: number): PlacedMarker[] {
    const sorted = [...requests].sort(
        (a, b) =>
            a.y - b.y || (a.rank ?? RANK_LIVE) - (b.rank ?? RANK_LIVE) || (a.id < b.id ? -1 : 1),
    );
    const out: PlacedMarker[] = [];
    let floor = -Infinity;
    for (const r of sorted) {
        const y = Math.max(r.y, floor);
        out.push({ id: r.id, x: markerX(r.rightOf, stageWidth, r.gap, r.size), y });
        floor = y + MARKER_SPACING;
    }
    return out;
}

// Which laid-out line a character offset falls on. The layout drops the space it wrapped at (and
// collapses a whitespace run to one), so a line boundary consumes one source character no fragment
// carries; the walk adds it back rather than drifting a line further with every wrap.
export function lineOfOffset(layout: RunLayout, offset: number): number {
    let consumed = 0;
    for (const [i, line] of layout.lines.entries()) {
        const len = line.frags.reduce((n, f) => n + f.text.length, 0);
        if (offset < consumed + len) return i;
        consumed += len + 1; // the newline, or the space the wrap ate
    }
    return Math.max(0, layout.lines.length - 1);
}

/** The top of a line inside a text element's box, for a marker or a tint rect. */
export const lineTop = (layout: RunLayout, line: number): number => line * layout.lineHeight;

export interface RangeRect {
    x: number;
    y: number;
    w: number;
    h: number;
}

// One rect per line a range covers, in the text element's own coordinates. Edges inside a fragment
// are interpolated across its characters rather than re-measured: this paints a translucent wash,
// and the alternative is a per-character measure pass on every repaint.
export function rangeRects(layout: RunLayout, from: number, to: number): RangeRect[] {
    const out: RangeRect[] = [];
    let consumed = 0;
    for (const [i, line] of layout.lines.entries()) {
        const len = line.frags.reduce((n, f) => n + f.text.length, 0);
        const a = Math.max(from - consumed, 0);
        const b = Math.min(to - consumed, len);
        consumed += len + 1; // the newline, or the space the wrap ate
        if (b <= a) continue;
        const xAt = (offset: number): number => {
            let seen = 0;
            for (const frag of line.frags) {
                const end = seen + frag.text.length;
                if (offset <= end)
                    return frag.x + (frag.width * (offset - seen)) / Math.max(1, frag.text.length);
                seen = end;
            }
            return line.width;
        };
        const x = xAt(a);
        out.push({ x, y: lineTop(layout, i), w: Math.max(1, xAt(b) - x), h: layout.lineHeight });
    }
    return out;
}
