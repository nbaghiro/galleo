# Planning — dnd UX: one meaning per drop

> The user's verdict on the drag experience after the classifier, live-reflow, block-drag and
> strip rounds: "still very messed up, it just doesn't feel right. Figma flow is perfect but ours
> is nowhere close." This doc is the honest walkthrough of how the gesture works today, a
> measured audit of why it feels wrong, the Figma reference model, and the redesign plan. License
> granted to change the base level. Status: built 2026-09-07, all four phases; deviations below.
> Verified against the tree 2026-09-07 (HEAD f30f725; section 10's controlled-canvas build has
> since been committed as 7a41406, and this doc re-verified against that tree the same day).

Companion docs: `drop-classifier.md` (the geometric classifier this plan reshapes),
`live-reflow.md` (the parting machinery, which survived until section 10 removed it),
`../executed/freeform-move.md` (the Space handoff and the body-is-a-handle rule, both kept),
`engine-audit.md` (U-series history), `.docs/rendering.md`.

## 1. How it works today, end to end

### The gesture pipeline (single element)

1. **Press** on an element body. `onPointerDown` records the hit target; nothing else happens.
2. **Threshold**: 5px of travel (`BODY_DRAG_THRESHOLD`) turns the press into a move. On phones
   only an already-selected element drags.
3. **Payload precedence** (`movePayloadFor`): a multi-selection the grip belongs to drags as its
   block; else an item of an open unit (a bullet line) reorders inside its unit only; else the
   movable ancestor drags alone. A pinned ancestor diverts to the free-move gesture first.
4. **Per pointer move** (`classifyDrop`): the pointer, aim-compensated through any active
   parting, is classified against five claim families computed fresh from the frozen regions:
    - **gap tiles**: every open container's interior is tiled at child midpoints; each tile means
      "insert at this gap of this container";
    - **wrap strips**: each member's cross-axis edges (8 to 24px, 15 percent of its extent) mean
      "wrap this member with the payload into a perpendicular group", except members that are
      open same-axis containers (their own first/last gap owns the band instead);
    - **escalation slivers**: 6 to 12px inside an open child's flush edge escape to the parent's
      gap beside it, at half a depth step;
    - **root stack strips**: a row root's vertical padding ring (uncommitted until f30f725,
      now in) means "stack a full-width band over the columns";
    - **bands**: column-boundary bands (24px each side, priority 1) and new-section bands
      (44px reach, priority 2).
5. **Arbitration**: among element claims the deepest container wins, distance to the indicator
   line breaks depth ties; a band beats the best element claim only when its line is nearest
   within 4px (TIE); the currently held target persists within 6px (HYST).
6. **Parting** (live reflow): on each discrete slot change, the drop's own pure path computes the
   post-drop tree; the canvas paints it, FLIP-animates the moved boxes over 140ms, dims the
   previewed drop content with a veil, and the pointer aims through the displacement map.
7. **Release**: `applyDrop` runs the same pure path, one commit, selection follows the landing.

### The block drag

Identical pipeline since the block-drag round: `moveMany` claims are the shared parent's gaps
(with the contiguity no-op rule) plus the full generic families with member exclusion. A gap
landing re-selects the members as siblings; any other op groups them by the source axis.

### What the user sees

One 3px accent line (or a region outline for empty targets), moving continuously with the
pointer. A label pill at the cursor. The parting when a slot is active. Nothing else: no
destination container is ever indicated, and every distinct structural meaning shares the same
accent-line look.

## 2. The audit: what one section actually offers

Fixture: the user's own shape (a split section: image column beside a column of label, heading,
body, card of three bullets; 1226x700 card, realistic paddings). Payload: moving the body
paragraph, the everyday gesture. Every zone measured by 2px sweep against HEAD.

**Horizontal sweep at mid-height (y=300), left to right:**

| zone       | width | meaning                                                           |
| ---------- | ----- | ----------------------------------------------------------------- |
| 0..38      | 38px  | new leftmost column (root gap tile in the ring)                   |
| 40..86     | 46px  | new leftmost column (column band, different op, same felt result) |
| 88..558    | 470px | insert between image and caption, inside the image column         |
| 560..582   | 22px  | nested row: body beside the image, inside the image column        |
| 584..626   | 42px  | new middle column (band)                                          |
| 628..892   | 264px | new middle column (root gap tile)                                 |
| 894..1138  | 244px | new rightmost column (root gap tile)                              |
| 1140..1226 | 86px  | new rightmost column (band, then ring tile)                       |

**Vertical sweep down the text column (x=890), top to bottom:**

