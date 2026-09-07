# Cross-node references: connections between elements

> A stored, styleable connection between any two addressable things in an artifact — element to
> element, callout to a single chart bar — drawn as a routed arrow that survives moves, re-layout,
> and format switches, and degrades honestly on every export surface. The engine did not change at
> all: references resolve _above_ `layout()`, against the regions every consumer already holds,
> and paint through the surface-command pipeline all four backends already run.

Companions: `.docs/rendering.md` (the engine and the render bridge), `.docs/collab.md` (the shell
op that syncs this for free), `.docs/comments.md` (the degrade-by-stable-id precedent),
`.docs/ai.md` (the patch vocabulary this extends).

## Why

The engine gap, as the inventory stated it: regions are produced by `emit` only after layout
completes, and nothing feeds them back in, so node A can never resolve against node B's box.
Diagrams work around it by painting a whole subtree into one `surface`, which is also why the
connector-drawing machinery was locked inside one element family. What that cost, concretely: an
author could not draw an arrow from a remark to the bar it remarks on; a "how these two cards
relate" line was impossible outside a diagram; the AI writing an explainer built a `flow` diagram
even when the two things it wanted to join were ordinary elements already on the canvas.

### The premises the design stands on

- **Every consumer already holds resolved regions.** `layout()` returns `{ commands, regions }`
  (`canvas/engine/layout.ts`), `paintSectionStack` returns stage-space regions for the whole stack
  (`canvas/render/backends.ts`, consumed by the editor, Present, and previews),
  `SlidePage.regions` carries the page window (`canvas/render/commands.ts`), and `fragment` pages
  carry regions through `regionWindow`. The "feed regions back in" problem dissolved: they are
  already out, everywhere, in the right coordinate space per consumer.
- **Sub-element geometry is addressable.** The hit-geometry round gave charts and diagrams
  `datum:` regions with real shapes (`SurfaceLeaf.regions`; `datumRegionId` in
  `model/artifact.ts`). "Point at the third bar" is a region lookup, not a wish.
- **The connector renderer exists.** `drawLink` (`canvas/elements/diagram/utils.ts`) draws routed
  elbow/curve links with arrowheads, dashes, and corner rounding through `DrawContext`, which all
  four backends honor (DOM and canvas draw it vector; PDF adapts it; PPTX embeds surfaces as
  vector SVG via `surfaceSvgUri`). Nothing needed re-drawing, only re-aiming.
- **Stable identity with a degrade story is proven.** `ElementInstance.id` exists for exactly this
  ("stable identity for anything pointing at this node from outside the tree"), `elementIdMap`
  resolves id → current address (`canvas/elements/ops.ts`), and comments already ride it with
  graceful degradation (`anchorStateOf`, `model/comments.ts`). A reference stored by element id
  survives drags, reorders, and section moves with no bookkeeping.

## The flows

### a. An annotation arrow to one chart bar

A marketing lead is polishing a quarterly deck. Slide four has a column chart and a small callout
card reading "the June dip is the store move". They select the callout, press **Connect** on the
context bar, and the canvas enters a one-shot aiming mode: the cursor becomes a crosshair, and as
it moves, whatever it would land on highlights — whole elements through the existing `hitTest`,
individual bars through the existing `datumAt` (both live in `editor/Canvas.tsx`). They click the
June column. A muted arrow draws from the callout's nearest edge to the bar, routed with the same
elbow geometry diagram links use.

What lands in the artifact: one entry in `connections` —
`{ id, from: { element: "e-93a1…" }, to: { element: "e-fbad…", datum: 5 }, style: { head: "arrow" } }`.
Two stable ids and an index; no pixel anywhere, which is what keeps it true after any re-layout.

What renders elsewhere: in Present and on the published page the arrow paints identically (same
resolver, same regions). PNG and PDF exports draw it vector. PPTX embeds it as vector SVG the way
every surface already ships. If a later data edit deletes the June column, the arrow re-anchors to
the chart's own box (the comment-anchor degrade, one level up); if the chart itself is deleted,
the connection stops rendering and is pruned on the next write.

### b. A connector between two cards that survives a drag

A founder lays out a "how it works" section: three cards in a row, and a line from card one to
card three with a dashed style, skipping card two. Select card one → Connect → click card three →
set Dashed on the connection's own bar. Later they restructure: card three gets dragged into a
different column, then into the section below. The connection is stored by element id, resolution
happens against the current frame's regions, so after every drop the arrow simply re-routes to
wherever the card now is — including across sections, because the editor and the continuous
playback surfaces resolve against the whole stage's region set, not one section's. Duplicating the
card does _not_ duplicate the arrow: `withFreshElementIds` re-mints the copy's ids, so the arrow
stays with the original — the same deliberate semantics that keep a comment thread on the element
it was written on.

