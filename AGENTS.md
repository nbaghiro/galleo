# AGENTS.md — Galleo

AI content-creation tool: one engine renders the same blocks as a **deck, document, or website**,
with high-fidelity export. Net-new, TypeScript.

## Read first

- `.docs/architecture.md` — what Galleo is, the layering law, the factual codebase map, the data model
  (Postgres + JSONB), billing/credits, and ports. Start here for "where does X live".
- `.docs/rendering.md` — the rendering core + element system (engine, format-as-view, compose, elements,
  editing, charts/diagrams).
- `.docs/ai.md` — the AI pipeline: the streamed turn protocol, tools, runtime, chat/workspace agent,
  prompts, routes + credit gate.
- `.docs/workspaces.md` — the tenant: the workspace row, plans + the entitlement resolver, Stripe +
  the webhook, the credit window/ledger, membership + seats, and what `pnpm seed` builds.
- `.docs/frontend.md` — the shared `@ui` component library + the keyboard/command system.
- `.docs/search.md` — library search + the ⌘K palette: the Postgres FTS index, the query, the palette
  source registry.
- `.docs/loading.md` — how much loads at once: list pagination, windowed artifact reads + section-op
  writes, and paint windowing for the section stack.
- `.docs/testing.md` — the test philosophy, the mocking contract, and the coverage map.

## Structure (model · canvas · ui · editor · app)

- **`model/`** (`@model`, `@themes`) — the pure, edge-safe contract. Imports **nothing** outside `model`.
  **One file per concept**, each holding its types, its wire DTOs, and the functions that operate on them,
  so a new field is one file's diff: `artifact` (the content tree + tree/path ops + node addressing + REST
  shapes + section-op semantics + the derived digest/search text), `ai` (the streamed turn protocol; the
  LLM-facing catalog lives with its prompt in `services/core/ai/prompts/catalog.ts`), `credits` (metered credits +
  the AiTask steps), `tools` (the one tool catalog: identity, surfaces, pricing), `billing` (plans, seats,
  add-ons + the entitlement resolver), `eval` (the traced-run contract the eval playground reads),
  `workspace` (user/folder + the auth DTOs), `text` (rich-text core + the render-facing `Run`), plus
  `geometry` (sizing + format profiles), `media` (the picker + asset DTOs), `authoring` (fixture DSL),
  `elements` (element value-sets + the vector IR), and
  the two curated catalogs that carry their own contract: `theme` (the whole theme contract + library) and
  `templates` (the `Template` DTO + `TEMPLATE_INDEX`, ids/labels/grouping only — the bodies are served from
  `services/core/templates.ts`, so this stays edge-safe). Fourteen files; resist adding a fifteenth for a
  handful of types that belong to a concept already here.
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
- **`services/`** — backend (Hono + Postgres/Drizzle), depends only on `model`. A thin `server.ts` at the
  root mounts the routers; everything else sits in a layer, `api → core → db → utils`:
  **`api/`** one file per resource, HTTP only (parse · gate · shape a response) plus the shared
  `middleware.ts`; **`core/`** one file per functionality, owning every decision and every query, and
  forbidden from importing hono (`core/ai/`, the LLM runtime, is the one entry that is a folder rather than
  a file); **`db/`** schema · the lazy client · derived columns · migrations · the `seed.ts` entry;
  **`utils/`** http helpers · auth crypto · env, database-free by rule so it stays unit-testable.
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
- **Responsive — three tiers, not one sweep.** `@ui/viewport` owns the policy (`tierFor`, `surfaceAllowed`,
  `isPhone`/`isCoarsePointer`/`canEditHere`): **consume** (publish, present) works everywhere, **manage**
  (library, templates, shared, trash, settings, pricing) is responsive down to phone via the sidebar drawer,
  **manipulate** (the editor's canvas) runs on every tier — on phones the floating chrome (minimap ·
  palette · inspector) collapses into a bottom bar + `@ui` `Sheet`s over the full-bleed canvas, and the
  topbar folds its secondary controls into an overflow sheet. The tier decides layout, never access. Breakpoints mirror Tailwind's scale, so `md:` and `isPhone()` must
  agree. Use `h-dvh` never `h-screen`; `IconButton size="touch"` is the 44px hit target; content reflow
  belongs to the engine (`splitMinWidth` + `stacksAtWidth`), not to per-view CSS. Full rules:
  `.docs/frontend.md`.
- **Path aliases** (directory aliases): `@model`, `@themes`, `@engine`, `@elements`, `@canvas`, `@ui`,
  `@editor`, `@app`, `@services` (e.g. `@model/artifact`, `@ui/button`). Backend + frontend both import
  the shared wire shapes from `@model` + `@themes`. Cross-directory imports use aliases; same-directory
  siblings stay relative (`./sibling`), enforced by `import/no-relative-parent-imports`.
- **TS style:** 4-space indent, double quotes, semicolons, `printWidth` 100, **no `any`**, **no
  `console`** in app code. (ESLint + Prettier enforce these.)
