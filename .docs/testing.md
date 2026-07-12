# testing.md — test setup + the near-full-coverage plan for canvas

Factual map of Galleo's test system and the plan to bring the **canvas module** (engine · elements ·
render) to near-full, _meaningful_ coverage. Sibling of `.docs/architecture.md` (where things live) and
`.docs/rendering.md` (the render core this targets). Executed in phases; each phase is independently green.

## Why canvas first

`canvas/` is the pure, framework-free heart: the Clay-style layout solver, the element library, and the
render bridge that every surface (editor, present, export, publish) paints through. A sizing or reflow
regression here silently corrupts every deck/doc/site. It is also the _easiest_ high-value thing to test —
most of it is deterministic TS with an **injected** `measure` function and no DOM. One engine bug is worth
a hundred view bugs, and here we catch it with a millisecond unit test.

## Current status

Milestones M1–M6 are **built and landed** — the canvas module is covered end to end.

| Piece    | State                                                                                                                                                                 |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Runner   | **Vitest 4** (`vitest.config.ts`), `node` env default, v8 coverage, happy-dom per-file                                                                                |
| Scripts  | `pnpm test` · `test:watch` · `test:coverage`                                                                                                                          |
| Suite    | **283 tests** across 24 files, co-located; `canvas/testkit.ts` is the whole doubles surface                                                                           |
| Gate     | `pnpm test` in **CI** and the **pre-commit hook**; `coverage/` git-ignored                                                                                            |
| Coverage | **~70% overall** (canvas+model); engine **98%**, elements **88%**, charts/diagrams **90%+**, render bridge **52%** (raster/IO tail honestly bounded). Started at ~6%. |

Achieved coverage by area:

| Area                                                                    | Stmts | Notes                                                                           |
| ----------------------------------------------------------------------- | ----- | ------------------------------------------------------------------------------- |
| `canvas/engine` (layout · fragment · profile)                           | 98%   | the solver, fully                                                               |
| `canvas/elements` (ops · compose · layouts · specs · charts · diagrams) | ~89%  | real registry + real theme, no faked specs                                      |
| `canvas/render` (commands · backends · present · geometry)              | 52%   | logic covered; raster/IO smoke-only or excluded                                 |
| `canvas/render/export-geometry.ts`                                      | 100%  | page/raster geometry, extracted out of the IO shell                             |
| `canvas/render/export.ts`                                               | —     | IO shell excluded (pdf-lib · toBlob · print); geometry lives + tested next door |

---

## The mocking contract (read this first)

"Near-full coverage" is worthless if it's reached by stubbing out the logic under test. The rule for this
suite: **fake exactly two things, because they are the only true external oracles. Everything above them
runs for real.**

**Legitimately substituted (a real seam, not the logic under test):**

1. **Glyph metrics** — the width a font assigns a string. The engine already takes this as an injected
   `measure`/`DrawContext.measureText`; substitute a deterministic per-character width (`text.length * K`).
   The wrap/measure/layout **algorithm runs for real** — only the glyph-width lookup is replaced. This is
   the difference between "test the wrap logic" and "mock the wrapper".
2. **Raster & network IO** — `new Image()` decode, `canvas.toBlob`, `URL.createObjectURL`, `document.fonts`.
   Stub to resolve synchronously / no-op. There is no logic in "the browser decoded a PNG"; asserting it is
   asserting the platform.

**Never faked (doing so would make the test a tautology):**

- **The solver** (`layout`, `distribute`, `fragment`, clip/float math) — real, always.
- **The element registry** — register the **real** specs (via `@elements/register`); never a fake
  `getElement`. A compose test that fakes specs tests nothing.
- **Theme tokens** — the real `DEFAULT_THEME.tokens` from `@themes`. Its `mix`/`luminance`/`hexA` helpers
  are pure and deterministic; use them, don't stub them.
- **d3-scale / d3-shape / d3-hierarchy** — real. Chart/diagram geometry _is_ these; fixture the data, run
  the lib.
- **The DOM** — real, via happy-dom. Assert real element structure and computed inline styles, not a spy.
- **pdf-lib** — real, when we exercise export geometry.

**Banned assertion patterns:**

