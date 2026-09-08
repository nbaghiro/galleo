# Galleo — Workspaces: tenancy, plans, billing, credits, membership

> The current-state reference for the tenant: what a workspace row holds, how one is created and
> resolved on every request, how a plan becomes a set of entitlements, how Stripe keeps the row in
> step, how credits are metered against it, and who may do what. Companion docs:
> `architecture.md` (the data model and the layering law), `ai.md` (what the credit gate is paying
> for), `frontend.md`, `loading.md`, `testing.md`.

## What a workspace is

A workspace is three things at once, and keeping them in one row is deliberate:

- the **tenancy key**: every scoped table carries `workspace_id`, and no query crosses it;
- the **billing entity**: one Stripe customer and one subscription per workspace, never per user;
- the **credit pool**: one monthly allowance, shared by everyone in it.

Users are people, workspaces own content, and `members` joins them with a role. A person can own
several workspaces and be a member of others; `users.active_workspace_id` picks the one the app opens.
An individual on Free is a workspace for one person, and a team is a workspace on Premium with as many
members as it likes, so there is one code path rather than a personal one and a team one.

## The pieces

| Concern                                                             | File                                                                                                                                                   |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| The row, its columns and indexes                                    | `services/db/schema.ts`                                                                                                                                |
| Plan catalog, feature registry, entitlement resolver, the grant     | `model/billing.ts`                                                                                                                                     |
| Cost units, the credit/USD anchor, `usdOfUsage`                     | `model/credits.ts`                                                                                                                                     |
| Tool catalog, `estimateCost` / `gateCost`                           | `model/tools.ts`                                                                                                                                       |
| Artifact access levels + `accessFor`                                | `model/artifact.ts`                                                                                                                                    |
| Roles, publish policy, the auth DTOs, `UserPrefs`                   | `model/workspace.ts`                                                                                                                                   |
| Create a workspace, resolve the current one                         | `services/core/accounts.ts`                                                                                                                            |
| The account itself (profile, password, links, prefs)                | `services/core/accounts.ts`, `services/api/account.ts`                                                                                                 |
| Members, invites, ownership                                         | `services/core/workspaces.ts`                                                                                                                          |
| Balances, ledger rows, the window                                   | `services/core/ledger.ts`                                                                                                                              |
| AI spend policy (reserve, meter, settle)                            | `services/core/spend.ts`                                                                                                                               |
| Plans, Stripe, the webhook, ledger paging                           | `services/core/billing.ts`                                                                                                                             |
| The 402 guards (`requireFeature` / `checkLimit`)                    | `services/utils/http.ts`                                                                                                                               |
| `requireUser` / `requireWorkspace` / `requireRole` / `gateArtifact` | `services/api/middleware.ts`                                                                                                                           |
| `/billing/*`                                                        | `services/api/billing.ts`                                                                                                                              |
| `/workspace/*`, `/invites/*`                                        | `services/api/workspace.ts`                                                                                                                            |
| `/features`                                                         | `services/api/features.ts`                                                                                                                             |
| `/me/*`                                                             | `services/api/account.ts`                                                                                                                              |
| Client stores                                                       | `app/stores/workspace.ts`, `app/stores/billing.ts`, `app/stores/features.ts`, `app/stores/auth.ts`                                                     |
| Surfaces                                                            | `app/views/WorkspaceSettingsView.tsx`, `AccountSettingsView.tsx`, `InviteView.tsx`, `app/components/{PlanPanel,BillingPanel,UpgradePlans,Sidebar}.tsx` |
| The demo universe                                                   | `services/db/seed/` (the data), `services/db/seed.ts` (the writer)                                                                                     |

## The row (`workspaces`)

| Column                                          | Meaning                                                                                                         |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `name`                                          | display name; renamable by admin and owner                                                                      |
| `slug` (unique)                                 | generated from the owner's email local part plus a random tail (`uniqueSlug`), or pinned (the seed pins `demo`) |
| `owner_id → users`                              | the single source of ownership; the `members.role` column never decides it                                      |
| `plan`                                          | `free` \| `pro` \| `premium`, default `free`                                                                    |
| `plan_interval`                                 | `month` \| `year` while subscribed, for display and the interval switch; null when there is no subscription     |
| `plan_period_end`                               | the current Stripe period end, for display                                                                      |
| `cancel_at_period_end`                          | a cancel is parked here; the plan itself does not change until Stripe deletes the subscription                  |
| `stripe_customer_id` / `stripe_subscription_id` | created lazily on first checkout; the customer id survives cancellation so a re-subscribe reuses it             |
| `ai_credits_balance`                            | the one credit counter: a balance, added to at each window and by a purchase, never cleared                     |
| `purchased_credits`                             | the bought share still banked, which the rollover clip never touches                                            |
| `credits_started_at` / `credits_reset_at`       | the bounds of the current window; every writer of one sets both                                                 |
| `feature_overrides` (jsonb)                     | a per-workspace `FeatureOverrides` patch merged over the plan by the resolver                                   |

Related tables: `members` (composite pk on workspace + user, `role`), `invites` (unique per workspace
and email, `token_hash` only), `credits` (the ledger; its unique `key` column is the idempotency
claim every grant makes).

## Lifecycle: create, resolve, switch

`createWorkspaceForUser(userId, { name, slug?, slugBase?, plan? })` in `services/core/accounts.ts` is
the only writer. It inserts the row with `...freshCreditWindow(plan)` and then inserts one `members`
row with `role: "owner"`. `provisionUser` calls it on every signup (password or OAuth) with the name
`${who}'s Workspace`, so a user always has exactly one workspace before their first request.

`freshCreditWindow()` matters more than it looks: the column defaults are `defaultNow()`, so a row
inserted without it is born with `credits_reset_at = now`, meaning already lapsed. It also opens the
balance on the plan's grant, since a balance born at zero could not generate until its first roll.

Resolution runs per request. `requireWorkspace` (`services/api/middleware.ts`) reads the session user
and calls `currentWorkspace(userId)`, which selects every membership joined to its workspace ordered by
`members.created_at`, picks the one matching `users.active_workspace_id`, and otherwise falls back to
the oldest membership. It returns 400 `{ error: "no workspace" }` when there is none.

`currentWorkspace` also calls `rollIfLapsed` on the row it is about to return. There is no cron, so
**reading the workspace is what grants the monthly credits**, on every plan. That is why a route that
only needs the id still goes through `requireWorkspace` and reads `ws.id` rather than looking the row
up itself.

Switching is `POST /workspace/switch`: `switchWorkspace` verifies a `members` row exists and then sets
`users.active_workspace_id`. The client store does `window.location.href = "/"` rather than refetching,
because every store (library, billing, themes, features) is scoped to the workspace and a full reload is
the cheap way to invalidate all of them. `leaveWorkspace` reloads for the same reason.

