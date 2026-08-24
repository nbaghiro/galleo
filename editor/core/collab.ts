import { createMemo, createSignal } from "solid-js";
import type { ArtifactAccess, ElementAddress, Id, Target } from "@model/artifact";
import { atLeast, elementRegionId, parentTarget, sectionRegionId } from "@model/artifact";
import type {
    CollabCursor,
    CursorBox,
    ElementRef,
    Lease,
    Peer,
    PresenceState,
} from "@model/collab";
import {
    cursorSection,
    decodeCursor,
    encodeElementCursor,
    encodeSectionCursor,
    leaseKey,
} from "@model/collab";
import { elementIdMap, getElementAt } from "@elements/ops";
import { capture } from "@ui/analytics";
import {
    canEdit,
    canvasContentWidth,
    canvasEl,
    editAccess,
    editing,
    editor,
    onEditSession,
    onEditSessionEnded,
    regions,
    setEditAccess,
    stopEditing,
} from "./store";

// The collaboration seam, shaped like the comment seam beside it: the app owns the socket and pushes
// the room's state in, the editor renders it and calls back out. The editor never opens a socket and
// never learns who is signed in beyond what the peer frames carry.
//
// Nothing here leaves as a pixel. What goes on the wire is an element or section id plus fractions
// of that box, and an incoming cursor is resolved against THIS client's painted boxes, never the
// sender's, which is what lets a phone and a desktop agree on where someone is.

export type PeerMap = ReadonlyMap<string, Peer>;

/** The reader, as the roster has to ask about them: which socket, and which person. */
export interface Self {
    connId: string | null;
    userId: string | null;
}

export type LeaseMap = ReadonlyMap<string, Lease>;

const [peers, setPeers] = createSignal<PeerMap>(new Map());
const [leases, setLeases] = createSignal<LeaseMap>(new Map());
const [selfConnId, setSelfConnId] = createSignal<string | null>(null);
const [selfUserId, setSelfUserId] = createSignal<string | null>(null);
const [connected, setConnected] = createSignal(false);

export { peers, leases, selfConnId };

/** True once the room is open; the chrome that only makes sense with a room reads this. */
export const collabActive = (): boolean => connected();

/** Who the reader is, as both questions the roster gets asked. */
const self = (): Self => ({ connId: selfConnId(), userId: selfUserId() });

/**
 * The other people in a roster, one entry each.
 *
 * A person is not a socket, and the roster is keyed by socket because ops and leases are. Two
 * connections belong to one person in two ordinary situations: a second tab, which the room
 * supports on purpose, and the window after an unclean drop, where the connection someone left
 * behind stays in the room until its presence times out while they have already rejoined under a
 * new id. Presence answers "who is here", so it collapses to the person: asking by `connId` alone
 * drew the reader their own ghost when they were the only one here, and drew a reconnecting peer
 * twice.
 *
 * The newest connection wins. After a reconnect it is the live one, and the one it replaced holds
 * a cursor nobody is at.
 */
export function peopleOf(roster: Iterable<Peer>, me: Self): Peer[] {
    const byPerson = new Map<string, Peer>();
    for (const peer of roster) {
        if (peer.connId === me.connId) continue;
        if (me.userId !== null && peer.user.id === me.userId) continue;
        byPerson.set(peer.user.id, peer);
    }
    return [...byPerson.values()];
}

/** Other people in the room; the avatar stack renders only when this is non-empty. */
export const otherPeers = createMemo((): Peer[] => peopleOf(peers().values(), self()));

export function collabWelcome(self: Peer, roster: Peer[], live: Lease[]): void {
    setSelfConnId(self.connId);
    setSelfUserId(self.user.id);
    setPeers(rosterOf(roster));
    setLeases(leasesOf(live));
    setConnected(true);
    // `peers` is what separates real multiplayer from opening a shared artifact alone, which is the
    // whole question about whether this subsystem earns its keep.
    capture("collab_joined", {
        peers: roster.filter((p) => p.connId !== self.connId).length,
        access: editAccess(),
    });
}

