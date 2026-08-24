# Planning — autofit: fitting a section into its own frame

> A paged section that overflows its frame currently has two outcomes: it paginates, or the whole
> slide is scaled down as pixels. Neither is what a designer would do. This plan adds a third: solve
> for the largest type-and-space scale at which the section's content genuinely reflows into its
> frame, and only fall back to the existing two when that fails.
>
> Status: designed, not started. Nothing depends on it, and it can ship in the engine alone before
> any editor work.

Companion docs: `rendering.md` (the engine, the slide chain, format-as-view), `.docs/planning/engine-gaps.md`
(item 3, which this expands), `ai.md` (generation is the biggest producer of overflowing sections),
`testing.md` (the deterministic measurer and the mocking contract).

## Why

`prepareSlideNode` (`canvas/render/commands.ts:138`) is the whole of today's answer. It composes the
section, measures its natural height, and then:

1. If the content fits, pin `h` to the frame and centre it. Good, and the common case.
2. If it does not, try `coverFitMedia` (`commands.ts:91`): when the section is a flow row with at
   least two cells and exactly one of them holds aspect-locked media, let that media absorb the slack
   by dropping its aspect and growing. When it works this is exact, and it is the best behaviour in
   the file.
3. Otherwise set `targetH` to the natural height and hand the caller a number to scale by.
   `fitSlideContent` (`backends.ts:988`) and `renderSlidePage` (`:743`) both apply
   `min(1, h / contentH)` as a transform.

Step 3 is the problem. It scales **pixels**, so type, media, padding and the section's own margins all
shrink by the same factor. A section that is twenty percent too tall comes back as a slide with
twenty percent more empty margin and type twenty percent smaller than every other slide in the deck.
It reads as a rendering mistake rather than as a dense slide, and it is the most visible quality gap
in generated output.

We already grade it. `fits-frame` and `fills-frame` in `canvas/render/fit-checks.ts` measure exactly
this, over the seven corpus artifacts, in real Chromium. So the engine has no mechanism to fix a
failure the eval reports on every run, which means the generation prompts are currently absorbing a
layout responsibility: the model is told to write less because the renderer cannot cope with more.

## The insight this rests on

Scaling the composed tree is not the same operation as scaling the rendered pixels, and the
difference is the entire feature.

`scaleTokens` (`canvas/elements/compose.ts:72`) multiplies type sizes, line heights, gaps, padding,
fixed sizes and the `min`/`max` of `fit` and `grow`. It deliberately leaves `percent` and `aspect`
alone, because those are already scale-free. The section still lays out at its full width, so smaller
type re-wraps into **fewer, longer lines** rather than into a smaller copy of the same block.

That gives the height a useful shape. At scale `f`, characters per line go as `1/f` and line height
goes as `f`, so a text block's height goes as roughly `f²`, while gaps, padding and fixed boxes go as
`f`, and aspect-locked media does not move at all:

```
H(f) ≈ A·f² + B·f + C        A = text, B = space and fixed boxes, C = aspect-locked media
```

Two consequences. `H` is monotone in `f`, so a bounded search converges. And the `f²` term means a
small scale reduction buys a large height reduction: taking `f` to 0.85 removes about 28 percent of
the text height, not 15 percent. Most overflowing sections in the corpus are inside that range.

This is also why the existing pixel scale is the wrong tool: it is `H(f) = f·H(1)` with the width
shrinking too, which is strictly worse on every term.

## Options considered

Kept for the record, with the objection that ruled each one out.

**Keep the uniform pixel scale.** No work, and it never fails. It shrinks margins and media along
with the type, so the output looks like a bug rather than a dense slide, and legibility degrades
faster than a reflow would for the same overflow.

**Solve for a width, as `fitSectionToFrame` already does.** `canvas/render/fit.ts` finds the width at
which a section takes a target aspect, and it works well. It is wrong here for the reason that file
states about itself: a deck slide is canonically 1280 wide, and reflowing it would change the line
breaks the author sees, which breaks "what you edit is what ships". Width-solving is for rendering a
section at a shape that is not its own; this is the opposite case.

**Per-element shrink priorities first.** A headline gives up less than body copy, a chart less than
padding. This is the right long-run answer and it is where a second phase should go. As the first
mechanism it is wrong: it adds a field to `ElementSpec` that all 60 elements have to answer, and the
uniform search already handles the common cases without it. Deferred, not rejected.

**Grow the frame instead, via `Section.frame.aspect`.** The model already supports it
(`canvas/engine/profile.ts:110`). It changes what the author publishes, and a deck whose slides are
different shapes because some of them ran long is worse than a deck with one dense slide.

