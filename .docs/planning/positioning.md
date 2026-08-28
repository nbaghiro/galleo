# Planning — free positioning: pin, offset, rotate

> The executable design for item 6 of [`engine-gaps.md`](engine-gaps.md): any element can leave
> its parent's flow and sit pinned to the parent container's box — anchored, offset, layered, and
> optionally rotated — while everything around it keeps flowing. The engine's `float` primitive
> already does the mechanics; this round gives it a data-model face, a paint story for rotation,
> and the editor gestures. Deliberately a constrained affordance (within the parent's box), never
> a second layout system: that constraint is what keeps format translation, autofit and generation
> intact.
>
> Status: executed 2026-08-28, all three phases, then hardened by a four-angle review. Deviations
> and review fixes: docked chrome gained an explicit `EngineNode.docked` marker (the float-shape
> sniff could not tell a topbar from a top-left pin, and the all-pinned height guard must skip
> hoisted chrome); the editor's `hitTest` went shape-aware so a rotated element hits on its turned
> polygon; `fragment` shifts a rotated command's pivot with its page; the ancestor clip stays
> stage-aligned under rotation in every backend that can express it (DOM counter-turns it into
> local space, PDF clips before the matrix, PPTX rides the crop with the shape); pinning gates on
> `movable` like every structural op; and drop-slot geometry is built from flow children only, with
> real array indices.

Companion docs: `engine-gaps.md` (item 6, including the "cuts against a stated design bet" risk),
`rendering.md`, `typography.md` (the round pattern this follows), `collab.md` (why nothing on the
wire is a pixel).

## The bet, restated

Auto-layout is why one artifact renders as deck, doc and site, why autofit works, and why the AI
can compose. Free positioning as commonly built (absolute x/y on a canvas) breaks all three. The
resolution: **pins are anchor-relative, not canvas-absolute.** An element pins to one of nine
anchors of its parent's box (start/center/end × start/center/end) plus a pixel offset. Reflow,
format switches and autofit move the box; the pin rides along. The editor writes anchors, never
absolute stage coordinates, by re-expressing every drag against the nearest anchor on release.

## Data model — one field on `ElementLayout`

```ts
// model/geometry.ts
pin?: {
    x: Align;        // parent-box anchor, horizontal (start | center | end)
    y: Align;
    dx?: number;     // px from the anchor, at compose scale (ramp × fitScale apply)
    dy?: number;
    z?: number;      // sibling paint order; negative paints under the flow (decoration)
    rotate?: number; // degrees clockwise about the element's own center
};
```

Why `ElementLayout` and not container data or a new element: positioning is a property of how a
child sits in its parent — exactly what `ElementLayout` is for (`width/height/align/radius/dock`
all live here), it works uniformly for every element type inside every container (the unified
`container` element, section roots, and owning composites), and it survives the element being
retyped. `dock` stays separate: it carries hoist-to-section semantics `pin` must not inherit.

## Engine — mapping, not mechanism

- `applyLayout` (`canvas/elements/compose.ts`, beside the existing `dock` mapping): `layout.pin`
  → `node.float = { x, y, dx, dy, z }` and `node.rotate = pin.rotate`. The float primitive
  already handles sizing (`crossWidth`), out-of-flow height, z-ordered paint, and negative-z
  decoration; `scaleTokens` already multiplies `dx/dy` by the compose scale, so offsets track the
  width ramp and autofit with zero new code.
- `EngineNode.rotate?: number`; `emit` carries it onto every command of the pinned subtree as
  `rotate?: { deg; cx; cy }` with the shared center = the pinned node's box center, inherited the
  way `opacity`/`link` are. Regions for a rotated node gain the polygon of the rotated rect
  (item 16's machinery), so hit-testing is exact while selection chrome keeps the bounding box.
- Containers whose children are all pinned keep a minimum slot height (the empty-region 90px) in
  the container's arrange, so a section can't collapse under its own decoration.
- Fit participation: none — a pinned element never grows its parent (the float rule). This is the
  documented answer to engine-gaps' open question; the min-height guard covers the degenerate
  case.

## Paint — rotation per backend

| backend         | fidelity                                                                                                                                                                                              |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DOM             | exact: per-command `transform: rotate()` with the shared-center origin                                                                                                                                |
| 2D canvas / PNG | exact: translate–rotate–draw about the shared center                                                                                                                                                  |
| PDF             | exact: a `cm` rotation matrix around the shared center per command                                                                                                                                    |
| PPTX            | approximate: pptxgen's per-shape `rotate` spins each shape about its own center — right for single-command elements (text, image, fill), drifts for multi-command composites; accepted and documented |

Rotation is bounded chrome, not layout: rotated content does not re-wrap (the box is laid out
unrotated, then painted rotated), which is also what Keynote does.

## Editor — the gestures (the L half)

- **Pinning**: a "Pin" toggle in the inspector's layout group. Pinning re-expresses the element's
  current painted position as the nearest anchor + offset, so nothing jumps. Unpinning returns it
  to the end of the parent's flow.
- **Moving**: a pinned element drags freely with the pointer (live `dx/dy`, coalesced undo, commit
  on release). On release the position re-anchors to the nearest of the nine anchors; during the
  drag the nine anchor points highlight within a 6px snap.
- **Layering**: forward/backward in the inspector and context menu (`z` ± 1); "behind content"
  = negative z.
- **Rotating**: an inspector slider (free degrees, 0 default). A grab-handle rotation gesture is
  deferred; the slider ships the capability without the gesture complexity.
- **Drag layer**: a pinned element never enters `computeDropSlots` — its drag is a move within its
  parent, not a re-slot (the multi-select precedent: same-parent only). Moving it to another
  parent = unpin, drag normally, re-pin.
- **Selection**: outline and handles use the axis-aligned bounding box; hit-testing uses the
  rotated polygon.

## The seams outside the engine

- `services/core/ai/schema.ts`: `zElementLayout` gains the full `pin` shape — **mandatory**, since
  the plain object strips unknown keys and an AI edit round-tripping a pinned element must not
  silently unpin it.
- Catalog: one constrained field description (badges, stickers, image-corner labels; "use rarely,
  content stays in flow") — the capability is taught narrowly, not promoted.
- `model/analytics.ts`: `element_pinned: { element_type: string }`, captured at the inspector
  writer seam beside `text_clamped`.
- Collab/comments: nothing to do — pins are content-relative data like any layout field; presence
  stays box-fractional and re-resolves.
- Migrations: none. `pin` is absent-by-default; the artifact guard accepts unknown layout fields
  and the loose write paths carry them.

## What this unlocks

Overlapping composition (a card offset over a photo, a caption breaking a frame), badges and
"NEW" stickers, annotation pins and callout markers, rotated accents and ribbons, decorative
layering behind content (negative z) — the whole "just let me nudge it" class, without giving up
the reflow story: a badge pinned end/start on a photo is still in that corner when the deck
becomes a site.

## Phases

- **P1 — model + engine (S)**: `pin` on `ElementLayout`; `applyLayout` mapping; `rotate` through
  `emit`; polygon regions for rotated nodes; the all-pinned min-height guard; engine tests
  (anchor math, z paint order, region polygon, guard). Corpus: unchanged, asserted.
- **P2 — backends (S–M)**: rotation in DOM/canvas/PDF exactly, PPTX per-shape; export tests.
- **P3 — editor (M–L)**: inspector Pin/z/rotate controls; the pinned-drag gesture with anchor
  snapping (the re-anchoring math is a pure, unit-tested function); drag-layer exclusion; schema +
  catalog + analytics. E2E: pin, drag to a corner, format-switch, still in the corner.

## Out of scope, crisply

Free canvas (no parent), rotation gesture handles, cross-parent pinned drag, smart alignment
guides against sibling boxes (item 7's machinery), pinned elements in generation exemplars, and
any change to `dock`.
