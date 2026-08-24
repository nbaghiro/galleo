# Planning — motion implementation (transitions, build-in, theme motion)

> The executable plan for options A, B and E of [`motion.md`](motion.md): slide transitions, a
> build-in derived from structure, and a motion vocabulary owned by the theme. Cross-slide morph (C)
> and authored per-element motion (D) are out of scope and stay out.
>
> Status: ready to execute. The engine change is one widened return type; everything else sits in
> `model/theme.ts`, `ui/` and the player.

Companion docs: [`motion.md`](motion.md) (why this shape and what was rejected), `rendering.md` (the
engine and the paint backends), `frontend.md` (the `@ui` rules every new component here follows).

## 1. Scope

In: a transition between paged slides; a staggered entrance for the content of a slide; the same
entrance triggered by scroll in continuous formats; a motion vocabulary on the theme; reduced-motion
handling.

Out: cross-slide morph, authored per-element motion, chart and diagram draw-on (blocked on item 16 of
`engine-gaps.md`), live reflow during a drag, motion anywhere in the editor canvas.

**The one rule, restated because everything below depends on it: motion may affect `opacity` and
`transform` only, never geometry.** Export, autofit, `fitSectionToFrame`, the eval checks and the
section paint cache are then all correct without changes, because the animation's end state is the
layout that was already being produced.

## 2. What changes, by layer

| Layer  | File                        | Change                                                                                                 |
| ------ | --------------------------- | ------------------------------------------------------------------------------------------------------ |
| model  | `model/theme.ts`            | `MotionTokens`, two vocabularies, `DEFAULT_MOTION`, `motionFor`, an optional `Tokens.motion`, `Pal.mo` |
| canvas | `canvas/render/backends.ts` | `paint` and `fitSlideContent` return the nodes they created                                            |
| canvas | `canvas/render/present.ts`  | `slideElement` passes those nodes through                                                              |
| ui     | `ui/viewport.ts`            | `prefersReducedMotion`                                                                                 |
| ui     | `ui/motion.ts`              | new: the pure schedule plus the imperative driver                                                      |
| ui     | `ui/present.tsx`            | the transition, the build, the reveal observer                                                         |

No new `model/` file, so `pnpm check:modules` stays green and the eighteen-concept rule holds.

## 3. `model/theme.ts`: the motion contract

Motion is part of the theme contract, so it lives in the file that owns that contract rather than in
`model/elements.ts`, which holds per-element value sets. This is a correction to `motion.md`, which
put the vocabulary in `elements.ts`.

```ts
export const SLIDE_TRANSITIONS = ["cut", "fade", "push"] as const;
export type SlideTransition = (typeof SLIDE_TRANSITIONS)[number];

export const BUILD_RHYTHMS = ["none", "settle", "rise"] as const;
export type BuildRhythm = (typeof BUILD_RHYTHMS)[number];

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

`Tokens` gains one optional field:

```ts
    motion?: Partial<MotionTokens>; // absent = DEFAULT_MOTION
```

Partial rather than whole, so a theme can say `{ transition: "push" }` and inherit the rest. Three
things then work without any further edit, each verified:

- `zTokens` in `services/api/themes.ts:13` is a `z.looseObject`, so the field survives the wire.
- `ThemeEditor` builds its store as `{ ...baseTokens, ... }` (`app/views/ThemeEditor.tsx:205`), so a
  custom theme derived from a built-in keeps its motion even with no control for it.
- The section paint cache compares `prev.theme === theme` by reference (`backends.ts:901`), and
  motion never reaches layout, so nothing invalidates.

`Pal` gains `mo?: Partial<MotionTokens>` and `mk` spreads it conditionally:

```ts
            ...(p.mo ? { motion: p.mo } : {}),
