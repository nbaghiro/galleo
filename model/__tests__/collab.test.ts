import { describe, expect, it } from "vitest";
import type { SectionOp } from "@model/artifact";
import type { CollabCursor, CursorBox, Peer } from "@model/collab";
import {
    colorForIndex,
    cursorSection,
    decodeCursor,
    encodeElementCursor,
    encodeSectionCursor,
    isCollabCursor,
    isElementRef,
    isPresenceState,
    leaseKey,
    PEER_COLORS,
    readClientMessage,
    readServerMessage,
} from "@model/collab";

// the room's own op guard, kept minimal here: what a valid section op is belongs to services
const isOp = (op: unknown): op is SectionOp =>
    !!op && typeof op === "object" && typeof (op as { kind?: unknown }).kind === "string";

const box = (x: number, y: number, w: number, h: number): CursorBox => ({ x, y, w, h });
const ref = { sectionId: "s1", elementId: "e1" };

const peer = (connId: string): Peer => ({
    connId,
    user: { id: "u1", name: "Ada", avatarUrl: null },
    color: "#2f6df6",
    canEdit: true,
    state: {},
});

describe("leaseKey", () => {
    it("keys an element by its section and id", () => {
        expect(leaseKey(ref)).toBe("s1:e1");
        expect(leaseKey({ sectionId: "s1", elementId: "e2" })).not.toBe(leaseKey(ref));
        expect(leaseKey({ sectionId: "s2", elementId: "e1" })).not.toBe(leaseKey(ref));
    });
});

describe("peer colours", () => {
    it("is stable for an index and wraps rather than running out", () => {
        expect(colorForIndex(0)).toBe(PEER_COLORS[0]);
        expect(colorForIndex(1)).toBe(PEER_COLORS[1]);
        expect(colorForIndex(PEER_COLORS.length)).toBe(PEER_COLORS[0]);
        expect(colorForIndex(-1)).toBe(PEER_COLORS[PEER_COLORS.length - 1]);
    });

    it("assigns a different colour to each of the first few joiners", () => {
        const first = [0, 1, 2, 3].map(colorForIndex);
        expect(new Set(first).size).toBe(4);
    });
});

// The engine invariant: nothing on the wire is a pixel. A cursor is content-relative and each
// client maps it back through its own engine output.
describe("cursor encode and decode", () => {
    it("round-trips a point over an element through identical boxes", () => {
        const cursor = encodeElementCursor(ref, box(100, 200, 400, 100), { x: 300, y: 250 });
        expect(cursor).toEqual({ el: { ...ref, fx: 0.5, fy: 0.5 } });
        const back = decodeCursor(cursor, () => box(100, 200, 400, 100));
        expect(back).toEqual({ x: 300, y: 250 });
    });

    it("lands the same fraction on a differently sized box, which is the point", () => {
        const cursor = encodeElementCursor(ref, box(0, 0, 400, 100), { x: 100, y: 50 });
        const back = decodeCursor(cursor, () => box(0, 0, 800, 200));
        expect(back).toEqual({ x: 200, y: 100 });
    });

    it("clamps a point outside the box rather than encoding a value past the edge", () => {
        const cursor = encodeElementCursor(ref, box(0, 0, 100, 100), { x: -50, y: 300 });
        expect(cursor).toEqual({ el: { ...ref, fx: 0, fy: 1 } });
    });

    it("survives a zero-width box without producing NaN", () => {
        const cursor = encodeElementCursor(ref, box(10, 10, 0, 0), { x: 40, y: 40 });
        expect(cursor).toEqual({ el: { ...ref, fx: 0, fy: 0 } });
    });

    it("round-trips a section cursor", () => {
        const cursor = encodeSectionCursor("s1", box(0, 500, 1000, 400), { x: 250, y: 600 });
        expect(cursor).toEqual({ sec: { sectionId: "s1", nx: 0.25, ny: 0.25 } });
        expect(decodeCursor(cursor, () => box(0, 500, 1000, 400))).toEqual({ x: 250, y: 600 });
    });

    it("falls back to the section band when the element has not painted here yet", () => {
        const cursor = encodeElementCursor(ref, box(0, 0, 200, 100), { x: 100, y: 50 });
        const back = decodeCursor(cursor, (r) => (r.elementId ? null : box(0, 900, 1000, 200)));
        expect(back).toEqual({ x: 500, y: 1000 });
    });

    it("returns null when even the section is not on screen", () => {
        const cursor = encodeSectionCursor("s9", box(0, 0, 100, 100), { x: 50, y: 50 });
        expect(decodeCursor(cursor, () => null)).toBeNull();
    });

    it("names the section a cursor is in, whichever form it took", () => {
        expect(cursorSection({ el: { ...ref, fx: 0, fy: 0 } })).toBe("s1");
        expect(cursorSection({ sec: { sectionId: "s7", nx: 0, ny: 0 } })).toBe("s7");
    });
});

