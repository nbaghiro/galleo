# Autofit: fitting a section into its own frame

> A paged section that overflows its frame has three outcomes: its dominant media absorbs the
> slack, the section re-composes at a smaller type-and-space scale until it genuinely reflows into
> the frame, or it falls back to pagination / pixel scaling. The middle outcome is autofit: solve
> for the largest scale at which the content fits, and only fall back when that fails.

Companion docs: `../rendering.md` (the engine, the slide chain, format-as-view),
`../planning/engine-gaps.md` (item 3, which this expands), `../ai.md` (generation is the biggest
producer of overflowing sections), `../testing.md` (the deterministic measurer and the mocking
contract).

## Why

`prepareSlideNode` (`canvas/render/commands.ts`) composes the section, measures its natural
height, and before autofit had two answers for overflow: let `coverFitMedia` absorb the slack into
a single dominant media cell, or hand the caller a number to scale the rendered pixels by
(`fitSlideContent` and `renderSlidePage` in `backends.ts` apply `min(1, h / contentH)` as a
transform).

The pixel scale is the problem autofit exists to solve. It scales **pixels**, so type, media,
padding and the section's own margins all shrink by the same factor. A section that is twenty
percent too tall comes back as a slide with twenty percent more empty margin and type twenty
percent smaller than every other slide in the deck. It reads as a rendering mistake rather than as
a dense slide, and it was the most visible quality gap in generated output.

We grade it: `fits-frame` and `fills-frame` in `canvas/render/fit-checks.ts` measure exactly this,
over the corpus artifacts, in real Chromium. Before autofit the engine had no mechanism to fix a
failure the eval reported on every run, which meant the generation prompts were absorbing a layout
responsibility: the model was told to write less because the renderer could not cope with more.

## The insight this rests on

Scaling the composed tree is not the same operation as scaling the rendered pixels, and the
difference is the entire feature.

`scaleTokens` (`canvas/elements/compose.ts`) multiplies type sizes, line heights, gaps, padding,
fixed sizes and the `min`/`max` of `fit` and `grow`. It deliberately leaves `percent` and `aspect`
alone, because those are already scale-free. The section still lays out at its full width, so
smaller type re-wraps into **fewer, longer lines** rather than into a smaller copy of the same
block.

That gives the height a useful shape. At scale `f`, characters per line go as `1/f` and line
height goes as `f`, so a text block's height goes as roughly `f²`, while gaps, padding and fixed
boxes go as `f`, and aspect-locked media does not move at all:

```
H(f) ≈ A·f² + B·f + C        A = text, B = space and fixed boxes, C = aspect-locked media
```

Two consequences. `H` is monotone in `f`, so a bounded search converges. And the `f²` term means a
small scale reduction buys a large height reduction: taking `f` to 0.85 removes about 28 percent
of the text height, not 15 percent. Most overflowing sections in the corpus are inside that range.

This is also why the pixel scale is the wrong tool: it is `H(f) = f·H(1)` with the width shrinking
too, which is strictly worse on every term.

## Not taken

Kept for the record, with the objection that ruled each one out.

**Keep the uniform pixel scale.** No work, and it never fails. It shrinks margins and media along
with the type, so the output looks like a bug rather than a dense slide, and legibility degrades
faster than a reflow would for the same overflow. (It survives as the last fall-back, behind
autofit.)

**Solve for a width, as `fitSectionToFrame` already does.** `canvas/render/fit.ts` finds the width
at which a section takes a target aspect, and it works well. It is wrong here for the reason that
file states about itself: a deck slide is canonically 1280 wide, and reflowing it would change the
line breaks the author sees, which breaks "what you edit is what ships". Width-solving is for
rendering a section at a shape that is not its own; this is the opposite case.

