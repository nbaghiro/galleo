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
- **Studio frontend = SolidJS + Vite + Tailwind v4.** The kernel stays framework-free; the engine
  paints render commands imperatively into refs (`dom-backend.ts`) — Solid only owns shell + state.

## Conventions (enforced)

- **No `index.ts` barrels.** Each concept is a named file (`engine/layout.ts`, `elements/element-spec.ts`).
- **Path aliases** point at files: `@engine/layout`, `@model/content`, `@data/schema`, …
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

Galleo owns the **86xx** host-port block (runs alongside the sibling apps). See `docs/ports.md`.

## Current state

The kernel engine (`kernel/engine/layout.ts`, Clay-style 3-pass solver) drives the studio, now a
**SolidJS** app: `Studio.tsx` shell = `Topbar` · `Minimap` (live `Thumb`s) · `Canvas` (continuous
section stack) · `Panel` (element palette). State in `editor.ts` (Solid store); imperative paint
helpers in `render.ts`; engine output painted into refs via `dom-backend.ts`. Sections compose via
`@elements/templates` + `@elements/compose`; every element has a structural ghost
(`@elements/skeleton`). Elements: text, image, card, group, stat, bullets, button, divider, quote.
Next per `docs/studio-plan.md`: P2 selection + overlay, then P3 drag-drop with live drop-targets.
Still planned: canvas virtualization, `engine/profile`/`fragment` (format-as-view), text editing.

## Commits

Single-line, imperative; ticket prefix if the branch has one; **no co-author trailer**.
