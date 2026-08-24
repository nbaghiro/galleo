# Build: Speaker notes and voice narration

## Shared context

You are working in **Galleo**, a TypeScript AI content tool where one engine renders the same block
tree as a **deck, document, or website**. Read `AGENTS.md` first, then `.docs/architecture.md`.
The design rationale for this feature, including the alternatives that were rejected and why, is
`.docs/planning/voice-narration.md`. That document is the reference; this one is the build order.
Where the two disagree, this one is stale and the planning doc wins.

Other docs you will need: `.docs/ai.md` (the turn protocol, the tool catalog and its pricing, the
credit gate, the existing dictation route), `.docs/rendering.md` (the engine and the present
surfaces), `.docs/collab.md` (the one-write-path and overlay-only invariants this feature must stay
inside), `.docs/workspaces.md` (entitlements, the credit window), `.docs/analytics.md` (the event
contract), `.docs/testing.md` (the mocking contract).

**Layering law (ESLint-enforced, and `pnpm check:boundaries` plants violations to prove the rules
still report):** `model ← canvas ← ui ← editor ← app`; `services` imports only `model`. Inside
services: `api → core → db → utils`; **`utils/` may not import `db/`** and **`core/` may not import
hono**. Entry points compose across layers and are the one exemption; there are exactly two,
`services/server.ts` and `services/db/seed.ts`, both named in `package.json`. Path aliases:
`@model @themes @canvas @engine @elements @ui @editor @app @services`. No `index.ts` barrels;
cross-directory imports use an alias, same-directory siblings stay relative. One concept per file.
No suppressions of any kind (`noInlineConfig` makes `eslint-disable` inert and then fails the run for
it). Comments terse, only for what the code cannot say.

**Style:** 4-space indent, double quotes, semicolons, `printWidth` 100, no `any`, no `console`
(backend output goes through `services/utils/env.ts` `out`/`warn`). Tailwind on the canonical scale
(`gap-0.75`, not `gap-[3px]`).

**Request bodies are untrusted.** A route reads its body with `await readJson(c, zThing)`
(`services/utils/http.ts`), which returns `null` on a mismatch so the route can answer 400. The zod
schema lives beside the route. A schema carrying stored content uses `z.looseObject` or
`z.custom<T>(guard)`, since a plain `z.object` strips keys this layer does not enumerate.
`pnpm check:validation` enforces it and also fails a `c.req.json()` that routes around the helper.
**Relevant here:** the section-op write path already carries `Section` objects, and `Section` is
gaining a `notes` field, so any schema on that path must not be a plain `z.object` or it will strip
the new field on the way to the row.

**Copy is plain and never em-dashed** in user-facing strings; `pnpm check:copy` fails the build on
one. Comments are exempt. This feature adds a lot of user-facing copy (a settings section, a voice
picker, a prepare-narration dialog, a play control), so expect that check to matter.

**Run/verify:** `pnpm dev` (SPA :8600, `/api/*` dev-proxied to the backend), `pnpm api` (Hono on
:8601), Postgres in docker (`docker compose up -d`, host port 8602). Schema:
`services/db/schema.ts` with **generated migration files**: `pnpm db:generate` then `pnpm db:migrate`.
Seed login: `demo@galleo.app` / `galleo-demo-2026` (`pnpm seed`).

Gates before done, all of them:

```
pnpm typecheck   pnpm lint   pnpm format:check   pnpm test   pnpm test:int   pnpm build
pnpm check:suppressions   pnpm check:program   pnpm check:boundaries   pnpm check:models
pnpm check:copy   pnpm check:elements   pnpm check:modules   pnpm check:validation
```

> **Migrations are immutable once deployed.** Prod (Render, deploy runs `pnpm db:migrate`) tracks
> applied migrations by content hash. Never rename, edit, or squash a migration that has reached
> prod: it re-runs and fails the deploy. Only ever append new files.

