# Multi-element selection

> Shift-click (and the marquee sweep) builds a set of selected elements on top of the single
> selection, unlocking group/ungroup, bulk delete/duplicate/copy, block drags, and set-scoped chat
> focus. The design keeps `selection: Target | null` untouched as the anchor and adds
> `extras: ElementAddress[]` beside it, so every anchor-only consumer keeps working and
> multi-aware surfaces opt in.

Companion docs: `collab.md` (presence and the edit lease), `frontend.md` (the `@ui` rules for any
new chrome), `.docs/executed/freeform-move.md` (the body-drag gesture the block drag rides on).

## Options considered

**Change `selection` to `Target[]` everywhere.** Honest cost: two dozen producers and roughly
fifteen consumers churn at once, and every consumer that genuinely needs one element (inspector,
inline editing, resize, comments, presence) grows a "first of" convention that is the anchor model
anyway, just implicit. Rejected.

**A set with no anchor.** The inspector, text editing, presence and the drag grip all need "the"
element; without an anchor each invents its own rule. Design tools keep an anchor for the same
reason. Rejected.

**Primary + extras (chosen).** `selection` keeps its exact meaning; `extras: ElementAddress[]`
rides beside it; derived `selectedAddresses()` is the normalized set in document order (anchor
included). Every anchor-only consumer works untouched; multi-aware consumers read the set.

## The model (`editor/core/store.ts`)

`extras` is a signal beside `selection`; `selectedAddresses()` returns the whole selection in
document order (empty unless an element is the anchor); `multiSelected()` is the >1 test;
`selectMany(addrs)` re-seeds the selection after a batch op, first address as anchor;
`toggleExtra(addr)` is the shift gesture; `clearExtras()` peels back to the anchor.

Invariants, enforced by `normalizeExtras` on every mutation plus the call-site rules around it:

- Elements only; a non-element primary means `toggleExtra` just selects.
- No element and its own ancestor in the set (adding an ancestor evicts its descendants, and vice
  versa).
- Nothing inside a closed container: the shift gesture and the marquee both resolve through
  `movableAncestor` before adding, so a part of a unit adds the unit.
