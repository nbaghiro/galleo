# AI — technical guide

How every AI capability in Galleo works end to end: the streamed **turn protocol**, the single **tool
catalog** (identity + pricing), the **registry** that executes it, the **runtime** that generates and edits
content, the **chat agent**, the **HTTP routes** + credit gate, and the **client** that drives it all. This
is the real backend — the old client-side generation _simulator_ is gone.

Companion to `architecture.md` (the file map + layering law), `flex-format.md` + `elements-and-editing.md`
(the content tree the AI writes), and `billing.md` (credits). Where this doc says "the element tree", the
shape lives in those docs — it is not duplicated here.

## 1. The map

```
model/                         the PURE contract (edge-safe; imports nothing above model)
  ai.ts        the turn PROTOCOL (turns · patches · events · applyPatch) + the authoring CATALOG (elements,
               layouts, text styles the LLM writes against)
  tools.ts     the ONE tool catalog: every capability's identity, tier, surfaces, AND its pricing
               (usage + meter + live) — plus estimateCost / costRange / typicalCost / PRICED_TOOLS
  credits.ts   the metered-credit engine (Usage bag + costOf); tools.ts prices against it

services/ai/                   the runtime (depends only on model; may NOT import canvas)
  models.ts    the model registry — `provider:model` ids + DEFAULT_MODELS per task
  provider.ts  resolveModel(id) → a Vercel AI SDK LanguageModel; aiReady()/providerReady()
  schema.ts    the Zod output schemas — zOutline · zSectionPlan · zSection · zElement · zTheme · …
  run.ts       the turn runtime — runTurn dispatch + runGenerate/runSection/reviseElement + image sourcing
  text.ts      the fast text runtime — rewriteText / translateText
  chat.ts      the chat agent — an AI-SDK ToolLoopAgent whose toolset is built from the registry
  suggest.ts · theme.ts · quality.ts    focused capabilities (suggestions · theme gen · section audit)
  tools/       the executable registry: registry.ts (Tool<I,R> + ctx.use + register) + one file per
               capability (generate · section · element · text · suggest · inspect · media · theme) +
               register.ts (side-effect: registers the whole catalog)
  prompts/     the pure prompt-string builders (see ai-prompts.md)

services/api/
  ai.ts        the routes: POST /ai/{turn,suggest,theme,element,text} — auth + credit gate + SSE framing
  billing.ts   the credit ledger the gate charges against (POST /billing/spend, GET /billing)

editor/ + app/                 the client (thin — speaks the protocol, never the model)
  editor/editor.ts             injected seams: onSectionStream · onSuggestSections · onReviseElement · onTextAssist
  editor/ai/                   the in-canvas flows: section-gen · element-gen · text-assist + TextAiMenu
  app/stores/chat.ts + app/views/ChatPanel.tsx    the chat dock: chat.ts (thread + dispatch) + ChatPanel.tsx
  app/api.ts                   streamTurn (SSE reader) + the JSON transports; wired in EditorView.tsx
```

## 2. The three invariants that decide the shape

1. **`services` may not import `canvas`** (ESLint: `model ← canvas ← editor ← app`; `services → model`
   only). The live element registry lives in `canvas`, so the backend can't introspect it — the AI's whole
   content contract therefore lives in **`model/`** (`ai.ts` catalog + `tools.ts` + the Zod schemas).
2. **The AI writes content, never layout.** It emits the element tree (`{ type, data }` per element, a
   `layout.width` per column child); the engine renders that identically to deck / doc / web and to PDF. The
   AI never touches pixels — see `flex-format.md`.
3. **The seam is the `TurnEvent` stream (SSE) plus a few JSON routes.** Structured generation, credit
   metering, and auth wrap the runtime; the client only ever parses events and applies patches. Swap the
   model or a prompt and nothing on the client changes.

## 3. The turn protocol (`@model/ai`)

A **turn** is one request the client makes; the runtime answers with an ordered stream of **events**; some
events carry **patches** (structural ops) the client applies to the artifact.

**Turns** — `TurnRequest = { kind, input }`, `TurnKind = "generate" | "edit" | "section" | "chat"`:

| kind       | input                                                                      | what it does                                                   |
| ---------- | -------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `generate` | `GenerateInput` (prompt, surface, theme, goal?, audience?, tone?, length?) | build a whole artifact                                         |
| `section`  | `SectionInput` (instruction, afterId, content)                             | write + insert ONE new section                                 |
| `chat`     | `ChatInput` (message, context, history?)                                   | a conversational agent turn                                    |
| `edit`     | `EditInput` (instruction)                                                  | whole-artifact revision — **not yet implemented** (route 501s) |

