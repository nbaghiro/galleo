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

| Concern                                                             | File                                                                                                                                |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| The row, its columns and indexes                                    | `services/db/schema.ts`                                                                                                             |
| Plan catalog, feature registry, entitlement resolver                | `model/billing.ts`                                                                                                                  |
| Cost units, the credit/USD anchor, `costOf`                         | `model/credits.ts`                                                                                                                  |
| Tool catalog, `estimateCost` / `reserveCost`                        | `model/tools.ts`                                                                                                                    |
| Artifact access levels + `accessFor`                                | `model/artifact.ts`                                                                                                                 |
| Roles, publish policy, the auth DTOs, `UserPrefs`                   | `model/workspace.ts`                                                                                                                |
| Create a workspace, resolve the current one                         | `services/core/accounts.ts`                                                                                                         |
| The account itself (profile, password, links, prefs)                | `services/core/accounts.ts`, `services/api/account.ts`                                                                              |
| Members, invites, seats, ownership                                  | `services/core/workspaces.ts`                                                                                                       |
| Balances, ledger rows, the monthly window                           | `services/core/ledger.ts`                                                                                                           |
| AI spend policy (reserve, meter, settle)                            | `services/core/spend.ts`                                                                                                            |
| Plans, Stripe, the webhook, ledger paging                           | `services/core/billing.ts`                                                                                                          |
| The 402 guards (`requireFeature` / `checkLimit`)                    | `services/utils/http.ts`                                                                                                            |
| `requireUser` / `requireWorkspace` / `requireRole` / `gateArtifact` | `services/api/middleware.ts`                                                                                                        |
| `/billing/*`                                                        | `services/api/billing.ts`                                                                                                           |
| `/workspace/*`, `/invites/*`                                        | `services/api/workspace.ts`                                                                                                         |
| `/features`                                                         | `services/api/features.ts`                                                                                                          |
| `/me/*`                                                             | `services/api/account.ts`                                                                                                           |
| Client stores                                                       | `app/stores/workspace.ts`, `app/stores/billing.ts`, `app/stores/features.ts`, `app/stores/auth.ts`                                  |
| Surfaces                                                            | `app/views/WorkspaceSettingsView.tsx`, `AccountSettingsView.tsx`, `PricingView.tsx`, `InviteView.tsx`, `app/components/Sidebar.tsx` |
| The demo universe                                                   | `services/db/seed/` (the data), `services/db/seed.ts` (the writer)                                                                  |

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
| `ai_credits_balance`                            | the one credit counter: a balance, added to at each roll and by a pack, never cleared                           |
| `credits_started_at` / `credits_reset_at`       | the bounds of the current window; every writer of one sets both                                                 |
| `scheduled_change` (jsonb)                      | a `ScheduledChange` (plan, interval, seats, ISO date) parked on a Stripe subscription schedule                  |
| `feature_overrides` (jsonb)                     | a per-workspace `FeatureOverrides` patch merged over the plan by the resolver                                   |

Related tables: `members` (composite pk on workspace + user, `role`), `invites` (unique per workspace
and email, `token_hash` only), `credits` (the ledger; its unique `key` column doubles as the webhook
grant idempotency claim).

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
`ws.featureOverrides`; `monthlyGrantFor(ws)` takes the resolved `includedCredits` and adds the seat
add-on's credits for every seat beyond the plan's included ones. Both take a `PlanBearer`, declared
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

