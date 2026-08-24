import type { ArtifactAccess, Id, SectionOp } from "./artifact";
import { isAccess } from "./artifact";

// The live-collaboration wire contract: what a client and the room server say to each other, plus
// the pure helpers both sides need. Frames are JSON and every inbound one is guarded here, so
// neither end ever casts a message it received.
//
// The engine invariant lives in this file's shapes: nothing here carries a pixel. A cursor is an
// element or section id plus fractions of that box, and each client maps it back through its OWN
// engine output, so a peer on a phone and a peer on a desktop agree on where the cursor is without
// ever agreeing on a coordinate system.

/** Client re-sends presence at least this often, even when idle. */
export const HEARTBEAT_MS = 15_000;
/** The server drops a connection whose presence went quiet for this long. */
export const PRESENCE_TTL_MS = 30_000;
/** How many recent op broadcasts a room keeps for cheap catch-up; a longer gap resyncs. */
export const OP_BUFFER = 256;

// ---- presence -------------------------------------------------------------------------------

export interface CollabUser {
    id: string;
    name: string | null;
    avatarUrl: string | null;
}

/** Where a cursor is, in content terms. Over an element: fractions of that element's box. */
export interface ElementCursor {
    sectionId: Id;
    elementId: Id;
    fx: number; // 0..1 across the element region
    fy: number;
}

/** Over a section but not over any element: fractions of the section box. */
export interface SectionCursor {
    sectionId: Id;
    nx: number;
    ny: number;
}

export type CollabCursor = { el: ElementCursor } | { sec: SectionCursor };

/** The addressed element of an edit lease or a selection outline. */
export interface ElementRef {
    sectionId: Id;
    elementId: Id;
}

export interface PresenceState {
    cursor?: CollabCursor | null;
    selection?: ElementRef | null;
    editing?: ElementRef | null;
}

export interface Peer {
    connId: string;
    user: CollabUser;
    color: string;
    canEdit: boolean;
    state: PresenceState;
}

/** Who holds the lease on one element right now. */
export interface Lease {
    element: ElementRef;
    connId: string;
    user: CollabUser;
    color: string;
}

// ---- messages -------------------------------------------------------------------------------

export type ClientMessage =
    | { t: "hello"; lastSeq?: number }
    | { t: "presence"; state: PresenceState }
    | { t: "ops"; tag: string; ops: SectionOp[] }
    | { t: "claim"; element: ElementRef }
    | { t: "release"; element: ElementRef }
    | { t: "ping" };

/** Who wrote a broadcast batch: a person, or the server applying an AI turn. */
export type OpAuthor = { kind: "user"; connId: string; userId: string } | { kind: "ai" };

export type ServerMessage =
    | { t: "welcome"; connId: string; seq: number; self: Peer; roster: Peer[]; leases: Lease[] }
    | { t: "peer"; connId: string; peer: Peer | null } // null = left
    | { t: "ops"; seq: number; author: OpAuthor; ops: SectionOp[] }
    | { t: "ack"; tag: string; seq: number }
    | { t: "reject"; tag: string; reason: string }
    | { t: "granted"; element: ElementRef }
    // holder null = the claim was refused outright, not lost to someone: this connection may not edit
    | { t: "denied"; element: ElementRef; holder: Lease | null }
    | { t: "lease"; element: ElementRef; holder: Lease | null }
    // What this connection may do here, re-resolved after a grant, a role, or the artifact's own
    // level changed. A drop to `none` closes the socket instead, so this only ever carries a level.
    | { t: "access"; access: ArtifactAccess }
    | { t: "resync"; seq: number };

// ---- guards ---------------------------------------------------------------------------------
//
// A socket frame is untrusted input under the same rule as a request body: parse it, never cast it.
// These are guards rather than parsers on purpose, so an op keeps every field it arrived with (the
// same reason the section-op route guards instead of rebuilding).

const isObj = (v: unknown): v is Record<string, unknown> =>
    !!v && typeof v === "object" && !Array.isArray(v);

const isFraction = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

const isId = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= 128;

export const isElementRef = (v: unknown): v is ElementRef =>
    isObj(v) && isId(v.sectionId) && isId(v.elementId);