export function collabPeer(connId: string, peer: Peer | null): void {
    setPeers((current) => withPeer(current, connId, peer));
    if (!peer) setLeases((current) => withoutConnection(current, connId));
}

export function collabLease(element: ElementRef, holder: Lease | null): void {
    setLeases((current) => withLease(current, element, holder));
}

/** Leaving the artifact clears everything, so a stale roster never outlives the room. */
export function collabClosed(): void {
    setConnected(false);
    setFollowing(null);
    setPeers(new Map());
    setLeases(new Map());
    setSelfConnId(null);
    setSelfUserId(null);
}

// ---- the maps, as pure reductions ----------------------------------------------------------

export const rosterOf = (roster: Peer[]): PeerMap =>
    new Map(roster.map((p) => [p.connId, p] as const));

export function withPeer(current: PeerMap, connId: string, peer: Peer | null): PeerMap {
    const next = new Map(current);
    if (peer) next.set(connId, peer);
    else next.delete(connId);
    return next;
}

export const leasesOf = (live: Lease[]): LeaseMap =>
    new Map(live.map((l) => [leaseKey(l.element), l] as const));

export function withLease(current: LeaseMap, element: ElementRef, holder: Lease | null): LeaseMap {
    const next = new Map(current);
    if (holder) next.set(leaseKey(element), holder);
    else next.delete(leaseKey(element));
    return next;
}

// a departing peer takes what it held with it, even if the lease message never arrives
export function withoutConnection(current: LeaseMap, connId: string): LeaseMap {
    const next = new Map(current);
    for (const [key, lease] of current) if (lease.connId === connId) next.delete(key);
    return next;
}

// ---- what the editor calls back out ---------------------------------------------------------

type PresenceSender = (state: PresenceState) => void;
type LeaseCaller = (element: ElementRef) => void;

let presenceSender: PresenceSender | null = null;
let leaseClaimer: LeaseCaller | null = null;
let leaseReleaser: LeaseCaller | null = null;

export function onSendPresence(fn: PresenceSender): void {
    presenceSender = fn;
}
export function onClaimLease(fn: LeaseCaller): void {
    leaseClaimer = fn;
}
export function onReleaseLease(fn: LeaseCaller): void {
    leaseReleaser = fn;
}

export function clearCollabHandlers(): void {
    presenceSender = null;
    leaseClaimer = null;
    leaseReleaser = null;
    collabClosed();
}

export const sendPresence = (state: PresenceState): void => presenceSender?.(state);
export const claimLease = (element: ElementRef): void => leaseClaimer?.(element);
export const releaseLease = (element: ElementRef): void => leaseReleaser?.(element);

// ---- outbound throttling ---------------------------------------------------------------------

// A time gate rather than a queue: presence is state, not events, so a dropped intermediate
// position costs nothing and the next one carries the truth.
export const dueToSend = (lastAt: number, now: number, minGapMs: number): boolean =>
    now - lastAt >= minGapMs;

type PresenceLike = {
    cursor?: CollabCursor | null;
    selection?: ElementRef | null;
    editing?: ElementRef | null;
};

/** True when nothing a peer would see has changed, so the frame can be skipped entirely. */
export function samePresence(a: PresenceLike, b: PresenceLike): boolean {
    return (
        sameCursor(a.cursor ?? null, b.cursor ?? null) &&
        sameRef(a.selection ?? null, b.selection ?? null) &&
        sameRef(a.editing ?? null, b.editing ?? null)
    );
}

const sameRef = (a: ElementRef | null, b: ElementRef | null): boolean =>
    a === b || (!!a && !!b && a.sectionId === b.sectionId && a.elementId === b.elementId);

