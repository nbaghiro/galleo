# Planning: tracing as a first-class record, with evals as one consumer

> Every model call is already measured, because billing needs the tokens, but the record of a tool
> run is assembled in one HTTP route, switched on by a browser flag, folded by a client-minted
> session id, and stored in a table named after its only reader. This plan moves the record to the
> executor, keeps it for every call at a level that costs a row, and turns the eval playground into
> a consumer of it, so an analyzer or a support view later reads the same thing.

Status: built 2026-09-03, all six slices, awaiting manual QA. It replaced `eval_runs`, the `trace`
and `traceSession` fields on `POST /ai/turn`, the client's trace toggle, and `recordRun`. The
current-state sections are folded into `ai.md` (§1, §7, §11, §13). This file stays until QA signs
off and is then deleted, per `../README.md`. After the build, the `/eval` playground and the
`eval_verdicts` table were removed altogether (migration 0047), so section 5's first consumer no
longer exists; the offline harnesses and a future analyzer are the readers.

Companion docs: `../ai.md` (the executor, §7, and the routes, §11), `../analytics.md` (the
`ai_action_*` events the same seam already emits), `generation-resource.md` (the executor and the
generation this builds on).

## 1. What we are building

A trace is the record of one root tool call, opened by the executor and closed when the call
settles. It exists at the `metrics` level for every call on every surface, because the spans it
holds are the ones the ledger already collects to bill the call, so the marginal cost of keeping
them is a row. The `full` level adds the clipped prompt and response bodies and is decided by
policy in core rather than by the client: the eval account gets it, and any call that fails gets it
through tail sampling, where bodies are held in memory for the duration of the call and written
only when the outcome is an error. Retention is a cap rather than a schedule. Each flush deletes
the rows that fall outside the newest N per workspace, so the table has a bounded size without a
job to run or a clock to trust. Nothing about a trace is shown to a person in this pass. The trace
id does ride back on `turn.done` and in the delegated outcome, so a later support surface or an
analyzer can name a run, but no client reads it yet.

What it replaces, and why each part goes:

- `eval_runs` mixes the record (spans, config, timing) with verdicts about it (checks,
  judgements). The record becomes `traces`, the verdicts become `eval_verdicts`.
- `trace: true` in the request body let the client decide what the server records. Recording is
  the server's decision, so the field goes, and with it the localStorage flag and the toggle in the
  playground header.
- `traceSession` folded the studio's turns into one row at write time, with an id the browser
  minted. The generation id is that id now, on every surface, and folding becomes a query.
- `configOf` rebuilt the brief from the request body and `built` rebuilt the content from the
  patches of one call, which is why a traced write of one beat stored a one-section artifact. The
  trace takes the content off the executor's context after the call instead.

## 2. The contract (`model/trace.ts`)

A nineteenth model file, for the same reason `analytics.ts` is one: the playground and the backend
both read it, and it is a concept rather than a handful of types belonging to one already there.
`ModelSpan` and `PromptPart` move here from `model/ai.ts`, since a span is a trace's, not the
protocol's.

```ts
type TraceLevel = "metrics" | "full";
type TraceStatus = "ok" | "error" | "refused" | "aborted";

interface ToolSpan  { kind: "tool";  id; parent; at; tool; surface; ms; status; error?; patches? }
interface ModelCall { kind: "model"; id; parent; at; ...ModelSpan }
type TraceSpan = ToolSpan | ModelCall;

interface Trace {
    id; workspaceId | null; userId | null; surface; tool;
    generationId | null; artifactId | null;
    level; status; error | null;
    models: Record<string, string>;      // the model in effect per task, resolved at the call
    tokensIn; tokensOut; credits; ms; at;
    spans: TraceSpan[];                  // flat, parent-linked; spans[0] is the root tool span
    input: unknown | null;               // full only: the parsed input
    content: ArtifactContent | null;     // full only: the artifact after the call
}
```

The spans are a flat list with parent ids rather than a nested tree, so a query can address one
span and the playground's step helpers (`tokensOf`, `stepsOf`, `spansForStep`, moved here from
`model/eval.ts`) keep working over the model calls. `patches` on a tool span is counts, never the
ops: how many artifact ops, how many generation ops, whether a workspace action, which is what an
analyzer needs and is content-free.

## 3. The tracer (`services/core/traces.ts`)

One file: the ambient trace, the level policy, the store contract, the database store with its
cap, and the in-memory store the harnesses and tests use.