**Per-element shrink priorities first.** A headline gives up less than body copy, a chart less
than padding. This is the right long-run answer, but as the first mechanism it is wrong: it adds a
field to `ElementSpec` that every element has to answer, and the uniform search already handles
the common cases without it. Deferred by decision, not rejected: `ElementSpec` carries no `shrink`
field today, and the deferral is recorded as the remaining part of `engine-gaps.md` item 3,
together with the revisit of the generation prompts' content-volume guidance.

**Grow the frame instead, via `Section.frame.aspect`.** The model supports it
(`canvas/engine/profile.ts`). It changes what the author publishes, and a deck whose slides are
different shapes because some of them ran long is worse than a deck with one dense slide.

**Paginate everything and drop the scale fallback.** Silently turning one authored slide into two
is exactly what the `overflow: "fit"` policy exists to prevent (`model/geometry.ts`, and the
comment on `FormatDescriptor.overflow`).

**Re-layout into a different arrangement.** Move the content into two columns, or wrap it.
Unpredictable, and it fights the engine's stated position that only text wraps and every
breakpoint is one we chose. That is a different item.

## The design

### The knob

One number, `fitScale`, in `(0, 1]`, composed with the existing ramp rather than replacing it.
`LayoutCtx` (`canvas/elements/spec.ts`) carries the optional field, and `composeSection` folds it
into the one compose factor via `composeScale(ctx.format, ctx.availWidth, ctx.fitScale ?? 1)`.
Nothing else in compose changes, because everything downstream already reads that factor.

Threading it through the context rather than re-scaling the composed node afterwards matters for
one reason: the section's own side padding and gutter are scaled inside `composeSection`, _before_
`contentW` is derived, and `contentW` is what children size against for `stacksAtWidth` and
`rowShares`. Scaling the node after the fact would leave those two compose-time decisions measured
against a width the section no longer has (the same class of staleness compose already documents
for nested rows). The cheaper alternative, `scaleTokens(node, f)` on the already-composed node,
remains available if per-probe compose cost ever matters; it is a two-line change either way.

### The search

`solveFitScale` lives in `canvas/render/commands.ts` beside `prepareSlideNode`, not in `fit.ts`:
`fit.ts` imports `layoutSection` and `layoutSlide` from `commands.ts`, so a solver that composes
and lays out cannot live in `fit.ts` without making the two files circular.

Its shape deliberately mirrors `fitSectionToFrame`, since that search is proven:

1. `f = 1` is the caller's own measurement — `prepareSlideNode` has already laid it out, so a
   fitting section costs nothing.
2. Seed from the `f²` term: `sqrt(frameH / H(1))`, snapped and clamped to the floor. For
   text-dominated content this lands on the answer directly. For content with a scale-free part it
   overshoots upward, which the bracket then corrects downward.
3. Bisect. `H` is monotone, so a fitting probe becomes the new upper bound and an overflowing
   probe the new lower bound. Stop when the bracket is within `FIT_STEP` of itself, or when a
   probe fills at least `1 - FIT_TOL` of the frame.
4. Budget `FIT_PROBES = 4` layouts total, counting the `f = 1` the caller already did. Only a
   fitting probe is ever returned, exactly as `fit.ts` keeps `best`, so a wrap step that breaks
   monotonicity locally degrades to a slightly conservative answer rather than to a wrong one.
5. Probes are snapped down onto the `FIT_STEP = 0.02` grid before laying out, so the answer is
   already on the grid and an edit that changes the height by a few pixels does not visibly change
   the type size.

Cost: zero extra layouts for a section that fits, which is most of them, and two to three for one
that does not. The section paint cache (`backends.ts`) means this runs on a cache miss, not on
every frame, and `fitScale` is a pure function of `(section, layoutW, theme, profile)`, all of
which are already in that cache key — no key change. `render_slow` (`model/analytics.ts`)
instruments the paint, so a probe-cost regression is visible without new work.

### The floor

