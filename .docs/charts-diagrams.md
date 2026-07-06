# Charts & Diagrams — design

How Galleo grows from 3 chart kinds + 4 diagram kinds (hand-drawn, hard-coded) to a broad,
registry-backed catalog of both, without breaking the paint model.

## Where we are

`chart` and `diagram` are **self-rendered surfaces** (`canvas/elements/data.ts`): the element's
`layout()` returns a node with `surface.paint(ctx: DrawContext, box)`, a synchronous callback that
hand-draws through a 6-primitive `DrawContext` — `rect · line · circle · polyline · wedge · text`
(`canvas/engine/node.ts`). `drawChart` (bar/line/pie) and `draw` (process/pyramid/funnel/cycle) are
each one growing function switched on a `kind` field, with data crammed into a flat `values: string` /
`items: string`. Adding a type today = another `if (kind === …)` branch. That does not scale to the
catalog we want, and the flat string data has nowhere to hold series, categories, or edges.

## The three constraints that decide the approach

1. **`canvas/` is pure TS — framework- and DOM-free, imports only `model`** (ESLint-enforced). It uses
   the Canvas 2D _API_ but owns no `<canvas>` element lifecycle.
2. **`paint` is synchronous, immediate-mode, stateless** — recomputed on every edit/resize/theme/export.
   No animation loop, no persistent chart instance.
3. **Export is fully rasterized today.** `canvas/render/export.ts` draws each whole section (text, cards,
   surfaces) to an offscreen `<canvas>` at 2× and embeds one PNG per PDF page. There is exactly one
   `DrawContext` impl — `canvasDrawContext` (Canvas 2D). The "vector for export" note in the docs is
   aspirational. So **no charting approach loses PDF fidelity right now** — the gating factors are (1)
   and (2), plus keeping a single theming source and not blocking a future vector `DrawContext`.

## Decisions

- **Rendering: d3 geometry generators feeding `DrawContext`** (not a full canvas lib, not mermaid).
  Pure-geometry deps compute positions/paths; _we_ paint them. Notably, Chart.js / ECharts / Observable
  Plot / Mermaid are all built on these same d3 modules + dagre internally — we take the proven geometry
  engine and skip the DOM baggage. This stays inside the pure-TS boundary, keeps `Tokens` as the only
  styling source, preserves synchronous `paint`, and becomes vector-ready for free the day a vector
  `DrawContext` lands.
- **Authoring: structured controls** — consistent with every other element (pick a type, fill
  fields/items via the inspector; a structured/grid editor later). dagre/elkjs are used only for
  auto-layout under the hood, never as an authoring surface.

## Engine additions (the one real gap)

`DrawContext` (`canvas/engine/node.ts`) + its impl (`canvas/render/backends.ts`) gain:

- **`path(build, style)`** — a general bezier/arc sink. `build` receives a `PathSink` (a subset of the
  Canvas path API: `moveTo · lineTo · bezierCurveTo · quadraticCurveTo · arc · arcTo · closePath`).
  `canvasDrawContext` forwards to the real 2D context; a future vector backend implements the same
  method. This one primitive unlocks donut/annular arcs, smoothed lines, curved graph edges, treemap
  corners. **d3-shape renders straight into this** via its `.context()` protocol — the sink _is_ the
  interface d3 expects.
- **`measureText(text, style): { width }`** — axis labels, legends, and flow-node sizing need metrics
  the draw-only `text()` can't give. `canvasDrawContext` uses `cx.measureText`.
- **`clip(rect, fn)`** _(nice-to-have)_ — plot-area clipping so overflow lines/bars don't bleed.

All additive; no change to the surface command, layout engine, or export path.

## Structure

Two registry-backed subsystems in the pure-TS canvas layer, below the element specs. Named files, no
barrels (repo convention).

```
canvas/charts/
  types.ts        ChartData (persisted), ResolvedChart, Series, ChartType (registry entry)
  registry.ts     registerChart / getChart — mirrors the element registry
  data.ts         normalize(): coerce authored data → ResolvedChart; back-compat for old values:string
  scales.ts       d3-scale wrappers (linear / band / point / ordinal color)
  chrome.ts       shared cartesian chrome: axes, gridlines, legend, value labels (via DrawContext)
  bar.ts line.ts area.ts pie.ts scatter.ts radar.ts …   one ChartType per file
canvas/diagrams/
  types.ts        DiagramData, DiagramType, Node/Edge/Item shapes
  registry.ts
  templated/      process.ts cycle.ts pyramid.ts funnel.ts timeline.ts venn.ts quadrant.ts matrix.ts
  graph.ts        node+edge layout via dagre → paint nodes + curved edges + arrowheads
  sankey.ts       d3-sankey geometry → paint
```

