import { beforeEach, describe, expect, it } from "vitest";
import type { ArtifactAccess, ArtifactContent, SectionOp } from "@model/artifact";
import { applySectionOps } from "@model/artifact";
import type { ServerMessage } from "@model/collab";
import { PRESENCE_TTL_MS } from "@model/collab";
import type { ApplyOutcome, RoomConnection, RoomDeps } from "@services/core/collab";
import { Room } from "@services/core/collab";

// The room is constructor-injected, so this whole suite runs with no socket and no database: the
// applier and the clock are the only things it reaches outside itself.

const TARGET = { artifactId: "a1", workspaceId: "w1" };

class Recorder implements RoomConnection {
    readonly sent: ServerMessage[] = [];
    closed = false;
    send(msg: ServerMessage): void {
        this.sent.push(msg);
    }
    close(): void {
        this.closed = true;
    }
    last<T extends ServerMessage["t"]>(t: T): Extract<ServerMessage, { t: T }> | undefined {
        for (let i = this.sent.length - 1; i >= 0; i--) {
            const msg = this.sent[i]!;
            if (msg.t === t) return msg as Extract<ServerMessage, { t: T }>;
        }
        return undefined;
    }
    ofType<T extends ServerMessage["t"]>(t: T): Extract<ServerMessage, { t: T }>[] {
        return this.sent.filter((m): m is Extract<ServerMessage, { t: T }> => m.t === t);
    }
}

const settle = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

let clock = 1_000;
let applied: SectionOp[][] = [];
let outcome: (ops: SectionOp[]) => ApplyOutcome;
let seq = 0;

const deps = (): RoomDeps => ({
    apply: (_target, ops) => {
        applied.push(ops);
        return Promise.resolve(outcome(ops));
    },
    now: () => clock,
});

const el = (elementId: string) => ({ sectionId: "s1", elementId });

const textKeyOf = (op: SectionOp | undefined): unknown =>
    op && op.kind === "data" ? op.keys.text : undefined;

const join = (room: Room, connId: string, access: ArtifactAccess = "edit"): Recorder => {
    const conn = new Recorder();
    room.join({
        connId,
        user: { id: `u-${connId}`, name: connId, avatarUrl: null },
        access,
        conn,
    });
    return conn;
};

beforeEach(() => {
    clock = 1_000;
    applied = [];
    seq = 0;
    outcome = () => ({ ok: true, seq: ++seq });
});

describe("joining and leaving", () => {
    it("welcomes the joiner with the room's seq, the roster, and the live leases", () => {
        const room = new Room(TARGET, 7, deps());
        const a = join(room, "a");
        const welcome = a.last("welcome");
        expect(welcome?.seq).toBe(7);
        expect(welcome?.connId).toBe("a");
        expect(welcome?.roster.map((p) => p.connId)).toEqual(["a"]);
        expect(welcome?.self.canEdit).toBe(true);
    });

    it("tells the people already in the room about a new peer, and not the joiner", () => {
        const room = new Room(TARGET, 0, deps());
        const a = join(room, "a");
        const b = join(room, "b");
        expect(a.last("peer")?.connId).toBe("b");
        expect(b.ofType("peer")).toHaveLength(0);
        expect(b.last("welcome")?.roster.map((p) => p.connId)).toEqual(["a", "b"]);
    });

    it("marks a read-only peer as such, so the roster can show it", () => {
        const room = new Room(TARGET, 0, deps());
        join(room, "a");
        const b = join(room, "b", "view");
        expect(b.last("welcome")?.self.canEdit).toBe(false);
    });

    it("announces a departure once and stops counting the peer", () => {
        const room = new Room(TARGET, 0, deps());
        const a = join(room, "a");
        join(room, "b");
        room.leave("b");
        expect(a.last("peer")).toEqual({ t: "peer", connId: "b", peer: null });
        expect(room.size).toBe(1);
        room.leave("b"); // a second close for the same connection is not a second departure
        expect(a.ofType("peer").filter((m) => m.peer === null)).toHaveLength(1);
    });

    it("gives each of the first joiners its own colour", () => {
        const room = new Room(TARGET, 0, deps());
        const colors = ["a", "b", "c"].map((id) => join(room, id).last("welcome")!.self.color);
        expect(new Set(colors).size).toBe(3);
    });
});

