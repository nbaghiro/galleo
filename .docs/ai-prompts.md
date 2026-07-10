# AI Prompts — the playbook

The prompt-level detail behind every AI capability: how each prompt is composed, whether it runs as **one LLM
call or a series**, and the exact context it pulls (especially from the artifact being edited). Companion to
`ai-module.md` (the architecture, protocol, tools, routes) — this file is the prompt layer only. The quality
bar is reverse-engineered from the hand-built demos (`services/demos/*`) and the starter templates
(`services/templates/*`); those patterns are encoded in `prompts/rubric.ts` + `prompts/arcs.ts` and injected
into the generation prompts.

## 0. The shape of every prompt

Every capability builds a `PromptParts = { system, prompt }` by stacking pure fragments (`prompts/system.ts`
`stack()`), then calls the SDK (`generateObject` for the outline/plan, `generateText` for free-form JSON
sections + text ops) with the task's model (`ai-module.md` §10). Layering:

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

## 1. Orchestration — one call vs. a series, and which model

Defaults are **Google Gemini** across the board (`services/ai/models.ts`). The load-bearing choice is that
**generation runs on Flash, not Pro** — a deck is ~12 sequential section calls, so Pro's reasoning latency
stacks up badly for little gain; `thinkingBudget: 0` disables Gemini's default thinking to keep it snappy. Pro
is reserved for the two tasks that genuinely reason: whole-artifact `edit` and the `chat` agent (thinking on).

| Capability                   | Calls                                         | Model                 | Credits | Why                                                                           |
| ---------------------------- | --------------------------------------------- | --------------------- | ------- | ----------------------------------------------------------------------------- |
| **Generate artifact**        | series: 1 outline → N section (+ M images)    | Flash (thinkless)     | 25–73   | focus + progressive render + varied arc                                       |
| **Add / insert section**     | series: 1 plan → 1 write                      | Flash                 | 2       | plan first so the skeleton renders                                            |
| **Regenerate section**       | 1                                             | Flash                 | 2       | surgical, single section                                                      |
| **Regenerate element**       | 1                                             | Flash                 | 2       | one element, kept type + layout                                               |
| **Rewrite text**             | 1                                             | Flash                 | 1       | one selected run, latency-sensitive                                           |
| **Translate selection**      | 1                                             | Flash                 | 1       | one run                                                                       |
| **Translate whole artifact** | series: 1 per text element (fan-out)          | Flash                 | 5–40    | structure preserved, each run in place                                        |
| **Generate theme**           | 1                                             | Flash                 | 4       | one coherent token system (a deterministic finalize pass guarantees contrast) |
| **Generate image**           | 1 (+ the image-model call)                    | Flash + image         | 5–20    | art-director expansion, then generate                                         |
| **Chat / agent**             | agent loop, ≤6 steps (may call content tools) | **Pro (thinking on)** | 2       | reasons: picks + chains tools                                                 |
| **Edit whole artifact**      | 1                                             | Pro                   | 12–40   | one revision over the tree — **not yet wired**                                |

**Credits are metered, not flat** — an action's cost is the sum of the _units of work_ it does (`plan` ·
`section` · `image` · `text` · `theme` · `reply`), so a long artifact costs more than a short one. Pricing
lives **on the tool def** in `@model/tools` (there is no separate AI-actions catalog); the gate reserves an
estimate (`estimateCost(toolId, meter)`) and the `/pricing` page reads the same `PRICED_TOOLS`. See
`ai-module.md` §5 + §12.

## 2. The generation pipeline, step by step

