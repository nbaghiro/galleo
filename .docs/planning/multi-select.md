# Planning — multi-element selection

> Shift-click builds a set of selected elements on top of the existing single selection, unlocking
> group/ungroup, bulk delete/duplicate/copy, and set-scoped AI edits. The design keeps
> `selection: Target | null` untouched as the anchor and adds `extras: ElementAddress[]` beside it,
> so every existing consumer keeps working and multi-aware surfaces opt in. Multi-drag ships
> restricted to reordering co-parented siblings within their shared parent (approved decision).
>
> Status: designed and approved, ready to execute. Grounded in a full trace of the selection system;
> the load-bearing facts are restated inline with their citations.

Companion docs: `.docs/planning/interactivity.md` (the affordance and viewer-state machinery this
coexists with), `collab.md` (presence and the edit lease), `frontend.md` (the `@ui` rules for any
new chrome), `.docs/planning/engine-gaps.md` item 6 (free positioning, whose alignment tools this
is the prerequisite for).

## 1. What exists, verified

- Selection is one `Target | null` signal (`editor/core/store.ts:113`), compared by `targetsEqual`;
  **24 production call sites set it, all single-valued**. `hover` and `editing` are separate
  signals; `editing` is claimed-on-edit only.
- Hit-testing picks the single deepest region under the pointer (`specificity`,
  `model/artifact.ts:353`); Esc walks up via `parentTarget`; no canvas pointer handler reads
  `shiftKey` anywhere (`editor/Canvas.tsx:311-384`).
- No set-of-elements concept exists in the codebase. The only path-rebasing code is private and
  pairwise (`adjustAfterRemoval`/`adjustAfterInsert`, `editor/core/dnd.ts:525-543`).
- The collab edit lease is claimed on `startEditing`, **not** on selection
  (`editor/core/collab.ts:478-500`), so multi-select does not touch the lease mechanism at all.
  Presence carries a single `ElementRef` (`model/collab.ts:51-55`).
- The clipboard holds one element (`editor/core/clipboard.ts:8`). The chat focus reads selection at
  exactly one site (`deriveFocus`, `app/stores/chat.ts:153-160`).

## 2. Options considered

**Change `selection` to `Target[]` everywhere.** Honest cost: 24 producers and roughly 15 consumers
churn at once, and every consumer that genuinely needs one element (inspector, inline editing,
resize, comments, presence) grows a "first of" convention that is the anchor model anyway, just
implicit. Rejected.

**A set with no anchor.** The inspector, text editing, presence and the drag grip all need "the"
element; without an anchor each invents its own rule. Design tools keep an anchor for the same
reason. Rejected.

**Primary + extras (chosen).** `selection` keeps its exact meaning; `extras: ElementAddress[]`
rides beside it; derived `selectedAddresses()` is the normalized set (primary element first). Every
existing consumer works untouched; multi-aware consumers read the set.

## 3. The model

```ts
// editor/core/store.ts
export const [extras, setExtras] = createSignal<ElementAddress[]>([]);
export const selectedAddresses = (): ElementAddress[]  // primary (if element) + extras, in tree order
```

Invariants, enforced by one normalize step on every mutation:

- Elements only; a section primary clears extras.
- No element and its own ancestor in the set (adding an ancestor evicts its descendants).
- Nothing inside a `closed` container (the `movableAncestor` rule, applied at add time).
- No duplicates; `extras` never contains the primary.
- Any structural commit clears extras (v1: correctness over persistence; keeping the set alive
  through its own batch op's rebasing is the batch op's job, not the signal's).
- `editing()` may only ever address the primary; `startEditing` clears extras.

## 4. The gesture

- Desktop only in v1 (the phone path shares one handler gated by `already`; shift does not exist
  there). `onPointerUp` gains the event parameter and reads `shiftKey`.
- Shift-click on an element: toggle membership. First shift-click with an element primary seeds the
  set; shift-clicking the primary demotes it and promotes the first extra; shift-click never starts
  text editing.
- Plain click: collapse to single (today's behavior, byte-identical when no extras exist).
- Esc: clear extras first, then walk `parentTarget` as today.
- Shift-click on a section or empty backdrop: no-op for the set (plain-click semantics apply).
- A drag that starts from a non-member grip collapses extras first.
- One-click-to-edit coexists by scope, not by mode: shift-click inside the active text edit stays
  native selection extension (the overlay stops propagation before the canvas sees it); shift-click
  anywhere else commits the edit, the edited element becomes the anchor, and the click toggles its
  target. Shift-pointerdown is prevented so the browser cannot extend a text range from the overlay
  caret across painted spans, and the paint host is `select-none`: painted text was never a native
  selection surface, the overlay owns real text selection.
- Marquee/lasso selection is the natural second gesture; out of scope, recorded.

## 5. Consumers

**Untouched** (the anchor keeps working): inline text editing, ResizeHandles, RegionDividers,
comments (`commentTarget` stays single; the command disables at >1), presence (sends the primary;
no protocol bump), the edit lease (not selection-coupled at all), SectionActions, AI regenerate
(primary-only in v1).

**Opt in:**

- `Overlay` (`Selection.tsx:464-495`): `<For each={selectedRegions()}>` rings; the primary's ring
  keeps today's style, extras get a lighter variant.
- `ContextBar`: at >1, position on the union box and show only the shared actions (delete,
  duplicate, group); per-element actions (align, regenerate, resize-coupled) hide.
- `ElementInspector`: at >1, a minimal "N selected" panel (count, Group, Duplicate, Delete). Mixed-
  or same-type shared property editing is explicitly v2.
- Commands (`edit.delete`, `edit.duplicate`, `edit.copy`, `edit.cut`, `edit.paste`): iterate the
  set through the batch ops below; one undo entry per gesture (the ops compose into one commit).
- Clipboard: `clipboardEl` widens to `ElementInstance[]`; paste places the block sequentially at
  the target with incrementing index.
- Chat focus: `deriveFocus` carries the set (primary first) so a turn can say "these 3 elements".

## 6. Batch ops (`canvas/elements/ops.ts`)

The subtle part is index-path invalidation between steps. Two mechanisms, matched to the op:

- **`removeMany(art, addrs)`**: sort descending by `(section, path)` so no pending address shifts,
  remove each, then collapse each touched parent once (deepest first). Delete and cut build on it.
- **The generic pattern for anything else**: resolve through ids. `withElementIds` stamps the set,
  `elementIdMap` re-resolves addresses between steps. `duplicateMany` uses it; future batch ops
  inherit it instead of inventing per-op arithmetic.
- **`groupSelection(art, addrs, direction)`**, the marquee op: requires a shared parent, takes the
  members in tree order, removes them (descending), inserts a `container` with them as children at
  the first member's index, renormalizes row widths via the existing helpers. Ungroup already
  exists in spirit as the single-child collapse; a `container` primary at count 1 gets an explicit
  Ungroup action that splices its children back.

All pure, all tested at the ops layer, one `commit` per gesture.

## 7. Multi-drag: same-parent reorder only (approved)

The full N-source drag was the highest-risk surface (`DragPayload.from` is singular, threaded
through slot enumeration and `moveInto`'s pairwise rebase). Approved scope collapses it:

- The grip drags the set only when every member shares one parent (and section); otherwise it
  drags the grip's own element and extras collapse.
- `DragPayload` gains `{ kind: "moveMany"; parent: ElementAddress; indices: number[] }`.
- During a `moveMany` drag, only the shared parent's gap slots are enumerated (no section gaps, no
  column slots, no foreign containers). Gaps strictly inside the dragged block are no-ops.
- Drop mechanics are block arithmetic, not rebasing: remove the sources descending, shift the gap
  index down by the number of removed sources before it, insert the block in original relative
  order. `LiftVeil` dims every member.
- Cross-parent multi-move stays deferred; cut/paste already covers it functionally.

## 8. Analytics

New instrumentation, not migration (no selection events exist today): `elements_grouped { count }`,
and a `count` property added to the existing removal/duplicate events' batch forms per the
`model/analytics.ts` one-line-per-event convention. Ids and counts only, never content.

## 9. Not in v1, recorded

Mixed- and same-type shared property editing; cross-parent multi-drag; marquee selection; phone
multi-select (needs its own gesture, likely long-press); presence as an array (protocol bump);
select-all-in-section; alignment/distribution (blocked on engine-gaps item 6, unblocked by this).

## 10. Execution checklist

- [x] S1 Store: `extras`, `selectedAddresses`, the normalize step, clear-on-commit,
      clear-on-startEditing; `onPointerUp(e)` shift handling; Esc order; Overlay rings; LiftVeil.
- [x] S2 Ops: `removeMany`, `duplicateMany`, `groupSelection`, ungroup action; commands + clipboard
      widened; ContextBar shared-action mode with union-box positioning; the "N selected" panel.
- [x] S3 `moveMany` drag: payload, gating, parent-gap slots, block drop, veil.
- [x] S4 Chat focus carries the set; analytics events.
- [x] S5 Tests: ops (descending removal across shared parents, id-map duplication, group + width
      renormalize, block move arithmetic), store normalization invariants, commands batch behavior,
      dnd slot gating for `moveMany`; e2e: shift-click three elements, group, undo, ungroup.
- [x] S6 Gates: full suite + guards + build; `eval:shots` unchanged (nothing here touches layout).

Two departures from the plan as written, both recorded rather than decided away:

- There is no element-duplicate analytics event to add a `count` to, so section 8's batch form landed
  on `element_removed` (which delete and cut share) plus the new `elements_grouped`. A duplicate event
  is worth adding on its own terms, not as a side effect of this.
- `ChatFocus` carries the set (`elements`, anchor first) but `focusLine` in
  `services/core/ai/prompts/chat.ts` still describes the anchor alone, so a turn cannot yet say "these
  3 elements". Rendering it is a few lines in that one function.

Undo and redo also collapse the set, for the reason a structural commit does: a replayed batch moves
the same paths the original edit did.

## 11. Open decisions

None blocking. Two defaults stand unless overridden: shift-click on an already-primary element
demotes it (rather than no-op), and a structural commit clears the set (rather than chasing it
through rebases).
