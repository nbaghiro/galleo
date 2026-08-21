# Galleo — Comments

> How a person leaves a note on a piece of an artifact and how that note survives the document
> changing underneath it: the thread model, the two anchor kinds, the `cm` text mark that lets a
> range move with its text, what happens when the anchored content is edited away, the access level
> that gates writing, and the seam that keeps the editor from knowing who is signed in. Companion
> docs: `architecture.md` (the layering law and the data model), `rendering.md` (the element tree
> these anchors point into), `workspaces.md` (roles and the entitlement resolver), `collab.md`
> (the other feature that writes to an artifact from more than one place), `testing.md`.

## The one invariant

Comments sit outside content. A thread is a row in `comments`, never a node in the artifact tree,
and the only thing commenting ever writes into content is an invisible `cm` mark that carries a
thread id over a text range. Two consequences follow and both are load-bearing:

Paint and export are byte-identical with and without comments. The `cm` mark deliberately stamps no
field on a `Run` (see the `MarkType` comment in `model/text.ts`), so the tint the editor draws over
commented text is an overlay rather than a style, and a PDF or PPTX never carries a trace of it.

Undo can neither create nor destroy a thread. History moves the content tree; comment rows are not
in it. An undo can still orphan a thread by removing the element it points at, which is the
degradation path described below, but the thread itself survives.

## The data model

One table, `comments` (migration `0026`), holding roots and replies in the same shape:

| Column                       | Why it exists                                                                                                                |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `workspace_id`               | Rows are workspace-scoped on their own column, so a comment id from another workspace reads as not-found rather than refused |
| `artifact_id`                | Cascades on artifact delete; every read keys on it                                                                           |
| `section_id`                 | A content id, not a row id, so it collides across artifacts: reads pair it with `artifact_id`                                |
| `anchor` (jsonb)             | `{ kind: "element" \| "text", elementId }`                                                                                   |
| `quote`                      | What the anchor covered when the comment was written, kept for a thread whose content is gone                                |
| `parent_id`                  | Set on a reply, pointing at the root; cascades                                                                               |
| `author_id`                  | Nullable, leaving room for a link recipient authoring one without a user row                                                 |
| `body`                       | Up to `COMMENT_MAX_LENGTH` (10,000)                                                                                          |
| `resolved_at`, `resolved_by` | Roots only                                                                                                                   |

Replies are flat and never nest: `createComment` refuses a `parentId` that itself has a parent with
a 409. A thread is therefore a root plus its replies in creation order, which `threadsOf` groups in
a single pass without sorting, since the list arrives ordered.

The index is `comments_artifact_idx` on `(artifact_id, created_at)`, which is the shape every read
uses.

## Anchors

A thread never lives inside the content tree. The `comments` row carries an anchor plus the id of
the section the anchored element sat in, so nothing about commenting reaches the render commands,
and undo can neither create nor destroy a thread. An anchor names either an element or a range
inside one, and in the text case the range itself is stored on that element as a `cm` mark whose
value is the thread's root id. Splitting it that way is what lets the range move with the text:
every edit rebases marks through `rebaseMarks`, which diffs the old and new strings and splices the
marks across the single replaced span, so a comment written on a phrase still covers that phrase
after someone types ahead of it.

The section id is a locator rather than an identity. It is what groups threads in the rail, what a
jump scrolls to, and what tells us the content a thread was written on has gone missing. It is not
what the thread points at.

Anchoring needs the element to have an id, and ids are minted lazily by `withElementIds`, which runs
on load and on every server write. An element the user created this session therefore has no id
until then, so `captureAnchor` mints one at the moment of anchoring. That mint is metadata rather
than an edit: it creates no history entry, though an undo past it drops the id again and the thread
degrades exactly as it would if the mark had been edited away.

Not every element can take a comment. `commentableAt` treats the layout group as the one exemption,
because columns and wraps hold blocks side by side without owning them. Every other container (a
card, a callout, a bullet list, a diagram) owns its children as parts of one block, so a comment
there belongs to the block rather than to a line inside it.

## Degradation

`AnchorState` is how far a thread still resolves against the document on screen, and it has three
values. A `text` thread whose element and mark are both present is fully live. A thread whose
element is present but whose `cm` mark is gone (someone deleted the commented phrase) falls back to
`element`. A thread whose element is no longer in the tree at all is an `orphan`.

