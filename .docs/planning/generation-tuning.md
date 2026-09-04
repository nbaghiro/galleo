# Planning: the generation flow after the rebuild, what is left and in what order

> Three rounds landed in two days: the generation became a server resource driven by catalog tools
> through one executor, tracing became the executor's own record, and the prompt findings from the
> Tidewell walkthrough were fixed. This plan holds what is still open, ordered so that each step
> gives the next one its measurement, and names the decisions that are not ours to make.

Status: decided 2026-09-04, building. Decisions taken: W5 prepares on open only; W3 is dropped
and W2 stays as a measurement; W6, W7 and W8 are in this round, with the REST API consuming the
output schemas and the one vocabulary as well as MCP; commits and pushes wait. Companion docs: `../ai.md` (the flow as it is),
`generation-resource.md` and `tracing.md` (the two rounds this follows; both are to be deleted
once QA signs off), `showcase-prompts.md` (the parallel prompt round). The walkthrough page with
every prompt rendered is the reference for the prompt work.

## 0. Already landed, for the record

So the plan below is read against the current tree rather than the one the walkthrough described.

- The generation is a `generations` row; every studio button, the chat dock and MCP run the same
  ten tools through `runTool`; the studio store is a mirror kept by `applyPatch`.
- Every call is traced at `metrics`, the eval account and failures at `full`, capped per workspace.
  The `/eval` playground and its tables are gone; the offline harnesses judge from the command line.
- Prompts: the arc reads the whole brief, one image rule, dash-free exemplars, one section-count
  band per length, the preset list from the catalog, both system prompts ordered static-first for
  the provider's cache, the parallel round's objection beat, tabs line, mood band, table and
  reconciliation rules, and the fourth exemplar.
- Flow: a write against a stale outline is refused unless forced; finish takes the writer lease; the
  generation funnel's server-side events are emitted from the tool bodies.
- Background audio preparation waits for a burst of saves to end, checks the balance first, and
  backs off after a refusal. The demo workspace was topped up through the ledger.

## 1. The workstreams

Ordered by dependency: the analyzer gives the prompt work its numbers, the prompt work is gated by
the eval harness, and the platform items come last because nothing above waits on them.

### W1: a trace analyzer on the command line

**Built.** `pnpm traces [--since 7d] [--tool id] [--workspace id] [--generation id] [--json]`,
over `traceSummary` and `generationReport` in `services/core/traces.ts`.

The playground was the only reader of the traces and it is gone. What replaced it should be a
query, not a page: `pnpm traces` over the `traces` table, printing per tool and per model the call
count, p50 and p95 latency, tokens in and out, the cached share, settled credits and failure
reasons; per generation the beats written, retries per beat, cost and wall time; with `--since`,
`--tool`, `--generation` and `--json`. It runs against the dev database like the other scripts.

- Why first: W2 and W3 are decided by three numbers this prints (cached share on the first section
  call, retry rate per beat, tokens per section), and reading them by hand in psql each time is
  what we did this week.
- Where: `scripts/traces.ts`, the way `scripts/eval-ci.ts` and `scripts/posthog-dashboards.ts` are
  scripts over the services layer; the queries live in `services/core/traces.ts` beside the store,
  since they are the trace concept's own reads.
- Acceptance: the three numbers above for the last seven days, in one command, plus a per-generation
  breakdown for one id. Size: M.

### W2: what the cache actually does now

**Measured** on three runs (deck/studio, 12 sections in 80 s; doc/vellum, 9 in 76 s; web/couture,
9 in 63 s; 34 section calls, 240 credits). Later section calls in a run: 53 percent of input
cached. The first section call of each run: 0 percent, even though the runs shared the
static-first prefix minutes apart. Retries: 4 of 30 beats needed a second call, none landed
unchecked. The provider's implicit cache does not carry the prefix across runs reliably, so the
next step is not a trim but an explicit cached-content handle for the static prefix, which is a
decision for the next round; W3 stays dropped.

The static-first ordering landed without a measurement, because no traced generation had run
under it. Before any token is cut from the prompts, read what the provider's implicit cache does:
the cached share on the first section call of a run (it was zero), on later calls (43 to 45
percent), and across runs of different surfaces and themes.

- Method: three generations on the demo workspace in different themes and surfaces, then W1.
- Decision it produces: whether W3 is worth running at all. If the shared prefix is served from
  cache on every call, the element catalog costs latency but little money, and the trim is a
  quality risk for a small saving.
- Size: S. Cost: three Standard runs, about 300 credits on the demo workspace.

### W3: the element catalog per beat, as an experiment

About 4,600 of the section call's 8,800 system tokens are the element catalog, sent whole on every
beat. The plan named the blocks each column leads with; the writer could be shown the entries for
those block kinds plus the always-on basics (`text`, `container`, `media`, `bullets`, `button`,
`badge`, `quote`, `stat`) rather than all sixty.

- Build: `elementCatalog(kinds?)` filtering by category, and `sectionParts` taking the beat's blocks
  through it behind one option, off by default. No dead code: the option is exercised by the eval
  run, and either adopted (default on, option removed) or removed with the run's report.
- Gate: `pnpm eval:ci --cases 7 --judge both` twice, full catalog and trimmed, same cases. Adopt
  only if every deterministic check holds and no gated rubric question drops. About two dollars a
  run with both judges.
- Size: M. Needs: an API key with budget for the two runs, which is a decision (§3).

### W4: the section writer's retries

**Built.** A failed check goes back as a repair (`repairParts`: the previous object and its
issues, under the persona, the catalog, the rules and the output envelope), and a section kept
past its checks flags the tool span (`unchecked`), which `pnpm traces` counts.