- `expect(spy).toHaveBeenCalled()` as the payload → assert the produced **geometry / DOM / string** instead.
- Faking a spec / `getElement` / `childrenOf` → register the real element and run the real op.
- Whole-array or whole-DOM snapshots → assert the **specific invariant**; snapshots only for small, stable
  pure strings (`backdropCss`, `runFont`, `scaledHostCss`, `fmt`) where the snapshot _is_ the spec.
- Stubbing a private helper of the function under test.

If a test needs more than the two seams above to run, that's a signal the code has a hidden coupling worth
fixing — not a signal to add a mock.

---

## Test doubles catalog (the only doubles that exist)

All live in the shared `canvas/testkit.ts` (Phase 0b). Everything else a test touches is the real thing.

- **`measure: MeasureText`** — `text.length * 8` per unwrapped line, 16px line height, wraps at `maxWidth`.
  The one substitute for font metrics. Injected into `layout`, `layoutSection`, `layoutSlide`,
  `prepareSlideNode`, `layoutNode`.
- **`textMetricsCtx()`** — a minimal object exposing a `font` setter + `measureText(s) => { width: s.length*8 }`,
  satisfying `layoutRuns`, `wrapLines`, `measureUncached`, `cartesianFrame`, `boxWidth`, `legendRow`. Drives
  the **real** wrap algorithm without a canvas.
- **`recordingDrawContext()`** — a real `DrawContext` (matching `@engine/node`) that pushes every
  `rect/line/circle/polyline/wedge/path/text` into a `calls[]` array and answers `measureText` from the
  deterministic width. Charts/diagrams/shapes compute **real** geometry (real d3); we assert the call stream.
- **`tokens`** — re-export of the real `DEFAULT_THEME.tokens`. Plus a couple of variants (a dark-bg section,
  a custom-radius theme) built from the real theme, not hand-rolled.
- **Builders** — `sectionOf`, `artifactOf`, `textInst`, `imageInst`, `groupRow`/`groupCol` (thin wrappers
  over the real `@model/section` builders).
- **Finders** — `regionById`, `commandsFor(id)`, `bottomOf`, `find(pred)`.
- **`installCanvas2D()`** (happy-dom only) — patches `HTMLCanvasElement.getContext("2d")` to return a
  deterministic 2D context (measureText → length × 8, every other call a no-op), so `measureText`,
  `sectionSlides`, `paintSectionStack`, and the raster smoke tests run under happy-dom without a native
  canvas. This is the raster seam, called in a `beforeAll` of each `*.dom.test.ts`.

---

## Toolchain & conventions

- **Location.** Co-located `*.test.ts` next to source; shared helpers `*.testkit.ts` (not matched by the
  `**/*.test.ts` include, excluded from coverage).
- **Environment.** `node` default; DOM files add `// @vitest-environment happy-dom` at the top.
- **Imports.** Explicit `import { describe, it, expect } from "vitest"` (no globals → no tsconfig change).
- **Strictness.** Tests are linted + typechecked like source (`no-explicit-any`, `noUncheckedIndexedAccess`,
  prettier). A feature: they exercise the real types.
- **Boundaries.** A `canvas/**` test may import `model` + `canvas` only — not `editor`/`ui`/`app` (eslint
  `no-restricted-paths`). This is why registration must have a canvas-side entry (Phase 0a).

---

## Phase 0 — foundation

### 0a. Canvas-side element registration

The registry is a `Map` in `canvas/elements/spec.ts`, populated purely by _importing_ each element file
(side-effect `register(...)`). Today the only aggregate importer is `editor/register.ts` — which a
`canvas/**` test **cannot import** (boundary law). Without it, `getElement` returns `undefined`,
`composeSection` emits red error boxes, and every container op is a silent no-op.

**Fix:** create `canvas/elements/register.ts` holding the ~33 `import "@elements/…"` side-effect lines;
`editor/register.ts` becomes `import "@elements/register"` (+ any editor-only registration). Registration of
the element _library_ now lives in the _canvas_ layer where the library lives, and any canvas test does
`import "@elements/register"` in-boundary. (Touches `editor/register.ts` → coordinate with the in-flight
`@ui` refactor. Fallback: import the specific specs a test needs — all within canvas.)

