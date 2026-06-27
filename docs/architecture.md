# Galleo — Codebase Structure (depth per section)

> The build-out map for every section. `✓` = exists today · `◦` = planned. The dependency law is
> absolute: **`kernel` imports nothing outside `kernel`; surfaces depend on kernel (+ services);
> no surface imports another surface** (ESLint-enforced). Concrete environment-specific backends
> (DOM/canvas/PDF) live with their surface, never in the pure kernel.

```
kernel/   the pure, edge-safe core (layout + content model + elements + text + themes + render iface)
surfaces/ the ways you touch the core (studio · present · publish · export · agent)
services/ the backend (data · api · auth · queue)
```

---

## kernel/ — the core (pure TS, no DOM)

### kernel/model — the content contract

```
content.ts          ✓ Id · Size · BoxInsets · ElementInstance · Cell · Section · ArtifactContent
format.ts           ✓ FormatKind · FormatDescriptor
size.ts             ✓ fit/grow/percent/fixed constructors
ops.ts              ◦ content edit operations (insert/move/delete/setData) — invertible (undo + CRDT)
validate.ts         ◦ zod schemas for the content tree (load/import safety)
migrate.ts          ◦ content schema-version upgraders
```

### kernel/engine — the layout solver

```
node.ts             ✓ EngineNode + leaves + Rect/Align/Measured/MeasureText
render-command.ts   ✓ flat RenderCommand union (rect/text/image/surface)
layout.ts           ✓ 3-pass solver: widths (top-down) → heights (bottom-up) → positions
intrinsic.ts        ◦ extract min/max-content sizing (currently inline in layout.ts)
grid.ts             ◦ section-grid track solver (cols/rows/areas + spanning) — the bit beyond flex
profile.ts          ◦ FormatDescriptor → resolved container box + tokenScale + paginate policy
fragment.ts         ◦ pagination: slice a continuous layout into fixed-height pages (deck/print)
```

### kernel/elements — the registry + element library

```
element-spec.ts     ✓ ElementSpec · LayoutCtx · ControlField
registry.ts         ✓ register / getElement / listElements
text.ts image.ts card.ts   ✓ first three elements
heading·body·list·stat·quote·cta·badge·divider·spacer·gradient·columns ...   ◦ Core-v1 set
chart·table·photo-grid·video·embed·timeline·steps·pricing ...                ◦ smart/interactive
controls.ts         ◦ shared control-schema helpers; per-element custom panels register here
catalog.ts          ◦ category metadata for the insert/slash menu
```

### kernel/text — engine-native rich text (Path B), pure parts only

```
model.ts            ✓ Para · Mark · TextContent
selection.ts        ✓ Point · Selection
ops.ts              ◦ invertible edit ops (insert/delete/split/merge/marks)
layout-text.ts      ◦ greedy line-break + glyph geometry (consumes injected measure)
  (the DOM input/IME sink + caret rendering live in surfaces/studio/text-editing — not here)
```

### kernel/themes — themes as data

```
theme.ts            ✓ Theme · Tokens
library.ts          ◦ the built-in theme set (the 22) as data
resolve.ts          ◦ theme → concrete token values used by elements/render
```

### kernel/render — the backend contract only

```
backend.ts          ✓ Backend interface (RenderCommand[] -> a target)
helpers.ts          ◦ shared command utilities (bounds, culling, hit-test math)
  (concrete backends are per-surface: studio=DOM, export=PDF/PPTX/PNG, publish=SSR)
```

---

## surfaces/ — the ways to touch the kernel

### surfaces/studio — the editor (deepest section)

```
shell.ts            ◦ mounts the regions: topbar · rail · canvas · inspector
state/
  store.ts          ◦ editor state: open artifact · selection · mode/format · dirty flag
  history.ts        ◦ undo/redo over content ops
  selection.ts      ◦ nested selection model (element → cell → section → artifact)
canvas/
  canvas.ts         ◦ run engine layout() → paint; re-layout on edit/resize/theme
  dom-backend.ts    ✓ paint render commands to absolute divs
  measure.ts        ✓ canvas text measurement (the engine's MeasureText)
  overlay.ts        ◦ selection chrome (handles · hover · "+ insert") positioned from boxes
  hit-test.ts       ◦ pixel → element id (from command boxes)
rail/
  rail.ts           ◦ slide thumbnails / section outline · reorder · add
inspector/
  inspector.ts      ◦ schema-driven controls from the selected ElementSpec.controls
  controls/         ◦ control widgets + per-element custom panels (chart/table data editors)
topbar/
  topbar.ts         ◦ doc title · Present · Share · ✦ Generate · theme button
themes/
  theme-modal.ts    ◦ the theme gallery modal (live apply across the artifact)
layout-switch.ts    ◦ Deck / Doc / Web mode toggle (re-parameterizes the same blocks)
text-editing/
  host.ts           ◦ hidden contenteditable input/IME sink (Path B)
  caret.ts          ◦ caret + selection rects rendered from the text layout
  input.ts          ◦ beforeinput/composition → kernel/text ops
agent/
  chat.ts           ◦ the Galleo agent chat panel (drives surfaces/agent runtime)
io/
  load-save.ts      ◦ fetch/persist the artifact via services/api
sample.ts main.ts index.html   ✓ current demo — evolves into the shell entry
```

