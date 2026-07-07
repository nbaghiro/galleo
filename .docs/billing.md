# Billing & Features — implementation plan

Status: **planning → in progress.** This is the single reference for Galleo's pricing model,
the feature layer that gates every paid capability, the Stripe integration, and the
upgrade/downgrade/cancel flows. Companion to `data-model.md` (the `workspaces` billing columns) and
`architecture.md` (the layering law).

## 1. Scope & the billing ↔ credit boundary

Two workstreams touch plans; keep them decoupled:

- **This (billing) session owns:** the `Plan` shape + catalog, the **feature resolver** (source of
  truth for what a workspace can do), all non-AI feature/account limits, Stripe wiring, and the
  upgrade/downgrade/cancel/dunning flows.
- **The AI/credit session owns:** the _values_ under `plan.ai.*` (monthly credits, sections-per-
  generation, model tiers) and the **spend / ledger / refund mechanics** (`POST /billing/spend`, the
  `credits` table).
- **The contract between them is the `Plan` object.** They read `plan.ai.creditsPerMonth`; we never
  touch spend logic; they never touch `features`/Stripe. `ai.maxSectionsPerGeneration` is the one field
  their generation route will enforce. Neither side edits the other's cells → no merge collisions.

## 2. Pricing model — 3 tiers, seats orthogonal to tier

Three tiers: **Free · Pro · Premium**. Tier = _what you can do_; **seats** = _how many of you_. Free is
solo (flat). **Pro and Premium are both per-seat** — a solo user buys 1 seat, a team buys N — so a team
can form on either paid tier without a separate "Team/Business" plan. All three are `visible` (sold); no
staged tiers.

|                        | Free         | Pro                              | Premium                                  |
| ---------------------- | ------------ | -------------------------------- | ---------------------------------------- |
| Price                  | $0           | **$20 / seat / mo** ($16 annual) | **$40 / seat / mo** ($33 annual)         |
| Billing                | flat, 1 seat | per-seat (min 1)                 | per-seat (min 1)                         |
| Team members           | — (solo)     | ✓ invite, billed / seat          | ✓ invite, billed / seat                  |
| Credits/mo 🔶          | 150 (~3)     | 2,500 / seat (~60)               | 6,000 / seat (~140)                      |
| Sections/generation 🔶 | 10           | 60                               | 75                                       |
| AI models 🔶           | basic        | premium                          | premium                                  |
| Artifacts              | 10           | ∞                                | ∞                                        |
| Watermark · export     | on · png/pdf | off · all formats                | off · all formats                        |
| Custom themes          | —            | ✓                                | ✓ + shared brand kit                     |
| Storage                | 500 MB       | 20 GB                            | ∞                                        |
| Org (planned)          | —            | —                                | SSO · analytics · API · admin · priority |

`🔶` = AI-session-owned value (seed as contract, they tune). Annual ≈ 2 months free; one field. Credits
were **lowered** from the earlier draft to protect AI COGS. A per-seat workspace pool = `seats ×
credits/seat`. Prices/limits are all tunable.

**Teams are live, not staged.** Because both paid tiers bill per seat, the **members/seats feature is now
required** (see §6.1 + the task list), not deferred. Until it ships, Pro/Premium are fully usable **solo**
(1 seat); the "invite / add seat" surface is the one build item that unlocks multi-seat.

## 3. Data-driven plan config (`model/billing.ts`)

One `PLANS` record; every lever is a field; UI + enforcement both derive from it. Presentation is
separated from enforcement so copy edits can't break gates. Stripe price ids are **never** in this file —
they resolve from env by `STRIPE_PRICE_{ID}_{INTERVAL}`.

```ts
interface Plan {
    // identity / presentation
    id;
    name;
    tagline;
    audience: "individual" | "team";
    badge?;
    highlights: string[];
    order;
    visible;
    contactSales;
    // billing / Stripe
    billing: {
        model: "flat" | "per_seat";
        priceMonthly;
        priceAnnualMonthly;
        minSeats;
        maxSeats: number | null;
        trialDays;
    };
    // AI limits (fields ours, values theirs 🔶)
    ai: {
        creditsPerMonth;
        creditsRollover;
        maxSectionsPerGeneration;
        textModelTier;
        imageModelTier;
        creditTopUpsAllowed;
    };
    // account caps
    account: { maxArtifacts /* -1=∞ */; maxMembers; storageMb };
    // feature gates
    features: {
        removeBranding;
        customThemes;
        workspaceThemes;
        exportFormats: ExportFmt[];
        publicLinks;
        customDomains;
        analytics;
        apiAccess;
        sso;
        prioritySupport;
        earlyAccess;
    };
}
```

