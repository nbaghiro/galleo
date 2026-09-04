# Planning: nested-flex layout, and teaching the AI to use it

> The engine is a generic nested-flex solver: every box sizes as fit, fill, percent or fixed, on
> two axes, to any depth. The AI has the whole of it through the `container` element, but generates
> flat trees that leave dead space and diagrams that clip, because it is taught the horizontal half
> of the system (column splits and blocks) and none of the vertical half (how height distributes,
> that a short box sits at the top). This plan fixes the layout defects deterministically where the
> engine can, keeps the engine free of any content knowledge, and teaches the AI the sizing grammar
> so its full container freedom lands well instead of badly.

Status: built 2026-09-04. W1 to W3 shipped; W4 was built and then removed after its `eval:shots` calibration disproved the gate (see W4). Awaiting manual QA. Companion docs: `rendering.md` (the engine, the element
system, format-as-view), `ai.md` (the generation flow and the section writer), `testing.md`
(`eval:shots`, the visual eval that renders in real Chromium and can measure fill). The three
screenshots that prompted this (a chart column half empty, a chevron diagram stranded top-right, a
funnel with clipped labels) are the reference cases.

## What is wrong, in one paragraph

A section is one `EngineNode` tree. A row `distribute`s its width by each child's size mode, then
height resolves bottom-up: a `fit` column is as tall as its stacked children, a row is as tall as
its tallest child, a `fill` (grow) box stretches to the row's cross-height. The cross axis defaults
to the top (`mainOffset` with no `alignY` returns 0), so a box shorter than its row sits at the top
and leaves its empty space at the bottom. That single default is the dead space: a chart or diagram
beside a taller text column top-aligns and gaps below. The diagrams clip because the funnel and
process builders fix band and node heights and never fit the label to the shape. And the
`fills-frame` check measures whole-section height (the tallest column), so a half-empty sibling
column is invisible to it, which is why nothing caught any of this.

## Two principles this plan holds to

- **The engine stays generic.** `canvas/engine/layout.ts` gains no knowledge of what an element is.
  It already honours `alignSelf` and `grow`; that is all it needs. Every content-aware decision
  (this column is a lone visual, so centre it) lives in the element layer (`compose`, the container
  arrange), where element types are already known, exactly as the layering law puts element concerns
  below the pure solver.
- **The AI keeps full freedom.** Nothing here narrows what the writer may emit: it is still one
  `container` tree nested to any depth. The balance work is a default applied only where the writer
  left a box unspecified, always overridable by an explicit `height` or `align`, so it adds a
  sensible fallback without taking away a choice.

## W1: the vertical-balance default (deterministic, retroactive)

**Built.** `balanceRow` in `canvas/elements/composite/container.ts`: a row column whose content is a visual (chart, diagram, table, image) with no body copy, and which the author left without an explicit height/align/pin, centres. Chose centre over fill for images too, since filling needs the image leaf itself and centring reads as intentional either way. `canvas/elements/__tests__/balance.test.ts` covers it; a slide-13-shaped split now reads a column gap of 0 through the real measurer.

The root fix for dead space, in the element layer so the engine stays pure.

- **Where.** `canvas/elements/composite/container.ts`, the `arrange` for a row (`bare` and the
  surface path both feed it). After the children are composed, a flow child that is a column whose
  content is a single visual leaf (chart, diagram, table, stat, image) and that carries no explicit
  `height` or `align` from the author gets a default cross-axis treatment: an image fills
  (`grow` height, cover), a chart, diagram, table or stat centres (`alignSelf: "center"`). A text
  column, or any column the author sized, is left exactly as written.
- **Why here, not the engine.** "Is this child a lone visual" is element knowledge; the solver must
  not learn it. The container is the one element whose whole job is holding arbitrary children, so
  the default belongs in its arrange, expressed through the generic `alignSelf`/`grow` the engine
  already reads.
- **Why a default, not a rewrite.** The author's explicit `height: "fill"` or `align` always wins;
  this only decides the case the author left open, which today silently top-aligns.
- **Scope guard.** One small helper (a predicate for "a column that is a single visual" plus the
  default it applies), kept in `container.ts` beside the arrange, no new file. The old `group`/`card`
  layout-neutrality against the corpus is preserved: the default changes only boxes that carry no
  height and no align, which the corpus visuals already set where they matter.
