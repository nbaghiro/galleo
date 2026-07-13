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
`RenderCommand.clip`).

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
deck reads big and a doc reads dense — _styling_, never content), `splitMinWidth`, and pagination policy
(`paginate: always | export | never`). `resolveProfile(id)` returns the descriptor; `DEFAULT_PROFILE` is
deck. Because dimensions are data, a custom size or a draggable/resizable canvas is a data change, not new
layout code.

### 3.1 Per-section framing — what shipped (`slideFrame`)

The one custom-size hook that actually landed is **per-section**, not per-artifact. `Section.frame?.aspect`
(`@model/artifact` — `SectionFrame { aspect?: number }`, honored only for paged rendering) lets a single
slide override its shape. `slideFrame(section, profile)` (`profile.ts`) resolves the paged frame a section
renders into: width stays the profile's page width (1280 for deck); height is the profile height (720) — or
`round(width / aspect)` when the section sets one. The deck path (`sectionSlides`, §8) reads `slideFrame`
per section, so a deck can mix a 16:9 slide with a square or tall one without any new profile.

The broader **artifact-level custom page sizes** (a `flex` format whose W×H lives on the artifact, with a
presets table) was designed but **not built** — see §10. Only `section.frame.aspect` is live today.

## 4. Compose — Section → EngineNode (`canvas/elements/compose.ts`)

A section's content is **one recursive tree** — `section.root`, a container (`group` laid out as a `row`
for columns / `col` to stack) nesting to any depth, or a bare leaf for a full-width section. `composeSection`
turns it into an engine tree:

- **Root tree.** `composeElement` recurses `root`. Columns are just the root row's children, each carrying
  a `layout.width` fraction (`@model/section` builds these; the migration from the old `grid`/`cells` shape
  is gone). An empty container composes to the dashed "drop element" placeholder, so an empty column and an
  emptied group are the same thing.
- **Per-instance layout.** `applyLayout` maps each element's optional `ElementLayout` (width
  `fit`/`fill`/`{pct}`, height `fit`/`fill`, cross-axis `align`, corner `radius`) onto the node.
