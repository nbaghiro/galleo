import { describe, expect, it } from "vitest";
import type { ElementAddress, Target } from "@model/artifact";
import type { CursorBox, Lease, Peer } from "@model/collab";
import { colorForIndex, decodeCursor, leaseKey } from "@model/collab";
import type { CursorSource } from "@editor/core/collab";
import {
    dueToSend,
    encodeCursorAt,
    leasesOf,
    rosterOf,
    samePresence,
    withLease,
    withoutConnection,
    withPeer,
} from "@editor/core/collab";

// Fake engine output: the tests never touch a real canvas, they hand these boxes to the encoder and
// the decoder and check that a cursor is described in content terms rather than in pixels.

const box = (x: number, y: number, w: number, h: number): CursorBox => ({ x, y, w, h });

const address = (section: string, path: number[]): ElementAddress => ({ section, path });
const elementTarget = (section: string, path: number[]): Target => ({
    kind: "element",
    address: address(section, path),
});

const source = (opts: {
    ids?: Record<string, string>;
    boxes?: Record<string, CursorBox>;
}): CursorSource => ({
    elementIdOf: (a) => opts.ids?.[`${a.section}:${a.path.join(".")}`],
    boxOf: (t) =>
        opts.boxes?.[
            t.kind === "section" ? t.section : `${t.address.section}:${t.address.path.join(".")}`
        ] ?? null,
});

const peer = (connId: string, i = 0): Peer => ({
    connId,
    user: { id: `u-${connId}`, name: connId, avatarUrl: null },
    color: colorForIndex(i),
    canEdit: true,
    state: {},
});

const lease = (elementId: string, connId: string): Lease => ({
    element: { sectionId: "s1", elementId },
    connId,
    user: { id: `u-${connId}`, name: connId, avatarUrl: null },
    color: "#2f6df6",
});

describe("encodeCursorAt", () => {
    it("names the element under the pointer and how far across it the pointer is", () => {
        const cursor = encodeCursorAt(
            { x: 150, y: 60 },
            elementTarget("s1", [0]),
            source({ ids: { "s1:0": "e1" }, boxes: { "s1:0": box(100, 50, 200, 40) } }),
        );
        expect(cursor).toEqual({ el: { sectionId: "s1", elementId: "e1", fx: 0.25, fy: 0.25 } });
    });

    it("walks up to an ancestor with an id when the element itself has none yet", () => {
        const cursor = encodeCursorAt(
            { x: 150, y: 60 },
            elementTarget("s1", [0, 2]),
            source({ ids: { "s1:0": "e1" }, boxes: { "s1:0": box(100, 50, 200, 40) } }),
        );
        expect(cursor).toEqual({ el: { sectionId: "s1", elementId: "e1", fx: 0.25, fy: 0.25 } });
    });

    it("falls back to the section when nothing in the chain can be named", () => {
        const cursor = encodeCursorAt(
            { x: 500, y: 200 },
            elementTarget("s1", [0]),
            source({ boxes: { s1: box(0, 0, 1000, 400) } }),
        );
        expect(cursor).toEqual({ sec: { sectionId: "s1", nx: 0.5, ny: 0.5 } });
    });

    it("returns nothing when the pointer is over no content at all", () => {
        expect(encodeCursorAt({ x: 5, y: 5 }, null, source({}))).toBeNull();
    });

    it("returns nothing when even the section has no painted box", () => {
        expect(
            encodeCursorAt({ x: 5, y: 5 }, { kind: "section", section: "s1" }, source({})),
        ).toBeNull();
    });

    it("round-trips through a client whose boxes are somewhere else entirely", () => {
        const cursor = encodeCursorAt(
            { x: 150, y: 60 },
            elementTarget("s1", [0]),
            source({ ids: { "s1:0": "e1" }, boxes: { "s1:0": box(100, 50, 200, 40) } }),
        );
        // the receiver's own engine put that element in a different place, at a different size
        const here = decodeCursor(cursor!, (ref) =>
            ref.elementId === "e1" ? box(0, 900, 400, 80) : null,
        );
        expect(here).toEqual({ x: 100, y: 920 });
    });

    it("lands a peer at the section band when their element has not painted here yet", () => {
        const cursor = encodeCursorAt(
            { x: 150, y: 70 },
            elementTarget("s1", [0]),
            source({ ids: { "s1:0": "e1" }, boxes: { "s1:0": box(100, 50, 200, 40) } }),
        );
        const here = decodeCursor(cursor!, (ref) =>
            ref.elementId ? null : box(0, 2000, 1000, 300),
        );
        expect(here).toEqual({ x: 250, y: 2150 });
    });
});

