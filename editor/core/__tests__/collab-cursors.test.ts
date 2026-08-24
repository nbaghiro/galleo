import { describe, expect, it } from "vitest";
import type { ElementAddress, Target } from "@model/artifact";
import type { CursorBox, Lease, Peer } from "@model/collab";
import { colorForIndex, decodeCursor, leaseKey } from "@model/collab";
import type { CursorSource, Self } from "@editor/core/collab";
import {
    dueToSend,
    encodeCursorAt,
    followScroll,
    leasesOf,
    peopleOf,
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

const peer = (connId: string, i = 0, userId = `u-${connId}`): Peer => ({
    connId,
    user: { id: userId, name: userId, avatarUrl: null },
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

// A person is not a socket. They hold two connections whenever a second tab is open, and for the
// length of the presence timeout after an unclean drop, because the connection they left behind
// stays in the room until it is swept while the new one has already joined. The roster is keyed by
// connection because ops and leases are; presence is about the person.
describe("who counts as another person in the room", () => {
    const me = (connId: string, userId: string): Self => ({ connId, userId });

    it("does not draw the reader their own connection", () => {
        expect(peopleOf([peer("c1", 0, "u-me")], me("c1", "u-me"))).toEqual([]);
    });

    // The reported bug, half one: alone in the editor with an avatar in the topbar, which was the
    // ghost of the reader's own previous connection still sitting in the room.
    it("does not draw the reader the connection they just replaced", () => {
        const roster = [peer("c1", 0, "u-me"), peer("c2", 1, "u-me")];
        expect(peopleOf(roster, me("c2", "u-me"))).toEqual([]);
    });

    // Half two: a peer who reconnected appeared twice, once live and once as their ghost.
    it("draws a peer once however many connections they hold", () => {
        const roster = [peer("c1", 0, "u-me"), peer("c2", 1, "u-sam"), peer("c3", 2, "u-sam")];
        expect(peopleOf(roster, me("c1", "u-me")).map((p) => p.user.id)).toEqual(["u-sam"]);
    });

    // The newest connection is the live one; the one it replaced holds a position nobody is at.
    it("keeps the newest of a person's connections, not the one being swept", () => {
        const roster = [peer("c2", 1, "u-sam"), peer("c3", 2, "u-sam")];
        expect(peopleOf(roster, me("c1", "u-me"))[0]?.connId).toBe("c3");
    });

    it("still tells two different people apart", () => {
        const roster = [peer("c2", 1, "u-sam"), peer("c3", 2, "u-ada")];
        expect(peopleOf(roster, me("c1", "u-me")).map((p) => p.user.id)).toEqual([
            "u-sam",
            "u-ada",
        ]);
    });

    // Before the welcome frame lands there is no person to compare against, and the socket is all
    // the reader knows about themselves.
    it("falls back to the connection when the person is not known yet", () => {
        const roster = [peer("c1", 0, "u-me"), peer("c2", 1, "u-sam")];
        expect(peopleOf(roster, { connId: "c1", userId: null }).map((p) => p.connId)).toEqual([
            "c2",
        ]);
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

// Following keeps a peer on screen rather than mirroring their scroll: presence carries where they
// ARE (a cursor, a selection, an edit session) and never what they see, so there is no viewport to
// mirror. The rule below is the whole of it, and the null case carries as much weight as the number.
describe("followScroll", () => {
    const view = { top: 1000, height: 800 };

    it("does nothing while they are comfortably inside the viewport", () => {
        expect(followScroll({ y: 1400, h: 0 }, view)).toBe(null);
    });

    it("centres them when they drift off the bottom", () => {
        // 2200 is below the viewport, which ends at 1800
        expect(followScroll({ y: 2200, h: 0 }, view)).toBe(1800);
    });

    it("centres them when they drift off the top", () => {
        expect(followScroll({ y: 200, h: 0 }, view)).toBe(0);
    });

    // The margin is what stops a follow fighting the reader for the scrollbar: a cursor a few
    // pixels inside the edge is still "off screen enough" to move for.
    it("moves for a peer inside the viewport but under its margin", () => {
        expect(followScroll({ y: 1740, h: 0 }, view)).not.toBe(null);
        expect(followScroll({ y: 1600, h: 0 }, view)).toBe(null);
    });

    it("scales the margin down rather than swallowing a short viewport whole", () => {
        const short = { top: 0, height: 200 };
        // a quarter of 200 leaves a 100px band in the middle; 120 is inside it
        expect(followScroll({ y: 120, h: 0 }, short)).toBe(null);
        expect(followScroll({ y: 30, h: 0 }, short)).not.toBe(null);
    });

    it("takes the whole box into account, not just its top edge", () => {
        // starts in view, but a tall element runs past the bottom margin
        expect(followScroll({ y: 1500, h: 400 }, view)).not.toBe(null);
    });

    it("never scrolls above the top of the document", () => {
        expect(followScroll({ y: 10, h: 0 }, view)).toBe(0);
    });

    // Clicking an avatar means "take me there" even when they are already on screen, so the click
    // path forces a centre that the ongoing follow would have skipped.
    it("centres regardless when the reader asked to be taken there", () => {
        expect(followScroll({ y: 1400, h: 0 }, view, true)).toBe(1000);
    });
});
