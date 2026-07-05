# Galleo — Codebase Structure

> A factual map of the codebase as it is. The dependency law is absolute and ESLint-enforced:
> **`model` imports nothing outside `model`; `canvas` imports only `model`; `editor` depends on
> `model` + `canvas`; `app` sits on top of everything; `services` (the backend) depends only on
> `model`.** The concrete DOM / 2D-canvas / PDF render backends + slide/page geometry live in `canvas/`
> — pure TS, no framework — so the editor, thumbnails, present, and export all paint the same way. The
> Solid views that wrap them (the editor, the standalone present surface) live in `editor/` and `app/`.

```
model/      the pure contract — content model, themes, protocols, authoring DSL (edge-safe, no DOM, no framework)
canvas/     the paint layer — layout engine + element library + DOM/2D/PDF backends + present geometry + export (pure TS, no framework)
editor/     the editing UI — the SolidJS studio (selection, inspectors, inline text, drag-drop) over model + canvas
services/   the backend — data (Postgres/Drizzle) · api (Hono) · auth · queue; depends only on model
app/        the product SPA (served at /app) — library, templates, generation, theme drawer, wrapping the editor
marketing/  a separate public build (served at /)
```

Path aliases are directory aliases: `@model/*`→`model/*`, `@themes`→`model/themes`, `@engine`→
`canvas/engine`, `@elements`→`canvas/elements`, `@canvas`→`canvas`, `@editor`→`editor`. No `index.ts`
barrels — every concept is a named file. (`services` import each other by relative path.) Dependency
direction: `model ← canvas ← editor ← app`; canvas imports only model; services imports only model.

---

## model/ — the pure contract (`@model`, `@themes`)

The single source of truth every other layer agrees on: the content shapes, the wire DTOs, the themes,
the streamed generation protocol, the authoring DSL. Pure TS — no DOM, no framework — so it is safe to
import from the backend as well as the frontend.

