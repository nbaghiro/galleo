# Galleo — Speaker notes and voice narration

> Two features that share one spine: per-section speaker notes as first-class content, and an
> auto-presenting mode that reads those notes aloud in an ElevenLabs voice while the artifact advances
> itself. Notes ship as text on their own; narration is the layer on top.

Status: design, not built. Companion docs: `ai.md` (the turn protocol, the tool catalog, the credit
gate, and the existing dictation route), `rendering.md` (the engine every present surface paints
through), `collab.md` (the one-write-path invariant this feature has to stay inside), `workspaces.md`
(entitlements and the credit window), `analytics.md` (the event catalog).

## 1. What we are building

Three capabilities, in the order they become useful:

1. **Speaker notes.** Every section can carry a spoken script and a set of presenter cues. They are
   authored by hand or written by the AI over the whole piece at once, they live in the artifact
   content, and they are visible in the editor and in present mode. This is worth shipping even if
   nothing ever reads them aloud.
2. **Narration.** The spoken script of each section is synthesized once through ElevenLabs, cached
   server-side with its character alignment, and played back during present mode with a caption
   overlay and auto-advance driven by the real audio duration.
3. **A self-playing published link.** A viewer opening `/p/:slug` gets a play control, and from that
   one gesture the deck presents itself with voice. This is the reason the feature is worth building:
   it turns a published deck into something closer to a short explainer without anyone recording or
   editing a video.
4. **A voice the customer picked.** A workspace browses the voice library with real filters, hears
   candidates read its own words, optionally designs a voice from a written description, and keeps a
   shelf of the ones it likes with one as the default. Any artifact can override it. This is what stops
   every narrated deck in the product sounding like the same person.

## 2. What exists today

### 2.1 Voice intake is speech to text, and it is the opposite topology

`services/core/ai/voice.ts` mints a single-use `realtime_scribe` token and hands the browser a socket
URL. `app/components/voice.ts` captures the microphone in an AudioWorklet, downsamples to 16 kHz PCM,
streams it to ElevenLabs directly, and reduces partial and committed transcript events into the
hold-to-talk overlay in `app/components/VoiceInput.tsx`. Audio never transits Galleo, the route is
unmetered behind a 30/min limiter, and the mic hides itself when `ELEVENLABS_API_KEY` is unset
(`GET /ai/voice` returns `{ ready }`, probed once per app session).

Narration is not a mirror of this. Dictation is ephemeral, per-user, and cheap to repeat, so
browser-direct streaming is right for it. Narration is a durable artifact of the document, is played
by people who are not signed in, and costs real money per synthesis, so it belongs server-side. The
two share the API key and nothing else. The one piece worth reusing is the readiness probe pattern: a
capability that is not configured should be invisible rather than broken.

### 2.2 There are three present surfaces, built twice

| Surface                   | Route          | Component                                      |
| ------------------------- | -------------- | ---------------------------------------------- |
| In-editor present overlay | `/edit/:id`    | `editor/Present.tsx`                           |
| Standalone present        | `/present/:id` | `app/views/PresentView.tsx` over `@ui/present` |
| Published viewer          | `/p/:slug`     | `publish/PublicView.tsx` over `@ui/present`    |

`@ui/present`'s `PresentSurface` is the more capable of the two implementations. It paginates a
section taller than its frame across several slides (`sectionSlideCount` and `slideElement(…, page)`),
windows the continuous stack for doc and web formats, reports furthest-reached progress for the
publish heartbeat, and handles swipe and tap zones on coarse pointers. `editor/Present.tsx`
reimplements the same overlay against the editor store, adds an overview grid on `O`, and is otherwise
behind.

The label the user sees flips on format, in `editor/Editor.tsx:400`: a deck says "Present", a doc or a
site says "Preview". Whatever we call the narrated mode has to respect that split, because
"presenting" a website reads wrong.

### 2.3 Two defects to resolve before narration lands on top

