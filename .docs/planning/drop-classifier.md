# Planning — the drop classifier: geometry decides, not a slot list

> Option B from the drop-vocabulary discussion: replace `computeDropSlots` + `activeSlot` with one
> pure geometric classifier, so that every point a pointer can reach _means something_ by
> construction, and the reachability gaps of the enumerated vocabulary (no stacking beside a row
> member, no wrap in a grid cell, exclusions stated as special cases) stop being possible. The
> Figma model adapted to Galleo's flow-first inversion, the same adaptation
> [`freeform-move.md`](freeform-move.md) made for the gesture layer.
> Status: built 2026-09-06, all four phases, pending the user's manual QA pass. Deviations from
> the plan as written, each argued below where it bit: (a) the classifier shares ONE generator
> with the retiring engine via an `at` gate rather than landing beside it — the letter of the
> two-engine overlap traded for a single source of truth, and the overlap then closed within the
> same run as promised; (b) the escalation clause needed two refinements the carries caught red:
> it fires only across perpendicular axes (a child whose own gap lines run in the sliver's
> direction keeps them — the distance-beats-class pin demanded this) and it arbitrates half a
> step deep so a grandchild's wrap strip still outranks it (the U5 beside-wrap pin demanded
> that); (c) wrap strips reach inward only, so the padding ring and the gutters keep their U4/
> band meanings; (d) grid-cell escalation is not taken (open cells keep deepest-wins; the
> inter-cell gap stays reachable); (e) the totality property held already at parity — U4's reach
> work had made cards total before this round. The zero-flip prediction held: every carried pin
> passes unedited. Candidate indicators retired on every path per the user's confirmation,
> recorded in `live-reflow.md` too.

Companion docs: [`live-reflow.md`](live-reflow.md) (the parting preview this classifier feeds),
[`interaction-round.md`](interaction-round.md) (U4/U5/U6, the rounds that built the enumeration
this replaces), [`freeform-move.md`](freeform-move.md) (the gesture layer and its reserved
modifier space), `engine-audit.md` (the U series), `.docs/rendering.md` (regions), `testing.md`
(the region-fixture contract the dnd suite uses).

## Why

The tree model is complete: `wrapWith` takes any path, `insertChild` renormalizes, `collapseSection`
keeps every result canonical. The drop vocabulary is not: it is an enumeration of slot families
added round by round (`sectionGapSlots`, `columnSlots`, `gapSlot`, `gridGapSlots`, `wrapSlots`,
`besideSlots`), and each family covers exactly the cases its round needed. The audit of what a
drag can reach today (2026-09-06 session discussion):

| structural move                                     | reachable          |
| --------------------------------------------------- | ------------------ |
| sibling insert in any open container's gap          | ✔                  |
| new root column                                     | ✔                  |
| wrap the section-root leaf (4 edges)                | ✔                  |
| wrap a nested col member into a row (beside it)     | ✔ (U5)             |
| wrap a nested row member into a col (stack on it)   | ✘                  |
| wrap a root row child into a col                    | ✘ (excluded in U5) |
| wrap a grid cell (caption under an image in a cell) | ✘                  |

Every ✘ is a layout the engine renders happily and the AI writes freely, unreachable by direct
manipulation. With live reflow shipped, the holes got _louder_: a spot that should part and does
not now reads as dead, where before it was one more unlit line.

The moment is right because the two brakes that kept enumeration safe are gone, removed by work
that was not aiming at this:

- **The slot list lost its consumer.** Candidate indicator lines are gone where parting runs
  (decided 2026-09-06, `DropIndicators.tsx:33`); only the _active_ claim is ever drawn. The full
  enumeration is now an intermediate representation nobody reads.
- **The suite pins the composition, not the enumeration.** `targetAt` in `dnd.test.ts:40` is
  already `(art, regions, point) → target` — the classifier's exact signature. Those pins carry
  as the new contract verbatim.
- **Live reflow consumes targets, not slots.** `previewFor` runs the drop's own op from a
  `DropTarget`; `compensatePoint` feeds a point into resolution. Both sit under either engine
  unchanged.

