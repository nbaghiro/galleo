# Galleo — Rendering & Elements

> How content becomes pixels. Two pure, editor-free layers in `canvas/`: a custom **Clay-style layout
> engine** (geometry) and the **element system** (content blocks that compile down to it). A thin **render
> bridge** (`canvas/render`) drives the engine and feeds the concrete DOM / 2D-canvas / PDF paint
> backends. This is the single reference for the rendering core, the element catalog + spec, the
> selection/editing surface, and the chart/diagram subsystem. Companion to `architecture.md` (the file
> map + persistence), `ai.md` (the streamed edit protocol + AI element catalog), and `frontend.md` (the
> shared `@ui` control kit).

**The pipeline, end to end:** `Section` (data) → `composeSection` → `EngineNode` tree → `layout(node,
size)` → `RenderCommand[]` + `Region[]` → a paint backend (DOM divs on screen, 2D canvas for
present/export). One layout pass feeds screen _and_ export, so what you edit is what ships (§9).

## 1. The core bet

Galleo renders everything through a **custom, immediate-mode, Clay-style box-layout engine** ported to
TypeScript. The engine lays out **one container, at one pixel size, into backend-agnostic render
commands** — it knows nothing about pages, formats, breakpoints, or fonts. Everything format-specific is
_data_ fed to the same engine.

Why this shape:

- **Clay's sizing model** (`fit / grow / percent / fixed` per axis) is flexbox-simple and produces a flat
  render-command list that feeds screen, canvas, and export from one layout.
- **Immediate mode** ("recompute from scratch") is fast enough at our scale and collapses resize,
  theme-switch, edit, and _new dimensions_ into one verb: recompute. Live-resizing a canvas is just
  `layout(tree, newSize)` per frame.
- **Constraints-down / sizes-up** (Flutter/Clay) resolves every box to absolute `x/y/w/h` in O(n) — so
  **export fidelity is a free byproduct**: what the editor lays out is exactly what export serializes.
- **Pure TS, not WASM** — the `MeasureText` callback fires per text node; a JS↔WASM boundary per call is
  the classic perf killer, so the port calls Canvas `measureText` directly and keeps the layout engine DOM-free
  by _injecting_ the measure function.

## 2. The engine (`canvas/engine`)

**Input** — an `EngineNode` tree (`node.ts`): each node has `w`/`h` (a `Size`: `fit`/`grow`/`percent`/
`fixed`), optional `aspect`, `direction` (row/col), `padding`, `gap`, `alignX`/`alignY`/`alignSelf`, and
**one leaf** (`text` | `image` | `fill` | `surface`), plus `children`. An optional `clip?: {x?,y?}` clips
descendants to the node's box on the given axes (the engine carries the resolved rect onto each command's
`RenderCommand.clip`); `float?` lifts a node out of the flex flow (aligned + `dx`/`dy`-offset within the
parent's content box, painted on top by ascending `z`); `opacity` multiplies down the subtree.

**Solver** (`layout.ts`) — three O(n) passes:

1. **widths** (top-down) — each parent assigns its children's widths (`percent`/`fit`/`grow` all of the
   content width _after_ inter-child gaps, so a row of `60% + 40%` columns plus a gutter fills exactly).
2. **heights** (bottom-up) — text is measured _at its resolved width_ (width must be known first); a
   row's cross-height is the tallest child; `grow`-height stretches to it.
3. **positions** (top-down) — assign `x/y`, apply alignment.

Then flatten to `RenderCommand[]` (`rect`/`text`/`image`/`surface`) + `Region[]` (the box of every node
carrying an `id`) — paint and hit-testing are separate outputs. `layout(node, size)` is the whole public
surface; the render bridge (§8) is what calls it.

> **The engine does not wrap child elements** — only text wraps. Responsive "grid of N" is built by the
> _element_ (e.g. `group` chunks its children into rows) or the compose layer, never the engine. This is
> deliberate: explicit, designed breakpoints we control.

**Text fidelity — the one hard invariant.** `MeasureText(leaf, maxWidth)` must return identical metrics
in the editor and in every export, or exports drift from the screen. The editor uses Canvas 2D
`measureText`; export reuses the same canvas measurement; theme fonts are bundled so both agree. The one
measurement path is memoized in the bridge (`measureText` in `commands.ts`, cleared on font `loadingdone`).

## 3. Format-as-view (`canvas/engine/profile.ts`)

The three "modes" are three **format profiles** fed to the same engine:

| Format   | kind       | geometry                    | notes                                    |
| -------- | ---------- | --------------------------- | ---------------------------------------- |
| **Deck** | paged      | 1280 × 720 (16:9)           | one section per slide; content fit to it |
| **Doc**  | continuous | centered column, capped     | paginates only on export                 |
| **Web**  | continuous | full-bleed, fills the width | recomputes on viewport resize            |

A profile carries `kind`, width/height, `maxContentWidth`, `tokenScale` (a type/space multiplier so a
deck reads big and a doc reads dense — _styling_, never content), `splitMinWidth` (below it a row of
columns stacks), and `overflow` (`paginate | fit` — what a paged render does with a section taller than
its frame). `DEFAULT_PROFILE` is deck; `previewContentProfile` widens a doc's
content column toward the viewport for read-only previews (deck + web pass through). Because dimensions
are data, a custom size or a draggable/resizable canvas is a data change, not new layout code.

