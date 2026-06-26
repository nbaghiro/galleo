# Galleo — Element System & Catalog (design, LOCKED)

> Status: **Decision locked (2026-06-24).** Companion to `docs/layout-engine.md` (the Clay
> layout core) and `design/product-direction.md`. This doc defines the **content component layer**
> that sits on top of the layout engine: the universal `ElementSpec` contract, exactly how an
> element compiles into Clay engine nodes, the Section-grid solver, the render pipeline,
> selection/controls, export, and the full element catalog.

---

## 1. The three tiers

Elements and Section-grids are *higher-level* concepts that **compile down to** the engine's boxes.

```
Artifact
  └─ Section          ← a card/slide-section; owns a GRID TEMPLATE (predefined cells)
       └─ Cell        ← a slot/area in the grid (an element may span cells → bento)
            └─ Element ← the shareable content component (text, image, chart, …)  ← the UNIT OF EDIT
                 └─ EngineNode[]  ← Clay boxes (what actually lays out)
```

- **Element** = selectable / editable / shareable unit, with data + controls + render + export.
- **Cell / Section grid** = *where* (predefined configurations).
- **Engine** = *how* (the locked Clay core).

---

## 2. The universal contract: `ElementSpec`

Every element — from a `divider` to a `chart` — is one registry entry with the same shape
(pattern: BlockNote `createBlockSpec`, ProseMirror nodeSpec, extended for multi-backend export).

```ts
interface ElementSpec<Data> {
  type: string;                                  // 'text' | 'image' | 'photoGrid' | 'chart' | …
  label: string; icon: Icon; category: Category; // for the insert / slash menu
  tier: 'primitive' | 'smart' | 'container' | 'interactive';

  create(): Data;                                // default data on insert
  layout(data: Data, ctx: LayoutCtx): EngineNode;// → Clay subtree (element lays out its OWN internals)

  controls: ControlSchema<Data>;                 // schema-driven inspector, shown WHEN SELECTED
  toolbar?: ToolbarAction[];                     // inline quick actions on canvas

  // export overrides per backend; default = whatever layout() emitted
  export?: { pdf?(d,box):Cmd; pptx?(d,box):Cmd; png?(d,box):Cmd };
  fallback?(data: Data): Data;                   // interactive → static (video→poster, embed→link)

  capabilities: { minW?:number; maxW?:number; minH?:number;
                  resizable?:boolean; canBackground?:boolean; formats?:FormatKind[] };
  ai?: { generate?(prompt:string):Data; edit?(d:Data, instruction:string):Data };
  skeleton?(ctx: LayoutCtx): EngineNode;   // structural ghost (palette + drop preview); auto if omitted
}

// Skeletons — every element shows a structural ghost in the right-panel palette (drag source) and as
// the drop preview that ghosts into a target cell while dragging over a section.
//  - AUTO: if `skeleton` is omitted it's derived from `skeletonize(layout(create()))` — text→bars,
//    image/surface→ghost box, fills→panel-grey. Every element gets a faithful skeleton for free.
//  - OVERRIDE: visual elements (chart, table, a fit-width button) supply a custom `skeleton`.
//    Built from engine primitives (@elements/skeleton: bar/block/pill/dot) and rendered by the same
//    engine — so previews are real engine output. (Implemented in kernel/elements/skeleton.ts.)

type LayoutCtx = {
  box: Rect;            // the cell rectangle the element is being laid out into (constraints-down root)
  availWidth: number;   // = box.w; used for the element's own responsive decisions
  format: FormatDescriptor;
  tokens: Tokens;       // type scale + spacing, already multiplied by format.tokenScale
  theme: Theme;         // colors/fonts/radius from the active theme
};
```

`ControlSchema` is a declarative field list (`select | slider | toggle | color | number | text |
data-editor | media-picker | custom`). A **generic inspector** renders most elements; `custom`
is the escape hatch for chart/table/diagram data editors. **No bespoke panel per element** in the
common case.

---

## 3. Under the hood — how an Element becomes Clay boxes

The engine node mirrors Clay 1:1 (sizing `FIT/GROW/PERCENT/FIXED`, `dir`, `pad`, `gap`, `align`,
`aspect`, `float`, text `wrap`), plus **two leaf payload kinds** so smart visuals fit the same model:

```ts
type EngineNode = {
  id?: string;                                   // element/instance id → hit-testing & selection
  w: Size; h: Size; aspect?: number;
  dir?: 'row'|'col'; pad?: Box; gap?: number; align?: {x;y}; float?: Float;
  // leaves (one of):
  text?:    { runs: Run[]; fontId; size; wrap:'words'|'none'; align; lineHeight; letter };
  image?:   { src; fit:'cover'|'contain'; crop?; focal?; radius? };
  fill?:    { color?; gradient?; border?; radius? };
  surface?: { paint(g: DrawCtx, box: Rect): void };   // ← self-rendered elements (charts/diagrams)
  children?: EngineNode[];
};
```

