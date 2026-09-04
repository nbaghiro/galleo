# Planning — the performance round

> The implementation plan for the audit's performance items (P1–P8 in
> [`engine-audit.md`](engine-audit.md)), ordered by the measured numbers from the 2026-09-02
> quantification rather than by the original guesses. Every claim below was re-verified against
> the tree on 2026-09-03 before this plan was written — all eight hold, none was fixed by the
> in-flight sibling work. **Status: built 2026-09-03**, phases A → B → C → E → D, each landed green
> (typecheck, lint, full vitest, every `check:*` guard) with `eval:shots` unchanged after B and D
> ("all 592 checks pass", `aria/s9` the known exception). Deviations are recorded per phase below.

Companion docs: `engine-audit.md` (findings + the measured addendum), `loading.md` (the windowing
architecture and its measured table, which phase B extends and must not regress).

The shape of the round, in one line: layout is measured ~free, so nothing here touches the solver —
the work is bytes (A), DOM (B), font correctness (C), image bytes (D), and hygiene (E).

## The discipline

Each phase lands independently green: typecheck, lint, full vitest, every `check:*` guard, and
`eval:shots` unchanged (every phase is geometry-neutral by construction; the run proves it where a
phase touches layout-adjacent code). Acceptance is stated per phase in measurable terms. The
do-not-regress list from the audit binds throughout — most of this round works _inside_ designs on
that list (the windowing, the reconciler, the identity caches), extending rather than replacing
them. No suppressions, no `any`, terse comments, no new source files except the one named in C.

---

## Phase A — pdf-lib off the main bundle (P4)

The largest single measured number: 512 KB minified pre-gzip parsed on every app load, for an
export most sessions never open. Verified: `pdf-lib` has exactly two value importers
(`canvas/render/export.ts:15`, `canvas/render/pdf-draw.ts:3` — four values: `rgb`,
`LineCapStyle`, `PDFString`, `StandardFonts`; the rest already type-only) and one consumer
(`editor/panels/ExportModal.tsx`). pptxgenjs / jszip / wawoff2 / fontkit are already dynamic.

Design: a memoized `loadPdfLib()` in `pdf-draw.ts` (`let mod: Promise<typeof import("pdf-lib")>`),
awaited at the top of the entry functions in both files; all remaining top-level imports become
`import type`. The four values arrive through the loaded module. This is the exact pattern
`fonts.ts:53` already uses for fontkit.

- Rejected option: `lazy()`-splitting ExportModal itself. Objection: the modal is small; the
  payload is pdf-lib, and route-splitting is a separate decision the measurements rank lower.
- Acceptance: `pnpm build` chunk report shows pdf-lib out of the entry chunk; export still works
  (existing export tests + one manual PDF export in QA).
- Tests: existing `export.test.ts` suite unchanged and green (it exercises the now-async path).
  Size: S. Risk: low; the only behavioural change is first-export latency (one-time fetch).

**Built.** `loadPdfLib()` + a `pdfLib()` accessor in `pdf-draw.ts`; `buildPdfAuto` awaits the loader,
`buildFontBook` awaits it for `StandardFonts`, and every remaining `pdf-lib` import in both files is
`import type`. Chunk report: the app entry went 1,231.79 kB (gzip 421.30) to 811.45 kB (gzip 246.71),
with pdf-lib landing in its own 382.49 kB chunk plus its 45.19 kB `pako` dependency, both lazy.
Deviations: (1) the plan's inventory said four values, but `export.ts` imports ten (`PDFDocument`
plus the nine content-stream operators), all now routed through `pdfLib()`; (2) `pdf-draw.test.ts`
gained one line, `beforeAll(loadPdfLib)`, because it calls the synchronous emitters directly rather
than through an export entry.

## Phase B — the editor's DOM leaks (P1-thumb, P2, + two P8 riders)

The dominant editor-side costs at scale, all in two files already being touched together.

