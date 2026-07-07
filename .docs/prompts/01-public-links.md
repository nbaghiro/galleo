# Build: Publish & public share links

## Shared context

You're working in **Galleo** — a TypeScript AI content tool where one engine renders the same block tree
as a **deck, document, or website**. Read `.docs/architecture.md`, `.docs/data-model.md`, and `CLAUDE.md`
before starting.

**Layering law (ESLint-enforced):** `model ← canvas ← editor ← app`; `services` imports only `model`.
`model/` is pure (no IO, no framework). `editor/` must **not** import `app/` — cross-boundary calls use an
IoC hook pattern (see the export-gate example). Path aliases: `@model @canvas @editor @themes @engine
@elements`. **No `index.ts` barrels** — named files only.

**Style:** 4-space indent, double quotes, semicolons, `printWidth` 100, **no `any`, no `console`**.
`strict` TS (`noUncheckedIndexedAccess`). Verify with `pnpm typecheck` **and** `pnpm lint` before done.

**Run/verify:** `pnpm dev` (SPA at :8600), `pnpm api` (backend at :8601, dev-proxied at `/api/*`). Postgres
runs in docker; schema is `services/schema.ts`, pushed with `pnpm db:push` (drizzle-kit, no migration
files). Seed login: `demo@galleo.app` / `demo1234` (`pnpm seed`).

**Backend router pattern** (`services/api/*.ts`): `export const x = new Hono()` carrying full paths; mount
it in the router array in `services/server.ts:17`. Every authenticated route opens:
```ts
import { getCookie } from "hono/cookie";
import { SESSION_COOKIE } from "../auth";
import { currentUser, currentWorkspace } from "./context";
const u = await currentUser(getCookie(c, SESSION_COOKIE));
if (!u) return c.json({ error: "unauthorized" }, 401);
const ws = await currentWorkspace(u.id);        // full row; use firstWorkspaceId(u.id) for scope-only
if (!ws) return c.json({ error: "no workspace" }, 400);
```
Auth is a signed cookie `galleo_session` = `"<userId>.<hmac>"` (`services/auth.ts`; `makeSession`,
`readSession`). Helpers live in `services/api/context.ts`.

**API client** (`app/api.ts`): add a method to the `api` object — `getFoo: () => req<Shape>("/foo")`.
`req<T>()` throws `ApiError(status, msg)` on non-2xx (branch on `e.status`; 402 = upgrade). Composite
response shapes are declared as interfaces at the top of `api.ts`. **Store** (`app/stores/foo.ts`):
`const [foo, setFoo] = createSignal<T|null>(null); export { foo }; export async function loadFoo(){ try {
setFoo(await api.getFoo()); } catch {} }`. **View/route**: add `<Route path="/foo" component={FooView} />`
inside `<Router base="/app">` in `app/App.tsx:66-76`.

**⚠️ Entitlement gating — the key integration. A parallel session owns billing; do NOT touch billing
internals.** Capabilities are gated by `model/features.ts`:
- `FEATURES` registry: every capability has `status: "live" | "beta" | "planned"`. **A `planned` feature is
  OFF for everyone regardless of plan.** `resolveFeatures(planId)` → resolved `Features`; accessors
  `can(f, key)`, `limit(f, key)` (`-1` = unlimited), `withinLimit(f, key, current)`.
- **Backend gate** via `services/features.ts`:
  ```ts
  import { featuresFor } from "../features";
  import { can } from "@model/features";
  if (!can(featuresFor(ws), "publicLinks"))
      return c.json({ error: "Public links are a paid feature — upgrade.", upgrade: true }, 402);
  ```
- **`GET /features`** returns `{ features, status }`. The frontend has **no features store yet** — add
  `app/stores/features.ts` (`useFeatures()` returning resolved `Features`) + `api.getFeatures()`, and badge
  `planned` capabilities "coming soon" (`PricingView.tsx:216-220` is the visual precedent).
- **Your plan grant is already set** in `model/billing.ts` `PLANS` (Pro + Premium). **Do NOT edit
  `billing.ts`.** When built + verified, flip **only** `FEATURES.publicLinks.status` from `"planned"` →
  `"live"` (one line).

