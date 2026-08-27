import type { ArtifactAccess, SectionOp } from "@model/artifact";
import { atLeast } from "@model/artifact";
import type {
    ClientMessage,
    CollabUser,
    ElementRef,
    Lease,
    OpAuthor,
    Peer,
    PresenceState,
    ServerMessage,
} from "@model/collab";
import { colorForIndex, leaseKey, OP_BUFFER, PRESENCE_TTL_MS } from "@model/collab";
import { warn } from "@services/utils/env";
import { applyContentOps } from "./artifacts";
import { artifactStanding } from "./collaborators";

// The room: one per open artifact, in this process. It holds who is connected, where they are, who
// is holding which element, and a short ring buffer of recent op broadcasts so a reconnecting client
// can catch up without a full reload. Nothing here is durable: a restart is a resync, by design.
//
// Everything is injected (the op applier and the clock), so the whole room is unit-testable with no
// socket and no database. `services/api/collab.ts` is the only place that knows about WebSockets.

// The header an HTTP write uses to name the caller's own socket; mirrored by app/api.ts.
export const CONN_HEADER = "x-galleo-conn";

/** What the transport gives the room: a way to push a frame, and a way to hang up. */
export interface RoomConnection {
    send(msg: ServerMessage): void;
    close(): void;
}

export type ApplyOutcome = { ok: true; seq: number } | { ok: false; reason: string };

export interface RoomTarget {
    artifactId: string;
    workspaceId: string;
}

export interface RoomDeps {
    /** Applies a batch through the real content pipeline and returns the artifact's new seq. */
    apply(target: RoomTarget, ops: SectionOp[]): Promise<ApplyOutcome>;
    now(): number;
}

export interface Joiner {
    connId: string;
    user: CollabUser;
    access: ArtifactAccess;
    conn: RoomConnection;
}

interface Member {
    connId: string;
    user: CollabUser;
    color: string;
    access: ArtifactAccess;
    conn: RoomConnection;
    state: PresenceState;
    lastSeen: number;
}

interface Broadcast {
    seq: number;
    author: OpAuthor;
    ops: SectionOp[];
}

const peerOf = (m: Member): Peer => ({
    connId: m.connId,
    user: m.user,
    color: m.color,
    canEdit: atLeast(m.access, "edit"),
    state: m.state,
});

export class Room {
    readonly target: RoomTarget;
    private readonly deps: RoomDeps;
    private readonly members = new Map<string, Member>();
    private readonly leases = new Map<string, { element: ElementRef; connId: string }>();
    private readonly recent: Broadcast[] = [];
    private joins = 0;
    private seq: number;
    // Op batches apply one at a time so the seq the server hands out and the order clients see them
    // in are the same order. Without this, two concurrent writes could broadcast out of sequence.
    private queue: Promise<void> = Promise.resolve();

    constructor(target: RoomTarget, seq: number, deps: RoomDeps) {
        this.target = target;
        this.seq = seq;
        this.deps = deps;
    }

    get size(): number {
        return this.members.size;
    }

    get currentSeq(): number {
        return this.seq;
    }

    /** A later joiner may know a newer seq than the room did, e.g. after an HTTP write. */
    noteSeq(seq: number): void {
        if (seq > this.seq) this.seq = seq;
    }

    join(joiner: Joiner): void {
        const member: Member = {
            connId: joiner.connId,
            user: joiner.user,
            color: colorForIndex(this.joins++),
            access: joiner.access,
            conn: joiner.conn,
            state: {},
            lastSeen: this.deps.now(),
        };
        this.members.set(member.connId, member);
        member.conn.send({
            t: "welcome",
            connId: member.connId,
            seq: this.seq,
            self: peerOf(member),
            roster: [...this.members.values()].map(peerOf),
            leases: this.leaseList(),
        });
        this.toOthers(member.connId, { t: "peer", connId: member.connId, peer: peerOf(member) });
    }

    leave(connId: string): void {
        if (!this.members.delete(connId)) return;
        this.releaseAllOf(connId);
        this.toOthers(connId, { t: "peer", connId, peer: null });
    }

    /** Drops connections whose presence went quiet, releasing whatever they were holding. */
    sweep(): void {
        const cutoff = this.deps.now() - PRESENCE_TTL_MS;
        for (const m of [...this.members.values()]) {
            if (m.lastSeen > cutoff) continue;
            this.leave(m.connId);
            m.conn.close();
        }
    }

    handle(connId: string, msg: ClientMessage): void {
        const member = this.members.get(connId);
        if (!member) return;
        member.lastSeen = this.deps.now();
        switch (msg.t) {
            case "ping":
                return;
            case "hello":
                return this.catchUp(member, msg.lastSeq);
            case "presence": {
                member.state = msg.state;
                return this.toOthers(connId, { t: "peer", connId, peer: peerOf(member) });
            }
            case "claim":
                return this.claim(member, msg.element);
            case "release":
                return this.release(member, msg.element);
            case "ops":
                return this.write(member, msg.tag, msg.ops);
        }
    }

