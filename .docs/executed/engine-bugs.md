# The engine bug round

> The final-state record of the eleven verified bugs from
> [`engine-audit.md`](../planning/engine-audit.md) (B1–B11): what each one was, how the code works
> now, and the options rejected along the way. Nothing else from that audit rode along — no misfit
> refactors, no cleanups, no performance work. Every fix was pinned by a failing test before it was
> made, in the per-topic `__tests__/` file named beside it, so each test measures the bug rather
> than the fix.

Companion docs: `engine-audit.md` (the findings and their evidence), `engine-gaps.md`,
[`autofit.md`](autofit.md) (the solve whose fall-through B2 concerned), `loading.md`.

Four of these were engine correctness bugs on shipped paths with zero test coverage (B1–B4); the
rest were small, user-visible, and each violated an invariant its own module states. They were
fixed as one round because they share machinery — three live in `fragment()`, two in
`commands.ts`'s slide path — and fixing them separately would have meant reasoning about the same
invariants five times.

## The solver and the page breaker (B3, B4, B5, B11)

All in `canvas/engine/layout.ts`. Pure functions, no DOM, the cheapest tests in the repo.

**B3 — floats used to resolve against the height sentinel.** Floats are now laid out _after_ the
parent's own height is resolved, against the resolved content box: every branch of the height pass
sets `ln.h = resolveHeight(...)` first and then calls `layoutFloats`, which lays each float
against the inner height — the assignment is the unbounded sentinel, and a grow-height float must
not swallow it. This is the same pattern the aspect branch always used (resolve `ln.h` first,
children against the inner box). Floats never feed fit sizing, so no flow layout changed.

- Rejected option: strip `height: "fill"` in `pinnedLayout` the way width is stripped
  (`editor/core/pin.ts` converts fill→fit for width). Objection: it patches one entrance of
  three — the AI writes `pin` + `height:"fill"` in a single reply through `zElementLayout`, and
  hand-authored trees exist too. The engine is the only place all three pass.
- The fit-column grow guard beside it is untouched; this is its missing sibling for floats, not a
  replacement. Pinned in `canvas/engine/__tests__/layout.test.ts`: a fit-height root resolves a
  grow-height float to the flow's height, not the ~100000 sentinel; a fixed-height parent
  stretches the float to its content box (the sane meaning of "fill").

**B4 — pages used to be built from a y-sorted array, losing z-order.** The current design is
simpler than restoring order after a sort: `fragment` never sorts commands at all. Emit order is
z-order (decoration under flow under overlays), so pages are assembled by walking the windows in
emit order, and the per-command extents exist only to find breaks. Break selection is unchanged.
Pinned in `canvas/engine/__tests__/fragment.test.ts`: a decoration emitted before a text command
it underlaps comes back still before it, on one page and across a split.

**B5 — rotated commands used to paginate by their flat box.** `rotatedExtent` is exported from
`canvas/engine/layout.ts` — the four-corner math computing a command's painted min and max y — and
`fragment` windows every command by it, so a rotated command breaks by its turned extent, not its
flat box. `canvas/render/commands.ts` imports it for `lowest` rather than keeping a private copy:
render already imports engine, so the one home is legal and the mirrored formula is gone. Pinned
in `fragment.test.ts`: a command whose flat box ends above the break but whose turned corner dips
below lands on the following page.

**B11 — a line cut could slice a second paragraph off its own grid.** When the hard limit would
slice glyphs, `fragment` looks for the lowest line boundary that cuts cleanly: `cleanCut` accepts
a candidate `ly` only if, for _every_ crossing text command, `(ly − box.y) / lineHeightOf(c)` is
within EPS of an integer and the implied cut leaves at least `KEEP_LINES` on both sides; any other
crossing command (or a rotated one) vetoes. When no candidate survives, the hard break at the
limit applies — clipping a line is worse than clipping at the limit, which every consumer already
windows. Pinned in `canvas/engine/__tests__/fragment-lines.test.ts` with two side-by-side text
commands at offset line phases.

## The measure cache (B1)

**B1 — cached frags leaked paint-only run attributes.** `measureKey` in
`canvas/render/commands.ts` carries, per run, the paint-only fields alongside the metric ones:
the flag block (bold/italic/code/underline/strike) plus `color`, `highlight` and `link`,
delimited, with each run's text length as a prefix so run boundaries stay unambiguous with
printable delimiters (the audit's E5 collision note, folded in because it was two lines in the
same function), and R/T branch markers so a plain leaf can never alias a runs leaf. Two runs
identical in metrics but different in colour, link or decoration no longer share an entry.

- Rejected option: strip paint attrs from cached lines and re-derive at emit by mapping
  `frag.from` back to runs. Objection: it creates a second place that derives frag styling, which
  is the exact drift the shared wrap exists to prevent — and it costs a per-emit pass forever to
  save cache entries that only duplicate when identical text differs in marks.