**Two rendering strategies** (both produce render commands, both export-faithful):
1. **Primitive subtree** — the element returns a tree of `text/image/fill` nodes. The engine lays
   them out (constraints-down/sizes-up). *Most* elements (text, lists, cards, stats, tables, grids).
2. **Self-rendered surface** — the element returns a sized node with a `surface.paint(g, box)`
   callback. The engine resolves the box (via `GROW/aspect/FIXED`), then the element paints into it.
   `g` is backend-abstract → SVG/Canvas in editor, vector ops for PDF, raster for PPTX. Used by
   **charts, diagrams, maps, sparklines, QR, signatures** — anything not made of text/box primitives.

### Worked examples

**Text** (primitive; width-in, height-out via `MeasureText`):
```ts
layout(d, ctx) => ({ w:GROW(), h:FIT(),
  text:{ runs:d.runs, fontId:ctx.tokens.font.body, size:ctx.tokens.size.body,
         wrap:'words', align:d.align, lineHeight:ctx.tokens.lh } })
```

**Image** (primitive; engine enforces aspect):
```ts
layout(d, ctx) => ({ w:GROW(), h: d.aspect ? FIT() : GROW(), aspect:d.aspect,
  image:{ src:d.src, fit:d.fit, crop:d.crop, focal:d.focal, radius:ctx.tokens.radius } })
```

**Bulleted list** (primitive; column of marker+text rows):
```ts
layout(d, ctx) => ({ w:GROW(), h:FIT(), dir:'col', gap:ctx.tokens.space.sm,
  children: d.items.map(it => ({ dir:'row', gap:ctx.tokens.space.xs, w:GROW(), h:FIT(), children:[
    { w:FIXED(8), h:FIXED(8), fill:{color:ctx.theme.accent, radius:99}, align:{y:'start'} },
    { w:GROW(), h:FIT(), text:{ runs:it.runs, ...body(ctx) } } ]})) })
```

**Photo grid** (primitive; **the element computes its own rows** because Clay has no child-wrap —
this is the responsive-column logic living inside the element):
```ts
layout(d, ctx) => {
  const cols = d.cols ?? bestCols(ctx.availWidth, d.images.length);   // responsive from width
  const rows = chunk(d.images, cols);
  return { w:GROW(), h:FIT(), dir:'col', gap:d.gap, children: rows.map(row => ({
    dir:'row', gap:d.gap, w:GROW(), h:FIT(), children: row.map(img => ({
      w:PERCENT(1/cols), h:FIT(), aspect:d.aspect,
      image:{ src:img.src, fit:'cover', radius:ctx.tokens.radius } })) })) };
}
```

**Chart** (self-rendered surface; engine sizes the box, element paints):
```ts
layout(d, ctx) => ({ w:GROW(), h: d.h ? FIXED(d.h) : GROW({min:220}),
  surface:{ paint:(g, box) => drawChart(g, box, d, ctx.theme) } })
```

> Pattern: **simple/structural elements emit primitive subtrees; visual/smart elements emit a
> sized surface they paint themselves.** Both flow through the same engine and export paths.

---

## 4. Section grid → engine (the one place we extend Clay)

Clay is flex-only. Section templates need **grid with spanning** (bento), so the engine adds a
small **Grid node** (track sizing + area placement), à la what Taffy added over flexbox. Templates
are **predefined**, so each ships a deterministic solver — no general CSS-Grid engine in v1.

```ts
type GridTemplate = {
  id; name;                                   // 'full' | 'split-6040' | '3-up' | 'hero+2' | 'bento-a'
  cols: Track[]; rows: Track[];               // Track = grow | percent | fixed
  cells: { id; col:[s,e]; row:[s,e] }[];      // named areas; elements bind to cell id; ranges allow spanning
  responsive?: { belowW:number; use:GridTemplateId }[];  // collapse (3-up → stacked) in narrow formats
};

grid.solveCells(box, format): Rect[] {
  const t = pickTemplate(this.id, box.w, format);    // responsive swap below splitMinW
  const cw = resolveTracks(t.cols, box.w, this.gap); // grow/percent/fixed → px column widths
  const ch = resolveTracks(t.rows, box.h, this.gap); // paged: fixed height; continuous: 'auto'
  return t.cells.map(c => rectFromSpans(cw, ch, c)); // supports spanning
}
```
- **Simple (non-spanning) templates** can also compile to nested flex (`col` of `row`s) — cheaper.
- **`fit` tracks** (content-sized columns) require measuring the cell's element first; we keep
  templates on `grow`/`percent` to avoid that, and only measure when a `fit` track is used.

---

## 5. The full render pipeline (ties §3–4 to `layout-engine.md`)