`ChatContext` carries the surface (`editor` with the open `content` + `focus`, or `library` with a
`ChatLibrary` workspace summary — recent titles + count) so the agent grounds itself per surface.

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
as skeleton hints during planning) live in **`flex-format.md`**.

Two deliberate simplifications keep LLM output reliable:

- **Charts/diagrams are one element type with a `data.type` discriminant** (`{ type:"chart", data:{ type:
"line", … } }`), not 25 variant element types.
- **Images take a description, not a URL.** The model writes `src:"aerial view of a wind farm at dusk"`; the
  runtime resolves it to a real stock URL (§7). A genuine `http…` src passes through untouched.

**Structured output + validation** (`services/ai/schema.ts`): Zod keeps the _shape_ honest — an outline is
titled beats (`zOutline`/`zBeat`), a section is `{ id, root }` (`zSection`), an element is `{ type, data,
layout? }` (`zElement`) — while leaving each element's `data` **open** (the prompt, not a rigid schema,
teaches the per-element fields; the element specs tolerate extra/missing keys). The outline runs as
`generateObject`; a section is free-form JSON validated on parse, because Gecko-style response schemas can't
populate arbitrary-keyed `data` maps (§7).

## 5. The tool catalog + pricing (`@model/tools`)

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
(reads like `show-sections`, internal primitives). The pricing helpers — `estimateCost(id, meter)`,
`typicalCost(id)`, `isMetered(id)`, `costRange(id)`, and `PRICED_TOOLS` (the "what your credits buy" list) —
all live here and key off `ToolId`. The credit gate (§12) and the `/pricing` page read straight off this;
retune a unit once and the paywall, the showcase, and every charge move together.

The catalog: 5 composites (`generate-artifact` · `revise-artifact` · `add-section` · `rewrite-section` ·
`revise-element`) + `ask-assistant` (the agent turn) · 12 actions (`rewrite-text` · `translate-text` · `translate-artifact` ·
`suggest-title` · `generate-theme` · `generate-image` · `write-summary/alt-text/speaker-notes` ·
`suggest-sections` · `show-sections` · `find-stock-image`) · 7 primitives (`plan-outline` · `plan-section` ·
`write-section` · `source-image` · `check-section` · `pick-arc` · `apply-patch`).

## 6. The tools registry (`services/ai/tools/`)

The executable half. A `Tool<Input, Result>` binds a `ToolId` to a Zod `input` schema and a `run` that
**yields progress and returns a typed result**:

```ts
run(input, ctx): AsyncGenerator<TurnEvent, Result>
```

The return value is what makes composites composable: `ctx.use(subTool, input)` runs another tool with the
**same context** (shared artifact + image strategy + abort signal) and, via `yield*`, forwards its events
while capturing its result. `makeContext(base)` builds that context; `register(tool)` adds it to the map;
`register.ts` imports every tool file for its side effect, so the whole catalog is present regardless of
which surface pulls from it. **Three surfaces read this one registry** — direct dispatch (§7), the chat agent
(§9), and (ahead) MCP — none redefines a capability.

One file per capability: `generate.ts` (the artifact composite, wraps `runGenerate`), `section.ts`
(`add-section` / `rewrite-section`), `element.ts` (`revise-element`), `text.ts` (`rewrite-text` /
`translate-text`), `suggest.ts`, `inspect.ts` (`show-sections`, a read that returns the sections), `media.ts`,
`theme.ts`.

## 7. The turn runtime (`services/ai/run.ts`)

`runTurn(req, opts)` is the dispatch table for the **direct** surface (a route consumes its generator and
frames it as SSE):

