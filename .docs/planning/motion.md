# Planning — motion: transitions, build-in, and reveals

> Animation as a first-class capability: a deck that transitions between slides and builds its
> content in, a published page that reveals as it scrolls, and eventually element-level effects an
> author can reach for. The recommendation is that motion is a **presentation-time overlay on a
> finished layout** and never an input to layout, and that the default motion is **derived from
> structure and the theme** rather than authored per element.
>
> Status: designed. The executable plan for options A, B and E is
> [`motion-build.md`](motion-build.md); this document is the rationale behind it, including the
> options that were rejected. Where the two disagree, the build plan wins. Expands item 1 of
> [`engine-gaps.md`](engine-gaps.md), which was wrong about the cost; the correction is in section 3.

Companion docs: `rendering.md` (the engine and the paint backends), `.docs/planning/voice-narration.md`
(the Step model's rationale, though its status line is stale: narration is built), `frontend.md`
(where a shared reduced-motion helper belongs), `collab.md` (the write path any stored config has to
survive).

## 1. What we actually want

Three needs that get conflated, and are mechanically different.

**N1, slide transitions.** Moving from slide N to slide N+1 in a player. Operates between two command
lists produced from two different section trees.

**N2, build-in.** Within one slide, content arriving in sequence rather than all at once. Operates on
one command list, staggered over a clock. This is the "each slide animates in nicely" case, and it is
the one that changes how the product feels most.

**N3, reveals in continuous formats.** A doc or site revealing sections and elements as they scroll
into view. Operates on one command list driven by scroll position rather than a clock.

They share exactly one primitive: a way to say that a painted thing, at time `t`, sits at some
transform with some opacity. Everything else is scheduling, and the scheduling is different in all
three cases.

## 2. What is true today

Established by tracing the code, not assumed.

**All four present surfaces are one implementation.** `editor/Present.tsx` (81 lines),
`app/views/PresentView.tsx` (42 lines) and `publish/PublicView.tsx`'s `Surface` are thin wrappers over
`PresentSurface` in `ui/present.tsx`. A transition layer has one home, not four. The convergence that
`voice-narration.md` lists as future work has already happened.

**There is a single choke point for paged advancement.** Arrow keys, clicks, narration
`goToSection`, overview jumps and resize all funnel through `renderPaged`
(`ui/present.tsx:129-141`) and end at `host.replaceChildren(slide)` (`:140`). `slideElement`
(`canvas/render/present.ts:95-108`) builds fresh DOM every time and the outgoing subtree is destroyed
synchronously.

**Nothing keeps two versions of a slide alive.** Every swap is a hard cut. The minimap does paint a
second independent copy of the same sections while the canvas paints the full-size version
(`editor/Canvas.tsx:600-663`), so the pattern exists in the codebase, just not in the player.

**`transform` is already occupied twice, nested.** The slide element carries `scale(k)` to fit the
viewport (`ui/present.tsx:136-139`, origin center), and inside it the content wrapper carries
`scale(fit)` from `fitSlideContent` (`canvas/render/backends.ts:988-999`, origin top-left, plus
offsets). Motion cannot assign `style.transform` on either; it needs its own wrapper.

**`paintReconcile` matches by array index, not by id.** It also wipes `cssText` and calls
`replaceChildren()` on every reused node on every call (`backends.ts:483-500`). No DOM-level
animation state survives a repaint of a section, matched or not.

**One node emits up to four commands sharing one id.** `emit` (`canvas/engine/layout.ts:302-330`)
pushes a separate command per leaf present on the node, all carrying `node.id`. A filled card with a
label is a rect and a text with the same id. Any correspondence keys on `(id, kind)`.

**Charts are a single opaque surface.** `chartSpec.layout`
(`canvas/elements/chart/element.ts:93-97`) returns one node whose one `surface.paint` draws every
bar, wedge, axis and label. There is no per-datum command, id or Region. Diagrams are split: node
cells are addressable, connectors are one opaque surface per diagram
(`canvas/elements/diagram/utils.ts:743-745`).

**Three substrates have no DOM identity across paints**: SVG surfaces (rebuilt fresh per
`applyCommand`, with gradient ids from a module-global counter, `backends.ts:226,462-469`), the
`<img>` built for zoomed images (`:441-446`), and text run `<span>`s (`appendRuns`, `:32-51`).

**Text cannot tween.** CSS has no glyph interpolation. A title going from 44px to 22px can only be
crossfaded, not morphed.

**Narration already has the timing seam.** `ui/present.tsx:275-296` schedules `setTimeout`-driven
advances at `stepHoldMs` intervals while a track plays. Narration-timed build-in has somewhere to
attach.

**Export has no animation surface at all.** pptxgenjs 4.0.1 has no `transition` or `animat` in its
type definitions, and PDF is static by construction.

**Reduced motion has no shared abstraction.** Three separate conventions exist (`matchMedia` in
`ui/overlay.tsx:219`, Tailwind `motion-reduce:` in `editor/panels/DropIndicators.tsx:83`, CSS
`@media` blocks in `ui/styles.css:113-122`), and none of them is wired into any present surface.

## 3. The correction that changes the design

An earlier draft claimed this work was cheap because every node already carries a stable id. That is
true within one section and false across two, which is where the marquee use case lives.

Region ids are `el:<section>:<path>` (`model/artifact.ts:295`), namespaced by section. Two slides
never produce a matching id, however similar their content. Worse, `ElementInstance.id`, the
separately minted stable id used for comment anchors, does not help either: `duplicateSection`
(`canvas/elements/ops.ts`) calls `withFreshElementIds` on the copy, so **duplicate-the-slide-then-move-
the-box, the single most common Magic Move authoring gesture, produces zero id matches.**

So cross-slide morph needs content-based correspondence (same image `src`, same text string, same
element type at a comparable path), which is a real algorithm with a real hit rate, not a lookup. That
moves morph out of phase one and changes what phase one should be.

## 4. The governing constraint

**Motion may affect opacity and transform only. It may never affect geometry.**

This one rule is what keeps the feature from touching anything else in the system:

- Export needs no change. The static frame every exporter already produces is the animation's end
  state, so PDF, PNG and PPTX are correct by construction rather than by a fallback.
- Autofit, `fitSectionToFrame`, `fragment` and the eval checks in `fit-checks.ts` all keep measuring
  the same geometry they measure now.
- The section paint cache and its object-identity `reuse` check stay valid, because motion never
  changes what was laid out.
- The engine stays immediate-mode and pure. Time never becomes a layout input, which is what would
  have broken export fidelity and the O(n) property.

It also rules out the thing that sounds appealing and is not: layout-driven animation, where a box
growing pushes its siblings. That is janky, it is what CSS deliberately avoids by animating
transforms, and it would put the engine in the render loop.

## 5. Options considered

**A. Slide transitions only, in CSS.** Wrap the slide in a motion div, keep the outgoing slide
mounted for the duration, animate opacity and translate. Covers N1. Costs almost nothing: one file
plus a stylesheet. Does not touch the engine, the model, or the AI. Objection: it is the smallest
possible answer and leaves the slide's content arriving all at once, which is most of what makes a
deck feel static.

**B. Structural build-in.** Derive the build order from the composed tree (the section root's direct
children, in document order, which is already the order `emit` produces commands in) and stagger their
entrance. Covers N2, and N3 with a different trigger. Requires no model field, no authoring surface,
no AI vocabulary, and no collab change. Objection: the author cannot override it, and the unit is
structural rather than semantic, so a bullet list animates as one block until line boxes exist
(item 2 of `engine-gaps.md`).

**C. Correspondence and morph.** Match commands between two slides and animate the matched boxes.
Covers N1 at its best. Objection: needs content-based matching (section 3), needs identity-aware
painting, and text can only crossfade, so the marquee "title glides and resizes" effect is decent
rather than Keynote-grade. Its hit rate depends on content we do not control, which means it must be
an enhancement on top of a transition that already looks good, never the primary mechanism.

**D. Authored motion timeline.** A per-element animation config, stored, authored in the inspector,
emitted by the AI. Covers everything. Objection: it is the most expensive option by a wide margin and
every part of that expense is a silent-failure hazard (section 7). It also adds surface most people
never touch and the model will use badly by default. The `SectionFrame` precedent is the warning: a
type with a real reader and no writer, shipped and then left.

**E. Theme-owned motion.** The theme declares the motion vocabulary: transition style, build rhythm,
duration scale, easing. Authors pick a theme and motion comes with it. Objection: it cannot express a
per-slide or per-element intent on its own, so it is a complement to B rather than an alternative.
Nothing exists in `model/theme.ts` today, so this is genuinely new, but it is an extension of an
existing concept rather than a nineteenth file.

## 6. Recommendation

**Build A + B + E together as one coherent default, add C as a second phase, and treat D as an
override that comes last, if at all.**

The product statement is: **motion is derived, not authored.** The theme says what motion this piece
has, the structure says what order it arrives in, and the author gets a deck that animates well
without opening an animation pane. That is the same bet the product already makes about type,
spacing and color, and it is the reason a Galleo deck can look designed without anyone designing it.

It is also, concretely, the option that dodges every hazard the investigation turned up. Nothing is
stored on the artifact, so `dataDelta`, `SECTION_SHELL_EQUAL`, `zElement`, `reviseElement`, the AI
catalog and the inspector are all untouched. There is no migration and nothing to keep in sync.

### The engine-level contribution

Deliberately small, because most of the work is scheduling rather than geometry.

1. **`paint()` returns the nodes it created.** It already builds one div per command in order
   (`backends.ts:473-481`); returning the array lets a driver zip commands with nodes and address any
   element by `(id, kind)` without stamping attributes into the DOM or changing the paint model.
2. **A pure correspondence function**, `correspond(a: RenderCommand[], b: RenderCommand[])`, returning
   matched pairs plus enter-only and exit-only sets. Keyed on `(id, kind)` within a section, and on
   content for the cross-slide case. Pure, testable against the deterministic measurer in
   `canvas/testkit.ts`, and useful beyond motion (a diff view, a change indicator).
3. **A motion vocabulary in the theme.** `Tokens` gains a small motion block: a transition name, a
   build rhythm, a duration scale, an easing. This is what makes two themes feel different in motion
   and not just in color.

That is the whole engine surface. Everything else is a driver in `ui/`.

### Where things live, and why no nineteenth model file

- Motion tokens extend `Tokens` in `model/theme.ts`, an existing concept.
- The controlled vocabulary (`MOTION_PRESETS` and friends) goes in `model/elements.ts`, which already
  holds exactly this kind of enum (`CARD_STYLES`, `CHART_TYPES`, `DIAGRAM_STYLES`).
- If a per-element motion field is ever added, it goes in `model/geometry.ts` beside `ElementLayout`,
  which is already the answer to "a structural per-instance property that sits beside `data` on every
  element regardless of type".

This closes one of the cross-cutting open questions in `engine-gaps.md`: no new model concept is
required.

### Reduced motion

First-class, not a follow-up. Three conventions exist and none is in the player. Generalize the
`matchMedia` one into `@ui`, in `ui/viewport.ts`, which already owns environment capability queries
(`isPhone`, `isCoarsePointer`, `canEditHere`). Reduced motion is the same category of question, and
the driver is imperative so it needs a JS answer rather than a CSS variant.

Under reduced motion, transitions become cuts and builds become instant. Not shortened: removed.

### Two scoping decisions that simplify everything

**Build-in runs in playback surfaces only, never in the editor canvas.** The editor repaints on every
edit, and `paintReconcile` wipes any running animation. Content does not change mid-playback, so the
player never hits that problem. An author who wants to see the build gets a "preview" that opens the
player, which they already have.

**Reveals are one-shot per section per session, tracked in JS.** Windowing drops a section's DOM
outside `KEEP_MARGIN` (`backends.ts:970-972`) and rebuilds it on return, so a DOM-tracked reveal would
re-fire every time the reader scrolls back. A `Set` of revealed section ids outside the DOM fixes it.

## 7. What phase D would cost, recorded now so it is not rediscovered

If element-level authored motion is built later, these are the enumeration points a new field has to
be added to. Each is a silent failure, not a compile error, which is why they are written down.

- **`dataDelta` (`model/artifact.ts:636-637`)** hand-enumerates `type`, `id` and `layout` before
  falling through to a generic `data` diff. A new sibling field on `ElementInstance` that changes
  alone makes `dataDelta` return `[]`; because `![]` is `false`, `narrowOps` (`:685-691`) emits
  **nothing**, so the edit shows on the author's screen and never reaches the room or the row. This
  is the worst of the set.
- **`SECTION_SHELL_EQUAL` (`model/artifact.ts:668-672`)** hand-lists the four non-`root` fields of a
  `Section`. Its own comment says it: "a field missing from this list is an edit that never reaches
  the row." A `Section.motion` needs a line here.
- **`asContent` (`model/artifact.ts:76-86`)** whitelists top-level keys. An `ArtifactShell` field not
  named there is dropped on read. This, not `applySectionOps`, is the actual gate.
- **`zElement` (`services/core/ai/schema.ts:30-34`)** is a plain `z.object`, so it strips unknown
  keys. Anything the model emits outside `type`/`data`/`layout` is discarded at parse.
- **`reviseElement` (`services/core/ai/tools/element.ts:39-43`)** hand-reconstructs the result as
  `{ type, data, layout }`, taking `type` and `layout` from the original. A field missing here is
  reverted by any AI revision.
- **The catalog.** `layoutCatalog()` (`services/core/ai/prompts/catalog.ts:445-456`) teaches `layout`
  once in prose rather than as a `FieldSpec` on all ~18 element schemas. That is the precedent to
  follow for a universal property.
- **The inspector.** There is no existing control that renders for every element with no per-spec
  involvement. The closest patterns are the spec-gated radius slider
  (`editor/panels/RightPanel.tsx:102-113`, gated on `ElementSpec.frame`), the dynamically gated align
  buttons (`ControlBars.tsx:111-148`), and `SECTION_CONTROLS` plus a hand-written `read`/`write`
  adapter (`editor/panels/SectionLayoutPopup.tsx:57-106`). A shared motion group is new UI.

Each is one line or one small block. The cost is not the lines, it is that four of the seven fail
silently, so phase D is a phase that needs its own tests before its own feature.

## 8. Phases

### Phase A: the transition (ships alone, visible immediately)

- [ ] Restructure `renderPaged` (`ui/present.tsx:129-141`) to keep the outgoing slide mounted, with
      pointer events off, until the incoming animation finishes.
- [ ] A motion wrapper div inside the slide, so the existing `scale(k)` and `fitSlideContent` scale
      are untouched.
- [ ] Direction: `next()`/`prev()` (`:117-122`) and `goToSection` (`:238-243`) pass which way we are
      going, so push and slide read correctly.
- [ ] Suppress the transition on a resize-triggered repaint, which today funnels into the same
      `render()` as an advance (`:402`).
- [ ] `prefersReducedMotion()` in `ui/viewport.ts`, transitions become cuts.
- [ ] Presets: cut, fade, push. Nothing more until the theme block exists.

### Phase B: build-in

- [ ] `paint()` returns its nodes.
- [ ] Build grouping: parse each command's `el:` path, group by top-level slot, order by document
      order. Cap the depth at blocks; lines need item 2 of `engine-gaps.md`.
- [ ] The driver, in `ui/`, over the Web Animations API, matching the imperative pattern already used
      at `ui/overlay.tsx:220-227`.
- [ ] Narration timing: hang the build off the existing `stepHoldMs` scheduling
      (`ui/present.tsx:275-296`) so a narrated deck builds in time with the voice.
- [ ] Playback surfaces only. No build-in in the editor canvas.

### Phase C: theme motion

- [ ] Motion block on `Tokens` (`model/theme.ts`), `MOTION_PRESETS` in `model/elements.ts`.
- [ ] Wire the theme's choice into phases A and B.
- [ ] Give each shipped theme a motion identity, and check that reduced motion still reads correctly
      for every one of them.

### Phase D: continuous reveals

- [ ] An `IntersectionObserver` per section layer, created where `paintSectionStack` creates the layer
      (`backends.ts:947-961`), since `renderContinuous` only repaints on `windowMoved` and cannot
      drive a scroll-linked effect itself.
- [ ] One-shot per section per session, tracked outside the DOM.
- [ ] Works in publish and in Present's continuous mode; the editor canvas is excluded as in phase B.

### Phase E: morph (only after A through D are real)

- [ ] Content-based `correspond`, with the matching keys ranked and measured against the corpus so we
      know the real hit rate before building the animation.
- [ ] Text pairs crossfade while translating; images and rects interpolate their boxes.
- [ ] Degrade to the phase A transition whenever correspondence is thin, which will be often.

### Not scheduled

- [ ] Authored per-element motion (option D). Revisit once phases A through C are shipped and we can
      see what people ask for that the derived default cannot express.
- [ ] Chart and diagram draw-on. Blocked on item 16 of `engine-gaps.md`: a chart is one opaque
      surface command with no per-datum identity, so this is not a scheduling problem.
- [ ] Live reflow during a drag. Wants incremental layout (item 15) and is an editor concern rather
      than a playback one.

## 9. Still open

- The build unit. The section root's direct children is the obvious default, but a two-column slide
  then animates as two blocks, which may read as too coarse. Worth prototyping against the corpus
  before fixing.
- Whether the published viewer gets motion by default. It probably should, since that is the artifact
  most likely to be seen by someone who did not make it, but it is also the one where a slow device
  is most likely.
- Whether a `lineage` id preserved by `duplicateSection` is a cheaper route to morph than content
  matching. It would make the duplicate-and-edit gesture work exactly, at the cost of a stored field
  and everything section 7 lists.
- What `stepIndexOf` (`canvas/render/present.ts:82-85`) is for. It is exported, tested, and has no
  production caller. Either the narration player should use it or it should go.
- `.docs/planning/voice-narration.md:7` says "design settled, not built" and lists the present-surface
  convergence as future work. Both are stale. Worth fixing separately, since that doc is the only
  written statement of the Step model's intent.