Moving a limit across tiers = change one number. New gate = one key in `features` (defaults off
everywhere). New tier = one object + `PLAN_ORDER` entry + env ids. Flat↔per-seat = `billing.model`.

## 4. Features — the source of truth (`model/features.ts`)

Enforcement never reads the plan directly. It reads **resolved features**, which combine three
inputs so billing is just one of them:

```
effective(feature) = feature.status !== "planned"      // global launch gate
                     && ( plan grants it || workspace override grants it )
```

- **`FEATURES` registry** — the canonical list of every capability with `{ key, kind:
boolean|number|enum, status: "live" | "beta" | "planned", default, description }`. `status` is the
  honesty layer: `planned` features are off for everyone (but the pricing card can show "coming soon");
  `live`/`beta` can be granted. **This registry is the source of truth for what exists.**
- **Plan grants** — from `plan.features` / `plan.account` / `plan.ai`.
- **Overrides** — a per-workspace `feature_overrides` jsonb (comps, grandfathering, beta access,
  admin grants) that can turn a feature on/off _independent of plan_.

```ts
resolveFeatures(planId, overrides?) -> Features
can(f, "customThemes"): boolean
limit(f, "maxArtifacts"): number         // -1 = unlimited
featureStatus("publicLinks"): "live" | "beta" | "planned"
```

## 5. Enforcement (generic)

- **`services/features.ts`** — `featuresFor(ws)` reads `ws.plan` + `ws.feature_overrides`,
  calls the pure resolver, and (as today) rolls the monthly credit window. Guards:
  `requireFeature(c, ws, key)` → 402 `{ error, upgrade:true }`; `checkLimit(c, ws, key, current)` → 402.
- **Migrate the existing gates** (artifact cap, custom themes, credit spend) and the **export gate**
  (already built in `canvas/render/export.ts` + editor) to call the resolver instead of `limitsFor`.
- **`GET /features`** (or extend `GET /billing`) returns the resolved set so the app drives locks,
  badges, and "coming soon" from the same source. `app` gets a `useFeatures()`; the editor keeps
  receiving features pushed in (the export-gate seam already does this).

## 6. Stripe wiring

- Create products + prices for every `visible` plan × interval (Plus/Pro now; Team/Business per-seat
  staged). Per-seat uses `quantity = seats` on the line item.
- Env: `STRIPE_PRICE_{PLUS,PRO,TEAM,BUSINESS}_{MONTH,YEAR}`. `stripe.ts` resolves `priceId(plan,
interval)` and reverse-maps `planForPrice(priceId)` across all of them (webhook → plan).
- `stripeReady()` = secret set + at least the live-tier monthly prices present.

## 6.1 Billing entity & seats

**The workspace is the billing entity — one Stripe Customer + one Subscription per workspace, not per
user.** Already how the schema is built (`stripe_customer_id` / `stripe_subscription_id` on
`workspaces`), and the right model: everything is workspace-scoped and seats = members of a workspace. An
individual on Free/Pro is a workspace with **1 seat**; a team is a workspace on Pro/Premium with **N
seats** — one consistent path, no separate per-user billing.

