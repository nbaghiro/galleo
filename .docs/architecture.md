# Galleo — Architecture

> The single current-state reference: what Galleo is, the layering law, a factual map of every package,
> how data flows, the persistence model, and the billing/credit layer. Companion docs go deeper on
> narrow slices: `rendering.md` (engine + elements + editing), `ai.md` (the AI turn protocol, tools,
> runtime, chat), `frontend.md` (the Solid UI + component library), `testing.md`.

## What Galleo is

Galleo is an AI content-creation tool built on one idea: **a single canonical artifact that renders as a
deck, a document, or a website** — authored once, presented / read / published anywhere, exported with
pixel fidelity.

**The bet.** Most tools force the choice up front — slides in one app, docs in another, sites in a third —
and lock content to that format's HTML/CSS. Galleo stores content as one **semantic tree** (sections →
groups → elements) with no absolute coordinates and renders it through a real layout engine. Changing the
_format_ is a data change, not a rewrite: the same content re-flows as a paged 16:9 deck, a continuous
reading document, or a full-bleed web page. Four things fall out of that:

1. **One source of truth across formats.** Write it once; ship it as a deck for the meeting, a doc for the
   follow-up, a page for the web — no copy-paste between tools.
2. **High-fidelity, dimension-agnostic layout.** The engine lays out _one container at one pixel size_ into
   backend-agnostic render commands, so "support a new size" or "make the canvas draggable / resizable" is
   data, not new code — Figma-frame / custom-size power for free. Because the same engine drives screen and
   export, **what you edit is what you export.**
3. **AI that speaks the content model, not a black box.** Generation streams structural patches into the
   _same_ editable artifact — narrated, watchable, and fully editable afterward. The AI works in
   data-space; the normal render path draws it.
4. **Direct-manipulation editing.** Elements are spec-driven, so resizing, column splits, spacing, and
   alignment happen on the canvas via handles — and every element's inspector is generated from its schema.

**Themes are data.** A theme is a semantic token set (colors/fonts by role); switching re-paints every
block instantly, and custom themes are first-class. **Canvas-first:** select an element and drag its edges
to resize, drag a column divider to re-split, adjust gap/padding with grips, drop elements anywhere and
watch the section reflow live. **Format toggle:** flip the same artifact between Deck / Doc / Web; present
full-screen; export PDF / PNG / PPTX.

---

## Layering law + path aliases

The dependency law is absolute and ESLint-enforced: **`model` imports nothing outside `model`; `canvas`
imports only `model`; `editor` depends on `model` + `canvas`; `app` sits on top of everything; `services`
(the backend) depends only on `model`.** The concrete DOM / 2D-canvas / PDF / PPTX render backends +
slide/page geometry live in `canvas/` — pure TS, no framework — so the editor, thumbnails, present,
publish, and export all paint the same way. The Solid views that wrap them (the editor, the standalone
present + publish surfaces) live in `editor/`, `app/`, and `publish/`.

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

## Codebase map

### model/ — the pure contract (`@model`, `@themes`)

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

### canvas/ — the paint layer (`@canvas`, `@engine`, `@elements`)

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
text/media/table/composite/chart/diagram/basic/    one file per element (see rendering.md)
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

### editor/ — the editing UI (`@editor`)

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
`onSectionStream`/`onSuggestSections`/`onReviseElement`/`onTextAssist`), so it never imports `app/`. The
Solid UI it shares with `app` lives in `@ui` (see `frontend.md`).

### services/ — the backend (depends only on `model`)

The programs live at the root; `api/` holds the routers; `ai/` is the LLM runtime; the rest is seed +
template **content**.

