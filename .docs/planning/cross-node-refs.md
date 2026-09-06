# Planning — cross-node references: connections between elements

> The executable spec for item 7 of [`engine-gaps.md`](engine-gaps.md): a stored, styleable
> connection between any two addressable things in an artifact — element to element, callout to a
> single chart bar — drawn as a routed arrow that survives moves, re-layout, and format switches,
> and degrades honestly on every export surface. The engine does not change at all: the design
> resolves references _above_ `layout()`, against the regions every consumer already holds, and
> paints them through the surface-command pipeline all four backends already run.
>
> Status: built 2026-09-06, all four phases, pending one manual QA pass. Deviations from the plan
> as written: the paged wiring instruments the two funnels (`sectionSlides`/`layoutSection` gained
> an optional trailing `connections` param) instead of editing eight call sites, so every paged
> consumer gets arrows through one seam; phase D shipped exactly its stated scope (the op, prune on
> apply, the catalog paragraph) and the model-AUTHORABLE connect tool is recorded as not-taken,
> since the model never sees element ids at authoring time (`zElement` strips them; stamping
> happens at write), so flow (d)'s authoring story waits on an id-exposing inspect surface plus a
> catalog tool of its own; no route schema was needed because patches never cross a request body
> (verified); Escape cancels the gesture via a window listener rather than a keymap entry; the
> connection bar reuses existing icon glyphs; library thumbnails stay arrow-free.

Companion docs: `engine-gaps.md` (item 7's rationale), [`hit-geometry.md`](hit-geometry.md) (the
datum regions this plan anchors to), [`paint-model.md`](paint-model.md) (the per-backend degrade
contract this plan's table follows), [`motion.md`](motion.md) §7 (the enumeration-point list a new
artifact-level field must pass — written for motion, load-bearing here), `.docs/rendering.md` (the
engine and the render bridge), `.docs/collab.md` (the shell op that syncs this for free),
`.docs/comments.md` (the degrade-by-stable-id precedent), `.docs/ai.md` (the patch vocabulary
phase D extends).

## Why

The gap, as the inventory states it: regions are produced by `emit` only after layout completes,
and nothing feeds them back in, so node A can never resolve against node B's box. Diagrams work
around it by painting a whole subtree into one `surface`, which is also why the connector-drawing
machinery in this codebase is locked inside one element family.

What it costs today, concretely: an author cannot draw an arrow from a remark to the bar it
remarks on; a "how these two cards relate" line is impossible outside a diagram; the AI writing an
explainer builds a `flow` diagram even when the two things it wants to join are ordinary elements
already on the canvas.

### What changed since the entry was written (the premise is better now)

Four things landed that make the cheap shape possible, and the entry predates all of them:

- **Every consumer already holds resolved regions.** `layout()` returns `{ commands, regions }`
  (`canvas/engine/layout.ts:704`), `paintSectionStack` returns stage-space regions for the whole
  stack (`canvas/render/backends.ts:1100`, consumed by the editor, Present, and previews),
  `SlidePage.regions` carries the page window (`canvas/render/commands.ts:432`), and `fragment`
  pages carry regions through `regionWindow` (`layout.ts:807`). The "feed regions back in" problem
  dissolved: they are already out, everywhere, in the right coordinate space per consumer.
- **Sub-element geometry is addressable.** The hit-geometry round gave charts and diagrams
  `datum:` regions with real shapes (`SurfaceLeaf.regions`, `node.ts:191`; `datumRegionId`,
  `model/artifact.ts:532`). "Point at the third bar" is now a region lookup, not a wish.
- **The connector renderer exists.** `drawLink` (`canvas/elements/diagram/utils.ts:583`) draws
  routed elbow/curve links with arrowheads, dashes, and corner rounding through `DrawContext`,
  which all four backends honor (DOM and canvas draw it vector; PDF adapts it; PPTX embeds
  surfaces as vector SVG via `surfaceSvgUri`, `pptx.ts:442`). Nothing needs to be re-drawn, only
  re-aimed.
- **Stable identity with a degrade story is proven.** `ElementInstance.id` exists for exactly
  this ("stable identity for anything pointing at this node from outside the tree",
  `model/artifact.ts:11`), `elementIdMap` resolves id → current address
  (`canvas/elements/ops.ts:128`), and comments already ride it with graceful degradation
  (`anchorStateOf`, `model/comments.ts`). A reference stored by element id survives drags,
  reorders, and section moves with no bookkeeping.

## What this unlocks — the flows, walked through

### a. An annotation arrow to one chart bar

