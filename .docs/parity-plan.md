# Beautiful.ai parity plan: elements and configuration

> Implementation handoff. This document is self-contained: it carries the findings from a full
> code-level study of Beautiful.ai's v10 canvas (its smart-slide templates, element library, and
> property panels) plus a verified map of our own code, so an agent can implement it without the
> research context. Where this document and `.docs/rendering.md` disagree about what exists in the
> code, this document is right; the drift list in "Verified code map" below was checked against
> source in August 2026.

## Goal

Close the configuration and element-library gaps against Beautiful.ai that fit our architecture,
with the diagram-beauty track as the priority: our diagrams are the weakest surface we render,
weaker than our charts, while diagrams/infographics are Beautiful.ai's strongest asset. We port
their design judgment (per-item styling, node treatments, ornaments, depth, media-in-nodes), not
their architecture (retained element classes, blocking fit, bespoke panels, migrations).

## How to work (conventions, non-negotiable)

- New enums are value-sets in `model/elements.ts`; specs map them to UI labels locally. Extend the
  drift-guard pattern (`diagram.test.ts` asserts registry ids equal the value-set) to anything new.
- New persisted fields are optional and coerced at read with the helpers in
  `canvas/elements/coerce.ts` (`str/num/bool/oneOf`), in the style of `toChartData` /
  `toDiagramData`. No migrations, ever.
- New options are `ControlField` entries rendered by the generic inspector; on-canvas quick access
  goes through the spec's `bar` keys. No bespoke panels.
- Every new element or diagram/chart type ships with: the spec or `register*` entry, a preview tile
  in `canvas/elements/previews.ts`, an AI-catalog entry in `model/ai.ts`, and a fit-contract test
  (every draw call stays inside the box; see `diagram/__tests__/diagram.test.ts`).
- Export must come for free. Anything painted through `DrawContext` or engine leaves flows into
  DOM, canvas, PDF, and PPTX automatically; changes to `DrawStyle`, `ImageLeaf`, or `FillLeaf`
  require touching each backend: `canvas/render/backends.ts` (canvas + svg DOM),
  `canvas/render/svg-emit.ts` (svg string for PPTX), `canvas/render/pdf-draw.ts`.
- Tests run through the vitest configs at the repo root; see `.docs/testing.md`.

## Verified code map (and where rendering.md is wrong)

Seams this plan builds on, all verified against source:

- `canvas/engine/node.ts`: `EngineNode` (sizes `fit/grow/percent/fixed`, `aspect`, `clip`,
  `float {x?, y?, dx?, dy?, z?}`, `opacity`, leaves `text/image/fill/surface`). `DrawStyle` is
  `fill/stroke/width/radius/dash/fillRule/cap/join` ONLY. `ImageLeaf` already has
  `fit/radius/scrim/zoom/border/shadow`.
- `canvas/engine/layout.ts`: three-pass solver; `emit` pushes `Region {id, box, radius}`;
  `fragment` paginates commands.
- `canvas/elements/spec.ts`: `ElementSpec`, `ControlField` (13 control kinds, `group`,
  `visibleWhen`), the registry, `SECTION_CONTROLS`, `skeletonize`.
- `canvas/elements/compose.ts`: `composeSection` (gutters scaled before `contentW`, dark-bg token
  swap `onDark`, section node with `clip {x: true}`), `composeElement` (container recursion,
  region-id tagging), `applyLayout` (maps `ElementLayout` width/height/align/radius onto the node),
  `scaleTokens`.
- `canvas/elements/ops.ts`: pure path-addressed ops (`updateDataAt`, `insertChild`, `wrapWith`,
  `deleteElement` + `collapseSection`, `splitSection`, width renormalization, section/artifact ops).
- `model/artifact.ts`: `ArtifactShell` / `ArtifactContent extends ArtifactShell` and the invariant
  that artifact-level fields OUTSIDE the shell are silently dropped by the next section op
  (`applySectionOps` spreads the shell). `Section {id, root, background?, bleed?, frame?}`.
  `ElementLayout` = width `fit|fill|{pct}`, height `fit|fill`, align, radius.
