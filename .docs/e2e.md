# e2e.md — the browser suite, as built

Factual map of the Playwright suite, sibling of `.docs/testing.md` (which covers unit +
integration). This file describes what runs.

## Topology

One command, `pnpm test:e2e`, does everything:

1. **Global setup** (`e2e/setup/global.ts`) creates the `galleo_e2e` database on the dev Postgres
   (:8602) if absent, installs the `vector` extension, `drizzle-kit push`es the schema, and runs
   the REAL `pnpm seed`. The demo seed is the fixture system: six role-named logins
   (`demo@` … `demo+invited-admin@`), five workspaces across plan states, pinned invite tokens
   and published-link slugs that survive reseeds.
2. **webServer** builds the SPA (`vite build`) and starts the real server in production mode
   (`NODE_ENV=production PORT=8611`, strong constant `SESSION_SECRET`) against that database —
   the same one-origin topology as prod, on its own port so it runs beside the dev stack.
   `reuseExistingServer` keeps a locally started server warm between runs.
3. An **auth-states project** logs each persona in once through `POST /api/auth/login` and saves
   `e2e/.state/<persona>.json` storage states (git-ignored); every other project depends on it.
4. The **spec projects** run in parallel workers. Each spec that needs content creates its own
   artifact through the API (`e2e/helpers.ts` `makeArtifact`) with exact authored sections, so
   specs are parallel-safe and never mutate the seeded fixtures.

## Shared plumbing

- `e2e/env.ts` — port/base/DB constants, imported by the config and setup.
- `e2e/fixtures.ts` — extends `test` with two always-on behaviors:
    - **Image-host interception**: `randomuser.me` / `picsum` / `unsplash` / `pexels` / `pixabay`
      answer with a local pixel (layout honest, network flake dead). Scoped by URL predicate —
      a blanket `page.route("**/*")` re-issues CORS'd requests without their context and broke
      webfont css loads.
    - **Console guard**: any `pageerror` or `console.error` fails the spec. The allowlist has
      exactly five entries, each with a comment: the logged-out `/api/me` 401 probe, wrong-
      password login 401s, the drop-then-undo save 409 (the save store rebases; recorded
      finding), and the two Google-Fonts noise classes (CORS-blocked css fetch in export —
      recorded finding — and transient gstatic woff2 404s).
- `e2e/helpers.ts` — content builders (`txt`/`rowOf`/`colOf`/`sec`, `makeArtifact`) and the
  measurement layer: `stage()` scopes queries to the canvas (the minimap repeats every text at
  thumb scale), `paintedText()` takes the deepest visible match (ancestors match `getByText`
  too, and hidden prerender copies must lose), and `boxOf`/`cssOf` retry until stable because
  the windowed loader can swap placeholder paint for final paint between a visibility check and
  a read.

## The projects (37 specs)

| Project | Specs                 | What it proves                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ------- | --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| smoke   | 4                     | server healthy, auth gate renders, sign-in lands in the seeded library, a seeded artifact paints in the editor, a public link serves logged-out                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| editor  | 20                    | click-to-edit opens at the painted size with no scale jump; color swatch Auto → set → Reset; element dnd shows overlay indicators without a canvas repaint and drops at the line; one undo per gesture; section drag reorders through gap slots; edge autoscroll; Delete collapses the emptied column; ⌘D; Esc-walk; layout presets redistribute columns; a comment on an element posts, reveals its marker on section hover and reopens; a text-range comment keeps its quote and survives a later keystroke; a comment on a document written before element ids still resolves after a reload; threads whose element was deleted collect into their section's stack; the composer opens beside its element rather than at the section edge; a press outside the thread popover closes it and still lands where it was aimed; the rail flyout closes on an outside press while the inspector auto-open still wins; no comment chip on a part of a composite and one on the composite itself; two browser contexts on one artifact see each other in the roster, paint each other's cursor, and receive each other's edits live; an element one of them is typing in cannot be entered by the other |
| roles   | 5                     | owner/admin/member surface gating in the flagship workspace; plus-addressed emails render; the pinned invite joins the invited account; free-plan seat cap blocks invites                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| share   | 3                     | seeded public/private/protected slugs behave; UI-created link serves anonymously and dies on delete (verified via the links API before asserting)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| library | 4                     | create/trash/restore round-trip through the card menu; search field and ⌘K find seeded content; a plain member's library comes back non-empty through the real client                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| auth    | 3 (serial)            | UI signup provisions and signs in; wrong password anti-enumeration; forgot-flow acknowledgement; sweeps its own account from the e2e DB afterward                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| phone   | 2 (Pixel 7 emulation) | first-tap-selects / second-tap-edits; the control bar anchors above the selection, centred, never overflowing                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| present | 2                     | present-mode keyboard walk; Export downloads real `%PDF` bytes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ai      | 2 (dual-mode)         | chat → add-section tool → proposal card → apply lands the section; suggest-section-layouts returns cards and applying preserves the copy                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |

## The AI modes

`services/core/ai/fake.ts` + a two-line branch in `provider.ts`: with `GALLEO_FAKE_AI=1` (the
default webServer env) every model call resolves to a scripted `MockLanguageModelV4`. The REAL
pipeline runs — turn protocol, SSE, the agent loop, tool execution, proposal blocks, the credit
gate — only the model answers are canned, keyed off the prompts the pipeline itself writes
(outline system prompt → outline JSON, section writer → a section honoring the requested id, a
re-layout prompt → the copy inventory echoed back verbatim, chat messages → scripted tool
calls). `pnpm test:e2e:ai:live` starts the server without the flag: `provider.ts` resolves
whatever platform keys the shell exports, the project runs serial with retries 0, and the specs
keep only their invariant assertions (exact-content checks are fake-mode-only). No key → the
project skips with a message.

## Running

```
pnpm test:e2e             # everything (build + DB + seed + 9 projects), ~2.5 min cold, ~36 s warm
pnpm test:e2e:smoke       # the 4-spec canary
pnpm test:e2e:ai          # AI flows against the scripted model
pnpm test:e2e:ai:live     # AI flows against real platform keys, serial, no retries
pnpm exec playwright show-trace test-results/<spec>/trace.zip   # post-mortem a failure
```

Traces are retained on failure; `test-results/`, `playwright-report/`, and `e2e/.state/` are
git- and prettier-ignored.

## CI (designed; wiring deferred while ci.yml is in flight elsewhere)

Two jobs, mirroring the integration job's shape:

- **e2e-smoke** — on every PR. Postgres service container (pgvector image, port 8602, user
  `galleo`), `pnpm install`, `pnpm exec playwright install chromium --with-deps` (cached by the
  Playwright version key), `pnpm test:e2e:smoke`. ~2-3 min cold, mostly the build.
- **e2e-full** — on pushes to main and nightly. Same setup, `pnpm test:e2e --shard=1/2` and
  `2/2` across a two-job matrix; `retries: 1` and the GitHub reporter come from the config's CI
  branch; upload `test-results/` as an artifact on failure.
- **e2e-ai-live** — manual `workflow_dispatch` only, with the model key as a repo secret and
  `E2E_LIVE_AI=1`. Never on PRs: a live retry is a hidden re-spend.

The config already reads `process.env.CI` for reporters/retries, so the jobs are yaml-only once
`ci.yml` frees up.

## Known deferrals

- generate-studio spec (needs a `checkSection` handler in the fake's script).
- credits-drain assertion in the AI project (the gate runs real; the readout assertion is TODO).
- testing.md §8a reducer tests: the fake provider is the seam they were waiting for.
