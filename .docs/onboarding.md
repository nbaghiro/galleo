# Galleo — Onboarding: the first session

> The design for what happens between a signup and a user who has understood the product. Covers the
> one-time signup grant, why the first artifact is a template rather than a generation, the format
> question, the activation checklist and how its state is derived, the `UserPrefs` schema, and the
> events we need before any of this is measurable. Companion docs: `workspaces.md` (the credit window
> and the ledger this spends against), `ai.md` (what a generation costs and what the gate charges
> for), `frontend.md` (the `@ui` primitives the surfaces are built from), `architecture.md`.

## Status

Built, pending manual QA. What ships:

| piece                                                                          | where                                                    |
| ------------------------------------------------------------------------------ | -------------------------------------------------------- |
| the `onboarding` prefs branch, read and merged field by field                  | `model/workspace.ts`                                     |
| the state DTO the app reads                                                    | `model/workspace.ts` (`OnboardingState`)                 |
| `SIGNUP_GRANT_CREDITS = 200`                                                   | `model/billing.ts`                                       |
| `grantOnce`, moved down so the grant and Stripe share one idempotent primitive | `services/core/ledger.ts`                                |
| the grant release and the derived checklist                                    | `services/core/onboarding.ts`                            |
| `GET /onboarding`                                                              | `services/api/onboarding.ts`                             |
| release on verification, both paths                                            | `services/api/session.ts`, `services/api/oauth.ts`       |
| the format question                                                            | `app/views/OnboardingView.tsx`, routed at `/welcome`     |
| the checklist                                                                  | `app/components/OnboardingChecklist.tsx`, in the sidebar |
| the client store                                                               | `app/stores/onboarding.ts`                               |
| the studio's format default                                                    | `app/stores/generate.ts`                                 |

Not built: the seven events in the Events section below. `.docs/analytics-events.md` specifies them and
`.docs/prompts/09-product-analytics.md` is the handoff, so none of this is measurable yet.

## The constraint everything follows from

A new workspace opens with 100 credits and one whole-artifact generation costs 42, so a new user has
**2.4 generations a month**. That single number decides most of the design below, because it means the
obvious onboarding move, generating something impressive to demonstrate the product, spends 42% of the
user's first month before they have decided whether they want it. A user who generates twice and likes
neither result is locked out until the window rolls.

Credits are not a synthetic currency. One credit is about $0.0142 of real provider spend, so an
allowance is a dollar liability and a generous first run is a real cost per signup. We can choose to
pay it, but we should choose it explicitly rather than by leaving a demo generation in the flow.

There is a second asset the current product underuses. The 30 templates in `TEMPLATE_INDEX` are
hand-authored artifacts served as static content, and none of the `/artifacts` routes carry a credit
gate, so starting from a template is free. They render through the same engine as generated work, which
means they make the same argument about output quality, and they appear with no model latency at all.

So the thesis is to separate seeing it work from spending on it. Onboarding generates nothing. The
generation budget is reserved for the user's own first real intent.

## What Gamma and Canva do

Gamma opens with a four-part segmentation quiz covering context (work, personal, education), industry,
use case, and attribution, then moves the user to a prompt workspace with example prompts and a shuffle
button, then walks cards and blocks with a checklist. Its free tier is 400 credits granted once at
signup, roughly three to ten presentations, after which it is dry: there is no monthly refresh.

Canva asks one question, "What will you be using Canva for?", and spends the answer immediately by
preloading a matching template in the editor. It counts activation at the first download or share.

The contrast is the useful part. Gamma buys exploration with a large one-time pool and accepts that the
free tier eventually stops working. Canva avoids needing a pool at all by making the first finished
artifact free to reach. Galleo's free tier is currently shaped like neither: it is small and it
refreshes monthly, which suits long-run retention but starves the first session. We propose taking
Canva's free path to the first artifact and Gamma's front-loaded grant, because the two solve different
halves of the problem and we have the templates to do the first cheaply.

## The design

### 1. One question, asked because we need the answer

Immediately after signup we ask what the user is making first: a deck, a document, or a site.

This is not a segmentation field we store and report on. `format` is the axis the entire engine is
organised around, and the answer does three concrete things: it picks the format profile the artifact
renders under, it filters the template set we offer, and it becomes the default in the generation
studio. Because `templatesOnce()` returns full template bodies, `content.format` is available on the
client after one catalog fetch, so the filter needs no schema change.

We ask nothing else. Industry and attribution are worth knowing, but they are worth less than the
seconds they cost here, and we have no analytics pipeline to act on them yet. If we want attribution
later it belongs on the marketing site, before the signup, not in the product's first screen.

### 2. The first artifact is a template, opened in the editor

Instead of landing on the empty library, the user lands in a real artifact in their chosen format,
built from a template, open in the editor. This costs no credits, takes one request rather than a model
round trip, and makes the user's first action editing something good rather than composing a prompt in
front of a blank box.

Which template: the most-used one for that format, which we already track through `recordTemplateUse`
and expose as `templateUsesOnce()`. That makes the choice self-improving without a hand-maintained
mapping, and it degrades to a reasonable default when the counts are empty.

The user can of course reject it. The library remains one click away, and the template row stays
visible, so this is a starting point rather than a wizard the user has to escape.

### 3. The first generation is theirs

We surface the generation studio only after the user has handled a real artifact. At that point the
intake is pre-filled with the format they chose and shows example prompts, which is the one part of
Gamma's flow that clearly earns its place, because the hardest moment in a prompt-first product is
knowing what to type.

