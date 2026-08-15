# Galleo — Architecture

> The single current-state reference: what Galleo is, the layering law, a factual map of every package,
> how data flows, the persistence model, and the billing/credit layer. Companion docs go deeper on
> narrow slices: `rendering.md` (engine + elements + editing), `ai.md` (the AI turn protocol, tools,
> runtime, chat), `frontend.md` (the Solid UI + component library), `search.md` (library search + ⌘K),
> `testing.md`.

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
services/   the backend (Hono + Postgres/Drizzle) — a thin server.ts over four tiers: core (db · http · auth · mail) ← plan (entitlements · credits · models · Stripe) ← media ← the verticals accounts · artifacts · ai; depends only on model
app/        the product SPA (served at /app) — library, templates, AI generation + chat, theming, sharing, wrapping the editor
publish/    a standalone public read-only viewer (served at /p/:slug) — the engine + theme registry, no app SPA
website/    a separate public marketing build (served at /)
```

Path aliases are directory aliases: `@model/*`→`model/*`, `@engine`→
`canvas/engine`, `@elements`→`canvas/elements`, `@canvas`→`canvas`, `@ui`→`ui`, `@editor`→`editor`,
`@app`→`app`, `@services`→`services` — plus the one file alias `@themes`→`model/theme.ts` (the whole
theme contract is a single file). No `index.ts` barrels — every concept is a named file. Cross-directory
imports use aliases; same-directory siblings stay relative (enforced by
`import/no-relative-parent-imports`). Dependency direction: `model ← canvas ← ui ← editor ← app`; canvas
imports only model; services imports only model.

---

## Codebase map

### model/ — the pure contract (`@model`, `@themes`)

The single source of truth every other layer agrees on: the content shapes, the wire DTOs, the themes,
the streamed AI protocol + tool/credit catalog, the authoring DSL. Pure TS — no DOM, no framework — so it
is safe to import from the backend as well as the frontend.

**one file per concept** (each type sits with its own wire DTOs and the functions that operate on it, so
the JSON shapes shared with the backend can't drift from the type they describe, and adding a field to a
concept is one file's diff rather than three)

```
artifact.ts    the whole artifact concept: ArtifactContent → Section → ElementInstance (the recursive section.root tree; draft_content jsonb IS this) · the tree builders + path ops (rowGroup/colGroup/emptyRegion, updateAtPath/removeAtPath, layout presets) · the REST DTOs (ArtifactSummary · Cover · ArtifactWindow · ArtifactInput · GenMeta) · the addressing of selectable nodes (ElementAddress · Target · region ids) · the SectionOp semantics both sides apply (applySectionOps/diffSections) · the derived digest + search text written on every content write
elements.ts    the element value-sets (the enumerable option sets elements + the AI catalog share) + the Vector IR that vector/icon element data stores
ai.ts          the AI turn PROTOCOL only: turns · patches · events · applyPatch. The LLM-facing element/layout CATALOG lives with the prompt that renders it (services/core/ai/prompts/catalog.ts) — it is server-only, and keeping it here shipped it to the browser
credits.ts     what an AI capability is and what it costs: the metered-credit engine (Usage bag + costOf) · the AiTask steps a run is made of + their per-model rate multipliers · the ONE tool catalog (every capability's identity/tier/surfaces + its pricing: usage · meter · live)
billing.ts     the plan catalog (plans · packs · PlanLimits) AND the entitlement resolver over it (FEATURES launch registry · resolveFeatures · can/limit/withinLimit) — read together at every call site
workspace.ts   User · Folder · Template + their create/update DTOs (LoginBody · FolderInput)
text.ts        rich-text core — marks/runs + selection math + the render-facing Run type (canvas re-exports Run for its backends)
media.ts       MediaKind + IconPick + the media descriptors the picker and image elements exchange
geometry.ts    the dimensional contract: Size (+ fit/grow/percent/fixed constructors), box insets, per-instance ElementLayout, and the deck/doc/web format profiles
authoring.ts   concise content-authoring DSL (t/img/section/group/deck/doc/web) — fixture material for demos/templates, not a wire contract
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
drop-preview, plus the chart/diagram variants — via `canvas/elements/register.ts`.

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

`server.ts` is the only file at the root. Everything else sits in a layer, and the layers are linear:
`api → core → db → utils`. ESLint enforces it (the layer law in AGENTS.md), and
`pnpm check:boundaries` plants a `core → api`, a `core → hono`, and a `utils → db` import to prove each
rule still fires.

The split that matters: **api holds no decisions and core holds no HTTP**. An api file parses the
request, applies the gate, and shapes the response; every query and every rule lives in core, which
may not import hono. Both are one file per thing: per resource in api, per functionality in core.

```
server.ts      the entrypoint — a thin Hono app: /health + mounts every router, then listens

api/           HTTP only; `requireUser`/`requireWorkspace` in middleware.ts replace what used to be
               a four-line auth preamble repeated in 60 handlers
               artifacts · folders · themes · templates · search · links (incl. the unauthenticated
               /p/:slug reader) · session · oauth · workspace · billing · features · media · ai ·
               context (the context library CRUD + item ingestion) ·
               middleware.ts (the layer's only non-resource file)

core/          one file per functionality; no hono, no Response, no Context
               accounts.ts   users · sessions · provisioning · the emailed verify/reset tokens · OAuth
               workspaces.ts members · seats · invites
               artifacts.ts  the library: keyset paging · windowed reads · the section-op transaction
               folders · themes · search (the FTS query)
               links.ts      share links · recipients · analytics · the public read + view recording
               billing.ts    plans · subscriptions · recurring add-ons · the Stripe webhook
               credits.ts    the row-locked spend engine
               context.ts    the context library: item ingestion (extract → chunk → embed) · vector
                             retrieval · conversation memory (see ai.md §10.5)
               context-text.ts  the pure text half: the chunker + retrieval-pack assembly
               extract.ts    upload extraction decisions: format dispatch + size caps + the
                             Gemini read of images/scanned PDFs (ImageReader seam)
               models.ts     the model registry: tier defaults, cost multipliers, override parsing
               media.ts      stock + icon proxies · AI image/video generation · the asset library
               mail.ts       transactional email
               templates.ts  the 30 hand-authored bodies, grouped by the category the index uses,
                             plus the id → body resolution (5.7k lines: coverage-excluded, guarded by
                             the index↔body test in core/__tests__/templates.test.ts)
               ai/           the LLM runtime (may NOT import canvas — see ai.md): run · chat · tasks ·
                             provider · schema · locate · quality · meter · thinking · reader ·
                             voice (the ElevenLabs single-use-token mint for chat dictation; audio
                             streams browser → provider directly, needs ELEVENLABS_API_KEY) ·
                             tools/ · prompts/ · eval/ · corpus/ (the seven gold-standard artifacts,
                             injected as few-shot exemplars into every generate turn by
                             prompts/exemplars.ts, and reused as eval references and demo content)

db/            schema.ts (the tables — see Data model below) · client.ts (the lazy handle; inert
               without DATABASE_URL so unit tests can import through it) · derived.ts · migrations/ ·
               seed.ts (an entry point: `pnpm seed`)

utils/         http.ts (readJson · cookies · rateLimit · the 402 feature guards) · auth.ts (scrypt +
               signed-cookie session) · env.ts (out/warn/appUrl) · webpage.ts (the SSRF-vetted
               link fetcher + HTML→text) · extract.ts (pure byte→text parsers for uploads:
               PDF text layers · docx/xlsx OOXML walking · format sniffing). Database-free by rule.
```

Generation is a **real backend** now: the client speaks the `@model/ai` turn protocol over SSE and the
`services/core/ai` runtime answers with structured, credit-metered generation and editing (the old client-side
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
components/   general reusable UI — Sidebar.tsx (the confirm dialog is @ui/overlay's ConfirmModal, used inline) · TemplateGallery.tsx (category rows + preview + use; hosted by the Templates page and the intake's in-place browser) · previews.tsx (Visual · SectionThumb · PreviewCanvas) · ShareModal.tsx (multi-link sharing: create/manage per-audience links + recipients + view stats) · MediaPicker.tsx (stock · AI generate · upload · icons)
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
load/save: app/EditorView + app/stores/save → services/server (api routers) → services/db/schema (artifacts.draft_content jsonb)
present:   editor Topbar (in-editor overlay) OR /present/:id (app PresentView) → @canvas (slide geometry)
publish:   /p/:slug (publish PublicView) → services links/artifacts → @canvas (read-only paint)
export:    editor Topbar → @canvas/render/export(artifact, tokens) → PDF / PNG / PPTX / print
themes:    app ThemeEditor → setAppTheme / setArtifactTheme → @themes resolveTheme → the same engine re-paints
generate:  app GenerateModal / chat → POST /ai/turn (SSE) → services/core/ai runtime → patches applied live → save → open in the editor
```

`canvas` is the hub: every view is the **same engine output aimed at a different backend** — which is
why the editor, present mode, publish, thumbnails, and export are pixel-identical. Data flows **down**
(`app → @editor → @canvas → @model`, `services → @model`); nothing flows back up.

---

## Data model

> Engine = **PostgreSQL + JSONB + pgvector**: everything relational (auth, sharing, billing) gets foreign
> keys + transactions; the one schema-flexible thing — the artifact **content tree** — lives in a `jsonb`
> column; embeddings for the context library + conversation memory live in a `vector(768)` column in the
> same database (the compose file runs the `pgvector/pgvector:pg16` image — plain `postgres:16` lacks the
> extension, so recreate the container after pulling this change). Binaries (images/video/fonts) live in
> object storage or a base64 `assets.data`; tables hold metadata + URLs. The schema is
> `services/db/schema.ts` (Drizzle); the content shape is `rendering.md`.

### Why PG + JSONB

Only the **content tree** (sections → groups → elements) is schema-flexible, and `jsonb` handles it
natively (GIN-indexable, FTS-searchable). Everything else is relational and wants foreign keys. One
database does both → lowest ops burden. Sections/groups/elements are **never their own tables** — they're
embedded in the artifact's `draft_content` JSON.

### Conventions

- `snake_case`, plural table names. Every workspace-scoped table carries `workspace_id` (the tenancy key).
- Standard columns: `id uuid pk`, `created_at`; edited entities also have `updated_at`.
- Content is JSON in `artifacts.draft_content` — the single place an `ArtifactContent` is stored.

### The tables (as implemented in `services/db/schema.ts`)

**Identity & tenancy**

| Table              | Purpose                                       | Key columns                                                                                                                                                                                                                                                                                                                                                |
| ------------------ | --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **users**          | a person / login                              | `email` (unique), `name`, `avatar_url`, `password_hash` (null = OAuth-only), `active_workspace_id` (the membership the app opens)                                                                                                                                                                                                                          |
| **workspaces**     | the tenant that owns content + billing entity | `name`, `slug` (unique), `owner_id→users`, `plan` (text, default `free`), `seats` (int, default 1), `stripe_customer_id`, `stripe_subscription_id`, `plan_status`, `plan_period_end`, `cancel_at_period_end`, `ai_credits_used` (the only credit counter), `credit_blocks` (the credit add-on's quantity), `credits_reset_at`, `feature_overrides` (jsonb) |
| **members**        | user ↔ workspace + role (join, composite pk)  | `workspace_id`, `user_id`, `role`                                                                                                                                                                                                                                                                                                                          |
| **invites**        | pending workspace invitations                 | `workspace_id`, `email` (unique per workspace), `role`, `token_hash` (raw token only in the emailed link), `invited_by`, `expires_at`, `accepted_at`                                                                                                                                                                                                       |
| **oauth_accounts** | provider identity links (Google)              | `user_id`, `provider` + `provider_account_id` (unique pair; the provider's stable subject id)                                                                                                                                                                                                                                                              |
| **auth_tokens**    | consumable emailed verify/reset tokens        | `user_id`, `purpose` (`verify`\|`reset`), `token_hash` (SHA-256 only, raw token only in the email), `expires_at`, `consumed_at`                                                                                                                                                                                                                            |

**Content**

| Table         | Purpose                                                                                                         | Key columns                                                                                                                                                                                                                 |
| ------------- | --------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **artifacts** | the deck/doc/site entity — metadata + the working draft                                                         | `workspace_id`, `folder_id`, `title`, `format_id`, `theme_id`, **`draft_content` (jsonb)**, `status`, `trashed_at` (soft delete), `created_by`, `digest` (jsonb cover + filmstrip), `search_text`, `search_tsv` (generated) |
| **folders**   | organize artifacts (tree via `parent_id`)                                                                       | `workspace_id`, `parent_id`, `name`                                                                                                                                                                                         |
| **visits**    | what a user reached for: artifact opens (the read clock behind "Recent") and template uses (catalog popularity) | `user_id` + `kind` (`artifact`\|`template`) + `ref` (composite pk; `ref` is an artifact id or a template id — no FK, core deletes rows with their artifact), `uses`, `seen_at`                                              |
| **themes**    | custom workspace themes (the built-in library lives in code, `@themes`)                                         | `workspace_id`, `name`, **`tokens` (jsonb)**, `mood`, `is_dark`                                                                                                                                                             |
| **assets**    | uploaded & AI media metadata (binary in object storage or `data` base64)                                        | `workspace_id`, `kind`, `source` (`upload`\|`generated`\|`stock`), `url`, `width`, `height`, `bytes`, `alt`, `meta` (jsonb), `data` (base64, stored media only), `mime`                                                     |

**Context & memory** (the pgvector substrate — see `ai.md` for the retrieval seams)

| Table             | Purpose                                                               | Key columns                                                                                                                                                                                                               |
| ----------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **contexts**      | a shareable, workspace-scoped collection of grounding material        | `workspace_id`, `name`, `description`, `created_by`                                                                                                                                                                       |
| **context_items** | one source inside a context, with its extracted text snapshot         | `context_id` (cascade), `kind` (`file`\|`link`\|`artifact`\|`template`\|`text`), `title`, `ref` (url / artifact / template id), `body` (the full extracted text), `chars`, `added_by`                                     |
| **chunks**        | the unified vector store: every embedded piece, whatever it came from | `workspace_id`, `scope` (`context`\|`chat`), `ref_id` (context_item or chat_message id — no FK, spans two parents; core deletes chunks with their parent), `seq`, `text`, **`embedding vector(768)`** (HNSW cosine index) |
| **chat_messages** | the durable conversation record recall retrieves over                 | `workspace_id`, `artifact_id` (null = the library-level thread), `role`, `text`                                                                                                                                           |

**Sharing & publishing**

| Table               | Purpose                                                                                                 | Key columns                                                                                                                                                                                                                                                                                                                                 |
| ------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **links**           | one shared URL; an artifact can have many (one per audience)                                            | `artifact_id`, `slug` (unique), `name` (owner-facing label), `visibility` (public\|protected\|private), `password` (scrypt hash, protected only)                                                                                                                                                                                            |
| **link_recipients** | per-recipient grants for a `private` link                                                               | `link_id→links`, `email`, `token` (unique, unguessable → possession-based access), `message`, `invited_at`, `last_viewed_at`                                                                                                                                                                                                                |
| **link_views**      | view log, one row per viewer session (cookieless daily key dedups reloads; owner previews never logged) | `link_id→links`, `recipient_id→link_recipients` (private: who viewed), `session_key` (sha of day\|ip\|ua\|link — raw IP/UA never stored), `referrer` (hostname or `direct`), `device`, `country` (proxy geo headers), `viewed_at`, `last_seen_at` (heartbeat → duration), `max_unit` + `unit_total` (furthest slide/section → completion %) |

**Billing**

| Table             | Purpose                                                       | Key columns                                        |
| ----------------- | ------------------------------------------------------------- | -------------------------------------------------- |
| **credits**       | AI-credit ledger (every charge/settle/grant/reset writes one) | `workspace_id`, `delta`, `reason`, `balance_after` |
| **stripe_events** | webhook idempotency claims (claimed + applied in one tx)      | `id` (Stripe event id), `type`                     |

> **Not their own tables today:** api_keys, comments, activity, notifications (incl. "X viewed
> your doc"), brand kits, custom formats/fonts, version history / content snapshots, custom domains, and
> live-collab (Yjs) update logs. They're deferred; add them when the feature lands.

### The content JSON (`artifacts.draft_content`)

The whole tree is one `jsonb` document — an `ArtifactContent`: `format` + `theme` + `sections[]`, where
each `Section` has one **recursive `root`** (`ElementInstance`) rather than the old `{ grid, cells }`. A
container is an `ElementInstance` of `type:"group"` whose `data.direction` (`row`|`col`) + `data.children`
hold the tree; a column's share is `layout.width.pct` (see `rendering.md`).

`ArtifactContent` **extends `ArtifactShell`** (everything except the sections: `format`, `theme`,
`background?`, `page?`). That inheritance is load-bearing, not tidiness — the section-ops route rewrites
stored content through the shell, so a content field declared outside it is dropped on the next section
edit. Add new artifact-wide fields to `ArtifactShell`.

```jsonc
{
    "format": "deck", // deck | doc | web  (→ engine profile)
    "theme": "studio", // → a built-in id, or a custom themes.id (uuid)
    // "page": { "width": 1080, "height": 1350 },  // optional; paged formats only (profileFor)
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
  **published links serve that same draft live** — a `links` row grants access, it never pins a
  snapshot, so viewers always see the artifact as it is now.

### Indexing & search (as the data grows)

- **FTS, built.** `artifacts.search_text` holds the prose extracted from the content tree on every
  write (`model/artifact.ts`); `search_tsv` is a generated column over `title` (weight A) + that text
  (weight B) with a GIN index, so the index can never drift from the row. Read path, ranking, snippets,
  and the ⌘K palette that consumes them: `search.md`.
- **Paging, built.** `artifacts(workspace_id, updated_at DESC)` also serves the library's keyset
  pagination, and the digest's per-section index (id + serialized size) is what lets a long artifact
  load a window at a time and write back section ops. See `loading.md`.
- `artifacts.digest` (jsonb) carries the cover + section filmstrip derived at write time, so listing or
  searching a library never reads `draft_content` back.
- **Still open:** a GIN index on `draft_content` for JSONB containment (find artifacts using an asset or
  element type); `workspace_id` indexed on every scoped table beyond `artifacts(workspace_id,
updated_at)` and `credits(workspace_id, created_at)`.

### Relationship summary

```
workspaces ─┬─< members >─ users ─┬─< oauth_accounts · auth_tokens
            │                     └─< visits          (kind = artifact | template; ref, no FK)
            ├─< invites
            ├─< folders ─< artifacts ─< links ─┬─< link_recipients   (private link: per-email token)
            │                                  └─< link_views        (per-session analytics log)
            ├─< themes · assets
            ├─< credits
            ├─< contexts ─< context_items
            ├─< chunks            (scope = context | chat; ref_id spans both, no FK)
            └─< chat_messages     (artifact_id nullable, no FK)
users ─< artifacts.created_by
stripe_events                     (webhook idempotency, standalone)
```

---

## Billing & credits

The pricing model, the feature layer that gates every paid capability, the Stripe integration, and the
upgrade/downgrade/cancel flows. `model/billing.ts` holds both the data-driven plan catalog and
the resolver everything enforces against; `@model/billing` + `services/core/billing.ts` +
`services/api/billing.ts` are the runtime.

### Scope & the billing ↔ credit boundary

Two workstreams touch plans, decoupled by the `Plan` object:

- **Billing owns:** the `Plan` shape + catalog, the **feature resolver** (source of truth for what a
  workspace can do), all non-AI feature/account limits, Stripe wiring, and the up/down/cancel/dunning flows.
- **AI/credit owns:** the _values_ under `plan.ai.*` (monthly credits, sections-per-generation, model
  tiers) and the **spend / ledger / refund mechanics** (`services/core/credits.ts`, `POST /billing/spend`,
  the `credits` table).
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
workspace pool = `seats × credits/seat`. Prices/limits are all tunable. **Teams are live**: invites (with
a role), member management, rename, leave, and ownership transfer all ship in `/settings`.

### Roles

Three roles; **owner derives from `workspaces.owner_id`**, never the role column, and legacy `"editor"`
rows read as `member` (`asRole`, `model/workspace.ts`). Enforced by `requireRole` in
`services/api/middleware.ts`:

| Action                                    | member | admin | owner              |
| ----------------------------------------- | ------ | ----- | ------------------ |
| Edit content, spend credits               | ✓      | ✓     | ✓                  |
| Invite / revoke / resend, remove members  | —      | ✓     | ✓                  |
| Rename workspace                          | —      | ✓     | ✓                  |
| Remove another **admin**                  | —      | —     | ✓                  |
| Change roles, billing, transfer ownership | —      | —     | ✓                  |
| Leave the workspace                       | ✓      | ✓     | — (transfer first) |

### Credit attribution & the window

Every ledger row (`credits`) carries the initiating `user_id` (null = system: resets, webhook grants).
`GET /billing` returns `credits.mySpend` — the caller's **net** spend this window (refunds subtract) —
plus `credits.resetAt` and storage/artifact usage; `GET /billing/ledger` is keyset-paginated and names
the spender.

**The window.** `credits_started_at`/`credits_reset_at` bound the current cycle. A monthly renewal
(`invoice.paid`, `subscription_cycle`) anchors it to the invoice date; between renewals — and for
annual subscriptions and Free — it is a rolling ~30-day window rolled **lazily on workspace read**
(`rollCreditWindow`: one `FOR UPDATE` transaction, re-checked under the lock, so parallel requests roll
it exactly once). Every reset writes a ledger row (`monthly-reset`, `renewal-reset`, `upgrade-reset`)
whose balance is the whole limit, add-ons included.

**One counter.** Every credit a workspace holds arrives monthly and expires with the window: the
plan's own allowance, plus the seat add-on's credits for each seat beyond the plan's included ones,
plus the credit add-on's per block (`creditLimitFor`). Because nothing outlives the window, spend is a
single number against a single limit and a refund is that number going back down; there is no second
balance and no ordering between pools.

**Plan changes.** Upgrades and interval switches apply immediately (prorated); a tier or seat
_decrease_ parks at period end via a Stripe subscription schedule, recorded in
`workspaces.scheduled_change` and cleared when the phase lands (or on resume, which releases the
schedule). Checkout is refused (409) while a subscription is live; if a duplicate ever slips through,
the webhook cancels the superseded subscription. `POST /billing/spend` is server-priced only (action +
meter; a client-supplied amount is rejected). Model overrides (`x-galleo-models`) are filtered by the
plan's model tier — the catalogue marks locked models.

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
        priceMonthly; // the whole base subscription, not a per-seat rate
        priceAnnualMonthly;
        includedSeats;
        sellsSeats; // only the team plan
        sellsCredits;
        trialDays;
    };
    // AI limits (fields ours, values theirs 🔶)
    ai: {
        includedCredits; // what the base price covers; add-ons resolve in creditLimitFor
        maxSectionsPerGeneration;
        textModelTier;
        imageModelTier;
    };
    // account caps
    account: { maxArtifacts /* -1=∞ */; storageMb };
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

