# testing.md — how Galleo is tested, today

Factual map of Galleo's test system as it stands. Sibling of `.docs/architecture.md` (where things live),
`.docs/rendering.md` (the render core), `.docs/ai.md` (the AI pipeline), and `.docs/frontend.md` (the Solid
shells). One rule governs the whole suite: **fake only true external oracles, run everything else for real**
(§2). The canvas near-full-coverage push and the codebase-wide inventory that seeded this suite are folded
in below; the still-unbuilt tracks are in §8.

## 1. Overview — three surfaces

| Surface           | Runner                               | Glob            | Env                                  | Deps                         | State                        |
| ----------------- | ------------------------------------ | --------------- | ------------------------------------ | ---------------------------- | ---------------------------- |
| **`unit`**        | `vitest.config.ts`                   | `**/*.test.ts`  | `node` (+ per-file happy-dom opt-in) | none (pure + injected seams) | **813 tests / 74 files**     |
| **`integration`** | `vitest.integration.config.ts`       | `**/*.itest.ts` | `node`, `fileParallelism:false`      | real `galleo_test` Postgres  | **6 files** (route policies) |
| **`component`**   | _not built_ — a Solid-render project | `**/*.test.tsx` | happy-dom + `vite-plugin-solid`      | `@solidjs/testing-library`   | **0 tests** (§8b)            |

The `unit` suite is one vitest run in `node`; DOM-touching files opt in per file with a
`// @vitest-environment happy-dom` docblock. Coverage instrumentation targets **`canvas/**`+`model/**`**
only (`coverage.include`) — the layout engine ~**98%**, elements ~**89%**, charts/diagrams ~**90%+**, render
bridge logic covered (raster/IO tail honestly bounded, §7), model pure helpers high; realistic near-full
ceiling ~**87%** (the IO shells are excluded, not faked). The `model`/`services`/`editor`/`app`/`ui` suites
beyond `canvas`+`model` are correctness tests, not yet under a per-directory coverage gate. `integration` is
a separate config (no shared `projects` file yet) exercising Hono routes against a throwaway Postgres.
`component` is planned only — **no `.test.tsx` exists**.

---

## 2. The mocking contract (the single canonical statement — read this first)

"Near-full coverage" is worthless if it's reached by stubbing out the logic under test. The rule for this
suite: **fake exactly two things, because they are the only true external oracles. Everything above them
runs for real.**

**Legitimately substituted (a real seam, not the logic under test):**

1. **Glyph metrics** — the width a font assigns a string. The engine already takes this as an injected
   `measure`/`DrawContext.measureText`; substitute a deterministic per-character width (`text.length * K`).
   The wrap/measure/layout **algorithm runs for real** — only the glyph-width lookup is replaced. This is
   the difference between "test the wrap logic" and "mock the wrapper".
2. **Raster & network IO** — `new Image()` decode, `canvas.toBlob`, `URL.createObjectURL`, `document.fonts`.
   Stub to resolve synchronously / no-op. There is no logic in "the browser decoded a PNG"; asserting it is
   asserting the platform.

**Never faked (doing so would make the test a tautology):**

- **The solver** (`layout`, `distribute`, `fragment`, clip/float math) — real, always.
- **The element registry** — register the **real** specs (via `@elements/register`); never a fake
  `getElement`. A compose test that fakes specs tests nothing.
- **Theme tokens** — the real `DEFAULT_THEME.tokens` from `@themes`. Its `mix`/`luminance`/`hexA` helpers
  are pure and deterministic; use them, don't stub them.
- **d3-scale / d3-shape / d3-hierarchy** — real. Chart/diagram geometry _is_ these; fixture the data, run
  the lib.
- **The DOM** — real, via happy-dom. Assert real element structure and computed inline styles, not a spy.
- **pdf-lib** — real, when we exercise export geometry.

**Banned assertion patterns:**

- `expect(spy).toHaveBeenCalled()` as the payload → assert the produced **geometry / DOM / string** instead.
- Faking a spec / `getElement` / `childrenOf` → register the real element and run the real op.
- Whole-array or whole-DOM snapshots → assert the **specific invariant**; snapshots only for small, stable
  pure strings (`backdropCss`, `runFont`, `scaledHostCss`, `fmt`) where the snapshot _is_ the spec.
- Stubbing a private helper of the function under test.

If a test needs more than the two seams above to run, that's a signal the code has a hidden coupling worth
fixing — not a signal to add a mock.

This is the **single** statement of the contract. The layers below extend it (a real DB / real Router /
real theme provider is not a mock either); they add seams, never restatements.

---

## 3. The seam budget

