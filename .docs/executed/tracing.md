# Tracing: the tool call as a first-class record

> Every model call was always measured, because billing needs the tokens, but the record of a tool
> run used to be assembled in one HTTP route, switched on by a browser flag, folded by a
> client-minted session id, and stored in a table named after its only reader. The record now
> belongs to the executor: kept for every call at a level that costs a row, with the offline
> harnesses and the analyzer as its readers.

Companion docs: `../ai.md` (the executor, §7, and the routes, §11), `../analytics.md` (the
`ai_action_*` events, two of which are now emitted from the trace), `generation-resource.md` (the
executor and the generation this builds on).

## 1. What it is

A trace is the record of one root tool call, opened by the executor and closed when the call
settles. It exists at the `metrics` level for every call on every surface, because the spans it
holds are the ones the ledger already collects to bill the call, so the marginal cost of keeping
them is a row. The `full` level adds the clipped prompt and response bodies and is decided by
policy in core rather than by the client: the eval account (the demo user, `DEMO_EMAIL`) gets it,
and any call that fails gets it through tail sampling, where bodies are held in memory for the
duration of the call and written only when the outcome is not `ok`. Retention is a cap rather than
a schedule: each save deletes the rows that fall outside the newest `TRACE_CAP` (1000) per
workspace, so the table has a bounded size without a job to run or a clock to trust. Nothing about
a trace is shown to a person in the product. The trace id does ride back on `turn.done` and in the
delegated outcome, so a later support surface can name a run, but no client reads it.

What it replaced, and why each part went:

- `eval_runs` mixed the record (spans, config, timing) with verdicts about it (checks,
  judgements). The record became `traces`; the verdicts briefly became `eval_verdicts`, which was
  dropped with the `/eval` playground (migration 0047) — judged measurement now runs only offline,
  through `pnpm eval:shots --judge` and `pnpm eval:ci`.
- `trace: true` in the request body let the client decide what the server records. Recording is
  the server's decision, so the field went, and with it the localStorage flag and the toggle in
  the playground header.
- `traceSession` folded the studio's turns into one row at write time, with an id the browser
  minted. The generation id is that id now, on every surface, and folding is a query
  (`generationReport`).
- `configOf` rebuilt the brief from the request body and `built` rebuilt the content from the
  patches of one call, which is why a traced write of one beat stored a one-section artifact. The
  trace takes the content off the executor's context after the call instead.

## 2. The contract (`model/trace.ts`)

A model file of its own, for the same reason `analytics.ts` is one: the harnesses and the backend
both read it, and it is a concept rather than a handful of types belonging to one already there.
`ModelSpan` and `PromptPart` live here, since a span is a trace's, not the protocol's.

`TraceLevel` is `"metrics" | "full"`; `TraceStatus` is `"ok" | "error" | "refused" | "aborted"`.
`Trace` carries the subject (`workspaceId`/`userId`, both null for a public call, `surface`,
`tool`, `generationId`, `artifactId`), the outcome (`level`, `status`, `error`), the models in
effect per task as resolved at the call (`models`), the totals (`tokensIn`, `tokensOut`,
`credits`, `ms`, `at`), the spans, and — at `full` only — `input` (the parsed input) and `content`
(the artifact after the call).

The spans are a flat list with parent ids rather than a nested tree (`ToolSpan` | `ModelCall`,
with `spans[0]` the root tool span), so a query can address one span and the step helpers
(`stepsOf`, `spansForStep`, `tokensOf`, plus `modelCalls`/`toolSpans`/`stripBodies`) work over the
model calls. `patches` on a tool span is counts, never the ops (`PatchCounts`: how many artifact
ops, how many generation ops, whether a workspace action), which is what an analyzer needs and is
content-free. A tool span can also carry `flags`, short strings a body notes about its own run —
the section writer flags `unchecked` when it ships a section that parsed but never passed its
checks.

## 3. The tracer (`services/core/traces.ts`)

One file: the ambient trace, the level policy, the store contract, the database store with its
cap, the in-memory store the harnesses and tests use, and the analyzer's queries.

