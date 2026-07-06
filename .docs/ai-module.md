# AI Module — design

How Galleo grows from a **client-side generation simulator** to a real, unified AI backend that generates
whole artifacts, edits them, rewrites and translates text, and generates images — across any LLM provider —
without changing the client or breaking the layering law. Companion to `architecture.md` (the file map),
`rendering.md` (elements), and `data-model.md`.

## Where we are

Generation today is a **simulator** (`app/views/generate/`): it picks a hand-built demo fixture and replays
it, section by section, as a stream of `AgentEvent`s into one client function — `dispatch(ev, content)` in
`session.ts`. The `@model/agent` protocol (turns · patches · streamed events · `applyPatch`) is fully
scaffolded but unwired. Image generation is real (`services/media/generate.ts`, raw Gemini fetch) and so is
the media picker + credit gating; there is **no LLM text backend and, until now, no SDK**.

The design bet stated in `model/agent.ts` is the whole strategy: **the client's only integration point is
the `AgentEvent` stream.** Swap the simulator for a real runtime that emits the same events and nothing on
the client changes. This module is that runtime, plus the text-level capabilities (rewrite/translate) the
editor calls directly.

## The three constraints that decide the shape

1. **`services` may not import `canvas`** (ESLint-enforced: `model ← canvas ← editor ← app`, `services →
model` only). The live element registry lives in `canvas`, so the backend can't introspect it to teach a
   model the element schema. → the AI's content contract must live in **`model/`**.
2. **The AI writes content, never layout.** It emits the tree (`type` + `data` per element, `grid` per
   section); the engine renders it identically to deck/doc/web and to PDF. The AI never touches pixels. The
   curated `@model/authoring` DSL subset — which builds every demo — is proof that this altitude is enough.
3. **The seam is `AgentEvent` over SSE.** Structured generation + credit-gating wrap it; the client is
   untouched.

## Decisions

- **Unified SDK: Vercel AI SDK** (`ai` v7 + `@ai-sdk/anthropic|openai|google|xai`, `zod` v4). One
  `LanguageModel` interface across providers, and — decisively for a tool whose output _is_ structured
  content — `generateObject`/`streamObject` with a Zod schema give validated, typed sections/patches for
  free. (The sibling `flowmaestro` rolled its own multi-provider SDK and parses JSON by hand with
  `JSON.parse(match(/\{[\s\S]*\}/))`; we take the standard path and skip the fragility.)
- **Contract in `model`, rendered from data.** `model/ai-schema.ts` is a plain-data descriptor of the
  authoring surface (every element `type` + its `data` fields/enums, the grids, the text styles). Both the
  system-prompt catalog and the Zod validation schema derive from it, so what the model reads and what the
  module accepts **cannot drift**.
- **Two-phase generation.** Outline → per-section, matching the `plan` + `addSection` events the client
  already renders (real progressive build, each section written with full focus).
- **Keys: shared with flowmaestro.** Identical env-var names; the working keys are copied into `galleo/.env`
  (`ANTHROPIC/OPENAI/GOOGLE/XAI/COHERE_API_KEY`).

## Structure

```
model/
  ai-schema.ts        the edge-safe descriptor: ELEMENTS[], GRIDS[], TEXT_STYLES, CHART/DIAGRAM_TYPES …
  credits.ts          the metered-credit engine: COST_UNITS + Usage bag + costOf/mergeUsage
  ai-actions.ts       the AI action catalog on top of it: each action → base usage + optional size meter
services/ai/
  models.ts           the model registry — `provider:model` ids + metadata + DEFAULT_MODELS per task
  provider.ts         resolveModel(id) → a Vercel AI SDK LanguageModel (env keys, lazy per-provider client)
  schema.ts           the Zod output schemas — zOutline · zSection · zRewrite · zTranslate · zArtifactDraft
  prompts/            the system-prompt system (below)
  generate.ts         [next] the two-phase runtime → AgentEvent stream          ← not built yet
  rewrite.ts translate.ts image.ts   [next] the focused capability runtimes     ← not built yet
services/api/
  agent.ts            [next] SSE router: POST /agent/{generate,edit,section,rewrite,translate,chat}
```

### The system-prompt system (`services/ai/prompts/`) — built