**Do NOT touch (billing session owns):** `model/billing.ts`, `services/api/billing.ts`,
`services/billing/stripe.ts`, `services/features.ts`, the resolver logic in `model/features.ts` (only your
one `status` line), `.env` Stripe vars. `model/features.ts` + `services/schema.ts` are co-edited — keep
changes additive; run `pnpm db:push` and mention it if you add tables/columns.

**Canonical gated-UI example to copy:** `editor/editor.ts:70-75` (`features` signal + `onUpgrade`/
`requestUpgrade` at :303-309) · `app/views/EditorView.tsx:47-50,75` (pushes limits via `setFeatures`,
registers `onUpgrade`→`/pricing`) · `editor/chrome/Topbar.tsx:171-248` (`ExportMenu` locks paid formats).

**Known bug to respect:** `GET /artifacts/:id` and `PATCH /artifacts/:id` (`services/api/artifacts.ts:168,
244`) have **no workspace scoping** — cross-tenant read/write by id. This feature exposes artifacts
publicly, so scope by the owning workspace and fix this.

---

## The task

**Goal:** let a user publish an artifact to a public, unauthenticated URL (`/p/:slug`) that renders a
read-only view, with visibility (private / unlisted / public) and optional password. This is the
foundation for Analytics (`04`) and Custom domains (`05`).

**Plan grant:** `publicLinks` on **Pro + Premium** (already set); `FEATURES.publicLinks.status` is
`"planned"` — flip to `"live"` when done.

**Backend** — the tables exist but are entirely unwired (`services/schema.ts`): `links` (`slug` unique,
`artifactId`, `visibility` default "private", `password`, `publishedVersionId→versions`) at `:137-147`;
`versions` (`artifactId`, `content` jsonb snapshot, `label`, `authorId`) at `:88-97`;
`artifacts.publishedVersionId` (`:80`, a dead column today). Build `services/api/links.ts` (mount in
`server.ts`):
- `POST /artifacts/:id/publish` — **scope to the owner workspace** (fix the cross-tenant bug); snapshot
  `artifacts.draftContent` into a new `versions` row; set `artifacts.publishedVersionId`; upsert a `links`
  row (generate a short unique `slug`); set `visibility`/`password`. Gate on `can(featuresFor(ws),
  "publicLinks")`.
- `GET /links/:artifactId` (authed) — current publish state for the Share UI. `PATCH /links/:id`
  (visibility/password). `POST /artifacts/:id/unpublish`.
- `GET /p/:slug/content` — **UNAUTHENTICATED** — resolve slug → published `versions.content`; enforce
  visibility (`private` → 404) and password; return `{ title, content, theme, format, branded }`. Compute
  `branded` from the **owner workspace's** entitlement: `!resolveFeatures(ownerWs.plan).removeBranding`
  (an anonymous viewer has no plan of its own).

**Frontend** — a chrome-free, **unauthenticated** viewer. The render primitives are editor-free and
reusable: `paintSectionStack` / `slideElement` (`canvas/render/backends.ts`, `canvas/render/present.ts`);
`app/views/PresentView.tsx` is a near-template (its `Present` component paints purely from an artifact).
The app router is under `/app` **behind the auth gate** (`app/App.tsx:64-77`), so the public viewer must
live **outside** that gate — add a public route (a small public segment, or a route in the website build,
which currently has no router). Branding: stamp the watermark exactly like the export path
(`canvas/render/export.ts` `ExportOptions.brand`) when `branded` is true. Add a **Share** control in the
editor (`editor/chrome/Topbar.tsx` + a modal via the media-picker singleton pattern) — publish / copy link
/ visibility / password — gated (locked + "upgrade" when `!can(features, "publicLinks")`).

**Acceptance:** publish → get `/p/<slug>` → open in a fresh incognito window (no session) → see the
rendered read-only artifact; `private` → 404; password links prompt; a free-tier owner's public page
carries the "Made with Galleo" mark, a Pro/Premium owner's does not.

**Finish:** flip `FEATURES.publicLinks.status` → `"live"`, run `pnpm typecheck && pnpm lint`, and verify
the gate end-to-end (works on Pro/Premium, locked/"coming soon" on Free).
