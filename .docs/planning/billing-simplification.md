# Planning — billing simplification, 2026-09-05

> The plan for reducing the billing and credit layer to its core. Scope agreed on 2026-09-05:
> annual billing stays, scheduled downgrades go, the per-member credit cap goes, and every other cut
> from the review goes ahead. The metered-credit engine (units priced at the model that ran,
> reserve then settle on one ledger row, one balance with capped rollover) is the core and is kept
> as it is. What goes is the machinery that reconciled two mechanisms doing one job: three grant
> paths, a launch-status registry for features that do not exist, pricing concepts used by one or
> two tools, and Stripe branches for cases the product no longer has. Status: built on 2026-09-05;
> production had no users, so phase 0 and the Stripe migration script were not needed. One cut was
> reversed during the build: the free doorway gate on `start-generation` stays, because a refusal
> after the draft exists strands an orphan in the library (see What this does not change). A second
> round on 2026-09-06 removed seats altogether; the per-seat shape described in the phases below is
> the intermediate state, and the addendum at the end is what shipped.

Companion docs: `workspaces.md` (rewritten in phase 5), `ai.md` §5 and §11, `architecture.md`
§Billing, `hosting.md` (env contract), `analytics.md` (event catalog), `testing.md` (coverage map).

## Working rules

The existing patterns hold throughout: one file per concept and no sibling helper splits, comments
only where the code cannot say why, no suppressions, `@ui` primitives reused rather than local
copies, request bodies read through a schema, every product event typed in `model/analytics.ts`.
Phases run in order and each ends with its own suite green; the full gate (`typecheck`, `lint`,
`test`, `test:int`, every `check:*`) runs once at the end. Nothing is committed or pushed; the
tree is handed back for review.

## The shape after

```
model/billing.ts     PLANS (3) · Features (10 keys) · resolveFeatures · grantFor(ws) · clipGrant ·
                     CREDIT_PRICE_USD · CREDIT_PRESETS · upgradeFor · canUpgradeFrom · canTopUp
model/credits.ts     CREDIT_USD · units · usdOfUsage · creditsForUsd · unitPricesFrom · describeUsage
model/tools.ts       usage · meter · free · requires · estimateCost(id, size, prices) · typicalCost ·
                     isMetered · MAX_SECTIONS
core/models.ts       one default model per task, no tiers · unitPricesFor(overrides) · modelCatalogue()
core/ledger.ts       grantOnce(key) · openWindow · rollIfLapsed · chargeCredits · settleCredits
core/spend.ts        reserve(): estimate, charge, run under the meter, settle the difference
core/billing.ts      checkoutUrl · topupUrl · portalUrl · changePlan · resumeSubscription ·
                     consumeWebhook (4 cases) · billingSummary · creditLedger
api/billing.ts       the same seven routes
```

Stripe holds five prices: Pro and Premium, each monthly and yearly, and one one-off credit.
Premium is one line item whose quantity is the seat count. The workspace row loses `plan_status`,
`scheduled_change`, and `member_credit_cap`. Every grant, on any plan and any interval, is the
lazy 30-day roll on read, plus a fresh window whenever a subscription starts granting more than the
row did (a checkout, a tier upgrade, a seat increase), so paying now means credits now.

### The plan catalog after

|                                           | Free             | Pro                | Premium               |
| ----------------------------------------- | ---------------- | ------------------ | --------------------- |
| Price, per seat                           | $0               | $20/mo, $16 annual | $33/mo, $27 annual    |
| Seats                                     | 1                | 1                  | 3 minimum, up to 100  |
| Credits per seat, month                   | 300              | 1,200              | 2,100                 |
| Rollover cap                              | 2 × grant        | 2 × grant          | 2 × grant             |
| Artifacts / storage                       | 10 / 500MB       | unlimited / 20GB   | unlimited / unlimited |
| Export, branding                          | PNG, PDF, marked | all five, no mark  | all five, no mark     |
| Custom themes, public links               | no               | yes                | yes                   |
| Audio (narration, designed voices, music) | no               | yes                | yes                   |
| Analytics, API access                     | no               | no                 | yes                   |
| Buy credits                               | no               | yes                | yes                   |