The engine needs nothing: regions already carry boxes, polygons and paint order. This is a
rewrite of one editor-core resolution function, not an engine change.

## The design

One pure function, in `editor/core/dnd.ts` with its kin:

```
classifyDrop(art, regions, payload, px, py, current) → { target, indicator } | null
```

No global enumeration. The classifier descends the branch under the pointer and scores the
handful of claims that neighborhood offers. Rules, in the order they are consulted:

1. **Sealed payloads first.** A `moveMany` block classifies only against its shared parent's
   gaps; a unit item only against its own unit's gaps; a section payload only against the stack
   gaps. Eligibility is an input, exactly as `computeDropSlots` branches today
   (`dnd.ts:629-643`).
2. **Descend to the deepest open container under the pointer.** Seals stop the descent (a
   diagram, a bullets unit, any closed facet is a leaf here); the dragged subtree is skipped
   (never target yourself or your interior). The descent path is the claim neighborhood.
3. **Inside a container, position classifies.** Along the container's axis, the nearest gap
   claims (tiles meet at child midpoints — today's `gapSlot` geometry, kept). Near a child's
   **perpendicular edge** (top/bottom of a row member or grid cell, left/right of a col member),
   the wrap claims: payload and child become a group on the cross axis. This single clause is
   `wrapSlots` + `besideSlots` + the three missing table rows, as one rule.
4. **Near an open container's own leading/trailing edge, escalate.** A thin interior band along
   the parent's axis belongs to the parent's adjacent gap, not the container's end gap —
   otherwise "drop just above this card group" is unreachable when the group sits flush.
   (Today's reach rects are the root-level special case of this; the rule generalizes them.)
5. **Depth-0 geometry keeps its meanings as claims, not priority classes.** Column boundary
   bands, new-section bands, the root leaf's four wrap edges, the empty root's replace region.
   Arbitration across all claims is the shipped U6 rule verbatim: nearest indicator wins; a band
   beats an element claim only within `TIE`; deepest wins among element claims; `HYST` keeps the
   current target sticky. No behavior change at any pinned point.
6. **Totality.** Every point inside a section card classifies to _something_ (a pin, below, not
   a hope); outside every card, `null`.

### The perpendicular rule, precisely (and the grid)

A child's edges split by role: the edges **along** the parent's axis belong to the parent's gaps
(they _are_ where gap tiles meet); the edges **across** it are the child's wrap claims. So:

- col member → left/right wrap into a row (today's `besideSlots`, unchanged)
- row member → top/bottom wrap into a col (**new** — the missing quarter)
- grid cell → top/bottom wrap into a col within the cell (**new**; placement is row-major, so a
  cell's left/right edges are gap territory and stay insert claims — which is also what keeps
  every existing grid pin green)
- root row children lose their U5 exclusion: their top/bottom edges wrap (stack under a column's
  image), while left/right remain the column bands by rule, not by exception

Side-by-side _within_ one grid cell (a parallel-edge wrap) is recorded not-taken: it shares
geometry with the insert gap to the pixel, and the two-step path (wrap below, then drag the
direction) stays available.

### Size-aware edge bands

The flat `EDGE = 24` becomes proportional so four claims on a chip cannot swallow its parent's
gaps:

```
band(extent) = clamp(extent * 0.15, 8, 24)   // px, per edge, along the measured extent
```

24px on anything ≥160px (today's feel, unchanged where today's pins live), shrinking to 8px on a
54px chip. Constants sit beside `HYST`/`TIE` and are tuned in manual QA, not argued in review.

### Hysteresis, ported not redesigned

The `current` argument keeps both of today's behaviors: the current target's claim scores with a
`-HYST` distance bonus (boundary crossings cost real travel), and a current claim whose geometry
the pointer just left holds while the pointer stays within `HYST` of it. Same constants, same
no-flap pins.

### What retires, what survives

- `computeDropSlots`, `activeSlot`, `DropSlot`, `priority`, and the `dragSlots` signal retire.
  `DragState` gains the active claim's `indicator`, so `DropIndicators` reads it directly.
- **Candidate indicators retire everywhere**, including the degraded no-parting paths (reduced
  motion, coarse pointers). Argued: the active line tracks the pointer continuously, which is the
  aiming channel every path shares; keeping a parallel enumeration engine alive to draw a lattice
  for the degraded minority is two sources of truth, the exact drift this plan exists to kill.
  The recorded fallback, should degraded-path QA miss the field: a sampling adapter that probes
  the classifier on a coarse lattice and dedupes indicators — derived, not parallel. This amends
  the hours-old "keep the field where parting cannot run" decision, and is flagged as an open
  question below rather than slipped through.
- `previewFor`, `compensatePoint`, `applyDrop`/`place`/`moveInto`, `movable`/`movableAncestor`/
  `unitItem`/`marqueeTargets`: untouched. The paste path (`place` via clipboard) untouched.

### The future hook, recorded

`classifyDrop` takes an options bag from day one with exactly one documented future key:
`ascend?: number`, lifting the resolved claim N container levels — the mid-drag modifier for
ancestor targeting whose gesture space `freeform-move.md` reserved. Not built this round.

### Performance

The classifier runs per pointer move: one descent (O(depth)) plus sibling scans along the path —
tens of comparisons against regions already in hand, strictly less work than the per-move
`activeSlot` scan over the full slot list it replaces, and three orders of magnitude under the
live-reflow round's measured full-section solve (median 0.06ms), which itself only runs per
slot _change_. No budget concern.

## Sketches (shape, not final code)

**The classifier's top shape:**

```ts
export function classifyDrop(
    art: ArtifactContent,
    regions: Region[],
    payload: DragPayload,
    px: number,
    py: number,
    current: DropTarget | null,
    opts?: { ascend?: number }, // reserved: freeform-move's ancestor modifier
): { target: DropTarget; indicator: SlotIndicator } | null {
    const scope = eligibility(art, payload); // rule 1: moveMany/unitItem/section fences
    const claims: Claim[] = [];
    if (scope.sections) claims.push(...sectionGapClaims(art, regions, payload, px, py));
    if (scope.tree) {
        const path = descend(art, regions, payload, px, py); // rule 2: deepest open container
        for (const level of path) {
            claims.push(...gapClaims(level, px, py)); // rule 3a: axis gaps, midpoint tiles
            claims.push(...wrapClaims(level, px, py)); // rule 3b: perpendicular edges
            claims.push(...escalationClaim(level, px, py)); // rule 4: edge band → parent gap
        }
        claims.push(...rootClaims(art, regions, payload, px, py)); // rule 5: columns, root wrap
    }
    return arbitrate(claims, px, py, current); // U6 verbatim: distance, TIE, depth, HYST
}
```

**The perpendicular wrap clause:**

```ts
// a child's cross-axis edges claim a wrap; its along-axis edges already belong to the gaps
function wrapClaims(level: Level, px: number, py: number): Claim[] {
    const out: Claim[] = [];
    for (const kid of level.flow) {
        if (level.sealed(kid) || level.inSource(kid)) continue;
        const b = kid.box;
        if (level.axis === "row") {
            const band = clamp(b.h * 0.15, 8, 24);
            if (py < b.y + band) out.push(wrap(kid.path, "col", true, hLineTop(b)));
            if (py > b.y + b.h - band) out.push(wrap(kid.path, "col", false, hLineBottom(b)));
        } else {
            const band = clamp(b.w * 0.15, 8, 24);
            if (px < b.x + band) out.push(wrap(kid.path, "row", true, vLineLeft(b)));
            if (px > b.x + b.w - band) out.push(wrap(kid.path, "row", false, vLineRight(b)));
        }
    }
    return out;
}
```

**The escalation clause:**

```ts
// just inside an open container's leading/trailing edge, the drop means "beside it in my
// parent", or the flush case is unreachable; the band is thin so the container's own end
// gap keeps the rest of its territory
function escalationClaim(level: Level, px: number, py: number): Claim[] {
    const parent = level.parent;
    if (!parent) return []; // the root's ring is the root's own gaps (U4), handled by reach
    const b = level.box;
    const band = clamp((parent.axis === "col" ? b.h : b.w) * 0.08, 6, 12);
    const lead = parent.axis === "col" ? py < b.y + band : px < b.x + band;
    const trail = parent.axis === "col" ? py > b.y + b.h - band : px > b.x + b.w - band;
    if (!lead && !trail) return [];
    return [parentGapClaim(parent, level.indexInParent + (trail ? 1 : 0))];
}
```

**Arbitration with hysteresis (U6 ported):**

```ts
function arbitrate(claims: Claim[], px: number, py: number, current: DropTarget | null) {
    const held = current && claims.find((c) => sameTarget(c.target, current));
    const score = (c: Claim) =>
        indicatorDistance(c.indicator, px, py) - (c === held ? HYST : 0);
    // element claims: deepest wins, distance breaks ties; band claims: nearest line;
    // a band takes the drop only within TIE of the best element claim — unchanged from activeSlot
    ...
}
```

**Canvas wiring, before → after** (`editor/Canvas.tsx:929-953`):

```ts
// before: enumerate once per gesture, resolve per move
createEffect(() => {
    const d = drag();
    if (!d) return setDragSlots([]);
    setDragSlots(computeDropSlots(editor.artifact, regions(), d.payload));
});
const retarget = () => {
    const [px, py] = compensatePoint(...point(...), part()?.shifts ?? []);
    const slot = activeSlot(dragSlots(), px, py, d.target);
    setDrag((d) => ({ ...d, target: slot?.target ?? null }));
};

// after: classify per move; no per-gesture state to enumerate or invalidate
const retarget = () => {
    const [px, py] = compensatePoint(...point(...), part()?.shifts ?? []);
    const hit = classifyDrop(editor.artifact, regions(), d.payload, px, py, d.target);
    setDrag((d) => ({ ...d, target: hit?.target ?? null, indicator: hit?.indicator ?? null }));
};
```

(The slot re-enumeration effect and its staleness concern disappear: a scroll or collab write
republishes regions and the next move classifies against them, with no cached list to go stale.)

**Pin migration, three examples:**

```ts
// 1. Carries verbatim — only the harness shim changes:
const targetAt = (art, regions, px, py, payload = NEW) =>
    classifyDrop(art, regions, payload, px, py, null)?.target ?? null;
it("a point near a column boundary → an op:column target", () =>
    expect(targetAt(rowArt(), rowRegions(), 200, 100)).toEqual({ op: "column", index: 1, ... }));

// 2. New behavior, red-first (no existing pin flips — the perpendicular rule was chosen so
//    every pinned point keeps its meaning; this point had a coarser meaning before):
it("a row member's top edge stacks the payload onto it", () =>
    // rowArt, member [0] box (20,20,170,160): y=25 is inside the 24px top band
    expect(targetAt(rowArt(), rowRegions(), 100, 25)).toMatchObject({
        op: "wrap", path: [0], direction: "col", before: true,
    }));

// 3. Enumeration-form test retires; its meaning re-pinned as probes:
// before: computeDropSlots(...).filter(op === "insert").map(index) === [2]
// after:
it("the gaps flanking the source classify to something else, never a no-op insert", () => {
    const moving = { kind: "move", from: { section: "s1", path: [0] } };
    const t = targetAt(rowArt(), rowRegions(), 105, 100, moving);
    expect(t && t.op === "insert" && t.index <= 1).toBe(false);
});
```

## Pin migration inventory

The suite holds 77 tests. Classified against the classifier:

- **Carry verbatim (≈40):** every `targetAt` pin — section gaps, column bands, nested gaps and
  midpoint tiling, padding ring, root-leaf wrap edges, U5 beside-wrap, distance-beats-class and
  its boundary tie, popup out-of-box children, pinned siblings, unit-item reorder probes, closed
  containers' probe pair, the hysteresis pin (reshimmed onto `classifyDrop`'s `current` arg).
  The harness shim is the only edit.
- **Untouched (≈24):** `applyDrop`/`moveInto` (8), `previewFor` (3), `compensatePoint` (5, one
  call reshimmed), `marqueeTargets` (4), `movable`/`movableAncestor`/`moveManyPayload` (4).
- **Reshape (≈13):** the enumeration-form tests (slot counting/filtering: windowed sections,
  move exclusions, section-drag gap sets, moveMany gap sets, unit seals, indicator geometry
  counts, the dead-zone loops). Each re-pins the same behavior as point probes; the dead-zone
  loops strengthen into the totality property (every 25px lattice point inside every fixture and
  corpus section classifies non-null; outside, null).
- **Flips: none.** The perpendicular-edge rule was chosen so no pinned point changes meaning; the
  new wrap bands live where no pin sits (element edge interiors). Any flip discovered during
  execution is argued individually in the diff, the U6 discipline — expected count zero.

## Options considered

- **Finish the patchwork (Option A):** add the three missing slot families. Rejected: extends
  the mechanism that produced the gap; the next layout idea starts unreachable again, and
  `elementSlots` grows its fourth and fifth exception clause.
- **Generate slots from a uniform rule, keep enumeration (Option C):** same completeness, less
  surgery. Rejected in favor of B once the consumer audit came back: nothing reads the slot list
  anymore except the candidate field this plan retires, so the enumeration layer would survive
  purely to feed `activeSlot` — an intermediate with one caller on each side.
- **Recompute against the previewed layout:** rejected in `live-reflow.md` and stays rejected;
  the classifier reads frozen regions through the same compensated point.
- **Grid parallel-edge wrap:** not taken (geometry collision with the insert gap, above).
- **The ancestor modifier:** recorded as `opts.ascend`, not built.

## Phases

Ordered so parity is proven before behavior grows, and behavior before wiring, each green through
the full gates.

**A — the classifier at parity (M).** `classifyDrop` lands beside the old engine; the entire
suite's `targetAt` shim moves onto it; the ~13 enumeration tests reshape into probes; the
totality property lands (fixtures + the corpus artifacts' region sets). No new reachability yet:
`wrapClaims` emits only what `wrapSlots`/`besideSlots` emit today, so every carry is exact.
Canvas still runs the old engine — two engines coexist, tests on the new one, product on the old,
flagged and temporary.

**B — completeness (S).** The perpendicular rule opens fully (row members, grid cells, root row
children), proportional bands replace flat `EDGE`, the escalation clause lands. Red-first pins
for each new reachability row and for the band clamp at both ends; the U5 unit-seal probes
re-verified against the wider rule.

**C — wiring and retirement (S).** Canvas's enumerate-effect and `activeSlot` call replaced by
per-move classification; `DragState.indicator`; `DropIndicators` reads it and the candidate
field retires everywhere; `computeDropSlots`, `activeSlot`, `DropSlot`, `dragSlots` deleted.
The live-reflow no-flap pin re-run against the classifier (same constants, must hold).

**D — feel and ledger (XS).** Band constants tuned in manual QA; `engine-audit.md` U-entries and
the reachability table here updated with dated notes; this doc marked built with deviations.

Gates per phase: `tsc` clean, lint, full vitest, `check:elements`, `check:suppressions`,
`check:copy`, and `eval:shots` exactly unchanged at 592 — this round never touches the engine or
any paint path, so any corpus movement is a bug. Pointer feel is manual QA at the end, per the
established deviation.

## Not taken, and why

- **Candidate lattices on any path** — retired with the classifier (argued above; fallback
  recorded).
- **Wrap on sealed children** — the seal wins, unchanged; a bullet item still reorders only
  within its unit.
- **Section-drag classification beyond stack gaps** — sections keep their band model; element
  parting earned its generality, section reflow has not (live-reflow's own not-taken).
- **Ancestor modifier, parallel-edge grid wrap** — recorded above.

## Open questions for the approver

- Retiring the candidate field on the degraded (reduced-motion / coarse-pointer) paths amends the
  decision made earlier today, which kept it there. Recommended: retire everywhere, one source of
  truth; the sampling adapter is the recorded fallback if degraded-path QA misses it.
- The proportional band constants (0.15 · clamp 8..24; escalation 0.08 · clamp 6..12) are
  starting values to tune in manual QA.
- Phase A's two-engine overlap lasts until C in the same round; if the round must split across
  sessions, C should not be deferred past a commit boundary. (Resolved in execution: one shared
  generator, and C landed in the same run.)