**Testing contract** (`.docs/testing.md` section 2 is the canonical statement): fake only true
external oracles, run everything else real. Vitest discovers `**/*.test.ts` for the unit run and
`**/*.itest.ts` for `pnpm test:int`, never `.tsx`, so logic worth testing belongs in a `.ts` file.
The precedent this feature follows is `mintVoiceToken(fetchFn: typeof fetch = fetch)` in
`services/core/ai/voice.ts`: **every function that calls ElevenLabs takes an injectable `fetch` as a
trailing parameter**, so integration tests run real Postgres against a deterministic fake provider
instead of a paid API. Do not introduce a mock of your own database, your own tools, or your own
prompt builders.

**Concurrency warning.** Several agent sessions work this repo in parallel on `main`. Before each
phase, run `git status` and `git log --oneline -5`, and verify the "what exists today" claims below
against the actual files rather than trusting this document. Commit each phase separately, and never
commit or push without being asked.

## Status

Not started. As of this writing: `write-speaker-notes` exists in `model/tools.ts` as a definition
with no `live: true`, no `TOOL_SPEC` entry and no body; a grep for `narration`, `text-to-speech`,
`shared-voices`, `workspace_voices` and `NarrationSource` across the repo returns nothing; and
`ELEVENLABS_API_KEY` is used only for dictation.

## What exists today (verify each against the code before building; the repo moves fast)

**Dictation, which is the opposite topology from what you are building.**
`services/core/ai/voice.ts` mints a single-use `realtime_scribe` token and returns a socket URL;
`app/components/voice.ts` captures the mic in an AudioWorklet, downsamples to 16 kHz PCM, streams
browser-to-provider directly, and reduces partial/committed events; `app/components/VoiceInput.tsx`
is the hold-to-talk button and overlay. `GET /ai/voice` returns `{ ready }` and the mic hides itself
when the key is unset. Routes are in `services/api/ai.ts`, unmetered, behind a 30/min limiter.
**Reuse the readiness-probe pattern and the injectable-fetch pattern. Do not reuse the topology:**
narration is synthesized server-side and cached, for reasons in the planning doc section 3.

**Three present surfaces, built twice.**

| Surface                   | Route          | Component                                      |
| ------------------------- | -------------- | ---------------------------------------------- |
| In-editor present overlay | `/edit/:id`    | `editor/Present.tsx`                           |
| Standalone present        | `/present/:id` | `app/views/PresentView.tsx` over `@ui/present` |
| Published viewer          | `/p/:slug`     | `publish/PublicView.tsx` over `@ui/present`    |

`@ui/present`'s `PresentSurface` is the more capable one: it paginates a section taller than its
frame across slides (`sectionSlideCount`, `slideElement(section, tokens, profile, page)` in
`canvas/render/present.ts`), windows the continuous stack via `stackWindow`/`windowMoved`
(`canvas/render/window.ts`), reports furthest-reached progress through `onProgress` for the publish
heartbeat, and handles `classifySwipe`/`tapZone` (`ui/gesture.ts`) on coarse pointers.
`editor/Present.tsx` reimplements the same overlay against the editor store and adds an overview grid
on `O`.

**Two defects you must fix on the way, not work around.**

1. `editor/Present.tsx` calls `slideElement(section, theme(), profile())` with the default `page = 0`
   and computes `total()` as `sections.length`, so a section taller than its frame shows only its
   first page in the editor while `/present/:id` shows every page. Phase 3 removes this file's render
   loop entirely, which is the fix.
2. `SECTION_SHELL_EQUAL` in `model/artifact.ts` compares only `background`, `bleed` and `frame`.
   `narrowOps` uses it to decide whether a whole-section `set` op can be rewritten as per-element
   `data` ops. Adding `notes` to `Section` without adding it there means a notes-only edit produces
   `dataDelta(root, root) === []`, which is truthy, so the `set` becomes zero ops and **the edit is
   silently dropped on the save path**. Phase 1 fixes this and writes the test first.

**The write path you must not go around.** Every content write, HTTP or collaborative, flows through
`applySectionOps` (`model/artifact.ts`) then `contentWrite` (`services/db/derived.ts`), which derives
`digest` and `search_text`. ESLint blocks `draftContent` in a drizzle `.values()`/`.set()` outside
that file. Notes ride this path; they do not get a second one.