### Features — the source of truth (`model/billing.ts`)

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

- **`@model/billing`** (`featuresFor` · `creditLimitFor`, beside the resolver they wrap; the Hono
  402 guards `requireFeature`/`checkLimit` are in `services/utils/http.ts`) — `featuresFor(ws)` reads `ws.plan` + `ws.feature_overrides` and calls the
  pure resolver; `creditLimitFor(ws)` scales the per-seat credit base by `ws.seats`. Guards:
  `requireFeature(c, ws, key, message)` → 402 `{ error, upgrade:true }`;
  `checkLimit(c, ws, key, current, message?)` → 402 (both return the Response to send, or null).
- **`services/core/ledger.ts`** — the spend engine: `chargeCredits` (row-locked conditional charge against
  the one monthly pool) and `settleCredits` (live-row reconciliation) — every AI route charges through it,
  and each call writes a `credits` ledger row. The monthly window rolls lazily in `currentWorkspace()` and re-anchors on
  renewal invoices.
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
  workspaces gets one customer each; a user can also be a member of other people's workspaces
  (`users.active_workspace_id` picks the one the app opens).
- **Seat count is orthogonal to tier.** `workspace.plan` = tier; a cached `workspace.seats` column (int,
  default 1) = the plan's included seats plus the seat add-on's quantity, synced from the webhook, so the
  seat cap needs no Stripe round-trip. Price = the plan's base price plus the add-on items.
