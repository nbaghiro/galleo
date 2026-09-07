# Planning — live drag reflow: the canvas parts to make room

> Superseded in part (2026-09-07): manual QA found the per-slot honest preview makes the whole
> document breathe while aiming, and the dnd-ux motion round replaced it with contained parting
> (fixed-gap transforms inside the receiver only) plus one commit FLIP; at that point the FLIP
> capability, compensation shape, and degrade tiers carried forward. See dnd-ux.md section 9,
> then section 10: the controlled-canvas round later removed the parting machinery entirely
> (`previewFor`, `GhostVeil`, `compensatePoint`, `containedShifts`/`holdShifts` are all gone
> from the tree). What survives today: `PART_FEEL` (`{ ms: 140, easing: "ease-out" }`,
> `editor/core/dnd.ts`) and `paintReconcile`'s FLIP capability, driven as the one-shot commit
> animation (`takeCommitFlip` feeding `flip: PART_FEEL` in `editor/Canvas.tsx`, for drops and
> keyboard moves alike).

> The editor's drag today freezes the document and marks slots with indicator lines; the drop is
> committed sight-unseen. This plan brings back what the codebase already tried once and removed,
> live reflow, the Figma/Notion feel where siblings part to show the true post-drop layout, and it
> is written against that first attempt's named failure modes: each one gets a mechanism that
> defeats it, or the plan does not proceed. Status: built 2026-09-06 (all four phases, same
> day as approval; amendments included — candidate lines removed where parting runs, per-axis
> compensation). Deviations recorded at the end. Verified
> against the tree 2026-09-06; the dnd layer cited here is the one rebuilt in the interaction
> round (reach-extended gap hitboxes, beside-wrap strips, distance-weighted `activeSlot`).

