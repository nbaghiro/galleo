# Galleo

AI content-creation tool — one engine renders the same blocks as a **deck, a document, or a
website**, with high-fidelity export. See `design/` and `docs/` for the locked architecture specs.

## Structure — Kernel + Surfaces

- **`kernel/`** — the rendering core (pure TS, edge-safe). Shared by every surface.
  - `model` content contract · `engine` layout · `elements` registry · `themes` · `text` · `render`
- **`surfaces/`** — the ways you touch the kernel: `studio` (editor), `present`, `publish` (hosted
  sites), `export` (pdf/pptx/png), `agent` (AI authoring).
- **`services/`** — backend capabilities: `data` (Postgres + Drizzle), `api`, `auth`, `queue`.

**Conventions**

- **No `index.ts` barrels** — every concept is its own named file (e.g. `engine/layout.ts`,
  `elements/element-spec.ts`), imported via short path aliases (`@engine/layout`, `@model/content`)
  so search and "Go to file" stay clean.
- **Dependency rule** (ESLint-enforced): `kernel` imports nothing outside `kernel`; no surface
  imports another surface.

## Wiring (no monorepo tooling)

A single `tsconfig.json` with `@<name>/*` path aliases — no Turbo/Nx, no workspaces. TypeScript
project references / pnpm workspaces are a one-step upgrade if/when build order or per-package deps
matter.

## Commands

```
pnpm install
pnpm typecheck      # tsc --noEmit
pnpm lint           # eslint (incl. boundary rules)
pnpm format         # prettier
pnpm db:generate    # drizzle-kit generate
pnpm db:migrate     # drizzle-kit migrate
```

## Data

`services/data/schema.ts` holds the Drizzle schema (v1-core tables). The full 29-table model is
documented in `docs/data-model.md`.
