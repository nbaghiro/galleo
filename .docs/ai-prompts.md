# AI Prompts — the playbook

The detailed spec for every prompt the AI module builds: how each is composed, whether it runs as **one LLM
call or a series**, the exact context it pulls (especially from the artifact being edited), and the full
catalog of one-off actions. Companion to `ai-module.md` (the architecture) — this file is the prompt-level
detail. The quality bar is reverse-engineered from the hand-built demos (`services/demos/*`) and the 30
starter templates (`services/templates/*`); those patterns are encoded in `prompts/rubric.ts` +
`prompts/arcs.ts` and injected into the generation prompts.

## 0. The shape of every prompt

Every capability builds a `PromptParts = { system, prompt }` by stacking pure fragments (`prompts/system.ts`
`stack()`), then calls the SDK (`generateObject`/`streamText`) with the task's model. Layering:

```
system  =  PERSONA  +  surfaceVoice(deck|doc|web)  +  describeTheme(id)      ← who + register
        +  elementCatalog() + gridCatalog()                                  ← the contract (from @model/ai-schema)
        +  RUBRIC + VOICE + SECTION_RULES                                    ← the quality bar (from the demos)
        +  <job>  +  OUTPUT_NOTE                                             ← the task + "no filler"
prompt  =  briefContext(input) | artifactSpine | neighbors | placement       ← the pulled context
        +  <the ask>
```

The **system** teaches identity + contract + taste (stable, cacheable); the **prompt** carries the specific
ask + context. Cheap high-volume actions (rewrite/translate) deliberately drop the catalog and use a lean
bespoke persona.

## 1. Orchestration — single call vs. series

Defaults are **Google Gemini** across the board (`services/ai/models.ts` `DEFAULT_MODELS`): Gemini 2.5 **Pro**
for the quality-critical shaping tasks, **Flash** for the fast, high-volume ones — one `GOOGLE_API_KEY` also
powers image (and, ahead, video) generation.

| Capability                   | Calls                                              | Model (default)         | Credits | Why                                                            |
| ---------------------------- | -------------------------------------------------- | ----------------------- | ------- | -------------------------------------------------------------- |
| **Generate artifact**        | **series:** 1 outline → N section → M image        | Gemini Pro (Flash imgs) | 25–73   | focus + progressive render + matches the `AgentEvent` protocol |
| **Edit (whole)**             | 1                                                  | Gemini Pro              | 12–40   | one revision over the whole tree                               |
| **Regenerate section**       | 1                                                  | Gemini Pro              | 2       | surgical, single section                                       |
| **Edit element / cell**      | 1                                                  | Gemini Pro              | 2       | one element                                                    |
| **Rewrite text**             | 1                                                  | Gemini Flash            | 1       | one selected run, latency-sensitive                            |
| **Translate selection**      | 1                                                  | Gemini Flash            | 1       | one run                                                        |
| **Translate whole artifact** | **series:** 1 per text element (fan-out, parallel) | Gemini Flash            | 5–40    | preserves structure; each run translated in place              |
| **Generate theme**           | 1                                                  | Gemini Pro              | 4       | one coherent token system                                      |
| **Generate / enhance image** | 1 (+ the image-model call)                         | Gemini Flash (+ image)  | 5–20    | art-director expansion, then generate                          |
| **Chat / ask**               | 1 (may spawn an edit call)                         | Gemini Flash            | 2       | conversational; edits route to the structured builders         |

**Credits are metered, not flat** (`@model/credits` + `@model/ai-actions`). An action's cost is the sum of the
_units of work_ it does — `plan` 3 · `section` 2 · `image` 5 · `text` 1 · `theme` 4 · `reply` 2 credits each —
so a long artifact costs more than a short one because it writes more sections, an edit over a big deck costs
more than over a small one, and 4 image variations cost 4× one. A ranged cost above means the action is
**metered** (scales with the job); a single number means fixed. The gate reserves a size-aware _estimate_
(`estimateCost(action, meter)`); a completed run charges its _actual_ usage (`costOf(usage)`). Same catalog
feeds the backend charge (`POST /billing/spend`) and the `/pricing` "What your credits buy" showcase.

