# CLAUDE.md — Galleo

AI content-creation tool: one engine renders the same blocks as a **deck, document, or website**,
with high-fidelity export. Net-new, TypeScript.

## Read first
- `docs/architecture.md` — per-section build-out map + build order (start here for "what next").
- `docs/layout-engine.md` · `docs/element-system.md` · `docs/text-element.md` · `docs/data-model.md`
- `design/product-direction.md` — product framing.

## Structure (Kernel + Surfaces)
- **`kernel/`** — pure, edge-safe core: `model engine elements text themes render`. Imports **nothing**
  outside `kernel`.
- **`surfaces/`** — ways to touch the kernel: `studio` (editor) · `present` · `publish` · `export` ·
  `agent`. A surface **never** imports another surface.
- **`services/`** — backend: `data` (Postgres + Drizzle) · `api` · `auth` · `queue`.
- Concrete render backends (DOM/canvas/PDF/SSR) live **with their surface**, never in `kernel`.

## Conventions (enforced)
- **No `index.ts` barrels.** Each concept is a named file (`engine/layout.ts`, `elements/element-spec.ts`).
- **Path aliases** point at files: `@engine/layout`, `@model/content`, `@data/schema`, …
- **TS style:** 4-space indent, double quotes, semicolons, `printWidth` 100, **no `any`**, **no
  `console`** in app code. (ESLint + Prettier enforce these.)
- **No build-phase/iteration numbers** in code comments or docstrings (plan docs are fine).
- **Boundaries** (ESLint): kernel ⇏ surfaces/services; surface ⇏ surface.

## Commands
```
pnpm typecheck      pnpm lint      pnpm format
pnpm dev            # watch + serve the studio demo → http://localhost:5173/index.html
pnpm demo           # one-shot bundle → surfaces/studio/demo.js, open via file://
pnpm db:generate    pnpm db:migrate
```

## Current state
The kernel engine (`kernel/engine/layout.ts`, Clay-style 3-pass solver) drives the studio. P1 of
`docs/studio-plan.md` is built: a 3-zone shell (`index.html`) — left minimap of live section
thumbnails, center continuous **section canvas** (`canvas.ts`), right **element palette**
(`right-panel.ts`). Sections compose via `@elements/templates` + `@elements/compose`; every element
has a structural ghost (`@elements/skeleton`). Elements so far: text, image, card, group, stat,
bullets, button, divider, quote.
Next per `docs/studio-plan.md`: P2 selection + overlay, then P3 drag-drop with live drop-targets.
Still planned: virtualization of the canvas, `engine/profile`/`fragment` (format-as-view), text editing.

## Commits
Single-line, imperative; ticket prefix if the branch has one; **no co-author trailer**.