- **Region ids.** Every element node is tagged with a stable **path** id (`section:…` / `el:<section>` for
  the root / `el:<section>:0.1` for a grandchild), so the engine reports its box for selection + overlays.
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
    container?: { children; arrange; withChildren }; // for group / card / composite blocks
    // studio-only affordances (inert for layout / export):
    richText?;
    bar?;
    frame?; // universal corner-radius (and image zoom) control
    skeleton?;
    fallback?;
    resize?;
    spacing?;
}
```

A **generic inspector** renders `controls` for every element — no bespoke panel per element in the common
case. `register(spec)` adds it to the registry (`getElement`/`listElements`/`walkElements`); the palette,
AI catalog, and serialization are all registry-driven, so **adding an element is adding a spec — zero
engine changes**.

**Studio-only spec fields** (optional, read solely by the editor — inert for layout/present/export):

| Field             | Drives                                                                                                        |
| ----------------- | ------------------------------------------------------------------------------------------------------------- |
| `richText?`       | primary text takes inline marks → the contenteditable overlay + the inline mark bar (only `text`)             |
| `bar?: string[]`  | which `controls` keys appear on the floating format bar                                                       |
| `frame?: boolean` | element has a visible frame → the universal corner-radius control on the bar                                  |
| `resize?`         | canvas drag handles: `height` (a data key) / `aspect` (`data.aspect`); width is a universal `ElementLayout` % |
| `container?`      | `{children, arrange, withChildren}` — recursion + generic insert/remove for card/group/composite blocks       |
| `skeleton?`       | palette + drop-preview ghost; auto-derived from `skeletonize(layout(create()))` if absent                     |
| `fallback?`       | interactive → static substitution for paged/export                                                            |

`ControlField[]` is the schema the generic inspector + format bar both render (control kinds: `select`,
`segmented`, `align`, `slider`, `toggle`, `color`, `number`, `text`, `media`, `icon`, `iconColor`), with
per-field `group` (inspector heading) and `visibleWhen` (conditional).

**Two ways an element compiles to boxes:**

1. **Primitive subtree** — returns a tree of `text`/`image`/`fill` nodes the engine lays out. Most
   elements (text, lists, cards, stats, tables).
2. **Self-rendered surface** — returns a sized node with a `surface.paint(g, box)` callback; the engine
   resolves the box, the element paints into it through a backend-abstract `DrawContext` (canvas in the
   editor, vector once a vector backend lands). Used by charts and diagrams (§7).

**Skeletons** (`skeletonize` in `elements/spec.ts`) — every element has a structural ghost
(bars/blocks/pills) shown in the palette and as the live drop preview; auto-derived from `layout(create())`
unless the spec overrides it (`skeletons.ts` holds reusable ghosts for the chart/diagram tiles). Because
it's real engine output, previews can't drift from the element.

### 5.1 Where elements live

One file per element under `canvas/elements/<category>/`, plus the shared machinery at the root:

```
canvas/elements/
  spec.ts        ElementSpec + ControlField, the registry (register/getElement/listElements/walkElements),
                 SECTION_CONTROLS, ghost builders (bar/block/pill/dot) + skeletonize/skeletonFor
  compose.ts     composeSection/composeElement (section.root → EngineNode), PRESETS, dark-bg adaptation
  ops.ts         pure immutable content edits over the root tree by PATH (get/set/insert/remove/duplicate,
                 collapse-on-empty, addColumn, applyLayoutPreset, section bg/bleed)
  skeletons.ts   reusable structural ghosts for chart/diagram palette tiles + drop previews
  dropghost.ts   the internal __dropghost element (the live drop preview)
  register.ts    the manifest — side-effect-imports every element file (pulled in by editor/register.ts)

  text/      text · bullets("List") · callout · code · quote
  media/     image · gif · illustration · sticker · icon · video · avatar   + shared.ts (imageLike factory)
  table/     table · stat
  composite/ card · group · feature · profile · testimonial · pricing · cta · faq   + shared.ts (composite factory)
  chart/     element.ts (chartSpec + VARIANTS) · render.ts · utils.ts · one renderer per type (bar.ts …)
  diagram/   element.ts (diagramSpec + VARIANTS) · render.ts · utils.ts · one renderer per type (process.ts …)
  basic/     badge · button · divider · embed · gradient · shape · spacer