**The metering pattern to copy.** `POST /media/generate` in `services/api/media.ts`:
`reserve(...)` → `streamSSE(c, (stream) => held.settle(async (billed) => { ... billed({unit: n}) in a
finally }))`. Reserve an estimate, reconcile to what actually ran, and a failure refunds itself.
`services/core/spend.ts` owns the protocol, `model/credits.ts` the unit table.

**Asset serving to mirror.** `GET /media/asset/:id` in `services/api/media.ts` returns
`c.body(Buffer.from(a.data, "base64"), 200, { "content-type": ..., "cache-control": "public,
max-age=31536000, immutable" })`. Bytes live base64 in a text column (`assets.data`), which is the
established pattern at this scale.

**The public read to gate against.** `links.get("/p/:slug/content")` in `services/api/links.ts` calls
`publicRead(slug, {password, token})` and returns `read.content` **verbatim**. That is why notes must
be stripped there.

**Tool registration.** `implement(id, run)` in `services/core/ai/tools.ts` throws at import if the id
has no definition in `@model/tools`, or if a non-internal id has no `TOOL_SPEC` entry. A registered
tool is automatically available to the chat agent.

## The provider contract (ElevenLabs)

Verified against the docs in August 2026. Re-check before building; this vendor moves.

| Need                         | Endpoint                                             |
| ---------------------------- | ---------------------------------------------------- |
| Synthesize with alignment    | `POST /v1/text-to-speech/{voice_id}/with-timestamps` |
| List community voices        | `GET /v1/shared-voices`                              |
| Adopt a community voice      | `POST /v1/voices/add/{public_user_id}/{voice_id}`    |
| Design a voice from a prompt | `POST /v1/text-to-voice/design`                      |
| Keep a designed voice        | `POST /v1/text-to-voice/create`                      |

Auth is the `xi-api-key` header on the existing `ELEVENLABS_API_KEY`. No new env var.

- **`with-timestamps` returns** `{ audio_base64, alignment, normalized_alignment }`, where an
  alignment is `{ characters[], character_start_times_seconds[], character_end_times_seconds[] }`.
  Character level, not word level. Use the plain variant nowhere: alignment cannot be reconstructed
  later and the caption overlay needs it.
- **Model:** `eleven_multilingual_v2` for narration. It is the most stable on long-form and takes up
  to 10,000 characters. `eleven_v3` is more expressive at the same price with a 5,000 character
  ceiling; `eleven_flash_v2_5` is half the price and audibly flatter.
- **Output format:** `mp3_44100_64` is the starting point. Roughly 8 KB per second of audio, so a
  30-second section is about 240 KB before base64.
- **Price:** $0.10 per 1000 characters for `eleven_multilingual_v2` and `eleven_v3`, $0.05 for the
  Flash and Turbo lines.
- **`GET /v1/shared-voices` filters:** `search`, `gender`, `age`, `accent`, `language`, `locale`,
  `use_cases`, `descriptives`, `category`, `featured`, `sort` (`trending`, `created_date`,
  `cloned_by_count`, `usage_character_count_1y`), `page`, `page_size`. Each result carries
  `voice_id`, `public_owner_id`, `name`, `description`, `preview_url`, and the demographic labels.
  **`preview_url` is a pre-rendered sample and costs nothing to play.**
- **Adoption is required.** A community voice is not usable in text to speech until it has been added
  to the calling account. Adoption counts against a monthly voice-operation budget on that account
  (roughly 95/month on Creator, 290 on Pro, 1040 on Scale). Adopted library voices do **not** consume
  custom voice slots; **designed voices do**, and slots are finite per account (160 on Pro, 660 on
  Scale). Galleo is one account for every workspace, which is the whole reason for the two-table
  design below.
- **Default voices expire on 31 December 2026.** Do not hardcode any Default voice id anywhere. The
  seeded shelf in phase 4 uses community library voice ids, adopted through the normal path.
- **Voice design cost is undocumented.** A call returns three previews, each with a 100 to 1000
  character sample, so it plausibly costs 300 to 3000 characters of synthesis. **Measure it against a
  real account before setting a price in the catalog.** Until measured it carries a `ceiling` and
  refunds the difference on settle.

