# Build: Public API + API keys

> **Superseded.** This shipped as part of the MCP work rather than from this prompt, and the design
> differs in the part that mattered: a delegated call runs through the one executor
> (`services/core/delegated.ts`), and the REST routes in `services/api/v1.ts` are a vocabulary over it
> rather than a second implementation. Workspace API keys are `client_credentials` machine clients on
> the same authorization server, not a separate key table. Read `.docs/mcp.md` for what was built.
> What follows is the original plan, kept for the reasoning it records.

## Shared context

You are working in **Galleo**, a TypeScript AI content tool where one engine renders the same block tree
as a **deck, document, or website**. Read `AGENTS.md` first, then `.docs/architecture.md`, then the
companion doc closest to this feature (`.docs/ai.md` for the turn protocol and the credit gate,
`.docs/workspaces.md` for the tenant, `.docs/testing.md` for the test contract).

**Layering law** (ESLint-enforced, and `pnpm check:boundaries` plants violations to prove the rules still
report): `model ← canvas ← ui ← editor ← app`. `ui/` is a real layer, the shared Solid component library,
and it may import only `model`, `canvas`, and `@themes`. `services` imports only `model`. Within services
the layers are `api → core → db → utils`: `api/` parses, gates, and shapes a response; `core/` owns every
decision and every query and **may not import hono**; `utils/` **may not import `db/`**, which is what
keeps it unit-testable. Path aliases: `@model @themes @canvas @engine @elements @ui @editor @app
@services`. **No `index.ts` barrels**, named files only. Cross-directory imports use an alias,
same-directory siblings stay relative.

**Building UI goes through `@ui`:** reuse the existing primitive, extend it with a prop or a variant when
it is close, and add a new one only when a genuinely shared one is missing. See `.docs/frontend.md`.

**Style:** 4-space indent, double quotes, semicolons, `printWidth` 100. **No `any`. No `console`**;
backend output goes through `out`/`warn` in `services/utils/env.ts`. Comments are terse and earn their
place only by saying something the code cannot: no file-header essays, no section banners, no restating
the type.

**No suppressions.** The repo carries zero `eslint-disable`, `@ts-ignore`, `@ts-expect-error`,
`@ts-nocheck`, `prettier-ignore`, or coverage pragmas. `noInlineConfig` makes `eslint-disable` _inert_ and
then fails the run for it, so silencing a check is not available; find the suppression-free form.

**Request bodies are untrusted.** A route reads its body with `await readJson(c, zThing)`
(`services/utils/http.ts`), which returns `null` when the body does not match so the route can answer 400
with `BAD_BODY`. The zod schema lives beside the route in the `services/api/` file that owns it. A schema
carrying stored content must not rebuild it: use `z.looseObject`, or `z.custom<T>(guard)` when a guard
exists, since a plain `z.object` strips the keys this layer does not enumerate. `pnpm check:validation`
enforces both halves, and also fails a `c.req.json()` that routes around the helper. This rule matters
more here than anywhere else: a public API's bodies come from outside the product entirely.

**Copy is plain and never em-dashed.** User-facing strings take a comma, a period, a colon, or a middot
wherever a machine would reach for an em-dash. `pnpm check:copy` fails the build on one.

**Run:** `pnpm dev` serves the SPA at :8600 with `/api/*` proxied to the backend, and `pnpm api` runs the
Hono server at :8601. Postgres runs in docker (`docker compose up -d`, the pgvector image, host port
8602). The schema is `services/db/schema.ts` with **generated migration files**: `pnpm db:generate` then
`pnpm db:migrate`. Seed with `pnpm seed`; the demo login is `demo@galleo.app` / `galleo-demo-2026`.

> **Migrations are immutable once deployed.** Prod (Render, whose deploy runs `pnpm db:migrate`) tracks
> applied migrations by content hash, so renaming, editing, or squashing one that has already reached prod
> re-runs it and fails the deploy. Only ever append new files.

**Tests:** vitest discovers `**/*.test.ts` for the unit run (`pnpm test`) and `**/*.itest.ts` for the
integration run (`pnpm test:int`, which needs Postgres). It never discovers `.tsx`, so there are no Solid
component tests and any logic worth testing belongs in a `.ts` file. Read `.docs/testing.md` section 2,
the mocking contract, before adding a double.

**Gates before you are done.** All of these must pass:

