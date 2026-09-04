# AI — technical guide

How every AI capability in Galleo works end to end: the **tool envelope** and the **patch** every surface
speaks, the **generation** as a server-side resource, the single **tool catalog** (identity, availability,
confirm policy, pricing), the **one executor** every call runs through, the **chat / workspace agent**, the
**HTTP routes**, the **prompt playbook**, the **stored thread**, and the **client** that mirrors it all.

Companion to `architecture.md` (the file map, layering law + credits/billing), `rendering.md` (the content
tree + element system the AI writes), `frontend.md` (the client shell that speaks the protocol), and
`testing.md` (the AI test + eval suites). Where this doc says "the element tree", the shape lives in
`rendering.md` — it is not duplicated here.

## 1. The map

```
model/                         the PURE contract (edge-safe; imports nothing above model)
  ai.ts        the tool PROTOCOL: the streamed events · the Patch (artifact ops + generation ops + a
               workspace action) and applyPatch · the Generation resource (Brief with per-field
               provenance, outline, steer, per-beat state) · the chat blocks and the stored thread
  tools.ts     the ONE tool catalog: identity, tier, surfaces, availability (needs / without), the
               confirm policy, pricing, and TOOL_SPEC (the agent-facing describe + zod input per tool)
  credits.ts   the metered-credit engine: the Usage bag, costOf, the AiTask steps and their multipliers
  trace.ts     the record of one tool call: the tool and model spans, the level, the status, the cost;
               eval.ts holds only the verdicts about a run (checks · judgements · the rubric)

services/core/ai/                   the runtime (depends only on model; may NOT import canvas)
  execute.ts   runTool: the one envelope around every call (surface · scope · entitlement · schema ·
               the generation it acts on · the writer lease · the credit hold · applying its patches)
  tools.ts     the registry: Tool<I,R>, ToolContext, GenerationStore, implement(), offeredTo()
  tools/       one file per capability; generation.ts holds the studio's tools, generate.ts the
               one-shot composite over them, register.ts imports them all for the side effect
  chat.ts      the agent: a ToolLoopAgent whose toolset is offeredTo(ctx), run as the ask-assistant tool
  models.ts    the model registry (`provider:model` ids + DEFAULT_MODELS per task; see check:models)
  provider.ts  resolveModel(id) → a Vercel AI SDK LanguageModel; aiReady(); thinklessOpts
  schema.ts    the Zod output schemas: zOutline · zSectionPlan · zSection · zElement · zTheme · …
  quality.ts   the section audit;  text.ts  rewriteText / translateText;  tasks.ts  the one-shot calls
  prompts/     the pure prompt-string builders (see §10)
  eval/        the traced-run harness; it runs tools through the same executor with a memory store

services/core/
  generations.ts   makeGenerationStore (rows in `generations`, the draft in `artifacts`) +
                   memoryGenerationStore (tests, evals) + runMeta
  threads.ts       the stored chat thread per subject: compactEvents · loadThread · appendExchange
  traces.ts        the tracer: opened by the executor around every call, fed by the meter and the
                   hold, kept per workspace under a cap; the DB store and the in-memory one
  effects.ts       load / apply / commit an artifact for a caller with no browser
  delegated.ts     the one call MCP and the REST API make; patches come out of the executor's outcome
  spend.ts         reserve(): the credit hold the executor takes, and where every metered call is measured

services/api/
  ai.ts        POST /ai/turn {tool, input}: the streaming envelope for any tool; the JSON one-shots
  chat.ts      GET · POST mark · DELETE /chat/thread: the stored thread
  media.ts · narration.ts · voices.ts · context.ts   run their tools through runTool as well
  middleware.ts   streamRun: hold first, then open the stream, so a refusal is still a status

editor/ + app/                 the client (thin: speaks the protocol, never the model)
  app/api.ts                   streamTool (SSE reader) + the JSON transports
  app/stores/generate.ts       the studio: a MIRROR of the generation, kept by applying patch events
  app/stores/chat.ts           the dock: the thread, the reducer, the GenerationHost seam
  app/views/generate/          the studio shell; app/views/ChatPanel.tsx the dock
  editor/core/store.ts         injected seams: onSectionStream · onSuggestSections · onReviseElement · onTextAssist
```

## 2. The three invariants that decide the shape

1. **`services` may not import `canvas`** (ESLint: `model ← canvas ← editor ← app`; `services → model`
   only). The live element registry lives in `canvas`, so the backend can't introspect it — the AI's whole
   content contract is therefore declared by hand rather than introspected: the turn protocol and tool
   catalog in **`model/`** (`ai.ts` + `credits.ts`), the element vocabulary and Zod schemas next to the
   prompts that use them (`services/core/ai/prompts/catalog.ts` + `services/core/ai/schema.ts`).
2. **The AI writes content, never layout.** It emits the element tree (`{ type, data }` per element, a
   `layout.width` per column child); the engine renders that identically to deck / doc / web and to PDF. The
   AI never touches pixels — see `rendering.md`.
3. **The seam is the tool call.** Every AI action is a catalog tool, every caller reaches it through one
   executor, and every surface reads the same `TurnEvent` stream and applies the same `Patch`. The client
   only ever parses events and applies patches; swap the model or a prompt and nothing on the client changes.

## 3. The tool envelope and the patch (`@model/ai`)

Every AI action is a **tool** in the catalog (§5), and a request from any surface is a tool call:
`{ tool, input }`. The runtime answers a streamed call with an ordered stream of **events**; some
events carry **patches**, which one pure function applies to the same state on both ends.

**The patch.** A `Patch` addresses three things at once, any of which may be absent:

```ts
interface Patch {
    artifact?: PatchOp[]; // the content tree
    generation?: GenerationOp[]; // the run: brief, outline, steer, beats, versions, stage
    workspace?: WorkspaceAction; // rename / move / share / export … (the client routes these)
}
applyPatch({ content, generation }, patch); // pure; applyContentOps + applyGenerationOps under it
```

`PatchOp` is the content vocabulary (`setMeta · addSection · replaceSection · removeSection ·
moveSection · replaceElement · setSectionBackground`), each with a structural inverse, so the same
ops power streaming, surgical edits, history and undo. The REST write and the collaboration room
speak `SectionOp` (`@model/artifact`), which names how the stored document moves rather than what
changed; `toSectionOps(before, patch)` is where the two meet, and every server-side landing of a
patch (`commitPatch`) goes through it, so a tool's effect reaches the room as ops. `GenerationOp` is the run's vocabulary:
`setBrief` (with `by: "user" | "planner"`, which is how the brief remembers who set each field),
`setOutline` and the beat ops (`addBeat · updateBeat · removeBeat · moveBeat`), `setClarify`,
`setSteer`, `setBeat` (status), `pushVersion` / `pickVersion`, `setStage`.

**The generation.** A `Generation` is the server-side record of a run in progress, and the thing the
studio, the chat dock, MCP and the API all act on by id:

```
id · workspaceId · artifactId         the draft artifact is created with the generation
stage          briefed → planning → outlined → writing → done
brief          GenerateInput + `set`: which fields a person set and which the planner filled
briefVersion · plannedAgainst         the outline is stale when they differ
outline        { title, backdrop?, beats[] } | null
steer          the standing note every later section follows
clarify        the one question the planner may ask, or null
beats          per beat: versions[] · active · status (queued | done | failed | skipped)
seq            bumped per applied patch; the client echoes it to know it is current
```

The artifact holds what a reader needs; the generation holds what only the run needs. Finishing a
generation stamps `runMeta` on the artifact, which is the shape the studio used to write itself.

**Events.** `TurnEvent`, a discriminated union the runtime yields and the client dispatches:

```
turn.start   { tool }                              a call began
phase        { name }                              intake → outline → build → compose → done
narration    { text, sub?, mono? }                 a human progress line
plan         { beats[], title?, backdrop? }        the outline (plan.partial while it streams)
section.status { id, status }                      active → writing → image → done
section.partial { id, section }                    a section still being written
patch        { patch, seq? }                       apply this; seq is the generation's after it
section.audio { id, ms, cached, chars }            one narrated section landed
media        { item } · media.failed { reason? }   one generated picture or clip, or not
chat.thinking { label? }  chat.text { delta }      the agent's reasoning headline / prose
chat.tool    { blockId, tool, title, done? }       a tool shell opened, then closed
chat.nested  { blockId, event }                    a tool's own progress, forwarded to its shell
chat.block   { blockId, block }                    a finished card (see below)
turn.done    { summary?, result? }                 success, with the tool's typed result
error        { message }                           failure
```

