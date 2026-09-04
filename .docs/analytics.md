# Galleo — Product analytics

> The single current-state reference for internal product instrumentation: the event catalog, the two
> wrappers, the first-party ingest proxy, the env contract, and what we deliberately do not collect.
> Companion docs: `hosting.md` (the env table and the build-time constraint), `workspaces.md` (plans,
> seats, the credit window), `onboarding.md` (the first-session funnel), `ai.md` (the tool catalog).

## Not to be confused with view analytics

Galleo has two things called analytics and they are unrelated. Customer-facing **view analytics** for
public links is a paid feature behind the `analytics` entitlement: `services/core/links.ts`
(`recordView`, `analyticsFor`), the two gated routes in `services/api/links.ts`, and the panel in
`app/views/SharedView.tsx`. This document is about **product analytics**, our own instrumentation, which
no customer sees. Nothing here changes the `link_views` table or the view counters.

## Where it lives

| File                          | What it is                                                           |
| ----------------------------- | -------------------------------------------------------------------- |
| `model/analytics.ts`          | The catalog: every event name, its property shape, traits, bucketing |
| `ui/analytics.ts`             | The browser wrapper over `posthog-js`                                |
| `services/utils/analytics.ts` | The server wrapper over `posthog-node`                               |
| `services/api/ingest.ts`      | The first-party `/api/i/*` proxy to the ingest host                  |

`model/analytics.ts` is the single source of truth. `Events` is an interface keyed by event name, and
`EventName` is `keyof Events`, so an event exists exactly once and adding one is a one-line diff. Both
wrappers type their `capture` against it, which means a call site cannot pass a name that does not exist
or props that do not match.

**The browser wrapper is in `@ui`, not in `app/`.** Both the editor and the app emit, and `editor` may
not import `app`, so `@ui` is the lowest layer both can reach. It is the same reasoning that puts shared
components there.

**The server wrapper is in `utils/`, not in `core/`.** The two highest-value events are raised in
`services/utils/http.ts`, and the layering law forbids `utils` from importing `core`. The wrapper touches
no database, so it satisfies the rule that keeps `utils` unit-testable, and every layer above can reach it.

## Which side emits what

The rule is that the server emits what only it can know, and the client emits what only it can know.
Where both could, the server wins, because a client can close its tab and a webhook has no client at all.

**Server** (`services/utils/analytics.ts`): account lifecycle (`services/core/accounts.ts`,
`services/api/session.ts`, `services/api/oauth.ts`), every AI action and the credit wall
(`services/core/spend.ts`), all of billing (`services/core/billing.ts`), membership and teams
(`services/core/workspaces.ts`, `services/api/workspace.ts`), library mutations
(`services/api/artifacts.ts`, `services/api/folders.ts`), links and comments
(`services/api/links.ts`, `services/core/comments.ts`), the delegated surface and the connections
behind it (`services/core/delegated.ts`, `services/core/authorization.ts`,
`services/api/authorize.ts`), and the rate wall (`services/utils/http.ts`).

**Client** (`ui/analytics.ts`): identity and grouping (`app/stores/auth.ts`, `workspace.ts`,
`billing.ts`), the generation studio funnel (`app/stores/generate.ts`), onboarding
(`app/stores/onboarding.ts`), editing depth (`editor/core/store.ts` and the panels), export and
presenting (`editor/panels/ExportModal.tsx`, `editor/core/store.ts`), search
(`app/stores/search.ts`), and the reliability events (`app/stores/errors.ts`, `save.ts`, `app/api.ts`,
`editor/Canvas.tsx`).

## The seams that make coverage automatic

Five places were chosen so that new code is measured without anyone remembering to instrument it.

`reserve()` in `services/core/spend.ts` wraps every metered run, free ones included, so the three
`ai_action_*` events and `credits_exhausted` cover a tool added later the moment it runs. The charge is
read off the settle rather than recomputed, so analytics and the ledger cannot disagree.