**per-entity content model** (each type sits with its own wire DTOs, so the JSON shapes shared with the
backend can't drift from the type they describe)

```
artifact.ts    ArtifactContent → Section → Cell → ElementInstance (draft_content jsonb IS this) + its REST DTOs (ArtifactSummary · Cover · ArtifactInput)
agent.ts       the streamed agent protocol (turns · patches · events · applyPatch) — scaffolding; generation is a simulator today
workspace.ts   User · Folder · Template + their create/update DTOs (LoginBody · FolderInput)
text.ts        rich-text core — marks/runs + selection math + the render-facing Run type (canvas re-exports Run for its backends)
target.ts      stable addressing of selectable entities (section/cell/element paths) → Target + Region ids
geometry.ts    the dimensional contract: Size (+ fit/grow/percent/fixed constructors), box insets, per-instance ElementLayout, and the deck/doc/web format profiles
authoring.ts   concise content-authoring DSL (t/img/section/group/deck/doc/web) — used by fixtures/templates + the agent
```

**`themes/` — themes as data** (`@themes`; pure color math + a registry, no DOM)

```
theme.ts     Tokens (the semantic token set) · themeCssVars() · fontStack() · the wire DTOs (ThemeSummary · ThemeInput) · color math (hexToRgb · luminance · mix · mixWhite · hexA)
library.ts   the curated 52-theme registry via mk() + resolveTheme() + registerThemes() (custom themes)
```

---

## canvas/ — the paint layer (`@canvas`, `@engine`, `@elements`)

Everything that turns a `model` artifact into pixels, framework- and editor-free. Imports only `model`.
This is what makes the editor, thumbnails, present mode, and export pixel-identical: they are all the
same engine output aimed at a different backend. Three sub-layers, each its own folder: `engine/` (the
geometry solver) → `elements/` (the library + composer) → `render/` (the DOM/2D/PDF paint backends).

**`engine/` — the layout + render core** (a custom, Clay-style, immediate-mode box solver — see `rendering.md`)

```
layout.ts    the 3-pass solver (widths top-down → heights bottom-up → positions → laid-out boxes) + pagination (fragment: slice a tall command flow into fixed-height pages)
node.ts      EngineNode (the layout-tree input) · the backend-abstract Graphics API self-drawn elements use · RenderCommand (rect/text/image/surface) + Region (the box + corner radius of every id'd node); re-exports Run from @model/text
profile.ts   format-as-view presets — the same artifact as a paged deck, a doc, or a web page
```

**`elements/` — the element library + composer** (grouped by the element's own `category`; see `rendering.md`)

```
spec.ts        the framework: ElementSpec/SectionSpec contract · register/getElement/listElements · walkElements · skeletonize (structural ghosts + drop/skeleton states)
text.ts        text · bullets · callout · code · quote
media.ts       image · video
data.ts        chart · diagram · table · stat
containers.ts  card · group
chrome.ts      button · badge · embed · gradient · divider · spacer · dropghost (an internal, palette-hidden drop preview)
compose.ts     Section → EngineNode tree (tags Region ids; applies onDark tokens over dark backgrounds) + the section-grid templates (full / split-6040 / two-col / …) + smart-layout presets it lays out
ops.ts         pure, immutable content ops (insert/move/remove/duplicate section, setArtifactTheme, …)
```

The five category files (text/media/data/containers/chrome) side-effect-register **20 elements** — 19
content elements + the internal drop-preview — via `editor/register.ts`.

**`render/` — the paint backends** (the pipeline + slide/page geometry + export — pure TS, no framework)

```
commands.ts   engine layout → RenderCommand[] + canvas text measurement (keeps the model DOM-free)
backends.ts   the DOM drawer (absolute divs) + the 2D-canvas mirror + section backdrops + the section-stack painter
present.ts    slideElement() — one section as a self-contained 1280×720 slide (shared by the in-editor present overlay + the standalone /present view)
export.ts     exportPdfAuto / exportDeckPng / exportPrint — parameterized by (artifact, tokens), no editor
```

The standalone present **surface** (the chrome-free full-screen Solid view) lives in `app/views/PresentView.tsx`,
not here — it paints through these backends but is a framework component, so it sits with the app.

---

## editor/ — the editing UI (`@editor`)

The SolidJS studio: pure editor UI on top of `model` + `canvas`. `Studio.tsx` (shell) · `editor.ts`
(the reactive store + `editorTokens`/`editorTheme`/`editorAccent` selectors) · `register.ts` (side-effect
module that registers every element into the registry; `app/main.tsx` imports it before mount) ·
`icons.tsx`. The `select`/`panels`/`insert` folders group the canvas overlays by the **interaction**
they serve, not by where they paint.

```
canvas/    the Solid components over the render backends — Canvas.tsx (live editing canvas) · Present.tsx (in-editor present overlay, over @canvas) · Thumb.tsx
select/    direct manipulation — selection.tsx (selection outline + section actions/toolbar) · handles.tsx (resize · spacing · column-divider handles)
panels/    property-editing UI — format-bar.tsx (the floating contextual control bar + rich-text mark controls) · inspectors.tsx (element + section)
insert/    adding content — insert.tsx (cell-add · element picker · palette item · context menu · drag/drop ghosts) · element-previews.ts (theme-driven SVG previews)
editing/   interaction logic — text-editor.tsx (the contenteditable inline editor + its marks/runs model) · text-format.ts (mark helpers shared with the format bar) ·
           manipulate.ts (live drag-edit state, shared by Canvas + the handles) · dnd.ts (drag-and-drop)
controls/  the shared input kit — fields.tsx (the schema-driven ControlField dispatcher, used by both inspectors and the format bar) · Dropdown.tsx · ColorPicker.tsx
chrome/    Topbar.tsx (doc menu · format · theme · present · export · generate) · Panel.tsx (element palette) · Minimap.tsx
agent/     AgentPanel.tsx (the generate panel + its local, deterministic preview generator — a stand-in for the real LLM)
```

The editor talks to the app through inversion-of-control handlers on `editor.ts`
(`onHome`/`onSwitchArtifact`/`onThemePicker`), so it never imports `app/`.

---

## services/ — the backend (depends only on `model`)

```
data/    schema.ts (the Drizzle/Postgres schema — see data-model.md) · client.ts (the DB client)
auth/    auth.ts (scrypt password hashing + signed-cookie session)
api/     server.ts (the Hono API: /auth · /artifacts · /folders · /themes · /templates)
         seed.ts (idempotent demo seed) · fixtures.ts + fixtures/* (7 demo artifacts, one file each) ·
         templates.ts (registry) + templates/* (one file per category: creative · marketing · pitch · proposals · reports)
queue/   reserved — background jobs (not yet built)
```

There is no backend generation service — generation is a **client-side simulator** (`app/generate`,
replaying hand-built fixtures). A real LLM pipeline that implements the `@model/agent` protocol is
future work. The seed fixtures + the template library are plain content built with `@model/authoring`;
`services` depends only on `model`, never on canvas, editor, or app.

---

## app/ — the product SPA (served at `/app`)

`main.tsx` (entry) · `App.tsx` (auth gate + router + mounts the theme drawer once). The shell around the
editor: library, templates, trash, generation, sharing, theming.

```
data/      the backend client + client stores
  api.ts (typed client) · auth.ts (session state) · library.ts (artifact list + content, + blank-artifact factory + format labels/relativeTime) ·
  folders.ts · save.ts (debounced autosave)
views/     the routed pages — AuthPage · LibraryView · TemplatesView · TrashView · EditorView · PresentView (the standalone /present/:id present surface — the `Present` Solid view painting through @canvas)
theme/     the app + custom theme system
  theme.ts (app-chrome theme + drawer state + favicon + overlay tokens + the sample artifact) ·
  custom-themes.ts (backend CRUD → registers into the theme registry) · ThemeDrawer.tsx (the singular switcher) ·
  ThemeBuilder.tsx (custom-theme token editor + its live ThemePreview)
components/ shared components — Sidebar · icons · modals.tsx (create + confirm) · previews.tsx (Visual · SectionThumb · PreviewCanvas)
generate/  the narrated AI-generation flow (a client-side simulator today)
  session.ts (the generation store) · demo.ts (example prompts → hand-built fixtures, swapped per refresh) ·
  IntakeView · BuildView · build-canvases.tsx (the live-build canvas + spotlight + HUD variants) · gen-view.tsx (direction registry + picker + typing)
```

`EditorView.tsx` is the bridge: it fetches an artifact from the API, hands its content to the editor
store, runs the studio with autosave, and registers the IoC handlers.

## marketing/ — the public landing build (served at `/`), separate from the product SPA.

`theme/styles.css` (root) — the shared Tailwind `@theme` tokens every layer reads.

---

## How it composes (data flow)

```
edit:      app/EditorView → @editor (store) → @canvas compose+engine → render commands → @canvas/render/backends
load/save: app/EditorView + app/data/save → services/api → services/data (artifacts.draft_content jsonb)
present:   editor Topbar (in-editor overlay) OR /present/:id (app PresentView) → @canvas (slide geometry)
export:    editor Topbar → @canvas/render/export(artifact, tokens) → PDF / PNG / print
themes:    app theme drawer → setAppTheme / setArtifactTheme → @themes resolveTheme → the same engine re-paints
generate:  app/generate (simulator) → the shared BuildCanvas (@canvas engine) → save → open in the editor
```

`canvas` is the hub: every view is the **same engine output aimed at a different backend** — which is
why the editor, present mode, thumbnails, and export are pixel-identical. Data flows **down**
(`app → @editor → @canvas → @model`, `services → @model`); nothing flows back up.

## Planned, not yet built

A public read-only publish viewer over `@canvas` (present + export are already standalone — the
`PresentView` surface + `@canvas/render/export`) · a real LLM generation backend implementing the `@model/agent`
protocol (replacing the `app/generate` simulator) · engine-native rich text driving the editor directly
from `@model/text` (replacing the contenteditable overlay) · `services/queue` (background jobs).

## Local dev & ports

Galleo claims the **86xx** host-port block so it runs alongside the other `~/Documents/code` projects.
Container-internal ports stay conventional (5432/6379/…); only host mappings use 86xx.

| Port          | Service                             | Set in                           | Status   |
| ------------- | ----------------------------------- | -------------------------------- | -------- |
| **8600**      | Studio (Vite dev/preview)           | `vite.config.ts` (strictPort)    | active   |
| **8601**      | Backend API (Hono)                  | `services/api`                   | active   |
| **8602**      | Postgres (→ container 5432)         | `services/data` · `DATABASE_URL` | active   |
| **8603**      | Redis / job queue (→ 6379)          | `services/queue`                 | reserved |
| **8604–8605** | Object storage (MinIO S3 + console) | asset storage                    | reserved |
| **8606**      | Preview / SSR (publish viewer)      | `app` publish view               | reserved |

The cross-project registry of every sibling project's host ports lives at `clientbridge/.docs/ports.md`.