function sameCursor(a: CollabCursor | null, b: CollabCursor | null): boolean {
    if (a === b) return true;
    if (!a || !b) return false;
    if ("el" in a && "el" in b)
        return (
            a.el.sectionId === b.el.sectionId &&
            a.el.elementId === b.el.elementId &&
            near(a.el.fx, b.el.fx) &&
            near(a.el.fy, b.el.fy)
        );
    if ("sec" in a && "sec" in b)
        return (
            a.sec.sectionId === b.sec.sectionId &&
            near(a.sec.nx, b.sec.nx) &&
            near(a.sec.ny, b.sec.ny)
        );
    return false;
}

// a cursor that moved by well under a pixel of a typical element is not news
const CURSOR_EPSILON = 0.002;
const near = (a: number, b: number): boolean => Math.abs(a - b) < CURSOR_EPSILON;

// ---- addressing ------------------------------------------------------------------------------

/** What the encoder reads from its own engine output; injected so the walk itself stays pure. */
export interface CursorSource {
    elementIdOf: (address: ElementAddress) => Id | undefined;
    boxOf: (target: Target) => CursorBox | null;
}

// The most specific thing under the pointer that can be named. An element with no stable id yet
// (one made this session, before the next write stamps it) degrades to its parent and then to the
// section, rather than sending a coordinate.
export function encodeCursorAt(
    point: { x: number; y: number },
    hit: Target | null,
    src: CursorSource,
): CollabCursor | null {
    let target = hit;
    while (target) {
        if (target.kind === "section") {
            const box = src.boxOf(target);
            return box ? encodeSectionCursor(target.section, box, point) : null;
        }
        const elementId = src.elementIdOf(target.address);
        const box = elementId ? src.boxOf(target) : null;
        if (elementId && box)
            return encodeElementCursor(
                { sectionId: target.address.section, elementId },
                box,
                point,
            );
        target = parentTarget(target);
    }
    return null;
}

/** The stable id of the element at an address, when it has one. */
export function elementRefFor(address: ElementAddress): ElementRef | null {
    const inst = getElementAt(editor.artifact, address);
    return inst?.id ? { sectionId: address.section, elementId: inst.id } : null;
}

// Both of these are read once per peer per presence frame, and presence arrives at about 30Hz:
// rebuilding the id map walks the whole document and a find over regions scans everything painted,
// so each is a memo rather than a call. The comment layer memoizes the same two, for the same reason.
const idMap = createMemo(() => elementIdMap(editor.artifact));
const regionMap = createMemo(() => new Map(regions().map((r) => [r.id, r] as const)));

const addressOf = (elementId: Id): ElementAddress | undefined => idMap().get(elementId);

const boxOfRegion = (id: string): CursorBox | null => regionMap().get(id)?.box ?? null;

// A section that has not painted yet still has a band in the stack, reserved from its digest size,
// so a peer working in an unloaded section shows up at the right height rather than vanishing.
function sectionBand(sectionId: Id): CursorBox | null {
    const painted = boxOfRegion(sectionRegionId(sectionId));
    if (painted) return painted;
    const index = editor.artifact.sections.findIndex((s) => s.id === sectionId);
    if (index < 0) return null;
    const tops = editor.sectionTops;
    const top = tops[index];
    if (top === undefined) return null;
    return { x: 0, y: top, w: canvasContentWidth(), h: (tops[index + 1] ?? top + 1) - top };
}

const boxOfRef = (ref: { sectionId: Id; elementId?: Id }): CursorBox | null => {
    if (!ref.elementId) return sectionBand(ref.sectionId);
    const address = addressOf(ref.elementId);
    return address ? boxOfRegion(elementRegionId(address)) : null;
};

/** The box of a peer's held or selected element, for the outline the overlay draws over it. */
export const boxOfElement = (ref: ElementRef): CursorBox | null => boxOfRef(ref);

export interface RemoteCursor {
    connId: string;
    name: string;
    color: string;
    x: number;
    y: number;
}