`reserve` also carries the surface the call arrived on, which is what `tool_surface` on
`ai_action_started` reports. It used to be read off the catalog, taking the first surface a tool
declares, and since every tool the MCP server exposes declares `agent` first, a generation run from a
desktop client was indistinguishable from one in the app's own chat rail. The executor
(`services/core/ai/execute.ts`) now passes the surface of the call it is running, and the handful of
routes that reserve for a provider call the catalog prices but no tool body runs (narration, voice
audition and design, image and video generation, and the turn reservation in `/ai/turn`) say
`direct`, which is what they are. The other four trailing arguments moved into the same options
object, since seven positional parameters had stopped being readable at the call sites.

`callDelegated` in `services/core/delegated.ts` is the one place a call from outside the product
funnels through, so `delegated_tool_called` covers both MCP and the REST API, and covers the refusals
as well as the calls that ran.

`provisionUser` in `services/core/accounts.ts` is the only place a new account is created, so no signup
path can miss `signed_up`.

`stopEditing` in `editor/core/store.ts` is where a typing session becomes one undo entry, so
`text_edited` is debounced per element by construction rather than by a timer.

`endEditorSession` beside it is the one place `editor_session_ended` is reported, and it is
idempotent: the editor route calls it on `pagehide` and again when the route unmounts, and loading
another artifact calls it before resetting the counters, so a deck switch closes the session on the
deck being left. It rides a page-hide handler, so a killed tab reports nothing and the event
under-reports by construction: it is a view of sessions that happened, never a denominator.

`reportError` in `app/stores/errors.ts` is the one place a failure reaches the user, so `error_shown` is
a single call site rather than a hundred.

`sendChat` and the four `apply*` functions in `app/stores/chat.ts` cover the assistant, and
`pickMedia` in `app/stores/media.ts` covers every path the picker resolves through, so a new proposal
kind or a new media source reports without a new call site.

Everything else that reports is a named function rather than an inline capture: `noteElementAdded`,
`noteElementRemoved`, `noteElementMoved`, `noteElementResized`, `noteSectionAdded`, `noteAiAction`,
`noteSaveState`, `reportPaywall`. A surface that gets rebuilt or moved calls the same function from its
new home, and a surface that does not exist yet has one waiting for it.

Two of those carry a guard worth knowing about. `reportPaywall` refuses to report until `/features` has
landed, because `can()` reads false for every feature before it does, and the share modal loads its own
features on mount: without the guard every workspace on every plan reported a `publicLinks` wall the
first time it opened the share panel. `identifyUser` and `setWorkspace` skip a call that would repeat the
last one, because `loadWorkspace` runs after eight different mutations and both calls are billable
events.

## Identity, in one idea

There is no correlation id, no header, and no handshake between the two sides. The link is that both
use the same value as PostHog's `distinct_id`: the `users.id` UUID from Postgres. A client event and the
server event it triggered land on the same person because both carry the same identifier, and that is
the whole mechanism.

The browser has one extra step the server does not need. Before sign-in, `posthog-js` holds a random
anonymous id in local storage, and with identified-only profiles those events cost us nothing and belong
to nobody. `identify(userId)` hands PostHog the previous anonymous id alongside the real one, so that
device's earlier activity stitches onto the person rather than being stranded. The server never has an
anonymous id: by the time a route can emit, it has already resolved a session, so it sets the real id
directly.

`identify` therefore runs on every path that produces a user, a session restore included. That is
deliberate. If it only ran on the login form, a returning visitor with a live cookie would look like a
new anonymous person on every load.

## Identity and grouping

People are keyed by user id, never by email. `identify` runs on every path that produces a user, which
includes a session restore, so a returning visitor is not a new anonymous person on every load.
`reset` runs on logout, or the next person on a shared machine inherits the previous identity.