```

`Pal` already carries the non-colour knobs (`bw`, `sh`, `sc`), so this fits where it lands. All
nineteen themes stay byte-identical until phase E4 gives some of them an identity.

The easing default matches the one already used at `ui/overlay.tsx:227`, so the product has one
motion curve rather than two.

## 4. The canvas change, and why it is generic

One idea, applied three times: **a painter reports the nodes it created.** That is not a motion
concept. It is equally useful for overlay chrome that has to sit on a specific painted box, for
tests that assert against a node rather than a selector, and for debugging.

```ts
export function paint(commands: RenderCommand[], host: HTMLElement): HTMLElement[] {
    host.replaceChildren();
    host.style.position = "relative";
    const nodes: HTMLElement[] = [];
    for (const c of commands) {
        const el = document.createElement("div");
        applyCommand(el, c);
        host.appendChild(el);
        nodes.push(el);
    }
    return nodes;
}
```

The returned array is index-parallel to `commands`, which is the invariant `paintReconcile` already
depends on (`backends.ts:484-500`). Widening a return is source-compatible: all ten existing call
sites ignore it and none needs an edit.

`fitSlideContent` and `slideElement` pass it through:

```ts
export function fitSlideContent(...): { el: HTMLDivElement; nodes: HTMLElement[] }
export function slideElement(...): { el: HTMLDivElement; nodes: HTMLElement[] }
```

`slideElement` has two call sites, both in `ui/present.tsx` (`renderPaged`, `renderOverview`), so
this is a two-line follow-through.

Nothing else in `canvas/` moves. In particular `RenderCommand`, `Region`, the engine, the 2D-canvas
backend and every export path are untouched, which is what keeps the static outputs identical.

## 5. `ui/viewport.ts`: reduced motion

Three conventions for reduced motion exist in the tree and none reaches the player. Generalize the
`matchMedia` one into `ui/viewport.ts`, which already owns environment capability queries
(`isPhone`, `isCoarsePointer`, `canEditHere`) and already runs exactly this listener pattern. The
driver is imperative, so it needs a JS answer rather than a Tailwind variant.

```ts
const REDUCED = "(prefers-reduced-motion: reduce)";
const [reducedMotion, setReducedMotion] = createSignal(matches(REDUCED));

export const prefersReducedMotion = reducedMotion;
```

Add `window.matchMedia(REDUCED)` to the existing `watched` array and `setReducedMotion(matches(REDUCED))`
to `sync`, so it re-evaluates on the same listener the tier already uses.

Under reduced motion, transitions become cuts and builds become instant. Removed, not shortened.

## 6. `ui/motion.ts`: the schedule and the driver

A new flat category file, matching `ui/`'s layout (`ui/gesture.ts`, `ui/scroll.ts`, `ui/focus.ts` are
the same shape: a concept, no component). It may import `model` and `canvas` only, per the layering
law.

The split that matters: **the schedule is pure and unit-testable, the driving is imperative.**

### The pure half

```ts
export interface BuildGroup {
    slot: number;
    nodes: HTMLElement[];
}

export function buildGroups(commands: RenderCommand[], nodes: HTMLElement[]): BuildGroup[];
export function transitionFrames(m: MotionTokens, dir: 1 | -1): { out: Keyframe[]; in: Keyframe[] };
export function buildFrames(m: MotionTokens): Keyframe[];
export function staggerMs(m: MotionTokens, count: number): number;
```

`buildGroups` reads each command's id through `parseTarget` (`@model/artifact`) and groups by
`address.path[0]`, the section root's direct child. Commands are emitted in tree order
(`canvas/engine/layout.ts:302-330`), so a slot's nodes are contiguous and slot order is document
order, with no sorting needed. Two cases fall out to slot `-1` and never animate: the section
background (`section:<id>`) and the root itself (`el:<id>`, no path). That is correct, since the
slide's ground should be present before its content arrives.

Floats are the one wrinkle: `emit` paints negative-`z` floats before the flow and the rest after, so
a float's nodes are not adjacent to its slot's. Grouping by parsed path rather than by position
handles this without special-casing.

`staggerMs` caps the tail so a busy slide does not crawl:

```ts
const BUILD_TAIL_MS = 700;
export const staggerMs = (m: MotionTokens, count: number): number =>
    Math.min(m.duration * 0.4, BUILD_TAIL_MS / Math.max(1, count - 1));
```

### The imperative half

```ts
export function runTransition(
    outgoing: HTMLElement | null,
    incoming: HTMLElement,
    m: MotionTokens,
    dir: 1 | -1,
): Promise<void>;