```
pnpm typecheck   pnpm lint   pnpm format:check   pnpm test   pnpm test:int   pnpm build
pnpm check:suppressions   pnpm check:program   pnpm check:boundaries   pnpm check:models
pnpm check:copy   pnpm check:elements   pnpm check:modules   pnpm check:validation
```

**Backend route pattern.** Each `services/api/*.ts` exports one `Hono` router carrying full paths, and
`services/server.ts` mounts them one at a time under `/api`, followed by an
`app.all("/api/*")` 404 so an unknown API path never reaches the SPA fallback. Auth and tenancy are
middleware from `services/api/middleware.ts`: `requireUser` sets `user`, `requireWorkspace` also sets `ws`
and `role` (and rolls the monthly credit window, so a route needing only the id still goes through it),
and `requireRole("admin" | "owner")` sits after it. Per-artifact access is `gateArtifact(c, id, need)`,
which returns either the row plus the caller's level or the Response to send. Sessions are the signed
cookie `galleo_session` (`services/utils/auth.ts`: `makeSession`, `readSession`, and scrypt
`hashPassword`/`verifyPassword`).

**Entitlement gating.** `model/billing.ts` holds the plan catalog, the `FEATURES` launch registry
(`status: "live" | "beta" | "planned"`, where `planned` is off for everyone regardless of plan), and the
resolver (`resolveFeatures`, `featuresFor`, `can`, `limit`, `withinLimit`). Backend gates are the two Hono
helpers in `services/utils/http.ts`, each returning the Response to send or `null`:

```ts
const denied = requireFeature(c, ws, "apiAccess", "API access is a Premium feature.");
if (denied) return denied;
```

`checkLimit(c, ws, key, current, message?)` is the numeric equivalent. On the frontend, `GET /features`
loads into `app/stores/features.ts`, whose `can(key)` and `statusOf(key)` are the only correct read: they
carry both the workspace's `feature_overrides` and the launch status, which `limitsFor(plan)` does not.
Every plan wall renders through `app/components/Upgrade.tsx`, where `UpgradeNotice` explains what is
blocked and `UpgradeButton` derives the selling tier from `upgradeFor`; both show "Coming soon" instead of
an upgrade path while the flag is `planned`.

Billing itself is built, so there is no parallel session to coordinate with, but `model/billing.ts` is
shared and load-bearing. Keep your change to it to the single `FEATURES["apiAccess"].status` line unless
the plan grant is genuinely wrong, and say so in your report if you touch anything else.

**Frontend shape.** `app/api.ts` is the one wire boundary (`req<T>()` throws `ApiError(status, msg)`, and
402 means upgrade). App state lives one file per concern in `app/stores/`, views in `app/views/`, and
routes are registered inside `<Router base="/app">` in `app/App.tsx`.

---

## Status

Not started, as of this audit. There is no `api_keys` table, no bearer-token auth path, and no versioned
public surface. `FEATURES.apiAccess.status` is `"planned"` and the plan grant is already `true` on Premium
only (`model/billing.ts`). The Premium card copy says "SSO · API (coming soon)", which is honest while the
status stays `planned` and becomes wrong the moment you flip it, so check that line when you do.

## What already exists that you are wrapping, not rewriting

- **Session auth**, the mechanism a key has to sit beside rather than replace: `services/utils/auth.ts`
  holds scrypt `hashPassword`/`verifyPassword` and the signed-cookie `makeSession`/`readSession`, and
  `services/api/middleware.ts` turns a cookie into `user` + `ws` + `role` on the Hono context.
- **A per-IP rate limiter**, `rateLimit({ name, windowMs, ... })` in `services/utils/http.ts`, already
  used as route middleware. It keys on the client IP, which is the wrong key for an API key, so read it
  before deciding whether to extend it or write a keyed sibling.
- **The artifact routes** in `services/api/artifacts.ts` over `services/core/artifacts.ts`, including
  keyset paging, windowed reads, and the section-op transaction.
- **The AI turn protocol**, `POST /api/ai/turn` in `services/api/ai.ts`: one SSE endpoint over the
  `@model/ai` turn kinds (`generate`, `plan`, `build`, `section`, `chat`), with `reserve` from
  `services/core/spend.ts` holding credits before the billable model calls and the settle reconciling
  after. Read `.docs/ai.md` first; a synchronous REST wrapper over a streamed, metered turn is the hardest
  design question in this prompt, not an afterthought.