**B1 — Thumb reconciles instead of tearing down (P1).** The minimap Thumb full-teardown
`paint(commands, inner)` on every edit (`editor/Canvas.tsx:1084`) measures ~20× the reconciled
cost. Fix: export the stack's own `paintReconcile` from `backends.ts` (it is the battle-tested
reconciler the section layers use) and have Thumb keep its node array per instance. The panels
paint at `Canvas.tsx:246` gets the same treatment if it proves trivial, else recorded.

- Acceptance: a keystroke no longer rebuilds the thumb subtree (assert node identity across two
  paints in a dom test).

**B2 — the minimap rail windows (P2).** Thumbs latch `seen` forever (`Canvas.tsx:1039-1040`): a
200-section doc accumulates ~3,750 retained nodes — a second DOM copy of itself. Fix: the same
IntersectionObserver that sets `seen` also clears it when the thumb leaves a retention band
(~1500px, versus the 300px paint-in margin, so the two thresholds cannot churn), tearing the
painted subtree down while the thumb's own fixed-aspect box keeps rail geometry exact. This is
`loading.md`'s materialize-the-window rule applied to the rail.

- Rejected option: cap the rail at N painted thumbs by index distance. Objection: a second
  windowing vocabulary beside the IO the Thumb already owns.
- Acceptance: scrolled far through a long doc, the rail holds a bounded number of painted thumbs
  (dom test over a synthetic 60-section artifact).

**B3 — two riders in the same files (P8).** `openPopups()` walks the whole artifact per draw
(`Canvas.tsx:205`) → becomes a `createMemo` keyed on artifact identity, so scroll repaints between
edits hit the memo. `paintSectionStack`'s closing `host.replaceChildren(...layers)`
(`backends.ts:1185`) → skipped when membership and order are unchanged (one array compare).

- Tests: memo identity (same artifact → same result object); a stack repaint with an unchanged
  window leaves `host.children` identity intact.
  Size: S + S + XS. Risk: the reconciler and the windowing are on the do-not-regress list — B extends
  both with their own mechanisms, and the existing backends.dom + loading suites are the containment.

**Built.** `paintReconcile` is exported; the Thumb and the panels paint both call it (the Thumb also
states `position:relative` itself, which `paint` used to force). The rail windows: the thumb paints
in at 300px and releases at 1500px, and the release is `paintReconcile(inner, [])`, which leaves the
wrap's measured height so the rail's geometry does not move. `openPopups` memoizes on artifact
identity, and `paintSectionStack` skips `replaceChildren` when the layers and their order are
unchanged.
Deviations: (1) one `IntersectionObserver` cannot carry two rootMargins, so the hysteresis is two
observers on the same element and root, which is still the IO vocabulary the design chose; (2) the
Thumb needs no node array of its own, since `paintReconcile` reconciles against the host's children;
(3) `openPopups` is an identity cache rather than a `createMemo`, which would be a computation
created outside a root, and the cache gives the same identity guarantee while staying testable
without one; (4) B2's "bounded rail" assertion needs a Solid-render test project, which the repo
does not have (`testing.md` §1: the component surface is unbuilt, 0 tests). What is covered instead
is the mechanism it is built from: node identity across a repaint, and the teardown-to-empty that
leaves the host's box intact. The rail itself is on the manual QA sheet.
The `loading.md` measured table was not re-run: there is no harness in the repo for it (the numbers
came from an ad-hoc measurement), and B changed only the repaint path, leaving the layout, paint and
DOM-node columns as they were. The table awaits a re-run.

## Phase C — fonts-settled invalidation everywhere (P5, promoted to correctness)

Verified: `loadingdone` listeners exist in exactly three places (`commands.ts:773` clears the
measure cache; `editor/Canvas.tsx:727` and `ThemeEditor.tsx:324` drop their stack caches and
repaint). Publish, Present, `ScaledSectionCanvas`, previews/plates, and the minimap keep layouts
solved against fallback metrics for the whole session — on publish that is first-load wrap drift,
wrong rather than slow.