Three seats of Premium cost $99 a month, as today; the fourth seat moves from $30 to $33. The
margin invariants in `model/__tests__/billing.test.ts` still hold at these numbers: a fully used
seat costs $5.25 against $27 on the annual price (80.6%), Pro costs $3.00 against $16 (81.3%),
the monthly per-credit rates sit within 6% of each other, and a bought credit at $0.02 is above
every plan rate.

## Phase 0 — production pre-flight

Two facts decide whether phase 5 needs the Stripe migration script, and they can only be read from
the production database. Run before starting phase 2, since the answer changes what the webhook
must tolerate:

```sql
select count(*) from workspaces where plan = 'premium' and stripe_subscription_id is not null;
select count(*) from workspaces where scheduled_change is not null;
```

- Premium subscriptions on the current shape (a $99 base item plus an optional seat item) do not
  read as per-seat subscriptions. If the first count is non-zero, `scripts/stripe-migrate-seats.ts`
  (phase 5) rewrites each one to the per-seat price at its current seat count with
  `proration_behavior: "none"`, and runs before the deploy that switches the env var.
- A parked schedule fires its second phase at period end whether or not the code still knows about
  it. If the second count is non-zero, release each schedule in the Stripe dashboard (or with the
  CLI) before the migration drops the column.

Pro subscriptions keep their price ids and shape and need nothing.

## Phase 1 — the contract (`model/`)

`model/billing.ts`

- `PlanBilling` becomes `{ priceMonthly, priceAnnualMonthly, minSeats, maxSeats }`, both prices per
  seat. `includedSeats`, `sellsSeats`, `sellsCredits`, `trialDays` go. `sellsSeats(plan)` is
  `maxSeats > 1`; `canTopUp(plan)` is `priceMonthly > 0`.
- `PlanAi` becomes `{ creditsPerSeat }`. `maxSectionsPerGeneration`, `textModelTier`,
  `imageModelTier` go. `PREMIUM_SEATS`, `SEAT_CREDITS`, `CREDITS_PER_MONTH` collapse into the plan
  entries.
- `PlanFeatures` becomes `removeBranding · customThemes · exportFormats · publicLinks · analytics ·
apiAccess · audio`. The three audio booleans merge into `audio`; `workspaceThemes`,
  `customDomains`, `sso`, `prioritySupport`, `earlyAccess`, `maxWorkspaceVoices` go.
- `Plan` loses `order`, `visible`, `contactSales`. `PLAN_ORDER` is the order; `visiblePlans()`
  becomes a map over it or goes where the caller can read `PLAN_ORDER` directly.
- `ADD_ONS`, `AddOn`, `AddOnId`, `ADD_ON_IDS`, `addOnsFor`, `extraSeatsOf`, `seatsFor`,
  `AddOnBearer` go. `monthlyGrantFor` becomes `grantFor(ws: PlanBearer & { seats })` =
  `overrides.includedCredits ?? creditsPerSeat × seats`. `rolloverCapFor` reads it.
- `FEATURES`, `FeatureStatus`, `featureStatus`, `launched` go. `resolveFeatures(planId, overrides)`
  is the plan value with the override on top, nothing else. `Features` is `planId` plus the seven
  plan features plus `maxArtifacts` and `storageMb`; `includedCredits` leaves the resolved set (it
  never gated anything) and lives on `FeatureOverrides` as the one non-feature override.
- `limitsFor`, `PlanLimits`, `CREDITS_PER_GENERATION`, `gens()`, `MODEL_TIER_RANK`, `ModelTier`,
  `ScheduledChange`, `MIN_CREDIT_PURCHASE`, `MAX_CREDIT_PURCHASE`, `isCreditQuantity`,
  `creditPurchaseUsd` go. `CREDIT_PRESETS` is the set of buyable quantities;
  `isCreditPreset(n)` replaces `isCreditQuantity`.
- `PaywallReason` loses `member-cap`; `ChangeEffect` loses `scheduled`.
- `upgradeFor` compares by `PLAN_ORDER` index and drops the tier branch. The Free card stops
  quoting generation counts; every card quotes credits. Highlights are rewritten plain and pass
  `check:copy`: Pro drops "Premium AI models", Premium drops "shared brand kit" and "Priority
  support" and says "3 seats to start, add more any time" and "API and MCP access".

`model/credits.ts`

- `DEFAULT_UNIT_PRICES` and `taskForUsage` go. Every caller that priced with the default map
  receives prices from the server (services) or from the `model-usage` store (app).