**Paginate everything and drop the scale fallback.** Silently turning one authored slide into two is
exactly what the `overflow: "fit"` policy exists to prevent (`model/geometry.ts`, and the comment on
`FormatDescriptor.overflow`).

**Re-layout into a different arrangement.** Move the content into two columns, or wrap it. Unpredictable,
and it fights the engine's stated position that only text wraps and every breakpoint is one we chose.
That is a different item.

## The design

### The knob

One number, `fitScale`, in `(0, 1]`, composed with the existing ramp rather than replacing it.
`composeSection` currently computes:

```ts
const k = rampScale(ctx.format, ctx.availWidth);
```

It becomes `rampScale(...) * (ctx.fitScale ?? 1)`, and `LayoutCtx` (`canvas/elements/spec.ts`) gains
the optional field. Nothing else in compose changes, because everything downstream already reads `k`.

Threading it through the context rather than re-scaling the composed node afterwards matters for one
reason: the section's own side padding and gutter are scaled inside `composeSection`, _before_
`contentW` is derived, and `contentW` is what children size against for `stacksAtWidth` and
`rowShares`. Scaling the node after the fact would leave those two compose-time decisions measured
against a width the section no longer has. That is the same class of staleness the file already
documents for nested rows, and it is avoidable here for free.

The cheaper alternative, `scaleTokens(node, f)` on the already-composed node, is worth keeping in mind
if per-probe compose cost turns out to matter. It is a two-line change either way.

### The search

Lives in `commands.ts` beside `prepareSlideNode`, not in `fit.ts`. `fit.ts` imports `layoutSection`
and `layoutSlide` from `commands.ts`, so putting a solver that needs to compose and lay out into
`fit.ts` and then calling it from `commands.ts` would make the two files circular.

```
solveFitScale(section, w, frameH, measure, theme, format, plain) -> { f, height, probes }
```

Shape, deliberately mirroring `fitSectionToFrame` since that search is proven:

1. `f = 1`. We have already laid this out in `prepareSlideNode`, so it costs nothing. If it fits, return.
2. Seed from the `f²` term: `f₁ = sqrt(frameH / H(1))`, clamped to the floor. For text-dominated
   content this lands on the answer directly. For content with a scale-free part it overshoots
   upward, which the bracket then corrects downward.
3. Bisect. `H` is monotone, so a fitting probe becomes the new upper bound and an overflowing probe
   the new lower bound. Stop when the bracket is within `0.02` of itself, or when a probe fits within
   `TOL` of the frame.
4. Budget four probes total. Keep the best fitting probe seen, exactly as `fit.ts` keeps `best`, so a
   wrap step that breaks monotonicity locally degrades to a slightly conservative answer rather than
   to a wrong one.
5. Snap the answer down to the nearest `0.02` before using it, so an edit that changes the height by
   a few pixels does not visibly change the type size.

Expected cost: zero extra layouts for a section that fits, which is most of them, and two to three for
one that does not. The section paint cache (`backends.ts:853`) means this runs on a cache miss, not on
every frame, and `fitScale` is a pure function of `(section, layoutW, theme, profile)`, all of which
are already in that cache key. No key change.

### The floor

A scale floor alone is the wrong bound, because a section's smallest type is what actually becomes
illegible. The text scale runs from `label` at 13 and `caption` at 14 up to `h1` at 44
(`canvas/elements/text/text.ts:30`), so a flat 0.7 would take a caption to under 10px while leaving a
title comfortable.

```
floor = max(FIT_FLOOR, MIN_TEXT_PX / smallestFinalTextSize)
```

`smallestFinalTextSize` is the smallest text size in the tree composed at `f = 1`, so it is already
past the width ramp. `FIT_FLOOR` should be `0.7`, matching `TYPE_RAMP.min` in
`canvas/engine/profile.ts:9` so the two floors in the codebase agree. `MIN_TEXT_PX` wants to be 11,
which is worth confirming against the corpus rather than asserting.

Note what this does to the phone case: the ramp already floors at 0.7, and autofit composes with it
multiplicatively, so the per-pixel floor is what stops the two compounding into unreadable type. That
is the reason the floor is expressed in final pixels and not as a scale.

### Where it sits in the slide chain

Autofit is inserted into `prepareSlideNode` between today's steps 2 and 3. Nothing existing is
removed.

```
1. natural height fits the frame              -> today: centre in the frame.            unchanged
2. coverFitMedia applies and its probe passes -> today: media absorbs the slack.        unchanged
3. autofit finds f >= floor that fits         -> NEW: compose at f, centre in the frame.
4. a media candidate exists but its probe
   failed only because the text was too tall  -> NEW: solve f against minH, then cover-fit at f.
5. nothing worked                             -> today: paginate, or hand back a scale.  unchanged
```

