# Billing & Entitlements — implementation plan

Status: **planning → in progress.** This is the single reference for Galleo's pricing model,
the entitlement/feature-flag layer that gates every paid capability, the Stripe integration, and the
upgrade/downgrade/cancel flows. Companion to `data-model.md` (the `workspaces` billing columns) and
`architecture.md` (the layering law).

## 1. Scope & the billing ↔ credit boundary

Two workstreams touch plans; keep them decoupled:

- **This (billing) session owns:** the `Plan` shape + catalog, the **entitlement resolver** (source of
  truth for what a workspace can do), all non-AI feature/account limits, Stripe wiring, and the
  upgrade/downgrade/cancel/dunning flows.
- **The AI/credit session owns:** the _values_ under `plan.ai.*` (monthly credits, sections-per-
  generation, model tiers) and the **spend / ledger / refund mechanics** (`POST /billing/spend`, the
  `credits` table).
- **The contract between them is the `Plan` object.** They read `plan.ai.creditsPerMonth`; we never
  touch spend logic; they never touch `features`/Stripe. `ai.maxSectionsPerGeneration` is the one field
  their generation route will enforce. Neither side edits the other's cells → no merge collisions.

## 2. Pricing model — Split B (staged launch)

Ship **Free / Plus / Pro** now (every gate on these is built or a tiny add). **Team / Business** are
defined in the same model but `visible:false` / `contactSales:true` until members + seats exist —
promoting them later is two booleans + two env price ids, zero rework.

**Individual** (flat, 1 seat)

|                          | Free      | Plus      | Pro         |
| ------------------------ | --------- | --------- | ----------- |
| $/mo (annual $/mo)       | $0        | $12 ($10) | $24 ($20)   |
| Credits/mo 🔶            | 300       | 1,000     | 4,000       |
| Sections/generation 🔶   | 10        | 25        | 60          |
| Artifacts                | 10        | ∞         | ∞           |
| Image model 🔶           | basic     | advanced  | premium     |
| Remove branding          | —         | ✓         | ✓           |
| Custom themes            | —         | —         | ✓           |
| Export                   | png · pdf | + print   | all         |
| Analytics · public links | —         | —         | ✓ (planned) |

**Team** (per seat, min 2) — _staged_

|                        | Team                                      | Business                         |
| ---------------------- | ----------------------------------------- | -------------------------------- |
| $/seat/mo (annual)     | $30 ($25)                                 | $60 ($50)                        |
| Credits/seat 🔶        | 6,000                                     | 10,000                           |
| Sections/generation 🔶 | 60                                        | 75                               |
| Adds                   | shared brand kit · admin · shared folders | SSO · advanced models · priority |

`🔶` = AI-session-owned value (seed as contract, they tune). Annual = ~2 months free; lives in one field.
Prices/limits are all tunable — the model below is built for it.

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

## 4. Feature flags / entitlements — the source of truth (`model/entitlements.ts`)

Enforcement never reads the plan directly. It reads **resolved entitlements**, which combine three
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
- **Overrides** — a per-workspace `entitlement_overrides` jsonb (comps, grandfathering, beta access,
  admin grants) that can turn a feature on/off _independent of plan_.

```ts
resolveEntitlements(planId, overrides?) -> Entitlements
can(ent, "customThemes"): boolean
limit(ent, "maxArtifacts"): number         // -1 = unlimited
featureStatus("publicLinks"): "live" | "beta" | "planned"
```

## 5. Enforcement (generic)

- **`services/entitlements.ts`** — `entitlementsFor(ws)` reads `ws.plan` + `ws.entitlement_overrides`,
  calls the pure resolver, and (as today) rolls the monthly credit window. Guards:
  `requireFeature(c, ws, key)` → 402 `{ error, upgrade:true }`; `checkLimit(c, ws, key, current)` → 402.
- **Migrate the existing gates** (artifact cap, custom themes, credit spend) and the **export gate**
  (already built in `canvas/render/export.ts` + editor) to call the resolver instead of `limitsFor`.
- **`GET /entitlements`** (or extend `GET /billing`) returns the resolved set so the app drives locks,
  badges, and "coming soon" from the same source. `app` gets a `useEntitlements()`; the editor keeps
  receiving entitlements pushed in (the export-gate seam already does this).

## 6. Stripe wiring

- Create products + prices for every `visible` plan × interval (Plus/Pro now; Team/Business per-seat
  staged). Per-seat uses `quantity = seats` on the line item.
- Env: `STRIPE_PRICE_{PLUS,PRO,TEAM,BUSINESS}_{MONTH,YEAR}`. `stripe.ts` resolves `priceId(plan,
interval)` and reverse-maps `planForPrice(priceId)` across all of them (webhook → plan).
- `stripeReady()` = secret set + at least the live-tier monthly prices present.

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
- **Downgrade reconciliation** — never delete user data. When new entitlements are tighter than current
  usage (e.g. Business→Free with 40 artifacts / custom themes / extra seats): keep everything, but
  **soft-lock** — block _new_ actions over the cap and mark excess resources read-only with an upgrade
  prompt. Driven entirely by the resolver, so it's automatic for every limit.

## 8. Frontend

- **Pricing page** — Individual/Team tab + monthly/annual toggle; per-tier CTA that calls
  `/billing/change-plan` (Upgrade / Downgrade / Current); staged tiers render as "Contact us"; `planned`
  features badge "coming soon" from the registry.
- **Entitlement UX** — `useEntitlements()`; locks/badges across editor (export done), theme editor, etc.;
  over-limit banners after a downgrade; a `past_due` banner prompting a payment-method update.
- **Billing management** — current plan, seats, renewal/period-end date, and payment status, with
  manage-via-portal + in-app change.

## 9. Phased implementation (see the task list)

0. Model: data-driven `Plan` refactor + `entitlements.ts` (registry + resolver).
1. Backend: `entitlements.ts` service + migrate gates + `entitlement_overrides` column + `/entitlements`.
2. Stripe: products/prices per visible plan × interval + `stripe.ts` resolution + env.
3. Flows: `change-plan` route + webhook expansion/fixes + downgrade reconciliation.
4. Frontend: pricing-page flows + entitlement UX + billing management.
5. Test: full up/down/cancel/dunning/seat/annual/reconciliation/idempotency matrix.

## 10. Open tunables / decisions

- Final prices + credit numbers (🔶 with the AI session).
- Free tier: monthly credits vs one-time signup grant (Gamma gives a one-time 400 to cap COGS).
- Annual discount depth (~2 months free vs Gamma's 28%).
- Trials? (`billing.trialDays` is wired for it, default 0.)
- When members/seats ship → flip Team/Business `visible:true` + add their env price ids.
