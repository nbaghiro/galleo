# Galleo — Codebase Structure

> A factual map of the codebase as it is. The dependency law is absolute and ESLint-enforced:
> **`kernel` imports nothing outside `kernel`; `render` imports only the kernel; a surface depends on
> `kernel` + `render` (+ services) but never on another surface; `services` and `app` depend on `kernel`,
> never the reverse.** The concrete DOM / canvas / PDF render backends live in the shared `render/` layer
> (framework- and editor-free), so any surface — studio, present, a future publish page — paints the same way.

```
kernel/     the pure, edge-safe core — the content model, layout engine, elements, themes
render/     the shared paint layer — turns kernel render-commands into DOM / 2D-canvas / PDF (no framework, no editor)
surfaces/   ways to touch the core — studio (the editor) · present (standalone slideshow viewer)
services/   the backend — data (Postgres/Drizzle) · api (Hono) · auth
app/        the product SPA (served at /app) — composes the surfaces + backend
marketing/  a separate public build (served at /)
```

Path aliases are directory aliases: `@model/*`→`kernel/model/*`, plus `@engine`, `@elements`, `@themes`,
`@render`, `@studio`, `@present`. No `index.ts` barrels — every concept is a named file. (`services`
import each other by relative path.) Dependency direction: `kernel ← render ← surfaces ← app`; render
imports only the kernel, a surface never imports another surface.

---

## kernel/ — the core (pure TS, no DOM, no framework)