- **Add-on mechanics (Stripe):** one subscription carries the plan item at `quantity: 1` plus up to two
  recurring add-on items (seat, credits) with their own quantities. `readSub` classifies items by price
  id rather than position, and `plan.billing.sellsSeats` / `sellsCredits` decide which add-ons a plan may
  buy. Because add-ons recur, their credits reset with the plan's own window.
- **Seats ↔ members:** can't reduce seats below active members; adding a member requires a free seat.

### Upgrade / downgrade / cancel flows

Policy: **upgrades invoice immediately (`always_invoice`); tier and seat downgrades park at period end
via a Stripe subscription schedule, recorded in `workspaces.scheduled_change`; cancels take effect at
period end**. A downgrade therefore keeps the current entitlements until the period rolls, which is
what `changePlan` returns as `effect: "scheduled"`. Implemented in `POST /billing/change-plan`
(in-app up/downgrade + seat + interval changes) alongside `/billing/checkout`, `/billing/portal`, and the
signature-verified `/billing/webhook`.

| From → To            | Mechanism                                             | Timing           | Proration                                  |
| -------------------- | ----------------------------------------------------- | ---------------- | ------------------------------------------ |
| Free → paid          | Checkout Session                                      | immediate        | n/a                                        |
| paid → higher        | `subscriptions.update` new price                      | immediate        | charge diff now                            |
| paid → lower         | `subscriptions.update` new price, `create_prorations` | immediate        | credit on next invoice                     |
| paid → Free (cancel) | `cancel_at_period_end: true`                          | period end       | none                                       |
| seat +/− (per-seat)  | update item `quantity` (floor = active member count)  | immediate        | up invoices now; down credits next invoice |
| monthly ↔ annual     | `subscriptions.update` price + interval               | per policy above | Stripe computes                            |

