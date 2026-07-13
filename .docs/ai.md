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
  ai.ts        the turn PROTOCOL (turns · patches · events · applyPatch) + the authoring CATALOG (elements,
               layouts, text styles the LLM writes against)
  tools.ts     the ONE tool catalog: every capability's identity, tier, surfaces, AND its pricing
               (usage + meter + live) — plus estimateCost / costRange / typicalCost / PRICED_TOOLS
  credits.ts   the metered-credit engine (Usage bag + costOf); tools.ts prices against it

services/ai/                   the runtime (depends only on model; may NOT import canvas)
  models.ts    the model registry — `provider:model` ids + DEFAULT_MODELS per task
  provider.ts  resolveModel(id) → a Vercel AI SDK LanguageModel; aiReady()/providerReady(); thinklessOpts
  schema.ts    the Zod output schemas — zOutline · zSectionPlan · zSection · zElement · zTheme · …
  run.ts       the turn runtime — runTurn dispatch + runGenerate/runSection/reviseElement + image sourcing
  text.ts      the fast text runtime — rewriteText / translateText
  chat.ts      the chat/workspace agent — an AI-SDK ToolLoopAgent whose toolset is built from the registry
  suggest.ts · theme.ts · quality.ts    focused capabilities (suggestions · theme gen · section audit)
  tools/       the executable registry: registry.ts (Tool<I,R> + ctx.use + register + WorkspaceReader) +
               one file per capability (generate · section · element · text · suggest · inspect · library ·
               manage · structure · media · theme) + register.ts (side-effect: registers the whole catalog)
  prompts/     the pure prompt-string builders (see §10)

services/api/
  ai.ts               the routes: POST /ai/{turn,suggest,theme,element,text} — auth + credit gate + SSE framing
  workspace-reader.ts makeWorkspaceReader(wsId) — the DB-backed WorkspaceReader the agent's find/read tools use
  billing.ts          the credit ledger the gate charges against (POST /billing/spend, GET /billing)

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
   AI never touches pixels — see `rendering.md`.
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
"line", … } }`), not 25 variant element types.
- **Images take a description, not a URL.** The model writes `src:"aerial view of a wind farm at dusk"`; the
  runtime resolves it to a real image URL (§6). A genuine `http…` src passes through untouched.

**Structured output + validation** (`services/ai/schema.ts`): Zod keeps the _shape_ honest — an outline is
titled beats (`zOutline`/`zBeat`), a section is `{ id, root }` (`zSection`), an element is `{ type, data,
layout? }` (`zElement`) — while leaving each element's `data` **open** (the prompt, not a rigid schema,
teaches the per-element fields; the element specs tolerate extra/missing keys). The outline runs as
`generateObject`; a section is free-form JSON validated on parse, because Gecko-style response schemas can't
populate arbitrary-keyed `data` maps (§6).

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
(reads like `show-sections`, all the workspace management tools, internal primitives). The pricing helpers —
`estimateCost(id, meter)`, `typicalCost(id)`, `isMetered(id)`, `costRange(id)`, and `PRICED_TOOLS` (the "what
your credits buy" list = tools that are both `usage`-priced **and** `live`) — all live here and key off
`ToolId`. The credit gate (§11) and the `/pricing` page read straight off this; retune a unit once and the
paywall, the showcase, and every charge move together.

**The catalog — 41 tool ids** (7 composites · 28 actions · 6 primitives):

- **7 composites** (whole flows): `generate-artifact` · `revise-artifact` · `add-section` · `rewrite-section`
  · `edit-artifact` (rewrite a section of _another_ library artifact) · `revise-element` · `ask-assistant`
  (the agent turn).
- **28 actions** (single calls). Content + structure: `rewrite-text` · `translate-text` · `translate-artifact`
  · `suggest-title` · `generate-theme` · `generate-image` · `write-summary` · `write-alt-text` ·
  `write-speaker-notes` · `suggest-sections` · `show-sections` · `reorder-section` · `remove-section` ·
  `set-format` · `set-theme`. Workspace: `find-artifacts` · `read-artifact` · `rename-artifact` ·
  `move-artifact` · `duplicate-artifact` · `trash-artifact` · `restore-artifact` · `create-folder` ·
  `share-artifact` · `export-artifact` · `find-templates`. Media + system: `find-stock-image` · `apply-patch`.
- **6 primitives** (internal building blocks): `plan-outline` · `plan-section` · `write-section` ·
  `source-image` · `check-section` · `pick-arc`.

**Pricing — metered, not flat.** Cost = Σ of the primitive **units of work** an action produces. The units
(`@model/credits` `COST_UNITS`, anchored so a typical ~12-section, ~3-image build ≈ 40 credits):

```
plan 3   ·   section 2   ·   image 5 (per AI-generated variation)   ·   text 1   ·   theme 4   ·   reply 2
```

`costOf(usage)` floors at 1 so nothing is free. `estimateCost(id, meter)` is what the pre-flight gate reserves
and the UI previews. The **live, priced** tools ("what your credits buy") and their cost, folding in the
former ai-prompts credit column (now derived from the code above):

| tool                                                | usage (base)                  | typical / range  | notes                                               |
| --------------------------------------------------- | ----------------------------- | ---------------- | --------------------------------------------------- |
| `generate-artifact`                                 | `{plan:1,section:12,image:3}` | ~27–73 (metered) | scales by length; AI images add 5 each (stock=0)    |
| `add-section` / `rewrite-section` / `edit-artifact` | `{section:1}`                 | 2                | one section written                                 |
| `revise-element`                                    | `{text:2}`                    | 2                | one element reworked                                |
| `rewrite-text` / `translate-text`                   | `{text:1}`                    | 1                | one run, latency-sensitive                          |
| `generate-theme`                                    | `{theme:1}`                   | 4                | one token system (+ deterministic finalize pass)    |
| `generate-image`                                    | `{image:1}`                   | 5 (× variations) | AI image; metered per variation                     |
| `ask-assistant` (chat)                              | `{reply:1}`                   | 2 + sub-tools    | base reply; chained content tools bill on top (§11) |

Metered but **not yet `live`** (priced in the catalog, no route surfaced): `revise-artifact`
(whole-artifact edit, 12–40), `translate-artifact` (5–40, fan-out), `suggest-title`, `write-summary` /
`write-alt-text` / `write-speaker-notes`. All workspace reads + management tools are **free** (no `usage`).

## 6. The tools registry (`services/ai/tools/`)

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
- `media.ts` — `source-image` / `find-stock-image`; `theme.ts` — `generate-theme`.

## 7. The turn runtime (`services/ai/run.ts`)

`runTurn(req, opts)` is the dispatch table for the **direct** surface (a route consumes its generator and
frames it as SSE):

```
generate → generateArtifactTool.run(...)     // via the registry (§6), which wraps runGenerate
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
(returned, not streamed). `edit-artifact` runs `chatEditSection` over a library artifact loaded via the
`WorkspaceReader`.