## Plans and entitlements (`model/billing.ts`)

### The catalog

`PLANS` is one record keyed by `PlanId` (`free` | `pro` | `premium`), and every lever is a field:
`billing` (the two flat prices), `ai` (`monthlyCredits`), `account` (`maxArtifacts`, `storageMb`,
`maxMembers`), and `features` (the boolean and enum gates).

One flat price buys the whole workspace, so a plan is one Stripe price per interval and a
subscription is one line at quantity one. Free and Pro are for one person (`maxMembers` 1); Premium
holds any number of members on one shared pool of credits. There are no seats: how many people a
plan may hold is a plan feature like any other, and how much credit they share is the plan's grant.
Stripe price ids are never in this file: plans resolve from `STRIPE_PRICE_{PLAN}_{INTERVAL}`, the
credit from `STRIPE_PRICE_CREDIT`.

|                                           | Free             | Pro                | Premium               |
| ----------------------------------------- | ---------------- | ------------------ | --------------------- |
| Price                                     | $0               | $20/mo, $16 annual | $99/mo, $82 annual    |
| Members                                   | 1                | 1                  | unlimited             |
| Credits a month                           | 300              | 1,200              | 5,000                 |
| Artifacts / storage                       | 10 / 500MB       | unlimited / 20GB   | unlimited / unlimited |
| Export, branding                          | PNG, PDF, marked | all five, no mark  | all five, no mark     |
| Custom themes, public links               | no               | yes                | yes                   |
| Audio (narration, designed voices, music) | no               | yes                | yes                   |
| Analytics, API access                     | no               | no                 | yes                   |
| Buy credits                               | no               | yes                | yes                   |

The allowances are sized against the yearly price, the thinnest way to pay, so every route clears an
80% margin floor; `model/__tests__/billing.test.ts` holds that, the near-parity of the per-credit
rates across plans, and the rule that a bought credit costs more than any plan's own.

### The resolver

Enforcement never reads `plan.features` directly. It reads a resolved `Features` object:
`resolveFeatures(planId, overrides?)` is the plan's value with the workspace's `feature_overrides`
patch on top, key by key, so an override can widen a feature or narrow it. Every key in the set is
enforced somewhere; there is no launch registry, because a feature that is not built is not in the
catalog.

Readers are `can(f, key)`, `limit(f, key)` (`-1` = unlimited), and `withinLimit(f, key, current)`
(strict `current < cap`, always true when unlimited). `FEATURES` carries each key's label and
description, which is what a wall names.

Two wrappers take a stored row rather than a plan id. `featuresFor(ws)` reads `ws.plan` plus
`ws.featureOverrides`; `grantFor(ws)` is the plan's `monthlyCredits`, or the `includedCredits`
override when one is set, which replaces the grant and is the support lever
("this workspace gets 5,000 a month"). Both take a `PlanBearer`, declared structurally so the backend
can hand a drizzle row straight in without the contract knowing that a database exists.

### Why the resolver lives in `@model`

The services layer law is `api → core → db → utils`, and shared code moves down, never up. The
entitlement resolver has two callers on opposite sides of the wire: `services` gates against it, and
`app` renders locks and badges from it. `app` may not import `services`, it talks over HTTP, so a copy
in `services/core` would have forced a second copy in the client. `@model` is the one place both may
read, and it is edge-safe by rule, so the resolver stays pure and has no database or hono dependency.
The same reasoning put the Hono-shaped 402 guards in `services/utils/http.ts` instead: those need a
hono `Context`, which `@model` must not know about.

### Which limits are real gates

| Key              | Enforced at                                                                                                                                                                                                                                                                   | Effect                                                                           |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `maxArtifacts`   | `createArtifact` (`services/core/artifacts.ts`), the one create path on every surface, against `workspaces.artifacts_made`: every artifact ever made, trashed and deleted ones included, so a slot is never freed. Restore is not capped, since the row was counted when made | 402 with `upgrade: true` over HTTP; the same refusal from the agent, MCP and API |
| `storageMb`      | `storageFull()` (`services/core/media.ts`), called from three `services/api/media.ts` routes                                                                                                                                                                                  | 402; only stored bytes count, stock URLs are free                                |
| `customThemes`   | `requireFeature` on `POST /themes`                                                                                                                                                                                                                                            | 402                                                                              |
| `publicLinks`    | `requireFeature` on `POST /artifacts/:id/links`, **and** re-resolved from the owner workspace on every public read (`services/core/links.ts`)                                                                                                                                 | 402 on create, 404 on read, so a downgrade deactivates existing links            |
| `analytics`      | `requireFeature` on the two analytics routes in `services/api/links.ts`; client-side in the shared-link view, the only surface that reads it                                                                                                                                  | 402; the per-link audience panel stays closed                                    |
| `removeBranding` | server-side for published links (`branded: !owner.removeBranding`); client-side in the editor's export modal                                                                                                                                                                  | watermark on or off                                                              |
| `exportFormats`  | client-side only (`editor/panels/ExportModal.tsx`), because rendering happens in the browser and there is no server export route                                                                                                                                              | destinations greyed out                                                          |
| `apiAccess`      | `services/api/workspace.ts` on the credential routes, so it gates minting a machine key rather than the delegated surface itself                                                                                                                                              | 402, and the settings section shows the upgrade wall                             |
| `audio`          | the executor, through `requires: "audio"` on the four audio tools, and the narration, music and voice routes                                                                                                                                                                  | 402                                                                              |
| `maxMembers`     | `inviteMember` (members plus unexpired invites) and `acceptInvite` (members), so an invite that outlived a downgrade is refused at the door                                                                                                                                   | 402 naming the plan that holds a team                                            |

