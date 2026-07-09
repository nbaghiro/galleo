# CLAUDE.md — Galleo

AI content-creation tool: one engine renders the same blocks as a **deck, document, or website**,
with high-fidelity export. Net-new, TypeScript.

## Read first

- `.docs/architecture.md` — factual codebase map: what's in each package, the layering law, data flow,
  local ports. Start here for "where does X live".
- `.docs/rendering.md` — the rendering core + element system (engine, format-as-view, compose, elements,
  editing).
- `.docs/data-model.md` — persistence (Postgres + the JSONB content tree).
- `.docs/product.md` — product framing (what Galleo is, the "why").

## Structure (model · canvas · ui · editor · app)

- **`model/`** (`@model`, `@themes`) — the pure, edge-safe contract. Imports **nothing** outside `model`.
  Per-entity: each type sits with its own wire DTOs — `artifact` (the content tree + its REST shapes),
  `agent` (the streamed generation protocol), `workspace` (user/folder/template + their DTOs), `text`
  (rich-text core + the render-facing `Run`), plus `target`/`geometry` (sizing + format profiles)/`authoring`, `elements` (the element value-sets), and `theme` (the whole theme contract + curated library, one file).
- **`canvas/`** (`@canvas`, `@engine`, `@elements`) — the paint layer: the layout engine + element
  library + DOM / 2D-canvas / PDF backends + present-slide geometry + export. **Pure TS** — framework-
  and editor-free; imports only `model`.
- **`ui/`** (`@ui`) — the **shared Solid component library**: the framework-level primitives used by more
  than one frontend module (Button · IconButton · Chip · Badge · Eyebrow · text inputs · Dropdown · color
  pickers · Popover · Modal · FloatingBar · the scaled section canvas · the present surface · the unified
  `Icon` set). Sits **below** editor/app but above canvas: may import `model` + `canvas` + `@themes`, nothing
  higher. **Any Solid component shared across editor + app (or publish) lives here — never duplicated
  per-module or reached across a sibling boundary.** Theme-reactive by construction (styled only through the
  theme CSS-var utilities — `text-ink`, `bg-accent`, `var(--radius)`… — zero hardcoded colors, so every
  primitive recolors with the active theme). See `.docs/ui-component-library.md`.
- **`editor/`** (`@editor`) — the SolidJS studio: selection, inspectors, inline text, drag-drop over
  `model` + `canvas` + `ui`. `register.ts` side-effect-registers the elements.
- **`services/`** — backend (Hono + Postgres/Drizzle), depends only on `model`: `schema.ts` + `auth.ts` + a thin `server.ts` mounting per-resource routers in `api/`; `seed.ts` + `demos/` + `templates/` are seed content.
- **`app/`** — the product SPA (served at `/app`): library, templates, generation, theme drawer, wrapping the editor.
- **Frontend = SolidJS + Vite + Tailwind v4.** `model` + `canvas` stay framework-free; the engine paints
  render commands imperatively into refs (`@canvas/render/backends`) — Solid only owns shell + state.

## Conventions (enforced)

- **No `index.ts` barrels.** Each concept is a named file (`engine/layout.ts`, `elements/spec.ts`).
- **Shared components → `ui/`.** A Solid component (or hook/primitive) used by more than one frontend
  module belongs in `@ui`, not in `editor`/`app`/`publish`. Before hand-rolling a button, input, menu,
  modal, popover, icon, badge, spinner, or thumbnail in a view, use the `@ui` primitive (extend it with a
  new prop/variant if it's close) — the ESLint layering makes cross-module reuse (`app → @editor`) illegal,
  so the shared home is `@ui`. Keep genuinely one-off, view-specific UI local; promote it to `@ui` the
  moment a second module needs it.
- **Path aliases** (directory aliases): `@model`, `@themes`, `@engine`, `@elements`, `@canvas`, `@ui`,
  `@editor` (e.g. `@model/artifact`, `@ui/button`). Backend + frontend both import the shared wire shapes
  from `@model` + `@themes`; `services` otherwise use relative imports.
- **TS style:** 4-space indent, double quotes, semicolons, `printWidth` 100, **no `any`**, **no
  `console`** in app code. (ESLint + Prettier enforce these.)
- **No build-phase/iteration numbers** in code comments or docstrings (plan docs are fine).
- **Boundaries** (ESLint, linear `model ← canvas ← ui ← editor ← app`): model ⇏ canvas/ui/editor/services/app;
  canvas ⇏ ui/editor/services/app; **ui ⇏ editor/services/app** (shared UI depends only on model + canvas +
  `@themes`); services ⇏ canvas/ui/editor/app.

## Commands

```
pnpm dev            # Vite dev server (HMR) → http://localhost:8600
pnpm build          # production build → dist/
pnpm typecheck      pnpm lint      pnpm format
pnpm db:generate    pnpm db:migrate
```

Galleo owns the **86xx** host-port block (runs alongside the sibling apps). See the ports table in
`.docs/architecture.md`.

## Current state

The layout engine (`canvas/engine/layout.ts`, Clay-style 3-pass solver) drives a **SolidJS** studio:
`editor/Studio.tsx` shell = `Topbar` · `Minimap` (live `Thumb`s) · `Canvas` (continuous section stack) ·
`Panel` (element palette), with selection + inspectors + drag-drop (feature folders `select/`·`inspect/`·`canvas/`) and
inline text editing (`text/text-editor.tsx`). State in `editor.ts` (Solid store); painting is the
`@canvas` layer — the engine's commands paint into refs (`@canvas/render/backends`, with a 2D-canvas
mirror for Present + PDF/PNG export). Sections compose via `@elements/compose`; every element has a
structural ghost (`skeletonize` in `@elements/spec`). **20 elements** register via `editor/register.ts`'s five
category imports (19 content elements + the internal drop-preview); format-as-view
(`@engine/profile` + `fragment`) is built, so one artifact renders as deck / doc / web.

The product SPA (`app/`, served at `/app`) wraps the studio: library / templates / trash / editor
views, a backend (`services/` Hono + Postgres/Drizzle; artifact content lives in the
`draft_content` jsonb), a singular theme drawer + custom-theme builder, and a narrated AI-generation
flow that is a **client-side simulator** (`app/views/generate`, replaying hand-built fixtures section by
section). A real backend LLM pipeline for the `@model/ai` protocol is future work.

## Project management (Linear)

The backlog lives in Linear (team `GAL`, workspace `galleo`) — **14 projects = tech epics (E1–E14),
issues = chunky tickets** titled `[E#-#] …`. Process, the epic→code map, field conventions, and the
workflows are in `.docs/pm-process.md`. A repo subagent, **`galleo-pm`**, keeps tickets and code in
sync: hand it a one-liner — or use `/pm-sync`, `/pm-plan`, `/pm-build`, `/pm-ticket` — to reconcile
tickets against the code, plan a ticket, implement it, or capture a change. It queries Linear live via
the `linear-server` MCP (in `.mcp.json`; each user authenticates once with `/mcp`).

## Commits

Single-line, imperative; ticket prefix if the branch has one; **no co-author trailer**.
