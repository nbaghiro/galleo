# Build: Custom domains (depends on 01-public-links)

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
`services/server.ts:17`. Authed routes open with `currentUser` → `currentWorkspace` (`services/api/
context.ts`); auth is the signed cookie `galleo_session` (`services/auth.ts`).

**API client** (`app/api.ts`): add `getFoo: () => req<Shape>("/foo")`. **Store** (`app/stores/foo.ts`):
signal + getter + async loader. **View/route**: `<Router base="/app">` in `app/App.tsx`.

**⚠️ Entitlement gating — a parallel session owns billing; do NOT touch billing internals.** `model/
features.ts` has `FEATURES` (`status: "live"|"beta"|"planned"`; `planned` = off for everyone). This flag is
**numeric** (`customDomains`) — gate on the count vs the limit:

```ts
import { featuresFor } from "../features";
import { limit } from "@model/features";
const cap = limit(featuresFor(ws), "customDomains");
if (currentDomainCount >= cap)
    return c.json({ error: "Custom domain limit reached — upgrade for more.", upgrade: true }, 402);
```

`GET /features` returns `{ features, status }`; add `app/stores/features.ts` (`useFeatures()`) +
`api.getFeatures()` for frontend gating. **Plan grants already set** (Pro 10 / Premium 100) in
`model/billing.ts` — **do NOT edit them**. When built + verified, flip **only**
`FEATURES.customDomains.status` `"planned"` → `"live"`.

**Do NOT touch (billing session owns):** `model/billing.ts`, `services/api/billing.ts`,
`services/billing/stripe.ts`, `services/features.ts`, the resolver in `model/features.ts` (only your
`status` line), `.env`. `services/schema.ts` is co-edited — additive; coordinate `pnpm db:push`.

**Dependency:** builds on **01-public-links** — a custom domain resolves to a workspace's published
link/artifact and renders the same public viewer.

---

## The task

**Goal:** let a workspace serve its published artifacts on its own hostname (e.g. `deck.acme.com` → a
published Galleo artifact). Numeric limit (**Pro 10 / Premium 100**, already set); `status: "planned"`.

**Build (app-level):**

- A `domains` table (`id`, `workspaceId`, `hostname` unique, `verifyToken`, `verified` bool, `linkId`/
  `artifactId` target).
- Routes (authed, workspace-scoped): add domain — gate on `limit(featuresFor(ws), "customDomains")` vs the
  current count; verify (check a DNS TXT record equals `verifyToken`); remove.
- **Host resolution:** map the incoming `Host` header → `domains` → the published link (from 01) → render
  01's public viewer. This reuses 01's `GET /p/:slug/content` resolution + the chrome-free viewer.

**Infra caveats (call out; likely out of app scope):** DNS verification and TLS certificate provisioning
are a hosting/reverse-proxy concern, not the Node app. The app-level deliverable is the `domains` table +
verification endpoint + `Host`→artifact resolution. Scope the app piece and flag the TLS/proxy piece as
ops work. This is the most infra-heavy item.

**Acceptance:** add + verify a domain (mock the DNS check in dev) → a request with that `Host` renders the
workspace's published artifact; the count is gated by tier.

**Finish:** flip `FEATURES.customDomains.status` → `"live"`; `pnpm typecheck && pnpm lint`.