A marketing lead is polishing a quarterly deck. Slide four has a column chart and a small callout
card reading "the June dip is the store move". They select the callout, press **Connect** on the
context bar, and the canvas enters a one-shot aiming mode: the cursor becomes a crosshair, and as
it moves, whatever it would land on highlights — whole elements through the existing `hitTest`,
individual bars through the existing `datumAt` (both already live in `editor/Canvas.tsx`). They
click the June column. A muted arrow draws from the callout's nearest edge to the bar, routed with
the same elbow geometry diagram links use.

What lands in the artifact: one entry in `content.connections` —
`{ id, from: { element: "e-93a1…" }, to: { element: "e-fbad…", datum: 5 }, style: { head: "arrow" } }`.
Two stable ids and an index; no pixel anywhere, which is what keeps it true after any re-layout.

What renders elsewhere: in Present and on the published page the arrow paints identically (same
resolver, same regions). PNG and PDF exports draw it vector. PPTX embeds it as vector SVG the way
every surface already ships. If a later data edit deletes the June column, the arrow re-anchors to
the chart's own box (the comment-anchor degrade, one level up); if the chart itself is deleted,
the connection stops rendering and is pruned on the next write.

### b. A connector between two cards that survives a drag

A founder is laying out a "how it works" section: three cards in a row, and they want a line from
card one to card three with a dashed style, skipping card two. Select card one → Connect → click
card three → set Dashed on the connection's own bar. Later they restructure: card three gets
dragged into a different column, then into the section below. The connection is stored by element
id, resolution happens against the current frame's regions, so after every drop the arrow simply
re-routes to wherever the card now is — including across sections, because the editor and the
continuous playback surfaces resolve against the whole stage's region set, not one section's.
Duplicating the card does _not_ duplicate the arrow: `withFreshElementIds` re-mints the copy's
ids, so the arrow stays with the original — the same deliberate semantics that keep a comment
thread on the element it was written on.

### c. Smart alignment guides — explicitly a different feature, not taken here

Drag-time "snap to that card's edge" guides look adjacent but are a different animal: they are
ephemeral editor chrome computed from regions during a gesture, never stored, never rendered
outside the editor, and they need drag-loop integration (`editor/core/dnd.ts`), not a model
contract. Building them shares zero stored state with connections and would couple this plan to
the live-reflow question (item 15). They stay out of scope; when built, they will read the same
regions this plan reads, which is the only relationship.

### d. An AI-authored callout in a generated explainer

A user asks the chat agent to "generate an explainer on our funnel and call out where drop-off is
worst". Generation writes a section with a funnel diagram and a short remark card, then emits one
`setConnections` patch op joining the remark to funnel band three. The catalog teaches the same
contract the editor writes: element ids the model already knows (it authored them this turn),
an optional datum index, the same style enum. On the streamed turn the patch applies like any
other `PatchOp`, the mirror store repaints, and the arrow is there when the section finishes
writing. Nothing about the tool surface is new beyond one op and one catalog paragraph; pricing is
unchanged because it rides existing section-writing tools rather than becoming its own.

## The governing decision: paint-only, both-ends-or-nothing

**A connection may affect paint only. It may never affect layout.** This is the same fence the
motion round drew, for the same reasons:

- No iteration: layout stays single-pass and O(n); a reference can never create a cycle because
  nothing it does feeds back into sizing.
- Export fidelity by construction: the static frame is already correct; connections are extra ink
  on top of geometry that did not move.
- Autofit, `fragment`, fit-checks, the section cache: all untouched, all still measuring the same
  tree.

What this deliberately gives up, recorded so it is not rediscovered: constraint-flavored flows
("match that card's height", "size this box to that one") are _not_ expressible and never will be
through this mechanism — they are layout, and the honest home for the two real cases we have is
existing layout vocabulary (`height: "fill"` for level cards; grid tracks for aligned columns).
If a genuine constraint system is ever wanted, it is a different item with a different risk class.

**Both-ends-or-nothing** is the visibility rule: a connection renders on a surface only when both
endpoints resolve to regions on that surface. Endpoints on two different pages of a paged export,
an endpoint windowed out of a fragmented page, an endpoint inside a `pinned` (sticky) section
during continuous playback (its paint moves at scroll time; a stage-painted arrow would detach) —
the connection simply does not draw there, the way `link` does not survive to PNG. Honest absence
over wrong ink.

## Options considered

**A second bounded resolution pass inside the engine — rejected.** `layout()` would run, regions
would be handed back in, and a second pass would emit reference commands. But one `layout()` call
sees one section root; connections cross sections, so the engine-level pass would still need a
stitching layer above it, at which point the pass adds engine surface area without solving the
actual coordination problem. It also tempts layout-affecting references (the input is right
there), which is the fence we just chose to build.

