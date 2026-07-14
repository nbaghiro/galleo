# Build: Public API + API keys

## Shared context

You're working in **Galleo** — a TypeScript AI content tool where one engine renders the same block tree
as a **deck, document, or website**. Read `.docs/architecture.md` and `AGENTS.md`
before starting.

**Layering law (ESLint-enforced):** `model ← canvas ← editor ← app`; `services` imports only `model`.
`model/` is pure. `editor/` must **not** import `app/` (IoC hook pattern). Path aliases: `@model @canvas
@editor @themes @engine @elements`. **No `index.ts` barrels** — named files only.

**Style:** 4-space indent, double quotes, semicolons, `printWidth` 100, **no `any`, no `console`**.
`strict` TS. Verify with `pnpm typecheck` **and** `pnpm lint`.

**Run/verify:** `pnpm dev` (SPA :8600), `pnpm api` (backend :8601, `/api/*` proxied). Postgres in docker;
schema `services/schema.ts`, pushed with `pnpm db:push`. Seed login: `demo@galleo.app` / `galleo-demo-2026`.

**Backend router pattern** (`services/api/*.ts`): `export const x = new Hono()` with full paths; mount in
`services/server.ts:17`. Authed routes open with `currentUser` → `currentWorkspace` (`services/api/
context.ts`); the app uses a signed cookie `galleo_session` (`services/auth.ts`, `makeSession`/
`readSession`, scrypt password hashing).

**API client** (`app/api.ts`): add `getFoo: () => req<Shape>("/foo")`. **Store** (`app/stores/foo.ts`):
signal + getter + async loader. **View/route**: `<Router base="/app">` in `app/App.tsx`.

**⚠️ Entitlement gating — a parallel session owns billing; do NOT touch billing internals.** `model/
features.ts` has `FEATURES` (`status: "live"|"beta"|"planned"`; `planned` = off for everyone). Gate on the
backend:

```ts
import { featuresFor } from "../features";
import { can } from "@model/features";
if (!can(featuresFor(ws), "apiAccess"))
    return c.json({ error: "API access is a paid feature — upgrade.", upgrade: true }, 402);
```

`GET /features` returns `{ features, status }`; add `app/stores/features.ts` (`useFeatures()`) +
`api.getFeatures()` for frontend gating. **Plan grant already set** (Premium) in `model/billing.ts` —
**do NOT edit it** (the Pro card copy says "API (soon)" but the Pro grant is `false`; that's a
billing-session tunable — gate purely on `can(features, "apiAccess")`). When built + verified, flip
**only** `FEATURES.apiAccess.status` `"planned"` → `"live"`.

**Do NOT touch (billing session owns):** `model/billing.ts`, `services/api/billing.ts`,
`services/billing/stripe.ts`, `services/features.ts`, the resolver in `model/features.ts` (only your
`status` line), `.env`. `services/schema.ts` is co-edited — additive; coordinate `pnpm db:push`.
**Credit metering is billing-owned:** API-driven generation must spend via `POST /billing/spend` — do NOT
reimplement metering.

---

## The task

**Goal:** a programmatic REST API (list/create artifacts, run generation) authenticated by API keys, so
Premium workspaces can integrate Galleo.

**Plan grant:** `apiAccess` on **Premium** (already set); `status: "planned"`.

**Build:**

- An `api_keys` table (`id`, `workspaceId`, `keyHash`, `prefix` (shown in UI), `name`, `lastUsedAt`,
  `createdBy`, `createdAt`). Store only a hash of the key (reuse the scrypt approach in `services/auth.ts`).
- Key-management routes (authed, gated on `apiAccess`): `POST /api-keys` (returns the raw key **once**),
  `GET /api-keys` (list, prefix only), `DELETE /api-keys/:id` (revoke).
- A **bearer-token auth path** parallel to the cookie: a resolver `apiKeyWorkspace(authHeader)` (mirroring
  `currentWorkspace` in `services/api/context.ts`) that maps `Authorization: Bearer <key>` → workspace
  (hash + lookup, bump `lastUsedAt`). A versioned public surface, e.g. a `services/api/v1.ts` router at
  `/api/v1/...`, reusing existing logic (list/create artifacts; generate). Add per-key rate limiting.
- Frontend: an API-keys settings view (create → reveal-once → revoke), gated (locked/"coming soon" below
  the granting tier).

**Acceptance:** create a key → call `/api/v1/...` with `Authorization: Bearer <key>` → succeeds for a
granted workspace, 402 for a non-granted one, 401 for a bad key; generation via the API spends credits
through `/billing/spend`.

**Finish:** flip `FEATURES.apiAccess.status` → `"live"`; `pnpm typecheck && pnpm lint`.