**Chat blocks.** `proposal` is the one card that carries work: `{ id, tool, summary, cost?,
call?: { input }, patch?, preview?, targetArtifactId?, theme?, format? }`. A card with a `call` is a
tool the agent offered and did not run (`confirm: "before"`); pressing it runs that tool. A card
with a `patch` is a tool that ran and whose change waits for approval (`confirm: "after"`); pressing
it applies the patch. `generation { generationId }` tells the dock a run started, so it can adopt it
into the studio; `applied { proposal }` retires a card the agent applied on a spoken approval;
`action { action, confirm }` is a workspace verb the client runs or asks about. The rest
(`suggestions`, `sections`, `artifacts`, `templates`) are pick-lists.

**The chat context.** `ChatContext` names the surface (`editor` · `library` · `generate`) and what
the agent may act on: `content` for the open artifact, `library` for a workspace summary, and
`generationId` for a run in progress, which the executor loads server-side with its draft. The
generate surface exists because mid-run the piece is half planned rather than absent; with only
`content` to look at the agent saw an empty artifact and proposed building a separate one.
`pending` lists the cards still waiting, so "yes, do that" can name one.

**The stored thread.** `ChatThread { key, messages, marks }` is what the dock reopens, per subject:
`threadKey(ctx)` is `generation:<id>`, `artifact:<id>` or `library`. An assistant message stores its
compacted events (§11), so a reopened thread is replayed through the same reducer that painted it.

## 4. The content contract

The AI emits **content only**. A `Section` is `{ id, root, background?, bleed? }` where `root` is **one
recursive element tree** (columns are a `group` with `direction:"row"` whose children carry `layout.width`;
stacking is `direction:"col"`). An element is `{ type, data, layout? }`; containers nest via `data.children`.
The full tree model + the named layout presets (`full · split-6040 · split-4060 · two-col · three-up`, used
as skeleton hints during planning) live in **`rendering.md`**.

Two deliberate simplifications keep LLM output reliable:

- **Charts/diagrams are one element type with a `data.type` discriminant** (`{ type:"chart", data:{ type:
"line", … } }`), not 23 variant element types.
- **Images take a description, not a URL.** The model writes `src:"aerial view of a wind farm at dusk"`; the
  runtime resolves it to a real image URL (§6). A genuine `http…` src passes through untouched.

**Structured output + validation** (`services/core/ai/schema.ts`): Zod keeps the _shape_ honest — an outline is
titled beats (`zOutline`/`zBeat`), a section is `{ id, root }` (`zSection`), an element is `{ type, data,
layout? }` (`zElement`) — while leaving each element's `data` **open** (the prompt, not a rigid schema,
teaches the per-element fields; the element specs tolerate extra/missing keys). The outline runs as
`generateObject`; a section is free-form JSON validated on parse, because Gecko-style response schemas can't
populate arbitrary-keyed `data` maps (§6).

## 5. The tool catalog + pricing (`@model/tools` + `@model/credits`)

**One catalog** names every capability the AI has and carries its pricing. There is no separate
"AI actions" catalog, no turn kind, and no route-private operation: a tool is the priced unit, the
permission unit and the unit of exposure. `ToolId` is a verb-object union; each `ToolMeta` in
`TOOLS` has:

```
id · title · summary                        identity + human copy
tier      composite | action | primitive    whole flow · single call · internal building block
surfaces  agent | direct | mcp | api | internal   where a call may arrive from
needs     generation | artifact | library | contexts   what the context must hold for the tool to be offered
without   generation                        offered only when the context does NOT hold this
confirm   before | after | never            how the agent treats it (§8); direct callers are unaffected
effect · public · requires                  the MCP annotations, the no-account flag, the plan entitlement
category · usage · meter · live · free      PRICING; `free: true` is a decision, not a field left off
```

`availableTo(ctx)` filters the catalog by `needs` / `without`, and the agent's toolset is exactly
that filter over the `agent` surface (`offeredTo` in the registry). A tool that needs a generation
is offered only while one is open, so the studio's verbs vanish from a library conversation, and
`start-generation` is `without: ["generation"]`, so a run in progress never gets a second one
proposed beside it. `confirmFor(id)` reads the confirm policy, which the agent applies uniformly:
`before` offers a card and runs nothing until it is pressed (`generate-artifact`,
`start-generation`, `plan-outline`, `write-beat`, `write-beats`, `trash-artifact`,
`create-artifact`); `after` runs the tool and offers its patch as a card; `never` applies on arrival
(reads, the cheap settings, `steer-generation`, `revise-brief`, `pick-version`, `apply-patch`).
`pnpm check:tools` fails a tool reachable by the agent with no confirm policy.

`usage` is the typical units of work (`{ section: 12, image: 3, … }`); `meter(m)` is the
size-scaling function for metered tools; both price through `usdOfUsage` in `@model/credits`. An
unpriced tool takes the free branch in `reserve()`, which returns a settle that never calls
`owed()`, so a body that reaches a provider would burn tokens nobody is billed for. `pnpm
check:tools` fails when a tool with a registered body declares neither a price nor `free: true`.
The pricing helpers (`estimateCost(id, meter)`, `typicalCost(id)`, `isMetered(id)`,
`costRange(id)`, `PRICED_TOOLS`) all live here and key off `ToolId`. The executor's hold (§7) and
the `/pricing` page read straight off this; retune a unit once and the paywall, the showcase, and
every charge move together.

**The catalog is 61 tool ids** (10 composites · 47 actions · 4 primitives), defined once in
`model/tools.ts`; `pnpm check:tools` fails if a route reaches around the executor or the catalog
names a tool it cannot serve. By tier rather than by inventory:

- **Composites** (whole flows, each one call): `generate-artifact` (start · plan · write every beat
  · finish, for a caller that wants the piece in one call; `direct`, `mcp` and `api` only, never the
  agent, which builds beat by beat with the tools below) · `write-beats` · `write-beat` ·
  `add-section` · `rewrite-section` · `edit-artifact` · `suggest-section-layouts` ·
  `revise-element` · `revise-artifact` · `ask-assistant` (the agent turn itself).
- **The generation's actions**: `start-generation` · `plan-outline` · `revise-brief` ·
  `revise-outline` · `steer-generation` · `pick-version` · `read-generation` ·
  `finish-generation` · `apply-patch`. Every one is free except `plan-outline`, `write-beat` and
  `write-beats`, so an abandoned outline costs the plan and an unwritten beat costs nothing.
- **Content and structure edits**, the workspace verbs (`find-artifacts` · `read-artifact` ·
  `rename-` / `move-` / `duplicate-` / `trash-` / `restore-artifact` · `create-folder` ·
  `share-artifact` · `export-artifact` · `create-artifact` · `list-workspaces` · `find-templates`),
  the text tools, the media and speech calls (`generate-image` · `generate-video` · `reimage` ·
  `narrate-artifact` · `compose-soundtrack` · `audition-voice` · `design-voice`), `read-file`,
  `refine-prompt`, `search-context`.
- **4 primitives** (internal building blocks, reached only through `ctx.use`): `plan-section` ·
  `write-section` · `check-section` · `pick-arc`.

**Pricing: metered, not flat.** Cost = Σ of the primitive **units of work** an action produces,
priced at the provider's list price for the model that runs it and converted at `CREDIT_USD`
(`@model/credits`, 0.0025 USD per credit). The per-unit credits below are what the default models
cost today; they move when a model or its price does:

```
plan 8   ·   section 7   ·   text 3   ·   theme 8   ·   image 28 (per AI-generated variation)   ·   reply 8
```

`creditsForUsd` floors at 1 so nothing metered is free. `estimateCost(id, meter)` is what the
executor reserves and the UI previews. The live, priced tools and their typical cost:

| tool                                                | usage (base)           | typical           | notes                                                            |
| --------------------------------------------------- | ---------------------- | ----------------- | ---------------------------------------------------------------- |
| `generate-artifact`                                 | `{plan:1,section:12}`  | 58 / 95 / 138     | Short / Standard / Long with stock images; AI images add 28 each |
| `plan-outline`                                      | `{plan:1}`             | 8                 | the outline, priced whether the run goes on or not               |
| `write-beat` / `write-beats`                        | `{section:1}` per beat | 7 per beat        | sized off the generation by the executor                         |
| `add-section` / `rewrite-section` / `edit-artifact` | `{section:1}`          | 7                 | one section written                                              |
| `revise-element`                                    | `{text:2}`             | 6                 | one element reworked                                             |
| `rewrite-text` / `translate-text`                   | `{text:1}`             | 3                 | one run, latency-sensitive                                       |
| `generate-theme`                                    | `{theme:1}`            | 8                 | one token system (+ deterministic finalize pass)                 |
| `generate-image`                                    | `{image:1}`            | 28 (× variations) | AI image; metered per variation                                  |
| `ask-assistant` (chat)                              | `{reply:1}`            | 8 + sub-tools     | base reply; the tools it runs bill on the same hold (§7)         |

