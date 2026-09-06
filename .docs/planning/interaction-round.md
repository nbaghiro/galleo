# Planning — the interaction round

> The U series of [`engine-audit.md`](engine-audit.md), minus what earlier rounds already took:
> U2 (undo coalescing) is done, and re-verification shows U1's delete/duplicate half landed with
> the child-actions work (delete and duplicate now reach sealed children through the container's
> own `removeChild`/`duplicateChild`), and bullet items already reorder inside their unit
> (`unitItem` in dnd). What remains is below, in three tiers matching who hits it: the
> first-session user, the person arranging, the power user. Status: built 2026-09-06, pending one
> manual QA pass. Deviations from the plan as written: U6 keeps depth-first resolution among element
> gaps (their hitboxes are tiled claims, and pure distance handed a deep tile to a nearer root line;
> distance decides across classes, exactly covering the named misfire) — argued in the audit note;
> U3's picker pin is structural rather than a test (the hardcoded list is deleted, the list IS
> `listElements()` minus hidden, which `check:elements` audits); U8's collapse cue and U10's
> block-move hint / `ungroupAt` popup gate were left open, recorded in the audit.

## Tier 1 — the first-session batch

### U1 residue — Enter splits, Backspace merges, inside a unit (M)

Current state: `TextEditor.tsx`'s `onKeyDown` maps Enter to `stopEditing()` (or a `<br>` for
multiline plain labels). A bullets item can now be deleted and reordered, but never split or
merged from the keyboard, which is how everyone edits a list.

- The gate is the seal machinery that already exists: `unitItem(art, addr)` (dnd) answers "this
  element is an item of an open unit". When it does and the edited element is a plain rich-text
  child, Enter splits and Backspace-at-start merges; everywhere else the keys behave exactly as
  today.
- The ops are pure and live with their kin in `canvas/elements/ops.ts`: `splitUnitItem(art,
addr, offset)` — truncate the item's text/marks at the caret (the `spliceText` machinery),
  insert a sibling carrying the remainder and the item's own shape (marker style rides the data
  copy) — and `mergeUnitItem(art, addr)` — append this item's text to the previous sibling,
  remove it, answer the join offset. Marks rebase through the same helpers the editor already
  uses.
- `TextEditor` commits the split/merge and hands editing to the new address at the right caret
  (the `pendingSel` remount path already does exactly this for AI edits).
- Pins: op-level red-first tests beside the other ops tests (split at start/middle/end, merge at
  index 0 no-ops, marks survive the seam); the key wiring is manual QA (no Solid harness, the
  established deviation).

### U3 — one insert gesture set (S-M)

Current state: palette tiles in `Insert.tsx` start drags only; a click flashes and inserts
nothing. The `EmptyRegionAdd` quick picker is click-only over a hardcoded type list.

- Click on a palette tile inserts the element at the selection (inside a selected open container,
  else beside the selected element via the paste-anchor rule, else at the active section's end),
  through the same `noteElementAdded(type, "palette")` seam drops use. Drag keeps working
  unchanged; the click path fires only below the drag threshold, the same slop test the canvas
  uses for taps.
- The quick picker builds from `listElements().filter(s => !s.hidden)` with the `@ui/fuzzy`
  search the palette itself uses, instead of its hardcoded list — one registry, three surfaces.
- Pins: the insert-target resolution as a pure function with tests; the picker's list source
  asserted against the registry.

### U4 — the padding ring drops (S)

Current state: gap hitboxes derive from content boxes, so the ring between a section's edge and
its root container is dead space (`buildSlots` in `dnd.ts`).

- The section's outermost slots extend to the section region's bounds: the first/last gap hitbox
  reaches the section edge, and the left/right padding maps to the root row's edge slots. A drop
  in the ring lands in the nearest edge slot instead of nowhere.
- Pins: red-first dnd tests — a point in the ring resolves to the edge slot, a point outside the
  section still resolves to nothing.

## Tier 2 — the arranging pair (one dnd change conceptually)

### U6 — distance-weighted slot resolution (M)

Current state: `resolve()` picks the highest priority class containing the pointer
(element 0 < column 1 < new-section 2), so a column band within its flat 24px `EDGE` beats every
nested gap regardless of distance.

- Priorities become a tiebreak instead of a veto: within the set of slots whose hitbox contains
  the pointer, the winner is the nearest slot centreline; the priority class only breaks ties
  within ~4px. Hysteresis (`held`) keeps its role unchanged.
- This is the risky edit of the round: every dnd behavior pin runs against it, and the existing
  suite (`dnd.test.ts`) is the contract — any currently-pinned resolution that changes must be
  argued in the diff, not silently re-pinned.

### U5 — wrap-beside at any depth (M)

Current state: dropping beside a nested leaf offers only above/below; side-by-side placement
exists at the section root only.

- A nested leaf in a column gains narrow left/right hitboxes (the same `EDGE` geometry columns
  use); resolving one wraps target and payload into a row via `rowGroup` (`@model/artifact`, the
  helper group-selection already uses) with even shares.
- Sealed and unit children are excluded (the seal wins); pins red-first: a beside-drop on a
  nested paragraph produces the row, on a bullets item does not.

## Tier 3 — power items, each independent

### U8 — marquee selection, desktop (S-M)

- Pointer-down on empty canvas (no target under `hitTest`, fine pointer only) starts a marquee
  rectangle drawn in the overlay; on release, elements whose region boxes intersect it become the
  multi-selection through the existing `selectMany`/extras machinery, movable-ancestor-resolved
  so a swept card selects as the card.
- Phones keep tap-only selection this round, recorded: a touch marquee fights scroll, and the
  right phone gesture (two-finger? long-press?) deserves its own decision.
- Pins: the box-intersection → selection-set resolution as a pure helper with tests; the gesture
  is manual QA.

### U9 — rotate is findable (S)

- The inspector's layout section, for any unpinned selectable element, shows the Rotate/Layer
  row disabled with the one-line affordance that pins in place and opens the pin controls (the
  `pinnedLayout` machinery already computes an in-place pin). No new capability, one discoverable
  path to an existing one.

### U10 — cut equals copy plus delete (S)

- `edit.cut` drops its `actionableSet()` gate and becomes literally copy + the child-aware
  `deleteSelectedElements()` — the same reach delete already has. The paste-outside-a-seal
  anchor stays as documented behavior (coherent, and the unit seal's spirit).
- Pins: cut on a sealed child leaves the container intact minus the child, clipboard carrying it.

## Order and gates

U10 → U9 → U3 → U4 → U1 → U8 → U6 → U5 (cheap and independent first; the two dnd-resolution
changes last, isolated, with the suite as their contract). Every phase through the full gate set:
typecheck, lint, full vitest, `check:elements`, suppressions; `eval:shots` once at the end (this
round never touches layout, so 592/592 must be untouched); red-first pins wherever behavior
changes and op-level purity tests for everything the Solid layer wires. Audit entries marked ✔
with dated notes as each lands.

## Not taken, and why

Phone marquee (gesture conflict, its own decision). Enter-split outside units (a quote's caption
splitting into two captions is defensible but unasked; the `unitItem` gate keeps the behavior
where the audit placed it). Paste-into-unit (the foreign-content seal stays; items are made by
splitting, not pasting). Reordering priorities beyond distance-weighting (a full scoring model is
over-design for the two named misfires).
