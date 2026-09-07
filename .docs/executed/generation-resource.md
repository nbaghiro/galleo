# The generation as a resource, and every AI action as a tool

> The tool catalog and the executor serve the chat agent, the direct routes, MCP and the REST API
> from one registry, and the generation flow runs on that spine rather than beside it. The
> generation is a server-side resource, the tool patch addresses it, and every studio action is a
> catalog tool, so the studio, the chat dock, the studio console, MCP and the API all drive the
> same thing through the same calls.

This doc records the shape of the resource and the decisions behind it. The full current-state
description — the executor, the routes, the agent, the studio as built — is `../ai.md` (§3, §5 to
§8, §11 to §13) and `../mcp.md` (the executor, the tool surface, the effect path); where detail is
needed, read those.

## 1. The shape

One resource, one patch type, one executor, one streaming envelope.

1. A `Generation` row (`model/ai.ts`, `services/core/generations.ts`, the `generations` table)
   holds what the artifact cannot: the brief with who set each field, the outline, the standing
   steer note, the planner's one clarifying question, per-beat status and the alternate takes. The
   draft artifact is created when the generation starts, so a piece exists from the first call.
2. The tool `Patch` is an object that can address the artifact, the generation and the workspace
   at once (`{ artifact?: PatchOp[]; generation?: GenerationOp[]; workspace?: WorkspaceAction }`),
   applied by one pure function on both sides (`applyPatch` in `@model/ai`).
3. The studio's actions are catalog tools: `start-generation`, `plan-outline`, `revise-brief`,
   `revise-outline`, `steer-generation`, `write-beat`, `write-beats`, `pick-version`,
   `read-generation`, `finish-generation`, `apply-patch`, and `generate-artifact` as the composite
   that runs the same tools to completion. The board's buttons and the agent's cards call the same
   tools; the bodies live in `services/core/ai/tools/generation.ts` and `tools/plan.ts`.
4. The streaming route dispatches on a tool id: `POST /ai/turn` takes `{ tool, input }` (`zTurn`
   in `services/api/ai.ts`), and the executor (`runTool` in `services/core/ai/execute.ts`) applies
   each patch the moment it is yielded — so a composite that writes several sections lands each as
   it comes and a later beat reads the earlier ones — and echoes it as a `patch` event with the
   new `seq`.
5. The agent's toolset is derived from the catalog through the `needs`/`without` availability
   predicate and a per-tool `confirm` policy on `ToolMeta` (`model/tools.ts`); results are shown
   by a generic presenter unless a tool declares its own (`present`). The thread is persisted
   (`chat_threads`, `services/core/threads.ts`) with per-proposal marks, so the agent can apply a
   pending proposal by id through `apply-patch`.
6. The same tools run over MCP and the API through the delegated call, so an external client can
   plan, edit an outline and write beats one at a time, and the widget paints progress by polling
   `read-generation`.

## 2. The data model

### 2.1 The generation

`Generation` carries `stage` (`briefed · planning · outlined · writing · done`), `brief`,
`briefVersion`, `outline`, `plannedAgainst`, `steer`, `clarify`, `beats`
(`Record<string, BeatState>` — `status`, `versions` with every take kept, `active` naming the one
the artifact carries), and `seq`. The row is indexed on `(workspace_id, artifact_id)`; versions
ride in `beats` as jsonb, since a piece has at most a few dozen takes and they are read together
with the row — if that grows, they move to their own table without changing the type.

The section of record stays in `artifacts.draft_content`, landed by ordinary artifact ops. The
generation never duplicates it; `versions` holds the takes, and `active` names which one the
artifact currently carries. `ai_meta` is written at run start and finish from the row, never from
the browser.

The `stage` values name states rather than activities, which is what a row can hold. `planning`
is the one activity kept as a stage, because a client that reconnects during it needs to know a
plan is coming. `BeatStatus` goes further than the plan did: it holds only settled states
(`queued · done · failed · skipped`), with no `writing` — writing is a live signal on the stream
(`section.status`), so a process that dies mid-write leaves a beat queued rather than stuck.

The planner's clarifying question is a `clarify` field on the row, set by `setOutline` and cleared
or replaced by `setClarify`, rather than a value that only rides the outline result.

### 2.2 The brief with provenance

`Brief extends GenerateInput` with `set: Partial<Record<BriefField, "user" | "planner">>`. The
`setBrief` op with `by: "user"` writes the field, marks it, and bumps `briefVersion`; with
`by: "planner"` it writes only fields not marked `user` and does not bump the version. That is the
old client-side `absorbRead` rule with the two merge policies collapsed into one, and it is what
lets a reroll fill gaps without clobbering what was typed. The bar shows "planned against an older
brief" exactly when `plannedAgainst < briefVersion`; `setOutline` records
`plannedAgainst = briefVersion` by construction, so a new plan clears the hint.

### 2.3 The patch