- No duplicates; `extras` never contains the primary.
- Any structural commit clears extras (correctness over persistence; keeping the set alive
  through its own batch op's rebasing is the batch op's job — `selectMany` on the result — not the
  signal's). Undo and redo collapse it for the same reason: a replayed batch moves the same paths
  the original edit did. So does a remote collaborator's structural op.
- `editing()` may only ever address the primary; `startEditing` clears extras.
- Every plain `setSelection` collapses the set; only the shift gesture and `selectMany` carry it
  forward.

## The gestures

- Desktop only (the phone path shares one handler and has no shift; no phone gesture exists).
  Shift-click on an element toggles membership, aimed at `movableAncestor` like the drag grip. A
  first shift-click with an element primary seeds the set; shift-clicking the primary demotes it
  and promotes the first extra; shift-click never starts text editing.
- Plain click: collapse to single — byte-identical to the old behavior when no extras exist.
- Esc (`select.up` in `editor/core/commands.ts`): peels the set back to its anchor first, then
  walks `parentTarget` as before.
- Shift-click on a section or empty backdrop: no-op for the set.
- A drag whose payload cannot carry the set collapses extras first (`movePayloadFor` returns
  `clear`).
- One-click-to-edit coexists by scope, not by mode: shift-click inside the active text edit stays
  native selection extension (the overlay stops propagation before the canvas sees it);
  shift-click anywhere else commits the edit, the edited element becomes the anchor, and the click
  toggles its target. Shift-pointerdown is prevented in `editor/Canvas.tsx` so the browser cannot
  extend a text range from the overlay caret across painted spans.
- **Marquee.** A press on nothing — the gutter or a section's empty ground, fine pointer only —
  sweeps a rectangle past the same drag threshold; release resolves everything it crosses through
  `marqueeTargets` (`editor/core/dnd.ts`) and selects the set via `selectMany`. A container root
  never answers (it would make every sweep select the whole section); a swept branch answers as
  its depth-one ancestor, so a card is taken whole; an empty sweep clears the selection.

## Consumers

**Untouched** (the anchor keeps working): inline text editing, ResizeHandles, RegionDividers,
comments (`comment.add` disables at >1), presence (sends the primary; the wire still carries a
single `ElementRef`), the edit lease (claimed on `startEditing`, not selection-coupled at all),
SectionActions, AI regenerate (anchor-only).

**Multi-aware:**

- The selection overlay (`editor/panels/Selection.tsx`): a ring for every member; the primary's
  ring keeps the full style, extras get a lighter variant (`data-testid="selection-extra"`).
- The context bar (`editor/panels/ControlBars.tsx`): at >1 it positions on the union box of the
  members and drops every per-element control, keeping only the shared actions.
- The inspector (`MultiSelectPanel` in `editor/panels/RightPanel.tsx`): a minimal "N selected"
  panel — the count, Group (only when the set shares a parent), Duplicate, Delete. Shared
  property editing across a set (mixed- or same-type) is not built.
- Commands (`editor/core/commands.ts`): `deleteSelectedElements` and
  `duplicateSelectedElements` are the one delete and duplicate shared by the keyboard, the
  context bar, the inspector, and the context menu; `edit.copy`/`edit.cut` take the whole
  selection; `edit.group` (`mod+g`) and `edit.ungroup` (`mod+shift+g`) wrap `groupSelection` and
  `ungroupAt`. One commit per gesture.
- Clipboard (`editor/core/clipboard.ts`): `clipboardEl` holds `ElementInstance[]`;
  `pasteElements` anchors each element on the one before it, so a block pastes back in its
  original order, width-stripped and re-identified, and the paste re-seeds the selection to the
  new block.
- Chat focus: `deriveFocus` (`app/stores/chat.ts`) carries the set on `ChatFocus.elements`,
  anchor first. **Current limitation:** `focusLine` in `services/core/ai/prompts/chat.ts` still
  describes the anchor alone, so a turn cannot yet say "these 3 elements"; rendering the set is a
  few lines in that one function.

## Batch ops (`canvas/elements/ops.ts`)

The subtle part is index-path invalidation between steps. Two mechanisms, matched to the op:

- **`removeMany(art, addrs)`**: sort descending by `(section, path)` so no pending address
  shifts, remove each (respecting a sealed parent's own child rule), then collapse each touched
  parent once. Delete and cut build on it.
- **The generic pattern for anything else**: resolve through ids. `withElementIds` stamps the
  set, `elementIdMap` re-resolves addresses between steps. `duplicateMany` uses it; new batch ops
  inherit it instead of inventing per-op arithmetic.
- **`groupSelection(art, addrs, direction)`**: requires a shared parent, takes the members in
  tree order, removes them (descending), inserts a `container` with them as children at the first
  member's index, and renormalizes row widths via the existing helpers. `ungroupAt` splices a
  container's children back.

All pure, all tested at the ops layer (`canvas/elements/__tests__/ops.test.ts`), one `commit` per
gesture.

## The block drag

`movePayloadFor` (`editor/core/dnd.ts`) is the one precedence rule for a body or grip grab: the
set drags as its block when the grab is a member and every member shares one parent
(`moveManyPayload` builds `{ kind: "moveMany"; parent; indices }`); otherwise the grab drags its
own element and the caller collapses extras. The same-parent gate is about the source: a set
scattered across parents has no block order to preserve, so it does not drag as one.

In the slide model the block then travels like any move. The drag starts scoped at the shared
parent, and the scope promotes and descends with the pointer, so the block can leave home:

- A gap in the shared parent is pure block arithmetic (`moveChildrenTo`): remove the sources
  descending, shift the gap index across the removals, reinsert in original relative order. Gaps
  strictly inside the dragged block are no-ops.
- Anywhere else, `applyDrop` lifts the block out (`liftChildren`), re-aims the target across the
  lift, and lands it: sequentially into a gap as siblings, or as one row/col group container for
  every other op. The emptied parent collapses.

`LiftVeil` (`editor/panels/DropIndicators.tsx`) dims every member during the drag, and the drop
re-seeds the selection onto the landed block via `selectMany` (`editor/Canvas.tsx`). Pin drags
never carry the set (`beginPinMove` clears extras). Cut/paste remains the other route for moving
a scattered set.

## Analytics

`elements_grouped { count }` (`model/analytics.ts`), captured through `noteElementsGrouped` in
`editor/core/store.ts` from the group command. `element_removed` carries `count` only for a batch
(`noteElementRemoved`), so a single removal keeps the shape it always had. Ids and counts only,
never content. There is no element-duplicate event; one is worth adding on its own terms, not as
a side effect of the batch work.

## Tests

Ops-layer suites cover descending removal across shared parents, id-map duplication, group +
width renormalization, and the block-move arithmetic; store tests cover the normalization
invariants; `editor/core/__tests__/dnd.test.ts` covers `movePayloadFor`/`moveManyPayload` gating;
`e2e/editor/multi-select.spec.ts` drives the browser flow.

## Not built, recorded

Mixed- and same-type shared property editing; phone multi-select (needs its own gesture, likely
long-press); presence as an array (a protocol bump the single-`ElementRef` wire does not need
yet); select-all-in-section; alignment/distribution tooling over the set.

Two defaults stand: shift-click on an already-primary element demotes it (rather than no-op), and
a structural commit clears the set (rather than chasing it through rebases).
