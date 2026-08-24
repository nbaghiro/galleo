# Galleo — Live collaboration

> How two or more people edit one artifact at the same time: the grant that lets someone in, the room
> that orders their writes, the presence and cursors they see, and the edit lease that keeps them out
> of each other's text. Built in house: no vendor, no CRDT, server-ordered ops with per-key
> last-writer-wins over a WebSocket in the existing Hono process.

Companion docs: `architecture.md` (the layering law and the data model), `rendering.md` (the engine
whose output every overlay is positioned from), `workspaces.md` (membership and the access levels
grants extend), `loading.md` (windowed reads and the 409 semantics a resync reuses).

## The invariant: the engine derives all rendering

The canvas engine stays the single source of everything rendered, on every surface and every format.
Collaboration synchronizes the engine's **input** (`ArtifactContent`) and decorates the editor with
overlay chrome positioned from the engine's **output** (`regions()`, `editor.sectionTops`). Four
consequences, each enforced rather than intended:

- **No geometry on the wire.** A cursor is an element or section id plus fractions of that box
  (`{el: {sectionId, elementId, fx, fy}}` or `{sec: {sectionId, nx, ny}}`), never a pixel. The
  encode/decode pair lives in `model/collab.ts` and the resolution back to a point happens in the
  receiving client's own `editor/core/collab.ts`, against its own painted regions.
- **Overlay chrome only.** Remote cursors, peer selection rings, lease outlines, and the roster are
  absolutely positioned siblings in the editor stage (`editor/panels/Collab.tsx`). They are never
  render commands, so Present, publish, thumbnails, and export are structurally unable to show them.
- **One write path.** Every collaborative write flows through the same `applySectionOps` /
  `contentWrite` pipeline the HTTP route uses, so the digest, the search text, the element-id
  stamping, and the revision counter are derived in exactly one place.
- **Identity preservation.** Applying a remote batch leaves untouched sections and elements as the
  same objects, because the per-section paint cache and the autosave diff both key on identity. The
  test for this (`model/__tests__/artifact.test.ts`, "preserves object identity for every untouched
  section and element") was written before the apply code.

Nothing collaborative enters the content JSON: the revision counter lives on the artifact row,
authorship rides on the broadcast envelope, and presence is ephemeral.

## Who may join: collaborator grants

Workspace membership answers "who is on this team". A **grant** answers "who may open this one
artifact", and it is what lets someone outside the workspace in at all.

`artifact_grants` (see `architecture.md` for the column list) keys on `(artifact_id, email)` and
binds `user_id` when the invitee has an account or accepts the emailed token. Only the token's
SHA-256 hash is stored, exactly as workspace invites do it.

**Effective access is most-specific-wins, in both directions.** The precedence chain, resolved by the
one pure `accessFor` in `model/artifact.ts`:

1. owner and admin always have `edit` (a member must not be able to lock the workspace out)
2. the creator always has `edit` on their own artifact
3. a per-user grant, if one exists
4. the artifact's own `member_access`
5. the workspace default

A grant on a plain member is therefore an explicit per-user level and may **lower** as well as raise,
which is what makes "everyone can edit, except Sam is view-only" expressible. Revoking it returns
that person to the inherited level. Grants carry `view | comment | edit` only, never `none`, so a
grant can lift someone out of a lock but can never put them into one.

**Resolution is from the artifact row, not the caller's active workspace.** `artifactStanding` in
`services/core/collaborators.ts` joins the artifact, its workspace, the caller's membership there,
and the caller's grant, in one query. `gateShared` in `services/api/middleware.ts` is what
artifact-scoped routes use (read, sections, content, comments, the collaboration socket).
`gateArtifact` beside it stays workspace-scoped and is what everything belonging to the owning
workspace uses: trash, publishing, analytics, AI turns. That split is the whole answer to "what does
a grant not open".

**Three readers of visibility, one predicate.** The library list, search, and shared-with-me all have
to agree about what exists. They share `grantedTo` (`services/core/collaborators.ts`), an
`exists (...)` clause added as a positive term to each predicate. Positive rather than `NOT(hidden)`
on purpose: `member_access` is nullable, and negating a comparison against NULL yields NULL, which
would silently drop every inheriting row. Two invariants hold, and are tested:

- an accessible artifact appears in exactly one of (library, shared-with-me), never zero
- anything `artifactStanding` resolves above `none` is reachable from some list

**Access is resolved once, at the upgrade, and pushed after that.** A socket would otherwise carry
the level it opened with for as long as it stayed open, so a revoked collaborator kept receiving
every op, and an editor demoted to view kept writing, until that tab happened to reconnect. Every
route that can change someone's standing calls `syncArtifactAccess` (a grant's level, a revoke, the
artifact's own `member_access`) or `syncWorkspaceAccess` (the workspace default, a role change, a
member removed or leaving). Both re-resolve through `artifactStanding` rather than applying the
delta the route knows about, so the precedence chain stays in the one place that owns it. `none`
closes the connection; anything else sends `access` to that client, releases any lease it can no
longer use, and re-broadcasts its roster entry so the other tabs stop drawing it as an editor.