A scale floor alone is the wrong bound, because a section's smallest type is what actually becomes
illegible. The text scale runs from `label` at 13 and `caption` at 14 up to `h1` at 44
(`canvas/elements/text/text.ts`), so a flat 0.7 would take a caption to under 10px while leaving a
title comfortable. `fitFloor` in `commands.ts` computes:

```
floor = max(FIT_FLOOR, MIN_TEXT_PX / smallestComposedTextSize)
```

The smallest text size is walked from the tree composed at `f = 1`, so it is already past the
width ramp. `FIT_FLOOR = 0.7` and `MIN_TEXT_PX = 11` live in `canvas/engine/profile.ts` beside
`TYPE_RAMP`, whose `min` is also 0.7 so the two floors in the codebase agree. `MIN_TEXT_PX` is a
tunable constant, not a measured one: no corpus section reaches the floor, because a paginating
format stops searching at `PAGINATE_ABOVE` (below), so the number is only exercised by
`overflow: "fit"` formats.

Note what this does to the phone case: the ramp already floors at 0.7, and autofit composes with
it multiplicatively, so the per-pixel floor is what stops the two compounding into unreadable
type. That is the reason the floor is expressed in final pixels and not as a scale.

### Where it sits in the slide chain

`prepareSlideNode` runs, in order:

```
1. natural height fits the frame              -> centre in the frame
2. coverFitMedia applies and its probe passes -> commit the cover-fit; media absorbs the slack
3. autofit finds f >= floor that fits         -> compose at f, centre in the frame
4. a media candidate exists but its probe
   failed only because the text was too tall  -> solve f against the media-collapsed minimum,
                                                 then commit the cover-fit at f
5. nothing worked                             -> paginate, or hand back a pixel scale
```

Two ordering decisions worth stating explicitly.

`coverFitMedia` runs **before** autofit, because cropping a photo costs nothing typographically
while shrinking type costs everything. Where it applies it is the better answer, and
`coverfit.dom.test.ts` pins it. The find is pure — `coverFitMedia` mutates nothing, and
`commitCoverFit` is the one mutation site, applied only by a branch that commits to the crop
(recorded as engine-audit E3) — so a branch that decides against it keeps an untouched tree.

Step 4 is the composite worth having, and it is where the media case actually lands:
`coverFitMedia`'s precondition is that the section minus its media fits the frame, and when that
fails because the _text_ is too tall, shrinking the text is exactly what unblocks it. So the
objective in that branch is `minH(f) <= frameH` (the `collapsedHeight` with the media parked at
zero) rather than `H(f) <= frameH`, and the media absorbs whatever is left. A photo with more
caption than a slide holds fails `coverFitMedia`'s own probe and is rescued here.

**Autofit does not apply on the path to pagination.** If a section is going to split across pages,
those pages should carry the author's type at full size; shrinking the type _and_ splitting is the
worst of both. Concretely, the search runs only when the section would not paginate:
`format.overflow !== "fit" && height > frameH * PAGINATE_ABOVE` (with `PAGINATE_ABOVE = 1.2` in
`commands.ts`) sends a section to pagination composed at `f = 1`, and an `overflow: "fit"` format
never splits, so it always gets the search.

A consequence worth knowing: the reachable range is narrower than the floor suggests. On deck,
doc and web (all `paginate`) autofit only ever sees sections up to 1.2× their frame, which bottoms
out around f ≈ 0.84. `FIT_FLOOR` binds only for `fit` formats.

### Where the scale becomes visible

The solved `fitScale` leaves `prepareSlideNode` through `layoutSlide` and `sectionSlides`
(`SlidePage.fitScale`), and `paintSectionStack` returns it per section alongside `tops` and
`heights`; the editor keeps it in the `sectionFits` signal (`editor/core/store.ts`, written by
`setSectionFits` in `editor/Canvas.tsx`). Three consumers need it:

- **The inline text editor.** `paintedCtx` in `editor/core/leaf.ts` reconstructs the compose
  context so the editing overlay matches the painted text exactly, and passes the section's fit
  scale — without it, typing into a fitted section would show text at a different size than the
  canvas beneath it. This is the one integration that is not optional.
