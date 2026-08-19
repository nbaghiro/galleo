import type { SectionOp } from "@model/artifact";
import type {
    ClientMessage,
    ElementRef,
    Lease,
    OpAuthor,
    Peer,
    PresenceState,
    ServerMessage,
} from "@model/collab";
import { HEARTBEAT_MS, readServerMessage } from "@model/collab";
import {
    collabClosed,
    collabDenied,
    collabLease,
    collabPeer,
    collabWelcome,
    dueToSend,
    installCollabGates,
    onClaimLease,
    onReleaseLease,
    onSendPresence,
    samePresence,
    selfConnId,
} from "@editor/core/collab";
import { applyRemoteOps, clearEmitOps, onEmitOps, opsAcked, opsRejected } from "@editor/core/store";
import { flushAutosave, noteSavedContent, onCollabDriving } from "./save";

// The wire half of collaboration: one socket per open artifact, owned here so the editor never
// learns about transports or the session cookie. Everything the room says is handed to the seam in
// @editor/core/collab; everything the editor wants to say comes back through the handlers it
// registers there.

/** What the client needs from a socket; a real WebSocket satisfies it. */
export interface SocketLike {
    readyState: number;
    send(data: string): void;
    close(): void;
    onopen: ((ev: Event) => void) | null;
    onmessage: ((ev: MessageEvent) => void) | null;
    onclose: ((ev: CloseEvent) => void) | null;
    onerror: ((ev: Event) => void) | null;
}

const OPEN = 1;

/** Where the room's frames go. Injected, so the client is testable without the editor. */
export interface CollabSink {
    welcome(connId: string, seq: number, roster: Peer[], leases: Lease[]): void;
    peer(connId: string, peer: Peer | null): void;
    ops(seq: number, author: OpAuthor, ops: SectionOp[]): void;
    ack(tag: string, seq: number): void;
    reject(tag: string, reason: string): void;
    granted(element: ElementRef): void;
    denied(element: ElementRef, holder: Lease | null): void;
    lease(element: ElementRef, holder: Lease | null): void;
    resync(seq: number): void;
    /** The socket went away; the editor falls back to solo editing until it returns. */
    down(): void;
}

// Cursors move continuously and presence is state rather than events, so a dropped intermediate
// position costs nothing: about 30 frames a second is plenty and the next one carries the truth.
const CURSOR_GAP_MS = 33;

const BACKOFF_BASE_MS = 500;
const BACKOFF_MAX_MS = 15_000;

// Exponential with jitter. A deploy drops every socket at once, so without the spread they would all
// come back in the same millisecond; `rand` is a parameter so the spread is testable.
export function backoffFor(attempt: number, rand: number): number {
    const base = Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** Math.max(0, attempt - 1));
    return Math.round(base * (0.75 + rand * 0.5));
}

export interface ClientOptions {
    url: string;
    connect: (url: string) => SocketLike;
    sink: CollabSink;
    /** The revision the client already holds, so a reconnect asks only for what it missed. */
    lastSeq: () => number;
    /** Runs before hello, while the socket does not yet count as the driver: the HTTP save drains. */
    beforeHello?: () => Promise<void> | void;
    random?: () => number;
}

export class CollabClient {
    private readonly opts: ClientOptions;
    private socket: SocketLike | null = null;
    private stopped = false;
    private attempt = 0;
    private retryTimer = 0;
    private beatTimer = 0;
    private trailingTimer = 0;
    private greeted = false;
    private lastPresence: PresenceState = {};
    private sentPresence: PresenceState | null = null;
    private lastSentAt = 0;

    constructor(opts: ClientOptions) {
        this.opts = opts;
    }

    // Not just "the socket is open": until hello has gone out, whatever the HTTP save still holds
    // has not been drained, and two drivers writing at once is the one thing this must never allow.
    get healthy(): boolean {
        return this.greeted && this.socket !== null && this.socket.readyState === OPEN;
    }

    start(): void {
        this.stopped = false;
        this.open();
    }

