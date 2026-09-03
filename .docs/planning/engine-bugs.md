# Planning — the engine bug round

> The fix plan for the eleven verified bugs in [`engine-audit.md`](engine-audit.md) (B1–B11), and
> nothing else from that audit: no misfit refactors, no cleanups, no performance work. Every fix is
> pinned by a failing test before it is made, every phase lands independently green, and the
> do-not-touch list in the audit is a hard constraint throughout. Status: **built, all five
> phases** — every bug pinned by a failing test first, all eleven fixed 2026-09-02.

Companion docs: `engine-audit.md` (the findings and their evidence), `engine-gaps.md`,
`autofit.md` (the solve this round repairs a fall-through of), `loading.md`.

Every bug was re-verified against the tree on 2026-09-02 before this plan was written. All eleven
hold; none was already fixed; one gained a second reachable path (B2, below).

## Why

Four of these are engine correctness bugs on shipped paths with zero test coverage (B1–B4); the
rest are small, user-visible, and each violates an invariant its own module states. They are
planned as one round because they share machinery — three live in `fragment()`, two in
`commands.ts`'s slide path, and fixing them separately would mean reasoning about the same
invariants five times.

## The discipline

**Pin, then fix.** Each bug gets its failing test first, in the existing per-topic `__tests__/`
file named below (no new source files anywhere in this round; a new test file only where no topic
file exists). The test is run red before the fix and green after, and the red run is how we know
the test measures the bug rather than the fix. B1's red state is already proven by execution.

**Constraints.** The audit's eleven do-not-touch entries bind every design below; the ones each
phase leans on are named in the phase. Repo rules as always: no suppressions, no `any`, terse
comments only for what code cannot say, `check:copy` on any user-facing string (this round adds
one: the Shape control's "Star" label).

---

## Phase 1 — the solver and the page breaker (B3, B4, B5, B11)

One file, `canvas/engine/layout.ts`, plus its tests. Pure functions, no DOM, cheapest tests in the
repo. Grouped because B4/B5/B11 all live in `fragment()` and B3 in the height pass beside it.

**B3 — floats resolve against the height sentinel.** Fix: lay floats out _after_ the parent's own
height is resolved, against the resolved content height — exactly the pattern the aspect branch
already uses (`layout.ts:243-248`: resolve `ln.h` first, children against the inner box). Today
the row branch lays floats mid-loop (`:343`), col and grid before `ln.h` exists (`:385`, `:330`);
all three move below their `ln.h = resolveHeight(...)` line and pass
`Math.max(0, ln.h - padY(node))`. Floats never feed fit sizing, so this changes no flow layout.

- Rejected option: strip `height: "fill"` in `pinnedLayout` the way width is stripped
  (`editor/core/pin.ts:181` converts fill→fit, `:186` keeps height untouched). Objection: patches
  one entrance of three — the AI writes `pin` + `height:"fill"` in a single reply through
  `zElementLayout`, and hand-authored trees exist too. The engine is the only place all three pass.
- Do-not-touch leaned on: the fit-column grow guard (`:374-380`) is untouched; this fix is its
  missing sibling for floats, not a replacement.
- Tests (`canvas/engine/__tests__/layout.test.ts`): a fit-height root with a grow-height float
  resolves the float to the flow's height, not ~100000; a fixed-height parent stretches the float
  to its content box (the sane meaning of "fill"). Red today: the float measures ~100000.

**B4 — pages are built from the y-sorted array, losing z-order.** Fix: wrap each command with its
emit index before sorting (`{ c, i }`), keep the sorted wrappers for break-finding and line
slicing (slices inherit `i`), and emit each page's commands ordered by `i`. Z-order (decoration
under flow under overlays) is emit order restored per page; break selection is unchanged.

- Tests (`canvas/engine/__tests__/fragment.test.ts`): an emit-ordered pair [decoration at y200,
  text spanning y100–y300] on a page that holds both must come back with the decoration still
  _before_ the text; a two-page split preserves relative order on each page. Red today: the sort
  flips them.

**B5 — rotated commands paginate by their flat box.** Fix: a `rotatedExtent(c)` helper in
`layout.ts` (the four-corner math `commands.ts:47-62` already does for `lowest`, computing min and
max y), used by the break-candidate, splits, and page-inclusion tests in `fragment`. `lowest` in
`commands.ts` then imports it rather than keeping a private copy — render already imports engine,
so the one home is legal and removes a mirrored formula.

- Tests (`fragment.test.ts`): a rotated command whose flat box ends above the break but whose
  turned corner dips below appears on the following page; one whose flat box crosses but whose
  turned extent does not is not treated as splitting. Red today on the first case.

**B11 — a line cut can slice a second paragraph off its own grid.** Fix: tighten the `bad` filter
(`layout.ts:763-768`): a candidate `ly` is accepted only if, for _every_ crossing text command,
`(ly − c.box.y) / lineHeightOf(c)` is within EPS of an integer and the implied cut leaves
≥ KEEP_LINES on both sides; any other crossing command still vetoes. When no candidate survives,
the existing hard break at the limit applies — clipping a line is worse than clipping at the
limit, which every consumer already windows.