- `model/theme.ts`: `Tokens` = 8 color roles + radius + 3 font roles + headingWeight + border +
  shadow + scrim; `mix`/`luminance`/contrast helpers exist in `@themes`.
- Charts: `canvas/elements/chart/utils.ts` (`ChartData` string-encoded, `toChartData`,
  `normalize`, `seriesColors` where ramp = accent at alpha steps [1, .7, .48, .32, .22],
  `cartesianFrame`, `fmt` k/M formatter), `chart/element.ts` (`chartSpec` factory, CHART_CONTROLS
  with `visibleWhen` gating per type).
- Diagrams: `canvas/elements/diagram/utils.ts` is the whole substrate. Verified current state:
  `DiagramData` = `type/items/links/axes/palette/flow/height` (NO style, shape, or numbers
  fields); `DiagramOptions` = `{flow}` only; `nodePaint(color, theme, over?)` is solid-fill-only
  with luminance-picked ink/dim (NO treatments, NO emphasis parameter); `drawNode` draws
  rounded/pill/hexagon/diamond via `shapeInto` with `NODE_RADIUS 6` and a stacked title+body label
  (NO badge, NO icon); `drawLink` does rounded-elbow polylines, dash, filled arrowhead
  (`HEAD_SIZE 6`); `drawEdgeLabel` is the chip painter; `bandStack(narrowTop)` renders
  pyramid/funnel with value-scaled widths and label-width floors; tree helpers
  (`buildTree/layoutTree/boxWidth`) drive tree/org/mindmap. `render.ts` dispatches and takes
  colors from the CHART `seriesColors` (alpha ramp). Only `process.ts` implements the `arrange`
  opt-in that turns items into real editable text children.
- Media: `canvas/elements/media/shared.ts` `imageLike` factory (data: `src/aspect/radius/fit/zoom`,
  controls incl. zoom `visibleWhen` cover); `media/vector.ts` holds the `Vector` IR, `parseSvg`,
  `drawVector`/`drawIcon`, `ICON_LIBRARY` (19 stroke glyphs), and shape presets.
- Editor (read-only for this plan unless a task says otherwise): regions republished by
  `editor/Canvas.tsx`; inspector via `editor/panels/RightPanel.tsx` + `SharedControlFields.tsx`;
  chart/diagram data edits via `dataShapeFor` in `editor/core/infographic.ts` + `DataGrid` in
  `editor/panels/DataEditor.tsx`; drag/drop five ops in `editor/core/dnd.ts`; live drags via the
  `liveEdit` signal in `editor/panels/Selection.tsx`.

Known doc drift (do not trust these parts of `rendering.md`): DrawStyle gradient/shadow and the
`nodePaint` gradient/shadow treatments do not exist; `DiagramData.style/numbers/shape` and
`DIAGRAM_STYLES`/`DIAGRAM_SHAPES` do not exist; drawNode has no number badge; `paintSectionStack`
drops the region `radius` (bug, Task 0.1); framed editing (`slideFrame`) already shipped; the
palette HIDDEN set is `{group, __dropghost, avatar}`.

---

## Phase 0: unblockers (do first)

- [x] **0.1 Restore region radius.** `paintSectionStack` in `canvas/render/backends.ts` re-maps
      engine regions to `{id, box}`, dropping `radius`. Carry it through. Done when: the inspector's
      corner-radius slider shows the painted radius for a framed element with no explicit
      `ElementLayout.radius`, and `VideoEmbeds` stops falling back to 8.
- [x] **0.2 `pnpm check:elements` drift guard.** Generalize the `DIAGRAM_TYPES` test: chart
      registry ids == `CHART_TYPES`, diagram registry ids == `DIAGRAM_TYPES`, every AI-catalog element
      type is registered. Wire as a script and into CI if one exists.

## Phase 1: per-item styling

Beautiful.ai has per-item color, emphasize, and decoration on nearly every collection; we have
element-level palettes only. Keep the compact text encodings (they are what makes the AI protocol
cheap); add positional metadata beside them.