`canvas/elements/chart.ts` + `canvas/elements/diagram.ts` (extracted from `data.ts`) stay thin
`ElementSpec` adapters: their `layout` returns a surface whose `paint` calls `renderChart` /
`renderDiagram`, and their `controls` are the base pickers plus each type's controls, gated by
`visibleWhen: { key: "type", … }` (already supported — no engine change).

### Data model (replaces `values: string`)

```ts
interface ChartData {
    type: ChartType["id"]; // "bar" | "line" | "pie" | …
    series: Series[]; // one or many
    categories?: string[]; // x-axis labels for categorical charts
    options?: ChartOptions; // stacked | smooth | showValues | legend | axis titles | …
    height?: number;
}
interface Series {
    name?: string;
    color?: string;
    points: number[];
}
```

`normalize()` accepts the legacy `{ values: string }` and lifts it to `{ series: [{ points }] }`, so
existing artifacts keep rendering. Graph diagrams carry `{ type, nodes: Node[], edges: Edge[] }`;
templated diagrams carry `{ type, items: Item[] }`.

### Registry entry

```ts
interface ChartType {
    id: string;
    label: string;
    needs: { series: "one" | "many"; categories?: boolean }; // drives the data editor
    render(g: DrawContext, box: Rect, model: ResolvedChart, theme: Tokens): void;
    controls?: ControlField[]; // type-specific, merged under visibleWhen
}
```

Adding a type = one file + one `registerChart(...)`. No branch in a growing function, no new element,
no engine change.

### Dependencies (all MIT/ISC, framework-agnostic, DOM-free, tree-shakeable)

- **d3-scale, d3-shape, d3-array** — scales + line/area/arc/pie generators + helpers (cartesian charts).
- **d3-hierarchy** — treemap / sunburst / tree layouts.
- **d3-sankey** — sankey geometry.
- **@dagrejs/dagre** — directed-graph layout for flow/org/tree/mindmap/network (start here; simple, pure
  JS). **elkjs** later if we need denser, cleaner layered layouts (heavier, worker-capable).

These land in the `canvas` bundle (editor + app + export). Individually small; graph-layout deps can be
lazy-loaded for the diagram element if bundle size warrants.

## Type catalog

**Charts** — bar / column / horizontal · grouped · stacked · 100%-stacked · line (single/multi) ·
smoothed line · area · stacked area · streamgraph · pie · donut · rose · scatter · bubble · radar ·
histogram · waterfall · gauge · heatmap · treemap · sunburst · sankey · funnel.

**Diagrams** — _templated:_ process / steps · cycle · pyramid · funnel · timeline · venn · quadrant
(2×2) · comparison matrix. _graph (auto-layout):_ flowchart · org chart · tree · mindmap · network · ER.

## Phased path

- **P0 — foundation.** Add `DrawContext.path()` + `measureText()`. Add d3-scale/shape/array. Scaffold
  `canvas/charts/` (types, registry, scales, chrome, normalize + back-compat). Port bar/line/pie into
  the registry — now _with_ real axes, gridlines, value labels, legend, and multi-series. Prove it end
  to end (editor inspector + PDF export).
- **P1 — cartesian breadth.** grouped/stacked/100% bar · multi + smoothed line · area/stacked area ·
  scatter/bubble · radar · donut (uses `path` arcs).
- **P2 — hierarchical + specialized.** treemap · sunburst (d3-hierarchy) · sankey (d3-sankey) · funnel ·
  waterfall · gauge · heatmap.
- **P3 — diagrams.** Refactor the 4 templated diagrams into the registry; add timeline/venn/quadrant/
  matrix. Then graph diagrams via dagre: flowchart/org/tree/mindmap/network with node+edge structured
  authoring, curved edges, arrowheads.
- **Cross-cutting (parallel).** A structured/grid data editor to retire the comma-string; AI-generation
  emitting the structured `ChartData`/`DiagramData`; per-type controls via `visibleWhen`.

## Deferred / open

- **Interactivity (hover tooltips, click).** Surfaces are static rasters today; tooltips need
  editor-level hit-testing over the surface box. Out of scope until the catalog lands.
- **Vector PDF.** When a vector `DrawContext` is built, every d3-geometry chart becomes crisp vector
  automatically — the reason this approach is future-proof and a canvas lib would not be.
- **elkjs vs. dagre** for large/dense graphs — revisit after flowchart/org land on dagre.
