# Freeform move: every body is a handle

> Direct manipulation as it runs: drag any element by its body, with the flow deciding what the
> drag means and one key changing that meaning mid-flight. Completes the positioning round by
> closing the gap between "pins exist" and "moving things feels like a design tool". This gesture
> layer survived the drag-and-drop rewrite onto the controlled-canvas slide model
> (`editor/core/dnd.ts`); the entry points and handoffs below are the current wiring.

## The model, stolen honestly

Figma is absolute-first with opt-in flow (auto-layout); Galleo is flow-first with opt-in pins.
Figma's junction rule translates cleanly across the inversion:

- **Dragging inside a layout reorders it.** Figma shows insertion gaps; Galleo has the full
  drop-slot machinery, reachable from the body as well as the grip.
- **One key mid-drag switches to free placement.** Figma uses Space held during an auto-layout
  drag to ignore the layout. Galleo maps Space to the pin system: the element pins where the
  pointer is, and the drag continues as a pin move.
- **A click is never a move.** Every tool guards direct manipulation behind a drag threshold; the
  body path shares one, so click-to-select and click-to-edit are untouched.
- **Alt-drag stays reserved for duplicate.** The deepest cross-tool muscle memory; not used here
  (no `altKey` handler exists in the editor), so it stays available for a future duplicate-drag.

The body press claims the element; a press on empty ground belongs to the marquee (see
`multi-select.md`).

## The one rule

**Pointer down on an element arms a move; crossing the drag threshold starts it; what it does
depends on whether the grabbed element is in the flow.**

| grab                                     | drag becomes                                    | chrome                 | release                    |
| ---------------------------------------- | ----------------------------------------------- | ---------------------- | -------------------------- |
| flow element                             | reorder (`startDrag`, the slide model's slots)  | slot indicators        | the existing drop          |
| pinned element (or any child inside one) | pin move on the nearest pinned self-or-ancestor | nine anchor dots, snap | re-anchor + one commit     |
| either, then **Space** pressed mid-drag  | converts to the other mode in place             | swaps accordingly      | commits in the ending mode |

The threshold is `BODY_DRAG_THRESHOLD = 5` px of travel, armed in `editor/Canvas.tsx`'s
`onPointerMove`; below it, clicks stay clicks. Past it, `beginElementMove` (exported from
`editor/panels/Selection.tsx`) is the one entry for every element move, from the grip or the body:
a pinned self-or-ancestor (`pinnedAncestor`, `editor/core/pin.ts`) routes to the private
`beginPinMove`; anything else resolves its payload through `movePayloadFor`
(`editor/core/dnd.ts`) and enters `startDrag`.

- **Flow → Space** (`editor/Canvas.tsx`, the drag's `keydown` handler): a single-element `move`
  payload whose source is `pinnable` pins into its **own parent** (pins are within-parent by
  design), at the painted spot under the pointer via `nearestPinPlacement` + `pinnedLayout`. The
  pin commits (`element_pinned` with `via: "drag"`), and after a double `requestAnimationFrame` —
  so the committed pin's regions are painted — `beginElementMove` re-enters and continues as a pin
  move. Releasing commits the re-anchor; Escape cancels everything. A `moveMany` block does not
  convert.
- **Pinned → Space** (`beginPinMove`'s `keydown` handler in `Selection.tsx`): the pin move
  cancels, `togglePin(address, "drag")` commits the unpin, and the drag hands off to `startDrag`
  with the element's move payload. The element returns to the flow at its own index live — a
  visible reflow — and the slot drag continues from there, rather than the element being suspended
  under the pointer; the eventual drop is its own commit. This makes drag the conversion gesture
  in both directions, with the panel toggle, the bar, and the palette command remaining the click
  paths.
- A pin move also offers the way back without Space: while dragging, a flow gap line within
  `REFLOW_REACH` (16 px, via `slideAt`) lights up, and releasing on it runs `reflowPin` — unpin
  plus insert in one commit, with `element_unpinned` via `"drag"`.

## Resolution details (the decisions inside the rule)

- **Which element moves.** The body hit resolves through the paint-order tie-break and polygon
  regions, then to the nearest pinned self-or-ancestor for pin drags, or through
  `movePayloadFor`'s precedence for flow drags: a multi-selection the grab belongs to drags as its
  block, then a unit item reorders within its unit, then the movable ancestor drags alone —
  exactly the grip's rule. Dragging the caption inside the polaroid moves the polaroid; a child of
  a pinned group has no free position of its own.
- **Multi-select.** If the grabbed element is part of the selected set, the flow path uses
  `moveManyPayload` (the block rule; see `multi-select.md`). Pin drags move only the grabbed
  element: `beginPinMove` clears extras.
- **Desktop is immediate; touch is select-first.** A coarse pointer must not fight scrolling, so
  on phones the body drags only an already-selected element — the same two-tap policy phone text
  editing uses. Space conversion is desktop-only; phones convert via the bar toggle
  (`togglePin(addr, "bar")` in `editor/panels/ControlBars.tsx`).
- **While editing, nothing changes**: the contenteditable overlay isolates its pointer events, and
  the canvas move handler returns early during `editing()`/`liveEdit()`.
- **Affordance clicks** (popup toggles, disclosure) stay clicks: they resolve on pointer up, under
  the threshold.

## Chrome and discoverability

- Cursor: `grab` over any element whose pinned self-or-ancestor would take the drag (the canvas
  hover handler in `Canvas.tsx`); the grips carry `cursor-grab`/`active:cursor-grabbing`.
- The drag chip carries the mode hint: "Space places it freely" floats beside a flow drag whose
  payload is a pinnable single-element move (`pinHint` in `editor/panels/Insert.tsx`). That one
  line is how the conversion is discovered without a tutorial. The pin-move side has no text hint;
  its discovery affordance is the gap line that lights up within reach, offering the way back into
  the flow directly.
- Analytics: `element_pinned` and `element_unpinned` (`model/analytics.ts`) both carry
  `via: "panel" | "bar" | "palette" | "drag"`. The click paths capture at the `togglePin` seam
  (`editor/core/pin.ts`); the drag paths capture at their own seams — the flow→pin conversion in
  `Canvas.tsx` and the gap-line release in `Selection.tsx` — per the instrument-the-seam rule.

## Tests

Unit tests cover the resolvers — `pinnedAncestor` and the pin math
(`editor/core/__tests__/pin.test.ts`), the payload precedence (`movePayloadFor`/`moveManyPayload` in `editor/core/__tests__/dnd.test.ts`), and the
palette and nudge commands — while the pointer wiring itself is manual-QA territory, since the
test runner cannot import Solid components. The browser suite (`e2e/editor/dnd.spec.ts`) drives
the drag machinery but no spec exercises the Space conversion.

## Not taken

Alt-drag duplicate (reserved, still unclaimed), smart alignment guides against siblings,
long-press touch conversion, and dragging a pin across parents (unpin → flow drag → repin covers
it). The grip remains unchanged — the affordance you can always find.