Metered but **not yet `live`** (priced in the catalog, no route surfaced): `revise-artifact`
(12–40), `translate-artifact` (5–40), `suggest-title`, `write-summary` / `write-alt-text`. All
workspace reads and management tools, and every generation action but the three above, are free.

## 6. The tools registry (`services/core/ai/tools.ts` + `tools/`)

The executable half. `implement(id, run, { patch?, present?, note? })` binds a body to an id the
catalog already defines, and throws at import for an id it does not, or for a reachable tool with
no `TOOL_SPEC` entry, so a definition and its implementation cannot drift apart unnoticed. A body
**yields progress and returns a typed result**:

```ts
run(input, ctx): AsyncGenerator<TurnEvent, Result>
```

A body changes state only by yielding a `patch` event, or by returning a value the tool's `patch`
mapper turns into one. It never writes a row: the executor applies every patch through the
`GenerationStore` as it is yielded (§7), which is what lets the same body run against the
database in production, the in-memory store in a test, and the eval harness, unchanged. The three
optional hooks are the tool's say over how the agent shows it: `present` maps a result to chat
blocks (absent = the generic presenter, §8), `note` is the one line the model reads back.

`ToolContext` is what a body may see and use: `artifact` (and `artifactId` when the server holds
it), `generation` + `generations` (the loaded run and its store), `image` (the picture strategy),
`workspace` + `account` (the DB-backed readers), `principal` (who the call is for, so the chat body
can run its sub-tools through the executor), `signal`, `tier` + `models`, `maxSections`, `pack` +
`recall` (retrieval), `pending` (the cards still waiting), and `use(tool, input)`, which runs
another tool with the same context and forwards its events through `yield*`. `offeredTo(ctx)` is
the agent's toolset: `availableTo` over the registered bodies on the `agent` surface.

One file per capability:

- `generation.ts`: the studio's ten tools (§7) and `generationSize`, which sizes a write off the
  generation the executor loaded.
- `generate.ts`: `generate-artifact`, a composite that runs start · plan · write-beats · finish
  through `ctx.use`, so the one-shot path and the studio path write with the same code.
- `plan.ts`: `plan-outline` and `planOutlineFor`, the outline call both of the above share.
- `section.ts`: `add-section` / `rewrite-section` / `edit-artifact`; `element.ts` :
  `revise-element`; `text.ts`: `rewrite-text` / `translate-text` / `rewrite-passage`;
  `structure.ts`: `reorder-section` / `remove-section` / `set-format` / `set-theme`.
- `suggest.ts` · `inspect.ts` · `library.ts` · `manage.ts` · `theme.ts` · `relayout.ts` ·
  `notes.ts` · `context-search.ts` · `files.ts` (`read-file`) · `media.ts` (`generate-image` ·
  `generate-video` · `reimage`) · `audio.ts` (`narrate-artifact` · `compose-soundtrack` ·
  `audition-voice` · `design-voice`).
- `register.ts` imports every file for its side effect; `execute.ts` imports it, so the whole
  catalog is present wherever a call can arrive.

## 7. The executor and the generation (`services/core/ai/execute.ts` + `tools/generation.ts`)

**`runTool(call, principal, opts)` is the one envelope around every call.** The chat agent, the
direct routes, the MCP server and the REST API all go through it, so a tool costs the same,
validates the same and lands the same however it was reached. In order:

```
surface        the catalog lists the surface the call arrived on
scope          a delegated token's grant covers the tool (a session has no scopes and skips this)
entitlement    the workspace's plan carries `requires`, when the tool names one
schema         the tool's own zod input parses the untrusted input; issues come back as bad-input
generation     a `generationId` in the input loads the run and its draft into the context, once
lease          write-beat / write-beats claim the generation's writer lease, or answer `busy`
hold           reserve() for the estimate, sized off the generation for a write; `credits` on refusal
run            drive the body; every yielded patch is applied through the store as it arrives
settle         bill what ran; `produced` reports the flat-priced assets a body made
```

Two options decide who owns what around a call. `holds: "caller"` means an enclosing turn already
reserved: the chat agent's sub-tools run this way, so a chat turn stays on one reservation rather
than one per tool. `apply: false` means the patches are collected and echoed but not persisted,
which is the agent's `after` policy: the change rides on a card and lands only when the user
presses it. `onHeld` fires once the credits are held and before the body runs, which is how a
streaming route still answers a refusal with a status (§11). The outcome is `{ ok, result,
patches, artifactId?, generationId? }` or a typed refusal (`unknown-tool` · `wrong-surface` ·
`scope` · `entitlement` · `bad-input` · `not-found` · `busy` · `credits`).

A patch is applied the moment it is yielded rather than after the body returns, so a composite
that writes several sections lands each as it comes, and a later beat reads the earlier ones. The
`patch` event the caller sees carries the generation's `seq` after it, which is how the client
knows its mirror is current.

**Every call is traced.** `runTool` opens a trace (`services/core/traces.ts`) before the surface
check and closes it after the settle, so a refusal is a trace with status `refused` and a throw is
one with `error` (or `aborted`). The root is a tool span; a nested `runTool` (the chat agent's
sub-tools) or a `ctx.use` adds a child tool span under it, and every model call the meter records
hangs off whichever tool span is in progress, so the tree reads agent turn → tool → model calls.
The hold reports the settled credits to it, and the executor hands it the parsed input, the
generation and artifact ids, the patch counts, and the artifact as the call leaves it. The level
is decided at close: `metrics` for every call, which keeps the spans without their words, and
`full` for the eval account and for any call that did not end `ok`, which keeps the prompt and
response bodies, the input and the content. The store is registered once by the server entry
(`setTraceStore(traceStore())`), so a unit test that registers nothing traces in memory and drops
it; `TRACE_CAP` rows are kept per workspace, pruned on write. The outcome carries `traceId` when a
store will keep the trace, and `turn.done` carries it to the client, where nothing reads it yet.
Nothing in the product reads the table yet either: the eval playground that used to was removed
with this, and the consumers are the offline harnesses and an analyzer to come (§13).

**The generation's tools.** Ten bodies in `tools/generation.ts`, each free of any storage:

- `start-generation`: creates the row and its draft artifact from a `GenerateInput`, with every
  given field marked `set: user`. Stage `briefed`.