**The editor's present mode drops pages.** `editor/Present.tsx` calls `slideElement(section, theme(),
profile())` with the default `page = 0` and computes `total()` as `sections.length`. A section taller
than its frame therefore shows only its first page in the editor, while the same deck at
`/present/:id` shows every page. Anyone rehearsing in the editor sees a different deck from the one
their audience gets.

**A notes-only edit would be silently discarded.** `narrowOps` in `model/artifact.ts` rewrites a whole
section `set` op into per-element `data` ops whenever the section shell is unchanged, and
`SECTION_SHELL_EQUAL` compares only `background`, `bleed`, and `frame`. If we add `notes` to `Section`
without adding it there, an edit that changes the notes and nothing else produces
`dataDelta(root, root) === []`, which is truthy, so the `set` op is replaced by zero data ops and the
edit never reaches the row. It fails silently, on the save path, which is the worst place for it. The
fix is one line plus a test that would have caught it.

### 2.4 The tool slot is already reserved

`model/tools.ts:364` defines `write-speaker-notes` ("Write presenter notes for slides", category
`assist`, `usage: { reply: 1 }`), with no `live: true`, no `TOOL_SPEC` entry, and no body in
`services/core/ai/tools/`. `implement()` refuses an id without a definition and refuses a reachable id
without a `TOOL_SPEC` entry, so turning it on is a matter of filling in the two halves rather than
inventing a new tool identity.

## 3. Decisions

**Notes are a spoken script plus presenter cues, in one structure.** One AI pass produces
`{ spoken, cues[] }` per section. The voice reads `spoken` and only `spoken`, so a reminder like
"pause for questions, do not mention the pricing change" is never read to an audience. We rejected a
single plain notes field, which is simpler but makes every presenter-only aside a hazard the moment
narration is switched on, and we rejected two independently authored fields, which doubles the
authoring surface and lets the two drift as the content changes.

**Audio is pre-rendered and cached, never streamed per play.** A "Prepare narration" step synthesizes
every section server-side and stores the audio with its character alignment. Pre-rendering costs an
extra step before a deck can be presented, but it buys three things a live stream cannot: exact
per-section durations, which is what makes unattended auto-advance correct rather than guessed;
playback on a published link, where the viewer has no credentials and we will not mint provider tokens
for anonymous traffic; and a stable cost, since a deck presented twenty times is synthesized once. We
rejected browser-direct streaming over a `tts_websocket` token, which mirrors dictation and needs no
storage, because it gives none of the three.

**Narration reaches published links in v1.** The audio route is gated by the same read that already
governs the public content, so a password-protected or token-scoped link protects its narration too.

**Voices are chosen by the customer, not hardcoded by us.** A workspace browses the ElevenLabs voice
library with real filters, auditions candidates, optionally designs a voice from a written description,
and saves the ones it likes to a shelf with one marked default; an artifact can override that default.
Section 7 covers the whole surface.

An earlier draft of this plan said "six to eight ElevenLabs stock voices that we name and describe",
and that was wrong on a fact rather than on taste: those are Default voices, and ElevenLabs has
announced that **all Default voices expire on 31 December 2026**, roughly four months out. A hardcoded
set of their ids would have broken inside the same year we shipped it. Library voices are
user-contributed and carry no such date, and a designed voice is ours, so both survive the cutoff.
Voice cloning stays out of scope: it needs consent capture and its own storage, and it is a feature in
its own right.

**Narration is paged formats only in v1.** A deck advances one section at a time and the audio boundary
is a natural cut. A doc or a site is a continuous scroll with no equivalent boundary, so narrating it
means scroll-syncing against character alignment, which is a different problem. Notes themselves are
format-agnostic and ship everywhere.

## 4. Data model

### 4.1 Notes live in the content

```ts
// model/artifact.ts
// Presenter notes for one section. `spoken` is the narration script and is the only part a voice
// ever reads; `cues` are for the person at the podium and never leave the editor.
export interface SectionNotes {
    spoken: string;
    cues?: string[];
    source?: "ai" | "human"; // an untouched AI draft can be regenerated without asking
}

export interface Section {
    id: Id;
    root: ElementInstance;
    background?: SectionBackground;
    bleed?: boolean;
    frame?: SectionFrame;
    notes?: SectionNotes;
}
```

Notes go in `Section` rather than a side table so they ride the write path that already exists. A `set`
op carries the whole section, so notes inherit autosave, the section-op route, the collaboration room's
ordering, inverse-op undo, duplication, and template capture without a second sync mechanism.
`collab.md`'s "one write path" invariant is the reason: a parallel notes table would need its own
ordering, its own undo, and its own answer for what happens when a section is deleted while someone is
typing a note into it.

The costs are real and each has an owner below. Notes reach the public payload unless stripped (§4.3).
They add bytes to every windowed section read, roughly 600 to 1200 characters per section, so a
twelve-section deck grows by about 10 KB, which `loading.md`'s windowing already absorbs. And
`SECTION_SHELL_EQUAL` has to learn about them (§2.3).

Three edits in `model/artifact.ts`, all small:

- add `notes` to `Section`
- add `b.notes === a.notes` to `SECTION_SHELL_EQUAL`
- leave `artifactSearchText` and `artifactDigest` alone. Notes are not the artifact's content and
  should not rank in library search, and the digest is what library covers and windowed reads are built
  from, where notes have no place.

### 4.2 Audio is a derived cache in its own table

```
narrations
  id           uuid pk
  artifact_id  uuid not null references artifacts on delete cascade
  section_id   text not null
  hash         text not null      -- sha256(spoken + voice_id + model_id + output_format)
  voice_id     text not null
  model_id     text not null
  mime         text not null      -- audio/mpeg
  data         text not null      -- base64 bytes, as assets.data already does
  bytes        bigint not null
  ms           integer not null   -- measured duration, what auto-advance is timed from
  alignment    jsonb              -- character start/end times, for the caption overlay
  chars        integer not null   -- what we billed
  created_at   timestamptz not null default now()
  unique (artifact_id, section_id, hash)
  index on (artifact_id)