```
generate → generateArtifactTool.run(...)     // via the registry (§6), which wraps runGenerate
section  → runSection(...)                    // insert one section
chat     → runChat(...)                       // the agent (§9)
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
which is `zSection.safeParse`d. On bad JSON it retries once; a valid section is run through
`checkSection(section, surface)` (a deterministic quality audit — `quality.ts`) and, if it trips, regenerated
once with the issues fed back. Shared by generate and insert, so both get the same repair.

**`runSection`** mirrors generate scoped to one beat: `sectionPlanParts` → `plan` (so the skeleton renders) →
`insertSectionParts` → the written section → `addSection` at `afterId`.

**`reviseElement(content, sectionId, element, instruction?)`** regenerates ONE element in place (the
ContextBar Regenerate action + the `revise-element` tool). The element is passed **by value** — the runtime
can't traverse the canvas tree — with its section for context; it keeps the original `type` + the user's
hand-set `layout`, rewrites only `data`, then resolves any new images.

**`chatAddSection` / `chatEditSection`** are the plain functions the chat tools wrap to _propose_ a section
(returned, not streamed).

**Image resolution.** The model writes an art-director phrase; `resolveImage(phrase, orientation, opts)` turns
it into a real URL: AI generation when asked and wired, else stock search across providers (`unsplash →
pexels → pixabay → openverse`, the last keyless so there's always a fallback), else a deterministic
`picsum` placeholder. `resolveImages` walks a section's tree (images at any depth) + its background in
parallel. Stock stays a provider CDN URL — no storage, no credits.

## 8. The text runtime (`services/ai/text.ts`)

`rewriteText(text, instruction, opts)` and `translateText(text, language, opts)` are the highest-volume,
lowest-latency ops (a user polishing a headline). They run on the **fast, thinkless** model via plain
`generateText` — no JSON envelope, no retries — and `clean()` the result (strip a stray code fence or
quotes the model added). `opts.context` carries the full surrounding text when only a sub-range is selected,
so the edit stays coherent. Wrapped by the `rewrite-text` / `translate-text` tools; called by the `/ai/text`
route.

## 9. The chat agent (`services/ai/chat.ts`)

A real multi-step **tool-calling loop** — the AI SDK's `ToolLoopAgent`. The model answers in prose and calls
tools; the loop chains up to 6 steps.

- **Toolset from the registry.** `wrap(tool, title, present, note)` turns a registry `Tool` into an AI-SDK
  `tool()`: it runs the capability (forwarding its progress as `chat.nested` events), then `present`s the
  typed result as a rich `ChatBlock` (a `proposal` with a live section preview, a `suggestions` set, a
  `sections` carousel) and returns a one-line `note` to the model. The **capability** is the shared registry
  tool; chat only owns **presentation**.
- **Per-surface toolset.** With an artifact open, the agent gets `suggest-sections` / `add-section` /
  `rewrite-section` / `show-sections`. In the library (no artifact) it runs **tool-less** — purely
  conversational — so it never calls `add-section` on nothing. The system prompt (`prompts/chat.ts`) matches:
  an editor persona with the section map, or a library persona grounded in the workspace summary.
- **Streaming.** A tiny async channel lets tools push their blocks _while_ the model is still talking;
  draining the agent's `textStream` is what drives the loop and token-streams prose (`chat.text`).
- **The approval gate is client-side.** The artifact lives in the editor; the server never mutates it. The
  agent only ever _proposes_ — every `proposal` block carries a `patch` the user Applies (→ `applyPatch` +
  `commit`) or Discards.
- **Model.** The agent _reasons_ (picks + chains tools), so it runs on the stronger model with **thinking
  ON**; the content tools it calls keep their own fast, thinkless models.

## 10. Models + provider

`services/ai/models.ts` names every model `provider:model` and maps each **task** to a default. The whole
stack above provider is provider-agnostic — it asks for a task's model and calls the SDK against whatever
`resolveModel` returns:

```
outline · generate · section     google:gemini-2.5-flash     (thinking OFF)
rewrite · translate · theme       google:gemini-2.5-flash     (thinking OFF)
edit                              google:gemini-2.5-pro
chat                              google:gemini-2.5-pro       (thinking ON)
```

The load-bearing choice: **Flash for generation**, not Pro. A deck is ~12 sequential section calls, so Pro's
reasoning latency stacks up badly for little quality gain on bounded creative writing; `thinkingBudget: 0`
(`GEN_PROVIDER_OPTS` in `run.ts`) disables Gemini's default thinking to keep it snappy. Pro is reserved for
the two tasks that genuinely reason: whole-artifact `edit` and the `chat` agent (which sets **no**
`thinkingBudget`, so thinking stays on). Google leads because one `GOOGLE_API_KEY` also powers image (and,
ahead, video) generation; Anthropic / OpenAI / xAI stay registered for override. Routes reference tasks,
never raw ids, so re-tuning is one line. `provider.ts` builds one lazy SDK client per provider and
`aiReady()` lets a route degrade to 503 instead of throwing when no key is set.

## 11. The prompt system (`services/ai/prompts/`)

Pure, layered string builders — each capability stacks fragments into a `PromptParts = { system, prompt }`;
the composer imports no capability, so there's no cycle. The **system** teaches identity + contract + taste
(stable, cacheable); the **prompt** carries the specific ask + pulled context. Cheap high-volume ops
(rewrite/translate) deliberately drop the catalog for a lean persona. `persona.ts` (identity + surface
voice), `system.ts` (composers + `SECTION_RULES` + context helpers + output envelopes), `catalog.ts`
(`elementCatalog` / `layoutCatalog` / `describeTheme`, generated from `@model` so the prompt and the
validator can't drift), `rubric.ts` + `arcs.ts` + `exemplars.ts` (the quality bar, reverse-engineered from
the demos), and the capability builders (`generate.ts` · `chat.ts` · `text.ts` · `theme.ts` · `image.ts`).
The full prompt-level detail — every builder, the context each pulls, the composition — is in
**`ai-prompts.md`**.

## 12. Routes + the credit gate (`services/api/ai.ts`)

Every route does auth → `aiReady()` gate → **reserve credits** → run. The gate reserves a size-aware
estimate up front (`estimateCost(toolId, meter)` from `@model/tools`), 402s when the workspace allowance is
spent, then deducts against `workspaces.aiCreditsUsed`.

```
POST /ai/turn      SSE. Runs a turn (generate · section · chat live; edit → 501). ACTION_FOR maps the
                   TurnKind to its priced tool (generate→generate-artifact, section→add-section, chat→ask-assistant)
                   and meters by length. Frames each TurnEvent as `data: {seq, event}`.
