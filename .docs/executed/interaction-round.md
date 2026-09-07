# Editor interactions: unit keys, insertion, marquee, cut, rotate

> The interaction affordances from the U series of
> [`engine-audit.md`](../planning/engine-audit.md) that live outside drag geometry: list items
> split and merge from the keyboard, the palette inserts on click as well as drag, empty canvas
> sweeps a marquee, cut reaches everything delete reaches, and rotate is findable from the
> inspector. The round's drop-geometry items were later superseded by the controlled-canvas drag
> model — "Model 1: the constrained slide" in `editor/core/dnd.ts`, designed in
> [`dnd-ux.md`](../planning/dnd-ux.md) — which now owns all slot and drop resolution.

## Enter splits, Backspace merges, inside a unit

The gate is the seal machinery: `unitItem(art, addr)` (`editor/core/dnd.ts`) answers "this element
is an item of an open unit". When it does and the edited element is a plain rich-text child, Enter
splits and Backspace-at-start merges; everywhere else the keys behave as before (Enter commits, or
a `<br>` for multiline plain labels).

The ops are pure and live with their kin in `canvas/elements/ops.ts`: `splitUnitItem(art, addr,
offset)` truncates the item's text and marks at the caret (the `spliceText` machinery) and inserts
a sibling carrying the remainder and the item's own shape (marker style rides the data copy);
`mergeUnitItem(art, addr)` appends the item's text to the previous sibling, removes it, and
answers the join offset (a merge at index 0 no-ops). Marks rebase through the same helpers the
editor already uses. `editor/panels/TextEditor.tsx` commits the split or merge and hands editing
to the new address at the right caret through the same remount path AI edits use.

Op-level tests sit beside the other ops tests (split at start/middle/end, merge at index 0
no-ops, marks survive the seam); the key wiring is covered by manual QA, since the repo has no
Solid render harness.

## One insert gesture set

A click on a palette tile inserts the element at the selection — inside a selected open container,
else beside the selected element via the paste-anchor rule, else at the active section's end —
through the same `noteElementAdded(type, "palette")` seam drops use (`editor/panels/Insert.tsx`,
`editor/core/commands.ts`). Drag keeps working unchanged; the click path fires only below the drag
threshold, the same slop test the canvas uses for taps.

The quick picker builds from `listElements().filter(s => !s.hidden)` with the `@ui/fuzzy` search
the palette itself uses — one registry, three surfaces. The pin here is structural rather than a
test: there is no hardcoded type list left to drift, the list _is_ the registry minus hidden
entries, and `check:elements` audits the registry itself.

## Marquee selection, desktop

Pointer-down on empty canvas (no target under `hitTest`, fine pointer only) sweeps a marquee
rectangle drawn in the overlay (`editor/Canvas.tsx`); on release, `marqueeTargets`
(`editor/core/dnd.ts`) resolves everything the rectangle crosses into the multi-selection through
the existing `selectMany`/extras machinery, movable-ancestor-resolved so a swept card selects as
the card. The box-intersection resolution is a pure helper with tests; the gesture itself is
manual QA.

Phones keep tap-only selection: a touch marquee fights scroll, and the right phone gesture
deserves its own decision (see Not taken).

## Cut equals copy plus delete

`edit.cut` (`editor/core/commands.ts`) is literally `copyToClipboard` plus the child-aware
`deleteSelectedElements()` — the same reach delete has, with the old `actionableSet()` gate
dropped. Cut on a sealed child leaves the container intact minus the child, with the clipboard
carrying it. The paste-outside-a-seal anchor stays as documented behavior (coherent, and the unit
seal's spirit).

## Rotate is findable

For any unpinned selectable element, the inspector's layout section shows the Rotate/Layer row
disabled with the one-line affordance "Rotate, layer and offset unlock when the element is pinned.
Pin it now." (`editor/panels/RightPanel.tsx`), which pins in place and opens the pin controls (the
`pinnedLayout` machinery computes an in-place pin). No new capability, one discoverable path to an
existing one.

## Drop geometry lives elsewhere

The round also reshaped drop resolution (padding-ring slots, wrap-beside at any depth,
distance-weighted slot resolution). That geometry no longer exists: drop and slot behavior is the
controlled-canvas drag model in `editor/core/dnd.ts`, and its design record is
[`dnd-ux.md`](../planning/dnd-ux.md).

## Not taken, and why

Phone marquee (gesture conflict with scroll; the right gesture is its own decision). Enter-split
outside units (a quote's caption splitting into two captions is defensible but unasked; the
`unitItem` gate keeps the behavior where the audit placed it). Paste-into-unit (the
foreign-content seal stays; items are made by splitting, not pasting).