describe("presence", () => {
    it("passes a peer's state to everyone else, cursor fractions and all", () => {
        const room = new Room(TARGET, 0, deps());
        const a = join(room, "a");
        join(room, "b");
        room.handle("b", {
            t: "presence",
            state: { cursor: { el: { ...el("e1"), fx: 0.25, fy: 0.5 } } },
        });
        expect(a.last("peer")?.peer?.state.cursor).toEqual({
            el: { sectionId: "s1", elementId: "e1", fx: 0.25, fy: 0.5 },
        });
    });

    it("drops a connection that went quiet past the presence window", () => {
        const room = new Room(TARGET, 0, deps());
        const a = join(room, "a");
        const b = join(room, "b");
        clock += PRESENCE_TTL_MS - 1;
        room.handle("a", { t: "ping" }); // a keeps itself alive, b does not
        clock += 2;
        room.sweep();
        expect(room.size).toBe(1);
        expect(b.closed).toBe(true);
        expect(a.last("peer")).toEqual({ t: "peer", connId: "b", peer: null });
    });
});

describe("the edit lease", () => {
    it("grants a free element and tells everyone else who holds it", () => {
        const room = new Room(TARGET, 0, deps());
        const a = join(room, "a");
        const b = join(room, "b");
        room.handle("a", { t: "claim", element: el("e1") });
        expect(a.last("granted")?.element).toEqual(el("e1"));
        expect(b.last("lease")?.holder?.connId).toBe("a");
    });

    it("denies a second claim and names the holder", () => {
        const room = new Room(TARGET, 0, deps());
        join(room, "a");
        const b = join(room, "b");
        room.handle("a", { t: "claim", element: el("e1") });
        room.handle("b", { t: "claim", element: el("e1") });
        expect(b.last("denied")?.holder?.connId).toBe("a");
        expect(b.last("granted")).toBeUndefined();
    });

    it("lets the holder re-claim what it already holds", () => {
        const room = new Room(TARGET, 0, deps());
        const a = join(room, "a");
        room.handle("a", { t: "claim", element: el("e1") });
        room.handle("a", { t: "claim", element: el("e1") });
        expect(a.ofType("granted")).toHaveLength(2);
        expect(a.last("denied")).toBeUndefined();
    });

    it("refuses a claim from someone who may not edit, with no holder to blame", () => {
        const room = new Room(TARGET, 0, deps());
        const b = join(room, "b", "comment");
        room.handle("b", { t: "claim", element: el("e1") });
        expect(b.last("denied")).toEqual({ t: "denied", element: el("e1"), holder: null });
    });

    it("frees the element on release, and ignores a release from a non-holder", () => {
        const room = new Room(TARGET, 0, deps());
        const a = join(room, "a");
        const b = join(room, "b");
        room.handle("a", { t: "claim", element: el("e1") });
        room.handle("b", { t: "release", element: el("e1") }); // not b's to release
        expect(b.last("lease")?.holder?.connId).toBe("a");
        room.handle("a", { t: "release", element: el("e1") });
        expect(b.last("lease")).toEqual({ t: "lease", element: el("e1"), holder: null });
        room.handle("b", { t: "claim", element: el("e1") });
        expect(b.last("granted")?.element).toEqual(el("e1"));
        void a;
    });

    it("releases everything a departing connection held", () => {
        const room = new Room(TARGET, 0, deps());
        join(room, "a");
        const b = join(room, "b");
        room.handle("a", { t: "claim", element: el("e1") });
        room.handle("a", { t: "claim", element: el("e2") });
        room.leave("a");
        expect(b.ofType("lease").filter((m) => m.holder === null).length).toBe(2);
        room.handle("b", { t: "claim", element: el("e1") });
        expect(b.last("granted")?.element).toEqual(el("e1"));
    });

    // A lease is held per connection and refreshed by the presence heartbeat, so the eviction that
    // drops a quiet connection is also what expires its lease: nobody is blocked by a dead tab.
    it("frees what an evicted connection held, without a release ever arriving", () => {
        const room = new Room(TARGET, 0, deps());
        join(room, "a");
        const b = join(room, "b");
        room.handle("a", { t: "claim", element: el("e1") });
        room.handle("b", { t: "claim", element: el("e2") });
        clock += PRESENCE_TTL_MS - 1;
        room.handle("b", { t: "ping" }); // b stays, a goes quiet
        clock += 2;
        room.sweep();
        room.handle("b", { t: "claim", element: el("e1") });
        expect(b.last("granted")?.element).toEqual(el("e1"));
    });

    it("lists the live leases in a later joiner's welcome", () => {
        const room = new Room(TARGET, 0, deps());
        join(room, "a");
        room.handle("a", { t: "claim", element: el("e1") });
        const c = join(room, "c");
        expect(c.last("welcome")?.leases.map((l) => l.element.elementId)).toEqual(["e1"]);
    });
});

