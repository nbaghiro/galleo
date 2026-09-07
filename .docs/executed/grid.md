# The grid: a container direction

> The unified `container` speaks grid: `direction: "grid"` lays its children into shared-width
> tracks filled row-major, `columns` sets the track count, and a child can span columns. The editor
> builds and drops into grids, the authoring DSL composes them, and the AI is taught when to reach
> for one. Deliberately a direction of the one droppable container, never a second layout system.

Companion docs: [`engine-gaps.md`](../planning/engine-gaps.md) (item 4's rationale),
[`engine-round.md`](engine-round.md) (the solver half and what it deliberately deferred),
[`container-merge.md`](container-merge.md) (why there is exactly one layout container,
which is the constraint this design works inside), `../rendering.md`.

## The engine half

- `EngineNode.direction` takes `"grid"`, with `columns` and `rowGap` (`canvas/engine/node.ts`).
  Children fill row-major as a flat list — no new addressing, no path changes: flat index k is
  column `k % cols`, row `floor(k / cols)`.
- Width pass: one shared `Span` per column via `columnSpan` (`canvas/engine/layout.ts`), solved by
  the same `distribute()` a row uses. A fixed/percent member pins its track; a grow member
  stretches it; otherwise the track fits its widest member. Height pass: per-row cross heights,
  grow members stretched to their row. Positions: row-major, `gap` on x, `rowGap ?? gap` on y.
  O(n), three passes, no wrapping. `placeGrid` computes the row-major placement and `trackMembers`
  groups members per track for sizing.
- `intrinsicWidth` answers for grids; `skeletonize` carries `columns` (`canvas/elements/spec.ts`);
  floats, clip, opacity, rotation all compose through it.
- Consumers: the table (columns sized to content) and the grid container below.
- Tests: `canvas/engine/__tests__/grid.test.ts`, plus baseline/layout coverage.

## The decision: a direction, not an element

| option                                            | for                                                                                                                                                                       | against                                                                                                                                                         |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `container` gains `direction: "grid"` + `columns` | mirrors the engine exactly; keeps the one-droppable-container rule from `container-merge.md`; every container affordance (surface, align, drop, collapse) works unchanged | `FlexDirection` is no longer strictly flex; a `columns` key is meaningless on rows                                                                              |
| a new `grid` element                              | clean data shape                                                                                                                                                          | reintroduces the second droppable container the merge removed; duplicates surface/align/drop handling; new palette entry, new catalog entry, new tier questions |

The engine already models grid as a direction, and the container's job description ("everything
that holds arbitrary children") already covers it. The `columns` key is guarded by `visibleWhen`
the same way `justify` already hides off rows. A new element loses.

Second decision: **track ownership of widths.** In the engine, a percent-width member pins its
track — correct for hand-built nodes (the table leans on grow/fit members). But a container child
carrying `width: {pct}` is row vocabulary, and a row switched to grid would silently pin stale
tracks at 33%. The container therefore strips child widths when composing a grid, exactly as
responsive stacking already does (`unfraction`, `canvas/elements/composite/container.ts`): in a
grid container, tracks own widths, members never do. The engine behaviour is unchanged.

Third decision: **phones.** A grid container under `splitMinWidth` stacks to a single column, the
same rule a row already follows (`stacksAtWidth`, `container.ts`). One rule for both, no new
breakpoint policy.

## The authorable grid

- `model/elements.ts` — `FLEX_DIRECTION` is `["row", "col", "grid"]`. `wrapWith`/`groupWith` in
  `canvas/elements/ops.ts` stay `row | col`: wrapping two elements never produces a grid.
- `canvas/elements/composite/container.ts` — `ContainerData.columns` (`gridCols` clamps it 2–6).
  `bare` and `surfaced` build `direction: "grid"`, `columns`, `gap`/`rowGap` from the same gap the
  direction already uses, children through `unfraction`. `justify` is inert on grids (tracks
  distribute the width; there is no leftover main axis) and its control stays row-gated. The
  `direction` segmented control carries Grid; the `columns` slider (2–6, step 1) shows only when
  `direction === "grid"`. On phones a stacked grid composes as `col`, per decision three.
  `gridColumnsOf` exports the count for the editor.
- `canvas/elements/ops.ts` — `insertChild` strips widths for grid parents the way it does for rows
  (a dropped element must not pin a track; `isGrid` gates it), and width renormalization leaves
  grids alone — there are no widths to renormalize.
- `editor/core/dnd.ts` — grid children sort by reading order (y band, then x) via `gridColumnsOf`,
  and the insertion index is the position in that order, which is the row-major storage order, so
  a drop lands where the indicator points by construction.
- `model/artifact.ts` — `blockOf`: a grid container with children reads as `cards`, the same
  answer a multi-child row gives, so a lent shape names it correctly.
- `model/authoring.ts` — `grid(cols, ...children)`, sugar over the container the way `row`/`col`
  are. The DSL says what the engine can do; templates and designs compose with it.
- `canvas/elements/compose.ts` — a Grid entry in `PRESETS` (four cards, two columns), so the
  palette makes it discoverable.
- Tests: `canvas/elements/__tests__/grid-container.test.ts` (grid node shape, width stripping,
  phone stacking, columns clamp) beside the ops/dnd/artifact/authoring coverage.

## Column spans

- `model/geometry.ts` — `ElementLayout.span` (grid parents only: columns consumed, ≥2; absent
  = 1). It rides the same field `pin` and `dock` ride; `applyLayout`
  (`canvas/elements/compose.ts`) rounds it onto the node, and `EngineNode.span`
  (`canvas/engine/node.ts`) is meaningful only under a grid parent.
- `canvas/engine/layout.ts` — the row-major fill advances by span; a spanning member's width is
  its spanned tracks plus the gaps between them. **Track sizing ignores spanning members**: tracks
  size from single-track members only, spanners take what the tracks yield. This is the rule that
  keeps `distribute()` and O(n) untouched; the honest cost is that a grid whose column is
  populated _only_ by spanners sizes that track as empty, which is visible and fixable by the
  author, not a silent wrong answer.
- Editor: a "Column span" row (`editor/panels/RightPanel.tsx`) for children of grid containers,
  clamped 1 to the parent's column count.
- AI: `zElementLayout.span` (`services/core/ai/schema.ts`), with a describe teaching the featured
  card spanning the full first row of a 2-column grid, `.catch(undefined)` like its siblings.

## The AI half

- `services/core/ai/prompts/catalog.ts` — the container entry's `direction` enum picks grid up
  from `FLEX_DIRECTION`, with a `columns` field entry, grid-only.
- `SECTION_RULES` (`services/core/ai/prompts/system.ts`) — the people-grid rule splits honestly: a
  deck keeps a group of people in one horizontal row (the slide-height argument holds); on doc/web
  more than four people go in one `container` with `"direction": "grid"` and `columns` set, never
  separate stacked rows, whose columns drift out of line.
- `services/core/templates.ts` and `services/core/designs.ts` compose real grids where an
  arrangement exceeds one row (team grids, galleries, the `designSection` cards case), instead of
  faking them with stacked rows that share no tracks.
- `quality.ts` needs no grid case: `rowIssue` is gated on `direction === "row"` and grids carry no
  member widths to misdeclare.

## Non-goals

- **Not engine-level wrapping.** The column count is always the element's decision; the engine
  fills the count it is told. This stays the recorded non-goal.
- **Not rowSpan.** No consumer asks for it, it breaks the row-major flat-list addressing that
  costs us nothing today, and every layout the grid serves needs only column spans.
- **Not named track templates** (a grid-template-columns analogue). Track sizing from members
  (fixed/grow/fit) already expresses pinned, stretchy and content-sized tracks; a second
  vocabulary for the same outcomes is surface without power.
- **Not cross-section alignment.** Labels lining up across sections is cross-node references
  (engine-gaps item 7), not this.

## What stays still

Addressing, regions, collab ops, undo, exports and fragmentation all operate on flat children and
flat commands, and a grid's children are a flat list: none of them change. `zSection` accepts
grid data because `data` is open-keyed. Autofit scales solved boxes and is direction-blind.
`LAYOUT_PRESETS` and the beat vocabulary are untouched: a grid arrives inside a section column as
a `cards` block, and widening the section-level shape language is its own decision for a
generation round, not this one.
