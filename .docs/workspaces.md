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
An individual on Free is a workspace with one seat, and a team is a workspace with N seats, so there is
one code path rather than a personal one and a team one.

## The pieces

| Concern                                              | File                                                                                                     |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| The row, its columns and indexes                     | `services/db/schema.ts`                                                                                  |
| Plan catalog, feature registry, entitlement resolver | `model/billing.ts`                                                                                       |
| Cost units, the credit/USD anchor, `costOf`          | `model/credits.ts`                                                                                       |
| Tool catalog, `estimateCost` / `reserveCost`         | `model/tools.ts`                                                                                         |
| Roles + the auth DTOs                                | `model/workspace.ts`                                                                                     |
| Create a workspace, resolve the current one          | `services/core/accounts.ts`                                                                              |
| Members, invites, seats, ownership                   | `services/core/workspaces.ts`                                                                            |
| Balances, ledger rows, the monthly window            | `services/core/ledger.ts`                                                                                |
| AI spend policy (reserve, meter, settle)             | `services/core/spend.ts`                                                                                 |
| Plans, Stripe, the webhook, ledger paging            | `services/core/billing.ts`                                                                               |
| The 402 guards (`requireFeature` / `checkLimit`)     | `services/utils/http.ts`                                                                                 |
| `requireUser` / `requireWorkspace` / `requireRole`   | `services/api/middleware.ts`                                                                             |
| `/billing/*`                                         | `services/api/billing.ts`                                                                                |
| `/workspace/*`, `/invites/*`                         | `services/api/workspace.ts`                                                                              |
| `/features`                                          | `services/api/features.ts`                                                                               |
| Client stores                                        | `app/stores/workspace.ts`, `app/stores/billing.ts`, `app/stores/features.ts`                             |
| Surfaces                                             | `app/views/WorkspaceSettingsView.tsx`, `PricingView.tsx`, `InviteView.tsx`, `app/components/Sidebar.tsx` |
| The demo universe                                    | `services/db/seed-workspaces.ts` (data), `services/db/seed.ts` (the writer)                              |

## The row (`workspaces`)

| Column                                          | Meaning                                                                                                         |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `name`                                          | display name; renamable by admin and owner                                                                      |
| `slug` (unique)                                 | generated from the owner's email local part plus a random tail (`uniqueSlug`), or pinned (the seed pins `demo`) |
| `owner_id → users`                              | the single source of ownership; the `members.role` column never decides it                                      |
| `plan`                                          | `free` \| `pro` \| `premium`, default `free`                                                                    |
| `plan_status`                                   | `active` \| `past_due` \| `canceled`, written by the webhook and read only for display                          |
| `plan_period_end`                               | the current Stripe period end, for display and for dating a scheduled change                                    |
| `cancel_at_period_end`                          | a plain cancel is parked here; the plan itself does not change until Stripe deletes the subscription            |
| `seats`                                         | the plan's included seats plus the seat add-on's quantity, from Stripe; the real member cap                     |
| `stripe_customer_id` / `stripe_subscription_id` | created lazily on first checkout; the customer id survives cancellation so a re-subscribe reuses it             |
| `ai_credits_used`                               | spend against the monthly pool, reset to 0 when the window rolls                                                |
| `credit_blocks`                                 | the credit add-on's quantity, synced from Stripe; folds into the monthly limit                                  |
| `credits_started_at` / `credits_reset_at`       | the bounds of the current window; every writer of one sets both                                                 |
| `scheduled_change` (jsonb)                      | a `ScheduledChange` (plan, interval, seats, ISO date) parked on a Stripe subscription schedule                  |
| `feature_overrides` (jsonb)                     | a per-workspace `FeatureOverrides` patch merged over the plan by the resolver                                   |

Related tables: `members` (composite pk on workspace + user, `role`), `invites` (unique per workspace
and email, `token_hash` only), `credits` (the ledger), `stripe_events` (webhook idempotency claims).

## Lifecycle: create, resolve, switch

`createWorkspaceForUser(userId, { name, slug?, slugBase?, plan? })` in `services/core/accounts.ts` is
the only writer. It inserts the row with `...freshCreditWindow()` and then inserts one `members` row
with `role: "owner"`. `provisionUser` calls it on every signup (password or OAuth) with the name
`${who}'s Workspace`, so a user always has exactly one workspace before their first request.

`freshCreditWindow()` matters more than it looks: the column defaults are `defaultNow()`, so a row
inserted without it is born with `credits_reset_at = now`, meaning already lapsed. The comment on the
function says as much.

Resolution runs per request. `requireWorkspace` (`services/api/middleware.ts`) reads the session user
and calls `currentWorkspace(userId)`, which selects every membership joined to its workspace ordered by
`members.created_at`, picks the one matching `users.active_workspace_id`, and otherwise falls back to
the oldest membership. It returns 400 `{ error: "no workspace" }` when there is none.