- Tests (`canvas/engine/__tests__/fragment-lines.test.ts`): two side-by-side text commands with
  offset line phases forced past the hard limit — assert the chosen break lies on both grids or no
  line break is taken, and that no emitted slice's box starts above its page after the shift. Red
  today with crafted phases.

Gate: typecheck, lint, full vitest, all `check:*`. Corpus statement: `eval:shots` unchanged —
these paths only change paginated output for sections that were already misrendering, and the
corpus currently passes all 592 checks. Estimated tests added: 8. Risk: the `fragment` restructure
touches Present and slide export; the existing fragment/fragment-lines suites plus the new pins
are the containment.

## Phase 2 — the measure cache (B1)

`canvas/render/commands.ts` (`measureKey`) plus `canvas/render/__tests__/commands.dom.test.ts`,
which already exercises the real cached `measureText` under `installCanvas2D` and imports
`clearMeasureCache` for isolation.

**B1 — cached frags leak paint-only run attributes.** Fix: widen the key — the per-run segment
gains the paint-only fields (`color`, `highlight`, `link`, `underline`, `strike`), delimited, and
while there, the existing flags+text concatenation gets a length prefix (the audit's E5 collision
note — two lines in the same function, so it rides along rather than becoming its own visit).

- Rejected option: strip paint attrs from cached lines and re-derive at emit by mapping
  `frag.from` back to runs. Objection: it creates a second place that derives frag styling, which
  is the exact drift the shared wrap exists to prevent — and it costs a per-emit pass forever to
  save cache entries that only duplicate when identical text differs in marks.
- Do-not-touch leaned on: the one injected, memoized measurement path stays; only the key
  sharpens. No layout output changes for any leaf — geometry never depended on the leaked fields.
- Tests (`commands.dom.test.ts`, after `clearMeasureCache()`): the executed repro, named — two
  leaves identical except run color; the second's frags carry its own color. Second case: the same
  leaf re-measured after toggling `underline` on its run returns underlined frags. Both red today.

Gate: full suite + guards. Corpus: unchanged (`eval:shots` re-run to prove it — wrap geometry is
untouched by construction, the run proves the construction). Estimated tests: 3. Risk: lowest of
the round — a pure key change on the fidelity-critical path, with the fidelity property being
exactly what the key preserves.

## Phase 3 — the cover-fit fall-through (B2)

`canvas/render/commands.ts` (`prepareSlideNode`) plus
`canvas/render/__tests__/coverfit.dom.test.ts`.

**B2 — the mutated node escapes.** Re-verification sharpened the finding: the fall-through
(`commands.ts:354→367`) returns the `coverFitMedia`-mutated node not only when the solve fails or
the section paginates, but also whenever `freeze` is set — i.e. during an inline edit of a tall
media section in slide mode, live under the caret. Fix: when the cover-fit cannot be committed,
recompose clean — the fall-through returns
`centreInFrame(compose(fitScale), targetH)` with `targetH = Math.max(h, natural)` measured on the
_clean_ natural height, so the photo keeps its aspect and the section paginates at its true
height. One extra compose on a path that already runs several.

- Rejected option: record and undo the mutations. Objection: `coverFitMedia` would have to return
  an undo log across three mutated fields and a chain of ancestors; recomposing is the same cost
  and cannot half-restore. (Cloning upfront is not available — nodes carry surface paint
  closures.)
- Behavioral note, stated rather than hidden: sections on this branch today paginate at the
  _collapsed_ height (`natural = Math.min(natural, minH)`); after the fix they paginate at the
  clean natural height, so a long-text media section may gain a page — with its photo visible.
- Do-not-touch leaned on: both pinned success branches (`coverfit.dom.test.ts:33-39`,
  `autofit.dom.test.ts:174-200`) are byte-untouched; only the fall-through changes.
- Tests (`coverfit.dom.test.ts`): a column-flow media+text section whose collapsed height still
  overflows the frame — through `sectionSlides`, assert the media command exists with height > 0;
  the same section under `freeze` keeps the photo. Both red today (media box collapses to 0).

Gate: full suite + guards, then `eval:shots` read deliberately: expected unchanged (all corpus
checks pass today, so no corpus section proves to sit on the broken branch), with `aria/s9` — the
known overflower — eyeballed by name in the diff. Estimated tests: 2. Risk: page counts can move
for already-broken sections; that is the fix working.

## Phase 4 — ops, table, shape (B6, B7, B10)

Three disjoint files: `canvas/elements/ops.ts`, `canvas/elements/table/table.ts`,
`canvas/elements/media/vector.ts` + `model/elements.ts`. No file is shared inside the phase.

