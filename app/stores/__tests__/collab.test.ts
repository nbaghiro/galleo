// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ClientMessage, Peer, ServerMessage } from "@model/collab";
import { HEARTBEAT_MS } from "@model/collab";
import type { CollabSink, SocketLike } from "@app/stores/collab";
import { backoffFor, CollabClient } from "@app/stores/collab";

// A socket that never touches the network: the client is driven entirely through these callbacks,
// which is also how a reconnect is simulated (close it and let the backoff timer fire).
class FakeSocket implements SocketLike {
    readyState = 0;
    readonly sent: string[] = [];
    closed = false;
    onopen: ((ev: Event) => void) | null = null;
    onmessage: ((ev: MessageEvent) => void) | null = null;
    onclose: ((ev: CloseEvent) => void) | null = null;
    onerror: ((ev: Event) => void) | null = null;

    send(data: string): void {
        this.sent.push(data);
    }
    close(): void {
        this.closed = true;
    }
    open(): void {
        this.readyState = 1;
        this.onopen?.(new Event("open"));
    }
    drop(): void {
        this.readyState = 3;
        this.onclose?.(new CloseEvent("close"));
    }
    deliver(msg: ServerMessage): void {
        this.onmessage?.(new MessageEvent("message", { data: JSON.stringify(msg) }));
    }
    frames(): ClientMessage[] {
        return this.sent.map((s) => JSON.parse(s) as ClientMessage);
    }
    ofType<T extends ClientMessage["t"]>(t: T): Extract<ClientMessage, { t: T }>[] {
        return this.frames().filter((m): m is Extract<ClientMessage, { t: T }> => m.t === t);
    }
}

let sockets: FakeSocket[] = [];
let events: string[] = [];
let seq = 0;

const sink = (): CollabSink => ({
    welcome: (connId, at) => events.push(`welcome:${connId}:${at}`),
    peer: (connId, peer) => events.push(`peer:${connId}:${peer ? "in" : "out"}`),
    ops: (at) => events.push(`ops:${at}`),
    ack: (tag, at) => events.push(`ack:${tag}:${at}`),
    reject: (tag, reason) => events.push(`reject:${tag}:${reason}`),
    granted: (el) => events.push(`granted:${el.elementId}`),
    denied: (el, holder) =>
        events.push(`denied:${el.elementId}:${holder ? holder.connId : "none"}`),
    lease: (el, holder) => events.push(`lease:${el.elementId}:${holder ? holder.connId : "free"}`),
    resync: (at) => events.push(`resync:${at}`),
    down: () => events.push("down"),
});

const make = (): CollabClient =>
    new CollabClient({
        url: "ws://test/collab",
        connect: () => {
            const s = new FakeSocket();
            sockets.push(s);
            return s;
        },
        sink: sink(),
        lastSeq: () => seq,
        random: () => 0.5, // no jitter spread, so the backoff timings below are exact
    });

const latest = (): FakeSocket => sockets[sockets.length - 1]!;

const peer = (connId: string): Peer => ({
    connId,
    user: { id: `u-${connId}`, name: connId, avatarUrl: null },
    color: "#2f6df6",
    canEdit: true,
    state: {},
});

beforeEach(() => {
    vi.useFakeTimers();
    sockets = [];
    events = [];
    seq = 0;
});

afterEach(() => {
    vi.useRealTimers();
});

describe("backoffFor", () => {
    it("doubles per attempt and stops at the ceiling", () => {
        expect(backoffFor(1, 0.5)).toBe(500);
        expect(backoffFor(2, 0.5)).toBe(1000);
        expect(backoffFor(3, 0.5)).toBe(2000);
        expect(backoffFor(20, 0.5)).toBe(15_000);
    });

    it("spreads the retry, so a deploy does not bring every client back at once", () => {
        expect(backoffFor(4, 0)).toBe(3000);
        expect(backoffFor(4, 1)).toBe(5000);
        expect(backoffFor(4, 0.5)).toBe(4000);
    });
});