describe("op writes", () => {
    const op = (text: string): SectionOp => ({
        kind: "data",
        sectionId: "s1",
        elementId: "e1",
        keys: { text },
    });

    it("acks the writer and broadcasts to everyone else", async () => {
        const room = new Room(TARGET, 0, deps());
        const a = join(room, "a");
        const b = join(room, "b");
        room.handle("a", { t: "ops", tag: "t1", ops: [op("hi")] });
        await settle();
        expect(a.last("ack")).toEqual({ t: "ack", tag: "t1", seq: 1 });
        expect(a.ofType("ops")).toHaveLength(0); // never an echo to the author
        expect(b.last("ops")).toMatchObject({
            seq: 1,
            author: { kind: "user", connId: "a", userId: "u-a" },
        });
    });

    it("hands out strictly increasing seqs, in the order the writes were applied", async () => {
        const room = new Room(TARGET, 0, deps());
        join(room, "a");
        const b = join(room, "b");
        room.handle("a", { t: "ops", tag: "t1", ops: [op("one")] });
        room.handle("a", { t: "ops", tag: "t2", ops: [op("two")] });
        await settle();
        expect(b.ofType("ops").map((m) => m.seq)).toEqual([1, 2]);
        expect(room.currentSeq).toBe(2);
        expect(applied.map((ops) => textKeyOf(ops[0]))).toEqual(["one", "two"]);
    });

    it("rejects the batch when the server cannot apply it, and broadcasts nothing", async () => {
        const room = new Room(TARGET, 0, deps());
        const a = join(room, "a");
        const b = join(room, "b");
        outcome = () => ({ ok: false, reason: "unknown section s9" });
        room.handle("a", { t: "ops", tag: "t1", ops: [op("hi")] });
        await settle();
        expect(a.last("reject")).toEqual({ t: "reject", tag: "t1", reason: "unknown section s9" });
        expect(b.ofType("ops")).toHaveLength(0);
    });

    it("refuses a write from a comment-level peer without touching the document", async () => {
        const room = new Room(TARGET, 0, deps());
        const b = join(room, "b", "comment");
        room.handle("b", { t: "ops", tag: "t1", ops: [op("hi")] });
        await settle();
        expect(b.last("reject")).toEqual({ t: "reject", tag: "t1", reason: "read only" });
        expect(applied).toHaveLength(0);
    });

    it("still broadcasts a write whose author disconnected mid-flight", async () => {
        const room = new Room(TARGET, 0, deps());
        const a = join(room, "a");
        const b = join(room, "b");
        room.handle("a", { t: "ops", tag: "t1", ops: [op("hi")] });
        room.leave("a");
        await settle();
        expect(a.last("ack")).toBeUndefined();
        expect(b.last("ops")?.seq).toBe(1);
    });

    it("carries a server-side write into the room under its own author", () => {
        const room = new Room(TARGET, 3, deps());
        const a = join(room, "a");
        room.publish(4, { kind: "ai" }, [op("generated")]);
        expect(a.last("ops")).toMatchObject({ seq: 4, author: { kind: "ai" } });
        expect(room.currentSeq).toBe(4);
    });
});