`model/tools.ts`

- `ToolMeta` loses `category`, `ceiling`, `gate`, `live`. The five unbuilt priced tools
  (`revise-artifact`, `translate-artifact`, `suggest-title`, `write-summary`, `write-alt-text`)
  leave `ToolId` and `TOOLS`. `start-generation` is plainly free; `ask-assistant` and
  `design-voice` hold their estimate.
- `reserveCost`, `gateCost`, `costRange`, `SMALL`, `LARGE` go. `estimateCost(id, size, prices)`
  and `typicalCost(id, prices)` take prices as a required argument. `PRICED_TOOLS` is every tool
  with a `usage`.
- `MAX_SECTIONS = 75` lives beside `sectionsForLength`.
- `requires: "audio"` on `narrate-artifact`, `compose-soundtrack`, `audition-voice`, `design-voice`.

`model/workspace.ts`: `memberCreditCap` leaves the workspace DTO.

`model/analytics.ts`: `downgrade_scheduled` goes; `checkout_started` loses `addons`;
`ai_action_started` loses `task`; `plan_changed.from_interval` stays and is now read from the row.

Tests: rewrite `model/__tests__/billing.test.ts` for the new shape (the margin, band, inversion,
rollover and remedy invariants stay, restated per seat); trim `credits.test.ts` of `costRange`,
`gateCost`, `reserveCost` and the default-price cases; `workspace.test.ts` drops the cap field.

## Phase 2 — services core and the database

`services/core/models.ts`

- `ModelTier`, `minTier`, `TIER_RANK`, `tierAllows`, `BASIC_OVERRIDES` go. `modelFor(task,
overrides)`, `modelMap(overrides)`, `unitPricesFor(overrides)`, `modelCatalogue()` with no
  `locked`, `imageModelId()` and `mediaUnitPrice(unit)` with no tier. The `ModelInfo` entries lose
  `minTier`. The test that pinned `DEFAULT_UNIT_PRICES` to the computed table goes.

`services/core/ledger.ts`

- `openWindow(tx, row, key, reason, also?)`: clip the grant against the cap and the purchased
  shield, `grantOnce` it, and set `credits_started_at`, `credits_reset_at`, and the re-clamped
  `purchased_credits` in the same write. The one place a window opens.
- `rollIfLapsed(ws)` replaces `rollCreditWindow`: return early when the window is open; otherwise
  lock the row, re-check, and `openWindow` with key `roll:<workspaceId>:<lapsed resetAt ISO>` and
  reason `monthly-grant`. `WEBHOOK_GRACE_MS` and the interval and subscription checks go; every
  plan rolls the same way.
- `spendThisCycle` and `spendByMember` go. `WorkspaceCreditFields` shrinks to id, plan, seats,
  overrides, purchased.
- `settleCredits(ws, entryId, delta)` drops the usage rewrite; the row keeps the estimate it was
  charged with and the delta is what was paid.

`services/core/spend.ts`

- `reserve(ws, userId, tool, { size, prices, surface })`: prices required, no role, no member cap,
  no gate branch, no ceiling. `settledUsage` and the `task` capture go. `owed(uses, made,
extraUsd, prices)` with prices required.

`services/core/billing.ts`

- `readSub` reads one item: plan and interval from the price, seats from the quantity.
  `addOnEnvKey`, `addOnPriceId`, `addOnMap`, `addOnForPrice`, `addOnLines`, `addOnItemUpdates`,
  `wantedExtraSeats` go.
- `checkoutUrl`: `line_items: [{ price, quantity: seats }]` with seats clamped to the plan's
  bounds; no trial branch; `checkout_started` without `addons`.
- `topupUrl(ws, email, credits)` accepts a preset only.
- `changePlan`: to Free sets `cancel_at_period_end`; anything else is one `subscriptions.update`
  with the target price and quantity, `always_invoice` when the tier or the seat count rises and
  `create_prorations` otherwise, after the seat floor check against members plus unexpired
  invites. `releaseSchedule`, the schedule branch, `subPeriodEnd`'s role in parking, and
  `downgrade_scheduled` go. `resumeSubscription` only clears the cancel flag.
