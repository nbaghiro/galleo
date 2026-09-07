# Ghost stand-ins: one grey vocabulary

> The grey "not-yet-here" stand-in was reinvented four times, each in its own file with its own
> colors and its own idea of what a chart or a stat looks like as a ghost. Two of the four already
> read well; the AI outline ghost did not, which is where the reports of "strangely positioned or
> unmatching ghosts" came from. Today three of the four draw from one shared vocabulary
> (`canvas/elements/ghost.ts`); this doc records the stand-in systems as they run, the diagnosis
> that shaped the consolidation, and the one system deliberately left separate.

## The stand-in systems

1. **Windowed-loading placeholder** (`canvas/render/placeholder.ts`). What a section paints before
   its content arrives, sized to the height the stack already reserves (`estimateSectionHeight`).
   Builds its stand-in from the digest's `kind` and `title`, so it draws the real heading over a
   recognizable per-kind body: a chart as bars on a baseline, a diagram as a row of node boxes, a
   stat as tiles, a table as a header over rows, media as a filled panel, anything else as prose.
   This is the one that read well from the start, because the silhouette is chosen by kind rather
   than derived from generic bars, and it is the implementation the shared vocabulary was lifted
   from. The file now defines only what is specific to the loading case — the `heading` node that
   draws the real title, and `ghostNode`/`layoutPlaceholder` — over the shared primitives.

2. **`skeletonize(node, colors)`** (`canvas/elements/spec.ts`). Greys a real, already-composed
   node: text becomes bars (`textBars`), an image or surface leaf becomes a filled aspect panel, a
   container keeps its exact geometry and greys only its panel. Runs post-compose, so it cannot
   drift from the final layout, which is exactly what the live-build overlay wants. It has no idea
   what kind of element it is greying, because by the time it runs the element type is gone; a
   chart is just a surface leaf, so on its own it comes out as a plain grey rectangle rather than
   bars — which is why the silhouette map below rides alongside it rather than replacing it.

3. **AI outline ghost** (`canvas/elements/blueprint.ts` + `layoutOutline`/`layoutSectionSkeleton`
   in `canvas/render/commands.ts`). Builds a whole fake `Section` from a guessed blueprint
   (`placeholderBlock(kind)` returns a canned `ElementInstance` per kind), composes it through the
   real engine, then ghosts it: silhouettes for the data columns, skeletonized shape for
   everything else, the copy column kept real. Consumers: `app/views/generate/Board.tsx` (the
   outline cards and the beat skeleton), `editor/panels/GenOverlays.tsx` (the section-gen
   skeleton), and `editor/core/ai.ts` (which puts `placeholderSection(...).section` into the stack
   to hold the slot while the overlay paints the skeleton over it).

4. **Palette preview art** (`previewSvg`, `canvas/elements/previews.ts`, hand-drawn SVG per type).
   Drawn in the insert palette tiles (`editor/panels/Insert.tsx`) and in the chart/diagram type
   pickers. This is a separate concern from the three above: it is per-type illustration for a
   menu, not a stand-in for absent content, and it stays its own system — see "Not taken".

## The key diagnosis

Systems 1 and 2 answer two genuinely different questions and both answer theirs correctly:

- When the real node exists (live build), grey it (`skeletonize`). Exact geometry, cannot drift.
- When only a kind is known (windowed load), draw a per-kind silhouette (`ghostBody`). Honest
  about being an approximation, but recognizable.

The AI outline ghost is in the second situation — only a kind is known — but it used to reach for
a variant of the first tool: it fabricated full content, composed it, and greyed it. That is why
it drifted: the ghost's shape was the blueprint's guess, and the model frequently writes something
else, so the ghost and the eventual content disagreed. It now uses system 1's approach — a
per-kind silhouette at the column's real box — for the data columns, and keeps `skeletonize` for
the shape-only remainder.

So the consolidation was never "make everything one function." It is: system 1's silhouette
vocabulary extracted into a shared home, the AI outline ghost pointed at it, and `skeletonize`
kept for the one case that needs exact geometry.

## The shared vocabulary (`canvas/elements/ghost.ts`)

