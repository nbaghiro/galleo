# Galleo — Studio (editor) roadmap

> The path from "engine renders a static artifact" to "full editing experience." Each phase is a
> visible, demoable increment on the dev server (`pnpm dev` → localhost:8600). Companion to
> `docs/architecture.md` (the whole-codebase map) — this drills into `surfaces/studio`.

## Status (Arc A — editing core) — COMPLETE
- **P1 ✓** continuous section canvas + minimap + palette (SolidJS + Vite + Tailwind)
- **P2 ✓** selection + hover overlay (engine regions + addressing, hit-test, Esc-walks-up)
- **P3 ✓** drag-drop with live drop-targets (content ops, pointer DnD, skeleton ghost, undo/redo)
- **P4 ✓** inspector (schema-driven controls) + section layout picker (live edits + undo)
- **P5 ✓** inline text editing — contenteditable overlay matching engine text, live edits + undo
- composites (`stat`/`quote`/`bullets`) are containers of real `text` elements → nested selection/editing
Geometry/ops live in the pure kernel; Solid owns shell + state; the engine paints into refs.

P5 v1 uses a contenteditable overlay (browser caret/IME); full Path B (custom glyph caret +
`kernel/text` line-layout, rich marks) is a later hardening.

## Status (Arc B — a real format tool)
- **P6 ✓** theming — semantic token model (`kernel/themes`), 6-theme library, elements read theme
  colors via `LayoutCtx.theme`, topbar switcher, themed canvas (live recolor + undo)
- **P7 ◦** format-as-view — deck/doc/web present + export (`engine/profile` + `engine/fragment`)
- **P8 ◦** element library — chart · table · video · embed · photo grid · code · …

```
surfaces/studio/  main.ts ✓  dom-backend.ts ✓  measure.ts ✓  sample.ts ✓
```

---

## The editing model (LOCKED — the ideal)

**The canvas is layout-agnostic.** It is *not* a deck of paginated slides with a deck/doc/web
toggle. It is **one canonical authoring view: an infinitely-scrollable, virtualized vertical list of
variable-height Sections.** Format (deck/doc/web/custom size) is a **present/export/preview
transform** applied to this same artifact — never an editing mode.

```
┌ topbar  title · Present · Share · ✦ Generate · theme ─────────────────────────────┐
├ minimap ─┬ canvas  (infinite vertical scroll of sections) ────────────┬ right panel ┤
│ ▭ sec 1  │  ┌─ Section 1 · layout: hero ───────────────────────────┐  │  PALETTE    │
│ ▭ sec 2  │  │  ▦ heading cell        ▦ image cell                  │  │  drag from  │
│ ▭ sec 3  │  └──────────────────────────────────────────────────────┘  │  here ↓     │
│ ▭ sec 4  │  ┌─ Section 2 · layout: split-6040 ─────────────────────┐  │  Text       │
│   + add  │  │  ▦ text cell          ▢ empty cell  ← drop target    │  │  Image      │
│          │  └──────────────────────────────────────────────────────┘  │  Chart …    │
│          │            ▼ (drag an element → live drop zones light up)   │ (or inspector│
└──────────┴────────────────────────────────────────────────────────────┴  when sel'd) ┘
```

### Three zones
- **Canvas (center)** — the artifact as a continuous, **virtualized** scroll of Sections (only
  visible sections are laid out/painted, so it stays smooth at any length). Each Section is
  **variable-height**, engine-rendered, and carries its own **layout**.
- **Minimap (left)** — small **live thumbnails** of every section. Click → jump-scroll. Drag →
  reorder sections. `+ add section`. Pure navigation/organization.
- **Right panel** — context-dependent:
  - nothing selected → **element palette** (the block/element library you *drag from*),
  - element selected → its **inspector** (schema-driven `ElementSpec.controls`),
  - section selected → its **layout picker** (template or custom-grid editor).

### Section layout = a template **or** a custom grid
Each Section's internal layout is **one of a predefined set of templates** (full · split-6040 ·
2-col · 3-up · hero+2 · bento-a …) that define its **cells**, OR a **custom grid** the user edits
(add/resize rows/cols/areas). **Cells hold one element** (or a nested container). **Empty cells are
drop targets.**

