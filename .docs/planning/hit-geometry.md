# Planning — hit geometry, finished

> Item 16 of [`engine-gaps.md`](engine-gaps.md) is half-built, the same way grid was before
> [`grid.md`](grid.md): the mechanism landed, the consumers did not. This doc records what exists,
> what is missing, and the round that closes it. **Status: built 2026-09-05.** Deviations from the
> plan as written: (1) diagram coverage is the seven types whose arranges hold their geometry
> (venn, target, funnel, pyramid, matrix, cycle, hub) — the tree- and flow-laid types draw only
> connectors and stay mute, recorded rather than forced; (2) the viewer tooltip is Solid chrome in
> `ui/present.tsx` (which publish shares via `PresentSurface`) rather than plain DOM in the paint
> layer — the widget never imports `@ui`, so the constraint held anyway — and its pin is the
> `viewerDatumAt`/`datumLabel` helpers plus manual QA, since the repo has no Solid render harness;
> (3) hover is fine-pointer only: in paged Present a coarse tap advances the deck, so a
> press-for-tooltip would fight the gesture — the coarse affordance is recorded as open, not
> shipped broken; (4) `fragment` reports page windows (`FragmentPage.top/bottom`) instead of a
> parallel regions parameter, and `regionWindow` carries regions onto pages beside it.

## What already exists (verified against the tree, 2026-09-05)

The entry's "Shape" and its open question are both answered in code:

- `Region.shape?: { kind: "poly"; points }` with `inRegion()` doing the point-in-polygon test
  behind a cheap bounding-box gate (`canvas/engine/node.ts:275-297`).
- `SurfaceLeaf.regions(box)` — a surface reports its own parts; emit places them into the region
  stream and rotates them with the node (`canvas/engine/layout.ts:569-572`). The open question
  ("do surfaces report their own regions?") was decided yes.
- `rotateRegion()` turns a region's polygon about the rotation centre and keeps the box as the
  bounding box, so rotated elements hit on their turned outline while selection chrome stays
  axis-aligned (`layout.ts:637`). Item 6's rotation prerequisite is closed.
- Charts produce one region per painted mark: `chartSpans` yields per-mark boxes plus polygon
  points where the mark is not a rect, addressed `datumRegionId(element, index)` — the id is the
  data-editor row, so a grouped bar's marks share one row (`canvas/elements/chart/element.ts:82`,
  `model/artifact.ts:488`).
- The editor consumes all of it: `hitTest` is shape-aware, `datumAt` picks the topmost mark
  (bubble overlap), a click on a mark selects the owning chart and opens the data editor, and
  hover syncs both ways with the data-editor rows (`editor/Canvas.tsx:475-650`,
  `editor/panels/DataEditor.tsx:141-147`). A mark is deliberately not a selection target: it names
  its owner. That decision holds for everything below.

## What is missing

1. **Diagrams report nothing.** `grep regions canvas/elements/diagram/utils.ts` finds zero. A
   diagram's labelled cells are engine nodes and already addressable, but everything painted
   through `decorate()` — venn circles, target rings, funnel bands, matrix quadrants, connectors —
   is one mute surface. A press on the venn overlap or the bullseye hits nothing.
2. **The viewer side ignores datum regions entirely.** No per-datum hover, tooltip or press in
   Present or publish. Worse, `viewerToggleAt` tests raw boxes rather than `inRegion`
   (`canvas/elements/ops.ts:717-722`), so even existing `hit:` affordances ignore shape and
   rotation. And Present recovers regions from paginated commands rather than from emit
   (`rotateRegion`'s own comment), so surface-reported regions likely never reach it — to be
   confirmed first thing in W2, it decides how the regions travel.
3. **The queued initiatives are still queued.** Chart/diagram draw-on (motion) and per-datum
   playback affordances wanted per-mark geometry; `chartSpans` now exposes it, but nothing
   sequences or serves it. Per-datum comments want the id grammar; nothing accepts it.

## The round

### W1 — diagrams report their parts (M)

`decorate()` in `canvas/elements/diagram/utils.ts` gains the same optional regions callback the
surface leaf already carries; each diagram's `arrange` computes the geometry anyway (radii, band
polygons, quadrant boxes), so handing back shaped regions is a per-type return, not new math.
Address the item-bearing shapes with the existing `datumRegionId(element, itemIndex)` grammar —
the same row the diagram's data editor shows. Circles become polygons (24 points is plenty for a
hit test); connectors and arrows are decoration and stay mute, matching the reading-order rule
that decoration is never content. Drop the `kind === "chart"` gate in `DataEditor.tsx:141` so
diagram rows light their shapes and shapes light their rows, exactly as charts do. Pin per-family
in `diagram.test.ts` (bands, radial, quadrant: region count equals item count, a centre point of
each shape passes `inRegion`, a point between rings does not).

### W2 — the viewer side (S-M)

Three parts, smallest first. (a) `viewerToggleAt` swaps its box test for `inRegion` — one line,
and every existing `hit:` affordance becomes shape- and rotation-correct. (b) Confirm whether
surface-reported regions survive into Present's recovered set; if not, carry the emitted regions
through `sectionSlides` pages the way commands already travel (the fragment round proved the
pattern). (c) Per-datum hover in Present and publish: pointer over a mark or diagram part shows a
small tooltip naming the row's label and value, from the same resolved data the paint used. Plain
DOM in the paint layer, no framework, so the widget bundle stays clean; touch gets press instead
of hover. Instrument at the seam: one `datum_hovered` event with element type and surface, no
values.

### W3 — record what this unlocks, build none of it here (XS)

Draw-on motion sequences marks with geometry it can now read; per-datum comments need the anchor
UX and a degradation rule (an index-addressed datum moves when rows reorder — the `cm` mark
already owns that problem for text). Both become their own docs; this round only removes the
engine excuse. Update item 16's entry in `engine-gaps.md` to built-with-status, the way items 4,
6, 9 and 18 read now.

## Gates

Typecheck, lint, full vitest, `check:elements` (the new default-instance pass must stay clean as
diagrams gain regions), `eval:shots` before and after — W1 adds regions, not geometry, so the
corpus numbers must not move at all. Red-first tests per workstream; the W2 tooltip gets a
backends.dom test asserting the tooltip node exists, is `aria-hidden`, and never enters the
reading order.

## Not taken, and why

Making marks selectable: a mark names its owner, selection stays element-level — already decided
in the editor and kept. A `circle` region kind: poly at 24 points is indistinguishable at hit
resolution and keeps `inRegion` single-shape. Engine-derived regions for arbitrary paint: the
surface callback exists precisely because the engine cannot know what a renderer drew.
