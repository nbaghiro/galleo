# Build: Product analytics eventing (PostHog)

> **Not to be confused with `04-analytics.md`.** That prompt builds _view analytics_ for public links, a
> customer-facing feature behind the `analytics` entitlement flag. This prompt builds _product_ analytics:
> internal instrumentation so we can see how Galleo is used. Do not touch the `analytics` feature flag, the
> `links`/`visits` tables, or `getLinkAnalytics`. They are a different system that happens to share a word.

> **The sibling prompt files in this directory have stale headers.** They state the layering law without
> `ui`, cite `services/schema.ts` and `pnpm db:push`, and reference a `pnpm api` script. Ignore those
> headers. The context below is current as of this file's commit. `AGENTS.md` is the authority.

## Shared context

You are working in **Galleo**, a TypeScript AI content tool where one engine renders the same block tree
as a **deck, document, or website**. Read `AGENTS.md` first, then `.docs/architecture.md`. Read
`.docs/onboarding.md` too: it specifies a first-session flow that is being designed in parallel and it
names seven events it needs. Your catalog must cover them, but **do not build the onboarding flow itself**;
another session owns it.

**Layering law (ESLint-enforced, and `pnpm check:boundaries` proves the rules still report):**
`model ← canvas ← ui ← editor ← app`. `services` imports only `model`. Within services,
`api → core → db → utils`, and **`core/` may not import hono**. Path aliases: `@model @themes @canvas
@engine @elements @ui @editor @app @services`. **No `index.ts` barrels**, named files only.
Same-directory imports stay relative; cross-directory uses an alias.

**Style:** 4-space indent, double quotes, semicolons, `printWidth` 100. **No `any`. No `console`**
anywhere in app code; backend output goes through `out`/`warn` in `services/utils/env.ts`. Comments are
terse and only earn their place by saying something the code cannot: no file-header essays, no section
banners, no restating the type.

**No suppressions.** The repo carries zero `eslint-disable`, `@ts-ignore`, `@ts-expect-error`,
`prettier-ignore`, or coverage pragmas. `noInlineConfig` makes `eslint-disable` _inert_ and then fails the
run for it. There is always a suppression-free form.

**Verify before you are done.** All of these must pass:

```
pnpm typecheck   pnpm lint   pnpm test   pnpm format:check
pnpm check:suppressions   pnpm check:program   pnpm check:boundaries
pnpm check:modules   pnpm check:validation   pnpm check:copy
```

`pnpm dev` serves the SPA at :8600. Postgres runs in docker (`docker compose up -d`); the schema is
`services/db/schema.ts` with real migrations (`pnpm db:generate`, `pnpm db:migrate`). Seed with `pnpm seed`.

**Tests:** vitest discovers `**/*.test.ts` only, never `.tsx`, so there are no Solid component tests. Read
`.docs/testing.md` section 2, the mocking contract, before adding a double.

## Why PostHog

Use **PostHog Cloud**. The reasoning, so you can push back if you find it wrong:

- 1M events a month on the free tier, which is far more headroom than Galleo will need soon, and the
  paid curve past that is per-event rather than per-seat.
- Product analytics, session replay, surveys, and **feature flags** in one tool. The flags matter here
  specifically: `.docs/onboarding.md` proposes changes we will want to run as experiments, and buying an
  analytics tool that cannot gate a variant means buying a second tool later.
- Self-hostable if we ever need to, though we are not doing that now: it wants ClickHouse, Kafka, Redis,
  and Postgres, which is not a reasonable operational load for this team.

Rejected, with the objection: **OpenPanel** is cheaper and much simpler to run but narrower, and has no
flags. **Amplitude** has better cohort and behavioural analysis than we need at this stage and no free
tier at this volume. **Plausible** counts pageviews, and Galleo's interesting events are not pageviews.

Pick the **EU** ingest host unless told otherwise, and record the choice in `.docs/hosting.md`'s env
contract.

## Hard rules

**1. Never send content.** No prompt text, no section copy, no artifact titles, no theme names entered by
a user, no file names, no email addresses, no display names. Event properties are **ids, enums, counts,
durations, and booleans only**. This is the rule most likely to be broken while instrumenting the
generation pipeline, because the prompt is right there in scope and it feels useful. It is customer
content and it does not leave the system. If you find yourself wanting the prompt text to debug quality,
that is what the eval system in `.docs/testing.md` and `/eval` already do.

**2. No-op when unconfigured.** With no `POSTHOG_KEY` set, both wrappers must do nothing, silently, with
no network calls and no warnings on every event. Dev, CI, and the test suite must never emit. Guard this
with a test.

**3. Explicit events only.** Turn autocapture and automatic pageview capture **off**. Galleo's editor is a
canvas whose DOM is painted imperatively by the engine, so autocapture would produce a flood of anonymous
div clicks that mean nothing, and session replay of a paint-driven canvas would be enormous. Check the
current option names against PostHog's config docs rather than trusting any snippet, including one in this
file; they have changed before.

**4. One catalog, no string literals at call sites.** A `capture("artifactCreated")` typed as a bare string
is how an event gets renamed in one of nine places. The name and its property shape are declared once and
every call site is typed against it.

## Architecture

### The catalog: `model/analytics.ts`

The event contract is shared by `app/` and `services/`, and the only layer both may import is `model`, so
it goes there. Pure, no IO, edge-safe. Define the event names and each one's property shape so that
`capture` cannot be called with a name that does not exist or props that do not match.

