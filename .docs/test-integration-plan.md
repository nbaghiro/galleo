# test-integration-plan.md — the component + backend-integration test tracks

The pure/one-seam surface is covered (724 tests; see `.docs/testing.md` for canvas, `.docs/test-map.md` for
the rest). What's left needs two pieces of shared infra. This plans both, with the same discipline —
**fake only true external oracles, run everything else for real** — extended from unit tests to
component-render and DB-integration levels.

Both are **new Vitest _projects_**. Vitest lets one config declare several projects, each with its own
environment/plugins/globs. Today there's one implicit project (node, no plugins, `*.test.ts`). We add two
more so the fast pure suite stays untouched:

| Project                     | Env       | Plugins             | Glob            | Purpose                                                               |
| --------------------------- | --------- | ------------------- | --------------- | --------------------------------------------------------------------- |
| `unit` (today)              | node      | none                | `**/*.test.ts`  | pure + one-seam logic (+ DOM-backend via per-file happy-dom docblock) |
| `component` (new)           | happy-dom | `vite-plugin-solid` | `**/*.test.tsx` | render Solid components, assert DOM + interactions                    |
| `integration` (new, opt-in) | node      | none                | `**/*.itest.ts` | Hono routes against a real throwaway Postgres                         |

> **Coordination gate:** restructuring `vitest.config.ts` into `projects` is a single shared-config change,
> and the parallel session is currently editing that file (pptx work). Do the restructure in one commit
> **once they're out of it** — not piecemeal.

---

## Track A — Frontend component/integration (the "Solid component project")

### Why it's needed

The `unit` project runs in node with `solid-js` resolving to its **server** build, so (a) `.tsx`/JSX
doesn't transform and (b) any module that top-level-imports `@solidjs/router` throws _"Client-only API
called on the server side."_ That's why the `ui/`, `app/` view, and several `app` store helpers are
currently untestable. `vite-plugin-solid` (already a dep) + `happy-dom` + `@solidjs/testing-library` fixes
both: JSX compiles, `solid-js` resolves to the **client** build, and `render()` mounts a component into a
real DOM.

### Setup (one-time)

1. Add dep: **`@solidjs/testing-library`** (dev). (`vite-plugin-solid`, `happy-dom` already present.)
2. `vitest.config.ts` → `test.projects`: the `component` project uses `plugins: [solid()]`,
   `environment: "happy-dom"`, `include: ["**/*.test.tsx"]`, and a `setupFiles` that calls
   `@solidjs/testing-library`'s `cleanup()` in `afterEach` (auto-unmount).
3. A tiny `ui/test/render.tsx` helper (or `app/test/`): `renderWithRouter(ui)` wrapping in a memory
   `<Router>` for components that call `useLocation`/`useNavigate`, and a `renderWithTheme` if a theme
   context is needed. (Real providers — not mocks.)
4. Scripts: `pnpm test` runs all projects; add `test:unit` / `test:component` for focused runs.

### Philosophy (the mocking contract, extended to components)

- **Render the real component** with real props/stores via `render()`. Provide real **context** (Router,
  theme) where the component needs it — a real provider is not a mock.
- **Fake only**: the network (`fetch`/the `api` module), navigation side-effects, and time. Nothing else.
- **Assert user-visible behavior**: rendered text/DOM, the specific class a variant produces, and the
  _result_ of an interaction (`fireEvent.click`/`keyDown` → a callback fired, a class toggled, a store
  value changed). Never assert internal signals or implementation; never snapshot a whole subtree.
- `cleanup()` between tests; one concern per `it`.

### What to test (prioritized)

1. **Gated pure helpers** (quick wins — they stop crashing on import under the client build; some are
   currently private and need a one-line `export`): `ui/color` `isHex`/`textColorSwatches`, `ui/z` ordering
   (already node-testable), `publish` `viewLabel`, `app/theme` `toTheme`, `app/stores/folders` `hexToHsl`,
   `GenerateModal` `stepIndex`, `ShareModal` `isEmail`, `ThemeEditor` `shadowCss`↔`inferShadow` round-trip.
2. **`editor/` components** (interaction-dense, high value): `Canvas` keyboard map (Delete/⌘D/⌘Z/arrows) +
   the Esc-walk (`parentTarget` chain) + sticky drop-target + `hitTest`; `format-bar` placement/`canAlign`
   slack math; `Panel` `elementInline`; `insert` `itemsFor` menu per target kind; the selection `Overlay`.
3. **`app/` views**: `PricingView` label/price/`pick`/`ctaLabel` branching (fake `billing` signal);
   `GenerateModal` `stepIndex` + the `dispatch` reducer driving the gen store (assert sections placed in
   fixture order); `ShareModal` (`isEmail`, clipboard); `LibraryView`/`TemplatesView`/`TrashView` selection
    - filtering; **`publish/PublicView`** `load()` gate machine (render with a fake `api.getPublicContent`
      returning each result variant → assert the rendered `ok`/`password`/`notfound`/`error` state).
4. **`ui/` primitives** — **after the in-flight refactor settles**: `Button`/`IconButton`/`Chip`/`Badge`
   variant→class maps; `Dropdown` open/close + keyboard nav (Arrow/Enter); `Modal` Escape + focus +
   reduced-motion; `Popover` flip/viewport-clamp + backdrop/Esc dismiss; `inputs` onChange contract;
   `Meter` clamp; `Segmented`; `Menu`.

### Conventions

