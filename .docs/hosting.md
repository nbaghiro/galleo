# Galleo — Hosting & Deployment

> The single current-state reference for how Galleo ships to production: the platform choice (Render +
> Neon), the single-origin topology and why it's mandatory, the environment contract, the deploy pipeline,
> the repo changes required to go from dev to prod, the staging strategy, cost, and the scale path.
> Companion: `architecture.md` (deployable pieces + local ports), `ai.md` (the SSE streaming the topology
> must preserve).

## The pieces we deploy

Three build outputs + one database (see `architecture.md` for the full map):

- **Static SPA bundle** — one Vite build → `dist/` with three entry points: `website` (`/`), `app` SPA
  (`/app/*`), `publish` viewer (`/p/*`). All reference assets at absolute `/assets/*`.
- **Backend API** — a long-lived Node process (Hono on `@hono/node-server`) that must stream **SSE for
  minutes** (AI turns, media generation). Not serverless.
- **PostgreSQL 16** — the JSONB content tree + relational auth/billing/sharing.

Reserved-but-unused today: Redis/jobs, object storage. Media is base64 in Postgres, served through the
Node process (see **Scale path**).

## Platform choice: Render (compute) + Neon (Postgres)

| Concern  | Choice                                | Why                                                                                                                                                                                                      |
| -------- | ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Compute  | **Render Web Service** (Node runtime) | Native Node buildpack (no Docker), git-push deploy, pre-deploy hook for migrations, `/health` checks, predictable flat pricing, **100-min request ceiling** (SSE streams fine directly from the service) |
| Database | **Neon** (serverless Postgres 16)     | Cheapest staging story anywhere — copy-on-write **branch-per-PR**, scale-to-zero, generous free tier; decoupled from compute so we can move either independently                                         |

