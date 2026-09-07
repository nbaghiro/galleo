# The generation flow after the rebuild — tuning, measurement, and the seams

> Three rounds landed in two days: the generation became a server resource driven by catalog tools
> through one executor, tracing became the executor's own record, and the prompt findings from the
> Tidewell walkthrough were fixed. This record covers the tuning round that followed: the trace
> analyzer, the cache measurement and the decision it produced, the repair loop, the audio policy,
> and the platform seams (analytics, output schemas, the one content vocabulary, the writer lease).

Companion docs: `../ai.md` (the flow as it is), the executed `showcase-prompts.md` (the parallel
prompt round).

## The baseline this round tuned

- The generation is a `generations` row; every studio button, the chat dock and MCP run the same
  tools through `runTool`; the studio store is a mirror kept by `applyPatch`.
- Every call is traced at `metrics`, the eval account and failures at `full`, capped per workspace
  (`TRACE_CAP` in `services/core/traces.ts`). The `/eval` playground and its tables are gone; the
  offline harnesses judge from the command line.
- Prompts: the arc reads the whole brief, one image rule, dash-free exemplars, one section-count
  band per length, the preset list from the catalog, both system prompts ordered static-first for
  the provider's cache, plus the parallel round's objection beat, tabs line, mood band, table and
  reconciliation rules, and the fourth exemplar.
- Flow: a write against a stale outline is refused unless forced; finish takes the writer lease;
  the generation funnel's server-side events are emitted from the tool bodies.

## The trace analyzer

`pnpm traces [--since 7d|24h|date] [--tool id] [--workspace id] [--generation id] [--json]`:
`scripts/traces.ts` over `traceSummary` and `generationReport` in `services/core/traces.ts`. It
prints per tool and per model the call count, p50 and p95 latency, tokens in and out, the cached
share, settled credits and failure reasons; per generation the beats written, retries per beat
(including how many landed `unchecked`), cost and wall time. It runs against the dev database like
the other scripts.

The playground was the only reader of the traces and it is gone; what replaced it is a query, not a
page. The queries live in `services/core/traces.ts` beside the store, since they are the trace
concept's own reads; the script sits with `scripts/eval-ci.ts` and `scripts/posthog-dashboards.ts`
as a script over the services layer. The three numbers that decided this round (cached share on the
first section call, retry rate per beat, tokens per section) are one command instead of a psql
session.

## What the cache actually does — the measurement that decided the round

Measured on three runs on the demo workspace (deck/studio, 12 sections in 80 s; doc/vellum, 9 in
76 s; web/couture, 9 in 63 s; 34 section calls, 240 credits):

- Later section calls in a run: 53 percent of input served from cache.
- The first section call of each run: 0 percent — even though the runs shared the static-first
  prefix minutes apart.
- Retries: 4 of 30 beats needed a second call, none landed unchecked.

The static-first prompt ordering had landed without a measurement, because no traced generation had
run under it. The measurement shows the provider's implicit cache does not carry the prefix across
runs reliably, so the lever worth pulling if first-call cost ever matters is an explicit
cached-content handle for the static prefix — not a token trim.

## Not taken: a per-beat element catalog

`elementCatalog()` in `services/core/ai/prompts/catalog.ts` takes no kinds argument: the element
catalog (about 4,600 of the section call's ~8,800 system tokens) is sent whole on every beat. A
filtered form — the entries for the beat's planned block kinds plus the always-on basics (`text`,
`container`, `media`, `bullets`, `button`, `badge`, `quote`, `stat`) — was planned as an experiment
gated by a double `eval:ci` run, and dropped on the cache measurement above: with later calls
serving the shared prefix from cache at 53 percent, the trim costs latency-shaped work and quality
risk for little money, and it cannot fix the one real miss (the first call of a run), which is a
cross-run cache problem no trim reaches. The explicit cached-content handle is the better lever.

## The section writer's retries