export function runBuild(groups: BuildGroup[], m: MotionTokens): void;
```

Both check `prefersReducedMotion()` first and return immediately, so no caller can forget. Both use
the Web Animations API with `fill: "both"`, matching `ui/overlay.tsx:220-227`, which is the house
pattern for imperative motion. No animation library is added; none is in `package.json` today and
none is needed for opacity and transform.

`runTransition` resolves when the incoming animation finishes, so the caller can drop the outgoing
node. `m.transition === "cut"` resolves immediately with no animation.

## 7. The transition, in `ui/present.tsx`

### Overlapping the two slides

Today `renderPaged` ends at `host.replaceChildren(slide)` (`:140`), which destroys the outgoing
subtree synchronously. Two slides have to coexist for the length of the transition, and they have to
overlap rather than sit side by side in the host's flex row.

Each slide is wrapped in a **stage**: `absolute inset-0 flex items-center justify-center`. The host
gains `relative`. Two stages then overlap naturally, each centring its own slide exactly as the flex
host does today, so the resting appearance is unchanged.

The stage also solves the transform collision. The slide element already carries
`transform: scale(k)` for the viewport fit (`:137`) and the content wrapper inside it carries
`scale(fit)` from `fitSlideContent`. The stage owns the motion transform and neither of the existing
two is touched. Without the wrapper, every keyframe would have to re-state `scale(k)`, which changes
on resize.

### Direction

`render` takes a cue rather than reading it from state:

```ts
type MotionCue = "none" | "forward" | "back" | "enter";
```

`none` for a resize repaint, an overview toggle, or a re-paginate; `forward` and `back` for an
advance; `enter` for the first paint, which builds without a transition. `next`, `prev`,
`goToSection` and the overview jump each set a pending cue before `setIndex`; the render effect reads
and clears it, defaulting to `none`. `goToSection` derives its sign by comparing the target index to
the current one, so a narration jump backwards reads as backwards.

`onResize` (`:402`) passes `none` explicitly. That is the specific bug this avoids: today resize and
an advance funnel into the same `render()` with no way to tell them apart, so without this a window
drag would fire a transition per frame.

### Sequence

```
render("forward")
  build the incoming slide and its stage
  host.append(incoming stage)              both stages now mounted, incoming on top
  outgoing.style.pointerEvents = "none"
  runBuild(groups, motion)                 starts immediately, concurrent with the transition
  await runTransition(outgoing, incoming, motion, +1)
  outgoing stage removed
```

The build runs concurrently rather than after: the new slide's content rising while the slide itself
fades in reads as one movement, and the opacities multiply cleanly. Total perceived time is
`duration + tail`, not `duration + tail` in series.

An advance that arrives mid-transition cancels the running animations and removes any stage that is
not the newest, so holding the arrow key does not stack stages.

## 8. The build, in `ui/present.tsx`

`slideElement` now returns the painted nodes alongside the element, so the build is:

```ts
const { el, nodes } = slideElement(section, tokens(), profile(), page);
const groups = buildGroups(page.commands, nodes);
```

The commands come from the same `sectionSlides` page the element was painted from, so the two arrays
are index-parallel by construction.

`runBuild` animates every node in a slot with that slot's delay. The rhythms:

- `none`: nothing, everything is present at once.
- `settle`: opacity 0 to 1 with a small upward translate, the default.
- `rise`: a larger translate and a longer stagger, for themes that want a more deliberate reveal.

**Playback surfaces only.** The build never runs in the editor canvas. `paintReconcile` wipes
`cssText` and children on every reused node on every call (`backends.ts:483-500`), so an animation
running during an edit dies mid-flight. Content does not change during playback, so the player never
meets that problem. An author who wants to see the build opens the player, which they already have.

## 9. Continuous reveals

The same `buildGroups` and `runBuild`, triggered by intersection rather than by a clock.

`paintSectionStack` creates a section's DOM layer at `backends.ts:947-961`. `renderContinuous` cannot
drive this itself: it only repaints when `windowMoved` says the band shifted by about a third of a
viewport (`canvas/render/window.ts:75-79`), which is far too coarse for a scroll-linked effect. So the
player attaches an `IntersectionObserver` to each layer it sees and reveals on first intersection.

**One-shot per section per session, tracked outside the DOM.** Windowing nulls a layer beyond
`KEEP_MARGIN` (`backends.ts:970-972`) and rebuilds it from scratch on return, so a DOM-tracked reveal
would re-fire every time the reader scrolls back up. A `Set<string>` of revealed section ids in the
player fixes it, and it is deliberately per-session rather than persisted.

Reveals apply in publish and in Present's continuous mode. The editor canvas is excluded for the same
reason as the build.

## 10. Theme motion identities

The vocabulary is only worth having if the themes use it. Once phases A through C are working, give
the nineteen themes a motion identity, which mostly means leaving them on the default and choosing
deliberately for the few with a strong character. A tight editorial theme and a brutalist one should
not move the same way; `cut` plus `build: "none"` is a legitimate identity, not an absence of one.

Check every choice against reduced motion before shipping it, since a theme whose identity is
carried entirely by motion has to still read correctly without it.

## 11. Conventions this follows

Stated because the plan is meant to be executed by someone who has not read the whole tree.

- Four-space indent, double quotes, semicolons, `printWidth` 100. No `any`. No `console`.
- **Comments are terse and rare.** A comment earns its place only by saying something the code
  cannot: an invariant, a unit, a gotcha, a must-stay-in-sync. No file-header essays, no section
  banners, no restating the name or the type. In this plan that means roughly: one line on why the
  stage wrapper exists, one on why slot `-1` never animates, one on why the build is playback-only.
  Nothing else.
- No suppressions of any kind. There is always a suppression-free form.
- Path aliases across directories (`@model/theme`, `@canvas/render/commands`), relative for siblings.
- No barrels. `ui/motion.ts` is a flat category file beside `ui/gesture.ts` and `ui/scroll.ts`.
- Tailwind's canonical scale, not bracket values, for anything on it.
- `@ui` components style only through theme CSS vars and import nothing above `@ui`. `ui/motion.ts`
  imports `model` and `canvas` only.
- User-facing copy avoids em-dashes; `pnpm check:copy` covers `ui/`, and this work adds almost no
  strings, but the rule holds for anything it does add.

## 12. Tests

Unit, no DOM, in `ui/__tests__/motion.test.ts`:

- `buildGroups` puts a section background and the root in slot `-1`, groups the root's children by
  their top-level path, and returns slots in document order.
- A float whose commands are emitted out of flow order still lands in its own slot.
- `staggerMs` caps the tail as the group count grows.
- `transitionFrames` is symmetric under direction reversal for `push`, and empty for `cut`.

DOM, in `ui/__tests__/motion.dom.test.ts`, following the header convention already used by
`canvas/render/__tests__/coverfit.dom.test.ts` (`// @vitest-environment happy-dom`, an
`@elements/register` import, `installCanvas2D` in `beforeAll`):