```

The **folder is code organization; the palette grouping is each spec's `category`** — `basic/` deliberately
mixes several categories' worth of small primitives into one folder. `canvas/elements/register.ts`
side-effect-imports every element file at startup (that's when each `register(spec)` fires);
`editor/register.ts` imports it plus the editor-side registrations.

### 5.2 The catalog

**57 registered types, 52 palette-visible.** Hidden from the palette (`Panel.tsx` `HIDDEN`): `group`,
`avatar`, `__dropghost`, and the back-compat `chart`/`diagram` catch-alls (the per-type tiles are the real
entries). Palette rail order + labels (`editor/chrome/Panel.tsx` `CAT_ORDER` / `CAT_LABEL`):

| Rail (label)  | `category`  | Elements (tier)                                                                                                                                                                                                 |
| ------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Text**      | `text`      | text (primitive, the only `richText`), bullets/callout/code/quote (smart)                                                                                                                                       |
| **Media**     | `media`     | image · gif · illustration · sticker · icon (primitive), video (interactive); _avatar (hidden)_                                                                                                                 |
| **Table**     | `table`     | table · stat (smart)                                                                                                                                                                                            |
| **Composite** | `composite` | card (container), feature · profile · testimonial · pricing · cta · faq (smart); _group (hidden container)_                                                                                                     |
| **Charts**    | `chart`     | 13 smart variants: `barChart` `columnChart` `lineChart` `areaChart` `pieChart` `donutChart` `radarChart` `scatterChart` `bubbleChart` `funnelChart` `gaugeChart` `heatmapChart` `treemapChart`                  |
| **Diagrams**  | `diagram`   | 12 smart variants: `processDiagram` `cycleDiagram` `pyramidDiagram` `funnelDiagram` `timelineDiagram` `vennDiagram` `quadrantDiagram` `matrixDiagram` `treeDiagram` `orgDiagram` `mindmapDiagram` `flowDiagram` |
| **Basic**     | `basic`     | badge · button · divider · embed · gradient · shape · spacer (primitive; embed is interactive)                                                                                                                  |

The taxonomy was **consolidated** from an earlier set: `data` → **Table**, `container` → **Composite**, and
`interactive` / `branding` / `decoration` / `layout` all merged into **Basic**. (An earlier plan proposed a
`chrome/` seventh category; the shipped seventh is **`basic/`**.)

**Two families with a factory + a render/element split:**

- **Composite blocks** (`composite/`) are `container`s assembled from real `text`/`avatar`/`button` children
  via `composite/shared.ts`, so every child stays individually selectable.
- **Charts & diagrams** register their variants from `chart/element.ts` / `diagram/element.ts` (a
  `chartSpec`/`diagramSpec` factory over a `VARIANTS` array). The element `type` (e.g. `barChart`) differs
  from the internal **render-type** (`bar`) that self-registers when `chart/render.ts` side-effect-imports the
  per-type file (`bar.ts`). Each element's `layout` returns a `surface` node whose `paint` calls the
  renderer — so **d3 + dagre live only inside those renderers**, invisible to the engine (§7).

### 5.3 Value-sets & the drift guard

`model/elements.ts` holds the shared enum value-sets — the pure contract the specs build their `controls`
options from, so canvas UI and the AI catalog can't drift: `TEXT_STYLES`/`TEXT_ALIGN`/`BULLET_MARKERS`/
`CALLOUT_TONES` (text), `IMAGE_FIT` (media), `CARD_STYLES`/`CARD_SHAPES`/`FLEX_DIRECTION` (composite),
`BUTTON_VARIANTS`/`BUTTON_SIZES`/`BUTTON_SHAPES` (basic), plus **`CHART_TYPES`** / **`DIAGRAM_TYPES`**
(+`GRAPH_DIAGRAM_TYPES`) and the outline `BLOCK_KINDS`. `table` shares no enums (stat/table are plain scalar
fields), so it has none. Each element imports the specific const it needs and maps it to UI labels locally.

`CHART_TYPES`/`DIAGRAM_TYPES` are the `data.type` discriminants kept **in lockstep** with the canvas
chart/diagram registries. A drift guard asserting `model` value-sets == the registered canvas ids (and that
every AI-catalog element `type` is registered), wired as `pnpm check:elements` + pre-commit, is a planned
convention — enforced today only by the lockstep comments and the unit tests, not yet an automated script.

## 6. Selection & direct manipulation (`editor/select`, `editor/inspect`, `editor/canvas`)

A single `selection()` signal in `editor/editor.ts` (`{kind:"element", address}` | `{kind:"section", …}` |
`null`) drives **four independent surfaces**. Every surface is positioned from the engine's `Region` boxes
(the box of each id'd node), so the UI can never drift from what's painted.

**① Floating format bar** — `editor/inspect/format-bar.tsx` (`ContextBar`). Renders for a selected element,
anchored just above its region box (flips below if it would clip; hidden mid-drag). Contents, in order:
the spec's `bar` keys resolved to their `ControlField`s and rendered **compact** (same `Field` dispatcher as
the panel, labels dropped) → the **universal radius** slider (only when `spec.frame`, written to
`ElementLayout.radius`, not element data) → **rich-text marks** (`MarkControls`, only while editing a
`richText` element) → **align** (only when the element has horizontal slack in its parent) → **duplicate** →
**delete**. Continuous slider/color drags coalesce into a single undo step.

**② Docked right panel** — `editor/chrome/Panel.tsx`: a vertical icon rail + a flyout that shows either the
**palette** (tiles grouped by `category`, or a search) or the **inspector**. The routing hinges on
`elementInline` — an element skips the docked inspector (bar-only) when:

```ts
if (spec.richText || spec.container) return true;
const bar = spec.bar ?? [];
return spec.controls.length > 0 && spec.controls.every((c) => bar.includes(c.key));
```

i.e. rich-text, containers, or any element whose every control already lives on the bar (the panel would add
nothing). Otherwise a `createEffect` auto-opens the inspector for the selection.

**③ Inspectors + control kit** — `editor/inspect/inspectors.tsx` + `fields.tsx`:

- **ElementInspector** renders `spec.controls` through `SchemaFields` — grouped by each field's `group`,
  each gated by `visibleWhen`, dispatched by control kind to the shared primitives (`Segmented`,
  `SliderRow`, `ColorField`, `MediaField`, `IconField`, …). It deliberately omits spatial props
  (width/height/align/gap/padding) — those are canvas handles. **Charts/diagrams are special**: their
  `dataShapeFor()` returns a structured shape, so the inspector hides the raw data keys and renders an inline
  **`DataGrid`** (a spreadsheet-style editor, `editor/inspect/DataGrid.tsx` + `data-model.ts`) instead.
- **SectionInspector** — a **layout-preset** picker (live thumbnails; `applyLayoutPreset` sets the column
  count + width ratios — a helper, not a stored mode; the active preset lights up by matching current
  widths) followed by the generic `SECTION_CONTROLS` (bleed + background) through the same `SchemaFields`.

**④ On-canvas handles** — `editor/select/handles.tsx`, all live-previewed through a shared `liveEdit` signal
(the canvas reflows per frame, commits on release):

- **ResizeHandles** — a single **bottom-edge** strip (corner/width handles were removed) → `resize.height`
  (a data key) or `resize.aspect` (`data.aspect`).
- **RegionDividers** — the **primary width affordance**, ONE mechanism at every depth: thin `col-resize`
  bars between any two side-by-side siblings — the section's columns (the root row's children) or a nested
  row — each writing that child's `ElementLayout.width.pct`.
- **Spacing** — for containers, drag a grip between children (gap) or at the content inset (padding).

Net: an element's entire editing surface is assembled from its `ElementSpec` — `bar` picks the quick
controls, `controls` fills the panel, `frame`/`resize`/`container` light up canvas affordances, and
`richText`/`dataShapeFor` swap in the specialized editors (inline text marks, chart/diagram grid).

### 6.1 How it's wired (the reactive spine)

None of the surfaces above query the DOM to find an element. They read a handful of signals in
`editor/editor.ts` and position themselves from the engine's `Region` boxes. **Five signals** carry the
whole interaction:

- **`regions`** — `Region[]` the canvas republishes on every paint; each is `{ id, box, radius }` in
  canvas-content coords. The region `id` (`section:…` / `el:<section>` for the root / `el:<section>:0.1` by
  path) is the join key between engine output and UI — the single source of geometry for every overlay.
- **`selection` / `hover`** — a `Target | null` each (`{kind:"element", address:{section, path}}` |
  `{kind:"section", …}`), with a custom `targetsEqual` so re-selecting the same thing doesn't churn.
- **`rightTab`** — which right-rail flyout is open (a `category` id · `"search"` · `"inspector"` · `null`).
- **`liveEdit`** (`select/handles.tsx`) — a transient, uncommitted direct-manipulation edit (drag in flight).
- **`editing`** (`ElementAddress | null`) — the element whose inline text is being edited.

"Becoming visible" = one of these turns non-null and a `Show`/`For` memo lights up. Selection itself is just
"set the `selection` signal"; everything in §6 is a reaction to it.

**Pixels → selection (`editor/canvas/Canvas.tsx`).** Each `draw()` paints the section stack and gets back
`{tops, regions, height}`. It publishes `regions` _and_ pre-parses them once into a flat `liveHits` array of
`{target, specificity, box}`, so a hover test is a numeric box-scan, not id-parsing per pointer move:

- **down** → records `pending = {target: hitTest(x,y), x, y}` — no selection yet.
- **move** → sets `hover` to the hit; _or_, if `pending` is an element dragged past `DRAG_THRESHOLD`,
  promotes to a drag-move (drop handled by `canvas/dnd.ts`).
- **up** → `setSelection(pending.target)`; if that element's spec is `richText`, `startEditing` at the click
  point (so clicking body text drops you straight into editing).
- **`hitTest`** returns the highest-`specificity` region under the point → a deeper element (longer path)
  beats a shallower one beats the section. `Escape` walks up the tree via `parentTarget`; `Delete`/`Backspace`
  removes + collapses the column; `⌘D` duplicates; arrows reorder a selected section. Keys are ignored while a
  form field or the inline editor has focus.

**The overlay stack.** All chrome is mounted as absolutely-positioned siblings over the `paintHost` inside
one stage div — the selection/hover rings (`Overlay`), the handle layers, the section-level surfaces, the
`ContextBar`, and the inline `TextEditor`. There's no separate drop indicator: a drop previews by reflowing
the painted section around an inline ghost, not by an overlay.

**Drag & drop (`editor/canvas/dnd.ts`).** A drag resolves against the engine regions to ONE of four ops —
replace an empty region, insert into a container, wrap a leaf into a new row/col, or add a section column
(dragging to a section edge / column gutter). A move removes the source, places the element, then
**collapses** only the emptied source column (unrelated empty columns stay put). `previewDrop` runs the
identical path, splicing an inline ghost of the dragged element — the real element dimmed for a move, its
skeleton for a new-from-palette drop — so the live reflow matches the drop exactly, at every drop target.

**Section-level chrome** (`editor/select/selection.tsx`):

- **`SectionActions`** — a pill straddling a section's bottom edge whenever any region inside it is _hovered_:
  Add section / Generate (AI) / Layout (selects the section).
- **`SectionToolbar`** — reorder ↑↓ / duplicate / add-below / delete, shown when a `section` is _selected_.

**Live edits & undo.** Every control write funnels through `commit(op(...))` with an optional `coalesce` key;
continuous gestures — slider/color scrubs and every handle drag — pass a stable key so the whole gesture folds
into **one** undo step. Handle drags additionally route through `liveEdit`: the canvas's `preview` memo paints
`applyLiveEdit(artifact, edit)` each frame (regions update so the handle follows the element as it resizes),
then commits the identical op once on release. Inline text edits update live with no history and record a
single snapshot when editing ends. `SchemaFields` derives its grouping only from the stable control _list_ and
reads each value through a getter, so editing a value never re-renders the panel structure (which would blur
the input mid-keystroke) — only a `visibleWhen` flip remounts a row.

## 7. Charts & diagrams (`canvas/elements/chart`, `canvas/elements/diagram`)

Charts and diagrams are **self-rendered surfaces**: the element's `layout()` returns a node whose
`surface.paint(g: DrawContext, box)` hand-draws the chart, synchronously, on every edit/resize/theme/export.
There is no chart instance, no animation loop — immediate-mode and stateless, like everything else. Two
registry-backed subsystems live inside the pure-TS canvas layer, below the element specs, one per-type file
each (no barrels, repo convention).

**The `DrawContext` (`canvas/engine/node.ts`).** A backend-abstract drawing API, coordinates local to the
element's box: `rect · line · circle · polyline · wedge · text` plus two additions that unlock the catalog —

- **`path(build, style)`** — a general bezier/arc sink. `build` receives a `PathSink` (a structural subset
  of the Canvas path API: `moveTo · lineTo · bezierCurveTo · quadraticCurveTo · arc · arcTo · rect ·
