# Planning — the grid, finished

> Item 4 of [`engine-gaps.md`](engine-gaps.md) is half-built: the solver has shared track sizing
> (`direction: "grid"`, landed with [`engine-round.md`](engine-round.md)) and the table sits on it,
> but nothing an author or the model can write reaches it. This doc plans the other half: the
> container speaks grid, the editor can build and drop into one, the AI is taught when to reach for
> it, and a spanning cell exists. Status: planned, nothing built.

Companion docs: `engine-gaps.md` (item 4's rationale), `engine-round.md` (what the solver half
built and what it deliberately deferred), `container-merge.md` (why there is exactly one layout
container, which is the constraint this plan works inside), `rendering.md`.

## Where item 4 stands

Built (commit ca89e32, refined by 5d3992f):

- `EngineNode.direction` takes `"grid"`, with `columns` and `rowGap` (`node.ts:168`). Children fill
  row-major as a flat list — no new addressing, no path changes, which answers the inventory's open
  question about grid addresses: flat index k is column `k % cols`, row `floor(k / cols)`.
- Width pass: one shared `Span` per column via `columnSpan` (`layout.ts:145`), solved by the same
  `distribute()` a row uses. A fixed/percent member pins its track; a grow member stretches it;
  otherwise the track fits its widest member. Height pass: per-row cross heights, grow members
  stretched to their row. Positions: row-major, `gap` on x, `rowGap ?? gap` on y. O(n), three
  passes, no wrapping.
- `intrinsicWidth` answers for grids; `skeletonize` carries `columns` (`spec.ts:309`); floats,
  clip, opacity, rotation all compose through it.
- One consumer: `table.ts:135`, columns sized to content.
- Tests: `engine/__tests__/grid.test.ts`, plus baseline/layout coverage.

Not built, and the cost today:

- **`container` speaks only `row | col`** (`FLEX_DIRECTION`, `model/elements.ts:67`). A card grid
  wider than one row is authored as stacked rows, and stacked rows share no tracks: column three of
  row one lines up with column three of row two only by luck. The `aligns-to-a-grid` check
  (`fit-checks.ts:163`) grades an outcome only the table can currently achieve.
- **The model cannot ask for a grid.** `SECTION_RULES` tells the writer to keep a deck's people in
  ONE row precisely because a 2×N arrangement was unreliable; on doc/web, where a taller grid is
  explicitly allowed, it comes out as unaligned stacked rows.
- **No spanning cells** (deferred and recorded in `engine-round.md`): a featured card cannot take
  two tracks, a merged table header cannot exist.
- `four-up` is the widest nameable row (`LAYOUT_PRESETS`); five or six parallel items have no
  aligned form at all.

## What this is not

- **Not engine-level wrapping.** The column count is always the element's decision; the engine
  fills the count it is told. This stays the recorded non-goal.
- **Not rowSpan.** No consumer asks for it, it breaks the row-major flat-list addressing that costs
  us nothing today, and every layout named above needs only column spans.
- **Not named track templates** (a grid-template-columns analogue). Track sizing from members
  (fixed/grow/fit) already expresses pinned, stretchy and content-sized tracks; a second vocabulary
  for the same outcomes is surface without power.
- **Not cross-section alignment.** Labels lining up across sections is item 7 (cross-node
  references), not this.

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
responsive stacking already does (`unfraction`, `container.ts:58`): in a grid container, tracks own
widths, members never do. The engine behaviour is unchanged.

Third decision: **phones.** A grid container under `splitMinWidth` stacks to a single column, the
same rule a row already follows (`stacksAtWidth`, `container.ts:63`). One rule for both, no new
breakpoint policy.

## Phase A — the authorable grid

All changes land in the files that own each concept; no new source files.

- `model/elements.ts` — `FLEX_DIRECTION` gains `"grid"`. Audit the consumers of `FlexDirection`:
  `container.ts` (extended below), `ops.ts` `wrapWith`/`groupWith` (stay `row | col`; wrapping two
  elements never produces a grid), `dnd.ts` (below), the AI catalog enum (Phase C).
- `canvas/elements/composite/container.ts` — `ContainerData.columns?: number`. `bare` and
  `surfaced` build `direction: "grid"`, `columns`, `gap`/`rowGap` from the same gap the direction
  already uses, children through `unfraction`. `justify` is inert on grids (tracks distribute the
  width; there is no leftover main axis) and its control stays row-gated. Controls: the
  `direction` segmented control gains Grid (icon `grid`); `columns` slider 2–6, step 1,
  `visibleWhen` grid. Phone: stacked grids compose as `col`, per decision three.