Workspaces are the group, because the workspace is the billing entity and the credit pool, so almost
every business question is really about it. Group traits are refreshed by the client on every workspace
load, and by the Stripe webhook on a plan change, which is the one case with no client in the request.

**Group analytics is a paid PostHog add-on and we are on the free tier**, so `$groups` is sent but cannot
be aggregated yet. Every event therefore also carries a flat `workspace_id`, stamped in the server wrapper
and registered as a client super property, which is what actually answers the per-tenant questions today.
The `group()` and `groupIdentify()` calls stay in place, so they start working the day the add-on is
bought, with no code change.

Super properties ride every **client** event: `plan_id`, `workspace_role`, `credits_remaining`,
`device_tier`, `app_build`. They are sticky browser state, registered once and persisted, which is a
thing a shared Node process cannot have, so server events do not carry them. Server events carry
`app_build` (stamped in the wrapper from `RENDER_GIT_COMMIT`) and rely on the workspace group for the
rest: the group's own properties are queryable on any event carrying `$groups.workspace`, which is more
reliable than a per-event copy that can go stale. Group membership on the client is sticky in the same
way; on the server it is passed per call, for the same reason. `plan_interval` is absent because the workspace row does not store it; only the Stripe seam
has it, and `plan_changed` and `checkout_completed` carry it explicitly.

## Three surfaces, three policies

`policyFor(surface)` in `ui/analytics.ts` returns one of three, and each entry point names its own:
`app/main.tsx` is `"app"`, `website/main.tsx` is `"marketing"`, `publish/main.tsx` is `"publish"`.

They differ on one question: is a page view the event, or noise? In the app it is noise, because the
interesting acts are explicit and the editor repaints constantly. On the marketing site it _is_ the
event, because it carries the referrer and the campaign parameters, and that is the whole of
paid-traffic attribution. The publish viewer counts reach and nothing else.

|                            | app                              | marketing     | publish    |
| -------------------------- | -------------------------------- | ------------- | ---------- |
| page views                 | no                               | yes           | yes        |
| campaign params + referrer | SDK default                      | SDK default   | **off**    |
| session replay             | on, masked, paused in the editor | on, masked    | **off**    |
| persistence                | local storage                    | local storage | **memory** |

The publish column is a deliberate position rather than an oversight. Those readers are our customer's
audience rather than ours, looking at content its author considers confidential, so they get no campaign
parameters, no referrer, no recording, and no id that outlives the page.

## How paid traffic reaches a paying account

Nothing here is bespoke; it is the SDK's own machinery, which we were simply not running on the page
where it matters.

An ad click lands on `/` with `fbclid` and whatever `utm_*` the campaign set. `save_campaign_params` and
`save_referrer` default to true and we do not override them, and the SDK's shipped parameter list already
covers `fbclid` and `igshid` for Meta, plus `gclid`, `ttclid`, `msclkid`, `twclid`, `li_fat_id`,
`rdt_cid` and others. No custom configuration is needed for Meta.

The visitor is anonymous, and with identified-only profiles that costs us nothing. posthog-js persists
the initial referrer and campaign parameters, and applies them as `$set_once` when `$identify` later
creates the person; the SDK does this deliberately, "so we can create the profile with mostly-accurate
properties, despite earlier events not setting them". So the campaign survives the gap between landing
and signing up, even days later.

Marketing and app are one origin (Hono serves both), so local storage is shared and the anonymous
distinct id survives the landing → `/signup` → signup navigation without any cross-domain plumbing. At
signup, `identify` in `adopt()` stitches the anonymous id to `users.id`, which is the same id the server
already uses, so `checkout_completed` from the Stripe webhook lands on the same person. Ad, landing,
CTA click, signup and purchase are one timeline.

`signup_cta_clicked` carries a `placement` (`nav`, `hero`, `midpage`, `footer`) so the landing page's own
conversion step is separable from the campaign that produced the visit.

