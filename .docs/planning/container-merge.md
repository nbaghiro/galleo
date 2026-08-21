# Planning — one flexible container

> Merge `group` and `card` into a single `container` element, make the tier field mean what it says,
> teach the drag layer to treat a composed element as one piece, and widen the authoring DSL to say
> what the engine can already do. Includes the migration for stored artifacts.
>
> **Built and migrated.** Kept here as the record of why; the current-state description belongs in
> `rendering.md` when that doc is next revised. Remaining work is listed under Still open at the end.

## Why

Four separate problems that share one cause: `container` on an element spec means two different
things, and nothing distinguishes them.

1. `arrangeCard` is `arrangeGroup` plus a `fill`. Two element types for one behaviour and a flag.
2. `bullets`, `quote`, and `stat` use the container facet to organise their own children out of base
   elements, but they are not `closed`, so `elementSlots` emits drop slots inside them. **You can
   drop a chart into a bullets list today.** That is the bug this whole plan starts from.
3. The DSL exposes about a fifth of the engine. `split` is hardcoded to two children, `row` cannot
   weight anything, `card()` takes children and nothing else, and width is expressed three
   incompatible ways.
4. `tier` already separates the two meanings correctly on all 64 elements (`container` for group and
   card, `smart` for everything else) and **is never read anywhere in the codebase.**

## What the tiers become

`ElementTier` is `primitive | smart | container | interactive`. Rename `smart`.

| option      | for                                                                                         | against                                                                              |
| ----------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| **`unit`**  | names the behavioural contract we want, "moves as one unit", which is exactly the drag rule | slightly abstract on its own                                                         |
| `compound`  | accurate, unambiguous                                                                       | longer, more formal                                                                  |
| `composite` | familiar                                                                                    | **collides** with `category: "composite"`, which already means a specific 7 elements |
| `block`     | common                                                                                      | the content tree is already made of "blocks"                                         |

Recommendation: **`unit`**. Final tiers: `primitive | unit | container | interactive`.

## The container element

```
container { children, direction, align, gap?, pad?, surface? }
surface?  { style: "filled" | "outline" | "accent", bg?, shape?, radius? }
```

No `surface` behaves exactly as `group` does now; with one, exactly as `card`. Card's existing
`direction` control carries over, so nothing is lost. `tier: "container"`, and it stays out of the
palette: the only way one reaches the canvas is a preset or a layout action.

Not `Row`/`Col`/`Box` as separate types, for three reasons. `arrangeGroup` already collapses a row to
a column below `splitMinWidth` (520 deck, 560 doc, 720 web), so a `Row` type would misdescribe what
renders. `Box` is `container` with a surface, which is the same mistake as `card`. And most
concretely: `ElementInstance.id` is _"stable identity for anything pointing at this node from
outside the tree (a comment anchor)"_, and `comments.anchor` is `{kind, elementId}`. If flipping
direction changed the element's `type` it would become a node replacement, which risks orphaning
every comment on it plus the collab edit lease. As a prop it is a data patch and identity survives.

The one type that might still earn its own element is a real **grid**, where children are addressed
in two dimensions rather than as a list. That is a different data shape, not a different direction,
which is the same reason `table` stays separate. Out of scope here.

## The authoring DSL

Today four helpers emit two types:

```ts
group(...kids)     → { type: "group", data: { children } }        // implicit col
row(...kids)       → rowGroup(kids)                               // → "group"
split(pct, l, r)   → rowGroup([l, r], [pct/100, 1 - pct/100])     // → "group"
card(...kids)      → { type: "card",  data: { children } }
```

Usage across the 30 templates: **321 `group(`, 110 `split(`, 82 `row(`, 75 `card(`**, just under
600 call sites. That is why the DSL is the migration lever and the templates are not touched.

### Phase A, minimal: four `type` strings

`rowGroup` and `colGroup` in `model/artifact.ts` and the two helpers in `model/authoring.ts` emit
`"container"`. Every template and corpus artifact follows with no edit to their text.

### Phase B, the wider refactor

Put layout on the child, because that is where the data already lives (`layout.width.pct`, written
by `withWidth`):