**A deferred command kind with symbolic endpoints — rejected, though it is the gaps entry's own
lean.** The engine would emit `{ kind: "connect", from: "el:…", to: "el:…" }` and backends would
resolve at draw time. This forces all four backends to learn resolution (four implementations of
one algorithm), leaves the symbolic form in the fragment/pagination path where every other command
is concrete geometry, and still cannot see across sections from inside one emit. The entry's
instinct — preserve single-pass — was right; the conclusion moves one level up.

**A `connector` element in the tree — rejected.** An element owns a box in flow; a connection
spans two boxes and owns none. Format translation would try to place it, `fragment` would try to
break it, the palette and `check:elements` would have to special-case a registered element with no
own geometry, and dragging it means nothing. The one precedent for box-less content — the comment
thread — deliberately lives _outside_ the tree, and that is the precedent to follow.

**Post-layout resolution above the engine (chosen).** A pure resolver consumes what every surface
already has — the artifact and that surface's `Region[]` — and returns ordinary `RenderCommand`s
(one `surface` command per connection, plus one thin polygon region for editor hit-testing). The
engine is not merely preserved; it is _untouched_: zero new node fields, zero new command kinds,
zero emit changes. Every backend renders the result through code that already exists.

## The recommended shape

### Model (`model/artifact.ts` — no twentieth file)

The connection is part of the artifact contract, beside `Target`, the region grammar, and the
anchor math it is kin to:

```ts
export interface ConnectionEnd {
    element: Id; // ElementInstance.id — survives moves, dies with the element
    datum?: number; // a datum: region index on that element (a bar, a band, a venn circle)
}
export interface Connection {
    id: Id;
    from: ConnectionEnd;
    to: ConnectionEnd;
    style?: { dashed?: boolean; head?: "arrow" | "none"; tone?: "muted" | "accent" };
}
```

`ArtifactShell` gains `connections?: Connection[]` — the shell's own comment says artifact-wide
fields go here, and the payoff is immediate: the existing `{ kind: "shell" }` section op
(`model/artifact.ts:752`) syncs it through collab, the section-ops route, and undo with **zero new
wire machinery**. Also here: `refRegionId(id)` / `parseRefRegion(id)` extending the region-id
grammar family (`ref:` prefix; `parseTarget` ignores it by construction, so selection and
drop-slot code never see connections without opting in), and `pruneConnections(content)` — the
pure sweep dropping entries whose element ids no longer resolve, called where content is written.

The enumeration points a new shell field must pass, per the list motion §7 recorded: `asContent`
(`model/artifact.ts:129` — the actual gate; an unlisted field is dropped on the next section-op
write), the zod body schema on the section-ops route (loose by rule, verify), and the publish
payload (connections are not secrets and render publicly, so they ship — unlike `notes.cues`).
`dataDelta`, `SECTION_SHELL_EQUAL`, `zElement`, `reviseElement` are untouched: this is neither an
element field nor a section field.

### The resolver (`canvas/render/connect.ts` — one file, one concept)

```ts
export function connectionCommands(
    content: ArtifactContent,
    regions: Region[],
    theme: Tokens,
): { commands: RenderCommand[]; regions: Region[] };
```

Pure, and the whole feature: build `elementIdMap(content)` once; for each connection resolve each
end — element id → address → `elementRegionId` → region, then the `datum:` region at the index
when one is named, falling back to the element's own region when the datum is gone (the comment
degrade, one level up); skip the connection unless both ends resolved (both-ends-or-nothing).
Route with the nearest-perimeter-points-then-elbow geometry, reusing `drawLink` from
`@elements/diagram/utils` verbatim (render already imports elements; the routing/arrowhead concept
lives there and is not duplicated). Emit one `surface` command per connection whose paint closure
calls `drawLink`, plus one region: `id: refRegionId(connection.id)` with a thin polygon along the
route (`shape: { kind: "poly" }` is first-class since the hit-geometry round), so the editor
selects an arrow with the existing `inRegion` machinery and zero new hit-test code.

Anchoring against rotated and pinned elements is free: regions arrive post-rotation as polygons
with bounding boxes (`rotateRegion`), and the resolver anchors on what it is given.

### Wiring, per consumer (each a few lines, no new concepts)

| Surface                      | Region source (exists today)                                 | Wiring                                                                                                                 |
| ---------------------------- | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| Editor canvas                | `paintSectionStack(...).regions` (stage space)               | append resolved commands to an overlay host painted with the plain `paint()`; frozen during drags like everything else |
| Present continuous / publish | same stack painter (`ui/present.tsx:321`)                    | same overlay; skip connections touching a `pinned` section                                                             |
| Present paged / PNG / PPTX   | `SlidePage.regions` per page                                 | append to the page's commands before frame scaling, so connections scale with the content they annotate                |
| PDF (doc)                    | `layoutSection().regions` + `regionWindow` per fragment page | same per-page rule                                                                                                     |

