# AI — technical guide

How every AI capability in Galleo works end to end: the streamed **turn protocol**, the single **tool
catalog** (identity + pricing), the **registry** that executes it, the **runtime** that generates and edits
content, the **chat / workspace agent**, the **HTTP routes** + credit gate, the **prompt playbook**, and the
**client** that drives it all. This is the real backend — the old client-side generation _simulator_ is gone.

Companion to `architecture.md` (the file map, layering law + credits/billing), `rendering.md` (the content
tree + element system the AI writes), `frontend.md` (the client shell that speaks the protocol), and
`testing.md` (the AI test + eval suites). Where this doc says "the element tree", the shape lives in
`rendering.md` — it is not duplicated here.

## 1. The map

```
model/                         the PURE contract (edge-safe; imports nothing above model)
  ai.ts        the turn PROTOCOL only: turns · patches · events · applyPatch
  credits.ts   what a capability is and what it costs: the metered-credit engine (Usage bag + costOf) ·
               the AiTask steps + their per-model rate multipliers · the ONE tool catalog (identity, tier,
               surfaces, pricing) — plus estimateCost / costRange / typicalCost / PRICED_TOOLS

services/core/ai/                   the runtime (depends only on model; may NOT import canvas)
  models.ts    the model registry — `provider:model` ids + DEFAULT_MODELS per task
  provider.ts  resolveModel(id) → a Vercel AI SDK LanguageModel; aiReady()/providerReady(); thinklessOpts
  schema.ts    the Zod output schemas — zOutline · zSectionPlan · zSection · zElement · zTheme · …
  run.ts       the turn runtime — runTurn dispatch + runGenerate/runSection/reviseElement + image sourcing
  text.ts      the fast text runtime — rewriteText / translateText
  chat.ts      the chat/workspace agent — an AI-SDK ToolLoopAgent whose toolset is built from the registry
  tasks.ts     the one-shot calls: rewriteText · translateText · generateTheme* · expandBrief ·
               suggestSections (a single request in, a finished value out — nothing streams here)
  quality.ts   the section audit
  tools/       the executable registry: registry.ts (Tool<I,R> + ctx.use + register + WorkspaceReader) +
               one file per capability (generate · section · element · text · suggest · inspect · library ·
               manage · structure · media · theme) + register.ts (side-effect: registers the whole catalog)
  prompts/     the pure prompt-string builders (see §10)

  routes.ts    POST /ai/{turn,brief,suggest,theme,element,text} — auth + credit gate + SSE framing
  reader.ts    makeWorkspaceReader(wsId) — the DB-backed WorkspaceReader the agent's find/read tools use
  corpus/      the seven gold-standard artifacts; prompts/exemplars.ts injects sections from three of
               them (deck=galleo · doc=helios · web=terra) into every generate turn

services/api/
  routes.ts    the credit ledger the gate charges against (POST /billing/spend, GET /billing)

editor/ + app/                 the client (thin — speaks the protocol, never the model)
  editor/core/store.ts         injected seams: onSectionStream · onSuggestSections · onReviseElement · onTextAssist
  editor/ai/                   the in-canvas flows: section-gen · element-gen · text-assist + TextAiMenu
  app/stores/generate.ts       the generation studio's session state machine (stages · gates · build loop ·
                               versions · steer · draft persistence) over app/stores/generate-plan.ts (pure helpers)
  app/views/generate/Mission.tsx (GenerateStudio) + app/views/generate/    the studio shell + its stages (§12)
  app/stores/chat.ts + app/views/ChatPanel.tsx    the chat dock: chat.ts (thread + dispatch) + ChatPanel.tsx
  app/api.ts                   streamTurn (SSE reader) + the JSON transports; wired in EditorView.tsx
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
3. **The seam is the `TurnEvent` stream (SSE) plus a few JSON routes.** Structured generation, credit
   metering, and auth wrap the runtime; the client only ever parses events and applies patches. Swap the
   model or a prompt and nothing on the client changes.

## 3. The turn protocol (`@model/ai`)

A **turn** is one request the client makes; the runtime answers with an ordered stream of **events**; some
events carry **patches** (structural ops) the client applies to the artifact.

**Turns** — `TurnRequest = { kind, input }`, `TurnKind = "generate" | "edit" | "section" | "chat" | "plan" | "build"`:

| kind       | input                                                                                    | what it does                                                   |
| ---------- | ---------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `generate` | `GenerateInput` (prompt, surface, theme, goal?, audience?, tone?, length?, mustInclude?) | build a whole artifact in one uninterrupted run                |
| `plan`     | `GenerateInput`                                                                          | outline ONLY — beats stream to the client for editing          |
| `build`    | `BuildInput` (brief, outline, beat, content, afterId, steer?, note?, anchor?, replace?)  | write ONE pre-planned, user-approved beat                      |
| `section`  | `SectionInput` (instruction, afterId, content)                                           | write + insert ONE new section                                 |
| `chat`     | `ChatInput` (message, context, history?)                                                 | a conversational agent turn                                    |
| `edit`     | `EditInput` (instruction)                                                                | whole-artifact revision — **not yet implemented** (route 501s) |

`plan` + `build` are the **generation studio's** decomposition of `generate` (§12): the client holds the
approved outline and drives one `build` turn per beat, so pausing, steering (`steer` reaches every later
section's prompt), per-beat regeneration (`replace` + `note`), and per-section billing all fall out of turn
boundaries — the server never tracks a session. `Beat` carries `brief` (the one-line section instruction)
and `covers` (which of the brief's `mustInclude` points it addresses, verbatim — the outline editor's
coverage checklist). `BriefDraft` (prompt → goal/audience/tone/mustInclude + at most one `clarify`
question) is the studio's Brief-stage shape.

`ChatContext.imageSource` carries the run's image strategy, so a picture re-sourced from chat matches how
the rest of the piece was built instead of silently falling back to stock. The route threads it into the
turn's `ImageOptions` and adds any AI variations to what the turn's tools already owe (a generation
recomputes its bill from the real count instead, because it reserved for images up front).

`ChatContext` carries the surface so the agent grounds itself per surface: `editor` (the open `content` +
`focus`), `library` (a `ChatLibrary` workspace summary — recent titles + count), or **`generate`** (a
`ChatGeneration`: the run's stage, brief, and every beat with a `written` flag). The generate surface exists
because mid-run the piece is half-_planned_ rather than absent — with only `content` to look at the agent saw
an empty artifact and proposed building a separate one. On it the agent gets `revise-outline` (proposing a
`BeatOp[]` the studio applies to its plan, since the outline lives nowhere else) and loses
`propose-generation` and the library-management half of the catalog entirely.

**Events** — `TurnEvent`, a discriminated union the runtime yields and the client dispatches:

```
turn.start   { kind }                              a turn began
phase        { name }                              intake → outline → build → compose → done
narration    { text, sub?, mono? }                 a human progress line (the build animation reads it)
plan         { beats[] }                           the outline: ordered beats (id · label · role · layout · image)
section.status { id, status }                      active → writing → image → done  (per section)
patch        { ops: PatchOp[] }                    structural mutations to apply (see below)
chat.text    { delta }                             a token of assistant prose (streamed)
chat.tool    { blockId, tool, title }              a tool started ("working…" shell)
chat.nested  { blockId, event }                    a tool's own progress, forwarded
chat.block   { blockId, block }                    a finished rich block (proposal · suggestions · sections)
turn.done    { summary? }                          success
error        { message }                            failure
```

Two chat events not in the table above but present in the union: `chat.reasoning { delta }` (streamed
thinking tokens — Gemini's summarized thoughts, rendered as a progress bubble) and `reply { text }` (a
non-streamed chat/research answer).

**Patches** — `PatchOp` + `applyPatch(content, patch)` (pure, immutable, in `@model/ai`):

```
setMeta { theme?, format?, background? }            addSection { afterId?, section }
replaceSection { id, section }                      removeSection { id }
moveSection { id, afterId }                          replaceElement { sectionId, path, element }
setSectionBackground { sectionId, background }
```

Generate streams `addSection`s; regenerate-a-section is one `replaceSection`; an element edit is one
`replaceElement` at a `path` into the section's `root` tree. Every op has a structural inverse, so the same
model powers streaming, surgical edits, history, and undo.

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

## 5. The tool catalog + pricing (`@model/credits`)

**One catalog** names every capability the AI has and carries its pricing — there is no separate "AI actions"
catalog (that split was removed; a tool _is_ the priced unit). `ToolId` is a verb-object union; each
`ToolMeta` in `TOOL_CATALOG` has:

```
id · title · summary                        identity + human copy
tier      composite | action | primitive    whole flow · single call · internal building block
surfaces  agent | direct | mcp | internal    where it's exposed (direct = a route/seam; agent = the chat loop)
category · usage · meter · live              PRICING (present only on user-facing, credit-costing tools)
```

`usage` is the typical units of work (`{ section: 12, image: 3, … }`); `meter(m)` is the size-scaling
function for metered tools; both price through `costOf` in `@model/credits`. Tools with no `usage` are free
(reads like `show-sections`, all the workspace management tools, internal primitives). The pricing helpers —
`estimateCost(id, meter)`, `typicalCost(id)`, `isMetered(id)`, `costRange(id)`, and `PRICED_TOOLS` (the "what
your credits buy" list = tools that are both `usage`-priced **and** `live`) — all live here and key off
`ToolId`. The credit gate (§11) and the `/pricing` page read straight off this; retune a unit once and the
paywall, the showcase, and every charge move together.

**The catalog — 55 tool ids** (8 composites · 42 actions · 5 primitives), defined once in
`model/tools.ts`; `pnpm check:tools` fails if a route reaches around the executor or the catalog names a
tool it cannot serve. The tiers, rather than an inventory that rots on the next tool:

- **8 composites** (whole flows, each one turn): `generate-artifact` · `revise-artifact` · `add-section` ·
  `rewrite-section` · `suggest-section-layouts` · `edit-artifact` (rewrite a section of _another_ library
  artifact) · `revise-element` · `ask-assistant` (the agent turn).
- **42 actions** (single calls): content and structure edits, the studio's brief/outline proposals, the
  workspace verbs a chat or an MCP client can drive (`find-artifacts` · `read-artifact` · `rename-artifact`
  · `move-artifact` · `duplicate-artifact` · `trash-artifact` · `restore-artifact` · `create-folder` ·
  `share-artifact` · `export-artifact` · `find-templates`), the media and speech calls (`generate-image` ·
  `generate-video` · `reimage` · `narrate-artifact` · `compose-soundtrack` · `audition-voice` ·
  `design-voice`), and `apply-patch`.
- **5 primitives** (internal building blocks): `plan-outline` · `plan-section` · `write-section` ·
  `check-section` · `pick-arc`. `plan-outline` is also a **live, direct, priced** step now — the studio's
  `plan` turn bills it (3 cr), so an abandoned outline costs the plan, not the build.

**Pricing — metered, not flat.** Cost = Σ of the primitive **units of work** an action produces. The units
(`@model/credits` `COST_UNITS`, anchored so a typical ~12-section, ~3-image build ≈ 40 credits):

```
plan 3   ·   section 2   ·   image 5 (per AI-generated variation)   ·   text 1   ·   theme 4   ·   reply 2
```

`costOf(usage)` floors at 1 so nothing is free. `estimateCost(id, meter)` is what the pre-flight gate reserves
and the UI previews. The **live, priced** tools ("what your credits buy") and their cost, folding in the
former ai-prompts credit column (now derived from the code above):

| tool                                                | usage (base)                  | typical / range  | notes                                                             |
| --------------------------------------------------- | ----------------------------- | ---------------- | ----------------------------------------------------------------- |
| `generate-artifact`                                 | `{plan:1,section:12,image:3}` | 15–73 (metered)  | scales by length; AI images add 5 each (stock=0)                  |
| `plan-outline`                                      | `{plan:1}`                    | 3                | the studio's outline gate (a `plan` turn)                         |
| `add-section` / `rewrite-section` / `edit-artifact` | `{section:1}`                 | 2                | one section written; a studio `build` turn bills as `add-section` |
| `revise-element`                                    | `{text:2}`                    | 2                | one element reworked                                              |
| `rewrite-text` / `translate-text`                   | `{text:1}`                    | 1                | one run, latency-sensitive                                        |
| `generate-theme`                                    | `{theme:1}`                   | 4                | one token system (+ deterministic finalize pass)                  |
| `generate-image`                                    | `{image:1}`                   | 5 (× variations) | AI image; metered per variation                                   |
| `ask-assistant` (chat)                              | `{reply:1}`                   | 2 + sub-tools    | base reply; chained content tools bill on top (§11)               |

Metered but **not yet `live`** (priced in the catalog, no route surfaced): `revise-artifact`
(whole-artifact edit, 12–40), `translate-artifact` (5–40, fan-out), `suggest-title`, `write-summary` /
`write-alt-text` / `write-speaker-notes`. All workspace reads + management tools are **free** (no `usage`).

## 6. The tools registry (`services/core/ai/tools/`)

The executable half. A `Tool<Input, Result>` binds a `ToolId` to a Zod `input` schema and a `run` that
**yields progress and returns a typed result**:

```ts
run(input, ctx): AsyncGenerator<TurnEvent, Result>
```

The return value is what makes composites composable: `ctx.use(subTool, input)` runs another tool with the
**same context** (shared artifact + image strategy + workspace reader + abort signal) and, via `yield*`,
forwards its events while capturing its result. `makeContext(base)` builds that context; `register(tool)`
adds it to the map; `register.ts` imports every tool file for its side effect, so the whole catalog is present
regardless of which surface pulls from it. The `ToolContext` also carries an optional, user-scoped
**`WorkspaceReader`** (`find` / `read` against Postgres) the route injects — the agent's eyes on the library
(§8, Seam A). **Three surfaces read this one registry** — direct dispatch (§7), the chat agent (§8), and
(ahead) MCP — none redefines a capability.

One file per capability:

- `generate.ts` — the artifact composite (wraps `runGenerate`).
- `section.ts` — `add-section` / `rewrite-section` / `edit-artifact` (the last reads a library target).
- `element.ts` — `revise-element`.
- `text.ts` — `rewrite-text` / `translate-text`.
- `suggest.ts` — `suggest-sections`; `inspect.ts` — `show-sections` (a read that returns the sections).
- `library.ts` — `find-artifacts` / `read-artifact` (both via the `WorkspaceReader`) + `find-templates`.
- `manage.ts` — `rename` / `move` / `duplicate` / `trash` / `restore` / `create-folder` / `share` / `export`
  (each returns a `WorkspaceAction` the client runs; no server mutation).
- `structure.ts` — `reorder-section` / `remove-section` / `set-format` / `set-theme` (each emits an existing
  `PatchOp`, so it works on the open artifact, a draft, or a target identically).
- `media.ts` — `generate-image` / `reimage`; `theme.ts` — `generate-theme`.

## 7. The turn runtime (`services/core/ai/run.ts`)

`runTurn(req, opts)` is the dispatch table for the **direct** surface (a route consumes its generator and
frames it as SSE):

```
generate → generateArtifactTool.run(...)     // via the registry (§6), which wraps runGenerate
plan     → runPlan(...)                       // outline only (the studio's gate)
build    → runBuild(...)                      // one pre-planned beat (the studio's build loop)
section  → runSection(...)                    // insert one section
chat     → runChat(...)                       // the agent (§8)
edit     → unimplemented → error              // 501
```

**`runGenerate` — the two-phase artifact flow.** One giant `generateObject` of a 20-section artifact would
block until done (no progressive canvas) and dilute quality; splitting wins on both:

```
phase intake  → narration("Reading the brief")
phase outline → generateObject(zOutline)                    ONE plan call (title · backdrop · beats)
                emit plan(beats)                            → client pre-shapes skeletons
