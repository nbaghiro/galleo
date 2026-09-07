# Galleo — Motion: transitions, build-in, theme motion

> Options A, B and E of the motion exploration, as built: slide transitions, a build-in derived
> from structure, and a motion vocabulary owned by the theme. Cross-slide morph (C) and authored
> per-element motion (D) are out of scope and stay out.

Companion docs: `../rendering.md` (the engine and the paint backends), `../frontend.md` (the `@ui`
rules every component here follows), `draw-on.md` (the per-datum choreography built on top of
this).

## 1. Scope, and the one rule

In: a transition between paged slides; a staggered entrance for the content of a slide; the same
entrance triggered by scroll in continuous formats; a motion vocabulary on the theme;
reduced-motion handling.

Out: cross-slide morph, authored per-element motion, live reflow during a drag, motion anywhere in
the editor canvas.

**The one rule, restated because everything below depends on it: motion may affect `opacity` and
`transform` only, never geometry.** Export, autofit, `fitSectionToFrame`, the eval checks and the
section paint cache are all correct without changes, because the animation's end state is the
layout that was already being produced. The standing proof is `pnpm eval:shots`: the corpus render
must be unchanged by any motion work, because if a number moves, motion has reached geometry
somewhere.

## 2. Where it lives, by layer

| Layer  | File                        | What it holds                                                                                  |
| ------ | --------------------------- | ---------------------------------------------------------------------------------------------- |
| model  | `model/theme.ts`            | `MotionTokens`, the two vocabularies, `DEFAULT_MOTION`, `motionFor`, `Tokens.motion`, `Pal.mo` |
| canvas | `canvas/render/backends.ts` | `paint` and `fitSlideContent` return the nodes they created                                    |
| canvas | `canvas/render/present.ts`  | `slideElement` passes those nodes (and the page's regions) through                             |
| ui     | `ui/viewport.ts`            | `prefersReducedMotion`                                                                         |
| ui     | `ui/motion.ts`              | the pure schedule plus the imperative driver                                                   |
| ui     | `ui/present.tsx`            | the transition, the build, the reveal observer                                                 |

No new `model/` file: motion is part of the theme contract, so it lives in the file that owns that
contract rather than in `model/elements.ts`, which holds per-element value sets.

## 3. `model/theme.ts`: the motion contract

```ts
export const SLIDE_TRANSITIONS = ["cut", "fade", "push"] as const;
export const BUILD_RHYTHMS = ["none", "settle", "rise"] as const;

export interface MotionTokens {
    transition: SlideTransition;
    build: BuildRhythm;
    duration: number; // ms for one slide change; the build stagger derives from it
    easing: string;
}

export const DEFAULT_MOTION: MotionTokens = {
    transition: "fade",
    build: "settle",
    duration: 260,
    easing: "cubic-bezier(.2,.7,.2,1)",
};

export const motionFor = (t: Tokens): MotionTokens => ({ ...DEFAULT_MOTION, ...t.motion });
```

`Tokens.motion` is `Partial<MotionTokens>` rather than whole, so a theme can say
`{ transition: "push" }` and inherit the rest. Three things work with no further edit, each
verified when this landed:

- `zTokens` in `services/api/themes.ts` is a `z.looseObject`, so the field survives the wire.
- `ThemeEditor` builds its store by spreading the base tokens, so a custom theme derived from a
  built-in keeps its motion even with no control for it.
- The section paint cache compares the theme by reference, and motion never reaches layout, so
  nothing invalidates.

`Pal` carries `mo?: Partial<MotionTokens>` and `mk` spreads it conditionally — `Pal` already holds
the non-colour knobs (`bw`, `sh`, `sc`), so this fits where it lands. The easing default matches
the curve `ui/overlay.tsx` already used, so the product has one motion curve rather than two.

## 4. The canvas change, and why it is generic

One idea, applied through the paint path: **a painter reports the nodes it created.** That is not
a motion concept — it is equally useful for overlay chrome that has to sit on a specific painted
box, for tests that assert against a node rather than a selector, and for debugging.

`paint(commands, host, assets)` returns `HTMLElement[]`, index-parallel to `commands` — the
invariant `paintReconcile` already depends on. Widening a return is source-compatible: existing
call sites ignore it. `fitSlideContent` returns `{ el, nodes }`, and `slideElement`
(`canvas/render/present.ts`) returns `{ el, content, commands, nodes, regions }` — the commands,
the nodes that painted them, and the page's regions (including the per-datum regions draw-on
consumes), all from the same `sectionSlides` page, so the arrays are index-parallel by
construction.