- [x] **1.1 `itemsMeta` on diagrams.** In `diagram/utils.ts`: add
      `DiagramData.itemsMeta?: { color?: string; emphasis?: boolean; icon?: string }[]` (coerced per
      entry in `toDiagramData`; unknown keys dropped). In `normalizeDiagram`, zip onto `DiagItem` as
      `color?/emphasis?/icon?`, truncating or padding to the item count. In `render.ts`, resolve the
      per-item color as `item.color ?? palette[i]` before dispatch so most renderers need no edits.
- [ ] **1.2 Chart color overrides.** In `chart/utils.ts`: `ChartData.seriesColors?: string` (comma
      list of hex or theme-role names) resolved inside `seriesColors`; `pointColors?: string` honored
      by the bar and column renderers when there is exactly one series.
- [ ] **1.3 Grid editing.** `DataGrid` (via `dataShapeFor`'s `list` shape) gains a color-swatch
      column and an emphasis toggle column writing `itemsMeta` positionally; charts get a swatch on
      the series header row. Keep `parseModel`/`serializeModel` round-trip intact.
- [ ] **1.4 Small elements.** `bullets` gets `markerColor?` (one color control).

## Phase 2: media depth

- [ ] **2.1 Focal point.** Add `focal?: {x: number; y: number}` (0..1, default center) to
      `ImageLeaf` in `engine/node.ts`. DOM backend: `object-position`; canvas backend: source-rect
      math in the cover-draw path; PDF/PPTX inherit through the raster path. Author in `imageLike` as
      a 3x3 position segmented control, `visibleWhen` fit is cover.
- [ ] **2.2 Filters.** `IMAGE_FILTERS = ["none","mono","warm","cool","soft","contrast"]` value-set;
      `ImageLeaf.filter?: string` resolved through one shared preset-to-CSS-filter map. DOM sets
      `filter`; canvas sets `ctx.filter`; raster export paths inherit. One select in `imageLike`.
- [ ] **2.3 Opacity as layout.** Expose `ElementLayout.opacity?` in `model/geometry.ts` and map it
      in `applyLayout` (`compose.ts`) onto `node.opacity` (the engine already multiplies it down the
      subtree). Slider in the inspector next to corner radius.
- [ ] **2.4 Frames (lower priority).** `FRAME_LIBRARY` of `Vector` docs (browser chrome, laptop,
      phone bezel) in `media/vector.ts` beside `ICON_LIBRARY`; `imageLike` composes the frame as a
      float node over the image sized to the frame's screen cutout, painted via `drawVector`. One
      select control, default none.

## Phase 3: chart authoring depth

- [ ] **3.1 Format and axes fields.** `ChartData` gains (all optional, coerced):
      `format? "number"|"percent"|"currency"`, `currency?`, `decimals?`, `yMin?/yMax?`,
      `xTitle?/yTitle?`, `legend? "auto"|"off"|"top"|"bottom"`. Implement in `chart/utils.ts`: extend
      `fmt` into a format-aware formatter used by axes and value labels; `cartesianFrame` takes domain
      overrides and draws axis titles; `legendRow` honors placement. Controls join `CHART_CONTROLS`
      under groups Format and Axes with `visibleWhen` per type family (same pattern as `showGrid`).
- [ ] **3.2 Data-point notes.** `ChartData.notes?: string`, one per line, `"series:point: text"`.
      Renderers mark the point and draw the label on a chip. Promote `drawEdgeLabel` from
      `diagram/utils.ts` into a shared module both subsystems import.
- [ ] **3.3 (Deferred, do not start) linked data sources.** The seam is `DataGrid`'s
      `parseModel`/`serializeModel`; a future `dataSource?` hydrates `values` server-side. Needs a
      services workstream.

## Phase 4: beautiful diagrams (priority track)

Beautiful.ai's diagram look decomposes into: opaque color ramps with per-item overrides, a
decoration-style vocabulary (filled/outlined/muted), ornament badges (number/letter/icon), media
inside nodes, depth effects (folds, darkened segments, soft shadows), and connector styling. We
build the same vocabulary once in the shared substrate so all 17 types inherit it.

- [x] **D0 Opaque diagram colors (S, first).** Add `diagramColors(theme, n, palette)`: ramp =
      opaque mixes of accent toward the page background (`mix()` from `@themes`), categorical stays
      opaque. Switch `renderDiagram` in `diagram/render.ts` to it. Venn keeps translucency locally
      with explicit alpha over the opaque base so label ink stays computable.
- [x] **D1 Gradient and shadow in DrawStyle (M).** Add `gradient? {from,to,angle?}` and
      `shadow? {blur,dy,color}` to `DrawStyle`. Canvas: `createLinearGradient` per primitive (replay a
      `path` build through a bounds sink to get the extent) + `shadowBlur`/`shadowOffsetY`. Both SVG
      emitters: `<defs>` linearGradient in `objectBoundingBox` units; DOM adds `feDropShadow`. PDF:
      flatten gradient to the midpoint of its stops, drop shadows. Renderers must inset for shadow
      blur (the surface `<svg>` clips at its box). Snapshot-test each backend.
- [x] **D2 Node treatments (M, biggest visual win).** Value-set
      `DIAGRAM_STYLES = ["card","tinted","solid","outline"]` in `model/elements.ts`;
      `DiagramData.style?` coerced; thread through `DiagramOptions` so renderers read `ctx.opts.style`;
      segmented control + `bar` entry. Rework `nodePaint(style, color, theme, emphasis?)`:
      card = surface fill, hairline `line` stroke, soft shadow; tinted = opaque wash of the node color
      toward bg; solid = full color with a slight downward gradient; outline = stroke only, ink text.
      `emphasis` promotes to solid regardless of style; apply automatically to tree/org/mindmap roots,
      flow terminals, and the hub center, and per item from `itemsMeta.emphasis` (Phase 1).
- [x] **D3 Shapes and badges (M).** `DIAGRAM_SHAPES = ["rounded","pill","chevron","hexagon"]` +
      `DiagramData.shape?`, honored by node-based types (process, steps, cycle, hub; honeycomb keeps
      hexagon; flow keeps its inferred diamond). Add the chevron path to `shapeInto` (first item gets
      a flat left edge). `DiagramData.numbers? "none"|"number"|"letter"`: `drawNode` gains a
      leading-edge circular badge sized off `NODE_TEXT`, suppressed when the box is too small.
- [ ] **D4 Per-item icons (M).** `itemsMeta[i].icon` = an `ICON_LIBRARY` key; `drawNode` paints a
      circle-framed glyph via `drawIcon` at the node's leading edge (row shapes) or above the label
      (cycle, hub, honeycomb). `DataGrid` gains an icon-picker column; document the key set in the AI
      catalog.
- [ ] **D5 Connector polish (S).** `LinkOpts` gains a weight tier and a circle end-decoration;
      arrowhead size scales with weight; treatment drives link color (card/outline pair with muted
      links, solid/tinted with accent-tinted links). No animated dashes (surfaces are static).
- [ ] **D6 Per-type passes (S each, after D0-D4).**
    - cycle: an arrow-ring style variant (thick tapered arc segments with integrated arrowheads,
      path-drawn) instead of thin links between small nodes; optional center label.
    - pyramid/funnel: when items carry details, move labels to a side column with hairline leader
      rules instead of squeezing inside bands; keep value-scaled widths from `bandStack`.
    - timeline: milestone styles from shape/icon (dot, pill, icon-framed).
    - steps: badges from D3 (numbered staircase).
    - hub: auto-emphasized hub, spoke icons.
    - org/tree/mindmap: root emphasis via D2; org elbows pick up D5 weight.
- [ ] **D7 Quality harness (S, alongside).** Golden SVG snapshots per diagram type via
      `svgStringContext` (`render/svg-emit.ts`) at two or three sizes plus the crowded ten-item case,
      extending `diagram.test.ts`. Refresh `previews.ts` tiles to show the new treatments.

## Phase 4R: diagram rebuild (DONE — supersedes D6; D0-D3 substrate carries over)

Decision (user-approved): remove all 17 painted diagram renderers; rebuild as composed elements.
Every type is arrange-first: real text children (label+detail per item, the process.ts pattern) laid
out by the engine, plus an optional float `decorate` surface that paints ONLY chrome (connectors,
bands, silhouettes, axis dots) behind them. `DiagramType` becomes `{id, label, arrange}`; `render`
and `renderDiagram` are deleted. Verified motivation: compose.ts renders emptyRegionNode for any
container with zero children, and diagramChildren returns [] for non-arrange types — so today only
process renders in the editor; the other 16 show the drop placeholder.

Tranche 1 keeps ten types: process, steps, cycle, pyramid, funnel, timeline, matrix, quadrant, hub,
org. Removed (files deleted, value-set shrunk; stored artifacts fall back to process at getDiagram):
venn, honeycomb, roadmap, target, tree, mindmap, flow. GRAPH_DIAGRAM_TYPES shrinks to ["org"].
dagre dependency goes with flow. DataEditor.tsx's preview (the one renderDiagram consumer outside
the registry) re-renders via layoutSection + drawCommands on a one-off section instead.