**Image resolution.** The model writes an art-director phrase; `resolveImage(phrase, orientation, opts)` turns
it into a real URL: **AI generation** when the build asks for it (`GenerateInput.imageSource:"ai"` and the
image model is wired) via the Gemini image model (`services/media/generate.ts`), else stock search across
providers (`unsplash → pexels → pixabay → openverse`, the last keyless so there's always a fallback), else a
deterministic `picsum` placeholder. `resolveImages` walks a section's tree (images at any depth) + its
background in parallel. Stock stays a provider CDN URL — no storage, no credits; an AI image is stored as a
workspace asset and metered per variation.

## 8. The chat / workspace agent (`services/ai/chat.ts`)

A real multi-step **tool-calling loop** — the AI SDK's `ToolLoopAgent`. The model answers in prose and calls
tools; the loop chains up to 6 steps (`stepCountIs(6)`). It is a full **workspace agent**, not a
generate-a-new-artifact bot: it can _see_ the user's library, _act_ on it, and edit any artifact — open,
in-chat draft, or a named library target.

**Toolset from the registry.** `wrap(tool, title, present, note)` turns a registry `Tool` into an AI-SDK
`tool()`: it runs the capability (forwarding its progress as `chat.nested` events), then `present`s the typed
result as a rich `ChatBlock` and returns a one-line `note` to the model. The **capability** is the shared
registry tool; chat only owns **presentation**. Block kinds: `proposal` (a patch + live section preview,
optionally `targetArtifactId`/`theme`/`format`), `suggestions`, `sections` (a carousel), `brief` (a
`GenBrief` confirm card), `artifacts` / `templates` (pick-lists), and `action` (a `WorkspaceAction` the client
runs or confirms).

**Per-surface toolset — both surfaces have tools; the library agent is NOT tool-less.** Every turn gets a
workspace-wide toolset:

- **Always available** (library or editor): `propose-generation` (confirm-card a NEW artifact — supports
  `sourceFromMessage` paste-as-source and `sourceArtifactId` repurpose), `find-artifacts`, `read-artifact`,
  `find-templates`, `edit-artifact` (edit a named library artifact by id), and the management set —
  `rename-` / `move-` / `duplicate-` / `trash-` / `restore-artifact`, `create-folder`, `share-artifact`,
  `export-artifact`.
- **Editor-only** (added when an artifact/draft is open, i.e. `context.content` present): `suggest-sections`,
  `add-section`, `rewrite-section`, `show-sections`, `reorder-section`, `remove-section`, `set-format`,
  `set-theme` — the tools that act on _the current_ piece.

The system prompt (`prompts/chat.ts`) matches: an **editor persona** with the section map + selection focus +
theme list, or a **library persona** that's explicit it can build here _and_ see/organize existing work — it
never tells the user to "click New artifact" or claims an edit it didn't make. Both are grounded in the same
registry.

**The three architectural seams** every capability lands on:

- **Seam A — read spine (server-side, DB-backed).** The turn is authenticated, so `find-artifacts` /
  `read-artifact` run against Postgres through the injected `WorkspaceReader` (`makeWorkspaceReader(wsId)` in
  `services/api/workspace-reader.ts`) — no content shipped from the client, `model` stays pure. `read` returns
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

`services/ai/models.ts` names every model `provider:model` and maps each **task** to a default. The whole
stack above provider is provider-agnostic — it asks for a task's model and calls the SDK against whatever
`resolveModel` returns:

```
outline · generate · section     google:gemini-2.5-flash     (thinking OFF)
rewrite · translate · theme       google:gemini-2.5-flash     (thinking OFF)
edit                              google:gemini-2.5-pro
chat                              google:gemini-3.5-flash     (thinking ON — thoughts streamed)
```

The load-bearing choice: **Flash for generation**, not Pro. A deck is ~12 sequential section calls, so Pro's
reasoning latency stacks up badly for little quality gain on bounded creative writing; `thinklessOpts(id)`
(`provider.ts`) sets `thinkingBudget: 0` to disable Gemini's default thinking and keep it snappy — but only
for Flash, since Pro rejects a 0 budget ("only works in thinking mode"). Pro is reserved for whole-artifact
`edit`, the one task that genuinely reasons over the tree.

**Chat runs on `gemini-3.5-flash`, not Pro** — an eval (`services/ai/eval`, `pnpm ai:eval`) measured 3.5-flash
at 100% tool-routing accuracy vs 2.5-pro's 80%, at lower latency. It keeps thinking **on** (chat.ts sets
`thinkingConfig.includeThoughts: true`, so Gemini's summarized thoughts stream as `chat.reasoning`). Re-run
the eval before changing this default.

Google leads because one `GOOGLE_API_KEY` also powers image (and, ahead, video) generation; Anthropic
(Opus 4.8 / Sonnet 5 / Haiku 4.5), OpenAI (GPT-5 / GPT-5 mini), and xAI (Grok 4) stay registered for override.
Routes reference tasks, never raw ids, so re-tuning is one line. `provider.ts` builds one lazy SDK client per
provider and `aiReady()` lets a route degrade to 503 instead of throwing when no key is set.

## 10. The prompt system (`services/ai/prompts/`) — the playbook

Pure, layered string builders — each capability stacks fragments into a `PromptParts = { system, prompt }`;
the composer imports no capability, so there's no cycle. The **system** teaches identity + contract + taste
(stable, cacheable); the **prompt** carries the specific ask + pulled context. Cheap high-volume ops
(rewrite/translate) deliberately drop the catalog for a lean persona. `persona.ts` (identity + surface
voice), `system.ts` (composers + `SECTION_RULES` + context helpers + output envelopes), `catalog.ts`
(`elementCatalog` / `layoutCatalog` / `describeTheme`, generated from `@model` so the prompt and the
validator can't drift), `rubric.ts` + `arcs.ts` + `exemplars.ts` (the quality bar, reverse-engineered from
the demos), and the capability builders (`generate.ts` · `chat.ts` · `text.ts` · `theme.ts` · `image.ts`).
The rest of this section is the prompt-level detail — every builder, the context each pulls, the composition.
The quality bar is reverse-engineered from the hand-built demos (`services/demos/*`) and the starter templates
(`services/templates/*`); those patterns are encoded in `prompts/rubric.ts` + `prompts/arcs.ts` and injected
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
- **Prompt:** `briefContext` + `placement(beat, outline)` — the beat's brief/role/layout + `blockLine` (fill
  each column with its planned block, in order) + **the entire arc** so it doesn't repeat neighbors. **Emits:**
  `addSection`.

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