**The key decision — generation is a series, not one giant call.** A single `generateObject` of a whole
20-section artifact would (a) block until the entire thing is done — no progressive canvas, and (b) dilute
quality: the model can't write section 14 with full care while also juggling 1–13 and 15–20. Splitting into
**outline → per-section** gives the client the `plan` event immediately (so it pre-shapes skeletons), streams
one `addSection` as each section lands (the exact UX the simulator proved), and lets every section be written
with the whole outline as context but its own full attention.

## 2. The generation pipeline, step by step

```
POST /agent/generate (GenerateInput)  ──SSE──▶ client dispatch()
│
├─ narration("Reading the brief")
├─ CALL 1  outlineParts(input) ─ generateObject(zOutline) ─▶ { title, beats[] }
│           system: PERSONA + surfaceVoice + describeTheme + OUTLINE_JOB + RUBRIC
│           prompt: briefContext + lengthGuidance(length) + arcGuidance(goal)
│     emit  plan(beats)                         // seeds section slots (grid + image hints)
│
├─ for each beat, in order:
│     ├─ section.status(id,"active"→"writing")
│     ├─ CALL 2.k  sectionParts(input, beat, outline) ─ generateObject(zSection) ─▶ { section }
│     │            system: PERSONA + surfaceVoice + describeTheme + catalog + SECTION_RULES + VOICE
│     │            prompt: briefContext + placement(beat, outline)   // the full arc, for continuity
│     ├─ if beat.image:  section.status(id,"image")
│     │     CALL 3.k  imagePromptParts(subject) → image model → asset url → swap into section.src
│     ├─ emit  patch([{ op:"addSection", section }])
│     └─ section.status(id,"done")
│
└─ turn.done(summary)
```

Sections can be generated **in parallel** (all beats at once) and emitted in order, or sequentially with the
prior section's text threaded in for tighter continuity — a runtime choice; the prompt already carries the
full arc either way. `beat.id === section.id === addSection.section.id` binds content to its pre-shaped slot.

## 3. Each prompt, in detail

### `outlineParts(input)` — the plan

- **Job:** title + ordered beats (id, label, role, grid, image, one-line brief). **Output:** `zOutline`.
- **System:** persona + surface voice + `describeTheme` + `OUTLINE_JOB` + **RUBRIC** (bookend rule, thesis-
  second, the required element mix).
- **Prompt:** `briefContext(input)` (prompt/goal/audience/tone/length) + `lengthGuidance(length)` (→ 6–9 /
  11–14 / 16–20 sections) + `arcGuidance(input)` (the proven arc for the goal — pitch/sales/report/marketing/
  proposal/creative). **Emits:** `plan`.

### `sectionParts(input, beat, outline)` — one section

- **Job:** write the beat as a real `Section`. **Output:** `zSection`.
- **System:** persona + surface + theme + **full element & grid catalog** + `SECTION_RULES` + **VOICE**.
- **Prompt:** `briefContext` + `placement(beat, outline)` — the beat's brief/role/grid/image flag **and the
  entire arc** so it doesn't repeat neighbors. **Emits:** `addSection` patch.

### `editParts(input, content)` — revise the whole artifact