Two ordering decisions worth stating explicitly.

`coverFitMedia` runs **before** autofit, because cropping a photo costs nothing typographically while
shrinking type costs everything. Where it applies it is already the better answer, it is already
implemented, and `coverfit.dom.test.ts` already pins it.

Step 4 is the composite worth having: `coverFitMedia`'s precondition is that the section minus its
media fits the frame, and when that fails because the _text_ is too tall, shrinking the text is
exactly what unblocks it. So the objective in that branch is `minH(f) <= frameH` rather than
`H(f) <= frameH`, and the media absorbs whatever is left. This reuses the probe that already exists
inside `coverFitMedia` rather than adding another.

**Autofit does not apply on the path to pagination.** If we are going to split a section across pages,
those pages should carry the author's type at full size; shrinking the type _and_ splitting is the
worst of both. Concretely: run autofit before the `PAGINATE_ABOVE` check (`commands.ts:197`) only for
`overflow: "fit"` formats and for sections under the threshold. A section headed for pagination is
composed at `f = 1`.

### Where the scale becomes visible

The solved `fitScale` has to leave `prepareSlideNode`, because three consumers need it.

`paintSectionStack` returns it per section alongside `tops` and `heights`, and the editor store keeps
it next to `sectionTops`. That is the smallest change that serves all three:

- **The inline text editor.** `paintedCtx` in `editor/core/leaf.ts:13` reconstructs the compose
  context so the editing overlay matches the painted text exactly. It has to pass the same
  `fitScale`, or typing into a fitted section shows text at a different size than the canvas beneath
  it. This is the one integration that is not optional.
- **The section readout.** Today an overflowing framed section gets a hairline `overflowMark`
  (`backends.ts:834`). That stays for the genuinely unfittable case, and a fitted section instead
  gets a quiet indicator in the section actions saying what it was fitted to.
- **The eval.** See below.

### The editor's behaviour while editing

One rule, and it is worth writing down because the failure is unpleasant: **the fit scale is frozen
while an inline edit is active in that section, and re-solved on commit.** Without it, every
keystroke that crosses a wrap boundary re-solves the scale, the type size changes underneath the
caret, and the caret moves. `editing()` already identifies the section, and `stopEditing` is already
the commit point.

The inspector keeps showing **authored** values. A type-size control that displays 17 while the canvas
paints 14.5 is correct: the author set 17, and autofit is a render-time accommodation, not an edit.

### What does not change

- Continuous formats. There is no frame to fit, so autofit is guarded on `profile.kind === "paged"`.
- Present, PDF, PNG and PPTX. All four go through `sectionSlides`, so they inherit this and stay
  consistent with the editor by construction.
- Thumbnails and the minimap. `Thumb` (`editor/Canvas.tsx`) calls `layoutSlide` when slide framing is
  on, so it inherits too.
- The stored artifact. Autofit writes nothing. It is a pure function of content, width, theme and
  profile, which is what keeps it out of collab, undo and the save path entirely.

### No new model field

The obvious instinct is a per-section escape hatch, `Section.frame.fit`. Recommend against it, for a
concrete reason: `Section.frame.aspect` has existed in the model since it was added, is honoured by
`sectionFrame`, and **has no authoring surface anywhere in the editor**. Adding a second unauthored
field to the same object would be adding dead surface twice. Ship autofit unconditional for paged
formats, and add the opt-out only if someone asks for it, at which point both fields can get a
control together.

## Consequences elsewhere

**`fitSectionToFrame` gets better for free.** Its `asPageOrGiveUp` branch (`canvas/render/fit.ts`)
calls `layoutSlide`, so it inherits autofit and will succeed at widths where it currently gives up.
Fewer letterboxed thumbnails, and fewer sections that cannot translate between formats.

**The eval keeps measuring the right thing, but should measure one more.** `diagnoseSection`
(`canvas/render/diagnose.ts`) calls `layoutSection`, not `layoutSlide`, so `fits-frame` and
`fills-frame` continue to report **natural, pre-fit** overflow. That is the correct default and it is
already right: autofit must not make the generation quality signal disappear. Worth adding alongside
it is the fit scale itself on `SectionFit`, so a run can report "eleven sections fitted, worst at
0.78" and we can see whether the model is systematically overshooting rather than only whether it
overflowed.

**`typeSizes` moves slightly.** `MAX_TYPE_SIZES` counts distinct rounded font sizes among painted
text. A uniform scale preserves the count in general but can collapse two nearby sizes into one after
rounding, which makes the check marginally easier to pass. Not worth compensating for, worth knowing
before reading a diff of the numbers.