An object with optional targets rather than a union, because one tool often changes two things at
once: writing a beat adds a section to the artifact and marks the beat written on the generation,
and the two must land together. `applyPatch` stays pure in `@model/ai`; the artifact half is the
existing `PatchOp` vocabulary unchanged, the generation half is `GenerationOp` (`setBrief` ·
`setOutline` · `setClarify` · `addBeat` · `updateBeat` · `removeBeat` · `moveBeat` · `setSteer` ·
`setBeat` · `pushVersion` · `pickVersion` · `setStage`, applied by `applyGenerationOps`).
`WorkspaceAction` is carried, not applied, by the pure function; performing one is the server's
job in `delegated.ts` and the client's in the chat store.

The REST write path keeps its own `SectionOp` vocabulary in `model/artifact.ts` beside `PatchOp`.
The two describe the same edits from two sides, and they meet in `toSectionOps` (`model/ai.ts`):
apply the patch, diff, and the ops fall out, which is how a server-side write reaches
collaborators as ops rather than as a resync. Folding one vocabulary into the other is worth doing
and is its own pass (`ai.md` §13), since it carries a migration of stored ops.

### 2.4 The thread and its proposals

`chat_threads` holds `messages` (what the person said and the events the assistant streamed back,
compacted by `compactEvents`) and `marks` (per-proposal state), keyed by
`(workspace_id, user_id, key)` with `key = threadKey(context)` — `generation:<id>` when there is
one, `artifact:<id>` otherwise, the library key failing both. `services/core/threads.ts` owns
`loadThread`, `appendExchange`, `markProposal` and `clearThread`. The thread is one per person per
subject: two people on one generation each have their own conversation and do not see each other's
cards.

## 3. Decisions

The generation is a server resource. The alternative was to keep the session in the browser and
formalise the proposal tools as a client-applied `OutlinePatch`. That leaves MCP and the API
unable to plan and write step by step, leaves a refresh losing built work, and keeps the brief
with no owner. We took the larger change because we were early and the two paths would otherwise
be maintained in parallel.

`Patch` was widened rather than replaced by a new noun. The registry already named its mapper
`patch`, and the documented meaning, "a structural mutation the client applies", is what we want
for all three targets. We considered `Effect` (a second noun beside `Patch`, and the registry
field renames), `Change` (says nothing in a type name) and `Ops` (the atom's name used for the
bag). The cost of widening was the migration of `Patch` from an array to an object, which touched
every `applyPatch` caller and the proposal block; we accepted that.