Fidelity table, in the paint-model contract's format: DOM/canvas vector via `DrawContext`; PDF
vector through the existing surface adapter; PPTX vector SVG via `surfaceSvgUri`; every paged
surface drops cross-page connections by the stated rule rather than drawing a wrong arrow.

### Editor affordance (phase C)

Enter: **Connect** on the element context bar (and as a command in the palette, so it is
findable). One-shot aiming mode in `Canvas.tsx`: pointer-move highlights the would-be target via
the existing `hitTest`/`datumAt`; click commits `{ from: selected element's id, to: hit }` through
a `commands.ts` entry that stamps ids via `contentWithElementIds` first (an element that has never
been saved may not carry one yet); Escape cancels. Select: clicking an arrow hits its `ref:`
region → a small floating bar (Dashed · Arrowhead · Tone · Delete), reusing the control-bar
machinery. The mode is desktop-first; phones get rendering and deletion but not the aiming
gesture this round (a two-tap connect flow is its own design decision — recorded, not taken).

### AI surface (phase D)

One `PatchOp` — `{ op: "setConnections"; connections: Connection[] }` (whole-list set, like
`setMeta`; the model authored the ids this turn, so per-entry diffing buys nothing) — applied in
`applyOp`, schema'd loosely on the route, taught by one catalog paragraph under the artifact
contract with the explainer-callout example from flow (d). No new tool, no pricing change.

### Analytics

`connection_created` in `model/analytics.ts`: `{ from_type, to_type, to_datum: boolean,
cross_section: boolean }` — types and booleans, no content. Captured at the one editor command
seam that writes a connection; AI-authored ones are the server's to count via the existing
generation events, per the emits-what-only-it-knows rule. `connection_deleted` mirrors it.

## Phases

Order: A → B → C → D. Every phase through the full gate set: typecheck, lint, full vitest,
`check:elements`, `check:validation`, suppressions, copy; red-first pins wherever behavior exists
to pin.

**A — the contract and the resolver (S–M).** `Connection`/`ConnectionEnd`, `ArtifactShell.connections`,
`asContent` line, `refRegionId`/`parseRefRegion`, `pruneConnections`; `canvas/render/connect.ts`
complete. Pins (red-first, `canvas/render/__tests__/connect.test.ts` + model tests): resolve by
element id after a simulated move (address changed, arrow follows); datum endpoint hits the datum
region and falls back to the element when the index is gone; one missing endpoint renders nothing;
`ref:` region polygon answers `inRegion` along the route and not beside it; `parseTarget` ignores
`ref:`; `asContent` round-trips the field; prune drops only dead entries; a shell op carrying
connections narrows and applies.

**B — playback, publish, export (S).** The four wiring rows. Pins: a stack paint with a
cross-section connection emits its command in stage space; a paged render with endpoints on two
pages emits nothing on either; a paged render with both on one page emits on exactly that page;
pinned-section skip; PPTX gets a vector blip for the connection surface; PDF draws it through the
adapter. `eval:shots` posture: the corpus carries no connections, so **all 592 checks must be
byte-identical**; connection rendering is pinned by its own dom tests, never by corpus edits.

**C — authoring (M).** The Connect mode, the `ref:` selection + floating bar, delete/undo, the
`commands.ts` seam with the analytics capture, `contentWithElementIds` stamping. Pins: the command
writes the expected entry and stamps ids; delete prunes and undoes; op-level purity everywhere;
the gesture itself is manual QA (the established deviation — no Solid harness).

**D — the AI op (S).** `setConnections` op + `applyOp` + route schema + one catalog paragraph.
Pins: op application, unknown-id patch entries pruned on apply, catalog text passes `check:copy`.

## Not taken, and why

Alignment guides (different feature; reads the same regions, stores nothing — see flow c).
Layout-affecting constraints (the fence; existing layout vocabulary covers the two real cases).
A connector element (box-less content does not belong in the tree). Cross-page arrows drawn as
split stubs (wrong ink; both-ends-or-nothing is honest). Endpoint re-binding when a referenced
element is duplicated (fresh ids are the contract that keeps comments sane; same here). Phone
aiming gesture (its own decision). Labels riding the arrow (a text chip mid-route is real scope —
wants the C bar to grow an inline label field; deferred until the bare arrow proves out).
Waypoint editing / manual routing (Figma-grade connector UX; the elbow router first, evidence
later).