```
schema.ts      the Drizzle/Postgres schema (see Data model below) + the lazy DB handle (db)
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
ai/            the LLM runtime (depends only on model; may NOT import canvas — see ai.md):
               models.ts · provider.ts (Vercel AI SDK) · schema.ts (Zod outputs) · run.ts (runTurn / runGenerate /
               runSection / reviseElement) · text.ts · chat.ts (the ToolLoopAgent) · suggest · theme · quality ·
               tools/ (the executable tool registry) · prompts/ (pure prompt builders) · eval/ (the gen/agent eval harness)
billing/       stripe.ts — Stripe checkout/portal/webhooks behind the billing router
media/         generate.ts · icons.ts · providers.ts — AI image generation + stock/icon provider proxies
mail/          send.ts — transactional email (share invites)
```

Generation is a **real backend** now: the client speaks the `@model/ai` turn protocol over SSE and the
`services/ai` runtime answers with structured, credit-metered generation and editing (the old client-side
simulator is gone — see `ai.md`). The seed demos + the template library are plain content built with
`@model/authoring`; `services` depends only on `model`, never on canvas, editor, or app.

### app/ — the product SPA (served at `/app`)

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

### publish/ — the standalone public viewer (served at `/p/:slug`)

`main.tsx` (entry) · `PublicView.tsx` — a thin Solid wrapper that paints a shared artifact through
`@canvas` + the theme registry, with no app SPA, auth, or editor. Its own build, so anonymous viewers load
only the engine.

### website/ — the public landing build (served at `/`), separate from the product SPA.

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

---

## Data model

> Engine = **PostgreSQL + JSONB**: everything relational (auth, sharing, billing) gets foreign keys +
> transactions; the one schema-flexible thing — the artifact **content tree** — lives in a `jsonb`
> column. Binaries (images/video/fonts) live in object storage or a base64 `assets.data`; tables hold
> metadata + URLs. The schema is `services/schema.ts` (Drizzle); the content shape is `rendering.md`.

### Why PG + JSONB

Only the **content tree** (sections → groups → elements) is schema-flexible, and `jsonb` handles it
natively (GIN-indexable, FTS-searchable). Everything else is relational and wants foreign keys. One
database does both → lowest ops burden. Sections/groups/elements are **never their own tables** — they're
embedded in the artifact's `draft_content` JSON.

### Conventions

- `snake_case`, plural table names. Every workspace-scoped table carries `workspace_id` (the tenancy key).
- Standard columns: `id uuid pk`, `created_at`; edited entities also have `updated_at`.
- Content is JSON in `artifacts.draft_content` and `versions.content` — the two places an
  `ArtifactContent` is stored.

### The tables (12, as implemented in `services/schema.ts`)

**Identity & tenancy**

| Table          | Purpose                                       | Key columns                                                                                                                                                                                                                                              |
| -------------- | --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **users**      | a person / login                              | `email` (unique), `name`, `avatar_url`, `password_hash` (null = OAuth-only)                                                                                                                                                                              |
| **workspaces** | the tenant that owns content + billing entity | `name`, `slug` (unique), `owner_id→users`, `plan` (text, default `free`), `seats` (int, default 1), `stripe_customer_id`, `stripe_subscription_id`, `plan_status`, `plan_period_end`, `ai_credits_used`, `credits_reset_at`, `feature_overrides` (jsonb) |
| **members**    | user ↔ workspace + role (join, composite pk)  | `workspace_id`, `user_id`, `role`                                                                                                                                                                                                                        |

**Content**

| Table         | Purpose                                                                  | Key columns                                                                                                                                                             |
| ------------- | ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **artifacts** | the deck/doc/site entity — metadata + the working draft                  | `workspace_id`, `folder_id`, `title`, `format_id`, `theme_id`, **`draft_content` (jsonb)**, `published_version_id`, `status`, `trashed_at` (soft delete), `created_by`  |
| **versions**  | immutable content snapshots (history / published)                        | `artifact_id`, **`content` (jsonb)**, `label`, `author_id`                                                                                                              |
| **folders**   | organize artifacts (tree via `parent_id`)                                | `workspace_id`, `parent_id`, `name`                                                                                                                                     |
| **themes**    | custom themes (`workspace_id` null = system)                             | `workspace_id`, `name`, **`tokens` (jsonb)**, `mood`, `is_dark`                                                                                                         |
| **assets**    | uploaded & AI media metadata (binary in object storage or `data` base64) | `workspace_id`, `kind`, `source` (`upload`\|`generated`\|`stock`), `url`, `width`, `height`, `bytes`, `alt`, `meta` (jsonb), `data` (base64, stored media only), `mime` |

