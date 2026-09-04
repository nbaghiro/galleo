# Planning — engine-level gaps

> An inventory of mechanisms the layout engine does not have, what each one costs us today, and what
> each would unlock. This is the starting point for per-item planning docs, not a plan itself:
> nothing here is designed, sized properly, or scheduled. Every claim is anchored to the file and
> line that shows it, so an entry that has quietly been fixed is cheap to disprove.

Status: inventory, re-verified against the tree on 2026-08-24. Since first written, three
initiatives landed on top of the engine without changing its mechanics: motion
([`motion-build.md`](motion-build.md), item 1 built), interactivity
([`interactivity.md`](interactivity.md): `link`/`level`/`alt` on the command, the `hit:` affordance
system generalized, live overlays, viewer patches), and editor multi-select
([`multi-select.md`](multi-select.md)). The engine's public surface grew — painters return their
nodes, `paintSectionStack` returns `SectionLayer[]`, commands carry semantic fields — but the
solver, the measurement path and every gap below are exactly as they were. Items 17 and 18 were
discovered during the interactivity investigation and added after the fact.

Companion docs: `rendering.md` (the engine, the element system, the render bridge), `ai.md`
(generation is the largest consumer of layout quality, so several of these are really generation
quality items), `frontend.md` (the `@ui` layer that any new editor affordance goes through),
`testing.md` (the mocking contract, including `canvas/testkit.ts`'s deterministic measurer).

## How to read an entry

Each entry has the same shape:

Missing: what the engine does not do, with evidence.

Cost today: the workaround, the failure, or the parallel implementation this absence causes.

Unlocks: the product experience on the other side of it.

Shape: roughly which layers move.

Size: XS through XL against this codebase, not universally. Risk is separate from size: a small
change to the measure path is higher risk than a large change to an element.

Open: the questions worth settling before anyone designs it.

## The invariants any of this has to survive

These are what make the engine worth keeping, so an item that cannot be built without breaking one
of them is not ready to be designed.

1. **One measurement path.** `measureText` (`canvas/render/commands.ts:484`) is the only source of
   text metrics for the editor, Present, PDF, PNG and PPTX. Any new sizing input (font ascent, line
   boxes, script-aware breaks) has to enter through it, memoized on metric-affecting keys only, or
   exports drift from the screen.
2. **One layout feeds screen and export.** `sectionSlides` (`commands.ts:201`) is shared by Present,
   the PDF path, the PNG path, PPTX and the 16:9 thumbnails, which is why all of them break a tall
   section in the same place. A new render mode that computes its own geometry forfeits this.
3. **Regions are the only bridge from pixels back to the tree.** `el:<section>:<path>` ids
   (`model/artifact.ts:318`) carry selection, hit-testing, drop-slot enumeration, resize dividers,
   comment anchors and collab element refs — and, since the interactivity work, playback affordance
   dispatch, live-overlay anchoring and multi-select rings. Anything that changes how nodes are
   identified or addressed now touches nine consumers, not six.
4. **`profileFor` returns the base profile by identity** (`canvas/engine/profile.ts:62`) when there
   is nothing to overlay, and the section paint cache keys on resolved page dimensions rather than
   `profile.id` (`canvas/render/backends.ts:805`). New profile fields must not break either.
5. **`ArtifactContent extends ArtifactShell`.** A content field declared outside the shell
   (`model/artifact.ts:56`) is silently dropped on the next section edit. Any artifact-level setting
   these items introduce (a timeline, a page policy, an autofit mode) belongs in the shell.
6. **The corpus is the regression gate.** Seven artifacts in `services/core/ai/corpus/` are rendered
   in real Chromium and measured by `pnpm eval:shots`, with the layout half of the checks in
   `canvas/render/fit-checks.ts`. Every item below should state what it does to those numbers before
   it is built, and no layout change lands without a before and after run.
7. **The repo rules still apply**: no suppressions, no `any`, one file per concept, and the
   `model ← canvas ← ui ← editor ← app` boundary. Several items below want a new shared concept, and
   `model/` is at eighteen files with an explicit instruction to resist a nineteenth. That tension is
   an open question, not an oversight.

---

# Tier 1: mechanisms that unlock whole product surfaces

## 1. Layout diffing and tweening

**Built** (transitions, structural build-in, theme motion, continuous reveals). What remains of
this item: cross-slide morph (content-based correspondence, deliberately unscheduled), chart and
diagram draw-on (blocked on item 16), and live drag reflow (wants item 15). See
[`motion-build.md`](motion-build.md); the rest of this entry is the original summary.\*\*

Missing: nothing in `canvas/` refers to animation, tween, keyframes or easing. `layout()` emits a
static `RenderCommand[]` and there is no mechanism to interpolate between two of them. Present's
`Step` (`canvas/render/present.ts:42`) is a section-level screenful, not an element-level build.

Cost today: every transition in the product is either absent or hand-built in CSS at the view layer,
and the editor freezes the canvas during a drag (`editor/Canvas.tsx`, the frozen-regions comment in
`editor/core/dnd.ts:35`) partly because there is no way to show the layout actually moving.

Unlocks: element build and reveal steps in Present; Keynote-style Magic Move between slides;
scroll-scrubbed reveals in the web format; chart and diagram draw-on; morphing rather than snapping
on a theme or format change; live reflow while dragging instead of indicator lines over a frozen
document; and an export target that does not exist today, namely video or animated GIF.

Shape: a motion layer above the paint output, an rAF or Web Animations driver, and a motion
vocabulary in `model/`. The engine itself does not change.

Size: S for slide transitions and structural build-in, L for cross-slide morph. Risk: low for the
first, medium for the second.

Correction: an earlier draft of this entry claimed the work was "unusually cheap because ids are
already stable". That is true only within one section. Region ids are namespaced
`el:<section>:<path>` (`model/artifact.ts:295`), so two different slides share no ids at all, and
`duplicateSection` re-mints `ElementInstance.id` on the copy (`canvas/elements/ops.ts`), which breaks
the one authoring gesture that would otherwise produce a match. Cross-slide morph needs
content-based correspondence, not an id lookup. `motion.md` works through the consequences.

## 2. Line boxes as an engine output

Missing: a text leaf becomes exactly one `RenderCommand` (`canvas/engine/layout.ts:302`). Line
geometry is recomputed inside the backend by `layoutRuns` (`commands.ts:353`) and never returned to
the engine or to the caller.

Cost today: `fragment` (`layout.ts:396`) breaks only where no command splits, so a paragraph taller
than a page falls through to the hard-limit fallback and is cut mid-line. The inline text editor,
comment range anchors and remote collab selections each re-derive run layout to find coordinates the
engine already computed and discarded, which is three places that can drift from the paint.

Unlocks: correct long-form pagination; text-range highlights (comments, collaborator selections,
search hits) drawn from engine geometry instead of a parallel implementation; line-level reveals;
widow and orphan control; drop caps; text on a path.

Shape: `layoutRuns` moves down into the engine or its output is threaded back through the text
command, `fragment` learns to break inside a text command, and the three consumers switch to reading
the geometry rather than recomputing it.

Size: M. Risk: medium, because it touches the measure path and therefore export fidelity, and
because the text command shape is consumed by four backends.

Open: whether the engine returns line boxes always or only on request (cost per section); whether the
text command becomes a list of line commands, which changes every backend, or keeps one command with
line metadata attached, which is cheaper but leaves two representations.

## 3. Autofit as a layout mode

**Designed. See [`autofit.md`](autofit.md); this entry is the summary.**

Missing: when a section overflows its frame, there are two answers: paginate, or scale the pixels
uniformly (`fitSlideContent`, `backends.ts:988`, and `renderSlidePage`, `:743`, both
`min(1, h / contentH)`). Uniform scaling shrinks type, media and padding together, so a twenty
percent overflow reads as a mistake rather than as a dense slide. `coverFitMedia`
(`commands.ts:91`) is the right instinct applied to one narrow case: exactly one media cell inside a
multi-cell flow row.

Cost today: this is the largest single source of visible quality loss in generated decks, and we
already grade it. `fits-frame` and `fills-frame` in `canvas/render/fit-checks.ts` measure a problem
the engine has no mechanism to fix, which means prompt work is currently absorbing a layout
responsibility.

Unlocks: PowerPoint-grade text autofit; a real "fit to slide" command; per-section density as an
author control; and generation that can stop being conservative about content volume, because the
frame absorbs the overshoot gracefully.

Shape: a bounded search over `tokenScale` and gap, with per-element shrink priorities (a headline
gives up less than body copy, a chart gives up less than padding), converging on a tree that fits at
full resolution. It sits in the render bridge beside `prepareSlideNode` (`commands.ts:138`) and
reuses the probe budgeting already proven in `canvas/render/fit.ts`.

Size: M. Risk: medium to high, because every paged render path goes through it and the corpus
numbers will all move at once.

Open: whether shrink priority is a new field on `ElementSpec` or inferred from `tier`; the floor
below which we paginate instead of shrinking further; whether the editor shows the fitted result or
the authored one with the overflow mark it paints today (`backends.ts:834`); whether autofit is a
per-section property, a format property, or always on.

## 4. Grid and shared track sizing

Status update: the solver half is built (`direction: "grid"` + shared tracks, see
[`engine-round.md`](engine-round.md)) and the table sits on it; the authorable half — container,
editor, AI, spans — is planned in [`grid.md`](grid.md). The entry below is the original inventory.

Missing: the engine has row and column only. There is no way for two boxes in different rows to
share a column width, and no way for a column's width to be the widest content across all rows. This
is exactly why `canvas/elements/table/table.ts:100` sizes every column at `percent(1 / cols)`.

Cost today: tables cannot size columns to content, so a table of one short and one long column wastes
half its width. Card grids built by chunking into rows do not align across those rows. The
`aligns-to-a-grid` check in `fit-checks.ts` grades an outcome that nothing in the engine can
guarantee.

Unlocks: real tables, including spanning cells; card grids that stay aligned across wrapped rows;
comparison layouts whose labels line up across sections; layout presets richer than fractional column
splits (`LAYOUT_PRESETS`, `model/artifact.ts:105`).

Shape: a fourth `direction`, or a sibling concept to it, with a track-sizing pass that runs between
the width and height passes. It has to preserve the O(n) property and the "constraints down, sizes
up" shape, and it must not reintroduce the multi-pass reflow the current design deliberately avoids.

Size: L. Risk: high, since it is the first structural change to the solver.

Open: whether this is a new node kind or a new element that owns two-dimensional addressing (the
container-merge doc already flagged a real grid as the one type that might earn its own element);
what a grid child's address looks like, given every path today is a flat index list; whether tracks
size from intrinsic content, which needs a measurement pass the engine currently avoids.

## 5. Intrinsic sizing for non-text leaves

Missing: `intrinsicWidth` returns 0 for image, fill and surface leaves (`canvas/engine/layout.ts:75`),
and the engine never learns an image's natural dimensions. `new Image()` appears only for cache
warming and canvas rasterization (`backends.ts:392` and `:708`), never to feed a size back into
layout.

Cost today: a `fit`-width image collapses to nothing, so every image aspect has to be authored or
assumed, and `fitSectionToFrame` bails out through its `MIN_SLOPE` check (`canvas/render/fit.ts`)
more often than it needs to, which is why some thumbnails letterbox instead of fitting.

Unlocks: drop an image and have it size itself correctly; mixed-media rows without hand-set aspects;
layouts that adapt to a portrait asset versus a landscape one; noticeably better format translation,
since more sections can actually reflow into a foreign shape.

Shape: an asynchronous intrinsic-size cache that the measure injection can read, in the same shape as
`measureText`: pure to the engine, populated by the bridge, invalidated on load. Media assets already
flow through a picker (`model/media`), so recording width and height at upload time removes the async
problem for everything except pasted URLs.

Size: S if dimensions come from the asset record, M if the engine has to tolerate an async miss.
Risk: medium, because a layout that changes when an image loads is a layout that reflows under the
reader.

Open: whether we store dimensions on the asset row and treat the engine path as a fallback; what an
unresolved image sizes to on first paint, given the section paint cache would then hold a stale
layout; whether this changes the placeholder and skeleton geometry (`elements/spec.ts` `skeletonize`).

---

# Tier 2: expressive range

## 6. A free-positioning layer

**Built (Aug 2026): `ElementLayout.pin` (anchor + offset + z + rotate) compiles onto `float` at
`applyLayout`; rotation rides every backend; the editor pins, drags with nine-anchor snapping,
layers and rotates from the inspector. See `positioning.md` and `.docs/rendering.md`.**

Missing (as written before the round): `ElementLayout` (`model/geometry.ts`) is `width | height | align | radius`. No offset, no
rotation, no z, no explicit pixel size. `RenderCommand` has no transform field at all
(`canvas/engine/node.ts:156`). The engine's `float` primitive (`node.ts:142`) does most of the work
already, but it is reachable only from element internals (`canvas/elements/diagram/utils.ts:686`
and `:744`), never from authored data.

Cost today: everything overlapping has to be built inside a single element, which is why diagrams
paint whole subtrees into one `surface`. Authors coming from Keynote or Figma hit a wall on their
first attempt to nudge something.

Unlocks: drag anything anywhere as an opt-in; overlapping composition (a card offset over a photo, an
image bleeding under a headline); rotated stickers, ribbons and callouts; annotation pins.

Shape: a `layout.position` on `ElementInstance` that compiles to `float` with `dx`/`dy` and a
`rotate` on the render command, plus editor affordances. Deliberately not a second layout system.

Size: M for the engine and model, L including the editor gestures and the inspector.

Risk: this is the one item that cuts against a stated design bet. Auto-layout is what makes format
translation, autofit and AI generation tractable, and a document where half the elements are pinned
in absolute coordinates translates to a doc or a site badly. Worth planning as a constrained
affordance (offset and rotation within a parent's box) rather than as free canvas positioning.

Open: whether a positioned element still participates in `fit` sizing, which decides whether a
section's height can be trusted; what a positioned element does when its format changes; whether the
drag layer treats it as a separate priority class in `computeDropSlots`.

## 7. Cross-node references

Missing: regions are produced by `emit` only after layout completes (`canvas/engine/layout.ts:302`)
and nothing feeds them back in. There is no mechanism for node A to resolve against node B's box.

Cost today: diagrams work around this by painting an entire subtree into one `surface`, which is also
why nothing inside a diagram is individually hit-testable.

Unlocks: connectors and arrows between arbitrary elements, including across columns and sections;
callout lines from a label to a chart point; snapping and smart alignment guides during a drag;
"match that card's height" constraints; sticky relationships in the web format.

Shape: a second, bounded resolution pass, or a deferred command kind that is emitted with symbolic
endpoints and resolved once regions exist. The second option preserves the single-pass property and
is much the cheaper of the two.

Size: M. Risk: medium, and it raises the possibility of cycles, which the current model makes
structurally impossible.

Open: whether references are allowed to affect layout (which forces iteration) or only paint (which
does not); how a reference survives the referenced element being deleted or moved, given
`elementIdMap` (`canvas/elements/ops.ts`) already exists for exactly this class of problem.

## 8. A richer paint model

Missing, all from `canvas/engine/node.ts`: two-stop linear gradients only (`:24`, `:116`), one
uniform corner radius (`:17`, `:107`, `:117`), one all-sides border in solid or dashed (`:110`,
`:118`), one shadow. No radial, conic or multi-stop gradients, no per-corner radius, no per-side
border, no blur or backdrop blur, no blend modes, and `clip` is an inset rect (`:139`), so a
circular or shaped crop of composed children is impossible.

Cost today: this is a large part of why generated output reads as engine-produced rather than
designed. Themes cannot express a visual vocabulary that every competing tool has.

Unlocks: glass and frosted panels, spotlight and vignette backgrounds, notched and tab-shaped
containers, circular avatars containing real composed content, duotone image treatments, and the
kind of section backdrop that currently has to be a supplied image.

Shape: mostly additive fields on `DrawStyle`, `FillLeaf` and `ImageLeaf`, plus the corresponding
work in each of the four backends. The DOM and canvas backends are cheap; PDF and PPTX are where the
cost is, since both flatten aggressively already.

Size: S per feature, L for the set. Risk: low structurally, but every field has to be answered four
times, and the PPTX path degrades to a raster whenever it cannot express something.

Open: which subset actually earns its place in the themes we ship, since this is easy to overbuild;
whether `clip` becomes a shape or stays a rect with a radius, which is the cheaper ninety percent.

## 9. Image focal point

Status update: built 2026-09-03. `ImageLeaf.focus` (0..1 each, CSS object-position semantics),
honored by the DOM backend (background-position / object-position + transform-origin under zoom)
and the canvas placement (`imageDrawBox`), which PDF and PPTX inherit by rasterizing through it;
authored per use on the media element (`focusX`/`focusY` sliders, gated to cover fit like zoom).
Untaught to the AI, the zoom precedent: the model cannot see the picture. Not done: a per-asset
default, detection at upload, section backgrounds, and a drag-on-image affordance. The entry below
is the original inventory.

Missing: `background-position` and `object-position` are hardcoded to `center` (`backends.ts:445`
and `:455`), so a `cover` fit always crops to the middle of the image.

Cost today: a face is cropped out of frame whenever a photo lands in a tall column, and there is
nothing an author can do about it short of editing the source image.

Unlocks: subject-aware cropping; an author-set crop anchor; media that survives format translation,
where a 16:9 hero becomes a square card without losing its subject.

Shape: a focal point on `ImageLeaf` and on the media asset, honored in all four backends. Optionally
a detection step at upload time to set a sensible default.

Size: S for the plumbing, M with automatic detection. Risk: low.

Open: whether the focal point lives on the element (per use) or on the asset (per image), which
decides whether the same photo crops consistently everywhere it appears.

## 10. Main-axis distribution modes

Missing: `mainOffset` (`canvas/engine/layout.ts:245`) supports start, center and end. There is no
space-between, space-around or space-evenly.

Cost today: every evenly distributed row is built with spacer elements or percentage widths, which
then have to be renormalized on every insert and delete (`renormalizeWidths`, `elements/ops.ts`).

Unlocks: navigation bars, footers, pinned slide furniture, evenly distributed statistic rows, logo
strips, all without spacer hacks that the drag layer then has to treat as real elements.

Shape: a distribution field on `EngineNode`, read in `layoutPositions`, plus a control on the
container spec.

Size: XS. Risk: low. This is the highest ratio of usage frequency to cost on the list.

Open: none worth blocking on.

---

# Tier 3: correctness and scale

## 11. Script-aware line breaking

Missing: `measureUncached` splits on `/\s+/` (`canvas/render/commands.ts:443`) and `tokenize` matches
`[^\s]+` (`:320`). Chinese, Japanese, Korean, Thai, Khmer and Lao do not put spaces between words, so
text in those scripts produces a single unbreakable line that overflows its box or gets clipped by
the section's `clip.x`. There is also no hyphenation, and no break-anywhere fallback for long URLs
and identifiers.

Cost today: those languages do not work. Not "look worse", do not work.

Unlocks: the markets that use them. This is a correctness item rather than a capability item, and it
moves to the top of the list the moment any non-Latin market is on the roadmap.

Shape: `Intl.Segmenter` with `granularity: "word"` is in every browser we target and in Node, so the
tokenizer can be replaced without a dependency. The measure cache key
(`measureKey`, `commands.ts:468`) needs the locale folded in.

Size: S to M. Risk: medium, because it changes wrapping for existing Latin content too unless the
segmenter is applied carefully, and every corpus number moves if it is not.

Open: whether we segment always or only when the text contains characters from a no-space script;
where locale comes from, given the artifact has no language field today.

## 12. Bidirectional text and a logical box model

Missing: `BoxInsets` is physical (`top/right/bottom/left`, `model/geometry.ts`), alignment is
physical, and nothing anywhere carries a direction.

Cost today: Arabic and Hebrew do not work, for the same reason as item 11 and independently of it.

Unlocks: those markets. Same category, same trigger.

Shape: logical insets and alignment resolved against a direction that comes from the artifact or the
theme, plus bidi reordering in the run layout.

Size: M to L. Risk: high, because physical alignment is assumed throughout the elements, not just in
the engine.

Open: whether direction is per artifact, per section or per text element; whether this is worth doing
before item 11 or strictly after (after, since a no-space script is more common than an RTL one in
the segments we are likely to enter first).

## 13. Real font metrics

Missing: `Measured` is `{ width, height }` (`canvas/engine/node.ts:80`, unchanged). The `baseline` field on
`DrawTextStyle` (`:36`) is a draw hint for surfaces and is never a layout input. Canvas
`TextMetrics` already exposes `actualBoundingBoxAscent` and `actualBoundingBoxDescent`, so this costs
no new dependency.

Cost today: text is centered by box rather than optically, so a headline next to an icon or a large
numeral sits slightly wrong, and leading looks loose at display sizes because the line box carries
the font's full ascent and descent regardless of what the glyphs actually occupy.

Unlocks: baseline alignment across columns; optical centering against icons and numerals; tight
display leading; a real vertical rhythm, which is also what would let item 4's grid mean something
typographically.

Shape: widen `Measured`, populate it in `measureUncached`, and add an alignment mode that resolves
against the baseline rather than the box.

Size: S to M. Risk: medium, because every existing layout shifts by a few pixels the moment the
metric changes, so the corpus has to be re-baselined deliberately.

Open: whether baseline alignment is a new `alignY` value or a separate field; whether the cache key
has to change, given metrics are already keyed on font and size.

## 14. Truncation and per-node overflow policy

Missing: no `maxLines`, no ellipsis, no overflow policy on a node. The only overflow behavior is the
implicit `clip.y` set when a resolved height is smaller than its content
(`canvas/engine/layout.ts:212` and `:242`), which slices glyphs horizontally.

Cost today: one long string from a user or from the model can break a layout that was fine in every
other instance, and there is no way to express "this title is at most two lines" anywhere in the
element system.

Unlocks: cards that stay predictable; tables that survive one long cell; generated content that
degrades gracefully rather than breaking the layout it landed in, which also reduces how defensive
the generation prompts have to be.

Shape: an overflow field on the text leaf (`clip | ellipsis | shrink`) plus a `maxLines`, honored in
measure and in all four backends. Depends on item 2 for anything better than a crude clip.

Size: S for ellipsis and `maxLines`, M with per-node shrink. Risk: low.

Open: whether shrink here and autofit in item 3 are the same mechanism at two scales, which they
probably are, and if so which one is built first.

## 15. Incremental layout

Missing: every paint recomputes the visible stack from scratch. Caching is section-granular and keyed
on object identity (`canvas/render/backends.ts:853`), which is effective precisely because the ops in
`canvas/elements/ops.ts` return fresh objects only along the touched path.

Cost today: the canvas is frozen during a drag; `render_slow` is instrumented
(`editor/Canvas.tsx`, `RENDER_SLOW_MS`) because a heavy section is a measurable user cost;
`fitSectionToFrame` budgets itself to six probes because each probe is a full layout.

Unlocks: live reflow during a drag (with item 1); documents several times larger than what is
comfortable now; cheap what-if probing, which makes items 3 and 4 more affordable; smoother behavior
on low-end hardware and on phones.

Shape: memoize subtree layout on `(node identity, assigned width)` and invalidate along the changed
path. The immutable tree makes this tractable, and the section cache is the same idea one level up.

Size: M. Risk: medium, since a stale memo is a wrong layout and the failure is silent.

Open: whether this is worth doing before there is a measured need, given the section cache already
covers the common editing case; what the real ceiling is today, which nobody has measured.

## 16. Non-rectangular hit geometry

Missing: `Region` is an axis-aligned rect plus a radius (`canvas/engine/node.ts:195`). Anything
painted into a single `surface` is not individually addressable.

Cost today: a pie wedge, a diagram node drawn on a surface, and an arrow cannot be selected, hovered
or commented on.

Unlocks: selecting parts of a chart or diagram; per-point comments; hover affordances inside
generated visuals. Its stock has risen since first written: it now blocks chart/diagram draw-on
(the one motion feature left unscheduled), per-datum playback affordances (the `hit:` system built
for interactivity is region-based and stops at the surface boundary), and it remains the
prerequisite for item 6's rotation. Three separate initiatives now queue behind it.

Shape: an optional path or shape on `Region`, and a hit test in `editor/Canvas.tsx` that falls back
to the rect when there is none.

Size: M. Risk: low, additive.

Open: whether surfaces report their own regions (which means every chart and diagram renderer gains a
responsibility) or whether the engine derives them, which it cannot do for arbitrary paint.

## 17. Viewport-anchored (sticky) positioning

Found during the interactivity investigation; recorded here because it is a layout-contract gap,
not an element.

Missing: every box resolves to absolute stage coordinates once, at paint time
(`paintSectionStack` sets `layer.style.top` per section; commands are stage-absolute). Nothing can
say "pin to the viewport while the page scrolls" or "stick below the top edge until my section
ends".

Cost today: a published site cannot have a nav bar, a sticky table header, or a persistent CTA —
the single most-requested website furniture. The interactivity plan explicitly deferred it.

Unlocks: nav bars with the popup/menu element that now exists; sticky section headers in long
docs; a persistent footer CTA on published sites.

Shape: a coordinate-semantics extension, not an element: a node flag whose command carries a
sticky range, honored by the DOM backend as `position: sticky` on a wrapper (continuous formats
only; paged output ignores it, matching how `link` degrades on PNG). The hard part is that the
painter's flat absolute positioning has no containing-block nesting for `sticky` to work against,
so the section layer structure has to cooperate.

Size: M. Risk: medium — it bends the "commands are absolute boxes" invariant for one declared
case.

Open: whether it is a section property (a "pinned" section) or an element property; what the
editor shows, since the canvas is one continuous stack that does not scroll the way publish does.

## 18. Reading order as an output

Status update: built, closed 2026-09-03. The answer turned out to be "tree order is already right,
so guard it" rather than a new output: flow emit order IS tree order (pinned corpus-wide in
`scripts/__tests__/reading-order.test.ts`), pagination preserves emit order (the fragment round),
the DOM appends in command order, and the PDF draws `framed` through a straight map — so every
backend inherits the same order. The open question is decided and pinned: decoration (negative-z
floats) is marked `decor` and never spoken; overlays (non-negative floats) are real content read
AFTER the flow they annotate (`layout.test.ts` pins the three-band order, `backends.dom.test.ts`
pins the a11y presence, `node.ts` states it on `float`). Honest remainder, recorded: a windowed
publish exposes only materialized sections to a screen reader — a windowing concern, not an order
one. The entry below is the original inventory.

Also from the interactivity investigation, which gave published pages their first real semantics
(`link`, heading levels, alt) and exposed the next layer down.

Missing: `emit` (`canvas/engine/layout.ts:302`) orders commands by paint order — negative floats,
flow, positive floats — and the DOM backend appends in that order. A screen reader linearizes by
DOM order, so any multi-column or overlapping layout reads in an order no one designed.

Cost today: published docs and sites are now keyboard-reachable and semantically labeled but can
still read wrong: a two-column section reads column-interleaved or column-sequential by accident
of tree shape, not by decision.

Unlocks: a published page a screen reader traverses in the intended order; a correct tab sequence
across the links and interactive elements the pipeline now emits.

Shape: either the engine emits a reading-order index on commands (tree order is usually right, so
this may be nearly free) and the DOM backend orders or `aria-flowto`s by it, or the backend sorts
text/interactive nodes into a parallel semantic layer. The first is cheaper and likely correct.

Size: S to M. Risk: low structurally; the risk is subtle regressions in tab order, which needs a
manual audit per format.

Open: whether floats (decoration vs overlay) should be in the reading order at all.

---

# Deliberate non-goals

Two absences that should stay absent, recorded here so they stop being re-proposed.

**Engine-level child wrapping.** Only text wraps. A "grid of N" is a decision an element makes at
compose time, which is what makes reflow predictable enough to grade in `fit-checks.ts`. Item 4 adds
shared track sizing, which is a different thing from automatic wrapping, and should not be allowed to
smuggle it in.

**A general constraint solver.** The three-pass, constraints-down/sizes-up model is O(n), and it is
what makes export fidelity a byproduct rather than a feature. Item 7 is the bounded version of what a
solver would give, and should stay bounded.

---

# Sequencing

Re-ranked 2026-08-24, with item 1 built.

1. **Item 3, autofit.** Fully designed ([`autofit.md`](autofit.md)) and waiting; still the largest
   visible quality gap in generated decks.
2. **Item 16, hit geometry.** Promoted: three initiatives now queue behind it (chart/diagram
   draw-on, per-datum affordances, item 6's rotation), and the interactivity work built the
   consumer side it used to lack.
3. **Item 5, image intrinsics** and **item 10, distribution modes.** Small, independent, worth
   slotting beside anything.
4. **Item 18, reading order.** Cheap, and it completes what the semantics work started: a published
   page that is labeled but reads in the wrong order is half-finished accessibility.
5. **Item 17, sticky positioning.** The gating gap for real website furniture now that popups and
   menus exist.
6. **Item 4, grid.** Still the largest structural change; everything above sharpens its payoff.

Items 11 and 12 jump to the front the moment a non-Latin market is real. Item 2 becomes urgent if
long-form documents or text-range collaboration become a priority, since three subsystems are
currently paying for its absence. Items 8 and 9 are the ones to reach for if the complaint is that
output looks generic rather than that it lays out wrong.

Dependencies worth knowing:

- Item 14 (truncation) and item 3 (autofit) are plausibly one mechanism at two scales. Settle that
  before building either.
- Item 2 (line boxes) is a prerequisite for anything better than a crude clip in item 14, and for
  line-level builds in item 1.
- Item 16 (hit geometry) becomes a prerequisite of item 6 (rotation), not an independent choice.
- Item 13 (font metrics) makes item 4 (grid) typographically meaningful; a grid without a baseline is
  half the value.
- Item 15 (incremental layout) makes items 3 and 4 cheaper but blocks neither.

---

# Cross-cutting open questions

These affect several items and are worth settling once rather than per item.

Where new shared concepts live: answered in practice. Motion tokens went into `model/theme.ts` as
part of the theme contract, viewer-state machinery into `canvas/elements/ops.ts` beside its
siblings, and no nineteenth `model/` file was needed across three initiatives. The working rule:
extend the concept that owns the contract, and treat a new file as evidence the concept analysis is
wrong. A focal point (item 9) belongs to `media`, a direction (item 12) to `geometry` or
`artifact`; neither needs a new file either.

How we re-baseline the corpus. Items 3, 11 and 13 each move every number in `pnpm eval:shots` at
once. Three shipped initiatives leaned on "corpus unchanged" as their proof, which worked precisely
because none touched geometry; autofit is the first that cannot make that claim, so this process is
now the blocking prerequisite for the top item in the sequence, not a background question.

What the PPTX and PDF paths are allowed to lose: a working precedent now exists. The semantics
work honored `link` as real PDF annotations and PPTX hyperlinks while PNG ignores it by decision,
and motion exports the animation's end state. The pattern (shared field, per-backend
interpretation, explicit ignore where meaningless) is what items 6 and 8 should follow.

Whether any of this changes the AI element catalog. Items 4, 6 and 8 add authoring surface, and every
one of them is something the model will use badly by default. The catalog and prompts
(`services/core/ai/prompts/`) should be part of each item's scope rather than a follow-up.

---

# Next

Item 3 is designed: [`autofit.md`](autofit.md). Everything else here is inventory. The next step is
to pick one, write a planning doc for it in this directory in the shape of `container-merge.md` (why,
options with their objections, the design, an execution checklist), and only then touch code.