```
POST /ai/turn { generate }  ──SSE──▶ client dispatch()   (run.ts · runGenerate)
│
├─ phase intake  · narration("Reading the brief")
├─ CALL 1  outlineParts(input) ─ generateObject(zOutline) ─▶ { title, backdrop, beats[] }
│           system: PERSONA + surfaceVoice + describeTheme + OUTLINE_JOB + layoutCatalog + RUBRIC
│           prompt: briefContext + lengthGuidance(length) + arcGuidance(input)      temperature 0.9 (warm)
│     emit  plan(beats)                     // each beat: id · label · role · layout preset · blocks · image
│
├─ phase build · for each beat, in order:
│     ├─ section.status(id, active → writing)
│     ├─ CALL 2.k  sectionParts(input, beat, outline) ─ generateText → JSON ─ zSection.parse ─▶ { id, root }
│     │            system: PERSONA + surfaceVoice + describeTheme + elementCatalog + layoutCatalog
│     │                    + SECTION_RULES + VOICE + sectionExemplars + SECTION_OUTPUT
│     │            prompt: briefContext + placement(beat, outline)     // the full arc, for continuity
│     │            (checkSection audit → one repair retry if it trips)
│     ├─ if beat.image / bg:  section.status(id, "image") · resolveImages(section)
│     ├─ emit  patch([{ op:"addSection", section }])
│     └─ section.status(id, "done")
│
├─ (first section) resolve the artifact backdrop → emit setMeta patch
└─ phase compose · done → turn.done(summary)
```

`beat.id === section.id === addSection.section.id` binds content to its pre-shaped slot. A section is written
as **free-form JSON** (not a response schema) because each element's `data` is an open, type-dependent map —
the prompt teaches the exact envelope and the parse validates it (`ai-module.md` §7).

## 3. Each builder, in detail (`prompts/generate.ts` unless noted)

### `outlineParts(input)` — the plan

- **Job:** title + a backdrop phrase + ordered beats (id, label, narrative role, a **layout preset** —
  `full · split-6040 · split-4060 · two-col · three-up` — a per-column `blocks` list, an image flag, a
  one-line brief). **Output:** `zOutline` via `generateObject`.
- **System:** persona + surface voice + `describeTheme` + `OUTLINE_JOB` + `layoutCatalog` + **RUBRIC**
  (bookends, thesis-second, the required element mix).
- **Prompt:** `briefContext(input)` + `lengthGuidance(length)` (→ ~7 / 12 / 18 sections) + `arcGuidance(input)`
  (the proven arc for the topic). **Emits:** `plan`.

### `sectionParts(input, beat, outline)` — one section

- **Job:** write the beat as a real `Section` (`{ id, root }`, a flex element tree). **Output:** `zSection`.
- **System:** persona + surface + theme + **full element & layout catalog** + `SECTION_RULES` + **VOICE** +
  a gold `sectionExemplars(surface)` + `SECTION_OUTPUT`.
- **Prompt:** `briefContext` + `placement(beat, outline)` — the beat's brief/role/layout + `blockLine` (fill
  each column with its planned block, in order) + **the entire arc** so it doesn't repeat neighbors. **Emits:**
  `addSection`.

### `sectionPlanParts(input)` + `insertSectionParts(input, beat)` — insert one section

- **Plan (structured):** role + layout preset + per-column blocks, aware of where it lands
  (`artifactSpine` + `insertionContext` — the sections it falls between). **Output:** `zSectionPlan`.
- **Write:** the same `sectionSystem` as generate; prompt is the instruction + `insertPlacement` (the assigned
  layout + the real neighbors). **Emits:** `plan` then `addSection` at `afterId`.

### `editSectionParts(content, section, instruction)` — regenerate a section in place