export function isCollabCursor(v: unknown): v is CollabCursor {
    if (!isObj(v)) return false;
    if (isObj(v.el))
        return (
            isId(v.el.sectionId) &&
            isId(v.el.elementId) &&
            isFraction(v.el.fx) &&
            isFraction(v.el.fy)
        );
    if (isObj(v.sec)) return isId(v.sec.sectionId) && isFraction(v.sec.nx) && isFraction(v.sec.ny);
    return false;
}

export function isPresenceState(v: unknown): v is PresenceState {
    if (!isObj(v)) return false;
    if (v.cursor != null && !isCollabCursor(v.cursor)) return false;
    if (v.selection != null && !isElementRef(v.selection)) return false;
    if (v.editing != null && !isElementRef(v.editing)) return false;
    return true;
}

// The server's read of an inbound frame. `isOp` is injected because what a valid section op is
// belongs to the layer that applies them, and model may not reach into services.
export function readClientMessage(
    raw: unknown,
    isOp: (op: unknown) => op is SectionOp,
): ClientMessage | null {
    if (!isObj(raw)) return null;
    switch (raw.t) {
        case "hello":
            return {
                t: "hello",
                ...(typeof raw.lastSeq === "number" && Number.isFinite(raw.lastSeq)
                    ? { lastSeq: Math.trunc(raw.lastSeq) }
                    : {}),
            };
        case "presence":
            return isPresenceState(raw.state) ? { t: "presence", state: raw.state } : null;
        case "ops": {
            if (typeof raw.tag !== "string" || !Array.isArray(raw.ops)) return null;
            if (!raw.ops.length || !raw.ops.every(isOp)) return null;
            return { t: "ops", tag: raw.tag, ops: raw.ops };
        }
        case "claim":
            return isElementRef(raw.element) ? { t: "claim", element: raw.element } : null;
        case "release":
            return isElementRef(raw.element) ? { t: "release", element: raw.element } : null;
        case "ping":
            return { t: "ping" };
        default:
            return null;
    }
}

/** The client's read of an inbound frame; the server's own shapes, so this stays a shape check. */
export function readServerMessage(
    raw: unknown,
    isOp: (op: unknown) => op is SectionOp,
): ServerMessage | null {
    if (!isObj(raw)) return null;
    switch (raw.t) {
        case "welcome":
            return typeof raw.connId === "string" &&
                typeof raw.seq === "number" &&
                isPeer(raw.self) &&
                Array.isArray(raw.roster) &&
                raw.roster.every(isPeer) &&
                Array.isArray(raw.leases) &&
                raw.leases.every(isLease)
                ? {
                      t: "welcome",
                      connId: raw.connId,
                      seq: raw.seq,
                      self: raw.self,
                      roster: raw.roster,
                      leases: raw.leases,
                  }
                : null;
        case "peer":
            if (typeof raw.connId !== "string") return null;
            if (raw.peer === null) return { t: "peer", connId: raw.connId, peer: null };
            return isPeer(raw.peer) ? { t: "peer", connId: raw.connId, peer: raw.peer } : null;
        case "ops":
            return typeof raw.seq === "number" &&
                isOpAuthor(raw.author) &&
                Array.isArray(raw.ops) &&
                raw.ops.every(isOp)
                ? { t: "ops", seq: raw.seq, author: raw.author, ops: raw.ops }
                : null;
        case "ack":
            return typeof raw.tag === "string" && typeof raw.seq === "number"
                ? { t: "ack", tag: raw.tag, seq: raw.seq }
                : null;
        case "reject":
            return typeof raw.tag === "string" && typeof raw.reason === "string"
                ? { t: "reject", tag: raw.tag, reason: raw.reason }
                : null;
        case "granted":
            return isElementRef(raw.element) ? { t: "granted", element: raw.element } : null;
        case "denied":
            if (!isElementRef(raw.element)) return null;
            if (raw.holder === null) return { t: "denied", element: raw.element, holder: null };
            return isLease(raw.holder)
                ? { t: "denied", element: raw.element, holder: raw.holder }
                : null;
        case "lease":
            if (!isElementRef(raw.element)) return null;
            if (raw.holder === null) return { t: "lease", element: raw.element, holder: null };
            return isLease(raw.holder)
                ? { t: "lease", element: raw.element, holder: raw.holder }
                : null;
        case "access":
            return isAccess(raw.access) && raw.access !== "none"
                ? { t: "access", access: raw.access }
                : null;
        case "resync":
            return typeof raw.seq === "number" ? { t: "resync", seq: raw.seq } : null;
        default:
            return null;
    }
}

