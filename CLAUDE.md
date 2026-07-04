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

## Structure (Kernel + Surfaces)

- **`kernel/`** — pure, edge-safe core: `model engine elements themes`. Imports **nothing** outside
  `kernel`. `model/` is **per-entity** — each type sits with its own wire DTOs: `artifact` (the content
  tree + its REST shapes), `agent` (the streamed generation protocol), `workspace` (user/folder/
  template + their DTOs), `text` (rich-text scaffolding), plus `target`/`size`/`format`/`authoring`.
- **`surfaces/`** — ways to touch the kernel: `studio` (the editor, the only one built so far; present +
  export live inside it today). A surface **never** imports another surface.
- **`services/`** — backend: `data` (Postgres + Drizzle) · `api` (Hono) · `auth` (+ `agent` scaffolding).
- Concrete render backends (DOM/canvas/PDF/SSR) live **with their surface**, never in `kernel`.
- **Studio frontend = SolidJS + Vite + Tailwind v4.** The kernel stays framework-free; the engine
  paints render commands imperatively into refs (`dom-backend.ts`) — Solid only owns shell + state.

## Conventions (enforced)

- **No `index.ts` barrels.** Each concept is a named file (`engine/layout.ts`, `elements/element-spec.ts`).
- **Path aliases** (directory aliases): `@model`, `@engine`, `@elements`, `@themes`, `@studio`
  (e.g. `@model/artifact`). Backend + frontend both import the shared wire shapes from `@model` +
  `@themes`; `services` otherwise use relative imports.
- **TS style:** 4-space indent, double quotes, semicolons, `printWidth` 100, **no `any`**, **no
  `console`** in app code. (ESLint + Prettier enforce these.)
- **No build-phase/iteration numbers** in code comments or docstrings (plan docs are fine).
- **Boundaries** (ESLint): kernel ⇏ surfaces/services; surface ⇏ surface.

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

The kernel engine (`kernel/engine/layout.ts`, Clay-style 3-pass solver) drives a **SolidJS** studio:
`Studio.tsx` shell = `Topbar` · `Minimap` (live `Thumb`s) · `Canvas` (continuous section stack) ·
`Panel` (element palette), with selection + inspectors + drag-drop (`overlay/`) and inline text editing
(`editing/TextEditor.tsx`). State in `editor.ts` (Solid store); paint helpers in `render.ts`; engine
output paints into refs via `dom-backend.ts` (a 2D-canvas backend mirrors it for Present + PDF/PNG
export). Sections compose via `@elements/templates` + `@elements/compose`; every element has a
structural ghost (`skeletonize` in `@elements/spec`). **20 elements** register via `register.ts`'s five
category imports (19 content elements + the internal drop-preview); format-as-view
(`engine/profile` + `fragment`) is built, so one artifact renders as deck / doc / web.

The product SPA (`app/`, served at `/app`) wraps the studio: library / templates / trash / editor
views, a backend (`services/api` Hono + `services/data` Postgres/Drizzle; artifact content lives in the
`draft_content` jsonb), a singular theme drawer + custom-theme builder, and a narrated AI-generation
flow — a **client-side simulator** today; the real agent pipeline (`@model/agent` protocol +
`services/agent`) is scaffolded, not yet wired.

## Commits

Single-line, imperative; ticket prefix if the branch has one; **no co-author trailer**.