| zone     | height    | meaning                                                               |
| -------- | --------- | --------------------------------------------------------------------- |
| -44..0   | 44px      | new section above                                                     |
| 2..62    | 60px      | full-width band stacked over both columns                             |
| 64..74   | **10px**  | insert at top of the column                                           |
| 76..156  | 80px      | insert between label and heading                                      |
| 158..362 | **204px** | new column (root tiles bleeding through the suppressed source flanks) |
| 364..636 | 272px     | four insert zones inside the card                                     |
| 638..698 | 60px      | full-width band stacked below both columns                            |
| 700..730 | 30px      | new section below                                                     |
| 732..760 | 28px      | wrap the next section's root                                          |

### The three findings that explain the feel

**F1. No destination legibility.** The vertical line crosses four structural depths (section,
column, card, and the implicit root) through 13 zones, and the only signal distinguishing them
is the accent line's length and position. "Into the card" versus "into the column" versus "new
column" versus "stacked over everything" all paint the same 3px line. Figma's answer is the
other half of the signal: the receiving frame is outlined the whole time. We never show the
receiver.

**F2. The source's own neighborhood answers with the wrong meaning.** Dragging the body within
its own column, the 204px band at the column's middle offers "create a new column": the body's
flanking gaps are suppressed as no-ops, and the root row's tiles bleed through the hole. The
most common gesture of all, a small reorder near the grabbed element, shows a full-height
vertical line meaning a structure change. It should read as "home" (drop returns it) or resolve
to the nearest real gap of the same column.

**F3. Meaning-dense boundaries with invisible transitions.** A 10px "first item of the column"
zone sits under a 60px "stack over everything" band whose indicator is a nearly identical
horizontal line a few pixels higher. A 22px nested-row strip interrupts a 470px insert zone.
"Below the card, inside the column" is unreachable on the sweep line entirely (the card's
interior gaps and the stack band leave it no zone), while "after the card's last bullet" and
"below both columns" are pixel neighbors. Structure-creating drops and plain inserts
interleave at 8 to 24px pitch with identical visuals.

## 3. The Figma reference model

From their documentation and forum record, plus first principles (searches on the exact
drag-internals came back thin; the help center describes the indicator and modifier behavior,
the rest is observable product behavior):

- Dragging over an auto layout frame shows **one blue insertion indicator** at the position the
  object will take, and **the receiving frame is highlighted**. Two signals, always: into what,
  at which position.
- **A plain drop never creates structure.** It inserts into the highlighted frame at the line.
  Wrapping, grouping and nesting are explicit commands (Shift+A, frame selection), never a drop
  side-effect.
- **The real object drags with the cursor** (semi-transparent), so the thing being placed is
  always visible.
- **Depth is geometric and strict**: the deepest frame under the pointer receives; there are no
  shallow claims inside a deeper frame's box.
