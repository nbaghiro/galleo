# Planning: the generation as a resource, and every AI action as a tool

> Today the tool catalog and the executor serve the chat agent, the direct routes, MCP and the REST
> API from one registry, but the generation flow runs beside that spine rather than on it. The
> studio's brief, outline, steer and build loop live only in the browser store, and the chat tools
> that touch them are hand-built proposals with no server body. This plan makes the generation a
> server-side resource, widens the tool patch to address it, and turns every studio action into a
> catalog tool, so the studio, the chat dock, the studio console, MCP and the API all drive the same
> thing through the same calls.

Status: built 2026-09-02, all six slices, awaiting manual QA. The current-state sections have been
folded into `ai.md` (§3, §5 to §8, §11 to §13) and `mcp.md` (the executor, the tool surface, the
effect path). This file stays until QA signs off and is then deleted, per `../README.md`. Where this
file and `ai.md` disagree, `ai.md` describes what shipped.

Companion docs: `../ai.md` (the turn protocol, the catalog, the credit gate, the studio as built),
`../mcp.md` (the executor, the delegated call, the effect path, the widget), `../collab.md` (the
`seq` ordering and the edit lease this reuses), `../analytics.md` (the `generation_*` events).

## 1. What we are building

One resource, one patch type, one executor, one streaming envelope.

1. A `Generation` row that holds what the artifact cannot: the brief with who set each field, the
   outline, the standing steer note, per-beat status and the alternate takes. The draft artifact is
   created when the generation starts, so a piece exists from the first call.
2. The tool `Patch` widened from "a list of artifact ops" to an object that can address the
   artifact, the generation and the workspace at once, applied by one pure function on both sides.
3. The studio's actions as catalog tools: start, plan, revise the brief, revise the outline, steer,
   write one beat, write many, pick a version, read, finish. The board's buttons and the agent's
   cards call the same tools.
4. The streaming route dispatching on a tool id rather than a turn kind, with the executor applying
   and persisting each tool's patch and echoing it on the stream.
5. The agent's toolset derived from the catalog through an availability predicate and a confirm
   policy, one persona with fact blocks, and a persisted thread whose pending proposals the agent
   can apply by id.
6. The same tools over MCP and the API, so an external client can plan, edit an outline and write
   beats one at a time, and the widget can paint progress by polling a read.

## 2. What exists today

Everything below was read from the code on 2026-09-02, not from the docs, because the docs have
drifted in several places noted as we go.

### 2.1 The spine is unified and guarded

`model/tools.ts` defines 58 tool ids with tier, surfaces, effect, scope, price and a live flag. 38
have server bodies registered through `implement()` in `services/core/ai/tools/*.ts`. Five are
`kind: "proposal"` and have no body by design: `propose-generation`, `revise-outline`,
`steer-sections`, `request-write`, `request-plan`. Fifteen have no body at all; six of those are live
and priced and are reserved by string literal in routes (see 2.7), one is the chat turn itself, and
eight are planned.

One executor, `runTool` in `services/core/ai/execute.ts`, does the surface check, the scope, the
entitlement, the schema parse, the reserve and the settle. Three callers use it: `runDirect` in
`services/api/ai.ts`, the agent's `wrap()` in `services/core/ai/chat.ts` with `holds: "caller"`, and
`callDelegated` in `services/core/delegated.ts` for MCP and the v1 API. `scripts/check-tools.ts`
fails a route that imports a tool body or reserves by tool id outside an allow list. This part is
sound and this plan keeps it.

### 2.2 The streaming route dispatches on turn kinds, not tools

`POST /ai/turn` reads a `TurnKind` and `runTurn` in `services/core/ai/run.ts` switches on it.
`generate` wraps the `generate-artifact` tool and `plan` wraps `plan-outline`. `build` is `runBuild`,
which has no tool identity and is billed as `add-section` through `ACTION_FOR`. `section` is
`runSection`, which repeats the plan-then-write composition that `chatAddSection` in
`tools/section.ts` also implements, one streaming and one draining. `chat` is `runChat`. `edit`
answers 501. None of these go through the executor; the route reserves by turn kind itself, which
is why `services/api/ai.ts` is on the guard's allow list.