Per-type geometry (all compose-time, no text measurement; kids[i*2]=label, kids[i*2+1]=detail):

- process: existing arrange (reference implementation); badges via decorate.
- steps: row alignY end; cell i height = min + span\*(i+1)/n; staircase of solid cells.
- cycle: fixed-size cell floats on an ellipse (dx/dy from availWidth/height); decorate arcs between.
- pyramid/funnel: col of fixed-height band rows, label cell centered (transparent, ink from
  nodePaint of band color); decorate paints trapezoids from shared bandGeometry(items, W, H,
  narrowTop) with funnel value-scaling.
- timeline: N columns; alternating top/bottom label cells with grow spacer; decorate paints the
  axis line + dots at column centers.
- matrix: ceil(sqrt(n)) grid of cells; axes captions as plain engine text leaves (col then row).
- quadrant: pure engine 2x2 tinted cells (no surface at all); axes captions at the edges.
- hub: emphasized center cell float-centered + spokes on an ellipse; decorate paints spoke lines.
- org: buildTree + layoutTree at fixed nodeW/nodeH; cells as positioned floats; decorate elbows.
  Shapes: rounded/pill via engine radius; chevron/hexagon via decorate silhouette under a
  transparent cell (SHAPE_TYPES cycle/hub/matrix). Numbers badges via decorate (NUMBER_TYPES).