| Key                                                        | Enforced at                                                                                                                                                        | Effect                                                                |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------- |
| `maxArtifacts`                                             | `POST /artifacts` **and** `POST /artifacts/:id/restore`, both through `overArtifactCap`; `liveArtifactCount` filters `trashed_at IS NULL`, so Trash does not count | 402 with `upgrade: true`                                              |
| `storageMb`                                                | `storageFull()` (`services/core/media.ts`), called from three `services/api/media.ts` routes                                                                       | 402; only stored bytes count, stock URLs are free                     |
| `customThemes`                                             | `requireFeature` on `POST /themes`                                                                                                                                 | 402                                                                   |
| `publicLinks`                                              | `requireFeature` on `POST /artifacts/:id/links`, **and** re-resolved from the owner workspace on every public read (`services/core/links.ts`)                      | 402 on create, 404 on read, so a downgrade deactivates existing links |
| `analytics`                                                | `requireFeature` on the two analytics routes in `services/api/links.ts`                                                                                            | 402                                                                   |
| `removeBranding`                                           | server-side for published links (`branded: !owner.removeBranding`); client-side in the editor's export modal                                                       | watermark on or off                                                   |
| `exportFormats`                                            | client-side only (`editor/panels/ExportModal.tsx`), because rendering happens in the browser and there is no server export route                                   | destinations greyed out                                               |
| `includedCredits`                                          | `monthlyGrantFor` (with the seat add-on) → `chargeCredits`                                                                                                         | 402 `OUT_OF_CREDITS`                                                  |
| `maxSectionsPerGeneration`                                 | `services/api/ai.ts` (both the meter and the run context), then the prompt's hard limit and a slice in `tools/plan.ts`                                             | outline truncated, and billed at the truncated size                   |
| `textModelTier` / `imageModelTier`                         | `modelFor` / `tierAllows` (`services/core/models.ts`); `modelCatalogue` marks locked ids                                                                           | an out-of-tier override falls back to the default                     |
| `customDomains`                                            | nowhere (`planned`, so it resolves to `0` on every plan)                                                                                                           | none                                                                  |
| `analytics`                                                | client-side in the shared-link view (`app/views/SharedView.tsx`), which is the only surface that reads it                                                          | the per-link audience panel stays closed                              |
| `apiAccess`                                                | `services/api/workspace.ts` on the credential routes, so it gates minting a machine key rather than the delegated surface itself                                   | 402, and the settings section shows the upgrade wall                  |
| `workspaceThemes`, `sso`, `prioritySupport`, `earlyAccess` | nowhere (`planned`)                                                                                                                                                | always false                                                          |