```

It is a cache, not an asset. Assets are user media, deduped per workspace by content hash, counted
against the plan's storage cap, and browsable in the media picker; narration is derived output, keyed
by the text that produced it, invalidated when that text changes, and has no business appearing in a
picker whose contract is `image | video`. Keeping it separate also means we can drop the whole table to
reclaim space without touching anything a customer uploaded.

Storing base64 in Postgres follows `assets.data`, which is the pattern the codebase already has, and it
inherits the same scale ceiling. At `mp3_44100_64` a thirty-second narration is roughly 240 KB, so a
twelve-section deck holds about 3 MB before base64 expansion and about 4 MB after. That is fine for now
and it is another argument for the object-storage move already specced in
`.docs/prompts/08-object-storage.md`. The read path is one function, so moving the bytes later is one
file's diff.

### 4.3 The privacy boundary

`GET /api/p/:slug/content` returns `read.content` verbatim to anyone who clears the link's gate. If
notes sit in the content, presenter cues ship to the audience, which is the exact failure the
`spoken`/`cues` split exists to prevent.

The rule: **the public content payload carries no `notes` at all.** `publicRead` strips the field on
the way out. The spoken text a caption needs is served from the narration route instead, which is gated
per link and only answers for sections that have prepared audio. One gate, one place to reason about,
and a link whose owner never prepared narration reveals nothing.

The same strip applies to any future export that leaves the workspace, with PPTX notes as the
deliberate exception, since a PPTX file is the presenter's own copy.

### 4.4 The cache key

`sha256(spoken + " " + voice_id + " " + model_id + " " + output_format)`. Editing one section's script
invalidates that section and nothing else. Changing the artifact's voice invalidates every section,
which is correct and is why the voice picker warns before it re-renders. Rows for a superseded hash are
kept until the next write for that `(artifact_id, section_id)` pair, so switching a voice back and
forth does not pay twice.

### 4.5 Voices are adopted once for the whole install, then shelved per workspace

A shared voice is not usable in text to speech until it has been adopted into the calling account with
`POST /v1/voices/add/{public_user_id}/{voice_id}`, and Galleo is one ElevenLabs account serving every
workspace. Adoption counts against a monthly voice-operation limit on that account (roughly 95 a month
on Creator, 290 on Pro, 1040 on Scale), so if each workspace adopted its own copy of a popular voice we
would burn the allowance on duplicates.

The fix is to adopt at most once per distinct voice, install-wide, and let workspaces reference the
adopted row. Two tables:

```
voices                    -- install-wide adoption cache: the voices this deployment can speak with
  id             uuid pk
  external_id    text not null unique   -- the ElevenLabs voice_id, usable in TTS after adoption
  source         text not null          -- library | designed | seeded
  owner_id       text                   -- library only: the public_owner_id adoption needed
  name           text not null
  description    text
  labels         jsonb                  -- gender, age, accent, use_case, descriptive, language
  preview_url    text                   -- library: the provider's own free sample
  preview_data   text                   -- designed: base64 of the kept preview, which has no url
  adopted_at     timestamptz not null default now()
  index on (source)

workspace_voices          -- the shelf: what one workspace has saved, and which one is its default
  workspace_id   uuid not null references workspaces on delete cascade
  voice_id       uuid not null references voices on delete cascade
  name           text                   -- a per-workspace rename, e.g. "Our narrator"
  is_default     boolean not null default false
  added_at       timestamptz not null default now()
  primary key (workspace_id, voice_id)
  unique index on (workspace_id) where is_default
```

Saving a library voice is cheap for us: adopted library voices do not consume the account's custom
voice slots, only the monthly operation, and only on first adoption across the whole install. A
**designed** voice is different, because it does take a slot and slots are finite (160 on Pro, 660 on
Scale) for every workspace put together. That is what §8 gates and caps, and it is why designed voices
have a reaper.

The per-artifact override goes in `ArtifactShell`, which is the declared home for artifact-wide fields
and the only place one survives a section-op write:

```ts
export interface ArtifactShell {
    format: Id;
    theme: Id;
    background?: SectionBackground;
    page?: PageSize;
    voice?: Id; // a workspace_voices row; absent means the workspace default
}
```

`asContent` has to carry it through, the same way it already carries `background` and `page`, or the
next section edit drops it. Because the voice is part of the narration cache key, changing it makes
every section stale, which the picker says before it does anything.

A voice id in the content is not a secret and reaching a public viewer is harmless, so unlike `notes`
it does not need stripping. It is what lets a published player show who is speaking.

## 5. Server

### 5.1 `services/core/ai/speech.ts`

A new file beside `voice.ts`, since dictation and synthesis are different concepts and the repo keeps
one concept per file. It owns the provider contract and nothing else:

- `NARRATION_MODEL = "eleven_multilingual_v2"`, chosen because it is the most stable model on long-form
  generation and narration is long-form by definition. `eleven_v3` is more expressive at the same price
  and a lower character ceiling; `eleven_flash_v2_5` is half the price and audibly flatter.
- `speechReady()`, mirroring `voiceReady()`, over the same `ELEVENLABS_API_KEY`.
- `synthesize(text, voiceId, opts, fetchFn = fetch)`, posting to
  `POST /v1/text-to-speech/{voice_id}/with-timestamps` and returning
  `{ audio: Buffer, mime, alignment, ms }`. The injected `fetchFn` is the seam the tests use, exactly
  as `mintVoiceToken` already does it.
- `SpeechError extends Error` with a `502 | 503` status, matching `VoiceError`.

There is no hardcoded voice list here. What a workspace can speak with comes from the `voices` table,
which §7 fills. The one constant that stays is the seed: a short list of library voice ids that
`pnpm seed` adopts so a fresh install can narrate before anyone opens settings.

Voice discovery, adoption, and design are a second concept and get their own file,
`services/core/voices.ts`, since they touch the database and the provider's voice endpoints rather
than synthesis: `searchLibrary(filters)`, `adopt(externalId, ownerId)` (idempotent on
`voices.external_id`, which is what keeps the monthly operation budget from being spent on duplicates),
`design(description, sampleText)`, and `keepDesigned(generatedVoiceId, name)`.

**The voice registry must not go in `services/core/models.ts`.** `scripts/check-models.mjs` parses
`provider: "…", model: "…"` pairs out of that file and validates each id against the installed
`@ai-sdk/<provider>` package's declared union. An ElevenLabs entry there fails the guard, and the guard
is right to fail it, because it is checking a different kind of registry.

### 5.2 Routes

Both new streaming routes sit in `services/api/ai.ts` beside the dictation pair. Bodies go through
`readJson(c, zSchema)`, per the validation rule.

```
POST /ai/notes      SSE. Writes speaker notes for the named sections, or the whole artifact when
                    `sectionIds` is absent. Emits one { type: "notes", sectionId, spoken, cues }
                    per section as it lands, then { type: "done" }. Meters write-speaker-notes,
                    scaled by section count, reconciled to the sections actually written.