    // A write the server made outside the socket (an AI turn, or an HTTP autosave from a client
    // whose socket is down) still belongs in the room's stream, so everyone watching sees it land.
    publish(seq: number, author: OpAuthor, ops: SectionOp[]): void {
        this.noteSeq(seq);
        this.record(seq, author, ops);
        for (const m of this.members.values())
            if (!this.isAuthor(m, author)) m.conn.send({ t: "ops", seq, author, ops });
    }

    // A connection only counts as the author when it belongs to the person the write is attributed
    // to, so a client naming someone else's connection cannot suppress their copy of a batch.
    private isAuthor(m: Member, author: OpAuthor): boolean {
        return author.kind === "user" && m.connId === author.connId && m.user.id === author.userId;
    }

    // A write that replaced the document rather than patching it (a whole-artifact save, an AI run
    // that rewrote the tree) has no ops to replay, so everyone reloads from the new seq.
    resyncAll(seq: number): void {
        this.noteSeq(seq);
        this.recent.length = 0; // the buffer describes a history this write did not follow
        for (const m of this.members.values()) m.conn.send({ t: "resync", seq: this.seq });
    }

    /** Everyone connected right now, so a caller can re-resolve what each of them may do here. */
    get userIds(): string[] {
        return [...new Set([...this.members.values()].map((m) => m.user.id))];
    }

    // A socket carries the level it was upgraded with, so a revoked grant or a lowered role would
    // otherwise keep working until that tab happened to reconnect. Access changes are pushed in
    // here instead: no access closes the connection, and anything else re-states the level to that
    // client and re-broadcasts the roster entry, whose canEdit the other tabs render from.
    applyAccess(userId: string, access: ArtifactAccess): void {
        for (const m of [...this.members.values()]) {
            if (m.user.id !== userId || m.access === access) continue;
            if (access === "none") {
                this.leave(m.connId);
                m.conn.close();
                continue;
            }
            m.access = access;
            // dropping below edit takes back whatever they were holding, so nobody waits on a lease
            // held by someone who can no longer use it
            if (!atLeast(access, "edit")) this.releaseAllOf(m.connId);
            m.conn.send({ t: "access", access });
            this.toOthers(m.connId, { t: "peer", connId: m.connId, peer: peerOf(m) });
        }
    }

    private write(member: Member, tag: string, ops: SectionOp[]): void {
        if (!atLeast(member.access, "edit")) {
            member.conn.send({ t: "reject", tag, reason: "read only" });
            return;
        }
        const author: OpAuthor = {
            kind: "user",
            connId: member.connId,
            userId: member.user.id,
        };
        // The chain must survive its own links: a rejected promise here would skip the callback of
        // every batch queued behind it, so the room would go on accepting writes and silently apply
        // none of them, with the sender still holding them as in flight. `applyOne` therefore
        // answers every outcome itself and never throws, and the tail catch is the second belt.
        this.queue = this.queue
            .then(() => this.applyOne(member.connId, tag, author, ops))
            .catch(() => undefined);
    }

    private async applyOne(
        connId: string,
        tag: string,
        author: OpAuthor,
        ops: SectionOp[],
    ): Promise<void> {
        let result: ApplyOutcome;
        try {
            result = await this.deps.apply(this.target, ops);
        } catch (e) {
            // A write that threw (the database went away mid-transaction) is a failed write like any
            // other: the sender is told, and its resync is what puts the two sides back together.
            warn(`collab write failed on ${this.target.artifactId}: ${String(e)}`);
            result = { ok: false, reason: "could not save that change" };
        }
        // the sender may have gone while the write was in flight; the broadcast still stands
        const live = this.members.get(connId);
        if (!result.ok) {
            live?.conn.send({ t: "reject", tag, reason: result.reason });
            return;
        }
        live?.conn.send({ t: "ack", tag, seq: result.seq });
        this.publish(result.seq, author, ops);
    }

    // Answers a reconnect. The buffer covers a short gap; anything older is a resync, which the
    // client answers with a windowed refetch rather than us keeping a durable log.
    private catchUp(member: Member, lastSeq?: number): void {
        if (lastSeq === undefined || lastSeq >= this.seq) return;
        const missed = this.recent.filter((b) => b.seq > lastSeq);
        const covered = missed.length > 0 && missed[0]!.seq === lastSeq + 1;
        if (!covered) {
            member.conn.send({ t: "resync", seq: this.seq });
            return;
        }
        for (const b of missed)
            member.conn.send({ t: "ops", seq: b.seq, author: b.author, ops: b.ops });
    }