- `plan-outline` (`tools/plan.ts`): the outline call. It yields `setBrief` for the fields the
  planner filled (`by: planner`, never over a user's), `setOutline` with `plannedAgainst` at the
  current `briefVersion`, and `setClarify` when it has one question. Stage `outlined`. Priced.
  The artifact's backdrop image is looked up while the beats are still streaming: the phrase comes
  before the beats in the planner's object, so once it has held across two partials with beats
  present it is complete, and the lookup runs alongside the rest of the stream rather than after
  it. The patch that dresses the board with it goes out with the outline.
- `revise-brief`: a user's edit to a brief field, bumping `briefVersion`, so an outline planned
  against the old brief reads as stale (`briefStale` in the studio) rather than being replanned
  behind the user's back.
- `revise-outline`: the beat ops (`addBeat · updateBeat · removeBeat · moveBeat`) as one patch.
  `after`, so the agent's rewrite of the arc is a card until it is pressed.
- `steer-generation`: `setSteer`, applied on arrival; every beat written after it reads the note.
- `write-beat`: drafts one beat (`draftBeat`: the prompt from brief + outline + steer + the
  sections already landed, the free-form JSON section, the repair loop, the images), then lands it
  (`landBeat`: `pushVersion`, `setBeat done`, and `addSection` after the previous landed beat or
  `replaceSection` on a regeneration; the first landing sets stage `writing`). A `note` rides one
  attempt only. The landing reads the outer context at land time, not draft time, so beats whose
  images were pipelined still land in outline order.
  A write against an outline the brief has moved past (`plannedAgainst` behind `briefVersion`) is
  refused with the replan named, unless the caller passes `force`; the studio passes it, since its
  stale banner is the person's warning.
- `write-beats`: the same for a list of beats, or every unwritten one when none are named, in
  order; a beat that fails after its retry is marked `failed` and the loop moves on, and the run
  stays open with that beat's card still offering Write.
- `pick-version`: `pickVersion` + the matching `replaceSection`.
- `read-generation`: `{ generation, content, writing }`, where `writing` is whether the lease is
  held; the client polls this after a pause to learn when the in-flight beat has landed.
- `finish-generation`: stage `done`, and the store records `runMeta` on the artifact with the
  models that ran. It takes the writer lease like a write, so a stop pressed mid-beat is `busy`
  until the beat lands; the studio waits for that before it finishes.
- `apply-patch`: applies a patch the caller hands in, which is the approval path for an `after`
  card that belongs to a generation.

`generate-artifact` (`tools/generate.ts`) is `start · plan · write-beats · finish` through
`ctx.use`, for a caller that wants the piece in one call: the direct route, MCP, the API. The chat
agent is deliberately not offered it; it starts a generation and builds beat by beat with the same
tools the studio's buttons press, so the person can steer between beats.

**The store.** `makeGenerationStore(workspaceId, userId)` in `services/core/generations.ts` keeps
the row in `generations` and the section of record in the draft artifact's `draft_content`,
bumping `generations.seq` per applied patch and `artifacts.seq` per content change, so the
collaboration room can order the draft's edits. The writer lease is `writer_until` on the row,
claimed with a conditional update, so a second instance refuses the same write; it lapses on its
own, which is what keeps a dead writer from leaving a run stuck, and every patch the holder lands
pushes it out again, so a long write is never cut off mid-beat. `memoryGenerationStore()` is the same contract over a map, for tests and the eval
harness.

**Writing a section** is unchanged underneath: `write-section` (`tools/plan.ts`) emits free-form JSON validated by
`zSection.safeParse`, with three attempts spent across unreadable JSON, a section that trips
`checkSection` (`quality.ts`), and a call that throws; a section that parsed but never passed the
checks is returned rather than discarded. `checkSection` runs the structural bar (`structureIssues`:
the vocabulary, the required fields, no empty container, one h1, a row the solver can honour) and
the content bar (a headline, no placeholder copy, not too sparse). `renders-what-it-declares` in
`eval/checks.ts` runs the same function over the corpus, so a rule the hand-built work fails is
caught as miscalibration.

**Image resolution** is unchanged too: the model writes an art-director phrase and
`resolveImage(phrase, slot, opts)` turns it into a URL, by AI generation when the brief asks for it
(`imageSource: "ai"`), else stock across `unsplash → pexels → pixabay → openverse`, else a
deterministic placeholder; whatever lands is adopted into the workspace library so the stream
carries canonical `/api/media/asset/:id` urls. A face slot (`avatar`) resolves square and asks for
a described, fictional person (`FACE_SRC` in `prompts/catalog.ts`).

## 8. The chat / workspace agent (`services/core/ai/chat.ts`)

A multi-step **tool-calling loop**, the AI SDK's `ToolLoopAgent`, run as the `ask-assistant` tool
body. The model answers in prose and calls tools; the loop chains up to 6 steps. It is a workspace
agent rather than a generate-a-new-artifact bot: it can see the library, act on it, edit any
artifact, and start and drive a generation.

**The toolset is the catalog, filtered.** `offeredTo(ctx)` returns every registered tool on the
`agent` surface whose `needs` the context satisfies and whose `without` it does not violate. Chat
owns nothing about a capability except how its result is shown. Adding a tool to the catalog and
implementing it is the whole job; there is no second list in `chat.ts` to forget.

**Every call goes through the executor**, with `holds: "caller"` (the turn reserved once) and
`apply` set from the tool's confirm policy. The three policies:

- `before`: the agent does not run the tool. It yields a `proposal` card carrying the tool's
  `call.input` and the estimate (`generationSize` for a write), and tells the model nothing ran.
  The user presses the card and the client runs that tool through the same envelope.
- `after`: the tool runs with `apply: false`; its patches are merged into one `proposal` card with a
  preview when the patch puts exactly one section on the page. The user applies or discards it.
- `never`: the tool runs and its patches persist; a workspace action comes back as an `action`
  card; a bare result becomes a note to the model.

A tool may declare its own `present` (the pick-lists, the suggestions carousel), otherwise the
**generic presenter** does the above. A refusal from the executor is turned into a sentence the
model can explain (`refusalNote`: plan, credits, bad arguments, not found, busy). When a run is
open the agent's calls to generation tools have `generationId` filled in from the context, so the
model never has to carry an id.

**Thinking is distilled, not streamed.** Chat is the only capability that keeps thinking on (every
other call site passes `thinklessOpts()`). The provider's thought summaries are markdown essays, so
`runChat` accumulates them server-side and forwards only the step headlines through
`chat.thinking`, via `services/core/ai/thinking.ts`. The full prose never crosses the wire.

`chat.tool` is sent **twice** per call, once to open the widget shell and once with `done: true`
from the wrapper's `finally`, so a tool with nothing to show still closes its shell. `chat.nested`
carries a capability's progress events up to its shell, where a `narration` becomes the subtitle.
A patch yielded by an `after` tool is not forwarded; the card is its only home until it is pressed.

**What each surface is offered**, by the `needs` field rather than by a list here:

- **Library** (no artifact, no generation): the reads, the workspace verbs, `find-templates`,
  `edit-artifact`, `create-artifact`, and `start-generation`. "Turn this into a deck" starts a
  generation from the message; the dock adopts it into the studio (`generation` block) and the
  same conversation continues there.
- **Editor** (an open artifact): the content tools (`add-section`, `rewrite-section`,
  `rewrite-passage`, `revise-element`, `reimage`, `suggest-sections`, `show-sections`, the
  structure tools, the notes and summary tools). `rewrite-passage`, `revise-element` and `reimage`
  target by `sectionId` plus a find string, an element type, or a phrase, since the agent has no
  selection to point with; `services/core/ai/locate.ts` resolves the path and a miss lists the
  section's real passages or element types back to the model.
- **Generate** (a run in progress): the nine generation tools, plus the content tools once
  sections are written. `revise-outline` reshapes the arc, `write-beats` executes it,
  `steer-generation` sets the standing note, `revise-brief` changes the brief, `plan-outline`
  replans (it is `before`, so the reroll costs a press). Without `write-beats` the agent's nearest
  match was `add-section`, which mints a new section beside the plan; the prompt says so.

The system prompt (`prompts/chat.ts`, `chatSystem(view)`) matches: an editor persona with the
section map and focus, a library persona explicit that it can build here and organize existing
work, and a generate persona that reads `generationDigest` (stage, brief, outline with each beat's
status, the steer) and never claims a beat is written that is not.

**Seams every capability lands on:**

- **Read spine (server-side, DB-backed).** `find-artifacts` / `read-artifact` run against Postgres
  through the injected `WorkspaceReader`; `read` returns a compact digest, never the raw tree.
- **Edit a target.** A `proposal` carries an optional `targetArtifactId` (absent = the open
  artifact or the draft). `edit-artifact` loads a library artifact and returns a proposal tagged
  with its id; applying saves straight to that artifact.
- **Workspace actions.** Management tools return a `WorkspaceAction` the client performs.
  Reversible ones run and refresh; trash, share and export render as a confirm or route card.

**Cross-cutting:**

- **Metering.** One hold per turn; the tools the agent runs settle against it. Reads and
  management are free; content generation and edits stay metered.
- **Safety.** Trash / share / export always go through the card. Upgrade and permission changes are
  hand-off only.
- **Grounding honesty.** The agent acts only on real ids returned by `find-artifacts` and real beat
  ids from the outline, and never claims an action it did not take.
- **Model.** The agent reasons, so it runs on `chat`'s task model with thinking on; the tools it
  calls keep their own fast, thinkless models.

## 9. Models + provider

`services/core/models.ts` names every model `provider:model` and maps each **task** to a default. The whole
stack above provider is provider-agnostic — it asks for a task's model and calls the SDK against whatever
`resolveModel` returns:

```
every task (outline · generate · section · rewrite · translate · theme · edit)
                                  google:gemini-3.5-flash     (thinking OFF)
chat                              google:gemini-3.5-flash     (thinking ON — thoughts streamed)
```

**One model, every task: Gemini 3.5 Flash.** It won the chat tool-routing eval outright
(`services/core/ai/eval`, `pnpm ai:eval`: 100% vs 2.5-pro's 80%) at lower latency, and a deck is ~12 sequential
section calls, so a reasoning-heavy model's latency stacks up badly for little gain on bounded creative
writing. Running one model everywhere also means one thing to re-evaluate when a newer model lands, rather
than six independent judgement calls. The per-task entries in `DEFAULT_MODELS` stay, so any single job can
still be moved to a heavier model in isolation.

`thinklessOpts(id)` (`provider.ts`) sets `thinkingBudget: 0` on any non-Pro Google model, so every task runs
thinkless — except **chat**, which passes its own `thinkingConfig.includeThoughts: true` and streams
Gemini's summarized thoughts, distilled to step headlines as `chat.thinking` (§8).

Plan tiers (`modelFor(task, tier, overrides)`) resolve identically today: `BASIC_OVERRIDES` is empty because
no task runs a pro-class model. The seam stays wired for the moment one earns it on paid plans.

Google leads because one `GOOGLE_API_KEY` also powers image (and, ahead, video) generation; Anthropic
(Fable 5 / Opus 5 / Opus 4.8 / Sonnet 5 / Haiku 4.5), OpenAI (GPT-5.5 / 5.4 / 5.4 mini / nano), and xAI (Grok 4.3 / 4.20)
stay registered for override. Routes reference tasks, never raw ids, so re-tuning is one line.
`provider.ts` builds one lazy SDK client per provider and `aiReady()` lets a route degrade to 503 instead
of throwing when no key is set.

**Structured output is not one mechanism.** `providerOpts(id)` (`provider.ts`) carries the per-provider
knobs every call needs, keyed by provider name so a key another provider does not know is ignored by it.
Three live entries, two of them load-bearing:

- Google Flash gets `thinkingConfig.thinkingBudget: 0`; Pro rejects it, so only Flash gets it.
- Anthropic gets `structuredOutputMode: "jsonTool"`. Its default `auto` mode compiles a decoding grammar
  per schema, and `zOutline` is large enough that it returns "Grammar compilation timed out" after two
  minutes, so every Claude model failed the outline step while passing a plain prompt and a toy schema.
- OpenAI gets `strictJsonSchema: false`. Strict mode demands every property appear in `required`, so a
  single optional field fails the request outright with "'required' is required to be supplied and to be
  an array". Our schemas are full of genuinely optional fields, so strict is the wrong contract for them.

The shape of both failures is the same and worth remembering: the model is fine, the provider's _default_
structured-output mechanism is not compatible with our schemas. Neither is visible from a plain prompt or a
toy schema, which is why `--turn` exists.

Every id must be one the installed provider package declares. Their model-id types end in `| (string & {})`
for forward compatibility, so a stale id typechecks and fails only at the API: `xai:grok-4` sat in the
registry after the SDK had moved to the 4.x line, and would have 404'd whenever anyone picked it.
`pnpm check:models` (pre-commit + CI) reads each provider's declared union out of its `.d.ts` and fails on
any id that is not in it. That is a static check; only a real call proves the key works and the account has
access, so `pnpm ai:probe` (`services/core/ai/eval/probe.ts`) sends one tiny prompt per registered model and reports
which answered. `--turn` goes further and runs the real outline and chat turns, with the production
prompts, schema and toolset: a model can answer a one-line prompt and still fail the pipeline. That is not
hypothetical, it is how the Anthropic grammar timeout below was found. It costs money and needs live keys, so it runs on request rather than in CI:
`--provider=` / `--model=` narrow it, `--json` also exercises structured output. Providers with no key are
skipped rather than failed, since a machine holding one key is normal. The other direction happens too: `claude-opus-5` was real while
`@ai-sdk/anthropic@4.0.8` predated it, so the fix there was updating the package, not the id.

**Sampling knobs are not universal.** Current Claude models (Fable 5, Opus 5, Opus 4.8, Sonnet 5) reject
`temperature`/`top_p`/`top_k` with a 400, so no call passes a bare `temperature:`. Every site goes through
`samplingFor(id, t)`, which returns `{}` for those models and `{ temperature: t }` for the rest. A model
added to the registry declares this with `sampling: false`.

### 9.1 Per-step model override

Any AI call may be pointed at a different model per task, so a run can be compared step by step. The picker
is a product surface, reachable by every user at ⌘K → `/models`.

```
client  app/stores/models.ts           localStorage {task: "provider:model"}, sent as one header
        ↓  x-galleo-models             on authenticated fetches, /ai/turn, and the SSE posts
server  services/core/models.ts overridesFrom(c) → parseOverrides(header)
        ↓  RunOpts.models              threaded to modelFor() at every resolution point,
        ↓  ToolContext.models          including tools the agent invokes mid-turn
readout narration "Model override"     emitted by plan / generate / build turns when one applied
        [ai:model] task → id           one server log line per overridden call
```

`parseOverrides` keeps only known task ids and only model ids the registry actually serves, so a stale or
hand-edited header degrades to the default rather than routing a call to nothing. `GET /features` carries
the catalogue as `models: { tasks, models, defaults }`, with each task's default already resolved for the
workspace's tier, so `effectiveModel` is `override ?? default` by construction and cannot drift from
`modelFor`. Choosing the model that is already the default clears the override instead of storing it, which
keeps the "all default" readout honest and the header free of redundant tasks.

**This costs us, not the user.** A heavier model changes what the provider bills us while the user is
charged the same flat per-tool price from `@model/credits`. That asymmetry is the reason the picker was
originally gated behind an env flag; the gate was removed deliberately, so the exposure is now a pricing
question rather than a technical one.

Each run's per-step choices are recorded in `app/stores/model-usage.ts` and, once the run saves, written to
the artifact's `ai_meta` column alongside the brief, so provenance outlives the browser that made it.

## 10. The prompt system (`services/core/ai/prompts/`) — the playbook

Pure, layered string builders — each capability stacks fragments into a `PromptParts = { system, prompt }`;
the composer imports no capability, so there's no cycle. The **system** teaches identity + contract + taste
(stable, cacheable); the **prompt** carries the specific ask + pulled context. Cheap high-volume ops
(rewrite/translate) deliberately drop the catalog for a lean persona. `persona.ts` (identity + surface
voice), `system.ts` (composers + `SECTION_RULES` + context helpers + output envelopes), `catalog.ts`
(the `ELEMENTS` / `LAYOUTS` vocabulary the LLM writes against, plus the `elementCatalog` / `layoutCatalog` /
`describeTheme` renderers over it — data and renderer in one file so a new element can't be described in the
prompt without being declared, and so this server-only guidance never reaches the client bundle),
`rubric.ts` + `arcs.ts` + `exemplars.ts` (the quality bar, reverse-engineered from
the demos), and the capability builders (`generate.ts` · `chat.ts` · `text.ts` · `theme.ts` · `image.ts`).
The rest of this section is the prompt-level detail — every builder, the context each pulls, the composition.
The quality bar is reverse-engineered from the hand-built demos (`services/core/ai/corpus/*`) and the starter templates
(`services/core/templates.ts`); those patterns are encoded in `prompts/rubric.ts` + `prompts/arcs.ts` and injected
into the generation prompts.

### 10.0 The shape of every prompt

Every capability builds a `PromptParts = { system, prompt }` by stacking pure fragments (`prompts/system.ts`
`stack()`), then calls the SDK (`generateObject` for the outline/plan, `generateText` for free-form JSON
sections + text ops) with the task's model (§9). Layering:

```
system  =  PERSONA                                                              ← who
        +  elementCatalog() + layoutCatalog()                                   ← the contract (from @model)
        +  SECTION_RULES + VOICE                                                ← the quality bar
        +  surfaceVoice(deck|doc|web) + sectionExemplars(surface)               ← per surface
        +  describeTheme(id)                                                    ← per theme
        +  <output envelope: SECTION_OUTPUT | ELEMENT_OUTPUT | OUTPUT_NOTE>
prompt  =  briefContext(input) | artifactSpine | neighbors | placement          ← the pulled context
        +  <the ask>
```

The **system** teaches identity + contract + taste; the **prompt** carries the specific ask + context.
The order inside the system prompt is the cache's: everything every call shares comes first, then
what depends on the surface, then the theme line, so the provider's prompt cache keeps the shared
prefix across runs that differ only in those. The outline builder follows the same rule. Cheap
high-volume ops (rewrite/translate) deliberately drop the catalog and use a lean persona.

### 10.1 Each builder, in detail (`prompts/generate.ts` unless noted)

#### `outlineParts(input)` — the plan

- **Job:** title + a backdrop phrase + ordered beats (id, label, narrative role, a **layout preset** —
  `full · split-6040 · split-4060 · two-col · three-up` — a per-column `blocks` list, an image flag, a
  one-line brief). **Output:** `zOutline` via `generateObject`.
- **System:** persona + surface voice + `describeTheme` + `OUTLINE_JOB` + `layoutCatalog` + **RUBRIC**
  (bookends, thesis-second, the required element mix).
- **Prompt:** `briefContext(input)` + `sourceMaterial(source)` (when building _from_ pasted/repurposed text) +
  `lengthGuidance(length)` (→ ~7 / 12 / 18 sections) + `arcGuidance(input)` (the proven arc for the topic).
  **Emits:** `plan`.

#### `sectionParts(input, beat, outline)` — one section

- **Job:** write the beat as a real `Section` (`{ id, root }`, a flex element tree). **Output:** `zSection`.
- **System:** persona + surface + theme + **full element & layout catalog** + `SECTION_RULES` + **VOICE** +
  a gold `sectionExemplars(surface)` + `SECTION_OUTPUT`.
- **Prompt:** `briefContext` + `sourceForSection(source)` (the same clipped material the outline read, with
  a "quote its real facts" directive, so sections can cite what the planner only distilled) +
  `writtenContext(content, beat.id)` (every written section's words, clipped per section) +
  `placement(beat, outline)` — the beat's brief/role/layout + `blockLine` (fill each column with its
  planned block, in order) + **the entire arc** so it doesn't repeat neighbors. **Emits:** `addSection`.

#### `sectionPlanParts(input)` + `insertSectionParts(input, beat)` — insert one section

- **Plan (structured):** role + layout preset + per-column blocks, aware of where it lands
  (`artifactSpine` + `insertionContext` — the sections it falls between). **Output:** `zSectionPlan`.
- **Write:** the same `sectionSystem` as generate; prompt is the instruction + `insertPlacement` (the assigned
  layout + the real neighbors). **Emits:** `plan` then `addSection` at `afterId`.

#### `editSectionParts(content, section, instruction)` — regenerate a section in place

- **Job:** rewrite one section to satisfy an instruction, keeping its id + layout. **Context:**
  `neighbors(content, id)` (prev/next labels — fit between, don't repeat) + the target **section's full JSON**.
  The chat agent's `rewrite-section` (and `edit-artifact` on a target) wrap this. **Emits:** `replaceSection`.

#### `reviseElementParts(content, section, element, instruction?)` — regenerate one element

- **Job:** a fresh, stronger version of ONE element, **same type**, so the section's layout stays valid; no
  instruction = a straight re-roll. **System:** persona + theme + element catalog + `SECTION_RULES` + `VOICE`
    - `ELEMENT_OUTPUT` (a single `{ type, data }`). **Context:** `artifactSpine` + the section it lives in +
      the element's current JSON. **Emits:** `{ element }` → `replaceElement`.

#### `rewriteTextParts` / `translateTextParts` (`prompts/text.ts`) — transform one passage

- **Lean:** persona + a hard "return only the edited text — no preamble, quotes, or fences" rule; **no
  catalog**. **Context:** the surrounding text as _context only_ when a sub-range is selected. **Output:** raw
  text (`clean()`ed). Whole-artifact translate = `translateTextParts` fanned out over every text element.

#### `chatSystem(ctx)` (`prompts/chat.ts`) — the agent instructions

- **Two personas, per surface.** With an artifact open: an editor assistant + `artifactSpine` +
  `artifactDigest` (the section map) + the current `focus` + the theme list; the rules describe its tools and
  that every change is a proposal the user applies. In the **library** (no artifact open): a workspace
  assistant grounded in the `ChatLibrary` summary (recent titles + count + folders) that can build here,
  **see** existing work (find/read), edit a named artifact, organize the library, and route share/export —
  it's explicit that it never publishes/purchases and never claims an untaken action. A `creditLine` (from
  `ChatContext.credits`/`plan`) lets it answer "how many credits do I have" and warn before a big build.

### 10.2 theme + image + suggest

- **Theme** (`prompts/theme.ts`, `services/core/ai/tools/theme.ts`): a coherent `ThemeInput` (name + mood + isDark + 8
  colors + font trio + radius/weight/border) from a prompt; the bundled font lists constrain the choice, and a
  deterministic contrast/OKLCH finalize pass guarantees legibility regardless of model.
- **Image** (`services/core/ai/images.ts`): expand a terse subject into one vivid, on-theme image prompt.
- **Suggest** (`services/core/ai/tools/suggest.ts`): a cheap, unmetered call for "what to add next" ideas (the insert
  popup); the client caches per artifact.

### 10.3 The quality bar, baked in (`prompts/rubric.ts` + `prompts/arcs.ts`)

`RUBRIC` (structure) and `VOICE` (copy) are injected into outline + section prompts; `lengthGuidance` sets the
section count; `arcGuidance` picks the topic arc. Highlights:

- **Structure:** open + close on a `full` section with a background image (the closer mirrors the cover);
  section 2 restates the thesis in one line; the default column is a `group(label → h2 → body)`; alternate the
  split layouts so the image side zig-zags; `three-up` only for genuine triads; across the piece include ≥1
  stat-trio, card-trio, captioned chart, process/funnel diagram, real table, pull-quote, and one callout on
  the key claim; backgrounds only on emotional beats.
- **Voice:** concrete/sensory over abstract; specific odd numbers, never round-vague; em-dash contrast + a
  strong final clause; headlines ≤8 words; stats = a tight value + a full-clause label; bodies 40–75 words
  (longer for docs); image `src` = an art-director's hyphenated phrase; **never** lorem ipsum.
- **Deck-fit rules (`SECTION_RULES`):** a group of people (team/advisors/testimonials) lays out in ONE
  horizontal row (never a tall 2×N grid of big square photos — it letterboxes a 16:9 slide); a person is
  described generically ("a confident businesswoman in her 40s"), never named, so a real portrait turns up.

### 10.4 Context-pulling strategy

The rule: **an editing turn carries as much relevant context as it can afford, cheaply.** The helpers
(`prompts/system.ts`) and where each is used:

| Context helper                        | What it gives                                                 | Used by                              |
| ------------------------------------- | ------------------------------------------------------------- | ------------------------------------ |
| `describeTheme(id)`                   | active theme name/mood/dark → the register to write in        | every generate/edit/theme/image turn |
| `briefContext(input)`                 | prompt · goal · audience · tone · length                      | generate (outline + section)         |
| `sourceMaterial` / `sourceForSection` | the attached material, clipped 6k (distill vs quote framing)  | outline / every section write        |
| `writtenContext(content, exclude)`    | every written section's actual words (hand-edits are canon)   | generate + build section writes      |
| `retrievedContext(pack)`              | chunks retrieved from the attached contexts for THIS query    | outline, every section write, chat   |
| `arcGuidance(input)`                  | the proven topic arc                                          | outline                              |
| `placement(beat, outline)`            | the beat + the whole arc (continuity while building)          | section                              |
| `artifactSpine(content)`              | title + thesis + format + theme (the cheapest "what is this") | insert-plan, element regen, chat     |
| `artifactDigest(content)`             | every section's id + first line (a whole-tree map)            | chat (editor), read-artifact         |
| `neighbors(content, id)`              | prev/next section labels (fit between, don't repeat)          | regenerate section                   |
| `insertionContext(content, afterId)`  | the two sections a new one lands between                      | insert plan + write                  |
| `elementContext(content, section)`    | the spine + the section an element belongs to                 | regenerate element                   |
| section / element JSON                | the exact current content being changed                       | section/element regen                |
| surrounding text                      | the run's context (sub-range coherence)                       | rewrite / translate                  |

So a **regenerate-section** call sees the theme mood, the neighbors it must flow between, the section's own
JSON, the full element/layout catalog, and the voice/rubric — everything needed to fit the piece, not a
generic block. A **rewrite** call sees the passage + its surrounding text. A **library chat** turn starts with
only the workspace summary, then calls `find-artifacts`/`read-artifact` to pull a real artifact's digest on
demand.

### 10.5 The context library + conversation memory (pgvector)

Reusable, workspace-shared **contexts** ground turns in real material. One ingestion path whatever the
source (`services/core/context.ts`): extract text → `chunkText` (paragraph-aware, 1200 chars, 200
overlap; `services/core/context.ts`) → embed (`gemini-embedding-001` @ 768 dims,
`services/core/ai/embed.ts`) → rows in the unified `chunks` table. The five source kinds and how each
becomes text: **file** covers plain-text formats (read in the browser, same reader as the intake's
attachments) plus the binary formats the server extracts via `POST /extract` — PDF text layers
(`unpdf`), `.docx`/`.xlsx` (hand-walked OOXML on `jszip`, sheets serialized as named CSV blocks), and
images or scanned PDFs, which Gemini reads (the `extract` task; `ImageReader` is an injectable seam
like `Embedder`); the extraction lives in `services/utils/extract.ts` (pure parsers) +
`services/core/extract.ts` (caps, dispatch, the scanned-PDF and broken-CMap fallbacks); context items
keep the original bytes (`context_items.original`, served at `…/items/:id/original`) so the inspector
renders the real file — the browser's PDF viewer, an `<img>` — while retrieval uses the extracted
text; intake attachments extract only. **text** is pasted material; **link** is fetched server-side by
`services/utils/webpage.ts` (SSRF-vetted per redirect hop, 2 MB cap, HTML → text); **artifact**
re-extracts a library artifact's words with the same `extractArtifactText` the search index uses
(artifacts have FTS, not vectors — context items get their own chunks); **template** resolves a starter
from the curated catalog (`templateBody`) through the same extraction. Ingestion is unpriced to the user
— including the per-image vision call (<$0.02, bounded by a 20/min rate limit and 15/8 MB size caps);
retrieval-query embeddings settle into the turn via the meter's `extraUsd` (the embedding model is
deliberately NOT in the `MODELS` registry — `check:models` validates against provider LanguageModelId
unions).

Retrieval is one seam used four ways. Routes build a `ContextRetriever` (`makeContextRetriever`) from the
request's `contextIds` and hand its `pack(query)` to the runtime via `RunOpts.pack` → `ToolContext.pack`:

- **outline** — the plan tool packs against prompt + mustInclude before writing the arc;
- **section writes** — `run.ts` packs per beat (`label · brief · takeaway · points`), so every section
  pulls its own relevant chunks (build turns included);
- **chat** — the turn packs against the user message into `retrievedContext`, and the agent can dig
  further mid-turn with the `search-context` tool (registered only when contexts are attached);
- **conversation memory** — every chat turn is recorded (`chat_messages` + `chat`-scoped chunks) after
  settle, and `recallConversation` retrieves from exchanges OLDER than the client's verbatim history
  window (newest 16 messages excluded), keyed by workspace + (artifactId ?? null).

Top-k retrieval (12 context / 6 recall) has no distance floor — `assemblePack` labels every chunk with
its source and the prompts frame recall as "possibly relevant", so ranking, not thresholding, does the
filtering. All embed calls take an injectable `Embedder`, which is how the integration suite runs
against real pgvector with fake vectors. Schema: `architecture.md` → "Context & memory"; routes:
`services/api/context.ts` (ingestion 503s without a Google key via `embeddingReady()`).

Client side there is no contexts page: the intake's **+ menu** is the attach point when generating —
upload files / paste text for one-off source material, toggle context collections
(`GenerateInput.contextIds`), and open the in-studio `ContextsPane` to create or manage collections
(`app/views/generate/ContextsPane.tsx`, hosted like the template gallery so the prompt survives the
detour). The attach UI is one shared family (`app/components/context-attach.tsx`: the "+" `AttachMenu`,
the source flows behind it via `createAttachSources`, the `ContextChips`/`AttachmentChips` rows) — the
chat dock's composer carries the same menu restricted to collection toggles, feeding
`ChatContext.contextIds`, and `ContextsPane` wires the same source flows to permanent ingestion.

## 11. Routes + the credit gate (`services/api/ai.ts`)

**The credit gate is the executor's.** A route no longer reserves: it names a tool and hands the
call to `runTool`, which holds, runs and settles (§7). `pnpm check:tools` fails a file under
`services/api/` that imports a tool body or calls `reserve` with a tool id, which is the regression
that would re-fork metering.

```
POST /ai/turn      SSE. { tool, input, artifact? }: any tool on the `direct` surface, streamed.
                   Frames each TurnEvent as `data: {seq, event}`, opening with turn.start and
                   closing with turn.done {result, traceId?} or error. `artifact` is the
                   document the browser holds, for a tool acting on the open piece; a call naming a
                   generationId ignores it, since the executor loads the draft. ask-assistant is the
                   chat turn: its input is the ChatInput, and the exchange is appended to the stored
                   thread when it ends.
POST /ai/suggest   UNMETERED ideas for the insert popup (suggest-sections).
POST /ai/theme     One ThemeInput from a prompt (generate-theme).
POST /ai/element   Regenerate one element in place → { element } (revise-element; the element rides
                   in the body since the runtime cannot traverse the canvas tree).
POST /ai/text      Rewrite / translate one passage → { text } (rewrite-text / translate-text).
POST /ai/refine    Sharpen an intake prompt (refine-prompt).
POST /ai/notes     SSE. Speaker notes for the open piece, streamed per section as replaceSection
                   patches (write-speaker-notes).
GET  /ai/voice · POST /ai/voice-token   dictation readiness and the single-use STT socket url.

GET    /chat/thread?key=      the stored thread for a subject (generation:<id> · artifact:<id> · library)
POST   /chat/thread/mark      { key, proposal, mark }: a card was applied or discarded
DELETE /chat/thread?key=      clear it
```

`/ai/brief` is gone: the planner reports its own reading of the brief through `setBrief` patches,
and a person's edit is `revise-brief`.

**A refusal is a status, even on a stream.** `streamRun` in `services/api/middleware.ts` starts
the executor, waits for either `onHeld` or the outcome, and opens the SSE body only once the hold
is taken; a refusal before that answers as JSON (402 for credits, 403 for a plan, 400 for input), so
the client walls exactly as it does on a fetched route. Events the body yields before the stream
is open are buffered. `/ai/turn`, `/media/generate`, `/media/generate-video` and
`/artifacts/:id/narration` all use it.

**The other routers run their tools through the same executor.** `POST /media/generate` streams
`generate-image` variations for the picker and `POST /media/generate-video` one clip;
`POST /artifacts/:id/narration` runs `narrate-artifact` and frames each `section.audio` event;
`/voices/audition` and `/voices/design` run `audition-voice` / `design-voice`;
`/artifacts/:id/soundtrack` runs `compose-soundtrack`; the context routes run `read-file`. Each
keeps its own body schema at the HTTP boundary, as `check:validation` requires, and its own wire
framing; what it no longer owns is the reservation or the tool id as a string literal.

**Narration, music and voices** keep their routers (`services/api/narration.ts` over
`services/core/narration.ts` and `soundtrack.ts`; `services/api/voices.ts` over
`services/core/voices.ts`), since they are about audio rather than about a turn. The manifest and
byte reads, the `/p/:slug` mirrors gated by `publicRead`, the preset-once-per-deployment rule, the
script fingerprint (`SectionNotes.of`, `needsScript`), the press-to-record model of the present bar
and the cache key `sha256(spoken + voice + model + output_format)` are as they were and are
described with the present surface in `rendering.md` and the entitlements in `workspaces.md`.

**There is no `/eval` route.** The playground that listed traced runs, posted layout checks and
asked the judge was removed once tracing became the executor's own record; the offline harnesses
(`pnpm ai:eval`, `pnpm eval:ci`) run the same checks and judges from the command line and need no
route. The demo account's traces still keep their bodies, so an analyzer over the table can read
them.

**The stored thread.** `appendExchange` (`services/core/threads.ts`) runs after every
`ask-assistant` turn, best-effort, and stores the user's message with the assistant's events
**compacted**: text deltas fold into one, thinking labels keep their final list, each tool shell
keeps only its close, and the live paint of a section (partials, statuses, nested progress) is
dropped because the card carries the section. One row per (workspace, user, key), capped at 200
messages. `chat_messages` beside it is the pgvector recall index over the same words; this table
is what the dock reopens.

**Reconciliation.** The hold is a pre-flight estimate; the executor's settle trues it up to what
ran, in a `finally`, so a run that made an image and then threw still bills for the image. A chat
turn settles once for the reply and every tool it ran.

## 12. Client wiring + end-to-end traces

The editor stays **app-free**: it exposes injected seams, and the app registers transports in
`EditorView.tsx`. No host wired, no feature. (Fuller client detail is in `frontend.md`.)

```
editor seam (editor.ts)     app transport (api.ts)      the call                     the flow
onSectionStream             streamTool                  /ai/turn add-section         editor/core/ai.ts (insert)
onSuggestSections           api.suggestSections         /ai/suggest                  the insert popup's idea chips
onReviseElement             api.reviseElement           /ai/element                  editor/core/ai.ts (regenerate)
onTextAssist                api.assistText              /ai/text                     editor/core/ai.ts + TextAiMenu
(chat and the studio use streamTool directly)           /ai/turn <any tool>          app/stores/chat.ts · app/stores/generate.ts
```

- **`streamTool(tool, input, onEvent, opts)`** opens `POST /ai/turn`, reads the SSE body, parses
  each `data:` line back to a `TurnEvent`, and hands it to `onEvent`. A non-2xx answer throws an
  `ApiError` before any event, which is what the paywall keys on.
- **In-canvas flows** paint a live skeleton from the `plan` event, then land the real content:
  `section-gen` reserves a placeholder slot and commits the section as one undo step;
  `element-gen` shimmers the element and swaps it in; `text-assist` splices the rewritten passage
  back into the live text field.

**The generation studio is a mirror.** `app/stores/generate.ts` holds `{ generation, content }`
and nothing the server does not: every button runs a tool through `runGenerationTool`, and every
`patch` event that comes back is applied with the same `applyPatch` the server used, so the two
copies cannot disagree about what a beat is or which take is active. The store's public verbs map
onto tools one to one:

```
startSession          start-generation, then plan-outline       openGenerate → the intake
setBriefField …       revise-brief                              briefStale() while plannedAgainst lags
startPlan             plan-outline                              reroll, or replan after a brief edit
patchBeat · moveBeatDir · removeBeatById · addBeatAfter   revise-outline
setSteer              steer-generation
buildSections         write-beats (every queued beat, or a list)   "Write all N"
buildSectionNow       write-beat                                "Write this one"
regenerateSection     write-beat { replace, note }
setActiveVersion      pick-version
pauseBuild            aborts the stream; the beat in flight lands server-side (its body runs on a
                      context without the client's signal), and the store polls read-generation
                      until `writing` is false
adoptGeneration(id)   read-generation, then open the studio on it (from the dock, or a reopened tab)
saveGenerated         finish-generation
```

The studio is one full-screen surface (`Modal size="screen"`, stamped with the session theme) whose
body switches per stage; the chat rail sits alongside throughout and is the same agent on the
`generate` surface. There are no run-mode or gate settings: the prompt goes to an outline, and the
outline is where every remaining decision is made. The stages:

- **Intake**: a centred composer with format / length / image source as compact dropdowns, plus
  context to build from (pasted text and dropped text files, merged into `GenerateInput.source`;
  `app/stores/attachments.ts`). It is also the app's one create entry: a template row
  live-matches the typed prompt against `TEMPLATE_INDEX`, and a start-blank row covers the empty
  canvas. Picking a shape sets `shapeTemplateId`, and `plan-outline` snaps the returned beats onto
  the template's `sectionForms` by index.
- **Outline**: the beats render as editable section cards at the width of the section each becomes
  (`OutlineCard.tsx`); title, takeaway and points edit in place, and every edit is a
  `revise-outline` call. The brief bar shows the planner's reading with the fields a person set
  marked as theirs; editing one is `revise-brief`, and the outline reads as stale until the next
  `plan-outline`. Reroll replans; the Build CTA prices the commitment.
- **Build**: `write-beats` or `write-beat`. While a full run is in flight the board is locked
  (`runLocked()`), with a Stop pill that is `pauseBuild()`. Each landed frame gets a verdict bar
  (regenerate, regenerate with a note) and version chips; a beat that fails after its retry keeps
  its card with Write still on it, and the run stays open. Two invariants keep the board from
  re-rendering itself as it fills: `<For>` iterates beat ids, not view objects, and each `Frame`'s
  paint effect guards on a signature of section, ghost shape, width, theme and format.

Because the run is a server resource, closing the studio loses nothing, and reopening it is
`adoptGeneration`. The one-shot `generate-artifact` is not used by the product's own surfaces.

**The chat dock** (`app/stores/chat.ts` + `app/views/ChatPanel.tsx`) folds the streamed events
into an ordered list of UI blocks per message (`chat.text` → prose, `chat.thinking` → a thinking
bubble, `chat.tool` → a shell, `chat.block` → a card). A `proposal` with a `call` runs that tool
on press: through the `GenerationHost` (`setGenerationHost`, the seam the studio store registers
so the dock can start or adopt a generation without an import cycle) when it starts or continues a
run, else through `streamTool`. A `proposal` with a `patch` applies it on press: to the open
artifact through `applyPatch` + `commit`, to a library target by saving, or to the generation
through `apply-patch`. A `generation` block adopts the run into the studio.

**The thread is stored and replayed.** `currentKey()` is `threadKey` over the bound target (a
generation, the open artifact, or the library); `loadThread()` fetches the server's copy on
`openChat`, before a `sendChat` to a new subject, and when the studio binds a run, and replays each
assistant message's events through the same `dispatch` with a `replay` flag that skips the side
effects the live turn already had (adopting a generation, running an action). Applying or
discarding a card marks it server-side, so a reopened thread shows what was done.

**Traces:**

- **Studio generate**: intake → `start-generation` + `plan-outline` (cards appear) → edits as
  `revise-outline` / `revise-brief` → `write-beats` (sections land one by one; the board follows
  the active beat) → `finish-generation` → open in editor.
- **Chat (library, build)**: "turn this into a deck" (pasted text) → `start-generation` card →
  press → the dock adopts the run, the studio opens on it → "write the first three" →
  `write-beats` card → press → `steer-generation` applied on arrival between beats.
- **Chat (studio console)**: "swap sections 2 and 3 and make the closer a call to action" →
  `revise-outline` runs, its patch is a card → Apply → `apply-patch` persists it; the board
  re-renders from the same patch.
- **One-shot generate (MCP / API)**: `generate-artifact` → `start` · `plan` · every beat · `finish`
  in one call, the draft committed through the store as it goes.
- **Insert a section**: "＋ AI section" → `add-section` → `plan` (one skeleton) → `addSection` at
  `afterId` → committed as one undo step.
- **Regenerate an element**: ContextBar ✨ → `/ai/element` → `revise-element` → swapped in place.
- **Chat (library, edit a named artifact)**: "make the intro of my Aria deck punchier" →
  `find-artifacts` → `read-artifact` → `edit-artifact` → a proposal tagged `targetArtifactId` →
  Apply saves to that artifact.

## 13. Status + Planned / deferred

**Live:**

- **Every AI action is a catalog tool run by one executor** on every surface: the chat agent, the
  direct routes, MCP and the REST API. The executor owns the surface check, the scope, the plan
  entitlement, the input schema, the generation a call acts on, the writer lease, the credit hold
  and the application of patches. `pnpm check:tools` holds the routes to it.
- **The generation is a server resource**: brief with provenance, outline, steer, per-beat versions
  and status, `seq`. The studio, the chat dock, the studio console, MCP and the API drive it
  through the same ten tools; the studio store is a mirror kept by `applyPatch`; pausing lands the
  beat in flight; closing and reopening the studio adopts the run.
- **The chat agent's toolset is the catalog filtered by context**, its confirm policy is declared
  per tool, and its results are shown by a generic presenter unless a tool declares its own. The
  same agent runs in the library, the editor and the studio console.
- **The chat thread is stored per subject** and replayed through the client reducer, with the
  cards marked the way the person left them.
- **Every call is traced** at the executor: tool and model spans, outcome, settled credits, at
  `metrics` for everyone and `full` for the eval account and for failures, capped per workspace.
  Nothing in the product reads the table yet; the offline harnesses judge from the command line.
- **Generation + editing:** insert-section · regenerate-section · regenerate-element ·
  rewrite / translate text · rewrite-passage · generate-theme · suggest-sections · speaker notes ·
  narration · soundtrack · voices · AI images and video for the picker.

**Planned / deferred** (kept off the critical path):

- **`SectionOp` and `PatchOp` are two vocabularies for one thing.** The REST section-op write and
  the tool patch overlap almost entirely; folding one into the other is a model change with a
  migration of stored ops, so it was left for its own pass.
- **The generation's analytics stay client-side.** The `generation_*` events are captured by the
  studio store as its mirror changes, so a run driven entirely over MCP is not counted; a server
  emitter at `finish-generation` and `landBeat` is the fix.
- **Whole-artifact `revise-artifact`.** Defined and priced, no prompt builder yet.
- **Source-grounded generation, remaining sources.** Paste-as-source and single-artifact repurpose
  ship; URL fetch (needs SSRF-safe fetching) and PDF upload as generation sources are deferred, and
  cross-artifact merge / extract is the highest-leverage follow-up.
- **The as-yet-unsurfaced priced actions**: `suggest-title`, `write-summary`, `write-alt-text`,
  `translate-artifact`.
- **Event-log persistence + SSE resume**: the `seq` cursor exists for it.
- **A trace analyzer** over the `traces` table (latency and tokens per tool and model, failure
  reasons by model, cache share, cost per surface, prompt part attribution), and emitting the
  `ai_action_*` analytics from the trace rather than beside it in `spend.ts`.
