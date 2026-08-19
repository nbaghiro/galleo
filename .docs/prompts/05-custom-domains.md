# Build: Custom domains

## Shared context

You are working in **Galleo**, a TypeScript AI content tool where one engine renders the same block tree
as a **deck, document, or website**. Read `AGENTS.md` first, then `.docs/architecture.md`, then the
companion doc closest to this feature (`.docs/workspaces.md` for the tenant, `.docs/hosting.md` for the
deploy and env contract, `.docs/testing.md` for the test contract).

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
enforces both halves, and also fails a `c.req.json()` that routes around the helper.

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
`services/server.ts` mounts them one at a time under `/api`. Auth and tenancy are middleware from
`services/api/middleware.ts`: `requireUser` sets `user`, `requireWorkspace` also sets `ws` and `role` (and
rolls the monthly credit window, so a route needing only the id still goes through it), and
`requireRole("admin" | "owner")` sits after it. Per-artifact access is `gateArtifact(c, id, need)`, which
returns either the row plus the caller's level or the Response to send. Sessions are the signed cookie
`galleo_session` (`services/utils/auth.ts`).

**Entitlement gating.** `model/billing.ts` holds the plan catalog, the `FEATURES` launch registry
(`status: "live" | "beta" | "planned"`, where `planned` is off for everyone regardless of plan), and the
resolver (`resolveFeatures`, `featuresFor`, `can`, `limit`, `withinLimit`). Backend gates are the two Hono
helpers in `services/utils/http.ts`, each returning the Response to send or `null`. `customDomains` is a
**numeric** feature, so the helper is `checkLimit`:

```ts
const denied = checkLimit(c, ws, "customDomains", currentDomainCount);
if (denied) return denied;
```

On the frontend, `GET /features` loads into `app/stores/features.ts`, whose `can(key)` and `statusOf(key)`
are the only correct read: they carry both the workspace's `feature_overrides` and the launch status,
which `limitsFor(plan)` does not. Every plan wall renders through `app/components/Upgrade.tsx`, where
`UpgradeNotice` explains what is blocked and `UpgradeButton` derives the selling tier from `upgradeFor`;
both show "Coming soon" instead of an upgrade path while the flag is `planned`.

Billing itself is built, so there is no parallel session to coordinate with, but `model/billing.ts` is
shared and load-bearing. Keep your change to it to the single `FEATURES["customDomains"].status` line
unless the plan grant is genuinely wrong, and say so in your report if you touch anything else.

**Frontend shape.** `app/api.ts` is the one wire boundary (`req<T>()` throws `ApiError(status, msg)`, and
402 means upgrade). App state lives one file per concern in `app/stores/`, views in `app/views/`, and
routes are registered inside `<Router base="/app">` in `app/App.tsx`.

---

## Status

Not started, as of this audit. There is no `domains` table, no host resolution, and no UI.
`FEATURES.customDomains.status` is `"planned"`; the plan grants are already Pro 10 and Premium 100
(`model/billing.ts`), and because `resolveFeatures` zeroes a `planned` numeric feature, `customDomains`
resolves to `0` on every plan until the status flips. Expect the gate to refuse everything while you are
still building, and do not read that as a bug.

## Already built: the publishing layer this sits on

The `01-public-links` prompt this file used to depend on is gone because public links shipped. The pieces
you are extending:

- **`links`** in `services/db/schema.ts`: `artifact_id`, a unique `slug`, an owner-facing `name`,
  `visibility` (`public` | `protected` | `private`), and a scrypt `password` for `protected` links. An
  artifact can carry many links, one per audience. Alongside it, `link_recipients` holds the per-email
  possession tokens for a `private` link and `link_views` is the analytics log.
- **`services/core/links.ts`** owns every decision: `publicRead(slug, { password, token })` resolves a
  slug to the artifact and enforces visibility, the password, and the wrong-guess lockout; it also
  computes `branded` from the **owner workspace's** entitlement, since an anonymous viewer has no plan of
  its own. `recordView` and `analyticsFor` are the view log.
- **`services/api/links.ts`** exposes the authed management routes plus the two unauthenticated ones:
  `GET /api/p/:slug/content` and `POST /api/p/:slug/ping` (the viewer heartbeat).
- **`publish/`** is the standalone read-only viewer: its own Vite entry (`publish/index.html` is a build
  input in `vite.config.ts`), routed as `/p/:slug` in `publish/main.tsx`, painting through `@canvas` with
  no app SPA, auth, or editor.
