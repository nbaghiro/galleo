# CLAUDE.md — Galleo

AI content-creation tool: one engine renders the same blocks as a **deck, document, or website**,
with high-fidelity export. Net-new, TypeScript.

## Read first

- `.docs/architecture.md` — factual codebase map: what's in each package, the layering law, data flow.
  Start here for "where does X live".
- `.docs/layout-engine.md` · `.docs/element-system.md` · `.docs/data-model.md` — the core design specs.
- `.docs/design/product-direction.md` — product framing.

## Structure (Kernel + Surfaces)

- **`kernel/`** — pure, edge-safe core: `model engine elements themes` (+ `text`/`agent` scaffolding for
  planned features). Imports **nothing** outside `kernel`.
- **`surfaces/`** — ways to touch the kernel: `studio` (the editor, the only one built so far; present +
  export live inside it today). A surface **never** imports another surface.
- **`services/`** — backend: `data` (Postgres + Drizzle) · `api` (Hono) · `auth` (+ `agent` scaffolding).
- Concrete render backends (DOM/canvas/PDF/SSR) live **with their surface**, never in `kernel`.
- **Studio frontend = SolidJS + Vite + Tailwind v4.** The kernel stays framework-free; the engine
  paints render commands imperatively into refs (`dom-backend.ts`) — Solid only owns shell + state.

## Conventions (enforced)

- **No `index.ts` barrels.** Each concept is a named file (`engine/layout.ts`, `elements/element-spec.ts`).
- **Path aliases** (directory aliases): `@model`, `@engine`, `@elements`, `@themes`, `@studio` (e.g.
  `@model/content`). `services` use relative imports; the `kernel/agent`/`kernel/text` scaffolding has no
  alias until it's wired.
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

Galleo owns the **86xx** host-port block (runs alongside the sibling apps). See `.docs/ports.md`.

## Current state

The kernel engine (`kernel/engine/layout.ts`, Clay-style 3-pass solver) drives a **SolidJS** studio:
`Studio.tsx` shell = `Topbar` · `Minimap` (live `Thumb`s) · `Canvas` (continuous section stack) ·
`Panel` (element palette), with selection + inspectors + drag-drop (`overlay/`) and inline text editing
(`editing/TextEditor.tsx`). State in `editor.ts` (Solid store); paint helpers in `render.ts`; engine
output paints into refs via `dom-backend.ts` (a 2D-canvas backend mirrors it for Present + PDF/PNG
export). Sections compose via `@elements/templates` + `@elements/compose`; every element has a
structural ghost (`@elements/skeleton`). **19 elements** registered (`register.ts`); format-as-view
(`engine/profile` + `fragment`) is built, so one artifact renders as deck / doc / web.

The product SPA (`app/`, served at `/app`) wraps the studio: library / templates / trash / editor
views, a backend (`services/api` Hono + `services/data` Postgres/Drizzle; artifact content lives in the
`draft_content` jsonb), a singular theme drawer + custom-theme builder, and a narrated AI-generation
flow — a **client-side simulator** today; the real agent pipeline (`kernel/agent` + `services/agent`)
is scaffolded, not yet wired.

## Commits

Single-line, imperative; ticket prefix if the branch has one; **no co-author trailer**.
