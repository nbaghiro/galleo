# Build: SSO (single sign-on)

## Shared context

You are working in **Galleo**, a TypeScript AI content tool where one engine renders the same block tree
as a **deck, document, or website**. Read `AGENTS.md` first, then `.docs/architecture.md`, then
`.docs/workspaces.md` (the tenant, membership, and roles), `.docs/hosting.md` (the env contract), and
`.docs/testing.md` (the test contract).

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
`requireRole("admin" | "owner")` sits after it. Sessions are the signed cookie `galleo_session`
(`services/utils/auth.ts`).

**Entitlement gating.** `model/billing.ts` holds the plan catalog, the `FEATURES` launch registry
(`status: "live" | "beta" | "planned"`, where `planned` is off for everyone regardless of plan), and the
resolver (`resolveFeatures`, `featuresFor`, `can`, `limit`, `withinLimit`). Backend gates are the two Hono
helpers in `services/utils/http.ts`, each returning the Response to send or `null`:

```ts
const denied = requireFeature(c, ws, "sso", "SSO is a Premium feature.");
if (denied) return denied;
```

On the frontend, `GET /features` loads into `app/stores/features.ts`, whose `can(key)` and `statusOf(key)`
are the only correct read: they carry both the workspace's `feature_overrides` and the launch status, which
`limitsFor(plan)` does not. Every plan wall renders through `app/components/Upgrade.tsx`, where
`UpgradeNotice` explains what is blocked and `UpgradeButton` derives the selling tier from `upgradeFor`;
both show "Coming soon" instead of an upgrade path while the flag is `planned`.

Billing itself is built, so there is no parallel session to coordinate with, but `model/billing.ts` is
shared and load-bearing. Keep your change to it to the single `FEATURES["sso"].status` line unless the plan
grant is genuinely wrong, and say so in your report if you touch anything else.

**Frontend shape.** `app/api.ts` is the one wire boundary (`req<T>()` throws `ApiError(status, msg)`, and
402 means upgrade). App state lives one file per concern in `app/stores/`, views in `app/views/`, and
routes are registered inside `<Router base="/app">` in `app/App.tsx`.

---

## Status

Partially built. The old version of this prompt said "only cookie-session auth today, no OAuth/OIDC/SAML",
which is no longer true: a complete OIDC round trip ships for Google as a **personal** sign-in method. What
does not exist is anything **workspace-scoped**: a company cannot bring its own identity provider, and no
route reads the `sso` flag. `FEATURES.sso.status` is `"planned"` and the plan grant is already `true` on
Premium only.

## Already built, do not rebuild

Read these before designing. The OIDC mechanics are done and the remaining work is mostly about who owns
the connection.

- **`services/api/oauth.ts`** is the whole flow: `GET /api/auth/google` starts it (arctic's
  `generateState` + `generateCodeVerifier`, both stashed in short-lived httpOnly cookies with a 10 minute
  max-age), and `GET /api/auth/google/callback` validates the state, exchanges the code, decodes the id
  token, and either signs the user in or links the identity. It requires Google's `email_verified` claim
  before trusting an address, which is what stops an unverified address from taking over an account.
  Failures redirect to `/login?authError=<code>` or `/account?authError=<code>`, and `app/views/AuthPage.tsx`
  maps those codes to readable copy.
- **The link-versus-sign-in split.** `?link=1` from the account page sets an intent cookie, so the same
  callback attaches the identity to the current session's account rather than signing in as whoever owns
  that email. If the session expires mid-consent it degrades to a plain sign-in, never a silent account
  swap.
- **`services/core/accounts.ts`** holds `googleProvider()` (built lazily from `GOOGLE_OAUTH_CLIENT_ID` and
  `GOOGLE_OAUTH_CLIENT_SECRET`, returning `null` when unconfigured so routes degrade instead of crashing),
  `oauthProvidersReady()`, `OAUTH_SCOPES`, `linkOAuthAccount`, `linkProviderToUser`, and `unlinkProvider`
  with its `last-credential` guard.
- **Schema.** `oauth_accounts` (`user_id`, plus a unique `provider` + `provider_account_id` pair) and
  `users.password_hash` nullable, where null means an OAuth-only account. `users.has_password` is surfaced
  so such an account can set a first password rather than change one.
- **Surfaces.** `AuthPage.tsx` renders a Continue with Google button, disabled until
  `GET /api/auth/providers` says the provider is configured, and `AccountSettingsView.tsx` at `/account`
  manages linked providers.