Companion docs: `engine-gaps.md` (items 1 and 15, both of which this touches), `engine-audit.md`
(the 2026-09-02 measured addendum this plan's numbers extend), `../executed/perf-round.md`
(`paintReconcile`, which phase A builds on), `../executed/interaction-round.md` (the slot
machinery that stays the aiming
authority), `motion.md` (whose opacity/transform-only invariant this plan honors even though the
editor is outside the playback scope), `.docs/rendering.md` (the paint pipeline), `testing.md`
(the fake-glyph-widths measure contract the measurement below uses).

## Why

Dragging is the editor's primary arranging gesture, and it is currently a leap of faith: the
document holds still, a 3px line marks the slot, and the author discovers what the drop actually
did only after releasing. For a same-parent reorder the line is enough. For anything that changes
sizes — dropping into a row renormalizes the columns, a beside-wrap halves the target, a
cross-section move can collapse the source column — the line cannot show the consequence, and the
author round-trips through undo to explore. Parting the siblings shows the real post-drop layout
continuously, which turns arranging from aim-and-pray into direct manipulation.

The user's own framing sets the bar: an earlier version existed, "wasn't working well and not
great ux", and was deliberately replaced. The value is real if and only if the new design does
not reproduce the old failures.

## History: the first attempt, and exactly why it failed

Archaeology from the tree. The reflow-preview model shipped 2026-07-09 (`c5fc887`, "drag/drop and
section-move previews") and was removed five weeks later, 2026-08-15 (`2923806`, "replace
drag-and-drop reflow previews with precomputed drop slots"), whose own working doc
(`.docs/dnd-redesign.md`, now folded into `rendering.md`) is the honest post-mortem. What it did:

- On a move drag's start, `liftOut` removed the source from the previewed tree immediately.
- On every target change, `previewDrop` spliced a `__dropghost` element (a real hidden element
  type, mirroring the dragged element's layout at 45% opacity) through the real mutation path
  (`moveInto`/`place`) and the canvas repainted the entire reflowed stack.
- Targets were computed against the intact pre-drag tree (regions froze, `track: false`), so
  target-chasing was already solved then — that part survives today.

The named failures, quoted from the removal doc:

1. **Flicker.** "previewDrop re-runs the real mutation path with a spliced ghost on every target
   change, and the canvas repaints the reflowed result per frame. Text rewraps, columns
   renormalize." Every state change was a full teardown repaint, and states SNAPPED — there was
   no animation between them, so each slot change was a visual jolt.
2. **Content shifting under the cursor at gesture start.** `liftOut` closed the source's hole the
   instant the drag began, moving everything below it before the author had aimed at anything.
3. **Visuals disagreeing with hitboxes.** The reflowed preview moved content while the hitboxes
   stayed frozen, so past the first parting the author was aiming at geometry that no longer
   matched what they saw. The "sticky target" hack in the old Canvas ("so the preview doesn't
   flash back") is the scar this left.

The redesign's conclusion was to delete the showing and keep the aiming. This plan's thesis is
that the aiming was never the problem: keep it frozen exactly as it is, and rebuild the showing
with the three mechanisms the old version lacked — animation between states, a solve only per
discrete slot change, and a compensation map that keeps the aim and the picture consistent.

## Research

- **react-beautiful-dnd** (Atlassian) is the best published treatment of this exact interaction.
  Its design principles: physicality ("users feel like they are moving physical objects"),
  no instant movement (items animate out of the way, never snap), and impact computed from the
  dragged item's center of gravity rather than the pointer, which is their stability answer to
  the flapping problem. Notably they use motion as the ONLY communication — no indicator lines.
  https://github.com/atlassian/react-beautiful-dnd/blob/master/docs/about/design-principles.md ·
  Alex Reardon's companion essays: https://medium.com/@alexandereardon/rethinking-drag-and-drop-d9f5770b4e6b
  and https://medium.com/@alexandereardon/dragging-react-performance-forward-688b30d40a33 (the
  self-healing model: every movement recomputed from current displacement, not patched).
- **FLIP** (First-Last-Invert-Play, Paul Lewis) is the standard technique for animating a layout
  change using only transforms: solve both states, invert the delta as a transform, play it to
  zero. https://aerotwist.com/blog/flip-your-animations/ ·
  https://css-tricks.com/animating-layouts-with-the-flip-technique/ ·
  https://www.joshwcomeau.com/react/animating-the-unanimatable/ (list reorder specifically).
- **Figma**: no published engineering material on auto-layout drag parting was found (searches
  surfaced help-center and community content only). Recorded as a dry well, not evidence.

The synthesis this plan takes: keep the ACTIVE indicator line as the precision affordance (our
slots include ops motion cannot express, wrap and column and replace) but adopt rbd's position on
the candidate field — once parting ships, motion is the discoverability channel and the candidate
lattice goes (decided 2026-09-06, below). Their center-of-gravity trigger
is recorded as a fallback if compensation (phase C) proves insufficient, not adopted now — it
would replace the distance-weighted `activeSlot` that just shipped.

## Measured: the solve is not the cost

Item 15's open question ("what the real ceiling is today, which nobody has measured") is now
measured. Method: per-section `layoutSection` at width 1280 across all 7 corpus artifacts (135
sections), Node, real wrap machinery with the testkit's fake 8px glyph widths (the same contract
`check-elements` and the 2026-09-02 audit used; real glyph calls are warm-cached to ~zero in a
drag, per the audit). Cold = every text remeasured; warm = memoized measures, the drag-realistic
case since a preview re-solves mostly unchanged leaves at unchanged widths.

|                         | median | p90    | worst (helios/s12) |
| ----------------------- | ------ | ------ | ------------------ |
| cold solve, per section | 0.06ms | 0.22ms | 0.94ms             |
| warm solve, per section | 0.02ms | 0.10ms | 0.31ms             |

Even the worst corpus section solves in under a millisecond, and a preview needs at most two
sections (source + target) per **slot change** — a discrete event damped by hysteresis, a few per
second, not per pointer move. This is three orders of magnitude inside a frame budget, and it
agrees with the audit's "layout is essentially free" and with the fact that resize/column drags
ALREADY live-reflow per pointer move today through the `draw(preview, track: true)` channel
(`applyLiveEdit`) without complaint. **Verdict: item 15 (incremental layout) is not needed for
v1 and is not a phase of this plan.** What would re-open it: documents an order of magnitude
denser than the corpus, or a future decision to solve per pointer move rather than per slot
change. Recorded in `engine-gaps.md` item 15.

The real cost the old version paid was not the solve, it was the **repaint** — full per-frame
teardown of the painted stack. That is what the phases below attack: paint at most one changed
section per slot change through `paintReconcile` (which the perf round built), and animate the
difference with transforms so unchanged siblings never repaint at all.

## The shape

Aiming and showing, decoupled. Four pieces, each with an owner file:

1. **Aiming stays frozen (no change).** Slots are computed once at drag start from frozen
   regions; `activeSlot` with its distance weighting, class tiebreaks and hysteresis is untouched.
   The target cannot move under the pointer because nothing it is computed from ever moves.

2. **Showing is a per-slot-change preview solve** (`editor/core/dnd.ts`, a pure
   `previewFor(art, slot, payload)`). When the active slot changes, build the ephemeral post-drop
   tree through the same pure ops the drop will use — `place`/`moveInto` with a ghost standing in
   for the payload — and hand its sections to the existing `draw(preview, track: false)` channel,
   the same seam `applyLiveEdit` uses today. `track: false` keeps regions (and therefore slots)
   frozen. The preview never enters the store, never touches undo, and shares object identity
   with the base tree everywhere except the touched path, so the section paint cache holds for
   every unperturbed section. For a move, the preview IS `moveInto`: the source hole closes and
   the ghost sits in the slot, which is the honest end state — but only while a slot is active,
   and always animated (piece 3), which is what separates it from the old `liftOut` jolt. No slot
   active = base tree, so cancel is free. The ghost: the dragged element's real content at dim
   opacity for moves (what you drop is what you see), the palette skeleton slab for new drags —
   the old `__dropghost`'s content model was right; its choreography was wrong.

3. **The parting animates by FLIP at the paint layer** (`canvas/render/backends.ts`).
   `paintReconcile` gains an optional previous-frame geometry map (command id + kind + per-id
   ordinal → box). On repaint, a command whose box moved gets a transform inverting it to its old
   position, transitioned to identity: ~140ms, ease-out, transform/opacity only, interrupted
   cleanly by the next change (the map always reflects what is currently on screen). Editor-only
   by parameter — publish and export never pass the map, so this is a backend capability, not a
   behavior change; the engine is untouched entirely. Sections below a height-changed one shift
   via the same delta applied to their layers' tops. A command with no counterpart (the ghost
   appearing, the source vanishing) fades rather than flies.

4. **Aim compensation keeps the picture and the pointer consistent**
   (`editor/core/dnd.ts`, pure). The parting displaces content around the open gap by the ghost's
   extent (and around the closed source hole by its negative); the same delta map that drives
   FLIP yields a step function mapping visual coordinates back to frozen ones — **per axis**: a
   col parting displaces siblings in y, but a nested ROW parting displaces them in x, so the map
   compensates both the same way (the delta map is per-command and already carries both axes).
   Narrow row gaps plus hysteresis damp most of the x case, but the map states x explicitly
   rather than leaving it to be discovered in QA (amendment, 2026-09-06). `Canvas` passes the
   compensated point to `activeSlot`. This is the fix for old failure #3: the author aims at what
   they see, the machinery hears it in frozen coordinates. The feedback loop (compensation
   depends on the slot, the slot on the compensated pointer) is damped by the existing hysteresis
   plus the step function's stability away from the gap edge; if real use still flaps, the
   recorded fallback is rbd's center-of-gravity trigger, not more damping.

Degrades, all retaining today's frozen path as the fallback rather than deleting it:
`prefers-reduced-motion` gets indicators only (no parting); phones/coarse pointers get today's
behavior (parting costs most on the weakest devices, and phone drags are already restricted to
the selected element); a mid-drag external write (AI stream, collab) falls back to the existing
staleness guard — recompute or cancel, never animate across a foreign edit.

Scope: element drags only — new, move, moveMany, across every op the slot vocabulary offers
(insert, wrap, beside, column, replace), because the preview literally runs the drop's own pure
path and therefore needs no per-op cases. Section reorder keeps its indicator bands this round.

Analytics: no new event. Reflow changes the rendering of an existing gesture, not what a person
can do; the drop seam already captures `element_moved`. Per the instrument-the-seam rule there is
nothing new to instrument.

## Phases

Ordered so the animation mechanism exists before any parting becomes visible — the old version
died of visible-but-unanimated, and that ordering mistake is not repeated.

**A — the FLIP capability in `paintReconcile` (S).** The previous-geometry map, the transform
invert-and-play, the fade for unmatched commands, interruption semantics. Red-first pins: the
delta map pure function (matched, moved, appeared, vanished commands); a reconcile with the map
writes the inverted transform and clears it; without the map, byte-identical behavior to today
(the publish path's pin). No visible editor change yet.

**B — the preview tree and its wiring (M).** Pure `previewFor` in dnd.ts (pins: base tree
untouched, identity shared off the touched path, ghost carries the payload's content, no slot =
base); Canvas consumes it through the existing preview memo alongside `liveEdit`, feeding the
phase A map. First visible parting, already animated. The LiftVeil yields to the preview's own
source handling during an active slot.

**C — aim compensation, both axes (S).** The visual-to-frozen step function from the same delta
map, per axis, pinned red-first (above/left of the gap identity, below/right of it shifted by the
ghost extent, the source hole's negative shift, composition of both, and the x case: a pointer
over a horizontally-parted row resolves to the slot whose parting is showing); an integration pin
that the slot whose parting is showing is the slot a pointer over that parting resolves to (the
no-flap invariant under HYST), in y and in x.

**D — feel, degrades, candidate removal and the ledger (S).** Duration/easing constants beside
the other editor constants; the candidate indicator field is REMOVED (decided 2026-09-06: the
user's direct complaint is that the line lattice across a deeply nested section "doesn't look
great" for both drag-to-move and palette drags, and parting does the candidates' discoverability
job better — you feel which container you're aiming into because its children move; the rbd
position cited above). The candidates memo and its rendering in `DropIndicators.tsx` go, the
active accent line/region stays as the sole precision affordance and is drawn atop the parting;
the `drop-candidate` testid and its pins go with it, updated deliberately rather than weakened.
On the degraded paths (reduced motion, coarse pointers) there is no parting, so those keep
today's full indicator field. Escape
and drop seams verified (the preview is the end state, so commit repaint is a no-op visually and
release feels seamless); reduced-motion and coarse-pointer gates through `@ui/viewport`; the
staleness guard extended to the preview; `engine-gaps.md` items 1 and 15 and `engine-audit.md`
updated with dated notes; this doc marked built with deviations.

Every phase lands green through the full gate set: `tsc`, lint, full vitest, `check:elements`,
`check:suppressions`, `check:copy`, and `eval:shots` exactly unchanged at 592 — the engine and
every non-editor paint path are untouched by construction, so any corpus movement is a bug.
Gesture feel is manual QA at the end, per the established deviation for pointer choreography.

## Not taken, and why

- **Recomputing slots against the previewed layout.** The old version's third failure, inverted:
  the target chases the parting it caused. Frozen aiming plus compensation gives the same felt
  result without the feedback loop.
- **Solving per pointer move.** Measured unnecessary (the solve is per slot change, which
  hysteresis makes discrete); per-move solving is what made the old version repaint per frame.
- **rbd's center-of-gravity impact as the aiming primitive.** It would replace the
  distance-weighted `activeSlot` machinery that shipped days ago and is pinned by the dnd suite.
  Recorded as the fallback if phase C's compensation is insufficient in practice.
- **The View Transitions API instead of hand-rolled FLIP.** Browser-gated, per-command
  `view-transition-name` bookkeeping, and no interruption control; FLIP over the reconcile map is
  ~the same line count and fully ours.
- **Section-reorder reflow.** The largest paint volume, the least ambiguity today (whole-stack
  bands are already legible), and the old system's section previews were part of what was
  removed. Follow-up once element parting has survived real use.
- **Phone parting.** Costs most where the hardware is weakest, and the phone drag is already a
  restricted gesture. Phones keep the frozen model.
- **Item 15 as a prerequisite.** Measured out of the critical path (the table above); the
  subtree memo remains a real future item for documents far denser than the corpus, and its risk
  (a stale memo is a silently wrong layout) deserves its own round when scale demands it.

## Open questions for the approver

- The ghost's content for move drags: real content at dim opacity (recommended, honest) or a
  neutral skeleton slab (calmer, but hides the consequence that makes the preview worth having)?
- ~~Once parting ships, do the candidate indicator markers stay?~~ Decided 2026-09-06: removed
  where parting runs, kept on the degraded paths that still need them. See phase D.
- 140ms ease-out is the proposed feel constant; tune during manual QA rather than in review.

## Built — deviations from the plan as written

All four phases landed 2026-09-06. Deviations:

- **The FLIP parameter shape.** `paintReconcile` takes the computed shifts (`FlipFeel & { shifts }`)
  rather than the raw previous-box map; `paintSectionStack` computes `flipShifts` once and reuses
  the same array for the animation and for the returned stage-space compensation shifts, so the
  delta map is derived exactly once per repaint.
- **The ghost is a veil, not a paint change.** The preview paints the dropped content for real and
  a `GhostVeil` overlay (the LiftVeil idiom, surface color at 45%) dims it; the paint layer stays
  free of any per-element dim concept. New-payload drags preview `spec.create()`'s real content,
  not a skeleton slab — what you drop is what you see, uniformly.
- **The staleness guard is a stand-down.** A foreign edit mid-drag (the preview memo sees
  `editor.artifact` drift from the drag-start snapshot) cancels the parting for the rest of the
  gesture and the frozen path continues; nothing recomputes mid-gesture.
- **Section layers glide too.** A section below a height-changed one animates as one layer and
  contributes one whole-layer shift, which is what keeps cross-section compensation cheap.
- **Escape restores instantly by construction** — the base repaint carries no flip, so there was
  nothing to build.

Feel constant shipped: 140ms ease-out (`PART_FEEL`, `editor/core/dnd.ts`), tunable in manual QA.