- `consumeWebhook` handles four cases. `applySubscription(tx, ws, sub, key)` is shared by the
  subscription checkout and `customer.subscription.updated`: sync plan, interval, seats, customer
  and subscription ids, period end, and the cancel flag from the live subscription; then, when
  `grantFor(after) > grantFor(before)`, `openWindow` with reason `upgrade-grant` and the event id
  as the key. The pack checkout stays as it is minus the bounds check, which becomes the preset
  check. `customer.subscription.deleted` drops to Free and one seat. `invoice.paid`,
  `invoice.payment_failed`, `charge.refunded`, `charge.dispute.created`, `resolveClawback`,
  `chargeOfDispute`, `activeStatus`, and the superseded-subscription cancel go. An unknown price
  id still keeps the row's plan and warns.
- `billingSummary` drops `status`, `mySpend`, `myCap`, `scheduledChange`, `includedSeats`,
  `addOns`, `addOnQuantities`; reads `maxArtifacts` from `featuresFor`; keeps `perGeneration` as
  `estimateCost("generate-artifact", {}, unitPricesFor({}))`.

`services/core/media.ts`: `aiImageOptions(ws, source)`; the image model is the env override for
everyone. `services/core/prepare.ts`, `services/core/voices.ts`: `audio` replaces the three keys;
the shelf-size check goes and `DESIGN_CEILING` stays.

`services/core/ai/`: `execute.ts` derives no tier, passes no role to `reserve`, and reads
`MAX_SECTIONS` where it read `ctx.maxSections`; `tools.ts` drops `tier` and `maxSections` from the
context; `tools/plan.ts`, `text.ts`, `theme.ts`, `refine.ts`, `notes.ts`, `suggest.ts` drop the
`tier` option; `prompts/generate.ts` states the constant limit, keeping `OutlineOpts.maxSections`
only as the eval probe's override; `eval/agent-eval.ts` reads `grantFor` instead of `limitsFor`;
`traces.ts` records `modelMap(overrides)`.

`services/core/accounts.ts`: `currentWorkspace` calls `rollIfLapsed`; `freshCreditWindow(plan)`
seeds the balance with `grantFor({ plan, seats: 1 })` as today.

`services/db/schema.ts`: drop `plan_status`, `scheduled_change`, `member_credit_cap`; keep
`plan_interval`, `plan_period_end`, `cancel_at_period_end`, `purchased_credits`, `credits.usage`,
`credits.key`. `pnpm db:generate` writes the migration.

`services/db/seed/workspaces.ts` and `seed.ts`: the spec loses `planStatus`, `scheduledChange`,
`cancelAtPeriodEnd`; `seats` stays the total and `demo` on five Premium seats grants 10,500;
the writer clamps seats to the plan's bounds, replays the ledger with `grantFor`, and validates
pack rows against the presets. The doc's five-workspace table is already stale (the seed holds
`demo`, `pro`, `free`) and is corrected in phase 5.

Tests: `ledger.itest.ts` (keyed roll, no grace, every plan rolls, purchased shield), `spend.test.ts`
(prices required, no cap), `stripe.test.ts` (five price ids, the annual-to-monthly fallback stays,
add-on helpers gone), `models.test.ts` (no tiers, no mirror), `execute.test.ts` (`audio`),
`analytics.itest.ts` (event shapes), `accounts.itest.ts` (the roll on read).

## Phase 3 — the HTTP surface

- `services/api/billing.ts`: `zTopup` is `z.literal` over the presets; `zWanted.seats` stays and
  the core clamps it; the change-plan route drops the `scheduled` effect and the members error text
  stays.
- `services/api/features.ts`: `{ features, models: modelCatalogue() }`, no `status` map.
- `services/api/ai.ts`: no `maxSections` in the run context; `refused` and `creditRefusal` lose
  the member-cap body.
- `services/api/workspace.ts`: `GET /workspace` drops `memberCreditCap` and the `?spend=1`
  roster spend; `PATCH /workspace` drops the cap field from its schema.
- `services/api/voices.ts`, `narration.ts`: gate on `audio`; the shelf-size 402 goes.
- `services/api/middleware.ts`, `services/utils/http.ts`: `OVER_MEMBER_CAP` and the capped branch
  of `creditRefusal` go; `requireFeature` and `checkLimit` are unchanged.