closePath`); the backend begins and closes the path. **d3-shape generators render straight into this** via
  their `.context()` protocol — the sink _is_ the interface d3 expects. Unlocks donut/annular arcs, smoothed
  lines, curved graph edges, treemap corners.
- **`measureText(text, style): { width }`** — advance widths for axis labels, legends, and flow-node sizing
  (immediate-mode paint has no DOM to measure against). `canvasDrawContext` uses `cx.measureText`.

Plot-area clipping is handled at the engine level (the node-level `clip?: {x?,y?}`, §2) rather than as a
`DrawContext` method. There is exactly one `DrawContext` impl today — `canvasDrawContext` (Canvas 2D) in
`canvas/render/backends.ts` — so export rasterizes; a vector `DrawContext` is the future-proofing (§10).

**Why d3 + dagre, not a chart lib.** We take the proven **pure-geometry** engines (Chart.js / ECharts /
Observable Plot / Mermaid are all built on these same d3 modules + dagre internally) and paint them
ourselves through `DrawContext`. This stays inside `canvas/`'s pure-TS, DOM-free, `model`-only boundary,
keeps `Tokens` the single styling source, preserves synchronous `paint`, and becomes vector-ready for free
the day a vector `DrawContext` lands. Installed, DOM-free, tree-shakeable deps: **d3-scale** + **d3-shape**
(scales + line/area/arc generators, cartesian charts), **d3-hierarchy** (tree/treemap layouts), and
**@dagrejs/dagre** (directed-graph layout — used by the `flow` diagram). Authoring is structured controls
(pick a type, fill fields via the inspector / `DataGrid`), never a code surface.

**Data model.** Persisted data stays compact text (artifact JSONB); `normalize()` lifts it to a structured
runtime model, so old artifacts keep rendering (a legacy `kind` folds into `type`):

```ts
// chart/utils.ts — persisted
interface ChartData {
    type?: string; // "bar" | "line" | "pie" | … (drives the registry lookup)
    values: string; // series by newline, points by comma
    categories?: string; // comma-separated x labels
    seriesNames?: string; // comma-separated
    palette?: "ramp" | "categorical";
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

Diagrams carry `DiagramData { type?, items: string, links?: string, palette?, height? }` → `ResolvedDiagram
{ type, items, nodes, edges }` (`links` are `"A->B"` edges for flow, `"Parent>Child"` for tree/org/mindmap).
The inspector's `DataGrid` edits these string fields as a spreadsheet (§6③).

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
    render(diagram: ResolvedDiagram, ctx: DiagramCtx): void;
}
```

`chart/render.ts` / `diagram/render.ts` side-effect-import every per-type file (so they self-register),
`normalize`, look up `getChart(type)` (falling back to `bar` / `process`), and call `render`. Shared chrome
lives in `utils.ts`: `cartesianFrame`/`numericAxes` (axes, gridlines, nice ticks via d3-scale), `legendRow`,
`seriesColors` (theme-accent ramp or hue-rotated palette), `pieLike`, number formatting.

**Type catalog — built.** _Charts (13):_ bar · column · line · area · pie · donut · radar · scatter ·
bubble · funnel · gauge · heatmap · treemap. _Diagrams (12):_ process · cycle · pyramid · funnel · timeline ·
venn · quadrant · matrix · tree · org · mindmap · flow (flow via dagre; tree/org/mindmap via d3-hierarchy).

**Built vs deferred.** The whole `DrawContext.path/measureText` foundation, the d3-scale/shape/hierarchy +
dagre registries, and the two catalogs above are shipped end-to-end (editor inspector + `DataGrid` + PDF/PPTX
export). Deferred breadth (§10): sankey/sunburst/waterfall/histogram (+ streamgraph/rose/network/ER), d3-array
/ d3-sankey / elkjs, hover tooltips, and vector PDF.

## 8. The render bridge — compose → commands (`canvas/render/commands.ts`)

The engine is format-blind; the bridge is what turns a `Section` into paintable commands and chooses the
framing. It injects the memoized Canvas 2D `measureText` (so §2's fidelity invariant holds), then offers two
entry points:

- **`layoutSection`** — the default (doc / web / thumbnails). `composeSection` → `layout` at the profile
  width and an unbounded height → `{ commands, regions, height }` where `height` is the natural bottom of
  the content. Sections stack with a fixed `SECTION_GAP`.
- **`layoutSlide` / `sectionSlides`** — the deck path. Each section is fit to its `slideFrame` (§3.1 —
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
CSS-scale the host to fit. Layout math never changes; only the transform does. (The old `render/geometry.ts`
was folded into `backends.ts`.)

## 9. Paint backends (`canvas/render/backends.ts`)

One `RenderCommand[]` → multiple serializers:

- **DOM** — absolutely-positioned divs, used for editing (so text selection / contenteditable work).
- **2D canvas** — mirrors the DOM output; reused for Present and PDF/PNG export, so _what you edit is what
  you export_. `canvasDrawContext` (the sole `DrawContext` impl) lives here for the self-painted surfaces.

Both honor each command's `clip` rect (CSS clip-path / canvas clip).

## 10. Status & deferred

**Built:** the engine, all three format views + per-section `frame.aspect`, compose from the recursive root +
the layout presets, the full element contract (57 types) with skeletons + direct-manipulation sizing (one
divider system, edge-drop columns, collapse-on-empty), the chart/diagram registries (d3 + dagre), DOM + canvas
backends, PDF/PNG export, deck present, PPTX export.

**PPTX export** (`render/pptx.ts` — the whole exporter in one file: RenderCommand→spec mappers, font
embedding, and the slide-assembly shell) — every artifact exports as a **deck** (all formats run through the
deck profile's `sectionSlides`; tall sections paginate into several slides), one PowerPoint slide per page.
It's a **native hybrid**: `rect` → autoshape, `text` → an editable text box per leaf with styled runs and the
engine's own line breaks baked in (`wrap`/`autoFit` off, so PowerPoint never re-flows — the reflow concern is
designed out, not lived with); `image` + self-painted `surface` (charts/diagrams) rasterize to PNGs
positioned at their box, so nothing is dropped. Theme fonts are **embedded**: the woff2 the app already loads
is fetched from Google, transcoded to TTF (wawoff2), and injected as OOXML embedded fonts (zip post-process
via JSZip) so the exact typeface renders anywhere with no "missing fonts" prompt — degrading gracefully to an
un-embedded export on any failure.

### Planned / deferred

**Artifact-level custom page sizes (`flex` format) — designed, NOT built.** The shipped per-section
`section.frame.aspect` (§3.1) already covers "make _this_ slide square/tall." The larger plan adds a
first-class paged format whose W×H lives on the **artifact**, for posters / social cards / carousels:

- **Data.** `ArtifactContent.page?: { width, height }` (plain JSONB in `draft_content` — no migration, inert
  for existing/non-flex artifacts) + the same on `ArtifactSummary` so library thumbnails render at the true
  aspect. `FormatDescriptor` gains `group`/`icon`/`fullBleed`/`frame` flags.
- **One `flex` profile** (`kind: "paged"`, default 1080×1350) + a `FLEX_PRESETS` table the UI reads (Square
  1080², Portrait 4:5, Story 9:16, Poster, A4, Letter, Postcard, Business card). A `profileFor(content)`
  resolver overlays the artifact's `page` (honored only for `flex`) and a `pagedSize(profile)` numeric
  accessor un-hardcodes the 1280×720 the paged renderers/exporters currently assume.
- **Section = page** — N=1 is a single poster, N>1 is a carousel / multi-frame story; same page-per-section
  machinery as deck, only the "section" copy becomes "page"/"card".
- **Editor.** A grouped format dropdown + a dimension editor (two number inputs, lock-ratio, swap, preset
  chips) in `Topbar`, all writes coalescing into one undo step. **Fixed-frame editing (approach 1):** paint
  each flex page at its true frame 1:1 (no scale factor, so every overlay keeps working in unscaled coords) —
  needs `layoutSlide` to also return `regions`. **Approach 2** (scale a fixed W×H layer to fit, true WYSIWYG
  for tall content, and letting deck opt into framed editing) is deferred because it rewrites every overlay's
  coordinate model.
- Two declared-but-unread profile fields would finally be wired: **`splitMinWidth`** (collapse a `row → col`
  when composed width is below it, so a `split-6040` on a narrow Story stacks) and **`tokenScale`** (type/space
  multiplier threaded through `LayoutCtx`). Both also fix latent gaps for the existing three formats.

**Charts & diagrams breadth** — more chart types (sankey via d3-sankey · sunburst via d3-hierarchy · waterfall
· histogram · streamgraph · rose · network/ER) and denser graph layouts (**elkjs** where dagre's layered
output isn't clean enough); **hover tooltips / click** (surfaces are static rasters — needs editor-level
hit-testing over the surface box); a **drift-guard script** (`pnpm check:elements`) asserting the `model`
value-sets match the registered ids (§5.3).

**Rendering core** — engine-native rich text (`@model/text` is scaffolded; the editor uses a contenteditable
overlay today); free-form / bento grid spanning; native (editable) PowerPoint charts — charts export as images
today; **vector PDF** (a vector `DrawContext` makes every d3-geometry chart crisp vector automatically — the
reason this approach is future-proof where a canvas chart lib would not be); relayout-boundary caching (not
needed at current scale).

See `architecture.md` for the file map, `ai.md` for how the streamed edit protocol drives these same content
ops, `frontend.md` for the shared `@ui` control kit the inspectors are built from, and `testing.md` for the
canvas/element test suites.