Progress:

- [x] R1 substrate: DiagramType {id,label,arrange}; promote process cell() to utils as diagramCell;
      decorate() helper; bandGeometry; delete drawNode/stackedLabel/bandStack/drawEdgeLabel and
      other painter-only helpers once unreferenced
- [x] R2 element.ts: drop ported() gate (children always), drop layout-surface fallback, drop
      renderDiagram import; render.ts keeps side-effect imports + diagramTypeOptions only
- [x] R3 types: process, steps, matrix, quadrant, timeline, pyramid, funnel, cycle, hub, org
- [x] R4 removals: 7 files + DIAGRAM_TYPES + GRAPH_DIAGRAM_TYPES + element.ts variants + AI catalog
      descs + previews.ts tiles + editor/core/infographic.ts shapes + dagre dep
- [x] R5 DataEditor preview via layoutSection + drawCommands
- [x] R6 golden SVG snapshots per type (compose through testkit, svgStringContext) + full verify

## Phase 4S: node shape registry (DONE)

Silhouettes are generalized as a registry of box-parametric PathSink builders in
`diagram/utils.ts` (`NodeShapeDef { id, build, insetX, engineRadius? }`, `registerNodeShape` /
`getNodeShape` / `drawShape`). A literal SVGElement is off-limits (canvas is DOM-free by the layer
law) and a fixed-viewBox Vector would distort height-derived geometry (a chevron's notch), so
shapes build into the same PathSink the Vector IR, d3, and all four backends already speak.
Engine-fillable shapes (rounded, pill) carry `engineRadius` and compose directly onto cell fills,
treatments included; angled ones (chevron, hexagon, diamond) compose transparent cells with
`insetX` text padding and the type's decorate surface paints the silhouette via `drawShape` with
full DrawStyle (gradient + shadow). Adding a shape = one `registerNodeShape` call; all five
node-row types (process, steps, cycle, hub, matrix) consume the registry uniformly, and a chevron
process drops its connectors and tightens the gap (the band is its own arrow). Future: a ShapeDef
can emit a Vector `path` VNode via `buildPathData` if the basic `shape` element should share
definitions; blocked only by VStyle lacking gradient/shadow.

## Phase 4E: visual eval harness (DONE, extend as types grow)

`pnpm eval:diagrams` runs `canvas/elements/diagram/__tests__/visual-invariants.test.ts`: a
geometry recorder replays every decorate surface and enforces, across a matrix of types x item
counts x sizes x shapes x numbering: (1) clip safety — nothing painted may leave its surface box;
(2) connectors live in the gaps, never inside a cell fill; (3) numbering discs anchor to a cell's
leading edge (silhouette paths anchor transparent angled cells); (4) discs never overlap label
text. Written before the fixes, it caught six real defect classes: process and matrix wrapped-row
grow-cells drifting off the decorate grid (now fixed cell widths from the shared formula), badge
discs clipping at surface edges (now placed inside via `badgeX` + `CellOpts.badged` label pad),
the steps badge/label collision, hub spokes puncturing cells and starting inside the hub (now
slab-clipped edge to edge), and cycle arcs crossing crowded neighbours (now sample-filtered).
The aesthetic half is human/LLM review over the live gallery
(`scripts/diagram-gallery.entry.ts`, smoke-tested by `scripts/__tests__/diagram-gallery.test.ts`),
which renders the real compose -> engine -> DOM-paint pipeline in a static page; regenerate with
esbuild and republish after visual changes. A vision-model judge over rasterized fixtures is the
planned extension once a rasterizer dependency is chosen.

## Phase 5: overlay layer (callouts, pins; then connectors)

- [ ] **5.1 Engine: fractional floats.** Add `fx?/fy?` (0..1 of the parent content box) to
      `EngineNode.float`, resolved in `layoutPositions` beside the existing `mainOffset` math.
      Fractions are scale-free, so `scaleTokens` needs no change.
- [ ] **5.2 Model + compose.** `Section.overlays?: { el: ElementInstance; x: number; y: number }[]`
      (section-local, so it rides the existing `set` SectionOp and stays clear of the ArtifactShell
      invariant). `composeSection` appends one float child per overlay after the inner content node,
      composed through `composeElement` so overlay elements keep their normal controls. Region id
      scheme `ov:<sectionId>:<i>` added to `parseTarget`/specificity in `model/artifact.ts` so a
      hovered overlay beats flow content.
- [ ] **5.3 Ops + editor.** New pure ops `addOverlay/updateOverlayAt/removeOverlayAt` in
      `elements/ops.ts`. Dragging writes `x/y` through `liveEdit` (commit on release). A sixth drop op
      in `editor/core/dnd.ts` (or a "pin" action in the format bar converting a selected element into
      an overlay).
- [ ] **5.4 Connectors (after 5.1-5.3).** A `connector` overlay storing two normalized points,
      painted by a `surface` calling the shared `drawLink`. Free endpoints first; region-anchored
      endpooints are a follow-up requiring post-layout resolution.

## Phase 6: element library additions

Each: one spec or `register*` file + the Phase 0 checklist (preview tile, AI catalog, fit test).
New diagram types should land after D0-D3 so they are born with the treatment vocabulary.

- [ ] **gantt** diagram type (S-M): items `"Task | start | length"` (the value column parsing
      generalizes), numeric column axis, lanes like `roadmap.ts`. No calendar math in v1.
- [ ] **sliceChart** diagram type (S): proportional-width slices of a whole; `value` drives
      relative widths; labels inside, details below; badges via D3.
- [ ] **arrowBars** diagram type (S-M): stacked proportional arrows (`value` = length); the 3D
      fold is a 15%-darker parallelogram at the left edge; a natural showcase for D1 gradients.
- [ ] **swot** diagram type (S): specialized 2x2 over the matrix renderer; first four items with
      fixed S/W/O/T corner badges and tinted quadrant fills.
- [ ] **connection** diagram type (M): fan-in/fan-out ribbons from an item column to a
      circle-framed target; ribbons as three path segments, middle darkened via D1.
- [ ] **journey** diagram type (M): winding path via `drawLink` with large corner rounding across
      alternating rows; milestones as icon pins (D4); start/end markers from first/last items.
- [ ] **radialBars** chart type (S): concentric 270-degree bars via d3-shape arcs, first series.
- [ ] **pictograph** chart type (M): repeated `ICON_LIBRARY` glyphs, partial fill via a clip rect
      over `drawVector`; needs an icon key field on `ChartData`.
- [ ] **stat delta** (S): optional third child on the `stat` composite (delta badge,
      positive/negative coloring).
- [ ] **board** (kanban) (M): closed container like `table`; data holds columns of task texts
      exposed as selectable text children via `container.children`/`withChildren`; per-task color and
      icon ride `itemsMeta`-style metadata.
- [ ] **Editable diagram labels** (M each): extend the `arrange` opt-in beyond `process.ts` to
      steps, timeline, and org, so labels become real editable text children.
- [ ] **countdown/timer** (M, deferred): interactive tier + static `fallback`; live tick as an
      editor/present-side mounted component (the VideoEmbeds pattern). Only once present is
      first-class.

Explicitly out of scope, do not build: word cloud, maps, free-form canvas (a second layout mode
per `.docs/rendering.md`), Beautiful.ai's blocking fit model, bespoke per-element panels,
SCSS-style theming, migrations.

## Phase 7: deck footer

- [ ] Config in `ArtifactShell` (it MUST be inside the shell or section ops drop it):
      `footer?: { show?: boolean; message?: string; pageNum?: boolean; logo?: string }`, plus an
      optional per-section `footer?: "on"|"off"` override on `Section`. Injected only in the paged
      path: `prepareSlideNode` in `render/commands.ts` appends a float bottom strip after fitting so
      it never competes with content height. Continuous formats ignore it; present/PDF/PPTX inherit
      through the command list.

## Sequencing

1. Phase 0 (hours, unblocks the rest).
2. Track B is the priority: D0, D1, then D2-D4 (consuming Phase 1's `itemsMeta`), then D5/D6
   per-renderer passes; D7 runs alongside from the start.
3. Tracks in parallel as capacity allows: Phase 1 (feeds D2/D4), Phase 3, Phase 2.
4. Phase 6 catalog items after D0-D3 for the diagram types; gantt, sliceChart, swot, radialBars,
   stat delta are the cheapest wins.
5. Phase 5 overlay layer when the editor work can be scheduled; Phase 7 anytime.

## Appendix: the Beautiful.ai vocabulary being ported (for intent, not imitation)

From the study of `beautifulai/js/canvas/v10/elements` and its property panels. Their diagram and
infographic quality comes from a small set of recurring devices:

- Per-item color, emphasize (`hilited`), and decoration style (filled/outlined/muted) on nearly
  every collection, with a collection-level color ramp ("theme-to-light", "theme-to-dark",
  "colorful") that per-item overrides puncture.
- Ornaments: number/letter/icon badges on process steps, boxes, slices, funnels.
- Media in nodes: circle-framed icons or images as first-class node content (cycle, hub and
  spoke, journey milestones, pyramid sections).
- Depth: a 15%-darkened fold on arrow bars, darkened middle segments on connection ribbons,
  optional shadows on cycle arrows, dashed back-shapes behind gears.
- Connectors with style (solid/dotted/dashed), weight, and end decorations (arrow/circle),
  including arcs and steps.
- Contrast-aware label placement: values inside bars when they fit, outside with leader lines
  when they do not; labels on arc text paths in rings; computed label centroids in venns.
- Emphasis as a first-class state: emphasized items promote to solid; de-emphasized boxes inset.
- Density judgment: elements downgrade to smaller styles as items grow and refuse layouts past a
  cap. We do not port the refusal; the treatment vocabulary plus the fit-contract tests are our
  equivalent.