## Goal

1. Every section can carry speaker notes: a spoken script and presenter cues, authored by hand or
   written by the AI over the whole piece at once.
2. Those notes can be synthesized once into cached per-section audio with character alignment.
3. Present mode plays that audio, advancing itself, with a caption overlay, in every format.
4. A published link plays itself from one viewer gesture, without leaking a single presenter cue.
5. A workspace picks its own voices: browse the library with filters, audition on its own words,
   optionally design one from a description, keep a shelf with a default, override per artifact.

## Design decisions (already made; implement, do not relitigate)

Rationale for each is in `.docs/planning/voice-narration.md` section 3.

1. **Notes are `{ spoken, cues[] }`.** The voice reads `spoken` and only `spoken`. Cues are presenter
   reminders and never leave the editor.
2. **Notes live in `Section`, in the content.** They ride the existing write path, undo, collab,
   duplication and templates. They are stripped at the publish boundary.
3. **Audio is pre-rendered and cached server-side.** Never streamed per play. This is what gives
   exact durations for auto-advance, playback for anonymous viewers, and a stable cost.
4. **One step model for every format.** A step is one screenful of one section: a slide page in a
   paged format, a viewport-height chunk in a continuous one. Narration plays one track per section
   and steps through that section's screens at `ms / of` intervals.
5. **Voices are customer-chosen, adopted once per install.** Two tables, because one ElevenLabs
   account serves every workspace and adoption is rate-limited on that account.
6. **Notes are not searchable and not in the digest.** They are not the artifact's content.

## Data model

```ts
// model/artifact.ts
export interface SectionNotes {
    spoken: string;
    cues?: string[];
    source?: "ai" | "human";
}

export interface Section {
    id: Id;
    root: ElementInstance;
    background?: SectionBackground;
    bleed?: boolean;
    frame?: SectionFrame;
    notes?: SectionNotes; // NEW
}

export interface ArtifactShell {
    format: Id;
    theme: Id;
    background?: SectionBackground;
    page?: PageSize;
    voice?: Id; // NEW: a workspace_voices row; absent means the workspace default
}
```

`asContent()` must carry `voice` through the same way it carries `background` and `page`, or the next
section edit drops it. `SECTION_SHELL_EQUAL` must gain `b.notes === a.notes`.

Three new tables in `services/db/schema.ts`:

```
narrations                -- derived cache, per section, invalidated by its own key
  id, artifact_id (fk cascade), section_id, hash, voice_id, model_id,
  mime, data (base64), bytes, ms, alignment (jsonb), chars, created_at
  unique (artifact_id, section_id, hash);  index (artifact_id)

voices                    -- install-wide adoption cache
  id, external_id (unique), source (library|designed|seeded), owner_id,
  name, description, labels (jsonb), preview_url, preview_data, adopted_at
  index (source)

workspace_voices          -- the per-workspace shelf
  workspace_id (fk cascade), voice_id (fk cascade), name, is_default, added_at
  primary key (workspace_id, voice_id)
  unique index (workspace_id) where is_default
```

The narration cache key is `sha256(spoken + " " + voice_id + " " + model_id + " " + output_format)`.

## Routes

```
POST /ai/notes         SSE. Writes notes for named sections, or all when sectionIds is absent.
                       Emits { type: "notes", sectionId, spoken, cues } per section, then done.
                       Meters write-speaker-notes scaled by section count.
POST /ai/narrate       SSE. Synthesizes named sections, skipping cached hashes. Emits
                       { type: "section", sectionId, ms, cached } then { type: "done", chars }.
                       Meters narrate-artifact by characters, reconciled in a finally.
GET  /artifacts/:id/narration              gateArtifact. Manifest: per section
                                           { hash, ms, chars, stale, spoken, alignment }.
GET  /artifacts/:id/narration/:sectionId   gateArtifact. Audio bytes, immutable cache.
GET  /p/:slug/narration                    publicRead gate. Same manifest.
GET  /p/:slug/narration/:sectionId         publicRead gate. Audio bytes. 404 when unprepared.

GET    /voices                 The workspace shelf.
GET    /voices/library         UNMETERED, rate-limited. Proxies GET /v1/shared-voices.
POST   /voices                 Save to the shelf; adopts install-wide first if new. Idempotent.
PATCH  /voices/:id             Rename, or set as the workspace default.
DELETE /voices/:id             Remove. Refuses to leave a workspace with no default.
POST   /voices/design          Meters design-voice. Returns three candidates. Persists nothing.
POST   /voices/design/keep     Creates and shelves the chosen candidate. Enforces the caps.
POST   /voices/audition        Meters audition-voice. Synthesizes one line, capped 200 chars.
```