- `canvas/elements/ops.ts` — `insertChild` strips widths for grid parents the way it does for rows
  (a dropped element must not pin a track); `fixContainer` leaves grids alone (no width
  renormalize — there are no widths).
- `editor/core/dnd.ts` — `groupAxis` learns grid; `childBoxes` for a grid sorts by reading order
  (y band, then x) and the insertion indicator places before/after the nearest cell. Insertion
  index = position in that order, which is the row-major storage order, so the drop lands where
  the indicator points by construction.
- `model/artifact.ts` — `blockOf`: a grid container with more than one child reads as `cards`,
  the same answer a multi-child row gives, so a lent shape names it correctly.
- `model/authoring.ts` — `grid(cols, ...children)`, sugar over the container the way `row`/`col`
  are. The DSL says what the engine can do; templates and designs compose with it.
- `canvas/elements/compose.ts` — a Grid entry in `PRESETS` (four cards, two columns), so the
  palette makes it discoverable.
- Tests: container spec (grid node shape, width stripping, phone stacking, columns clamp), ops
  (insert strips widths), dnd (reading-order boxes, insertion index), artifact (`blockOf`),
  authoring round-trip. Engine tests exist and do not move.
- Corpus statement: **unchanged.** Nothing existing composes a grid until Phase C retrofits do.

## Phase B — column spans

The engine half, plus the one editor affordance that makes it usable. AI teaching waits for C.

- `model/geometry.ts` — `ElementLayout.span?: number` (columns consumed, ≥2; absent = 1). Rides
  the same field `pin` and `dock` ride; `applyLayout` (`compose.ts:166`) copies it to the node.
- `canvas/engine/node.ts` — `EngineNode.span?: number`, meaningful only under a grid parent.
- `canvas/engine/layout.ts` — row-major fill advances by span; a spanning member's width is its
  spanned tracks plus the gaps between them. **Track sizing ignores spanning members**: tracks size
  from single-track members only, spanners take what the tracks yield. This is the rule that keeps
  `distribute()` and O(n) untouched; the honest cost is that a grid whose column is populated
  _only_ by spanners sizes that track as empty, which is visible and fixable by the author, not a
  silent wrong answer.
- Editor: a Span slider (1 to the parent's column count) on the layout popover for children of
  grid containers — the same surface pin offsets live on.
- Tests: engine (fill advance, width math across gaps, sizing exclusion, span clamped to columns,
  span 1 = today), compose (layout.span through), one editor control test.
- Corpus statement: unchanged (span is opt-in, nothing sets it).

## Phase C — the consumers that make it real

- `services/core/ai/prompts/catalog.ts` — the container entry's `direction` enum picks up grid
  from `FLEX_DIRECTION`; its desc says when (three-plus parallel items that overflow one row, or
  any 2×N arrangement); a `columns` field entry, grid-only. `zElementLayout` gains `span` with a
  describe, `.catch(undefined)` like its siblings.
- `SECTION_RULES` (`prompts/system.ts`) — the people-grid rule splits honestly: a deck keeps one
  horizontal row (the slide-height argument still holds); doc/web are told to use a grid container
  with `columns` rather than stacked rows.
- `services/core/templates.ts` and `services/core/designs.ts` — retrofit the arrangements that
  fake grids with stacked rows (team grids, galleries, the `designSection` cards case when a
  design's count exceeds one row). This is the table-retrofit move from `engine-round.md`: the
  corpus for those sections moves, deliberately, and the round's `eval:shots` diff is read rather
  than assumed. `check:copy` runs over every new prompt line.
- `quality.ts` needs no change: `rowIssue` is gated on `direction === "row"` and grids carry no
  member widths to misdeclare.
- Corpus statement: **moves for retrofitted sections only**, identified by name before the diff is
  read.

## What stays still

Addressing, regions, collab ops, undo, exports and fragmentation all operate on flat children and
flat commands, and a grid's children are a flat list: none of them change in any phase. `zSection`
already accepts what Phase C teaches, since `data` is open-keyed. Autofit scales solved boxes and
is direction-blind. `LAYOUT_PRESETS` and the beat vocabulary stay untouched: a grid arrives inside
a section column as a `cards` block, and widening the section-level shape language is its own
decision for a generation round, not this one.

## Sequencing and gates

A, then B, then C; each lands green (typecheck, lint, vitest, `check:*`, build) on its own. A and
B are corpus-neutral and assert it; C names its moving sections first and reads the `eval:shots`
diff. If B stalls, C proceeds without spans (the catalog line for `span` is the only C item that
depends on it).
