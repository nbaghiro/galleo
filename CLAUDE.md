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

## Structure (model · canvas · editor · app)

- **`model/`** (`@model`, `@themes`) — the pure, edge-safe contract. Imports **nothing** outside `model`.
  Per-entity: each type sits with its own wire DTOs — `artifact` (the content tree + its REST shapes),
  `agent` (the streamed generation protocol), `workspace` (user/folder/template + their DTOs), `text`
  (rich-text core + the render-facing `Run`), plus `target`/`geometry` (sizing + format profiles)/`authoring` and `themes/`.
- **`canvas/`** (`@canvas`, `@engine`, `@elements`) — the paint layer: the layout engine + element
  library + DOM / 2D-canvas / PDF backends + present-slide geometry + export. **Pure TS** — framework-
  and editor-free; imports only `model`. (The Solid present _surface_ that wraps it lives in `app`.)
- **`editor/`** (`@editor`) — the SolidJS studio: selection, inspectors, inline text, drag-drop over
  `model` + `canvas`. `register.ts` side-effect-registers the elements.
- **`services/`** — backend: `data` (Postgres + Drizzle) · `api` (Hono) · `auth` · `queue`; depends only on `model`.
- **`app/`** — the product SPA (served at `/app`): library, templates, generation, theme drawer, wrapping the editor.
- **Frontend = SolidJS + Vite + Tailwind v4.** `model` + `canvas` stay framework-free; the engine paints
  render commands imperatively into refs (`@canvas/render/backends`) — Solid only owns shell + state.

## Conventions (enforced)

- **No `index.ts` barrels.** Each concept is a named file (`engine/layout.ts`, `elements/spec.ts`).
- **Path aliases** (directory aliases): `@model`, `@themes`, `@engine`, `@elements`, `@canvas`, `@editor`
  (e.g. `@model/artifact`). Backend + frontend both import the shared wire shapes from `@model` +
  `@themes`; `services` otherwise use relative imports.
- **TS style:** 4-space indent, double quotes, semicolons, `printWidth` 100, **no `any`**, **no
  `console`** in app code. (ESLint + Prettier enforce these.)
- **No build-phase/iteration numbers** in code comments or docstrings (plan docs are fine).
- **Boundaries** (ESLint): model ⇏ canvas/editor/services/app; canvas ⇏ editor/services/app; services ⇏ canvas/editor/app.

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
`Panel` (element palette), with selection + inspectors + drag-drop (feature folders `select/`·`inspect/`·`insert/`) and
inline text editing (`text/text-editor.tsx`). State in `editor.ts` (Solid store); painting is the
`@canvas` layer — the engine's commands paint into refs (`@canvas/render/backends`, with a 2D-canvas
mirror for Present + PDF/PNG export). Sections compose via `@elements/compose`; every element has a
structural ghost (`skeletonize` in `@elements/spec`). **20 elements** register via `editor/register.ts`'s five
category imports (19 content elements + the internal drop-preview); format-as-view
(`@engine/profile` + `fragment`) is built, so one artifact renders as deck / doc / web.

The product SPA (`app/`, served at `/app`) wraps the studio: library / templates / trash / editor
views, a backend (`services/api` Hono + `services/data` Postgres/Drizzle; artifact content lives in the
`draft_content` jsonb), a singular theme drawer + custom-theme builder, and a narrated AI-generation
flow that is a **client-side simulator** (`app/generate`, replaying hand-built fixtures section by
section). A real backend LLM pipeline for the `@model/agent` protocol is future work.

## Commits

Single-line, imperative; ticket prefix if the branch has one; **no co-author trailer**.