```ts
function renderArtifact(artifact, format, viewport): RenderCommand[] {
  const out: RenderCommand[] = [];
  for (const s of artifact.sections) {
    const sBox  = sectionBox(s, format, viewport);          // width from format; height fixed(paged)/auto
    const cells = s.grid.solveCells(sBox, format);           // grid → cell rects (responsive)
    s.grid.cells.forEach((area, i) => {
      const el  = s.elements[area.id];           if (!el) return; // empty cell → editor shows "+ add"
      const ctx = { box: cells[i], availWidth: cells[i].w, format,
                    tokens: scaleTokens(format), theme: artifact.theme };
      const node = registry.get(el.type).layout(el.data, ctx);    // element → engine subtree/surface
      out.push(...engine.layout(node, cells[i]));                 // Clay resolves subtree INTO the cell
    });
  }
  return format.kind === 'paged' ? paginate(out, format) : out;   // deck/print → fragment into pages
}
```
Each cell is an **independent constraints-down layout** rooted at its rect — modular, cacheable,
and trivially parallelizable. The Section grid handles inter-cell sizing; the element handles
intra-cell sizing. Output is one `RenderCommand[]` → the backends in `layout-engine.md` (DOM /
Canvas / PDF / PPTX).

**Live edit / resize:** changing an element's `data` (via controls) recomposes *only that cell*;
resizing the canvas re-runs `solveCells` + the affected cells. Immediate-mode + per-cell roots make
this microsecond-cheap.

---

## 6. Selection & controls

The engine emits each box with its `element id`, so hit-testing and chrome positioning are free.

| Selection level | Inspector (right panel) | Canvas chrome |
|---|---|---|
| **Element** | `spec.controls` (schema-driven UI) | resize handles + `spec.toolbar` |
| **Cell / Section** | grid-template picker · cell sizing · add/remove cell | grid outline + split handles |
| **Artifact** | Format Descriptor (dimensions/resize) + Theme | — |

```
click → hit-test topmost render command → element id → SELECT(element)
  inspector.render(spec.controls, el.data)
  onControlChange(patch): el.data = apply(el.data, patch) → recompose(cell) → engine.layout(cell) → repaint
overlay handles/toolbar positioned from the element's computed box
Esc → select up (element → cell → section → artifact)
```
Nested selection mirrors Figma. Because controls only mutate `data`, every change flows back
through the same `layout()` → engine path (no special-case rendering).

---

## 7. Export & static fallbacks

- Each backend consumes the same `RenderCommand[]`; `surface.paint` is invoked with the backend's
  `DrawCtx` (vector for PDF, raster for PPTX, canvas for PNG/Present).
- **Interactive elements (🌐)** must define `fallback(data)` → a static element for paged/export
  formats: `video→poster image`, `embed→link card / snapshot`, `gif→first frame`, `form→rendered
  fields`, `carousel→first slide (+ "N more")`, `map→static tile`.
- **PPTX text caveat** (from `layout-engine.md` §9): PowerPoint re-flows text → for pixel-exact
  decks, text-heavy elements export as fixed boxes / per-line boxes / outlines.

---

## 8. Registry, extensibility & "shareable"

- **Element registry** — `register(spec)`; the insert/slash menu, AI, and serialization are all
  driven by it. Adding an element = adding a spec; **zero engine changes**.
- **Shareable, two senses:**
  1. *Type registry* — definitions shared across the whole app.
  2. *Saved components/presets* — a configured element instance (or a whole Section grid+elements)
     saved to a **library / brand kit**, reused across artifacts, optionally **linked** (edit once →
     propagate, Figma-component style) or pasted detached (Webflow slots + per-instance properties).
- **AI hooks** — `spec.ai.generate/edit` lets the Galleo agent create and revise any element by
  type; the agent works in `data` space, then the normal `layout()` path renders it.

---

## 9. Risks (element layer)
| Risk | Mitigation |
|---|---|
| **Text element is its own world** (caret, IME, selection) | Build the Text element on a proven core (ProseMirror/Lexical) wired to the engine's `MeasureText`; all other elements use the simple `ElementSpec`. |
| Interactive elements in paged/export | Mandatory `fallback(data)` per interactive spec. |
| Smart-element inspectors (chart/table/diagram) | Allow a `custom` control panel escape hatch. |
| Bento spanning + responsive collapse | Predefined templates with deterministic `solveCells`; defer general grid. |
| `surface` elements + export fidelity | Backend-abstract `DrawCtx`; golden-image tests per element per backend. |

---

## 10. Phased rollout (maps to `layout-engine.md` phases)