**Decisions taken.** AI is members-only where a turn writes to the host's artifact on their behalf:
`/ai/turn` and the generation routes gate on `gateArtifact`, which a grant does not open, because
their turns would spend the host workspace's credits.

Speaker notes and narration went the other way and are open to a grantee with `edit`, on the grounds
that someone who may edit a piece may also write and voice what is said over it. What made that safe
is that the bill did not move with the permission: both gate on `gateShared` and then reserve
against **the artifact's** workspace, not the caller's. Billing the caller would drain an outsider's
credits for someone else's deck, and gating on the caller's plan would let a Free collaborator block
narration on a Pro owner's artifact. A grantee has no membership in that workspace, so they are
capped as an ordinary member would be. The rule this settles on, for anything added here later: a
grant extends what someone may do to the owner's artifact, and never who pays for it. Inviting further people takes `edit` **and** membership of the owning
workspace, so an invited editor may change the document but not widen who else can reach it.
Publishing, trashing, and permanent deletion are workspace-scoped for the same reason.

## The transport: rooms in the existing process

`GET /api/artifacts/:id/collab` upgrades to a WebSocket after the session cookie is read and
`gateShared(…, "view")` passes, so a caller with no access gets an ordinary 401/403/404 rather than a
socket that closes on them a moment later. The upgrade is wired with `@hono/node-ws` in
`services/server.ts`, the one composition-exempt entry point, and the Vite dev proxy carries it with
`ws: true`.

Rooms are **in-process**. `services/core/collab.ts` holds a `Map<artifactId, Room>`; each `Room`
keeps its connections, their presence states, the live leases, the artifact's current `seq`, and a
ring buffer of the last 256 op broadcasts. Everything the room needs from the outside (the op
applier and the clock) is constructor-injected, so the whole thing is unit-testable with no socket
and no database, which is what `services/__tests__/collab-room.test.ts` exercises.

`artifacts.seq` is a bigint bumped inside the transaction of every content write. It is the order
the room broadcasts in and the number a reconnecting client catches up from. There is no durable op
log: a server restart, or a gap wider than the ring buffer, is a resync.

### The protocol

`model/collab.ts` is the whole contract, and both ends read every inbound frame through its guards.
A frame is untrusted input under the same rule as a request body: parse it, never cast it.

Client to server:

| frame               | meaning                                                   |
| ------------------- | --------------------------------------------------------- |
| `hello {lastSeq?}`  | I am back and I hold this revision; send me what I missed |
| `presence {state}`  | my cursor, selection, and edit session, in content terms  |
| `ops {tag, ops}`    | apply this batch; the tag is how I match the answer       |
| `claim {element}`   | I am entering this element                                |
| `release {element}` | I am done with it                                         |
| `ping`              | keepalive                                                 |

Server to client:

| frame                                         | meaning                                             |
| --------------------------------------------- | --------------------------------------------------- |
| `welcome {connId, seq, self, roster, leases}` | you are in, here is the room                        |
| `peer {connId, peer\|null}`                   | someone joined, moved, or left                      |
| `ops {seq, author, ops}`                      | a batch landed; apply it                            |
| `ack {tag, seq}`                              | your batch landed at this revision                  |
| `reject {tag, reason}`                        | your batch did not apply; resync                    |
| `granted \| denied {element, holder\|null}`   | your claim won, or lost to `holder`                 |
| `lease {element, holder\|null}`               | someone else took or released an element            |
| `access {access}`                             | your level here changed; the editor's gate follows  |
| `resync {seq}`                                | reload the window; the gap is wider than the buffer |

Reconnect is exponential backoff with jitter, capped at 15s (`backoffFor` in `app/stores/collab.ts`).
A deploy drops every socket at once, so the jitter is the thing that stops them all coming back in
the same millisecond. This path is the norm, not the exception: while the socket is down the editor
keeps working solo on the HTTP autosave.