- **Opened by the executor.** `runTool` wraps the whole call in `traceCall`, from the surface check
  to the settle, so a refusal before the body ran is a trace with status `refused`. A `traceCall`
  that finds a trace already live (the chat agent's sub-tools) adds a child tool span instead of
  opening a second trace, and `traceUse` does the same for a body composing through `ctx.use`. The
  parent is carried by `AsyncLocalStorage`, the same mechanism the meter uses for the step label.
- **The meter feeds it.** `record()` in `meter.ts` keeps pushing into the meter's `uses` for
  billing and also hands the span to the live trace through `noteModel`. A `ModelSpan` is a
  `TokenUse` structurally, so billing reads `uses` unchanged. The provider middleware captures
  bodies whenever a trace is live, and the level decides at close whether they are kept.
- **The level.** `full` when the principal is the eval account (`TraceStore.full`), or when the
  status is not `ok`. Otherwise the bodies and the content are stripped before the row is written.
  A `full` input larger than `INPUT_CAP` (32 KB) is replaced by its size — a chat call carries the
  open artifact and the history, which the content column and the thread already hold. At
  `metrics`, the input survives for the tools in `INPUT_KEPT` (`set-format`, `set-theme`,
  `reorder-section`, `remove-section`, `pick-version`, `read-generation`, `finish-generation`):
  their input carries no content, so keeping it tells the whole story of the call.
- **Credits.** `reserve().settle` reports the settled cost to the live trace through
  `noteCredits`, so the row carries what the ledger charged rather than the estimate.
- **Content.** The executor applies every artifact patch to a local copy of the context's artifact
  as it is yielded, whether or not the patch is persisted, and hands the result to the trace at
  close (`span.note({ content })`). For a generation that is the draft after the call; for a
  client-held artifact it is the document the browser sent plus what this call did to it.
- **Flush.** The store's `save` runs after the outcome is returned and never fails the call. A
  `flushTraces()` awaits the pending writes, for tests and for the harnesses before they exit.
- **The cap.** `save` calls `prune`, which deletes the rows outside the newest `TRACE_CAP` in the
  workspace. Public calls have no workspace and are capped as their own group.
- **Where the store comes from.** The store is process-wide, set by the entry point:
  `services/server.ts` calls `setTraceStore(traceStore())` so every call from then on is recorded;
  the trace tests register `memoryTraceStore`; a process that registers nothing — the offline
  harnesses included — runs every trace in memory and drops it. The executor must not choose a
  database itself, which is why the store is not one of its options — the plan's sketch of a
  per-call `RunToolOptions.traces` field was replaced by this during the build. The outcome
  carries `traceId` only when a store will keep the trace.

**Two of the `ai_action_*` events are emitted from the trace.** `ai_action_completed` and
`ai_action_failed` fire at close in `traces.ts` (`emit`), so the number on the event is the number
in the row: settled credits, real tokens, and the dominant model (the one that produced the most
output, which is the one a latency or failure belongs to). The failure reason is read off the
provider's message (`REASONS`, first match wins). `ai_action_started` stays with the hold in
`spend.ts`, which is where the estimate is known. A refusal is not a failure of the AI and emits
neither.

## 4. Storage

```
traces   id · workspace_id? · user_id? · surface · tool · generation_id? · artifact_id? ·
         level · status · error? · models · tokens_in · tokens_out · credits · ms ·
         spans · input? · content? · created_at
         index (workspace_id, created_at desc) · index (generation_id)
```

The table lives in `services/db/schema.ts` (`traces`). Migration 0046 created it, copied every
`eval_runs` row in (surface `direct`, tool from `config.kind`, level `full`, the old spans as
model calls under a synthesized root tool span, `config.meta` as the input) and dropped
`eval_runs`; migration 0047 dropped the `eval_verdicts` table 0046 had created, when the `/eval`
playground was removed. The seed's per-workspace wipe deletes traces where it deleted eval runs.

## 5. Readers

- **The analyzer.** `pnpm traces` (`scripts/traces.ts`) reads the table through `traceSummary` and
  `generationReport`, which live beside the store in `services/core/traces.ts` because they are
  the trace concept's own: latency percentiles and tokens per tool and model, cached share,
  outcome counts by tool and error, the section writer's cache split (first call of a run versus
  the rest), retry and `unchecked` counts, and one generation's calls in order. Raw SQL over the
  spans — a jsonb array of calls is what the row holds, and a query is what replaced the
  playground as the way to read it.
- **The offline harnesses.** `pnpm ai:eval` and `pnpm eval:ci` run tools through the same
  executor but register no trace store, so their own traces are dropped. The demo account's
  product calls keep their bodies (`full`), which is what an analyzer over the table reads for a
  judged run.
- **Nothing in the product.** The trace id is on the wire (`turn.done`, the delegated outcome) and
  nowhere in the UI; a support surface reading it is a later build, and the fuller analyzer cuts
  (failure reasons by model, cost per surface, prompt part attribution) are listed in `ai.md` §13.

## 6. Decisions

- `metrics` for every call; `full` for the eval account and for any call that did not end `ok`.
- Retention is a per-workspace cap pruned on write, no scheduled job. The cap is `TRACE_CAP`
  (1000): a `full` row with bodies is tens of kilobytes, so the eval account's history is bounded
  at a few tens of megabytes.
- No user-facing surface. The trace id is on the wire and nowhere in the UI.
- The `ai_action_*` outcome events are emitted from the trace rather than beside it, so the event
  and the row cannot disagree; the start event stays with the hold, where the estimate is.
- A metrics-level trace keeps the input for the small set of content-free tools (`INPUT_KEPT`),
  where the input is the whole story of the call.