- **Customer = workspace** (owner's email as contact + `metadata.workspaceId`). A user who owns multiple
  workspaces gets one customer each; a shared-payer-across-workspaces model is a future option (today a
  user has one workspace).
- **Seat count is orthogonal to tier.** `workspace.plan` = tier; a cached `workspace.seats` column
  (int, default 1) = quantity, synced from the webhook (`subscription.items.data[0].quantity`) so
  `maxMembers` enforcement needs no Stripe round-trip. Price = tier's per-unit price × seats.
- **Per-seat mechanics (Stripe):** a per-seat plan is a normal recurring per-unit price with the line
  item's `quantity = seats`; Stripe multiplies. No special price type — `plan.billing.model` (catalog) is
  what tells our code to show a seat picker, send `quantity`, and allow seat changes. Flat plans always
  send `quantity = 1` and hide the picker.
- **Who can manage billing:** only the workspace **owner/admin**. Billing-mutation routes must check the
  member role (today they use `currentWorkspace(u.id)` with no role gate — add it).
- **Seats ↔ members:** can't reduce seats below active members; adding a member requires a free seat
  (prompt to buy one).

## 7. Upgrade / downgrade / cancel flows

Policy (standard SaaS): **upgrades take effect immediately with proration; downgrades and cancels take
effect at period end** (the user keeps what they paid for).

| From → To            | Mechanism                                                       | Timing                  | Proration       |
| -------------------- | --------------------------------------------------------------- | ----------------------- | --------------- |
| Free → paid          | Checkout Session                                                | immediate               | n/a             |
| paid → higher        | `subscriptions.update` new price                                | immediate               | charge diff now |
| paid → lower         | subscription schedule / `proration_behavior:none` at period end | period end              | none            |
| paid → Free (cancel) | `cancel_at_period_end: true`                                    | period end              | none            |
| seat +/− (per-seat)  | update item `quantity`                                          | up=now, down=period end | prorated        |
| monthly ↔ annual     | `subscriptions.update` price + interval                         | per policy above        | Stripe computes |

- **`POST /billing/change-plan`** — in-app up/downgrade + seat + interval changes (buttons on the pricing
  page, not only the portal). Keeps `/billing/portal` for payment method + invoices.
- **Webhook expansion** (`services/api/billing.ts`): handle `customer.subscription.updated` (plan/seat/
  status/**scheduled** changes taking effect), `invoice.payment_failed` → `past_due` + dunning banner,
  `invoice.paid` → clear it, `customer.subscription.deleted` → Free. **Fix `plan_period_end`** to the
  real `current_period_end` (today it's a fake +30d). Make handlers **idempotent** (upsert by sub id;
  ignore stale events).
- **Downgrade reconciliation** — never delete user data. When new limits are tighter than current
  usage (e.g. Premium→Free with 40 artifacts / custom themes / extra seats): keep everything, but
  **soft-lock** — block _new_ actions over the cap and mark excess resources read-only with an upgrade
  prompt. Driven entirely by the resolver, so it's automatic for every limit.

## 8. Frontend

- **Pricing page** — one page (no Individual/Team tab), monthly/annual toggle + a **seat selector** on the
  per-seat tiers (Pro/Premium); per-tier CTA that calls `/billing/change-plan` (Upgrade / Downgrade /
  Current); `planned` features badge "coming soon" from the registry.
- **Feature-gated UX** — `useFeatures()`; locks/badges across editor (export done), theme editor, etc.;
  over-limit banners after a downgrade; a `past_due` banner prompting a payment-method update.
- **Billing management** — current plan, seats, renewal/period-end date, and payment status, with
  manage-via-portal + in-app change.

## 9. Phased implementation (see the task list)

0. Model: data-driven 3-tier `Plan` (Free flat · Pro/Premium per-seat) + `features.ts`. **✅ done**
1. Backend: `features.ts` service + migrate gates + `/features`. **✅ done**
2. Stripe: **Pro + Premium** products (per-seat, monthly + annual) + `stripe.ts` resolution + env.
3. Flows: `change-plan` (incl. seat changes) + webhook expansion/fixes + downgrade reconciliation.
4. **Members & seats** (now required): invites + roles + seat ↔ Stripe-`quantity` sync +
   `seats` / `feature_overrides` columns + owner/admin billing gate.
5. Frontend: pricing page (seat selector) + feature-gated UX + billing management.
6. Test: full up/down/cancel/dunning/seat/annual/reconciliation/idempotency matrix.

## 10. Open tunables / decisions

- Credits lowered to **150 / 2,500 / 6,000** (Free / Pro / Premium) 🔶 — confirm with the AI session.
- Free tier: monthly credits vs one-time signup grant (Gamma gives a one-time 400 to cap COGS).
- Annual discount depth (~2 months free vs Gamma's 28%).
- Trials? (`billing.trialDays` is wired for it, default 0.)
- Should Free allow inviting a first teammate as a trial, or stay strictly solo (current)?