## Presence and cursors

Presence per connection is `{user, color, cursor, selection, editing}`. The client re-sends at least
every 15s even when idle; the server evicts a connection that goes quiet for 30s and releases
whatever it held. Cursor frames are throttled to about 30Hz and coalesced: presence is state rather
than events, so a dropped intermediate position costs nothing and the next one carries the truth.

Cursor encoding is content-relative (see the invariant above). A cursor over an element that has not
painted on the receiving client (an unmaterialized section, a narrower window that reflowed) falls
back to the section band, reserved from the digest, so a peer is always somewhere plausible rather
than nowhere. Coarse-pointer clients never send a cursor; they still render remote ones and the
roster.

Peer colours come from a small curated palette assigned by join order (`colorForIndex`), so two
clients showing the same room agree without negotiating.

**The roster is per person, the wire is per connection.** One person holds two connections in two
ordinary situations: a second tab, which the room supports on purpose, and the window after an
unclean drop, where the connection they left behind stays in the room until its presence times out
(30s, swept every 10s) while they have already rejoined under a new id. Ops, leases and cursors are
addressed per connection because that is what they are about; presence answers "who is here", so
`peopleOf` collapses a roster to one entry per person, newest connection winning. Asking by `connId`
alone drew a reader their own ghost when they were the only one in the room, and drew a reconnecting
peer twice.

**Follow mode.** Clicking a peer's avatar ties the viewport to them: it scrolls to where they are
and stays with them until the reader scrolls, presses Escape or an arrow, clicks the avatar again,
or the peer leaves. It is keyed on the person, so a follow survives their reconnect.

What is followed is where they **are**, not what they **see**. Presence carries a cursor, a
selection and an edit session; it does not carry a viewport, and adding one would put a scroll
offset on a wire whose whole invariant is that it carries none. So following keeps their focus on
screen (`peerFocus`: their cursor, else the element they are in, else the band of their section)
rather than mirroring their scroll, and `followScroll` moves only when they leave a margin, because
a follow that re-centred every frame would fight the reader for the scrollbar. The consequence worth
knowing: a peer who stops moving their pointer and only scrolls is somewhere this client cannot see,
and a coarse-pointer peer sends no cursor at all, so both fall back to the element or section they
last touched.

The wiring mirrors comments: `app/stores/collab.ts` owns the socket and knows the session cookie;
`editor/core/collab.ts` is the seam the editor reads (`peers`, `leases`, `remoteCursors`,
`collabActive`) and calls back through (`sendPresence`, `claimLease`, `releaseLease`);
`app/views/EditorView.tsx` connects the two. The editor never opens a socket.

## Op sync: server-ordered, per-key last-writer-wins

### The unit

`SectionOp` gains a fifth kind:

```ts
{
    kind: "data";
    sectionId: Id;
    elementId: Id;
    keys: Record<string, unknown>;
}
```

It merges `keys` into the addressed element's `data`, leaving keys nobody named alone. That is the
per-property unit two people can hold at once: an inspector's colour write and a typing session's
`{text, marks}` write are independent rather than a whole-section race. A `null` value removes the
key, because JSON drops an `undefined` and an inverse op has to be able to say "this key was not
there".

Call sites do not have to know about it. `narrowOps` (`model/artifact.ts`) runs on every local batch
and rewrites a whole-section `set` into one `data` op per element when that is all the set turned out
to be. Anything structural (a new child, a resize, a reordered column, a section background) stays a
`set`. This is a deliberate deviation from the plan's "emit `data` ops from each write site": one
central narrowing covers the inspector, the format bar, the text editor, and the data grid at once,
and cannot drift out of sync with a call site nobody updated.

### The round trip

`commit()` derives its ops once (`diffSections` then `narrowOps`), records the inverse for undo, sets
the content, and sends the batch with a client `tag`. The room applies it through the transactional
pipeline, acks `{tag, seq}` to the sender, and broadcasts `{seq, author, ops}` to everyone else. The
sender never receives its own echo.

Batches apply one at a time, through a promise chain, so the seq the server hands out and the order
clients see are the same order. That chain has to survive its own links: a write that _throws_
rather than failing (the database going away mid-transaction) would reject the chain, and every
batch queued behind it would have its callback skipped, so the room went on accepting writes,
applied none of them, and answered nobody, while each sender still held its keys as in flight and
its autosave stood down. `applyOne` therefore answers every outcome itself and never throws: a throw
is warned and answered as a `reject`, which the client resolves with the resync it already has.