- `ghostColors(theme)` returning `{ bar, panel, line, ink }`, theme-derived mix math (`bar` at
  `mix(surface, ink, 0.16)`, `panel` at `mix(surface, ink, 0.08)`, `ink` for real text drawn over
  a stand-in, such as a placeholder's already-known heading).
- `ghostBar`, `ghostBox`, `ghostParagraph` primitives (paragraph widths cycle so a run of lines
  reads like prose rather than a bar chart).
- `ghostBody(kind, colors, height)`, the per-kind silhouette switch (chart, diagram, table, media,
  stat, quote, default prose), keyed by a plain `kind` string so any caller can reach it.

Home: `canvas/elements/`, not `canvas/render/`, because two of the three consumers of the
vocabulary (`skeletonize` in `elements/spec.ts`, the blueprint ghost maps in
`elements/blueprint.ts`) live in elements, and the placeholder in render can import down into
elements.

There is exactly one color source. `commands.ts` used to carry its own `ghostColorsFor(theme)`
whose constants had drifted from the placeholder's; it is gone, and every ghost path
(`layoutOutline`, `layoutSectionSkeleton`, `layoutSlideSkeleton`) calls `ghostColors(theme)`.
`ghostColors` returns a superset of what `skeletonize` reads (it adds `ink`), so the shared value
satisfies `spec.ts`'s local `GhostColors` type by structural typing. The visible effect of the
unification was that skeleton and outline ghost panels took on the placeholder's slightly more
visible panel tone (`mix(surface, ink, 0.08)` rather than the near-invisible `theme.surface`),
the tone already judged good on the placeholder.

## The outline ghost: silhouettes, not greyed guesses

Both blueprint builders (`outlineSection`, `placeholderSection`) return `ghosts`, a map from each
data column's region id to its kind, for the kinds a silhouette reads better than a greyed guess
(`chart`, `stat`, `table`, `diagram`; `image` is left out because it already ghosts well as a
panel through `skeletonize`). `outlineSection` maps every such column except the copy column;
`placeholderSection`, which has no copy column, maps them all (a lone data column sits at the root
path `[]`, which composes to `el:<section>`).

One shared `layoutGhosts` helper in `commands.ts` applies a map: a column whose id is in it
becomes a `ghostBody(kind, colors, height)` silhouette (bars for a chart, tiles for a stat) rather
than skeletonized `placeholderBlock` content, so the ghost stops claiming specific fabricated
content the model will contradict. `layoutOutline` passes it a `copyId` to keep real; the
whole-section skeleton (`layoutSectionSkeleton`) passes none, so every silhouette-worthy column
ghosts. Both keep the section frame and the non-data columns skeletonized, so editable region ids
and the empty-ghosts case are unchanged. `layoutOutline` also takes `draftFields`: a field still
streaming in (an empty lead or point during planning) greys to bars in place, so the copy column
keeps its real heading while the body reads as loading, not as filler copy.

The silhouette needs a height, and a column's height is not known until layout, so `layoutGhosts`
runs one measuring pass when (and only when) the `ghosts` map is non-empty, reads each column's
box height from the returned regions, and sizes the silhouettes from that before the real second
pass. `placeholderBlock`'s canned data still composes in the measuring pass to establish column
geometry, which is why it was not removed. One behavior note: a skeleton that has a silhouette
column keeps its real section background and wrappers (only the columns are ghosted), the same way
the outline card does, rather than greying the whole card flat; a text-only skeleton (empty
`ghosts`) is byte-for-byte the fully-greyed skeleton.

`spec.ts` keeps its own small ghost builders (`bar`, `block`, `pill`, `dot`, and the beige
`GHOST*` constants that back `skeletonize`'s default colors). They were once slated for deletion
as dead code; they are not dead — `spec.test.ts` imports and exercises all of them — so they stay.

## Tests

`blueprint.test.ts` covers the silhouette behavior: `outlineSection` returns a `ghosts` map keyed
to the data column (never the copy column), a chart column lays out as filled rects rather than
greyed text bars, and a single-column outline has no ghosts; `placeholderSection` ghosts each
silhouette-worthy column (a lone one at the root path) and none for a text-only plan. The "paints
no stand-in copy" test exercises the stat silhouette (the canned `92%`/`key metric` text never
paints). `eval:shots` is unaffected: the outline board and the skeletons are not in the shot
corpus, which renders real sections through `layoutSection`.

## Not taken, and why

**Palette art from `ghostBody`.** The obvious-looking further step is to retire `previewSvg`
(~535 lines of hand-drawn SVG) and render palette tiles from `ghostBody`. Not taken, and probably
the wrong trade permanently: the palette wants distinct per-type illustration (67 elements have
their own preview art, verified by `check:elements`), while `ghostBody` knows about six kinds.
Collapsing 67 drawings into six silhouettes would make the palette less legible, not more, to save
lines in a file that is not on the ghost path. `previews.ts` stays the palette's own concern and
the two vocabularies stay separate; revisit only if a future need makes a palette tile and a ghost
want to be the same drawing.

**One ghost function for all systems.** Rejected. `skeletonize` greys a real node for exact
geometry and the outline ghost draws a silhouette from a kind; forcing them together would either
make the live overlay drift or make the outline ghost claim geometry it does not have. They share
a vocabulary (`ghost.ts`), not a function.