describe("guards", () => {
    it("accepts both cursor shapes and refuses anything else", () => {
        expect(isCollabCursor({ el: { ...ref, fx: 0.1, fy: 0.2 } })).toBe(true);
        expect(isCollabCursor({ sec: { sectionId: "s1", nx: 0, ny: 1 } })).toBe(true);
        expect(isCollabCursor({ el: { ...ref, fx: "0.1", fy: 0.2 } })).toBe(false);
        expect(isCollabCursor({ el: { sectionId: "s1", fx: 0, fy: 0 } })).toBe(false);
        expect(isCollabCursor({ x: 12, y: 40 })).toBe(false); // an absolute point is not a cursor
        expect(isCollabCursor(null)).toBe(false);
    });

    it("refuses a cursor whose fraction is not finite", () => {
        expect(isCollabCursor({ sec: { sectionId: "s1", nx: Number.NaN, ny: 0 } })).toBe(false);
        expect(
            isCollabCursor({ sec: { sectionId: "s1", nx: Number.POSITIVE_INFINITY, ny: 0 } }),
        ).toBe(false);
    });

    it("checks an element ref", () => {
        expect(isElementRef(ref)).toBe(true);
        expect(isElementRef({ sectionId: "s1" })).toBe(false);
        expect(isElementRef({ sectionId: "", elementId: "e1" })).toBe(false);
    });

    it("takes a presence state with nothing set, and rejects a malformed member", () => {
        expect(isPresenceState({})).toBe(true);
        expect(isPresenceState({ cursor: null, selection: null, editing: null })).toBe(true);
        expect(isPresenceState({ editing: { sectionId: "s1" } })).toBe(false);
        expect(isPresenceState({ cursor: { el: {} } })).toBe(false);
    });
});

describe("readClientMessage", () => {
    it("reads each frame the client sends", () => {
        expect(readClientMessage({ t: "hello" }, isOp)).toEqual({ t: "hello" });
        expect(readClientMessage({ t: "hello", lastSeq: 12.7 }, isOp)).toEqual({
            t: "hello",
            lastSeq: 12,
        });
        expect(readClientMessage({ t: "ping" }, isOp)).toEqual({ t: "ping" });
        expect(readClientMessage({ t: "claim", element: ref }, isOp)).toEqual({
            t: "claim",
            element: ref,
        });
        expect(readClientMessage({ t: "release", element: ref }, isOp)).toEqual({
            t: "release",
            element: ref,
        });
        expect(readClientMessage({ t: "presence", state: { cursor: null } }, isOp)).toEqual({
            t: "presence",
            state: { cursor: null },
        });
    });

    it("keeps an op batch's ops exactly as they arrived", () => {
        const ops = [{ kind: "data", sectionId: "s1", elementId: "e1", keys: { text: "x" } }];
        const msg = readClientMessage({ t: "ops", tag: "t1", ops }, isOp);
        expect(msg).toEqual({ t: "ops", tag: "t1", ops });
        expect(msg && msg.t === "ops" && msg.ops[0]).toBe(ops[0]);
    });

    it("drops a frame it does not recognize or cannot trust", () => {
        expect(readClientMessage({ t: "nope" }, isOp)).toBeNull();
        expect(readClientMessage("hello", isOp)).toBeNull();
        expect(readClientMessage(null, isOp)).toBeNull();
        expect(readClientMessage({ t: "ops", tag: "t1", ops: [] }, isOp)).toBeNull();
        expect(readClientMessage({ t: "ops", tag: 5, ops: [{ kind: "set" }] }, isOp)).toBeNull();
        expect(readClientMessage({ t: "ops", tag: "t", ops: [{}] }, isOp)).toBeNull();
        expect(readClientMessage({ t: "claim", element: { sectionId: "s" } }, isOp)).toBeNull();
        expect(readClientMessage({ t: "presence", state: 7 }, isOp)).toBeNull();
    });

    it("ignores a hello whose lastSeq is not a usable number", () => {
        expect(readClientMessage({ t: "hello", lastSeq: "12" }, isOp)).toEqual({ t: "hello" });
        expect(readClientMessage({ t: "hello", lastSeq: Number.NaN }, isOp)).toEqual({
            t: "hello",
        });
    });
});