The narration reads join the artifact and link routers they belong to. The voice routes get their own
router, `services/api/voices.ts`, over a new `services/core/voices.ts`. Synthesis lives in
`services/core/ai/speech.ts`.

**`services/core/models.ts` must not gain a voice entry.** `scripts/check-models.mjs` parses
`provider: "…", model: "…"` pairs out of that file and validates each against the installed
`@ai-sdk/<provider>` declared id union. An ElevenLabs id there fails `pnpm check:models`.

## Build order

Nine phases. Each is independently shippable and separately committed. Run the full gate list at the
end of each.

**Phase 1: notes as content.** `SectionNotes` and `Section.notes` in `model/artifact.ts`; the
`SECTION_SHELL_EQUAL` fix; the strip in `publicRead` (`services/core/links.ts`); the `notes` tab in
the editor's right panel over the existing `rightTab` signal, with a textarea for `spoken` and an
editable list for `cues`; a coverage mark in the minimap. No AI, no audio.
_Done when:_ an author writes notes by hand, they survive a reload, and a notes-only edit reaches the
row (the test from phase 1's list proves it).

**Phase 2: notes written by AI.** `TOOL_SPEC["write-speaker-notes"]` with an input of
`{ sectionIds?: string[] }`; `live: true`; replace `usage: { reply: 1 }` with a `meter` scaling by
section count; the body in `services/core/ai/tools/notes.ts`; the prompt in
`services/core/ai/prompts/notes.ts`; `POST /ai/notes`. One structured call over the whole deck,
because continuity between adjacent notes is the point. Section text comes from `collect()` in
`model/artifact.ts`, the same extraction search uses. The prompt must produce speech, not prose:
short sentences, numbers spelled as a person would say them, no bullet fragments, no parentheticals,
no stage directions (those are `cues`).
_Done when:_ "write speaker notes for this deck" works from both the panel and the chat dock, and the
credit ledger shows the metered cost.

**Phase 3: present convergence.** Rewrite `editor/Present.tsx` as a thin caller of `@ui/present`'s
`PresentSurface`. Move the overview grid into `PresentSurface` behind an `overview` prop. Add the
notes pane on `N`, which renders in the editor and at `/present/:id` and never at `/p/:slug`.
_Done when:_ a section taller than its frame shows every page in the editor, matching
`/present/:id`, and there is one present implementation.

**Phase 4: voices, the minimum that unblocks synthesis.** The `voices` and `workspace_voices` tables
and their migration; `services/core/voices.ts` with `adopt()` idempotent on `external_id`;
`ArtifactShell.voice` plus the `asContent` carry-through; a seeded shelf in `services/db/seed.ts`
using community library ids. No picker UI yet.
_Done when:_ a fresh `pnpm seed` yields a workspace with a default voice, and adopting the same voice
from two workspaces makes exactly one provider call.

**Phase 5: synthesis.** `services/core/ai/speech.ts` with `speechReady()` and
`synthesize(text, voiceId, opts, fetchFn = fetch)`; the `narrations` table and migration;
`POST /ai/narrate`; the two gated reads; the `speech` cost unit in `model/credits.ts`
(`UNIT_TASK.speech = null`, flat-priced like `image` and `video`, 7 credits per 1000 characters,
derived as $0.10 / $0.0142).
_Done when:_ narrating a seeded deck stores rows, bills correctly, and a second run reports every
section cached and bills nothing.

**Phase 6: playback.** The `NarrationSource` seam on `PresentSurface`; the step model from planning
doc section 6.4; the controller over one `<audio>`; the caption overlay from the character alignment;
auto-advance; the `FloatingBar` controls; the keyboard remap while narrating (Space becomes play and
pause, arrows take over stepping). Wire it in the editor and at `/present/:id`.
_Done when:_ a prepared deck plays itself end to end in both a paged and a continuous format, manual
navigation retargets the audio, and a section with no notes is skipped while a section with notes but
no audio dwells.

**Phase 7: the published player.** The `/p/:slug` narration reads; the play-first state in
`publish/PublicView.tsx`; the playback analytics events.
_Done when:_ an anonymous viewer plays a narrated link, a password-gated link gates its audio too, and
the content payload contains no `notes` key on any section.

**Phase 8: the voice picker.** `GET /voices/library` and the browse tab with the filters in the
provider table above; the shelf in `app/views/WorkspaceSettingsView.tsx`; the per-artifact override
control beside the theme control; `POST /voices/audition`. The picker is a `@ui` modal because both
settings and the editor open it.
_Done when:_ a workspace browses, auditions on its own text, saves, sets a default, and overrides on
one artifact.

**Phase 9: voice design.** The design tab; `POST /voices/design` and `/design/keep`; the
`voiceDesign` entitlement; the per-workspace cap; the install-wide ceiling; the reaper for designed
voices nothing references. Measure the real cost and set the catalog price.
_Done when:_ a described voice can be generated, auditioned, kept, and used, and both caps refuse
with distinct messages.

PPTX speaker notes (`canvas/render/pptx.ts` writes no notes part today) are a natural tenth and are
out of scope here.

## Tests

Unit (`.test.ts`), faking only the provider `fetch` and the `ai` SDK:

- `SECTION_SHELL_EQUAL` with notes: a notes-only edit survives `narrowOps` as a `set` op. **Write
  this before adding the field.**
- the narration cache key: same text and voice hash the same, a changed script does not, a changed
  voice does
- the public strip: `publicRead` output has no `notes` on any section, over content that has them on
  every section
- character alignment folded into caption word windows; an empty alignment degrades to no highlight
  rather than throwing
- the step model: a three-page section yields three steps, a continuous section three viewports tall
  yields three, and `ms / of` distributes evenly
- the notes prompt builder: section text extraction, and neighbour context on a single-section
  regenerate
- `speechReady()` mirrors the env key, and `synthesize` 503s without a key without touching the
  network

Integration (`.itest.ts`, real Postgres, fake provider):

- `POST /ai/narrate` reserves, stores, and settles to the character count
- a second call with unchanged notes returns cached for every section and bills nothing
- editing one section's script invalidates that row and no other
- the public narration route honours a password gate and a recipient token, and 404s for an
  unprepared section
- deleting an artifact cascades its narration rows
- **adopting one voice from two workspaces makes one provider call and one `voices` row** (assert the
  call count, not just the row count: this is what protects the monthly operation budget)
- exactly one default per workspace, enforced when written directly
- `POST /voices/design/keep` refuses over the workspace cap and over the install ceiling, with
  different messages
- `POST /voices/audition` truncates at 200 characters server-side whatever the client sends

End to end (`e2e/present/`):

- notes written from the panel appear on the section and survive a reload
- present mode plays a stubbed track and advances on its end
- a published link shows the play control and its payload exposes no cues

## Done means

Every gate passes. All nine phases are committed separately. `.docs/planning/voice-narration.md` is
folded into the current-state docs it now belongs to (`ai.md` for the two tools and the routes,
`rendering.md` for the present convergence and the step model, `workspaces.md` for the entitlements
and the shelf, `analytics.md` for the new events, `hosting.md` for the widened env note), and the
planning file is deleted, per the rule in `.docs/README.md` that a shipped decision moves into the
doc that owns the area. `FEATURES["voiceNarration"].status` and `FEATURES["voiceDesign"].status` flip
from `"planned"` to `"live"`. This file is removed and recorded in the "Shipped, prompts removed"
section of `.docs/prompts/README.md`.