Tests: `billing.itest.ts` loses the schedule, dunning, clawback, supersede, cycle-invoice,
custom-quantity and member-cap blocks and gains the shared upgrade grant (checkout, tier rise,
seat rise each open a window; a renewal `subscription.updated` grants nothing; a redelivered event
grants once); `features.itest.ts`, `workspace.itest.ts`, `access.itest.ts` (the per-member cap
block), `media.itest.ts`, `attribution.itest.ts`, `http.test.ts`, `voices.itest.ts` follow.

## Phase 4 — the product

- `app/api.ts`: `BillingState` becomes `plan · periodEnd · cancelAtPeriodEnd · interval ·
intervals · credits { balance, monthlyGrant, perGeneration, resetAt, rolloverCap, capped } ·
usage · seats · catalog · creditSale · stripeReady · hasCustomer`; `FeaturesState` loses
  `status`; the workspace DTO loses the cap and the member `spend`.
- `app/stores/features.ts`: `statusOf` goes. `app/stores/billing.ts`: unchanged apart from the
  types. `app/stores/workspace.ts`: the cap field and the spend query go.
  `app/stores/generate-plan.ts` and `app/components/MediaPicker.tsx`: price through
  `unitPrices()` from `app/stores/model-usage.ts`, which already resolves the catalogue the server
  sends; the module-level constants become functions of it.
- `app/components/PlanPanel.tsx`: the add-on list and seat stepper become one seat control on the
  current-plan card for plans with `maxSeats > 1` (`TextField` + `Button`, the existing
  `ConfirmModal` when the count rises since that invoices now); the scheduled-change and past-due
  rows go; the price table shows `typicalCost(id, unitPrices())` with a "scales with size" note
  for metered tools and no "soon" badge.
- `app/components/BillingPanel.tsx`: the past-due banner, the Spending section, the custom
  quantity form and the "you used N this cycle" line go; presets, the portal, and the ledger stay.
  The pack copy says bought credits never expire and are not refundable.
- `app/components/UpgradePlans.tsx`: per-seat price display ("$33 / seat / mo, 3-seat minimum")
  for plans with `maxSeats > 1`; the seat field applies to those plans only; the interval toggle
  and the interval switch stay.
- `app/components/Upgrade.tsx`: the "coming soon" branch goes; `reportPaywall` takes an explicit
  feature. `app/components/Sidebar.tsx`: the past-due state goes. `ModelPicker.tsx`: no locks.
  `VoiceShelf.tsx`, `EditorView.tsx`, `PresentView.tsx`: `can("audio")`.
  `views/generate/Intake.tsx`: the section-cap notice goes. `WorkspaceSettingsView.tsx`: the seat
  card reads `maxSeats`, the cap column goes.
- `editor/core/store.ts`: `ExportFeatures` is typed off `Features` rather than `PlanLimits`.
- `website/WebsitePage.tsx`: the pricing section reads the same catalog and shows Premium per seat.

Tests: `app/__tests__/api.test.ts`; `e2e/plans/plans.spec.ts` (the seat-cap invite wall is
unchanged and still passes).

## Phase 5 — scripts and docs

- `scripts/stripe-setup.ts`: products `plan_pro`, `plan_premium` (per seat), `credit`; the seat
  add-on leaves `wanted()`, and the script archives any active `galleo_*` price, and any product
  it made earlier, that it no longer wants, so the account converges on the catalog. Env block: `STRIPE_PRICE_PRO_MONTH/YEAR`,
  `STRIPE_PRICE_PREMIUM_MONTH/YEAR`, `STRIPE_PRICE_CREDIT`.
- `scripts/stripe-migrate-seats.ts`, only if phase 0 found live Premium subscriptions: for each
  workspace on Premium with a subscription, replace the items with the per-seat price at the
  row's seat count, `proration_behavior: "none"`, keeping the billing anchor; `--dry-run` first.
- `scripts/check-tools.ts`: the body check no longer reads `live`; every tool reachable from a
  non-internal surface must have a body. `scripts/posthog-dashboards.ts`: the "Models pinned by
  task" tile breaks down by `tool_id`; no tile references `downgrade_scheduled` or `addons`.