## The governing decision: paint-only, both-ends-or-nothing

**A connection may affect paint only. It may never affect layout.** The same fence the motion
round drew, for the same reasons:

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
there), which is the fence we chose to build.

**A deferred command kind with symbolic endpoints — rejected, though it was the gaps entry's own
lean.** The engine would emit `{ kind: "connect", from: "el:…", to: "el:…" }` and backends would
resolve at draw time. This forces all four backends to learn resolution (four implementations of
one algorithm), leaves the symbolic form in the fragment/pagination path where every other command
is concrete geometry, and still cannot see across sections from inside one emit. The entry's
instinct — preserve single-pass — was right; the conclusion moves one level up.

**A `connector` element in the tree — rejected.** An element owns a box in flow; a connection
spans two boxes and owns none. Format translation would try to place it, `fragment` would try to
break it, the palette and `check:elements` would have to special-case a registered element with no
own geometry, and dragging it means nothing. The one precedent for box-less content — the comment
thread — deliberately lives _outside_ the tree, and that is the precedent followed.

**Post-layout resolution above the engine (chosen).** A pure resolver consumes what every surface
already has — the artifact and that surface's `Region[]` — and returns ordinary `RenderCommand`s
(one `surface` command per connection, plus one thin polygon region for editor hit-testing). The
engine is not merely preserved; it is _untouched_: zero new node fields, zero new command kinds,
zero emit changes. Every backend renders the result through code that already existed.

## The shape

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

`ArtifactShell` carries `connections?: Connection[]` — artifact-wide fields go on the shell, and
the payoff is immediate: the existing `{ kind: "shell" }` section op syncs it through collab, the
section-ops route, and undo with zero new wire machinery. Also here: `newConnectionId`, and
`refRegionId(id)` / `parseRefRegion(id)` extending the region-id grammar family (`ref:` prefix;
`parseTarget` ignores it by construction, so selection and drop-slot code never see connections
without opting in), and `pruneConnections(content)` — the pure sweep dropping entries whose
element ids no longer resolve, called where content is written, removing the key entirely when the
list empties.

The enumeration points a new shell field must pass: `asContent` (the actual gate — an unlisted
field is dropped on the next section-op write; it carries `connections` when the list is
non-empty), and the publish payload (connections are not secrets and render publicly, so they ship
— unlike `notes.cues`). `dataDelta`, `SECTION_SHELL_EQUAL`, `zElement`, `reviseElement` are
untouched: this is neither an element field nor a section field. No route schema names
connections, because patches never cross a request body — the shell op rides the guard-based
section-op path, and the AI op travels inside the streamed turn.

### The resolver (`canvas/render/connect.ts` — one file, one concept)

```ts
export function connectionCommands(
    content: ArtifactContent,
    regions: Region[],
    theme: Tokens,
    opts?: { skipPinned?: boolean },
): { commands: RenderCommand[]; regions: Region[] };
```

Pure, and the whole feature: build `elementIdMap(content)` once; for each connection resolve each
end — element id → address → `elementRegionId` → region, then the `datum:` region at the index
when one is named, falling back to the element's own region when the datum is gone (the comment
degrade, one level up); skip the connection unless both ends resolved (both-ends-or-nothing), and
skip any connection touching a `pinned` section when `skipPinned` is set. Route with
nearest-perimeter-points-then-elbow geometry, reusing `drawLink` from `@elements/diagram/utils`
verbatim (render already imports elements; the routing/arrowhead concept lives there and is not
duplicated). Emit one `surface` command per connection whose paint closure calls `drawLink`, plus
one region: `id: refRegionId(connection.id)` with a thin polygon along the route, so the editor
selects an arrow with the existing `inRegion` machinery and zero new hit-test code.

Anchoring against rotated and pinned elements is free: regions arrive post-rotation as polygons
with bounding boxes, and the resolver anchors on what it is given.

### Wiring, per consumer

The paged wiring instruments the two funnels rather than every call site: `sectionSlides` and
`layoutSection` (`canvas/render/commands.ts`) take an optional trailing `connections` parameter
and append the section's resolved arrows themselves, so every paged consumer gets arrows through
one seam — `canvas/render/pptx.ts` simply passes `art.connections` through.

| Surface                      | Region source                                                | Wiring                                                                                                                 |
| ---------------------------- | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| Editor canvas                | `paintSectionStack(...).regions` (stage space)               | `editor/Canvas.tsx` appends resolved commands to an overlay host painted with the plain `paint()`; frozen during drags |
| Present continuous / publish | the same stack painter (`ui/present.tsx`)                    | same overlay, with `skipPinned: true`                                                                                  |
| Present paged / PNG / PPTX   | `SlidePage.regions` per page                                 | the `sectionSlides` funnel, before frame scaling, so connections scale with the content they annotate                  |
| PDF (doc)                    | `layoutSection().regions` + `regionWindow` per fragment page | the `layoutSection` funnel, same per-page rule                                                                         |