- **Tailwind — canonical scale over arbitrary px.** The `--spacing` base is `0.25rem` (4px), so a spacing
  utility on the scale must use the canonical class, not a bracket value: `gap-0.75` not `gap-[3px]`,
  `size-4.5` not `size-[18px]`, `w-90` not `w-[360px]` (i.e. `Npx → N/4`). Reserve `[…]` for values genuinely
  off the scale (odd one-offs, computed/`calc`, non-length). Keeps Tailwind IntelliSense's
  `suggestCanonicalClasses` hint quiet — it's editor-advisory only (not ESLint/CI-enforced).
- **Comments — terse, and only when needed.** Names + types carry the meaning; a comment earns its place
  only by saying something the code cannot. When one is warranted, make it a short fragment for a genuine
  _why_: an invariant, a gotcha, a unit/range, a magic value's meaning, a "must stay in sync with X". Do
  **not** write file-header narrative essays, decorative section banners (`// ===== … =====`, `// --- … ---`,
  box-drawing rules), or comments that restate the code/name/type. Always keep runtime directive comments
  (`@vitest-environment`, `/* @refresh reload */`), `TODO`/`FIXME`, and license headers. No
  build-phase/iteration numbers in comments or docstrings (plan docs are fine).
- **No suppressions — fix the cause, never silence the check.** The repo carries **zero**
  `eslint-disable`, `@ts-ignore`, `@ts-expect-error`, `@ts-nocheck`, `prettier-ignore`, and coverage
  pragmas (`v8`/`c8`/`istanbul ignore`); `any` is banned. Do not add one to make a gate pass. Writing
  `eslint-disable` is not just discouraged, it is **inert**: `noInlineConfig` makes ESLint ignore the
  directive and then fail the run for it. There is always a suppression-free form, e.g. a Solid
  dependency read is `void props.value;` or `on(() => props.value, …)`, not a bare `props.value;`; an
  unused binding is `_name` (matches `varsIgnorePattern`); untyped data gets a narrowing helper
  (`@elements/coerce`, `readPublicContent`) or a real zod shape, not `as unknown as`; wide data tables
  get Prettier's own formatting, not `prettier-ignore`. If an escape hatch is genuinely correct, add the
  file to `ALLOW` in `scripts/check-suppressions.mjs` with a reason, so it lands in a reviewed diff.
  Enforced in-editor by ESLint (`noInlineConfig` + `ban-ts-comment` + `--max-warnings 0`) and backstopped
  by `pnpm check:suppressions`, which also reads files ESLint skips. Both pre-commit and CI run it.
- **Copy — plain, and never em-dashed.** What a person reads on screen is written the way you would
  say it: no em-dashes, no unearned promises ("it fills up fast" on an empty screen), no startup-speak
  ("spin up", "lands right here"), no hedged hype ("finished-feeling", "in seconds"). An em-dash
  joining two clauses is the clearest tell that a string was machine-written, so it is a hard failure:
  use a comma when the second clause qualifies the first, a period when it is a separate thought, a
  colon before a list, a middot when joining a label to a value (`Invited · expires in 2 days`). Watch
  for the rhythm too: thirty catalogue blurbs sharing one shape read as generated even when each line
  is fine on its own, so vary the construction. A string that is only an em-dash is a typographic
  glyph, not prose, and passes. Comments are exempt and use em-dashes freely. Enforced by
  `pnpm check:copy` over `app`/`website`/`ui`/`editor`/`publish` plus `model/billing.ts`,
  `model/templates.ts`, and `services/core/mail.ts`; a genuine exception goes in that script's `ALLOW`
  with a reason. Both pre-commit and CI run it.
- **Request bodies are untrusted — state the shape, never cast.** A route reads its body with
  `await readJson(c, zThing)`, which returns `null` when the body does not match so the route can
  answer 400; the schema lives next to the route in the `services/api/` file that owns it. The old
  `readJson<T>(c)` handed back a fully-typed object that had never been checked, which is how an
  `insert` op with no `index` reached `splice` as `NaN` and silently prepended a section. **A schema
  that carries stored content must not rebuild it:** a plain `z.object` strips unknown keys, so on a
  write path use `z.looseObject`, or `z.custom<T>(guard)` when a guard already exists
  (`isArtifactContent`, `isSectionOp` in `services/core/artifacts.ts`) — otherwise fields this layer
  does not enumerate (`Section.frame`) are dropped on the way to the row. Enforced by
  `pnpm check:validation`, which also fails a `c.req.json()` that routes around the helper.
- **Boundaries** (ESLint, linear `model ← canvas ← ui ← editor ← app`): model ⇏ canvas/ui/editor/services/app;
  canvas ⇏ ui/editor/services/app; **ui ⇏ editor/services/app** (shared UI depends only on model + canvas +
  `@themes`); editor ⇏ services/app; app ⇏ services (it talks over HTTP); services ⇏ canvas/ui/editor/app.
  Enforced twice, since the resolved form (`import/no-restricted-paths`) checks nothing when a specifier
  fails to resolve: `no-restricted-imports`/`no-restricted-syntax` re-state each zone against the raw
  specifier, covering static, type-only, and dynamic `import()`.