- The one injected, memoized measurement path stays; only the key sharpened. Geometry never
  depended on the leaked fields, so no layout output changed for any leaf — the corpus run proved
  the construction. Pinned in `canvas/render/__tests__/commands.dom.test.ts` under
  `clearMeasureCache`.

## The cover-fit fall-through (B2)

**B2 — the `coverFitMedia`-mutated node used to escape** whenever the solve failed, the section
paginated, or a freeze was active (an inline edit of a tall media section in slide mode, live
under the caret), leaving the photo's aspect dropped and its box collapsed on the paginated
output.

The fix as originally landed recomposed a clean node on the fall-through. That design was then
superseded by the broader mutation containment recorded as engine-audit E3, which is the current
state: `coverFitMedia` is a **pure find** — asking mutates nothing — and `commitCoverFit` is the
one mutation site, applied only by a branch that commits to the crop. `collapsedHeight` parks and
restores both height channels (the `h` mode and the aspect) around its probe. The paginate
fall-through therefore returns the untouched node with no recompose needed: the photo keeps its
aspect and the section paginates at its true natural height. B2's pins stayed green across the
supersession (`canvas/render/__tests__/coverfit.dom.test.ts`: through `sectionSlides`, the media
command exists with height > 0, including under `freeze`).

- Rejected option: record and undo the mutations. Objection: `coverFitMedia` would have had to
  return an undo log across three mutated fields and a chain of ancestors; recomposing was the
  same cost and could not half-restore. (Cloning upfront is not available — nodes carry surface
  paint closures.) The pure-find design that followed removes the need for either.
- Accepted behavioral change, stated rather than hidden: sections on this branch used to paginate
  at the _collapsed_ height (`min(natural, minH)`); they now paginate at the clean natural height,
  so a long-text media section may gain a page — with its photo visible.

## Ops, table, shape (B6, B7, B10)

**B6 — `replaceAt` used to discard the slot's width.** `replaceAt` (`canvas/elements/ops.ts`)
transfers the outgoing instance's `layout.width` onto the incoming element — kept when the slot
had one, stripped when it didn't — so a drop into the empty 40% column of a 60/40 row inherits
the 40 (and the newcomer's stale width dies there) instead of silently resetting the row to an
even split. This honors the module's own stated invariant at its one violating writer;
`insertChild`'s strip-and-renormalize path is untouched. Pinned in
`canvas/elements/__tests__/ops.test.ts`.

**B7 — table edits used to wipe `clamp`.** `withChildren` in `canvas/elements/table/table.ts`
carries `clamp` through its rebuild, the one field it forgot. Pinned in `ops.test.ts`, where the
edit funnel lives.

**B10 — diamond was offered but unrenderable; star drawable but unofferable.** `SHAPE_KINDS` is a
value-set in `model/elements.ts` (rectangle, ellipse, triangle, diamond, star, line, arrow — the
`BUTTON_SHAPES` pattern); `canvas/elements/media/vector.ts` derives both its `ShapeKind` type and
its control options from it, `shapeVector` has the diamond branch (a four-point polygon, the
diagram utils' silhouette math as reference), and star is on the offered list since the renderer
already drew it. `canvas/elements/__tests__/spec.test.ts` asserts every `SHAPE_KINDS` value
produces a non-empty vector, so the parity between value-set and renderer is guarded forever.

## The media-merge stragglers (B8, B9)

**B8 — two readers still keyed on the pre-merge `type: "image"`.** `imageSrc` in
`canvas/elements/layouts.ts` and `sectionsOf` in `model/artifact.ts` read the kind through
`mediaKindOf` (`model/artifact.ts`), the model's own media normalization, accepting both the
normalized `media` type and the legacy names — the same both-ways tolerance `withMediaKinds`
implies for content that predates a save. The media-bleed preset applies to a media/photo section,
and `sectionsOf` digests one as `media`, not `content`.

**B9 — the merged media element's bar and label were pinned to the registered kind.** The spec's
`bar` is one static union of every kind's keys; the bar already filters by each control's
kind-gated `visibleWhen`, so the per-kind subset falls out with no contract change. The inspector
title reads the kind from data through `ElementSpec.labelFor` (`canvas/elements/spec.ts`), honored
where the element is named; the palette is unaffected.

- Rejected option: widen `ElementSpec.bar`/`label` to functions of data. Objection: a contract
  change across every consumer for one element, when `visibleWhen` already expresses per-kind
  visibility.

## What this round did not do

The audit's misfit list (E1–E8), element cleanups (L1–L10), interaction gaps (U1–U10) and
performance items (P1–P8) were out of scope, including the tempting adjacents: E1's grow-height
unification (B3 fixed the sentinel leak, not the per-direction protocols), and the fragment
z-order fix did not extend to reading-order semantics (that landed separately as the engine
round's item 18). E3's broader mutation containment was also out of scope here, but landed
afterwards and superseded B2's original fix, as described above. Each remaining item is its own
decision on the audit's priority ladder.