describe("catch-up after a reconnect", () => {
    const op = (text: string): SectionOp => ({
        kind: "data",
        sectionId: "s1",
        elementId: "e1",
        keys: { text },
    });

    it("says nothing when the client is already current", async () => {
        const room = new Room(TARGET, 0, deps());
        join(room, "a");
        const b = join(room, "b");
        room.handle("a", { t: "ops", tag: "t1", ops: [op("one")] });
        await settle();
        const before = b.sent.length;
        room.handle("b", { t: "hello", lastSeq: 1 });
        expect(b.sent).toHaveLength(before);
    });

    it("replays exactly the batches a returning client missed", async () => {
        const room = new Room(TARGET, 0, deps());
        join(room, "a");
        room.handle("a", { t: "ops", tag: "t1", ops: [op("one")] });
        room.handle("a", { t: "ops", tag: "t2", ops: [op("two")] });
        await settle();
        const c = join(room, "c");
        room.handle("c", { t: "hello", lastSeq: 1 });
        expect(c.ofType("ops").map((m) => m.seq)).toEqual([2]);
        expect(c.last("resync")).toBeUndefined();
    });

    it("resyncs when the gap starts before anything the buffer still holds", async () => {
        const room = new Room(TARGET, 40, deps());
        join(room, "a");
        seq = 40;
        room.handle("a", { t: "ops", tag: "t1", ops: [op("one")] });
        await settle();
        const c = join(room, "c");
        room.handle("c", { t: "hello", lastSeq: 3 });
        expect(c.last("resync")).toEqual({ t: "resync", seq: 41 });
        expect(c.ofType("ops")).toHaveLength(0);
    });

    it("resyncs a hello with no lastSeq at all only when it is behind", () => {
        const room = new Room(TARGET, 9, deps());
        const a = join(room, "a");
        room.handle("a", { t: "hello" });
        expect(a.last("resync")).toBeUndefined();
    });

    it("tells everyone to reload after a write that replaced the document", async () => {
        const room = new Room(TARGET, 0, deps());
        const a = join(room, "a");
        room.handle("a", { t: "ops", tag: "t1", ops: [op("one")] });
        await settle();
        room.resyncAll(12);
        expect(a.last("resync")).toEqual({ t: "resync", seq: 12 });
        // the buffer described a history that write did not follow, so it is not offered again
        const c = join(room, "c");
        room.handle("c", { t: "hello", lastSeq: 1 });
        expect(c.last("resync")).toEqual({ t: "resync", seq: 12 });
    });
});

// Two clients driving the real op applier: what the room guarantees is that both end up holding the
// same document, and that per-key last-writer-wins means a colour write and a text write on the same
// element do not clobber each other.
describe("two clients converging through the real applier", () => {
    const start = (): ArtifactContent => ({
        format: "deck",
        theme: "studio",
        sections: [
            {
                id: "s1",
                root: {
                    type: "container",
                    id: "g1",
                    data: {
                        direction: "col",
                        children: [{ type: "text", id: "e1", data: { text: "hello" } }],
                    },
                },
            },
        ],
    });

    const dataOf = (c: ArtifactContent): Record<string, unknown> => {
        const kids = (c.sections[0]!.root.data as { children: { data: unknown }[] }).children;
        return kids[0]!.data as Record<string, unknown>;
    };

    it("converges both clients on the server's document, key by key", async () => {
        let server = start();
        let n = 0;
        const room = new Room(TARGET, 0, {
            now: () => clock,
            apply: (_t, ops) => {
                const next = applySectionOps(server, ops);
                if (!next.ok) return Promise.resolve({ ok: false, reason: next.reason });
                server = next.content;
                return Promise.resolve({ ok: true, seq: ++n });
            },
        });
        const a = join(room, "a");
        const b = join(room, "b");

        // A types while B recolours the very same element
        room.handle("a", {
            t: "ops",
            tag: "a1",
            ops: [
                { kind: "data", sectionId: "s1", elementId: "e1", keys: { text: "hello there" } },
            ],
        });
        room.handle("b", {
            t: "ops",
            tag: "b1",
            ops: [{ kind: "data", sectionId: "s1", elementId: "e1", keys: { color: "blue" } }],
        });
        await settle();

        expect(dataOf(server)).toEqual({ text: "hello there", color: "blue" });
        expect(a.last("ack")?.seq).toBe(1);
        expect(b.last("ack")?.seq).toBe(2);

        // each client sees only the other's write, in seq order
        let mine = start();
        for (const msg of a.ofType("ops")) {
            const r = applySectionOps(mine, msg.ops);
            if (r.ok) mine = r.content;
        }
        const localA = applySectionOps(mine, [
            { kind: "data", sectionId: "s1", elementId: "e1", keys: { text: "hello there" } },
        ]);
        expect(localA.ok && dataOf(localA.content)).toEqual(dataOf(server));
    });

    it("lets the last writer of one key win without disturbing the others", async () => {
        let server = start();
        let n = 0;
        const room = new Room(TARGET, 0, {
            now: () => clock,
            apply: (_t, ops) => {
                const next = applySectionOps(server, ops);
                if (!next.ok) return Promise.resolve({ ok: false, reason: next.reason });
                server = next.content;
                return Promise.resolve({ ok: true, seq: ++n });
            },
        });
        join(room, "a");
        join(room, "b");
        room.handle("a", {
            t: "ops",
            tag: "a1",
            ops: [{ kind: "data", sectionId: "s1", elementId: "e1", keys: { color: "red" } }],
        });
        room.handle("b", {
            t: "ops",
            tag: "b1",
            ops: [{ kind: "data", sectionId: "s1", elementId: "e1", keys: { color: "green" } }],
        });
        await settle();
        expect(dataOf(server)).toEqual({ text: "hello", color: "green" });
    });
});