- **The section readout.** An unfittable framed section keeps the hairline `overflowMark`
  (`backends.ts`); a fitted section instead shows a muted "Fitted N%" beside the section controls
  (`editor/panels/Selection.tsx`).
- **The eval** (below).

### The editor's behaviour while editing

One rule, because the failure is unpleasant: **the fit scale is frozen while an inline edit is
active in that section, and re-solved on commit.** Without it, every keystroke that crosses a wrap
boundary re-solves the scale, the type size changes underneath the caret, and the caret moves. The
`fitFreeze` signal (`editor/core/store.ts`) carries the held `{ id, scale }`, `paintSectionStack`
takes it as the `freezeFit` option, and `prepareSlideNode`'s `freeze` parameter holds the scale
steady instead of solving; `stopEditing` is the commit point that drops the freeze.

The inspector keeps showing **authored** values. A type-size control that displays 17 while the
canvas paints 14.5 is correct: the author set 17, and autofit is a render-time accommodation, not
an edit.

### What does not change

- Continuous formats. There is no frame to fit, so autofit is guarded on
  `profile.kind === "paged"`.
- Present, PDF, PNG and PPTX. All four go through `sectionSlides`, so they inherit this and stay
  consistent with the editor by construction.
- Thumbnails and the minimap. `Thumb` (`editor/Canvas.tsx`) calls `layoutSlide` when slide framing
  is on, so it inherits too.
- The stored artifact. Autofit writes nothing. It is a pure function of content, width, theme and
  profile, which is what keeps it out of collab, undo and the save path entirely.

### No new model field

The obvious instinct is a per-section escape hatch, `Section.frame.fit`. There is none, for a
concrete reason: `Section.frame.aspect` has existed in the model since it was added, is honoured
by `sectionFrame`, and has no authoring surface anywhere in the editor. Adding a second unauthored
field to the same object would be adding dead surface twice. Autofit is unconditional for paged
formats; the opt-out gets added only if someone asks for it, at which point both fields can get a
control together.

## Consequences elsewhere

**`fitSectionToFrame` got better for free.** Its `asPageOrGiveUp` branch (`canvas/render/fit.ts`)
calls `layoutSlide`, so it inherits autofit and succeeds at widths where it used to give up. Fewer
letterboxed thumbnails, and fewer sections that cannot translate between formats.

**The eval keeps measuring the right thing, plus one more.** `diagnoseSection`
(`canvas/render/diagnose.ts`) calls `layoutSection`, not `layoutSlide`, so `fits-frame` and
`fills-frame` continue to report **natural, pre-fit** overflow. That is the correct default:
autofit must not make the generation quality signal disappear. Alongside it, `SectionFit.fitScale`
carries the solved scale, and `fit-checks.ts` reports "rendered at 0.78" on a fitted section, so a
run can show whether the model is systematically overshooting rather than only whether it
overflowed. A dedicated check (`fits-without-shrinking`, say) was considered and not added: the
number in the report is enough until several runs say otherwise.

**`typeSizes` moves slightly.** `MAX_TYPE_SIZES` counts distinct rounded font sizes among painted
text. A uniform scale preserves the count in general but can collapse two nearby sizes into one
after rounding, which makes the check marginally easier to pass. Not worth compensating for, worth
knowing when reading a diff of the numbers.

**`leftEdges` is unaffected.** A uniform scale preserves alignment, so `aligns-to-a-grid` does not
move. If it does, something is wrong with the implementation.

## Still open

- Whether `overflow: "fit"` formats should be allowed below `FIT_FLOOR`, since they have no
  pagination to fall back to and a card that must be one page might prefer illegible to cropped.
- Whether `PAGINATE_ABOVE` is still the right threshold now that a third outcome exists between
  "scale it" and "split it". A section at 1.3× would fit comfortably at 0.88 rather than split.