POST /ai/narrate    SSE. Synthesizes the spoken script of each named section, skipping any whose
                    hash is already cached. Emits { type: "section", sectionId, ms, cached } per
                    section and { type: "done", chars } at the end. Meters narrate-artifact by
                    characters, reconciled in a finally so a half-finished run bills for what it
                    actually synthesized.

GET  /artifacts/:id/narration
                    Gated by gateArtifact. The manifest: per section, { hash, ms, chars, stale }
                    plus the spoken text and the alignment. One request tells the player what it
                    can play and what needs preparing.

GET  /artifacts/:id/narration/:sectionId
                    Gated by gateArtifact. The audio bytes, with an immutable cache header.

GET  /p/:slug/narration and /p/:slug/narration/:sectionId
                    The same two reads through publicRead, so a password or recipient token gates
                    the narration exactly as it gates the content. Answers 404 for a section with
                    no prepared audio rather than revealing that notes exist.
```

The voice surface adds a router of its own, `services/api/voices.ts`, because six routes would crowd
the AI file and voices are their own resource:

```
GET    /voices                 The workspace shelf: saved voices, which is default, and each one's
                               preview. Cheap and cached client-side.
GET    /voices/library         UNMETERED, rate-limited. Proxies GET /v1/shared-voices with the
                               filters in §7.1. Returns provider preview_urls, which cost nothing
                               to play. Proxied rather than called from the browser so the API key
                               stays server-side, exactly as /media/search already does.
POST   /voices                 Save a voice to the shelf. Adopts it install-wide first if no
                               `voices` row has that external_id yet. Idempotent.
PATCH  /voices/:id             Rename it, or make it the workspace default.
DELETE /voices/:id             Remove it from the shelf. Refuses while it is the default and other
                               voices exist, so a workspace cannot end up with no default.
POST   /voices/design          Meters design-voice. Posts to POST /v1/text-to-voice/design and
                               returns three candidates, each { generatedVoiceId, audio, ms }.
                               Nothing is persisted until one is kept.
POST   /voices/design/keep     Meters nothing. Calls POST /v1/text-to-voice/create for the chosen
                               candidate, writes the `voices` row, and shelves it. Refuses over the
                               workspace cap or the install ceiling (§8).
POST   /voices/audition        Meters audition-voice. Synthesizes one short line in a candidate
                               voice so the customer hears it read their own words. Capped at 200
                               characters server-side, whatever the client sends.
```

Both SSE routes follow the shape `POST /media/generate` already uses:
`streamSSE(c, (stream) => held.settle(async (billed) => { … billed({ unit: n }) in a finally }))`.
That is the established reserve-then-reconcile pattern and it gives failure refunds for free.

The audio reads mirror `GET /media/asset/:id`, which serves
`cache-control: public, max-age=31536000, immutable`. The URL carries the hash as a query parameter so
a re-render is a different URL rather than a stale cache entry.

### 5.3 Where the notes writer lives

`services/core/ai/tools/notes.ts` implements `write-speaker-notes` against the reserved definition,
with its prompt in `services/core/ai/prompts/notes.ts`. Two things shape it:

**One call over the whole deck.** A note for slide seven should not repeat what slide six already said,
and should hand off into slide eight. Continuity is the entire craft of speaker notes, so the model
sees the full section spine and writes the set. Per-section regeneration passes the neighbouring notes
as context rather than writing in isolation.

**The section text comes from the same extraction search already uses.** `collect()` in
`model/artifact.ts` walks a section's tree into its visible strings, which is exactly the input a note
writer needs, and reusing it means a new element type is narratable the day it is registered.

The prompt has to earn the word "spoken". Notes written like prose read badly aloud: the script wants
short sentences, spelled-out numbers where a reader would say them, no bullet fragments, no
parentheticals, and no stage directions, because those belong in `cues`. It also has to know the
format, since a deck section is a beat in a talk and a doc section is not.

Turning the tool on is four edits: add a `TOOL_SPEC` entry with a `describe` and an input schema
(`{ sectionIds?: string[] }`), set `live: true`, replace the flat `usage: { reply: 1 }` with a `meter`
that scales by section count, and register the body. Once it is registered it appears to the chat agent
automatically, so "write me speaker notes for this deck" works in the dock with no further wiring.

## 6. Client

### 6.1 Converge the present surfaces first

Narration is one overlay, and it should be built once. Before any of it lands, `editor/Present.tsx`
becomes a thin caller of `@ui/present`'s `PresentSurface`, with the overview grid moved into
`PresentSurface` behind an `overview` prop so the editor keeps it. That resolves the pagination defect
in §2.3, satisfies the AGENTS.md rule that a Solid component shared by editor and app lives in `@ui`,
and means the narration player has exactly one home.

It touches `editor/Present.tsx` (rewritten, currently clean), `editor/core/store.ts` and
`editor/Editor.tsx` (small, both currently dirty from another session), and `ui/present.tsx` (the
overview prop, currently clean).

### 6.2 The narration seam

`@ui` may not import `@app`, so `PresentSurface` cannot fetch. It takes an injected source, the same
way the editor takes transports registered in `EditorView.tsx`:

```ts
// ui/present.tsx
export interface NarrationTrack {
    url: string;
    ms: number;
    spoken: string;
    alignment?: { characters: string[]; starts: number[]; ends: number[] };
}

