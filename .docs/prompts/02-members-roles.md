# Build: Team members, roles & invites

## Shared context

You're working in **Galleo** — a TypeScript AI content tool where one engine renders the same block tree
as a **deck, document, or website**. Read `.docs/architecture.md` and `AGENTS.md`
before starting.

**Layering law (ESLint-enforced):** `model ← canvas ← editor ← app`; `services` imports only `model`.
`model/` is pure (no IO, no framework). `editor/` must **not** import `app/` — cross-boundary calls use an
IoC hook pattern. Path aliases: `@model @canvas @editor @themes @engine @elements`. **No `index.ts`
barrels** — named files only.

**Style:** 4-space indent, double quotes, semicolons, `printWidth` 100, **no `any`, no `console`**.
`strict` TS. Verify with `pnpm typecheck` **and** `pnpm lint` before done.

**Run/verify:** `pnpm dev` (SPA :8600), `pnpm api` (backend :8601, dev-proxied at `/api/*`). Postgres in
docker; schema `services/schema.ts`, pushed with `pnpm db:push`. Seed login: `demo@galleo.app` /
`galleo-demo-2026` (`pnpm seed`).

**Backend router pattern** (`services/api/*.ts`): `export const x = new Hono()` with full paths; mount in
the array in `services/server.ts:17`. Every authenticated route opens:

```ts
import { getCookie } from "hono/cookie";
import { SESSION_COOKIE } from "../auth";
import { currentUser, currentWorkspace } from "./context";
const u = await currentUser(getCookie(c, SESSION_COOKIE));
if (!u) return c.json({ error: "unauthorized" }, 401);
const ws = await currentWorkspace(u.id);
if (!ws) return c.json({ error: "no workspace" }, 400);
```

Auth is a signed cookie `galleo_session` = `"<userId>.<hmac>"` (`services/auth.ts`). Helpers in
`services/api/context.ts`.

**API client** (`app/api.ts`): add `getFoo: () => req<Shape>("/foo")`; `req<T>()` throws `ApiError(status,
msg)`. **Store** (`app/stores/foo.ts`): signal + exported getter + async `loadFoo()`. **View/route**: add
to `<Router base="/app">` in `app/App.tsx:66-76`.

**⚠️ Entitlement gating — a parallel session owns billing; do NOT touch billing internals.** Capabilities
are gated by `model/features.ts` (`FEATURES` registry with `status: "live"|"beta"|"planned"`;
`resolveFeatures(planId)` → `Features`; `can(f,key)` / `limit(f,key)` / `withinLimit(f,key,current)`). This
feature's flag `maxMembers` is a **numeric** feature and is already `status: "live"` — enforce with:

```ts
import { featuresFor } from "../features";
import { withinLimit } from "@model/features";
if (!withinLimit(featuresFor(ws), "maxMembers", currentMemberCount))
    return c.json({ error: "Seat limit reached — add a seat to invite more.", upgrade: true }, 402);
```

`GET /features` returns `{ features, status }`; the frontend has **no features store yet** — add
`app/stores/features.ts` (`useFeatures()`) + `api.getFeatures()` if you need frontend gating.

**Do NOT touch (billing session owns):** `model/billing.ts`, `services/api/billing.ts`,
`services/billing/stripe.ts`, `services/features.ts`, the resolver in `model/features.ts`, `.env`. Schema
(`services/schema.ts`) is co-edited — keep additions additive; run `pnpm db:push` and mention it.

**Canonical gated-UI example:** the export gate — `editor/editor.ts:70-75`, `app/views/EditorView.tsx:47-
50,75`, `editor/chrome/Topbar.tsx:171-248`.

**Known bug to FIX here:** `GET /artifacts/:id` and `PATCH /artifacts/:id` (`services/api/artifacts.ts:168,
244`) have **no workspace scoping** — any user can read/write any artifact by id. With real multi-member
workspaces this is a security hole; scope artifact read/write by workspace membership.

---

## The task

**Goal:** invite teammates into a workspace, assign roles (owner / admin / editor / viewer), and manage
members. **The seat _billing_ (Stripe `quantity`, buying a seat) is owned by the billing session (task
#13) — you build membership + roles + UI and stop at the seat cap.**

**Plan grant / cap:** `maxMembers` is already `status: "live"` but **never enforced** anywhere. The base
plan value = 1; on paid tiers the real cap will be `workspace.seats` (a column the billing session adds).
Enforce with `limit(featuresFor(ws), "maxMembers")` for now, and leave a clearly-commented seam where the
billing session swaps in `workspace.seats`. **No `status` flip needed** (already live).

**Backend** — the `members` table exists (composite pk `[workspaceId,userId]`, `role` default "editor",
`services/schema.ts:45-58`) but only `firstWorkspaceId` reads it (role ignored) and seed inserts one
"owner". Build `services/api/members.ts`:

- `GET /members` — list workspace members (join `users`).
- `POST /members/invite` — create an invite in a new `invites` table (`token`, `workspaceId`, `email`,
  `role`, `expiresAt`); return the invite link. (Email delivery is out of scope — there's a reserved
  `services/queue/` placeholder; just return the link.)
- `POST /invites/:token/accept` (authed as invitee) — insert into `members`, consume the invite; enforce
  the seat cap `withinLimit(features, "maxMembers", currentCount)` → 402 when full.
- `PATCH /members/:userId` (role change, owner/admin only), `DELETE /members/:userId` (can't remove the
  owner). Add a role-precedence helper (owner > admin > editor > viewer) and apply it to authorization.

**Frontend** — a Team/Members view (list · invite with a role picker · remove · change role); the invite
action shows an upgrade prompt when at the seat cap.

**Coordination:** the billing session owns `workspace.seats`, seat↔Stripe-`quantity` sync, and the
owner/admin gate on billing-mutation routes. You own invites, roles, member CRUD/UI, and permission
enforcement.

**Finish:** run `pnpm typecheck && pnpm lint`; verify an invite → accept → member appears with the right
role; seat cap blocks past the limit; roles gate destructive actions; the cross-tenant artifact bug is
fixed.