phase build   → for each beat, in order:
                  section.status(active → writing)
                  writeSection(...) → free-form JSON section
                  cover/closer get a full-bleed background injected if the model omitted one
                  resolveImages(section)                    → section.status("image") while sourcing
                  emit patch([{ addSection, section }])     → canvas reveals it
                  (first section) resolve the artifact backdrop → emit setMeta patch
                  section.status(done)
phase compose · done → turn.done(summary)
```

`beat.id === section.id === addSection.section.id` binds content to its pre-shaped slot. The outline runs
**warm** (`temperature 0.9`) so section count + arc genuinely vary brief-to-brief; sections run cooler.

**`writeSectionFrom` — free-form JSON + auto-repair.** A section's `data` is an open, type-dependent map that
a response schema can't fill, so the section writer emits raw JSON (the prompt teaches the exact envelope),
which is `zSection.safeParse`d. It gets three attempts, and each of the three ways a call can fail spends
one: unreadable JSON is retried with a note saying so, a valid section that trips
`checkSection(section, surface)` (a deterministic quality audit, `quality.ts`) is regenerated with the
issues fed back, and a call that throws (an overloaded model, a dropped socket, a 429 the sdk's own retries
did not absorb) is simply tried again. A section that parsed but never passed the checks is returned rather
than discarded, since the checks describe a good section and not a valid one. Only three failures in a row
throw, and the message carries the provider's own words. Shared by generate and insert, so both get the
same repair.

**`runPlan` / `runBuild` — the studio's decomposition of the same flow.** `runPlan` runs only the outline
call (`planOutline`, the exact code `runGenerate` uses — one extracted function, not a fork), emits `plan`
(now carrying `title` + `backdrop`), resolves the artifact backdrop, and ends — 3 credits, and the client
owns the beats from there. `runBuild` writes ONE beat of a client-supplied (user-edited) outline through
the same `sectionParts` → `writeSectionFrom` → `resolveImages` path as generate, with four extras:
`steer` (a session-wide note injected into the prompt), `note` (a this-attempt-only regeneration
instruction), `anchor` (`cover`/`closer` — the client says which beats are the bookends now, since the
user may have reordered them; the full-bleed background forcing keys off it), and `content` (the artifact
as built so far — `writtenContext` folds every written section's actual words into the prompt, so
hand-edits are canon and later sections stop repeating earlier ones; the beat being written is excluded,
so a regeneration is never anchored by its own old take). The one-shot `runGenerate` loop accumulates its
landed sections and threads the same context, so both paths write with the page in view. `replace: true`
emits `replaceSection` instead of `addSection`, which is all a regeneration is.

**`runSection`** mirrors generate scoped to one beat: `sectionPlanParts` → `plan` (so the skeleton renders) →
`insertSectionParts` → the written section → `addSection` at `afterId`.

**`reviseElement(content, sectionId, element, instruction?)`** regenerates ONE element in place (the
ContextBar Regenerate action + the `revise-element` tool). The element is passed **by value** — the runtime
can't traverse the canvas tree — with its section for context; it keeps the original `type` + the user's
hand-set `layout`, rewrites only `data`, then resolves any new images.

**`chatAddSection` / `chatEditSection`** are the plain functions the chat tools wrap to _propose_ a section
(returned, not streamed). `edit-artifact` runs `chatEditSection` over a library artifact loaded via the
`WorkspaceReader`.

**Image resolution.** The model writes an art-director phrase; `resolveImage(phrase, orientation, opts)` turns
it into a real URL: **AI generation** when the build asks for it (`GenerateInput.imageSource:"ai"` and the
image model is wired) via the Gemini image model (`services/core/media.ts`), else stock search across
providers (`unsplash → pexels → pixabay → openverse`, the last keyless so there's always a fallback), else a
deterministic `picsum` placeholder. `resolveImages` walks a section's tree (every media field at any depth,
through `children` and `cells`) + its background in parallel. Whatever it lands on is adopted into the
workspace library through `ImageOptions.adopt`, so the provider's attribution survives and the turn streams
canonical `/api/media/asset/:id` urls: stock still costs no storage and no credits (the row keeps an
`origin` rather than bytes), while an AI image is stored and metered per variation.

## 8. The chat / workspace agent (`services/core/ai/chat.ts`)

A real multi-step **tool-calling loop** — the AI SDK's `ToolLoopAgent`. The model answers in prose and calls
tools; the loop chains up to 6 steps (`stepCountIs(6)`). It is a full **workspace agent**, not a
generate-a-new-artifact bot: it can _see_ the user's library, _act_ on it, and edit any artifact — open,
in-chat draft, or a named library target.

**Toolset from the registry.** `wrap(tool, title, present, note)` turns a registry `Tool` into an AI-SDK
`tool()`: it runs the capability (forwarding its progress as `chat.nested` events), then `present`s the typed
result as a rich `ChatBlock` and returns a one-line `note` to the model. The **capability** is the shared
registry tool; chat only owns **presentation**. Block kinds: `proposal` (a patch + live section preview,
optionally `targetArtifactId`/`theme`/`format`), `suggestions`, `sections` (a carousel), `brief` (a
`GenBrief` confirm card), `artifacts` / `templates` (pick-lists), `outline` (a `BeatOp[]` revision of the live
plan), `write` (planned beat ids the studio builds), and `action` (a `WorkspaceAction` the client runs or
confirms).

**Thinking is distilled, not streamed.** Chat is the only capability that keeps thinking on (every other
call site passes `thinklessOpts()`, which zeroes the budget on Flash). The provider's thought summaries are
markdown essays, so `runChat` accumulates them server-side and forwards only the step HEADLINES through
`chat.thinking` — `services/core/ai/thinking.ts` pulls the model's own bold step names, falling back to the
opening sentence of each finished paragraph, clipped to one line and de-duplicated. A half-written heading
never ships, so a step can't change under the user. The full prose never crosses the wire. The client shows
one line at a time while the agent reasons, then collapses to "Thought in N steps" you can open. Answer
prose is unaffected and still streams token by token.

`chat.tool` is sent **twice** per call — once to open the widget shell, once with `done: true` from `wrap`'s
`finally`. The client upserts on `blockId`, so a tool whose `present` returns null (`read-artifact` always;
`show-sections` / `find-artifacts` / `find-templates` when empty) still closes its shell instead of spinning
for the rest of the session; the turn's own `finally` closes any left open by an abort. `chat.nested` carries
a capability's progress events up to its shell, where a `narration` becomes the shell's subtitle.

**Per-surface toolset — every surface has tools; the library agent is NOT tool-less.**

- **Always available**: `find-artifacts`, `read-artifact`.
- **Not generating** (library or editor): `propose-generation` (confirm-card a NEW artifact — supports
  `sourceFromMessage` paste-as-source and `sourceArtifactId` repurpose), `find-templates`, `edit-artifact`
  (edit a named library artifact by id), and the management set — `rename-` / `move-` / `duplicate-` /
  `trash-` / `restore-artifact`, `create-folder`, `share-artifact`, `export-artifact`. All of it stands down
  mid-run: inside a generation there is nothing to create and nothing else to reorganize.
- **Generating only** (`context.generation` present), all four local `tool()`s in `chat.ts` rather than
  registry capabilities, because none makes a sub-model call and all resolve on the client:
    - `revise-outline` — add / update / remove / move beats in one call, changing the PLAN. The agent writes
      the beat content itself, so there is nothing to meter; ids it invents for new beats are re-assigned by
      the studio.
    - `write-section` — EXECUTE the plan: it proposes which planned beats to build (`beatIds`), and the studio
      runs the same `build` turns the board does (`buildSections` → `buildSectionNow`), so a section is written
      by one code path whoever asked for it. The tool itself is free; the writing bills per `build` turn, and
      the card shows that price before the user starts it. It refuses ids that aren't in the outline and skips
      ones already written, telling the model which. Without it the agent's nearest match was `add-section`,
      which mints a _new_ section beside the plan and leaves the planned beat unwritten — the outline and the
      piece drift apart. The prompt says so explicitly.
    - `request-plan` — REPLAN the arc wholesale before anything is written. A proposal card: applying
      it runs the studio's own `plan` turn, optional `guidance` rides into the brief's
      `clarifications`, and `andWrite` rolls straight into the build loop. Both the tool and the client
      commission refuse once any section is written, since a replan would mint beat ids over existing
      slots — reshaping a half-written run is `revise-outline`'s territory.
    - `steer-sections` — set the standing note every section still to be written must follow, which the
      studio threads into each `build` turn as `input.steer`. It is the one generate-surface tool applied on
      arrival rather than proposed: it writes nothing, costs nothing, and asking the user to confirm their own
      instruction reads as a stall. The card it leaves in the thread is the record, and carries a Clear. One
      note is in force at a time, an empty note clears it, and `ChatGeneration.steer` reports the current one
      back so a follow-up amends rather than repeats. This replaced a text field in the studio rail: a
      standing instruction is a thing you say, not a control you fill in.
- **`rewrite-passage`** (content-scoped) — reword ONE passage inside a written section rather than the
  whole thing: `sectionId` + `find` (copied verbatim) + `instruction`. `services/core/ai/locate.ts` locates the
  text node (normalized exact match, else the _shortest_ containing node, so a common word lands on the
  heading rather than swallowing the paragraph) and returns the section with just that node replaced, which
  chat presents as an ordinary proposal. It exists because `rewrite-text` returns a bare string with no
  target — usable by the editor, where selection says where it goes, but a dead end for the agent. When no
  passage matches it lists the section's real passages back to the model rather than rewriting the wrong one.
- **`revise-element`** and **`reimage`** (content-scoped) — the other two "regenerate one part" tools,
  targeted the same way, since the agent has no selection to point with. `revise-element` takes
  `sectionId` + `elementType` (+ `nth`) and re-rolls that one chart / stat / table in place; `reimage`
  takes `sectionId` + `phrase` and re-sources the section's image, or its full-bleed backdrop with
  `target:"backdrop"`. Both resolve a path via `services/core/ai/locate.ts` and return the whole section, so
  they ride the ordinary proposal path. A miss lists the section's real element types back to the model.
  `reimage` itself is free: `resolveImage` honours the turn's image strategy, so it finds stock unless the
  run was started with AI images, and the route meters the variations it actually generated.
- **Content-scoped** (added when there's an artifact/draft to act on — mid-run that means sections actually
  _written_, so an empty draft can't invite `add-section` for an unwritten beat): `suggest-sections`,
  `add-section`, `rewrite-section`, `show-sections`, `reorder-section`, `remove-section`, `set-format`,
  `set-theme` — the tools that act on _the current_ piece.

The system prompt (`prompts/chat.ts`) matches: an **editor persona** with the section map + selection focus +
theme list, or a **library persona** that's explicit it can build here _and_ see/organize existing work — it
never tells the user to "click New artifact" or claims an edit it didn't make. Both are grounded in the same
registry.

**The three architectural seams** every capability lands on:

- **Seam A — read spine (server-side, DB-backed).** The turn is authenticated, so `find-artifacts` /
  `read-artifact` run against Postgres through the injected `WorkspaceReader` (`makeWorkspaceReader(wsId)` in
  `services/core/ai/reader.ts`) — no content shipped from the client, `model` stays pure. `read` returns
  a compact digest (`artifactSpine` + `artifactDigest`), never the raw tree.
- **Seam B — edit a target.** A `proposal` carries an optional `targetArtifactId` (absent = open artifact /
  active draft). `edit-artifact` loads a library artifact, rewrites a section, and returns a proposal tagged
  with its id + theme/format; applying saves straight to that artifact (no open needed). The structure tools
  (`reorder`/`remove`/`set-format`/`set-theme`) emit existing patch ops, so the **same** proposal model edits
  open / draft / library targets uniformly.
- **Seam C — workspace actions (mutations + a confirm gate).** Management tools return a `WorkspaceAction`;
  the **client** executes it. Reversible ops (rename / move / duplicate / create-folder) run and the client
  refreshes; **destructive or outward-facing** ops (trash, share-link, export) render as a confirm/route card
  and run only on an explicit click. The server agent only ever _proposes_.

**Streaming.** A tiny async channel (`createChannel`) lets tools push their blocks _while_ the model is still
talking; draining the agent's `fullStream` is what drives the loop — `reasoning-delta` → `chat.reasoning`,
`text-delta` → `chat.text`.

**The approval gate is client-side.** The artifact lives in the editor / draft / DB; the server never mutates
it. Every `proposal` carries a `patch` the user Applies (→ `applyPatch` + `commit`, or save-to-target) or
Discards; every destructive/outward `action` waits for a click.

**Cross-cutting (enforced):**

- **Metering.** Reads + management are free; content generation/edits stay metered. A chained content sub-tool
  reports its `usage` via `opts.onUsage`, which the route bills on top of the reserved `ask-assistant` base
  (§11).
- **Safety.** Trash / share / export **always** go through the confirm/route card — the agent proposes, the
  user commits. Upgrade/pay and permission-scope changes are **hand-off only**: the credit line tells the
  agent to point at the pricing page and **never** purchase or change a plan itself.
- **Refresh discipline.** Any turn that mutates the library ends with the client calling
  `loadLibrary()`/`loadFolders()` so the optimistic stores reflect server truth (mirrors `loadBilling()`).
- **Grounding honesty.** The agent acts only on real ids returned by `find-artifacts` — never invents an
  artifact or claims an action it didn't take (the same rule as section ids).

**Model.** The agent _reasons_ (picks + chains tools), so it runs on `chat`'s task model with **thinking on**
(§9); the content tools it calls keep their own fast, thinkless models.

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
Gemini's summarized thoughts as `chat.reasoning`.

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
system  =  PERSONA  +  surfaceVoice(deck|doc|web)  +  describeTheme(id)        ← who + register
        +  elementCatalog() + layoutCatalog()                                   ← the contract (from @model)
        +  SECTION_RULES + VOICE + sectionExemplars(surface)                    ← the quality bar (from demos)
        +  <output envelope: SECTION_OUTPUT | ELEMENT_OUTPUT | OUTPUT_NOTE>
prompt  =  briefContext(input) | artifactSpine | neighbors | placement          ← the pulled context
        +  <the ask>
```