Design: one new concept file, `ui/fonts.ts` — a module-level Solid signal `fontsGeneration()`
bumped by a single `loadingdone` listener (canvas stays framework-free, so the signal cannot live
there; it is consumed by ≥3 ui/app surfaces, which is the bar for a new `@ui` file). Every
font-dependent paint effect reads it: `ui/section.tsx`'s layout effect, `ui/present.tsx`'s
surfaces (clearing their stack caches, the Canvas.tsx `onFonts` pattern generalized),
`app/components/previews.tsx`'s plates, and the publish stack. The editor keeps its existing
listener (already correct).

- Rejected option: folding a generation number into every stack-cache key. Objection: a key
  change invalidates without _repainting_ — windowed surfaces would still show stale wraps until
  the next scroll; the signal triggers the repaint the fix exists for.
- Acceptance: a dom test that bumps the generation and observes a `ScaledSectionCanvas` re-layout;
  manual QA on publish (hard-reload, watch the first paint settle once fonts arrive).
  Size: S. Risk: low; each surface re-runs an effect it already owns.

**Built.** `ui/fonts.ts` holds the module-level signal and one listener (`ready` as well as
`loadingdone`, since a cached face can settle before a surface mounts), plus
`createFontsInvalidator(cache)`, the dependency a surface that holds a layer cache reads inside its
paint effect. Consumers: `ui/section.tsx`'s layout effect, `ui/present.tsx`'s render effect (which
is publish's too), `previews.tsx`'s plate and preview canvas, and the minimap Thumb.
Deviations: (1) the Thumb was added, because P5's finding names the minimap among the stale surfaces
and the editor's own listener only covers the stack; (2) the acceptance test asserts the re-layout
at the cache the effect drives (a settled face replaces the cached entry, an unsettled one does
not) rather than through a rendered `ScaledSectionCanvas`, for the same missing-component-project
reason as B; a control case in the same file pins what a surface without the dependency still does.

## Phase D — thumb-grade assets for scaled paints (P7)

The only network/decode lever: a 176–244px tile fetches and decodes the same editor-grade asset
the canvas uses. `thumbUrl` exists on `MediaItem` (`model/media.ts:33`) and dies in the picker UI.

Design, following the enrichment seam that already exists:

- `MediaData.thumbSrc?: string`, written at pick time via a `thumbKey` sibling-key on the media
  control — the exact `posterKey`/`dimsKey` mechanism (`SharedControlFields.tsx:363-371`, one more
  branch).
- `ImageLeaf.thumb?: string`, composed from `thumbSrc` by the media element.
- The paint side chooses: `paint`/`paintReconcile`/`paintSectionStack` gain a render option
  (`assets: "full" | "thumb"`), defaulted `"full"`; `ScaledSectionCanvas` and the preview plates
  pass `"thumb"` (they are small by construction), editor/present/publish stay full. The DOM
  backend picks `im.thumb ?? im.src` under `"thumb"`; the canvas path likewise (exports never pass
  it).
- AI-sourced images: `resolveImages`' adopt path stores the stock item, whose `thumbUrl` the media
  store already carries — the adopt write also fills `thumbSrc` where the item has one. Recorded
  as in-scope only if the write site is one place; otherwise deferred and noted.
- Rejected option: choosing by painted box size inside the backend. Objection: the backend knows
  layout px, not CSS scale — the surface is the only honest owner of "I am small".
- [media-merge] coordination: `canvas/elements/media/element.ts` and `app/components/previews.tsx`
  are sibling-hot files. Phase D runs LAST among the code phases, with the bug round's pre-flight:
  re-read, skip-and-record if moved, never touch foreign hunks.
- Acceptance: a library tile's painted DOM carries the thumb URL; the editor's carries the full
  URL (dom tests); visual spot-check in QA.
  Size: M. Risk: moderate — it widens a paint signature; mitigated by the default keeping every
  existing caller byte-identical.

**Built.** `MediaData.thumbSrc` (written by a `thumbKey` sibling-key branch beside `posterKey` and
`dimsKey`), `ImageLeaf.thumb`, and `RenderAssets = "full" | "thumb"` on `paint`, `paintReconcile`
and `paintSectionStack`, defaulted `"full"`. `ScaledSectionCanvas` and `ArtifactPlate` pass
`"thumb"`; every other call site was grepped and passes nothing, so it is byte-identical.
Pre-flight: `canvas/elements/media/element.ts` and `app/components/previews.tsx` both carried the
media-merge sibling's in-flight focal-point work, unchanged from the earlier read. Nothing of theirs
was touched: the new field sits beside `poster` in `MediaData`, the new `thumb` beside `src` in the
composed image, and the backend's one `imageSrc(im, assets)` read is disjoint from their
`focus`/`object-position` hunks.
Deviations: (1) the AI adopt path is **deferred**, on the entry's own condition. The write site is
not one place: `resolveImage` returns a url that `mapMediaRefs` substitutes for another url, so
filling a sibling `thumbSrc` would mean widening that shared walk to carry two values. An
AI-sourced picture keeps painting its full asset, which is the correct fallback. (2) The 2D canvas
path was left alone, since nothing that paints through it is scaled (present slides and every export
are full size), and adding the option there would be dead surface. (3) The minimap Thumb is another
honest `"thumb"` candidate and was left as the plan wrote it; noted rather than taken.

## Phase E — hygiene, measured small (P3, P6, P8-remainder)

Each demoted by measurement to single-digit ms; done here because the round has the files open.

- **P3**: `opts.placeholder` is invoked before the reuse check (`backends.ts:1082`). Split the
  contract: a cheap `pending?: (s: Section) => boolean` feeds the cache key; the ghost lays out
  only on miss. Call sites (editor Canvas, previews, publish) adjust.
- **P6**: a per-instance `WeakMap<Section, number>` slide-count memo in `ui/present.tsx`
  (invalidated by surface identity, which theme/profile changes already recreate); the overview
  and `ExportModal`'s page count read the same memo.
- **P8-remainder**: measure-cache eviction becomes LRU (refresh recency on hit — two lines at
  `commands.ts:760`), closing the multi-artifact-marathon edge the measurements found unreached
  but possible.
- Tests: ghost-not-laid-out-on-reuse (spy via the pending callback), slide-count memo identity,
  LRU refresh order.
  Size: XS–S each. Risk: negligible.

**Built.** P3: `pending?: (section) => boolean` keys the cache and `placeholder` is consulted only
on a miss, for a section `pending` names; the entry records the flag that was asked for rather than
what came back, so a pending section whose stand-in the caller declines still reuses. The editor is
the only production caller; four tests moved to the split contract. P6 and P8-remainder as designed.
Deviation: the slide-count memo lives in `canvas/render/present.ts` (module-level, keyed on section,
tokens and profile identity) rather than per-surface in `ui/present.tsx`. That is the only place all
three consumers can share one, which is what the entry asks for, and `ExportModal` now counts
through `sectionSlideCount` instead of inlining `sectionSlides(...).length`. It carries a
`loadingdone` reset of its own, because real metrics can repaginate a section and a memo of a
measured layout must not outlive the measurement. `MEASURE_CACHE_CAP` is exported for the eviction
test.

## Sequencing and gates

A → B → C → E → D (D last for the sibling pre-flight; E before D because it shares no files with
anything). Each phase: typecheck, lint, full vitest, guards, and `eval:shots` after B and D (the
two that touch paint paths) — expected unchanged, stated per phase. Bundle acceptance for A comes
from the `pnpm build` chunk report, quoted in the completion report. The `loading.md` measured
table is re-run once at the end of B so the doc's numbers stay honest.

## What this round does not do

Route-level code splitting (ranked below A by the measurements), windowed-publish screen-reader
exposure (recorded under item 18 — an a11y-vs-windowing decision, not a speed fix), upload-time
thumbnail generation for user uploads that lack one, and every E/L/U item from the audit.