Fidelity, in the paint-model contract's format: DOM/canvas vector via `DrawContext`; PDF vector
through the existing surface adapter; PPTX vector SVG via `surfaceSvgUri`; every paged surface
drops cross-page connections by the stated rule rather than drawing a wrong arrow. Library
thumbnails stay arrow-free.

### Editor affordance

Enter: **Connect** on the element context bar, and `insert.connect` ("Draw connection") in the
command palette so it is findable. One-shot aiming mode in `editor/Canvas.tsx`: the cursor is a
crosshair while `connectFrom` is armed, pointer-move highlights the would-be target via the
existing `hitTest`/`datumAt`, click commits `{ from: the selected element's id, to: the hit }`
through the `editor/core/commands.ts` seam — which stamps ids via `contentWithElementIds` first
(an element that has never been saved may not carry one yet), writes the entry, and selects the
new arrow — and Escape cancels through a window listener. Select: clicking an arrow hits its
`ref:` region → `ConnectionBar` (`editor/panels/ControlBars.tsx`), a small floating bar over the
route's box — Dashed · Arrowhead · Tone · Delete — reusing the control-bar machinery and the
existing icon glyphs. The mode is desktop-first: phones get rendering and deletion but not the
aiming gesture (a two-tap connect flow is its own design decision — recorded, not taken).

### The AI seam

One `PatchOp` — `{ op: "setConnections"; connections: Connection[] }` (`model/ai.ts`; whole-list
set, like `setMeta` — per-entry diffing buys nothing at this size) — applied in `applyOp` through
`pruneConnections`, so an id the model misremembered degrades to no arrow, never a crash. The
catalog carries one paragraph under the artifact contract teaching the shape and when to reach for
it instead of a `flow` diagram.

There is deliberately no authoring tool behind it yet: the model never sees element ids at
authoring time — `zElement` (`services/core/ai/schema.ts`) carries no id, and stamping happens at
write (`contentWithElementIds` via the write path) — so a generation cannot aim an arrow at an
element by id, not even one it authored this turn. AI-authored connections wait on an id-exposing
inspect surface plus a catalog tool of their own; the protocol seam (the op, the prune, the
catalog text) is in place for when that lands.

### Analytics

`connection_created` in `model/analytics.ts`: `{ from_type, to_type, to_datum: boolean,
cross_section: boolean }` — types and booleans, no content — captured at the one editor command
seam that writes a connection. `connection_deleted` carries `{ cross_section }`. AI-authored ones
would be the server's to count via the existing generation events, per the
emits-what-only-it-knows rule.

## Pins

`canvas/render/__tests__/connect.test.ts`: ends resolve by element id, so an arrow follows a moved
element; a datum end lands on the datum region and falls back to the element; one unresolved end
renders nothing; the `ref:` region answers `inRegion` along the route and not beside it;
cross-section ends resolve on the stage; `parseTarget` ignores `ref:`; `asContent` round-trips
connections and drops an empty list; prune drops only entries whose end is gone; `skipPinned`
drops a connection into a pinned section. `canvas/render/__tests__/connect.dom.test.ts`: a
one-page section gets the ref command on its page; ends split across pages draw on neither; no
connections means byte-identical pages. The eval posture is an invariant: the corpus carries no
connections, so `eval:shots` stays byte-identical — connection rendering is pinned by its own
tests, never by corpus edits. The connect gesture itself is manual QA territory, per the
established no-Solid-harness convention.

## Not taken, and why

Alignment guides (drag-time "snap to that card's edge" chrome looks adjacent but is a different
animal: ephemeral editor state computed from regions during a gesture, never stored, never
rendered outside the editor, needing drag-loop integration in `editor/core/dnd.ts` rather than a
model contract; when built, it will read the same regions this feature reads, which is the only
relationship). Layout-affecting constraints (the fence; existing layout vocabulary covers the two
real cases). A connector element (box-less content does not belong in the tree). Cross-page arrows
drawn as split stubs (wrong ink; both-ends-or-nothing is honest). Endpoint re-binding when a
referenced element is duplicated (fresh ids are the contract that keeps comments sane; same here).
A phone aiming gesture (its own decision). Labels riding the arrow (a text chip mid-route is real
scope — wants the connection bar to grow an inline label field; deferred until the bare arrow
proves out). Waypoint editing / manual routing (Figma-grade connector UX; the elbow router first,
evidence later). An AI connect tool (blocked on ids being visible to the model — see the AI seam
above).