`*.test.tsx` co-located in `__tests__/`; happy-dom; `render`/`fireEvent`/`screen`/`cleanup`; the
`renderWithRouter` helper for router-context components; fake `api` by stubbing the app's `api` module (its
methods are the network seam). Caveat: hold `ui/` primitive tests until its refactor lands; do the gated
helpers + editor/app/publish first.

---

## Track B — Backend integration (the "DB harness")

### Why a real DB

`schema.ts` uses `uuid().defaultRandom()`, `jsonb`, `bigint`, and partial-unique constraints — pg-mem's
support is spotty, so tests run against a **real throwaway Postgres**. The repo already has one
(`docker-compose.yml` → `galleo-pg` on `:8602`, user/pass/db `galleo`), and `drizzle-kit push` migrates a
schema. The point is to exercise **auth + validation + gating + real SQL + response shaping** end-to-end,
faking only the genuinely external services.

### Setup (one-time)

1. A dedicated **test database** so dev data isn't clobbered: `galleo_test` on the same container.
   `DATABASE_URL=postgres://galleo:galleo@localhost:8602/galleo_test`.
2. A Vitest **`integration` project** (node env), `include: ["**/*.itest.ts"]`, with:
    - `globalSetup`: ensure Postgres is up (reuse the `ensure-db.sh` pattern) → `drizzle-kit push` the schema
      to `galleo_test`.
    - `setupFiles`: **per-test isolation** — `TRUNCATE … RESTART IDENTITY CASCADE` on all tables in
      `beforeEach`, then seed the minimal fixture the file needs (a leaner builder than `seed.ts`, or reuse
      `seed.ts` per-file). (Transaction-rollback-per-test is cleaner but the app's module-level `db` handle
      makes sharing a transaction awkward — truncate is the pragmatic choice.)
    - Env: `DATABASE_URL` (test DB) + `SESSION_SECRET`; leave `ANTHROPIC/STRIPE/RESEND` keys unset so
      `aiReady()`/`stripeReady()`/`mailReady()` are false (the "not configured" branches are real behavior).
3. Helpers: `request(path, init)` → `app.request(...)` (Hono needs no network listener); `authed(userId,
path, init)` attaches `Cookie: galleo_session=${makeSession(userId)}`; `seedUser({plan})` → a
   workspace + session-ready user.
4. **Seams to fake** (the only non-real parts): the **LLM** (`vi.mock("ai")` or a fake `resolveModel`) for
   AI-route happy paths; **Stripe** (`vi.mock` the `stripe()` client) for billing/webhooks; **mail**
   (already no-ops when unconfigured); the **clock** (fake timers or seeded timestamps for credit rollover /
   lockout).

### Philosophy (the contract, extended to backend integration)

- **Real DB, real SQL, real auth cookie, real validation/gating/shaping.** Fake only LLM / Stripe / mail /
  clock — the true external services.
- **Assert the full contract**: HTTP status + response-body shape **and** the DB side-effect (query the DB
  after the request to confirm the write/soft-delete/version row).
- Reset DB state between tests (truncate). One route-scenario per `it`.
- **Opt-in**: needs Docker, so it's `pnpm test:int` and its own CI job — never in the fast unit run.

### What to test (route policies)

- **`api/session`**: login (email normalize + password verify + cookie set), logout clears, `me`.
- **`api/artifacts`**: the plan **artifact cap** (402 `upgrade` when at limit), `updatedAt` bumped only on a
  real content edit (not a folder-only move), the list DTO (`coverOf`/`sectionsSummary`), trash/restore.
- **`api/links`** (the marquee): **publish** — feature gate (402), **version-reuse vs snapshot** on content
  change, recipient fan-out; the unauthenticated **`GET /p/:slug/content`** access policy — 404-never-reveal
  (missing/trashed/downgraded owner), `branded = !removeBranding`, protected 401/429 lockout, private `?k`
  token.
- **`api/ai`**: the **credit gate** (402 with `remaining`), per-kind validation (400), `501`/`503` — all
  assertable _before_ the model call (LLM seam only for the SSE happy path).
- **`api/context` `currentWorkspace`**: the lazy monthly **credit-window rollover** (clock seam — set
  `creditsResetAt` in the past → assert reset).
- **`api/folders`**: the delete-**cascade** over the subfolder tree.
- **`api/themes` / `api/media` / `api/billing`** (Stripe faked): the feature gating + DTO shaping +
  webhook state machine.

### CI

Add a Postgres **service** to a dedicated CI job (or a matrix leg) that runs `pnpm test:int`; keep `unit`

- `component` running on every push (no Docker needed — happy-dom is in-process).

---

## Rollout order + prerequisites

1. **Wait** for the parallel session to leave `vitest.config.ts`, then restructure it into the three
   `projects` in one commit (+ add `@solidjs/testing-library`).
2. **Frontend, no-DB:** gated pure helpers → `editor`/`app`/`publish` component logic → `ui/` primitives
   (post-refactor).
3. **Backend:** the DB harness (test DB + globalSetup + `request`/`authed`/`seedUser` helpers) → `session`
   → `artifacts`/`links` policies → `ai` gate → the rest.
4. **CI:** unit + component everywhere; a Postgres-backed `integration` job for `*.itest.ts`.

Net: three projects — `unit` (pure, fast, everywhere), `component` (Solid render, happy-dom, everywhere),
`integration` (real Postgres, opt-in/CI-gated) — each honoring the same "fake only the true oracle" rule at
its level.