**PostHog will not optimise your Meta ads.** Capturing `fbclid` tells _you_ which campaign produced
signups. It sends nothing back to Meta, so their delivery algorithm learns nothing. For that you need the
Meta pixel, or better their Conversions API fired server-side on `signed_up` and `checkout_completed`,
which is a separate integration and not part of this.

## Capture policy

Autocapture and automatic pageview capture are off. The editor canvas is painted imperatively by the
engine, so autocapture would produce a flood of anonymous div clicks that mean nothing. Session replay is
on, but masked: `maskTextSelector: "*"` and `maskAllInputs`, so no text ever enters a recording. That
matters because the editor paints the customer's own copy into real DOM spans
(`canvas/render/backends.ts`), and an unmasked recording would be a video of a confidential deck. Masked,
replay still shows layout, cursor, scroll and rage clicks, which is the part worth having, on the
surfaces where we have drop-off events but no idea why.

Recording stops entirely on the editor route (`pauseReplay` on mount, `resumeReplay` on cleanup). The
engine repaints the whole section stack on every layout change, so the editor produces a mutation stream
that is heavy to record and noisy to watch. Masking is the content control; the pause is the volume one.
Note that replay only runs at all if it is enabled at the project level, since it starts from remote
config. All three surfaces initialise analytics, including the marketing site and the publish viewer,
but they do not do the same thing: replay is on for the app and marketing and off for publish, so a
stranger reading a shared artifact is counted but never recorded. That reader is our customer's
audience rather than ours, so the publish surface also drops the referrer and the campaign parameters
and persists in memory only, which means nobody is given an id that outlives the page. Exception
autocapture is off, because an exception message can carry the content that produced it. Person
profiles are identified-only, which is a cost lever: we never query anonymous ones.

The policy is a `BASE` const plus a `policyFor(surface)` in `ui/analytics.ts` rather than options
written inline at each entry point, so a test can assert what each surface resolves to. `defaults` is pinned to a dated snapshot so a new SDK default cannot switch capture on for us
between upgrades.

## The proxy

Browser events go to `/api/i/*` on our own origin, which forwards to the ingest host. Galleo is
single-origin, so these look like any other request to the app, which is what keeps them alive through the
ad blockers a meaningful share of this audience runs. The path is deliberately not named analytics,
tracking, or posthog. The session cookie is stripped on the way out. The caller's address is forwarded as
`X-Forwarded-For` so the host's geo is real; without it every event would carry the server's location,
which is worse than no location. Server-side events carry `$geoip_disable` by default, so they have no
location at all.

## Env

`POSTHOG_KEY` and `POSTHOG_HOST` on the server, `VITE_POSTHOG_KEY` and `VITE_POSTHOG_HOST` in the browser.
With no key both wrappers do nothing, silently, with no network calls: dev, CI and the test suite never
emit, and that is proven by a test rather than assumed.

**`VITE_POSTHOG_KEY` is read at build time.** Vite inlines `import.meta.env.VITE_*` as a literal, so an
unconfigured build compiles the SDK out entirely and ships zero analytics bytes, and a configured one
loads it as a separate lazy chunk after init. Setting the key only in the runtime environment produces a
bundle with analytics compiled out and no events, with nothing in the logs to say so. See the env table in
`hosting.md`.

## People with no account, and the one thing we cannot join

Two events come from someone who has no user id. A public-link view is attributed to the view session's
own hash, the same `sha(day|ip|ua|link)` the `link_views` row keys on, so repeat reads by one stranger
collapse correctly while two strangers stay distinct. A rate-limit refusal is attributed to a hash of the
limiter's bucket key. Both set `$process_person_profile: false`, so neither mints a profile, and neither
carries the address itself: a raw IP is on the do-not-collect list.

## Following one request from the browser to the server