- **Job:** rewrite one section to satisfy an instruction, keeping its id + layout. **Context:**
  `neighbors(content, id)` (prev/next labels — fit between, don't repeat) + the target **section's full JSON**.
  The chat agent's `rewrite-section` tool wraps this. **Emits:** `replaceSection` (runtime diffs).

### `reviseElementParts(content, section, element, instruction?)` — regenerate one element

- **Job:** a fresh, stronger version of ONE element, **same type**, so the section's layout stays valid; no
  instruction = a straight re-roll. **System:** persona + theme + element catalog + `SECTION_RULES` + `VOICE`
    - `ELEMENT_OUTPUT` (a single `{ type, data }`). **Context:** `artifactSpine` + the section it lives in +
      the element's current JSON. **Emits:** `{ element }` → `replaceElement`.

### `rewriteTextParts` / `translateTextParts` (`prompts/text.ts`) — transform one passage

- **Lean:** persona + a hard "return only the edited text — no preamble, quotes, or fences" rule; **no
  catalog**. **Context:** the surrounding text as _context only_ when a sub-range is selected. **Output:** raw
  text (`clean()`ed). Whole-artifact translate = `translateTextParts` fanned out over every text element.

### `chatSystem(ctx)` (`prompts/chat.ts`) — the agent instructions

- **Two personas, per surface.** With an artifact open: an editor assistant + `artifactSpine` +
  `artifactDigest` (the section map) + the current `focus`; the rules describe its tools and that every change
  is a proposal the user applies. In the **library** (no artifact): a workspace assistant that's explicit it
  can't edit from there, grounded in the `ChatLibrary` summary (recent titles + count), pointing the user to
  "New artifact" / Templates. This split is what stops the agent promising edits with no document open.

### theme + image + suggest

- **Theme** (`prompts/theme.ts`, `services/ai/theme.ts`): a coherent `ThemeInput` (name + mood + isDark + 8
  colors + font trio + radius/weight/border) from a prompt; the bundled font lists constrain the choice, and a
  deterministic contrast/OKLCH finalize pass guarantees legibility regardless of model.
- **Image** (`prompts/image.ts`): expand a terse subject into one vivid, on-theme image prompt.
- **Suggest** (`services/ai/suggest.ts`): a cheap, unmetered call for "what to add next" ideas (the insert
  popup); the client caches per artifact.

## 4. The quality bar, baked in (`prompts/rubric.ts` + `prompts/arcs.ts`)

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

## 5. Context-pulling strategy

The rule: **an editing turn carries as much relevant context as it can afford, cheaply.** The helpers
(`prompts/system.ts`) and where each is used:

| Context helper                       | What it gives                                                 | Used by                              |
| ------------------------------------ | ------------------------------------------------------------- | ------------------------------------ |
| `describeTheme(id)`                  | active theme name/mood/dark → the register to write in        | every generate/edit/theme/image turn |
| `briefContext(input)`                | prompt · goal · audience · tone · length                      | generate (outline + section)         |
| `arcGuidance(input)`                 | the proven topic arc                                          | outline                              |
| `placement(beat, outline)`           | the beat + the whole arc (continuity while building)          | section                              |
| `artifactSpine(content)`             | title + thesis + format + theme (the cheapest "what is this") | insert-plan, element regen, chat     |
| `artifactDigest(content)`            | every section's id + first line (a whole-tree map)            | chat (editor)                        |
| `neighbors(content, id)`             | prev/next section labels (fit between, don't repeat)          | regenerate section                   |
| `insertionContext(content, afterId)` | the two sections a new one lands between                      | insert plan + write                  |
| `elementContext(content, section)`   | the spine + the section an element belongs to                 | regenerate element                   |
| section / element JSON               | the exact current content being changed                       | section/element regen                |
| surrounding text                     | the run's context (sub-range coherence)                       | rewrite / translate                  |

So a **regenerate-section** call sees the theme mood, the neighbors it must flow between, the section's own
JSON, the full element/layout catalog, and the voice/rubric — everything needed to fit the piece, not a
generic block. A **rewrite** call sees the passage + its surrounding text. A **library chat** turn sees only
the workspace summary (no tree — there's no open document).

## 6. Status

**Live** (working prompt builder + runtime + route): generate · add/insert section · regenerate section ·
regenerate element · rewrite/translate text · translate artifact · generate theme · chat (editor + library) ·
suggest sections.

**Sketched, not fully wired:** whole-artifact `edit` (builder exists in `prompts/edit.ts`; the runtime 501s);
speaker-notes / summary / alt-text / retitle (priced in the catalog as `planned`); AI image _generation_
inside `resolveImage` (stock sourcing only today). See `ai-module.md` §15.