The **system** teaches identity + contract + taste (stable, cacheable); the **prompt** carries the specific
ask + context. Cheap high-volume ops (rewrite/translate) deliberately drop the catalog and use a lean persona.

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

Every route does auth → `aiReady()` gate → **reserve credits** → run. The gate reserves a size-aware estimate
up front (`estimateCost(toolId, meter)` from `@model/credits`), 402s when the workspace allowance is spent, then
deducts against `workspaces.aiCreditsUsed`.

```
POST /ai/turn      SSE. Runs a turn (generate · plan · build · section · chat live; edit → 501). ACTION_FOR
                   maps the TurnKind to its priced tool (generate→generate-artifact, plan→plan-outline,
                   build→add-section, section→add-section, chat→ask-assistant, edit→revise-artifact) and
                   meters generate by length + image source; a build turn with an AI-image brief reconciles
                   real generated images on top of its section base. Frames each TurnEvent as
                   `data: {seq, event}`.
POST /ai/brief     Meters draft-brief (1 cr, refunded on failure). Expands a raw prompt into a BriefDraft (goal/audience/tone/mustInclude +
                   ≤1 clarify question); `{brief:null}` on failure — the studio falls through to the raw prompt.
POST /ai/suggest   UNMETERED. Cheap "what to add next" ideas (the insert popup); client caches per artifact.
POST /ai/theme     One structured ThemeInput from a prompt. Meters generate-theme.
POST /ai/element   Regenerate one element in place → { element }. Meters revise-element. The element rides in
                   the body (the runtime can't traverse the canvas tree).
POST /ai/text      Rewrite / translate one passage → { text }. Meters rewrite-text / translate-text.
GET  /ai/voice     UNMETERED. `{ ready }` — whether dictation is configured; the chat mic hides on false.
POST /ai/voice-token  UNMETERED, rate-limited (30/min). Mints a single-use ElevenLabs realtime-STT socket
                   url (`services/core/ai/voice.ts`; 15-min TTL, consumed on connect). Audio then streams
                   browser → provider directly — it never transits Galleo. The client (`app/components/
                   voice.ts` + `VoiceInput.tsx`) captures mic audio in an AudioWorklet, downsamples to
                   16 kHz PCM, and reduces partial/committed events into the hold-to-talk overlay;
                   release inserts the transcript at the composer caret. Needs ELEVENLABS_API_KEY.
POST /ai/notes     SSE. Writes speaker notes for the open piece: `{spoken, cues[]}` per section,
                   streamed as each lands. One structured call over the whole deck, because
                   continuity between adjacent notes is the point; a partial rewrite still sees
                   every other section and the notes already on them. Meters write-speaker-notes
                   by section count. Prompt: `prompts/notes.ts`; body: `tools/notes.ts`.
```