```ts
row(w(60, left), w(40, right)); // weighted, any number of columns
row(a, b, c); // even
row(w(50, a), b, c); // a takes half, b and c share the rest
```

This makes `split` unnecessary: `split(60, l, r)` is `row(w(60, l), w(40, r))`, and unlike `split`
it generalises past two children. Child modifiers mirror `ElementLayout` one for one: `w(pct)`,
`fill`, `fitW`, `top`/`middle`/`bottom` for `align`, `rounded(r)`.

Two explicit directions with an optional leading options object, detected by the absence of `type`:

```ts
col(...kids);
row(...kids);
col({ gap: 8, pad: 20, surface: "outline" }, ...kids);
```

`surface` as an option rather than a wrapper, so `boxed(col(...))` does not produce two nested
containers where one would do.

Old names stay as aliases (`group → col`, `card → col({surface:"filled"})`), so no call site changes.

Open: whether `w()` normalises. `row(w(60,a), w(60,b))` sums to 120 and `distribute` resolves it
silently. Prefer a guard script over author-time normalisation, since templates are in the repo and
the AI writes into this vocabulary too.

## Drag and drop

**Droppability reads the wrong field.** `dnd.ts:342` is
`const open = !!spec?.container && !spec.container.closed`. It becomes `spec?.tier === "container"`,
which closes the `bullets`/`quote`/`stat` leaks in one word.

**A unit drags whole.** `movableAncestor` already exists and already walks up to the nearest
droppable ancestor, commented _"a paste beside a diagram label lands beside the diagram."_ Drag
sources start from `movableAncestor(art, addr)` rather than `addr`, so grabbing a table cell moves
the table. Selection and inline editing of children are unaffected.

`closed` then only has its remaining job on the `slots` facet, which is what lets a divider drag
write the container's own data instead of the children's.

Out of scope, deliberately: generalising `wrap` off the section root so nested combinations can be
created by dropping. That is the next plan and it depends on this one, because it wants a single
"open" case rather than five.

## Migration

Prod holds a handful of artifacts, so this is a straight backfill with no permanent aliasing and a
clean end state.

### What actually has to move

| store                        | migrate | why                                                                     |
| ---------------------------- | ------- | ----------------------------------------------------------------------- |
| `artifacts.draft_content`    | **yes** | 44/46 in dev contain `"group"`, 27 contain `"card"`                     |
| `eval_runs.content`          | **yes** | same `ArtifactContent` shape                                            |
| `artifacts.digest`           | no      | `SectionSummary` is `{title, kind, id, size}`, carries no element types |
| `search_text` / `search_tsv` | no      | derived from text content; a type rename does not change it             |
| `comments.anchor`            | no      | `{kind, elementId}` anchors on ids, not paths or types                  |

That last row is the one that most de-risks this. A path-based anchor would have made the migration
far more dangerous.

### Do not blanket-replace the strings

`grep '"group"|"card"'` overcounts. Two are **not element types** and a find-and-replace would
break them:

- `model/elements.ts:99` — `DIAGRAM_STYLES = ["solid", "tinted", "card", "outline"]`, a style name.
- `model/elements.ts:208` and `canvas/elements/media/vector.ts` — `VNode` `{ t: "group" }`, the
  vector IR node kind.

The transform must match on an element instance's `type` field, never on the raw string.

### `scripts/migrate-container.ts`, run as `pnpm migrate:container`

Pure transform first, in `model/artifact.ts`, unit-testable with no database:

```
toContainer(inst):
  type "group" → "container", data unchanged
  type "card"  → "container", card's style/bg/shape lifted into data.surface
  otherwise    → recurse through childrenRaw; rebuild only if a descendant changed
```

Recursion goes through `childrenRaw` so it reaches cells inside tables and children inside closed
units, since a card can legitimately sit inside a composite.

Driver: for each row in `artifacts` and `eval_runs`, read the jsonb, transform, write back only when
the tree changed. Report id, title, and how many `group`/`card` nodes converted.