Two client rules make this stable:

1. **Remote ops apply through the same pure ops local editing uses**, via a remote-origin path that
   bumps `editSeq` for painting but never records history and never re-emits.
2. **Unacked local wins, per key.** A pending map `(sectionId|elementId|dataKey) -> tag`, plus
   `(sectionId) -> tag` for whole-section writes, holds everything sent but not yet acked. An
   incoming value for a pending key is discarded until the ack clears it. That prevents flicker
   fights with no clocks and no vector timestamps. Structural ops are never discarded: a removal has
   to land whatever else is in flight. A pending key is a bet that an ack is coming, so the socket
   going away cancels the bet: `opsDropped` clears the map on a drop, since whatever was in flight
   is the HTTP save's problem from that moment, and a key left pending would go on discarding every
   remote value for it long after the room came back, on exactly the elements this tab last touched.

A remote batch that cannot apply (an unknown section, a gap the buffer cannot cover, a `reject`)
triggers the existing resync path: refetch the window, take the server's `seq`. A `data` op aimed at
a section that is still a placeholder is dropped, because the refetch will bring the server's version
of the truth anyway; a `set` or `insert` for one resolves it outright.

### The two persistence drivers

There is one baseline and two drivers, never both at once. While the socket is up it is the
persistence path and its acks advance the baseline (`noteCollabSaved` in `app/stores/save.ts`); the
debounced HTTP autosave stands down. On socket loss the HTTP save resumes from the last acked
baseline, which its existing diff already handles. On reconnect the order is flush, then hello: the
client does not count as the driver until it has greeted, so anything the HTTP path still held is
drained into the room's history first.

An HTTP content write, which happens when a writer's socket is down, is still published into the room
so everyone else sees it land. The caller names its own socket on that request (`x-galleo-conn`,
`CONN_HEADER`) so the room does not send the write back to the client that just made it; the room
honours the header only when that connection really belongs to the caller, so naming someone else's
cannot suppress their copy. A whole-document write (a save that replaced the tree rather than
patching it) has no ops to replay, so the room tells everyone to resync from the new `seq`.

A load re-baselines the HTTP save (`noteSavedContent`): re-reading the same artifact rebuilds every
section object, and a diff against the previous read's objects would resend the whole document for
nothing, which the room would then have to broadcast as a resync.

AI turns reach the room the same way any other edit does: generation streams patches to the client
that asked for them, that client applies and commits them, and the commit emits ops under its own
authorship. The `ai` author kind and `Room.publish` exist for a server-side writer; nothing in the
current AI runtime writes artifact content server-side.

### Undo

Undo is **per-user inverse ops**, replacing the whole-document snapshot stacks. Each commit records
`{forward, inverse}` (`invertOps` in `model/artifact.ts`, computed against the tree the ops are about
to be applied to, which is the one moment the previous values are in hand). Undo replays the inverse
through the normal emission pipeline, so it travels to the room like any other write; redo replays
the forward.

The skip rule: each entry also records what a remote write had touched, per key, when it was made. If
a remote write has since landed on any of those keys, replaying the entry would clobber someone
else's work, so the entry is dropped and undo moves on to the one behind it. Coalescing keys merge
consecutive entries as before, the cap is still 120, a rename rides along as its own entry, and a
text session is still one entry per session. Solo behaviour is observably identical: the existing
store and windowed-undo tests are the spec, changed only where they asserted the snapshot object
identity that no longer exists.

## The edit lease

Element-level, never section-level: a section lock would block the mainline case of two people
working on different elements of one section. Three layers, in order of how often they matter:

1. **Presence gate, client-side.** Any element in `leases()` renders the holder's coloured outline
   and name chip before anyone clicks it. Entering a held element (text editing or the data grid)
   does not enter; a short line says who is in there. Zero latency, and it covers nearly every case.
2. **Server arbitration.** `startEditing` claims. Entry is optimistic when there is no known holder,
   so the common case waits for nothing; a `denied` answer exits the session with the hint. The key
   is `(sectionId, elementId)`, held per connection, released on `stopEditing`, on disconnect, and by
   the 30s presence TTL. The same person in a second tab is denied like anyone else.
3. **Last-writer-wins underneath.** The server never enforces leases on writes, because offline
   replay and the HTTP fallback have to land. Arrival order plus per-key LWW guarantees convergence
   when prevention fails. The lease is UX and arbitration, never correctness.