**Sharing & publishing**

| Table               | Purpose                                   | Key columns                                                                                                                                          |
| ------------------- | ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| **shares**          | who can view/edit an artifact (ACL)       | `artifact_id`, `subject_type` (user\|link\|workspace), `subject_id`, `role`                                                                          |
| **links**           | public / published link                   | `artifact_id`, `slug` (unique), `visibility` (public\|protected\|private), `password` (scrypt hash, protected only), `published_version_id→versions` |
| **link_recipients** | per-recipient grants for a `private` link | `link_id→links`, `email`, `token` (unique, unguessable → possession-based access), `message`, `invited_at`, `last_viewed_at`                         |

**Billing**

| Table       | Purpose          | Key columns                                        |
| ----------- | ---------------- | -------------------------------------------------- |
| **credits** | AI-credit ledger | `workspace_id`, `delta`, `reason`, `balance_after` |

> **Not their own tables today:** invites, api_keys, comments, activity, notifications, brand kits, custom
> formats/fonts, view analytics (`link_recipients.last_viewed_at` is the one stub), custom domains, and
> live-collab (Yjs) update logs. They're deferred; add them when the feature lands.

### The content JSON (`artifacts.draft_content` / `versions.content`)

The whole tree is one `jsonb` document — an `ArtifactContent`: `format` + `theme` + `sections[]`, where
each `Section` has one **recursive `root`** (`ElementInstance`) rather than the old `{ grid, cells }`. A
container is an `ElementInstance` of `type:"group"` whose `data.direction` (`row`|`col`) + `data.children`
hold the tree; a column's share is `layout.width.pct` (see `rendering.md`).

```jsonc
{
    "format": "deck", // deck | doc | web  (→ engine profile)
    "theme": "studio", // → a built-in id, or a custom themes.id (uuid)
    "sections": [
        {
            "id": "s-1",
            "root": {
                "type": "group",
                "data": {
                    "direction": "row",
                    "align": "center",
                    "gap": 28,
                    "children": [
                        {
                            "type": "text",
                            "data": { "text": "Run the kitchen", "style": "h1" },
                            "layout": { "width": { "pct": 60 } },
                        },
                        {
                            "type": "image",
                            "data": { "src": "https://…", "aspect": 0.8, "fit": "cover" },
                            "layout": { "width": { "pct": 40 } },
                        },
                    ],
                },
            },
        },
    ],
}
```

- **`format`** is a profile id (`deck`/`doc`/`web`) — the same tree renders three ways.
- **`theme`** is either a built-in theme id or a workspace `themes.id`; the app registers custom themes
  into the `@themes` registry so `resolveTheme` finds either.
- Images currently store a **raw URL** in `src` (stable `asset:` references are a future refinement).
- **Live editing** writes `artifacts.draft_content` (debounced autosave, `app/stores/save.ts`);
  **saving/publishing a version** copies it into an immutable `versions` row, and
  `artifacts.published_version_id` / `links.published_version_id` point at what the public sees.

### Indexing & search (as the data grows)

- **GIN index** on `draft_content` / `content` for JSONB containment (find artifacts using an asset or
  element type).
- **FTS** on `artifacts.title` + text extracted from the content tree.
- `workspace_id` indexed on every scoped table; composite indexes on hot paths
  (`shares(artifact_id, subject_id)`, `credits(workspace_id, created_at)`).

### Relationship summary

```
workspaces ─┬─< members >─ users
            ├─< folders ─< artifacts ─┬─< versions
            │                         ├─< shares            (subject = user | link | workspace)
            │                         └─< links ─< link_recipients   (private link: per-email token)
            ├─< themes · assets
            └─< credits
users ─< artifacts.created_by
```