The consequence is that "write one planned beat" cannot be reached by the agent, by MCP or by the
API. The agent's `request-write` proposal exists only to hand that request back to the browser.

### 2.3 The generation lives in the browser

`app/stores/generate.ts` owns the stage machine, the brief, the outline, the steer, the slots with
their versions, and the build loop. Nothing on the server knows a run exists. `saveDraft` returns
early without a `draftId`, and `draftId` is set only by `saveGenerated`, which runs at finish or on
"Open in editor". `ai.md` says the draft is persisted at build start; the code does not do that,
and closing the studio mid-build loses the built sections behind a discard warning.

The steer note is threaded into every build turn but has no control on the board; only a chat block
sets it. Three differently labelled buttons ("Pause", "Stop", "Stop to chat") call `pauseBuild`. The
"tone check" `ai.md` describes does not exist.

### 2.4 The brief is three mechanisms

The planner emits its own reading of the brief on the `plan` event as `BriefRead`, and `absorbRead`
fills only the fields the user left blank. The brief bar's "read it again" calls `POST /ai/brief`,
the `draft-brief` tool, and `redraftBrief` overwrites goal, audience, tone and must-cover wholesale,
so it can erase typed values. Format, length, image source, theme, shape and contexts are intake
signals passed once at `startSession` and cannot change afterwards; `setBriefField("length")` has
no caller.

Editing a brief field after the outline exists sets `briefDirty`, which `startPlan` never clears,
so after one reroll the "planned against an older brief" hint is permanent for the session.
`applyBeatOps`, the agent's outline edits, sets the same flag, so the agent changing the outline
reads as the user having changed the brief. The agent on the generate surface has no tool that
edits the brief; `request-plan`'s guidance is appended to `clarifications` as a "Shaping note", a
different slot from the fields the user edits.

A fourth brief exists in the chat dock. `BriefCard` in `app/views/ChatPanel.tsx` runs
`generateFromBrief` in `app/stores/chat.ts`, a one-shot `generate` turn into an in-memory `drafts`
store with its own persist path, and never opens the studio.

### 2.5 The agent toolset is hand-assembled

`services/core/ai/chat.ts` builds its toolset from about 25 named imports with per-surface
conditionals in code, plus five local `tool()` closures for the generate surface. `toolsFor("agent")`
is used only by the MCP layer and the guard, so the catalog's surfaces column is not what the agent
receives: `write-speaker-notes` is declared agent-reachable and never offered. Presentation, the
`present` mapper from result to `ChatBlock`, lives in the same file. Three system prompts in
`prompts/chat.ts` re-describe every tool in prose, so a tool's purpose is written three times.

History reaches the model as text only; widgets are not replayed. The model cannot see what it
proposed, which is why the `approved: true` re-call convention exists and why it depends on the
model re-emitting a full payload. The thread is a module-level store, lost on reload, with no
server id; `chat_messages` records text for recall only. Of the 26 agent eval cases in
`services/core/ai/eval/cases.ts`, 22 are library surface, 4 are editor, none are generate.

### 2.6 The delegated surfaces work, and only create one-shot

`callDelegated` resolves the workspace, loads the artifact, runs the tool through the executor with
the grant's scopes, applies the tool's `patch` mapper through `services/core/ai/effects.ts` and
commits, or performs a `WorkspaceAction` server-side. Nineteen tools are exposed. The only way to
make a piece is `generate-artifact`, which runs to completion inside one call.

### 2.7 Spend outside the executor