Nothing else in `canvas/` moved: `RenderCommand`, `Region`, the engine, the 2D-canvas backend and
every export path are untouched, which is what keeps the static outputs identical.

## 5. `ui/viewport.ts`: reduced motion

The tree had three reduced-motion conventions and none reached the player. The `matchMedia` form
is generalized into `ui/viewport.ts`, which owns environment capability queries (`isPhone`,
`isCoarsePointer`, `canEditHere`) and already runs exactly this listener pattern: the
`(prefers-reduced-motion: reduce)` query joins the watched list and re-evaluates on the same
listener the tier uses. The driver is imperative, so it needs a JS answer rather than a Tailwind
variant.

Under reduced motion, transitions become cuts and builds become instant. Removed, not shortened.
`runTransition` and `runBuild` both check `prefersReducedMotion()` first and return immediately,
so no caller can forget.

## 6. `ui/motion.ts`: the schedule and the driver

A flat category file beside `ui/gesture.ts` and `ui/scroll.ts`: a concept, no component. It
imports `model` and `canvas` only, per the layering law. The split that matters: **the schedule is
pure and unit-testable, the driving is imperative.** No animation library — the Web Animations API
with `fill: "both"` is the house pattern for imperative motion, and nothing more is needed for
opacity and transform.

### The build unit

The unit of arrival is decided by `buildUnits(root, paints)`. The original definition — the
section root's direct children — was far too coarse: on the corpus it produced steps of eight and
twenty-one elements arriving at once. `buildUnits` instead descends through any element whose spec
is `tier: "container"` and which paints nothing of its own, and stops everywhere else. A bare
layout row is descended into, so two cards in it arrive separately; a card paints a surface, so it
arrives whole with its contents rather than assembling itself. The corpus runs one to nine steps
per section under this rule. Keeping the heuristic here rather than in any renderer is the same
altitude rule the rest of motion follows.

### The pure half

`buildGroups(root, commands, nodes)` pairs each unit with the nodes that paint it, in document
order. A command carrying no id belongs to whatever was addressed most recently (`emit` walks
depth-first, so that is its own element); a command addressed to the section itself resets the
grouping, because the slide's ground should be present before its content arrives — the section
background and the root never animate. Grouping by parsed path rather than by position is what
handles floats, whose commands are emitted out of flow order.

`staggerMs` caps the tail so a busy slide does not crawl:
`min(duration * 0.4, 700ms / (count - 1))`. `buildFrames` maps the rhythm to keyframes (`settle`:
opacity plus a 10px upward translate; `rise`: 26px and, by convention in the themes that choose
it, a longer duration; `none`: no frames). `transitionFrames` maps the transition (`cut`: empty;
`fade`; `push`: a 6% horizontal push, symmetric under direction reversal).

### The imperative half

`runTransition(outgoing, incoming, m, dir)` resolves when the incoming animation finishes so the
caller can drop the outgoing node; a cancelled transition is a newer one taking over, not a
failure. `runBuild(groups, m, plans)` animates every node in a unit with that unit's delay, and
hands any draw-on plans to their choreography at the same delay (`draw-on.md`).

## 7. The transition, in `ui/present.tsx`

### The stage

Two slides have to coexist for the length of a transition, and they have to overlap rather than
sit side by side. Each slide is wrapped in a **stage** (`absolute inset-0 flex items-center
justify-center`) inside the relative host, so two stages overlap naturally, each centring its own
slide exactly as the flex host did, and the resting appearance is unchanged. The stage also
solves the transform collision: the slide element carries `scale(k)` for the viewport fit and the
content wrapper inside it carries the fit scale from `fitSlideContent`; the stage owns the motion
transform and neither existing transform is touched. Without the wrapper, every keyframe would
have to restate `scale(k)`, which changes on resize.

### Direction is a cue, not state

```ts
type MotionCue = "none" | "forward" | "back" | "enter";
```

`none` for a resize repaint, an overview toggle, or a re-paginate; `forward` and `back` for an
advance; `enter` for the first paint, which builds without a transition. `next`, `prev`,
`goToSection` and the overview jump each set a pending cue before moving the index; the render
effect reads and clears it, defaulting to `none` — and an overview repaint must not consume the
cue, or a grid click lands without motion. `goToSection` derives its sign by comparing the target
index to the current one, so a narration jump backwards reads as backwards. Resize passes `none`
explicitly, which is the specific bug this design avoids: resize and an advance funnel into the
same `render()`, and without the cue a window drag would fire a transition per frame.

### Sequence