// The applier reaches a database, and a database can go away mid-transaction. The queue that keeps
// writes in order is the thing at risk: a rejection there skips the callback of every batch behind
// it, so the room would go on accepting writes, apply none of them, and answer nobody.
describe("a write that throws rather than failing", () => {
    const op = (text: string): SectionOp => ({
        kind: "data",
        sectionId: "s1",
        elementId: "e1",
        keys: { text },
    });

    it("answers the sender and leaves the queue able to carry the next batch", async () => {
        let calls = 0;
        const room = new Room(TARGET, 0, {
            apply: () => {
                calls += 1;
                return calls === 1
                    ? Promise.reject(new Error("connection terminated unexpectedly"))
                    : Promise.resolve({ ok: true as const, seq: 9 });
            },
            now: () => clock,
        });
        const a = join(room, "a");
        const b = join(room, "b");

        room.handle("a", { t: "ops", tag: "t1", ops: [op("one")] });
        await settle();
        expect(a.last("reject")?.tag).toBe("t1");
        expect(a.last("ack")).toBeUndefined();
        expect(b.ofType("ops")).toHaveLength(0); // nothing landed, so nothing is broadcast

        room.handle("a", { t: "ops", tag: "t2", ops: [op("two")] });
        await settle();
        expect(calls).toBe(2);
        expect(a.last("ack")).toEqual({ t: "ack", tag: "t2", seq: 9 });
        expect(b.last("ops")?.seq).toBe(9);
    });
});

// A socket carries the level it was upgraded with, and standing changes under it: a grant is
// revoked, an admin is demoted, the artifact itself is locked. The routes that do any of that push
// the re-resolved level in here rather than leaving the tab on its old rights until it reconnects.
describe("an access change under an open socket", () => {
    it("tells that connection its new level and takes back what it was holding", () => {
        const room = new Room(TARGET, 0, deps());
        const a = join(room, "a");
        const b = join(room, "b");
        room.handle("a", { t: "claim", element: el("e1") });

        room.applyAccess("u-a", "view");

        expect(a.last("access")).toEqual({ t: "access", access: "view" });
        expect(b.last("lease")).toEqual({ t: "lease", element: el("e1"), holder: null });
        expect(a.closed).toBe(false);
    });

    it("stops accepting writes from them from that moment", async () => {
        const room = new Room(TARGET, 0, deps());
        const a = join(room, "a");
        room.applyAccess("u-a", "comment");
        room.handle("a", {
            t: "ops",
            tag: "t1",
            ops: [{ kind: "remove", id: "s1" }],
        });
        await settle();
        expect(a.last("reject")).toEqual({ t: "reject", tag: "t1", reason: "read only" });
        expect(applied).toHaveLength(0);
    });

    it("re-states the roster entry, so the others stop seeing an editor", () => {
        const room = new Room(TARGET, 0, deps());
        join(room, "a");
        const b = join(room, "b");
        room.applyAccess("u-a", "view");
        const peer = b.last("peer");
        expect(peer?.connId).toBe("a");
        expect(peer?.peer?.canEdit).toBe(false);
    });

    it("closes a connection whose access is gone entirely", () => {
        const room = new Room(TARGET, 0, deps());
        const a = join(room, "a");
        const b = join(room, "b");
        room.applyAccess("u-a", "none");
        expect(a.closed).toBe(true);
        expect(room.size).toBe(1);
        expect(b.last("peer")).toEqual({ t: "peer", connId: "a", peer: null });
    });

    it("says nothing when the level did not actually change", () => {
        const room = new Room(TARGET, 0, deps());
        const a = join(room, "a");
        const before = a.sent.length;
        room.applyAccess("u-a", "edit");
        expect(a.sent).toHaveLength(before);
    });

    it("names everyone connected, so a caller can re-resolve each of them", () => {
        const room = new Room(TARGET, 0, deps());
        join(room, "a");
        join(room, "b");
        expect(room.userIds.sort()).toEqual(["u-a", "u-b"]);
    });
});