- **Serving.** One Node process serves everything in prod (`services/server.ts`): the routers mount under
  `/api`, then `/p/*` serves `./dist/publish/index.html`, `/` serves the app or the marketing build
  depending on whether the session cookie verifies, and `*` falls back to the app shell. In dev the same
  mapping is a Vite middleware in `vite.config.ts`. `appUrl()` in `services/utils/env.ts` builds
  absolute links from `APP_URL`.

Read `services/api/links.ts` and `services/core/links.ts` before designing anything: the slug resolution
and the access policy already exist, and a custom domain should be another way to reach them rather than a
second implementation of them.

## Goal

Let a workspace serve its published artifacts on its own hostname, so `deck.acme.com` renders a published
Galleo artifact with no `galleo.app` URL in front of a customer.

## Build (the app-level slice)

- **Schema.** A `domains` table: `id`, `workspace_id` (the tenancy key every scoped table carries),
  `hostname` unique across the whole table, `verify_token`, `verified_at` (a nullable timestamp reads
  better than a boolean, since it records when), and the target. For the target, prefer `link_id`
  referencing `links` over an artifact id: a link already carries the visibility policy and the slug, and
  pointing at the artifact would mean reinventing the access decision. Generate the migration, do not
  hand-write it.
- **Routes.** A new `services/api/domains.ts` router mounted in `services/server.ts`, with
  `services/core/domains.ts` holding the queries and the verification decision. Add (gated with
  `checkLimit(c, ws, "customDomains", currentCount)`), list, verify, and remove. Adding or removing a
  domain is a workspace-wide administrative act, so put `requireRole("admin")` after `requireWorkspace`,
  matching how `PATCH /workspace` and the invite routes already gate.
- **Verification.** Check that a DNS TXT record on the hostname equals `verify_token`. The DNS lookup is
  an external oracle, so put it behind an injectable seam the way the context system does with
  `Embedder`: a `resolveTxt` function passed as a trailing parameter with a real default, so the
  integration test runs the real decision against a deterministic fake. Read `.docs/testing.md` section 3
  on the seam budget before adding it.
- **Host resolution.** An incoming request whose `Host` is not a Galleo hostname resolves through
  `domains` to the target link, and then serves the same `publish/` viewer and the same
  `GET /api/p/:slug/content` read. Two decisions to make explicitly and write down:
    1. Where the mapping happens. The natural place is `services/server.ts` ahead of the static fallbacks,
       because that is the only file that already composes across layers and is exempt from the layer law.
       It must not swallow `/api/*`, which the existing `app.all("/api/*")` 404 relies on.
    2. What the viewer requests. The publish bundle currently reads the slug from its own route. On a custom
       domain the path is `/`, so either the server rewrites to the slug's path or the client asks a small
       "what is this host" endpoint. Rewriting keeps the client unchanged and is probably right, but say
       which you chose.
- **Frontend.** A domains section in `app/views/WorkspaceSettingsView.tsx` (add hostname, show the TXT
  record to create, verify, remove, and show the count against the cap), wrapped in `UpgradeNotice` with
  `feature="customDomains"`.

## Infra, which is not app work

DNS delegation and TLS certificate issuance for a customer hostname are a hosting concern, not a Node
concern. Render supports custom domains per service with automatic certificates, but wiring a customer's
hostname is an account-level action that this session cannot perform, and at any volume it wants an
automated path (an API call per domain, or a proxy that terminates TLS with on-demand certificates). Scope
the app deliverable to the table, the verification endpoint, and the `Host` resolution, and write the
TLS and DNS story into your report as ops work with a named owner. Do not leave it implied.

Because of that split, the honest end state of this pass is a feature that works when someone has already
pointed the hostname at the service. Say so rather than flipping the status on a path nobody can complete.

## Tests

`pnpm test:int`, following `services/api/__tests__/links.itest.ts`. Worth covering: adding a domain past
the plan's cap returns 402 with `upgrade: true`; a hostname already claimed by another workspace is
refused; verification succeeds against the fake resolver with a matching TXT record and fails without one;
an unverified domain does not resolve; a request carrying a verified `Host` reaches the same content the
slug does, and one carrying an unknown `Host` does not fall through to somebody else's artifact.

## Acceptance

Add a domain, verify it against a mocked DNS response in dev, and a request with that `Host` renders the
workspace's published artifact through the existing public viewer. The count is capped per tier, and the
whole surface reads "Coming soon" until the status flips.

## Finish

Flip `FEATURES.customDomains.status` from `"planned"` to `"live"` only if the resolution path genuinely
works end to end in dev; if TLS is still unresolved, leave it `planned` and explain why in your report.
Run every gate in the Shared context section, and update `.docs/architecture.md` (the data-model table
lists custom domains as a deferred table) and `.docs/workspaces.md`'s gates table.