- **Acceptance.** The three reference sections centre or fill their short column; `eval:shots` over
  the corpus shows no section's per-column fill regressing (W4 gives the number); the layout DOM
  tests and `check:elements` stay green.
- **Size.** M.

## W2: teach the sizing grammar (the AI's half)

**Built.** `layoutCatalog` now teaches the four size modes, that a short box sits at the top and strands its gap, and to centre or fill a visual beside a taller column, balance a split, and fill a frame by nesting rather than padding text. Near parity in tokens (a rewrite, not an addition). The catalog snapshot test pins the new copy; `check:copy` clean.

The writer is already told the knobs (`width` fit/fill/pct, `height: "fill"`, `align`, `pin`, nest
to any depth). What it lacks is a model connecting content to those knobs, so it never reaches for
them. Rewrite the teaching, not add more rules.

- **Where.** `layoutCatalog()` in `services/core/ai/prompts/catalog.ts` (the "Section layout" block),
  and the section-layout lines of `SECTION_RULES` / `SECTION_OUTPUT` in `prompts/system.ts`.
- **What changes.** Replace the flat knob list with a compact box model: the four size modes and
  what each does on each axis; that a short box sits at the top of its row and leaves a gap below,
  so a visual beside a taller text column should `height: "fill"` or `align: "center"`; that a frame
  is filled by nesting (a caption and a key stat stacked under a visual), not by padding the text
  side; and that a split's two columns should carry comparable weight. Keep "one `container` tree,
  nested to any depth" as the framing, so the freedom is stated, not the constraint.
- **Token discipline.** This is a rewrite at roughly parity, not an addition; the section system
  prompt is already ~8.8k tokens and W2 must not grow it materially. The grammar replaces prose the
  rules already spend on "fill the frame."
- **Acceptance.** The prompt snapshot tests in `prompts/__tests__` are updated to pin the new
  grammar; `check:copy` stays clean (no em-dashes); a judged `eval:ci` run does not drop on any
  gated question and the per-column fill (W4) improves against a pre-W2 baseline.
- **Size.** M. Ordered after W1 so the guidance describes the world W1 creates (centre or fill, and
  the engine already backs you up when you forget).

## W3: diagrams fit their text (generic render fix)

**Built, shrink and clamp; grow deferred.** `diagramCell` budgets its label and detail to the fixed cell height it is given (funnel band, process/cycle/hub/flow node): the label is capped at two lines and a detail the cell cannot hold stands down, so the engine ellipsizes rather than clipping mid-word. The terse-label rule is in the catalog. Growing a diagram to fit an honest label was deferred: it is per-type geometry and a paged diagram cannot grow past its slide anyway. `cell-fit.test.ts` covers the budget; the cycle/hub snapshots updated to drop details their tiny fixed cells never held.

- **Where.** `canvas/elements/diagram/utils.ts` and the affected builders (`funnel.ts`,
  `process.ts`, and any sibling that fixes a node or band height). A node or band fits its label:
  shrink the font to a floor, wrap within the shape, and grow the shape when the content needs it,
  rather than dividing height evenly and letting text overflow. Generic within the diagram family,
  no element-type special-casing outside it.
- **Prompt complement.** One line in the element catalog's diagram entry: node labels are terse
  (a few words), and any longer description goes in the diagram's caption, never inside a node.
- **Acceptance.** The funnel and process reference cases render with every label inside its shape at
  the corpus sizes; `diagram.test.ts` and the visual-invariants test gain a case that a long label
  never overflows its node; `eval:shots` corpus stays green.
- **Size.** M.

## W4: measure per-column emptiness (built, then removed on calibration)

**Removed after `eval:shots` calibration disproved it.** The check and its `columnGap` metric were
built, then measured against the corpus in real Chromium. The hand-built corpus leaves column gaps
up to 81% (galleo/s12 80%, galleo/s10 79%, aria/s11 81%) in splits that read well, because a short
text, stat or label column beside a taller one is meant to sit at the top. By this repo's own rule,
a check the corpus fails is miscalibrated, and no threshold both catches the defect and passes the
corpus: the raw bottom gap does not tell an intentional whitespace column from a stranded visual.
W1 already fixes the actual case (a visual column centres; the corpus's gaps are text and stat
columns that belong at the top), so the gate added nothing W1 did not, and it was removed along with
the now-unused metric rather than tuned to a useless 0.85. The calibration run is the evidence; the
lesson is that per-column emptiness is not a defect signal on its own.