The resource is a `Generation`. The surface was already `generate`, the analytics events are
`generation_planned`, `generation_build_started`, `generation_completed`, `generation_abandoned`,
the store is `gen`, and the chat context field was `generation`. We considered `Run` (collides
with run as the executor's verb in `runTool`), `Build` (already means the write phase, so a plan
stage inside a Build contradicts the vocabulary), `Draft` (collides with
`artifacts.draft_content`, which stays), `Session` (the auth session) and `Commission` (no
collisions, but not the repo's register).

Confirmation is a property of the surface, not of the tool. Each tool carries a `confirm` policy
(`before · after · never`) that only the in-app agent surface reads; direct routes, MCP and the
API apply immediately. The old `kind: "proposal"` category and the hand-built proposal closures
are gone — `pnpm check:tools` requires every tool on the agent surface to declare a `confirm`,
since the default is to apply on arrival.

`generate-artifact` stays, as a composite of the same tools run to completion (`tools/generate.ts`
composes start, plan, write-beats over every beat, finish through `ctx.use`). It is right for an
MCP or API caller that wants a finished piece in one call and for a "build it now" that skips the
outline stop. The library agent does not reach for it by default, because a card that plans first
costs the same and keeps every intervention point — `start-generation` gives a conversation every
stop the studio has.

The brief has one owner, the generation row, with per-field provenance. `draft-brief` and
`POST /ai/brief` are gone: the planner reads the brief on every plan, the user overrides by
typing, and a different reading is something the agent produces by calling `revise-brief`.

The chat dock's one-shot draft path is gone (the `drafts` store and `generateFromBrief` with it).
Starting a generation is the one way to make a piece, and the dock's card is a compact view of it.

Pause is closing the stream. The in-flight `write-beat` runs on a context without the stream's
signal, so a closed stream lets the current beat land rather than losing it; the loop reads the
signal between beats, which is where a pause takes effect. A paused run and a dropped connection
behave identically, and a reopened studio reads the row. We considered an explicit pause op on the
generation; it adds a state the client and the server can disagree about, and the stream already
carries the intent.

One writer per generation at a time. A second write while one is in flight is refused with a
`busy` outcome, the same way the collaboration edit lease refuses a second editor on one element.
The lease deviates from the plan's in-process map, deliberately: it is a `writer_until` timestamp
on the generation row with a lapse (`LEASE_MS`, ten minutes), claimed in the executor for
`write-beat`, `write-beats` and `finish-generation` (`WRITERS`), refreshed on every apply while
held, released on settle. A row timestamp means a second server instance is refused too, and the
lapse is what keeps a dead writer from leaving a run stuck; `memoryGenerationStore` keeps the same
contract over a set for tests. A finish takes the same lease, so a stop pressed mid-beat lets the
beat land before the run closes.

## 4. Settled questions

The plan left four open; each is now decided in the code.

- **`start-generation` and `plan-outline` stay two calls.** The studio's intake calls
  `start-generation` and then `plan-outline` on the returned id (`app/stores/generate.ts`). Two
  calls keep the free start separate from the metered plan and let a client start, revise the
  brief, then plan.
- **Per-beat retry lives inside `write-beat`.** The writer gives each section `SECTION_ATTEMPTS`
  (3) attempts with the check issues fed back (`tools/plan.ts`); a beat that fails is marked
  `failed` and the loop moves on. There is no second whole-call retry — the failed card's Write
  button is simply `write-beat` again.
- **The writer lease is per generation**, not per beat. It matches "sections are written with the
  ones before them on the page"; per-beat leasing, which would let the agent rework one section
  while the loop writes another, was not taken.
- **The thread is one per person per subject** (the unique key on `chat_threads`), so
  collaboration on a shared generation does not interleave two people's cards.

## 5. What lands where

The executor applies patches by policy. A generation-held call persists through
`services/core/generations.ts` (`applyPatch`, `seq` bump, both halves in one apply, so the draft
content moves with the row), echoed as a `patch` event with the new `seq`. A client-held call on
the direct route is content-in/content-out: the patch is echoed and the browser applies it, with
the save a separate gated write. The delegated surfaces (MCP, the API) commit an artifact tool's
patch server-side through `commitPatch` in `services/core/ai/effects.ts`, since there is no
browser to hand it to. For an `after` policy on the agent surface the patch is not applied; it
comes back in the proposal block and is recorded as pending, and `apply-patch` loads it by id (or
takes a literal patch) and applies it through the same functions. A proposal that was `before`
runs its recorded call instead.

`write-beats` reads the generation and the artifact fresh per beat, so an outline or steer change
made since the last beat is what this beat is written against; it refuses a beat already written
unless `replace`. Image resolution rides a one-slot pipeline: beat _i+1_'s model call runs while
beat _i_'s images resolve, with patch order preserved. The composite reserves once, sized off the
generation itself (`generationSize` in the executor), and settles to what landed, so a paused run
pays for what it wrote.

The studio store (`app/stores/generate.ts`) is a mirror of the generation the server holds: every
control is a tool call, and the mirror moves when the patch the server applied is echoed back. It
keeps only what is genuinely client-side — the reveal pacing, the painted-section layout audit,
the abort controllers.

Metering has no side doors: `scripts/check-tools.ts`'s `ALLOW` list is empty. The tools that used
to be reserved by string literal in routes have bodies — `narrate-artifact`, `compose-soundtrack`,
`audition-voice`, `design-voice` in `tools/audio.ts`; `read-file` in `tools/files.ts`;
`generate-image`, `generate-video` in `tools/media.ts` — and the routes go through the executor.

The retired vocabulary, for the record: `TurnKind`, `runTurn`, `runBuild`, `runSection`,
`ACTION_FOR` and `IMPLEMENTED` (the tool id on the streaming route replaced the turn kinds);
`propose-generation`, `request-plan`, `request-write`, `steer-sections` and the browser-side
`revise-outline` proposal (the real tools, offered to the agent, replaced the five hand-built
proposals); `draft-brief` and `POST /ai/brief`; the chat dock's `drafts` store; `chat_messages`
(replaced by `chat_threads`); `kind: "proposal"` (replaced by `confirm`).

## 6. Analytics

The `generation_*` events kept their names and moved to where the state is, with one exception.
Server-side, attributed through the executor's seam: `generation_planned` from `plan-outline`
(`tools/plan.ts`); `generation_outline_edited`, `generation_steered`, `generation_section_built`,
`generation_section_failed` and `generation_completed` from the generation tools
(`tools/generation.ts`), so an edit from the agent, the board or MCP is measured the same way.
Client-side: `generation_intake_opened` and `generation_abandoned` (only the client knows a
studio was opened or closed), and `generation_build_started`, captured at the board's run buttons
with the mode (`all` or `one`) the person chose.

## 7. Not taken

- Merging `SectionOp` and `PatchOp` into one vocabulary; they meet in `toSectionOps` instead.
- Whole-artifact `revise-artifact`: defined and priced in the catalog, no prompt builder.
- Output schemas on the MCP surface.
- The `edit` turn's whole-artifact revision as a composite over `revise-outline` and
  `rewrite-section`; the 501 route it would have replaced is gone with the turn kinds, and the
  composite was never designed.
