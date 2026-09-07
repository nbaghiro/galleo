# The performance round

> The performance work over the engine audit's measured items, ordered by the 2026-09-02
> quantification rather than by the original guesses. The shape of the round, in one line: layout
> measured ~free, so nothing here touches the solver — the work was bytes, DOM, font correctness,
> image bytes, and hygiene. Measured outcome: the app entry chunk went from 1,231.79 kB
> (gzip 421.30) to 811.45 kB (gzip 246.71).

Companion docs: `.docs/planning/engine-audit.md` (the findings and the measured addendum),
`loading.md` (the windowing architecture and its measured table). Everything here works _inside_
designs on the audit's do-not-regress list — the windowing, the reconciler, the identity caches —
extending rather than replacing them.

## pdf-lib off the main bundle

The largest single measured number: 512 KB minified pre-gzip parsed on every app load, for an
export most sessions never open. A memoized `loadPdfLib()` in `canvas/render/pdf-draw.ts`
(`let mod: Promise<typeof import("pdf-lib")>`) is awaited at the top of the entry functions
(`buildPdfAuto` in `canvas/render/export.ts`, `buildFontBook` for `StandardFonts`); the
synchronous emitters below reach the loaded module through the `pdfLib()` accessor, and every
remaining `pdf-lib` import in both files is `import type`. This is the exact pattern
`canvas/render/fonts.ts` uses for wawoff2; pptxgenjs / jszip / wawoff2 / fontkit were already
dynamic. `export.ts` routes ten values through the accessor (`PDFDocument` plus the nine
content-stream operators — more than the four the pre-work inventory counted).

- Rejected option: `lazy()`-splitting ExportModal itself. Objection: the modal is small; the
  payload is pdf-lib, and route-splitting is a separate decision the measurements rank lower.
- The chunk report: pdf-lib lands in its own 382.49 kB chunk plus its 45.19 kB `pako` dependency,
  both lazy. The only behavioural change is first-export latency (a one-time fetch).
- `pdf-draw.test.ts` carries a `beforeAll(loadPdfLib)`, because it calls the synchronous emitters
  directly rather than through an export entry.

## The editor's DOM

The dominant editor-side costs at scale, all in `editor/Canvas.tsx` and
`canvas/render/backends.ts`.

**The minimap Thumb reconciles instead of tearing down.** The Thumb's full-teardown repaint on
every edit measured ~20× the reconciled cost. `paintReconcile` — the battle-tested reconciler the
section layers use — is exported from `backends.ts`, and both the Thumb and the panels paint call
it. The Thumb states `position:relative` itself (which the teardown `paint` used to force), and
needs no node array of its own, since `paintReconcile` reconciles against the host's children.

**The minimap rail windows.** Thumbs used to latch `seen` forever: a 200-section doc accumulated
~3,750 retained nodes — a second DOM copy of itself. The rail now applies `loading.md`'s
materialize-the-window rule: a thumb paints in when it nears the viewport and releases when it
leaves a much wider retention band, so the two thresholds cannot churn. One `IntersectionObserver`
cannot carry two rootMargins, so the hysteresis is two observers on the same element and root —
`THUMB_PAINT_MARGIN` (`"300px 0px"`) paints in, `THUMB_KEEP_MARGIN` (`"1500px 0px"`) retains
(`editor/Canvas.tsx`). The release is `paintReconcile(inner, [])`, which leaves the wrap's
measured height so the rail's geometry does not move.

- Rejected option: cap the rail at N painted thumbs by index distance. Objection: a second
  windowing vocabulary beside the IO the Thumb already owns.

**Two riders in the same files.** `openPopups()` (`editor/core/leaf.ts`) is an identity cache
keyed on artifact identity, so scroll repaints between edits skip the whole-artifact walk — a
cache rather than a `createMemo`, which would be a computation created outside a root; the cache
gives the same identity guarantee while staying testable without one. `paintSectionStack`'s
closing `replaceChildren` is skipped when layer membership and order are unchanged (one array
compare).

**Test posture.** The repo has no Solid-render test project (`testing.md` §1: the component
surface is unbuilt), so what is pinned is the mechanism the rail is built from — node identity
across a repaint, and the teardown-to-empty that leaves the host's box intact — rather than a
rendered rail.

## Fonts-settled invalidation everywhere

Promoted from a performance item to correctness: `loadingdone` listeners existed in exactly three
places (the measure cache, the editor canvas, the theme editor), so publish, Present, the scaled
section canvas, previews/plates and the minimap kept layouts solved against fallback metrics for
the whole session — on publish that is first-load wrap drift, wrong rather than slow.

