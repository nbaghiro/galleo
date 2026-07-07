# Element structure — grouped by category

One category taxonomy used in three places — the UI palette groups (`spec.category`), the canvas element
folders, and the model value-set files — so a category is one folder/file everywhere. Companion to
`rendering.md` (the element system) and `ai-module.md` (the AI catalog).

## The taxonomy

| Category      | Elements                                                             |
| ------------- | -------------------------------------------------------------------- |
| **text**      | text · bullets · callout · quote · code                              |
| **media**     | image · video · avatar · gif · illustration · sticker · icon         |
| **table**     | table · stat                                                         |
| **composite** | card · group · feature · profile · testimonial · pricing · cta · faq |
| **chart**     | chart (+ the type variants)                                          |
| **diagram**   | diagram (+ the type variants)                                        |
| **chrome**    | button · badge · embed · gradient · divider · spacer · shape         |

`composite` = the old `container` + the composite blocks (they all arrange other elements); `table` = the
old `data`. These same category ids drive: (a) `spec.category` → the palette right-panel groups, (b)
`canvas/elements/<category>/` folders, (c) `model/elements/<category>.ts` files.

## model/elements/ — value-sets, one file per category ✅ DONE

```
model/
  elements/
    text.ts        TEXT_STYLES · TEXT_ALIGN · BULLET_MARKERS · CALLOUT_TONES
    media.ts       IMAGE_FIT
    composite.ts   CARD_STYLES · FLEX_DIRECTION
    chrome.ts      BUTTON_VARIANTS
    chart.ts       CHART_TYPES
    diagram.ts     DIAGRAM_TYPES · GRAPH_DIAGRAM_TYPES
    section.ts     GRID_TEMPLATES · GRID_IDS   (section-level; the layout contract)
  ai-schema.ts     imports the per-category files, re-exports them, adds the AI catalog + when/desc
```

`table` has no shared enums yet (table/stat are plain scalar fields), so it has no file — a category gets a
file only when its elements share value-sets. Consumers import the specific file (`@model/elements/text`),
never a barrel.

## canvas/elements/ — folders, one per category (on a clean tree)

Framework files stay at the **root** (so `@elements/spec` · `@elements/compose` · `@elements/ops` imports
don't change); every element becomes one file inside its category folder; charts/diagrams are category
folders that happen to hold a mini-engine.

```
canvas/elements/
  spec.ts  compose.ts  ops.ts  skeleton.ts        ← framework at the root
  register.ts                                       ← the registration manifest
  text/       text.ts  callout.ts  bullets.ts  quote.ts  code.ts
  media/      image.ts  video.ts  avatar.ts  gif.ts  illustration.ts  sticker.ts  icon.ts
  table/      table.ts  stat.ts
  composite/  card.ts  group.ts  feature.ts  profile.ts  testimonial.ts  pricing.ts  cta.ts  faq.ts
  chrome/     button.ts  badge.ts  embed.ts  gradient.ts  divider.ts  spacer.ts  shape.ts  dropghost.ts
  chart/      types.ts  registry.ts  cartesian.ts  radial.ts  more.ts  treemap.ts  render.ts  element.ts
  diagram/    types.ts  registry.ts  flow.ts  hierarchy.ts  templated.ts  render.ts  element.ts
```

Find an element → `<category>/<name>.ts`. Each def imports its value-set(s) from `@model/elements/<category>`
and builds its `controls` options from the const + a local UI-label map, so values can't drift.

## UI palette

`editor/chrome/Panel.tsx` groups tiles by `spec.category`; set every element's `spec.category` to one of the
seven ids above and the palette shows exactly these groups — one per canvas folder / model file.

## Steps (on a clean tree)

1. **Split each category file into its folder** — cut each element out of `text.ts`/`media.ts`/… into
   `<category>/<name>.ts`; import its value-set from `@model/elements/<category>`; build control options from
   the const; keep the element's own render/data types with it; repoint cross-imports (`DROP_GHOST`, the
   composite text helper); delete the emptied category files.
2. **Set `spec.category`** on every element to the taxonomy id.
3. **Registration manifest** — `register.ts` imports every `<category>/*` + the chart/diagram element
   adapters (order-sensitive tiles last).
4. **Rename `charts/`→`chart/`, `diagrams/`→`diagram/`** to match the singular category ids (or keep plural —
   a naming call; renaming touches the `@elements/charts` importers).
5. **Drift guard** — `scripts/check-element-catalog.ts` (tsx tool, may import canvas) asserts
   `model/elements/chart.ts` `CHART_TYPES` == the registered chart ids and likewise for diagrams, and that
   every `@model/ai-schema` `ELEMENTS[].type` is registered. Wire as `pnpm check:elements` + pre-commit.

## Optional consolidation pass (separate toggle)

Independent of the folder move — decide before step 1 and it just shrinks the groups (the palette keeps
every tile as a preset/option):

- **media**: `gif`/`illustration`/`sticker` → `image` (a picker kind); `avatar` → `image` + a round frame.
- **composite**: the blocks (`feature`/`profile`/…) → palette presets that drop a pre-filled `card`.
- **chart/diagram**: the 25 type variants → palette presets over the one `chart`/`diagram` + `data.type`.
- **chrome**: `divider`/`gradient` → `shape`; `spacer` → remove (spacing is layout).

## Sequencing note

Steps 1–4 rewrite nearly every file in `canvas/elements/`; run them only on a **clean working tree**. At the
time of writing those files were mid-transaction (a staged charts/diagrams reorg in another session), so the
model side (`model/elements/`) was done in isolation and the canvas move waits for that to land.