/** Every peer's cursor, resolved here and nowhere else against this client's own painted boxes. */
// Per person, through the same reduction the roster uses: a connection that has gone quiet still
// holds the last position it sent, so counting by socket parked a second cursor of the same name
// where its owner used to be until the sweep caught up.
export const remoteCursors = createMemo((): RemoteCursor[] => {
    const out: RemoteCursor[] = [];
    for (const peer of peopleOf(peers().values(), self())) {
        const cursor = peer.state.cursor;
        if (!cursor) continue;
        const point = decodeCursor(cursor, boxOfRef);
        if (!point) continue;
        out.push({
            connId: peer.connId,
            name: peer.user.name || "Someone",
            color: peer.color,
            x: point.x,
            y: point.y,
        });
    }
    return out;
});

/** The local pointer position as something the room can address, or null when it is off content. */
export function cursorForPoint(
    point: { x: number; y: number },
    hit: Target | null,
): CollabCursor | null {
    return encodeCursorAt(point, hit, {
        elementIdOf: (address) => getElementAt(editor.artifact, address)?.id,
        boxOf: (target) =>
            boxOfRegion(
                target.kind === "section"
                    ? sectionRegionId(target.section)
                    : elementRegionId(target.address),
            ),
    });
}

// ---- follow mode ------------------------------------------------------------------------------
//
// Clicking a peer's avatar ties this viewport to where they are working. Keyed on the person rather
// than the connection, so a follow survives their reconnect: the socket changes underneath, the
// person does not.
//
// What we can follow is where they ARE, not what they SEE: presence carries a cursor, a selection
// and an edit session, never a viewport. Following therefore means keeping their focus on screen
// rather than mirroring their scroll, which is close enough to read as following and costs nothing
// on the wire.

const [following, setFollowing] = createSignal<string | null>(null);
export { following };

/** How much of the viewport stays clear above and below before following scrolls again. */
const FOLLOW_MARGIN = 140;

export const followedPeer = createMemo((): Peer | null => {
    const id = following();
    return id ? (otherPeers().find((p) => p.user.id === id) ?? null) : null;
});

export function followPeer(userId: string): void {
    setFollowing(userId);
    // take the reader there at once, wherever they were: the click asked to go, not just to subscribe
    const peer = otherPeers().find((p) => p.user.id === userId);
    const focus = peer && peerFocus(peer);
    if (focus) scrollFollowing(focus, true);
}

export function unfollow(): void {
    setFollowing(null);
}

export const toggleFollow = (userId: string): void => {
    if (following() === userId) unfollow();
    else followPeer(userId);
};

/**
 * Where a peer is on THIS client's canvas, in stage coordinates. Their cursor first, since that is
 * the live signal and the thing a reader means by "take me to them"; then the element they are in,
 * for a peer whose pointer has left the content or who never sends one at all (a coarse pointer
 * renders remote cursors but sends none); then the band of the section, which is reserved from the
 * digest and so answers even for a section this client has not painted yet.
 */
export function peerFocus(peer: Peer): CursorBox | null {
    const cursor = peer.state.cursor;
    if (cursor) {
        const point = decodeCursor(cursor, boxOfRef);
        if (point) return { x: point.x, y: point.y, w: 0, h: 0 };
    }
    const ref = peer.state.editing ?? peer.state.selection;
    const box = ref ? boxOfElement(ref) : null;
    if (box) return box;
    const sectionId = ref?.sectionId ?? (cursor ? cursorSection(cursor) : null);
    return sectionId ? sectionBand(sectionId) : null;
}

/**
 * Where to scroll so a followed peer stays on screen, or null when they are already comfortably
 * inside it. Null matters as much as the number: a follow that re-centred on every frame would
 * fight the reader for the scrollbar over a few pixels of cursor drift.
 */