On an animated cue the incoming stage is appended (both stages mounted, incoming on top), the
outgoing gets `pointer-events: none`, the build starts immediately — **concurrent with the
transition**, because the new slide's content rising while the slide itself fades in reads as one
movement and the opacities multiply cleanly — and the outgoing stage is removed when
`runTransition` resolves. An advance arriving mid-transition removes every stage that is not the
newest before appending, so holding the arrow key does not stack stages.

The build runs on `forward`, `back` and `enter` alike: navigating backwards re-runs the slide's
build. Not re-running was tried in thought and rejected as making going back feel dead; see Open
questions.

## 8. Playback surfaces only

The build never runs in the editor canvas. `paintReconcile` wipes styles and children on every
reused node on every call, so an animation running during an edit dies mid-flight; content does
not change during playback, so the player never meets that problem. An author who wants to see
the build opens the player, which they already have. The published viewer plays motion by
construction: it renders the same `PresentSurface`, and reduced motion is the opt-out.

## 9. Continuous reveals

The same `buildGroups` and `runBuild`, triggered by intersection rather than by a clock. The
continuous repaint path only fires when the window band shifts by about a third of a viewport,
which is far too coarse for a scroll-linked effect, so the player attaches one
`IntersectionObserver` to each section layer it sees and reveals on first intersection.

**One-shot per section per session, tracked outside the DOM.** Windowing nulls a layer beyond the
retention margin and rebuilds it from scratch on return, so a DOM-tracked reveal would re-fire
every time the reader scrolls back up. A `Set<string>` of revealed section ids in the player fixes
it, deliberately per-session rather than persisted. Reveals apply in publish and in Present's
continuous mode; the editor canvas is excluded for the same reason as the build, and the observer
is not even created when the theme's build is `none` or reduced motion is on.

## 10. Theme motion identities

The vocabulary is only worth having if the themes use it. Seven themes carry an explicit `mo:`
identity in `model/theme.ts` — from `{ transition: "cut", build: "none" }` (a legitimate identity,
not an absence of one: the brutalist theme does not ease) through `{ build: "rise",
duration: 420 }` for the deliberate luxe reveal to `{ transition: "push", build: "rise",
duration: 180 }` — and the rest inherit `DEFAULT_MOTION`, which is the deliberate choice for most:
a tight editorial theme and a brutalist one should not move the same way, and most themes have no
strong motion character to assert. Every identity is checked under reduced motion, since a theme
whose identity is carried entirely by motion has to still read correctly without it.

## 11. Tests

`ui/__tests__/motion.test.ts` (pure, no DOM) pins the grouping rules — the section ground stays
out of the build, a bare container is descended into while a painting card stays whole, a leaf
root is one piece, an unaddressed command joins its element — plus the stagger cap and the frame
properties (push symmetric under reversal, every transition ending at rest, cut and `build:
"none"` producing nothing). `ui/__tests__/motion.dom.test.ts` (happy-dom, the WAAPI stub) pins the
driver: both slides animate and the promise resolves, cut resolves without animating, the theme's
duration and easing are carried, reduced motion and `build: "none"` create nothing.
`canvas/render/__tests__/backends.dom.test.ts` pins that `paint` returns one node per command,
index-parallel, appended in order.

Not tested by machine: whether it looks good. That is a review pass against the corpus in the
real player, and it is the actual acceptance criterion.

## 12. One invariant worth not regressing

`render()` reads the slide counts through `locate()`, and the progress effect bumps its counter
after every advance. With the paint inside the effect's tracked scope, that second run repainted
over the transition it had just started, which made every forward advance look motionless. The
render effect in `ui/present.tsx` therefore declares its repaint dependencies explicitly and calls
`render` inside `untrack` — the same idiom `editor/Canvas.tsx` uses for its draw effect. Anything
added to `render`'s path that should trigger a repaint has to be read in the effect body, not
relied on through tracking.

There is no automated test for this: the repo has no component-test project, so a Solid effect
inside `PresentSurface` cannot be driven from a unit test. The comment in the effect carries the
reason instead.

## 13. Analytics

No event exists for motion. If one is wanted it is a one-line addition to `Events` in
`model/analytics.ts`, and it should carry the theme's motion identity and nothing else.

## Open questions

- **Whether the published viewer should keep motion unconditionally.** Today it has it, because it
  renders the same `PresentSurface`; it is the artifact most likely to be seen by someone who did
  not make it, which argues for motion, and the one most likely to be on a slow device, which
  argues for an opt-out beyond `prefers-reduced-motion`. No one has asked yet.
- **Whether a slide's build should re-run on backwards navigation.** Today it does. Re-running
  reads as a loop to some eyes; not re-running makes going back feel dead. The current answer
  stands until real use argues otherwise.