`ui/fonts.ts` owns the fix: a module-level Solid signal, exported as `fontsGeneration`, bumped by
one listener for the whole app — on `ready` as well as `loadingdone`, since a cached face can
settle before a surface has even mounted. (Canvas stays framework-free, so the signal cannot live
there; it is consumed by well over the ≥3 surfaces that justify a `@ui` file.)
`createFontsInvalidator(cache)` is the dependency a surface holding a stack cache reads inside its
paint effect: it tracks the generation and drops the cached layers when the faces settled since
that surface last painted, so the repaint it triggers re-measures for real. Consumers:
`ui/section.tsx`'s layout effect, `ui/present.tsx`'s render effect (which is publish's too),
`app/components/previews.tsx`'s plates, and the minimap Thumb (the editor canvas's own listener
covers only the stack). The measure cache keeps flushing itself on the same event in
`canvas/render/commands.ts`; this is the repaint half.

- Rejected option: folding a generation number into every stack-cache key. Objection: a key
  change invalidates without _repainting_ — windowed surfaces would still show stale wraps until
  the next scroll; the signal triggers the repaint the fix exists for.

## Thumb-grade assets for scaled paints

The only network/decode lever: a 176–244px tile used to fetch and decode the same editor-grade
asset the canvas uses. The enrichment follows the seam that already existed:

- `MediaData.thumbSrc` (`canvas/elements/media/element.ts`) is written at pick time via a
  `thumbKey` sibling-key branch on the media control — the exact `posterKey`/`dimsKey` mechanism
  in `editor/panels/SharedControlFields.tsx`.
- `ImageLeaf.thumb` is composed from `thumbSrc` by the media element.
- The paint side chooses: `paint`, `paintReconcile` and `paintSectionStack` take
  `RenderAssets = "full" | "thumb"`, defaulted `"full"`. `ScaledSectionCanvas` and `ArtifactPlate`
  (both `ui/section.tsx`) pass `"thumb"` — they are small by construction; every other caller
  passes nothing, so editor, present, publish and every export are byte-identical. The DOM
  backend's one read is `im.thumb ?? im.src` under `"thumb"`.

- Rejected option: choosing by painted box size inside the backend. Objection: the backend knows
  layout px, not CSS scale — the surface is the only honest owner of "I am small".

Three boundaries, stated plainly:

- **The AI adopt path does not write `thumbSrc`.** `resolveImage` returns a url that
  `mapMediaRefs` substitutes for another url; filling a sibling `thumbSrc` would mean widening
  that shared walk to carry two values. An AI-sourced picture paints its full asset, which is the
  correct fallback.
- **The 2D canvas path has no assets option.** Nothing that paints through it is scaled — present
  slides and every export are full size — so the option there would be dead surface.
- **The minimap Thumb paints full assets.** It is another honest `"thumb"` candidate; noted
  rather than taken.

## Hygiene, measured small

Each demoted by measurement to single-digit ms; done because the round had the files open.

- **The ghost lays out only on a miss.** `paintSectionStack`'s stand-in contract is two halves:
  a cheap `pending?: (section: Section) => boolean` feeds the cache key, and `placeholder` is
  consulted only for a section `pending` names, and only on a cache miss. The entry records the
  flag that was asked for rather than what came back, so a pending section whose stand-in the
  caller declines still reuses. The editor is the only production caller.
- **The slide count is memoized once for all three consumers.** `sectionSlideCount` in
  `canvas/render/present.ts` fronts a module-level `WeakMap<Section, …>` validated on tokens and
  profile identity — module-level rather than per-surface, because the present overview, the
  present surface and `ExportModal`'s page count all read the same memo, and one place is the only
  place they can share it. It carries a `loadingdone` reset of its own, because real metrics can
  repaginate a section and a memo of a measured layout must not outlive the measurement.
- **The measure cache is LRU.** A hit re-inserts to refresh recency, so a burst at one width
  cannot evict the entries the surface being typed in is hitting; at `MEASURE_CACHE_CAP` (6000,
  exported from `canvas/render/commands.ts` for the eviction test) the least recently used quarter
  is evicted.

## Standing facts

- **The `loading.md` measured table predates this round and has not been re-run.** Its numbers
  came from an ad-hoc measurement with no in-repo harness; the round changed only repaint paths,
  leaving the layout, paint and DOM-node columns as measured.
- The round was geometry-neutral by construction, and `eval:shots` proved it where paint paths
  were touched ("all 592 checks pass", `aria/s9` the known exception).

## Not taken

- **Route-level code splitting** — ranked below the pdf-lib split by the measurements.
- **Windowed-publish screen-reader exposure** — an a11y-vs-windowing decision, not a speed fix;
  recorded with the audit.
- **Upload-time thumbnail generation** for user uploads that lack one.