- **Opened by the executor.** `runTool` wraps the whole call in `withTrace`, from the surface check
  to the settle, so a refusal before the body ran is a trace with status `refused`. A `runTool` that
  finds a trace already live (the chat agent's sub-tools) adds a child tool span instead of opening
  a second trace, and so does `ctx.use`. The parent is carried by AsyncLocalStorage, the same
  mechanism the meter uses for the step label.
- **The meter feeds it.** `record()` in `meter.ts` keeps pushing into the meter's `uses` for
  billing and also hands the span to the live trace, which attaches it to the current tool span.
  The meter loses its `trace` flag; the provider middleware captures bodies whenever a trace is
  live, and the level decides at close whether they are kept.
- **The level.** `full` when the principal is the eval account, or when the status is not `ok`.
  Otherwise the bodies, the input and the content are stripped before the row is written.
- **Credits.** `reserve().settle` reports the settled cost to the live trace, so the row carries
  what the ledger charged rather than the estimate.
- **Content.** The executor applies every artifact patch to a local copy of the context's artifact
  as it is yielded, whether or not the patch is persisted, and hands the result to the trace at
  close. For a generation that is the draft after the call; for a client-held artifact it is the
  document the browser sent plus what this call did to it.
- **Flush.** The store's `save` runs after the outcome is returned and never fails the call. A
  `flushTraces()` awaits the pending writes, for tests and for the harnesses before they exit.
- **The cap.** `save` deletes the rows outside the newest `TRACE_CAP` per workspace in the same
  statement batch, and the verdicts whose subject no longer exists. Public calls have no workspace
  and are capped as their own group.
- **Where the store comes from.** `RunToolOptions.traces` names it, absent meaning nothing is
  written, the way `ctx.generations` works. The routes and the delegated call pass the database
  store; the batch harness passes it with `--save` and the in-memory one otherwise; unit tests pass
  the in-memory one or nothing.

The `ai_action_*` analytics stay where they are in `spend.ts`. They are emitted at the same seam
and from the same spans, and deriving one from the other is a later tidy rather than part of this.

## 4. Storage

```
traces          id · workspace_id? · user_id? · surface · tool · generation_id? · artifact_id? ·
                level · status · error? · models · tokens_in · tokens_out · credits · ms ·
                spans · input? · content? · created_at
                index (workspace_id, created_at desc) · index (generation_id)
eval_verdicts   run_id (text, primary) · workspace_id · checks · judgements · updated_at
```

`run_id` is the subject a verdict is about: a generation id when the traces belong to one, else a
trace id. It is text rather than a foreign key because a verdict is allowed to outlive the traces
the cap removed, and a pruned subject is cleaned up by the cap rather than by a cascade.

The migration creates both tables, copies every `eval_runs` row into `traces` (surface `direct`,
tool from `config.kind`, level `full`, the old spans as model calls under a synthesized root tool
span, `config.meta` as the input) and its checks and judgements into `eval_verdicts`, then drops
`eval_runs`. The seed's per-workspace wipe deletes traces and verdicts where it deleted eval runs.

## 5. Consumers

- **Evals.** `eval/runs.ts` becomes queries over traces plus verdict storage. A run in the
  playground is a subject: the traces sharing a generation id, or one trace. The list groups by
  subject and pages by the subject's latest trace; the detail concatenates the spans in order,
  takes the content off the latest trace that has one, derives `meta` with `runMeta` from the
  generation when there is one, computes the structural checks on read with `runChecks` so a rule
  change applies to old runs, and merges the layout checks the client posted. Judging writes a
  verdict. `EvalRun` loses `config` and gains `tool`, `tools`, `surface`, `meta`, `models`; the
  view's field paths change and nothing else about it does.
- **The batch harness.** `gen-eval --save` stops calling `recordRun` and runs with the database
  store and the demo workspace stamped on the trace; judgements are saved against the trace id the
  outcome returns. `eval-ci` keeps the in-memory meter it has.
- **The analyzer, later.** A query layer over `traces`: latency and tokens per tool and model,
  failure reasons by model, cache share, cost per surface, prompt part attribution. Nothing in this
  plan is built for it beyond the shape of the row.

## 6. Slices, in build order

1. `model/trace.ts` with the moved types and helpers; `model/eval.ts` trimmed; imports updated;
   `model/__tests__/trace.test.ts`.
2. `services/core/traces.ts`: the tracer, the policy, both stores, the cap; the meter and the
   provider wired to it; `spend.ts` reporting credits; `services/core/__tests__/traces.test.ts`
   and an itest for the cap.
3. The executor opens the trace, nests sub-tools, records the outcome and the content, returns
   `traceId` on the outcome; `turn.done` carries it; every route and the delegated call pass the
   store; the route sheds `trace`, `traceSession`, `configOf`, `modelMap`, `built`, `onMeter`.
4. Schema and migration with the copy; the seed's wipe.
5. `eval/runs.ts` as queries and verdicts; `services/api/eval.ts` unchanged in URL and shape apart
   from the run type; `gen-eval --save` on the store; the client's flag, session and toggle removed;
   `EvalView` on the new fields.
6. Docs: `ai.md` §1, §7, §11, §13; `README.md`; this file's status.

Each slice ends with `tsc`, lint, the unit suite and the guards; slices 2 to 5 also run the
integration suite on an isolated database.

## 7. Decisions

Taken:

- `metrics` for every call; `full` for the eval account and for any failed call.
- Retention is a per-workspace cap pruned on write, no scheduled job.
- No user-facing change. The trace id is on the wire (`turn.done`, the delegated outcome) and
  nowhere in the UI.

Open:

- The cap's value. Starting at 1000 rows per workspace; a `full` row with bodies is tens of
  kilobytes, so the eval account's history is bounded at a few tens of megabytes.
- Whether the `ai_action_*` events should be emitted from the trace rather than beside it.
- Whether a metrics-level trace should keep the input for a small set of content-free tools
  (`set-format`, `reorder-section`), where the input is the whole story of the call.
