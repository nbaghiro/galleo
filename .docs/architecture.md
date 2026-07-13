# Galleo — Codebase Structure

> A factual map of the codebase as it is. The dependency law is absolute and ESLint-enforced:
> **`model` imports nothing outside `model`; `canvas` imports only `model`; `editor` depends on
> `model` + `canvas`; `app` sits on top of everything; `services` (the backend) depends only on
> `model`.** The concrete DOM / 2D-canvas / PDF / PPTX render backends + slide/page geometry live in
> `canvas/` — pure TS, no framework — so the editor, thumbnails, present, publish, and export all paint the
> same way. The Solid views that wrap them (the editor, the standalone present + publish surfaces) live in
> `editor/`, `app/`, and `publish/`.

```
model/      the pure contract — content model, themes, the AI turn/tool/credit protocols, authoring DSL (edge-safe, no DOM, no framework)
canvas/     the paint layer — layout engine + element library + DOM/2D/PDF/PPTX backends + present geometry + export (pure TS, no framework)
editor/     the editing UI — the SolidJS studio (selection, inspectors, inline text, drag-drop, in-canvas AI) over model + canvas
services/   the backend (Hono + Postgres/Drizzle) — schema · auth · a thin server + per-resource routers in api/ + the LLM runtime (ai/) + billing/mail/media + seed/demos/templates content; depends only on model
app/        the product SPA (served at /app) — library, templates, AI generation + chat, theming, sharing, wrapping the editor
publish/    a standalone public read-only viewer (served at /p/:slug) — the engine + theme registry, no app SPA
website/    a separate public marketing build (served at /)
```

Path aliases are directory aliases: `@model/*`→`model/*`, `@engine`→
`canvas/engine`, `@elements`→`canvas/elements`, `@canvas`→`canvas`, `@editor`→`editor` — plus the one
file alias `@themes`→`model/theme.ts` (the whole theme contract is a single file). No `index.ts`
barrels — every concept is a named file. (`services` import each other by relative path.) Dependency
direction: `model ← canvas ← editor ← app`; canvas imports only model; services imports only model.

---

## model/ — the pure contract (`@model`, `@themes`)

The single source of truth every other layer agrees on: the content shapes, the wire DTOs, the themes,
the streamed AI protocol + tool/credit catalog, the authoring DSL. Pure TS — no DOM, no framework — so it
is safe to import from the backend as well as the frontend.