Every client call mints a `request_id` and sends it as `x-galleo-request`. A top-level middleware in
`services/server.ts` reads it, sanitises it (an inbound header is untrusted input and it ends up in a
property), echoes it on the response so a failure a user reports can be found in the data, and opens an
`AsyncLocalStorage` scope for the rest of the request.

The scope is what makes it free. `capture()` reads the id from the store, so a core function twelve
frames down reports the request it is serving without anything having to thread it there, and two
overlapping requests cannot borrow each other's id. It is the same pattern `core/ai/meter.ts` already
uses for token spans. Both properties are covered by tests, including the concurrent case.

On the browser side the id is attached to events only while an AI turn is open, set by `streamTurn` and
cleared in its `finally`. Turns run one at a time in the studio, so that association is exact rather than
a guess, and an unrelated event carries no id instead of a wrong one. Ordinary API calls still send the
header, because grouping what the server did for one call is useful on its own even when no client event
pairs with it.

## What we deliberately do not collect

No property carries prompt or brief text, section copy, rich-text runs, artifact titles, folder names,
user-typed theme names, uploaded file names, extracted file contents, search queries, comment bodies,
email addresses, display names, avatar URLs, full referrer URLs, or Stripe identifiers beyond a boolean
that a customer exists. A reviewer should treat their appearance as a bug.

Where magnitude matters, a bucket travels instead of the value: `chars_bucket` rather than a size,
`query_length_bucket` rather than a query, `referrer_host` rather than a URL. Where the temptation is
strongest, wanting prompt text to understand generation quality, the answer already exists: the eval
system stores traced runs with their prompts in our own database, under the workspace that owns them.

## Testing

`model/__tests__/analytics.test.ts` covers the bucketing. `services/utils/__tests__/analytics.test.ts`
proves the no-op-when-unset guarantee and asserts the real wire payload, gzip included, through a fake
transport. `services/core/__tests__/spend-analytics.test.ts` covers the metered-run seam, including the
failure classification and the rule that `tool_surface` is the surface the call arrived on rather
than the first one the catalog declares.
`services/core/__tests__/delegated-analytics.test.ts` covers the delegated seam on the paths that
refuse before a workspace is resolved, which is what lets it run without a database: the scope a
refusal needed, the anonymous attribution of a call that arrived with no token, and a tool name the
catalog does not hold. `services/core/__tests__/analytics.itest.ts` covers what only a real database
shows: that the wall fires when a balance is genuinely short, that a member over their own cap is
offered neither remedy, that `credits_charged` equals the ledger row rather than the estimate, and that
a signed top-up webhook both reports and grants. Each was checked by breaking the code it guards and
confirming the right test failed. `services/api/__tests__/ingest.test.ts` pins the proxy's path rewriting and the
fact that it strips the session cookie. `ui/__tests__/analytics.test.ts` asserts the capture policy and
that an unconfigured client makes no network call. We do not test PostHog itself.