- **The credit engine**, `services/core/ledger.ts` (`chargeCredits` / `settleCredits`, row-locked) under
  `reserve`. API-driven generation spends through that same path. Do not reimplement metering, and do not
  add a second pricing table.

## Goal

A programmatic REST API authenticated by workspace API keys, so a Premium workspace can list and create
artifacts and run generation without a browser session.

## Build

- **Schema.** An `api_keys` table: `id`, `workspace_id`, `key_hash`, `prefix` (the short visible fragment
  the UI lists so a person can tell two keys apart), `name`, `created_by`, `created_at`, `last_used_at`,
  and a nullable `revoked_at` rather than a hard delete, so a key that was used can still be explained
  after it is turned off. Store only the hash. Note that `hashPassword` is scrypt with a per-value salt,
  which is deliberately slow: that is correct for a login and wrong for a lookup on every API request, so
  either derive the row by `prefix` first and verify the hash once, or store a fast keyed digest instead.
  Pick one, write down why, and do not silently make every request pay a scrypt.
- **Key management routes.** A `services/api/keys.ts` router over `services/core/keys.ts`, all authed by
  session and gated on `apiAccess`: create (returning the raw key exactly once, never retrievable again),
  list (prefix and metadata only), and revoke. Creating and revoking a workspace credential is an
  administrative act, so put `requireRole("admin")` after `requireWorkspace`.
- **The bearer path.** A `requireApiKey` middleware alongside the existing ones in
  `services/api/middleware.ts`, resolving `Authorization: Bearer <key>` to the same
  `{ user | null, ws, role }` context shape the cookie path produces, so the handlers below it do not care
  which arrived. Decide and document what a key's identity is: it belongs to a workspace, not a person, so
  either it acts as a synthetic principal or it inherits its creator, and that choice shows up in the
  credit ledger's `user_id` attribution and in `member_credit_cap`. Bump `last_used_at`, refuse a revoked
  key with 401, and apply a per-key rate limit.
- **The public surface.** A versioned `services/api/v1.ts` router mounted at `/api/v1`, thin over the same
  `services/core/` functions the session routes call. Resist duplicating logic into it: if a core function
  is not reusable from here, that is a sign the decision leaked into the api layer and should move down.
  Start narrow: list artifacts, read one, create one, and run a generation. A public surface is a contract
  you cannot quietly change, so a small one is the point.
- **Generation over REST.** `POST /api/ai/turn` streams SSE and holds credits across the stream. Decide
  whether the v1 equivalent streams the same events (simplest, and honest about the latency) or returns a
  job id the caller polls. There is no queue in the repo today, so a polling design means building
  durable job state, which is a much larger change than it looks; if you choose it, say so and scope it
  separately rather than half-landing it.
- **Frontend.** An API-keys section in `app/views/WorkspaceSettingsView.tsx` (create, reveal once with a
  copy control and a clear warning that it will not be shown again, list, revoke), wrapped in
  `UpgradeNotice` with `feature="apiAccess"`.
- **Docs.** A public API needs a reference a customer can read. Write it as a new `.docs/` file and add
  the row to `.docs/README.md`; do not leave the contract discoverable only by reading `v1.ts`.

## Tests

`pnpm test:int`, following `services/api/__tests__/artifacts.itest.ts` and `features.itest.ts`. Worth
covering: a created key authenticates a v1 call for its own workspace and cannot read another workspace's
artifacts; a bad key is 401 and a revoked key is 401; a workspace without the grant is 402 with
`upgrade: true`; the raw key is returned once and never again; `last_used_at` moves; the rate limit
returns 429; and a generation through v1 writes a `credits` ledger row through the existing engine rather
than a parallel path.

## Acceptance

Create a key in settings, call `/api/v1/...` with `Authorization: Bearer <key>`, and get a correct
response for a granted workspace, 402 for a non-granted one, and 401 for a bad or revoked key. Generation
through the API spends credits through `reserve` and shows up in `GET /billing/ledger`.

## Finish

Flip `FEATURES.apiAccess.status` from `"planned"` to `"live"`, fix the Premium highlight copy that
currently says the API is coming soon, run every gate in the Shared context section, and update
`.docs/architecture.md` (the data-model table lists `api_keys` as a deferred table) and
`.docs/workspaces.md`'s gates table.