One thing the table cannot show: nothing caps how large a generation is per plan. `MAX_SECTIONS` in `model/tools.ts` is one constant for
everyone, and the credit gate is what bounds a small plan. On the client, every feature read goes
through the resolved set (`app/stores/features.ts`, `EditorView`'s export config included), so a
`feature_overrides` patch reaches every surface.

## Billing and Stripe

### Configuration

`stripe()` builds the SDK lazily on first use, pinned to `apiVersion: "2026-06-24.dahlia"`, so a
missing key does not crash boot. `stripeReady()` is a narrower question: the secret key **and** both
paid monthly price ids must be set. When it is false, `POST /billing/checkout`, `/topup`,
`/change-plan`, and `/resume` return 503 `{ error: "billing not configured" }` before touching Stripe,
`GET /billing` still answers with `stripeReady: false` so the plan page can render read-only, and
`consumeWebhook` returns an error (400) when `STRIPE_WEBHOOK_SECRET` is absent. `POST /billing/portal`
gates on `ws.stripeCustomerId` as well.

`priceIdFor(plan, interval)` resolves from env and refuses an interval that is not configured rather
than quietly booking monthly against an advertised annual price; `GET /billing` reports which
intervals this deployment sells so the client never offers one it cannot. `planForPrice` /
`intervalForPrice` invert the same map; `readSub` reads the one plan line off a live subscription
and answers `plan: null` for a price it does not know, which the webhook treats as an env
misconfiguration and keeps the row's plan through, with a `warn`.

`pnpm stripe:setup` builds the account from the catalog: two products with a monthly and a yearly
price each, the one-off credit product, the customer portal configuration (payment method, invoices
and billing details; plan changes stay in the app), and, given `--origin`, the webhook endpoint on
the four events `consumeWebhook` acts on. It archives any `galleo_` price, and any product it made
earlier, that the catalog no longer sells, so the account converges on the code. The live account is
reached through a CLI profile (`--live --project <name>`); the go-live runbook is in `hosting.md`.

### The routes (`services/api/billing.ts`)

Every mutation is owner-only, checked inline against `ws.ownerId` rather than through `requireRole`,
because billing is the one surface where admin is not enough. `GET /billing` and `GET /billing/ledger`
are readable by any member.

```
GET  /billing            plan · periodEnd · cancelAtPeriodEnd · interval · intervals ·
                         credits{balance,monthlyGrant,perGeneration,resetAt,rolloverCap,capped} ·
                         usage{artifacts,storage} · catalog · creditSale · stripeReady ·
                         hasCustomer
POST /billing/checkout   subscription-mode Checkout, one line. 409 when
                         stripeSubscriptionId is already set, since a second checkout would double-bill.
POST /billing/topup      payment-mode Checkout for one of the credit presets.
POST /billing/portal     the Stripe customer portal.
POST /billing/change-plan up / down / interval, in one route.
POST /billing/resume     clears a pending cancel.
GET  /billing/ledger     keyset-paginated credit history, 30 per page.
POST /billing/webhook    unauthenticated, signature-verified, raw body.
```

### How a plan change lands

`changePlan` (`services/core/billing.ts`) sorts the request into two outcomes:

- **To Free.** `cancel_at_period_end: true` on the subscription, and `cancelAtPeriodEnd` mirrored onto
  the row immediately so the UI does not wait for the webhook. The plan does not change now; it changes
  when Stripe deletes the subscription at the period boundary.
- **Anything else.** Applied now through one `subscriptions.update` on the plan line with the target
  price. A higher tier uses `always_invoice`, so the difference is charged today; a lower tier or an
  interval switch uses `create_prorations`, so what was paid for and not used comes back as a credit
  on the next invoice. A downgrade to a plan for one person leaves the roster in place, soft-locked:
  nobody new can join until the plan holds a team again.

`resumeSubscription` clears `cancel_at_period_end` on Stripe and on the row.

### The webhook

`consumeWebhook(rawBody, signature)` verifies the signature, then applies the event's effects
**inside one transaction**. Idempotency needs no event log, because every effect is safe to re-apply:
sync effects (plan, interval, period end, the cancel flag) **set** workspace state from a
freshly retrieved subscription, so a duplicate, stale, or out-of-order delivery converges on what
Stripe currently says; grants write their `credits` ledger row first, keyed by the unique `key`
column, so a redelivery finds the row and grants nothing. A mid-handle failure rolls the transaction
back, grant claim included, so Stripe's retry re-runs it. That is at-least-once delivery with
exactly-once effects. Network calls happen before the transaction on purpose, so no database
connection is held across a round trip to Stripe.

| Event                                       | What it does                                                                                                                                                                                                                                                                                               |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `checkout.session.completed` (subscription) | Locks the row and runs `applySubscription` with the session id as the grant key: writes the customer id, and syncs and grants as below.                                                                                                                                                                    |
| `checkout.session.completed` (payment)      | A credit purchase: reads the quantity off the credit line item Stripe charged for, refuses a quantity outside `CREDIT_BOUNDS`, adds it to the balance and to `purchased_credits`, and writes a `topup` row keyed on the session. An unpaid session (a delayed method) waits for `async_payment_succeeded`. |
| `customer.subscription.updated`             | `applySubscription` keyed on the event id. When the sub has no workspace, it may adopt one via `metadata.workspaceId`, but only if that workspace has **no** current subscription, so a stale event cannot hijack a newer one.                                                                             |
| `customer.subscription.deleted`             | Back to Free: `plan: "free"`, `planInterval: null`, `stripeSubscriptionId: null`, `planPeriodEnd: null`, the cancel flag cleared. Banked credits are untouched.                                                                                                                                            |

`applySubscription` is the one sync. It reads the live subscription's plan and interval, and when
the subscription now grants more than the row did (a checkout, a tier rise) it
opens a fresh credit window with the new grant under the given key; otherwise it sets the synced
fields. A redelivery finds its key claimed, grants nothing, and still lands the sync. So paying now
means credits now: an upgrade mid-cycle is invoiced today and granted today rather than at the next
renewal.

**`customer.subscription.deleted` keeps the `members` rows on purpose.** It drops the plan to Free,
which holds one person, and leaves N members in place. Deleting them would destroy data on a billing event, including the ability
of those people to see work they authored, and a lapse is frequently temporary (a card failed, someone
forgot to update it). Downgrade reconciliation is by soft-lock instead: the resolver's gates block new
actions over the cap and leave the existing state readable. Nothing re-checks the cap for an existing
member, so a churned team keeps working; what breaks is growth, since `inviteMember` and `acceptInvite`
both refuse against `maxMembers`.

There is no dunning state. A failed card is Stripe's to retry and email about; the row keeps its plan
until Stripe gives up and deletes the subscription, which is the deletion event above. Refunds of
credit purchases are not offered (the copy says so), so there is no clawback path.

## Credits

This section covers the workspace's relationship to credits: the pool, the window, the ledger, and the
gate. What a turn actually buys, how the runtime meters it, and the route-level behaviour are in
`ai.md` §5 and §11.

### The pool

There is one counter, `ai_credits_balance`, and it is a **balance** rather than a usage tally.
`grantFor(ws)` is what the subscription adds at each window:

```
grant = plan.monthlyCredits          (or the includedCredits override)
```

The window adds that grant to whatever is already there instead of clearing it, so **unspent credits
carry over**: a quiet month funds a busy one. A charge subtracts, a refund adds back, and a purchase
adds. That is the whole model.

Rollover is what makes one counter sufficient. A one-off purchase only ever needed a pool of its own
because the monthly counter was wiped and would have destroyed it; once nothing is wiped, a bought
credit and a granted one are the same thing and can share a column.

Accumulation is capped. Every grant path clips through `clipGrant` (`@model/billing`): what a grant
may add is `min(grant, cap + protected − balance)` floored at zero, where the cap is
`ROLLOVER_CAP_MONTHS` (2) times the monthly grant and `protected` is the purchased credits still banked
(`workspaces.purchased_credits`, incremented by the purchase webhook and re-clamped to the balance at
each grant, since spends draw granted credits first). Clipping the grant rather than the balance is
what keeps a purchase untouchable by construction: nothing is ever deducted, and the `protected`
floor stops a large purchase from eating the monthly grant. A grant clipped to zero still re-anchors
the window and still writes its ledger row, so a short month is visible in history rather than
mysterious. `GET /billing` exposes `credits.rolloverCap` and `credits.capped` (whether the next
grant will land short) so the meters can say so.

### The window

`credits_started_at` and `credits_reset_at` bound the cycle, and `WINDOW_MS` is a flat 30 days. One
function opens a window, `openWindow` in `services/core/ledger.ts`: it clips the grant, claims a
`credits.key`, writes the row and sets the bounds, and it has two callers.

- `rollIfLapsed` is the monthly grant for every plan and every interval. It returns early when the
  window is still open, otherwise opens a transaction, re-selects the row `FOR UPDATE`, re-checks
  `resetAt` under the lock so that the parallel requests of an app boot roll it exactly once, and
  opens the window under the key `roll:<workspaceId>:<the lapsed resetAt>`, reason `monthly-grant`.
  Nothing on the Stripe side grants a renewal, so the 30-day window and Stripe's month can drift
  apart without anything double-granting.
- `applySubscription` opens one when a subscription starts granting more than the row did, reason
  `upgrade-grant`, keyed on the checkout session or the event.

The trap is that the roll happens on read, from `currentWorkspace`. Any authenticated request that
resolves a workspace whose `credits_reset_at` has passed will grant and rewrite its window, including
a plain `GET`. There is no separate "apply resets" job to run and no way to inspect a lapsed
workspace without also rolling it. The seed guards against this directly: `upsertWorkspace` throws
when `windowStartedDaysAgo * DAY >= WINDOW_MS`, with the message "credit window already lapsed; the
first read would roll it", because a fixture that rolls itself on first page load is not a fixture.

### Bought credits

A purchase is `POST /billing/topup` for any whole quantity within `CREDIT_BOUNDS` (100 to 25,000;
`CREDIT_PRESETS` are only the panel's quick picks), at `CREDIT_PRICE_USD` (two cents) each, through
a payment-mode Checkout whose line is one credit at that quantity, so no amount needs a Stripe
product of its own. The webhook re-derives the grant from the line item rather than trusting a
count in metadata, refuses a quantity outside the bounds, and adds it to the balance in a ledger
row keyed on the session id, so a redelivery cannot grant twice. Bought credits never expire, since the
rollover clip shields them, and are not refundable.

The rate sits above every plan's own per-credit rate, so buying capacity outright never beats
subscribing for it. Only a paid plan may buy (`canTopUp`); Free's remedy is an upgrade. A team that
needs more capacity buys credits: the pool is one, shared, and the ledger and the members list
name who spent what, so an owner sees a drain coming.

### Spend order, reserve, and settle

`services/core/ledger.ts` owns balance movement and knows nothing about tools, models, or tokens.
`services/core/spend.ts` owns the policy on top.

`chargeCredits(ws, cost, reason, userId?, usage?)` opens a transaction, locks the workspace row
`FOR UPDATE` so concurrent spends serialize and none passes a near-limit gate twice, refuses when
`cost > balance`, and otherwise subtracts the cost from `ai_credits_balance`. It reports `entryId`,
the ledger row it wrote.

`settleCredits(ws, entryId, delta)` reconciles against the **live** row, so a spend that landed
mid-turn survives and extra spend can drive the balance to zero, where it floors. A refund
(`delta < 0`) simply adds back.

The part that surprises people reading the `credits` table: a settle **rewrites the charge's own row**
(`UPDATE credits SET delta = delta - $delta, balance_after = … WHERE id = $entryId`) instead of
appending a correction. One action is one line of history, so the ledger reads as a list of things the
user did rather than a list of accounting steps we took. A row's `delta` is the final cost, its
`usage` is what was asked for, and `balance_after` is recomputed at settle time, so under interleaving
it is not a strict point-in-time running balance for rows written after the charge. A charge that
settles to nothing, a cache hit or a run refunded in full, is deleted rather than kept at zero: the
trace still records the call, and the ledger keeps to what moved the balance. The prepare pass on
open goes one step further and never asks for what a piece already has: `unrecorded` in
`core/narration.ts` and `bedFor` in `core/soundtrack.ts` decide before the executor, so a prepared
piece reaches neither the ledger nor the traces.

The reserve/settle protocol itself is `reserve()` in `services/core/spend.ts`: hold
`estimateCost(tool, size, prices)` up front, run the work under a token meter, and reconcile in a
`finally`, so an error still bills the tokens already burned and an aborted stream settles what
landed. `prices` is required, from `unitPricesFor(overrides)`, so the caller's pinned models are what
the hold and the settle both price at. A tool with no price reserves nothing and never reaches the
ledger, which matters because `owed()` would otherwise bill the real tokens of a call we chose to
give away. The one exception is a free doorway (`gate` on the tool, today only `start-generation`):
it holds nothing, but refuses on the balance when the priced step behind it could not be paid for, so
an out-of-credits launch is refused before a draft exists rather than after.

`model/credits.ts` holds the primitives: `CREDIT_USD = 0.0025` (chosen, not measured: it is the
exchange rate between what a run costs us and what we bill, so it is the margin dial), `usdOfUsage`
which prices a bag of units in dollars, and `creditsForUsd`. There is no fixed credit table: a unit's
price is a dollar figure from the model that serves it (`unitPricesFor` in `services/core/models.ts`),
so an estimate and a charge are the same sum over predicted and actual units, and the client prices
its previews from the same table over `GET /features`. `creditsForUsd` floors at 1 so a real call is
never free, while genuinely-nothing has to stay at zero, which is why `owed()` returns 0 when nothing
was burned and nothing produced.

### The `credits` table

One row per charge, grant, or purchase: `workspace_id`, `user_id` (null = system, used by grants),
`delta` (negative = spend), `reason` (the `ToolId` for a spend, or `monthly-grant` / `upgrade-grant`
/ `topup`), `usage` (jsonb, the `Usage` bag, so history can say what a charge bought and not only
which tool ran; null on grants), `key` (the grant's idempotency claim), `balance_after`,
`created_at`. Indexed on `(workspace_id, created_at DESC)`.

`creditLedger` pages it keyset-style on `(created_at, id)` at 30 rows a page, left-joining `users` so
each entry names its spender, and returns a base64url cursor; a malformed cursor degrades to the first
page.

## Membership

### Roles

Three roles, from `model/workspace.ts`. Owner derives from `workspaces.owner_id` and never from the
role column; `asRole` maps `"admin"` to admin and **everything else**, including the legacy `"editor"`
default still declared on the column and the literal `"owner"` the seed writes, to `"member"`. That is
safe only because `roleOf` checks `ws.ownerId === userId` first and `GET /workspace` overrides the
displayed role the same way, so a stale members row cannot grant or lose ownership.

| Action                           | member         | admin | owner              |
| -------------------------------- | -------------- | ----- | ------------------ |
| Read and edit an artifact        | per its level  | ✓     | ✓                  |
| Spend credits                    | ✓              | ✓     | ✓                  |
| Publish a public link            | per the policy | ✓     | ✓                  |
| Empty the whole trash            | —              | ✓     | ✓                  |
| See pending invites              | —              | ✓     | ✓                  |
| Invite, revoke, remove a member  | —              | ✓     | ✓                  |
| Rename the workspace, set policy | —              | ✓     | ✓                  |
| Remove another **admin**         | —              | —     | ✓                  |
| Change roles                     | —              | —     | ✓                  |
| Billing mutations                | —              | —     | ✓                  |
| Transfer ownership               | —              | —     | ✓                  |
| Leave                            | ✓              | ✓     | — (transfer first) |

The first three rows are the artifact-access layer below; the rest is the role alone. Admin and owner
are deliberately absolute over content: a member who could lock them out would strand the workspace's
own work the moment they left.

`requireRole("admin" | "owner")` in `services/api/middleware.ts` mounts after `requireWorkspace`,
which publishes the caller's role on the context: `currentMembership` reads it from the members join
it was already doing, so no route pays a second query for it. Billing does not use `requireRole`:
those routes compare `ws.ownerId` inline.

### The member cap

The cap is the plan's `maxMembers`, resolved like any other feature: one on Free and Pro, unlimited on
Premium. Two places count it, and they count slightly different things, deliberately:

- `inviteMember` refuses when `members + pending invites` is at the cap, because an unexpired,
  unaccepted invite holds its place. Returns `{ error: "over-members" }`, which the route turns into
  a feature 402 naming `maxMembers`, so the wall sells the plan that holds a team.
- `acceptInvite` refuses when `members` is at the cap, counting only real members (the invite being
  accepted must not count itself). The plan may have shrunk since the invite went out, so the cap is
  rechecked at the door and the route answers the same 402.

Nothing re-checks the cap for an existing member, which is what makes the post-cancellation state
(N members on a plan for one) survivable.

`GET /workspace?spend=1` adds each member's net spend this cycle to the roster (`spendByMember` in
`core/ledger.ts`), which the settings page asks for and nothing else pays for. It is visibility, not
a cap: the pool is shared, and the owner's remedy is to buy credits.

### Invites

Possession-based, like the auth tokens. `inviteMember` mints a 24-byte base64url token, stores only its
SHA-256 in `invites.token_hash`, and emails `${APP_URL}/invite/<token>`. It returns the URL as well as
mailing it, so a dev setup with no mail configured stays usable. Re-inviting the same address hits the
`(workspace_id, email)` unique constraint and upserts: a fresh token, a fresh 14-day window,
`accepted_at` cleared, `created_at` bumped, which also revives an expired or previously accepted row.

`inviteByToken` rejects an accepted or expired invite. `acceptInvite` inserts the `members` row with the
role the invite carried (`onConflictDoNothing`), stamps `accepted_at`, and sets the accepting user's
`active_workspace_id` to that workspace, so accepting also switches you into it. `pendingInvites`
filters to unaccepted and unexpired, and `GET /workspace` hides the list from plain members.

### Remove, leave, transfer

`removeMember` deletes the `members` row and, if the removed user was working in that workspace, nulls
their `active_workspace_id` so `currentWorkspace` drops them back to their own on the next read. The
route refuses to remove the owner at all, and refuses to let an admin remove a fellow admin (that is an
owner call).

`leaveWorkspace(userId, workspaceId)` is `removeMember` on yourself; the owner cannot, and is told to
transfer first. It names its workspace rather than assuming the active one, because the account page lists
every membership and offers to leave any of them; `POST /workspace/leave` with no body still means the
active workspace, which is what workspace settings sends.

`transferOwnership` requires the target to already be a member, then in one transaction sets
`workspaces.owner_id` and demotes the previous owner's members row to `admin`. The new owner's own
members row is left as it was, which is harmless because ownership is read from `owner_id`.

## Artifact access

Role answers "what may this person do to the workspace". It does not answer "what may this person do
to _this_ artifact", and until this layer existed the answer was always "anything": every member could
edit, permanently delete, and publish anything in the workspace.

Four levels, ordered so each contains the ones below it (`model/artifact.ts`):

| Level     | Can                                                         |
| --------- | ----------------------------------------------------------- |
| `none`    | nothing; the artifact is absent from the library and search |
| `view`    | open, read, present, export                                 |
| `comment` | the above, plus leave, edit, resolve, and delete comments   |
| `edit`    | everything, including publishing, trashing, and deleting it |

**Resolution** is `accessFor({ role, userId, createdBy, memberAccess, workspaceDefault, grant })`, a
pure function both sides import:

1. owner and admin always get `edit`;
2. the artifact's creator always gets `edit` on it;
3. otherwise a per-user grant on this artifact, if one exists;
4. otherwise the artifact's own `member_access`, if it sets one;
5. otherwise the workspace's `default_artifact_access`, which ships as `edit`.

Each step beating the one below it in **both directions** is the deliberate difference from Gamma,
whose workspace setting is a floor that silently re-opens a locked document (their own help centre has
to warn users about it). Here the wider setting is a fallback, not a floor, which is Figma's
inherit-then-override model and the one that matches what people expect a per-document control to
mean. It is also why a grant can narrow a member as well as widen them: "everyone can edit, except
Sam is view-only" has to be expressible. Grants carry `view | comment | edit` only, so a grant can
lift someone out of a lock but never put them into one.

**Enforcement** is two gates in `services/api/middleware.ts`, both over the same resolver.
`gateShared(c, id, need)` resolves the workspace **from the artifact row** and honours grants, and is
what artifact-scoped routes use: read, sections, the content patch, the metadata patch, comments, and
the collaboration socket. `gateArtifact(c, id, need)` additionally requires the artifact to be in the
caller's active workspace, and is what everything belonging to the owning workspace keeps: trash,
restore, delete, publishing, analytics, and AI turns. That split is what a grant does and does not
open. An artifact the caller resolves to `none` answers **404, not 403**, so a locked artifact is
indistinguishable from one that does not exist; anything above that answers 403 with a message naming
the level they have. Reads need `view`; the content patch, metadata patch, trash, restore, delete, and
publish need `edit`; comment writes need `comment`.

Listing is filtered in SQL rather than after the fact, in three places that must stay in step:
`visibleTo()` in `core/artifacts.ts` for the library page, `visibleSql()` in `core/search.ts` for ⌘K
and the search field, and `sharedWithMe()` in `core/collaborators.ts` for the "Shared with me" group.
All three build the predicate **positively** rather than as `NOT(hidden)`, because `member_access` is
nullable and negating a comparison against NULL yields NULL, which would silently drop every
inheriting row. The first two carry the same `grantedTo()` term, so an artifact locked to a member but
shared with them by name stays in their library rather than being reachable only by URL. Two
invariants hold: an accessible artifact appears in exactly one of (library, shared-with-me), never
zero, and anything the resolver puts above `none` is reachable from some list. Without the search
half, ⌘K would be the way around the permission.

`PUT /artifacts/:id/access` sets or clears one artifact's level and itself needs `edit`, so a member
who can edit can also lock it; an admin can always undo that.

## Per-user grants

`artifact_grants` is how someone who is not in the workspace gets in at all, and how one person inside
it gets a level of their own. A row keys on `(artifact_id, email)` and binds `user_id` when the
invitee already has an account or accepts the emailed token; only the token's SHA-256 hash is stored,
exactly as workspace invites do it. `POST /artifacts/:id/collaborators` invites, and needs `edit` on
the artifact **and** membership of the owning workspace: an invited editor may change the document,
not widen who else can reach it. Invitees see the artifact under "Shared with me" and open it in the
editor at their granted level.

What a grant does not open: publishing, trashing, permanent deletion, analytics, the member roster,
and AI turns, all of which stay with the owning workspace. AI in particular is members-only because an
outsider's turn would spend the host workspace's credits. The live-editing half of this (the room,
presence, the edit lease) is `.docs/collab.md`.

**Not built, deliberately**: folder-level inheritance. Folders are a light organizer today (an
artifact can sit at root), and inheritance would put a tree walk on the list query.

## Publishing and destructive actions

Two capabilities have a blast radius wider than the artifact in front of you, so they are gated
separately from the access level:

- **Publishing** puts an artifact on a public URL, outside the workspace entirely. It needs the
  `publicLinks` plan feature, `edit` on the artifact, **and** the workspace's `publish_policy`
  (`members` by default, or `admins`). Unpublishing only needs `edit`: a policy change must never
  strand a link nobody can take down.
- **Emptying the trash** deletes every member's trashed work in one call, not just the caller's, so
  `DELETE /trash` is admin-only. Trashing and permanently deleting a single artifact stay at `edit`.

The policy settings live on the workspace row and are set by any admin through `PATCH /workspace`,
which validates each one and refuses an empty patch. There is no per-member spending cap: the pool
is shared, the owner refills it, and the ledger names who spent what.

## The account (`users`)

The workspace is the tenant; the account is the person, and it owns the handful of settings that should
follow someone between workspaces and between browsers. Everything under `/me` lives in
`services/api/account.ts`, which is deliberately separate from `services/api/session.ts`: that file owns the
session lifecycle (`/auth/signup`, `/auth/login`, `/auth/logout`, `/auth/forgot`, `/auth/reset`,
`/auth/confirm`, `/auth/resend-verification`), this one owns the account behind it.

| Route                              | Does                                                                         |
| ---------------------------------- | ---------------------------------------------------------------------------- |
| `GET /me`                          | the boot probe: the `User` DTO, including `hasPassword` and `prefs`          |
| `PATCH /me`                        | display name, trimmed and capped at 80 by `cleanDisplayName`                 |
| `POST /me/password`                | change it, or set a first one on an OAuth-only account                       |
| `GET /me/connections`              | linked OAuth providers with their link dates                                 |
| `DELETE /me/connections/:provider` | unlink, refused when it is the last way in                                   |
| `PATCH /me/prefs`                  | merge a patch into `users.prefs`                                             |
| `GET /me/workspaces`               | every membership with the caller's role, independent of the active workspace |

Each writer answers with the whole re-read `User`, so the client adopts one shape and never re-fetches.

**Password.** `changePassword` takes the current password only when one is stored; an OAuth-only account
(`password_hash` null) is setting a first password and has nothing to prove. Either way the write moves
`password_changed_at`, and `currentUser` rejects any session minted before that instant, so a change signs
out every other device. That includes the cookie that authorized the request, which is why the route calls
`setSessionCookie` on its way out: without it a user would be signed out by their own password change.

**Preferences.** `users.prefs` is one nullable jsonb column, so a new preference is a field on `UserPrefs`
rather than a migration. It is client-written, so every read goes through `readUserPrefs`, which drops
unknown keys and wrong types, and every write through `mergeUserPrefs`, which applies only the keys a patch
carries and treats an explicit `null` as "clear this one". Both live in `@model/workspace` because the
server and the client need the same reading of the column. Today it holds `appTheme`. On the client the
account row is the source of truth and `localStorage` is a cache that paints the right theme on the first
frame, before `/me` answers: `setAppTheme` writes both, `adoptUserPrefs` applies the server's value without
echoing it back.

**Connections.** There are two distinct OAuth paths and they must not be confused. `linkOAuthAccount` is the
**sign-in** path: it resolves an identity to an account by provider id, then by verified email, and issues a
session for whatever account that lands on. `linkProviderToUser` is the **link** path: the session names the
account, so the provider's address is free to differ from the account's own and can never redirect the link
elsewhere. `/auth/google?link=1` sets a short-lived `oauth_intent` cookie beside the state and verifier, and
the callback takes the link path only when that cookie and a live session are both present; a session that
expired mid-consent degrades to a plain sign-in rather than silently attaching the identity to whoever the
email resolves to. Link outcomes report back to `/account?linked=…` or `/account?authError=…`, sign-in
outcomes to `/login?authError=…`.

The third intent is **connect**: `/auth/google/connect` (opened as a popup by the Google Slides export) runs
the link path plus a Drive grant, asking for the identity scopes and `drive.file` with
`include_granted_scopes`, and the callback stores the access token, its expiry, and the granted scopes on
the user's `oauth_accounts` row (`saveGoogleTokens`). Access token only, by design: expiry re-runs the
consent popup (Google auto-approves already-granted scopes) instead of the row holding a refresh token;
that custody question is deliberately deferred until a server-side consumer (the Slides import) needs it.
Every terminal state of the connect flow answers with a small page that posts
`{type:"galleo:google-connect", ok}` to its opener and closes, never a redirect, since the popup has no
page to land on. A session that expired mid-consent fails the connect rather than degrading to sign-in.
`/api/google/slides` (`services/api/google.ts`) is the consumer: it answers 428 when there is no live
Drive-scoped token, which the client reads as "run the popup and retry once", and 402 when the plan lacks
the `slides` export format.

`unlinkProvider` refuses the unlink that would lock the account out: with no password and no second
provider, the link being dropped is the only way back in. The account page disables the button in that case
and says why, so the 409 is an invariant rather than the user's first hint.

**Surface.** `app/views/AccountSettingsView.tsx` at `/account`, reached from the sidebar account row,
from `⌘K` (`account.settings`), and from the OAuth link redirect. Five sections: profile (avatar, name,
email with its verified state and resend), password, connected accounts, preferences (app theme, AI
model overrides), and the account's workspaces (role, switch, leave). Members, plan, and billing stay
in workspace settings; the two pages cross-link.

## What a new workspace starts with

Immediately after `createWorkspaceForUser`:

- `plan: "free"` unless a plan was passed;
- no Stripe customer and no subscription, `feature_overrides` null, `cancel_at_period_end` false,
  `plan_period_end` and `plan_interval` null;
- `ai_credits_balance` at the plan's grant, and a 30-day window from now;
- exactly one `members` row, the owner;
- nothing else: no folders, no artifacts, no themes, no assets, no contexts.

Resolved that way, a fresh workspace can make 5 artifacts, counting any it later trashes or deletes, hold
500 MB of stored media, and gets 300 credits a month,
PNG and PDF export with the Galleo mark, no custom themes, no public links, and no audio.

## The seeded demo workspaces (`pnpm seed`)

`services/db/seed/` holds the demo universe as data and `services/db/seed.ts` writes it, with nothing
declared in the writer: `workspaces.ts` is the bulk of it (the people, one workspace per plan, their
folders, links, themes, ledgers), beside `artifacts.ts` (what each seeded document is called), `assets.ts` (the
media the demo workspace "chose"), `contexts.ts`, and `knowledge.ts`. The split exists so the specs can
be read without importing an entry point that would run the seed on import, and because `db/` may not
reach into `core/`: a document is named in the data and resolved to content by `seed.ts`, which is the
one file allowed to reach for the corpus and template bodies that live in `core/`.

The seed has two modes. `pnpm seed` merges into whatever the database already holds: accounts,
workspaces, members, invites, themes, library assets and the credit ledger are written or replayed
(the ledger resets to the spec on every run), and **artifacts are never created, touched, or wiped**,
so demo content made by hand or by generation tooling survives a rerun, and a spec change (a renamed
workspace, a different plan) lands without collateral. `pnpm seed --full` (or `SEED_FULL=1`) is the
destructive fixture build: wipe each demo workspace and rebuild everything, artifacts, published
links, visits and contexts included. The e2e suite runs `--full`, because its specs assert against
exactly that fixture set. `pnpm seed:credits` is the narrowest run: it reopens each demo
workspace's credit window and replays its ledger from the spec, and touches nothing else, which is
what a demo that has spent its month needs.

The three are named for the plan they demonstrate and the demo login owns all three, so the switcher
is the plan ladder and every limit is reachable from one account. `RETIRED_SLUGS` and
`RETIRED_EMAILS` beside the specs name what the demo universe used to hold, and `reapRetired` in
`seed.ts` deletes exactly those before writing the current ones.

| Slug   | Plan    | People                       | What it exercises                                                                                                                                                                                                             |
| ------ | ------- | ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `demo` | premium | 3 members + a pending invite | the healthy team: member management (the owner-only surface that works without Stripe), one shared 5,000 pool, pinned share links, contexts, assets                                                                           |
| `pro`  | pro     | the owner                    | the solo library with the artifact cap lifted, part-way through a 1,200 cycle                                                                                                                                                 |
| `free` | free    | the owner                    | four live artifacts and one in Trash (five made, the Free cap, so `POST /artifacts` 402s), a `storageMb: 1` override to make the storage wall reachable, and a balance under a deck's cost so generation takes the 402 branch |

A workspace is found by slug and then **every column the spec owns is rewritten**, so a workspace
that has been clicked around in converges back onto the spec rather than keeping its drifted plan and
counters, and `syncMembers` reconciles rather than wipes, so `members.created_at` stays stable across
reseeds. `seedLedger` replays each spec's charges oldest-first with the same arithmetic as
`chargeCredits`, so `balance_after` and `ai_credits_balance` cannot disagree with the history above
them, and it throws on a spec that outspends its plan rather than clamping into a state no request path
can reach. A spec may set `openingBalance` to start mid-cycle: with rollover, a workspace that opened
on a full grant and then barely spent would bank several months, which reads as a bug rather than as a
demo. Invite tokens are derived (`<slug>-<handle>-demo`) rather than random, so an accept URL survives
a reseed and can be pasted into `/invite/:token`.

### Walls in the UI

A 402 is the server's answer; the client's answer is one pair in `app/components/Upgrade.tsx`.
`UpgradeButton` is the CTA and `UpgradeNotice` is the blocked-feature block (`inline` inside a pane,
`block` centred in an empty one). Both derive the tier they name from `upgradeFor(key, currentPlan)`
in `@model/billing`, which walks the plans above the current one and reads the **resolved** set, so
nothing writes "available on Pro" by hand.

Every wall routes to `/settings/plan`, where `UpgradePageContent` (`app/components/UpgradePlans.tsx`)
renders the plan grid and owns the flow: free → paid opens Checkout, paid → paid is an in-app
`change-plan`, and → free cancels at period end. `PlanPanel` is that component plus the current-plan
card, the usage cards, and the tool-price table, priced from
the same catalogue the studio previews with; `BillingPanel` is the portal, the credit presets, and
the ledger.

The rule of thumb is to render a wall rather than hide the control: a surface the user can reach and
read beats one that silently is not there. The editor is the exception by layering, since `editor/`
may not import `app/`; it receives an `onUpgrade` callback from `EditorView` instead.

## Known gaps

- Rollover is capped at `ROLLOVER_CAP_MONTHS` of the grant (see The pool above); the cap clips
  grants only, so a banked purchase can exceed it and simply pauses further granted accumulation.
- A workspace nobody reads never rolls, and a roll does not catch up on windows it missed: one grant
  per read, however long the gap. That is the price of having no cron, and it is the cheap direction.
- Unknown price ids in webhooks are skipped after a `warn`, so a misconfigured env shows up in the
  server log rather than silently keeping the old plan.
- Per-artifact permissions exist per artifact only. There are no per-user grants ("locked, except
  Sam") and no folder-level inheritance; both are described under Artifact access above.
- The credit ledger is readable by every member, names included; it was never an explicit decision.
- There is no way to create a workspace from the app. `createWorkspaceForUser` runs at signup and in the
  seed, so a second membership can only arrive through an invite.
- The account has no delete. It needs a decision about workspaces the user owns with other members in
  them (block and require a transfer, or cascade), and nothing records that decision yet.
- Avatars are read-only, taken from the OAuth profile at link time. There is no upload, so a
  password-only account never has one.
- Model overrides stay in `localStorage` rather than `users.prefs`: they pin a step to a specific model
  for debugging, which is a property of the browser session, not of the account.

## Tests

| Area                            | File                                        | Covers                                                                                                                                                                                                                                                                                                                                                                  |
| ------------------------------- | ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Plan catalog + resolver         | `model/__tests__/billing.test.ts`           | plan fallback, the member cap per plan, overrides widening and narrowing, `withinLimit` against `-1`, `grantFor` and its override, the margin floor, the rate band, the bought-credit invariants, the rollover clip, `upgradeFor` per feature kind, and the card copy                                                                                                   |
| Cost units + the gate           | `model/__tests__/credits.test.ts`           | `usdOfUsage`, the one-credit floor, `creditsForUsd`, `unitPricesFrom`, `estimateCost` scaling by length and section count, the doorway gate on `start-generation`, free tools reserving 0, and the priced-tool list                                                                                                                                                     |
| 402 guards                      | `services/utils/__tests__/http.test.ts`     | `requireFeature`, `checkLimit` at and below a cap, unlimited, the message builder                                                                                                                                                                                                                                                                                       |
| Ledger mechanics                | `services/core/__tests__/ledger.itest.ts`   | refusing a charge the balance cannot cover, spending straight off the balance, a settle rewriting one row in place, a settle to nothing leaving no row, a settle beyond the reserve flooring at zero, `rollIfLapsed` rolling once under concurrency with a keyed row, a subscribed workspace rolling the same way, and the rollover clip with the purchased shield      |
| Spend policy                    | `services/core/__tests__/spend.test.ts`     | what a run owes: nothing for nothing, provider list price, the credit floor, assets on top, cached input, call-site spend folded into one sum                                                                                                                                                                                                                           |
| Stripe wiring                   | `services/core/__tests__/stripe.test.ts`    | `stripeReady`, `priceIdFor`, price-to-plan and price-to-interval round trips                                                                                                                                                                                                                                                                                            |
| Billing routes + webhook        | `services/api/__tests__/billing.itest.ts`   | checkout (interval, 503, free rejected), presets, portal, change-plan (immediate upgrade and downgrade, cancel-to-free, interval switch), resume, the doorway gate, webhook idempotency and rollback, subscription adoption and hijack refusal, the grant on any subscription increase, the roll on read for every plan, purchases, owner-only mutations, ledger paging |
| Resolved features over the wire | `services/api/__tests__/features.itest.ts`  | `GET /features` for a free and an upgraded workspace                                                                                                                                                                                                                                                                                                                    |
| Members, invites, switching     | `services/api/__tests__/workspace.itest.ts` | invite on a team plan, 402 with the member feature on a plan for one, 409 for an existing member, revoke killing a token, accept joining and switching, expired invite, a plan shrinking after an invite went out, the roster's spend column, switching and the 403 without a membership, removal dropping a user back                                                  |
| The role matrix                 | `services/api/__tests__/roles.itest.ts`     | legacy `editor` rows reading as member, invites hidden from members, who may invite/rename/remove, admin-cannot-remove-admin, owner-only role changes, an invite carrying a role, leave, transfer demoting the old owner                                                                                                                                                |
| The roll on read                | `services/core/__tests__/accounts.itest.ts` | `currentWorkspace` granting and pushing `creditsResetAt` about 30 days out once the window has passed, and leaving an unexpired window alone                                                                                                                                                                                                                            |
| Provisioning                    | `services/api/__tests__/session.itest.ts`   | signup and login, and the workspace created alongside a user                                                                                                                                                                                                                                                                                                            |
| Artifact access + policies      | `services/api/__tests__/access.itest.ts`    | the level matrix per route (read/patch/content/trash/restore/delete), the 404-not-403 rule for `none`, admin and creator floors, inherit-then-override in both directions, the library and search filters, comments at each level, admin-only trash emptying, the publish policy, `PATCH /workspace` validation, `PUT /artifacts/:id/access`                            |
| Access resolution               | `model/__tests__/artifact-access.test.ts`   | level ordering, `isAccess` refusing prototype keys, every branch of `accessFor`, and the publish policy helpers                                                                                                                                                                                                                                                         |
| The account surface             | `services/api/__tests__/account.itest.ts`   | `/me` carrying `hasPassword` + `prefs`, rename (trim, cap, clear), password change and first-set, wrong/missing/over-cap current, the `password_changed_at` stamp and the reissued cookie, connections list, unlink with a password or a second provider, the last-credential 409, prefs merge/clear/normalize, memberships with roles, and leaving a named workspace   |
| The OAuth link path             | `services/api/__tests__/oauth.itest.ts`     | the intent cookie only on `?link=1`, linking to the session's account when the provider's email belongs to someone else, refusing an identity linked elsewhere, idempotent relink, the expired-session fallback to sign-in, and failures reporting to `/account` when linking and `/login` when signing in                                                              |
| Prefs + name normalization      | `model/__tests__/workspace.test.ts`         | `asRole` legacy mapping, `readUserPrefs` dropping unknown keys, wrong types and oversized ids, `mergeUserPrefs` patching, clearing, and refusing to mutate its input, `cleanDisplayName` trimming before capping                                                                                                                                                        |

## Narration voices

A workspace keeps a **shelf** of voices, with exactly one marked default, enforced by a partial unique
index on `workspace_voices` rather than by the UI. An artifact can override it through
`ArtifactShell.voice`; absent means "follow the workspace default", so changing the default carries
every piece that never overrode it.

The shelf points at `voices`, which is an **install-wide** adoption cache rather than a per-tenant
table. A community voice cannot be spoken with until it has been added to the calling ElevenLabs
account, and that add is capped monthly on the one account serving every workspace, so `adopt()` is
idempotent on `voices.library_id` and is the only path that calls the provider. Two workspaces saving
the same voice make one provider call and one row, which is asserted by call count in
`services/core/__tests__/voices.itest.ts` rather than by row count.

One entitlement, `audio`, resolved the usual way in `model/billing.ts`, gates narration, designed
voices, and the music bed together; the paid plans have it and Free does not. A shelf holds as many
saved voices as a workspace likes, since a saved library voice costs the account no custom voice slot.

`soundtracks` follows the same install-wide shape for the same reason: a house preset is one row for
the whole deployment, so the first workspace to pick "Calm" anywhere pays the one generation and no
workspace pays again. Only a bed written for a single piece is tenant-scoped, and it cascades with the
artifact. Composing is metered as `music` (`model/credits.ts`), priced by the minute rather than by
tokens, and a cached pick settles to zero.

**Designed** voices do take a slot, and slots are finite for every workspace put together, so they
carry a limit that is ours rather than any plan's: `DESIGN_CEILING` in `services/core/voices.ts`,
plus `reapDesigned()` for ones no shelf holds. That refusal has no upgrade to offer, and says so.
