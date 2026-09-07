# Nested-flex layout, and how the AI is taught to use it

> The engine is a generic nested-flex solver: every box sizes as fit, fill, percent or fixed, on
> two axes, to any depth. The AI has the whole of it through the `container` element. This record
> covers how the layout defects that freedom produced (dead space beside taller columns, diagrams
> that clipped their labels, a filled visual collapsing to zero) are fixed deterministically in the
> element layer, how the sizing grammar is taught, and why the per-column-emptiness gate that was
> built to measure it was removed. Companion docs: `../rendering.md` (the engine, the element
> system, format-as-view), `../ai.md` (the generation flow and the section writer), `../testing.md`
> (`eval:shots`, the visual eval that renders in real Chromium and can measure fill).

## The mechanism behind the dead space

A section is one `EngineNode` tree. A row `distribute`s its width by each child's size mode, then
height resolves bottom-up: a `fit` column is as tall as its stacked children, a row is as tall as
its tallest child, a `fill` (grow) box stretches to the row's cross-height. The cross axis defaults
to the top (`mainOffset` with no `alignY` returns 0), so a box shorter than its row sits at the top
and leaves its empty space at the bottom. That single default was the dead space: a chart or
diagram beside a taller text column top-aligned and gapped below. The diagrams clipped because the
funnel and process builders fix band and node heights and never fitted the label to the shape. And
the `fills-frame` check measures whole-section height (the tallest column), so a half-empty sibling
column was invisible to it.

## Two principles the fixes hold to

- **The engine stays generic.** `canvas/engine/layout.ts` knows nothing about what an element is.
  It honours `alignSelf` and `grow`; that is all it needs. Every content-aware decision (this
  column is a lone visual, so centre it) lives in the element layer (`compose`, the container
  arrange), where element types are already known, exactly as the layering law puts element
  concerns below the pure solver.
- **The AI keeps full freedom.** Nothing narrows what the writer may emit: it is still one
  `container` tree nested to any depth. The balance work is a default applied only where the writer
  left a box unspecified, always overridable by an explicit `height` or `align`, so it adds a
  sensible fallback without taking away a choice.

## The vertical-balance default

`balanceRow` and `visualColumn` in `canvas/elements/composite/container.ts`, applied on both
arrange paths (`bare` and the surface path): a row column whose content is a visual (chart,
diagram, table, image) with no body copy, and which the author left without an explicit height,
align or pin, centres on the cross axis. A visual-led column also centres its own content
vertically, so a fixed-height diagram inside a taller filled column no longer strands at the top
(harmless on a fit column). A text column, or any column the author sized, is left exactly as
written. `canvas/elements/__tests__/balance.test.ts` covers it; the reference split reads a column
gap of 0 through the real measurer.

- **Why here, not the engine.** "Is this child a lone visual" is element knowledge; the solver must
  not learn it. The container is the one element whose whole job is holding arbitrary children, so
  the default belongs in its arrange, expressed through the generic `alignSelf`/`alignY` the engine
  already reads.
- **Why a default, not a rewrite.** The author's explicit `height: "fill"` or `align` always wins;
  the default only decides the case the author left open, which used to silently top-align.
- **Centre for every visual, images included.** Filling an image would need the image leaf itself
  to stretch, and centring reads as intentional either way, so centre was chosen over a per-type
  split (image fills, chart centres) that was on the table.

## The sizing grammar the writer is taught

`layoutCatalog()` in `services/core/ai/prompts/catalog.ts` teaches a compact box model rather than
a flat knob list: the four size modes and what each does on each axis ("Every box has a width and a
height, and each is one of: `fit`, `fill`, a `{ pct }` share, or its natural size"); that a box
shorter than its row sits at the TOP and strands its gap at the bottom, the commonest way a section
reads as broken; to centre or fill a visual beside a taller column; to balance a split's two
columns; and to fill a frame by nesting (a caption and a key stat stacked under a visual), not by
padding the text side. "One `container` tree, nested to any depth" stays the framing, so the
freedom is stated, not the constraint.

The fill line carries one hard-won refinement: `fill` stretches a COLUMN inside a row; a chart,
diagram or image already carries its own height, so fill or centre the column that holds the
visual, never the visual itself — and leave fill off the tallest column, since a row where every
column fills has no height to share and collapses to nothing.

Token discipline held: the grammar is a rewrite at rough parity with the prose it replaced, not an
addition to an ~8.8k-token system prompt. The catalog snapshot test pins the copy; `check:copy`
stays clean.

## Diagrams fit their text

`diagramCell` in `canvas/elements/diagram/utils.ts` budgets a label and its detail to the fixed
cell height the builder gives it (funnel bands; process, cycle, hub, flow and the other node
builders): the label is capped at two lines, and a detail the cell cannot hold stands down, so the
engine ellipsizes rather than clipping mid-word. `bandGeometry` floors a funnel's band widths at
the label even when no values scale the taper, so narrow bands no longer cut labels mid-word.
`cell-fit.test.ts` covers the budget; the cycle/hub snapshots dropped details their tiny fixed
cells never actually held. The prompt complement is one catalog line: node labels are terse, and
any real explanation goes in the section's prose, never inside a node.

Growing a diagram to fit an honest label was deliberately deferred: it is per-type geometry, and a
paged diagram cannot grow past its slide anyway. Shrink-and-clamp is the shipped behavior.

## The fill floor

`applyLayout` in `canvas/elements/compose.ts` keeps an element's natural height as its fill floor.
Before this, an author (or the writer, following the fill guidance) putting `height: "fill"` on a
chart inside a fit-height column replaced the chart's `grow(240)` floor with a floorless `grow()`
and dropped the aspect — and a fit column, having no height to hand out, collapsed the chart to
zero, stranding its label and caption. A fill with nothing to stretch into now renders at its own
size.

## Not taken: the per-column-emptiness gate

A per-region fill ratio and a `columnGap` check were built in `canvas/render/diagnose.ts` /
`canvas/render/fit-checks.ts` to give `fills-frame` the finer signal a split needs — and were
removed after their `eval:shots` calibration disproved the gate. Measured against the hand-built
corpus in real Chromium, the corpus leaves column gaps up to 81 percent (galleo/s12 80%, galleo/s10
79%, aria/s11 81%) in splits that read well, because a short text, stat or label column beside a
taller one is meant to sit at the top. By that file's own rule, a check the corpus fails is
miscalibrated, and no threshold both catches the defect and passes the corpus: the raw bottom gap
cannot tell an intentional whitespace column from a stranded visual. The balance default already
fixes the actual defect (a visual column centres; the corpus's gaps are text and stat columns that
belong at the top), so the gate added nothing and was removed along with its metric rather than
tuned to a useless 0.85. Only `fills-frame` (whole-section) survives in
`canvas/render/fit-checks.ts`.

The calibration run is the evidence, and the generalised lesson is the reason this gate must not be
rebuilt: **per-column emptiness is not a defect signal on its own.** The follow-up that was once
sketched — an automatic section rework triggered by an under-filled column — is moot for the same
reason; no such trigger exists.

## Measured state

The round closed green across `eval:shots` 592/592, `check:elements`, the canvas suite, and the
unit suite; `balance.test.ts` (the fill floor, visual-column centring) and `cell-fit.test.ts` (the
funnel band floor) pin the behavior. The three reference defects (a chart column half empty, a
chevron diagram stranded top-right, a funnel with clipped labels) and the two follow-up slides (a
filled chart collapsing to zero, a top-stranded fixed diagram) all render correctly.