**B6 — `replaceAt` discards the slot's width.** Fix: `replaceAt` transfers the outgoing instance's
`layout.width` onto the incoming element — set when the slot had one, deleted when it didn't — so
the drop inherits the column share the placeholder was holding. This honors the module's own
stated invariant at its one violating writer; `insertChild`'s strip-and-renormalize path is
untouched.

- Tests (`canvas/elements/__tests__/ops.test.ts`): replaceAt into the empty 40% column of a 60/40
  row keeps the 40 (and drops the newcomer's stale 90%); replaceAt over a width-less slot leaves
  the newcomer width-less. Red today: the row resets to even.

**B7 — table edits wipe `clamp`.** Fix: `withChildren` carries `clamp` through
(`table.ts:187-198`), the one field its rebuild forgot.

- Tests (`ops.test.ts`, where the edit funnel lives): editing one cell of a `clamp: 1` table via
  the registry-aware child write preserves `clamp`. Red today.

**B10 — Diamond is offered, unrenderable; star drawable, unofferable.** Fix: `SHAPE_KINDS` becomes
a value-set in `model/elements.ts` (the `BUTTON_SHAPES` pattern), `vector.ts` derives both its
`ShapeKind` type and its control options from it, the missing `diamond` branch is added to
`shapeVector` (a four-point polygon; the diagram utils' silhouette math is the reference), and
`star` joins the offered list since the renderer already draws it.

- Tests (`canvas/elements/__tests__/spec.test.ts`): every `SHAPE_KINDS` value produces a non-empty
  vector (`nodes.length > 0`). Red today on `diamond`; the parity between value-set and renderer
  is then guarded forever.

Gate: full suite + guards; `check:copy` covers the "Star"/"Diamond" labels (plain words).
Corpus: unchanged — no corpus content uses shape diamond (it renders nothing today) and replaceAt
runs only on editor drops. Estimated tests: 6. Risk: B6 changes drop semantics the dnd suite
exercises; the existing dnd/ops tests are the containment.

## Phase 5 — [media-merge] coordination (B8, B9)

`canvas/elements/layouts.ts`, `model/artifact.ts` (`sectionsOf`),
`canvas/elements/media/element.ts` — all files the media-merge sibling session is actively
editing. This phase is last, and it starts with a pre-flight: `git status` + re-read of the three
sites. For each bug, if the sibling has already fixed it or moved the code, **skip and record in
this doc** — never re-fix, never touch their in-flight hunks, never revert.

**B8 — two readers still key on the pre-merge `type: "image"`.** Fix: `layouts.ts`'s `imageSrc`
and `artifact.ts`'s `sectionsOf` read the kind through the model's own media normalization helper,
accepting both the normalized `media` type and the legacy names (the same both-ways tolerance
`withMediaKinds` implies for content that predates a save).

- Tests: `canvas/elements/__tests__/layouts.test.ts` — the media-bleed preset `applies` to a
  section holding a `media`/photo element; `model/__tests__/artifact.test.ts` — `sectionsOf`
  digests a media-photo section as `media`, not `content`. Both red today.

**B9 — the merged media bar and label are pinned to the registered kind.** Fix: the spec's `bar`
becomes one static union of every kind's keys — the bar already filters by each control's
kind-gated `visibleWhen` (`ControlBars.tsx:79`), so the per-kind subset falls out with no contract
change; the inspector title reads the kind from data (a small `labelFor` hook on the spec, honored
by `RightPanel`, palette unaffected).

- Rejected option: widen `ElementSpec.bar`/`label` to functions of data. Objection: a contract
  change across every consumer for one element, when `visibleWhen` already expresses per-kind
  visibility.
- Tests (`canvas/elements/__tests__/spec.test.ts`): a `media` instance with `kind: "icon"` yields
  a non-empty visible bar (glyph/color) and an "Icon" title. Red today: empty bar, "Image".

Gate: full suite + guards, pre-flight recorded in the execution log. Estimated tests: 4. Risk:
collision with live sibling work — mitigated by ordering (last), the pre-flight, and skip-and-
record.

## Sequencing and gates

Phases 1 → 2 → 3 → 4 → 5, each landing independently green: typecheck, lint, full vitest, every
`check:*` guard. `commands.ts` is touched by phases 2 and 3, `layout.ts` only by phase 1 — no file
is shared within a phase, and cross-phase sharing is sequential by construction. `eval:shots` runs
after phases 1–3 (the geometry-adjacent phases) and once at the end; expected unchanged
throughout, with the B2 caveat stated in its phase. Estimated new tests across the round: ~23.

## What this round does not do

The audit's misfit list (E1–E8), element cleanups (L1–L10), interaction gaps (U1–U10) and
performance items (P1–P8) are out of scope, including the tempting adjacents: E3's broader
mutation containment (B2 fixes the escaped instance, not the pattern), E1's grow-height
unification (B3 fixes the sentinel leak, not the per-direction protocols), and the fragment
z-order fix does not extend to reading-order semantics. Each of those is its own decision on the
audit's priority ladder.
