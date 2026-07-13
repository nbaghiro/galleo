# Galleo — Rendering & Elements

> How content becomes pixels. Two pure, editor-free layers in `canvas/`: a custom **Clay-style layout
> engine** (geometry) and the **element system** (content blocks that compile down to it). A thin **render
> bridge** (`canvas/render`) drives the engine and feeds the concrete DOM / 2D-canvas / PDF paint
> backends. Companion to `architecture.md` (the file map) and `data-model.md`; see
> `elements-and-editing.md` for the element catalog + selection UI in depth.

**The pipeline, end to end:** `Section` (data) → `composeSection` → `EngineNode` tree → `layout(node,
size)` → `RenderCommand[]` + `Region[]` → a paint backend (DOM divs on screen, 2D canvas for
present/export). One layout pass feeds screen _and_ export, so what you edit is what ships (§8).

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

1. **widths** (top-down) — each parent assigns its children's widths (`percent`/`fit`/`grow` all of the
   content width _after_ inter-child gaps, so a row of `60% + 40%` columns plus a gutter fills exactly).
2. **heights** (bottom-up) — text is measured _at its resolved width_ (width must be known first); a
   row's cross-height is the tallest child; `grow`-height stretches to it.
3. **positions** (top-down) — assign `x/y`, apply alignment.

Then flatten to `RenderCommand[]` (`rect`/`text`/`image`/`surface`) + `Region[]` (the box of every node
carrying an `id`) — paint and hit-testing are separate outputs. `layout(node, size)` is the whole public
surface; the render bridge (§7) is what calls it.

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

The composed tree isn't laid out here — `composeSection` only builds boxes. The **render bridge** (§7)
takes it from tree to render commands, and chooses the framing (natural-height section vs 16:9 slide).

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
    frame?; // universal corner-radius (and image zoom) control
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

**Organised by category** — one file per element under `canvas/elements/{text,media,table,composite,chart,diagram,basic}/`,
each category side-effect-registered by `editor/register.ts`:

- **`text`** — the typographic primitive (`text`, every heading/body/label role is a `style`) plus
  `bullets` / `quote` / `callout` / `code`.
- **`media`** — `image` / `gif` / `illustration` / `sticker` / `icon` / `avatar` / `video`; theme-reactive,
  keyless providers, one shared picker.
- **`composite`** — containers (`group` / `card`) that recurse through the composer, plus prebuilt blocks
  (`cta` / `faq` / `feature` / `pricing` / `profile` / `testimonial`).
- **`chart` / `diagram`** — the self-rendered surfaces (one file per variant + a shared `render`/`element`).
- **`table`** — `table` / `stat`.
- **`basic`** — the utility set: `button` / `divider` / `badge` / `shape` / `gradient` / `spacer` / `embed`.

An internal, palette-hidden `dropghost` element backs the live drop preview. See `elements-and-editing.md`
for the full catalog.

## 6. Selection & direct manipulation (`editor/select`)

The engine emits every id'd node's box as a `Region`, so the whole editing UI is positioned from real
geometry:

- **Select** — hit-test the deepest region under the cursor (nested element → element → section) by path;
  Esc walks up the tree. The selection ring and context bar anchor to the region box.
- **Inspect** — the docked inspector renders `spec.controls`; the floating context bar renders `spec.bar`
  (the compact subset) + universal align / duplicate / delete. Changing `data` recomposes that element.
- **Resize** — a bottom-edge handle sets height/aspect where the spec's `resize` declares one; it only
  appears when that element is actually resizable.
- **Width** — one divider mechanism at every depth: drag the **bar between any two side-by-side siblings**
  — the section's columns (the root row's children) or a nested row — to reallocate their `ElementLayout.width %`.
- **Spacing** — for containers, drag a grip between children (gap) or at the content inset (padding).
- **Frame** — the format bar carries the universal corner-radius control (and image zoom), driven by the
  spec's `frame`.
- **Drag-and-drop** — drag an element to any spot; every drop previews the same way: the section reflows
  around a dimmed inline ghost of the dragged element (the real element for a move, its skeleton for a
  new-from-palette drop), so you see exactly what lands where before releasing. Dragging to a **section edge /
  column gutter** creates a new column; pulling a column's last content out **collapses** it and reflows the rest.

Each previews live (the canvas repaints the modified artifact) and commits on release through the same
content ops. The four selection surfaces (context/format bar, docked inspector, on-canvas handles, inline
data grids) are detailed in `elements-and-editing.md`.

## 7. The render bridge — compose → commands (`canvas/render/commands.ts`)

The engine is format-blind; the bridge is what turns a `Section` into paintable commands and chooses the
framing. It injects the Canvas 2D `measureText` (so §2's fidelity invariant holds), then offers two entry
points:

- **`layoutSection`** — the default (doc / web / thumbnails). `composeSection` → `layout` at the profile
  width and an unbounded height → `{ commands, regions, height }` where `height` is the natural bottom of
  the content. Sections stack with a fixed `SECTION_GAP`.
- **`layoutSlide`** — the deck path. Each section is fit to the 1280×720 (16:9) frame: short sections
  stretch to fill and center (`prepareSlideNode`); a text+image split whose image would overflow
  cover-fits the image column (`coverFitColumns`) so it fills the frame instead of scaling down.

Paged export still needs to cut a tall flow into pages: **`fragment`** (`engine/layout.ts`) slices a
command list into page-height chunks, breaking at a clean edge and never through a block ("good, not
optimal" greedy). Continuous formats skip it on screen.

Fitting a logical layout into a physical viewport (minimap thumbs, present) is one shared formula —
`scaledHostCss` / `fitToViewport` in `canvas/render/geometry.ts`: lay out at the logical width, then
CSS-scale the host to fit. Layout math never changes; only the transform does.

## 8. Paint backends

One `RenderCommand[]` → multiple serializers:

- **DOM** (`canvas/render/backends.ts`) — absolutely-positioned divs, used for editing (so text selection /
  contenteditable work).
- **2D canvas** (also `canvas/render/backends.ts`) — mirrors the DOM output; reused for Present and PDF/PNG export,
  so _what you edit is what you export_.

## 9. Status & deferred

**Built:** the engine, all three format views, compose from the recursive root + the layout presets, the
full element contract with skeletons + direct-manipulation sizing (one divider system, edge-drop columns,
collapse-on-empty), DOM + canvas backends, PDF/PNG export, deck present, PPTX export.

**PPTX export** (`render/pptx.ts` — the whole exporter in one file: RenderCommand→spec mappers, font
embedding, and the slide-assembly shell) — every artifact exports as a **deck** (all formats run through the deck profile's
`sectionSlides`; tall sections paginate into several slides), one PowerPoint slide per page. It's a
**native hybrid**: `rect` → autoshape, `text` → an editable text box per leaf with styled runs and the
engine's own line breaks baked in (`wrap`/`autoFit` off, so PowerPoint never re-flows — the reflow
concern is designed out, not lived with); `image` + self-painted `surface` (charts/diagrams) rasterize to
PNGs positioned at their box, so nothing is dropped. Theme fonts are **embedded**: the woff2 the app
already loads is fetched from Google, transcoded to TTF (wawoff2), and injected as OOXML embedded fonts
(zip post-process via JSZip) so the exact typeface renders anywhere with no "missing fonts" prompt —
degrading gracefully to an un-embedded export on any failure.

**Deferred by design:** engine-native rich text (`@model/text` is scaffolded; the editor uses a
contenteditable overlay today); free-form / bento grid spanning; native (editable) PowerPoint charts —
charts export as images today; relayout-boundary caching (not needed at current scale).