---

## Billing & credits

The pricing model, the feature layer that gates every paid capability, the Stripe integration, and the
upgrade/downgrade/cancel flows. `model/billing.ts` is the data-driven plan catalog; `model/features.ts` is
the resolver everything enforces against; `services/features.ts` + `services/billing/stripe.ts` +
`services/api/billing.ts` are the runtime.

### Scope & the billing ↔ credit boundary

Two workstreams touch plans, decoupled by the `Plan` object:

- **Billing owns:** the `Plan` shape + catalog, the **feature resolver** (source of truth for what a
  workspace can do), all non-AI feature/account limits, Stripe wiring, and the up/down/cancel/dunning flows.
- **AI/credit owns:** the _values_ under `plan.ai.*` (monthly credits, sections-per-generation, model
  tiers) and the **spend / ledger / refund mechanics** (`POST /billing/spend`, the `credits` table).
- The contract is the `Plan` object. `ai.maxSectionsPerGeneration` is the one field the generation route
  enforces; neither side edits the other's cells.

### Pricing — 3 tiers, seats orthogonal to tier

Three tiers: **Free · Pro · Premium**. Tier = _what you can do_; **seats** = _how many of you_. Free is
solo (flat). **Pro and Premium are both per-seat** — a solo user buys 1 seat, a team buys N — so a team
can form on either paid tier without a separate "Team/Business" plan. All three are `visible` (sold).

|                        | Free         | Pro                              | Premium                                  |
| ---------------------- | ------------ | -------------------------------- | ---------------------------------------- |
| Price                  | $0           | **$20 / seat / mo** ($16 annual) | **$40 / seat / mo** ($33 annual)         |
| Billing                | flat, 1 seat | per-seat (min 1)                 | per-seat (min 1)                         |
| Team members           | — (solo)     | ✓ invite, billed / seat          | ✓ invite, billed / seat                  |
| Credits/mo 🔶          | 150 (~3)     | 2,500 / seat (~60)               | 6,000 / seat (~140)                      |
| Sections/generation 🔶 | 10           | 60                               | 75                                       |
| AI models 🔶           | basic        | premium                          | premium                                  |
| Artifacts              | 10           | ∞                                | ∞                                        |
| Watermark · export     | on · png/pdf | off · all formats                | off · all formats                        |
| Custom themes          | —            | ✓                                | ✓ + shared brand kit                     |
| Storage                | 500 MB       | 20 GB                            | ∞                                        |
| Org (planned)          | —            | —                                | SSO · analytics · API · admin · priority |

`🔶` = AI-session-owned value (seed as contract, they tune). Annual ≈ 2 months free (one field). A per-seat
workspace pool = `seats × credits/seat`. Prices/limits are all tunable. **Teams are live, not staged**:
both paid tiers bill per seat, so the members/seats data model is required — until an invite UI ships,
Pro/Premium are fully usable **solo** (1 seat).

### Data-driven plan config (`model/billing.ts`)

One `PLANS` record; every lever is a field; UI + enforcement both derive from it. Presentation is separated
from enforcement so copy edits can't break gates. Stripe price ids are **never** in this file — they
resolve from env by `STRIPE_PRICE_{PLAN}_{INTERVAL}`.

```ts
interface Plan {
    // identity / presentation
    id;
    name;
    tagline;
    badge?;
    highlights: string[];
    order;
    visible;
    contactSales;
    // billing / Stripe
    billing: {
        model: "flat" | "per_seat";
        priceMonthly;
        priceAnnualMonthly;
        minSeats;
        maxSeats: number | null;
        trialDays;
    };
    // AI limits (fields ours, values theirs 🔶)
    ai: {
        creditsPerMonth;
        creditsRollover;
        maxSectionsPerGeneration;
        textModelTier;
        imageModelTier;
        creditTopUpsAllowed;
    };
    // account caps
    account: { maxArtifacts /* -1=∞ */; maxMembers; storageMb };
    // feature gates
    features: {
        removeBranding;
        customThemes;
        workspaceThemes;
        exportFormats: ExportFmt[];
        publicLinks;
        customDomains;
        analytics;
        apiAccess;
        sso;
        prioritySupport;
        earlyAccess;
    };
}
```

