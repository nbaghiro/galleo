import { createMemo, createSignal } from "solid-js";
import type { ElementAddress, Id, Target } from "@model/artifact";
import { elementRegionId, parentTarget, sectionRegionId } from "@model/artifact";
import type {
    CollabCursor,
    CursorBox,
    ElementRef,
    Lease,
    Peer,
    PresenceState,
} from "@model/collab";
import { decodeCursor, encodeElementCursor, encodeSectionCursor, leaseKey } from "@model/collab";
import { elementIdMap, getElementAt } from "@elements/ops";
import {
    canvasContentWidth,
    editing,
    editor,
    onEditSession,
    onEditSessionEnded,
    regions,
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
export type LeaseMap = ReadonlyMap<string, Lease>;

const [peers, setPeers] = createSignal<PeerMap>(new Map());
const [leases, setLeases] = createSignal<LeaseMap>(new Map());
const [selfConnId, setSelfConnId] = createSignal<string | null>(null);
const [connected, setConnected] = createSignal(false);

export { peers, leases, selfConnId };

/** True once the room is open; the chrome that only makes sense with a room reads this. */
export const collabActive = (): boolean => connected();

/** Other people in the room, in join order; the avatar stack renders only when this is non-empty. */
export const otherPeers = createMemo((): Peer[] => {
    const me = selfConnId();
    return [...peers().values()].filter((p) => p.connId !== me);
});

export function collabWelcome(connId: string, roster: Peer[], live: Lease[]): void {
    setSelfConnId(connId);
    setPeers(rosterOf(roster));
    setLeases(leasesOf(live));
    setConnected(true);
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
    setPeers(new Map());
    setLeases(new Map());
    setSelfConnId(null);
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

const addressOf = (elementId: Id): ElementAddress | undefined =>
    elementIdMap(editor.artifact).get(elementId);

const boxOfRegion = (id: string): CursorBox | null => {
    const region = regions().find((r) => r.id === id);
    return region ? region.box : null;
};

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
export const remoteCursors = createMemo((): RemoteCursor[] => {
    const me = selfConnId();
    const out: RemoteCursor[] = [];
    for (const peer of peers().values()) {
        if (peer.connId === me) continue;
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

/** The server refused the claim; whoever actually holds it wins and this session stops. */
export function collabDenied(element: ElementRef, holder: Lease | null): void {
    collabLease(element, holder);
    const current = editing();
    const ref = current && elementRefFor(current);
    if (!ref || ref.sectionId !== element.sectionId || ref.elementId !== element.elementId) return;
    stopEditing();
    say(holder ? `${nameOf(holder)} is editing this` : "You can't edit this");
}
