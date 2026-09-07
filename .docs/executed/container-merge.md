# One flexible container

> `group` and `card` are one element: `container`. The tier field means what it says, the drag
> layer treats a composed element as one piece, and the authoring DSL says what the engine can
> already do. Stored artifacts were migrated in place; this doc is the record of the design and its
> reasons — the current-state rendering description lives in `.docs/rendering.md`.

## Why

Four separate problems shared one cause: `container` on an element spec meant two different
things, and nothing distinguished them.

1. `arrangeCard` was `arrangeGroup` plus a `fill`. Two element types for one behaviour and a flag.
2. `bullets`, `quote`, and `stat` used the container facet to organise their own children out of
   base elements, but they were not `closed`, so `elementSlots` emitted drop slots inside them:
   you could drop a chart into a bullets list. That was the bug this design started from.
3. The DSL exposed about a fifth of the engine. `split` was hardcoded to two children, `row` could
   not weight anything, `card()` took children and nothing else, and width was expressed three
   incompatible ways.
4. `tier` already separated the two meanings correctly on every element (`container` for group and
   card, `smart` for everything else) and was never read anywhere in the codebase.

## The tiers

`ElementTier` is `primitive | unit | container | interactive` (`canvas/elements/spec.ts`). `unit`
replaced `smart`: it names the behavioural contract, "moves as one unit", which is exactly the
drag rule. The names weighed:

| option      | for                                             | against                                                                              |
| ----------- | ----------------------------------------------- | ------------------------------------------------------------------------------------ |
| **`unit`**  | names the contract we want, "moves as one unit" | slightly abstract on its own                                                         |
| `compound`  | accurate, unambiguous                           | longer, more formal                                                                  |
| `composite` | familiar                                        | **collides** with `category: "composite"`, which already means a specific 7 elements |
| `block`     | common                                          | the content tree is already made of "blocks"                                         |

## The container element

`canvas/elements/composite/container.ts` registers the one layout container: everything that holds
arbitrary children in a row, a column, or a grid. Its data is flat —
`ContainerData { children, direction?, columns?, align?, justify?, gap?, surface?, bg?, shape? }` —
rather than a nested `surface` object, because the control system reads and writes data keys
directly. `surface` is a `CardStyle` (`solid | outline | sideline | topline | glass | plain`, the
`CARD_STYLES` value-set in `model/elements.ts`); absent, the container reproduces group's geometry
exactly (gap 14, no padding, align inference from all-centred/all-end text children); present, it
reproduces card's (gap 12, padding 24, the style's fill). Kept exact so the merge was provably
layout-neutral against the eval corpus, which rendered identically through the change.

`tier: "container"` and `hidden: true`: it is the only element whose tier is `container`, so it is
the only place a drop may land, and it stays out of the palette — the only ways one reaches the
canvas are a preset or a layout action. It declares `frame: true`, a `gap` control, and a bar of
`direction · columns · align · surface`, the Surface select reading "None" when unset.

Not `Row`/`Col`/`Box` as separate types, for three reasons. The container collapses a row to a
column below `splitMinWidth` (`stacksAtWidth`), so a `Row` type would misdescribe what renders.
`Box` is `container` with a surface, which is the same mistake as `card`. And most concretely:
`ElementInstance.id` is _"stable identity for anything pointing at this node from outside the tree
(a comment anchor)"_, and `comments.anchor` is `{kind, elementId}`. If flipping direction changed
the element's `type` it would become a node replacement, which risks orphaning every comment on it
plus the collab edit lease. As a prop it is a data patch and identity survives.

The grid, once thought to maybe earn its own element, landed as a direction instead:
`direction: "grid"` with `columns`, shared-width tracks the children fill row-major so cells align
across rows. The children stay a list, so the data shape never changed and no second element was
needed. `table` stays separate for the original reason — its data really is two-dimensional.

## The authoring DSL

`model/authoring.ts` emits `container` through two explicit directions with an optional leading
options object, detected by the absence of `type`:

```ts
col(...kids);
row(...kids);
col({ gap: 8, surface: "outline" }, ...kids);
grid(2, ...kids); // direction "grid" with shared-width tracks
```

`ContainerOpts` is `{ gap?, align?, justify?, surface?, bg?, shape? }` — `surface` as an option
rather than a wrapper, so `boxed(col(...))` never produces two nested containers where one would
do. Layout lives on the child, because that is where the data model already keeps it
(`layout.width.pct`): `w(pct, el)` (a `withWidth` wrapper), `fill`, `fitW`. `row(w(50, a), b, c)`
gives a half and splits the rest, which `split` could never express, being fixed at two.

The old names stay as aliases so no call site changed: `group` is `col`, `card(...)` is
`col({ surface: "solid" }, ...)`, and `split(pct, l, r)` survives as two-column sugar through
`rowGroup`. `rowGroup` and `colGroup` in `model/artifact.ts` emit `container` (a `rowGroup`
carries `direction: "row"`, centre alignment, and the column gap), which is what moved every
template and corpus artifact with no edit to their text — just under 600 call sites across the 30
templates followed the DSL, which is why the DSL was the migration lever.

