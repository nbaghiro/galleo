# Build: Shared workspace brand kit

## Shared context

You are working in **Galleo**, a TypeScript AI content tool where one engine renders the same block tree
as a **deck, document, or website**. Read `AGENTS.md` first, then `.docs/architecture.md`, then the
companion doc closest to this feature (`.docs/workspaces.md` for the tenant, `.docs/frontend.md` for the
UI library, `.docs/testing.md` for the test contract).

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
helpers in `services/utils/http.ts`, each returning the Response to send or `null`:

```ts
const denied = requireFeature(c, ws, "workspaceThemes", "Shared brand kit is a Premium feature.");
if (denied) return denied;
```

`checkLimit(c, ws, key, current, message?)` is the numeric equivalent. On the frontend, `GET /features`
loads into `app/stores/features.ts`, whose `can(key)` and `statusOf(key)` are the only correct read: they
carry both the workspace's `feature_overrides` and the launch status, which `limitsFor(plan)` does not.
Every plan wall renders through `app/components/Upgrade.tsx`, where `UpgradeNotice` explains what is
blocked and `UpgradeButton` derives the selling tier from `upgradeFor`; both show "Coming soon" instead of
an upgrade path while the flag is `planned`.

Billing itself is built, so there is no parallel session to coordinate with, but `model/billing.ts` is
shared and load-bearing. Keep your change to it to the single `FEATURES["workspaceThemes"].status` line
unless the plan grant is genuinely wrong, and say so in your report if you touch anything else.

**Frontend shape.** `app/api.ts` is the one wire boundary (`req<T>()` throws `ApiError(status, msg)`, and
402 means upgrade). App state lives one file per concern in `app/stores/`, views in `app/views/`, and
routes are registered inside `<Router base="/app">` in `app/App.tsx`.

---

## Status

Not started, as of this audit. There is no `default_theme_id` column, no route that sets a
workspace-level theme, and no UI for one. `FEATURES.workspaceThemes.status` is `"planned"` and the plan
grant is already `true` on Premium only (`model/billing.ts`), which is what this feature wants.

## Already built, do not rebuild

- **Per-workspace custom themes.** The `themes` table (`services/db/schema.ts`, `workspace_id` is
  `notNull`, tokens in a `jsonb` column), `services/api/themes.ts` (`GET /themes`, plus `POST`/`PATCH`/
  `DELETE`, where `POST` is gated with `requireFeature(c, ws, "customThemes", …)`), and
  `services/core/themes.ts` behind it.
- **The theme contract and registry** in the single file `model/theme.ts` (`@themes`): `Tokens`,
  `resolveTheme`, `THEME_LIST`, `THEMES`, `DEFAULT_THEME`, and `registerThemes` for custom themes.
- **The client side of custom themes.** `app/stores/theme.ts` owns the app-chrome theme plus the
  custom-theme CRUD that registers stored themes into the `@themes` registry, and
  `app/views/ThemeEditor.tsx` is the editing surface.
- **A workspace settings surface and a settings write path.** `app/views/WorkspaceSettingsView.tsx` at
  `/settings` already renders admin-only policy sections, and `PATCH /workspace`
  (`services/api/workspace.ts`, `requireRole("admin")`) already applies a partial patch validated by a
  local `zSettings` schema into `updateWorkspace` (`services/core/workspaces.ts`). The typed patch shape
  is `WorkspaceSettings` in `model/workspace.ts`, alongside `defaultArtifactAccess`, `publishPolicy`, and
  `memberCreditCap`. `app/stores/workspace.ts` exposes `updateWorkspaceSettings` for the client half.

That existing settings path is the reason this feature is small: it wants one more field on a patch
route that already exists, not a new router.

## Goal

A workspace-wide default theme, applied to newly created artifacts, so a team's output stays on brand
without every author picking the theme by hand.

Scope this pass to the default theme only. A fuller brand kit (a logo, an uploaded font, locked tokens a
member cannot override) is a product decision that has not been made, and the entitlement flag is named
`workspaceThemes` rather than `brandKit` for that reason. If you think the wider kit is the right next
step, say so in your report rather than building it.

## Build

- **Schema.** Add `default_theme_id text` to `workspaces` and generate a migration
  (`pnpm db:generate`, then `pnpm db:migrate`). The value is either a built-in theme id or a `themes.id`
  uuid, matching how `artifacts.theme_id` already works, so it stays a plain `text` column with no
  foreign key. Add the field to `WorkspaceSettings` in `model/workspace.ts` as
  `defaultThemeId: string | null`.
- **Write path.** Extend `zSettings` and the `PATCH /workspace` handler rather than adding a route. The
  handler is already admin-gated, so the new part is the entitlement gate: when `defaultThemeId` is
  present in the body, call `requireFeature(c, ws, "workspaceThemes", …)` and return the 402 it hands
  back. Gate the field, not the whole route, or setting an unrelated policy would start failing on Pro.
  Validate that a custom-theme uuid actually belongs to this workspace before storing it, since a
  cross-workspace id would leak a theme by reference.
- **Read path.** `GET /workspace` shapes the settings it returns in `services/api/workspace.ts`; add the
  field there so the settings view can render the current value.
- **Apply it at creation.** `createArtifact` in `services/core/artifacts.ts` resolves the theme as
  `body.themeId ?? "studio"`. Make the server the authority: fall back to the workspace's
  `default_theme_id` before `"studio"`, so every creation path (blank, template, AI generation, duplicate)
  inherits it without each caller remembering. The client's `blankArtifact` in `app/stores/library.ts`
  also passes `"studio"` explicitly; decide whether it should stop sending a theme so the server default
  wins, and be explicit about which side is authoritative rather than leaving both guessing.
- **Frontend.** Put the control in `WorkspaceSettingsView.tsx` beside the other workspace policies, since
  that is where an admin already goes to set workspace-wide behaviour, and wrap it in `UpgradeNotice`
  with `feature="workspaceThemes"` so it reads as "Coming soon" until you flip the status and as an
  upgrade prompt on Free and Pro. A "Set as workspace default" action in `ThemeEditor.tsx` calling the
  same store function is a reasonable second entry point, but the settings page is the one that has to
  exist.

## Tests

`pnpm test:int` is where this belongs, following `services/api/__tests__/workspace.itest.ts` and
`themes.itest.ts`. Worth covering: a Premium admin sets the default and a newly created artifact opens in
it; a Pro workspace gets 402 with `upgrade: true` for that field while a `publishPolicy` patch in the same
shape still succeeds; a plain member gets 403 from `requireRole("admin")`; a custom-theme id from another
workspace is refused.

## Acceptance

On Premium, an admin sets the workspace default theme and a new artifact opens in it. On Free and Pro the
control is visibly locked with an upgrade path. Before the status flip, every plan sees "Coming soon".

## Finish

Flip `FEATURES.workspaceThemes.status` from `"planned"` to `"live"`, run every gate in the Shared context
section, and verify the entitlement end to end on all three plans. Update `.docs/workspaces.md` (the
gates table lists `workspaceThemes` as enforced nowhere) and `.docs/architecture.md`'s data-model table
for the new column.