- `runTransition` resolves and leaves exactly one stage mounted.
- Under reduced motion, no animation is created and the promise resolves in the same tick.
- A second advance during a transition cancels the first and leaves one stage.

Canvas, extending `canvas/render/__tests__/backends.dom.test.ts`:

- `paint` returns one node per command, index-parallel, appended in order.

Not tested by machine: whether it looks good. That is a review pass against the corpus in the real
player, and it is the actual acceptance criterion.

## 13. Execution checklist

**A1** `paint`, `fitSlideContent`, `slideElement` return their nodes; the two `slideElement` call
sites follow through. Ships alone, changes nothing visible.

**A2** `prefersReducedMotion` in `ui/viewport.ts`, on the existing listener.

**A3** `ui/motion.ts`: `transitionFrames`, `runTransition`, the reduced-motion short circuit.

**A4** `renderPaged` restructured: the stage wrapper, the host's `relative`, both slides mounted
through the transition, the outgoing dropped on resolve.

**A5** The `MotionCue` parameter through `render`, `next`, `prev`, `goToSection`, the overview jump,
and `onResize` passing `none`.

**A6** Cancel-on-reentry, so a held arrow key does not stack stages.

**B1** `buildGroups`, `buildFrames`, `staggerMs`, `runBuild`.

**B2** Wire the build into `renderPaged`, concurrent with the transition, `enter` on first paint.

**B3** The `IntersectionObserver` reveal for continuous mode, one-shot per section per session.

**E1** `MotionTokens`, the two vocabularies, `DEFAULT_MOTION`, `motionFor`, `Tokens.motion`, `Pal.mo`
and the conditional spread in `mk`.

**E2** Read the theme's motion in `ui/present.tsx` instead of the default.

**E3** Tests per section 12.

**E4** Motion identities for the themes that want one, each checked under reduced motion.

Gates before any of it lands: `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm check:suppressions`,
`pnpm check:copy`, `pnpm check:modules`. The corpus render (`pnpm eval:shots`) must be **unchanged**,
which is the real proof that the one rule in section 1 held: if a number moves, motion has reached
geometry somewhere.

## 13b. One invariant worth not regressing

`render()` reads `slideCounts` through `locate()`, and the progress effect bumps `counted` after
every advance. With the paint inside the effect's tracked scope, that second run repainted over the
transition it had just started, which made every forward advance look motionless. The render effect
now declares its dependencies explicitly and calls `render` inside `untrack`, the same idiom
`editor/Canvas.tsx` uses for its own draw effect. Anything added to `render`'s path that should
trigger a repaint has to be read in the effect body, not relied on through tracking.

There is no automated test for this: the repo has no component-test project, so a Solid effect
inside `PresentSurface` cannot be driven from a unit test. The comment carries the reason instead.

## 14. Still open

- ~~The build unit.~~ Settled during the build. The section root's direct children was far too
  coarse: on the corpus it produced steps of eight and twenty-one elements arriving at once.
  `buildUnits` now descends through any element whose spec is `tier: "container"` and which paints
  nothing of its own, and stops everywhere else. A bare layout row is descended into, so two cards
  in it arrive separately; a card paints a surface, so it arrives whole with its contents. The
  corpus now runs one to nine steps per section.
- Whether the published viewer gets motion by default. It probably should, since it is the artifact
  most likely to be seen by someone who did not make it, but it is also the one most likely to be on
  a slow device.
- Whether a slide's own build should re-run when a viewer navigates backwards to it. Re-running reads
  as a loop; not re-running makes going back feel dead. Worth trying both.
- An analytics event for motion is not in this plan. If one is wanted it is a one-line addition to
  `Events` in `model/analytics.ts`, and it should carry the theme's motion preset and nothing else.