- **Job:** apply an instruction across the piece, preserving what works, same ids. **Output:** `zArtifactDraft`.
- **Context:** `artifactDigest(content)` (a token-cheap map: every section's id + grid + first line).
- **Emits:** `replaceSection` patches (runtime diffs old vs new).

### `sectionEditParts(input, content, section)` — regenerate/edit one section or cell

- **Job:** rework a section, or (if `input.cell`) just one cell. **Output:** `zSectionResult`.
- **Context (the editing case, richest):** `neighbors(content, id)` (prev/next labels — fit between, don't
  repeat) + the target **section's full JSON** + theme + catalog. **Emits:** `replaceSection` / `replaceElement`.

### `rewriteParts(text, action, context?)` — transform a text run

- **Job:** one of `REWRITE_ACTIONS` (punchier/shorter/longer/professional/casual/simpler/fix) or a free
  instruction; return only the new text. **Output:** `zRewrite`. **Lean:** copy-editor persona, no catalog.
- **Context:** optional surrounding copy (the section headline) so it stays on-topic. **Emits:** `replaceElement`.

### `translateParts(text, targetLanguage, context?)` — localize a run

- **Job:** translate preserving meaning/tone/formatting; return only the translation. **Output:** `zTranslate`.
- Whole-artifact translate = this builder fanned out over every text element (structure untouched).

### `themeFromPromptParts(prompt, isDark?)` / `themeFromArtifactParts(content)` — generate a theme

- **Job:** a coherent `ThemeInput` (name + mood + isDark + 8 colors + font trio + radius/weight/border/shadow).
  **Output:** `zTheme`. **System:** brand/type-designer persona + token rules (contrast, surface lift, accent)
    - the **bundled font lists** (must pick from them). The artifact variant pulls `artifactSpine` to match mood.

### `imagePromptParts(brief)` — art-director expansion

- **Job:** expand a terse subject into one vivid, on-theme image prompt (no text/logos). **Output:** `zImagePrompt`.
- **Context:** `describeTheme` (mood/palette) + the nearby headline/caption + the aspect. Feeds the image model.

### `chatParts(input, content?)` — conversational reply

- **Job:** answer about the open artifact; suggest/confirm changes (real edits route to the structured
  builders). **Context:** `artifactDigest`. **Emits:** `reply` (streamed).

## 4. The quality bar, baked in (`prompts/rubric.ts` + `prompts/arcs.ts`)

`RUBRIC` (the structural rules) and `VOICE` (the copy rules) are injected into outline + section prompts;
`lengthGuidance` sets the section count; `arcGuidance` picks the category arc. Highlights:

- **Structure:** open + close on a `full` section with a background image (the closer mirrors the cover);
  section 2 restates the thesis in one line; default cell = `group(label → h2 → body)`; alternate
  `split-6040`/`split-4060`; `three-up` only for triads; include ≥1 stat-trio, card-trio, captioned chart,
  process/funnel diagram, real table, pull-quote, and one callout on the key claim; backgrounds only on
  emotional beats.
- **Voice:** concrete/sensory over abstract; specific odd numbers, never round-vague; em-dash contrast + a
  strong final clause; headlines ≤8 words; stats = tight value + a full clause label; bodies 40–75 words
  (longer/doubled for docs); image `src` = an art-director's hyphenated phrase; **never** lorem ipsum.
- **Arcs (per goal):** pitch → problem/why-now/market-stats/traction/ask (numbered kickers, raise badge);
  sales → pain/cost/solution/case-study/next-steps; report → exec-summary/findings-with-captioned-charts/
  methodology; marketing → hero-button/benefit-cards/proof/pricing/FAQ/CTA-button (button bookends); proposal
  → opportunity/deliverables/investment-table/validity-clause/action-button; creative → image-and-quote-led,
  first-person literary, few charts.

## 5. Context-pulling strategy

The emphasis: **an editing turn should carry as much relevant context as it can afford.** The helpers
(`prompts/system.ts`, `prompts/catalog.ts`) and where each is used:

| Context helper                     | What it gives                                                 | Used by                              |
| ---------------------------------- | ------------------------------------------------------------- | ------------------------------------ |
| `describeTheme(id)`                | active theme name/mood/dark → the register to write in        | every generate/edit/theme/image turn |
| `briefContext(input)`              | prompt · goal · audience · tone · length                      | generate (outline + section)         |
| `arcGuidance(input)`               | the proven category arc for the goal                          | outline                              |
| `placement(beat, outline)`         | the beat + the whole arc (continuity while building)          | section                              |
| `artifactSpine(content)`           | title + thesis + format + theme (the cheapest "what is this") | theme-from-artifact, chat            |
| `artifactDigest(content)`          | every section's id + grid + first line (a whole-tree map)     | edit (whole), chat                   |
| `neighbors(content, id)`           | prev/next section labels (fit between, don't repeat)          | section/cell edit                    |
| target section JSON                | the exact current content being changed                       | section/cell edit                    |
| element `style` + section headline | the run's role + its context                                  | rewrite, translate                   |
| nearby copy + theme                | relevance + mood for an image                                 | image                                |

So a **regenerate-section** call sees: the theme mood, the neighbors it must flow between, the section's own
JSON, the full element/grid catalog, and the voice/rubric — everything needed to produce a section that fits
the piece, not a generic block. A **rewrite** call sees the run + its style + the section's headline. A
**theme-from-artifact** call reads the artifact's spine to match its mood.

## 6. One-off action catalog

Every AI action, its trigger, the context it pulls, its builder, the credits it costs (`@model/ai-actions`),
and what it emits. ✅ built · ◻ planned (builder sketched, wire when the UI lands).

| Action                      | Trigger (UI)                       | Context pulled                       | Builder                          | Model              | Credits | Emits                         |
| --------------------------- | ---------------------------------- | ------------------------------------ | -------------------------------- | ------------------ | ------- | ----------------------------- |
| ✅ Generate artifact        | `/new` intake                      | theme, goal→arc, length, rubric      | `outlineParts` → `sectionParts`  | Gemini Pro         | 25–73   | `plan` + `addSection[]`       |
| ✅ Edit whole artifact      | editor "revise" / chat             | full digest, theme, catalog          | `editParts`                      | Gemini Pro         | 12–40   | `replaceSection[]`            |
| ✅ Regenerate section       | section toolbar                    | neighbors, section JSON, theme       | `sectionEditParts`               | Gemini Pro         | 2       | `replaceSection`              |
| ✅ Edit one cell/element    | element menu                       | neighbors, section JSON (cell scope) | `sectionEditParts`               | Gemini Pro         | 2       | `replaceElement`              |
| ✅ Rewrite text             | format bar (punchier/shorter/fix…) | run style, section headline          | `rewriteParts`                   | Gemini Flash       | 1       | `replaceElement`              |
| ✅ Translate selection      | context menu                       | section headline                     | `translateParts`                 | Gemini Flash       | 1       | `replaceElement`              |
| ✅ Translate whole artifact | doc menu                           | — (fan out per text element)         | `translateParts` × N             | Gemini Flash       | 5–40    | `replaceElement[]`            |
| ✅ Generate theme (prompt)  | theme drawer "AI theme"            | fonts, token rules                   | `themeFromPromptParts`           | Gemini Pro         | 4       | `POST /themes` (ThemeInput)   |
| ✅ Generate theme (match)   | theme drawer                       | artifact spine                       | `themeFromArtifactParts`         | Gemini Pro         | 4       | ThemeInput                    |
| ✅ Generate/enhance image   | media picker / image `src`         | theme mood, nearby copy, aspect      | `imagePromptParts` → image model | Gemini Flash + img | 5–20    | `src` url                     |
| ✅ Chat / ask               | agent panel                        | artifact digest                      | `chatParts`                      | Gemini Flash       | 2       | `reply` (→ may route to edit) |
| ◻ Continue / add a section  | "＋ AI section"                    | spine, neighbors, arc                | `continueParts`                  | Gemini Pro         | 2       | `addSection`                  |
| ◻ Change tone (whole)       | doc menu                           | full digest + target tone            | `editParts` (tone instruction)   | Gemini Pro         | 12–40   | `replaceSection[]`            |
| ◻ Retitle / rename          | title menu                         | spine                                | `retitleParts`                   | Gemini Flash       | 1       | title (`setMeta`)             |
| ◻ Summarize / key points    | doc menu                           | full content                         | `summarizeParts`                 | Gemini Flash       | 2       | `reply` or a new section      |
| ◻ Alt text for images       | image a11y                         | image subject + nearby copy          | `altTextParts`                   | Gemini Flash       | 1       | `image.alt`                   |
| ◻ Speaker notes             | deck present                       | section content                      | `speakerNotesParts`              | Gemini Flash       | 2       | notes field                   |
| ◻ Chart/diagram from data   | element / paste                    | pasted data or a description         | `dataVizParts`                   | Gemini Flash       | 2       | `replaceElement`              |

Ranged costs are **metered** — they scale with the job (`@model/credits` units × counts). Costs live in
**one place** — `@model/ai-actions` on top of `@model/credits` — shared by the backend (which reserves an
estimate then charges the actual usage via `POST /billing/spend`) and the app (the "What your credits buy"
table on `/pricing`). Retune a unit price once and the paywall, the showcase, and every charge move together.

## 7. Status

**Built (code, typecheck + lint clean):** `prompts/{persona,catalog,system,rubric,arcs,generate,edit,rewrite,
translate,theme,image,chat}.ts` + the Zod schemas (`schema.ts`) for every output. All ✅ rows above have a
working prompt builder.

**Next:** the runtimes that call these builders and stream `AgentEvent`s (`services/ai/generate.ts` +
`services/api/agent.ts`), the client swap (`simulate()` → SSE), and wiring the ◻ actions to editor UI.