Six live priced tools have no body and are reserved by literal in routes: `narrate-artifact` and
`compose-soundtrack` in `services/api/narration.ts` and `services/core/prepare.ts`,
`audition-voice` and `design-voice` in `services/api/voices.ts`, `generate-video` in
`services/api/media.ts`, `read-file` in `services/api/context.ts`. `POST /media/generate` reserves
`generate-image` itself although a `generate-image` tool body exists, and the turn route carries a
third copy of the generate-and-store closure. All of it is on the guard's allow list, so it is
known rather than accidental, and it is out of the critical path of this plan (slice 6).

## 3. Decisions

The generation is a server resource. The alternative was to keep the session in the browser and
formalise the five proposal tools as a client-applied `OutlinePatch`. That leaves MCP and the API
unable to plan and write step by step, leaves a refresh losing built work, and keeps the brief with
no owner. We take the larger change now because we are early and the two paths would otherwise be
maintained in parallel.

`Patch` is widened rather than replaced by a new noun. The registry already names its mapper
`patch`, and the documented meaning, "a structural mutation the client applies", is what we want
for all three targets. We considered `Effect` (a second noun beside `Patch`, and the registry field
renames), `Change` (says nothing in a type name) and `Ops` (the atom's name used for the bag). The
cost of widening is the migration of `Patch` from an array to an object, which touches every
`applyPatch` caller and the proposal block; we accept that.

The resource is a `Generation`. The surface is already `generate`, the analytics events are
`generation_planned`, `generation_build_started`, `generation_completed`, `generation_abandoned`,
the store is `gen`, and the chat context field is `generation`. We considered `Run` (collides with
the `eval_runs` table and with run as the executor's verb in `runTool`, `runTurn`, `runChat`),
`Build` (already means the write phase, so a plan stage inside a Build contradicts the vocabulary),
`Draft` (collides with `artifacts.draft_content`, which stays), `Session` (the auth session) and
`Commission` (no collisions, but not the repo's register).

Confirmation is a property of the surface, not of the tool. Each tool carries a confirm policy that
only the in-app agent surface reads; direct routes, MCP and the API apply immediately as they do
now. The `kind: "proposal"` category and the five closures in `chat.ts` go away.

`generate-artifact` stays, as a composite of the same tools run to completion. It is right for an
MCP or API caller that wants a finished piece in one call and for a "build it now" that skips the
outline stop. The library agent stops reaching for it by default, because a card that plans first
costs the same and keeps every intervention point.

The brief has one owner, the generation row, with per-field provenance. `draft-brief` and
`POST /ai/brief` are retired: the planner reads the brief on every plan, the user overrides by
typing, and a different reading is something the agent produces by calling `revise-brief`.

The chat dock's one-shot draft path is retired. Starting a generation is the one way to make a
piece, and the dock's card is a compact view of it.

Pause is closing the stream. The server lets the in-flight beat finish on its own signal, persists
it, and stops before the next one. A paused run and a dropped connection then behave identically,
and a reopened studio reads the row. We considered an explicit pause op on the generation; it adds
a state the client and the server can disagree about, and the stream already carries the intent.

One writer per generation at a time. A second write while one is in flight is refused, the same way
the collaboration edit lease refuses a second editor on one element.

## 4. Data model

### 4.1 The generation

```ts
interface Generation {
    id: string;
    workspaceId: string;
    artifactId: string; // the draft artifact, created at start
    stage: "briefed" | "planning" | "outlined" | "writing" | "done";
    brief: Brief;
    briefVersion: number;
    outline: PlanOutline | null;
    plannedAgainst: number | null; // the brief version the outline came from
    steer: string;
    beats: Record<string, BeatState>;
    seq: number;
}

interface BeatState {
    status: "queued" | "writing" | "done" | "failed" | "skipped";
    versions: Section[]; // every take kept
    active: number; // the one that is the section of record
}
```

A `generations` table: `id · workspace_id · artifact_id · created_by · stage · brief (jsonb) ·
brief_version · outline (jsonb) · planned_against · steer · beats (jsonb) · seq · created_at ·
updated_at`. Indexed on `(workspace_id, artifact_id)`. Versions ride in `beats` as jsonb; a piece
has at most a few dozen takes and they are read together with the row. If that grows, they move to
their own table without changing the type.

The section of record stays in `artifacts.draft_content`, landed by ordinary artifact ops. The
generation never duplicates it; `versions` holds the takes, and `active` names which one the
artifact currently carries. `ai_meta` is written at finish as today, from the row rather than from
the browser.

The `stage` values name states rather than activities, which is what a row can hold: `briefed`
before the first plan, `outlined` when a plan exists, `writing` while any beat is queued or in
flight, `done` after finish. "planning" is the one activity kept as a stage, because a client that
reconnects during it needs to know a plan is coming.

### 4.2 The brief with provenance

```ts
type BriefField = keyof GenerateInput;

interface Brief extends GenerateInput {
    set: Partial<Record<BriefField, "user" | "planner">>;
}
```

`setBrief` with `by: "user"` writes the field, marks it, and bumps `briefVersion`. `setBrief` with
`by: "planner"` writes only fields not marked `user` and does not bump the version. That is the
current `absorbRead` rule with the two merge policies collapsed into one, and it is what lets a
reroll fill gaps without clobbering what was typed. The bar shows "planned against an older brief"
exactly when `plannedAgainst < briefVersion`, and a new plan clears it by construction.

A clarifying question, when the planner has one, rides on the outline result and is answered
through `setBrief` on `clarifications`.

### 4.3 The patch, widened

```ts
interface Patch {
    artifact?: PatchOp[];
    generation?: GenerationOp[];
    workspace?: WorkspaceAction;
}

type GenerationOp =
    | { op: "setBrief"; patch: Partial<GenerateInput>; by: "user" | "planner" }
    | { op: "setOutline"; title: string; backdrop?: string; beats: Beat[]; plannedAgainst: number }
    | { op: "addBeat"; afterId: string | null; beat: Beat }
    | { op: "updateBeat"; id: string; patch: Partial<Beat> }
    | { op: "removeBeat"; id: string }
    | { op: "moveBeat"; id: string; afterId: string | null }
    | { op: "setSteer"; note: string }
    | { op: "setBeat"; id: string; status: BeatState["status"] }
    | { op: "pushVersion"; id: string; section: Section }
    | { op: "pickVersion"; id: string; index: number }
    | { op: "setStage"; stage: Generation["stage"] };

function applyPatch(
    state: { content?: ArtifactContent; generation?: Generation },
    patch: Patch,
): typeof state;
```

An object with optional targets rather than a union, because one tool often changes two things at
once: writing a beat adds a section to the artifact and marks the beat written on the generation,
and the two must land together. `applyPatch` stays pure in `@model/ai`. The existing `PatchOp`
vocabulary and its `applyOp` are the artifact half unchanged; the four `BeatOp`s already in the
model become four of the `GenerationOp`s. `WorkspaceAction` is carried, not applied, by the pure
function; performing one is the server's job in `delegated.ts` and the client's in `chat.ts`, as
today.

The REST write path has its own `SectionOp` vocabulary in `model/artifact.ts` beside `PatchOp`.
Merging those two is worth doing and is not this plan.

### 4.4 The thread and its proposals

```ts
interface ChatThread {
    id: string;
    workspaceId: string;
    artifactId: string | null;
    generationId: string | null;
    messages: ChatMessage[]; // role, text, blocks, tool calls and their results
}

interface PendingProposal {
    id: string; // what the agent names in apply-patch
    tool: ToolId;
    input: unknown; // for a `before` policy: the call to run
    patch?: Patch; // for an `after` policy: what ran and waits to be applied
    summary: string;
    state: "pending" | "applied" | "discarded";
}
```

A `chat_threads` table replaces the recall-only `chat_messages`. The thread is keyed to the
generation when there is one and to the artifact otherwise, which is the same key recall uses
today. This is slice 5; slices 1 to 4 do not depend on it.

## 5. The tool set

| tool                | tier            | policy | cost              | what it does                                                                         |
| ------------------- | --------------- | ------ | ----------------- | ------------------------------------------------------------------------------------ |
| `start-generation`  | action          | before | free              | brief in, generation id out; creates the row and the draft artifact                  |
| `plan-outline`      | primitive, live | before | plan              | plans the arc onto a generation; sets outline, planner brief fields, backdrop, stage |
| `revise-brief`      | action          | never  | free              | sets brief fields as the user; bumps the version                                     |
| `revise-outline`    | action          | after  | free              | add, update, remove, move beats                                                      |
| `steer-generation`  | action          | never  | free              | the standing note for beats still to write; empty clears                             |
| `write-beat`        | composite       | before | 1 section         | writes one planned beat, or reworks it with a note when `replace`                    |
| `write-beats`       | composite       | before | n sections        | `write-beat` over the given ids in order; reads state fresh per beat                 |
| `pick-version`      | action          | never  | free              | makes one take the section of record                                                 |
| `read-generation`   | action          | never  | free              | the digest: brief, outline, steer, what is written                                   |
| `finish-generation` | action          | never  | free              | stage done; writes `ai_meta`                                                         |
| `apply-patch`       | action          | never  | free              | applies a pending proposal by id, or a literal patch                                 |
| `generate-artifact` | composite       | before | plan + n sections | start, plan, write every beat, finish                                                |

Two fields join `ToolMeta` in `model/tools.ts`:

```ts
needs?: ("artifact" | "generation" | "library" | "contexts")[];
confirm?: "before" | "after" | "never";   // absent = "after" for a tool with a patch, "never" otherwise
```

`needs` is the availability predicate: a tool is offered to the agent when every named thing is
present in the tool context. The context already carries the artifact, the workspace reader and
the retrieval pack; it gains the generation. The per-surface conditionals in `chat.ts` become
data.

`confirm` is read only by the in-app agent surface. `before` proposes the call and runs nothing
until the user clicks. `after` runs, and the resulting patch comes back as a proposal with a
preview, applied on click. `never` runs and applies on arrival. The catalog's `kind: "proposal"`
is deleted.

`generate-artifact` becomes `start-generation`, `plan-outline`, `write-beats` over every beat and
`finish-generation`, composed through `ctx.use`. The image pipelining `runGenerate` has today,
where the next beat's model call runs while the previous beat's images resolve, moves into
`write-beats`, so the studio's "write all" gains it and there is one write loop rather than two.

Retired, with what replaces each:

| retired                                                   | replaced by                                          |
| --------------------------------------------------------- | ---------------------------------------------------- |
| `TurnKind`, `runTurn`, `ACTION_FOR`, `IMPLEMENTED`        | the tool id on the streaming route                   |
| `runBuild`, `BuildInput`                                  | `write-beat`                                         |
| `runSection`                                              | `add-section`, which gains the streamed events       |
| `propose-generation`                                      | `start-generation` with `confirm: "before"`          |
| `request-plan`                                            | `plan-outline` offered to the agent                  |
| `request-write`                                           | `write-beat` and `write-beats` offered to the agent  |
| `revise-outline` as a browser proposal                    | `revise-outline` as a server tool                    |
| `steer-sections`                                          | `steer-generation`                                   |
| `draft-brief`, `POST /ai/brief`                           | `revise-brief`, and the planner's read on every plan |
| `ChatContext.generation` (the assembled `ChatGeneration`) | `ChatContext.generationId`; the server reads the row |
| `kind: "proposal"`                                        | `confirm`                                            |
| the chat dock's `drafts` store and `generateFromBrief`    | a generation card over `read-generation`             |
| `chat_messages`                                           | `chat_threads` (slice 5)                             |

## 6. Server

### 6.1 The streaming route

`POST /ai/turn` keeps its path and its SSE framing, and its body becomes `{ tool, input, trace?,
traceSession? }`. It resolves the principal, builds the tool context from the ids in `input`
(`generationId`, `artifactId`) by loading the rows, and calls `runTool` with an `onEvent` that
frames each event as `data: {seq, event}`. The final event carries the result and its patch.
`check:validation` still sees a schema at the boundary: the envelope is validated here, the input
by the tool's own schema in the executor.

### 6.2 The executor applies

After the body returns, the executor calls `tool.patch(result, input)` and, when the surface's
policy says apply, applies it: the generation half through `services/core/generations.ts`, which
runs `applyPatch`, bumps `seq` and persists; the artifact half through `commitContent` in
`effects.ts`, which already bumps the artifact's `seq` and resyncs the collaboration room. The
applied patch is echoed as a `patch` event with the new `seq`. For an `after` policy on the agent
surface the patch is not applied; it is returned in the proposal block and recorded as pending.

`apply-patch` gets its body here: it loads the pending proposal or takes the literal patch, applies
it through the same two functions, and echoes it. A proposal that was `before` runs its recorded
call instead.

### 6.3 `services/core/generations.ts`

Create, read, apply-and-persist with `seq`, and the writer lease: `claimWriter(generationId,
beatId)` and `releaseWriter`, an in-process map as the collaboration room is, refused with a
`busy` outcome the executor turns into a reply the agent can explain. Reads return the `Generation`
whole; `read-generation` derives the digest the prompts print from it, which is `generationState`
in `prompts/chat.ts` moved next to the type it reads.

### 6.4 `write-beats`

For each id in order: read the generation and the artifact fresh, so an outline or steer change
made since the last beat is what this beat is written against; refuse if the beat is already
written unless `replace`; claim the writer; run `write-beat` through `ctx.use`; release. Between
beats it checks the outer signal and stops if it is aborted. The in-flight `write-beat` runs on its
own signal, so a closed stream lets the current beat land rather than losing it. A beat that fails
its three attempts is marked `failed` and the loop moves on, as the client loop does today.

Metered for `n` sections up front, settled to the tokens spent and the images made, so a paused run
pays for what landed. The composite reserves once; `write-beat` reached through `ctx.use` reserves
nothing, which is how composites already work.

### 6.5 The agent

The toolset is `toolsFor("agent")` filtered by `needs` against the loaded context. Presentation
moves out of `chat.ts` into a generic presenter keyed on the patch's targets: an artifact patch is
a proposal with a preview computed by applying it to the section; a generation patch is an outline,
brief or steer card by op kind; a workspace action is an action card; a bare result is a note or a
list. Only a tool that returns several candidates, `suggest-section-layouts`, keeps its own
presenter, declared beside its body rather than in the agent.

The prompt is one persona plus fact blocks for whatever is loaded (the artifact digest, the
generation digest, the library summary) plus the `describe` of each offered tool. The generate
surface's guardrails become tool descriptions and the predicate: `add-section` says it is for a
section that is not in the outline, and `write-beat` says it is for one that is.

History replays tool calls and their results, which the AI SDK supports, so the model can see the
cards it produced. Pending proposals are listed in the context by id, so a spoken approval is one
`apply-patch` call. The six step cap stays until an eval says otherwise.

### 6.6 Metering outside the executor

Bodies for the six live tools reserved by literal today (`narrate-artifact`, `compose-soundtrack`,
`audition-voice`, `design-voice`, `generate-video`, `read-file`), the picker's image route through
the `generate-image` tool, and one function that builds `ImageOptions` for every path. The allow
list in `check-tools.ts` then holds nothing. This is slice 6 and does not block the rest.

## 7. Client

### 7.1 The studio

The store in `app/stores/generate.ts` keeps a mirror of the generation and of the draft artifact's
content, applies the patches the stream delivers, and paints. It stops being the state machine:
`stage`, `beats`, `steer`, `brief` and `plannedAgainst` are read off the mirror, `runLocked` is
derived from `stage === "writing"` and a beat in flight, and the build loop is gone. It keeps the
reveal pacing, the layout audit (which needs the engine), and the optimistic paint for free ops,
reconciled on the echoed `seq`.

The flow, with the tool behind each control:

1. Intake. The composer's settings and attachments become the brief. "Plan the outline" calls
   `start-generation`, then `plan-outline` on the returned id. The draft artifact exists from here.
2. Planning. Narration lines land in the console; `plan.partial` reveals cards with the existing
   pacing; the final patch sets the outline, fills blank brief fields as the planner, records
   `plannedAgainst`, sets the backdrop. Stage becomes `outlined`.
3. Outline. Every board edit is `revise-outline` with one op. Every brief bar edit is
   `revise-brief`. The stale hint reads `plannedAgainst < briefVersion`. Reroll is `plan-outline`.
   The console's cards are the same tools, applied through `apply-patch`.
4. Writing all. "Write all N" is `write-beats` over every unwritten id. The card states come from
   `section.status`, the words-first paint from `section.partial`, the landing from the patch.
5. Pause and stop. Pause closes the stream. "Write the rest" is `write-beats` again. "Skip the rest"
   is `finish-generation`.
6. Writing one. "Write this one" is `write-beat`. Buttons are disabled off `beats[*].status ===
"writing"`.
7. Rework and versions. The refresh icon and the note popover call `write-beat` with `replace`;
   the chips are `versions`; picking is `pick-version`. The audit's fix is `write-beat` with the
   measured issues as the note.
8. Finish. `finish-generation`, then navigate to the artifact.

A closed and reopened studio, a second tab, or a teammate on the same generation all read the row
and apply the same sequence, so they cannot diverge.

### 7.2 The chat dock

With nothing active the agent has the library tools and `start-generation`. A start proposal shows
the brief and the plan's price; clicking runs it, then `plan-outline`, and the card becomes a
compact view of the generation: the outline as it forms, then sections as they land, painted by
the same mini canvas the proposal cards use. The thread now carries the `generationId`, the
generation tools become available, and the conversation is the one the studio console has today.
"Open it properly" navigates to the studio on the same id.

In the editor, `start-generation` is also available with the open artifact as its target, so "plan
and write three more sections on the rollout" makes a generation whose beats append to the open
piece. Same cards, same tools.

The `Console` in the studio renders the same thread and has no code of its own beyond the gate on
`runLocked`.

### 7.3 The widget

Over MCP a client starts a generation, plans, revises and writes beats one at a time through
`callDelegated`, with the policy ignored and every result naming the generation id and its `seq`.
The widget polls `read-generation` and the artifact and paints progress with the real engine, which
is the pattern `mcp.md` describes and could not have while the generation lived in a browser.

## 8. Analytics

The `generation_*` events keep their names and move to where the state is. `generation_planned`
fires from `plan-outline`, `generation_build_started` from `write-beats` and `write-beat`,
`generation_section_built` and `generation_section_failed` from `write-beat`, `generation_completed`
from `finish-generation`, all server-side and attributed through the executor's `ai_action_*`
seam. `generation_outline_edited` and `generation_steered` fire from `revise-outline` and
`steer-generation`, so an edit from the agent, the board or MCP is measured the same way.
`generation_abandoned` stays client-side, since only the client knows a studio was closed;
`generation_intake_opened` likewise. Delegated calls are already captured by `callDelegated`.

## 9. Testing

Unit, in `model/__tests__`: `applyPatch` over every `GenerationOp`, the provenance rule for
`setBrief`, and the invariant that an artifact op and a generation op in one patch land together.

Unit, in `services/core/ai/__tests__`: the executor applies for `never` and `direct`, proposes for
`after` on the agent surface, records a `before` proposal without running; `apply-patch` runs a
recorded call and applies a recorded patch; `write-beats` stops between beats on abort and lets the
in-flight beat finish; the writer lease refuses a second writer.

Integration, in `services/core/__tests__`: `generations.itest.ts` for create, apply with `seq`, and
the draft artifact created at start; `delegated` plans and writes a beat through `callDelegated`.

Contract, in `tools/__tests__/contract.test.ts`: every tool with `needs` names things the context
can carry; every tool the agent surface offers has a `confirm`; `toolsFor("agent")` filtered by a
context equals what the agent receives.

Eval, in `services/core/ai/eval/cases.ts`: generate-surface cases, absent today. Plan from a brief;
move a beat; write two named beats and not `add-section`; steer and then write; approve a pending
proposal in words.

End to end, in `e2e/ai/ai.spec.ts`: from the library chat, start a generation, plan, write one beat,
open in the studio and see the same board.

Guards: `check:tools` gains "every tool the agent surface offers has a `confirm`", and its allow
list empties in slice 6. `check:validation` covers the new route body.

## 10. Build order

Each slice ships on its own and leaves the product working.

1. The model. `Generation`, `Brief`, `GenerationOp`, the widened `Patch`, `applyPatch` over both
   halves, `needs` and `confirm` on `ToolMeta`. Every existing `applyPatch(content, ops)` caller
   migrates to the object form. Proof: the model tests, and nothing else changes behaviour.
2. The resource and the tools. `generations` table and `services/core/generations.ts`;
   `start-generation`, `revise-brief`, `revise-outline` as a server tool, `steer-generation`,
   `write-beat`, `write-beats`, `pick-version`, `read-generation`, `finish-generation`,
   `apply-patch`; `plan-outline` gains its patch; `generate-artifact` recomposed. The executor
   applies patches by policy. Proof: the integration tests, and `generate-artifact` over MCP still
   works end to end.
3. The route. `POST /ai/turn` takes `{ tool, input }`; `TurnKind`, `runTurn`, `runBuild`,
   `runSection`, `ACTION_FOR` and `IMPLEMENTED` are deleted; `add-section` streams. The studio store
   becomes a mirror and every control calls a tool; the chat dock's one-shot path is deleted and
   its card becomes a generation view. Proof: the studio flow in `e2e`, and a refresh mid-build that
   loses nothing.
4. The agent. Toolset from the catalog through `needs`; the generic presenter; one persona with
   fact blocks; the five closures deleted; `draft-brief` and `POST /ai/brief` deleted. Proof: the
   generate-surface eval cases pass at the current rate for the library cases.
5. Memory. `chat_threads` with blocks and tool calls; pending proposals by id; history replayed
   with tool results; the `approved` re-call convention removed from the prompts. Proof: the
   spoken-approval eval case, and a reload that shows the thread.
6. Metering. Bodies for the six literal-reserved tools; the picker through `generate-image`; one
   `ImageOptions` builder. Proof: the `check:tools` allow list is empty.

Docs are rewritten as each slice lands rather than at the end: `ai.md` sections 3, 7, 8, 11 and 12
after slice 3 and 4, `mcp.md` "One executor, three transports" and "The effect path" after slice
2, and the planned lists in both once slice 5 ships.

## 11. Open decisions

Whether `start-generation` and `plan-outline` merge into one call from the intake. Two calls keep
the free start separate from the metered plan and let a client start, revise the brief, then plan;
one call is one fewer round trip. We lean to two.

Whether `write-beats` should keep the client's per-beat retry as a second turn. With the loop on the
server, a beat that fails its three attempts inside `write-beat` has already been retried; a second
whole call is probably not needed, and the failed card keeps its Write button either way.

Whether the writer lease is per generation or per beat. Per generation is simpler and matches
"sections are written with the ones before them on the page"; per beat would allow the agent to
rework one section while the loop writes another. We start per generation.

Whether the chat thread is one per generation or one per person per generation. Collaboration on a
generation is real once the row is shared; the thread key decides whether two people see each
other's cards. We start with one per generation and revisit with `collab.md`.

## 12. Out of scope, stated

Prompt quality and the section writer's rules (`generation-quality.md`). Section-write streaming and
the image provider race (`generation-performance.md`). Merging `SectionOp` and `PatchOp`. Output
schemas on the MCP surface. The `edit` turn's whole-artifact revision, which becomes a composite
over `revise-outline` and `rewrite-section` once this lands and is not designed here. Anything in
the engine.