- **Services layer law** (ESLint, the same shape one level down): `api → core → db → utils`.
  **`core/` may not import hono** — a core file reaching for it is a route in disguise — and
  **`utils/` may not import `db/`**, which is what keeps it unit-testable. Shared code moves _down_,
  never up: that is why the entitlement resolver (`featuresFor`/`creditLimitFor`) sits in `@model/billing`
  rather than in services, and why `db/client.ts` builds an inert handle instead of throwing at import,
  so a unit test can import a core module with no database. Entry points compose across layers and are
  exempt: exactly two, `services/server.ts` and `services/db/seed.ts`, both named in `package.json`.
  `pnpm check:boundaries` plants a `core → api`, a `core → hono`, and a `utils → db` import, and
  fails if any rule stays quiet.
- **Backend output** goes through `services/utils/env.ts` (`out`/`warn`), never `console` or a bare
  `process.stdout.write`.

## Commands

```
pnpm dev            # Vite dev server (HMR) → http://localhost:8600
pnpm build          # production build → dist/
pnpm typecheck      pnpm lint      pnpm format
pnpm test           pnpm test:int  # unit; integration (needs Postgres: docker compose up -d)
pnpm db:generate    pnpm db:migrate
pnpm stripe:setup   # create/refresh the Stripe products + prices from model/billing.ts (--dry-run)

# guards — these also run in pre-commit + CI; a rule that can only report violations
# cannot tell you it has stopped working, so each one is self-verifying
pnpm check:suppressions   # no eslint-disable / @ts-* / prettier-ignore / coverage pragmas
pnpm check:program        # every tracked .ts(x) is actually in the tsc program
pnpm check:boundaries     # the layering law still reports, not just "no errors"
pnpm check:models         # every model id is one the installed @ai-sdk provider still declares
pnpm check:copy           # no em-dashes in user-facing copy or in the prompts (the machine-written tell)
pnpm check:elements       # every registered element is reachable and renders
pnpm check:modules        # the model/ map in this file still matches the directory
pnpm check:validation     # every request body is read through a schema, never cast
```

Galleo owns the **86xx** host-port block (runs alongside the sibling apps). See the ports table in
`.docs/architecture.md`.

## Current state

The layout engine (`canvas/engine/layout.ts`, Clay-style 3-pass solver) drives a **SolidJS** studio:
`editor/Editor.tsx` shell = `Topbar` · `Minimap` (live `Thumb`s) · `Canvas` (continuous section stack) ·
`Panel` (element palette), with selection + inspectors + drag-drop (`panels/` components over `core/`
state) and inline text editing (`panels/TextEditor.tsx`). State in `core/store.ts` (Solid store); painting
is the `@canvas` layer — the engine's commands paint into refs (`@canvas/render/backends`, with a
2D-canvas mirror for Present + PDF/PNG export). Sections compose via `@elements/compose`; every element
has a structural ghost (`skeletonize` in `@elements/spec`). **58 palette elements** register via
`canvas/elements/register.ts`'s side-effect imports (5 text · 7 media · 2 table · 7 composite · 7 basic ·
13 chart types · 17 diagram types), plus palette-hidden internals (`group`, `avatar`, the
`chart`/`diagram` storage elements, the drop-preview); format-as-view
(`@engine/profile` + `fragment`) is built, so one artifact renders as deck / doc / web.

The product SPA (`app/`, served at `/app`) wraps the studio: library / templates / trash / shared /
editor views, a backend (`services/` Hono + Postgres/Drizzle; artifact content lives in the
`draft_content` jsonb, with a write-time `digest` + `search_text` feeding a generated `search_tsv` that
⌘K and the library search field query over — see `.docs/search.md`), a singular theme editor
(`app/views/ThemeEditor.tsx`), and a **real** streamed
AI pipeline — generation, chat, section/element/text edits over the `@model/ai` turn protocol (SSE),
served by `services/core/ai` (see `.docs/ai.md`). Whole-artifact generation runs through the staged
**generation studio** (`app/views/generate/` over `app/stores/generate.ts`): one full-screen surface
whose first body is a centred prompt with attachable context (pasted text + text files), then an
outline the canvas renders as editable section cards, then a per-beat build (write all, or one at a
time, with steer / pause / versions). One turn per step. There are no run-mode settings:
editing the outline covers shaping the arc, and the two ways to build are both one click at the
board. The chat rail runs the same agent on a `generate` surface that sees the outline and revises it.

## Commits

Single-line, imperative; ticket prefix if the branch has one; **no co-author trailer**.

**Never commit or push without being asked** — each commit/push needs its own explicit request;
one approval does not carry over. Pushes to `main` auto-deploy production (Render).