**Narration lives in its own router**, `services/api/narration.ts` over `services/core/narration.ts`,
because it is about audio rather than about a turn:

```
POST /artifacts/:id/narration   SSE. Synthesizes each section whose script has no current audio,
                                skipping cached ones. Meters narrate-artifact by characters and
                                settles to what was really spoken, so a mostly-cached run refunds.
GET  /artifacts/:id/narration   The manifest: per section {url, ms, spoken, alignment}, plus the
                                sections that have notes but no audio yet.
GET  /artifacts/:id/narration/:sectionId?v=<hash>   The bytes, immutable-cached.
GET  /p/:slug/narration[/:sectionId]                The same two reads through `publicRead`, so a
                                password or a recipient token gates the audio exactly as it gates
                                the words. The access params ride in the audio urls, because an
                                <audio> element sends no headers of ours.
```

**Background music** is the third thing in this feature derived from the content and cached by what
produced it, in the same router over `services/core/soundtrack.ts`:

```
GET  /music/presets                     The house set (`MUSIC_PRESETS` in core/ai/music.ts) and
                                        whether this deployment has generated each one yet.
POST /artifacts/:id/soundtrack          Either a preset or a bed written for this piece. Meters
                                        compose-soundtrack by the minute and settles to zero when
                                        the bed was already built, so asking twice is free.
GET  /artifacts/:id/soundtrack          The bed this piece plays, or null. Never generates: an
                                        anonymous link viewer reaches the same function and
                                        cannot be billed.
GET  /artifacts/:id/soundtrack/:trackId The bytes. A custom bed is only servable through the
                                        artifact it belongs to.
GET  /p/:slug/soundtrack[/:trackId]     The same two reads through `publicRead`, gated exactly as
                                        the narration pair is.
```