- **Theme** (`prompts/theme.ts`, `services/ai/theme.ts`): a coherent `ThemeInput` (name + mood + isDark + 8
  colors + font trio + radius/weight/border) from a prompt; the bundled font lists constrain the choice, and a
  deterministic contrast/OKLCH finalize pass guarantees legibility regardless of model.
- **Image** (`prompts/image.ts`): expand a terse subject into one vivid, on-theme image prompt.
- **Suggest** (`services/ai/suggest.ts`): a cheap, unmetered call for "what to add next" ideas (the insert
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

| Context helper                       | What it gives                                                 | Used by                              |
| ------------------------------------ | ------------------------------------------------------------- | ------------------------------------ |
| `describeTheme(id)`                  | active theme name/mood/dark → the register to write in        | every generate/edit/theme/image turn |
| `briefContext(input)`                | prompt · goal · audience · tone · length                      | generate (outline + section)         |
| `arcGuidance(input)`                 | the proven topic arc                                          | outline                              |
| `placement(beat, outline)`           | the beat + the whole arc (continuity while building)          | section                              |
| `artifactSpine(content)`             | title + thesis + format + theme (the cheapest "what is this") | insert-plan, element regen, chat     |
| `artifactDigest(content)`            | every section's id + first line (a whole-tree map)            | chat (editor), read-artifact         |
| `neighbors(content, id)`             | prev/next section labels (fit between, don't repeat)          | regenerate section                   |
| `insertionContext(content, afterId)` | the two sections a new one lands between                      | insert plan + write                  |
| `elementContext(content, section)`   | the spine + the section an element belongs to                 | regenerate element                   |
| section / element JSON               | the exact current content being changed                       | section/element regen                |
| surrounding text                     | the run's context (sub-range coherence)                       | rewrite / translate                  |

So a **regenerate-section** call sees the theme mood, the neighbors it must flow between, the section's own
JSON, the full element/layout catalog, and the voice/rubric — everything needed to fit the piece, not a
generic block. A **rewrite** call sees the passage + its surrounding text. A **library chat** turn starts with
only the workspace summary, then calls `find-artifacts`/`read-artifact` to pull a real artifact's digest on
demand.

## 11. Routes + the credit gate (`services/api/ai.ts`)

Every route does auth → `aiReady()` gate → **reserve credits** → run. The gate reserves a size-aware estimate
up front (`estimateCost(toolId, meter)` from `@model/tools`), 402s when the workspace allowance is spent, then
deducts against `workspaces.aiCreditsUsed`.

```
POST /ai/turn      SSE. Runs a turn (generate · section · chat live; edit → 501). ACTION_FOR maps the
                   TurnKind to its priced tool (generate→generate-artifact, section→add-section,
                   chat→ask-assistant, edit→revise-artifact) and meters generate by length + image source.
                   Frames each TurnEvent as `data: {seq, event}`.
POST /ai/suggest   UNMETERED. Cheap "what to add next" ideas (the insert popup); client caches per artifact.
POST /ai/theme     One structured ThemeInput from a prompt. Meters generate-theme.
POST /ai/element   Regenerate one element in place → { element }. Meters revise-element. The element rides in
                   the body (the runtime can't traverse the canvas tree).
POST /ai/text      Rewrite / translate one passage → { text }. Meters rewrite-text / translate-text.
```

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
- **The chat dock** folds the streamed events into an ordered list of UI blocks per message (`chat.text` →
  prose, `chat.reasoning` → a thinking bubble, `chat.tool` → a "working…" shell, `chat.block` → a
  proposal/suggestion/carousel/brief/pick-list/action), applies a proposal's patch (open / draft / target) on
  Apply, and runs a `WorkspaceAction` (with a confirm card for destructive/outward ones) on click.

**Traces:**

- **Generate** — Generate modal → `POST /ai/turn {generate}` → `runGenerate`: `plan` (skeletons appear) →
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

- **Generation + editing:** generate an artifact · insert-section · regenerate-section · regenerate-element ·
  rewrite/translate text · translate-artifact (fan-out) · generate-theme · suggest-sections.
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
  `prompts/edit.ts` sketches the builder, but the route 501s — one revision over the whole tree is a distinct
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