**`leftEdges` is unaffected.** A uniform scale preserves alignment, so `aligns-to-a-grid` should not
move at all. If it does, something is wrong with the implementation.

## Risks

**Every corpus number moves at once.** This is the main one. Autofit changes the rendered output of
every paged section that currently overflows, so a single `pnpm eval:shots` diff will show movement
everywhere and will not by itself distinguish improvement from regression. Mitigation: capture a full
before-run, and report the fit scale per section so the diff can be read as "these eleven sections
were fitted" rather than as noise. This is the item that most needs the re-baselining process that
`engine-gaps.md` lists as an open question.

**Probe cost on cache misses.** Two to three extra compose-plus-layout passes per overflowing section.
Bounded by the four-probe budget and by the `f = 1` short circuit, and it only runs on a paint that
was going to lay the section out anyway. `render_slow` (`model/analytics.ts:532`) already instruments
the paint, so a regression here is visible without new work.

**Monotonicity is an approximation.** Wrapping is a step function, and a contrived layout could shrink
and get taller. The search keeps the best fitting probe rather than the last one, which turns that
into a conservative answer instead of a wrong one.

**The model learns that overflow is free.** It is not, since the eval still measures natural overflow,
but the prompts currently carry instructions about content volume that were written for a renderer
that could not cope. Those should be revisited _after_ this ships and after we can see how much
autofit is actually doing, not as part of it.

## Phases

### Phase A: the engine (ships alone)

- [ ] `LayoutCtx.fitScale?: number`, consumed in `composeSection` as `rampScale(...) * (fitScale ?? 1)`.
- [ ] `solveFitScale` in `canvas/render/commands.ts`: seed, bisect, four-probe budget, snap to 0.02.
- [ ] The floor: `FIT_FLOOR = 0.7` beside `TYPE_RAMP.min`, `MIN_TEXT_PX`, and the walk that finds the
      smallest composed text size.
- [ ] Wire into `prepareSlideNode` as steps 3 and 4, after `coverFitMedia`, before the pagination
      threshold, paged formats only, and never on the path to pagination.
- [ ] Return the solved scale from `prepareSlideNode`, `layoutSlide` and `sectionSlides`.
- [ ] Tests, `canvas/render/__tests__/autofit.test.ts`: a fitting section returns exactly 1 and spends
      one layout; an overflowing text section returns a scale that fits and respects the floor; the
      floor is honoured against the smallest type, not the average; a media section still takes the
      `coverFitMedia` path unchanged; a 3.6x section still paginates at full size.
- [ ] Confirm `coverfit.dom.test.ts` and `overflow.dom.test.ts` still pass, and re-baseline the
      numbers in the second one deliberately if they move.

### Phase B: the editor

- [ ] `paintSectionStack` returns `fitScales`, the store keeps them beside `sectionTops`.
- [ ] `paintedCtx` (`editor/core/leaf.ts`) passes the section's fit scale, so the inline editor
      overlay matches the paint.
- [ ] Freeze the fit scale while an inline edit is active in that section; re-solve on `stopEditing`.
- [ ] The section readout: keep `overflowMark` for unfittable, add a quiet fitted indicator otherwise.
- [ ] Confirm the inspector still shows authored sizes.

### Phase C: measurement

- [ ] `SectionFit.fitScale` on `canvas/render/diagnose.ts`, reported by `pnpm eval:shots`.
- [ ] Decide whether a check earns its place (`fits-without-shrinking`, say) or whether the number in
      the report is enough. Prefer the number until we have seen a few runs.
- [ ] Full before-and-after corpus run, read section by section.

### Phase D: deferred

- [ ] Per-element shrink priorities on `ElementSpec`, so a headline and a chart give up less than body
      copy and padding. Only worth designing once we can see, from Phase C, which sections the uniform
      scale serves badly.
- [ ] Revisit the generation prompts' content-volume guidance in light of what autofit absorbs.

## Still open

- `MIN_TEXT_PX = 11` is a guess. Measure the corpus before fixing it.
- Whether step 4 (solve against `minH`, then cover-fit) is worth the complexity in the first pass, or
  whether Phase A should ship with steps 3 and 5 only and add it once the simple case is proven.
- Whether the fitted indicator belongs in the section actions or the inspector, which is a
  `frontend.md` question rather than an engine one.
- Whether `overflow: "fit"` formats should be allowed below `FIT_FLOOR`, since they have no
  pagination to fall back to and a card that must be one page might prefer illegible to cropped.