`currentWorkspace` also calls `rollCreditWindow` on the row it is about to return. There is no cron, so
**reading the workspace is what rolls the monthly window**. That is why a route that only needs the id
still goes through `requireWorkspace` and reads `ws.id` rather than looking the row up itself.

Switching is `POST /workspace/switch`: `switchWorkspace` verifies a `members` row exists and then sets
`users.active_workspace_id`. The client store does `window.location.href = "/"` rather than refetching,
because every store (library, billing, themes, features) is scoped to the workspace and a full reload is
the cheap way to invalidate all of them. `leaveWorkspace` reloads for the same reason.

## Plans and entitlements (`model/billing.ts`)

### The catalog

`PLANS` is one record keyed by `PlanId` (`free` | `pro` | `premium`), and every lever is a field:
`billing` (prices, `includedSeats`, which add-ons the plan sells, `trialDays`), `ai`
(`includedCredits`, section cap, model tiers), `account` (`maxArtifacts`, `storageMb`), and
`features` (the boolean and enum gates).

The base price is the whole subscription rather than a per-seat rate, and it buys `includedSeats`
seats and `includedCredits` credits a month. Free and Pro are solo (one included seat, no seat
add-on); Premium is the team plan and the only one where `sellsSeats` is true. `sellsCredits` is
separate, so Pro can buy capacity without buying colleagues. Stripe price ids are never in this
file: plans resolve from `STRIPE_PRICE_{PLAN}_{INTERVAL}`, add-ons from
`STRIPE_PRICE_{SEAT,CREDITS}_{INTERVAL}`.

`limitsFor(planId)` projects a legacy flat `PlanLimits` (`maxArtifacts`, `aiCreditsPerMonth`,
`customThemes`, `exportFormats`, `removeBranding`, `maxMembers`, `publicLinks`, `workspaceThemes`,
`analytics`). It is plan-only and ignores overrides, which is a real difference from the resolver: see
the gates table below.

### The resolver

Enforcement never reads `plan.features` directly. It reads a resolved `Features` object:

```
effective(feature) = FEATURES[key].status !== "planned"
                     && ( plan grants it || workspace override grants it )
```

`FEATURES` is the registry of every capability with a `status` of `live`, `beta`, or `planned`.
`resolveFeatures(planId, overrides?)` walks it: a `planned` boolean resolves to `false` for everyone, a
`planned` number resolves to `0`, `exportFormats` to `[]`, and the model tiers to `"basic"`. Only after
that launch gate does an override apply, and an override is per key: `undefined` means "use the plan
value", so an override can widen a feature or narrow it, but it can never turn on something unbuilt.

Readers are `can(f, key)`, `limit(f, key)` (`-1` = unlimited), `withinLimit(f, key, current)` (strict
`current < cap`, always true when unlimited), and `featureStatus(key)`.

Two wrappers take a stored row rather than a plan id. `featuresFor(ws)` reads `ws.plan` plus
`ws.featureOverrides`; `creditLimitFor(ws)` takes the resolved `creditsPerMonth` and multiplies it by
`Math.max(1, ws.seats)` only when the plan is per-seat. Both take a `PlanBearer`, which is declared
structurally (`{ plan: string | null; featureOverrides?: … }`) precisely so the backend can hand a
drizzle row straight in without the contract knowing that a database exists.

### Why the resolver lives in `@model`

The services layer law is `api → core → db → utils`, and shared code moves down, never up. The
entitlement resolver has two callers on opposite sides of the wire: `services` gates against it, and
`app` renders locks, badges, and "coming soon" from it (`app/stores/features.ts` imports
`featureStatus`, `app/views/EditorView.tsx` imports `limitsFor`). `app` may not import `services`, it
talks over HTTP, so a copy in `services/core` would have forced a second copy in the client. `@model` is
the one place both may read, and it is edge-safe by rule, so the resolver stays pure and has no database
or hono dependency. The same reasoning put the Hono-shaped 402 guards in `services/utils/http.ts`
instead: those need a hono `Context`, which `@model` must not know about.

### Which limits are real gates