A failed check goes back as a repair rather than a fresh section: `repairParts` in
`services/core/ai/prompts/generate.ts`, called from `services/core/ai/tools/plan.ts`, carries the
previous JSON object and its issues under the persona, the catalog, the rules and the output
envelope, and drops the fragments a repair does not need (the exemplars, the layout catalog) —
smaller and more likely to converge than a whole second call at 8,800 tokens.

The final attempt's "usable" rule (a parsed section that never passed its checks is kept) is
visible rather than silent: the tool span is flagged `unchecked` (`flag("unchecked")` in
`plan.ts`), and `traceSummary` counts it (`retries.unchecked`), so how often a beat lands unchecked
is a read, not a guess.

## Background audio: prepare on open only

`prepareInBackground` (`services/core/prepare.ts`) has exactly one call site, the artifact GET in
`services/api/artifacts.ts`. A piece is narrated when someone comes back to it, which is when it is
about to be presented or read; a piece edited and left alone costs nothing. The guards: it runs
only when the workspace has asked for it (the `prepareAudio` toggle, off by default), the balance
is checked before any narration starts rather than left to the hold, and a workspace that could not
pay is not asked again for a while (the refusal back-off).

The rejected triggers, with the objections:

- **Both triggers (change + open) with the guards.** Cheapest to do, still spends on pieces nobody
  presents — and the change trigger is what narrated every save.
- **Prepare only once a piece has been presented.** Narrows it further, but a first press then
  waits the five seconds the feature exists to remove.

Cost evidence: a prepare on open still narrates a whole piece at about 440 credits; six opened
pieces drained 2,720 credits from the demo workspace in seven minutes, which is why that
workspace's toggle is off.

## The `ai_action_*` events and the trace

`ai_action_completed` and `ai_action_failed` are emitted from the trace's close
(`services/core/traces.ts`) with the settled credits, the real tokens, whether the cache served any
of them, and the model that answered; `ai_action_started` stays with the hold in
`services/core/spend.ts`, where the estimate is known. One seam for the ledger, PostHog and the
store, with the better numbers.

The objection recorded when this moved: the reserve seam is pinned by `spend-analytics.test.ts` and
the analytics itest, and a caller that reserves outside a trace would go dark. The resolution is
that no caller does — every reserve happens inside `runTool` — and the analytics tests run through
the executor.

## Output schemas on both public surfaces

`TOOL_SPEC` in `model/tools.ts` declares an `output` zod schema for all 29 tools live on the `mcp`
and `api` surfaces. The results are heterogeneous (a string, an `ArtifactRef[]`, a `Section`, a
`GenerationView`), so each is a real schema rather than a flag. MCP publishes it as `outputSchema`
in `tools/list` via `z.toJSONSchema` (`services/core/mcp.ts`), the REST listing does the same in
`GET /api/v1/tools` (`services/api/v1.ts`), every answer is checked against it, and `check:tools`
(`scripts/check-tools.ts`) fails a tool published to either surface without one, the same way it
asserts the input schema.

## One vocabulary for a content change

`SectionOp` is not stored: it is the REST body and the room's wire. The merge with the tool
patch therefore lives at the seam, not in a migration: `toSectionOps(before, ops)` in `@model/ai`
(apply, diff), and `commitPatch` in `services/core/ai/effects.ts`, which every server-side landing
of a patch goes through (`services/core/generations.ts`, `services/core/delegated.ts`). The ops are
written in the REST transaction and published to the room, so collaborators see a tool's change as
ops rather than a resync, and a patch against a section that is gone is a conflict rather than an
overwrite.

## The writer lease across instances

`generations.writer_until` (`writerUntil` in `services/db/schema.ts`, migration 0048): a write
claims the lease with a conditional update, releases it when it settles, every patch the holder
lands pushes it out, and a dead writer's lease lapses on its own — the "a dead writer leaves
nothing stuck" property carried by a timestamp on the row instead of an in-process map, so a second
Render instance cannot land two writes on one generation. The store's lease calls are asynchronous;
the in-memory store keeps the same contract.
