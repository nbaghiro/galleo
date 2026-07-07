# Build: Shared workspace brand kit

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
features.ts` has the `FEATURES` registry (`status: "live"|"beta"|"planned"`; a `planned` feature is OFF for
everyone). Gate on the backend:

```ts
import { featuresFor } from "../features";
import { can } from "@model/features";
if (!can(featuresFor(ws), "workspaceThemes"))
    return c.json(
        { error: "Shared brand kit is a Premium feature — upgrade.", upgrade: true },
        402,
    );
```

`GET /features` returns `{ features, status }`; add `app/stores/features.ts` (`useFeatures()`) +
`api.getFeatures()` if you need frontend gating (badge `planned` as "coming soon"). **Your plan grant is
already set** (Premium) in `model/billing.ts` — **do NOT edit it**. When built + verified, flip **only**
`FEATURES.workspaceThemes.status` from `"planned"` → `"live"`.

**Do NOT touch (billing session owns):** `model/billing.ts`, `services/api/billing.ts`,
`services/billing/stripe.ts`, `services/features.ts`, the resolver in `model/features.ts` (only your one
`status` line), `.env`. `services/schema.ts` is co-edited (billing is adding `seats`/`feature_overrides`)
— keep additions additive and coordinate the `pnpm db:push`.

---

## The task

**Goal:** a workspace-wide **default theme** (optionally a pinned kit) applied to newly created artifacts,
so a team's brand stays consistent. Small and self-contained.

**Plan grant:** `workspaceThemes` on **Premium** (already set); `status: "planned"` → flip to `"live"`.

**What exists:** per-workspace custom themes fully work — the `themes` table with nullable `workspaceId`
(`services/schema.ts:99-106`), `POST /themes` gated on `customThemes` (`services/api/themes.ts:40`), the
registry `model/themes/library.ts` (`resolveTheme`, 52 built-ins, `registerThemes`), `app/theme.ts`
(custom-theme sync), `app/views/ThemeEditor.tsx`. But themes apply **per-artifact** (`artifacts.themeId`)
or as the app-chrome theme — there is **no workspace default**.

**Build:**

- Add a `default_theme_id text` column to `workspaces` (`services/schema.ts:27-43`) — coordinate the
  `db:push` with the billing session (it's also adding `seats`/`feature_overrides`; batch it).
- A route to set the workspace default theme (e.g. `PUT /workspace/default-theme`), gated on
  `can(featuresFor(ws), "workspaceThemes")`.
- Thread the default into artifact creation — `POST /artifacts` hardcodes `themeId ?? "studio"`
  (`services/api/artifacts.ts:159`) and `blankArtifact(..., "studio")` (`app/stores/library.ts:143`); both
  should fall back to the workspace's `default_theme_id` when set.
- Frontend: a "Set as workspace default" action in `ThemeEditor` (or a workspace-settings area),
  Premium-gated (locked + "coming soon" below Premium).

**Acceptance:** on Premium, set a workspace default theme → new artifacts open in it; the control is
locked/"coming soon" on Free/Pro.

**Finish:** flip `FEATURES.workspaceThemes.status` → `"live"`; `pnpm typecheck && pnpm lint`; verify the
gate end-to-end.