| Key                                                                     | Enforced at                                                                                                                                                        | Effect                                                                |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------- |
| `maxArtifacts`                                                          | `POST /artifacts` **and** `POST /artifacts/:id/restore`, both through `overArtifactCap`; `liveArtifactCount` filters `trashed_at IS NULL`, so Trash does not count | 402 with `upgrade: true`                                              |
| `storageMb`                                                             | `storageFull()` (`services/core/media.ts`), called from three `services/api/media.ts` routes                                                                       | 402; only stored bytes count, stock URLs are free                     |
| `customThemes`                                                          | `requireFeature` on `POST /themes`                                                                                                                                 | 402                                                                   |
| `publicLinks`                                                           | `requireFeature` on `POST /artifacts/:id/links`, **and** re-resolved from the owner workspace on every public read (`services/core/links.ts`)                      | 402 on create, 404 on read, so a downgrade deactivates existing links |
| `analytics`                                                             | `requireFeature` on the two analytics routes in `services/api/links.ts`                                                                                            | 402                                                                   |
| `removeBranding`                                                        | server-side for published links (`branded: !owner.removeBranding`); client-side in the editor's export modal                                                       | watermark on or off                                                   |
| `exportFormats`                                                         | client-side only (`editor/panels/ExportModal.tsx`), because rendering happens in the browser and there is no server export route                                   | destinations greyed out                                               |
| `includedCredits`                                                       | `creditLimitFor` (with the add-ons) → `chargeCredits`                                                                                                              | 402 `OUT_OF_CREDITS`                                                  |
| `maxSectionsPerGeneration`                                              | `services/api/ai.ts` (both the meter and the run context), then the prompt's hard limit and a slice in `tools/plan.ts`                                             | outline truncated, and billed at the truncated size                   |
| `textModelTier` / `imageModelTier`                                      | `modelFor` / `tierAllows` (`services/core/models.ts`); `modelCatalogue` marks locked ids                                                                           | an out-of-tier override falls back to the default                     |
| `customDomains`                                                         | nowhere (`planned`, so it resolves to `0` on every plan)                                                                                                           | none                                                                  |
| `workspaceThemes`, `apiAccess`, `sso`, `prioritySupport`, `earlyAccess` | nowhere (`planned`)                                                                                                                                                | always false                                                          |

Two things in that table are easy to misread.