Moving a limit across tiers = change one number. New gate = one key in `features` (defaults off
everywhere). New tier = one object + `PLAN_ORDER` entry + env ids. Flat↔per-seat = `billing.model`.
`limitsFor()` still exposes a legacy flat `PlanLimits` for the routes not yet migrated to the resolver.

### Features — the source of truth (`model/features.ts`)

Enforcement never reads the plan directly. It reads **resolved features**, which combine three inputs so
billing is just one of them:

```
effective(feature) = feature.status !== "planned"      // global launch gate
                     && ( plan grants it || workspace override grants it )
```

- **`FEATURES` registry** — the canonical list of every capability with `{ label, status: "live" | "beta"
| "planned", description }`. `status` is the honesty layer: `planned` features are off for everyone (but
  the pricing card can show "coming soon"); `live`/`beta` can be granted. **This registry is the source of
  truth for what exists.** (Today `workspaceThemes`, `customDomains`, `analytics`, `apiAccess`, `sso`,
  `prioritySupport`, `earlyAccess` are `planned`; the AI tier/section caps are `beta`.)
- **Plan grants** — from `plan.features` / `plan.account` / `plan.ai`.
- **Overrides** — a per-workspace `feature_overrides` jsonb (comps, grandfathering, beta access, admin
  grants) that can turn a feature on/off _independent of plan_ (but can't grant a `planned` one).

```ts
resolveFeatures(planId, overrides?) -> Features
can(f, "customThemes"): boolean
limit(f, "maxArtifacts"): number         // -1 = unlimited
withinLimit(f, "maxArtifacts", current): boolean
featureStatus("publicLinks"): "live" | "beta" | "planned"
```

### Enforcement

- **`services/features.ts`** — `featuresFor(ws)` reads `ws.plan` + `ws.feature_overrides`, calls the pure
  resolver, and rolls the monthly credit window. Guards: `requireFeature(c, ws, key)` → 402
  `{ error, upgrade:true }`; `checkLimit(c, ws, key, current)` → 402.
- The **export gate** (`canvas/render/export.ts` + editor) and the artifact cap / custom-themes / credit
  spend gates all resolve entitlements the same way. `GET /billing` returns the plan + resolved usage so the
  app drives locks, badges, and "coming soon" from one source; the editor keeps receiving features pushed in
  (the export-gate seam).

### Billing entity & seats

**The workspace is the billing entity — one Stripe Customer + one Subscription per workspace, not per
user** (`stripe_customer_id` / `stripe_subscription_id` on `workspaces`). An individual on Free/Pro is a
workspace with **1 seat**; a team is a workspace on Pro/Premium with **N seats** — one consistent path, no
separate per-user billing.

- **Customer = workspace** (owner's email as contact + `metadata.workspaceId`). A user who owns multiple
  workspaces gets one customer each (today a user has one workspace).
- **Seat count is orthogonal to tier.** `workspace.plan` = tier; a cached `workspace.seats` column (int,
  default 1) = quantity, synced from the webhook (`subscription.items.data[0].quantity`) so `maxMembers`
  enforcement needs no Stripe round-trip. Price = tier's per-unit price × seats.
- **Per-seat mechanics (Stripe):** a normal recurring per-unit price with the line item's `quantity =
seats`; Stripe multiplies. `plan.billing.model` tells our code to show a seat picker, send `quantity`,
  and allow seat changes. Flat plans always send `quantity = 1` and hide the picker.
- **Seats ↔ members:** can't reduce seats below active members; adding a member requires a free seat.

### Upgrade / downgrade / cancel flows

Policy (standard SaaS): **upgrades take effect immediately with proration; downgrades and cancels take
effect at period end** (the user keeps what they paid for). Implemented in `POST /billing/change-plan`
(in-app up/downgrade + seat + interval changes) alongside `/billing/checkout`, `/billing/portal`, and the
signature-verified `/billing/webhook`.

| From → To            | Mechanism                                                       | Timing                  | Proration       |
| -------------------- | --------------------------------------------------------------- | ----------------------- | --------------- |
| Free → paid          | Checkout Session                                                | immediate               | n/a             |
| paid → higher        | `subscriptions.update` new price                                | immediate               | charge diff now |
| paid → lower         | subscription schedule / `proration_behavior:none` at period end | period end              | none            |
| paid → Free (cancel) | `cancel_at_period_end: true`                                    | period end              | none            |
| seat +/− (per-seat)  | update item `quantity`                                          | up=now, down=period end | prorated        |
| monthly ↔ annual     | `subscriptions.update` price + interval                         | per policy above        | Stripe computes |

The webhook syncs plan/seat/status/period-end on `checkout.session.completed`,
`customer.subscription.updated`, and `customer.subscription.deleted` → Free; `invoice.payment_failed` →
`past_due` (+ dunning banner), `invoice.paid` → clears it. `plan_period_end` reads the real subscription
`current_period_end`; handlers are last-write-wins and guard on the workspace whose current sub the event
is. **Downgrade reconciliation never deletes data** — when new limits are tighter than current usage, the
resolver's gates **soft-lock**: block _new_ actions over the cap and mark excess resources read-only with an
upgrade prompt (automatic for every limit).

### What's built

The full data model is live: the data-driven 3-tier `Plan` catalog (Free flat · Pro/Premium per-seat) + the
`FEATURES` registry + `resolveFeatures` (`model/`), the `services/features.ts` resolver with migrated gates,
and `GET /billing` surfacing plan + usage. Stripe is wired end-to-end: `stripe.ts` resolves prices by env
(`stripeReady()` gates on the Pro/Premium monthly prices), and the routes cover checkout, portal,
`change-plan` (up/down/seat/interval with the proration policy above), `spend` (the credit gate), and the
idempotent `webhook` (checkout/subscription/invoice events → plan·seat·status·period-end sync). The pricing
page (`PricingView`) drives it with a monthly/annual toggle + seat selector. Remaining work is in
**Planned / deferred**.

---

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

---

## Planned / deferred

Forward-looking work that's genuinely still open, grouped by area.

**Engine / editor.** Whole-artifact AI `edit` turns (the route 501s today — see `ai.md`) · engine-native
rich text driving the editor directly from `@model/text` (replacing the contenteditable overlay) ·
free-form / bento grid spanning · background jobs (no queue yet; the 8603 Redis port is reserved).

**Data model.** Stable `asset:` references in element `src` (raw URLs today) · the deferred tables when
their feature lands — invites, api_keys, comments, activity, notifications, brand kits, custom
formats/fonts, view analytics (beyond the `link_recipients.last_viewed_at` stub), custom domains,
live-collab (Yjs) update logs.

**Billing — remaining flow work.**

- **Members & seats UI** — the `seats` column + Stripe-`quantity` sync exist, but there is no invite /
  role-management surface yet, so Pro/Premium are usable solo only; shipping invites + roles unlocks
  multi-seat.
- **Owner/admin billing gate** — billing-mutation routes still use `currentWorkspace(u.id)` with no role
  check; only a workspace owner/admin should be able to change plan, seats, or payment method.
- **Full flow test matrix** — up/down/cancel/dunning/seat/annual/reconciliation/idempotency coverage (see
  `testing.md`).

**Billing — open tunables / decisions.**

- Credits set to **150 / 2,500 / 6,000** (Free / Pro / Premium) 🔶 — confirm with the AI session.
- Free tier: monthly credits vs a one-time signup grant (a one-time grant caps AI COGS).
- Annual discount depth (~2 months free today).
- Trials? (`billing.trialDays` is wired for it, default 0.)
- Should Free allow inviting a first teammate as a trial, or stay strictly solo (current)?