A failed check costs a whole second call at 8,800 tokens, and a third. Two changes, both measured
by W1's retry rate before and after:

- The repair prompt drops the fragments a repair does not need (the exemplars, the layout catalog)
  and carries the previous JSON with the issues, asking for the corrected object rather than a
  fresh section. Smaller and more likely to converge.
- The third attempt's "usable" rule (a parsed section that never passed the checks is kept) is
  made visible on the trace's tool span, so W1 can count how often a beat lands unchecked.
- Size: M.

### W5: background audio preparation, the policy

**Built, on open only.** The save-time triggers are gone; the open trigger stays with the
balance check and the back-off. The demo workspace's `prepareAudio` was also switched off after a
second drain (2,720 credits in seven minutes on six opened pieces), since a prepare on open still
narrates a whole piece at about 440 credits; turning it back on is a settings toggle.

The guards landed; the policy did not. `prepareInBackground` runs from two triggers, the artifact
changing and the artifact being opened, and it was the change trigger that narrated every save.
Three options:

- Keep both triggers with the new guards. Cheapest to do, still spends on pieces nobody presents.
- Prepare on open only. A piece is narrated when someone comes back to it, which is when it is
  about to be presented or read; a piece edited and left alone costs nothing.
- Prepare only once a piece has been presented. Narrows it further, but a first press then waits
  the five seconds the feature exists to remove.

Recommendation: on open only. Size: S. This is a product decision (§3).

### W6: the `ai_action_*` events and the trace

**Built.** `ai_action_completed` and `ai_action_failed` are emitted from the trace's close with
the settled credits, the real tokens, whether the cache served any of them, and the model that
answered; `ai_action_started` stays with the hold. The analytics tests run through the executor.

`measured()` in `spend.ts` emits started, completed and failed per reservation; the trace records
the same call with better numbers (settled credits, cached tokens, the reason). Moving the two
later events to the trace's close means one seam for the ledger, PostHog and the store.

- Objection recorded last round: the reserve seam is pinned by `spend-analytics.test.ts` and the
  analytics itest, and a caller that reserves outside a trace would go dark. The fix is that no
  caller does: every reserve today happens inside `runTool`. The tests move to run through it.
- Keep `ai_action_started` at reserve, where the estimate is known. Size: M.

### W7: MCP output schemas

**Built.** `TOOL_SPEC.output` for all 29 tools on the `mcp` and `api` surfaces, published as
`outputSchema` in `tools/list` and in `GET /api/v1/tools`, checked on every answer, guarded by
`check:tools`.

`tools/list` declares an input schema per tool and no output schema. The results are heterogeneous
(a string, an `ArtifactRef[]`, a `Section`, a `GenerationView`), so this is real work rather than
a flag: `TOOL_SPEC` gains an `output` zod schema for every tool live on the `mcp` surface (29),
the MCP layer exposes it through `z.toJSONSchema`, and `check:tools` asserts every mcp-live tool
declares one, the same way it asserts the input. Size: L.

### W8: one vocabulary for a content change

**Inventoried and built at the seam.** `SectionOp` is not stored: it is the REST body and the
room's wire. The merge is therefore `toSectionOps(before, patch)` in `@model/ai` (apply, diff),
and `commitPatch` in `effects.ts`, which every server-side landing of a patch (the generation
store, the delegated call) goes through: the ops are written in the REST transaction and
published to the room, so collaborators see a tool's change as ops rather than a resync, and a
patch against a section that is gone is a conflict rather than an overwrite.

`SectionOp` (the REST write) and `PatchOp` (the tool patch) describe the same edits twice. Step
one is an inventory, since the cost depends on where `SectionOp` is stored: the collaboration
op log and the REST body, or the body alone. If nothing stores it beyond the request, the merge is
a model change with no migration; if the room persists ops, it needs one. Size: S for the
inventory, then decided.

### W9: the writer lease across instances

**Built.** `generations.writer_until` (migration 0048): a write claims it with a conditional
update, releases it when it settles, every patch the holder lands pushes it out ten minutes, and
a dead writer's lease lapses on its own. The store's lease calls are asynchronous; the in-memory
store keeps the same contract.

The lease and the prepare debounce are in-process maps. Render runs one instance today; a second
would let two writes land on one generation. A `writer_until` timestamp on the row, claimed with a
conditional update, is the smallest cross-instance form and keeps the "a dead writer leaves
nothing stuck" property through the timestamp. Size: S. Not urgent until the hosting changes.

### W10: QA, CI and the paper trail

Runs beside the others rather than after them.

- Manual QA of the three rounds: studio intake to finish, pause and versions, steer from the
  console, close and reopen, start from the library chat, reopen the dock and find the thread, a
  credit wall in the picker, `pnpm mcp tools` listing 29.
- Commit in the slices the planning docs describe and push; watch the Playwright run for the
  updated `generate-shape` spec, which has only been checked locally by type.
- Delete `generation-resource.md`, `tracing.md` and this file's finished sections as QA signs off,
  per `../README.md`.

## 2. Order and gates

W1 → W2 → (W3, W4 in either order, each gated by `eval:ci`) → W5 → W6 → W7 → W8 → W9, with W10
alongside from the start. Each workstream lands green on typecheck, lint, the unit suite, every
`check:*` guard, and the integration suite on an isolated database; W3 and W4 add an `eval:ci`
run whose report is kept with the change.

## 3. Decisions needed

- W5: which trigger prepares audio. Recommended: on open only.
- W3: budget to run `eval:ci` twice with both judges, about four dollars in total.
- W6: whether the analytics move is wanted, or the current seam stays.
- W7 and W8: whether either is in scope for this round, or waits for the API work that would
  actually consume them.
- W10: when to commit and push, given that pushes to `main` deploy.
