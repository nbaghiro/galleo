# Galleo — Elements & the editing surface

> The element library (what blocks exist, how they're filed, the spec every one implements) and the
> editing UI a selection drives (the floating format bar, the docked inspector, and the on-canvas
> handles). Companion to `rendering.md` (the engine + compose pipeline — unchanged by the refactors
> below), `element-structure.md` (the category taxonomy plan), `charts-diagrams.md` (the chart/diagram
> subsystem), and `ui-component-library.md` (the shared control kit).

Nothing here touches the engine. `canvas/engine/` (the Clay solver + `EngineNode`/`DrawContext`) and
`canvas/elements/compose.ts` (Section → `EngineNode`) are exactly as `rendering.md` describes them. The
recent work was **organizational**: one file per element, category subfolders, and a consolidated palette
taxonomy.

## 1. Where elements live

One file per element under `canvas/elements/<category>/`, plus the shared machinery at the root:

```
canvas/elements/
  spec.ts        ElementSpec + ControlField, the registry (register/getElement/listElements/walkElements),
                 SECTION_CONTROLS, ghost builders (bar/block/pill/dot) + skeletonize/skeletonFor
  compose.ts     composeSection/composeElement (content tree → EngineNode), grid TEMPLATES + PRESETS,
                 dark-background token adaptation
  ops.ts         pure immutable content edits (get/set/insert/remove/duplicate; section grid/bg/bleed)
  skeletons.ts   reusable structural ghosts for chart/diagram palette tiles + drop previews
  dropghost.ts   the internal __dropghost element (the live drop preview)

  text/      text · bullets("List") · callout · code · quote
  media/     image · gif · illustration · sticker · icon · video · avatar   + shared.ts (imageLike factory)
  table/     table · stat
  composite/ card · group · feature · profile · testimonial · pricing · cta · faq   + shared.ts (composite factory)
  chart/     element.ts (chartSpec + VARIANTS) · render.ts · utils.ts · one renderer per type (bar.ts …)
  diagram/   element.ts (diagramSpec + VARIANTS) · render.ts · utils.ts · one renderer per type (process.ts …)
  basic/     badge · button · divider · embed · gradient · shape · spacer
```

The **folder is code organization; the palette grouping is each spec's `category`** — `basic/` deliberately
mixes several categories' worth of small primitives into one folder. `editor/register.ts` side-effect-imports
every element file at startup, which is when each `register(spec)` fires.

## 2. The catalog

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

The taxonomy was **consolidated** from the earlier set: `data` → **Table**, `container` → **Composite**, and
`interactive` / `branding` / `decoration` / `layout` all merged into **Basic**.

**Two families with a factory + a render/element split:**

- **Composite blocks** (`composite/`) are `container`s assembled from real `text`/`avatar`/`button` children
  via `composite/shared.ts`, so every child stays individually selectable.
- **Charts & diagrams** register their variants from `chart/element.ts` / `diagram/element.ts` (a
  `chartSpec`/`diagramSpec` factory over a `VARIANTS` array). The element `type` (e.g. `barChart`) differs
  from the internal **render-type** (`bar`) that self-registers in `chart/utils.ts` when `chart/render.ts`
  imports the per-type file (`bar.ts`). Each element's `layout` returns a `surface` node whose `paint` calls
  the renderer — so **d3-shape/d3-scale/d3-hierarchy + dagre live only inside those renderers**, invisible to
  the engine.

## 3. The `ElementSpec` contract (`canvas/elements/spec.ts`)

Every block is one registry entry. Required: `type · label · category · tier · create() · layout(data, ctx)
· controls`. Studio-only, optional (inert for layout/present/export — read solely by the editor):

| Field             | Drives                                                                                                        |
| ----------------- | ------------------------------------------------------------------------------------------------------------- |
| `richText?`       | primary text takes inline marks → the contenteditable overlay + the inline mark bar (only `text`)             |
| `bar?: string[]`  | which `controls` keys appear on the floating format bar                                                       |
| `frame?: boolean` | element has a visible frame → the universal corner-radius control on the bar                                  |
| `resize?`         | canvas drag handles: `height` (a data key) / `aspect` (`data.aspect`); width is a universal `ElementLayout` % |
| `spacing?`        | container gap/inset drag handles, each driving a data field                                                   |
| `container?`      | `{children, arrange, withChildren}` — recursion + generic insert/remove for card/group/composite blocks       |
| `skeleton?`       | palette + drop-preview ghost; auto-derived from `skeletonize(layout(create()))` if absent                     |
| `fallback?`       | interactive → static substitution for paged/export                                                            |

`ControlField[]` is the schema the generic inspector + format bar both render (control kinds: `select`,
`segmented`, `align`, `slider`, `toggle`, `color`, `number`, `text`, `media`, `icon`, `iconColor`), with
per-field `group` (inspector heading) and `visibleWhen` (conditional). Adding an element is adding a spec —
palette, AI catalog, and serialization are all registry-driven.

## 4. Selection → the editing UI

A single `selection()` signal in `editor/editor.ts` (`{kind:"element", address}` | `{kind:"section", …}` |
`null`) drives **four independent surfaces**. Every surface is positioned from the engine's `Region` boxes
(the box of each id'd node), so the UI can never drift from what's painted.

**① Floating format bar** — `editor/inspect/format-bar.tsx` (`ContextBar`). Renders for a selected element,
anchored just above its region box (flips below if it would clip; hidden mid-drag). Contents, in order:
the spec's `bar` keys resolved to their `ControlField`s and rendered **compact** (same `Field` dispatcher as
the panel, labels dropped) → the **universal radius** slider (only when `spec.frame`, written to
`ElementLayout.radius`, not element data) → **rich-text marks** (`MarkControls`, only while editing a
`richText` element) → **align** (only when the element has horizontal slack in its cell) → **duplicate** →
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
  `dataShapeFor()` returns a structured shape, so the inspector drops the raw data keys and renders an inline
  **`DataGrid`** (a spreadsheet-style editor) instead of text fields.
- **SectionInspector** — a bespoke grid-template picker (live thumbnails) followed by the generic
  `SECTION_CONTROLS` (bleed + background) through the same `SchemaFields`, via a flat adapter over the
  structured `Section`.

**④ On-canvas handles** — `editor/select/handles.tsx`, all live-previewed through a shared `liveEdit` signal
(the canvas reflows per frame, commits on release):

- **ResizeHandles** — now a single **bottom-edge** strip (corner/width handles were removed) → `resize.height`
  (a data key) or `resize.aspect` (`data.aspect`).
- **RegionDividers** — the **primary width affordance**: thin `col-resize` bars between a section's grid cells
  (→ section `widths`) and between row-adjacent element siblings at any nesting depth (→ each sibling's
  `ElementLayout.width.pct`).
- **SpacingHandles** — from `spec.spacing`: a grip in each child gap (`gap`) and one at the content inset
  (`padding`).

Net: an element's entire editing surface is assembled from its `ElementSpec` — `bar` picks the quick
controls, `controls` fills the panel, `frame`/`resize`/`spacing`/`container` light up canvas affordances, and
`richText`/`dataShapeFor` swap in the specialized editors (inline text marks, chart/diagram grid).

## 5. How it's wired (the plumbing under §4)

None of the surfaces above query the DOM to find an element. They all read a handful of signals in
`editor/editor.ts` and position themselves from the engine's `Region` boxes, so the chrome can never drift
from what's painted.

**The reactive spine.** Five signals carry the whole interaction:

- **`regions`** — `Region[]` the canvas republishes on every paint; each is `{ id, box, radius }` in
  canvas-content coords. The region `id` (`el:…` / `cell:…` / `section:…`) is the join key between engine
  output and UI. This is the single source of geometry for every overlay.
- **`selection` / `hover`** — a `Target | null` each (`{kind:"element", address}` | `cell` | `section`),
  with a custom `targetsEqual` so re-selecting the same thing doesn't churn.
- **`rightTab`** — which right-rail flyout is open (a `category` id · `"search"` · `"inspector"` · `null`).
- **`liveEdit`** (`select/handles.tsx`) — a transient, uncommitted direct-manipulation edit (drag in flight).
- **`editing`** (`ElementAddress | null`) — the element whose inline text is being edited.

"Becoming visible" = one of these turns non-null and a `Show`/`For` memo lights up. Selection itself is just
"set the `selection` signal"; everything in §4 is a reaction to it.

**Pixels → selection (`editor/canvas/Canvas.tsx`).** Each `draw()` paints the section stack and gets back
`{tops, regions, height}`. It publishes `regions` _and_ pre-parses them once into a flat `liveHits` array of
`{target, specificity, box}`, so a hover test is a numeric box-scan, not id-parsing per pointer move. The
pointer protocol:

- **down** → records `pending = {target: hitTest(x,y), x, y}` — no selection yet.
- **move** → sets `hover` to the hit; _or_, if `pending` is an element dragged past `DRAG_THRESHOLD`,
  promotes to a drag-move (drop handled by `canvas/dnd.ts`).
- **up** → `setSelection(pending.target)`; if that element's spec is `richText`, `startEditing` at the click
  point (so clicking body text drops you straight into editing).
- **`hitTest`** returns the highest-`specificity` region under the point → element beats cell beats section.
  `Escape` walks up via `parentTarget`; `Delete`/`Backspace` removes the selection; `⌘D` duplicates; arrows
  reorder a selected section. Keys are ignored while a form field or the inline editor has focus.

**The overlay stack.** All chrome is mounted as absolutely-positioned siblings over the `paintHost` inside
one stage div — the selection/hover rings (`Overlay`), the three handle layers, the drop indicator, the two
section-level surfaces, the `ContextBar`, and the inline `TextEditor`. Each renders nothing until its slice of
`selection()`/`hover()` matches.

**Section-level chrome** (`editor/select/selection.tsx`, beyond §4's four element surfaces):

- **`SectionActions`** — a pill straddling a section's bottom edge whenever any region inside it is _hovered_:
  Add section / Generate (AI) / Layout (selects the section).
- **`SectionToolbar`** — reorder ↑↓ / duplicate / add-below / delete, shown when a `section` is _selected_.

**The panel auto-opens itself.** A `createEffect` in `Panel.tsx` sets `rightTab` to `"inspector"` whenever
selection becomes a section or a non-inline element, and closes it when selection clears — so selecting on the
canvas pops the inspector open, while the `elementInline` rule (§4②) keeps it shut for bar-only elements.

**Live edits & undo.** Every control write funnels through `commit(op(...))` with an optional `coalesce` key;
continuous gestures — slider/color scrubs and every handle drag — pass a stable key so the whole gesture folds
into **one** undo step. Handle drags additionally route through the shared `liveEdit` signal: the canvas's
`preview` memo paints `applyLiveEdit(artifact, edit)` each frame with `track: true` (regions update so the
handle follows the element as it resizes), then commits the identical op once on release. Inline text edits
update live with no history and record a single snapshot when editing ends.

**Why the panel doesn't steal focus.** `SchemaFields` derives its grouping only from the stable control
_list_, and reads each value through a getter — so editing a value never re-renders the panel structure (which
would blur the input mid-keystroke). Only a `visibleWhen` flip actually remounts a row.