A **preset** is generated once for the whole deployment and shared by every workspace, which is what
keeps the common case at one provider call ever; `services/core/__tests__/soundtrack.itest.ts` asserts
that by call count rather than by row count, as the voice adoption cache does. A **custom** bed is
written from what the piece already says about itself: the theme's mood (a human-written phrase) or
its descriptor, whether the theme is dark, the format, and the title. That prompt is deterministic and
costs nothing, so no LLM turn is involved and there is no tool in the catalog for it. When the piece
is narrated the request carries the narration's total length, so the bed runs exactly as long as the
voice rather than looping under it.

Playback ducks: `duckedVolume` in `@model/artifact` drops the bed to `MUSIC_DUCK` while narration
speaks. Export ignores music entirely, as it ignores narration.

**The control is the present bar's music button**, and it is the on-ramp rather than only a mute.
`SoundtrackSource.enable` is wired where the caller may edit the piece, and the first press is what
turns music on: it builds the default preset if the deployment has none, records `music.on` on the
artifact, and plays. Every press after that is play/pause, because pausing mid-talk must not rewrite
the artifact. A link viewer gets no `enable`, so on publish the button appears only once a bed exists
and does nothing but play what the presenter chose. Which bed a piece uses stays with the picker in
a picker the editor no longer carries; the bar is one button and has no room to ask.