`isDegraded` is simply the state differing from the anchor's own kind. A degraded thread leaves the
canvas and lives on in the rail, where the stored `quote` is what a reader sees instead of a
highlight. Quotes are captured at write time and capped at 140 characters in the editor
(`COMMENT_QUOTE_MAX_LENGTH` allows 500 on the wire); for an element anchor with no text of its own,
the element's catalog label stands in.

The most common way to orphan a whole section's worth of threads is an AI turn rewriting it, since
the replacement tree carries fresh ids. This is why the quote exists at all: the alternative, a
thread that silently disappears with the content it discussed, loses the discussion too.

## Permissions

Commenting is its own access level. `ArtifactAccess` is ordered `none < view < comment < edit`, and
`atLeast` is the comparison every gate uses, so anything that can edit can also comment.

Reads gate on `view` and writes on `comment`, both through `gateShared`, which resolves the caller's
standing on the artifact and returns 404 for `none` rather than 403, so an artifact a person cannot
see does not announce itself.

Acting on an existing comment re-resolves access against the artifact the comment hangs on, not
against the comment row. `artifactOfCommentAnywhere` deliberately does not filter by workspace: the
caller may be an invited collaborator with no membership there, and the artifact gate is what
decides whether they may act. The effect is that a member dropped to `view` can no longer edit or
resolve the threads they left behind.

Two per-reader flags are resolved server-side and ride on each row, so the editor can show an
affordance exactly where the write would succeed without ever learning who is signed in:

- `mine`, meaning the reader wrote it and may edit it
- `canDelete`, meaning the author, or someone who can already administer the workspace (owner or
  admin, via `roleOf`)

## Routes

Six endpoints, all in `services/api/comments.ts`, all behind `requireUser`:

| Route                          | Needs     | Notes                                                            |
| ------------------------------ | --------- | ---------------------------------------------------------------- |
| `GET /artifacts/:id/comments`  | `view`    | The flat list, ordered, each row carrying `mine` and `canDelete` |
| `POST /artifacts/:id/comments` | `comment` | Creates a root, or a reply when `parentId` is set                |
| `PATCH /comments/:id`          | `comment` | Body only; author-checked in core                                |
| `POST /comments/:id/resolve`   | `comment` | Roots only                                                       |
| `POST /comments/:id/unresolve` | `comment` | Roots only                                                       |
| `DELETE /comments/:id`         | `comment` | Author or workspace moderator; replies cascade                   |

The create body is validated with a discriminated union on `anchor.kind` rather than a loose object,
because the anchor shape is ours end to end: nothing the client sends is stored beyond those fields,
so an unknown kind is a bug rather than a forward-compatible new field. `parentId` is validated as a
uuid so a malformed id reaches the route as a 400 rather than the uuid column as a query error.

Three failures are 409 rather than 400, because each one is a well-formed request about a world that
does not match: an unknown `sectionId`, an unknown or cross-artifact `parentId`, and a reply on a
reply. The section check reads the artifact's stored digest, and a digest written before section ids
existed cannot answer the question, so it abstains rather than refusing.

## The editor seam

The editor never imports the app and never learns who is signed in. `editor/core/comments.ts` is
shaped like the AI transports in `editor/core/store.ts`: the app pushes the thread list in through
`setComments` and registers writer callbacks (`onCommentCreate`, `onCommentReply`, `onCommentResolve`,
`onCommentEdit`, `onCommentDelete`), and author identity rides inside the DTOs.

Markers live in a section's right border and appear on hover. Two signals drive the reveal, the
hovered section and the set of sections something is holding open, so moving the pointer off a
section and onto its own marker never makes the marker vanish under the click already on its way.
Tiers with no hover show everything. `sectionAtY` resolves the hovered section from bands built off
the section tops the canvas publishes, rather than from painted boxes, because the markers sit in
the margin outside the box and a reveal that stopped at the box edge would close too early.

Placement is two functions worth knowing about. `markerX` puts a chip just outside its section
(`MARKER_GAP` of 12) and clamps it inside the stage when the section runs to the edge, so a chip
never half-hangs off. `placeMarkers` walks requests in order and pushes each one down only as far as
`MARKER_SPACING` (32) requires, which keeps an uncrowded rail exactly where it asked to be.

Two kinds of thread have no marker of their own, and each collapses into one chip in the section's
border: the orphans, whose element is gone, and the resolved ones, which are hidden. `sectionChips`
stacks the pair in a fixed order so they never land on each other, at a step that clears the 44px
tap target on a hoverless tier. Which section a thread's chrome belongs to is one rule, the section
its element sits in now or the one it was written in once that element is gone, and markers, chips
and the reveal all key on it, which is what makes the chip that hides a resolved thread the chip
that brings it back.