describe("readServerMessage", () => {
    it("reads each frame the server sends", () => {
        const self = peer("c1");
        const lease = { element: ref, connId: "c1", user: self.user, color: self.color };
        expect(
            readServerMessage(
                { t: "welcome", connId: "c1", seq: 4, self, roster: [self], leases: [lease] },
                isOp,
            ),
        ).toMatchObject({ t: "welcome", seq: 4 });
        expect(readServerMessage({ t: "peer", connId: "c2", peer: null }, isOp)).toEqual({
            t: "peer",
            connId: "c2",
            peer: null,
        });
        expect(
            readServerMessage(
                { t: "ops", seq: 5, author: { kind: "ai" }, ops: [{ kind: "remove", id: "s1" }] },
                isOp,
            ),
        ).toMatchObject({ t: "ops", seq: 5 });
        expect(readServerMessage({ t: "ack", tag: "t1", seq: 6 }, isOp)).toEqual({
            t: "ack",
            tag: "t1",
            seq: 6,
        });
        expect(readServerMessage({ t: "reject", tag: "t1", reason: "gone" }, isOp)).toEqual({
            t: "reject",
            tag: "t1",
            reason: "gone",
        });
        expect(readServerMessage({ t: "granted", element: ref }, isOp)).toEqual({
            t: "granted",
            element: ref,
        });
        expect(readServerMessage({ t: "denied", element: ref, holder: lease }, isOp)).toMatchObject(
            {
                t: "denied",
            },
        );
        // holder null is a refusal rather than a lost race, and is a legal frame
        expect(readServerMessage({ t: "denied", element: ref, holder: null }, isOp)).toEqual({
            t: "denied",
            element: ref,
            holder: null,
        });
        expect(readServerMessage({ t: "lease", element: ref, holder: null }, isOp)).toEqual({
            t: "lease",
            element: ref,
            holder: null,
        });
        expect(readServerMessage({ t: "resync", seq: 9 }, isOp)).toEqual({ t: "resync", seq: 9 });
    });

    it("drops a frame it cannot trust", () => {
        expect(readServerMessage({ t: "welcome", connId: "c1", seq: 4 }, isOp)).toBeNull();
        expect(
            readServerMessage({ t: "ops", seq: 5, author: { kind: "who" }, ops: [] }, isOp),
        ).toBeNull();
        expect(
            readServerMessage({ t: "peer", connId: "c2", peer: { connId: 7 } }, isOp),
        ).toBeNull();
        expect(
            readServerMessage({ t: "denied", element: ref, holder: { connId: 1 } }, isOp),
        ).toBeNull();
        expect(readServerMessage({ t: "unknown" }, isOp)).toBeNull();
    });
});

// A payload that carried a pixel would let one client's viewport decide another's rendering, which
// is exactly what the engine invariant forbids.
describe("the wire carries no geometry", () => {
    it("keeps absolute coordinates out of a presence state", () => {
        const cursor: CollabCursor = encodeElementCursor(ref, box(120, 340, 200, 80), {
            x: 200,
            y: 380,
        });
        const json = JSON.stringify({ t: "presence", state: { cursor } });
        for (const pixel of ["120", "340", "200", "380", "80"]) {
            // the fractions are all in 0..1, so no source pixel value can appear
            expect(json).not.toContain(`:${pixel}`);
        }
    });
});
