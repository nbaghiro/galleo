# Build: View analytics (depends on 01-public-links)

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
schema `services/schema.ts`, pushed with `pnpm db:push`. Seed login: `demo@galleo.app` / `demo1234`.

**Backend router pattern** (`services/api/*.ts`): `export const x = new Hono()` with full paths; mount in
`services/server.ts:17`. Authed routes open with `currentUser` → `currentWorkspace` (`services/api/
context.ts`); auth is the signed cookie `galleo_session` (`services/auth.ts`).

**API client** (`app/api.ts`): add `getFoo: () => req<Shape>("/foo")`. **Store** (`app/stores/foo.ts`):
signal + getter + async loader. **View/route**: `<Router base="/app">` in `app/App.tsx`.

**⚠️ Entitlement gating — a parallel session owns billing; do NOT touch billing internals.** `model/
features.ts` has `FEATURES` (`status: "live"|"beta"|"planned"`; `planned` = off for everyone). Gate on the
backend:

```ts
import { featuresFor } from "../features";
import { can } from "@model/features";
if (!can(featuresFor(ws), "analytics"))
    return c.json({ error: "Analytics is a Premium feature — upgrade.", upgrade: true }, 402);
```

`GET /features` returns `{ features, status }`; add `app/stores/features.ts` (`useFeatures()`) +
`api.getFeatures()` for frontend gating. **Plan grant already set** (Premium) in `model/billing.ts` —
**do NOT edit it**. When built + verified, flip **only** `FEATURES.analytics.status` `"planned"` →
`"live"`.

**Do NOT touch (billing session owns):** `model/billing.ts`, `services/api/billing.ts`,
`services/billing/stripe.ts`, `services/features.ts`, the resolver in `model/features.ts` (only your
`status` line), `.env`. `services/schema.ts` is co-edited — additive changes; coordinate `pnpm db:push`.

**Dependency:** this builds on **01-public-links** — you record + report views of _published_ artifacts.
If 01 isn't merged yet, coordinate on its `links` / `GET /p/:slug/content` shapes.

---

## The task

**Goal:** track views/engagement on **published** artifacts and show the owner analytics — views over
time, per artifact, top referrers.

**Plan grant:** `analytics` on **Premium** (already set); `status: "planned"` → `"live"` when done.

**Build:**

- A new `artifact_views` table (`id`, `artifactId`, `linkId`, `viewedAt`, `visitorHash` = anonymized hash
  of IP+UA, `referrer`). Keep it privacy-preserving — no PII, no raw IPs, nothing identifying in URLs.
- Record a view (fire-and-forget insert; don't block the response) inside 01's public read route
  `GET /p/:slug/content`.
- `GET /analytics/:artifactId` (authed, gated on `can(featuresFor(ws), "analytics")`, scoped to the owner
  workspace) → aggregated totals + a time series (e.g. daily counts) + top referrers.
- Frontend: an Analytics view/panel with charts — **reuse the repo's chart conventions** (`canvas/charts/*`
  and the `dataviz` skill for palette/format guidance). Premium-gated with a "coming soon" badge below
  Premium.

**Acceptance:** view a published `/p/:slug` a few times (incl. incognito) → the owner's analytics shows the
counts + time series; the view/route is Premium-gated.

**Finish:** flip `FEATURES.analytics.status` → `"live"`; `pnpm typecheck && pnpm lint`; verify end-to-end.