**Adding a file to `model/` trips a guard.** `pnpm check:modules` asserts that every `model/*.ts` is named
in the `model/` map paragraph in `AGENTS.md` and that the spelled-out file count matches the directory. You
must add `analytics` to that paragraph and change **"Fifteen files"** to **"Sixteen files"**, or the build
fails. The map paragraph also says to resist adding a sixteenth file for types belonging to an existing
concept; this is a genuinely new concept and not a violation of that, but say so in the map entry.

### Client: `app/stores/analytics.ts`

A thin wrapper over `posthog-js`. Responsibilities:

- Init with autocapture and pageview capture off, reading the key from Vite env.
- `identify()` on login and on session restore, keyed by user id. Never by email.
- `group()` on the active workspace id, so usage can be read per tenant. Galleo's workspace is the
  billing entity and the credit pool (see `.docs/workspaces.md`), so workspace-level grouping is what
  makes plan-versus-behaviour questions answerable. Re-group on `switchWorkspace`.
- `reset()` on logout, or the next user on a shared machine inherits the previous identity.
- A typed `capture` that accepts only catalog events.

Do **not** auto-instrument `app/api.ts`. It is a single chokepoint for all 220-odd client calls and
wrapping it would be easy, which is exactly the trap: it produces request telemetry, not product
telemetry, and buries the twenty events we care about under hundreds we do not. Instrument call sites.

### Server: `services/core/analytics.ts`

A wrapper over `posthog-node`. It must **not** import hono, so it takes the ids it needs as arguments
rather than reading a `Context`. Route handlers in `services/api/` pass them in.

Server-side is authoritative for anything a client could misreport or miss entirely:

- credit spend and `credits_exhausted`, which the client only learns about as a 402;
- generation completion and failure, since a user can close the tab mid-stream and the SSE turn still
  finishes or dies server-side;
- plan changes, which arrive by Stripe webhook and have no client in the request at all;
- email verification, same reason.

Set `flushAt`/`flushInterval` for a long-lived Node process, not the serverless defaults, and flush on
shutdown so a deploy does not drop the queue.

### The proxy: `/ingest/*` in `services/server.ts`

Galleo is single-origin: the routers mount under `/api` and static assets are served from the same host
(`services/server.ts`). Add an `/ingest/*` route that forwards to the PostHog ingest host and point the
client's `api_host` at it. Events then look like first-party calls, which is what keeps them alive through
the ad blockers that a meaningful share of this audience runs. Do not name the path `analytics`,
`tracking`, or `posthog`; blockers match on those.

### Env

`POSTHOG_KEY` and `POSTHOG_HOST` on the server through `services/utils/env.ts`, and the public key for the
browser through Vite's env. Absent key means disabled, per rule 2. Add both to `.docs/hosting.md`'s env
contract table, and to `.env.example` if one exists.

## The event taxonomy

**`.docs/analytics-events.md` is the specification. Implement it exactly.** It lists every event, every
property with its type, the super-properties that ride on all of them, and the identify and group traits.
It also states the eight product questions each event exists to answer, so if you find an event whose
purpose you cannot place, say so rather than building it on faith.

Three things in it will shape your implementation and are easy to get wrong:

**AI actions are three events, not forty.** `model/tools.ts` already types all 40 actions with a `ToolId`,
a tier, its surfaces, and its pricing. The spec carries `tool_id` as a property on
`ai_action_started` / `ai_action_completed` / `ai_action_failed` rather than minting a name per tool, so
cost per tool, latency per model, and failure rate are one query each, and a tool added later is
instrumented as soon as its id exists. Hook `services/core/ai/meter.ts`, and take `credits_charged` from
the settle in `services/core/spend.ts` rather than recomputing it, or analytics and the ledger will
disagree and the ledger is the one customers see.

**Reuse the existing enums, do not restate their members.** `Surface`, `PlanId`, `Interval`, `AiTask`,
`ToolId`, `ToolSurface`, `WorkspaceRole`, `ArtifactAccess`, and the element `category` all already exist.
Typing properties against them means a new format or tool is a compile error at the call site instead of a
silent hole in the data.

**The failure and abandonment events matter as much as the success ones.** `generation_abandoned`,
`paywall_hit`, and `credits_exhausted` are the highest-value events in the spec, because a funnel that
records only successes cannot show where we lose people, and the two walls are the only places the product
tells a user no. Do not treat them as lower priority than the happy path.

## Deliberate non-goals

Do not build: session replay (a paint-driven canvas makes it both huge and low-signal), autocapture,
experiments or A/B tests in this pass (wire the flag client only if it is free to do so), self-hosting,
or a dashboard inside Galleo. Reading the data happens in PostHog.

## Testing

The catalog in `model/` is pure and should be tested properly: names unique, no name colliding after
whatever wire transformation you apply, and property types doing what you think. The two wrappers should be
tested for the no-op-when-unset behaviour and for identify/group/reset ordering, using a fake transport
rather than a network double. Do not test PostHog itself. Remember `.tsx` is not discovered, so put logic
worth testing in `.ts`.

## Definition of done

1. Every gate in the Shared context section passes, including `check:modules` after the `AGENTS.md` edit.
2. `POSTHOG_KEY` unset produces zero network calls and zero output, proven by a test.
3. Every event in the taxonomy fires from a real call site, and no call site passes a string literal.
4. No event property carries user content, verified by reading every call site once more at the end.
5. `.docs/` updated: a new `.docs/analytics.md` current-state reference describing the catalog, the two
   wrappers, the proxy, and the env contract; a row added to `.docs/README.md`'s table; the env vars added
   to `.docs/hosting.md`; and `AGENTS.md`'s model map updated.
6. A short note in your final report listing which events you could **not** place, and why. A missing event
   with a stated reason is a finding; a silently dropped one is a bug we discover in three months when the
   funnel has a hole.