**`model/` — the content contract, per-entity** (each type sits with its own wire DTOs, so the JSON
shapes shared with the backend can't drift from the type they describe)

```
artifact.ts    ArtifactContent → Section → Cell → ElementInstance (draft_content jsonb IS this) + its REST DTOs (ArtifactSummary · Cover · ArtifactInput)
agent.ts       the streamed agent protocol (turns · patches · events · applyPatch) — scaffolding; generation is a simulator today
workspace.ts   User · Folder · Template + their create/update DTOs (LoginBody · FolderInput)
text.ts        engine-native rich-text core — marks/runs + selection math (scaffolding; the editor uses a contenteditable overlay today)
target.ts      stable addressing of selectable entities (section/cell/element paths) → Target + Region ids
size.ts        Clay-style Size constructors: fit / grow / percent / fixed
format.ts      format id + kind helpers (deck | doc | web)
authoring.ts   concise content-authoring DSL (t/img/section/group/deck/doc/web) — used by fixtures/templates + the agent
```

**`engine/` — the layout + render core** (a custom, Clay-style, immediate-mode box solver — see `rendering.md`)

```
layout.ts    the 3-pass solver (widths top-down → heights bottom-up → positions → laid-out boxes) + pagination (fragment: slice a tall command flow into fixed-height pages)
node.ts      EngineNode (the layout-tree input) · the backend-abstract Graphics API self-drawn elements use · RenderCommand (rect/text/image/surface) + Region (the box + corner radius of every id'd node)
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
compose.ts     Section → EngineNode tree (tags Region ids; applies onDark tokens over dark backgrounds)
templates.ts   the section grids (per-cell width specs: full / split-6040 / two-col / …) + presets
ops.ts         pure, immutable content ops (insert/move/remove/duplicate section, setArtifactTheme, …)
```

The five category files (text/media/data/containers/chrome) side-effect-register **20 elements** — 19
content elements + the internal drop-preview — via `surfaces/studio/register.ts`.

**`themes/` — themes as data** (see below)

```
theme.ts     Tokens (the semantic token set) · themeCssVars() · fontStack() · the wire DTOs (ThemeSummary · ThemeInput) · color math (hexToRgb · luminance · mix · mixWhite · hexA)
library.ts   the curated 52-theme registry via mk() + resolveTheme() + registerThemes() (custom themes)
```

---

## render/ — the shared paint layer (`@render`)

Framework- and editor-free. Turns the kernel engine's output into pixels, so every surface paints
identically. Imports only the kernel.

```
commands.ts   kernel layout → RenderCommand[] + canvas text measurement (keeps the kernel DOM-free)
backends.ts   the DOM drawer (absolute divs) + the 2D-canvas mirror + section backdrops + the section-stack painter
present.ts    slideElement() — one section as a self-contained 1280×720 slide (shared by both present UIs)
export.ts     exportPdfAuto / exportDeckPng / exportPrint — parameterized by (artifact, tokens), no editor
```

---

## surfaces/studio/ — the editor (the main surface)

Pure editor UI on top of the kernel + `@render`. `Studio.tsx` (shell) · `editor.ts` (the reactive store +
`editorTokens`/`editorTheme`/`editorAccent` selectors) · `register.ts` (side-effect module that
registers every element into the kernel registry; `app/main.tsx` imports it before mount) · `icons.tsx`.
The `select`/`panels`/`insert` folders group the canvas overlays by the **interaction** they serve, not
by where they paint.

```
canvas/    the paint pipeline (the render backends now live in @render; these are the Solid components)
  Canvas.tsx (live editing canvas) · Present.tsx (in-editor present overlay, over @render) · Thumb.tsx
select/    direct manipulation on the canvas
  selection.tsx (selection outline + section actions/toolbar) · handles.tsx (resize · spacing · column-divider handles)
panels/    property-editing UI
  format-bar.tsx (the floating contextual control bar + rich-text mark controls) · inspectors.tsx (element + section)
insert/    adding content
  insert.tsx (cell-add · element picker · palette item · context menu · drag/drop ghosts) · element-previews.ts (theme-driven SVG previews)
editing/   interaction logic
  text-editor.tsx (the contenteditable inline editor + its marks/runs model) · text-format.ts (mark helpers shared with the format bar) ·
  manipulate.ts (live drag-edit state, shared by Canvas + the handles) · dnd.ts (drag-and-drop)
controls/  the shared input kit — fields.tsx (the schema-driven ControlField dispatcher, used by both inspectors and the format bar) · Dropdown.tsx · ColorPicker.tsx
chrome/    Topbar.tsx (doc menu · format · theme · present · export · generate) · Panel.tsx (element palette) · Minimap.tsx
agent/     AgentPanel.tsx (the generate panel + its local, deterministic preview generator — a stand-in for the real LLM)
```

The studio surface talks to the app through inversion-of-control handlers on `editor.ts`
(`onHome`/`onSwitchArtifact`/`onThemePicker`), so it never imports `app/`.

---

## surfaces/present/ — the standalone slideshow surface (`@present`)

`Present.tsx` — a chrome-free, full-screen render of an artifact driven purely by its content (no editor):
deck → one 16:9 slide per section with keyboard nav; doc/web → the sections stacked + scrollable. Paints
via `@render` (so it never imports the studio), manages its own slide state, and is reachable at the app
route `/present/:id` (`app/views/PresentView.tsx` fetches the artifact and hands it in).

---

## services/ — the backend

```
data/    schema.ts (the Drizzle/Postgres schema — see data-model.md) · client.ts (the DB client)
auth/    auth.ts (scrypt password hashing + signed-cookie session)
api/     server.ts (the Hono API: /auth · /artifacts · /folders · /themes · /templates)
         seed.ts (idempotent demo seed) · fixtures.ts + fixtures/* (7 demo artifacts, one file each) ·
         templates.ts (registry) + templates/* (one file per category: creative · marketing · pitch · proposals · reports)
```

There is no backend generation service — generation is a **client-side simulator** (`app/generate`, replaying
hand-built fixtures). A real LLM pipeline that implements the `@model/agent` protocol is future work.

The seed fixtures + the template library are plain content built with `@model/authoring`; `services`
depends only on `kernel`, never on a surface.

---

## app/ — the product SPA (served at `/app`)

`main.tsx` (entry) · `App.tsx` (auth gate + router + mounts the theme drawer once).

```
data/      the backend client + client stores
  api.ts (typed client) · auth.ts (session state) · library.ts (artifact list + content, + blank-artifact factory + format labels/relativeTime) ·
  folders.ts · save.ts (debounced autosave)
views/     the routed pages — AuthPage · LibraryView · TemplatesView · TrashView · EditorView
theme/     the app + custom theme system
  theme.ts (app-chrome theme + drawer state + favicon + overlay tokens + the sample artifact) ·
  custom-themes.ts (backend CRUD → registers into the kernel) · ThemeDrawer.tsx (the singular switcher) ·
  ThemeBuilder.tsx (custom-theme token editor + its live ThemePreview)
components/ shared components — Sidebar · icons · modals.tsx (create + confirm) · previews.tsx (Visual · SectionThumb · PreviewCanvas)
generate/  the narrated AI-generation flow (a client-side simulator today)
  session.ts (the generation store) · demo.ts (example prompts → hand-built fixtures, swapped per refresh) ·
  IntakeView · BuildView · build-canvases.tsx (the live-build canvas + spotlight + HUD variants) · gen-view.tsx (direction registry + picker + typing)
```

`EditorView.tsx` is the bridge: it fetches an artifact from the API, hands its content to the studio
store, runs the studio with autosave, and registers the IoC handlers.

## marketing/ — the public landing build (served at `/`), separate from the product SPA.

`theme/styles.css` (root) — the shared Tailwind `@theme` tokens every surface reads.

---

## How it composes (data flow)

```
edit:     app/EditorView → @studio (editor store) → kernel compose+engine → render commands → @render/backends
load/save: app/EditorView + app/data/save → services/api → services/data (artifacts.draft_content jsonb)
present:  studio Topbar (in-editor overlay) OR /present/:id (standalone surface) → @render (slide geometry)
export:   studio Topbar → @render/export(artifact, tokens) → PDF / PNG / print
themes:   app theme drawer → setAppTheme / setArtifactTheme → kernel resolveTheme → the same engine re-paints
generate: app/generate (simulator) → the shared BuildCanvas (kernel engine) → save → open in the editor
```

The kernel is the hub: every surface is the **same engine output aimed at a different backend** — which
is why the editor, present mode, thumbnails, and export are pixel-identical. Data flows **down**
(`app → @studio → kernel`, `services → kernel`); nothing flows back up.

## Planned, not yet built

`surfaces/publish` — a public read-only viewer over `@render` (present + export are already standalone:
`surfaces/present` + `@render/export`) · a real LLM generation backend implementing the `@model/agent`
protocol (replacing the `app/generate` simulator) · engine-native rich text (`@model/text`, replacing the
contenteditable overlay) · `services/queue` (background jobs).

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
| **8606**      | Preview / SSR (publish surface)     | `surfaces/publish`               | reserved |

The cross-project registry of every sibling project's host ports lives at `clientbridge/.docs/ports.md`.