Rejected alternatives and why, for the record: **Railway** (cheaper but 15-min hard stream cap + Envoy
buffering + no native path routing); **Fly.io** (best SSE but Docker + autostop footgun + $38/mo managed
PG floor); **Vercel/Cloudflare static + external API** (forces cross-origin CORS + `SameSite=None`, and
Vercel's 120s external-rewrite cap severs long AI streams).

## The load-bearing decision: one origin, SPA served by Hono

Galleo streams SSE for minutes **and** the frontend calls the API at a **relative `/api/*` with
`credentials: "same-origin"`** (`app/api.ts`) — there is no configurable API base URL, no CORS middleware
in the backend, and the session cookie is `SameSite=Lax`. `APP_URL` also builds Stripe redirect URLs and
public `/p/:slug` link URLs, so publish links must live on the SPA's origin. Everything points to **one
origin**.

Every managed platform's _static-site rewrite proxy_ either buffers SSE (Render, DigitalOcean) or caps it
(Vercel 120s, Railway 15min). So we do **not** put a proxy in front of `/api`. Instead:

> **The single Render Web Service runs Hono, which serves the built SPA _and_ `/api/*` itself.** SSE
> streams straight from the Node process (no proxy in the path); cookies stay same-site; zero CORS.

### Request routing inside the prod Hono server

```
/health              → 200 {ok:true}                      (Render health check)
/api/*               → the API routers (session, artifacts, ai, billing/webhook, media/asset, p/:slug…)
/assets/*  + *.<ext> → static files from dist/             (immutable, long cache)
/app, /app/*  (html) → dist/app/index.html                (SPA fallback)
/p/*          (html) → dist/publish/index.html            (publish SPA fallback)
everything else (html) → dist/index.html                  (marketing website)
```

The `/api` prefix is the one wire change: today routers mount at root (`/me`, `/artifacts`) and the Vite
dev proxy strips `/api` before forwarding. In prod there is no Vite proxy, so routers must answer at
`/api/*`. We fix this **consistently for dev and prod**: mount routers under `/api` and drop the dev
proxy's rewrite (see repo changes). Then `/api/me` hits the same path in both environments — no
environment-specific routing.

On the live domain that resolves to: `galleo.app/` = marketing, `galleo.app/app` = the product SPA
(`<Router base="/app">`, auth-gated: signed-out → the in-app sign-in page), `galleo.app/p/:slug` = the
public viewer, `galleo.app/api/*` = the backend.

### Marketing nav is auth-aware; `/` never redirects

`/` **always** renders the marketing site — for signed-in visitors too, it does not bounce them into the
app. The only difference by auth state is the header CTA: the marketing header calls `/api/me` on mount
(the session cookie is `HttpOnly`, so JS can't read it directly) and swaps **Sign in / Start free** →
**Go to app →** when that returns 200. While the check is in flight it shows the signed-out CTA (works for
everyone; most visitors are unauthed). Lives in `website/WebsitePage.tsx` (`AuthCta`). Because everything
is one origin, that `/api/me` fetch is same-site and the cookie rides along.

## Environment contract

Everything the backend reads from `process.env` (verified against `services/`). **Secret** = set in the
Render dashboard (never in `render.yaml`, never committed). Optional keys are safe to omit — the feature
degrades gracefully (billing/media/mail report "not configured").

| Var                                                              | Req? | Secret | Source / value                                                              |
| ---------------------------------------------------------------- | ---- | ------ | --------------------------------------------------------------------------- |
| `NODE_ENV`                                                       | ✅   | no     | `production` — gates static serving + `secure` cookie                       |
| `PORT`                                                           | ✅   | —      | **Injected by Render**; the server must bind it (repo change)               |
| `DATABASE_URL`                                                   | ✅   | ✅     | Neon **direct** connection string (see pooler note below)                   |
| `SESSION_SECRET`                                                 | ✅   | ✅     | strong random — Render `generateValue: true`, or `openssl rand -base64 32`  |
| `APP_URL`                                                        | ✅   | no     | public origin, e.g. `https://galleo.onrender.com` (later the custom domain) |
| `ANTHROPIC_API_KEY`                                              | ✅¹  | ✅     | console.anthropic.com — the primary AI provider                             |
| `GOOGLE_API_KEY`                                                 | ⬜   | ✅     | Gemini text + **AI image generation** in the media picker                   |
| `XAI_API_KEY`, `COHERE_API_KEY`                                  | ⬜   | ✅     | extra model tiers                                                           |
| `GEMINI_IMAGE_MODEL`                                             | ⬜   | no     | override default image model                                                |
| `UNSPLASH_ACCESS_KEY`, `PEXELS_API_KEY`, `PIXABAY_API_KEY`       | ⬜   | ✅     | stock-photo providers in the media picker                                   |
| `RESEND_API_KEY`, `MAIL_FROM`                                    | ⬜   | ✅     | transactional email for share invites                                       |
| `STRIPE_SECRET_KEY`                                              | ⬜²  | ✅     | live/test secret key                                                        |
| `STRIPE_WEBHOOK_SECRET`                                          | ⬜²  | ✅     | from the webhook endpoint → `https://<origin>/api/billing/webhook`          |
| `STRIPE_PRICE_PRO_MONTH/YEAR`, `STRIPE_PRICE_PREMIUM_MONTH/YEAR` | ⬜²  | no     | the four recurring per-seat price ids                                       |
| `STRIPE_PORTAL_CONFIG`                                           | ⬜   | no     | Customer Portal config id (optional)                                        |

¹ Required for any AI feature (generation, chat, element/text edits) — the core of the product. The
`@ai-sdk/anthropic` provider auto-reads `ANTHROPIC_API_KEY` from env. ² Stripe is **optional for the
initial release**: without it, paid upgrades are disabled and everyone stays on Free. Wire it when you
turn on paid plans.

### Neon connection string — the pooler gotcha

`services/schema.ts` uses `drizzle(postgres(url))` with postgres.js defaults, which means **prepared
statements are on**. Neon's _pooled_ endpoint (`-pooler`, PgBouncer transaction mode) does **not** support
prepared statements — pointing the app at it without `{ prepare: false }` breaks queries.

- **Launch (single instance):** use Neon's **direct** connection string. postgres.js keeps a bounded pool
  (default max 10); the direct endpoint supports prepared statements. Simplest, correct.
- **When scaling to multiple instances:** switch `DATABASE_URL` to the **pooled** endpoint _and_ set
  `postgres(url, { prepare: false })` in `schema.ts`, so many instances don't exhaust `max_connections`.

Migrations (`drizzle-kit`) always run against the **direct** endpoint.

## Deploy pipeline (Render Blueprint)

Infra-as-code lives in `render.yaml` at the repo root. Render reads it on connect and provisions the
service; pushes to `main` auto-deploy.

```yaml
services:
    - type: web
      name: galleo
      runtime: node
      region: oregon # co-locate with the Neon region
      plan: starter # 512 MB / 0.5 CPU always-on; bump to `standard` (2 GB) on OOM
      branch: main
      autoDeploy: true
      buildCommand: pnpm install --frozen-lockfile && pnpm build
      preDeployCommand: pnpm db:migrate # runs after build, before cutover
      startCommand: pnpm start # NODE_ENV=production tsx services/server.ts
      healthCheckPath: /health
      envVars:
          - key: NODE_ENV
            value: production
          - key: SESSION_SECRET
            generateValue: true # Render mints a strong secret once
          - key: DATABASE_URL
            sync: false # set manually (Neon direct string) — secret
          - key: APP_URL
            sync: false
          - key: ANTHROPIC_API_KEY
            sync: false
          # …remaining optional secrets, all sync:false
```

- **Node version:** pin via a `.node-version` file (`22`) — matches CI.
- **Migrations on deploy:** `preDeployCommand` runs `pnpm db:migrate` against `DATABASE_URL` before the new
  version takes traffic. Requires committed migrations (repo change) + `drizzle-kit`/`tsx` resolvable at
  deploy time (repo change).
- **Zero-downtime:** Render health-checks `/health`, keeps the old instance until the new one is healthy.
- **Rollback:** Render dashboard → Deploys → Rollback to the previous successful deploy (instant; re-run
  `db:migrate` only if the rollback crosses a schema change — prefer forward-only, additive migrations).

## Repo changes (dev → prod)

Host-agnostic; **all implemented and verified locally** (typecheck + lint + 813 tests green; production
server smoke-tested — full routing battery + the login → cookie → `/api/me` flow). None needed the account
values:

1. **Bind Render's `PORT`.** `services/server.ts` reads `API_PORT ?? 8601`; Render injects `PORT`. Change
   to `Number(process.env.PORT ?? process.env.API_PORT ?? 8601)`.
2. **Serve the SPA from Hono in production.** Add `@hono/node-server/serve-static` to `server.ts`, gated on
   `NODE_ENV === "production"`: static `/assets/*` (+ any extensioned path) from `dist/`, then the three
   HTML fallbacks (`/app*`→`dist/app/index.html`, `/p/*`→`dist/publish/index.html`, else
   `dist/index.html`). Port the fallback logic from `vite.config.ts:appSpaFallback`. Mount **after** the
   API routers so `/api/*` and `/health` win.
3. **Mount API routers under `/api`.** In `server.ts` change `app.route("/", router)` → `app.route("/api",
router)`; in `vite.config.ts` drop the proxy `rewrite` (keep the `^/api/` proxy target). Dev and prod
   then route identically. Verify the Stripe webhook path becomes `/api/billing/webhook`.
4. **`secure` cookie in prod.** `services/api/session.ts` sets `httpOnly`+`sameSite:"Lax"` but no `secure`.
   Add `secure: process.env.NODE_ENV === "production"`.
5. **Commit migrations.** `services/migrations/` is empty (dev uses `db:push`). Run `pnpm db:generate` to
   emit SQL, commit it, and let `preDeployCommand` run `db:migrate`. From here, schema changes ship as
   generated migrations, not `push`.
6. **Make `tsx` + `drizzle-kit` available at deploy/runtime.** The start command runs via `tsx` and
   pre-deploy via `drizzle-kit`; move both from `devDependencies` to `dependencies` so they're
   deterministically present regardless of dep pruning. Add `"start": "NODE_ENV=production tsx
services/server.ts"` to `package.json` scripts.
7. **`.node-version`** = `22`.
8. **`render.yaml`** at the repo root (above).

Nothing above changes rendering, the data model, or the AI runtime — it's purely the dev→prod seam.

> **Hardening follow-up (not launch-blocking):** running the server via `tsx` (esbuild JIT + tsconfig path
> aliases) is the pragmatic v1. The robust step later is to bundle `services/server.ts` with esbuild to a
> single JS file and run it with plain `node`, dropping `tsx` from runtime deps. Documented so it's a
> deliberate deferral, not an accident.

## First deploy runbook (Render + Neon + galleo.app)

Ordered, because the Blueprint must exist in the repo before Render can read it:

1. **Neon** — create a project (Postgres 16, region matching Render, e.g. Oregon). Copy the **direct**
   connection string (not `-pooler`) → this is prod `DATABASE_URL`. Create a `staging` branch for later.
2. **Push the code to `main`** so `render.yaml` is in the repo (this triggers no deploy yet — Render isn't
   connected).
3. **Render** — New → **Blueprint** → connect the repo. Render reads `render.yaml` and creates the `galleo`
   web service. In the setup, fill the `sync:false` secrets: `DATABASE_URL` (Neon), `APP_URL` (start with
   the service's `https://galleo.onrender.com`), `ANTHROPIC_API_KEY`, plus any optional media/mail keys.
   `SESSION_SECRET` is generated automatically.
4. **First deploy runs**: `pnpm build` → `pnpm db:migrate` (applies `0000_*` to the empty Neon DB) →
   `pnpm start` → health check `/health`. Watch the deploy log.
5. **Seed (optional)** — to get the demo login in prod, run `pnpm seed` once from a Render **Shell** (or a
   one-off job) with prod `DATABASE_URL`. Skip if you want an empty prod DB.
6. **Custom domain** — see below. After it resolves, update `APP_URL` → `https://galleo.app` and redeploy
   (env change restarts the service). Set the Stripe webhook (when enabling billing) to
   `https://galleo.app/api/billing/webhook`.

### Custom domain (galleo.app)

Render → the service → **Settings → Custom Domains** → add `galleo.app` **and** `www.galleo.app`. Render
shows the DNS targets; set them at your registrar:

- **Apex `galleo.app`** — an **ALIAS/ANAME** record to the Render target (or Render's A record IP if your
  DNS lacks ALIAS). Cloudflare/most modern DNS support ALIAS-style flattening at the apex.
- **`www`** — a **CNAME** to the Render target.

Render provisions TLS automatically (Let's Encrypt). One origin, so **no per-subroute DNS** — `/`, `/app`,
`/p/:slug`, `/api` are all just paths on `galleo.app`. `APP_URL=https://galleo.app` makes Stripe redirects
and public share links resolve correctly. (`www` → apex redirect is a one-line Render setting.)

## Staging

Cheap and near-isolated via Neon branching + a second Render service:

- **Neon:** create a `staging` **branch** off the prod branch — copy-on-write, scale-to-zero, ~free. Its
  own connection string → the staging service's `DATABASE_URL`. Reset it from prod anytime with one click.
- **Render:** a **second Web Service** on the Render **Free** plan (spins down after 15 min idle, ~1-min
  cold start — perfect for staging, $0), tracking a `staging` git branch (or manual-deploy from `main`),
  with `APP_URL` = its own `onrender.com` URL and `SESSION_SECRET` its own value.
- **Per-PR previews (upgrade, later):** Render **Preview Environments** (`previews:` in `render.yaml`)
  spin an ephemeral copy per PR — requires the **Pro workspace ($25/mo flat)**. Pair with Neon's GitHub
  integration for a branch-per-PR database. Skip for v1; the persistent Free staging service is enough.

## Cost

| Line                       | Launch                             | Notes                                                          |
| -------------------------- | ---------------------------------- | -------------------------------------------------------------- |
| Render prod web service    | **$7/mo** (Starter, 512 MB)        | one-click bump to Standard 2 GB ($25) if AI/export OOMs        |
| Render staging web service | **$0** (Free plan)                 | spins down when idle                                           |
| Neon Postgres              | **$0** (Free: 0.5 GB, 10 branches) | → Launch usage (~$5–19) as data grows                          |
| Render workspace           | **$0** (Hobby)                     | → Pro ($25 flat) only for per-PR previews / autoscaling        |
| **Total to start**         | **~$7/mo**                         | + metered AI provider spend (Anthropic/Google), billed by them |

"Easy scalability": Render scaling is vertical (pick a bigger instance, no redeploy) or horizontal (up to
100 instances, CPU/mem autoscaling on the Pro workspace); Neon autoscales compute and scales to zero. The
first real bottleneck is media storage, not compute (below).

## Scale path (in the order they'll bite)

1. **Memory** — heavy deps (`pptxgenjs`, `pdf-lib`, `jszip`, `wawoff2`, AI SDKs) + export/generation are
   memory-hungry. Watch Render metrics; Starter→Standard is one click.
2. **Media off Postgres → object storage.** Assets are base64 in `assets.data`, served through Node at
   `/api/media/asset/:id` with no CDN — this bloats the DB and puts image bytes on the app process. Migrate
   to **Cloudflare R2** (zero egress) behind the existing `asset:`-reference refinement (`architecture.md`
   Planned) when uploads grow.
3. **CDN in front** — put **Cloudflare** (free, unlimited bandwidth) ahead of the single service: caches
   `/assets/*`, adds DDoS/TLS, and — unlike the rejected proxies — passes SSE through un-buffered. Zero code
   change, keeps one origin.
4. **Multiple instances** — switch `DATABASE_URL` to the Neon pooled endpoint + `prepare:false` (see pooler
   note), enable Render autoscaling.
5. **Background jobs** — the reserved Redis/queue slot, when generation moves off the request path.

## Operational notes

- **Deploy:** push to `main` → Render builds → `db:migrate` → health check → cutover. Watch the deploy log
  in the Render dashboard.
- **Logs / metrics:** Render dashboard per service (stdout + CPU/mem). The app obeys the repo's no-`console`
  rule, so app logging is intentionally quiet — add a structured logger when we need request traces.
- **Secrets rotation:** rotate `SESSION_SECRET` invalidates all sessions (the token is `HMAC(userId)`);
  rotate provider keys in the dashboard, no redeploy needed (env change triggers a restart).
- **DB backups:** Neon retains history for point-in-time restore per its plan; branch before risky
  migrations.

## Security notes (carried from the audit)

- Add `secure` to the session cookie in prod (repo change #4).
- The session token is an **unexpiring `HMAC(userId)`** with no rotation/revocation and no per-session
  entropy — acceptable for launch, but track hardening (expiry claim + rotation) as a follow-up issue.
- `SESSION_SECRET` must be a real random value in prod (Render `generateValue`), never the dev default.
- Stripe webhook signature is verified (`services/billing/stripe.ts`); ensure `STRIPE_WEBHOOK_SECRET`
  matches the prod endpoint.

## What we need from the accounts

**Neon**

1. A project (Postgres **16**), region matching Render (e.g. US-West / Oregon).
2. The **direct** connection string for the default (prod) branch → becomes `DATABASE_URL`.
3. A `staging` branch (for the staging service's `DATABASE_URL`).

**Render**

1. Connect this GitHub repo (grant access) so the Blueprint can deploy.
2. Preferred **region** (co-locate with Neon).
3. Confirm the **Hobby** workspace for launch (Pro $25 only if you want per-PR previews now).
4. Set the **secret** env vars in the dashboard (everything marked Secret above) — the repo supplies
   `render.yaml` and the non-secret values.
5. `APP_URL`: the `https://galleo.onrender.com` subdomain for the first deploy, then `https://galleo.app`
   once the custom domain resolves.

**Domain (galleo.app)** — DNS at the registrar per **Custom domain** above (apex ALIAS + `www` CNAME to the
Render targets); Render issues TLS.

**Stripe (only when enabling paid plans)** — the four price ids + secret key + a webhook endpoint at
`https://galleo.app/api/billing/webhook` → its signing secret.

## Planned / deferred

- Per-PR preview environments (Render Pro + Neon branch-per-PR).
- Object storage (R2) for media; `asset:` references replacing raw URLs.
- Cloudflare CDN in front of the service.
- Compiled server bundle (esbuild) replacing `tsx` at runtime.
- Structured request logging + error tracking (e.g. Sentry/Rollbar).
- Redis/queue for background generation + export jobs.
- Custom domains for artifacts/publish; multi-region.
