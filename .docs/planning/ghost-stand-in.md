# Planning — ghost stand-ins, consolidation

> The grey "not-yet-here" stand-in was reinvented four times, each in its own file with its own
> colors and its own idea of what a chart or a stat looks like as a ghost. Two of the four already
> read well; the AI outline ghost does not, which is where the user's report of "strangely
> positioned or unmatching ghosts" comes from. This doc records the four systems as they stand,
> the one that is worth copying, and a staged consolidation onto a single vocabulary.
> **Status: Stages 1 and 2 built 2026-09-06. Stage 1: `canvas/elements/ghost.ts` extracted,
> `canvas/render/placeholder.ts` migrated onto it, no visible change. Stage 2: colors unified
> (2a) and the AI outline ghost now draws per-kind silhouettes (2c); 2b (deleting spec.ts's ghost
> builders) was dropped, they are not dead after all. Stage 3 remains recorded as likely not-taken.
> Nothing committed.**

## The four stand-in systems (verified against the tree, 2026-09-06)

1. **Windowed-loading placeholder** (`canvas/render/placeholder.ts`). What a section paints before
   its content arrives, sized to the height the stack already reserves. Builds its stand-in from the
   digest's `kind` and `title`, so it draws the real heading over a recognizable per-kind body: a
   chart as bars on a baseline, a diagram as a row of node boxes, a stat as tiles, a table as a
   header over rows, media as a filled panel, anything else as prose. This is the one that reads
   well, because the silhouette is chosen by kind rather than derived from generic bars.

2. **`skeletonize(node, colors)`** (`canvas/elements/spec.ts:377`). Greys a real, already-composed
   node: text becomes bars (`textBars`), an image or surface leaf becomes a filled aspect panel, a
   container keeps its exact geometry and greys only its panel. Runs post-compose, so it cannot
   drift from the final layout, which is exactly what the live-build overlay wants
   (`layoutSectionSkeleton`, `commands.ts:114`). It has no idea what kind of element it is greying,
   because by the time it runs the element type is gone; a chart is just a surface leaf, so it comes
   out as a plain grey rectangle rather than bars.

3. **AI outline ghost** (`canvas/elements/blueprint.ts` +
   `layoutOutline`, `commands.ts:87`). Builds a whole fake `Section` from a guessed blueprint
   (`placeholderBlock(kind)` returns a canned `ElementInstance` per kind: a bar chart with
   `48, 62, 55, 71`, a three-step process, a two-row table), composes it through the real engine,
   then skeletonizes every column except the one holding the outline's words. Consumers:
   `app/views/generate/Board.tsx:293`, `editor/core/ai.ts:188/206`, `editor/panels/GenOverlays.tsx`.
   This is the source of the mismatch: the ghost's shape is the blueprint's guess, and the model
   frequently writes something else, so the ghost and the eventual content disagree.

4. **Palette preview art** (`previewSvg`, `canvas/elements/previews.ts`, 535 lines, hand-drawn SVG
   per type). Drawn in the insert palette tiles (`editor/panels/Insert.tsx`) and in the
   chart/diagram type pickers (`chart/element.ts:26`, `diagram/element.ts:114`). This is a separate
   concern from the three above: it is per-type illustration for a menu, not a stand-in for absent
   content, and it currently looks fine. It is listed here only so the boundary is explicit.

## The key discovery

Systems 1 and 2 answer two genuinely different questions and both answer theirs correctly:

- When the real node exists (live build), grey it (`skeletonize`). Exact geometry, cannot drift.
- When only a kind is known (windowed load), draw a per-kind silhouette (`placeholder.ts`). Honest
  about being an approximation, but recognizable.

The AI outline ghost (system 3) is in the second situation, only a kind is known, but it reaches
for a variant of the first tool: it fabricates full content, composes it, and greys it. That is why
it drifts. It should use system 1's approach, a per-kind silhouette at the column's real box, not a
greyed guess of the content.

So the consolidation is not "make everything one function." It is: extract system 1's silhouette
vocabulary into a shared home, point the AI outline ghost at it, and leave `skeletonize` for the one
case that needs exact geometry.

## Stage 1 — shared vocabulary, extracted from the best implementation (built)

`canvas/elements/ghost.ts` now holds the grey stand-in vocabulary, lifted verbatim from
`placeholder.ts` so there is no behavior change:

- `ghostColors(theme)` returning `{ bar, panel, line, ink }` (theme-derived, the mix math
  `placeholder.ts` already used).
- `ghostBar`, `ghostBox`, `ghostParagraph` primitives.
- `ghostBody(kind, colors, height)`, the per-kind silhouette switch (chart, diagram, table, media,
  stat, quote, default), keyed by a plain `kind` string so any caller can reach it.

`placeholder.ts` was migrated onto it and now defines only what is specific to the loading case: the
`heading` node that draws the real title, and `ghostNode`/`layoutPlaceholder`. It dropped its local
copies of the colors, primitives, and body switch. Typecheck, lint, `check:suppressions`,
`check:program`, `check:elements`, and the placeholder/window unit suites are green; no other file
changed, so nothing that renders today moved.

Home chosen: `canvas/elements/`, not `canvas/render/`, because two of the three real consumers of
the vocabulary (`skeletonize` in `elements/spec.ts`, the AI outline ghost in `elements/blueprint.ts`)
live in elements, and the placeholder in render can import down into elements.

## Stage 2 — one set of colors, recognizable outline ghosts (built)