**Two resolvers, and which to call.** `resolveProfile(id)` returns a named format's descriptor; use it
only where the code deliberately renders at a named format regardless of the artifact (the "compose as
doc / as slides" export overrides, the theme-editor demo, the generation preview's format signal).
Everywhere the artifact's own format decides the geometry, call **`profileFor(content)`** instead — it
resolves the base profile and overlays `ArtifactContent.page` (§3.2). It takes a structural
`{format?, page?}`, so a library summary fits it too, and it returns the base profile _by identity_ when
there is nothing to overlay, which is what keeps unsized artifacts byte-identical and keeps the paint
caches' reference comparison working. `pagedSize(profile)` is the numeric accessor the paged renderers
use, since `width`/`height` are typed `number | "fill" | "auto"`.

### 3.1 Per-section framing (`sectionFrame`)

The one custom-size hook that actually landed is **per-section**, not per-artifact. `Section.frame?.aspect`
(`@model/artifact` — `SectionFrame { aspect?: number }`, honored only for paged rendering) lets a single
slide override its shape. `sectionFrame(section, profile)` (`profile.ts`) resolves the paged frame a section
renders into: width stays the profile's page width (1280 for deck); height is the profile height (720) — or
`round(width / aspect)` when the section sets one. The deck path (`sectionSlides`, §8) reads `sectionFrame`
per section, so a deck can mix a 16:9 slide with a square or tall one without any new profile.

### 3.2 Artifact-level page geometry (`ArtifactContent.page`)

`ArtifactContent.page?: {width, height}` is the artifact-wide page size, plain JSONB inside
`draft_content` (no migration, absent by default). `profileFor` overlays it onto **any** `kind: "paged"`
profile — today that is deck, so a deck can render at 1080×1080 — and ignores it on a continuous format,
where a fixed page means nothing. It also caps `maxContentWidth` at the page width so content cannot
exceed its own page.

`sectionFrame(section, profile)` is where the two levels compose: the page fixes the width and the base
height, then a section's `frame.aspect` overrides the height on top of it. Everything paged flows from
there — `sectionSlides`, Present, PDF page size, PPTX (`defineLayout` off `pagedSize`), the windowed
loader's height estimate, and the thumbnail aspect in `ScaledSectionCanvas`.

Two invariants worth knowing when touching this:

- **`ArtifactContent extends ArtifactShell`.** The shell is "everything except the sections", and the
  section-ops route rewrites stored content through it (`applySectionOps` spreads the non-section rest).
  A content field declared outside the shell is silently dropped on the next section edit.
- **The section paint cache keys on the resolved page dimensions**, not `profile.id` — two page sizes
  share the id `deck`, so an id-only key would serve a stale layer.

There is **no UI for setting a page size yet**, and no format that defaults to one; the field is the
resolution path only. The presets table and dimension editor land with the first format that needs them
(§10).

### 3.3 Type scale and overflow (`tokenScale`, `overflow`)

A page size alone does not make a format readable: type sizes are constants inside each element spec, so
the same content at 1080×1920 is dimensionally right and visually tiny. Two profile fields carry that.
`tokenScale` itself is 1 for the shipped three, but each carries a **`ramp`** (`{reference: 640, min: 0.7}`):
below the reference container width the effective scale is `tokenScale · clamp(width/reference, min, 1)`
(`rampScale` in `@engine/profile`), so a phone-width editor canvas, preview, or published page sets type
~30% smaller and then reflows, instead of pouring desktop-sized type into a 390px column. Wide layouts —
thumbnails (which lay out wide and CSS-scale) and exports — sit at or above the reference and never ramp.

**`tokenScale`** multiplies type and space. It lands in `composeSection`, in two parts. The section's own
gutters (`SECTION_PAD`/`BLEED_PAD_X`/`GUTTER`) scale _before_ `contentW` is computed, because `contentW`
is what children size against (`stacksAtWidth`, `rowShares`) — scaling padding afterwards would leave them
measured against a width the section no longer has. The content subtree then goes through
`scaleTokens(node, k)`, which multiplies `text.size`/`lineHeight`, `gap`, `padding`, `fixed` sizes,
`fit`/`grow` bounds, radii, and float offsets. `aspect` and `percent` are left alone: a ratio and a
fraction are already scale-free. `scaleTokens(node, 1)` returns the node by identity.

It scales the composed tree rather than each element because type constants live in ~20 element specs
with no shared leaf builder — a per-element scale is something every future element has to remember.

A `surface` (chart, diagram, icon, graphic) draws itself and so cannot be reached by a node walk. Those
scale by **space instead of constants** (`@engine/drawscale`): the renderer is handed `box / k` and a
`DrawContext` that multiplies every coordinate and length it emits, so it draws its ordinary 1× picture
into a k× space. That is why no renderer needed changing and why no constant had to be classified — a
ratio's arithmetic happens in renderer space and only its resulting coordinate crosses the boundary.
Angles (`wedge`, `arc`) and `measureText` are the deliberate exceptions. The wrapper is typed as
`DrawContext`, so a new method on that interface fails to compile rather than silently drawing unscaled.

**`overflow`** decides what a paged render does with a section taller than its frame: `paginate` splits it
past `PAGINATE_ABOVE` (1.2×), `fit` always returns one page and lets the caller scale the content down.
It replaced a `paginate: always | export | never` field that nothing read and whose values would have
misled: `web` was marked `never`, yet web artifacts _do_ go through `sectionSlides` on export (everything
exports as a deck), so honoring it would have turned a tall web section into one enormous scaled page.
A card format wants `fit` — a card silently becoming two cards changes what the author publishes.

## 4. Compose — Section → EngineNode (`canvas/elements/compose.ts`)

A section's content is **one recursive tree** — `section.root`, a container (`group` laid out as a `row`
for columns / `col` to stack) nesting to any depth, or a bare leaf for a full-width section. `composeSection`
turns it into an engine tree:

- **Root tree.** `composeElement` recurses `root`. Columns are just the root row's children, each carrying
  a `layout.width` fraction (`@model/artifact` builds these; the migration from the old `grid`/`cells` shape
  is gone). An empty container composes to the dashed "drop element" placeholder, so an empty column and an
  emptied group are the same thing.
- **Per-instance layout.** `applyLayout` maps each element's optional `ElementLayout` (width
  `fit`/`fill`/`{pct}`, height `fit`/`fill`, cross-axis `align`, corner `radius`) onto the node.
- **Region ids.** Every element node is tagged with a stable **path** id (`section:…` / `el:<section>` for
  the root / `el:<section>:0.1` for a grandchild), so the engine reports its box for selection + overlays.
  A path is positional, so it moves when siblings do: an `ElementInstance` also carries an optional
  **`id`** (`e-<8 hex>`) for anything that must point at the node itself across edits (comment anchors).
  It is stamped centrally on load and on every server write, re-minted by cloners, and resolved back to a
  path through `elementIdMap` (`@elements/ops`), which walks the same registry-aware children compose
  tags region ids from.
- **Contrast.** Over a dark section background, content tokens flip to a light-on-dark set.

Named **layout presets** (`full` / `split-6040` / `three-up` …) are just convenience helpers that set the
root row's column count + width ratios — not a stored mode the section is "in".

The composed tree isn't laid out here — `composeSection` only builds boxes. The **render bridge** (§8)
takes it from tree to render commands, and chooses the framing (natural-height section vs paged slide).

## 5. The element system (`canvas/elements`)

Every block — from a `divider` to a `chart` — is one registry entry implementing **`ElementSpec`**:

```ts
interface ElementSpec<Data> {
    type;
    label;
    category;
    tier; // identity + palette grouping
    create(): Data; // default data on insert
    layout(data, ctx): EngineNode; // compile to an engine subtree
    controls: ControlField[]; // schema-driven inspector
    container?: { children; arrange; withChildren; closed?; slots? }; // group / card / diagram
    // studio-only affordances (inert for layout / export):
    richText?;
    bar?;
    frame?; // visible frame → the corner-radius control (docked inspector)
    resize?;
    fallback?;
}
```

A **generic inspector** renders `controls` for every element — no bespoke panel per element in the common
case. `register(spec)` adds it to the registry (`getElement`/`listElements`/`walkElements`); the palette,
AI catalog, and serialization are all registry-driven, so **adding an element is adding a spec — zero
engine changes**.

**Studio-only spec fields** (optional, read solely by the editor — inert for layout/present/export):

| Field             | Drives                                                                                                                                                                                                                      |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `richText?`       | primary text takes inline marks → the contenteditable overlay + the inline mark bar (only `text`)                                                                                                                           |
| `bar?: string[]`  | which `controls` keys appear on the floating format bar                                                                                                                                                                     |
| `frame?: boolean` | element has a visible frame → the corner-radius slider in the docked inspector (and forces it open)                                                                                                                         |
| `resize?`         | bottom-edge canvas handle: `height` (a data key) / `aspect` (`data.aspect`); width is the divider system                                                                                                                    |
| `container?`      | `{children, arrange, withChildren}` — recursion + generic insert/remove; `closed` seals it (children edit in place, never move/insert/delete — the diagram); `slots` opts a closed container into the divider gesture (§6④) |
| `fallback?`       | interactive → static substitution for paged/export                                                                                                                                                                          |

`ControlField[]` is the schema the generic inspector + format bar both render (control kinds: `select`,
`segmented`, `align`, `slider`, `toggle`, `color`, `number`, `text`, `media`, `icon`, `iconColor`,
`vector`), with per-field `group` (inspector heading) and `visibleWhen` (conditional). Two fields may
share a `key` when their `visibleWhen`s are mutually exclusive — how the diagram `axes` caption gets a
different label and placeholder per diagram type.

**Two ways an element compiles to boxes:**

1. **Primitive subtree** — returns a tree of `text`/`image`/`fill` nodes the engine lays out. Most
   elements (text, lists, cards, stats, tables).
2. **Self-rendered surface** — returns a sized node with a `surface.paint(g, box)` callback; the engine
   resolves the box, the element paints into it through a backend-abstract `DrawContext` (vector `<svg>` in
   the editor, raster canvas for present/export). Used by charts, diagrams, and the vector elements (§7).