Per-layer expansion of §2 — the only things any layer is ever allowed to fake, so the cheapest,
highest-confidence coverage floats to the top.

| Layer                          | Legit seams (the only fakes)                                        | Everything else runs real                     |
| ------------------------------ | ------------------------------------------------------------------- | --------------------------------------------- |
| `model/`                       | **one** — the module-level custom-theme registry (`registerThemes`) | all color/text/pricing/protocol math          |
| `canvas/`                      | **glyph metrics** (`measure`) + **raster/IO** (`installCanvas2D`)   | solver, registry, `@themes`, d3, DOM, pdf-lib |
| `services/` (logic)            | none — prompts/schema/quality/pure helpers                          | real registries, real `@themes`, real `zod`   |
| `services/` (routes)           | **DB** (throwaway Postgres) + **auth** cookie                       | validation, gating, shaping, real SQL         |
| `services/` (AI runtime)       | **LLM** (fake the `ai` SDK) + clock/env/network                     | the reducers, repair loop, id/query logic     |
| `editor/` (logic)              | none — drop-target math, data round-trips                           | real `@elements` ops, real `applyPatch`       |
| `editor/` (store + AI)         | **clock** (coalesce) + **injected transports**                      | history, selection, commit reducers           |
| `app/`                         | **fetch** · **localStorage** · **clock**                            | URL/body building, response mapping, derivers |
| `ui`/`editor`/`app` components | **Solid render** (component project, §8b)                           | prop→class, keyboard, open/close logic        |

Zero clock/random/crypto hides anywhere in `model/`. The backend's `Date.now`/`crypto.randomUUID` are all in
named spots (credit rollover, lockout, slug/id gen) — each a clean clock/random seam.

> The same contract extends **verbatim** to the two higher levels: at the component-render level fake only
> network/nav/time (a real Router/theme provider is not a mock); at the DB-integration level fake only
> LLM/Stripe/mail/clock (the real Postgres, real SQL, real auth cookie are not mocks).

---

## 4. Test-doubles catalog (the only doubles that exist)

The canvas doubles all live in the shared `canvas/testkit.ts`. Everything else a test touches is the real
thing.

- **`measure: MeasureText`** — `text.length * 8` per unwrapped line, 16px line height, wraps at `maxWidth`.
  The one substitute for font metrics. Injected into `layout`, `layoutSection`, `layoutSlide`,
  `prepareSlideNode`, `layoutNode`.
- **`textMetricsCtx()`** — a minimal object exposing a `font` setter + `measureText(s) => { width: s.length*8 }`,
  satisfying `layoutRuns`, `wrapLines`, `measureUncached`, `cartesianFrame`, `boxWidth`, `legendRow`. Drives
  the **real** wrap algorithm without a canvas.
- **`recordingDrawContext()`** — a real `DrawContext` (matching `@engine/node`) that pushes every
  `rect/line/circle/polyline/wedge/path/text` into a `calls[]` array and answers `measureText` from the
  deterministic width. Charts/diagrams/shapes compute **real** geometry (real d3); we assert the call stream.
- **`tokens`** — re-export of the real `DEFAULT_THEME.tokens`. Plus a couple of variants (a dark-bg section,
  a custom-radius theme) built from the real theme, not hand-rolled.
- **Builders** — `sectionOf`, `artifactOf`, `textInst`, `imageInst`, `groupRow`/`groupCol` (thin wrappers
  over the real `@model/section` builders).
- **Finders** — `regionById`, `commandsFor(id)`, `bottomOf`, `find(pred)`.
- **`installCanvas2D()`** (happy-dom only) — patches `HTMLCanvasElement.getContext("2d")` to return a
  deterministic 2D context (measureText → length × 8, every other call a no-op), so `measureText`,
  `sectionSlides`, `paintSectionStack`, and the raster smoke tests run under happy-dom without a native
  canvas. This is the raster seam, called in a `beforeAll` of each `*.dom.test.ts`.

**Integration harness** (`services/__tests__/harness.ts`) — `app` (a Hono app mounting the real per-resource
routers), `request(path, init)` / `authed(userId, path, init)` (attaches a real `makeSession` cookie) /
`jsonInit(method, body)` request helpers, `seedUser({plan})` (inserts a real user + workspace + owner
member, returns ids + cookie), and `resetDb()` — `TRUNCATE … RESTART IDENTITY CASCADE` over every public
table, run in `beforeEach` (`setup.ts`) for per-test isolation.

---

## 5. Toolchain & conventions