export interface NarrationSource {
    /** Null when this section has no prepared audio; the player skips it. */
    trackFor(sectionId: string): Promise<NarrationTrack | null>;
    voiceName?: string;
}
```

`app/` implements it over the authenticated routes, `publish/` over the `/p/:slug` ones. No source
wired means no narration controls render at all, which is the same "no host, no feature" property the
editor's AI seams already have, and it is what keeps a self-hosted instance without an ElevenLabs key
from showing dead buttons.

### 6.3 The present overlay

Playback is a small controller owning one `<audio>` element: preload the current section's track,
prefetch the next, advance on `ended`, pause and resume with the deck, and re-seek when the viewer
navigates by hand.

- **A play gesture is mandatory.** Browsers block audio autoplay, so a narrated deck opens on a title
  card with a play control. "Auto-presenting" starts from one click and is unattended after that.
- **Auto-advance is timed from the real duration**, not from a guess, which is the whole reason for
  pre-rendering. A section spanning several slides distributes its pages evenly across the track.
- **The caption overlay** highlights the current word from the character alignment, in the artifact's
  own theme tokens, at the bottom of the frame. It is off by default and toggled, because a caption
  under a slide the presenter is also speaking over is noise.
- **A section with no prepared audio is silent and does not stall**: the controller advances on a fixed
  dwell instead, so a partly prepared deck still plays end to end.
- **Presenter notes stay presenter-side.** In the editor's present overlay and at `/present/:id`, `N`
  toggles a notes pane showing `spoken` and `cues` for the current section. It never renders at
  `/p/:slug`, and because the public payload has no notes, it structurally cannot.

The controls join the existing `FloatingBar`: play and pause, a voice indicator, a captions toggle, and
a speed control. On coarse pointers they take `IconButton size="touch"`, and the tap-to-advance zones
have to not fight the play control, which is why the bar already stops propagation.

### 6.4 The notes surface in the editor

A `notes` tab in the existing right panel, which already keys on an arbitrary string in `rightTab`. It
shows the selected section's script in a plain textarea, its cues as an editable list, a "Write notes"
action for this section, and a "Write notes for every section" action for the deck. Sections that have
notes get a mark in the minimap, so an author can see coverage without clicking through.

The composer textarea is a natural home for the existing `VoiceInput`, so an author can dictate a
script rather than type it. That is a small win and it closes the loop between the two voice features.

### 6.5 The published player

`publish/PublicView.tsx` gains the narration source and a first-run state: if the link has prepared
narration, the viewer sees a play control over the cover rather than the bare deck. The existing view
heartbeat already reports furthest-reached progress, so a narrated view is measurable against a silent
one with no new plumbing.

## 7. Voices: choosing, auditioning, and designing

A narrated deck is only as good as the voice reading it, and the right voice is a matter of taste that
we cannot pick on a customer's behalf. So the product gives them three ways to find one, in increasing
order of effort and cost, and one place to keep what they found.

### 7.1 Browse the library, filtered

`GET /v1/shared-voices` exposes upwards of ten thousand user-contributed voices with genuinely useful
metadata, and every result carries a `preview_url` pointing at a sample the provider already rendered.
Playing one costs nothing, which is what makes browsing the default path rather than a premium one.

The filters we surface, all of them provider-native rather than invented:

| Control   | Provider parameter | Notes                                                      |
| --------- | ------------------ | ---------------------------------------------------------- |
| Search    | `search`           | free text over name and description                        |
| Gender    | `gender`           |                                                            |
| Age       | `age`              | young, middle aged, old                                    |
| Accent    | `accent`           | the long tail, so a combobox rather than a fixed list      |
| Language  | `language`         | defaults to the artifact's language where we know it       |
| Use case  | `use_cases`        | narration and informative educational are the ones we want |
| Character | `descriptives`     | calm, confident, warm, and so on                           |
| Sort      | `sort`             | trending by default, since popularity is a decent proxy    |

Results render as a grid of cards: name, a one-line description, the label chips, and a play button.
Playing is a plain `<audio>` against `preview_url`, so the browser does the work and Galleo spends
nothing. Save adds it to the shelf, adopting it install-wide on the way if this deployment has never
seen it (§4.5).

This is the workhorse and it should be what opens.

### 7.2 Design a voice from a description

`POST /v1/text-to-voice/design` takes a written description of a voice between 20 and 1000 characters
and returns three candidates, each with a `generated_voice_id` and a base64 audio sample. This is the
path that fits Galleo: the whole product is "describe what you want and get something back", and a
voice is no different from a theme in that respect.

The surface is a prompt box with a few starter descriptions, the same shape the theme generator already
has. "A warm, unhurried British woman in her forties, documentary narrator, low pitch" returns three
takes to play against each other. Keeping one calls `POST /v1/text-to-voice/create` and shelves it;
discarding costs nothing beyond the design call that produced it.

Two provider details worth wiring rather than ignoring. `auto_generate_text` writes the sample script
for you, but passing a real line from the open artifact instead means the candidates are auditioning on
the actual material, which is a much better signal. And `guidance_scale` trades obedience against
variety, so a "more like this, but different" control has somewhere to go later.

Designed voices are the expensive path in every sense: they cost a design call each time, and a kept
one occupies one of a finite number of custom voice slots on the shared account. §8 gates and caps
them accordingly.

### 7.3 Audition on your own words

Both paths answer "what does this voice sound like", but neither answers "what does this voice sound
like reading my deck", which is the question people actually have. `POST /voices/audition` synthesizes
one short line in a candidate voice: the first section's spoken script when the picker is opened from
an artifact, a fixed sample sentence when it is opened from settings.

It is capped at 200 characters server-side regardless of what the client asks for, metered, and
rate-limited. One line is about a credit, which is cheap enough to use freely and metered so that a
script cannot be laundered through it.

### 7.4 The shelf, in workspace settings

Voice belongs to the workspace rather than the person, for the same reason themes do: it is part of how
a team's work sounds, and the next person to narrate a deck should get the same voice without
configuring anything. It goes in `app/views/WorkspaceSettingsView.tsx`, in a "Voice" section beside the
brand and theme controls, not in `/account`.

The section holds the saved voices as rows, each with a play button, an inline rename, a radio marking
the workspace default, and a remove. Above them, one button opens the picker modal described in 7.1 to
7.3. Exactly one voice is the default, enforced by a partial unique index rather than by the UI, and
removing the default is refused while another voice could take its place.

The picker itself is a `@ui` modal with the browse and design tabs, because the same picker is needed
from settings and from the editor, and a component shared across two modules cannot live in either one.
Everything inside it is built from existing primitives: `Modal`, `Chip` for the label filters, the text
input family for search, `IconButton` for play and pause. The only genuinely new atom is a small
play-scrubber for a voice sample, and it is worth building once in `@ui` because it appears in the
picker, the shelf, and the narration controls.

If `speechReady()` is false the whole section is absent, not disabled, matching how the dictation mic
already hides itself.

### 7.5 Per-artifact override

An artifact's voice sits next to its theme, since they are the same kind of choice, and writes
`ArtifactShell.voice`. The control lists the workspace shelf plus a "Workspace default" entry that
leaves the field unset, so a workspace that later changes its default carries every artifact that never
overrode it.

The same picker opens from here with one addition: "Save to workspace" on a voice chosen for a single
artifact, so trying a voice on one deck and then adopting it for the team is one click rather than a
second trip through settings.

Changing the voice invalidates the whole artifact's narration, because the voice is in the cache key.
The control says so before it commits, and the wording matters: what the customer is agreeing to is
re-rendering, and re-rendering costs credits.

## 8. Credits and entitlements

**A new `speech` cost unit, flat-priced like `image` and `video`.** One unit is 1000 characters
synthesized. Derived, not chosen: `eleven_multilingual_v2` is $0.10 per 1000 characters and
`CREDIT_USD` is $0.0142, so a unit is $0.10 / $0.0142 = 7.04 credits, and we bill 7. `UNIT_TASK.speech`
is `null`, because voice models are not in the text-model registry and are not priced per token, which
is the same reason `image` and `video` are null there.

A twelve-section deck with 700 characters of script per section is 8400 characters, so
`Math.ceil(8400 / 1000) = 9` units, or **63 credits** to narrate. For comparison the generation that
produced the deck is anchored at about 40. That is expensive enough to need saying plainly in the UI
before the render starts, and it is an argument for keeping scripts tight, which is also what makes
them better narration. If it proves too heavy in practice the lever is the model: `eleven_flash_v2_5`
halves it at an audible quality cost, and would be a `voiceModelTier` entitlement in the shape
`textModelTier` and `imageModelTier` already have.

Writing the notes is separate and much cheaper. `write-speaker-notes` gets a `meter` of
`{ text: sections }`, so the same deck costs 12 credits for the notes and 63 for the voice.

`describeUsage` needs a label for the new unit, and the credits table in `app/components/credits.tsx`
needs the row.

**The voice picker's own costs.** Browsing and playing provider previews are free and stay unmetered,
which is the point of leading with them. Two paths do spend:

- `audition-voice`, one line of at most 200 characters, so `{ speech: 1 }` rounds to 7 credits. That is
  more than it deserves at a 1000-character unit, so it prices as a flat `{ text: 1 }` instead, one
  credit, which is both closer to the truth and easy to explain.
- `design-voice`, one call returning three candidates. The provider documents neither a flat price nor
  a character cost for it, and each candidate carries a sample of 100 to 1000 characters, so a design
  call plausibly costs between 300 and 3000 characters of synthesis. We should **measure it against a
  real account before setting the number** rather than guess in the catalog. Until then it takes a
  `ceiling` of `{ speech: 3 }`, which holds 21 credits up front and refunds the difference on settle,
  which is exactly the mechanism `ceiling` exists for.

Both are ordinary entries in `model/tools.ts` with bodies in `services/core/voices.ts`, so they inherit
the reserve-then-settle path and the three `ai_action_*` events without any new plumbing.

**Entitlements.** Three keys in `model/billing.ts`, resolved the usual way:

- `voiceNarration`, whether an artifact can be narrated at all.
- `voiceDesign`, whether the design tab appears. Gated because a kept designed voice consumes one of a
  finite number of custom voice slots on our single shared account, and a finite shared resource handed
  out for free is a resource that runs out.
- `maxWorkspaceVoices`, how many voices a shelf holds. Saved library voices are nearly free to us, so
  this is generous; designed voices are capped separately and much lower.

Two limits are ours rather than the plan's, and they belong in `services/core/voices.ts` next to the
code that can enforce them. An **install-wide ceiling** on designed voices, because slots are global and
one workspace must not be able to exhaust them for everyone. And a **reaper** for designed voices that
no artifact references and no shelf holds, run on the same schedule as unreferenced-asset collection,
so an experiment that nobody kept does not permanently occupy a slot.

## 9. Analytics

The three `ai_action_*` events key on `tool_id`, so both new tools are instrumented the moment their
ids exist, with no new event definitions. What is genuinely new is playback, and it belongs in
`model/analytics.ts` (currently untracked in another session's working tree, so this lands after
theirs):

```ts
narration_prepared: {
    section_count: number;
    chars: CharsBucket;
    credits_charged: number;
    cached: number;
    ms: number;
}
narration_played: {
    where: "editor" | "present" | "publish";
    artifact_format: Surface;
    sections_heard: number;
    section_count: number;
    completed: boolean;
    ms: number;
}
notes_written: {
    where: "panel" | "chat";
    section_count: number;
    regenerated: boolean;
}
voice_saved: {
    source: "library" | "designed" | "seeded";
    from: "settings" | "editor";
    shelf_size: number;
    made_default: boolean;
}
voice_auditioned: {
    source: "library" | "designed";
    kind: "preview" | "own_text";
}
voice_designed: {
    kept: boolean;
    attempt: number;
}
```

Per the capture policy, none of these carry a word of the script, and none carries the voice
description a customer typed, which is their words about how they want to sound. Length is reported as
a bucket rather than an exact count, reusing the `CharsBucket` type that already exists for the same
reason.

`voice_auditioned` is the one worth watching early. If `preview` auditions dwarf `own_text` ones, the
free library path is carrying the feature and the design tab is decoration; if the ratio runs the other
way, people do not trust a stock sample and the audition line should be more prominent than it is in
this plan.

## 10. Testing

Following `testing.md`'s contract, the only thing faked is the external oracle. For narration that is
the ElevenLabs HTTP call, injected as `fetchFn` exactly as `mintVoiceToken` already takes it, and for
the notes writer it is the `ai` SDK, faked the way every other tool's tests fake it.

Unit:

- the cache key: same text and voice hashes the same, a changed script does not, a changed voice does
- `SECTION_SHELL_EQUAL` with notes: a notes-only edit survives `narrowOps` as a `set` op. This test is
  the one that would have caught §2.3, so it gets written before the field is added.
- alignment to caption windows: character times fold into word ranges, and an empty alignment degrades
  to no highlight rather than throwing
- the public strip: `publicRead`'s output has no `notes` on any section, asserted over content that has
  them on every section
- the notes prompt builder: section text extraction, neighbour context on a single-section regenerate
- `speechReady` mirrors the env key, and `synthesize` 503s without a key without touching the network

Integration (`.itest`, real Postgres):

- `POST /ai/narrate` reserves, synthesizes, stores, and settles to the character count
- a second call with unchanged notes returns `cached` for every section and bills nothing
- editing one section's script invalidates that row and no other
- the public narration route honours a password gate and a recipient token, and 404s for a section with
  no prepared audio
- deleting the artifact cascades the narration rows
- adopting a voice twice, from two workspaces, performs one provider call and yields one `voices` row.
  This is the test that protects the monthly voice-operation budget, so it asserts the call count, not
  just the row count.
- the default is exactly one: shelving a second default demotes the first, and the partial unique index
  refuses two even when written directly
- removing the last voice on a shelf is refused, and removing the default while others remain promotes
  one rather than leaving the workspace with none
- `POST /voices/design/keep` refuses over the workspace cap and over the install ceiling, with
  different messages, since one is the customer's limit and the other is ours
- `POST /voices/audition` truncates at 200 characters server-side even when the client sends more

End to end (`e2e/present/`):

- notes written from the panel appear on the section and survive a reload
- present mode plays a stubbed track and advances on its end
- a published link shows the play control and does not expose cues in its payload

## 11. Environment and hosting

No new key. `ELEVENLABS_API_KEY` already exists and now serves both dictation and synthesis, so the
comment above it in `.env.example` needs widening, and `hosting.md`'s env contract needs the same note.

Two operational points worth stating before it ships. Synthesis is slow, roughly a second of wall clock
per ten seconds of audio, so a twelve-section deck takes most of a minute and the SSE progress stream
is what makes that tolerable. And narration bytes are the first thing in the product that grows without
an upload, so the Neon storage line will move; the `narrations` table is droppable and rebuildable,
which is the property that makes that safe.

## 12. Build order

Each phase is independently useful and independently shippable.

1. **Notes as content.** `SectionNotes` on `Section`, `SECTION_SHELL_EQUAL`, the public strip, the
   editor's notes panel, and the tests. No AI, no audio. At the end of this an author can write and
   read speaker notes.
2. **Notes written by AI.** `TOOL_SPEC` and the body for `write-speaker-notes`, the prompt, the
   `POST /ai/notes` route, the metering, the panel actions, and the chat path that comes free with
   registration.
3. **Present convergence.** `editor/Present.tsx` onto `PresentSurface`, the overview prop, the
   pagination fix, and the notes pane in present mode on `N`.
4. **Voices, the minimum that unblocks synthesis.** The `voices` and `workspace_voices` tables, the
   adoption path in `services/core/voices.ts`, `ArtifactShell.voice`, and the seeded shelf. No picker
   yet: seed a handful of library voices and let the workspace default be one of them. Phase 5 needs a
   usable voice id and nothing more, and building the browser first would hold synthesis hostage to UI.
5. **Synthesis.** `speech.ts`, the `narrations` table and its migration, `POST /ai/narrate`, the gated
   audio and manifest reads, the `speech` cost unit, and the integration tests.
6. **Playback.** The `NarrationSource` seam, the controller, the caption overlay, auto-advance, and the
   floating-bar controls, wired in the editor and at `/present/:id`.
7. **The published player.** The `/p/:slug` narration reads, the play-first state in
   `publish/PublicView.tsx`, and the playback analytics.
8. **The voice picker.** `GET /voices/library` and the browse tab with its filters, the shelf in
   workspace settings, the per-artifact override control, and the audition line. This is where the
   feature stops being ours and starts being theirs.
9. **Voice design.** The design tab, `POST /voices/design` and `/keep`, the `voiceDesign` entitlement,
   the per-workspace cap, the install ceiling, and the reaper. Last because it is the only part that
   consumes a finite shared resource, and it wants the measured cost from §8 before its price is set.

PPTX notes are a natural tenth, since `canvas/render/pptx.ts` writes no notes part today and the format
supports one, but it is a separate deliverable rather than part of this one.

Phases 1 to 3 are notes, and are worth shipping on their own. Phases 4 to 7 are narration, and the
first point at which anyone hears anything is the end of 6. Phases 8 and 9 are choice, and a workspace
that never opens them still gets a narrated deck in a seeded voice, which is the property that lets
them be last without the feature feeling unfinished before they land.

## 13. Working alongside the parallel sessions

At the time of writing the tree carries 214 modified paths and about +6957/-2107, with
`model/analytics.ts` and `services/core/ai/__tests__/catalog.test.ts` untracked. That is several
features in flight at once, so this plan is sequenced to stay out of their way.

Quiet and safe to work in now: `ui/present.tsx`, `editor/Present.tsx`, `app/views/PresentView.tsx`,
`canvas/render/present.ts`, `services/core/ai/voice.ts`, `app/components/voice.ts`,
`app/components/VoiceInput.tsx`. This is most of phases 3 and 5.

Contended, so touch late and in the smallest possible diff: `model/artifact.ts` (a `group` and `card`
merge into `container` is landing there), `model/tools.ts` and `model/credits.ts` (an analytics session
is adding `ACTION_FOR` and `taskForUsage`), `model/analytics.ts` (untracked, so a new event definition
has to wait for it to be committed), `services/db/schema.ts`, `services/api/ai.ts`, `app/api.ts`,
`editor/core/store.ts`, `editor/Editor.tsx`, `publish/PublicView.tsx`,
`app/views/WorkspaceSettingsView.tsx` (where the voice shelf goes), and `model/billing.ts` (the three
new entitlement keys).

The voice work in phases 8 and 9 is the most exposed to this, since the shelf lands in a settings view
someone else is editing and the entitlements land in the billing resolver. Both are additive: a new
section in the settings view and three new keys in `FEATURES` and `Features`, so they append rather than
restructure, which is the shape least likely to collide. `services/api/voices.ts` and
`services/core/voices.ts` are new files precisely so that most of the surface lands where nobody else is
working.

Practical rules for the build:

- Take contended files one edit at a time, verify against the file as it stands rather than against a
  remembered version, and never rewrite a region another session is clearly mid-way through.
- Add the analytics events last, after `model/analytics.ts` is committed, so we are not editing an
  untracked file underneath the session that created it.
- The `narrations` table is additive, but `pnpm db:generate` writes a numbered migration, so generate it
  in a quiet moment and check no one else has just added one.
- New concepts go in new files (`services/core/ai/speech.ts`, `services/core/ai/tools/notes.ts`,
  `services/core/ai/prompts/notes.ts`, `services/api/narration.ts` if the AI router gets crowded), which
  is both the house rule and the lowest-conflict way to add code to a busy tree.

## 14. Planned and deferred

- **Narrating continuous formats.** Docs and sites need scroll-synced playback rather than
  section-boundary advance. Deferred until the paged case is proven.
- **Voice cloning.** ElevenLabs instant voice cloning would let a founder narrate in their own voice.
  Once §7 exists it is a third tab in a picker that already knows how to adopt, shelve and audition, so
  the remaining work is consent capture, the recording flow, and the professional-clone slot budget,
  which is much smaller than it is per plan (one slot on Creator and Pro, fifty on Scale). That budget
  is the reason it stays deferred rather than the UI.
- **Per-section voice.** A two-speaker deck, or a quote read in a different voice, is expressible in the
  data model already (the cache key is per section and carries the voice), and it is only the UI that is
  missing. Worth doing if anyone asks; not worth guessing at first.
- **Re-narrating only what changed.** The cache is per section, so editing one script already
  re-renders only that section. What is missing is a prompt: an artifact whose notes have moved on since
  its audio should say so and offer to top up rather than re-render everything.
- **A rendered narrated video.** Combining the slide renders with the audio into an MP4 is the obvious
  next ask and is a genuinely separate project, since it needs a rendering pipeline we do not have.
- **PPTX notes and embedded audio.** The notes part is cheap and should follow soon after phase 2. The
  embedded per-slide audio is possible in the format and is worth doing only once narration is real.
- **A true presenter view.** A second window with the next slide, the notes, and a timer. The `N` pane
  is the cheap version and covers most of the need.
- **Object storage.** Narration audio is the strongest argument yet for
  `.docs/prompts/08-object-storage.md`, and the read path is deliberately one function so the move is
  contained.