**The generation funnel is split by who knows what.** The studio emits what only the browser sees:
the intake opening, context attached, a shape picked, a build started, a pause, an abandonment, a
failure it showed, a section it flagged. The server emits the rest from inside the tool bodies
(`report` in `services/core/ai/tools.ts`, attributed to the call's principal): `generation_planned`
at the end of `plan-outline`, `generation_section_built` and `generation_section_failed` as
`write-beat` and `write-beats` land or give up, `generation_steered` and `generation_outline_edited`
from their tools, and `generation_completed` at `finish-generation` with the run's settled credits
summed from its traces. A run driven from the chat dock, MCP or the API is therefore counted the
same as one driven from the board.

## Planned / deferred

- **The catalog was pruned once already.** Twelve events were removed after the first audit: nine
  that carried no properties at all and answered no question on any dashboard (`artifact_renamed`,
  the three `folder_*`, `section_duplicated`, `custom_theme_deleted`, `workspace_renamed`,
  `ownership_transferred`, `password_changed`), one redundant with a richer event
  (`generation_resumed`, redundant with `generation_paused`), and the two below.
  Removing an event breaks any tile that references it, so check `scripts/posthog-dashboards.ts`
  before cutting another.
- **Two events are not built.** `onboarding_starter_edited` needs the editor to know that the artifact it
  holds is the onboarding starter, which nothing tracks; the server-derived "make" checklist step marks
  the same transition and already fires as `onboarding_checklist_step_done`.
  `onboarding_abandoned` has no definition (abandoned after how long?) and is better derived in PostHog
  from the absence of later funnel steps than minted by a guessed timeout.
- **Some properties are absent by necessity**, each with a comment at its declaration saying why:
  `plan_interval` (not on the workspace row), `archetype` on `generation_section_built` (classifying a
  section needs a real text measurer and a full layout pass), `age_days` on `artifact_opened` (not on the
  windowed read's wire shape), `how` and `based_on_theme_id` on `custom_theme_created` (the route
  receives tokens only), and `ms_since_signup` across onboarding (the browser never learns the signup
  timestamp; `identify` carries `signup_at`, so it is a query-time join).
- **`RENDER_SLOW_MS` is 120 and provisional.** It was chosen from the layout solver's own cost over the
  135-section eval corpus (p95 0.20ms, worst case 0.98ms per section), which says only that anything two
  orders of magnitude above that is dominated by font metrics or paint. Revisit it against real browser
  timings, which `eval:shots` does not record today.
- **The subscription webhooks are still uncovered.** `services/core/__tests__/analytics.itest.ts`
  covers the credit wall, the member-cap wall, the settle-versus-ledger invariant, and the top-up
  webhook, which is the one that settles entirely from its own payload. The plan-change and
  cancellation paths re-read the subscription from Stripe before they act, so testing them means
  faking that call; worth doing when someone next touches `handleEvent`.
- **Four enum values have no surface yet.** `section_added.how` never reports `"template"`, because the
  editor has no template-insert to report from, and `element_added.how` never reports `"ai"`, because
  element-level AI replaces rather than adds. Both go through `noteSectionAdded` / `noteElementAdded`,
  so the surface calls one function when it exists rather than being instrumented from scratch.
- **A refused token exchange is not reported.** A replayed code, a rotated refresh token presented
  twice, or a bad machine secret all fail with no person to attribute the failure to, and a client id
  on its own answers a reliability question rather than a product one.
- **The consent screen being shown is not reported.** Someone who opens it and closes the tab is
  invisible, so the gap between `connector_registered` and `connector_authorized` is the closest
  thing we have to a consent drop-off, and it is only close: the two are different distinct ids,
  since nobody has signed in when a client registers.
- **`tool_surface` on the two later AI events.** `ai_action_completed` and `ai_action_failed` carry
  no surface, so cost and failure by surface need a join through `tool_id` and the request id rather
  than a breakdown. Worth adding if the delegated surface grows enough traffic to make the question
  routine.
- **No experiment events.** Feature-flag exposure is worth adding when we run the first onboarding
  experiment, and not before. The flag client ships in the same package and is already initialised.
- **Cost per outcome converts at query time.** `CREDIT_USD` in `model/credits.ts` moves when models or
  their prices move, so a dashboard that hardcodes it will quietly drift. We send credits and convert in
  the dashboard.

## Speaker notes and narration

Eight events, all in `model/analytics.ts` like every other. None carries a word of a script or of a
voice description: both are the customer's own writing, so length is reported as a `CharsBucket`
rather than a count, exactly as the generation events already do.

- `notes_written` — where from, how many sections, whether it was a rewrite
- `narration_prepared` — sections, how many were already cached, bucketed characters, credits, ms
- `narration_played` — one row per listen rather than a stream: where, sections heard, whether it ran
  to the end. Fired on the way out, from `@ui/narration`.
- `voice_saved`, `voice_auditioned`, `voice_designed`
- `soundtrack_chosen` — preset or custom, whether the deployment already had that bed, credits, ms.
  A house preset's id travels because it is ours; a custom bed's prompt is derived from the
  customer's content, so it never does.
- `soundtrack_played` — one row per listen, same shape as `narration_played`: where, which kind of
  bed, whether it spent the session ducked under a voice, ms.

`voice_auditioned` carries `kind: "preview" | "own_text"` and is the one worth watching early: a free
provider preview and a metered synthesis of the customer's own line are different acts, and which one
people reach for says whether the free browse path is carrying the feature.

The two AI tools (`write-speaker-notes`, `narrate-artifact`) need no events of their own: the three
`ai_action_*` events key on `tool_id`, so a tool is instrumented the moment its id exists.

## The delegated surface

Galleo is also reached from outside the product, over MCP and the public REST API (see `mcp.md`), and
that whole surface shipped with no instrumentation: a person authorizing a connector, a tool call
arriving, a scope refusal, a token refresh and a client registering all happened with nothing
recorded. Five events cover it, all raised server side, since several of these requests have no
client in them at all and none of them has a browser we control.

`delegated_tool_called` is raised in `callDelegated`, which is the single place both surfaces funnel
through, so a tool joining the `mcp` surface is measured the moment it can be reached rather than
when somebody remembers it. It carries the tool id, the surface (`mcp` or `api`), the scope and
effect the catalog states for that tool, whether a token was presented, whether the caller named a
workspace or fell through to the one the grant defaults to, how long the call took, and how it ended:
`ok`, `no-tool`, `needs-auth`, `not-found`, `refused` or `scope`. What a call cost is deliberately
absent, because a priced tool already reports the three `ai_action_*` events through `reserve`
wherever it was reached from, and what was missing here is that a call happened at all. The outcome
is read off the same union `callDelegated` returns, so a refusal kind added there is a type error
here rather than a silent hole. Scope and effect are absent for a name the catalog does not hold,
which is the whole of the `no-tool` outcome.

A call that arrives with no token has no person to attribute to, so it is reported against one shared
id with `$process_person_profile` off, which is the position public-link views already take.

The other four follow the connection rather than the call. `connector_registered` is a client
performing dynamic registration, which happens before anyone has signed in, so it is attributed to
the client id we minted for it and mints no profile either. `connector_authorized` is the consent
screen being agreed to, and carries the granted scopes alongside how many of the account's workspaces
were included; the scope set is what makes a step-up legible, since the same client consenting again
with a wider set is a step-up completing and there is no other record of one.
`connector_token_issued` is raised in `mint` rather than at the token endpoint, so a code exchange, a
refresh rotation and the machine `client_credentials` grant (which never sees a consent screen) are
counted the same way and a fourth grant type would be counted without a new call site.
`connector_disconnected` is raised in the two functions that revoke, `revokeApp` for the account
settings and `revokeToken` for a client handing its credential back, so `from` distinguishes them
without either route reporting for itself.

No client name travels on any of them. A dynamically registered client writes its own `client_name`,
which makes it free text somebody outside the product supplied, so what identifies a connection is
the opaque `client_id` we issued.

Two further events cover the workspace's own machine credentials, which are the same surface reached
with a secret instead of a person: `api_credential_created` when an admin issues one from workspace
settings, and `api_credential_revoked` when one is turned off. Both are raised in
`createMachineClient` and `revokeMachineClient` rather than at the routes above them, so a second
caller would be measured without a second capture. Creation carries how many credentials the
workspace holds afterwards, which separates a workspace with one integration from one running
several. Revocation carries how many days the credential was active and whether anything ever
authenticated with it, because a credential that was issued and never called says something different
about the feature than one that ran for a month; it is reported once, since the revoke only matches a
credential that is still live. The name an admin typed is the customer's own words and never travels,
so these carry the same opaque `client_id` as the four events above, which is what joins a credential
to the tokens it went on to issue.