- **Location.** Each folder's tests live in its own `__tests__/` subdirectory (`canvas/engine/__tests__/layout.test.ts`
  tests `canvas/engine/layout.ts`). Vitest's `**/*.test.ts` include finds them anywhere; imports use path
  aliases so a test's depth doesn't matter. Shared helpers are `canvas/testkit.ts` / `*.testkit.ts` (not
  matched by the include, excluded from coverage).
- **Environment.** `node` default; DOM files add `// @vitest-environment happy-dom` at the top.
- **Imports.** Explicit `import { describe, it, expect } from "vitest"` (no globals → no tsconfig change).
- **Strictness.** Tests are linted + typechecked like source (`no-explicit-any`, `noUncheckedIndexedAccess`,
  prettier). A feature: they exercise the real types.
- **Boundaries.** A `canvas/**` test may import `model` + `canvas` only — not `editor`/`ui`/`app` (eslint
  `no-restricted-paths`). This is why the element library has a canvas-side registration entry
  (`canvas/elements/register.ts`, imported in-boundary as `@elements/register`).
- **Scripts.** `pnpm test` (`vitest run`) · `test:watch` · `test:coverage`. Runs in **CI** and the
  **pre-commit hook**; `coverage/` is git-ignored.

**Integration config** (`vitest.integration.config.ts`) — same aliases, `node` env, `include:
["**/*.itest.ts"]`. It injects `env.DATABASE_URL` (`…/galleo_test`) + `env.SESSION_SECRET` and sets
`fileParallelism:false` (one shared DB — files serialize so truncation can't race). `globalSetup`
(`services/__tests__/global-setup.ts`) creates `galleo_test` if absent and `drizzle-kit push`es the schema;
`setupFiles` (`setup.ts`) truncates in `beforeEach`. AI/Stripe/mail keys are left unset so
`aiReady()`/`stripeReady()`/`mailReady()` resolve false (the "not configured" branches are real behavior).

**Invoking integration tests** — there is **no `test:int` npm script yet**; run the config directly:

```
vitest run -c vitest.integration.config.ts        # needs Docker Postgres on :8602 (docker-compose.yml)
```

---

## 6. Coverage map

One row per area: what runs, against which real deps (proof it isn't over-mocked), the allowed seam, and
status. `canvas/**` + `model/**` are the coverage-instrumented core; the rest are correctness suites.

| Area                         | Test file(s)                                                                                                         | Real deps (run for real)                             | Allowed seam                              | Status   |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | ----------------------------------------- | -------- |
| model pure contract          | `model/__tests__/{theme,text,ai,credits,features,billing,tools,target,authoring,geometry,section}`                   | color/text/pricing/protocol math, real `@themes`     | — (theme: `registerThemes`)               | DONE     |
| engine solver                | `canvas/engine/__tests__/{layout,fragment,profile}`                                                                  | Clay 3-pass solver, pagination, profile math         | `measure`                                 | DONE     |
| elements ops + compose       | `canvas/elements/__tests__/{ops,compose,layouts,skeletons,spec,blueprint}`                                           | real registry, `DEFAULT_THEME.tokens`, profiles      | `measure`                                 | DONE     |
| element specs (per category) | `canvas/elements/{text,media,basic,table,composite}/__tests__/*`                                                     | real registry (self + children), `tokens`            | `recordingDrawContext`                    | DONE     |
| charts                       | `canvas/elements/chart/__tests__/chart`                                                                              | d3-scale / d3-shape, registry                        | `recordingDrawContext`                    | DONE     |
| diagrams                     | `canvas/elements/diagram/__tests__/diagram`                                                                          | d3-hierarchy, registry                               | `recordingDrawContext`                    | DONE     |
| render bridge (pure+measure) | `canvas/render/__tests__/{commands,commands.dom}`                                                                    | compose + registry + solver                          | `measure` / `textMetricsCtx`              | DONE     |
| render backends (DOM+raster) | `canvas/render/__tests__/{backends,backends.dom}`                                                                    | real `document` (happy-dom), real inline styles      | `installCanvas2D`, image IO               | DONE     |
| present slides               | `canvas/render/__tests__/present.dom`                                                                                | happy-dom slide build                                | `installCanvas2D`                         | DONE     |
| export geometry              | `canvas/render/__tests__/export`                                                                                     | pure page/raster arithmetic (pdf-lib real)           | —                                         | DONE     |
| pptx sections                | `canvas/render/__tests__/pptx`                                                                                       | pure slide/section mapping                           | —                                         | DONE     |
| editor dnd + inspect         | `editor/canvas/__tests__/dnd`, `editor/inspect/__tests__/data-model`                                                 | `@elements` ops, real `ArtifactContent`              | —                                         | DONE     |
| editor store + commands      | `editor/__tests__/{editor,commands,keymap,clipboard}`                                                                | history/selection/commit reducers, `applyPatch`      | clock (coalesce), injected transports     | DONE     |
| editor AI flows              | `editor/ai/__tests__/{element-gen,suggest}`                                                                          | ops, `applyPatch`, ranking                           | injected transport                        | DONE     |
| app HTTP client              | `app/__tests__/api`                                                                                                  | URL/body build, response mapping, SSE parse          | `fetch`                                   | DONE     |
| app route + stores           | `app/__tests__/route-context`, `app/stores/__tests__/library`                                                        | route derivers, title/format/time formatters         | clock                                     | DONE     |
| services auth                | `services/__tests__/auth`                                                                                            | scrypt crypto round-trip, HMAC session sign/verify   | env (`SESSION_SECRET`)                    | DONE     |
| services AI prompts          | `services/ai/prompts/__tests__/*` (14 files)                                                                         | pure string assembly, real `ELEMENTS` catalog        | —                                         | DONE     |
| services AI schema + quality | `services/ai/__tests__/{schema,quality}`                                                                             | real `zod`, deterministic gate                       | —                                         | DONE     |
| services AI tools            | `services/ai/tools/__tests__/{structure,manage,library,registry}`                                                    | deterministic patch producers                        | —                                         | DONE     |
| services media/mail/billing  | `services/media/__tests__/{generate,providers}`, `services/mail/__tests__/send`, `services/billing/__tests__/stripe` | pure dims/dispatch/escape/price mapping              | env (price ids, stock keys)               | DONE     |
| ui primitives (pure)         | `ui/__tests__/{focus,fuzzy,keys,palette}`                                                                            | focus-trap, fuzzy match, keymap, palette-model       | —                                         | DONE     |
| route policies (integration) | `services/api/__tests__/{session,artifacts,links,ai,context,folders}.itest.ts`                                       | real Postgres, real SQL, auth cookie, gating/shaping | DB (`galleo_test`), LLM/Stripe/mail/clock | DONE (6) |

**Honestly excluded (named here and in `vitest.config.ts` `coverage.exclude`):**

- **`canvas/render/export.ts`** — IO shell (pdf-lib · `canvas.toBlob` · `window.print`). Pure page/raster
  geometry was extracted and is tested in `export.test.ts`; the shell is excluded, not stubbed.
- **`canvas/render/pptx.ts`** — IO shell (pptxgenjs · jszip · fetch). Pure slide/section mapping is tested in
  `pptx.test.ts`; the shell is excluded.
- **`canvas/engine/node.ts`** and other pure type files — no runtime; inert in coverage, nothing to test.
- **Raster path** (`renderToCanvas`/`drawCommands`/`drawImageFit`/`roundRectPath`) — **smoke-only**: assert
  no-throw and that the expected draw-call kinds fire, never pixels. Images stubbed (the IO seam).

_(The former `canvas/render/geometry.ts` and `export-geometry.ts` are gone — their arithmetic folded into
the modules tested by `export.test.ts`.)_

---

## 7. What can't (and shouldn't) hit 100% — and how we stay honest

Chasing 100% on these produces fake tests. We handle them explicitly instead of letting them silently drag
the number:

- **Pure type files** (`engine/node.ts`): no runtime. Inert in coverage; nothing to write.
- **IO shells** — `download()`, `window.print()`, `canvas.toBlob`, `URL.createObjectURL`, `Image` decode,
  `document.fonts` listener. The move — **done for `export.ts`** — is to extract the pure geometry out (into
  `export-geometry.ts`, tested) and leave only the shell, which is added to `coverage.exclude` with a
  one-line comment naming why. We do **not** "cover" a shell by asserting a stub was called.
- **Per-type chart/diagram renderers**: covered at the "draws the right call kinds / doesn't crash on empty"
  level, not pixel-exact. Exact geometry is d3's job (its own tests), not ours.

Any place the suite bounds coverage (excluded shell, smoke-only raster) is named here and in the config, so
a green run never reads as "everything is verified" when it isn't.

---

## 8. Planned / deferred

The pure + one-seam + DB-integration surfaces are covered. What remains needs either the LLM seam wired into
the AI reducers, or a new Solid-render project — neither is started.

### (a) LLM-seam reducer tests — not started

There's no DI hook for the model call; the seam is the module boundary. Faking
`generateObject`/`generateText`/`streamText`/`ToolLoopAgent` via `vi.mock("ai", …)` lets the **real
reducers** run (this pattern runs on the existing `unit` setup — no new infra):

- **`services/ai/run.ts` `writeSectionFrom`** — the auto-repair loop (bad-JSON → retry, `checkSection` trips
  → retry, throw after 2 fails). Composes real `extractJson` + `zSection` + `checkSection`.
- **`services/ai/run.ts` `runGenerate`** — assert the exact `TurnEvent` sequence (intake → outline → plan →
  build → per-beat status/patch → cover injects a background → done). Also `reviseElement`/`chatEditSection`.
- **`services/ai/chat.ts` `runChat`** — toolset assembly. The one place to prove "fake stream → correct
  ops/state." (Prompt builders, schema, quality, and the tool patch-producers underneath are already DONE,
  §6.)

### (b) Solid component project (Track A) — not started

`vitest.config.ts` `include` is `**/*.test.ts`, which excludes `.test.tsx`; the `unit` project runs in node
where `solid-js` resolves to its **server** build, so `.tsx`/JSX doesn't transform and any module that
top-level-imports `@solidjs/router` throws _"Client-only API called on the server side."_ That is why `ui/`,
`app/` views, and several store helpers can't be rendered yet.

**Setup (one-time):**

1. Add dev dep **`@solidjs/testing-library`** (`vite-plugin-solid`, `happy-dom` already present).
2. Restructure into vitest `projects` (or a second config): a `component` project with `plugins: [solid()]`,
   `environment: "happy-dom"`, `include: ["**/*.test.tsx"]`, and a `setupFiles` calling `cleanup()` in
   `afterEach`. `solid-js` then resolves to the **client** build and `render()` mounts into a real DOM.
3. A `renderWithRouter(ui)` helper (memory `<Router>` for components using `useLocation`/`useNavigate`) and
   `renderWithTheme` where a theme context is needed — real providers, not mocks.
4. Scripts: `test:unit` / `test:component` for focused runs.

**Contract at this level (extends §2):** render the real component with real props/stores/context; fake only
network (`fetch`/the `api` module), navigation side-effects, and time. Assert user-visible behavior —
rendered text/DOM, the specific class a variant produces, and the _result_ of an interaction
(`fireEvent.click`/`keyDown` → callback fired, class toggled, store value changed). Never assert internal
signals; never snapshot a whole subtree.

**What to test (prioritized):**

1. **Gated pure helpers** (quick wins — stop crashing on import under the client build; some need a one-line
   `export`): `ui/color` `isHex`/`textColorSwatches`, `ui/z` ordering, `publish` `viewLabel`, `app/theme`
   `toTheme`, `app/stores/folders` `hexToHsl`, `GenerateModal` `stepIndex`, `ShareModal` `isEmail`,
   `ThemeEditor` `shadowCss`↔`inferShadow` round-trip.
2. **`editor/` components** (interaction-dense): `Canvas` keyboard map (Delete/⌘D/⌘Z/arrows) + the Esc-walk
   (`parentTarget` chain) + sticky drop-target + `hitTest`; `format-bar` placement/`canAlign` slack math;
   `Panel` `elementInline`; `insert` `itemsFor` per target kind; the selection `Overlay`.
3. **`app/` views**: `PricingView` label/price/`pick`/`ctaLabel` branching; `GenerateModal` `stepIndex` + the
   `dispatch` reducer (sections placed in fixture order); `ShareModal`; `LibraryView`/`TemplatesView`/
   `TrashView` selection + filtering; **`publish/PublicView`** `load()` gate machine (fake
   `api.getPublicContent` per variant → assert `ok`/`password`/`notfound`/`error`).
4. **`ui/` primitives — after the in-flight refactor settles**: `Button`/`IconButton`/`Chip`/`Badge`
   variant→class maps; `Dropdown` open/close + keyboard nav; `Modal` Escape + focus + reduced-motion;
   `Popover` flip/viewport-clamp + Esc dismiss; inputs onChange contract; `Meter` clamp; `Segmented`; `Menu`.

**Conventions:** `*.test.tsx` co-located in `__tests__/`; `render`/`fireEvent`/`screen`/`cleanup`; the
`renderWithRouter` helper for router-context components. Hold `ui/` primitive tests until its refactor lands;
do the gated helpers + editor/app/publish first.

### (c) Residual pure helpers still untested

Cheap, node-testable now (no project needed), not yet covered: `ui/color` (`isHex`/`textColorSwatches`/
`highlightSwatches`), `ui/z` (`Z` ordering), `ui/section` (`backdropHostStyle`), `ui/icons` (`ICON_NAMES`
drift), and `publish/PublicView` `viewLabel`. Fold these in alongside (b)'s gated-helper batch.