### surfaces/present — presentation mode

```
present.ts          ◦ fullscreen slide nav (keyboard/remote) via engine + a canvas backend
notes.ts            ◦ speaker notes / presenter view
```

### surfaces/publish — hosted sites (edge SSR)

```
ssr.ts              ◦ render an artifact → HTML string/stream (a string render backend)
hydrate.ts          ◦ optional client interactivity for interactive elements
```

### surfaces/export — file outputs

```
pdf.ts pptx.ts png.ts   ◦ render commands → file (each is a render backend)
fonts.ts                ◦ embed + measurement parity with the editor (fidelity contract)
```

### surfaces/agent — the AI brain (UI-less; shared by studio chat + worker)

```
runtime.ts          ◦ a turn: prompt → content ops applied to the model
tools.ts            ◦ the ops the agent may perform (add/edit/restyle/regenerate)
generate.ts         ◦ outline-first generation (prompt → outline → full artifact)
```

---

## services/ — the backend

### services/data

```
schema.ts           ✓ Drizzle schema (v1-core tables; full 29 in docs/data-model.md)
client.ts           ✓ db client
queries/            ◦ typed query modules per domain (artifacts · workspaces · shares · …)
migrations/         ◦ drizzle-kit output
seed.ts             ◦ system themes · formats · templates
rls.sql             ◦ Postgres row-level-security policies (workspace_id tenancy)
```

### services/api

```
server.ts           ◦ HTTP app (Hono/tRPC) + middleware
routes/             ◦ artifacts · folders · shares · links · auth · agent · export
validate/           ◦ zod request schemas (mirror kernel/model)
context.ts          ◦ auth + workspace scoping per request
```

### services/auth

```
session.ts          ◦ sessions / cookies
providers.ts        ◦ OAuth providers
tokens.ts           ◦ api keys
```

### services/queue — the worker

```
queue.ts            ◦ job queue setup (BullMQ/Redis or managed)
jobs/               ◦ export · ai-generate · thumbnails · publish · import handlers
```

---

## How the sections compose (data flow)

```
edit:    studio → kernel/elements.layout → kernel/engine.layout → render commands → studio/dom-backend
save:    studio/io → services/api → services/data (draft_content jsonb)
publish: services/queue → surfaces/publish.ssr (kernel engine + ssr backend) → hosted HTML
export:  services/queue → surfaces/export (kernel engine + pdf/pptx backend) → file
agent:   studio/agent.chat → surfaces/agent.runtime → kernel/model.ops → re-layout
present: studio "Present" → surfaces/present (kernel engine + canvas backend)
```

The kernel is the hub; every surface is the same engine output aimed at a different backend — which
is exactly why editor == present == published == export.

## Build order (what to flesh out next)

1. **Engine depth** — `intrinsic.ts`, `profile.ts` (format → params), `grid.ts` (section templates).
2. **Element library** — the Core-v1 set (`heading · body · list · stat · columns · button · …`).
3. **Studio shell** — `state/store`, `canvas/overlay`+`hit-test`, `inspector` (schema-driven), `rail`.
4. **Theming** — `kernel/themes/library` + `studio/themes/theme-modal` wired to live re-layout.
5. **Text core** — `kernel/text/layout-text` + `studio/text-editing` (the Path-B caret/IME sink).
6. **Persistence** — `services/data/queries` + `services/api` + `studio/io`.
7. **Fragmentation + formats** — `engine/fragment` + the Deck/Doc/Web layout switch.
8. **Outputs** — `surfaces/export` (PDF first) + `surfaces/publish` (SSR) + `surfaces/present`.
9. **Agent + jobs** — `surfaces/agent` + `services/queue`.