**per-entity content model** (each type sits with its own wire DTOs, so the JSON shapes shared with the
backend can't drift from the type they describe)

```
artifact.ts    ArtifactContent → Section → ElementInstance (the recursive section.root tree; draft_content jsonb IS this) + its REST DTOs (ArtifactSummary · Cover · ArtifactInput)
section.ts     the section shape — row/col container builders, layout presets, emptyRegion (the recursive root replaced the old { grid, cells })
elements.ts    the element value-sets (the enumerable option sets elements + the AI catalog share)
ai.ts          the AI turn PROTOCOL (turns · patches · events · applyPatch) + the authoring CATALOG (elements/layouts/text styles the LLM writes against) — a real backend, no longer a simulator
tools.ts       the ONE AI tool catalog: every capability's identity/tier/surfaces + its pricing (usage · meter · live)
credits.ts     the metered-credit engine (Usage bag + costOf) tools.ts prices against
billing.ts     plans + PlanLimits (export formats · branding · public links · seats) — the entitlement contract the app + export menu gate on
features.ts    feature flags / coming-soon gating shared by client + backend
workspace.ts   User · Folder · Template + their create/update DTOs (LoginBody · FolderInput)
text.ts        rich-text core — marks/runs + selection math + the render-facing Run type (canvas re-exports Run for its backends)
media.ts       MediaKind + IconPick + the media descriptors the picker and image elements exchange
target.ts      stable addressing of selectable entities (section/element paths) → Target + Region ids
geometry.ts    the dimensional contract: Size (+ fit/grow/percent/fixed constructors), box insets, per-instance ElementLayout, and the deck/doc/web format profiles
authoring.ts   concise content-authoring DSL (t/img/section/group/deck/doc/web) — used by demos/templates + the AI
```

**`theme.ts` — themes as data** (`@themes`, one file; the token/Theme types + resolvers + color math + the
curated library + custom registration, no DOM)

```
theme.ts     Tokens (the semantic token set) · themeCssVars() · fontStack() · the wire DTOs (ThemeSummary · ThemeInput) · color math (hexToRgb · luminance · mix · mixWhite · hexA) · the curated theme registry (mk / resolveTheme) + registerThemes() for custom themes
```

---

## canvas/ — the paint layer (`@canvas`, `@engine`, `@elements`)

Everything that turns a `model` artifact into pixels, framework- and editor-free. Imports only `model`.
This is what makes the editor, thumbnails, present mode, publish, and export pixel-identical: they are all
the same engine output aimed at a different backend. Three sub-layers, each its own folder: `engine/` (the
geometry solver) → `elements/` (the library + composer) → `render/` (the DOM/2D/PDF/PPTX paint backends).

**`engine/` — the layout + render core** (a custom, Clay-style, immediate-mode box solver — see `rendering.md`)

```
layout.ts    the 3-pass solver (widths top-down → heights bottom-up → positions → laid-out boxes) + pagination (fragment: slice a tall command flow into fixed-height pages)
node.ts      EngineNode (the layout-tree input) · the backend-abstract Graphics API self-drawn elements use · RenderCommand (rect/text/image/surface) + Region (the box + corner radius of every id'd node); re-exports Run from @model/text
profile.ts   format-as-view presets — the same artifact as a paged deck, a doc, or a web page
```

**`elements/` — the element library + composer** (grouped by the element's own `category`; see `rendering.md`)

```
spec.ts        the framework: ElementSpec/SectionSpec contract · register/getElement/listElements · walkElements · skeletonize (structural ghosts + drop/skeleton states)
compose.ts     Section → EngineNode tree (tags Region ids; applies onDark tokens over dark backgrounds) + the section-grid templates (full / split-6040 / two-col / …) + smart-layout presets it lays out
ops.ts         pure, immutable content ops (insert/move/remove/duplicate section, setArtifactTheme, …)
register.ts    side-effect module: imports every category file so each register(spec) fires
text/media/table/composite/chart/diagram/basic/    one file per element (see elements-and-editing.md)
```

The category files side-effect-register the element library — 19 content elements + the internal
drop-preview, plus the chart/diagram variants — via `editor/register.ts`.

**`render/` — the paint backends** (the pipeline + slide/page geometry + export — pure TS, no framework)

```
commands.ts        engine layout → RenderCommand[] + canvas text measurement (keeps the model DOM-free)
backends.ts        the DOM drawer (absolute divs) + the 2D-canvas mirror + section backdrops + the section-stack painter
present.ts         slideElement() — one section as a self-contained 1280×720 slide (shared by the in-editor present overlay + the standalone present/publish views)
export.ts          exportPdfAuto / exportDeckPng / exportPrint — parameterized by (artifact, tokens), no editor
export-pptx.ts · pptx.ts · pptx-fonts.ts   native PowerPoint export (real .pptx, embedded fonts)
export-geometry.ts shared page/slice geometry for the paged exporters
```

The standalone present **surface** (`app/views/PresentView.tsx`) and the public read-only viewer
(`publish/PublicView.tsx`) both paint through these backends but are framework components, so they sit
outside `canvas/` — with the app and the publish build respectively.

---

## editor/ — the editing UI (`@editor`)

The SolidJS studio: pure editor UI on top of `model` + `canvas`. `Studio.tsx` (shell) · `editor.ts`
(the reactive store + `editorTokens`/`editorTheme`/`editorAccent` selectors + the injected AI/host seams) ·
`register.ts` (side-effect module that registers every element into the registry; `app/main.tsx` imports it
before mount) · `icons.tsx`. The folders are grouped by **feature** — each owns its own interaction state
(drag, live-edit, mark helpers) rather than pooling them in a shared "editing" bucket.

```
canvas/    the editing canvas + everything overlaid on / driving it — Canvas.tsx (live editing canvas + the Minimap section Thumb) · Present.tsx (in-editor present overlay) · embeds.tsx (live media players) · insert.tsx (cell-add · element picker/palette · context menu · drag ghosts · theme SVG previews) · dnd.ts (drag-and-drop engine)
select/    selection + direct manipulation — selection.tsx (outline + section actions/toolbar) · handles.tsx (resize · column-divider · section-reorder handles + the live-edit state they drive)
inspect/   property editing + its input kit — fields.tsx (the schema-driven ControlField dispatcher, extending @ui/inputs) · format-bar.tsx (floating contextual bar + rich-text marks) · inspectors.tsx (docked element inspector) · SectionLayoutPopup.tsx (inline section layout/background) · DataEditor.tsx + DataGrid.tsx + data-model.ts (the chart/diagram spreadsheet editor)
text/      inline text editing — text-editor.tsx (the contenteditable overlay + its marks/runs model) · text-format.ts (mark helpers shared with the format bar)
ai/        in-canvas AI — section-gen + SectionGenPopup/SectionGenStage (generate a section) · element-gen + ElementGenStage (regenerate an element) · text-assist + TextAiMenu (rewrite/translate a passage) · suggest.ts
chrome/    the frame — Topbar.tsx (doc menu · format · theme · present · export · share) · Panel.tsx (element palette + inspector rail) · Minimap.tsx (section thumbnails)
```

The editor talks to the app through inversion-of-control handlers on `editor.ts`
(`onHome`/`onSwitchArtifact`/`onThemePicker`/`onShare`/`onMediaPicker`, plus the AI transports
`onSectionStream`/`onSuggestSections`/`onReviseElement`/`onTextAssist`), so it never imports `app/`.

---

## services/ — the backend (depends only on `model`)

The programs live at the root; `api/` holds the routers; `ai/` is the LLM runtime; the rest is seed +
template **content**.

```
schema.ts      the Drizzle/Postgres schema (see data-model.md) + the lazy DB handle (db)
auth.ts        scrypt password hashing + signed-cookie session
server.ts      the entrypoint — a thin Hono app: /health + mounts every api/ router, then listens
features.ts    the plan/entitlement resolver (@model/billing limits) the api gates on
seed.ts        idempotent demo seed (a script, run via `pnpm seed`); owns the demo registry inline
demos/         fully-authored demo artifacts (deck/doc/web), one file each — seed content, not test fixtures
templates.ts   the starter-template registry (TEMPLATES) — served by the /templates route + used by seed
templates/     the template content, one file per category: creative · marketing · pitch · proposals · reports
api/           the routers, one per resource, each a Hono sub-app carrying its own full paths:
               context.ts (readJson · currentUser · firstWorkspaceId) · session.ts (/auth · /me) ·
               artifacts.ts (/artifacts + /trash + library cover/filmstrip) · folders.ts · themes.ts ·
               templates.ts · billing.ts · features.ts · media.ts · links.ts (public share links) ·
               ai.ts (POST /ai/{turn,suggest,theme,element,text} — auth + credit gate + SSE) · workspace-reader.ts
ai/            the LLM runtime (depends only on model; may NOT import canvas — see ai-module.md):
               models.ts · provider.ts (Vercel AI SDK) · schema.ts (Zod outputs) · run.ts (runTurn / runGenerate /
               runSection / reviseElement) · text.ts · chat.ts (the ToolLoopAgent) · suggest · theme · quality ·
               tools/ (the executable tool registry) · prompts/ (pure prompt builders — see ai-prompts.md) · eval/ (the gen/agent eval harness)
billing/       stripe.ts — Stripe checkout/portal/webhooks behind the billing router
media/         generate.ts · icons.ts · providers.ts — AI image generation + stock/icon provider proxies
mail/          send.ts — transactional email (share invites)
```

Generation is a **real backend** now: the client speaks the `@model/ai` turn protocol over SSE and the
`services/ai` runtime answers with structured, credit-metered generation and editing (the old client-side
simulator is gone — see `ai-module.md`). The seed demos + the template library are plain content built with
`@model/authoring`; `services` depends only on `model`, never on canvas, editor, or app.

---

## app/ — the product SPA (served at `/app`)

The root holds only the entry, the shell, and the wire boundary — `main.tsx` (entry) · `App.tsx` (auth gate

- router; its `AppShell` mounts the global overlays once and wires the keyboard/command system under the
  Router) · `api.ts` (the typed backend client + the SSE turn reader). Every app-level controller/store lives
  in `stores/`. The shell around the editor: library, templates, trash, shared, pricing, AI generation + chat,
  theming, sharing.

```
api.ts       the typed backend client + streamTurn (SSE) — the one wire boundary
stores/      the client stores + app-level controllers, one file each —
             auth.ts · library.ts (artifact list/content + trash + blank-artifact factory) · folders.ts ·
             save.ts (debounced autosave) · generate.ts (the AI generation session) · chat.ts (chat thread + tool dispatch) ·
             billing.ts · features.ts · links.ts (public share links) ·
             theme.ts (the app + custom theme system: app-chrome theme + favicon + overlay tokens + custom-theme CRUD into the @themes registry) ·
             share.ts (the share bridge: openShare / closeShare) · media.ts (the media-picker bridge: openMediaPicker · pickMedia · pickMediaIcon) ·
             commands.ts (the app command registrations + navigate seam) · route-context.ts (publishRoute — route→context keys, kept router-free for testing)
components/   general reusable UI — Sidebar.tsx · modals.tsx (CreateModal; the confirm dialog is @ui/overlay's ConfirmModal, used inline) · previews.tsx (Visual · SectionThumb · PreviewCanvas) · ShareModal.tsx (public links + recipients) · MediaPicker.tsx (stock · AI generate · upload · icons)
views/       the routed pages + the global modals mounted in the shell —
  AuthPage · LibraryView (/ + /folder/:id) · TemplatesView · SharedView · TrashView · PricingView ·
  EditorView (/edit/:id — the studio bridge) · PresentView (the standalone /present/:id surface, painting through @canvas) ·
  GenerateModal (the AI generation intake + live build board) · ThemeEditor (the singular theme picker + custom-token editor + AI generate) · ChatPanel (the AI chat dock)
```

`EditorView.tsx` is the bridge: it fetches an artifact from the API, hands its content to the editor
store, runs the studio with autosave, and registers the IoC handlers (home · theme · media · share · the
AI turn/suggest/revise/text-assist transports).

## publish/ — the standalone public viewer (served at `/p/:slug`)

`main.tsx` (entry) · `PublicView.tsx` — a thin Solid wrapper that paints a shared artifact through
`@canvas` + the theme registry, with no app SPA, auth, or editor. Its own build, so anonymous viewers load
only the engine.

## website/ — the public landing build (served at `/`), separate from the product SPA.

`theme/styles.css` (root) — the shared Tailwind `@theme` tokens every layer reads.

---

## How it composes (data flow)

```
edit:      app/EditorView → @editor (store) → @canvas compose+engine → render commands → @canvas/render/backends
load/save: app/EditorView + app/stores/save → services/server (api routers) → services/schema (artifacts.draft_content jsonb)
present:   editor Topbar (in-editor overlay) OR /present/:id (app PresentView) → @canvas (slide geometry)
publish:   /p/:slug (publish PublicView) → services links/artifacts → @canvas (read-only paint)
export:    editor Topbar → @canvas/render/export(artifact, tokens) → PDF / PNG / PPTX / print
themes:    app ThemeEditor → setAppTheme / setArtifactTheme → @themes resolveTheme → the same engine re-paints
generate:  app GenerateModal / chat → POST /ai/turn (SSE) → services/ai runtime → patches applied live → save → open in the editor
```

`canvas` is the hub: every view is the **same engine output aimed at a different backend** — which is
why the editor, present mode, publish, thumbnails, and export are pixel-identical. Data flows **down**
(`app → @editor → @canvas → @model`, `services → @model`); nothing flows back up.

## Planned, not yet built

Whole-artifact AI `edit` turns (the route 501s today — see `ai-module.md`) · engine-native rich text
driving the editor directly from `@model/text` (replacing the contenteditable overlay) · free-form / bento
grid spanning · background jobs (no queue yet). The publish viewer, the real LLM generation backend, and
PPTX export — all previously listed here as planned — are now built.

## Local dev & ports

Galleo claims the **86xx** host-port block so it runs alongside the other `~/Documents/code` projects.
Container-internal ports stay conventional (5432/6379/…); only host mappings use 86xx.

| Port          | Service                             | Set in                             | Status   |
| ------------- | ----------------------------------- | ---------------------------------- | -------- |
| **8600**      | Studio (Vite dev/preview)           | `vite.config.ts` (strictPort)      | active   |
| **8601**      | Backend API (Hono)                  | `services/server`                  | active   |
| **8602**      | Postgres (→ container 5432)         | `services/schema` · `DATABASE_URL` | active   |
| **8603**      | Redis / job queue (→ 6379)          | (reserved)                         | reserved |
| **8604–8605** | Object storage (MinIO S3 + console) | asset storage                      | reserved |
| **8606**      | Preview / SSR (publish viewer)      | `publish` build                    | reserved |

The cross-project registry of every sibling project's host ports lives at `clientbridge/.docs/ports.md`.