One thing the table cannot show: nothing in the resolved set caps membership. The member cap is
`workspaces.seats`, the cached Stripe quantity, enforced at the invite and accept paths; the plan
catalog carries no member field at all, so a caller looking for one in `Features` is looking in the
wrong place. On the client, every feature read goes through the resolved set
(`app/stores/features.ts`, `EditorView`'s export config included), so a `feature_overrides` patch
reaches every surface.

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

`consumeWebhook(rawBody, signature)` verifies the signature, then applies the event's effects
**inside one transaction**. Idempotency needs no event log, because every effect is safe to re-apply:
sync effects (plan, seats, status, period end) **set** workspace state from freshly retrieved
subscription state, so a duplicate, stale, or out-of-order delivery converges on what Stripe
currently says; credit grants write their `credits` ledger row first, keyed by the unique `key`
column (the checkout-session or invoice id), so a redelivery finds the row and grants nothing. A
mid-handle failure rolls the transaction back — grant claim included — so Stripe's retry re-runs it.
That is at-least-once delivery with exactly-once effects.

Network calls happen before the transaction on purpose: a `checkout.session.completed` retrieves the
subscription (and looks up whether it superseded an older one), and subscription events retrieve the
live subscription they sync from, so no database connection is held across a round trip to Stripe.

| Event                                       | What it does                                                                                                                                                                                                                                                                                                                    |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `checkout.session.completed` (subscription) | Locks the row, writes plan, status, customer, subscription, seats, period end, `cancel_at_period_end`, opens a fresh window, and **adds** the grant to the balance rather than replacing it, leaving an `upgrade-grant` row.                                                                                                    |
| `checkout.session.completed` (payment)      | A credit pack: re-derives the credits from `CREDIT_PACKS` by id, adds them to the balance, and writes a `topup:<pack>` row.                                                                                                                                                                                                     |
| `customer.subscription.updated`             | Syncs plan, status, seats, credit blocks, period end, and cancel flag. When the sub has no workspace, it may adopt one via `metadata.workspaceId`, but only if that workspace has **no** current subscription, so a stale event cannot hijack a newer one. Clears `scheduled_change` once the live sub matches what was parked. |
| `customer.subscription.deleted`             | Back to Free: `plan: "free"`, `planStatus: "canceled"`, `stripeSubscriptionId: null`, `seats: 1`, `creditBlocks: 0`, `planPeriodEnd: null`, both parking fields cleared.                                                                                                                                                        |
| `invoice.payment_failed`                    | `planStatus: "past_due"` for the workspace matching the invoice customer.                                                                                                                                                                                                                                                       |
| `invoice.paid`                              | A `subscription_cycle` invoice re-anchors the window (new 30-day bounds) and adds the grant to the balance, logging a `renewal-grant` row. Any other paid invoice only clears `past_due`.                                                                                                                                       |

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

There is one counter, `ai_credits_balance`, and it is a **balance** rather than a usage tally.
`monthlyGrantFor(ws)` is what the subscription adds at each roll:

```
grant = includedCredits + extraSeats × ADD_ONS.seat.credits
```

The roll adds that grant to whatever is already there instead of clearing it, so **unspent credits
carry over**: a quiet month funds a busy one. A charge subtracts, a refund adds back, and a purchased
pack adds. That is the whole model.

Rollover is what makes one counter sufficient. A one-off purchase only ever needed a pool of its own
because the monthly counter was wiped and would have destroyed it; once nothing is wiped, a bought
credit and a granted one are the same thing and can share a column. Both of the earlier designs (a
separate bonus balance, then recurring credit add-ons) existed to work around a reset that no longer
happens.

`extraSeatsOf` returns zero on a plan that does not sell seats. This matters on a lapse: a workspace
keeps its `seats` count until the `customer.subscription.deleted` webhook resets it, and must not
draw seat credits it has stopped paying for.

Accumulation is capped. Every grant path clips through `clipGrant` (`@model/billing`): what a grant
may add is `min(grant, cap + protected − balance)` floored at zero, where the cap is
`ROLLOVER_CAP_MONTHS` (2) times the monthly grant and `protected` is the pack credits still banked
(`workspaces.purchased_credits`, incremented by the pack webhook and re-clamped to the balance at
each grant, since spends draw granted credits first). Clipping the grant rather than the balance is
what keeps a purchase untouchable by construction: nothing is ever deducted, and the `protected`
floor stops a large pack from eating the monthly grant. A grant clipped to zero still re-anchors
the window and still writes its ledger row, so a short month is visible in history rather than
mysterious. `GET /billing` exposes `credits.rolloverCap` and `credits.capped` (whether the next
grant will land short) so the meters can say so.

Which path grants depends on the subscription. A live **monthly** subscription is granted only by
its `subscription_cycle` invoice, because the flat 30-day window outruns Stripe's month and rolling
lazily as well would double the grant. A live **annual** subscription is the opposite: the lazy
roll is its only monthly granter, and the yearly renewal invoice clears dunning without granting.
A workspace with no subscription rolls lazily, as always. The rule lives in `rollCreditWindow` and
the webhook's `invoice.paid` branch, keyed on `workspaces.plan_interval`.

### Add-ons and packs

|             | Billing                              | Sold on         | Effect                           |
| ----------- | ------------------------------------ | --------------- | -------------------------------- |
| Seat add-on | recurring subscription item          | Premium only    | +1 seat, +credits on every grant |
| Credit pack | one-off Checkout (`mode: "payment"`) | Pro and Premium | +credits once, into the balance  |

A seat is an ongoing entitlement, so it is a subscription item and its credits recur. A pack is
bought once: `POST /billing/topup` opens a payment-mode Checkout, and the webhook re-derives the
grant from `CREDIT_PACKS` by pack id rather than trusting a count in metadata, then adds it to the
balance in a ledger row keyed on the checkout session id, so a redelivery cannot grant twice.

Packs are priced above every plan's own per-credit rate, so buying capacity outright never beats
subscribing for it, and both invariants are asserted in `model/__tests__/billing.test.ts`.

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
  bounds, adds the grant to the balance, and writes a `monthly-grant` ledger row.

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
`cost > balance`, and otherwise subtracts the cost from `ai_credits_balance`. It reports `entryId`,
the ledger row it wrote.

`settleCredits(ws, entryId, delta)` reconciles against the **live** row, so a spend that landed
mid-turn survives and extra spend can drive the balance to zero, where it floors. A refund
(`delta < 0`) simply adds back. With one balance there is no ordering to preserve and no share of the
charge to remember.

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

`model/credits.ts` holds the primitives: `CREDIT_USD = 0.0025` (chosen, not measured: it is the
exchange rate between what a run costs us and what we bill, so it is the margin dial), `usdOfUsage`
which prices a bag of units in dollars, and `creditsForUsd`. There is no fixed credit table: a unit's
price is a dollar figure from the model that serves it (`unitPricesFor` in `services/core/models.ts`),
so an estimate and a charge are the same sum over predicted and actual units. `creditsForUsd` floors
at 1 so a real call is never free, while genuinely-nothing has to stay at zero, which is why `owed()`
returns 0 when nothing was burned and nothing produced.

### The `credits` table

One row per charge, settle target, grant, or reset: `workspace_id`, `user_id` (null = system, used by
resets and webhook grants), `delta` (negative = spend), `reason` (the `ToolId` for a spend, or
`monthly-grant` / `renewal-grant` / `upgrade-grant` / `topup:<pack>`), `usage` (jsonb, the `Usage` bag,
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

| Action                           | member          | admin | owner              |
| -------------------------------- | --------------- | ----- | ------------------ |
| Read and edit an artifact        | per its level   | ✓     | ✓                  |
| Spend credits                    | up to their cap | ✓     | ✓                  |
| Publish a public link            | per the policy  | ✓     | ✓                  |
| Empty the whole trash            | —               | ✓     | ✓                  |
| See pending invites              | —               | ✓     | ✓                  |
| Invite, revoke, remove a member  | —               | ✓     | ✓                  |
| Rename the workspace, set policy | —               | ✓     | ✓                  |
| Remove another **admin**         | —               | —     | ✓                  |
| Change roles                     | —               | —     | ✓                  |
| Billing mutations                | —               | —     | ✓                  |
| Transfer ownership               | —               | —     | ✓                  |
| Leave                            | ✓               | ✓     | — (transfer first) |

The first three rows are the artifact-access layer below; the rest is the role alone. Admin and owner
are deliberately absolute over content: a member who could lock them out would strand the workspace's
own work the moment they left.

`requireRole("admin" | "owner")` in `services/api/middleware.ts` mounts after `requireWorkspace`,
which now publishes the caller's role on the context: `currentMembership` reads it from the members
join it was already doing, so no route pays a second query for it. Billing does not use `requireRole`:
those routes compare `ws.ownerId` inline.

### The seat cap

The cap is `workspaces.seats`, the cached Stripe quantity; the plan catalog carries no member field,
so the row is the only cap.

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
open. Both read the row An artifact the caller resolves to `none` answers **404, not
403**, so a locked artifact is indistinguishable from one that does not exist; anything above that
answers 403 with a message naming the level they have. Reads need `view`; the content patch, metadata
patch, trash, restore, delete, and publish need `edit`; comment writes need `comment`.

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

## The per-member credit cap

The credit pool is shared and only the owner can refill it, so one member could spend the month.
`workspaces.member_credit_cap` (null = uncapped, the shipped default) bounds what one member spends
per credit window. It is enforced in `reserve()` (`core/spend.ts`), the single choke point every paid
action already passes through, and checked **against the estimate before the charge**, so a run that
would cross the cap never starts rather than being cut off mid-stream. Owners and admins are not
capped: they run the workspace, and an admin who cannot act is a support ticket.

`spendThisCycle` moved from `core/billing.ts` to `core/ledger.ts` for this, so `core/spend.ts` can
read a member's spend without importing the Stripe module. A refusal returns `OVER_MEMBER_CAP` rather
than `OUT_OF_CREDITS`: neither remedy applies, since the pool may be full and only an admin can raise
the ceiling, so the body says who to ask instead of offering a sale.

The three settings live on the workspace row and are set by any admin through `PATCH /workspace`,
which validates each one and refuses an empty patch.

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

**Surface.** `app/views/AccountSettingsView.tsx` at `/account`, reached from the sidebar account row (which
was previously inert), from `⌘K` (`account.settings`), and from the OAuth link redirect. Five sections:
profile (avatar, name, email with its verified state and resend), password, connected accounts, preferences
(app theme, AI model overrides), and the account's workspaces (role, switch, leave). Members, plan, and
billing stay in workspace settings; the two pages cross-link.

## What a new workspace starts with

Immediately after `createWorkspaceForUser`:

- `plan: "free"` unless a plan was passed, `plan_status: "active"`, `seats: 1`;
- no Stripe customer and no subscription, `scheduled_change` and `feature_overrides` null,
  `cancel_at_period_end` false, `plan_period_end` null;
- `ai_credits_balance: 0` until the first grant, and a 30-day window from now;
- exactly one `members` row, the owner;
- nothing else: no folders, no artifacts, no themes, no assets, no contexts.

Resolved that way, a fresh workspace can hold 10 artifacts, 500 MB of stored media, 300 credits a month,
generations capped at 10 sections on basic models, PNG and PDF export with the Galleo mark, no custom
themes, and no public links.

## The seeded demo workspaces (`pnpm seed`)

`services/db/seed/` holds the demo universe as data and `services/db/seed.ts` writes it, with nothing
declared in the writer: `workspaces.ts` is the bulk of it (four people, one workspace per plan, their
folders, links, themes, ledgers), beside `artifacts.ts` (what each seeded document is called), `assets.ts` (the
media the demo workspace "chose"), `contexts.ts`, and `knowledge.ts`. The split exists so the specs can
be read without importing an entry point that would run the seed on import, and because `db/` may not
reach into `core/`: a document is named in the data and resolved to content by `seed.ts`, which is the
one file allowed to reach for the corpus and template bodies that live in `core/`.

The three are named for the plan they demonstrate (Premium, Pro, Free) and the demo login owns all
three, so the switcher is the plan ladder and every limit is reachable from one account: Premium runs
5 seats (3 included plus 2 bought) with an admin, a member and a pending invite; Pro is the single-seat
solo library with the artifact cap lifted; Free sits at its 10-artifact cap with 61 credits left
and a storage override that puts the wall within reach.

`RETIRED_SLUGS` and `RETIRED_EMAILS` beside the specs name what the demo universe used to hold, and
`reapRetired` in `seed.ts` deletes exactly those before writing the current ones. Without it a dropped
workspace lingers in the switcher and a dropped account can still log in, since the seed upserts and
never removes. Both lists are explicit rather than pattern-matched: a real signup at a galleo.app
address must never be reapable.

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
`balance_after` and `ai_credits_balance` cannot disagree with the history above them, and it throws on a
spec that outspends its plan rather than clamping into a state no request path can reach. A
`monthly-grant` row adds a month's grant, exactly as `rollCreditWindow` does. A spec may set
`openingBalance` to start mid-cycle: with rollover, a workspace that opened on a full grant and then
barely spent would bank several months, which reads as a bug rather than as a demo. Invite tokens are derived (`<slug>-<handle>-demo`) rather than
random, so an accept URL survives a reseed and can be pasted into `/invite/:token`.

Verified against the live seeded database (container `galleo-pg`): `demo` is premium with 5 seats
(3 included plus 2 bought) and a 10,500 monthly grant, banking 4,240 after its ledger and a 2,000
credit top-up; `pro` is Pro with one seat, a 1,200 grant and 168 banked; `free` is Free with one seat,
a 300 grant and 61 banked, which is under a deck's ~95 credits so `generate-artifact` takes the 402
branch. The ledger's `balance_after` column tracks the replay exactly.

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

- Rollover is capped at `ROLLOVER_CAP_MONTHS` of the grant (see The pool above); the cap clips
  grants only, so a banked purchase can exceed it and simply pauses further granted accumulation.
- `plan_status` gates nothing, and that is the decision: `past_due` is a dunning grace period, so a
  workspace keeps its entitlements while Stripe retries the card, and the plan moves only when the
  deletion webhook lands.
- Unknown price ids in webhooks are skipped after a `warn`, so a misconfigured env shows up in the
  server log rather than silently keeping the old plan.
- Per-artifact permissions exist per artifact only. There are no per-user grants ("locked, except
  Sam") and no folder-level inheritance; both are described under Artifact access above.
- The credit ledger is still readable by every member, names included. Capping spend made that more
  defensible (a member can see what their own ceiling is being measured against) but it was never an
  explicit decision.
- There is no way to create a workspace from the app. `createWorkspaceForUser` runs at signup and in the
  seed, so a second membership can only arrive through an invite.
- The account has no delete. It needs a decision about workspaces the user owns with other members in
  them (block and require a transfer, or cascade), and nothing records that decision yet.
- Avatars are read-only, taken from the OAuth profile at link time. There is no upload, so a
  password-only account never has one.
- Model overrides stay in `localStorage` rather than `users.prefs`: they pin a step to a specific model
  for debugging, which is a property of the browser session, not of the account.

## Tests

| Area                            | File                                        | Covers                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Plan catalog + resolver         | `model/__tests__/billing.test.ts`           | plan fallback, `limitsFor`, `sellsSeats`, launch status beating both plan and override, overrides widening a live feature, `withinLimit` against `-1`, `monthlyGrantFor` counting only seats beyond the included ones, add-on and pack pricing invariants, and every plan having a remedy when it runs dry                                                                                                                                                                           |
| Cost units + the ceiling        | `model/__tests__/credits.test.ts`           | `costOf` with and without rates, the one-credit floor, `creditsForUsd`, `unitMultipliers` per task, `estimateCost` scaling by length and section count, `reserveCost` holding the estimate without a ceiling and 10 credits for `ask-assistant` with one, and a free tool reserving 0                                                                                                                                                                                                |
| 402 guards                      | `services/utils/__tests__/http.test.ts`     | `requireFeature`, `checkLimit` at and below a cap, unlimited, the message builder                                                                                                                                                                                                                                                                                                                                                                                                    |
| Ledger mechanics                | `services/core/__tests__/ledger.itest.ts`   | refusing a charge the balance cannot cover, spending straight off the balance, a settle rewriting one row in place, a settle beyond the reserve flooring at zero, and `rollCreditWindow` rolling once under concurrency while adding the grant to the leftovers                                                                                                                                                                                                                      |
| Spend policy                    | `services/core/__tests__/spend.test.ts`     | what a run owes: nothing for nothing, provider list price, the credit floor, assets on top, call-site spend folded into one sum                                                                                                                                                                                                                                                                                                                                                      |
| Stripe wiring                   | `services/core/__tests__/stripe.test.ts`    | `stripeReady`, `priceIdFor` including the annual-to-monthly fallback, price-to-plan and price-to-interval round trips                                                                                                                                                                                                                                                                                                                                                                |
| Billing routes + webhook        | `services/api/__tests__/billing.itest.ts`   | checkout (seats, interval, 503, free rejected), portal, change-plan (immediate upgrade, parked downgrade, cancel-to-free, seat floor, interval switch), resume, webhook idempotency and rollback, subscription adoption and hijack refusal, cycle-invoice re-anchoring, seat-scaled pool, concurrent near-limit spends, top-ups, trials, owner-only mutations, ledger paging                                                                                                         |
| Resolved features over the wire | `services/api/__tests__/features.itest.ts`  | `GET /features` for a free and an upgraded workspace                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Members, invites, switching     | `services/api/__tests__/workspace.itest.ts` | invite into a free seat, 402 when full, 409 for an existing member, revoke killing a token, accept joining and switching, expired invite, seats shrinking after an invite went out, switching and the 403 without a membership, removal dropping a user back                                                                                                                                                                                                                         |
| The role matrix                 | `services/api/__tests__/roles.itest.ts`     | legacy `editor` rows reading as member, invites hidden from members, who may invite/rename/remove, admin-cannot-remove-admin, owner-only role changes, an invite carrying a role, leave, transfer demoting the old owner                                                                                                                                                                                                                                                             |
| The lazy window roll on read    | `services/core/__tests__/accounts.itest.ts` | `currentWorkspace` zeroing `aiCreditsUsed` and pushing `creditsResetAt` about 30 days out once the window has passed, and leaving an unexpired window alone                                                                                                                                                                                                                                                                                                                          |
| Provisioning                    | `services/api/__tests__/session.itest.ts`   | signup and login, and the workspace created alongside a user                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Artifact access + policies      | `services/api/__tests__/access.itest.ts`    | the level matrix per route (read/patch/content/trash/restore/delete), the 404-not-403 rule for `none`, admin and creator floors, inherit-then-override in both directions, the library and search filters, comments at each level, admin-only trash emptying, the publish policy, `PATCH /workspace` validation, `PUT /artifacts/:id/access`, and the per-member spend cap (exact-boundary refusal, nothing charged, per-member not pooled, admins uncapped, window roll freeing it) |
| Access resolution               | `model/__tests__/artifact-access.test.ts`   | level ordering, `isAccess` refusing prototype keys, every branch of `accessFor`, and the publish policy helpers                                                                                                                                                                                                                                                                                                                                                                      |
| The account surface             | `services/api/__tests__/account.itest.ts`   | `/me` carrying `hasPassword` + `prefs`, rename (trim, cap, clear), password change and first-set, wrong/missing/over-cap current, the `password_changed_at` stamp and the reissued cookie, connections list, unlink with a password or a second provider, the last-credential 409, prefs merge/clear/normalize, memberships with roles, and leaving a named workspace                                                                                                                |
| The OAuth link path             | `services/api/__tests__/oauth.itest.ts`     | the intent cookie only on `?link=1`, linking to the session's account when the provider's email belongs to someone else, refusing an identity linked elsewhere, idempotent relink, the expired-session fallback to sign-in, and failures reporting to `/account` when linking and `/login` when signing in                                                                                                                                                                           |
| Prefs + name normalization      | `model/__tests__/workspace.test.ts`         | `asRole` legacy mapping, `readUserPrefs` dropping unknown keys, wrong types and oversized ids, `mergeUserPrefs` patching, clearing, and refusing to mutate its input, `cleanDisplayName` trimming before capping                                                                                                                                                                                                                                                                     |

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

Four entitlements, resolved the usual way in `model/billing.ts`:

| Key                  | What it gates                                       |
| -------------------- | --------------------------------------------------- |
| `voiceNarration`     | whether a piece can be narrated at all              |
| `voiceDesign`        | whether a voice can be generated from a description |
| `maxWorkspaceVoices` | how many voices a shelf holds; -1 unlimited         |
| `backgroundMusic`    | whether a piece can carry an instrumental bed       |

`soundtracks` follows the same install-wide shape for the same reason: a house preset is one row for
the whole deployment, so the first workspace to pick "Calm" anywhere pays the one generation and no
workspace pays again. Only a bed written for a single piece is tenant-scoped, and it cascades with the
artifact. Composing is metered as `music` (`model/credits.ts`), priced by the minute rather than by
tokens, and a cached pick settles to zero.

Saved library voices cost the account no custom voice slot, so `maxWorkspaceVoices` is generous.
**Designed** voices do take a slot, and slots are finite for every workspace put together, so they
carry a second limit that is ours rather than any plan's: `DESIGN_CEILING` in
`services/core/voices.ts`, plus `reapDesigned()` for ones no shelf holds. The two refusals say
different things, because one has an upgrade to offer and the other does not.
