# Galleo

**One canonical artifact, three surfaces.** Galleo is an AI content-creation tool where the same block
tree renders as a **deck**, a **document**, or a **website** — with pixel-identical, high-fidelity
export. A custom layout engine is the single source of geometry, so what you edit is what you present,
thumbnail, and export.

> **Status** — the studio editor, product SPA, and backend are built and run end-to-end. The
> AI-generation flow is a client-side simulator today (the real LLM pipeline is scaffolded), and
> present/export live inside the studio for now. Details in [`.docs/architecture.md`](.docs/architecture.md).

## Architecture

TypeScript throughout — **Kernel + Surfaces + Services + App**, with an ESLint-enforced dependency law:
the kernel imports nothing outside itself, and no surface imports another surface.

- **`kernel/`** — the pure, edge-safe core: content model · layout `engine` · `elements` · `themes`.
- **`surfaces/`** — ways to touch the kernel: `studio` (the editor; present + export live inside it today).
- **`services/`** — the backend: `data` (Postgres + Drizzle) · `api` (Hono) · `auth`.
- **`app/`** — the product SPA (served at `/app`): library, editor, templates, theming, generation flow.
- **`marketing/`** — the public landing build (served at `/`).

Concrete render backends (DOM / 2D-canvas / PDF) live **with their surface**, never in the kernel — so
the core stays framework-free and the _same_ engine output drives every target (edit, present, thumbnail,
export).

**Stack:** SolidJS + Vite + Tailwind v4 (frontend) · Hono + Drizzle + Postgres (backend).

## Quick start

```bash
pnpm install
cp .env.example .env          # set DATABASE_URL, SESSION_SECRET, ANTHROPIC_API_KEY
pnpm db:push                  # create the schema (needs Postgres on :8602 — see .docs/ports.md)
pnpm seed                     # demo workspace + artifacts (login: demo@galleo.app / demo1234)

pnpm api                      # the Hono API  → http://localhost:8601
pnpm dev                      # the Vite app  → http://localhost:8600  (/ = marketing, /app = product)
```

## Commands

| Command                                                 | What it does                                              |
| ------------------------------------------------------- | --------------------------------------------------------- |
| `pnpm dev`                                              | Vite dev server (marketing + app)                         |
| `pnpm build`                                            | production build → `dist/`                                |
| `pnpm api` · `pnpm api:watch`                           | the backend API                                           |
| `pnpm seed`                                             | seed the demo data                                        |
| `pnpm typecheck` · `pnpm lint` · `pnpm format`          | `tsc --noEmit` · ESLint (incl. boundary rules) · Prettier |
| `pnpm db:generate` · `pnpm db:migrate` · `pnpm db:push` | Drizzle schema                                            |

CI runs **typecheck + lint + format-check + build** on every push/PR, and a pre-commit hook runs the same
checks locally (wired up automatically by `pnpm install`).

## Conventions

- **No `index.ts` barrels** — every concept is a named file, imported via path aliases (`@engine/layout`,
  `@model/content`, `@studio/editor`).
- **TS style** — 4-space indent, double quotes, semicolons, `printWidth` 100, no `any`, no `console` in
  app code (ESLint + Prettier enforce it).

## Docs

Deep-dives live in [`.docs/`](.docs/) — start with [architecture](.docs/architecture.md), then the
[layout engine](.docs/layout-engine.md), [element system](.docs/element-system.md), and
[data model](.docs/data-model.md). Full index: [`.docs/README.md`](.docs/README.md).