describe("the roster and lease maps", () => {
    it("builds a roster keyed by connection", () => {
        const roster = rosterOf([peer("a", 0), peer("b", 1)]);
        expect([...roster.keys()]).toEqual(["a", "b"]);
        expect(roster.get("a")?.color).not.toBe(roster.get("b")?.color);
    });

    it("adds, replaces, and removes one peer without touching the others", () => {
        let roster = rosterOf([peer("a"), peer("b", 1)]);
        roster = withPeer(roster, "c", peer("c", 2));
        expect(roster.size).toBe(3);
        const moved = {
            ...peer("a"),
            state: { cursor: { sec: { sectionId: "s2", nx: 0, ny: 0 } } },
        };
        roster = withPeer(roster, "a", moved);
        expect(roster.get("a")?.state.cursor).toBeDefined();
        expect(roster.get("b")).toBeDefined();
        roster = withPeer(roster, "b", null);
        expect([...roster.keys()]).toEqual(["a", "c"]);
    });

    it("keys leases by element and replaces the holder in place", () => {
        let held = leasesOf([lease("e1", "a")]);
        expect(held.get(leaseKey({ sectionId: "s1", elementId: "e1" }))?.connId).toBe("a");
        held = withLease(held, { sectionId: "s1", elementId: "e1" }, lease("e1", "b"));
        expect(held.get(leaseKey({ sectionId: "s1", elementId: "e1" }))?.connId).toBe("b");
        held = withLease(held, { sectionId: "s1", elementId: "e1" }, null);
        expect(held.size).toBe(0);
    });

    it("drops everything a departing connection was holding", () => {
        const held = leasesOf([lease("e1", "a"), lease("e2", "a"), lease("e3", "b")]);
        const after = withoutConnection(held, "a");
        expect([...after.values()].map((l) => l.element.elementId)).toEqual(["e3"]);
    });

    it("leaves the input maps alone", () => {
        const roster = rosterOf([peer("a")]);
        withPeer(roster, "b", peer("b", 1));
        expect(roster.size).toBe(1);
    });
});

describe("outbound throttling", () => {
    it("sends at the gap and not before it", () => {
        expect(dueToSend(1000, 1032, 33)).toBe(false);
        expect(dueToSend(1000, 1033, 33)).toBe(true);
        expect(dueToSend(0, 33, 33)).toBe(true); // nothing sent yet, so any real clock is past it
    });

    it("treats an unchanged presence as nothing to say", () => {
        const state = {
            cursor: { el: { sectionId: "s1", elementId: "e1", fx: 0.5, fy: 0.5 } },
            selection: { sectionId: "s1", elementId: "e1" },
            editing: null,
        };
        expect(samePresence(state, { ...state })).toBe(true);
        expect(samePresence({}, { cursor: null, selection: null, editing: null })).toBe(true);
    });

    it("ignores a cursor that moved by less than a fraction of a pixel", () => {
        const a = { cursor: { el: { sectionId: "s1", elementId: "e1", fx: 0.5, fy: 0.5 } } };
        const b = { cursor: { el: { sectionId: "s1", elementId: "e1", fx: 0.5005, fy: 0.5 } } };
        expect(samePresence(a, b)).toBe(true);
    });

    it("notices a real move, a different element, and a change of shape", () => {
        const a = { cursor: { el: { sectionId: "s1", elementId: "e1", fx: 0.5, fy: 0.5 } } };
        expect(
            samePresence(a, {
                cursor: { el: { sectionId: "s1", elementId: "e1", fx: 0.8, fy: 0.5 } },
            }),
        ).toBe(false);
        expect(
            samePresence(a, {
                cursor: { el: { sectionId: "s1", elementId: "e2", fx: 0.5, fy: 0.5 } },
            }),
        ).toBe(false);
        expect(samePresence(a, { cursor: { sec: { sectionId: "s1", nx: 0.5, ny: 0.5 } } })).toBe(
            false,
        );
        expect(samePresence(a, { cursor: null })).toBe(false);
    });

    it("notices a change of selection or edit session", () => {
        const base = { cursor: null, selection: { sectionId: "s1", elementId: "e1" } };
        expect(
            samePresence(base, { cursor: null, selection: { sectionId: "s1", elementId: "e2" } }),
        ).toBe(false);
        expect(
            samePresence(base, {
                cursor: null,
                selection: { sectionId: "s1", elementId: "e1" },
                editing: { sectionId: "s1", elementId: "e1" },
            }),
        ).toBe(false);
    });
});