describe("the socket lifecycle", () => {
    it("says hello with the revision it already holds", () => {
        seq = 12;
        const client = make();
        client.start();
        latest().open();
        expect(latest().ofType("hello")[0]).toEqual({ t: "hello", lastSeq: 12 });
        client.stop();
    });

    it("is not healthy until the socket opens, and not after it closes", () => {
        const client = make();
        client.start();
        expect(client.healthy).toBe(false);
        latest().open();
        expect(client.healthy).toBe(true);
        latest().drop();
        expect(client.healthy).toBe(false);
        client.stop();
    });

    it("hands every frame the room sends to the sink", () => {
        const client = make();
        client.start();
        latest().open();
        latest().deliver({
            t: "welcome",
            connId: "c1",
            seq: 4,
            self: peer("c1"),
            roster: [peer("c1")],
            leases: [],
        });
        latest().deliver({ t: "peer", connId: "c2", peer: peer("c2") });
        latest().deliver({ t: "ack", tag: "t1", seq: 5 });
        latest().deliver({ t: "resync", seq: 9 });
        expect(events).toEqual(["welcome:c1:4", "peer:c2:in", "ack:t1:5", "resync:9"]);
        client.stop();
    });

    it("ignores a frame that is not JSON or not a message the protocol knows", () => {
        const client = make();
        client.start();
        latest().open();
        latest().onmessage?.(new MessageEvent("message", { data: "{{{" }));
        latest().onmessage?.(new MessageEvent("message", { data: '{"t":"nonsense"}' }));
        expect(events).toEqual([]);
        client.stop();
    });

    it("reconnects with backoff after a drop, and tells the editor it went solo meanwhile", () => {
        const client = make();
        client.start();
        latest().open();
        latest().drop();
        expect(events).toEqual(["down"]);
        expect(sockets).toHaveLength(1);
        vi.advanceTimersByTime(499);
        expect(sockets).toHaveLength(1);
        vi.advanceTimersByTime(1);
        expect(sockets).toHaveLength(2);
        // the second attempt waits twice as long
        latest().drop();
        vi.advanceTimersByTime(999);
        expect(sockets).toHaveLength(2);
        vi.advanceTimersByTime(1);
        expect(sockets).toHaveLength(3);
        client.stop();
    });

    it("resets the backoff once a connection sticks", () => {
        const client = make();
        client.start();
        latest().open();
        latest().drop();
        vi.advanceTimersByTime(500);
        latest().open();
        latest().drop();
        vi.advanceTimersByTime(500);
        expect(sockets).toHaveLength(3); // 500ms again, not 1000
        client.stop();
    });

    it("stops reconnecting once the editor closes the room", () => {
        const client = make();
        client.start();
        latest().open();
        client.stop();
        expect(latest().closed).toBe(true);
        vi.advanceTimersByTime(60_000);
        expect(sockets).toHaveLength(1);
    });

    it("catches up from the newest revision after a reconnect, not the one it started with", () => {
        seq = 3;
        const client = make();
        client.start();
        latest().open();
        seq = 11; // the sink advanced the baseline while the socket was up
        latest().drop();
        vi.advanceTimersByTime(500);
        latest().open();
        expect(latest().ofType("hello")[0]).toEqual({ t: "hello", lastSeq: 11 });
        client.stop();
    });
});

describe("presence", () => {
    const at = (fx: number) => ({
        cursor: { el: { sectionId: "s1", elementId: "e1", fx, fy: 0.5 } },
    });

    // Opening the socket already announces this client, so a move within the same throttle window
    // rides the trailing send rather than doubling the traffic at exactly the wrong moment.
    it("sends a move once the throttle window has passed", () => {
        const client = make();
        client.start();
        latest().open();
        expect(latest().ofType("presence")).toHaveLength(1); // the announcement on open
        vi.advanceTimersByTime(40);
        client.presence(at(0.1));
        expect(latest().ofType("presence")).toHaveLength(2);
        client.stop();
    });

    it("drops the positions inside the throttle window and sends the latest one after it", () => {
        const client = make();
        client.start();
        latest().open();
        vi.advanceTimersByTime(40);
        client.presence(at(0.1));
        vi.advanceTimersByTime(5);
        client.presence(at(0.2));
        vi.advanceTimersByTime(5);
        client.presence(at(0.3));
        const sent = latest().ofType("presence");
        expect(sent).toHaveLength(2);
        vi.advanceTimersByTime(40);
        const after = latest().ofType("presence");
        expect(after).toHaveLength(3);
        expect(after[2]?.state.cursor).toEqual(at(0.3).cursor);
        client.stop();
    });

    it("says nothing when the position has not really changed", () => {
        const client = make();
        client.start();
        latest().open();
        vi.advanceTimersByTime(40);
        client.presence(at(0.1));
        const before = latest().ofType("presence").length;
        vi.advanceTimersByTime(1000);
        client.presence(at(0.1));
        expect(latest().ofType("presence")).toHaveLength(before);
        client.stop();
    });

    it("keeps the connection alive on the heartbeat even when nobody moves", () => {
        const client = make();
        client.start();
        latest().open();
        vi.advanceTimersByTime(40);
        client.presence(at(0.1));
        const before = latest().ofType("presence").length;
        vi.advanceTimersByTime(HEARTBEAT_MS + 5);
        expect(latest().ofType("presence").length).toBe(before + 1);
        client.stop();
    });

    it("re-announces itself on a fresh socket rather than assuming the room remembers", () => {
        const client = make();
        client.start();
        latest().open();
        client.presence(at(0.4));
        latest().drop();
        vi.advanceTimersByTime(500);
        latest().open();
        const presence = latest().ofType("presence");
        expect(presence).toHaveLength(1);
        expect(presence[0]?.state.cursor).toEqual(at(0.4).cursor);
        client.stop();
    });

    it("holds its tongue while the socket is down", () => {
        const client = make();
        client.start();
        latest().open();
        latest().drop();
        client.presence(at(0.9));
        expect(latest().ofType("presence")).toHaveLength(1); // only the one from the first open
        client.stop();
    });
});

describe("outbound writes and leases", () => {
    it("reports whether an op batch actually went out", () => {
        const client = make();
        client.start();
        expect(client.ops("t1", [{ kind: "remove", id: "s1" }])).toBe(false);
        latest().open();
        expect(client.ops("t1", [{ kind: "remove", id: "s1" }])).toBe(true);
        expect(latest().ofType("ops")[0]).toMatchObject({ tag: "t1" });
        client.stop();
    });

    it("claims and releases an element", () => {
        const client = make();
        client.start();
        latest().open();
        client.claim({ sectionId: "s1", elementId: "e1" });
        client.release({ sectionId: "s1", elementId: "e1" });
        expect(latest().ofType("claim")).toHaveLength(1);
        expect(latest().ofType("release")).toHaveLength(1);
        client.stop();
    });
});