`fills-frame` cannot see a half-empty column because it measures the section's tallest column
against the frame. Give it the real signal.

- **Where.** `canvas/render/diagnose.ts` and `canvas/render/fit-checks.ts`. Add a per-region (per
  top-level column) fill ratio to the diagnosis, and a check that flags a column filling far below
  its siblings inside a fixed frame. Keep the existing whole-section `fills-frame`; this is the
  finer one that the split case needs.
- **Reaches the writer how.** The services layer cannot import the engine, so this runs where the
  engine does: the eval (`eval:shots`, `eval:ci`) and the client-side layout triage that already
  posts `fitChecks` and fires `generation_section_flagged`. The plan surfaces the signal; wiring a
  regenerate on it is a named follow-up, not this round.
- **Acceptance.** The metric drops measurably on the three reference sections after W1, and the new
  check passes the corpus (a corpus section that fails it is the check miscalibrated, per that
  file's own rule).
- **Size.** S.

## W5: measurement and eval, throughout

- **Before.** Capture the current per-column fill and the diagram-clip cases on a small set of
  generated sections via `pnpm traces` and `eval:shots --write`, as the baseline.
- **After each of W1, W3.** `eval:shots` over the corpus unchanged except the intended improvement;
  the reference cases fixed.
- **After W2.** `pnpm eval:ci --cases 7 --judge both` twice, pre- and post-prompt, kept with the
  change; adopt only if no gated question drops and the fill metric improves.

## Order and gates

W4 (the metric) first, so every later step is measured. Then W1 (the deterministic balance), then
W3 (diagrams), then W2 (teach to match the new reality), with W5 running as the gate. Each
workstream lands green on typecheck, lint, the unit suite, every `check:*` guard, and, where it
touches geometry (W1, W3, W4), `eval:shots` over the corpus. No new source files beyond helpers
kept in the concept's own file; minimal comments; the engine untouched.

## Follow-up round: the collapse and the clip (2026-09-04)

Two more AI-generated slides showed defects W1 to W3 did not cover, both traced to the tree.

- **A chart told to fill collapsed to zero (slide 04).** The model put `height: "fill"` on a chart
  inside a fit-height column (encouraged by W2's fill guidance). `applyLayout` replaced the chart's
  `grow(240)` floor with a floorless `grow()` and dropped the aspect, so in a fit column, which has
  no height to hand out, the chart took its zero floor and vanished, stranding its label and
  caption. Fix: `applyLayout` keeps the element's natural height as the fill floor, so a fill with
  nothing to stretch into renders at its own size. `canvas/elements/compose.ts`.
- **A fixed diagram top-stranded in a fill column, and funnel labels clipped (slide 06).** The
  model filled the column (right instinct), but the funnel composes to a fixed 260px and
  top-aligned inside the taller column. Fix: a visual-led column centres its content vertically
  (`container.ts`), harmless on a fit column. Separately, an unscaled funnel taper ignored the
  label-width floor, so narrow bands cut labels mid-word ("Foundati"); `bandGeometry` now floors
  band widths at the label even with no values (`diagram/utils.ts`).
- **W2 refined.** The fill line now says `fill` stretches a column inside a row, a visual carries
  its own height, so fill or centre the column that holds it rather than the visual itself.

All green: `eval:shots` 592/592, `check:elements`, the canvas suite, and the unit suite. Tests:
`balance.test.ts` (fill floor, visual-column centring) and `cell-fit.test.ts` (funnel band floor).

## Decisions needed

- **W1 default per visual type.** Proposed: image fills, chart/diagram/table/stat centre. Confirm,
  or prefer centre for all (simpler, but an image reads better filling its column).
- **W3 fit strategy.** Proposed: shrink-then-wrap-then-grow, in that order, so a diagram keeps its
  shape until the label truly needs more room. Confirm the growth is acceptable (a diagram may get
  taller to fit an honest label).
- **W4 follow-up.** Whether an under-filled column should trigger an automatic section rework this
  round, or stay a measured signal until the metric is trusted.
- **Canvas ownership.** W1, W3 and W4 are all in `canvas/`, where another session has uncommitted
  work; confirm the seams (`container.ts`, `diagram/*`, `render/*`) are clear before starting, or
  sequence around that session.
