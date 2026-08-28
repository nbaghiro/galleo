# Planning — freeform move: every body is a handle

> The executable design for direct manipulation: drag any element by its body, with the flow
> deciding what the drag means and one key changing that meaning mid-flight. Completes the
> positioning round ([`positioning.md`](positioning.md)) by closing the gap between "pins exist"
> and "moving things feels like a design tool". Status: executed 2026-08-28, all four phases.
> Deviations, honestly: the Space handoff out of a pin move returns the element to the flow at its
> own index live (a visible reflow, then the slot drag continues), rather than suspending it under
> the pointer; unit tests cover the resolvers (`pinnedAncestor`, block payloads, the palette and
> nudge commands) while the pointer wiring itself is manual-QA territory, since the test runner
> cannot import Solid components; and the e2e spec is deferred to the next CI round with the rest
> of the positioning coverage.

## The model, stolen honestly

Figma is absolute-first with opt-in flow (auto-layout); Galleo is flow-first with opt-in pins.
Figma's junction rule translates cleanly across the inversion:

- **Dragging inside a layout reorders it.** Figma shows insertion gaps; Galleo already has the
  full drop-slot machinery — it is just only reachable from the grip today.
- **One key mid-drag switches to free placement.** Figma uses Space held during an auto-layout
  drag to ignore the layout. Galleo maps Space to the pin system: the element pins where the
  pointer is, and the drag continues as a pin move.
- **A click is never a move.** Every tool guards direct manipulation behind a drag threshold, and
  Galleo's grip gesture already has one; the body path reuses it, so click-to-select and
  click-to-edit are untouched.
- **Alt-drag stays reserved for duplicate.** The deepest cross-tool muscle memory; not used here,
  so it stays available for a future duplicate-drag.

Body drags are currently inert (no marquee exists; moves start only from the grip), so the
gesture space is free and nothing regresses by claiming it.

## The one rule

**Pointer down on an element arms a move; crossing the drag threshold starts it; what it does
depends on whether the grabbed element is in the flow.**

| grab                                     | drag becomes                                                  | chrome                 | release                    |
| ---------------------------------------- | ------------------------------------------------------------- | ---------------------- | -------------------------- |
| flow element                             | reorder (the grip's `startDrag`, drop slots, insertion lines) | slot indicators        | the existing drop          |
| pinned element (or any child inside one) | pin move on the nearest pinned self-or-ancestor               | nine anchor dots, snap | re-anchor + one commit     |
| either, then **Space** pressed mid-drag  | converts to the other mode in place                           | swaps accordingly      | commits in the ending mode |

- Flow → Space: the element pins into its **own parent** (pins are within-parent by design), at
  the painted spot under the pointer via `pinnedLayout`, width normalized, and the gesture hands
  off to the pin move. Releasing commits the pin; Escape cancels everything.
- Pinned → Space: the pin is provisionally dropped, the drag hands off to `startDrag` with the
  element's move payload, drop slots appear, and releasing on a slot commits unpin + insert in
  one history entry. This makes drag the conversion gesture in both directions, with the toggle,
  bar, and palette remaining the click paths.
- Space is unused mid-drag today (it is not the pan key here), and `keydown` listeners already
  wrap both gestures' lifecycles.

## Resolution details (the decisions inside the rule)

- **Which element moves.** The body hit resolves through the paint-order tie-break and polygon
  regions (both shipped), then walks to `movableAncestor` for flow drags — exactly the grip's
  rule — or to the nearest pinned self-or-ancestor for pin drags. Dragging the caption inside
  the polaroid moves the polaroid; a child of a pinned group has no free position of its own.
- **Multi-select.** If the grabbed element is part of the selected set, the flow path uses
  `moveManyPayload` (the grip's block rule). Pin drags move only the grabbed element and clear
  extras, matching the grip today.
- **Desktop is immediate; touch is select-first.** A coarse pointer must not fight scrolling, so
  on phones the body drags only an already-selected element — the same two-tap policy phone text
  editing uses. Space conversion is desktop-only; phones convert via the bar toggle.
- **While editing, nothing changes**: the contenteditable overlay isolates its pointer events.
- **Affordance clicks** (popup toggles, disclosure) stay clicks: they resolve on pointer up,
  under the threshold.

## Chrome and discoverability

- Cursor: `grab` over a pinned body, `grabbing` during any body move.
- The drag label chip (the dnd payload label) gains a mode hint: "Space to place freely" during
  a flow drag, "Space to return to the flow" during a pin drag. That one line is how the
  conversion is discovered without a tutorial.
- Analytics: `element_pinned` gains `via: "panel" | "bar" | "palette" | "drag"`, and a new
  `element_unpinned` with the same shape; both captured at the `togglePin`/handoff seams, per the
  instrument-the-seam rule.

## Phases

- **A — universal body drag, flow (S).** `Canvas.tsx` pointer-down arms a threshold on element
  hits and calls the grip's begin logic (extracted from `DragHandle` so there is exactly one
  implementation). Guards: editing, affordances, phone policy, collab presence untouched.
- **B — body drag, pinned (S).** The same arming path routes to `beginPinMove` (exported from
  `Selection.tsx`), which already owns preview, dots, snap, cancel.
- **C — Space conversion, both directions (M).** A handoff seam in each gesture: flow → pin uses
  `pinnedLayout` at the pointer and swaps listeners; pin → flow tears down the preview and enters
  `startDrag`. The unpin+insert release composes both ops into one commit.
- **D — polish (S).** Cursors, the hint chip, analytics, `.docs/rendering.md` +
  `positioning.md` notes, the amended invariant comment in `Canvas.tsx`, e2e: drag a flow card,
  Space, place, undo once, redo, format-switch.

## Out of scope, crisply

Alt-drag duplicate (reserved, separate round), smart alignment guides against siblings (item 7),
long-press touch conversion, dragging a pin across parents (unpin → flow drag → repin covers it),
and any change to how the grip works — it remains, as the affordance you can always find.
