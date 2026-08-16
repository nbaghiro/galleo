# DnD redesign: stable canvas + insertion indicators

> Session working doc. Goal: the optimal editing experience for dragging existing elements and
> inserting new ones into sections. Replaces the reflow-preview model (lift the source out at drag
> start, live-splice a \_\_dropghost, repaint the reflowed stack every move) with a stable-canvas
> model: nothing moves during the drag; theme-aware insertion indicators mark the droppable slots;
> the mutation happens exactly once, at drop.

## Why (grounded in the current code)

The flicker has one root cause: `previewDrop` re-runs the real mutation path with a spliced ghost
on every target change, and the canvas repaints the reflowed result per frame
(`editor/Canvas.tsx` preview memo; `editor/core/dnd.ts` liftOut/previewDrop). Text rewraps,
columns renormalize, and the source vanishing at gesture start shifts content under the cursor.
Three properties of the current code make the redesign cheap:

- Drop targets are already computed against the INTACT pre-drag tree (regions freeze during a
  drag: `track:false` in the preview path), and `moveInto` already re-aims paths across the
  removal. The commit path (`applyDrop` -> one undo entry) is untouched by this redesign.
- With no reflow, regions stay valid for the whole gesture, so the droppable-slot list can be
  precomputed ONCE at drag start; per-move work becomes hitbox lookup.
- Dimming the lifted source is an overlay concern (a veil div over its region box), not a paint
  pipeline concern.

## The slot model (core)

New in `editor/core/dnd.ts`:

    interface DropSlot {
        target: DropTarget;              // existing op vocabulary, unchanged:
                                         // replace | insert | wrap | column | newSection
        priority: 0 | 1 | 2;             // newSection > column > element-level, mirrors today
        indicator:
            | { kind: "line"; axis: "x" | "y"; x: number; y: number; length: number }
            | { kind: "region"; box: Rect };   // empty-region replace highlight
        hitbox: Rect;                    // stage coords, tiles space within its priority class
    }

    computeDropSlots(artifact, regions, payload): DropSlot[]   // once, at drag start
    activeSlot(slots, x, y): DropSlot | null                   // per pointermove

Slot derivation (all from frozen regions + the artifact tree, no layout):

- newSection: every inter-section gap plus 44px bands above the first / below the last section.
  Indicator: horizontal line spanning the stack width, centered in the gap.
- column: per section, the root row's outer edges + boundaries between column regions (24px
  bands, unchanged). Indicator: vertical line spanning the section's content height.
- insert: for every OPEN container, one slot per child gap including before-first and after-last.
  Hitboxes tile the container interior split at child midpoints (reproduces today's gapIndex
  behavior: hovering anywhere over a child maps to the adjacent gap). Indicator: a line
  perpendicular to the container axis at the gap, spanning the container's cross size.
- wrap (leaf-as-section-root): four edge slots; hitbox = nearest-edge partition of the leaf box;
  indicator: a line hugging the corresponding edge of the leaf. Same semantics as today's
  axis-from-cursor-offset wrap, made visible.
- replace: empty-region containers; indicator: accent highlight of the region box.
- Closed containers: droppablePath clamping unchanged; no slots inside them.

Move-payload exclusions (correctness improvements over today):

- No slots inside the dragged element's own subtree (currently unguarded; the frozen-region model
  makes the guard trivial: drop any slot whose target path extends payload.from).
- No no-op slots: the gaps immediately before/after the source in its own parent, and
  replace/wrap of itself.

Overlap resolution: pick the highest-priority class whose hitbox contains the pointer; within a
class, containment (hitboxes tile) with the ACTIVE slot's hitbox inflated by 4px for hysteresis.
No pointer position -> null (no drop; the source never moved, so cancel is free).

Staleness guard: if `editSeq` changes mid-drag (AI streaming, collaborative write), recompute
slots from fresh regions on the next frame; if the source element no longer exists, cancel the
drag.

## Visual language (theme-aware, overlay-only)

Rendered as absolutely positioned divs in the existing overlay stack (the RegionDividers
pattern), positioned from slot geometry; the canvas itself never repaints during the drag.

- Active slot: 3px rounded accent line (editorTokens accent) with small end caps; empty-region
  replace = accent border + 8% accent wash over the region box. 80-120ms transform/opacity
  transitions; disabled under prefers-reduced-motion.
- Candidate slots (discoverability): faint markers - 1.5px, theme line token, ~40% opacity.
  DECISION 1 below governs how many show.
- Lifted source (move drags): stays in place under a veil div (theme surface at ~65%, matching
  the region's radius). Removed from the tree only at drop.
- Cursor ghost: keep the existing DragGhost pill; for new-element drags add the palette tile's
  mini icon next to the label.
- Drop feedback: the commit repaint + selection re-aiming to the landed element (existing
  behavior) is the confirmation; no extra animation in v1.

## What gets deleted (no dead code)

- `previewDrop`, `liftOut` in dnd.ts; the dnd branch of Canvas's `preview` memo (liveEdit and
  section-reorder branches remain).
- The `__dropghost` element: dropghost.ts, its register.ts import, its HIDDEN entry in
  Editor.tsx, and `previewDataUri` in previews.ts if it has no other consumer.
- The per-move `computeDropTarget` tree walk (replaced by activeSlot over precomputed slots);
  `computeDropTarget` itself dissolves into computeDropSlots.

## Phases

- [x] P1 slot engine (pure): computeDropSlots + activeSlot in dnd.ts; DropTarget/place/applyDrop/
      moveInto/adjust\* untouched. Unit tests: slot enumeration on representative artifacts (leaf
      root, row of three, nested card, closed table, empty region), subtree/no-op exclusions,
      hitbox tiling leaves no dead zones inside a container, hysteresis, priority overlap.
- [x] P2 wiring: drag state carries slots (computed in Canvas when drag() goes non-null, from
      liveRegions); pointermove sets target via activeSlot; preview memo's dnd branch removed;
      drop path unchanged. Verify: zero scheduleDraw calls between drag start and drop.
- [x] P3 indicators: DropIndicators overlay component + LiftVeil for the source; theme tokens;
      reduced-motion handling.
- [x] P4 cleanup: delete ghost machinery per above; DragGhost icon upgrade; update
      .docs/rendering.md section 6 dnd paragraph.
- [x] P5 (recommended follow-up, separate commit): unify section reorder onto the same language -
      gap indicator + veil-dimmed source, no live stack reflow; minimap reorder untouched.

## Decisions to confirm

1. Candidate-slot visibility: (a) all slots document-wide, (b) RECOMMENDED hovered-section slots
    - always-on section-gap markers, (c) active-only. (b) balances discoverability with noise on
      dense documents; trivial to switch later.
2. Source treatment during move: RECOMMENDED veil-dim in place (user-stated: remove only at
   drop). Alternative full-hide reintroduces the start-of-drag content shift.
3. Wrap stays, with edge-line indicators (four hitboxes). Alternative - dropping beside a leaf
   root only via the column op - loses vertical wrap; not recommended.
4. Touch tier: unchanged for now (precision drag already desktop-only; palette drags work);
   hitboxes can inflate on touch later.

## Trade-off acknowledged

The reflow preview showed the true post-drop layout; indicators do not. This is the standard
trade (Notion/Figma/Docs all indicate, none reflow) and the stability win dominates. If wanted
later: a debounced "landing preview" on hover-hold over one slot, rendered as a scaled thumbnail
beside the cursor - out of scope for v1.
