# Planning — chart and diagram draw-on

> The last unscheduled motion item ([`motion.md`](motion.md) §"Not scheduled", engine-gaps item 1's
> residue): a chart's bars arrive one by one, a funnel fills band by band, a venn's circles land in
> draw order, instead of the whole visual fading in as one block. Unblocked by item 16
> ([`hit-geometry.md`](hit-geometry.md)): surfaces now mint per-datum regions with real shapes, so
> the identity and geometry of every bar exist at playback time. Status: built 2026-09-06,
> deviations recorded at the end. Verified against the tree 2026-09-06.

Companion docs: `motion.md` (the invariant and the option space), `motion-build.md` (the shipped
driver this extends), `hit-geometry.md` (where datum regions come from), `rendering.md` (the
command stream and the DOM backend), `engine-gaps.md` (item 1).

## Why

The build-in that shipped with the motion round animates one DOM node per command group. A chart
is a single `surface` command — one opaque `paint(ctx, box)` — so the finest thing the build can
do is fade the whole chart as a block. Everything else on a slide arrives with rhythm; the data,
which is usually the point of the slide, arrives as a lump.

Item 16 changed the premise: `SurfaceLeaf.regions?: (box) => Region[]` reports each datum's box
and shape (`datum:<element>:<index>` ids, polygons for wedges and circles, radius-carrying rects
for bars), and the paged carriage delivers them to Present (`slideElement` merges them into
`slide.regions`; the continuous stack computes them per section). The motion layer can now
choreograph per-datum without any renderer knowing.

## What is true today (verified)

- `ui/motion.ts` is the whole motion vocabulary: `buildGroups` maps commands to DOM nodes per
  build unit, `runBuild` animates them with WAAPI (`el.animate`), `buildFrames`/`staggerMs` derive
  everything from the theme's `MotionTokens`. Reduced motion short-circuits inside `runBuild`.
- Both playback seams call the same pair: paged (`renderPaged`, `present.tsx:242`) and the
  continuous `IntersectionObserver` reveals (`present.tsx:265`). The editor never calls it.
- On the DOM backend a surface command paints as one inline `<svg>` inside its absolutely
  positioned command element (`backends.ts:621-628`), coordinates box-local (`viewBox 0 0 w h`).
- Datum regions and the owning element's commands share one coordinate space at each seam: the
  paged slide carries both (`present.ts:200-203`); the continuous stack holds section-local
  `entry.regions` beside section-local `entry.commands` (stage offsetting happens only on the
  merged return value, `backends.ts:1274`), but `SectionLayer` does not yet expose them.
- `applyCommand` already writes `el.style.clipPath` for ancestor clips (`backends.ts:552-561`),
  so a clipped command's clip slot is taken.

## Options considered

**Surfaces paint through a sequence hint (staged per-datum paint calls).** Every chart and diagram
renderer gains a reveal responsibility, the `DrawContext` contract widens, and the 2D/PDF/PPTX
paths have to ignore the hint. Rejected: it violates the round's bar (zero renderer changes) and
puts time adjacent to paint.

**Animate the surface node's `clip-path` through stepped keyframes.** One node, one animation, but
keyframes that add a region per step do not interpolate (structure changes), so datums pop with no
fade, and per-datum stagger is impossible on a single animation. Rejected as the worse look for
the same plumbing.

**A static hole-punched veil plus per-datum clipped clones (chosen).** The motion layer punches
the datums out of the surface node with one static SVG `clipPath` (outer rect plus one hole per
datum, `clip-rule="evenodd"`), so the chrome — axes, gridlines, labels — arrives with the node's
ordinary block build. Then, per datum, an absolutely positioned wrapper clipped to that datum's
shape, holding a clone of the painted `<svg>`, animates with the exact `buildFrames` the theme
already defines, staggered in region order. On finish everything transient is removed and the
punch cleared: the end state is the pristine painted node, byte-identical to every export. The
animated properties are opacity and transform only; the punch is a static paint-space veil, set
once and cleared, never animated — the motion invariant holds as stated.

## Decisions

- **Order = region mint order.** Surfaces mint datum regions in paint order (bars left to right,
  funnel top to bottom, venn in draw order), which is the reveal order a person expects. No
  per-type ordering knowledge enters the motion layer.
- **Line trace is not this feature.** A line chart reveals its points; animating the path's own
  length is a different mechanism (stroke-dashoffset over a path the motion layer cannot see) and
  is recorded under "not taken".
