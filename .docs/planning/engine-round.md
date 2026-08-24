# Planning — engine round: five gaps to execution depth

> The executable specs for items 16, 5, 10, 18 and 17 of [`engine-gaps.md`](engine-gaps.md), plus
> the table retrofit that makes item 4's track sizing visible. Autofit (item 3) is specified in
> [`autofit.md`](autofit.md) and executes in the same round. Every engine change here is generic:
> a new capability of the box model or the command stream, never a feature hard-coded for one
> element.
>
> Status: all three workstreams executed; the round's CI `eval:shots` diff is still to be read.
> Three sequential workstreams (file overlap in `node.ts`,
> `layout.ts`, `backends.ts` forbids parallel execution): W-A solver mechanics (10, 5, 4),
> W-B regions and output semantics (16, 18, 17), W-C autofit per its own doc.

Companion docs: `engine-gaps.md` (the inventory and each item's rationale), `autofit.md`,
`rendering.md`, `interactivity.md` (the affordance and live-overlay machinery item 16 feeds).

## The round's eval posture

Three shipped initiatives proved themselves with "corpus unchanged". This round deliberately ends
that: item 4 re-sizes every table's columns and autofit rescales overflowing sections. The CI
`eval:shots` diff is expected to move and must be read deliberately: autofit's phase C puts
`fitScale` on `SectionFit` so fitted sections are identifiable, and the table change is visually
obvious. Nothing else in the round may move a corpus number; W-B must leave geometry untouched.

---

## Item 10: main-axis distribution

`EngineNode.distribute?: "between" | "around" | "evenly"`. Read in `layoutPositions` for the main
axis, flow children only, when leftover space exists; overrides `alignX`/`alignY` main-axis offset
by spreading the gaps instead. A `fit`-sized main axis has no leftover and distributes nothing.
Floats unaffected. `container` gains a `justify` control (segmented, main axis) mapping to it, and
one catalog line teaches it.

Tests: engine (between/around/evenly spacing math for rows and columns, no-op under fit, floats
excluded), one container spec test, one canonical-scale check on the control copy.

## Item 5: image intrinsic size

`MediaItem` already carries `width`/`height`; today they are dropped at pick time.

- `ImageLeaf.natural?: { w: number; h: number }`; `intrinsicWidth` returns `natural.w` for an
  image leaf (clamped as text is), instead of 0.
- Media elements store `{ w, h }` from the picked item (one data field, e.g. `dims`), and derive
  their aspect from it when the author has not set one. The picker write path already enriches
  sibling keys (the `posterKey` precedent), so this is the same pattern.
- A URL typed by hand enriches on commit: the inspector control probes the image once and writes
  `dims` alongside `src`. No async layout, no engine loading; a URL that never loads simply keeps
  today's behavior.

Tests: engine intrinsic-width for image leaves; element-level derived aspect (set, absent, absurd
values); the enrichment write.

## Item 4: shared track sizing (grid)

The one structural solver change, kept inside the existing three passes.

- `EngineNode.direction` gains `"grid"`, with `columns: number` and optional `rowGap` (main `gap`
  is the column gap). Children fill row-major.
- **Width pass**: build one `Span` per column from its members (`fixed` → the max fixed; any
  `grow` member → grow; else `fit` of the max member intrinsic, clamped), then `distribute` across
  the content width minus column gaps, exactly as a row does. Every member of a column gets the
  column's width.
- **Height pass**: per row, cross height is the tallest member (the row logic applied per chunk);
  `grow`-height members stretch to their row.
- **Positions**: row-major, column gap on x, `rowGap ?? gap` on y.
- O(n), no new pass, no wrapping decisions (the column count is the element's, as ever).
- **Spanning cells are out of scope** and recorded; so is a palette-visible grid element.
- **The consumer that makes it real**: `table.ts` drops `percent(1 / g.cols)` for a grid node, so
  columns size to content. This moves the corpus for table sections, deliberately.

Tests: engine (column width = max member intrinsic across rows; fixed and grow columns; row cross
heights independent; gaps both axes; degenerate 1-column and empty), table spec (short/long column
asymmetry actually asymmetric), plus the existing table tests re-baselined knowingly.

## Item 16: sub-element hit geometry

- `Region.shape?: { kind: "poly"; points: [number, number][] }` (stage coordinates, like `box`).
  Absent means the rect, as today.
- `SurfaceLeaf.regions?: (box: Rect) => Region[]`, a pure sibling of `paint`, called by `emit`
  when present, results appended after offsetting into stage space. The surface owns its ids.
- Id grammar in `model/artifact.ts` beside the `hit:` grammar: `datumRegionId(elId, i)` and
  `parseDatumRegion` (`datum:<el>:<i>`). `parseTarget` ignores them, so selection never sees one.
- **The chart element reports per-datum regions** (bars, wedge polygons approximated at the wedge's
  arc, points) from the same geometry it paints.
- **Consumer, both directions**: hovering a chart datum on canvas highlights its row in the open
  `DataEditor`, and hovering a row outlines the datum on canvas (an overlay ring from the datum
  region, shape-aware). Clicking a datum opens the data editor. Hit-testing for datum hover is
  point-in-polygon with rect fallback; element selection semantics are unchanged.
- Diagrams: connectors stay unaddressed in this round (cells already have regions); recorded.

Tests: model grammar round-trip; engine (surface regions offset and appended, absent is absent);
chart regions (count and rough geometry per chart type family); point-in-polygon unit tests.

## Item 18: reading order and decoration

Verified: flow emit order is already tree order, which reads correctly; the out-of-order content is
floats. So the fix is honesty about decoration, not a reorder:

- `emit` marks commands from negative-z floats `decor: true` (a new optional command field:
  negative z is already defined as decoration in `node.ts`).
- The DOM backend sets `aria-hidden="true"` on decor commands, and continues to leave nameless
  anchors out of the a11y tree as the interactivity work established.
- A reading-order test utility asserts, over corpus sections, that the sequence of text commands
  equals the tree's text order, pinning the invariant so a future emit change cannot silently
  scramble browse order.

No geometry changes; the corpus must not move.

## Item 17: pinned sections (sticky)

- `Section.pinned?: boolean`. **Must** be added to `SECTION_SHELL_EQUAL` (`model/artifact.ts`), or
  edits to it never reach the row (the recorded silent-drop hazard).
- Honored by continuous playback only (present continuous + publish): `paintSectionStack` renders a
  pinned section's layer in flow with `position: sticky; top: 0`, z above sibling layers, instead
  of absolutely positioned; subsequent layers keep their computed tops (an in-flow block occupying
  its own slot displaces nothing that is absolutely placed).
- A pinned section is exempt from windowing eviction: a nav bar must exist while stuck, however far
  the reader has scrolled past its slot.
- Paged formats and export ignore it entirely (the `link`-on-PNG pattern: explicit ignore).
- The editor renders normally and authors it through a "Pin to top" toggle in the section controls
  (the `SECTION_CONTROLS` + adapter pattern). Not taught to the AI in this round.

Tests: ops/model (shell equality carries it), backends.dom (pinned layer is sticky and in flow,
others absolute, eviction exemption), present.dom (continuous honors, paged ignores).

## Sequencing and gates

W-A (10 → 5 → 4), then W-B (16 → 18 → 17), then W-C (autofit per `autofit.md` phases A–C). Each
workstream lands independently green: typecheck, lint, full vitest, all `check:*` guards, build.
The corpus statement per workstream: W-A moves tables only; W-B moves nothing; W-C moves
overflowing paged sections only, reported via `fitScale`.
