# Galleo — Onboarding: the first session

> What happens between a signup and a user who has understood the product. Covers the
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
| the starter wall (and the format question it replaced)                         | `app/views/OnboardingView.tsx`, routed at `/welcome`     |
| the checklist                                                                  | `app/components/OnboardingChecklist.tsx`, in the sidebar |
| the client store                                                               | `app/stores/onboarding.ts`                               |
| the studio's format default                                                    | `app/stores/generate.ts`                                 |

The funnel events are now in the catalog (`model/analytics.ts`, the `onboarding_*` block); see the
Events section below for what they answer and what the wall changed about them.

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

### 1. The question is answered by picking a piece

We still need to know what the user is making first, because `format` is the axis the entire engine is
organised around: it picks the format profile the artifact renders under, it filters the template set,
and it becomes the default in the generation studio. What changed is how we ask.

Originally this was a three-card question, asked in the abstract, with one starter previewed behind
each card. It works, but it makes the user declare an intent before they have seen anything, and the
starter it opens is one we chose. So the screen is now a **wall of live starters** and the answer is
inferred from the one they pick.

Every card is the same box (`PlateCard` in `app/components/previews.tsx`, shared rather than local to
this view). What differs inside it is the format: the plate is drawn at that format's own layout width
against its own backdrop, at one scale set by the widest, so a doc sits on more backdrop than a deck,
and a site has no page margin at all and runs to the card's edges the way it runs to a browser's,
which is read straight off `bleedSections` in the profile rather than a second list of formats.

`starterWall` shuffles each format and then deals them round-robin, so consecutive cards are a deck,
then a doc, then a site. The mix is the argument the screen makes, that one engine renders all three,
and any other order groups the formats into blocks that bury two of them below the fold. Shuffled
rather than sorted by use count, because the wall now scrolls to the whole catalog so nothing is
unreachable, and two people signing up on the same day should not meet the same nine tiles. It paints
twelve at a time as the wall is scrolled, since each tile lays out a real section stack.

Clicking one opens the existing `TemplatePreview`, whose format switcher means a doc previewed as a
deck opens as a deck: the switcher is the point of previewing, so what the preview settled on is the
answer we record.

We ask nothing else. Industry and attribution are worth knowing, but they are worth less than the
seconds they cost here. If we want attribution later it belongs on the marketing site, before the
signup, not in the product's first screen.

### 2. The first artifact is a template, opened in the editor

The user lands in a real artifact in the format they picked, built from a template, open in the editor.
This costs no credits, takes one request rather than a model round trip, and makes the user's first
action editing something good rather than composing a prompt in front of a blank box.

Which template is now the user's own choice rather than the most-used one for a declared format, which
is the point of the wall: an artifact somebody picked is one they are attached to.

The library remains one click away throughout, so this is a starting point rather than a wizard the
user has to escape.

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
every workspace they create, since a user can own several. And it is released when the address is **confirmed** rather than at row creation, which puts the
cheapest abuse behind a real mailbox. Confirming is now a gate in its own right (see below), so the
grant lands at the same moment the account gets in.

Mechanically this is a new ledger reason alongside `monthly-grant`, `renewal-grant`, and
`upgrade-grant`. It must be idempotent, because a code can be requested more than once, so the insert
is guarded on the absence of an existing `signup-grant` row for that workspace rather than on a flag
we could lose.

**The confirmation gate.** A password signup is answered with a session, so the person leaves the auth
page at once, but that session is refused by `requireUser` and `requireWorkspace` alike: the only thing
it reaches is the confirm step, which is step one of this surface. Confirming is a 6-digit code typed
in the same tab, not a link, so nobody has to leave and come back. `mustConfirmEmail` in
`@model/workspace` is the single rule both sides read, and it applies from 2026-08-22 forward, so
accounts opened before the gate keep the access they already had and get the banner instead. Signing in
unconfirmed is allowed and lands on the same step, because a code needs a session to be typed into.

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

The funnel is: signed up, chose a format, opened the starter artifact, opened the studio, completed a
generation, and each checklist step as it lands. That is enough to see which step loses people.

The wall moved one of those. `onboarding_format_chosen` used to fire when the question was answered,
which was the first thing anyone did; it now fires only when a starter is committed to, so the intent
of everyone who browsed and left is no longer recorded. `onboarding_starters_filtered` covers that gap:
it carries the format chip and how many starters that chip left on the wall. `template_previewed`
fires from the wall as it does from the Templates page, so how many pieces someone opens before
picking one is a query rather than a new event.

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