- **No new theme vocabulary.** Draw-on is how a surface with datum regions interprets the theme's
  existing build identity: `build: "none"` means none, `rise`/`settle` shape the datum frames too.
  `model/theme.ts` does not change.
- **Where it runs**: exactly where the build runs — paged Present on slide entry, continuous
  Present and publish through the reveal observer. The editor stays excluded by construction.
- **Composition with the block build**: a planned surface node still takes its group's block
  build (that is what brings the chrome in), with the punch applied for the choreography's
  duration; datum overlays start at half the block duration so the chrome has landed visually.
- **Degrades**: fewer than two datum regions (connector-drawn diagrams mint none), more than 40
  (a dense scatter would stagger forever), a rotated command (regions were rotated into stage
  space, the local subtraction no longer holds), or a command carrying an ancestor clip (the clip
  slot is taken) — each falls back to today's whole-block build, silently.
- **Cleanup is cancel-tolerant.** Continuous layers outlive their animations, so an interrupted
  choreography must never strand the punch (invisible datums). Cleanup runs in a `finally` over
  the batch of `finished` promises, and a cancelled animation counts as finished.
- **No new analytics event.** Draw-on adds no gesture and no user decision; playback
  instrumentation stays at the surface level it has today (the seam rule: nothing new to measure).

## Phases

**A — the pure half** (`drawOnPlans` in `ui/motion.ts`): walk commands tracking the current
element id (the `buildGroups` rule), claim each element's first surface command, attach the datum
regions whose parsed element matches, apply the degrade guards. Red-first pins in
`ui/__tests__/motion.test.ts`: pairing through id-less commands, order preservation, each guard,
plan geometry passed through untouched.

**B — the imperative half** (`runDrawOn`, called from `runBuild`): the transient defs `<svg>`
(punch path with evenodd holes, one `clipPath` per datum — `<polygon>` for shaped regions,
rounded-rect path for radius-carrying boxes), the clipped clone wrappers, the stagger schedule
(`delay + duration/2 + j * datumStep`, `datumStep` capped by the 700ms tail the build already
uses), the `finally` cleanup. Pins in `ui/__tests__/motion.dom.test.ts` on the existing WAAPI
stub: punch set and cleared, overlays mounted and removed, delays, reduced-motion and
`build:"none"` leave the DOM untouched.

**C — wiring + ledgers**: `SectionLayer` gains `regions` (section-local, the same space as its
`commands`); both `present.tsx` seams pass `drawOnPlans(commands, nodes, regions)` into
`runBuild`; engine-gaps item 1 and motion.md's "Not scheduled" get dated notes. Full gates:
typecheck, lint, full vitest, `check:elements`, suppressions, copy, and `eval:shots` exactly
"all 592 checks pass" (static renders cannot move: nothing here touches layout or paint).

## Not taken, and why

Line/area path tracing (a different mechanism, wants item 2-style geometry the motion layer does
not hold). Per-datum sound or per-datum advance gating (build is time-driven by decision,
`motion.md` §6). A draw-on toggle per element (no theme vocabulary growth until someone asks; the
build identity governs). Canvas-backend draw-on (playback is DOM; the 2D mirror serves export,
which is static by invariant).

## Built — deviations

Executed 2026-09-06, all three phases, none skipped. Deviations from the plan as written:

- None of substance. The one judgment call made in flight: a plan whose node lacks painted art
  (no `<svg>` child, i.e. a non-DOM paint path) no-ops inside `runDrawOn` rather than being
  filtered in the planner, since only the imperative half can see the DOM. Pinned.
- The punch and per-datum clips are SVG `clipPath` defs referenced by `url(#…)` rather than CSS
  `path()` strings: the two-argument `path(evenodd, …)` form is not universally supported, and
  `clipPath` with `clip-rule` is. The defs block is transient and removed with the overlays.
- `engine-audit.md` carries no draw-on entry, so only `engine-gaps.md` item 1 and `motion.md`'s
  "Not scheduled" list took the dated notes.

Manual QA: in Present, a deck slide holding a bar/column/funnel/venn chart should bring its axes
in with the slide's build, then land the datums one by one in paint order; a connector-drawn
diagram (flow, mindmap, org) keeps the whole-block build; scrolling a published site or
continuous Present to a chart section below the fold plays the same choreography once; reduced
motion and a `build: "none"` theme show everything immediately with nothing veiled; after the
reveal settles, the chart is byte-identical to the static render (exports untouched).