const isUser = (v: unknown): v is CollabUser =>
    isObj(v) &&
    typeof v.id === "string" &&
    (v.name === null || typeof v.name === "string") &&
    (v.avatarUrl === null || typeof v.avatarUrl === "string");

const isPeer = (v: unknown): v is Peer =>
    isObj(v) &&
    typeof v.connId === "string" &&
    isUser(v.user) &&
    typeof v.color === "string" &&
    typeof v.canEdit === "boolean" &&
    isPresenceState(v.state);

const isLease = (v: unknown): v is Lease =>
    isObj(v) &&
    isElementRef(v.element) &&
    typeof v.connId === "string" &&
    isUser(v.user) &&
    typeof v.color === "string";

const isOpAuthor = (v: unknown): v is OpAuthor =>
    isObj(v) &&
    ((v.kind === "user" && typeof v.connId === "string" && typeof v.userId === "string") ||
        v.kind === "ai");

// ---- pure helpers ---------------------------------------------------------------------------

/** The map key for a lease or a pending write; section ids never contain ":". */
export const leaseKey = (el: ElementRef): string => `${el.sectionId}:${el.elementId}`;

// Peer colours, assigned by join order from a small curated set. Deterministic so two clients
// showing the same room agree, and readable on both a light and a dark canvas.
export const PEER_COLORS = [
    "#2f6df6",
    "#e0632c",
    "#129d78",
    "#a24bd6",
    "#d13b6b",
    "#0c8ec4",
    "#c08b1b",
    "#5b6ef5",
] as const;

export const colorForIndex = (i: number): string =>
    PEER_COLORS[((i % PEER_COLORS.length) + PEER_COLORS.length) % PEER_COLORS.length]!;

/** A box in the local client's own engine output; fractions are taken against it. */
export interface CursorBox {
    x: number;
    y: number;
    w: number;
    h: number;
}

const clamp01 = (n: number): number => (n < 0 ? 0 : n > 1 ? 1 : n);

/** A point over an element becomes fractions of that element's box. */
export function encodeElementCursor(
    el: ElementRef,
    box: CursorBox,
    point: { x: number; y: number },
): CollabCursor {
    return {
        el: {
            ...el,
            fx: clamp01(box.w > 0 ? (point.x - box.x) / box.w : 0),
            fy: clamp01(box.h > 0 ? (point.y - box.y) / box.h : 0),
        },
    };
}

/** A point over a section but no element becomes fractions of the section box. */
export function encodeSectionCursor(
    sectionId: Id,
    box: CursorBox,
    point: { x: number; y: number },
): CollabCursor {
    return {
        sec: {
            sectionId,
            nx: clamp01(box.w > 0 ? (point.x - box.x) / box.w : 0),
            ny: clamp01(box.h > 0 ? (point.y - box.y) / box.h : 0),
        },
    };
}

// Back to a local point. `boxOf` answers from the receiving client's own engine output, so a cursor
// lands where the content is here rather than where it was on the sender's screen. A section whose
// content has not painted yet has no element box, so the cursor falls back to the section band.
export function decodeCursor(
    cursor: CollabCursor,
    boxOf: (ref: { sectionId: Id; elementId?: Id }) => CursorBox | null,
): { x: number; y: number } | null {
    if ("el" in cursor) {
        const box = boxOf({ sectionId: cursor.el.sectionId, elementId: cursor.el.elementId });
        if (box) return { x: box.x + cursor.el.fx * box.w, y: box.y + cursor.el.fy * box.h };
        const fallback = boxOf({ sectionId: cursor.el.sectionId });
        return fallback
            ? {
                  x: fallback.x + cursor.el.fx * fallback.w,
                  y: fallback.y + cursor.el.fy * fallback.h,
              }
            : null;
    }
    const box = boxOf({ sectionId: cursor.sec.sectionId });
    return box ? { x: box.x + cursor.sec.nx * box.w, y: box.y + cursor.sec.ny * box.h } : null;
}

/** The section a cursor sits in, whichever form it took; used to place an unmaterialized peer. */
export const cursorSection = (cursor: CollabCursor): Id =>
    "el" in cursor ? cursor.el.sectionId : cursor.sec.sectionId;