    stop(): void {
        this.stopped = true;
        window.clearTimeout(this.retryTimer);
        window.clearInterval(this.beatTimer);
        window.clearTimeout(this.trailingTimer);
        const socket = this.socket;
        this.socket = null;
        this.greeted = false;
        if (socket) {
            socket.onclose = null; // a deliberate close is not a disconnection to recover from
            socket.onerror = null;
            socket.close();
        }
        this.sentPresence = null;
    }

    /** Presence is coalesced: the same state twice is not news, and cursors are rate-limited. */
    presence(state: PresenceState): void {
        this.lastPresence = state;
        if (this.sentPresence && samePresence(state, this.sentPresence)) return;
        if (!dueToSend(this.lastSentAt, Date.now(), CURSOR_GAP_MS)) {
            this.scheduleTrailing();
            return;
        }
        this.flushPresence();
    }

    ops(tag: string, ops: SectionOp[]): boolean {
        return this.send({ t: "ops", tag, ops });
    }

    claim(element: ElementRef): void {
        this.send({ t: "claim", element });
    }

    release(element: ElementRef): void {
        this.send({ t: "release", element });
    }

    // ---- internals -------------------------------------------------------------------------------

    private open(): void {
        if (this.stopped || this.socket) return;
        const socket = this.opts.connect(this.opts.url);
        this.socket = socket;
        socket.onopen = () => {
            this.attempt = 0;
            // a beforeHello that returns nothing keeps the handshake synchronous
            const draining = this.opts.beforeHello?.();
            if (draining) void draining.then(() => this.greet(socket));
            else this.greet(socket);
        };
        socket.onmessage = (ev) => this.receive(ev);
        socket.onclose = () => this.dropped();
        socket.onerror = () => this.dropped();
    }

    private greet(socket: SocketLike): void {
        if (this.socket !== socket || socket.readyState !== OPEN) return;
        this.greeted = true;
        this.send({ t: "hello", lastSeq: this.opts.lastSeq() });
        this.sentPresence = null; // the server knows nothing about us yet
        this.flushPresence();
        this.startHeartbeat();
    }

    private dropped(): void {
        if (this.socket) {
            this.socket.onclose = null;
            this.socket.onerror = null;
        }
        this.socket = null;
        this.greeted = false;
        window.clearInterval(this.beatTimer);
        this.sentPresence = null;
        this.opts.sink.down();
        if (this.stopped) return;
        this.attempt += 1;
        const delay = backoffFor(this.attempt, (this.opts.random ?? Math.random)());
        window.clearTimeout(this.retryTimer);
        this.retryTimer = window.setTimeout(() => this.open(), delay);
    }

    private startHeartbeat(): void {
        window.clearInterval(this.beatTimer);
        // presence doubles as the keepalive: the server's eviction window is twice this interval,
        // and a refreshed presence is also what keeps an edit lease alive
        this.beatTimer = window.setInterval(() => {
            this.sentPresence = null; // an idle beat must still go out
            this.flushPresence();
        }, HEARTBEAT_MS);
    }

    private scheduleTrailing(): void {
        if (this.trailingTimer) return;
        this.trailingTimer = window.setTimeout(() => {
            this.trailingTimer = 0;
            this.flushPresence();
        }, CURSOR_GAP_MS);
    }

    private flushPresence(): void {
        if (this.sentPresence && samePresence(this.lastPresence, this.sentPresence)) return;
        if (!this.send({ t: "presence", state: this.lastPresence })) return;
        this.sentPresence = this.lastPresence;
        this.lastSentAt = Date.now();
    }

    private send(msg: ClientMessage): boolean {
        if (!this.healthy) return false;
        this.socket?.send(JSON.stringify(msg));
        return true;
    }

    private receive(ev: MessageEvent): void {
        if (typeof ev.data !== "string") return;
        let raw: unknown;
        try {
            raw = JSON.parse(ev.data);
        } catch {
            return;
        }
        const msg = readServerMessage(raw, isSectionOpLike);
        if (msg) this.dispatch(msg);
    }