## Resolving

Resolving is an event rather than a state change to go looking for. The thread panel closes, the
marker leaves the margin (resolved threads are not drawn at all until asked for), and the editor's
transient line says so and carries a `Reopen` that puts the thread and its panel back. That line is
the notice in `editor/core/collab.ts` (`say`, rendered by `EditorNotice` in `editor/panels/Collab.tsx`),
which is the editor's one message surface rather than a comment-specific toast; it is not peer chrome,
so it renders outside the `collabActive` gate.

The reveal is per section and opt-in: `resolvedRevealed`/`toggleResolvedRevealed` hold the sections
whose archive is open, and a revealed thread paints dimmed. Per section rather than per document
because reading one section's history should not dim markers all the way down the stack. A resolved
thread whose element is also gone joins the section's orphan stack while the archive is open, so the
two chips together always reach everything.

## The client

`app/stores/comments.ts` is the wire half. Mutations refetch the list rather than patching it in
place, on the grounds that comment traffic is small and correctness is worth more than the
round trip. Threads reach the editor only through the seam above, so this refresh is the single
thing a future SSE channel would replace.

Sync is a 30 second poll gated on `document.visibilityState`, so a backgrounded tab costs nothing,
and a hidden-to-visible flip refetches immediately rather than waiting out the interval.

Creating a comment flushes autosave first. A brand-new section exists only in the editor until
autosave lands, and the server refuses a comment on a section id its digest has never seen, so the
checkpoint has to run before the post.

## The panels and what dismisses them

The thread panel, the composer and the orphan popover all close on Esc or a pointerdown that is not
theirs. Nothing is swallowed: there is no backdrop and nothing is stopped, so the same press still
selects an element or presses a button, and pressing a different marker still closes the panel that
is open. What counts as "theirs" is `pressInside` from `@ui/gesture`: the panel element, the marker
that opened it (a selector, since the marker is rendered elsewhere), and anything a `Popover` under
the panel portalled away carrying the panel's owner token. That last part is load-bearing. The
overflow menu holding `Delete thread` portals to `<body>`, so without it the press on the menu item
read as outside, the panel closed on pointerdown, and the item left the DOM before the click could
run: the action silently did nothing. See `.docs/frontend.md` for the ownership mechanism.

## Testing

Six unit and integration suites of its own totalling 104 assertions, the shared dismissal test one
layer down, and twelve browser flows:

| Suite                                             | Covers                                                                                               |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `model/__tests__/comments.test.ts`                | Thread grouping, anchor validation, `anchorStateOf` and degradation                                  |
| `editor/core/__tests__/comment-anchors.test.ts`   | Capture, id minting, `commentableAt`, mark ranges                                                    |
| `editor/core/__tests__/comment-layout.test.ts`    | `markerX` clamping, `placeMarkers` spacing, `sectionChips` stacking, hover + resolved reveal rules   |
| `app/stores/__tests__/comments.test.ts`           | Refetch-on-mutate, the autosave checkpoint, polling                                                  |
| `services/api/__tests__/comments.itest.ts`        | The six routes, the three 409s, tenant scoping                                                       |
| `services/api/__tests__/comment-anchors.itest.ts` | Anchor round-trips and per-reader `mine`/`canDelete`                                                 |
| `e2e/editor/comments.spec.ts`                     | Twelve browser flows, including resolve-then-reveal, delete through the portaled menu, and dismissal |
| `ui/__tests__/gesture.test.ts`                    | `pressInside`: the surface, its opener, a portaled node it owns, and another surface's               |

## Planned / deferred

Not built:

- Notifications of any kind. Nothing emails or in-app-notifies on a new comment, reply, or mention.
- Mentions. There is no `@` syntax and no parsing of one.
- Link-recipient authorship. `author_id` is nullable to leave room for someone commenting through a
  share link without a user row, but no route accepts that today; every write requires a session.
- Live delivery. The 30 second poll is the whole sync story. Comments do not ride the collaboration
  socket described in `collab.md`, though that is the obvious place to put them.
- Rich text in a comment body. Bodies are plain strings.
- Resolution history. `resolved_by` is stored but nothing reads it back, and a resolve/unresolve
  cycle leaves no trail.