- `--dry-run` is the default; writing is opt-in.
- `--verify` re-reads and asserts zero remaining `group`/`card` element types.
- Idempotent by construction: a tree with none of them transforms to itself, so a re-run is a no-op
  and a half-finished run is safe to repeat. No resume logic needed at this size.

### The AI is a client we do not control

`prompts/system.ts:200` teaches the model to emit `{"type": "group", "data": {"direction": "row"…}}`
and `prompts/catalog.ts:355` mentions `card`. The generation schema does **not** validate element
types (`type: z.string()`), so an unknown type passes validation and reaches `composeElement`, whose
`if (!spec)` branch paints a pink error box.

So two things are required, not one:

1. Update both prompts to teach `container`. `pnpm check:elements` already asserts every type the AI
   catalog can emit is a registered spec, so it catches a missed catalog entry.
2. Keep a small legacy alias in `getElement` mapping `group`/`card` to the container spec, with a
   comment saying why. An LLM will drift back to the old names regardless of the prompt, and a
   two-line fallback is much cheaper than a pink box in a customer's deck.

## Order of execution

1. Add `container`; leave `group` and `card` registered.
2. Point the DSL at it (Phase A). Run `pnpm eval:shots`: **592 checks currently pass** over the 7
   corpus artifacts, rendered through the real engine. Unchanged output is the proof that the merged
   container lays out identically. This is the strongest gate in the plan and it runs before any
   stored data is touched.
3. Rewrite `PRESETS` in `compose.ts` (one entry, "Cards", the only palette path that builds a group)
   and `blueprint.ts`, which builds both.
4. Rename the tier; switch `dnd.ts` droppability to it; start drags from `movableAncestor`.
5. Update the two prompts; add the `getElement` alias.
6. Migration: `--dry-run` on local docker, then write, then `--verify`, then re-run `eval:shots`.
7. Delete `group` and `card` specs. `check:elements` verifies every registered element still renders.
8. Phase B of the DSL, independently.

Steps 1 to 5 ship without the migration, because stored artifacts keep working while the old specs
are registered. Step 7 is the only irreversible one.

## Test surface

38 test files carry 74 references to these strings, minus a handful of vector-IR false positives.
Most are fixtures (`root: { type: "group", … }`) that follow the DSL change; the ones asserting on
the string need updating by hand. `editor/core/__tests__/dnd.test.ts` and
`model/__tests__/element-ids.test.ts` are the two to read first, since they cover the drag and
identity behaviour this plan changes.

## Open questions

- **Tier name.** `unit` recommended; `compound` the alternative.
- **How a surface gets applied** now that `card` leaves the palette: a control on the container, or
  a layout-popup action. This plan removes the only way a user could make one.
- **Whether `w()` normalises**, or a guard catches sums that miss 100.
- **Prod artifact count**, which should be confirmed rather than assumed before the migration runs
  anywhere real.

## Still open after execution

Everything above shipped except the items here.

- **A surface has no creation affordance.** `card` left the palette with nothing replacing it, so a
  user can only get one on a container that already exists, through the inspector's Surface control.
  A layout-popup action is the obvious home.
- **`w()` does not normalise or warn.** `row(w(60, a), w(60, b))` still sums to 120 and `distribute`
  resolves it silently. A guard script over the templates is the cheap fix.
- **`wrap` is still root-only** in `elementSlots`, so nested combinations cannot be created by
  dropping. This was always the next plan, and the single-container tier is its precondition.
- **`.docs/rendering.md` still describes `group` and `card`** as separate elements.

## What changed behaviourally, beyond the rename

Two things a manual pass should look at, because they are intentional but visible.

- **A surfaced container no longer owns its parts.** `nestsParts` now keys on the tier, so a comment
  can be created on a child of what used to be a card. That follows from the merge: those children
  are droppable and movable on their own, so they are standalone blocks. A unit (callout, table,
  diagram, the seven composites) still owns its parts.
- **An unknown child type no longer throws.** The old `card` threw from `layout()`; `group` returned
  a fallback node. The merged container keeps the lenient path, because a render that throws takes
  the whole canvas down over one bad child.
