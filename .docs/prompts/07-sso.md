# Build: SSO (single sign-on)

## Shared context

You're working in **Galleo** — a TypeScript AI content tool where one engine renders the same block tree
as a **deck, document, or website**. Read `.docs/architecture.md`, `.docs/data-model.md`, and `CLAUDE.md`
before starting.

**Layering law (ESLint-enforced):** `model ← canvas ← editor ← app`; `services` imports only `model`.
`model/` is pure. `editor/` must **not** import `app/` (IoC hook pattern). Path aliases: `@model @canvas
@editor @themes @engine @elements`. **No `index.ts` barrels** — named files only.

**Style:** 4-space indent, double quotes, semicolons, `printWidth` 100, **no `any`, no `console`**.
`strict` TS. Verify with `pnpm typecheck` **and** `pnpm lint`.

**Run/verify:** `pnpm dev` (SPA :8600), `pnpm api` (backend :8601, `/api/*` proxied). Postgres in docker;
schema `services/schema.ts`, pushed with `pnpm db:push`. Seed login: `demo@galleo.app` / `demo1234`.

**Backend router pattern** (`services/api/*.ts`): `export const x = new Hono()` with full paths; mount in
`services/server.ts:17`. Auth today is a signed cookie `galleo_session` = `"<userId>.<hmac>"`
(`services/auth.ts`: `makeSession(userId)` sets it, `readSession` verifies; scrypt password hashing;
`POST /auth/login` in `services/api/session.ts` is the template). `services/api/context.ts` has
`currentUser` / `currentWorkspace`.

**API client** (`app/api.ts`): `req<T>()` / `api` object. **View/route**: `<Router base="/app">` in
`app/App.tsx`; the sign-in surface is `app/views/AuthPage.tsx`.

**⚠️ Entitlement gating — a parallel session owns billing; do NOT touch billing internals.** `model/
features.ts` has `FEATURES` (`status: "live"|"beta"|"planned"`; `planned` = off for everyone). Gate SSO
_configuration_ on the backend:

```ts
import { featuresFor } from "../features";
import { can } from "@model/features";
if (!can(featuresFor(ws), "sso"))
    return c.json({ error: "SSO is a Premium feature — upgrade.", upgrade: true }, 402);
```

`GET /features` returns `{ features, status }`; add `app/stores/features.ts` (`useFeatures()`) +
`api.getFeatures()` for frontend gating. **Plan grant already set** (Premium) in `model/billing.ts` —
**do NOT edit it**. When built + verified, flip **only** `FEATURES.sso.status` `"planned"` → `"live"`.

**Do NOT touch (billing session owns):** `model/billing.ts`, `services/api/billing.ts`,
`services/billing/stripe.ts`, `services/features.ts`, the resolver in `model/features.ts` (only your
`status` line), `.env` billing vars. `services/schema.ts` is co-edited — additive; coordinate `pnpm
db:push`.

---

## The task

**Goal:** single sign-on for Premium workspaces — users authenticate via an external IdP instead of a
password.

**Plan grant:** `sso` on **Premium** (already set); `status: "planned"`.

**What exists:** `users.passwordHash` is nullable with the comment "null = OAuth-only account"
(`services/schema.ts:23`); `services/auth.ts` notes real OAuth "layers on later". Only cookie-session auth
today — no OAuth/OIDC/SAML.

**Build:** start with **OIDC (Google / Microsoft)** as the pragmatic path; SAML later.

- Tables: `sso_connections` (`workspaceId`, `provider`, config/issuer/clientId, enabled) and/or
  `identities` (`userId`, `provider`, `providerSubject`) to link an IdP identity to a `users` row.
- Backend: OAuth callback routes — `GET /auth/sso/:provider/start` (redirect to IdP) and
  `GET /auth/sso/:provider/callback` (exchange code → profile → find/create `users` row → link identity →
  `makeSession(user.id)` → set the `galleo_session` cookie, reusing the existing session mechanism). Gate
  SSO _configuration_ routes on `can(featuresFor(ws), "sso")`.
- Frontend: SSO settings (connect an IdP for the workspace), and a "Sign in with SSO" path on
  `app/views/AuthPage.tsx`.

**Infra caveats:** IdP app registration, redirect URIs, and client secrets (env vars — add to
`.env.example`, NOT the billing block). This is the heaviest item — scope OIDC first, verify one provider
end-to-end, defer SAML.

**Acceptance:** connect a provider → "Sign in with SSO" completes an OIDC round-trip → a session cookie is
set and the user lands signed-in; SSO config is Premium-gated.

**Finish:** flip `FEATURES.sso.status` → `"live"`; `pnpm typecheck && pnpm lint`.
