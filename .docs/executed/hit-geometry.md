# Hit geometry: shaped regions for marks and diagram parts

> Every painted chart mark and every geometry-bearing diagram part reports a shaped region, so
> hit-testing is shape- and rotation-aware end to end: the editor lights data rows from marks and
> marks from rows, viewer affordances hit on real outlines, and Present and publish name a hovered
> datum. A mark is never a selection target — it names its owner, and selection stays
> element-level.

Companion docs: [`engine-gaps.md`](../planning/engine-gaps.md) (item 16),
[`grid.md`](grid.md) (the same mechanism-then-consumers shape), `../rendering.md`.

## The mechanism

- `Region.shape` carries `{ kind: "poly"; points }`, with `inRegion()` doing the point-in-polygon
  test behind a cheap bounding-box gate (`canvas/engine/node.ts`).
- `SurfaceLeaf.regions(box)` — a surface reports its own parts; `emit` places them into the region
  stream and rotates them with the node (`canvas/engine/layout.ts`). The open question ("do
  surfaces report their own regions?") was decided yes: the surface callback exists precisely
  because the engine cannot know what a renderer drew.
- `rotateRegion()` turns a region's polygon about the rotation centre and keeps the box as the
  bounding box, so rotated elements hit on their turned outline while selection chrome stays
  axis-aligned (`canvas/engine/layout.ts`).
- Charts produce one region per painted mark: `chartSpans` yields per-mark boxes plus polygon
  points where the mark is not a rect, addressed `datumRegionId(element, index)`
  (`canvas/elements/chart/element.ts`, `model/artifact.ts` — the grammar is
  `datum:<element>:<index>`). The id is the data-editor row, so a grouped bar's marks share one
  row.

## Diagrams report their parts

`decorate()` in `canvas/elements/diagram/utils.ts` takes an optional regions callback beside its
paint, with the `circlePoints` and `itemRegions` helpers; each type's `arrange` computes the
geometry anyway (radii, band polygons, quadrant boxes), so handing back shaped regions is a
per-type return, not new math. Seven diagram types report: **venn, target, matrix, cycle, hub**,
plus **funnel and pyramid** through the shared band arrange in `utils.ts` — the types whose
arranges hold their geometry. Item-bearing shapes use the same `datumRegionId(element, itemIndex)`
grammar, the row the diagram's data editor shows; circles become polygons (24 points is plenty at
hit resolution).

The tree- and flow-laid types (process, steps, timeline, roadmap, flow, org, mindmap and the rest)
stay mute: their labelled cells are engine nodes and already addressable, and what `decorate`
draws for them is connectors and arrows — decoration, never content, matching the reading-order
rule. This is a recorded scope call, not an omission.

Per-family pins live in `canvas/elements/diagram/__tests__/diagram.test.ts` (region count equals
item count, a centre point of each shape passes `inRegion`, a point between rings does not).

## The editor

`hitTest` is shape-aware, `datumAt` picks the topmost mark (bubble overlap), a click on a mark
selects the owning chart or diagram and opens the data editor, and hover syncs both ways with the
data-editor rows (`editor/Canvas.tsx`, `editor/panels/DataEditor.tsx`). `DataEditor` computes each
row's id via `datumRegionId` with no per-kind gate, so diagram rows light their shapes and shapes
light their rows exactly as charts do.

## The viewer

- `viewerToggleAt` (`canvas/elements/ops.ts`) tests `inRegion`, so every `hit:` affordance is
  shape- and rotation-correct in playback.
- Regions travel to paged surfaces: `fragment` reports page windows (`FragmentPage.top`/`bottom`
  in `canvas/engine/layout.ts`), and `regionWindow` carries a section's regions onto the pages
  beside its commands, read by `canvas/render/commands.ts` — the same travel pattern commands
  already use.
- Per-datum hover: `viewerDatumAt` and `datumLabel` (`canvas/elements/ops.ts`) feed a small
  tooltip in `ui/present.tsx` (publish shares it through `PresentSurface`) naming the hovered
  row's label and value, from the same resolved data the paint used. The tooltip is Solid chrome
  in `ui/present.tsx` rather than plain DOM in the paint layer; the widget never imports `@ui`, so
  the framework-free-bundle constraint holds anyway.
- Hover is **fine-pointer only**: in paged Present a coarse tap advances the deck, so a
  press-for-tooltip would fight the gesture. The right coarse-pointer affordance is an open
  question, not shipped broken.
- Instrumented at the seam: one `datum_hovered` event with `where`, `artifact_format` and
  `element_type`, captured on first hover per element, no values.

## What this unlocks, deliberately not built here

Draw-on motion can sequence marks with geometry it can now read; per-datum comments have the id
grammar but need their own anchor UX and a degradation rule (an index-addressed datum moves when
rows reorder — the `cm` mark already owns that problem for text). Each becomes its own doc when
taken; the region layer only removes the engine excuse.

## Not taken, and why

Making marks selectable: a mark names its owner, selection stays element-level — decided in the
editor and kept everywhere. A `circle` region kind: poly at 24 points is indistinguishable at hit
resolution and keeps `inRegion` single-shape. Engine-derived regions for arbitrary paint: the
surface callback exists precisely because the engine cannot know what a renderer drew.
