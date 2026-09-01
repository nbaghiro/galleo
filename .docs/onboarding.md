# Galleo — Onboarding: the first session

> What happens between a signup and a user who has understood the product. Covers why the first
> artifact is a template rather than a generation, the format question, the confirmation gate, the
> activation checklist and how its state is derived, the `UserPrefs` schema, and the events we need
> before any of this is measurable. Companion docs: `workspaces.md` (the credit window
> and the ledger this spends against), `ai.md` (what a generation costs and what the gate charges
> for), `frontend.md` (the `@ui` primitives the surfaces are built from), `architecture.md`.

## Status

Built, pending manual QA. What ships:

| piece                                                         | where                                                    |
| ------------------------------------------------------------- | -------------------------------------------------------- |
| the `onboarding` prefs branch, read and merged field by field | `model/workspace.ts`                                     |
| the state DTO the app reads                                   | `model/workspace.ts` (`OnboardingState`)                 |
| the derived checklist                                         | `services/core/onboarding.ts`                            |
| `GET /onboarding`                                             | `services/api/onboarding.ts`                             |
| the confirmation gate, both paths                             | `services/api/session.ts`, `services/api/oauth.ts`       |
| the starter wall (and the format question it replaced)        | `app/views/OnboardingView.tsx`, routed at `/welcome`     |
| the checklist                                                 | `app/components/OnboardingChecklist.tsx`, in the sidebar |
| the client store                                              | `app/stores/onboarding.ts`                               |
| the studio's format default                                   | `app/stores/generate.ts`                                 |

The funnel events are now in the catalog (`model/analytics.ts`, the `onboarding_*` block); see the
Events section below for what they answer and what the wall changed about them.

## The constraint everything follows from

A new workspace opens with 300 credits and one whole-artifact generation costs about 95, so a new user
has **three generations a month**. That single number decides most of the design below, because it
means the obvious onboarding move, generating something impressive to demonstrate the product, spends a
third of the user's first month before they have decided whether they want it. A user who generates
twice and likes neither result is nearly out until the window rolls.

Credits are not a synthetic currency. One credit is $0.0025 of real provider spend, so an
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
artifact free to reach. Galleo's free tier is shaped like neither: it is small and it refreshes
monthly, which suits long-run retention but leaves the first session on the same budget as every other
one. We take Canva's route rather than Gamma's, because the templates make the first finished artifact
free to reach and a front-loaded pool would be real provider spend on every signup, converting or not.

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
The cropped plate itself is `PlateBox`, split out from the card because the library's canvas layout
draws its own cards from the same one; `PlateCard` is that box plus this screen's hover plate and
its two labels.

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

Spending a deck's ~95 credits out of 300 is defensible when the output is the user's own content and
they asked for it. It is not defensible when it is a demo we chose for them.

### 4. Month one is the monthly allowance, and nothing else

There is no signup grant. A new workspace opens on its plan's allowance, 300 credits on free, and that
is the whole first-session budget: exploring costs nothing because the starters are templates, and the
credits are there for the user's own first brief.

We did carry a one-time grant for a while, 400 credits released on confirmation, and removed it. A
granted credit is $0.0025 of real provider spend, so the grant was a dollar per signup paid before
anyone had shown intent, and it interacted badly with the rollover cap: the cap is two months of the
plan's grant, so a free workspace that opened at 300 + 400 was already over its 600 ceiling and its
first monthly grant clipped to zero. The account came out ahead in month one and behind in month two,
which is the opposite of what a first-session budget should do.

### 5. Confirming the address is a gate, not a favour

A password signup is answered with a session, so the person leaves the auth
page at once, but that session is refused by `requireUser` and `requireWorkspace` alike: the only thing
it reaches is the confirm step, which is step one of this surface. Confirming is a 6-digit code typed
in the same tab, not a link, so nobody has to leave and come back. `mustConfirmEmail` in
`@model/workspace` is the single rule both sides read, and it applies from 2026-08-22 forward, so
accounts opened before the gate keep the access they already had and get the banner instead. Signing in
unconfirmed is allowed and lands on the same step, because a code needs a session to be typed into.

Confirming pays nothing. It used to release the signup grant, which was the argument for gating on it
at all: it gave verification a job and put the cheapest abuse behind a real mailbox. The gate replaced
that argument rather than losing it, since an unconfirmed account now reaches nothing whether or not
there is anything to earn.

### 6. A checklist, not a coachmark tour

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
| `services/core/accounts.ts`     | mark the address confirmed, and report how long it took                   |
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

- **Three generations may not be enough to decide.** The free allowance is the entire first month and
  we have no conversion data to say whether that converts or stalls. If the funnel above says people
  leave without finishing one, the answer is a larger free allowance rather than a one-time grant,
  since the grant is spend on everyone who signs up and the allowance is spend on everyone who stays.
- **Teams are out of scope here.** An invited member joins a workspace that already has content and a
  plan, so their first session is a different problem and probably a different flow.
- **Attribution is unasked.** If we want to know where users come from, it belongs on the marketing
  site ahead of signup.
- **No re-onboarding.** A user who dismisses the checklist has no way to bring it back. Probably
  acceptable, but worth a line in account settings if it turns out people want it.