Two parts shipped; a third planned part was dropped once its premise turned out to be false.

### 2a. One color source (built)

`commands.ts` had its own `ghostColorsFor(theme)` with constants that drifted from the placeholder's
(`bar: mix(surface, ink, 0.2)` and `panel: surface`, versus `ghostColors`'s `0.16` and
`mix(surface, ink, 0.08)`). `ghostColorsFor` is gone; its three call sites (`layoutOutline`,
`layoutSectionSkeleton`, and the slide skeleton) now call `ghostColors(theme)` from `ghost.ts`.
`ghostColors` returns a superset of what `skeletonize` reads (it adds `ink`), so the shared value
satisfies `spec.ts`'s local `GhostColors` type by structural typing, and `spec.ts` did not need to
change. The visible effect is that skeleton and outline ghost panels now use the placeholder's
slightly more visible panel tone (`mix(surface, ink, 0.08)` rather than the near-invisible
`theme.surface`), which is the same tone the user judged good on the placeholder.

### 2b. Delete `spec.ts`'s ghost builders (dropped)

The plan was to delete `spec.ts`'s `bar`/`block`/`pill`/`dot` (and the beige `GHOST*` constants) as
dead code. They are not dead: `spec.test.ts` imports and exercises all of them, and that test file is
one of the other session's contested files. The builders have a test consumer even if nothing ships
them, and removing them would mean editing a contested test. Dropped; they stay.

### 2c. The AI outline ghost draws silhouettes, not greyed guesses (built)

`outlineSection` now also returns `ghosts`, a map from each data column's region id to its kind, for
the kinds a silhouette reads better than a greyed guess (`chart`, `stat`, `table`, `diagram`; `image`
is left out because it already ghosts well as a panel through `skeletonize`). `layoutOutline` takes
that map: a column whose id is in it is replaced by a `ghostBody(kind, colors, height)` silhouette
(bars for a chart, tiles for a stat) rather than the skeletonized `placeholderBlock` content, so the
ghost stops claiming specific fabricated content the model will contradict. The copy column stays
real, and every other column still skeletonizes, so the editable region ids are unchanged.

The silhouette needs a height, and a column's height is not known until layout, so `layoutOutline`
runs one measuring pass when (and only when) the `ghosts` map is non-empty, reads each column's box
height from the returned regions, and sizes the silhouettes from that before the real second pass.
`placeholderBlock`'s canned data still composes in the measuring pass to establish column geometry,
so it was not removed.

Coordination: `commands.ts` carries another session's uncommitted changes. Its ghost region
(`ghostColorsFor` and `layoutOutline`, plus the third `skeletonize` call site) was untouched by that
diff, and the `@themes` import line likewise; the edits are confined to those, plus one added import.
`spec.ts` and `spec.test.ts` were not touched. `blueprint.ts`, `Board.tsx`, and the tests are clean
files. The owner was notified.

Not built, recorded as follow-up: `placeholderSection` feeds the same silhouette-worthy kinds into
`layoutSectionSkeleton` (the whole-section skeleton in `GenOverlays.tsx`), which still skeletonizes
rather than drawing silhouettes. Giving it the same treatment means `placeholderSection` returning a
`ghosts` map and `layoutSectionSkeleton` taking one, which widens two more signatures and their
callers (`editor/core/ai.ts`, `GenOverlays.tsx`, `Board.tsx`). Left for a follow-up, since the user's
report was the outline card, which `layoutOutline` owns.

### 2d. Tests (built)

`blueprint.test.ts` gains a silhouette group: `outlineSection` returns a `ghosts` map keyed to the
data column (never the copy column), a chart column lays out as several filled rects rather than
greyed text bars, and a single-column outline has no ghosts. The existing "paints no stand-in copy"
test already exercises the stat silhouette (it asserts the canned `92%`/`key metric` text never
paints). `eval:shots` is unaffected: the outline board and the skeletons are not in the shot corpus,
which renders real sections through `layoutSection`.

## Stage 3 — palette preview art (planned, likely not taken)

The obvious-looking fourth step is to retire `previewSvg` (535 lines) and render palette tiles from
`ghostBody`. This is recorded as a question, not a plan, because it is probably the wrong trade: the
palette wants distinct per-type illustration (67 elements have their own preview art, verified by
`check:elements`), while `ghostBody` knows about six kinds. Collapsing 67 drawings into six
silhouettes would make the palette less legible, not more, to save lines in a file that is not on
the ghost path and is not what the user reported as broken. The likely resolution is to keep
`previews.ts` as the palette's own concern and let the two vocabularies stay separate. Revisit only
if a future need makes a palette tile and a ghost want to be the same drawing.

## Gates

Per stage: typecheck, lint, `check:suppressions`, `check:program`, `check:elements`, the touched
unit suites, and `eval:shots` before/after with the expectation that the corpus does not move
(every stage is confined to stand-in paths that the shot corpus does not exercise). Nothing is
committed until the user's manual QA at the end.

## Not taken, and why

One ghost function for all four systems: rejected. `skeletonize` greys a real node for exact
geometry and the outline ghost draws a silhouette from a kind; forcing them together would either
make the live overlay drift or make the outline ghost claim geometry it does not have. They share a
vocabulary (`ghost.ts`), not a function.

Recoloring the placeholder in Stage 1: rejected. Stage 1 is a pure extraction; the colors are the
same mix math `placeholder.ts` already used, so nothing that renders today changes appearance. Color
unification is Stage 2, where it is visible and testable on its own.