- **Tests.** `services/api/__tests__/oauth.itest.ts` covers the link intent, linking to the session's
  account rather than the email's owner, refusing an identity already linked elsewhere, idempotent
  relinking, the expired-session fallback, and the two error destinations.
- **The dependency is already installed:** `arctic` provides the provider clients, PKCE, and
  `decodeIdToken`. Use it for a second provider rather than adding an OIDC library.

## What remains

The gap is the difference between "a person can sign in with their Google account" and "a company's
employees sign in through the company's identity provider, and the workspace can require it". Concretely:

1. **A workspace-owned connection.** An `sso_connections` table keyed by `workspace_id`, holding the
   provider or issuer URL, the client id, the client secret, and an enabled flag. This is the piece that
   does not exist at all. Secrets in a database column need a decision about encryption at rest: say what
   you chose and why, rather than storing a plaintext client secret and not mentioning it.
2. **Email-domain routing.** For SSO to be usable the sign-in page has to know, from the address alone,
   which workspace's connection to send the user to. That usually means a verified email domain per
   connection, which is a second verification problem much like the one custom domains has. Do not skip
   it: without it, "Sign in with SSO" has nothing to dispatch on.
3. **A second provider.** Google alone is not SSO in the sense a buyer means. Microsoft Entra is the
   pragmatic next one, and a generic OIDC issuer is the general answer. Note that `AuthProvider` in
   `model/workspace.ts` is currently the literal union `"google"`, so widening it touches the linked
   providers UI, the account DTOs, and `oauthProvidersReady`'s return shape. Do that widening deliberately
   in one change.
4. **The entitlement gate.** Only the configuration routes are gated on `can(features, "sso")`. Signing in
   through an already-configured connection must not consult the plan on the hot path, or a lapsed
   subscription locks a company out of its own account. Decide what a downgrade does to an existing
   connection and write it down; the repo's stated policy is that gates soft-lock rather than delete.
5. **Optional enforcement.** "Require SSO for this workspace" (members may not use a password) is a real
   enterprise ask and a good way to lock out an owner. If you build it, keep a break-glass path and test
   it. If you do not, say so explicitly rather than leaving it ambiguous.
6. **Just-in-time provisioning.** Today `linkOAuthAccount` creates a user and, through the existing
   provisioning path, a personal workspace. An SSO sign-in should instead land the user as a **member of
   the connection's workspace**, with a role from the connection's default. That is the one place where
   this feature reaches into membership (`services/core/workspaces.ts`), and it interacts with the seat
   cap: decide whether a JIT-provisioned user consumes a seat, and what happens when there are none left.
7. **SAML: deferred.** OIDC first, verified against one real provider end to end. Do not start SAML in
   this pass.

## Build order

Widen the provider union and add Microsoft (or a generic issuer) through the existing flow first, since it
proves the plumbing generalises with no new concepts. Then add `sso_connections` plus the Premium-gated
configuration UI in `app/views/WorkspaceSettingsView.tsx`. Then domain verification and the dispatch on
`AuthPage.tsx`. Then JIT membership. Enforcement last, if at all.

## Infra, which this session cannot do

Registering the application with each identity provider, the redirect URIs, and the client secrets are
account-level actions outside the repo. The Google redirect URI is `${APP_URL}/api/auth/google/callback`
and a new provider should follow the same shape. Add new env vars to `.env.example` and to the env contract
table in `.docs/hosting.md`. Stop and ask for credentials rather than inventing placeholder values that
look configured.

## Tests

`pnpm test:int`, extending `services/api/__tests__/oauth.itest.ts` rather than starting a parallel file.
Worth covering: a Premium admin can create a connection and a Pro one gets 402 with `upgrade: true`; a
plain member gets 403; sign-in through an existing connection still works for a workspace whose plan has
lapsed; an unverified email domain does not dispatch; a JIT sign-in lands as a member with the connection's
default role and is refused when no seat is free.

## Acceptance

An admin on Premium connects an identity provider, a user at that email domain completes an OIDC round trip
from the sign-in page, and lands signed in as a member of that workspace with a `galleo_session` cookie.
Configuration is Premium-gated, and sign-in is not.

## Finish

Flip `FEATURES.sso.status` from `"planned"` to `"live"`, fix the Premium highlight copy in
`model/billing.ts` that currently says SSO is coming soon, run every gate in the Shared context section,
and update `.docs/workspaces.md`'s gates table plus `.docs/architecture.md`'s data model for the new table.