Layered, composable, pure string builders. Each capability assembles fragments into a `PromptParts =
{ system, prompt }`; the composer never imports a capability, so there is no cycle.

```
persona.ts    PERSONA (the stable identity + taste) + surfaceVoice(deck|doc|web)
catalog.ts    elementCatalog() · gridCatalog() · describeTheme(id) · themeCatalog()
                ↑ generated from @model/ai-schema + @themes/library — the same data Zod validates
system.ts     PromptParts · stack()/heading() composers · SECTION_RULES · briefContext(input)
                · artifactDigest(content)  (a token-cheap map of an existing artifact) · OUTPUT_NOTE
generate.ts   outlineParts(input) → the plan;  sectionParts(input, beat, outline) → one section
edit.ts       editParts(input, content) → whole-artifact revise;  sectionEditParts(input, content, section)
rewrite.ts    REWRITE_ACTIONS (punchier/shorter/fix/…) + rewriteParts(text, action, context?)
translate.ts  translateParts(text, targetLanguage, context?)
chat.ts       chatParts(input, content?) → grounded conversational reply
```

**Composition, by example** — a section-writer's system prompt is
`stack(PERSONA, surfaceVoice, describeTheme, elementCatalog(), gridCatalog(), SECTION_RULES, OUTPUT_NOTE)`;
its user prompt is `stack(briefContext(input), placement(beat, outline), "Write section s3 now")`. Cheap,
high-volume calls (rewrite/translate) deliberately use a lean bespoke persona and **no** catalog.

### The content contract (`model/ai-schema.ts`)

The descriptor the catalog renders and Zod enforces. Element = `{ type, data }`; containers nest elements in
`data.children`. Elements the AI may emit: `text` · `bullets` · `callout` · `quote` · `code` · `image` ·
`video` · `stat` · `table` · `chart` · `diagram` · `card` · `group` · `button` · `badge` · `divider`. Grids:
`full` · `split-6040` · `split-4060` · `two-col` · `three-up`. Text styles: `h1 subtitle h2 h3 body caption
quote label`.

Two deliberate simplifications for LLM reliability:

- **Charts/diagrams use one element type with a `data.type` discriminant** (`{ type: "chart", data: { type:
"line", values, categories } }`), not the 25 palette variant element types — because `renderChart`
  switches on `data.type`, and one element + one enum is far less error-prone than 25 element types that
  each still need `data.type`. A trivial post-process can upgrade to the variant element type later.
- **Images take a description, not a URL.** The model sets `src` to "aerial view of a wind farm at dusk";
  the runtime resolves it (generate via `services/media/generate.ts`, or stock search) and swaps in the real
  URL. Only a genuine URL is passed through.

### Structured output + validation (`services/ai/schema.ts`)

Zod schemas keep the _shape_ honest (a section is grid + typed cells; an outline is titled beats) while
leaving each element's `data` open — the prompt, not a rigid schema, teaches the per-element fields, and
`applyPatch` + the element specs already tolerate extra/missing keys. `generateObject({ model, schema,
system, prompt })` retries at the tool layer on mismatch, so the runtime gets a validated object, not a
string to parse. Tightening `zElement` into a discriminated union is a later option if drift appears.

## The capabilities

| Capability         | Turn       | Prompt builder                  | Output schema           | Emits                                           |
| ------------------ | ---------- | ------------------------------- | ----------------------- | ----------------------------------------------- |
| **Generate**       | `generate` | `outlineParts` → `sectionParts` | `zOutline` → `zSection` | `plan`, then one `addSection` patch per section |
| **Edit** (whole)   | `edit`     | `editParts`                     | `zArtifactDraft`        | `replaceSection` patches (runtime diffs)        |
| **Section / cell** | `section`  | `sectionEditParts`              | `zSectionResult`        | `replaceSection` / `replaceElement`             |
| **Rewrite**        | —          | `rewriteParts`                  | `zRewrite`              | direct return → `replaceElement`                |
| **Translate**      | —          | `translateParts`                | `zTranslate`            | per-text-element `replaceElement`               |
| **Image**          | —          | (media/generate)                | —                       | resolved `src` URL                              |
| **Chat**           | `chat`     | `chatParts`                     | (streamText)            | `reply`                                         |

**Generate flow (the event contract the client already handles):**