Spending 42 of 100 credits is defensible when the output is the user's own content and they asked for
it. It is not defensible when it is a demo we chose for them.

### 4. The signup grant

We add a one-time grant on top of the monthly allowance, so that exploring in the first session does not
consume the first month.

|                    | credits | generations |
| ------------------ | ------- | ----------- |
| today, month one   | 100     | 2.4         |
| proposed grant     | 200     | 4.8         |
| proposed month one | 300     | 7.1         |

At $0.0142 a credit the 200-credit grant is about **$2.84 of provider spend per signup**, which is a
customer-acquisition line item rather than a product cost, and should be reviewed as one. The number is
a starting proposal, not a derived result; we picked it to put month one near seven generations, which
is enough to try a few real briefs and still have room after a bad one.

Two rules keep it from being farmed. The grant applies to a user's **first** workspace only, not to
every workspace they create, since a user can own several. And it is released on **email
verification** rather than at row creation. Verification is already sent from `session.ts` and
currently gates nothing at all, so this gives it a purpose and puts the cheapest abuse behind a real
mailbox. The monthly 100 still lands at signup, so an unverified user is not blocked, only ungranted.

Mechanically this is a new ledger reason alongside `monthly-grant`, `renewal-grant`, and
`upgrade-grant`. It must be idempotent, because verification can be requested more than once, so the
insert is guarded on the absence of an existing `signup-grant` row for that workspace rather than on a
flag we could lose.

### 5. A checklist, not a coachmark tour

We do not build a spotlight tour. Coachmarks anchor to coordinates, and the editor's canvas reflows by
design: the engine decides every box from text metrics, the three responsive tiers rearrange the
chrome, and the phone tier replaces the floating panels with sheets entirely. A tour would be
permanently one layout change away from pointing at nothing.

Instead a dismissible checklist sits under the sidebar nav with four steps:

| step           | done when                                                              |
| -------------- | ---------------------------------------------------------------------- |
| Make something | the workspace has at least one artifact                                |
| Write with AI  | an artifact has `ai_meta`, or the ledger holds a generation charge     |
| Make it yours  | the workspace has a custom theme, or an artifact moved off the default |
| Send it out    | a link exists for an artifact, or one has been exported                |

Every one of those is derived from tables we already have, so the checklist needs no event system, is
correct for users who did the steps before we shipped it, and cannot drift out of step with reality the
way a stored boolean would. It disappears when all four are done or when the user dismisses it.

## Where the state lives

`UserPrefs` in `model/workspace.ts` currently holds one field, `appTheme`, and is read through a
`readUserPrefs` that drops unknown keys and wrong types because the jsonb is client-written. Onboarding
state goes there:

```ts
export interface UserPrefs {
    appTheme?: string;
    onboarding?: {
        format?: Format; // the answer to the one question
        landedAt?: string; // ISO; when we opened the starter artifact
        checklistDone?: boolean; // dismissed, as distinct from all four steps complete
    };
}
```

Both `readUserPrefs` and `mergeUserPrefs` need the nested branch, and both need tests, since the
existing pair is the only thing standing between a client-written blob and the column. Note what is
deliberately absent: no per-step booleans, because the four steps are derived. The only things stored
are the answer we cannot recompute and the dismissal we must respect.

## Surfaces touched

| surface                         | change                                                                    |
| ------------------------------- | ------------------------------------------------------------------------- |
| `app/views/AuthPage.tsx`        | stop sending every signup to `/`; new users go to the format question     |
| a new onboarding view           | the one question, then create-from-template, then redirect to `/edit/:id` |
| `app/components/Sidebar.tsx`    | the checklist, below the nav items                                        |
| `app/views/generate/Intake.tsx` | pre-fill the format, keep the example prompts                             |
| `services/core/ledger.ts`       | the `signup-grant` reason and its idempotent insert                       |
| `services/core/accounts.ts`     | release the grant on verification, first workspace only                   |
| `model/workspace.ts`            | the `onboarding` branch in prefs, reader and merger                       |

The chrome is built from `@ui` primitives that already exist, `Modal` or `Sheet` from `overlay.tsx` for
the question and `EmptyState` from `status.tsx` for the checklist's finished state, so no new shared
component is required. Anything genuinely new stays local to the view until a second module needs it.

## Events

There is no event tracking in the product today. The only analytics are link and artifact view counts,
which means we currently cannot answer whether any of this works, and the ordering above rests on the
credit arithmetic rather than on observed drop-off.

The minimum funnel is: signed up, answered the format question, opened the starter artifact, edited it,
opened the studio, completed a generation, and each checklist step as it lands. That is seven events
and it is enough to see which step loses people. We should treat this as a prerequisite rather than a
follow-up, because shipping the flow without it means the next revision is guesswork too.

## Planned / deferred

- **The grant amount is a proposal.** 200 credits puts month one near seven generations at $2.84 a
  signup. We have no conversion data to weigh that against, so it should be revisited once the funnel
  above reports.
- **Nothing caps credit rollover.** Rollover is on, so a workspace that never spends banks
  indefinitely, and the signup grant adds to that. Unrelated to onboarding in origin, but the grant
  makes the exposure slightly larger.
- **Teams are out of scope here.** An invited member joins a workspace that already has content and a
  plan, so their first session is a different problem and probably a different flow. No grant applies to
  them, since the grant is per first workspace.
- **Attribution is unasked.** If we want to know where users come from, it belongs on the marketing
  site ahead of signup.
- **No re-onboarding.** A user who dismisses the checklist has no way to bring it back. Probably
  acceptable, but worth a line in account settings if it turns out people want it.
