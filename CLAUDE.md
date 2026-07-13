# CLAUDE.md — Galleo

AI content-creation tool: one engine renders the same blocks as a **deck, document, or website**,
with high-fidelity export. Net-new, TypeScript.

## Read first

- `.docs/architecture.md` — what Galleo is, the layering law, the factual codebase map, the data model
  (Postgres + JSONB), billing/credits, and ports. Start here for "where does X live".
- `.docs/rendering.md` — the rendering core + element system (engine, format-as-view, compose, elements,
  editing, charts/diagrams).
- `.docs/ai.md` — the AI pipeline: the streamed turn protocol, tools, runtime, chat/workspace agent,
  prompts, routes + credit gate.
- `.docs/frontend.md` — the shared `@ui` component library + the keyboard/command system.
- `.docs/testing.md` — the test philosophy, the mocking contract, and the coverage map.

## Structure (model · canvas · ui · editor · app)

- **`model/`** (`@model`, `@themes`) — the pure, edge-safe contract. Imports **nothing** outside `model`.
  Per-entity: each type sits with its own wire DTOs — `artifact` (the content tree + its REST shapes),
  `ai` (the streamed turn protocol) + `tools`/`credits`/`billing`/`features` (the AI tool catalog + metered
  credits + entitlements), `workspace` (user/folder/template + their DTOs), `text`
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
  primitive recolors with the active theme). See `.docs/frontend.md`.
- **`editor/`** (`@editor`) — the SolidJS studio: selection, inspectors, inline text, drag-drop over
  `model` + `canvas` + `ui`. `register.ts` side-effect-registers the elements.
- **`services/`** — backend (Hono + Postgres/Drizzle), depends only on `model`: `schema.ts` + `auth.ts` + a thin `server.ts` mounting per-resource routers in `api/`; `seed.ts` + `demos/` + `templates/` are seed content.
- **`app/`** — the product SPA (served at `/app`): library, templates, AI generation + chat, theme editor, sharing, wrapping the editor.
- **Frontend = SolidJS + Vite + Tailwind v4.** `model` + `canvas` stay framework-free; the engine paints
  render commands imperatively into refs (`@canvas/render/backends`) — Solid only owns shell + state.

## Conventions (enforced)

- **No `index.ts` barrels.** Each concept is a named file (`engine/layout.ts`, `elements/spec.ts`).
- **Building UI in any module → go through `@ui`** (the layering makes cross-module reuse like
  `app → @editor` illegal, so `@ui` is the only shared home). The recipe, in order: **(1) reuse** the
  existing `@ui` primitive; **(2) extend** it with a prop/variant when it's ~90% there (don't fork the
  styling — grow the atom's variant/size/tone maps); **(3) create** a new primitive only when a genuinely
  shared one is missing (rule of thumb: needed by ≥2 modules or ≥3 sites) — drop it into the fitting flat
  category file (`ui/<family>.tsx`, no barrels; base atoms first, composites below), never a per-view copy;
  **(4) keep** true one-offs local to the view, and promote them the moment a second module needs them.
  Every `@ui` component **must**: style only through the theme CSS-var utilities (`text-ink`, `bg-accent`,
  `var(--radius)`… — zero hardcoded colors, so it recolors with the theme), forward native attrs + `class`
  via `splitProps`, and import nothing above `@ui` (`model` + `canvas` + `@themes` only). Catalog + build
  spec: `.docs/frontend.md`.
- **Path aliases** (directory aliases): `@model`, `@themes`, `@engine`, `@elements`, `@canvas`, `@ui`,
  `@editor` (e.g. `@model/artifact`, `@ui/button`). Backend + frontend both import the shared wire shapes
  from `@model` + `@themes`; `services` otherwise use relative imports.
- **TS style:** 4-space indent, double quotes, semicolons, `printWidth` 100, **no `any`**, **no
  `console`** in app code. (ESLint + Prettier enforce these.)
- **Comments — terse, and only when needed.** Names + types carry the meaning; a comment earns its place
  only by saying something the code cannot. When one is warranted, make it a short fragment for a genuine
  _why_: an invariant, a gotcha, a unit/range, a magic value's meaning, a "must stay in sync with X". Do
  **not** write file-header narrative essays, decorative section banners (`// ===== … =====`, `// --- … ---`,
  box-drawing rules), or comments that restate the code/name/type. Always keep directive comments
  (`eslint-disable`, `@ts-expect-error`, `@vitest-environment`, `/* @refresh reload */`), `TODO`/`FIXME`, and
  license headers. No build-phase/iteration numbers in comments or docstrings (plan docs are fine).
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

The product SPA (`app/`, served at `/app`) wraps the studio: library / templates / trash / shared /
editor views, a backend (`services/` Hono + Postgres/Drizzle; artifact content lives in the
`draft_content` jsonb), a singular theme editor (`app/views/ThemeEditor.tsx`), and a **real** streamed
AI pipeline — generation, chat, section/element/text edits over the `@model/ai` turn protocol (SSE),
served by `services/ai` (see `.docs/ai.md`). The `app/views/generate` client-side simulator is gone.

## Commits

Single-line, imperative; ticket prefix if the branch has one; **no co-author trailer**.