**Ghosts & previews.** `skeletonize` (`elements/spec.ts`) derives a structural ghost (bars/blocks/pills)
from any composed node — used by the AI live-build skeletons (`layoutSectionSkeleton` /
`layoutSlideSkeleton`); because it's real engine output, it occupies the exact final geometry. Palette
tiles (and the drag cursor's mini tile) use the hand-drawn themed SVG previews in `previews.ts`
(`previewSvg` emits CSS-var colors so tiles recolor live with the theme).

### 5.1 Where elements live

One file per element under `canvas/elements/<category>/`, plus the shared machinery at the root:

```
canvas/elements/
  spec.ts        ElementSpec + ControlField, the registry (register/getElement/listElements/walkElements),
                 SECTION_CONTROLS, ghost builders (bar/block/pill/dot) + skeletonize
  compose.ts     composeSection/composeElement (section.root → EngineNode), PRESETS, dark-bg adaptation
  ops.ts         pure immutable content edits over the root tree by PATH (get/set/insert/remove/duplicate,
                 collapse-on-empty, addColumn, applyLayoutPreset, section bg/bleed)
  layouts.ts     SECTION_LAYOUTS — section presets (column splits + role-aware media left/right/top/bleed),
                 each with applies/matches/transform over a role-tagged flatten of the root tree
  previews.ts    hand-drawn themed SVG palette tiles (previewSvg CSS-var / previewDataUri baked tokens)
  blueprint.ts   placeholder sections/blocks (AI generation staging)
  register.ts    the manifest — side-effect-imports every element file (imported by app/main.tsx)

  text/      text · bullets("List") · callout · code · quote
  media/     image · gif · illustration · sticker · video · avatar   + shared.ts (imageLike factory)
             vector.ts — the vector substrate: the Vector renderer (drawVector/parseSvg/emitPath), the shape
             presets, ICON_LIBRARY, and the three specs it registers — icon · shape("basic" cat) · graphic
  table/     table · stat
  composite/ card · group · feature · profile · testimonial · pricing · cta · faq   + shared.ts (composite factory)
  chart/     element.ts (chartSpec + VARIANTS) · render.ts · utils.ts · one renderer per type (bar.ts …)
  diagram/   element.ts (diagramSpec + VARIANTS) · render.ts · utils.ts · one renderer per type (process.ts …)
  basic/     badge · button · divider · embed · gradient · spacer   (shape lives in media/vector.ts)
```

The **folder is code organization; the palette grouping is each spec's `category`** — `basic/` deliberately
mixes several categories' worth of small primitives into one folder. `canvas/elements/register.ts`
side-effect-imports every element file at startup (that's when each `register(spec)` fires);
`app/main.tsx` imports it.

### 5.2 The catalog

**64 registered types, 60 palette-visible.** Hidden from the palette (`HIDDEN` in `editor/Editor.tsx`):
`group`, `avatar`, and the `chart`/`diagram` elements themselves — content stores one of
those with a `data.type`, while the per-type entries are the palette tiles. Palette rail order + labels
(`CAT_ORDER` / `CAT_LABEL`, same file):

| Rail (label)  | `category`  | Elements (tier)                                                                                                                                                                                                                                                                   |
| ------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Text**      | `text`      | text (primitive, the only `richText`), bullets/callout/code/quote (smart)                                                                                                                                                                                                         |
| **Media**     | `media`     | image · gif · illustration · sticker · icon · graphic (primitive), video (interactive); _avatar (hidden)_                                                                                                                                                                         |
| **Table**     | `table`     | table · stat (smart)                                                                                                                                                                                                                                                              |
| **Composite** | `composite` | card (container), feature · profile · testimonial · pricing · cta · faq · comparison (smart); _group (hidden container)_                                                                                                                                                          |
| **Charts**    | `chart`     | 15 smart variants: `barChart` `columnChart` `lineChart` `areaChart` `pieChart` `donutChart` `radarChart` `scatterChart` `bubbleChart` `gaugeChart` `heatmapChart` `treemapChart` `waterfallChart` `packChart` `progressChart`                                                     |
| **Diagrams**  | `diagram`   | 16 smart variants: `processDiagram` `stepsDiagram` `cycleDiagram` `pyramidDiagram` `funnelDiagram` `timelineDiagram` `quadrantDiagram` `matrixDiagram` `hubDiagram` `orgDiagram` `targetDiagram` `vennDiagram` `pictogramDiagram` `flowDiagram` `mindmapDiagram` `roadmapDiagram` |
| **Basic**     | `basic`     | badge · button · divider · embed · gradient · shape · spacer (primitive; embed is interactive)                                                                                                                                                                                    |

The taxonomy was **consolidated** from an earlier set: `data` → **Table**, `container` → **Composite**, and
`interactive` / `branding` / `decoration` / `layout` all merged into **Basic**. (An earlier plan proposed a
`chrome/` seventh category; the shipped seventh is **`basic/`**.)

**Two families with a factory + a render/element split:**

- **Composite blocks** (`composite/`) are `container`s assembled from real `text`/`avatar`/`button` children
  via `composite/shared.ts`, so every child stays individually selectable — and **`closed`**, like the
  callout: children edit in place, the block moves as one (only the freeform `card`/`group` stay open).
- **Charts & diagrams** register their variants from `chart/element.ts` / `diagram/element.ts` (a
  `chartSpec`/`diagramSpec` factory over a `VARIANTS` array). The element `type` (e.g. `barChart`) differs
  from the internal **render-type** (`bar`) that self-registers when `chart/render.ts` side-effect-imports the
  per-type file (`bar.ts`). A chart's `layout` returns a `surface` node whose `paint` calls the renderer;
  a diagram **composes** — its `container.arrange` returns real engine boxes with real text children over
  a chrome-only surface — so **d3 lives only inside those renderers/arranges**, invisible to the engine (§7).

### 5.3 Value-sets & the drift guard

`model/elements.ts` holds the shared enum value-sets — the pure contract the specs build their `controls`
options from, so canvas UI and the AI catalog can't drift: `TEXT_STYLES`/`TEXT_ALIGN`/`BULLET_MARKERS`/
`CALLOUT_TONES` (text), `IMAGE_FIT` (media), `CARD_STYLES`/`CARD_SHAPES`/`FLEX_DIRECTION` (composite),
`BUTTON_VARIANTS`/`BUTTON_SIZES`/`BUTTON_SHAPES` (basic), plus **`CHART_TYPES`** / **`DIAGRAM_TYPES`**
(+`GRAPH_DIAGRAM_TYPES`) and the outline `BLOCK_KINDS`. `table` shares no enums (stat/table are plain scalar
fields), so it has none. Each element imports the specific const it needs and maps it to UI labels locally.

Diagrams add `DIAGRAM_STYLES` (the four node treatments), `DIAGRAM_SHAPES` (the authored silhouettes),
`DIAGRAM_NUMBERS` (the leading-edge badge) and `DIAGRAM_ICONS` (the per-item icon vocabulary, which
`ICON_LIBRARY` `satisfies`, so glyph drift is a compile error).

`CHART_TYPES`/`DIAGRAM_TYPES` are the `data.type` discriminants kept **in lockstep** with the canvas
chart/diagram registries. `DIAGRAM_TYPES` has a real drift guard in `diagram.test.ts` (the registry's ids
must equal the value-set exactly); the equivalent chart assertion, plus "every AI-catalog element `type` is
registered", is still only convention — a `pnpm check:elements` script covering all three is planned.

## 6. Selection & direct manipulation (`editor/core`, `editor/panels`, `editor/Canvas.tsx`)

A single `selection()` signal in `editor/core/store.ts` (`{kind:"element", address}` | `{kind:"section", …}`
| `null`) drives **four independent surfaces**. Every surface is positioned from the engine's `Region` boxes
(the box of each id'd node), so the UI can never drift from what's painted.

**① Floating format bar** — `editor/panels/ControlBars.tsx` (`ContextBar`). Renders for a selected element,
anchored just above its region box (flips below if it would clip; hidden mid-drag). Contents, in order:
the spec's `bar` keys resolved to their `ControlField`s and rendered **compact** (same `Field` dispatcher as
the panel, labels dropped) → **rich-text marks** (`MarkControls`, only while editing a `richText` element) →
**align** (only when the element has horizontal slack in its parent — decided by probing the spec's natural
width) → one **AI ✨** (text rewrite/translate intake while inline-editing rich text, whole-element
regenerate otherwise) → **duplicate** → **delete**. Continuous slider/color drags coalesce into a single
undo step.

**② Docked right panel** — `Panel` in `editor/Editor.tsx`: a vertical icon rail + a flyout that shows either
the **palette** (tiles grouped by `category`, or a search) or the **inspector**. The routing hinges on
`elementInline` — an element skips the docked inspector (bar-only) when:

```ts
if (spec.richText) return true; // fully editable inline + on the bar
if (spec.frame) return false; // the corner-radius slider lives only in the panel
const bar = spec.bar ?? [];
return spec.controls.every((c) => bar.includes(c.key)); // vacuously true for zero-control containers
```

i.e. rich-text, or any element whose every control already lives on the bar (zero-control containers
included) — but a framed element always opens the panel. Otherwise a `createEffect` auto-opens the
inspector for the selection.

**③ Inspector + control kit** — `editor/panels/RightPanel.tsx` (`ElementInspector`) over the `Field` /
`SchemaFields` dispatchers in `editor/panels/SharedControlFields.tsx` (which re-export the shared `@ui`
input primitives):

- **ElementInspector** renders `spec.controls` through `SchemaFields` — grouped by each field's `group`,
  each gated by `visibleWhen`, dispatched by control kind to the shared primitives (`Segmented`,
  `SliderRow`, `ColorField`, `MediaField`, `IconField`, `VectorField`, …). It deliberately omits spatial
  props (width/height/align/gap/padding) — those are canvas handles. When `spec.frame`, it appends the
  universal **corner-radius** slider (written to `ElementLayout.radius`, not element data; unset, it shows
  the painted region's radius so the slider reads true). **Charts/diagrams are special**: `dataShapeFor()`
  (`editor/core/infographic.ts`) returns a structured shape, so the inspector hides the raw data keys
  (`DATA_KEYS`) and renders an inline **`DataGrid`** (`editor/panels/DataEditor.tsx` — a spreadsheet-style
  editor, expandable to a full-screen modal) instead. A diagram's `list` shape edits as Item · Detail
  columns, plus a Value column for the types that read a numeric weight.
- **Section layout & background** live in `editor/panels/SectionLayoutPopup.tsx`, opened from the section
  pill (below): a preset grid of live thumbnails (`SECTION_LAYOUTS`, `@elements/layouts` — column splits +
  role-aware media left/right/top/full-bleed, each with `applies`/`matches`/`transform`; the active preset
  lights up by matching current fractions) followed by the generic `SECTION_CONTROLS` (bleed + background)
  through the same `SchemaFields`.

**④ On-canvas handles** — `editor/panels/Selection.tsx`, all live-previewed through a shared `liveEdit`
signal (the canvas reflows per frame, commits on release):

- **DragHandle** — a grip left of the hovered/selected element or section; a press becomes a move only
  after a 5px threshold, so a plain click on the grip selects. It never renders for a **closed**
  container's children: `movable` (`core/dnd.ts`) gates every structural gesture — move, delete,
  duplicate, cut — and paste re-anchors beside the container (`movableAncestor`), so a diagram label
  offers only in-place editing.
- **ResizeHandles** — a single **bottom-edge** strip (corner/width handles were removed) → `resize.height`
  (a data key) or `resize.aspect` (`data.aspect`).
- **RegionDividers** — the **primary width affordance**, ONE mechanism at every depth: thin `col-resize`
  bars between any two side-by-side siblings — the section's columns (the root row's children) or a nested
  row — each writing both neighbours' `ElementLayout.width.pct` (a `siblings` live edit). Inside a
  **closed** container the same bars act through the spec's `slots` facet instead: child regions fold into
  slot unions (a diagram cell's label + detail are one slot) and the drag writes the container's own data
  (per-item `weight`, a `slots` live edit); a closed container without `slots` shows no dividers at all.

Net: an element's entire editing surface is assembled from its `ElementSpec` — `bar` picks the quick
controls, `controls` fills the panel, `frame`/`resize`/`container` light up the radius slider and canvas
affordances, and `richText`/`dataShapeFor` swap in the specialized editors (inline text marks,
chart/diagram grid).

### 6.1 How it's wired (the reactive spine)

None of the surfaces above query the DOM to find an element. They read a handful of signals in
`editor/core/store.ts` and position themselves from the engine's `Region` boxes. **Five signals** carry the
whole interaction:

- **`regions`** — `Region[]` the canvas republishes on every paint; each is `{ id, box, radius }` in
  canvas-content coords. The region `id` (`section:…` / `el:<section>` for the root / `el:<section>:0.1` by
  path) is the join key between engine output and UI — the single source of geometry for every overlay.
- **`selection` / `hover`** — a `Target | null` each (`{kind:"element", address:{section, path}}` |
  `{kind:"section", …}`), with a custom `targetsEqual` so re-selecting the same thing doesn't churn.
- **`rightTab`** — which right-rail flyout is open (a `category` id · `"search"` · `"inspector"` · `null`).
- **`liveEdit`** (`panels/Selection.tsx`) — a transient, uncommitted direct-manipulation edit (drag in
  flight).
- **`editing`** (`ElementAddress | null`) — the element whose inline text is being edited (+ `editCaret`,
  the viewport point where editing started).

"Becoming visible" = one of these turns non-null and a `Show`/`For` memo lights up. Selection itself is just
"set the `selection` signal"; everything in §6 is a reaction to it.

**Pixels → selection (`editor/Canvas.tsx`).** Each `draw()` paints the section stack (through the
per-section layer cache, §9) and gets back `{tops, regions, height}`. The draw is **windowed**: every
section is laid out, so `tops`/`height` (and therefore the scrollbar) stay exact, but only the sections
intersecting the viewport band are materialized, and only those contribute regions — nothing off-screen
can be hovered anyway. A section whose content hasn't loaded paints a kind-aware stand-in with its real
title (`canvas/render/placeholder.ts`) instead of a blank box. See `loading.md`. It publishes `regions` _and_
pre-parses them once into a flat `liveHits` array of `{target, specificity, box}`, so a hover test is a
numeric box-scan, not id-parsing per pointer move:

- **down** → records `pending = {target: hitTest(x,y), x, y}` — no selection yet.
- **move** → sets `hover` to the hit. A body drag never starts a move — moves start only from the
  DragHandle grip.
- **up** → `setSelection(pending.target)`; if that element's spec is `richText`, `startEditing` at the click
  point (so clicking body text drops you straight into editing).
- **`hitTest`** returns the highest-`specificity` region under the point → a deeper element (longer path)
  beats a shallower one beats the section.

Keyboard runs through the `@ui/keys` command registry (`editor/core/commands.ts`), gated by context flags
(`editor.hasSelection`, `editor.textEditing`, `present`, …): `Escape` walks up the tree via `parentTarget`;
`Delete`/`Backspace` removes + collapses the column; `⌘D` duplicates; `⌘C/X/V` copy/cut/paste the element
clipboard (paste lands through the same `place()` logic as a drop). Bindings are inert while a form field
or the inline editor has focus.

**The overlay stack.** All chrome is mounted as absolutely-positioned siblings over the `paintHost` inside
one stage div — the selection/hover rings (`Overlay`), the drop indicators + lift veil
(`panels/DropIndicators.tsx`), the drag/resize/divider handle layers, the section pill, the `ContextBar`,
the empty-region "+ Add element" affordance, the AI generate popup/stages, live video embeds, and the
inline `TextEditor`.

**Drag & drop (`editor/core/dnd.ts`).** The canvas never reflows during an element drag: the document
stays frozen, so the regions captured at drag start stay valid for the whole gesture. `computeDropSlots`
enumerates every droppable place ONCE into `DropSlot`s — target + indicator geometry (a line in a gap, a
region highlight for an empty container) + a hitbox — covering the five ops: replace an empty region,
insert into a container at a sibling gap (hitboxes tile the container at child midpoints, so there are no
dead zones), wrap a leaf root into a new row/col (four edge slots sharing the leaf's box), add a section
column (bands around column boundaries), or create a new section (bands between/above/below sections). A
move excludes the dragged subtree and the no-op gaps flanking the source. Per pointer move, `activeSlot`
is a hitbox lookup: the highest priority class wins (element < column < newSection), then the deepest
path, then the nearest indicator, with a small hysteresis margin so boundaries don't flap.
`DropIndicators` draws the slots (accent line/highlight for the active one, faint markers for the section
gaps and the hovered section's candidates); `LiftVeil` dims a move's source in place. The single mutation
happens at drop: `applyDrop` removes the source, re-aims the target path across the removal, places the
element, then **collapses** only the emptied source column (unrelated empty columns stay put).

**Section-level chrome** (`editor/panels/Selection.tsx`): **`SectionActions`** — one pill straddling a
section's bottom edge whenever any region inside it is _hovered_ (pinned while its popup is open): reorder
↑/↓ · Add section · Generate (AI) · Layout (opens `SectionLayoutPopup`) · background image · duplicate ·
delete. Sections also reorder by dragging the grip — a section drag runs through the same slot pipeline
(gap indicators + veiled source, no reflow; only the stack gaps are offered) — or from the minimap rail.

**Live edits & undo.** Every control write funnels through `commit(op(...))` with an optional `coalesce` key;
continuous gestures — slider/color scrubs and every handle drag — pass a stable key so the whole gesture folds
into **one** undo step. Handle drags additionally route through `liveEdit`: the canvas's `preview` memo paints
`applyLiveEdit(artifact, edit)` each frame (regions update so the handle follows the element as it resizes),
then commits the identical op once on release. Inline text edits update live with no history and record a
single snapshot when editing ends. `SchemaFields` derives its grouping only from the stable control _list_ and
reads each value through a getter, so editing a value never re-renders the panel structure (which would blur
the input mid-keystroke) — only a `visibleWhen` flip remounts a row.

## 7. Charts & diagrams (`canvas/elements/chart`, `canvas/elements/diagram`)

The two families split on one architectural line. **Charts are self-rendered surfaces**: the element's
`layout()` returns a node whose `surface.paint(g: DrawContext, box)` hand-draws the plot, synchronously,
on every edit/resize/theme/export — no chart instance, no animation loop, immediate-mode and stateless
like everything else. **Diagrams compose**: every type's `arrange` returns real engine boxes holding real
text children (item i's label is child 2i, its detail 2i+1, derived from the `items` string and written
back by `withChildren`), with a floated, chrome-only surface behind them painting connectors, bands, and
silhouettes. That is why diagram labels get inline editing, engine wrapping, `tokenScale`, selectable PDF
text, and editable PPTX runs for free, while a chart's axis ticks — derived data, not prose — stay
painted. Two registry-backed subsystems live inside the pure-TS canvas layer, below the element specs,
one per-type file each (no barrels, repo convention).

**The `DrawContext` (`canvas/engine/node.ts`).** A backend-abstract drawing API, coordinates local to the
element's box: `rect · line · circle · polyline · wedge · text` plus two additions that unlock the catalog —

- **`path(build, style)`** — a general bezier/arc sink. `build` receives a `PathSink` (a structural subset
  of the Canvas path API: `moveTo · lineTo · bezierCurveTo · quadraticCurveTo · arc · arcTo · rect ·
closePath`); the backend begins and closes the path. **d3-shape generators render straight into this** via
  their `.context()` protocol — the sink _is_ the interface d3 expects. Unlocks donut/annular arcs, smoothed
  lines, curved graph edges, treemap corners.
- **`measureText(text, style): { width }`** — advance widths for axis labels and legends
  (immediate-mode paint has no DOM to measure against). `canvasDrawContext` uses `cx.measureText`.
  Arranges size boxes **before** the solver runs through `LayoutCtx.measure` instead — the engine's own
  injected measurer (§8), so compose-time sizing and the layout pass can never disagree.

`DrawStyle` also carries **`gradient`** (a linear fill across the shape's bounding box) and **`shadow`**
(`{blur, dy, color}`), mirroring what `FillLeaf` already offers rects at the engine level — so depth and
soft elevation are backend capabilities, not per-element simulation. Support degrades honestly: canvas
builds a real `createLinearGradient` (deriving the extent per primitive, replaying a `path` build through
a bounds sink) and sets `shadowBlur`/`shadowOffsetY`; both SVG emitters resolve a gradient to a `<defs>`
`<linearGradient>` in `objectBoundingBox` units, and the DOM one adds an `feDropShadow` filter; the PDF
context flattens a gradient to the midpoint of its stops and drops shadows, since `drawSvgPath` paints one
flat color. Because a shadow blurs outside the shape and each surface paints into an `<svg>` sized exactly
to its box, renderers must inset enough for it to land.

Plot-area clipping is handled at the engine level (the node-level `clip?: {x?,y?}`, §2) rather than as a
`DrawContext` method. **Four** `DrawContext` impls exist: **`canvasDrawContext`** (Canvas 2D — present +
PNG/PPTX raster) and **`svgDrawContext`** (emits `<svg>`/`<path>` — the editor DOM backend, so every surface
is crisp vector on screen) in `canvas/render/backends.ts`; **`svgStringContext`** (`render/svg-emit.ts`, the
node-safe string emitter PPTX embeds); and **`pdfDrawContext`** (`render/pdf-draw.ts`, native PDF vector).

**Why d3, not a chart lib.** We take the proven **pure-geometry** engines (Chart.js / ECharts /
Observable Plot are all built on these same d3 modules internally) and paint them
ourselves through `DrawContext`. This stays inside `canvas/`'s pure-TS, DOM-free, `model`-only boundary,
keeps `Tokens` the single styling source, preserves synchronous `paint`, and rendered as crisp vector for
free the day `svgDrawContext` landed (§9). Installed, DOM-free, tree-shakeable deps: **d3-scale** + **d3-shape**
(scales + line/area/arc generators, cartesian charts) and **d3-hierarchy** (tree/treemap layouts, the org
chart). Authoring is structured controls
(pick a type, fill fields via the inspector / `DataGrid`), never a code surface.

**Data model.** Persisted data stays compact text (artifact JSONB). Two steps lift it: `toChartData` /
`toDiagramData` narrow the untyped stored record to the typed `ChartData` / `DiagramData` (each field
coerced, enums checked against their value-set, anything unrecognized dropped — so a hand-edited or
stale artifact can't smuggle a bad value into a renderer), then `normalize()` resolves that into the
structured runtime model, so old artifacts keep rendering (a legacy `kind` folds into `type`):

```ts
// chart/utils.ts — persisted
interface ChartData {
    type?: string; // "bar" | "line" | "pie" | … (drives the registry lookup)
    values: string; // series by newline, points by comma
    categories?: string; // comma-separated x labels
    seriesNames?: string; // comma-separated
    stacked?;
    smooth?;
    showValues?;
    showGrid?;
    height?;
}
// normalize(ChartData) → ResolvedChart { type, series: Series[], categories: string[], options }
interface Series {
    name: string;
    points: number[];
}
```

Diagrams carry `DiagramData { type?, items, itemsMeta?, links?, axes?, style?, shape?, numbers?,
height? }` → `ResolvedDiagram { type, items: DiagItem[], nodes, edges, axes, options }`.

- **`items`** is one entry per line, `"Label | detail | value"`, parsed to `DiagItem {label, body?, value?}`.
  Splitting prefers newlines and only falls back to commas when there are none, so a detail may contain a
  comma while legacy comma-separated lists keep parsing unchanged. `value` is read only where it means
  something (the funnel's proportional band widths). `formatItems` is the exact
  inverse, dropping empty trailing segments — the grid round-trips through it.
- **`itemsMeta`** is positional per-item presentation (`{color?, emphasis?, icon?, weight?}`, entry i
  styling item i), kept out of the item grammar so styling never leaks into a field users type into;
  truncated or padded to the item count at normalize, so an AI rewrite of `items` degrades safely.
- **`links`** are `"Parent>Child"` edges building the `org` hierarchy — the one graph type.
- **`axes`** is a per-type caption list: quadrant axis ends, matrix column-then-row headers.
- **`options`** (`style · shape · numbers`) reaches each type's arrange on `ResolvedDiagram.options` —
  no arrange re-reads raw data.

The inspector's `DataGrid` edits these as a spreadsheet (§6③).

**Registry entry.** Mirrors the element registry; adding a type = one file + one `registerChart(...)` /
`registerDiagram(...)`, no branch in a growing function, no engine change:

```ts
interface ChartType {
    // chart/utils.ts
    id: string;
    label: string;
    render(chart: ResolvedChart, ctx: PlotCtx): void; // PlotCtx: { g, W, H, theme, opts, colors }
}
interface DiagramType {
    // diagram/utils.ts
    id: string;
    label: string;
    icons?: false; // no room for a leading glyph (the bands)
    weights?: true; // rows split by item weight → the divider gesture resizes cells
    arrange(d: ResolvedDiagram, ctx: LayoutCtx, kids: EngineNode[], height: number): EngineNode;
}
```

`chart/render.ts` / `diagram/render.ts` side-effect-import every per-type file (so they self-register).
A chart's `layout` normalizes, looks up `getChart(type)` (falling back to `bar`) and calls `render`; the
diagram element's `container.arrange` does the same through `getDiagram(type)` (falling back to
`process`). Chart chrome lives in `chart/utils.ts`: `cartesianFrame`/`numericAxes` (axes, gridlines, nice
ticks via d3-scale), `legendRow`, `pieLike`, number formatting.

### 7.1 The composed vocabulary (`diagram/utils.ts`)

Every diagram type arranges through one shared vocabulary, so styling is fixed once rather than per type:

- **`diagramCell(label, detail, paint, opts)`** is the one cell every type composes: the item's real text
  children over a treatment fill (`NodePaint` mapped onto the engine `FillLeaf` — gradient, border, shadow
  included), the element owning tone the way the table owns its cells'. An `icon` opt floats a 16px
  `ICON_LIBRARY` glyph into a reserved leading inset (taking the number badge's slot, so the two never
  stack); `iconY: "start"` keeps it with a top-anchored label on a steps tread; `shape` composes the
  silhouette-aware form.
- **`decorate(paint, z?)`** is the chrome float behind (or above) the cells: a full-size surface painting
  connectors, bands, badges, and silhouettes from the same geometry formula the rows were built with —
  structure from shared math, pixel widths from the real box, so chrome can never desync from cells.
- **`nodePaint(color, theme, {style, emphasis})`** resolves the four treatments — `solid` (filled, slight
  depth gradient) · `tinted` (an opaque wash toward the page) · `card` (paper, hairline, soft shadow) ·
  `outline` — into `{fill, gradient, stroke, shadow, ink, dim, iconInk}`. Inks are **measured**, never
  assumed: `inkOn(fill, tokens)` (`@themes`) prefers the theme's own inks where one clears AA and falls
  back to the best candidate — on a dark theme `ink` is light, so no branch may guess. `iconInk` is the
  item color where the fill leaves room (tinted/card/outline) and the label ink on solid. `emphasis`
  promotes a node to solid whatever the artifact-wide style is (the org root, the hub centre).
- **Node silhouettes are a registry** (`registerNodeShape`): box-parametric `PathSink` builders — a
  chevron's notch derives from the node's height. A shape with `engineRadius` (rounded, pill) rides the
  cell's own fill, treatments included; an angled one (chevron, hexagon, diamond) composes the cell
  transparent and the type's decorate paints it with the full `DrawStyle`; `insetX` feeds the cell padding
  so labels clear the points, and `maxAspect` guards degeneration (a pill on a tall tread is an egg).
- **Badges.** `drawNodeBadge` puts the `numbers` option on each node's leading edge (a disc of the item
  color, `inkOn`-inked); `drawIconBadge` gives chrome-dwelling markers the same disc treatment — a
  timeline item's icon upgrades its spine dot to a milestone marker. An item's icon replaces its own
  number badge.
- **`labelWidth`/`maxLabelWidth`** measure single-line labels through `ctx.measure`, so arranges size
  cells from content: org cells fit their longest label capped by the per-leaf share, cycle/hub cells
  tighten the ring under the geometric cap, process wraps rows from the measured longest label, and a
  value-scaled funnel band never tapers narrower than its own label (`bandGeometry`'s per-item floor).
- **`cellChrome`/`cellHeights`** are the measuring pair the float-positioned types share: the first
  reports what a cell spends before its text (padding, the silhouette's inset at that height, a
  leading icon), the second what the label alone and the label-plus-detail need at the width that
  leaves. `org`, `flow`, and `mindmap` size their uniform cells from it and hide a detail the box
  cannot hold, which is what keeps a wrapped label inside its own node.
- **`itemWeight` + weighted rows** (process): each row splits its width by `itemsMeta` weight with a
  per-item label floor and weight-proportional redistribution — always feasible, since every floor is
  capped at the uniform column — so the divider gesture (§6④) resizes cells without ever wrapping a
  label past its box.
- **`drawLink`** draws straight or rounded-elbow connectors with a filled arrowhead;
  **`bandGeometry`/`bandsArrange`** are the shared pyramid/funnel trapezoids (transparent label cells over
  decorate-painted bands); **`buildTree`/`layoutTree`** (d3-hierarchy) place the org chart, its cells
  floated at tree positions with elbows behind, grown to measured content and capped so a detail that
  cannot fit hides rather than spills.

**Mark colors are page-aware and opaque** (`@themes`). `accentRamp(tokens, n)` steps the accent toward
the page — white on a light page (the shipped tint look), the page itself on a dark one, where tinting
toward white collapses every step into the same pale card (carbon's near-white accent vanished entirely).
`seriesColors` and `diagramColors` both delegate to it; `itemColors` punctures the ramp with per-item
`itemsMeta` color overrides (hex, or a theme role name that stays live across theme changes); the tinted
wash runs through the same `pageMix`. On a dark **section** of a light theme, `composeSection`'s token
swap lifts a dark accent by raising HSL lightness — hue preserved, where a channel-space mix toward white
washed it to gray.

**Fitting is the arranges' contract.** A decorate surface paints into an `<svg>` sized exactly to its
box, so anything outside is silently clipped away — and real text children must never spill their cells.
Arranges therefore derive sizes from the space each row/ring/band actually gets and from measured labels,
and suppress a detail line a capped cell cannot hold (org) rather than overflowing it.
`visual-invariants.test.ts` asserts the mechanical half across a matrix of types × item counts × sizes ×
shapes × options × **two themes** (studio, and carbon as the adversarial dark case): ten invariants —
clip safety, connectors-in-gaps, badge attachment and label separation, shape proportion, text
containment, 3:1 label contrast, occlusion, label alignment, caption clearance. `diagram.test.ts` pins
each type's command profile and the sizing/weight/meta behaviors.

**Type catalog — built.** _Charts (15):_ bar · column · line · area · pie · donut · radar · scatter ·
bubble · gauge · heatmap · treemap · waterfall · pack · progress. `bar` is horizontal and `column`
vertical, as everywhere else; a funnel is a diagram, since the composed one has editable labels and
per-item styling. _Diagrams (16):_ process · steps · cycle · pyramid · funnel · timeline · quadrant ·
matrix · hub · org · target · venn · pictogram · flow · mindmap · roadmap. The relational three carry
their own layouts — `org` and `mindmap` over d3-hierarchy (`mindmap` splits the root's branches either
side of centre), `flow` over a small layered pass in its own file (rank by topological sweep, order by
barycentre, orthogonal elbows) rather than a graph-layout dependency, since a slide holds ten nodes,
not ten thousand. `venn` is the one type that fills translucently: an overlap that cannot be seen
through is not a Venn.

**One name, one home.** A type belongs to exactly one family, guarded by a test that the two
value-sets never intersect. The line: a **chart** is continuous geometry computed from numbers (axes,
arcs, areas), a **diagram** is discrete labeled items in a designed composition. That is why the
funnel, the pictogram, and the roadmap are diagrams even though each shows quantities.

**Built vs deferred.** The whole `DrawContext` foundation (`path`/`measureText`/`gradient`/`shadow`), the
d3-scale/shape/hierarchy registries, the two catalogs above, and per-item styling end-to-end (`itemsMeta`
color/emphasis/icon/weight; `DataGrid` columns + the AI-catalog field; divider-drag weights on `process`)
are shipped (editor inspector + `DataGrid` + PDF/PPTX export). Deferred breadth (§10): the dropped seven
re-entering composed, sankey/sunburst/waterfall/histogram, d3-array / d3-sankey, and hover tooltips.

## 8. The render bridge — compose → commands (`canvas/render/commands.ts`)

The engine is format-blind; the bridge is what turns a `Section` into paintable commands and chooses the
framing. It injects the memoized Canvas 2D `measureText` — into `layout()` **and**, via `ctxFor`, into
`LayoutCtx.measure`, so a caller that supplies its own measurer has it honored at compose time too and
compose-time sizing (a diagram's node widths) can never disagree with the layout pass — then offers two
entry points:

- **`layoutSection`** — the default (doc / web / thumbnails). `composeSection` → `layout` at the profile
  width and an unbounded height → `{ commands, regions, height }` where `height` is the natural bottom of
  the content. Sections stack with a fixed `SECTION_GAP`.
- **`layoutSlide` / `sectionSlides`** — the deck path. Each section is fit to its `sectionFrame` (§3.1 —
  1280 wide, 720 tall unless `section.frame.aspect` overrides): short sections stretch to fill and center
  (`prepareSlideNode`); a text+image split whose image would overflow cover-fits the dominant media
  (`coverFitMedia`) so it fills the frame instead of scaling the whole section down. `sectionSlides` is what
  Present + export both render from — it returns one scaled slide, or several pages when a section exceeds
  `PAGINATE_ABOVE` (1.2×) its frame.

Paged export/pagination cuts a tall flow into pages: **`fragment`** (`engine/layout.ts`) slices a command
list into page-height chunks, breaking at a clean edge and never through a block ("good, not optimal"
greedy). Continuous formats skip it on screen.

Fitting a logical layout into a physical viewport (minimap thumbs, present) is one shared formula in
`canvas/render/backends.ts` — `scaledHostCss` / `fitSlideContent`: lay out at the logical width, then
CSS-scale the host to fit. Layout math never changes; only the transform does. (The old `canvas/render/present.ts`
was folded into `backends.ts`.)

### 8.1 Rendering a section at a shape that isn't its own (`canvas/render/fit.ts`)

Scaling a layout only changes its size, never its proportions, so a section whose natural shape differs
from the frame can only be cropped or letterboxed. The way out is that **a section has no intrinsic
aspect ratio**: it is a flow, so its height is a function of width, `H(W)`. "Does this fit 16:9" is the
wrong question — the right one is "at what width does this _become_ 16:9".

`fitSectionToFrame(section, frame, …)` solves `H(W)/W = frame.h/frame.w` and returns the commands laid
out at that width. `H(W)` is non-increasing, so `H(W)/W` strictly decreases and there is at most one
crossing; text-dominated content also roughly conserves area (`H·W ≈ A`), which gives a closed-form
second probe rather than a blind search. Typical cost is 3–4 layouts (~0.04ms), capped at 6.

Two things it deliberately handles rather than assumes away:

- **Wrapping is a step function.** `H` jumps by a line-height as breaks change, so the crossing often
  falls _inside_ a jump and no width matches exactly. The tolerance is 5% (≈2% margin per edge,
  invisible at thumbnail scale) and the best probe is always returned.
- **Aspect-locked media puts a floor under the ratio.** A photo's height _grows_ with width
  (`h = colW/aspect`), so once it dominates, `H(W)/W` flattens at a value no width can cross — a lone
  photo is the degenerate case, detected in two probes by the log-log slope. When reflowing cannot reach
  the target, the solver falls back to the **paged** path, where `coverFitMedia` lets a dominant photo
  absorb slack instead of holding its aspect; that makes the section take the frame's aspect exactly.
  Cover-fit only works once the _rest_ of the section already fits the frame, which is itself a function
  of width (at a narrow width the text alone can be taller than the frame, leaving nothing to absorb), so
  the fallback tries it at 1×, 2× and 4× the frame width. Only if that also fails is the canonical width
  returned with `exact: false` for the caller to letterbox.

**Who uses it.** Only a view at a shape that is not the section's own — today the 16:9 thumbnails of a
**continuous** artifact, where there is no page shape at all and no canonical width (a doc reflows to the
viewport; `previewContentProfile` already widens it), so choosing the width that fits the card is no more
a fiction than choosing 816. A **paged** artifact's thumbnail does _not_ use it: that card already is the
section's own frame, so it renders through `sectionSlides` as its own page.

**Who must not.** Present and export of an artifact in its own format. A deck slide is canonically 1280
wide, and reflowing it would change the line breaks the author sees — "what you edit is what ships" is
not tradeable for fill.

## 9. Paint backends (`canvas/render/backends.ts`)

One `RenderCommand[]` → multiple serializers:

- **DOM** — absolutely-positioned divs, used for editing (so text selection / contenteditable work). A
  self-painted `surface` command paints into a nested `<svg>` via `svgDrawContext`, so charts / diagrams /
  icons / shapes / graphics are crisp vector on screen. That `<svg>` is sized to the command's box and
  clips to it, which is why surface renderers must keep their geometry inside (§7.1).
- **2D canvas** — mirrors the DOM output; reused for Present and PDF/PNG/PPTX export, so _what you edit is
  what you export_. `canvasDrawContext` (the raster `DrawContext`) lives here for the self-painted surfaces.

Both honor each command's `clip` rect (CSS clip-path / canvas clip).

The stack painter keeps a **per-section layer cache** keyed on section identity (ops never mutate, so an
untouched section reuses its whole laid-out DOM layer) plus layout width / theme / profile / the
inline-edit `hideId` — so a keystroke re-lays-out one section, not the document. `paintReconcile` reuses
child `<div>`s slot-for-slot, resetting each so a kind change can't inherit stale styling.

## 10. Status & deferred

**Built:** the engine, all three format views + per-section `frame.aspect`, compose from the recursive root +
the layout presets, the full element contract (56 types) with skeletons + direct-manipulation sizing (one
divider system — slot-aware inside closed containers — edge-drop columns, collapse-on-empty), the
chart/diagram registries (d3) over a
shared node/connector vocabulary, DOM + canvas backends, PDF/PNG export, deck present, PPTX export.

**PPTX export** (`render/pptx.ts` — the whole exporter in one file: RenderCommand→spec mappers, font
embedding, and the slide-assembly shell) — every artifact exports as a **deck** (all formats run through the
deck profile's `sectionSlides`; tall sections paginate into several slides), one PowerPoint slide per page.
It's a **native hybrid**: `rect` → autoshape, `text` → an editable text box per leaf with styled runs and the
engine's own line breaks baked in (`wrap`/`autoFit` off, so PowerPoint never re-flows — the reflow concern is
designed out, not lived with); self-painted `surface`s (charts/diagrams/icons/graphics) embed as **vector
SVG** (`svgStringContext` → `addImage`; pptxgenjs writes the `<asvg:svgBlip>` dual-blip with an auto PNG
fallback, so they stay crisp in modern PowerPoint); only `image` + gradient/clipped rects rasterize to PNGs
positioned at their box, so nothing is dropped. Theme fonts are **embedded**: the woff2 the app already loads
is fetched from Google, transcoded to TTF (wawoff2), and injected as OOXML embedded fonts (zip post-process
via JSZip) so the exact typeface renders anywhere with no "missing fonts" prompt — degrading gracefully to an
un-embedded export on any failure.

**Vector PDF** (`render/pdf-draw.ts` + the native path in `render/export.ts`) — the PDF exporter is
**command-native**, not a page raster: it walks the same `RenderCommand[]` and emits `text` as real
selectable/searchable text (fonts embedded via `@pdf-lib/fontkit` + the shared `fetchFontTtf`), `rect` as
native vector, and self-painted `surface`s through a third `DrawContext` — **`pdfDrawContext`** — that turns
each primitive into `page.drawSvgPath` ops (path `d` strings from the shared `buildPathData`), y-flipped for
PDF's bottom-left origin. Only photos and gradient/clipped rects rasterize (no native vector form). Any
failure (font fetch, pdf-lib) degrades to the legacy full-raster exporter (`export*PdfRaster`). Result: crisp
vector at any zoom, selectable text, and far smaller files. `fill-rule: evenodd` is the one known gap
(`drawSvgPath` fills nonzero), affecting only rare imported even-odd SVG.

### Planned / deferred

**New formats (social / print / custom sizes) — the resolution path is built, the formats are not.**
`ArtifactContent.page` + `profileFor` + `pagedSize` (§3.2) shipped, so a paged artifact already renders,
presents, and exports at an arbitrary W×H. What is still missing before a Gamma-style format matrix
(Square 1:1, Portrait 4:5, Story 9:16, Poster, A4, Letter) is real work, in rough dependency order:

- **Framed editing.** `paintSectionStack` lays out every section at its natural content height, whatever
  the format; a deck only becomes 16:9 in Present/Export. That drift is tolerable for a deck and wrong for
  a square or 9:16 card, where the shape _is_ the point. Two approaches: **(1)** lay each section out at
  frame dims and paint 1:1 (needs `layoutSlide` to return `regions`; no scale factor, so every overlay
  keeps working in unscaled coords), or **(2)** scale a fixed W×H layer to fit — true WYSIWYG for short and
  tall content, and it would let deck opt in, but it rewrites the coordinate model of every overlay
  (`panels/Selection.tsx`, `ControlBars.tsx`, `TextEditor.tsx`, `Canvas.tsx`'s `hitTest`, `core/dnd.ts`).
  Approach 1 is throwaway work if we later want (2), so pick before writing code.
- **Registry-derived format lists.** Format ids are hand-maintained in `ui/formats.ts`,
  `app/stores/library.ts` (label/icon ternaries), `ThemeEditor`, `TemplatesView`, `generate/prompts.ts`,
  and the closed `Surface` unions in `@model/ai` + `app/stores/generate.ts`. Adding a format should be one
  `PROFILES` entry, not a dozen edits.
- **Presets + a dimension editor** (two number inputs, lock-ratio, swap, preset chips) and a grouped format
  picker; **"sections" → "pages"** copy for a card format; **doc page sizes** (Letter/A4 — today's doc PDF
  emits one variable-height page per section at A4 width, not real paper pages); generation vocabulary per
  surface (arcs/rubric are written for deck/doc/web).

**A free-form design canvas** (Gamma's "Graphic") is a different thing again: absolute placement rather
than flow. The engine's model is deliberately flow-based, so that is a second layout mode, not a size.

**Charts & diagrams breadth** — of the seven types dropped when diagrams went composed, five are back
(flow, mindmap, venn, target, roadmap); `tree` stays folded into `org` and `honeycomb` has not earned a
return. Still open: an area-proportional venn (the shipped one draws symmetric circles, which is what
the presentation tools draw); sequence/UML/ERD are deliberately **out of scope**, since they are the
diagramming tools' ground rather than a content tool's. More chart types (sankey via d3-sankey ·
sunburst, which needs a nested chart data shape we do not have · histogram via d3-array bins); weights
on `steps`/`timeline` (the mechanism is per-type opt-in); **hover tooltips / click** (surfaces are
static — needs editor-level hit-testing over the surface box); a **drift-guard script**
(`pnpm check:elements`) generalizing the `DIAGRAM_TYPES` assertion in `diagram.test.ts` to charts + the
AI catalog (§5.3).

**Rendering core** — engine-native rich text (`@model/text` is scaffolded; the editor uses a contenteditable
overlay today); free-form / bento grid spanning; native (editable) PowerPoint charts — charts export as vector
SVG images (crisp, not editable) today; the **AI vector tool** (a turn-protocol tool emitting a `Vector` for
the `graphic` element — the substrate is in place, the tool is not wired); relayout-boundary caching (not
needed at current scale). **Vector export is now built** (§10) — a third rasterization path only remains for
gradients/clipped content and photos, which have no native vector form.

See `architecture.md` for the file map, `ai.md` for how the streamed edit protocol drives these same content
ops, `frontend.md` for the shared `@ui` control kit the inspectors are built from, and `testing.md` for the
canvas/element test suites.

## Present, and narrating it

There is **one** present surface, `@ui/present`'s `PresentSurface`. The editor's overlay
(`editor/Present.tsx`), the standalone `/present/:id`, and the published `/p/:slug` viewer are all
thin callers of it. The editor used to reimplement the surface against its own store, which is why a
section taller than its frame showed only its first page there while the same deck paginated
correctly everywhere else; the convergence removed that render loop rather than patching it.

Props switch the parts that differ: `overview` adds the slide grid on `O`, `notes` adds the
presenter's pane on `N` (never set on publish, and the public payload carries no notes anyway),
`narration` wires the player, and `viewOnly` drops the fullscreen control.

**The step model** is what lets one player drive both format kinds. A step is one screenful of one
section: a slide page in a paged format (`pagedSteps` over `sectionSlides`), a viewport-height chunk
of the stack in a continuous one (`continuousSteps` over the painted `sectionTops`). Narration plays
one track per **section** and steps through that section's screens at `stepHoldMs` intervals, so a
three-page slide over a thirty-second track turns a page every ten seconds rather than talking about
content still below the fold. All of it is pure and lives in `canvas/render/present.ts`.

Playback (`@ui/narration`) owns one `<audio>` and knows nothing about slides or scrolling: the
surface hands it `goToSection`, and it advances on `ended`. A section with no notes is skipped
outright, which is what a hero or a footer on a site wants; a section that has notes but no prepared
audio dwells instead, because someone meant to narrate it. Manual navigation retargets the audio
(debounced 400ms in continuous formats), and while narration is playing Space becomes play and pause
with the arrows still stepping. Autoplay with sound is blocked by browsers, so a narrated piece always
starts from one gesture.