- Docs: `workspaces.md` (plans, resolver, gates table, Stripe, the window, packs, the seed table),
  `ai.md` §5 (the price table, no ceiling or gate, the catalog count) and §11, `architecture.md`
  §Billing (the stale per-seat table), `hosting.md` (five price ids), `analytics.md` (the three
  event changes), `testing.md` (the coverage map), and the `billing` line in `AGENTS.md`. The
  `.docs/prompts/` files that describe adding SSO, custom domains, a brand kit or a public API
  are left as they are; each describes re-adding a key.

## Phase 6 — the gate and the hand-off

`pnpm typecheck`, `pnpm lint`, `pnpm format`, `pnpm test`, `pnpm test:int` (Postgres up), and
every `check:*` including `check:copy` over the new highlight strings, `check:tools`,
`check:validation` for the changed body schemas, `check:modules`, `check:boundaries`. Then a
report of what changed, what the tests cover, and the deploy order below. No commit.

## Deploy order

1. Phase 0 counts. Release parked schedules if any.
2. `pnpm stripe:setup` against the live account: the new per-seat Premium prices are created and
   the old ones archived; existing subscriptions keep billing on the archived price until step 3.
3. `stripe-migrate-seats` if any Premium subscription exists.
4. Set the five price env vars in Render; drop `STRIPE_PRICE_SEAT_*`.
5. Deploy; the migration drops the three columns on boot.

## What this does not change

The plan lineup and Pro's solo shape, the pack rate and presets, the one-credit floor, the rollover
cap and the purchased-credit shield, the `apiAccess` gate that keeps MCP paid, the ledger's usage
breakdown, `feature_overrides`, the interval switch, cancel at period end and resume, the seat
floor on a decrease, the 402 bodies and the walls that read them, the analytics seams, and the free
doorway gate (`gate` on `start-generation`, `gateCost`, the balance check in `reserve`), kept so an
out-of-credits launch is refused before a draft artifact and a generation row exist.

## Addendum, 2026-09-06: seats removed

After the per-seat build ran end to end on the sandbox, the user chose to drop seats entirely, so
the phases above describe an intermediate state. What shipped instead:

- **One flat price per plan.** Premium is $99 monthly and $82 annual for the whole workspace, with
  one grant of 5,000 credits a month (6,300, what three seats carried, until the user set it to
  5,000 the same day, which prices a Premium credit at parity with Pro). `PlanBilling` is the two
  prices, `PlanAi` is `monthlyCredits`, and `grantFor(ws)` reads it or the `includedCredits`
  override. The margin, rate-band and bought-credit invariants hold unchanged.
- **The member cap is a plan feature.** `PlanAccount.maxMembers` is 1 on Free and Pro and unlimited
  on Premium, resolved like every other limit. `inviteMember` and `acceptInvite` check it through
  `withinLimit`, and the refusal is an ordinary feature 402 naming `maxMembers`, so the wall sells
  Premium. The `seats` column, `clampSeats`, `sellsSeats`, the seat floor, the seat control, the
  plan grid's seat field, the `seats_changed` event and the seat traits are gone; migration
  `0051_modern_darkstar.sql` drops the column.
- **The Stripe line is quantity one again.** `readSub` reads plan and interval; `changePlan` takes a
  plan and an interval; `applySubscription` grants on a tier rise only.
- **Sharing the pool is visibility, not a cap.** `GET /workspace?spend=1` returns each member's net
  spend this cycle (`spendByMember`, back in `core/ledger.ts`), and the members list in settings
  shows it beside each person. The remedy for a heavy team is buying credits.
- **Sandbox verified.** `pnpm stripe:setup` repriced Premium to $99 and $984 and archived the $33
  prices; the end-to-end flow (Checkout, purchase, in-app upgrade with the fresh grant,
  interval switch, downgrade, cancel and resume, portal, deletion) passed against the sandbox with
  every webhook answering 200.

- Go-live, 2026-09-06: `stripe:setup` grew the two account objects that are not catalog data,
  the customer portal configuration (money and invoices only) and the webhook endpoint on the
  four consumed events, plus `--live --project` for the CLI's live profile and a guard that
  refuses a live key without `--live`. The Dashboard side (activation, failed-payment
  cancellation, customer emails, a restricted key) is the runbook in `hosting.md`.

Still open from the sandbox run: a tier upgrade grants the whole new allowance in a fresh window
rather than the difference, which is generous by up to one month's grant and bounded by the
rollover cap. Left as is pending a decision.
