# Galleo — Chart and diagram draw-on

> A chart's bars arrive one by one, a funnel fills band by band, a venn's circles land in draw
> order, instead of the whole visual fading in as one block. Built on the per-datum hit geometry:
> surfaces mint regions with real shapes, so the identity and geometry of every bar exist at
> playback time.

Companion docs: `motion-build.md` (the build driver this extends), `../rendering.md` (the command
stream and the DOM backend).

## Why

The build-in animates one DOM node per build unit. A chart is a single `surface` command — one
opaque `paint(ctx, box)` — so the finest thing the block build can do is fade the whole chart as
one piece. Everything else on a slide arrives with rhythm; the data, which is usually the point of
the slide, arrived as a lump.

Per-datum hit geometry changed the premise: `SurfaceLeaf.regions?: (box) => Region[]` reports each
datum's box and shape (`datum:<element>:<index>` ids, polygons for wedges and circles,
radius-carrying rects for bars), and the paged carriage delivers them to Present (`slideElement`
merges the page's datum regions into its return; the continuous stack computes them per section
and `SectionLayer` carries them beside its commands, in the same section-local space — stage
offsetting happens only on the merged return value). The motion layer can therefore choreograph
per-datum without any renderer knowing.

## Options considered

**Surfaces paint through a sequence hint (staged per-datum paint calls).** Every chart and diagram
renderer gains a reveal responsibility, the `DrawContext` contract widens, and the 2D/PDF/PPTX
paths have to ignore the hint. Rejected: it requires renderer changes everywhere and puts time
adjacent to paint.

**Animate the surface node's `clip-path` through stepped keyframes.** One node, one animation, but
keyframes that add a region per step do not interpolate (the structure changes), so datums pop
with no fade, and per-datum stagger is impossible on a single animation. Rejected as the worse
look for the same plumbing.

**A static hole-punched veil plus per-datum clipped clones (chosen).** The motion layer punches
the datums out of the surface node with one static clip (outer rect plus one hole per datum,
evenodd), so the chrome — axes, gridlines, labels — arrives with the node's ordinary block build.
Then, per datum, an absolutely positioned wrapper clipped to that datum's shape, holding a clone
of the painted `<svg>`, animates with the exact `buildFrames` the theme already defines, staggered
in region order. On finish everything transient is removed and the punch cleared: the end state is
the pristine painted node, byte-identical to every export. The animated properties are opacity and
transform only; the punch is a static paint-space veil, set once and cleared, never animated — the
motion invariant holds as stated.

## Decisions

- **Order = region mint order.** Surfaces mint datum regions in paint order (bars left to right,
  funnel top to bottom, venn in draw order), which is the reveal order a person expects. No
  per-type ordering knowledge enters the motion layer.
- **Line trace is not this feature.** A line chart reveals its points; animating the path's own
  length is a different mechanism (stroke-dashoffset over a path the motion layer cannot see) and
  stays under "Not taken".
- **No new theme vocabulary.** Draw-on is how a surface with datum regions interprets the theme's
  existing build identity: `build: "none"` means none, `rise`/`settle` shape the datum frames too.
  `model/theme.ts` did not change.
- **Where it runs**: exactly where the build runs — paged Present on slide entry, continuous
  Present and publish through the reveal observer. The editor stays excluded by construction.
- **Composition with the block build**: a planned surface node still takes its group's block build
  (that is what brings the chrome in), with the punch applied for the choreography's duration;
  datum overlays start at half the block duration so the chrome has landed visually.
- **Degrades, each silent**: fewer than two datum regions (connector-drawn diagrams — flow,
  mindmap, org — mint none), more than 40 (`DRAWON_MAX`: a dense scatter would stagger forever,
  and past that a stagger reads as a stall rather than a story told point by point), a rotated
  command (its regions were rotated into stage space, so the local subtraction no longer holds),
  or a command carrying an ancestor clip (the clip slot is taken by `applyCommand`) — each falls
  back to the whole-block build.
