# Galleo — Codebase Structure

> A factual map of the codebase as it is. The dependency law is absolute and ESLint-enforced:
> **`kernel` imports nothing outside `kernel`; a surface depends on the kernel (+ services) but never
> on another surface; `services` and `app` depend on `kernel`, never the reverse.** Concrete,
> environment-specific render backends (DOM / canvas / PDF) live with their surface, never in the kernel.

```
kernel/     the pure, edge-safe core — the content model, layout engine, elements, themes
surfaces/   ways to touch the core — studio (the editor)
services/   the backend — data (Postgres/Drizzle) · api (Hono) · auth
app/        the product SPA (served at /app) — composes the studio + backend
marketing/  a separate public build (served at /)
```

Path aliases are directory aliases: `@model/*`→`kernel/model/*`, plus `@engine`, `@elements`, `@themes`,
`@studio`. No `index.ts` barrels — every concept is a named file. (`services` import each other by
relative path.)

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

## surfaces/studio/ — the editor (the only surface built so far)

Pure editor UI on top of the kernel. `Studio.tsx` (shell) · `editor.ts` (the reactive store +
`editorTokens`/`editorTheme`/`editorAccent` selectors) · `register.ts` (registers every element into the
kernel registry) · `icons.tsx`.

```
canvas/    the paint pipeline
  Canvas.tsx · render.ts (kernel layout → render commands) · stage.ts (the shared section-stack painter +
  slide-fit framing, reused by Canvas/Present/preview) · dom-backend.ts (paints absolute divs) ·
  canvas-backend.ts (2D-canvas mirror) · measure.ts (canvas text measurement injected into the engine,
  keeping the kernel DOM-free) · backdrop.ts · Present.tsx (16:9 slide geometry) · Thumb.tsx · export-pdf.ts

overlay/   selection · inspectors · drag affordances (canvas-coordinate overlays)
  Overlay.tsx · ElementOverlay.tsx · ElementInspector.tsx · SectionInspector.tsx · SectionActions.tsx ·
  SectionToolbar.tsx · DropIndicator.tsx · DragGhost.tsx · PaletteItem.tsx

chrome/    Topbar.tsx (doc menu · format · theme · present · export · generate) · Panel.tsx (element palette) · Minimap.tsx
agent/     AgentPanel.tsx + agent.ts (a local, deterministic preview generator — stand-in for the real LLM)
editing/   TextEditor.tsx (inline text editing via a contenteditable overlay) · dnd.ts · element-previews.ts
```

The studio surface talks to the app through inversion-of-control handlers on `editor.ts`
(`onHome`/`onSwitchArtifact`/`onThemePicker`), so it never imports `app/`.

---

## services/ — the backend

```
data/    schema.ts (the Drizzle/Postgres schema — see data-model.md) · client.ts (the DB client)
auth/    password.ts (scrypt) · session.ts (signed-cookie session)
api/     server.ts (the Hono API: /auth · /artifacts · /folders · /themes · /templates)
         seed.ts (idempotent demo seed) · fixtures.ts + fixtures/* (7 demo artifacts) · templates.ts + templates/* (starter templates)
agent/   the real multi-provider LLM pipeline: pipeline.ts (parallel section writers) · turn.ts (one LLM turn) ·
         llm.ts (Vercel AI SDK) · models.ts (registry + resolveModel) · images.ts (Unsplash resolver) ·
         ping.ts · bench.ts · generate-test.ts (dev/latency helpers). Built + benchmarked; the live product still runs the app/generate simulator.
```

The seed fixtures + the template library are plain content built with `@model/authoring`; `services`
depends only on `kernel`, never on a surface.

---

## app/ — the product SPA (served at `/app`)

`main.tsx` (entry) · `App.tsx` (auth gate + router + mounts the theme drawer once).

```
data/      the backend client + client stores
  api.ts (typed client) · auth.ts (session state) · library.ts (the artifact list + content) · folders.ts ·
  save.ts (debounced autosave) · format.ts (format labels + relativeTime) · blank.ts
views/     the routed pages — AuthPage · LibraryView · TemplatesView · TrashView · EditorView
theme/     the app + custom theme system
  theme.ts (the app-chrome theme) · custom-themes.ts (backend CRUD → registers into the kernel) ·
  theme-drawer.ts · theme-sample.ts · favicon.ts · ThemeDrawer.tsx (the singular switcher) ·
  ThemeBuilder.tsx (custom-theme token editor) · ThemePreview.tsx
components/ shared components — Sidebar · CreateModal · ConfirmModal · SectionThumb · PreviewCanvas · icons · Visual
generate/  the narrated AI-generation flow (a client-side simulator today)
  session.ts (the generation store) · demo.ts (example prompts → hand-built fixtures, swapped per refresh) ·
  IntakeView · BuildView · BuildCanvas · SpotlightCanvas · extraViews (HUD) · genView (direction registry) · GenViewPicker · typing
```

`EditorView.tsx` is the bridge: it fetches an artifact from the API, hands its content to the studio
store, runs the studio with autosave, and registers the IoC handlers.

## marketing/ — the public landing build (served at `/`), separate from the product SPA.

`theme/styles.css` (root) — the shared Tailwind `@theme` tokens every surface reads.

---

## How it composes (data flow)

```
edit:     app/EditorView → @studio (editor store) → kernel compose+engine → render commands → studio/canvas/dom-backend
load/save: app/EditorView + app/data/save → services/api → services/data (artifacts.draft_content jsonb)
present:  studio Topbar "Present" → studio/canvas/Present (kernel engine, slide geometry)
export:   studio Topbar → studio/canvas/export-pdf (kernel engine + canvas backend → PDF/PNG)
themes:   app theme drawer → setAppTheme / setArtifactTheme → kernel resolveTheme → the same engine re-paints
generate: app/generate (simulator) → the shared BuildCanvas (kernel engine) → save → open in the editor
```

The kernel is the hub: every surface is the **same engine output aimed at a different backend** — which
is why the editor, present mode, thumbnails, and export are pixel-identical. Data flows **down**
(`app → @studio → kernel`, `services → kernel`); nothing flows back up.

## Planned, not yet built

`surfaces/present · publish · export` as standalone surfaces (present/export live inside studio today) ·
wiring the real agent pipeline (`@model/agent` protocol + `services/agent` LLM) into the live product,
replacing the `app/generate` simulator · engine-native rich text (`@model/text`, replacing the
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