`w()` does not normalise and no guard script exists: `row(w(60, a), w(60, b))` sums to 120 and
`distribute` resolves it silently. A guard over the templates remains the cheap fix if this ever
bites; author-time normalisation was rejected because templates are in the repo and the AI writes
into this vocabulary too.

## Drag and drop

Droppability reads the tier: `editor/core/dnd.ts` asks `getElement(type)?.tier === "container"`
wherever it decides whether a drop may open a parent, which closed the `bullets`/`quote`/`stat`
leaks in one word. `closed` keeps only its remaining job on the `slots` facet, which is what lets
a divider drag write the container's own data instead of the children's.

A unit drags whole: drag sources start from `movableAncestor(art, addr)` rather than the grabbed
address, so grabbing a table cell moves the table. Selection and inline editing of children are
unaffected. A unit with an open children facet still reorders its own items through `unitItem`,
inside itself and nowhere else.

`wrap` is no longer root-only: `wrapMemberAt`/`wrapSlide` let a slide wrap a member at depth, so
nested combinations are created by dropping. That was always the follow-on round, and the
single-container tier was its precondition — one "open" case rather than five.

## The migration (a record)

Prod held a handful of artifacts, so this was a straight backfill with no permanent aliasing in
the stored data.

What actually had to move:

| store                        | migrated | why                                                                     |
| ---------------------------- | -------- | ----------------------------------------------------------------------- |
| `artifacts.draft_content`    | **yes**  | most dev artifacts contained `"group"`, many `"card"`                   |
| `eval_runs.content`          | **yes**  | same `ArtifactContent` shape                                            |
| `artifacts.digest`           | no       | `SectionSummary` is `{title, kind, id, size}`, carries no element types |
| `search_text` / `search_tsv` | no       | derived from text content; a type rename does not change it             |
| `comments.anchor`            | no       | `{kind, elementId}` anchors on ids, not paths or types                  |

That last row is the one that most de-risked the merge. A path-based anchor would have made the
migration far more dangerous; anchoring on ids is why a type rename touched no comment.

**Do not blanket-replace the strings** — the trap list is still live, because both strings remain
in the codebase meaning other things:

- `model/elements.ts` — `DIAGRAM_STYLES` includes `"card"`, a style name.
- `model/elements.ts` and `canvas/elements/media/vector.ts` — the `VNode` `{ t: "group" }` kind in
  the vector IR.

Any transform must match on an element instance's `type` field, never on the raw string.

The backfill script (`scripts/migrate-container.ts`, dry-run by default, `--verify` asserting zero
remaining legacy types, idempotent by construction) ran once and was deleted (commit `586e87e`).
The pure transform outlived it as `withCanonicalTypes` in `model/artifact.ts`: the write path folds
legacy shapes to canonical — `group`/`card` onto `container`, the old picture elements onto
`media` — identity-preserving, so a tree already canonical comes back untouched and nothing
repaints.

## The AI is a client we do not control

Both prompts teach `container` (`services/core/ai/prompts/system.ts` and the catalog entry in
`prompts/catalog.ts`); `pnpm check:elements` asserts every type the catalog can emit is a
registered spec. And because an LLM will drift back to the old names whatever the prompt says,
`LEGACY_TYPES` in `canvas/elements/spec.ts` maps `group` and `card` (and the pre-merge media
names) onto their canonical specs: `canonicalType` answers the registered name behind a stored
one, and `getElement` falls back through the map. The generation schema does not validate element
types, so without the alias an unknown type would reach `composeElement` and paint the pink
unknown-element box in a customer's deck; two map entries are far cheaper than that.

## How a surface is applied

`card` left the palette and the container never entered it (`hidden: true`), so the paths to a
surfaced container are: the **Cards** and **Grid** presets (`PRESETS` in
`canvas/elements/compose.ts`, rendered by `editor/panels/Insert.tsx`), which seed a row or grid of
solid-surfaced containers; and the **Surface** control on an existing container's bar or panel,
which reads "None" when unset. There is no palette tile and no dedicated layout-popup action that
mints a surfaced container directly.

## Behavioural deltas beyond the rename

Two things that are intentional but visible.

- **Comment ownership keys on the surface, not the tier.** `nestsParts` in
  `editor/core/comments.ts`: a bare container's children are standalone blocks and take their own
  comments, while a surfaced container owns its parts as one block — a surface is what made it a
  card, and a comment there belongs to the card, not a line inside it. Tier alone no longer
  separates the two, so the surface check is what preserves card semantics without resurrecting
  the type. A unit (callout, table, diagram, the composites) still owns its parts.
- **An unknown child type never throws.** The old `card` threw from `layout()`; the merged
  container keeps the lenient path: `composeElement` paints the fallback box for an unresolved
  spec, because a render that throws takes the whole canvas down over one bad child.

## Not taken

- **`w()` normalisation or a sum guard.** Weights that miss 100 resolve silently through
  `distribute`; no guard script exists.
- **A separate grid element with two-dimensional addressing.** Superseded by
  `direction: "grid"` — see above.