| Phase (engine) | Elements delivered |
|---|---|
| **1 — Core** | `text`, `image`, `fill/divider/spacer`, `card` (▦) — exercise primitive subtrees |
| **2 — Compose + Formats** | `eyebrow`, `heading`, `bulletList`, `feature list`, `cover`, `columns` (▦), `button` |
| **3 — Wire into demo** | `stat`, `pull quote`, `photoGrid`, `icon`, `badge`, `pricing table`, `card grid` |
| **4 — Fragmentation** | `steps`, `timeline`, `table` (split across pages) |
| **5 — Export** | `chart`, `qr`, `video`+`fallback`, `embed`+`fallback` (surface + static fallbacks) |
| **6 — Author control** | container elements (`tabs`/`accordion`/`carousel`), `pin` sizing |
| **7+ — Backlog** | everything else in the catalog (Appendix A), demand-driven |

**Core v1 (~24, ⭐):** heading · body · eyebrow · pull quote · bulleted/numbered/feature list ·
steps · timeline · image · photoGrid · icon · video · embed · chart · stat · table · pricing table
· card grid · button/CTA · cover · badge · divider · spacer · gradient · card · columns · QR ·
AI image.

---

## Appendix A — Full element catalog

> Legend: ⭐ Core v1 · 🧠 smart/composite · 🌐 interactive (needs `fallback`) · 🤖 AI · ▦ container

**A. Text & typography** — ⭐Heading · ⭐Body · ⭐Eyebrow/kicker · ⭐Pull quote · 🧠Testimonial ·
Caption · 🧠Callout(note/tip/warn) · ⭐Code block · Math/equation · 🧠TOC · Footnote/citation ·
🌐Animated headline · Legal/fine print

**B. Lists & structured text** 🧠 — ⭐Bulleted · ⭐Numbered · Checklist · Definition list ·
⭐Feature list · ⭐Steps/process · ⭐Timeline

**C. Media — images & graphics** — ⭐Image · ⭐Photo grid 🧠 · Masonry 🧠 · 🌐Carousel ▦ ·
🌐Before/after slider · ⭐Icon · GIF · Sticker/emoji · Logo · 🧠Logo wall · Avatar · 🧠Device mockup
· 🌐Image hotspots

**D. Video, motion & audio** 🌐 — ⭐Video(upload) · ⭐Video embed · Background video ·
Audio/podcast · Lottie · Screen recording · 3D model viewer

**E. Data & charts** 🧠 — ⭐Chart(bar/line/area/pie/scatter/radar/funnel) · ⭐Stat/big number ·
Sparkline · Progress/gauge/meter · 🌐Counter · Comparison/2×2 · Heatmap · Scoreboard ·
🌐Live data widget

**F. Diagrams & process** 🧠 — ⭐Flow/process · Cycle/loop · Pyramid · Funnel · Org chart/tree ·
Mind map · Venn · Flowchart · Swimlane · Network graph · Arrow/connector · 🤖AI smart diagram

**G. Tables, grids & cards** 🧠 — ⭐Table · Comparison table · ⭐Pricing table · ⭐Card grid ·
Team/profile grid · Bento grid ▦

**H. Inputs, forms & interactive** 🌐 — ⭐Button/CTA · Button group · 🧠Form · Input/textarea ·
🧠Newsletter capture · Search bar · Toggle · Slider · Rating · 🧠Poll/quiz · 🧠Countdown · ▦Tabs ·
▦Accordion/FAQ · ▦Modal · Pricing toggle · Social share/reactions · Chat/booking widget ·
Cookie banner

**I. Embeds & integrations** 🌐 — ⭐Generic embed/iframe · ⭐Link preview/bookmark · Map ·
Calendar/scheduler · Form embed · Doc embed · Figma embed · Code embed · Music · Social post ·
PDF embed · Live spreadsheet

**J. Navigation & site chrome** 🌐 — Navbar/menu · 🧠Footer · Breadcrumbs · Anchor/jump nav ·
Sticky CTA bar · Back-to-top · Pagination

**K. Branding, identity & social proof** — ⭐Cover/title 🧠 · Logo/wordmark · Color palette ·
Signature · Watermark · ⭐QR code · 🧠Contact card/vCard · ⭐Badge/tag/chip · Ribbon ·
🧠Trust badges · 🧠Case study card

**L. Shapes, dividers & decoration** — ⭐Divider/rule · ⭐Spacer · Shape(rect/ellipse/poly/star) ·
Line/arrow/connector · Freeform/pen · Highlight/scribble · Blob · ⭐Gradient/fill · Pattern/texture
· ▦Frame/card/panel

**M. Containers** ▦ — ⭐Card/panel · ⭐Columns/grid · Group · Tabs · Accordion · Carousel ·
Sticky/floating

**N. AI, dynamic & personalization** 🤖 — ⭐AI image · AI illustration/icon · 🧠AI chart ·
🧠AI smart diagram · 🧠AI summary/takeaways · Variable/merge field · Conditional content ·
Localized block · 🧠Smart layout (auto-arrange)