### The signature interaction — drag-drop with live drop-targets
Dragging an element (from the palette, or an existing element) over a Section computes **candidate
drop zones from the section's grid geometry + cursor position**, and highlights the nearest one live:
- **empty cell** → highlight the whole cell,
- **populated cell** → insertion point before/after the existing content,
- **cell edge** → *split* the cell into a new column/row (grows the grid),
- **gap between sections** → create a new section.

Drop places the element (splits update the grid). This is the heart of the editor.

### Format is a view, not a mode
Deck / Doc / Web / custom dimensions are **transforms over the same continuous-section artifact**,
surfaced in Present / Publish / Export — not a canvas toggle. "Present" paginates sections into
fixed-ratio slides (via `engine/fragment`); "Publish" renders full-bleed web; "Export PDF"
paginates to pages. (A section may *optionally* opt into a fixed aspect ratio later if a user wants
a slide-shaped section.) This is why the editing canvas is layout-agnostic.

---

## Phases (each ends in a demoable editor)

### P1 — Continuous section canvas + minimap
- engine: **section-stack** layout (stack variable-height sections vertically, **virtualized**) +
  **`engine/grid`** (section template → cell rects) + a **`compose`** step (section → cells →
  element nodes).
- `studio`: `shell` (topbar / minimap / canvas / right-panel regions), `state/store` (the artifact =
  ordered Sections), `canvas` (compose + layout + paint visible range), `minimap` (live section
  thumbnails, jump-scroll).
- **DoD:** scroll a real multi-section artifact; each section renders via the engine with its
  template's cells; the left minimap shows + navigates sections.

### P2 — Selection + overlay
- engine: tag render commands with `element id` / `cell id` / `section id`.
- `studio`: `hit-test` (pixel → id), `overlay` (selection outline · hover · handles), `selection`
  model (element → cell → section → artifact; Esc walks up).
- **DoD:** click any element/cell/section → it selects and highlights.

### P3 — Drag-drop + palette + live drop-targets (the signature)
- `studio`: right-panel **`palette`** (element library, drag source); **`dnd`** (drag controller) +
  **`drop-targets`** (compute candidate zones from grid geometry + cursor; highlight nearest);
  drop → insert into cell / split / new section.
- `state`: content **`ops`** (insert/move/split) + **`history`** (undo/redo).
- **DoD:** drag Text/Image from the palette onto a section → drop zones light up as you move →
  drop into an empty cell or split a cell; move existing elements between cells; undo.

### P4 — Inspector + section layout editing
- `studio`: `inspector` (schema-driven from `ElementSpec.controls`; change → mutate `data` →
  recompose cell → re-layout live); section **`layout-picker`** (swap template) + **custom-grid**
  editor (add/resize cells/areas).
- **DoD:** select an element → tweak its controls live; select a section → change its template or
  drag its grid lines to a custom layout.

### P5 — Text editing (Path B)
- `kernel/text`: `layout-text` (line layout + glyph geometry) + `ops`.
- `studio/text-editing`: hidden-CE input/IME `host` + `caret` + `input`.
- **DoD:** double-click a text element → inline edit with a real caret; bold/italic/link; blocks
  reflow live; what you edit == what renders.

### P6 — Theme · format views · agent · persistence
- `studio`: `theme-modal` (live re-theme via `kernel/themes/library`); **Present / Publish / Export**
  as format transforms (`engine/profile` + `engine/fragment`); `agent/chat` → `surfaces/agent` ops;
  `io` ↔ `services/api`/`data` (persist `draft_content`).
- **DoD:** create → drag-build → tweak → re-theme → present (paginated) → export PDF → publish.

---

## Notes
- **Drag-drop (P3) is the signature interaction** and is elevated early — it's what makes this feel
  like Gamma/Webflow rather than a slide tool.
- **Virtualization** in P1 is non-negotiable for "infinitely scrollable" — lay out/paint only the
  visible section range (+ buffer).
- **P1–P4 need no backend** (in-memory artifact); persistence lands in P6.
- This **supersedes the deck/doc/web-as-editing-mode** idea from earlier docs: those layout modes
  are now Present/Export views over one continuous-section authoring canvas. `FormatDescriptor`
  (`docs/layout-engine.md`) still applies — as the transform, not the editor.