    private dispatch(msg: ServerMessage): void {
        const sink = this.opts.sink;
        switch (msg.t) {
            case "welcome":
                return sink.welcome(msg.connId, msg.seq, msg.roster, msg.leases);
            case "peer":
                return sink.peer(msg.connId, msg.peer);
            case "ops":
                return sink.ops(msg.seq, msg.author, msg.ops);
            case "ack":
                return sink.ack(msg.tag, msg.seq);
            case "reject":
                return sink.reject(msg.tag, msg.reason);
            case "granted":
                return sink.granted(msg.element);
            case "denied":
                return sink.denied(msg.element, msg.holder);
            case "lease":
                return sink.lease(msg.element, msg.holder);
            case "resync":
                return sink.resync(msg.seq);
        }
    }
}

// The room already validated every op against the section-op guard before it broadcast, and the
// client re-checks the shape here rather than the contents: what an element's data may hold is the
// element registry's contract, not this layer's.
const isSectionOpLike = (op: unknown): op is SectionOp =>
    !!op && typeof op === "object" && typeof (op as { kind?: unknown }).kind === "string";

// ---- the singleton the editor route drives -------------------------------------------------------

let client: CollabClient | null = null;
let baseline = 0;
let tags = 0;
let resyncing: (() => void) | null = null;

const socketUrl = (artifactId: string): string => {
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${proto}//${window.location.host}/api/artifacts/${artifactId}/collab`;
};

// A batch the server could not apply, or a gap wider than the room's buffer, means the two sides
// disagree about the document. Refetching the window is the resolution, exactly as it is for a 409
// on the HTTP path.
const resync = (): void => resyncing?.();

const sink: CollabSink = {
    welcome: (connId, seq, roster, leases) => {
        baseline = seq;
        collabWelcome(connId, roster, leases);
    },
    peer: (connId, peer) => collabPeer(connId, peer),
    ops: (seq, _author, ops) => {
        baseline = Math.max(baseline, seq);
        if (!applyRemoteOps(ops)) resync();
    },
    ack: (tag, seq) => {
        baseline = Math.max(baseline, seq);
        const saved = opsAcked(tag);
        // the socket is the persistence driver while it is up, so its ack is what advances the
        // baseline the HTTP autosave would diff against if the socket goes away
        if (saved) noteSavedContent(saved);
    },
    reject: (tag) => {
        opsRejected(tag);
        resync();
    },
    granted: () => undefined,
    denied: (element, holder) => collabDenied(element, holder),
    lease: (element, holder) => collabLease(element, holder),
    resync: (seq) => {
        baseline = Math.max(baseline, seq);
        resync();
    },
    down: () => collabClosed(),
};

export function openCollab(artifactId: string, seq: number, onResync: () => void): void {
    closeCollab();
    baseline = seq;
    resyncing = onResync;
    client = new CollabClient({
        url: socketUrl(artifactId),
        connect: (url) => new WebSocket(url),
        sink,
        lastSeq: () => baseline,
        // anything the HTTP save still holds goes first, so the room's history starts from it
        beforeHello: () => flushAutosave(),
    });
    onSendPresence((state) => client?.presence(state));
    onClaimLease((element) => client?.claim(element));
    onReleaseLease((element) => client?.release(element));
    onEmitOps((ops) => {
        const tag = `t${++tags}`;
        return client?.ops(tag, ops) ? tag : null;
    });
    installCollabGates();
    onCollabDriving(
        () => collabHealthy(),
        () => collabConnId(),
    );
    client.start();
}

export function closeCollab(): void {
    client?.stop();
    client = null;
    resyncing = null;
    onCollabDriving(
        () => false,
        () => null,
    );
    clearEmitOps();
    collabClosed();
}

/** True while the socket is the persistence driver; autosave stands down in that window. */
export const collabHealthy = (): boolean => client?.healthy ?? false;

/** This client's connection in the room, so an HTTP write can say who made it. */
export const collabConnId = (): string | null => selfConnId();