**Nothing is prepared ahead of time.** Pressing play in present is the only trigger, and it does both
halves for the section it is about to speak: write the script if there is none, then record it. The
first press is the only wait, because `prefetch` runs a section ahead of the voice.

A script is stamped with `SectionNotes.of`, the `sectionFingerprint` of the section it was written
against (`model/artifact.ts`, FNV-1a over the section's words alone, so moving a box does not
invalidate an accurate script). That makes three states tellable apart, and `needsScript` folds the
first two:

```
no notes                    → write them
notes, source "ai",  of ≠   → the copy moved out from under the script; rewrite it
notes, source "human"       → never rewritten, whatever the fingerprint says
notes written before `of`   → counted as current, so a deploy rewrites nobody's notes at once
```

Staleness reaches the audio too. The player treats a stale section as a cache miss even when it has a
recording, because audio made from a script that no longer describes the slide is wrong rather than
merely old; the rewritten words then change the narration hash, so the section re-records itself.

After the first section is speaking, `scriptRest` writes everything still unscripted in one pass
behind the voice (`editor/core/notes.ts`), and every section after the first waits on that pass rather
than asking for its own script. Per-section first buys latency, the whole-piece pass buys continuity.

**Nothing is recorded until someone asks.** Opening a present surface reads the manifest and stops
there. An earlier build filled the whole piece in the background on mount, which meant every open of
every piece paid to narrate it, including the ones nobody was ever going to listen to; the spend is
now behind a press. Concurrent asks for the same section still share one request rather than paying
twice, which is what the in-flight map in `createNarrationPlayer` is for.

The bar's one button therefore has three states, and the icon says which: a **mic** when the piece has
no audio yet, because the press records before it can speak and a play triangle would misdescribe it;
a **spinner** while that recording happens; and **play/pause** once there is something to hear.

Writing and recording are wired only where the caller may edit. Recording spends the artifact owner's
credits, so an invited viewer and a published link play what is already there and record nothing; the
alternative is a control that can only answer 403.

There is no speaker-notes editor. Notes are written by the model, on demand, and read in the present
notes pane; `SectionNotes.source` still distinguishes writing a person did, because rows predating
this exist and must never be rewritten under them.