**Deletion wins.** Structural ops are never rejected for lease reasons. The client courtesy-gates the
obvious paths (delete and the context menu on a held element say who is in it first), but if a remote
op removes the element or section someone is editing, their session ends with a plain line and the
uncommitted keystrokes for it are dropped rather than written into a hole. The session is tracked by
element id, not by path, because a remote write can leave the path valid while the element that was
there is gone.

## Read-only and comment-level collaborators

`view` and `comment` collaborators connect to the room, appear in the roster, send cursors, and
receive ops live, so their canvas updates in real time. The server rejects `ops` and `claim` from
them, and the client mounts the read-only editor the permissions layer ships (comments stay active at
`comment`). "Watch a teammate build" needs no extra machinery.

## The code

| Layer      | File                    | What it owns                                                    |
| ---------- | ----------------------- | --------------------------------------------------------------- |
| `model`    | `collab.ts`             | the wire contract, its guards, cursor encode/decode, lease keys |
| `model`    | `artifact.ts`           | the `data` op, `narrowOps`, `invertOps`, `accessFor`            |
| `services` | `core/collab.ts`        | the room: presence, leases, ring buffer, broadcast, the queue   |
| `services` | `core/collaborators.ts` | grants, `artifactStanding`, `grantedTo`, shared-with-me         |
| `services` | `api/collab.ts`         | the upgrade, frame parsing, the per-connection rate cap         |
| `services` | `api/collaborators.ts`  | invite, level change, revoke, accept, the shared list           |
| `app`      | `stores/collab.ts`      | the socket, backoff, heartbeat, throttling, the sink            |
| `app`      | `stores/save.ts`        | the two-driver coordination                                     |
| `editor`   | `core/collab.ts`        | the seam: peers, leases, cursors, the lease gate                |
| `editor`   | `core/store.ts`         | op emission, remote apply, the pending map, inverse-op undo     |
| `editor`   | `panels/Collab.tsx`     | the overlay: cursors, outlines, the notice                      |

## Tests

| Suite                                           | What it pins                                                |
| ----------------------------------------------- | ----------------------------------------------------------- |
| `model/__tests__/collab.test.ts`                | guards, cursor round-trip, no geometry on the wire          |
| `model/__tests__/artifact.test.ts`              | `data` merge, identity preservation, `narrowOps`, inverses  |
| `model/__tests__/artifact-access.test.ts`       | the precedence chain, both directions                       |
| `services/__tests__/collab-room.test.ts`        | join/leave/evict, leases, catch-up, two clients converging  |
| `services/__tests__/collab-room.test.ts`        | a write that throws, and a level changed under a socket     |
| `services/api/__tests__/collab-access.itest.ts` | grants end to end, and what a grant does not open           |
| `services/api/__tests__/collab-access.itest.ts` | an open room following a revoke, a lock, and a removal      |
| `services/api/__tests__/collab-socket.itest.ts` | the upgrade path and its auth                               |
| `editor/core/__tests__/collab-cursors.test.ts`  | encode/decode against fake engine output, roster maps       |
| `editor/core/__tests__/collab-sync.test.ts`     | pending keys, remote apply, undo skip, deletion wins        |
| `editor/core/__tests__/collab-sync.test.ts`     | session checkpoints, the viewer gate, a dropped socket      |
| `app/stores/__tests__/collab.test.ts`           | socket lifecycle, backoff, heartbeat, presence coalescing   |
| `app/stores/__tests__/save-driver.test.ts`      | driver exclusivity and the handover both ways               |
| `app/stores/__tests__/save-driver.test.ts`      | the retry policy, the conflict reload, the flush checkpoint |
| `e2e/editor/collab.spec.ts`                     | two browsers: roster, cursor, live edit, the lease          |

## Scale path, and what is deferred

- **Multi-instance fanout.** Rooms are in memory, so a second instance would not share them. The
  next step is a Redis pub/sub channel per artifact (port 8603 is reserved for it): each instance
  keeps its own connections and republishes broadcasts through Redis, and `artifacts.seq` stays the
  ordering authority because it is assigned inside the write transaction. The protocol does not
  preclude it; nothing on the wire assumes a single process.
- **A durable op log** is not built. A restart is a resync, and the ring buffer is 256 batches.
- **Character-level text merge** is not built. The lease makes same-element co-typing a scheduling
  problem instead of a merge problem. The upgrade path is a per-text-element CRDT whose value would
  live under one `data` key, which the per-key LWW rules already accommodate.
- **AI for external collaborators** is deferred with the credit question it raises.
- **Huddles and public-link viewer presence** are out of scope.
