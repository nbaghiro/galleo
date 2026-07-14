# Galleo

**One canonical artifact, three surfaces.** Galleo is an AI content-creation tool where the same block
tree renders as a **deck**, a **document**, or a **website** — with pixel-identical, high-fidelity
export. A custom layout engine is the single source of geometry, so what you edit is what you present,
thumbnail, and export.

> **Status** — built and running end-to-end: the studio editor, the product SPA, the backend, and a
> **real, streamed LLM pipeline** — generation across all three surfaces, a tool-calling chat agent,
> section / element / text edits, theme + image generation, and metered credits. Present and export run
> inside the studio; published artifacts get a public read-only viewer. Details in
> [`.docs/architecture.md`](.docs/architecture.md).

## Architecture

TypeScript throughout, under a **linear, ESLint-enforced dependency law** — `model ← canvas ← ui ← editor
← app` — where each layer may import only those to its left, and `services` depend only on `model`.

- **`model/`** — the pure, edge-safe contract: the content tree, `themes`, and the AI turn / tool
  protocol. Imports nothing above it. (`@model`, `@themes`)
- **`canvas/`** — the render layer: the layout `engine` · `elements` · DOM / 2D-canvas / PDF backends.
  Pure, framework-free TS. (`@canvas`, `@engine`, `@elements`)
- **`ui/`** — the shared SolidJS component library, reused across the editor and app. (`@ui`)
- **`editor/`** — the studio: selection, inspectors, inline text, drag-and-drop; present + export live
  here. (`@editor`)
- **`services/`** — the backend: Hono + Postgres/Drizzle + auth, and the AI runtime (generation · chat
  agent · streaming · the credit gate).
- **`app/`** — the product SPA: library, templates, theming, AI generation + chat, sharing.
- **`website/`** — the public marketing build · **`publish/`** — the public read-only artifact viewer.

Concrete render backends (DOM / 2D-canvas / PDF) live in `canvas` with the engine, never in `model` — so
the core stays framework-free and the _same_ engine output drives every target (edit, present, thumbnail,
export).

**Serving is single-origin and contextual:** `/` is the app when you're signed in, the marketing site
otherwise; `/home` always shows marketing; `/p/<id>` serves a published artifact's read-only view.

**Stack:** SolidJS + Vite + Tailwind v4 (frontend) · Hono + Drizzle + Postgres (backend) · Vercel AI SDK +
Google Gemini (AI; Anthropic / OpenAI / xAI are configurable).

## Quick start

```bash
pnpm install
cp .env.example .env          # set DATABASE_URL, SESSION_SECRET, and GOOGLE_API_KEY (the default AI provider)
pnpm db:push                  # create the schema (needs Postgres on :8602 — see .docs/architecture.md)
pnpm seed                     # demo workspace + artifacts (login: demo@galleo.app / demo1234)

pnpm api                      # the Hono API  → http://localhost:8601
pnpm dev                      # the Vite app  → http://localhost:8600
```

## Commands

| Command                                                 | What it does                                              |
| ------------------------------------------------------- | --------------------------------------------------------- |
| `pnpm dev`                                              | Vite dev server (marketing + app + publish)               |
| `pnpm build`                                            | production build → `dist/`                                |
| `pnpm api` · `pnpm api:watch`                           | the backend API                                           |
| `pnpm seed`                                             | seed the demo data                                        |
| `pnpm test`                                             | Vitest (unit + integration)                               |
| `pnpm typecheck` · `pnpm lint` · `pnpm format`          | `tsc --noEmit` · ESLint (incl. boundary rules) · Prettier |
| `pnpm db:generate` · `pnpm db:migrate` · `pnpm db:push` | Drizzle schema                                            |

CI runs **typecheck + lint + format-check + test + build** on every push/PR, and a pre-commit hook runs the
same checks locally (wired up automatically by `pnpm install`).

## Conventions

- **No `index.ts` barrels** — every concept is a named file, imported via path aliases (`@engine/layout`,
  `@model/artifact`, `@editor/editor`).
- **TS style** — 4-space indent, double quotes, semicolons, `printWidth` 100, no `any`, no `console` in
  app code (ESLint + Prettier enforce it).

## Docs

Deep-dives live in [`.docs/`](.docs/) — [architecture](.docs/architecture.md),
[rendering](.docs/rendering.md), [ai](.docs/ai.md), [frontend](.docs/frontend.md),
[testing](.docs/testing.md), and [hosting](.docs/hosting.md). Full index:
[`.docs/README.md`](.docs/README.md).