Synthesis itself is `services/core/ai/speech.ts`: always the `with-timestamps` endpoint, since the
character alignment cannot be reconstructed afterwards and is what the caption overlay and the
per-page step timing are built from. The cache key is
`sha256(spoken + voice + model + output_format)`, so editing one section invalidates that section and
changing the voice invalidates the piece.

**Voices** are `services/api/voices.ts` over `services/core/voices.ts`: browsing the provider's
community library (unmetered, rate-limited, provider previews cost nothing), saving to a per-workspace
shelf, auditioning a saved voice on one short line, and designing one from a description. Adoption is
**install-wide and idempotent on `voices.library_id`**: a community voice must be added to the calling
account before it can speak, that add is capped monthly on the single account serving every workspace,
and per-tenant adoption of the same popular voice would spend the allowance on duplicates.

**Reconciliation (turn route).** The reserve is a pre-flight estimate; the `finally` block trues it up to what
actually ran, even on a mid-turn error:

- **Chat sub-tools** report their `usage` through `onUsage`; the route accumulates it and bills it **on top**
  of the reserved `ask-assistant` base (a chat turn that generated a section costs the reply _plus_ the
  section).
- **AI images**: `imageSource:"ai"` (and `imageGenReady()`) counts each generated image, then reconciles the
  generate estimate to the real count (a stock fallback is unbilled). `edit` never charges — it 501s before
  the reserve.

The non-streamed routes (`/theme`, `/element`, `/text`, `/suggest`) mirror each other exactly — a single
call, a credit reserve, a typed JSON result — and each has a matching editor seam (§12). A sibling
`POST /media/generate` (in `services/api/media.ts`, the media module) streams N AI-image variations for the
media picker off the same `generate.ts` engine.

## 12. Client wiring + end-to-end traces

The editor stays **app-free**: it exposes injected seams, and the app registers transports in
`EditorView.tsx`. No host wired → the feature simply doesn't appear. (Fuller client detail is in
`frontend.md`.)

```
editor seam (editor.ts)     app transport (api.ts)      route          the flow
onSectionStream             streamTurn (SSE)            /ai/turn       editor/core/ai.ts (insert)
onSuggestSections           api.suggestSections         /ai/suggest    the insert popup's idea chips
onReviseElement             api.reviseElement           /ai/element    editor/core/ai.ts (regenerate)
onTextAssist                api.assistText              /ai/text       editor/core/ai.ts + TextAiMenu
(chat uses streamTurn directly)                          /ai/turn       app/stores/chat.ts + app/views/ChatPanel.tsx
```

- **`streamTurn`** opens `POST /ai/turn`, reads the SSE body, parses each `data:` line back to a `TurnEvent`,
  and hands it to an `onEvent` callback — the one path whether the events drive the build animation or the
  chat thread.
- **In-canvas flows** paint a live skeleton from the `plan` event, then land the real content: `section-gen`
  reserves a placeholder slot and commits the section as one undo step; `element-gen` shimmers the element
  and swaps it in; `text-assist` splices the rewritten passage back into the live text field.
- **The chat dock** folds the streamed events into an ordered list of UI blocks per message (`chat.text` →
  prose, `chat.reasoning` → a thinking bubble, `chat.tool` → a "working…" shell, `chat.block` → a
  proposal/suggestion/carousel/brief/pick-list/action), applies a proposal's patch (open / draft / target) on
  Apply, and runs a `WorkspaceAction` (with a confirm card for destructive/outward ones) on click.

**The generation studio** (`app/views/generate/` + `app/stores/generate.ts` over the pure helpers in
`app/stores/generate-plan.ts`) replaced the one-shot Generate modal with a staged, human-in-the-loop
session: **Intake → Outline → Build**, one small turn per step, the client as the state machine.
It is a single full-screen surface (`Modal size="screen"`, stamped with the session theme so the whole
studio recolors with the artifact) whose body switches per stage; the chat rail sits alongside throughout.

There are **no run-mode or gate settings**: the prompt always goes straight to an arc, and the outline is
where every remaining decision is made. Two ways to build, both one click at the board — **Write all N**
(the loop runs to the end) or **Write this one** per card (which parks the loop, so writing stays one
section at a time). Editing the outline is what shaping the arc means, so a separate "steer the plan"
mode would be a second way to do the same thing. The stages:

- **Intake** — a centred composer that owns its own settings (format / length / image-source as compact
  dropdowns in its footer, beside the attach actions) plus **context to build from**: pasted text and
  dropped text files, merged into `GenerateInput.source` (`app/stores/attachments.ts`; binaries are
  refused with a reason rather than read as mojibake, and the 6000-char planner clip is surfaced). The intake is
  also the app's ONE create entry ("New artifact" on every device — the old create modal is gone):
  below the composer, a template row live-matches the typed prompt against the edge-safe
  `TEMPLATE_INDEX` (`model/templates.ts`; curated picks lead when empty, hidden when
  nothing fits, and the rest of the catalog windows in as the strip scrolls) with bodies fetched
  once for thumbnails (`app/stores/templates.ts`), and a one-line
  start-blank row covers the empty-canvas path (`createBlank` in the library store).
- **Brief** — no longer a stage. The **planner reports its own reading**: `zOutline` carries `goal` /
  `audience` / `tone` / `mustInclude`, and `runPlan` emits them on the `plan` event as `BriefRead`, so the
  fields fill themselves with no extra call, latency, or credit. The client absorbs them only into fields
  the user hasn't set, so a reroll can't overwrite a typed goal. Because the planner now names its own
  must-cover points, the `covers` instruction applies on every run rather than only when the user supplied
  points, which is what makes the outline's coverage tags appear at all. `POST /ai/brief` remains as the
  on-demand "read it again" from the brief bar.

- **Brief** — `POST /ai/brief` expands the prompt into an editable card (goal / audience / tone / length /
  must-cover chips + at most one clarify question). Best-effort: on failure the raw prompt stands.