### 0b. The shared testkit

`canvas/testkit.ts` — the doubles catalog above. This is the whole "mock surface" for the entire suite.

---

## The coverage map (per file, enumerated)

Each entry lists the target, the **real** dependencies it runs against (proof it's not over-mocked), the
allowed seam (if any), and the concrete cases needed to reach the target. `file:line` anchors are current.

### `canvas/engine/layout.ts` → **≥95%** · real: solver + geometry; seam: `measure`

Existing tests cover distribute (even/max/min/fixed/percent/fit-shrink/col-grow), explicit + implicit clip,
and 2-float ordering. Add:

- `distribute` (l.52) termination: all-movable-at-max with leftover slack → overflows and halts inside the
  `64` guard; a mixed set where some children are already at `min` under overflow → only the above-min ones
  shrink; the `0.5` slack no-op boundary.
- `intrinsicWidth` (l.84): text → `measure(∞).width`; row → `padX + gap·(n−1) + Σ childW`; col → `padX +
max(childW)`; a `percent`/`grow` child contributes **0**; a childless image/fill leaf → 0; a nested
  row-inside-col intrinsic.
- `widthSpan`/`crossWidth` (l.102/126): main-axis percent = `avail·value` (post-gap); cross-axis percent =
  `contentW·value`; fit cross clamps to `contentW`; grow cross fills.
- `layoutHeights` (l.182): an **aspect** leaf → `h = w/aspect` **and** always carries `clip{x,y}` (l.191);
  a **bounded row** shorter than its tallest child → `clip{y}` (l.228, test both sides of the `+0.5`).
- `mainOffset` (l.260): `extra≤0 → 0`, center → `extra/2`, end → `extra`.
- `layoutPositions` (l.267): `alignSelf` overrides parent `alignY`/`alignX`; centered child cross-position;
  gaps with N>2 children.
- `emit` (l.321): `opacity<1` multiplies down a subtree and is carried per-command only when `acc<1`;
  a node with `id` produces a `Region` with `radius` from fill/image; within a node paint order is
  rect→image→text→surface; **3+ floats emit in ascending `z`**.
- `clipRect`/`mergeClip` (l.313/20): nested parent∩child (both bounded) → intersection; one axis unbounded →
  `±CLIP_INF` (`1e7`); non-overlapping clips → `w/h` floored at 0; `mergeClip` OR semantics.

### `canvas/engine/layout.ts` — `fragment` → **≥95%** · real: pure; **highest-priority gap**

Pagination — present + export both depend on it, zero tests today.

- Short-circuit: `totalHeight ≤ pageHeight + EPS` → one page (test the `EPS=0.5` boundary); `pageHeight ≤ 0`
  → one page.
- 3 stacked 100px blocks, page 150 → break falls **between** blocks (never mid-block); assert page 2's
  commands are shifted to `y≈0`.
- A command straddling the limit pushes the break **up** to before it.
- A single block taller than a full page → hard break at `limit` (unavoidable split).
- A **clipped** command paginated: `shiftY` moves `clip.y` with `box.y` (l.384).
- A large stack terminates within the `4096` guard.

### `canvas/engine/profile.ts` → **≥95%** · real: pure

- `resolveProfile` (l.46): deck/doc/web by id; unknown → deck; undefined → deck.
- Pin `PROFILES` (l.8): deck 1280×720 / maxContent 1120 / splitMin 520 / paginate "always"; doc / web rows.
- `slideFrame` (l.57): deck default 1280×720 ✓; aspect override ✓; `aspect ≤ 0` falls back; a **continuous**
  profile (doc) frame.
- `previewContentProfile` (l.74): web + deck pass through unchanged (same ref); doc grows with viewport;
  floored at `editorMax` (small `fullW`) and capped at `1440` (huge `fullW`); returns the same ref when
  `wide === editorMax`.

### `canvas/engine/node.ts` — types only

No runtime; N/A for coverage (v8 reports it as inert). Nothing to test.

### `canvas/render/geometry.ts` → **100%** · real: pure; seam: `window` dims

- `scaledHostCss` (l.9): base string + `center` variant offsets — inline snapshot.
- `fitToViewport` (l.24): width-bound vs height-bound `min`, with `window.innerWidth/Height` set (happy-dom).

### `model/section.ts` → **100%** · real: pure, registry-free

- `LAYOUT_PRESETS` values; `withWidth`; `rowGroup` even vs explicit widths (pct rounding); `colGroup`;
  `emptyRegion`; `childrenRaw` array vs non-array; `updateAtPath` root/deep/missing-path; `removeAtPath`
  root (→ empty region) / deep.

### `canvas/elements/ops.ts` → **≥95%** · real: **real registry** (group/card/text/image) + real section builders

The drag/drop/inspector safety net. Register real elements — never fake `getElement`. Assert both the result
tree **and** input immutability.

- Access: `getElementAt` deep path; `stripWidth` drops now-empty `layout` (l.56); `updateDataAt` /
  `setElementAt` / `setElementLayout` leave the input unmutated.
- Remove/collapse: `removeAt` root → `emptyRegion` (l.137); `renormalizeWidths` — delete 1 of 3 equal cols →
  50/50 (l.155); `fixContainer` unwraps a redundant single-child group, hoisting width (l.170);
  `collapseAlong` collapses **only** the emptied path, leaving unrelated empty regions (l.179);
  `deleteElement` = remove + collapse (l.205).
- Insert: `insertChild` clamps index, no-ops on a non-container (l.213); `wrapWith` before/after strips the
  wrapped width (l.230); `replaceAt`.
- Duplicate: `duplicateAt` deep + root (→ `colGroup([inst, clone])`, l.259); `duplicatedAddr` landing slot.
- Columns/presets: `addColumn` even-splits + single-col path `[]` (l.288); `splitRoot` pad-grow vs
  merge-shrink-into-last (l.306); `splitSection` / `applyLayoutPreset` known + unknown preset;
  `columnFractions` even vs explicit (l.336).
- Section-level: `insertSection` clamp; `removeSection` **keeps ≥1** (l.374); `moveSection` clamp/no-op;
  `duplicateSection` newId + clone; `setSectionBackground/Bleed`, `setArtifactTheme/Format`.

### `canvas/elements/compose.ts` → **≥90%** · real: registry + `DEFAULT_THEME.tokens` + real profiles; seam: `measure`

Run real composition of real sections; assert the produced `EngineNode` + region ids.

- `applyLayout` (l.89): width fit/fill/pct; height "fill" **clears aspect** (l.97); `align → alignSelf`;
  radius targets `image.radius` then `fill.radius`.
- `readableAccentOnDark` (l.144): accent ≥0.45 luminance passthrough; darker → lifted toward 0.62; non-6-hex
  passthrough.
- `bgIsDark` (l.151): none → false; explicit `dark`; image → **always true**; color/gradient via luminance.
- `sectionContentTokens` (l.180): dark bg → `onDark` tokens; light → theme.
- `composeElement` (l.110): unknown type → red error box carrying the element id; empty container →
  `emptyRegionNode`; nested container recurses; node tagged with `elementRegionId(addr)`.
- `composeSection` (l.184): dark-bg theme swap; `web` band widens inner to `innerMax` + centers;
  `radius = 0` when bleed/continuous else `theme.radius`; `framed = !bleed && !continuous` gates shadow;
  border only when framed **and** light bg; background branch order image → gradient → color → surface.

### `canvas/elements/layouts.ts` → **≥90%** · real: registry (roleOf by category) + section builders

- `sectionBlocks` (l.37): role tagging + `flatten` unwrapping nested `group` scaffolding.
- `fractionsMatch` (l.94): the `0.02` tolerance, just inside vs just outside.
- each `splitPreset`: `matches` via `columnFractions`, `transform` via `splitSection`.
- `media-right`/`-left`/`-top`: `applies` (has media + content), `matches` (`twoUp` role order), `transform`.
- `media-bleed` (l.159): an image with a `src` → `background.kind:"image"`, `bleed:true`, `scrim ?? 0.4`.

### `canvas/elements/skeletons.ts` → **100%** · real: pure, no theme

`barsSkel` / `discSkel` / `twinDiscSkel` / `dotsSkel` / `bandsSkel` / `boxesSkel` / `gridSkel(rows,cols)` /
`treeSkel` — assert node structure + child counts (e.g. `gridSkel(2,3)` → 6 cells).

### `canvas/elements/blueprint.ts` → **≥95%** · real: pure, no theme/registry

- `placeholderBlock(kind)` (l.26): each mapped kind (image/stat/chart/diagram/table/bullets/quote/cards) +
  the default.
- `placeholderSection(plan)` (l.98): uses `LAYOUT_PRESETS[plan.layout ?? "full"]`, one column per block,
  trailing-image guess (`plan.image && n>1 && i===n−1`).

### `canvas/elements/spec.ts` → **≥90%** · real: registry + real theme for `skeletonFor`

- `register`/`getElement`/`listElements` (l.13-21): register a spec, read it back; unknown → undefined.
- `walkElements` (l.27): DFS order; undefined root → no-op; non-array `children` ignored.
- `SECTION_CONTROLS` (l.118): the `visibleWhen` closures (bgColor iff `bgKind==="color"`, bgImage iff image,
  scrim iff image, gradient stops iff gradient).
- Ghost builders `bar`/`pill`/`dot`/`block` (l.203-222): radius rules (`bar` `min(4,h/2)`, `pill` 99).
- `textBars` line-count thresholds (`>60→3`, `>20→2`, else 1) and the width-fraction clamp.
- `skeletonize` (l.256): text → bars; media leaf → single panel (`aspect ?? 16/9`, radius); container →
  panel fill + recurse, border preserved only if the original had one.
- `skeletonFor` (l.299): honors `spec.skeleton` when present, else `skeletonize(spec.layout(create()))` —
  run against a real registered element.

### Element specs — `text/ media/ basic/ table/ composite/` → **≥85% per category** · real: registry (self + children) + `tokens`; seam: `recordingDrawContext` for shape surfaces

Each `layout`/`arrange` is pure given a real `LayoutCtx`; containers compose real children. Assert the
produced node (sizes, `fill`/`text`/`image` leaves, structure) — not pixels. One file per category:

- **text**: `text` STYLE table per role (l.31) + display weight from `theme.headingWeight` + marks → runs
  only when non-empty (l.77); `bullets` marker kinds number/dash/check/dot; `callout` `toneColor` table;
  `quote`; `code` line-split, empty line → `" "`.
- **media**: `imageLike` — `zoom` percent→fraction (l.38), aspect/radius defaults, `fit` cover/contain,
  resize bounds `{0.4,2.6}`; `avatar` round + accent ring; `video` 16:9 dark box + play glyph; `icon` bakes
  `currentColor → iconColor(role)`.
- **basic**: `shape` `ellipsePath` kappa `0.5523` / `starPath` inner `0.42` / stroke inset — via recording
  ctx; `button` `SIZES` + `shapeRadius` sharp/pill/rounded + variant fills; `divider`/`spacer`/`gradient`/
  `badge`/`embed` node shapes.
- **table**: `grid(d)` legacy string parse + cell pad to `rows*cols` (l.56), `MAX_COLS/ROWS` clamps;
  `arrangeTable` header bold/body soft, zebra, cell width `1/cols`.
- **composite**: `group.crossAlign` **inferred from text children** (l.27) + explicit override — the
  high-value one; `card` 5 styles + unknown-child throw; `faq` pairs kids two-at-a-time; `stat`/`feature`/
  `profile`/`testimonial`/`pricing`/`cta` arrange shape (pricing embeds bullets → children registered).

### Charts — `canvas/elements/chart/` → **≥85%** · real: d3-scale/shape + registry; seam: `recordingDrawContext`

- **`utils.ts`** (pure): `parseSeries` drops non-finite/empty, legacy single-line (l.98); `normalize` type
  fallback chain + `showGrid` default true (l.113); `catList`; `seriesColors` ramp steps
  `[1,.7,.48,.32,.22]` + categorical hue offsets + **saturation `<0.14` → lightness-ramp fallback** (l.171);
  `fmt` `1e3`/`1e6` thresholds (l.211); `yMax` stacked vs plain (l.222).
- **`render.ts`** `renderChart` (l.23): bail on no points; type fallback "bar".
- **per-type render**: a data-driven suite over all 13 (`bar/line/area/pie/donut/radar/column/scatter/
bubble/funnel/gauge/heatmap/treemap`) asserting via recording ctx — "valid data → ≥N draw calls of the
  expected kind, no throw"; "empty series → no throw, no marks". Then spot-check the notable gating: bar
  value labels only when `groups===1`, treemap skips cells `<46×24`, gauge `frac=clamp(value/max)`.

### Diagrams — `canvas/elements/diagram/` → **≥85%** · real: d3-hierarchy + registry; seam: `recordingDrawContext`

- **`utils.ts`** (pure): `parseEdges` `"A->B:label"` drops malformed (l.89); `normalizeDiagram` (l.110);
  **`buildTree`** root = node never a `to`, else first; no edges → star; cycles/diamonds cut by visited set
  (l.311); `layoutTree` scale-to-fit, **never upscales** (l.369).
- **per-type render**: data-driven over all 12 (`process/cycle/pyramid/funnel/timeline/venn/quadrant/matrix/
tree/org/mindmap/flow`) — "valid → draws, empty → no throw" + spot-check `venn` 3 circles, `matrix`
  `ncol=ceil(sqrt(n))`.

### `canvas/render/commands.ts` → **≥85%** · real: compose + registry + solver; seam: `measure` / `textMetricsCtx`

Split the pure bridge from the DOM-measure part.

- Pure/injectable: `runFont` (l.255) italic/bold/code/size combos — inline snapshot; `ctxFor` defaults
  (l.28); `layoutSection` (l.40) height container `100000`, `height = bottom`; `layoutNode` (l.227);
  `layoutSlide`/`prepareSlideNode` (l.170/133) — the collapse-probe: a section that fits → single scaled
  node; a **tall** section with one media cell → `coverFitMedia` grows the media (cover) and the probe pins
  `node.h`; the `targetH ≤ h·1.2 → one page else fragment` decision. Drive via the **measure-injecting**
  entry points (real compose, real registry, stub `measure`) — no DOM.
- Text wrap/measure (via `textMetricsCtx`, the real algorithm): `layoutRuns` (l.351) greedy run-aware wrap,
  `lineHeight = size·1.35` default, noWrap when `wrap==="none"`/`!isFinite`, width clamp; `measureUncached`
  plain path (split `\n`, widest hard line, greedy wrap, empty line still one row); `tokenize` collapses
  consecutive whitespace to one glue; `measureKey` collapses width-independent measures to `"*"` (l.470);
  `measureText` **FIFO-evicts** the oldest quarter at `6000` (insert cap+1 distinct keys, assert eviction);
  `clearMeasureCache`.

### `canvas/render/backends.ts` → **≥75%** · split pure / DOM / raster

- **Pure → 100%**: `backdropCss` (l.532) branch table none/image+scrim/gradient/color — inline snapshot;
  `sectionLayoutWidth` (l.571) bleed/web → fullW else `min(fullW−64, maxContent ?? 1080)`;
  `createSectionStackCache` factory; the `renderSlidePage` fit/offset arithmetic (`fit=min(1,h/contentH)`,
  centered offsets — extract if needed to assert without raster).
- **DOM (happy-dom, real `document`) → ~70%**: `applyCommand` (l.142) — a div gets the right position/size/
  opacity/`clip-path` insets/fill/gradient/border/image/text (assert real inline styles); `paint` → N
  children; `paintReconcile` reuses slots + drops extras; `canvasDrawContext` (l.63) align mapping +
  `measureText` passthrough (via recording 2D ctx); `paintSectionStack` (l.585) `tops` accumulation,
  region-offset, `y += height + gap`, hide/dim (needs `installCanvas2D`); `fitSlideContent`.
- **Raster (happy-dom + recording 2D, smoke)**: `renderToCanvas`/`drawCommands`/`drawImageFit`/
  `roundRectPath` — assert **no-throw** and that the expected draw calls fire; never assert pixels. Images
  stubbed (IO seam).

### `canvas/render/present.ts` → **≥85%** · happy-dom + `installCanvas2D`

- `sectionSlideCount` (l.13): short section → 1; a `>1.2×` section → `>1`.
- `slideElement` (l.25): builds a slide `<div>`, clamps `page` to `[0, len−1]`.

### `canvas/render/export-geometry.ts` → **100%** · pure

Done — the page/raster arithmetic was extracted out of `export.ts` into this module and unit-tested:
`slidePdfPageSize` (fixed page width, aspect-preserving height), `docPageGeometry` (`contentPtW`, px→pt
`scale`, `pageContentPxH = (A4_H − 2·margin)/scale`), `deckPngCanvasSize` (widest slide × summed heights).
`export.ts` is now a thin IO shell that calls these — excluded from coverage (below).

---

## What can't (and shouldn't) hit 100% — and how we stay honest

Chasing 100% on these produces fake tests. We handle them explicitly instead of letting them silently drag
the number:

- **Pure type files** (`engine/node.ts`): no runtime. Inert in coverage; nothing to write.
- **IO shells** — `download()`, `window.print()`, `canvas.toBlob`, `URL.createObjectURL`, `Image` decode,
  `document.fonts` listener. The move — **done for `export.ts`** — is to extract the pure geometry out (into
  `export-geometry.ts`, tested) and leave only the shell, which is added to `coverage.exclude` with a
  one-line comment naming why. We do **not** "cover" a shell by asserting a stub was called.
- **Per-type chart/diagram renderers**: covered at the "draws the right call kinds / doesn't crash on empty"
  level, not pixel-exact. Exact geometry is d3's job (its own tests), not ours.

Any place the suite bounds coverage (excluded shell, smoke-only raster) is named here and in the config, so
a green run never reads as "everything is verified" when it isn't.

---

## Coverage milestones & enforcement

Baseline **~6%**. Targets are for `canvas/**` (+ the pure `model/**` helpers pulled in). The realistic
near-full ceiling is **~87%** overall — the IO shell is honestly excluded, not faked.

| Milestone | Tiers                                         | Overall canvas | Per-dir thresholds turned on          |
| --------- | --------------------------------------------- | -------------- | ------------------------------------- |
| M1        | engine (layout+fragment+profile) + geometry   | ~30%           | `engine/**` ≥ 95                      |
| M2        | ops + section + compose + layouts + skeletons | ~55%           | `elements/{ops,compose,layouts}` ≥ 90 |
| M3        | element specs + spec.ts + blueprint           | ~70%           | `elements/**` ≥ 85                    |
| M4        | chart/diagram utils + renderers               | ~78%           | `elements/{chart,diagram}/**` ≥ 82    |
| M5        | commands (pure + measure) + render geometry   | ~83%           | `render` pure ≥ 90                    |
| M6        | backends DOM + present (happy-dom)            | ~87%           | `render/**` ≥ 70                      |

Enforcement: thresholds stay **off** until a directory is populated, then flip on **per-directory** in
`vitest.config.ts` (`coverage.thresholds`) as each milestone lands — so a regression that drops covered code
fails CI, without one global number blocking early progress. Ratchet up, never down.

---

## Out of scope here (later tracks)

- **Solid component tests** (`ui/`, `editor/`, `app/`): a separate Vitest _project_ with `vite-plugin-solid`
    - happy-dom + `@solidjs/testing-library`. The canvas suite avoids the Solid transform to stay fast. Plan
      after M2.
- **Backend/services** (`services/`): Hono routes + Drizzle against a throwaway Postgres — its own track.
- **Export byte output**: geometry tested here; the actual PDF/PNG bytes stay manual QA.
- **Visual regression**: replaced by structural assertions; revisit only if a rendering bug slips the
  invariant tests.

---

## Immediate next actions

1. **Phase 0a** — `canvas/elements/register.ts` (coordinate on `editor/register.ts`).
2. **Phase 0b** — `canvas/testkit.ts` (measure · textMetricsCtx · recordingDrawContext · tokens · builders ·
   finders · installCanvas2D).
3. **M1** — finish the engine: `fragment` (top gap), `clipRect` intersection, multi-float z, opacity,
   aspect-clip; then `profile`/`geometry`.
4. **M2** — `ops.test.ts` + `section.test.ts` (the drag/drop/inspector safety net), then compose/layouts.

Land each milestone as its own green commit that moves a directory's number.