- **Modifiers opt out**: holding Space keeps an object out of auto layout while dragging
  (Galleo's Space-to-pin already mirrors this); absolute position is the standing escape hatch.

Sources: [Figma Learn: horizontal and vertical flows](https://help.figma.com/hc/en-us/articles/31289464393751-Use-the-horizontal-and-vertical-flows-in-auto-layout),
[Figma Learn: guide to auto layout](https://help.figma.com/hc/en-us/articles/360040451373-Guide-to-auto-layout),
[forum: Space modifier while dragging](https://forum.figma.com/t/prevent-object-from-being-added-to-auto-layout-group-while-dragging-by-holding-down-modifier-key/609),
[Figma Learn: grid flow](https://help.figma.com/hc/en-us/articles/31289469907863-Use-the-grid-auto-layout-flow).

The principle that makes it feel perfect is not any single affordance. It is that **the drop has
exactly one meaning, and both halves of it are always visible**. Predictability first;
reachability of exotic structures is not the drop's job.

## 4. The redesign

### The unifying idea: every drop is an insert into a container, and the container is shown

Galleo is flow-first, so unlike Figma it genuinely needs structure from drops (columns exist
because someone dropped something beside something). The reconciliation: keep those outcomes but
recast every one of them as an **insert into a container that is visibly outlined**, where the
container is sometimes **implicit** (the row a side-by-side drop creates, the section-level
stack over a row of columns, the artifact's own section list). An implicit receiver is outlined
as a **dashed preview box** where the real one is a solid outline. One rule to read every drop:
_it goes into the outlined thing, at the line._

### D1. Destination highlight (new, the missing half)

The classifier's hit gains the receiving container's rect and an `implicit` flag. The overlay
draws, for the whole time a target is active:

- a soft accent outline plus 4 percent tint over the receiving container (solid for a real
  container, dashed for an implicit one);
- the insertion line inside it, as today;
- for `newSection`, the gap band itself tints (no line pretending to be an element insert).

The highlight is calm and static; the parting stays the only motion. This ships first because it
repairs F1 with zero vocabulary change.

### D2. The vocabulary diet

What a plain drop can mean, final list, each with a distinct look:

1. **Insert into a real container** (solid outline + line). The gap tiles, exactly as today.
2. **Insert into an implicit container** (dashed outline + line):
    - _side-by-side_: at a leaf or sealed unit's left/right edge band, the dashed box previews
      the row that will exist; covers today's wrap-beside, the root column bands, and the
      root-leaf wrap. One meaning, one look, any depth.
    - _section-level stack_: the vertical ring above/below a multi-column root inserts into the
      section's implicit col (the dashed box spans the card, the line runs full width); covers
      the root stack strips, recast.
    - _new section_: the tinted band between cards; unchanged semantics.
3. **Fill an empty region** (region outline, as today).

Deleted as drop outcomes:

- **Escalation slivers** (6 to 12px, half-depth): replaced by the container edge-band rule in
  D3, which does the same job at legible size with the highlight announcing the receiver switch.
- **Top/bottom stack strips on leaf members of rows** (the 22px fights): a nested col from a
  single drop dies. The structure remains reachable by composition: drop side-by-side to make
  the column, then drop the neighbor into it. Two legible drops instead of one 22px gamble.
- **The wrap op as a distinct drop meaning**: `wrapWith` stays in ops for the paste path and for
  an explicit Group command (the Shift+A analog, already reachable via multi-select group). The
  drop targets that survive still compile to wrap/column ops underneath; what dies is wrap as a
  _separately-aimed_ pixel target.

### D3. Zone geometry: strict depth, center-out, bigger bands

- **Strict deepest-wins**: inside an open container's box, only that container (or something
  deeper) may claim. Shallow tiles never bleed through suppressed flanks or gaps. This kills F2:
  the source's suppressed neighborhood becomes "home" (no target, parting collapsed, release
  returns the element), not a phantom new-column.
- **Center-out within a member**: the interior of a member belongs to the container it lives in
  (its parent's gaps, or its own gaps when it is an open container). Its **edge band** (15
  percent of extent, clamped 12 to 40px, up from 8 to 24) belongs to the next meaning out:
    - leaf or sealed member, cross-axis edges: the implicit side-by-side row;
    - open container member, any edge: the parent's gap beside it (the escalation's job, at
      legible size, announced by the highlight switching from the card to the column).
- **Bands live in their gutters**: column bands only between columns and at the true outer
  edges, never overlapping member interiors; section bands as today. Priority arbitration
  (TIE=4) survives but fires far less because zones no longer overlap by construction.
- **Hysteresis unchanged** (HYST=6); zones are bigger, so flapping drops naturally.

### D4. Block drags: parity by construction

`moveMany` runs the identical geometry with member exclusion and the contiguity rule; the
source-zone-is-home rule covers the whole block's neighborhood. The audit sweep re-run with a
two-member block must produce the same zone map as a single element modulo the excluded members.
One pin asserts exactly that.

### D5. The cursor ghost returns, staged

Between slots (no active target, pointer over home or dead space) the real element paints at the
cursor at 50 percent opacity, capped at 200px wide (the Figma feel; `MoveGhost` resurrected from
the deleted code, one commit back). The moment a slot activates, the in-layout parting shows the
truth and the cursor ghost yields to the label pill. New-element drags keep the tile pill
always (their parting preview already shows real default content).

### D6. Reflow interplay

Parting stays per-slot-change and untouched. The highlight is static chrome; the only new motion
is the highlight's 100ms position transition when the receiver changes (same transition the
active line already uses). `PART_FEEL` unchanged. The foreign-edit stand-down and the
compensation map are unaffected.

## 5. The target flow, frame by frame

**Reorder within a column.** Grab the body paragraph; it dims in place, the real element ghosts
at the cursor. Ten pixels down, the column outlines solid, the line slides to the gap under the
heading, siblings part. Anywhere in the column's middle: always the column outlined, always one
line, never a structure change. Over the grabbed element's own zone: no line, parting collapses,
release drops it home. Release: seamless, the parting was the truth.

**Move into the sibling column.** Drag right; crossing the gutter the image column's box
outlines solid and the line appears at its nearest gap. The 470px of the image maps to the
gap above or below it (center-out), the highlight always naming the column. At the image's
left/right edge band (26px on a 520px image, was 22): the outline switches to a dashed box
around image-plus-ghost, previewing the side-by-side row; the parting shows the 50/50 split
live. Two meanings across the whole column, each with its own look.

**Stack a banner over the columns.** Carry the element to the top ring of the section. The
dashed box spans the whole card, one full-width line under the section's top edge, the parting
pushes both columns down as one block. Release: the payload is the section's first full-width
band. (Same op as the stack strips shipped yesterday; what changed is the zone is the whole
ring, the look is unmistakable, and the 10px insert-at-column-top fight is gone because that
zone now starts below the ring with its own solid-outline look.)

**Block move across sections.** Shift-select two stats, grab either; the pair ghosts at the
cursor as a stack. Over a foreign section's column: solid outline, one line, parting opens a
two-element hole. Release: both land in order, still selected. Identical feel to the single
drag at every step.

**New section.** Between two cards the band tints; the line-free tinted band reads as "its own
place". Release: a new section. Dragging a whole section by its grip offers only these bands,
as today.

## 6. Migration

Survives untouched: `classifyDrop`'s shape and callers, `previewFor`/parting/FLIP/compensation,
`movePayloadFor`, the payload types, every op in `place`/`moveInto`/`resolveDrop`, hysteresis,
the pin/freeform system, unit seals, `parentGapSlots` contiguity. Changes: the claim families
inside `elementSlots`/`columnSlots` (deletions and the center-out rule), `DropHit` gains the
receiver rect + implicit flag, `DropIndicators` gains the highlight, `DragGhost` regains the
element ghost, arbitration loses the escalation depth-halves.

Pin posture, stated honestly: unlike the classifier round's zero-flip contract, this round
_intends_ flips; the zone map is being redesigned. The applyDrop/preview/compensation/marquee
pins survive verbatim; classification pins are re-authored from section 5's tables (the audit
sweep itself becomes a pinned table, so the next redesign has a measured baseline to argue
against). Every flip is listed in the diff against the old pin it replaces.

Phases:

- **A (S)** — destination highlight from the current classifier, no vocabulary change. Ships
  alone; immediately answers F1.
- **B (M)** — the diet + strict depth + source-is-home: delete escalation slivers, leaf stack
  strips, root wrapSlots as a family; recast side-by-side/stack/section as implicit-container
  inserts carrying the dashed look; the bleed-through fix. The audit sweep re-run as the
  acceptance test: target is at most 6 zones on the horizontal line, at most 8 on the vertical,
  no zone under 12px, no unreachable adjacent meaning.
- **C (S)** — geometry tune: edge bands to 15 percent/12..40px, bands confined to gutters,
  feel pass with the user.
- **D (S)** — the staged cursor ghost, release polish, ledgers (engine-audit U-entries,
  drop-classifier.md superseded note, this doc marked built).

Gates per phase: typecheck, lint, full vitest, check:elements, suppressions, copy, and
eval:shots exactly unchanged at 592 (nothing here touches layout).

## 6b. Built: deviations from the plan as written

- **Row-root column bands died entirely** (the plan kept bands "confined to gutters"): on a row
  root the band and the root's own gap tile land the identical drop, so the duplicate look was
  cut; bands remain only where the row does not exist yet (leaf, col and grid roots), always
  implicit. Two column pins re-authored to the same-landing insert.
- **The open-member edge band serves same-axis members too** (the plan implied perpendicular
  only): "just below this card" inside its flush col is exactly the case that was unreachable.
  To keep the member's own end gap alive, the escape claims only the outer half of the band
  (min 8px); "after the last child inside" and "just outside" both keep a zone, adjacent and
  distinguished by the highlight switching containers.
- **First/last gap tiles gained a 12px floor**, so a short first child (a 22px label) cannot
  shrink "insert at the top of this container" below a hittable size.
- **The acceptance numbers, measured**: the horizontal sweep went from 11 zones to 7 (the plan
  hoped 6; the extra is the second, legitimate beside-strip), the vertical from 13 wrong-mixed
  to 13 fully legible (the plan's 8 counted meaning families, of which there are 6; a four-gap
  card enumerates its gaps and that is correct, not noise). The 204px phantom and the 458px
  source neighborhood now classify as home (null); "below the card" is reachable at 18px beside
  "after the last bullet" at 10px, both announced by their receiver.
- The zone tables are pinned verbatim in `dnd.test.ts` ("dnd-ux acceptance").

## 7. Not taken, and why

- **Pure Figma (no structure from drops at all).** Flow-first Galleo without side-by-side drops
  would make the most common composition (columns) a two-tool operation. Notion proves the
  vertical-line-at-edge column drop reads fine; we keep it, with the dashed-preview upgrade.
- **Modifier-gated wrapping (hold Alt to wrap).** Hidden modality; discoverability near zero;
  and the dashed-preview look makes the same distinction visible without a key.
- **Hover-dwell to descend into containers.** Adds latency to the common case to serve the rare
  one; strict center-out geometry covers depth without timers.
- **Removing hysteresis in favor of bigger zones only.** Bigger zones reduce flapping but the
  boundary between any two zones still needs the hold; HYST stays.
- **A drop HUD (textual "insert into Card" tooltip at the cursor).** Considered as a cheaper F1
  fix; rejected as noise once the highlight exists. Recorded as a fallback if QA still finds
  depth confusion.

## 8. Open questions for the approver

1. Killing the single-drop nested stack (top/bottom of a leaf inside a row) in favor of two
   composed drops: acceptable? Recommended yes; it is the main zone-fight source.
2. The implicit-container preview: dashed outline plus the existing parting, or should wrap
   zones also show the 50/50 split preview parting already computes? Recommended: both (free).
3. The staged cursor ghost (real element until a slot activates): worth it, or keep the pill
   only? Recommended: staged ghost.
4. Side-by-side at any depth (nested rows) stays, or top-level columns only, Notion-style?
   Recommended: stays; the highlight makes depth legible now.

## 9. The motion round (2026-09-07, after the built round's QA)

The user's verdict on the built round names the motion model itself: "dragging around and
seeing things consistently move/change does not feel right." The per-slot honest preview makes
the whole document breathe while aiming: a real solve rewraps text, renormalizes widths, and
shifts every section below. The legibility chrome (destination highlight, home behavior, the
zone map) is liked and stays. This section plans the motion fix and the keyboard rearrangement
layer. Status: proposed, awaiting approval; nothing here is built.

### The option space

| option                                      | what moves while aiming                                      | frequency       | pointer stability                       | commit honesty                           |
| ------------------------------------------- | ------------------------------------------------------------ | --------------- | --------------------------------------- | ---------------------------------------- |
| (a) contained parting                       | only the receiver's members, by a fixed gap, pure transforms | per slot change | near-total (shifts are small and local) | one FLIP on drop absorbs the true reflow |
| (b) dwell-damped honest preview             | the whole document, after a 100-150ms hold                   | damped          | same churn, later                       | preview is the truth                     |
| (c) line + highlight only                   | nothing                                                      | never           | total                                   | one FLIP on drop                         |
| (d) (a) + honest preview on a modifier hold | (a) normally                                                 | per slot        | near-total                              | opt-in truth                             |

**(a) Contained parting, recommended firmly.** The receiving container opens a slot: members
after the insertion gap translate by a FIXED extent (GAP = min(48px, the payload's cross-axis
extent), tuned in QA), pure transforms, no re-solve, no rewrap, no width renormalization; the
container's box does not change, so nothing outside the receiver moves and sections below
never shift. This is Figma's motion: local, small, predictable, the same magnitude every time.
The honest full preview dies while aiming; the drop commits through one FLIP from the pre-drop
to the post-drop layout, so whatever the transforms approximated, the landing animates the
truth exactly once. Wrap/side-by-side zones show the dashed receiver plus the member sliding
over by GAP, not the 50/50 split; the split appears on commit.

(b) fails motion magnitude and locality: the world still breathes, just later. (c) is the
degrade tier, not the product: the slot-opening feel is most of what reads as Figma-quality.
(d) is (a) plus a hidden modality; recorded as a QA fallback, not built.

### What the felt drag becomes (reorder in a column, rewritten)

Grab the body paragraph: it dims in place and the real element ghosts at the cursor, staying
there for the whole gesture. The column outlines solid; the heading and the card slide apart by
48px, transform-only, 140ms; nothing else on the page moves, the sections below are stone. Move
one gap down: the first pair glides closed as the next opens, two small local motions. Over
your own spot: no line, no gap, ghost only. Release: one FLIP settles the real layout (the
paragraph's true height replaces the 48px approximation); Escape and the gaps just close.

### What dies, what retunes

- **Dies from the drag path**: `previewFor` per slot change (the function stays for nothing
  else; delete the call and the drag-preview memo), `GhostVeil` (no in-layout preview to veil),
  the `dragBase` foreign-edit stand-down (no preview to stand down), the parting stagger of the
  staged cursor ghost (the ghost now rides the whole gesture; the label pill retires to
  new-element and section drags).
- **Retunes**: `part()`/shifts become the contained shift list (the receiver's tail boxes and
  their one translation), published by the overlay rather than the paint; `compensatePoint`
  survives unchanged in shape but its input shrinks to those few boxes, and with GAP under
  every tile size it corrects at most one gap of drift; `paintReconcile`'s FLIP capability is
  the commit animation (one flip on drop and, new, on every keyboard move), driven by a
  one-shot flag beside the existing preview-only gate in `scheduleDraw`.
- **Unchanged**: classifyDrop and the whole zone map, the destination highlight, home, the
  hysteresis, `applyDrop`, reduced-motion and coarse pointers degrade to option (c) exactly
  as they already do (no parting there today; they gain the commit FLIP's non-animated cut).

### The keyboard rearrangement layer

Bare arrows are free for flow selections by construction: the existing arrow chords bind pin
nudges gated on `pinnedTarget()`, so an unpinned movable selection takes the same keys with a
disjoint `when`. The set, registered through the command registry (⌘K names them, the shortcut
sheet lists them; this is also the accessibility story for rearrangement):

| chord                            | command         | semantics                                                                                                                                                                                                                                                                                                 |
| -------------------------------- | --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `up` / `down` / `left` / `right` | `arrange.step*` | along the parent's axis: swap with the previous/next flow sibling; at the first/last position: step OUT, landing beside the parent in the grandparent. Perpendicular to the axis: step OUT sideways (a column member stepping left/right leaves the column and lands beside it, the drag's side-by-side). |
| `alt+up/down/left/right`         | `arrange.into*` | step INTO the adjacent open container in that direction, at its nearest end                                                                                                                                                                                                                               |
| existing                         | `pin.nudge*`    | pinned selections keep the px nudges on the same keys, disjoint by `when`                                                                                                                                                                                                                                 |

Every step commits through the same one-FLIP animation, so the keyboard feels like micro-drags.
A multi-selection steps as its block (`moveManyPayload` path). Zero new ops: each command
builds the same `DropTarget` a drag would produce and calls `applyDrop`; same-parent swaps ride
`moveChildrenTo`, step-out/step-into ride the existing insert/wrap targets. Collisions checked:
bare arrows (pin-gated, free), `alt+arrow` free (`mod+alt+m` is the only alt binding),
`shift+arrow` stays with the fast pin nudge. One analytics event at the seam: the existing
`element_moved` capture in the drop path fires for keyboard moves too (source: "keys"), no new
event.

### Phases

- **M-A (M)** — contained parting: the shift computation (receiver tail + GAP), transform-only
  application through the reconcile machinery, previewFor/GhostVeil/dragBase removal from the
  drag path, ghost rides the whole gesture. The world-stillness pin: during an active slot in
  one section, every region outside the receiver is byte-identical.
- **M-B (S)** — the commit FLIP: one-shot flip on drop, Escape closes gaps, reduced-motion cut.
- **M-C (S)** — the keyboard layer: eight commands, block support, the same commit FLIP, keymap
  and palette registration.
- **M-D (XS)** — feel constants with the user (GAP, ms), ledgers, live-reflow.md supersession.

Gates as always; eval:shots untouched at 592 (transforms and chrome only).

### Resolved and built (2026-09-07)

Both questions went to the recommendations: GAP = the payload's extent along the receiver's
axis capped at 48px (`MAX_GAP` in dnd.ts); keyboard bursts coalesce into one undo entry keyed
on the moved element's id. Deviations from the plan as written:

- `containedShifts` lives in dnd.ts and `holdShifts` (the transform applicator, matching
  painted nodes to the frozen member boxes geometrically) in backends.ts beside the flip kin.
- `previewFor` was deleted outright rather than kept unused; its pins retired with a note, the
  drop semantics stay pinned through every applyDrop case.
- The commit FLIP one-shot survives frame coalescing in `scheduleDraw` (a queued flip is OR'd,
  not overwritten).
- `element_moved` gained the typed `source: "drag" | "keys"` prop rather than a new event; no
  dashboard tile reads the old shape.
- Keyboard step-out is blocked for a whole root member at its section edge (sections move with
  their own commands) and for unit items (the seal); `alt` step-into requires the adjacent
  sibling to be an open container of container tier.

## 10. The controlled-canvas round (2026-09-07, after the motion round's QA)

Third verdict: "still pretty off", and this time with the diagnosis: we chased Figma, but
Galleo is a controlled canvas of sections. Users do not place things in space; they order
things in structure. The loved part is the nested flex engine underneath; the ask is the
cleanest control UX over it, not freeform placement. This section abandons Figma as the
reference class, distills what controlled products actually do, and offers three sharply
different control models with one firm recommendation. Status: Model 1 chosen and built
2026-09-07 (all recommendations locked: the element hops between slots, promotion at 32px past
the bounds, the gutter pill stays); deviations below.

### What controlled products do (Notion, Gamma, Craft, Coda)

Notion's model, verified: a horizontal blue line for reorder above/below; a vertical blue line
only at a block's explicit left/right for column creation; both coarse, nothing else exists
([columns help](https://www.notion.com/help/columns-headings-and-dividers),
[layout guide](https://thomasjfrank.com/learn-notion/page-layout-rows-and-columns/)). Gamma and
Craft searches on exact drag internals came back thin (recorded); from product use: per-block
handles, insert bars between blocks, card-level movement mostly via commands and the outline
rather than free drag. Coda is nearly pure list reorder. The shared grammar, distilled:

1. **Drag is reorder, not placement.** The gesture answers "which position in the order", never
   "where in space".
2. **Few, coarse, legal targets.** A handful of positions, each big; no continuous
   reinterpretation of a roaming pointer.
3. **The document holds still.** One indicator moves; content never reflows during the gesture.
4. **Structure is deliberate.** Columns come from one explicit, learnable spot (the narrow
   edge) or from commands; nesting never happens as a drop side-effect.
5. **Non-spatial movement is first-class.** Keyboard, "move to", outline drags carry the load
   the pointer does not.

Every one of our three rounds violated 1 and 2 by inheritance: classification of an
unconstrained pointer over the full claim space, however well arbitrated, IS drag-as-placement.

### Model 1 — constrained slide with deliberate promotion

The drag is scoped to the parent: grabbing an element turns the gesture into sliding it along
the parent's axis through DISCRETE slots (N+1 positions), the element itself snapping from slot
to slot under the pointer; siblings never move, nothing else in the document is even eligible.
Pushing clearly past the parent's bounds (a real threshold, ~32px beyond the box) promotes the
gesture one level: the receiver highlight jumps to the grandparent and the same discrete slide
re-quantizes there; entering another section's card while promoted re-scopes into it. Structure
is never created by a plain drop: column creation keeps exactly one spatial affordance, a
rendered gutter pill that appears when the promoted pointer nears a section gutter (the Notion
narrow-edge, made visible); everything deeper (side-by-side at depth, stacks, wraps) lives in
commands, the keyboard layer, and the bar. Targeting is two rules total: which container box am
I in (boundary events with hysteresis), and which 1-D slot along its axis.

_Reorder in a column_: grab the paragraph; it lifts slightly (shadow, full opacity) and the
column outlines; drag down and the paragraph itself snaps into the next gap, a discrete hop,
neighbors and world perfectly still; release anywhere, it stays where it sits. _Move across
columns_: slide up out of the column top or push 32px past its side; the outline jumps to the
row of columns, the paragraph now snaps between columns as a whole-column-sized card; push into
the other column's box and the outline dives in, snapping between its blocks; three legible
scope changes, each announced by the highlight. _Structure_: dragging near the section's outer
gutter shows a slim vertical pill reading as "new column"; dropping on it splits; everything
else via `alt+arrows`, Group, or the bar.

Failure modes, honestly: promotion thresholds need feel-tuning or escaping a small container
gets fiddly; deep nesting means several promotions to cross the tree (mitigated by the
keyboard layer and by scope-jumping straight into any container box the pointer enters).

### Model 2 — discrete slot markers (an explicit Move mode)

Starting a drag (or pressing M / the bar's Move) renders every legal position as a small marker
chip in the gaps, table-insert style; column-creating spots render as visually distinct
vertical pills; the pointer just picks the nearest marker (magnetic, the chosen one swells and
its receiver highlights), and the drop lands there. Zero continuous classification; the target
set is literally visible. Cross-section moves are trivial (markers render in every section).
The cost is chrome: a dense document shows dozens of chips, and long-distance "nearest marker"
needs a viewport cap.

_Reorder in a column_: grab; four dots appear in the column's gaps and a pill at each gutter;
the dot under your pointer swells; drop. _Across columns_: the other column's dots are simply
there; move roughly, the nearest dot takes it. Failure modes: gesture-time visual noise scales
with document complexity; markers hide the content they sit on; feels like a dialog, not a
canvas.

### Model 3 — minimal-spatial

Handle drags reorder strictly within the parent, pure list semantics, nothing else; every
cross-container move is non-spatial: the arrow-key layer (promoted to the primary, documented
mechanism), a "Move to" popover on the bar (pick section / column / container from a tree), and
cut/paste. The most honest reading of "controlled product"; radical, tiny, unbreakable.
Failure modes: dragging an image from the left column to the right is a real, common intent in
this product class (Notion supports it spatially), and telling users "use the keyboard" for it
will read as a gap, not a philosophy; demos poorly against Gamma.

### Comparison

|                      | 1 constrained slide         | 2 slot markers          | 3 minimal-spatial        |
| -------------------- | --------------------------- | ----------------------- | ------------------------ |
| predictability       | high (scoped, discrete)     | total (targets visible) | total                    |
| chrome during drag   | one highlight + the element | marker field            | one line                 |
| cross-container drag | yes, via legible promotion  | yes, trivially          | no                       |
| structure by drag    | one visible gutter pill     | distinct pills          | none                     |
| matches product soul | strongest                   | mode-like               | austere                  |
| felt risk            | threshold tuning            | noise                   | missing expected gesture |

### Recommendation: Model 1, firmly

The PM case: it is the only model where the _gesture itself_ is controlled rather than the
feedback about an uncontrolled gesture, which is the root the user named across three rounds.
It keeps the one spatial move users of this class genuinely perform (cross-column drag) while
making scope changes deliberate and announced; it renders structure creation as one visible,
learnable affordance instead of invisible zones; the document never moves; and the keyboard
layer is the same slot walk, so pointer and keys become one mental model ("the element steps
between slots; arrows step it too"). Model 2 survives inside it as a possible later Move mode
for long-distance jumps; Model 3's non-spatial affordances ("Move to" popover) are worth adding
regardless, but as a complement, not the answer.

### What dies and survives, per the recommendation

Dies: `classifyDrop` and the whole claim vocabulary (gap tiles, strips, escape bands, home
tiles, arbitration, TIE/HYST as zone machinery), `containedShifts`/`holdShifts` (nothing opens;
the element occupies the slot), the zone-map acceptance pins (replaced by slot-walk pins), the
compensation map. Survives: the destination highlight (now the scope indicator, its receiver
semantics intact), the commit FLIP (each slot hop and the final landing animate through it),
`applyDrop`/`place`/`moveInto`/`moveChildrenTo` (drops still land through the same pure ops),
`movePayloadFor` and block parity, the keyboard layer nearly verbatim (arrows = the same slot
walk), home-by-default (the original slot), `regionBox`/`childBoxes` geometry, the cursor
ghost (as the lifted element itself), reduced-motion/touch (discrete hops with no transition,
or markers, both coherent).

### Phases (for the recommended model, on approval)

- **C-1 (M)** — the scoped slide: receiver-by-containment with boundary hysteresis, 1-D slot
  quantization, the lifted element snapping between slots, promotion threshold; single + block.
- **C-2 (S)** — cross-section scope (cards as containers, the section band as a slot) and the
  gutter pill affordance for column creation.
- **C-3 (S)** — unification: keyboard layer re-expressed over the same slot walk, "Move to"
  popover, deletions of the dead machinery, pin migration.
- **C-4 (XS)** — feel constants with the user, ledgers.

### Built (2026-09-07): what landed, and deviations

`slideAt` in dnd.ts is the whole targeting model: scope by containment (payload's parent to
start, promote at `PROMOTE_PX = 32` past the box, descend into any open container the pointer
enters, the section stack past a root), slot by 1-D quantization at flow midpoints (grids pick
their visual row band first), the old no-op flanks as home. `gutterPills` is the one structural
affordance. The chrome: the `SlotCard` (the real element painted at the slot line, hopping with
a 100ms glide), the scope highlight through the existing receiver channel, slim accent pills.
The commit FLIP animates every landing; the keyboard layer was untouched and now shares the
model's semantics exactly.

Deviations from the plan as written:

- A leaf-root section is a first-class scope: its two slots stack the section above or below
  the leaf (the old wrap-col landing), so no section is ever drag-dead.
- A unit's item gets its unit as a fixed scope (never promotes, never descends): the seal and
  the slide are the same statement.
- Section drags ride the same `slideAt` through the stack scope rather than a separate band
  path; their chrome keeps the label pill and the stack line.
- The pin-return of a free-moved element re-targets through `slideAt` within 16px of a line.
- Deleted outright (about 950 lines with their pins): `classifyDrop`, every claim family,
  arbitration and its constants, `containedShifts`/`holdShifts`, `part`/`compensatePoint`, the
  cursor ghost, the zone-map acceptance tables. 24 retired describes each carry a one-line why.
- One wrap affordance survived beyond the gutter pills, amending "the one structural
  affordance" above: a leaf or sealed member under the pointer gets a two-slot wrap scope
  (`wrapMemberAt`/`wrapSlide` in dnd.ts: the full column strip of a row member, the side bands
  of a col member, the whole cell in a grid), so a plain drop can still pair it with the
  payload perpendicular to the parent's axis; the receiver dashes as implicit. Pills own
  column creation, the wrap scope owns the pair.
- The C-3 "Move to" popover was not built; no such surface exists in `editor/`.
  Cross-container moves are the promoted slide, the keyboard layer, and cut/paste. Open item.
- Reduced motion, as built: the drag chrome's glides (the `SlotCard` hop, the pills, the
  receiver highlight) honor `prefers-reduced-motion` through `motion-reduce:transition-none`,
  but the commit FLIP does not (`playFlip` in `canvas/render/backends.ts` animates
  unconditionally, and nothing in the editor drag path reads `prefersReducedMotion`), so the
  non-animated cut section 9 promised is not in the tree; coarse pointers get no
  drag-specific degrade either. Open item.