The webhook claims each event id and applies its effects in **one transaction** (`stripe_events`):
redeliveries no-op, and a mid-handle failure rolls the claim back so Stripe's retry re-runs it —
at-least-once delivery, exactly-once effects. It syncs plan/seat/status/period-end/cancel-at-period-end on
`checkout.session.completed` (payment-mode sessions grant credit packs instead),
`customer.subscription.updated` (with a `metadata.workspaceId` fallback that can adopt a sub onto a
workspace that missed its checkout event — only when unlinked, so stale events can't hijack), and
`customer.subscription.deleted` → Free; `invoice.payment_failed` → `past_due` (+ dunning banner),
`invoice.paid` → clears it, and a `subscription_cycle` invoice re-anchors the monthly credit window.
Handlers are last-write-wins and guard on the workspace whose current sub the event is. **Downgrade
reconciliation never deletes data** — when new limits are tighter than current usage, the resolver's gates
**soft-lock**: block _new_ actions over the cap and mark excess resources read-only with an upgrade prompt
(automatic for every limit).

### What's built

The full data model is live: the data-driven 3-tier `Plan` catalog (Free flat · Pro/Premium per-seat) + the
`FEATURES` registry + `resolveFeatures` (`model/`), the `@model/billing` resolver
(`featuresFor` / `creditLimitFor` / `requireFeature` / `checkLimit`) behind every gate, and `GET /billing`
surfacing plan + usage + the purchasable top-up packs. **Credits run through one engine**
(`services/core/ledger.ts`): `chargeCredits`/`settleCredits` lock the workspace row so concurrent spends
serialize, the limit is **plan + seat add-on + credit blocks** (`creditLimitFor`), spend runs against that
one counter, and every charge/settle/grant/reset writes a `credits` ledger row (surfaced at
`GET /billing/ledger` and on the pricing page). The plan's AI fields are enforced end-to-end:
`maxSectionsPerGeneration` clamps the outline (prompt + hard slice) and the metered price, the model tiers
pick flash- vs pro-class models (`modelFor(task, tier)` + the image-model override), and `storageMb` gates
uploads/generation on stored bytes. Stripe is wired end-to-end: `stripe.ts` resolves prices by env and pins
the SDK `apiVersion`, and the routes cover checkout (incl. `trial_period_days` when a plan sets it), portal,
`change-plan` (up/down/seat/interval; seat floor = member count), `resume`, `topup` (payment-mode packs),
`spend`, and the transactional idempotent `webhook`. Billing mutations are **owner-only**. **Teams are
usable**: `services/api/workspace.ts` covers invite (hashed possession tokens, seat-capped, emailed) /
accept / revoke / remove / switch, `users.active_workspace_id` picks the working membership, and the
`MembersView` + sidebar switcher drive it. The pricing page (`PricingView`) adds per-button busy states,
top-up buttons, and the recent-activity ledger. Remaining work is in **Planned / deferred**.

---

## Local dev & ports

Galleo claims the **86xx** host-port block so it runs alongside the other `~/Documents/code` projects.
Container-internal ports stay conventional (5432/6379/…); only host mappings use 86xx.

| Port          | Service                             | Set in                                | Status   |
| ------------- | ----------------------------------- | ------------------------------------- | -------- |
| **8600**      | Studio (Vite dev/preview)           | `vite.config.ts` (strictPort)         | active   |
| **8601**      | Backend API (Hono)                  | `services/server`                     | active   |
| **8602**      | Postgres (→ container 5432)         | `services/db/schema` · `DATABASE_URL` | active   |
| **8603**      | Redis / job queue (→ 6379)          | (reserved)                            | reserved |
| **8604–8605** | Object storage (MinIO S3 + console) | asset storage                         | reserved |
| **8606**      | Preview / SSR (publish viewer)      | `publish` build                       | reserved |

The cross-project registry of every sibling project's host ports lives at `clientbridge/.docs/ports.md`.

---

## Planned / deferred

Forward-looking work that's genuinely still open, grouped by area.

**Engine / editor.** Whole-artifact AI `edit` turns (the route 501s today — see `ai.md`) · engine-native
rich text driving the editor directly from `@model/text` (replacing the contenteditable overlay) ·
free-form / bento grid spanning · background jobs (no queue yet; the 8603 Redis port is reserved).

**Data model.** Stable `asset:` references in element `src` (raw URLs today) · the deferred tables when
their feature lands — api_keys, comments, activity, notifications, brand kits, custom
formats/fonts, view analytics (beyond the `link_recipients.last_viewed_at` stub), custom domains,
live-collab (Yjs) update logs.

**Billing — remaining flow work.**

- **Member roles** — members are owner-or-editor today; an admin role (invite/billing rights without
  ownership) is the next slice. Content-level per-member permissions get their own table (a per-artifact
  ACL) when that feature lands.
- **Export gating is client-side by construction** — rendering happens in the browser, so the format
  list + watermark are enforced in the editor (`ExportModal` reads pushed features); public links stay
  the server-enforced surface (`links.ts` gates + brands server-side). Revisit only if export ever moves
  server-side.
- **Unknown price ids in webhooks** are claimed and skipped silently (env misconfig); surfacing them
  needs an ops/logging story first (no `console` in app code).

**Billing — open tunables / decisions.**

- Credits set to **150 / 2,500 / 6,000** (Free / Pro / Premium) 🔶 — confirm with the AI session.
- Free tier: monthly credits vs a one-time signup grant (a one-time grant caps AI COGS).
- Annual discount depth (~2 months free today).
- Trials? (`billing.trialDays` now flows into Checkout's `trial_period_days`; the catalog keeps 0 until
  a trial is a product decision.)
- Add-on sizing (`ADD_ONS`: a seat at $30/800 credits, a credit block at $20/500) 🔶 — confirm price points.
- Should Free allow inviting a first teammate as a trial, or stay strictly solo (current)?