```
narration("Reading the brief")
outlineParts → generateObject(zOutline)          → plan(beats[])   // seeds section slots (grid + image)
for each beat, in order:
  section.status(id, "active" → "writing")
  sectionParts → generateObject(zSection)
  [resolve image src if beat.image]  → section.status(id, "image")
  patch([{ op: "addSection", section }])         → canvas reveals the section
  section.status(id, "done")
turn.done(summary)
```

Every `beat.id` = its section id = the `addSection.section.id` (the canvas binds content to the pre-shaped
slot). `beat.grid` + `beat.image` are load-bearing: they let the client reserve exact skeleton geometry
before content lands.

## Runtime, routes & gating (next phase)

- **`services/api/agent.ts`** — a Hono router mounted in `server.ts`, one route per capability. `POST
/agent/generate` streams `AgentEvent`s via Hono's `streamSSE`; rewrite/translate are plain JSON
  request/response. Auth + workspace via the existing `context.ts` helpers.
- **Credit gating** reuses the billing system, priced by the **metered** catalog (`@model/credits` +
  `@model/ai-actions`): cost is the sum of the _units of work_ done (plan/section/image/text/theme/reply), so
  a long artifact costs more than a short one. The gate reserves a size-aware estimate up front
  (`POST /billing/spend { action, meter }`) and a completed run charges its actual usage
  (`{ usage }` → `costOf`) against `workspaces.aiCreditsUsed`. One catalog feeds the paywall, the `/pricing`
  "what a credit buys" showcase (with ranges for metered actions), and every charge.
- **Event log / resume.** `LoggedEvent { seq, event }` is the SSE-resume cursor. v1 can stream without
  persistence; a `turns` + `agent_events` table (or a `jsonb` log on a turns row) adds resume when needed.
- **Image sourcing.** Route `image`-flagged sections through `services/media/generate.ts` (unify it behind
  `provider.ts` so the image model is swappable) or stock search, store as an `asset`, swap the real URL
  into the section before the `addSection` patch.

## Client wiring (next phase)

- **Replace `simulate()`** in `app/views/generate/session.ts` with an SSE client that opens `POST
/agent/generate` and feeds parsed `AgentEvent`s into the existing `dispatch()`. IntakeView already
  collects the full `GenerateInput` (prompt/surface/theme/goal/audience/tone/length); the only gap is
  `contextRefs` (the intake concatenates the note into the prompt instead of attaching a ContextPack).
- **Rewrite/translate in the editor** — the format bar / context menu calls `POST /agent/rewrite` (or
  `/translate`) on the selected text run and applies a `replaceElement`. The in-editor `AgentPanel` (today a
  local deterministic generator) points at `/agent/generate` too.

## Model selection

`services/ai/models.ts` names models `provider:model` and maps each **task** to a default
(`DEFAULT_MODELS`). The default provider is **Google Gemini**: Gemini 2.5 Pro for the quality-critical
shaping tasks (outline/section/edit), Gemini 2.5 Flash for the fast, high-volume ones (rewrite/translate/
chat) — and the same `GOOGLE_API_KEY` powers image (and, ahead, video) generation, so one key covers the
whole stack. Anthropic/OpenAI/xAI stay registered for override. Routes reference tasks, never raw ids, so
re-tuning is one line; a request may override with an explicit model id. No automatic cross-provider failover
yet — add per-provider retry/circuit-breakers if reliability demands it (flowmaestro's pattern).

## Status

**Built (this pass):** the `model/ai-schema.ts` contract, the provider abstraction (`models.ts` +
`provider.ts`), the Zod output schemas (`schema.ts`), and the full system-prompt system
(`services/ai/prompts/`). Keys wired; deps installed; typecheck + lint clean.

**Next:** the generate runtime (outline→section loop → `AgentEvent` SSE), the `services/api/agent.ts` router
with credit gating, image sourcing for `image` beats, the rewrite/translate runtimes, and the client swap
(`simulate()` → SSE) + the editor's rewrite/translate affordances.

**Deferred:** event-log persistence + SSE resume; `contextRefs`/ContextPack grounding (attach docs/urls at
intake); a tightened discriminated element-union schema; automatic multi-provider failover; per-workspace
BYO-key connections (flowmaestro-style DB-stored keys).