`account.maxMembers` is `1` on **every** plan, including Premium, and nothing enforces it. The real
member cap is `workspaces.seats`. The comment in `PlanAccount` says so ("base seats included; real cap =
workspace.seats"), but the field is still projected through `limitsFor` and `resolveFeatures`, so a
caller who reasons from `Features.maxMembers` will conclude that Premium is solo. `checkLimit` in
`services/utils/http.ts` is written and unit-tested but is not called by any route today; the artifact
cap open-codes the same shape inline instead.

`exportFormats` and `removeBranding` reach the editor through `limitsFor(billing()?.plan)` in
`app/views/EditorView.tsx`, which is the plan-only projection. A `feature_overrides` entry widening
either one therefore does not affect export in the editor, while an override on `publicLinks` does,
because that line reads the resolved features store. This is inconsistent and probably wants fixing,
but it is what ships.

`plan_status` is written by the webhook and surfaced by `GET /billing`, and no gate reads it. A
`past_due` workspace keeps every entitlement of its plan; the status drives a dunning banner in
`PricingView` and `WorkspaceSettingsView` and nothing else. The plan reverts only when Stripe sends
`customer.subscription.deleted`.

## Billing and Stripe

### Configuration

`stripe()` builds the SDK lazily on first use, pinned to `apiVersion: "2026-06-24.dahlia"`, so a
missing key does not crash boot. `stripeReady()` is a narrower question: the secret key **and** both
paid monthly price ids must be set. When it is false, `POST /billing/checkout`, `/topup`,
`/change-plan`, and `/resume` return 503 `{ error: "billing not configured" }` before touching Stripe,
`GET /billing` still answers with `stripeReady: false` so the pricing page can render read-only, and
`consumeWebhook` returns an error (400) when `STRIPE_WEBHOOK_SECRET` is absent. `POST /billing/portal`
is the exception: it gates on `ws.stripeCustomerId` rather than `stripeReady()`, so a workspace holding
a customer id on a server that has since lost its key will reach `stripe()` and throw.

`priceIdFor(plan, interval)` resolves from env, and falls back to the monthly price when the annual id
is missing so checkout still works. `planForPrice` / `intervalForPrice` invert the same map; an unknown
price id resolves to null and the webhook silently skips the event (an env misconfiguration, which we
have no logging story for yet).

### The routes (`services/api/billing.ts`)

Every mutation is owner-only, checked inline against `ws.ownerId` rather than through `requireRole`,
because billing is the one surface where admin is not enough. `GET /billing` and `GET /billing/ledger`
are readable by any member.

```
GET  /billing            plan · status · periodEnd · cancelAtPeriodEnd · credits{used,limit,
                         perGeneration,resetAt,mySpend} · usage{artifacts,storage} · seats ·
                         includedSeats · scheduledChange · catalog · addOns ·
                         addOnQuantities · stripeReady
POST /billing/checkout   subscription-mode Checkout. 409 when stripeSubscriptionId is already set,
                         since a second checkout would double-bill.
POST /billing/portal     the Stripe customer portal.
POST /billing/change-plan up / down / seats / credit blocks / interval, in one route.
POST /billing/resume     clears both a pending cancel and a scheduled change.
GET  /billing/ledger     keyset-paginated credit history, 30 per page.
POST /billing/webhook    unauthenticated, signature-verified, raw body.
```

### How a plan change lands

`changePlan` (`services/core/billing.ts`) sorts the request into three outcomes:

- **To Free.** `cancel_at_period_end: true` on the subscription, and `cancelAtPeriodEnd` mirrored onto
  the row immediately so the UI does not wait for the webhook. The plan does not change now; it changes
  when Stripe deletes the subscription at the period boundary.
- **A tier decrease or a seat decrease.** Parked, not applied. A Stripe subscription schedule is created
  (or reused) with two phases, the current price until `subPeriodEnd(sub)` and the new one after, with
  `end_behavior: "release"`. `workspaces.scheduled_change` records `{ plan, interval, seats, at }`. The
  policy is that what you paid for, you keep. Before parking it, a seat decrease is floored at the number
  of people holding a seat, counting members **plus unexpired unaccepted invites**, and returns
  `seats-below-members` otherwise.
- **Anything else.** Applied immediately through `subscriptions.update`, with
  `proration_behavior: "always_invoice"` when the target is a higher tier or more seats, and
  `"create_prorations"` for an interval switch or a lateral move. `cancelAtPeriodEnd` and
  `scheduledChange` are both cleared.

`resumeSubscription` releases the Stripe schedule when one exists, clears `cancel_at_period_end`, and
nulls both parking fields.

Note that `architecture.md` describes tier and seat downgrades as immediate with `create_prorations`.
The code parks them at period end via a schedule. Trust the code: `changePlan`'s `downgrade` branch and
the `scheduled downgrades` block in `services/api/__tests__/billing.itest.ts` are the current behaviour.

### The webhook

`consumeWebhook(rawBody, signature)` verifies the signature, then claims the event id in
`stripe_events` and applies its effects **inside one transaction**. A redelivery finds the claim and
no-ops; a mid-handle failure rolls the claim back so Stripe's retry re-runs it. That is at-least-once
delivery with exactly-once effects.

One network call happens before the transaction on purpose: a `checkout.session.completed` retrieves
the subscription (and looks up whether it superseded an older one) outside the claim, so no database
connection is held across a round trip to Stripe.

| Event                           | What it does                                                                                                                                                                                                                                                                                                                    |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `checkout.session.completed`    | Locks the row, writes plan, status, customer, subscription, seats, credit blocks, period end, `cancel_at_period_end`, and **opens a fresh credit window** (`aiCreditsUsed: 0`, new start and reset). Non-zero prior usage leaves an `upgrade-reset` ledger row.                                                                 |
| `customer.subscription.updated` | Syncs plan, status, seats, credit blocks, period end, and cancel flag. When the sub has no workspace, it may adopt one via `metadata.workspaceId`, but only if that workspace has **no** current subscription, so a stale event cannot hijack a newer one. Clears `scheduled_change` once the live sub matches what was parked. |
| `customer.subscription.deleted` | Back to Free: `plan: "free"`, `planStatus: "canceled"`, `stripeSubscriptionId: null`, `seats: 1`, `creditBlocks: 0`, `planPeriodEnd: null`, both parking fields cleared.                                                                                                                                                        |
| `invoice.payment_failed`        | `planStatus: "past_due"` for the workspace matching the invoice customer.                                                                                                                                                                                                                                                       |
| `invoice.paid`                  | A `subscription_cycle` invoice re-anchors the credit window (usage to 0, new 30-day bounds) and logs a `renewal-reset` row. Any other paid invoice only clears `past_due`.                                                                                                                                                      |

A checkout that replaced a live subscription leaves the old one billing with nothing attached, so the
superseded subscription is cancelled after the transaction commits, best effort: a failure there is
Stripe state to clean up, not a reason to 500 a webhook Stripe will then retry.

**`customer.subscription.deleted` keeps the `members` rows on purpose.** It resets seats to 1 and
leaves N members in place. Deleting them would destroy data on a billing event, including the ability
of those people to see work they authored, and a lapse is frequently temporary (a card failed, someone
forgot to update it). Downgrade reconciliation is by soft-lock instead: the resolver's gates block new
actions over the cap and leave the existing state readable. Nothing re-checks seats for an existing
member, so a churned team keeps working; what breaks is growth, since `inviteMember` and `acceptInvite`
both refuse against `workspaces.seats`. The seeded `harbor` workspace is exactly this shape.

## Credits

This section covers the workspace's relationship to credits: the pool, the window, the ledger, and the
gate. What a turn actually buys, how the runtime meters it, and the route-level behaviour are in
`ai.md` §5 and §11.

### The pool

`creditLimitFor(ws)` is the whole monthly allowance and the only place the add-ons fold in:

```
limit = includedCredits                 the plan's own, after feature overrides
      + extraSeats  × ADD_ONS.seat.credits      seats beyond the plan's included ones
      + creditBlocks × ADD_ONS.credits.credits  the credit add-on's quantity
```

The available balance at any moment is `max(0, limit - ai_credits_used)`. There is one counter,
because every credit arrives monthly and expires with the window: a bought credit is a recurring
subscription item, not a one-off purchase, so nothing has to outlive the reset. That is what removed
the second balance the earlier design carried, along with its spend ordering and its asymmetric
refunds.

`extraSeatsOf` returns zero on a plan that does not sell seats. This matters on a lapse: a workspace
keeps its `seats` count until the `customer.subscription.deleted` webhook resets it, and must not
draw seat credits it has stopped paying for.

### Add-ons

Two, both recurring, declared in `ADD_ONS`:

| Add-on    | Unit              | Sold on         |
| --------- | ----------------- | --------------- |
| `seat`    | +1 seat, +credits | Premium only    |
| `credits` | +credits, no seat | Pro and Premium |

A subscription is therefore one plan item at quantity 1 plus up to two add-on items carrying their
own quantities. `readSub` classifies the items by price id, which is why `seats` is read off the seat
item rather than the plan item's quantity, and why anything unrecognised is ignored rather than
guessed at. `addOnItemUpdates` reconciles them on a change: update where the item exists, add where it
does not, and delete when the quantity falls to zero, since Stripe bills a zero-quantity line as a
line.

`pnpm stripe:setup` creates every product and price from this catalog and prints the env block that
wires them up. It matches on a `galleo_*` lookup key rather than on name, so it is safe to re-run and
safe against a fresh account: repricing creates a new Stripe price (they are immutable), transfers
the lookup key to it, and archives the old one, leaving existing subscriptions billing where they
were until they are next changed.

Pricing holds two invariants, both asserted in `model/__tests__/billing.test.ts`: every add-on sells
well above `CREDIT_USD`, and a bare credit costs more per credit than one bundled with a seat, so
buying capacity never beats buying a colleague.

Because add-ons are subscription quantities, buying one is a `POST /billing/change-plan`, not a
separate purchase route, and it prorates and takes effect immediately like any other increase. A
reduction parks at period end with the rest.

### The window

`credits_started_at` and `credits_reset_at` bound the cycle, and `WINDOW_MS` is a flat 30 days.
Two things move it:

- The webhook opens a fresh one on a subscription checkout and on a `subscription_cycle` invoice. Both
  set `creditsStartedAt: new Date()` and `creditsResetAt: monthOut()`, so the anchor is the moment the
  event is processed, not the invoice's own period start. (`architecture.md` says "anchors it to the
  invoice date"; the code does not read a timestamp off the invoice.)
- Otherwise `rollCreditWindow` rolls it lazily. It returns early when the window is still open,
  otherwise opens a transaction, re-selects the row `FOR UPDATE`, re-checks `resetAt` under the lock so
  that the parallel requests of an app boot roll it exactly once, sets `aiCreditsUsed: 0` with new
  bounds, and writes a `monthly-reset` ledger row **only when usage was non-zero**.

The trap is that the roll happens on read, from `currentWorkspace`. Any authenticated request that
resolves a workspace whose `credits_reset_at` has passed will zero its usage and rewrite its window,
including a plain `GET`. There is no separate "apply resets" job to run and no way to inspect a lapsed
workspace without also rolling it. The seed guards against this directly: `upsertWorkspace` throws when
`windowStartedDaysAgo * DAY >= WINDOW_MS`, with the message "credit window already lapsed; the first
read would roll it", because a fixture that rolls itself on first page load is not a fixture.

### Spend order, reserve, and settle

`services/core/ledger.ts` owns balance movement and knows nothing about tools, models, or tokens.
`services/core/spend.ts` owns the policy on top.

`chargeCredits(ws, cost, reason, userId?, usage?)` opens a transaction, locks the workspace row
`FOR UPDATE` so concurrent spends serialize and none passes a near-limit gate twice, refuses when
`cost > available`, and otherwise adds the cost to `ai_credits_used`. It reports `entryId`, the ledger
row it wrote.

`settleCredits(ws, entryId, delta)` reconciles against the **live** row, so a spend that landed
mid-turn survives and extra spend can push `ai_credits_used` past the cap. A refund (`delta < 0`)
simply subtracts, floored at zero. With one pool there is no ordering to preserve and no share of the
charge to remember, which is what made the earlier `fromBonus` / `bonusFirst` pair necessary.

The part that surprises people reading the `credits` table: a settle **rewrites the charge's own row**
(`UPDATE credits SET delta = delta - $delta, balance_after = … WHERE id = $entryId`) instead of
appending a correction. One action is one line of history, so the ledger reads as a list of things the
user did rather than a list of accounting steps we took. Two consequences follow. A row's `delta` is
the final cost, not what was held, so you cannot see the reserve in the table. And `balance_after` is
recomputed from the balance at settle time, so under interleaving it is not a strict point-in-time
running balance for rows written after the charge.

The reserve/settle protocol itself is `reserve()` in `services/core/spend.ts`: hold
`reserveCost(tool, size, rates)` up front, run the work under a token meter, and reconcile in a
`finally`, so an error still bills the tokens already burned and an aborted stream settles what landed.
A tool with no price reserves nothing and never reaches the ledger, which matters because `owed()` would
otherwise bill the real tokens of a call we chose to give away.

`model/tools.ts` distinguishes three numbers: `estimateCost` is what a run typically costs and what the
UI previews; `reserveCost` is what the gate holds, which is the estimate unless the tool declares a
`ceiling`; `typicalCost` ignores job size. The `ceiling` concept exists for tools whose real cost has no
bound the estimate can see, so far only `ask-assistant` (`ceiling: { reply: 5 }`, ten credits held for a
turn whose base is two) because an agent turn chains however many sub-tools it decides to. A ceiling
moves where the gate sits, never what the user ends up paying, since the settle refunds the difference.

`model/credits.ts` holds the primitives: `COST_UNITS` (plan 3, section 2, image 5, video 100, text 1,
theme 4, reply 2), `CREDIT_USD = 0.0142` (derived from a measured 12-section deck, not chosen, and
carrying a note to re-derive it when the default model or its price moves), `costOf(usage, rates)`, and
`creditsForUsd`. Both floor at 1 so a real call is never free, while genuinely-nothing has to stay at
zero, which is why `owed()` checks for any produced unit before calling `costOf`.

### The `credits` table

One row per charge, settle target, grant, or reset: `workspace_id`, `user_id` (null = system, used by
resets and webhook grants), `delta` (negative = spend), `reason` (the `ToolId` for a spend, or
`monthly-reset` / `renewal-reset` / `upgrade-reset` / `topup:<pack>`), `usage` (jsonb, the `Usage` bag,
so history can say what a charge bought and not only which tool ran; null on grants and resets),
`balance_after`, `created_at`. Indexed on `(workspace_id, created_at DESC)`.

`creditLedger` pages it keyset-style on `(created_at, id)` at 30 rows a page, left-joining `users` so
each entry names its spender, and returns a base64url cursor; a malformed cursor degrades to the first
page.

`spendThisCycle` powers `credits.mySpend` on `GET /billing`: the caller's own **net** spend since
`credits_started_at`, summed as `-delta` and clamped at zero. It nets naturally because only charge rows
carry a `user_id` at all (a settle rewrites the charge's row and keeps it); grants and resets are system
rows and never enter the sum.

## Membership

### Roles

Three roles, from `model/workspace.ts`. Owner derives from `workspaces.owner_id` and never from the
role column; `asRole` maps `"admin"` to admin and **everything else**, including the legacy `"editor"`
default still declared on the column and the literal `"owner"` the seed writes, to `"member"`. That is
safe only because `roleOf` checks `ws.ownerId === userId` first and `GET /workspace` overrides the
displayed role the same way, so a stale members row cannot grant or lose ownership.

| Action                          | member | admin | owner              |
| ------------------------------- | ------ | ----- | ------------------ |
| Edit content, spend credits     | ✓      | ✓     | ✓                  |
| See pending invites             | —      | ✓     | ✓                  |
| Invite, revoke, remove a member | —      | ✓     | ✓                  |
| Rename the workspace            | —      | ✓     | ✓                  |
| Remove another **admin**        | —      | —     | ✓                  |
| Change roles                    | —      | —     | ✓                  |
| Billing mutations               | —      | —     | ✓                  |
| Transfer ownership              | —      | —     | ✓                  |
| Leave                           | ✓      | ✓     | — (transfer first) |

`requireRole("admin" | "owner")` in `services/api/middleware.ts` mounts after `requireWorkspace` and
resolves through `roleOf`. Billing does not use it: those routes compare `ws.ownerId` inline.

### The seat cap

The cap is `workspaces.seats`, the cached Stripe quantity. It is **not** `account.maxMembers`, which is
`1` on every plan and enforced nowhere.

Three places count it, and they count slightly different things, deliberately:

- `inviteMember` refuses at `members.length + pending.length >= ws.seats`, because an unexpired,
  unaccepted invite holds its seat. Returns `{ error: "no-seats", seats }`, which the route turns into
  402 with an `upgrade` hint.
- `acceptInvite` refuses at `members.length >= ws.seats`, counting only real members (the invite being
  accepted must not count itself). Seats may have shrunk since the invite went out, so the cap is
  rechecked at the door and the route answers 402.
- `changePlan` floors a seat decrease at members plus unexpired invites.

Nothing re-checks the cap for an existing member, which is what makes the post-cancellation state
(N members, 1 seat) survivable.

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

`leaveWorkspace` is `removeMember` on yourself; the owner cannot, and is told to transfer first.

`transferOwnership` requires the target to already be a member, then in one transaction sets
`workspaces.owner_id` and demotes the previous owner's members row to `admin`. The new owner's own
members row is left as it was, which is harmless because ownership is read from `owner_id`.

## What a new workspace starts with

Immediately after `createWorkspaceForUser`:

- `plan: "free"` unless a plan was passed, `plan_status: "active"`, `seats: 1`;
- no Stripe customer and no subscription, `scheduled_change` and `feature_overrides` null,
  `cancel_at_period_end` false, `plan_period_end` null;
- `ai_credits_used: 0`, `credit_blocks: 0`, and a 30-day window from now;
- exactly one `members` row, the owner;
- nothing else: no folders, no artifacts, no themes, no assets, no contexts.

Resolved that way, a fresh workspace can hold 10 artifacts, 500 MB of stored media, 100 credits a month,
generations capped at 10 sections on basic models, PNG and PDF export with the Galleo mark, no custom
themes, and no public links.

## The seeded demo workspaces (`pnpm seed`)

`services/db/seed-workspaces.ts` declares the demo universe as data (six people, five workspaces, their
folders, links, themes, ledgers), and `services/db/seed.ts` writes it. The split exists so the specs can
be read without importing an entry point that would run the seed on import, and because `db/` may not
reach into `core/`: documents are named in the spec and resolved to content by `seed.ts`.

Two properties are worth knowing before reading the fixtures. A workspace is found by slug and then
**every column the spec owns is rewritten**, so a workspace that has been clicked around in converges
back onto the spec rather than keeping its drifted plan and counters. And `syncMembers` reconciles
rather than wipes, so `members.created_at` (the "joined" column, and the fallback ordering in
`currentWorkspace`) stays stable across reseeds.

`demo@galleo.app` is a member of all five, because every surface resolves through `members`, so a
workspace they cannot switch into would be dead data.

| Slug             | Plan · status      | Demo's role | Seats vs people                               | What it exercises                                                                                                                                                                      |
| ---------------- | ------------------ | ----------- | --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `demo`           | premium · active   | owner       | 8 seats (3 + 5 add-on), 4 members + 2 invites | the healthy team: member management (the owner-only surface that works without Stripe), both add-ons in play (5 extra seats and 2 credit blocks), pinned share links, contexts, assets |
| `ridgeline`      | premium · active   | admin       | 3 seats (all included), 3 members (full)      | a scheduled downgrade to Pro parked at period end, a `maxArtifacts: 40` override narrowing Premium, and a full seat table so an invite takes the no-seats 402                          |
| `harbor`         | free · canceled    | admin       | 1 seat, 2 members (over)                      | the churned workspace: exactly 10 live artifacts (at the Free cap, so `POST /artifacts` 402s), a `storageMb: 1` override to make the storage wall reachable, and a ledger at 95 of 100 |
| `weekend`        | pro · active       | owner       | 1 seat, 1 member                              | the Pro fixture and the empty state. Pro is single-seat, so the demo user owns it; being a plain member of someone else's workspace is covered by `helios-climate`                     |
| `helios-climate` | premium · past_due | member      | 6 seats (3 + 3 add-on), 6 members             | dunning: a failed renewal with a period end three days in the past, driving the banner in Pricing and Settings                                                                         |

`harbor` is the worked example for the credit gate. At 95 of 100 used, `rewrite-text` (1 credit) still
passes, while `ask-assistant` (holds 10 through its ceiling) and `generate-artifact` (holds roughly 40)
both take the 402 branch, so one workspace demonstrates the gate without being uniformly dead.

`seedLedger` replays each spec's charges oldest-first with the same arithmetic as `chargeCredits`, so
`balance_after` and `ai_credits_used` cannot disagree with the history above them, and it throws on a
spec that outspends its plan rather than clamping into a state no request path can reach. A
`monthly-reset` row takes its delta from the replay and is skipped when nothing was spent, matching
`rollCreditWindow`. Invite tokens are derived (`<slug>-<handle>-demo`) rather than
random, so an accept URL survives a reseed and can be pasted into `/invite/:token`.

Verified against the live seeded database (container `galleo-pg`): `demo` is premium with 8 seats and
2 credit blocks, 291 used against a 7,400 limit (2,400 + 5 × 800 + 2 × 500); `ridgeline` is premium at
its 3 included seats with 737 used of 2,400, carrying a `scheduled_change` to Pro; `harbor` is
free/canceled with 1 seat, 2 members, 10 live artifacts, and 95 used of 100; `weekend` is Pro with one
seat and zero artifacts; `helios-climate` is premium/past_due with 6 seats and 4,800 credits. The
ledger's `balance_after` column tracks the replay exactly, ending at 7,109.

### Walls in the UI

A 402 is the server's answer; the client's answer is one pair in `app/components/Upgrade.tsx`.
`UpgradeButton` is the CTA and `UpgradeNotice` is the blocked-feature block (`inline` inside a pane,
`block` centred in an empty one). Both derive the tier they name from `upgradeFor(key, currentPlan)`
in `@model/billing`, which walks the visible plans and reads the **resolved** set, so an unbuilt
feature has no upgrade target and the copy says "coming soon" instead of selling a plan that would
not deliver it. Nothing writes "available on Pro" by hand.

Every wall routes to `/pricing`, where `UpgradePageContent` (`app/components/UpgradePlans.tsx`)
renders the plan grid and owns the flow: free → paid opens Checkout, paid → paid is an in-app
`change-plan`, and → free cancels at period end. `PricingView` is that component plus the usage
cards, the tool-price table, and the ledger, so a second entry point to the same grid costs one
import rather than a second implementation.

The rule of thumb is to render a wall rather than hide the control: a surface the user can reach and
read beats one that silently is not there. The editor is the exception by layering, since `editor/`
may not import `app/`; it receives an `onUpgrade` callback from `EditorView` instead.

Both cap checks route through `checkLimit`, and both feature reads on the client route through the
resolved set (`can` / `exportFormatsOf` in `app/stores/features.ts`) rather than `limitsFor(planId)`,
which sees only the plan and would silently ignore a workspace's `featureOverrides`.

## Known gaps

- Unused credits are dropped at the roll; there is no rollover, and no field claiming otherwise.
- `plan_status` gates nothing: a `past_due` workspace keeps full entitlements until Stripe deletes the
  subscription. That reads as a deliberate dunning grace period, but nothing records the decision.
- Unknown price ids in webhooks are claimed and skipped silently, since there is no ops or logging story
  yet and `console` is banned in app code.
- `POST /billing/portal` does not check `stripeReady()`, so it can reach `stripe()` and throw where its
  siblings 503.
- Per-artifact permissions do not exist. Role is workspace-wide, and a member sees everything in it.

## Tests

| Area                            | File                                        | Covers                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------------------- | ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Plan catalog + resolver         | `model/__tests__/billing.test.ts`           | plan fallback, `limitsFor`, `isPerSeat`, launch status beating both plan and override, overrides widening a live feature, `withinLimit` against `-1`, `creditLimitFor` scaling by seats and honouring a `creditsPerMonth` override                                                                                                                                           |
| Cost units + the ceiling        | `model/__tests__/credits.test.ts`           | `costOf` with and without rates, the one-credit floor, `creditsForUsd`, `unitMultipliers` per task, `estimateCost` scaling by length and section count, `reserveCost` holding the estimate without a ceiling and 10 credits for `ask-assistant` with one, and a free tool reserving 0                                                                                        |
| 402 guards                      | `services/utils/__tests__/http.test.ts`     | `requireFeature`, `checkLimit` at and below a cap, unlimited, the message builder                                                                                                                                                                                                                                                                                            |
| Ledger mechanics                | `services/core/__tests__/ledger.itest.ts`   | `fromBonus` reporting, refunds restoring bonus before pool, a settle rewriting one row in place, usage recorded on the charge, a settle beyond the reserve, `rollCreditWindow` rolling once under concurrency and including bonus in the reset row                                                                                                                           |
| Spend policy                    | `services/core/__tests__/spend.test.ts`     | what a run owes: nothing for nothing, provider list price, the credit floor, assets on top, call-site spend folded into one sum                                                                                                                                                                                                                                              |
| Stripe wiring                   | `services/core/__tests__/stripe.test.ts`    | `stripeReady`, `priceIdFor` including the annual-to-monthly fallback, price-to-plan and price-to-interval round trips                                                                                                                                                                                                                                                        |
| Billing routes + webhook        | `services/api/__tests__/billing.itest.ts`   | checkout (seats, interval, 503, free rejected), portal, change-plan (immediate upgrade, parked downgrade, cancel-to-free, seat floor, interval switch), resume, webhook idempotency and rollback, subscription adoption and hijack refusal, cycle-invoice re-anchoring, seat-scaled pool, concurrent near-limit spends, top-ups, trials, owner-only mutations, ledger paging |
| Resolved features over the wire | `services/api/__tests__/features.itest.ts`  | `GET /features` for a free and an upgraded workspace                                                                                                                                                                                                                                                                                                                         |
| Members, invites, switching     | `services/api/__tests__/workspace.itest.ts` | invite into a free seat, 402 when full, 409 for an existing member, revoke killing a token, accept joining and switching, expired invite, seats shrinking after an invite went out, switching and the 403 without a membership, removal dropping a user back                                                                                                                 |
| The role matrix                 | `services/api/__tests__/roles.itest.ts`     | legacy `editor` rows reading as member, invites hidden from members, who may invite/rename/remove, admin-cannot-remove-admin, owner-only role changes, an invite carrying a role, leave, transfer demoting the old owner                                                                                                                                                     |
| The lazy window roll on read    | `services/core/__tests__/accounts.itest.ts` | `currentWorkspace` zeroing `aiCreditsUsed` and pushing `creditsResetAt` about 30 days out once the window has passed, and leaving an unexpired window alone                                                                                                                                                                                                                  |
| Provisioning                    | `services/api/__tests__/session.itest.ts`   | signup and login, and the workspace created alongside a user                                                                                                                                                                                                                                                                                                                 |