POST /ai/suggest   UNMETERED. Cheap "what to add next" ideas (the insert popup); client caches per artifact.
POST /ai/theme     One structured ThemeInput from a prompt. Meters generate-theme.
POST /ai/element   Regenerate one element in place → { element }. Meters revise-element. The element rides in
                   the body (the runtime can't traverse the canvas tree).
POST /ai/text      Rewrite / translate one passage → { text }. Meters rewrite-text / translate-text.
```

The non-streamed routes (`/theme`, `/element`, `/text`, `/suggest`) mirror each other exactly — a single
call, a credit reserve, a typed JSON result — and each has a matching editor seam (§13).

## 13. Client wiring

The editor stays **app-free**: it exposes injected seams, and the app registers transports in
`EditorView.tsx`. No host wired → the feature simply doesn't appear.

```
editor seam (editor.ts)     app transport (api.ts)      route          the flow
onSectionStream             streamTurn (SSE)            /ai/turn       editor/ai/section-gen.ts (insert)
onSuggestSections           api.suggestSections         /ai/suggest    the insert popup's idea chips
onReviseElement             api.reviseElement           /ai/element    editor/ai/element-gen.ts (regenerate)
onTextAssist                api.assistText              /ai/text       editor/ai/text-assist.ts + TextAiMenu
(chat uses streamTurn directly)                          /ai/turn       app/stores/chat.ts + app/views/ChatPanel.tsx
```

- **`streamTurn`** opens `POST /ai/turn`, reads the SSE body, parses each `data:` line back to a `TurnEvent`,
  and hands it to an `onEvent` callback — the one path whether the events drive the build animation or the
  chat thread.
- **In-canvas flows** paint a live skeleton from the `plan` event, then land the real content: `section-gen`
  reserves a placeholder slot and commits the section as one undo step; `element-gen` shimmers the element
  and swaps it in; `text-assist` splices the rewritten passage back into the live text field.
- **The chat dock** (`session.ts`) folds the streamed events into an ordered list of UI blocks per message
  (`chat.text` → prose, `chat.tool` → a "working…" shell, `chat.block` → a proposal/suggestion/carousel), and
  applies a proposal's patch to the editor on Apply.

## 14. End-to-end traces

- **Generate** — Generate modal → `POST /ai/turn {generate}` → `runGenerate`: `plan` (skeletons appear) →
  per-section `addSection` patches (sections stream in) → `setMeta` (backdrop) → `turn.done`.
- **Insert a section** — "＋ AI section" → `section-gen` → `POST /ai/turn {section}` → `plan` (one skeleton) →
  `addSection` at `afterId` → committed as one undo step.
- **Regenerate an element** — ContextBar ✨ → `element-gen` resolves the target (climbs coupled parents) →
  `POST /ai/element` → `reviseElement` → swapped in place.
- **Rewrite text** — text bar ✨ → `text-assist` → `POST /ai/text {rewrite}` → `rewriteText` (Flash) →
  spliced into the selection.
- **Chat** — ChatPanel → `POST /ai/turn {chat}` → `ToolLoopAgent`: prose streams as `chat.text`; a tool call
  streams `chat.tool` → `chat.block` (a proposal with a live preview); Apply commits its patch.

## 15. Status + deferred

**Live:** generate · insert-section · regenerate-element · rewrite/translate text · generate-theme ·
suggest-sections · the chat agent (editor + library) · stock image sourcing · the unified tool catalog with
per-tool pricing + the credit gate.

**Deferred:** the `edit` (whole-artifact revise) runtime (route 501s); generate-in-chat (a `generate-artifact`
tool surfaced to the agent with a preview widget); AI _image generation_ wired into `resolveImage` (stock
only today); an MCP adapter over the same registry; event-log persistence + SSE resume; thread persistence for
chat; `contextRefs` grounding (attach docs/urls at intake); a tightened discriminated element-union schema.