    private claim(member: Member, element: ElementRef): void {
        if (!atLeast(member.access, "edit")) {
            member.conn.send({ t: "denied", element, holder: null });
            return;
        }
        const key = leaseKey(element);
        const held = this.leases.get(key);
        if (held && held.connId !== member.connId) {
            const holder = this.leaseOf(held);
            // a lease whose connection is gone is stale, so the claim takes it rather than losing
            if (holder) {
                member.conn.send({ t: "denied", element, holder });
                return;
            }
        }
        this.leases.set(key, { element, connId: member.connId });
        member.conn.send({ t: "granted", element });
        const holder = this.leaseOf({ element, connId: member.connId });
        this.toOthers(member.connId, { t: "lease", element, holder });
    }

    private release(member: Member, element: ElementRef): void {
        const key = leaseKey(element);
        const held = this.leases.get(key);
        if (!held || held.connId !== member.connId) return;
        this.leases.delete(key);
        this.toOthers(member.connId, { t: "lease", element, holder: null });
    }

    private releaseAllOf(connId: string): void {
        for (const [key, held] of [...this.leases]) {
            if (held.connId !== connId) continue;
            this.leases.delete(key);
            this.toOthers(connId, { t: "lease", element: held.element, holder: null });
        }
    }

    private leaseOf(held: { element: ElementRef; connId: string }): Lease | null {
        const m = this.members.get(held.connId);
        return m ? { element: held.element, connId: m.connId, user: m.user, color: m.color } : null;
    }

    private leaseList(): Lease[] {
        const out: Lease[] = [];
        for (const held of this.leases.values()) {
            const lease = this.leaseOf(held);
            if (lease) out.push(lease);
        }
        return out;
    }

    private record(seq: number, author: OpAuthor, ops: SectionOp[]): void {
        this.recent.push({ seq, author, ops });
        if (this.recent.length > OP_BUFFER) this.recent.splice(0, this.recent.length - OP_BUFFER);
    }

    private toOthers(connId: string, msg: ServerMessage): void {
        for (const m of this.members.values()) if (m.connId !== connId) m.conn.send(msg);
    }
}

const rooms = new Map<string, Room>();
let sweeper: ReturnType<typeof setInterval> | null = null;

// The registry's rooms write through the same transactional pipeline the HTTP route uses, so the
// seq, the digest, the search text, and the element-id stamping are derived in exactly one place.
const liveDeps: RoomDeps = {
    apply: async (target, ops) => {
        const result = await applyContentOps(target.workspaceId, target.artifactId, ops, {});
        return result.status === 200
            ? { ok: true, seq: result.seq }
            : { ok: false, reason: result.error };
    },
    now: () => Date.now(),
};

export function roomFor(target: RoomTarget, seq: number): Room {
    const existing = rooms.get(target.artifactId);
    if (existing) {
        existing.noteSeq(seq);
        return existing;
    }
    const room = new Room(target, seq, liveDeps);
    rooms.set(target.artifactId, room);
    startSweeper();
    return room;
}

/** The room only if one is open, so a write outside the socket costs nothing when nobody is in it. */
export const openRoom = (artifactId: string): Room | undefined => rooms.get(artifactId);

// Access is resolved once, at the upgrade, so every route that can change someone's standing calls
// one of these afterwards. Resolving through `artifactStanding` rather than applying the delta the
// route knows about keeps the precedence chain in the single place that owns it.
export async function syncArtifactAccess(artifactId: string, userIds?: string[]): Promise<void> {
    const room = rooms.get(artifactId);
    if (!room) return;
    const who = userIds ? userIds.filter((id) => room.userIds.includes(id)) : room.userIds;
    for (const userId of who) {
        const standing = await artifactStanding(userId, artifactId);
        room.applyAccess(userId, standing?.access ?? "none");
    }
}

/** The workspace-wide version: a default level, a role, or a membership changed under every room. */
export async function syncWorkspaceAccess(workspaceId: string): Promise<void> {
    const open = [...rooms.values()].filter((r) => r.target.workspaceId === workspaceId);
    for (const room of open) await syncArtifactAccess(room.target.artifactId);
}

export function closeIfEmpty(artifactId: string): void {
    const room = rooms.get(artifactId);
    if (room && room.size === 0) rooms.delete(artifactId);
    if (!rooms.size) stopSweeper();
}

const SWEEP_MS = 10_000;

function startSweeper(): void {
    if (sweeper) return;
    sweeper = setInterval(() => {
        for (const [id, room] of [...rooms]) {
            room.sweep();
            if (room.size === 0) rooms.delete(id);
        }
        if (!rooms.size) stopSweeper();
    }, SWEEP_MS);
    sweeper.unref?.(); // a quiet room must not hold the process open
}

function stopSweeper(): void {
    if (!sweeper) return;
    clearInterval(sweeper);
    sweeper = null;
}
