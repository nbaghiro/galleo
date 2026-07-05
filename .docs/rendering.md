# Galleo — Rendering & Elements

> How content becomes pixels. Two pure, editor-free layers in `canvas/`: a custom **Clay-style layout
> engine** (geometry) and the **element system** (content blocks that compile down to it). The concrete
> DOM / 2D-canvas / PDF paint backends live alongside them in `canvas/`. Companion to `architecture.md`
> (the file map) and `data-model.md`.

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
**one leaf** (`text` | `image` | `fill` | `surface`), plus `children`.

**Solver** (`layout.ts`) — three O(n) passes:

1. **widths** (top-down) — each parent assigns its children's widths (`percent` of content width, `fit` =
   intrinsic clamped, `grow` = share of leftover).
2. **heights** (bottom-up) — text is measured _at its resolved width_ (width must be known first); a
   row's cross-height is the tallest child; `grow`-height stretches to it.
3. **positions** (top-down) — assign `x/y`, apply alignment.

Then flatten to `RenderCommand[]` (`rect`/`text`/`image`/`surface`) + `Region[]` (the box of every node
carrying an `id`) — paint and hit-testing are separate outputs.

> **The engine does not wrap child elements** — only text wraps. Responsive "grid of N" is built by the
> _element_ (e.g. `group` chunks its children into rows) or the compose layer, never the engine. This is
> deliberate: explicit, designed breakpoints we control.

**Text fidelity — the one hard invariant.** `MeasureText(leaf, maxWidth)` must return identical metrics
in the editor and in every export, or exports drift from the screen. The editor uses Canvas 2D
`measureText`; export reuses the same canvas measurement; theme fonts are bundled so both agree.

## 3. Format-as-view (`canvas/engine/profile.ts`)

The three "modes" are three **format profiles** fed to the same engine:

| Format   | kind       | geometry                    | notes                                    |
| -------- | ---------- | --------------------------- | ---------------------------------------- |
| **Deck** | paged      | 1280 × 720 (16:9)           | one section per slide; content fit to it |
| **Doc**  | continuous | centered column, capped     | paginates only on export                 |
| **Web**  | continuous | full-bleed, fills the width | recomputes on viewport resize            |

A profile carries `kind`, width/height, `maxContentWidth`, `tokenScale` (a type/space multiplier so a
deck reads big and a doc reads dense — _styling_, never content), and pagination policy. Because
dimensions are data, a custom size or a draggable/resizable canvas is a data change, not new layout code.

## 4. Compose — Section → EngineNode (`canvas/elements/compose.ts`)

`composeSection` turns a `Section` into an engine tree:

- **Grid.** The section's `grid` names a template (`compose.ts`: `full` / `split-6040` / `split-4060` /
  `two-col` / `three-up`) whose per-cell width specs become the columns; a section's custom `widths`
  (from a column-divider drag) override the preset.
- **Recursion.** Container elements (`group`, `card`) recurse through the same composer, so nested
  elements get addressable paths.
- **Per-instance layout.** `applyLayout` maps each element's optional `ElementLayout` (width
  `fit`/`fill`/`{pct}`, height `fit`/`fill`, cross-axis `align`) onto the node.
- **Region ids.** Every section/cell/element node is tagged with a stable id (`section:…` / `cell:…` /
  `el:…`), so the engine reports its box for selection + overlays.
- **Contrast.** Over a dark section background, content tokens flip to a light-on-dark set.

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
    container?: { children; arrange; withChildren }; // for group / card
    // studio-only affordances (inert for layout / export):
    richText?;
    bar?;
    skeleton?;
    fallback?;
    resize?;
    spacing?;
}
```

A **generic inspector** renders `controls` for every element — no bespoke panel per element in the common
case. `register(spec)` adds it to the registry; the palette, AI, and serialization are all
registry-driven, so **adding an element is adding a spec — zero engine changes**.

**Two ways an element compiles to boxes:**

1. **Primitive subtree** — returns a tree of `text`/`image`/`fill` nodes the engine lays out. Most
   elements (text, lists, cards, stats, tables).
2. **Self-rendered surface** — returns a sized node with a `surface.paint(g, box)` callback; the engine
   resolves the box, the element paints into it through a backend-abstract `DrawContext` (canvas in the
   editor, vector for export). Used by charts and diagrams.

**Skeletons** (`skeletonize` in `elements/spec.ts`) — every element has a structural ghost (bars/blocks/pills) shown in the
palette and as the live drop preview; auto-derived from `layout(create())` unless the spec overrides it.
Because it's real engine output, previews can't drift from the element.

**Registered today (`editor/register.ts`):** `text` (the typographic primitive — every
heading/body/label role is a `style`), `image`, `card`, `group`, `stat`, `bullets`, `button`, `quote`,
`divider`, `badge`, `callout`, `code`, `chart`, `table`, `diagram`, `gradient`, `spacer`, `embed`,
`video` — plus an internal, palette-hidden `dropghost` used only as the live drop preview.

## 6. Selection & direct manipulation (`editor/select`)

The engine emits every id'd node's box as a `Region`, so the whole editing UI is positioned from real
geometry:

- **Select** — hit-test the deepest region under the cursor (element → cell → section); Esc walks up. The
  selection ring and context bar anchor to the region box.
- **Inspect** — the docked inspector renders `spec.controls`; the floating context bar renders `spec.bar`
  (the compact subset) + universal align / duplicate / delete. Changing `data` recomposes only that cell.
- **Resize** — the selection border _is_ the drag affordance: the right edge sets width (`ElementLayout`
  %), the bottom edge sets height/aspect where the spec declares one, the corner does both — and an edge
  only appears when that direction is actually resizable.
- **Columns** — drag the divider between a section's cells to reallocate their widths.
- **Spacing** — for containers, drag a grip between children (gap) or at the content inset (padding).
- **Drag-and-drop** — drag an element to any spot; over open space the section reflows around a live
  ghost, over an existing element a thin insertion line positions it precisely.

Each previews live (the canvas repaints the modified artifact) and commits on release through the same
content ops.

## 7. Pagination & slide framing

Continuous formats (doc/web) skip pagination on screen. Paged formats need it:

- **Fragmentation** (`fragment` in `engine/layout.ts`) — slice a tall command flow into page-height chunks, breaking
  at a clean edge and never through a block ("good, not optimal" greedy).
- **Deck slides** (`studio/canvas/render.ts`) — each section is fit to the 1280×720 frame: short sections
  stretch to fill and center; a text+image split whose image would overflow cover-fits the image column
  so it fills 16:9 instead of scaling down.

## 8. Paint backends

One `RenderCommand[]` → multiple serializers:

- **DOM** (`canvas/render/backends.ts`) — absolutely-positioned divs, used for editing (so text selection /
  contenteditable work).
- **2D canvas** (also `canvas/render/backends.ts`) — mirrors the DOM output; reused for Present and PDF/PNG export,
  so _what you edit is what you export_.

## 9. Status & deferred

**Built:** the engine, all three format views, compose + the template grid, the full element contract
with skeletons + direct-manipulation sizing, DOM + canvas backends, PDF/PNG export, deck present.

**Deferred by design:** engine-native rich text (`@model/text` is scaffolded; the editor uses a
contenteditable overlay today); general/non-template grid + bento spanning; PPTX export (PowerPoint
re-flows text — fundamentally approximate); relayout-boundary caching (not needed at current scale).
