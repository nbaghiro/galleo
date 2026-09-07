# Engine round: six generic capabilities

> The final-state record of items 16, 5, 10, 18 and 17 of [`engine-gaps.md`](../planning/engine-gaps.md),
> plus the table retrofit that makes item 4's track sizing visible. Autofit (item 3) has its own
> record in [`autofit.md`](autofit.md). Every change here is generic: a capability of the box model
> or the command stream, never a feature hard-coded for one element. The fuller rationale per item
> lives in `engine-gaps.md`; this is the compact record of what each behavior is and the decision
> behind it.

## Main-axis distribution (item 10)

`EngineNode.distribute?: "between" | "around" | "evenly"` (`canvas/engine/node.ts`). Read by the
positions pass in `canvas/engine/layout.ts` via `spread()`, for flow children on the main axis,
when leftover space exists; it overrides the `alignX`/`alignY` main-axis offset by spreading the
gaps instead. A `fit`-sized main axis has no leftover and distributes nothing. Floats are
unaffected. `container` exposes it as a `justify` control
(`canvas/elements/composite/container.ts`): `center`/`end` map to alignment and the spread values
map to `distribute`, one field, so the two can never contradict.

## Image intrinsic size (item 5)

`MediaItem` always carried `width`/`height`; they used to be dropped at pick time. Now:

- `ImageLeaf.natural?: { w, h }` (`canvas/engine/node.ts`); `intrinsicWidth` returns `natural.w`
  for an image leaf (clamped as text is) instead of 0.
- The media element stores the picked source's pixel size as `dims`
  (`canvas/elements/media/element.ts`) and derives its aspect from it when the author has not set
  one; `natural` is fed from `dims` when the aspect is the natural one.
- The write seam is `ElementSpec`'s `dimsKey` on media controls (`canvas/elements/spec.ts`): the
  control writes `{ w, h }` to the named sibling key alongside `src`
  (`editor/panels/SharedControlFields.tsx`), and clears it when the size is unknown rather than
  keeping the previous picture's ratio. A URL typed by hand enriches on commit via `probeImage`
  (`editor/core/media.ts`) — no async layout, no engine loading; a URL that never loads keeps the
  old behavior.

## Shared track sizing: grid (item 4)

The one structural solver change, kept inside the existing three passes.

- `EngineNode.direction` includes `"grid"`, with `columns` and optional `rowGap` (main `gap` is
  the column gap). Children fill row-major via `placeGrid` (`canvas/engine/layout.ts`).
- **Width pass**: one `Span` per column track from its single-span members (`fixed` → the max
  fixed; any `grow` member → grow; else `fit` of the max member intrinsic, clamped), then
  `distribute` across the content width minus column gaps, exactly as a row does. Every member of
  a column gets the column's width.
- **Height pass**: per row, cross height is the tallest member (the row logic applied per chunk);
  `grow`-height members stretch to their row.
- **Positions**: row-major, column gap on x, `rowGap ?? gap` on y, with the row's own
  `mainOffset`/`spread` applied to its tracks so `distribute` and alignment work in a grid too.
- O(n), no new pass, no wrapping decisions: the column count is the element's, as ever.
- **Spanning cells are supported** (added after the round): `EngineNode.span` takes that many
  consecutive tracks, `spanOf` clamps it to the column count, a spanning cell's width is its
  tracks plus the gaps between them, and only single-span members size a track.
- There is **no palette-visible grid element**; grid is engine vocabulary.
- **The consumer that makes it real**: `canvas/elements/table/table.ts` composes a
  `direction: "grid"` node, so columns size to content — the old `percent(1 / cols)` sizing is
  gone. This moved the corpus for table sections, deliberately.

## Sub-element hit geometry (item 16)

- `Region.shape?: { kind: "poly"; points: [number, number][] }` (`canvas/engine/node.ts`), in the
  same coordinates as `box`. Absent means the rect, as before.
- `SurfaceLeaf.regions?: (box) => Region[]`, a pure sibling of `paint`, called by `emit` when
  present, results appended after offsetting into stage space. The surface owns its ids.
- Id grammar in `model/artifact.ts` beside the `hit:` grammar: `datumRegionId(elId, i)` and
  `parseDatumRegion` (`datum:<el>:<i>`). `parseTarget` ignores them, so selection never sees one.
- The chart element reports per-datum regions (bars, wedge polygons approximated at the wedge's
  arc, points) from the same geometry it paints (`canvas/elements/chart/element.ts`).
- **Consumers, both directions**: hovering a chart datum on canvas highlights its row in the open
  `DataEditor` (`editor/panels/DataEditor.tsx`, sharing the `datum` signal in
  `editor/core/store.ts`), hovering a row outlines the datum on canvas, and clicking a datum opens
  the data editor (`editor/Canvas.tsx`). Datum regions also complete the armed connect gesture, so
  a connection can target a specific mark. Hit-testing is `inRegion` — ray-cast point-in-polygon
  when the region carries a shape, the box otherwise; element selection semantics are unchanged.
- Regions are deliberately not trimmed by clips: content a bounded box clipped away must stay
  selectable in the editor, so a viewer-side consumer that wants paint-accurate hits filters by
  its own rules.
- **Not taken**: diagram connectors remain unaddressed (cells already have regions).

## Reading order and decoration (item 18)

Verification showed flow emit order is already tree order, which reads correctly; the out-of-order
content is floats. So the design is honesty about decoration, not a reorder:

- `emit` marks commands from negative-z floats `decor: true` (`canvas/engine/layout.ts`) —
  negative z is already defined as decoration in `canvas/engine/node.ts`.
- The DOM backend sets `aria-hidden="true"` on decor commands (`canvas/render/backends.ts`), and
  continues to leave nameless anchors out of the a11y tree as the interactivity work established.
- `scripts/__tests__/reading-order.test.ts` asserts, over corpus sections, that the sequence of
  text commands equals the tree's text order, pinning the invariant so a future emit change cannot
  silently scramble browse order.

No geometry changed; the corpus did not move.

## Pinned sections (item 17)

- `Section.pinned?: boolean` (`model/artifact.ts`), a member of `SECTION_SHELL_EQUAL` — the shell
  equality must carry it, or edits to it never reach the row (the recorded silent-drop hazard).
- Honored by continuous playback only: `paintSectionStack` (`canvas/render/backends.ts`) takes a
  `pinned` option, honored only when `profile.kind === "continuous"`, and renders a pinned
  section's layer in flow with `position: sticky; top: 0` at `PINNED_Z`, above the absolutely
  positioned sibling layers; subsequent layers keep their computed tops (an in-flow block
  occupying its own slot displaces nothing that is absolutely placed).
- A pinned section is exempt from windowing eviction: a nav bar must exist while stuck, however
  far the reader has scrolled past its slot.
- Paged formats and export ignore it entirely (the link-on-PNG pattern: explicit ignore — paged
  has no scroll to stick against).
- The editor renders a pinned section in place, so its geometry stays the one the author is
  arranging, and authors it through the "Pin to top" toggle in `SECTION_CONTROLS`
  (`canvas/elements/spec.ts`), shown only for continuous profiles
  (`editor/panels/SectionLayoutPopup.tsx`). A pinned section is chrome, so the artifact cover
  comes from the first unpinned section.
- **Not taken**: pinning is not taught to the AI — the element catalog carries nothing for it.