export function followScroll(
    focus: { y: number; h: number },
    view: { top: number; height: number },
    force = false,
): number | null {
    const margin = Math.min(FOLLOW_MARGIN, view.height / 4);
    const inside =
        focus.y >= view.top + margin && focus.y + focus.h <= view.top + view.height - margin;
    if (inside && !force) return null;
    return Math.max(0, focus.y + focus.h / 2 - view.height / 2);
}

/** Applies the decision above to the canvas scroller, which is the one place that scrolls. */
export function scrollFollowing(focus: CursorBox, force = false): void {
    const el = canvasEl();
    if (!el) return;
    const to = followScroll(focus, { top: el.scrollTop, height: el.clientHeight }, force);
    if (to !== null) el.scrollTo({ top: to, behavior: "smooth" });
}

// ---- the lease, as the editor asks about it --------------------------------------------------

/** Who is editing this element, when it is someone else. Null means it is free to enter. */
export function leaseHolder(address: ElementAddress): Lease | null {
    const ref = elementRefFor(address);
    if (!ref) return null;
    const held = leases().get(leaseKey(ref));
    return held && held.connId !== selfConnId() ? held : null;
}

// A short line the canvas shows and then drops. The action is the way back out of what just
// happened (reopening a thread that was resolved), so it is the whole message when there is one.
export interface Notice {
    text: string;
    action?: { label: string; run: () => void };
}

const [notice, setNotice] = createSignal<Notice | null>(null);
export { notice };

let noticeTimer = 0;
const NOTICE_MS = 2600;
// long enough to read the line and then reach for the button
const NOTICE_ACTION_MS = 6500;

export function say(text: string, action?: Notice["action"]): void {
    setNotice(action ? { text, action } : { text });
    window.clearTimeout(noticeTimer);
    noticeTimer = window.setTimeout(() => setNotice(null), action ? NOTICE_ACTION_MS : NOTICE_MS);
}

// the undo affordance has done its job the moment it is taken, and a stale one misleads
export function clearNotice(): void {
    window.clearTimeout(noticeTimer);
    setNotice(null);
}

const nameOf = (holder: Lease): string => holder.user.name || "Someone";

// Entry is optimistic: with no known holder the session starts at once and the claim goes out
// behind it, so the common case has no latency and a `denied` answer ends the session.
export function installCollabGates(): void {
    onEditSession(
        (address) => {
            const holder = leaseHolder(address);
            if (holder) {
                say(`${nameOf(holder)} is editing this`);
                // Two people reaching for the same element is the friction the lease exists for.
                capture("collab_edit_blocked", {
                    element_type: getElementAt(editor.artifact, address)?.type ?? "",
                });
                return false;
            }
            const ref = elementRefFor(address);
            if (ref) claimLease(ref);
            return true;
        },
        (address) => {
            const ref = elementRefFor(address);
            if (ref) releaseLease(ref);
        },
    );
    onEditSessionEnded(() => say("That was deleted while you were editing it"));
}

/**
 * The room re-resolved what this connection may do, because a grant, a role, or the artifact's own
 * level changed while the tab was open. The editor's gate follows it at once rather than at the next
 * reload: anything typed but not yet committed is lost with the access that would have saved it,
 * which is why the line says so.
 */
export function collabAccess(access: ArtifactAccess): void {
    const had = canEdit();
    setEditAccess(access);
    if (atLeast(access, "edit")) return;
    if (editing()) stopEditing();
    if (had) say("Your access to this changed, so you can no longer edit it");
}

/** The server refused the claim; whoever actually holds it wins and this session stops. */
export function collabDenied(element: ElementRef, holder: Lease | null): void {
    collabLease(element, holder);
    const current = editing();
    const ref = current && elementRefFor(current);
    if (!ref || ref.sectionId !== element.sectionId || ref.elementId !== element.elementId) return;
    stopEditing();
    say(holder ? `${nameOf(holder)} is editing this` : "You can't edit this");
}
