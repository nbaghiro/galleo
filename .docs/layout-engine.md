# Galleo — Layout Engine (design, LOCKED)

> Status: **Decision locked (2026-06-24).** This is the architecture spec for Galleo's
> rendering core. Companion to `element-system.md` and `design/product-direction.md`.

---

## 1. Decision summary (the lock-in)

Galleo renders all content through a **custom, Clay-style, immediate-mode box-layout engine**,
**ported to TypeScript**, that lays out **one container at one pixel size into backend-agnostic
render commands**. Everything format-specific (deck vs doc vs web vs any custom size) is data — a
**Format Descriptor** — fed to the same engine. On top of the Clay core we build four thin
layers: **compose** (block → engine tree, width-aware arrangement), **fragmentation**
(pagination for slides/print), **text measurement** (the fidelity contract), and **backends**
(DOM / Canvas / PDF / PPTX).

Rationale, in one line each:

- **Clay model** → flexbox-simple sizing (`FIT/GROW/PERCENT/FIXED`) + render-command output that
  feeds web, canvas, and export from one layout. ([Clay](https://github.com/nicbarker/clay))
- **Immediate mode** → "recompute from scratch" is fast enough at our scale and makes resize,
  theme-switch, edit, and _new dimensions_ all collapse to one verb: recompute.
- **Constraints-down/sizes-up** (Flutter's model, which Clay embodies) → every box resolves to
  absolute `x/y/w/h` in one O(n) pass ⇒ **export fidelity is a free byproduct**.
- **Ported to TS, not WASM** → the `MeasureText` callback fires per text node; a JS↔WASM boundary
  per call is the classic perf killer. Pure-TS calls Canvas `measureText` directly. (WASM stays an
  option for heavy server-side export.)

**Non-goals (v1):** a general constraint solver (Cassowary) as the core; CSS Grid semantics;
relayout-boundary incremental caching (add later only if artifacts get huge); pixel-perfect PPTX
_text_ (see §9 — fundamentally approximate).

---

## 2. The core principle

> The engine lays out **one container, at one size, into render commands.** It knows nothing
> about pages, breakpoints, fonts, or formats. Those are all data + thin layers around it.

```
Block tree (authored ONCE)
      │
      ▼  compose(format, availWidth)   ── tokens · arrangement · bleed
Engine tree   (FIT/GROW/PERCENT/FIXED · direction · align · padding · gap · floating · aspect)
      │
      ▼  layout(tree, {W,H})           ── Clay-style passes, O(n)
RenderCommand[]   (rect · text · image · border · clip — each with boxed x/y/w/h)
      │
      ├─► DOM (position:absolute / transform)   ← editor / web
      ├─► Canvas / WebGL                         ← Present, PNG
      ├─► PDF (points)                           ← export
      └─► PPTX (EMUs)                            ← export
```

The three current modes are **three Format Descriptors**, nothing more:

- **Deck** = a _paged_ format, 1000×625 per page, paginated.
- **Doc** = a _continuous_ format at a fixed page width; paginates only on print/PDF export.
- **Web** = a _continuous_ format whose width _fills the viewport_ and recomputes on resize.

---

## 3. Dimensions are data — the Format Descriptor (headline capability)

Because the engine is dimension-agnostic and immediate-mode, **supporting a new size or a
user-resizable canvas is a data change, not new code.** This is the product feature: users get
Figma-frame / Canva-custom-size power, and _live resizing_, out of the box.

```ts
type FormatDescriptor = {
    id: string;
    name: string;
    kind: "paged" | "continuous";

    // geometry
    width: number | "fill"; // 'fill' = track the viewport/container (web, resizable canvas)
    height: number | "auto"; // paged → fixed page height; continuous → 'auto'
    maxContentWidth?: number; // continuous: center & cap (doc = 720)
    margin?: Box;
    bleed?: boolean;

    // resize behavior
    resize: "fixed" | "fill" | { min: number; max: number };

    // styling parameterization (does NOT change content)
    tokenScale: number; // type/space multiplier (deck 1.0, doc 0.7, web 0.9)
    splitMinW: number; // below this, 'auto' sections stack instead of split

    // pagination (paged kind, or continuous-on-export)
    paginate: "always" | "export" | "never";
    break?: { avoidOrphans: boolean; keepHeadingWithNext: boolean };
};
```

**Built-in presets**
| Preset | kind | width × height | resize | paginate |
|---|---|---|---|---|
| Deck 16:10 | paged | 1000 × 625 | fixed | always |
| Deck 16:9 | paged | 1920 × 1080 | fixed | always |
| Document | continuous | 720 × auto | fixed | export (→ A4/Letter) |
| Webpage | continuous | fill × auto | fill | never |
| Social square | paged | 1080 × 1080 | fixed | always (1 page) |
| Story | paged | 1080 × 1920 | fixed | always |
| A4 print | paged | 794 × 1123 | fixed | always |

**Custom + resizable:** a user can create a format with any `width × height`, or set
`resize:'fill'` / `{min,max}` to get a **draggable canvas** — each drag frame calls
`layout(tree, {newW, newH})` and recomputes (µs). No new layout code; the same blocks just
re-flow. _This is the immediate-mode payoff the whole approach is built around._

---

## 4. Data model — blocks with _relative_ layout intent

Content is a single semantic tree. **No absolute coordinates are ever stored** — they are computed.

```ts
type Size =
  | { mode: 'fit';     min?: number; max?: number }   // size to content (clamped)
  | { mode: 'grow';    min?: number; max?: number }   // fill remaining space on the axis
  | { mode: 'percent'; v: number }                    // 0..1 of parent
  | { mode: 'fixed';   v: number };                   // exact px

type Block = {
  id: string;
  type: 'group'|'heading'|'text'|'image'|'stat'|'bullets'|'quote'|'cta'|'embed'|...;
  content?: unknown;                                  // text string, image src, data…
  layout: {
    w: Size; h: Size; aspect?: number;
    dir?: 'row' | 'col';
    pad?: Box; gap?: number;
    alignX?: 'start'|'center'|'end'; alignY?: 'start'|'center'|'end';
    arrange?: 'auto'|'split'|'stack'|'mediahead'|'bleed';  // 'auto' = decide from width
    breakInside?: 'avoid';                             // fragmentation hint (atomic)
    float?: { to: 'margin'|'parent'; at: AttachPoint; offset?: Vec2; z?: number };
    pin?: { w?: number; h?: number };                 // author-set custom size (secondary priority)
  };
  children?: Block[];
};

type Artifact = { root: Block; format: FormatDescriptor };
```

Atomic blocks (`stat`, a stat _row_, a button) carry `breakInside:'avoid'` so pagination never
splits them. `pin` is how "user builds custom-height blocks" (the secondary author-control goal).

---

## 5. The Clay core (TS port)

A small, dependency-free module. **Sizing model = Clay's exactly:** `FIT(min,max)`,
`GROW(min,max)`, `PERCENT(0..1)`, `FIXED(px)` on each axis, plus `layoutDirection`,
`childGap`, `padding`, `childAlignment{x,y}`, `aspectRatio`, `floating`, and text `wrapMode`.

**Algorithm — width-in / height-out, multi-pass but every pass O(n) over flat arrays:**

```
layout(tree, {W, H}):
  1. flatten        tree → arrays (parents, children, configs)        # cache-friendly
  2. measureLeaves  intrinsic min/max widths; text via MeasureText()  # memoized
  3. fitWidths      bottom-up: each node's content ("fit") width
  4. growShrinkW    top-down: distribute remaining width to GROW; shrink overflow
  5. wrapText       at resolved widths → line boxes → text heights      # width must be known first
  6. fitHeights     bottom-up: heights (now text heights known)
  7. growShrinkH    top-down
  8. position+emit  top-down: assign x/y, apply alignment & floating → RenderCommand[]
```

Output: `RenderCommand[]` — `{ kind:'rect'|'text'|'image'|'border'|'clip', box:{x,y,w,h},
config }`, sorted & culled. **The same array drives every backend.**

> **Clay does NOT wrap child elements** (only text wraps). So responsive "split → stack" is
> _our_ decision in the compose pass (§6), not the engine's. This is a feature: explicit,
> designed breakpoints we control, recomputed live.

---

## 6. The compose layer (block → engine tree)

`compose(block, format, availWidth) → EngineNode`. Owns three jobs:

1. **Token scaling.** Multiply type/space tokens by `format.tokenScale` (deck big, doc small).
2. **Width-aware arrangement** (the no-child-wrap workaround). For `arrange:'auto'|'split'`:
   `availWidth >= format.splitMinW` → emit `dir:'row'` (text | media); else `dir:'col'`
   (media-head/stack). `availWidth` for top-level sections ≈ container width; deeper decisions
   use the parent's resolved width (one extra measure when needed).
3. **Bleed & margins.** `format.bleed` lets a section opt out of the page margin (full-bleed
   hero); otherwise sections sit inside `format.margin`.

Because compose runs every recompute, **resizing the web canvas re-picks arrangements live.**

---

## 7. Pagination & fragmentation (deck + print)

Continuous formats (doc/web) skip this entirely on screen. **Paged formats** (deck, print)
need a section's flow sliced into page-height chunks. The engine doesn't paginate; we add:

```
fragment(section, pageContentSize):
  boxes = layout(compose(section, fmt, pageContentSize.w), {pageContentSize.w, auto})
  break section into pages by choosing break points that minimize:
      Σ pageUnderfillBadness  +  Σ breakPenalty
  rules:
    - never split a block with breakInside:'avoid'
    - keep a heading with its following block (no orphan headings)
    - avoid widow/orphan lines within a text block (Knuth–Plass-style line cost)
    - a single block taller than the page → its own page (scale media down to fit)
```

Default = one section per slide (the common case, no real fragmentation). The DP kicks in only
when a section overflows. **This fragmentation layer is the main thing we build that Clay lacks.**
([Knuth–Plass](https://en.wikipedia.org/wiki/Knuth%E2%80%93Plass_line-breaking_algorithm),
[CSS Fragmentation](https://argonaut-constellation.org/2023/04/22/balk%C3%B3n-pagination.html))

---

## 8. Text measurement & shaping — the fidelity contract

The single most important correctness invariant. The engine's `MeasureText(text, cfg)` callback
**must return identical metrics in the editor and in every export**, or PDFs drift from the screen.

- **Editor (browser):** Canvas 2D `measureText` (+ a small line-height model).
- **Export (server/headless):** the _same_ metrics via a shared font-metrics source — embed the
  exact fonts and shape with Skia / HarfBuzz, or run the same Canvas measurement in a headless
  context. One code path, one set of metrics.
- All Google-Fonts faces used by themes are bundled/self-hosted so editor and export agree.

---

## 9. Rendering & export backends

One `RenderCommand[]` → many serializers:

| Backend                         | How                                                              | Fidelity                                                                                                         |
| ------------------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| **DOM** (editor/web)            | absolutely-positioned / `transform`ed nodes, or paint to a layer | exact                                                                                                            |
| **Canvas/WebGL** (Present, PNG) | draw rects/text/images from commands                             | exact                                                                                                            |
| **PDF**                         | boxes → points (pdf-lib / PDFKit), embed fonts                   | exact                                                                                                            |
| **PPTX**                        | boxes → DrawingML shapes in EMUs                                 | **text approximate** — PowerPoint re-flows text; for exactness ship fixed text boxes / per-line boxes / outlines |

---

## 10. Performance & incremental strategy

- **Default: recompute the whole artifact** on any change. At Clay-class µs/element and typical
  artifact sizes (tens–low-hundreds of sections), this is imperceptible and dead simple.
- **Deck:** only the edited slide recomputes; others are cached render-command arrays.
- **Resize (web/custom canvas):** recompute on each frame — this is the intended hot path and is
  cheap.
- **Escape hatch (only if needed):** add Flutter-style **relayout boundaries** (a node whose size
  can't affect its parent caches its subtree) for very large artifacts. Not in v1.

---

## 11. Build vs reuse

| Piece                              | Decision                                                                                       |
| ---------------------------------- | ---------------------------------------------------------------------------------------------- |
| Box-layout core                    | **Build** — port Clay's algorithm to TS (~a few hundred lines; clean Canvas text interop).     |
| Sizing model                       | **Reuse Clay's** verbatim (FIT/GROW/PERCENT/FIXED).                                            |
| Compose / arrangement              | **Build** (small).                                                                             |
| Fragmentation / pagination         | **Build** (the hard part; Knuth–Plass-inspired).                                               |
| Text measurement                   | **Build** thin wrapper over Canvas/Skia/HarfBuzz.                                              |
| Export serializers                 | **Build** per target; reuse pdf-lib / pptxgenjs as writers.                                    |
| Constraint solver (pins/alignment) | **Defer** — optional kiwi.js layer above flow, later.                                          |
| WASM Clay / Taffy                  | **Fallback only** — if the TS port underperforms on huge artifacts or for heavy server export. |

---

## 12. Risks & mitigations

| Risk                                               | Mitigation                                                                                     |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Editor↔export text drift                           | One `MeasureText` path; bundle exact fonts; golden-image tests per theme.                      |
| PPTX text fidelity                                 | Accept approximate, or export fixed boxes / outlines / image fallback for pixel-exact decks.   |
| Fragmentation complexity                           | Ship "good not optimal" first (greedy + keep-with-next + avoid-atomic-split); add DP later.    |
| Column balancing (magazine doc)                    | Treat as a separate small solver; v1 single-column or fixed N columns without perfect balance. |
| TS port perf on huge trees                         | Flat typed arrays, memoized measures; WASM/Taffy fallback documented.                          |
| `arrange:'auto'` deep nesting needs resolved width | Limit auto-arrangement to section level (width≈container); one extra measure pass when nested. |

---

## 13. Implementation status

The engine described above is **built** and drives the studio, present mode, thumbnails, and export
(see `.docs/architecture.md` for the file map). The two calls this spec left open both landed:

- **Paint target** — DOM for editing (`studio/canvas/dom-backend.ts`, absolute-positioned divs from
  the render commands, so text selection / contenteditable work) and a **2D-canvas** mirror
  (`canvas-backend.ts`) reused for Present and PDF/PNG export, so what you edit is what you export.
- **Text editing** — a contenteditable overlay positioned over the engine box (`studio/editing/
TextEditor.tsx`); the engine's canvas `measureText` feeds the same layout loop, keeping the kernel
  DOM-free. (An engine-native caret model lives as scaffolding in `kernel/text`, not yet wired.)

Deferred by design: general (non-template) grid solving, kiwi.js alignment constraints, and a WASM
core for very large artifacts — none needed at current scale.