- **Outline** — a `plan` turn (3 cr) returns the beats; the canvas renders each as an **editable section
  card** at the width of the section it becomes (`OutlineCard.tsx`): title, takeaway and points edited in
  place (`inline.tsx` — auto-growing transparent fields), layout glyph, role, coverage tags, and per-card
  actions (write this one, add, remove, reorder; drag from the grip). Beats are the board's spine at every
  stage, so an unwritten beat stays a card while a written one is the painted section, and nothing moves
  when it lands. "Reroll" replans from the same brief; the Build CTA prices the commitment explicitly.

    While a full run is in flight the board is **locked**: `runLocked()` (building, not paused, something
    active or queued) puts the scroller in `overflow-hidden` — which still permits the programmatic `scrollTo`
    that follows the active section — plus `pointer-events-none` and `select-none`, and floats a Stop pill
    over the canvas. Stopping is `pauseBuild()`, which unlocks immediately and hands back every intervention
    path at once (outline edits, per-section rework and versions, the console). The in-flight section still
    lands, since writes are atomic.

    Two invariants keep the board from re-rendering itself as it fills, both easy to undo by accident:
    `<For>` iterates **beat ids**, not view objects (Solid keys by reference, so a fresh object per read
    disposed and rebuilt every row on any store write), and each `Frame`'s paint effect **guards on a
    signature** of section / ghost shape / width / theme / format, animating the reveal only when a genuinely
    new section arrives. Without either, one section landing repainted the whole board and replayed every
    reveal, which reads as the artifact reloading.

- **Build** — the client loops one `build` turn per beat (2 cr each, billed as written, not reserved up
  front). Rework while it runs: each landed frame gets a verdict bar (regenerate · regenerate
  with a note) and version chips (every take kept; pick the keeper). A **steer** field
  injects into every later section's prompt; **pause / stop-here** park the loop at a section boundary
  (writes are atomic); a one-time **tone check** pauses after the cover + first content section. The draft
  artifact is persisted at build start and re-saved per landed section, so closing the studio never loses
  built work.

    A beat that does not land is **retried once as a second turn**, since a stream that dies takes its
    generator with it and the server cannot retry inside a turn that is already gone. If the second try
    is also empty the slot is marked `failed` and the loop moves on: the run finishes, the board keeps
    that beat as its outline card with Write still on it, and a narration line says how many were
    missed. It is deliberately not a `fail()`, which would put the studio in the `error` stage, raise a
    modal, and strip the Write button off every unwritten card, so the one thing the message asked for
    was the one thing the screen no longer offered.

**Traces:**

- **Studio generate** — Generate modal → `POST /ai/brief` → confirm → `POST /ai/turn {plan}` (ghost
  skeletons + backdrop) → edit + approve → N × `POST /ai/turn {build}` (sections land one by one; regens
  are `{build, replace:true}`) → open in editor.
- **One-shot generate** (chat's propose-generation path; the studio's Instant is the same experience) —
  `POST /ai/turn {generate}` → `runGenerate`: `plan` (skeletons appear) →
  per-section `addSection` patches (sections stream in) → `setMeta` (backdrop) → `turn.done`.
- **Insert a section** — "＋ AI section" → `section-gen` → `POST /ai/turn {section}` → `plan` (one skeleton) →
  `addSection` at `afterId` → committed as one undo step.
- **Regenerate an element** — ContextBar ✨ → `element-gen` resolves the target (climbs coupled parents) →
  `POST /ai/element` → `reviseElement` → swapped in place.
- **Rewrite text** — text bar ✨ → `text-assist` → `POST /ai/text {rewrite}` → `rewriteText` (Flash) →
  spliced into the selection.
- **Chat (editor)** — ChatPanel → `POST /ai/turn {chat}` → `ToolLoopAgent`: prose streams as `chat.text`; a
  tool call streams `chat.tool` → `chat.block` (a proposal with a live preview); Apply commits its patch.
- **Chat (library, edit a named artifact)** — "make the intro of my Aria deck punchier" → `find-artifacts` →
  `read-artifact` → `edit-artifact` → a `proposal` tagged with `targetArtifactId`; Apply saves to that
  artifact and refreshes the library thumbnail — no editor open.
- **Chat (library, build)** — "turn this into a deck" (pasted text) → `propose-generation`
  (`sourceFromMessage:true`) → a `brief` confirm card → Generate builds inline.

## 13. Status + Planned / deferred

**Live** (working builder + runtime + route):

- **Generation + editing:** the staged **generation studio** (brief → outline gate → per-beat build with
  steer/pause/versions, §12) · one-shot generate (the same runtime, gates on auto) ·
  insert-section · regenerate-section · regenerate-element · rewrite/translate text · translate-artifact
  (fan-out) · generate-theme · suggest-sections.
- **Images:** stock sourcing across four providers + **AI image generation** — wired into the generate
  pipeline (`imageSource:"ai"` → Gemini image model, stored as a workspace asset, metered per variation) and a
  standalone `/media/generate` streaming route for the media picker.
- **Pricing:** the unified tool catalog with per-tool pricing + the pre-flight credit gate + turn-level
  reconciliation.
- **The chat / workspace agent on both surfaces** (roadmap Phases 1–6 + the Phase 7–8 core): the find/read
  spine · edit-a-named-artifact + open/navigate · rename / move / duplicate / create-folder / trash(confirm) /
  restore · reorder / remove / set-format / set-theme · templates + credit awareness · share/export routing
  (guarded) · **paste-as-source** ("turn THIS into a deck") · **repurpose** ("turn my report into a deck", via
  `GenerateInput.source` + `sourceArtifactId` fed into the outline phase).

**Planned / deferred** (net-new infra, kept off the critical path — no band-aids):

- **Whole-artifact `edit` runtime.** The `edit` turn kind + `revise-artifact` tool are defined and priced, and
  no prompt builder exists for it yet and the route 501s — one revision over the whole tree is a distinct
  reasoning task on Pro that isn't wired yet.
- **Source-grounded generation, remaining sources.** Paste-as-source and single-artifact repurpose ship; still
  deferred are **URL fetch** (needs SSRF-safe fetching) and **PDF / file upload** (needs robust extraction +
  upload) as generation sources, plus generation **variations** (N drafts to compare — a UX surface).
- **Cross-artifact repurpose (multi-source).** True **merge / extract** across two+ artifacts ("pull the
  charts from Q3 into a new update", "merge these two", "reuse the Aria theme") — repurpose already covers
  single-source "report → deck"; multi-artifact context is the highest-leverage, highest-effort follow-up.
- **The as-yet-unsurfaced priced actions** — `suggest-title`, `write-summary` / `write-alt-text` /
  `write-speaker-notes` (priced in the catalog, no route/seam yet).
- **Platform seams:** an **MCP adapter** over the same registry (a fourth surface, no capability redefined);
  **event-log persistence + SSE resume** (the `seq` cursor + `LoggedEvent` exist for it); **thread
  persistence** for chat; and a tightened **discriminated element-union schema** (today `data` stays open and
  the prompt teaches the fields).