- **Cleanup is cancel-tolerant.** Continuous layers outlive their animations, so an interrupted
  choreography must never strand the punch (invisible datums). Cleanup runs over the settled batch
  of `finished` promises, and a cancelled animation counts as finished; the punch is always
  cleared and every transient removed.
- **No new analytics event.** Draw-on adds no gesture and no user decision; playback
  instrumentation stays at the surface level it has (the seam rule: nothing new to measure).

## How it works

**The pure half — `drawOnPlans(commands, nodes, regions)` in `ui/motion.ts`.** Walks the commands
tracking the current element id (the same rule `buildGroups` uses, so id-less commands pair with
the element addressed most recently), claims each element's **first** surface command, attaches
the datum regions whose parsed element matches (`parseDatumRegion`), and applies the degrade
guards. The output is `DrawOnPlan { node, box, datums }`, geometry passed through untouched, all
in the command's coordinate space. Foreign datums never leak across elements, and only the first
surface of an element claims them.

**The imperative half — `runDrawOn`, internal to `ui/motion.ts`, invoked by `runBuild`** for any
plan whose node belongs to the group being animated, at that group's delay. It builds a transient
zero-size `<svg>` defs block: the punch (`M0 0H{w}V{h}H0Z` plus one hole subpath per datum,
`clip-rule="evenodd"`) and one `clipPath` per datum — a polygon path for shaped regions, a
rounded-rect path for radius-carrying boxes. Each datum gets an absolutely positioned wrapper
clipped to its own shape (`clip-path: url(#…)`), holding a clone of the painted `<svg>`, animated
with the theme's `buildFrames` at `delay + duration/2 + j * step`, where `step` is capped by the
same 700ms tail the block build uses. When the batch settles the punch is cleared and every
transient removed.

Two judgment calls worth recording:

- The punch and per-datum clips are **SVG `clipPath` defs referenced by `url(#…)`** rather than
  CSS `path()` strings: the two-argument `path(evenodd, …)` form is not universally supported, and
  `clipPath` with `clip-rule` is. The defs block is transient and removed with the overlays.
- A plan whose node lacks painted art (no `<svg>` child, i.e. a non-DOM paint path) **no-ops
  inside `runDrawOn`** rather than being filtered in the planner, since only the imperative half
  can see the DOM. Pinned by test.

**The wiring.** `SectionLayer` carries `regions` (section-local, the same space as its
`commands`), and both playback seams in `ui/present.tsx` — the paged render and the continuous
reveal observer — pass `drawOnPlans(commands, nodes, regions)` into `runBuild`. Reduced motion
and `build: "none"` leave the DOM untouched: no punch, no overlays, everything visible at once.

## Tests

`ui/__tests__/motion.test.ts` pins the planner: pairing through id-less commands, region-order
preservation, each degrade guard (a lone datum, a crowd, a rotated or ancestor-clipped surface),
foreign datums staying foreign, plan geometry passed through untouched.
`ui/__tests__/motion.dom.test.ts` pins the choreography on the WAAPI stub: the punch set and
cleared, one clipped clone per datum mounted and removed, the stagger delays, and that reduced
motion, `build: "none"`, and a node without painted art leave the surface untouched, holes and
all.

The end-state check is the same as all motion: after the reveal settles, the chart is
byte-identical to the static render, exports untouched, and `pnpm eval:shots` reports the corpus
unchanged — nothing here touches layout or paint.

## Not taken, and why

Line/area path tracing (a different mechanism, wanting path geometry the motion layer does not
hold). Per-datum sound or per-datum advance gating (the build is time-driven by decision). A
draw-on toggle per element (no theme vocabulary growth until someone asks; the build identity
governs). Canvas-backend draw-on (playback is DOM; the 2D mirror serves export, which is static
by invariant).
