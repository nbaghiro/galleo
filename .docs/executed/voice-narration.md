# Galleo — Speaker notes and voice narration

> Two features that share one spine: per-section speaker notes as first-class content, and a
> playing mode that reads those notes aloud in an ElevenLabs voice while the artifact advances
> itself. Notes stand on their own as text; narration is the layer on top.

Companion docs: `../ai.md` (the turn protocol, the tool catalog, the credit gate, and the
dictation route), `../rendering.md` (the engine every present surface paints through),
`../collab.md` (the one-write-path invariant this stays inside), `../workspaces.md` (entitlements
and the credit window), `../analytics.md` (the event catalog), `background-music.md` (the third
feature on the same spine).

## 1. What this is

Four capabilities, in the order they become useful:

1. **Speaker notes.** Every section can carry a spoken script and a set of presenter cues, written
   by the AI over the whole piece at once. They live in the artifact content and are visible in
   present mode's notes pane.
2. **Narration.** The spoken script of each section is synthesized through ElevenLabs, cached
   server-side with its character alignment, and played back during present mode with a caption
   overlay and auto-advance driven by the real audio duration.
3. **A self-playing published link.** A viewer opening `/p/:slug` with prepared narration gets a
   play control, and from that one gesture the artifact plays itself with voice: a deck advances
   its slides, a doc or a site scrolls itself. This is the reason the feature is worth having,
   since it turns a published piece into something closer to a short explainer without anyone
   recording or editing a video.
4. **A voice the customer picked.** A workspace browses the voice library with real filters, hears
   candidates read its own words, optionally designs a voice from a written description, and keeps
   a shelf of the ones it likes with one as the default. This is what stops every narrated deck in
   the product sounding like the same person.

## 2. Two voice features, opposite topologies

`services/core/ai/voice.ts` is dictation: it mints a single-use `realtime_scribe` token and the
browser streams microphone audio to ElevenLabs directly. Narration is not a mirror of it.
Dictation is ephemeral, per-user, and cheap to repeat, so browser-direct streaming is right for
it. Narration is a durable artifact of the document, is played by people who are not signed in,
and costs real money per synthesis, so it lives server-side (`services/core/ai/speech.ts`). The
two share `ELEVENLABS_API_KEY` and nothing else — except the readiness-probe pattern: a
capability that is not configured is invisible rather than broken (`speechReady` mirrors
`voiceReady`, and an unconfigured deployment shows no narration controls at all).

## 3. Decisions

**Notes are a spoken script plus presenter cues, in one structure.** One AI pass produces
`{ spoken, cues[] }` per section. The voice reads `spoken` and only `spoken`, so a reminder like
"pause for questions, do not mention the pricing change" is never read to an audience. A single
plain notes field was rejected because it makes every presenter-only aside a hazard the moment
narration is switched on; two independently authored fields were rejected because they double the
authoring surface and drift as the content changes.

**Audio is synthesized server-side once and cached, never streamed per play.** That buys three
things a live stream cannot: exact per-section durations, which is what makes unattended
auto-advance correct rather than guessed; playback on a published link, where the viewer has no
credentials and we will not mint provider tokens for anonymous traffic; and a stable cost, since
a deck presented twenty times is synthesized once. Browser-direct streaming over a
`tts_websocket` token — which mirrors dictation and needs no storage — was rejected because it
gives none of the three.

**There is no separate "prepare" step.** The plan had a "Prepare narration" pass before a deck
could be presented; what shipped records just in time instead. `NarrationSource.ensure` (in
`ui/narration.tsx`) synthesizes one section on demand: pressing play writes the script for the
section about to speak (when the host can author), records it, speaks it, and fills the rest of
the piece in behind the voice, prefetching the next section as each one plays. The whole-piece
pass still exists (`POST /artifacts/:id/narration`, SSE) for the presenter who wants everything
written and recorded up front, offered as "Write notes for this piece" in the notes pane. A
published link has no `ensure`, because an anonymous viewer cannot be charged; it plays only what
the author recorded.

**Narration reaches published links.** The audio routes sit behind the same `publicRead` that
governs the public content, so a password-protected or token-scoped link protects its narration
too.

**Voices are chosen by the customer, not hardcoded by us.** An early draft said "six to eight
ElevenLabs stock voices that we name and describe", and that was wrong on a fact rather than on
taste: those are Default voices, and ElevenLabs retires **all Default voices on 31 December
2026**. A hardcoded set of their ids would have broken inside the same year it shipped. Library
voices are user-contributed and carry no such date, and a designed voice is ours, so both survive
the cutoff. (One premade id does remain, as a deliberately expiring fallback — see §6.4.)

**Narration works in every format, over one step model.** An earlier draft deferred docs and
sites on the grounds that a continuous scroll has no boundary to advance across, and that was
wrong: sections are discrete in both kinds of format, and narration is per section in both. The
only thing that differs is what "go to the next thing" does. §7.4 defines the step model that
makes those one mechanism; the alternative was two navigation implementations and two sets of
bugs.

## 4. Data model

### 4.1 Notes live in the content

```ts
// model/artifact.ts
export interface SectionNotes {
    spoken: string;
    cues?: string[];
    source?: "ai" | "human"; // an untouched AI draft can be regenerated without asking
    of?: string; // sectionFingerprint of the section when these notes were written
}
```

Notes go in `Section` rather than a side table so they ride the write path that already exists: a
`set` op carries the whole section, so notes inherit autosave, the section-op route, the
collaboration room's ordering, inverse-op undo, duplication, and template capture without a second
sync mechanism. `../collab.md`'s "one write path" invariant is the reason: a parallel notes table
would need its own ordering, its own undo, and its own answer for what happens when a section is
deleted while someone is typing a note into it.

`SECTION_SHELL_EQUAL` in `model/artifact.ts` compares `notes` alongside `background`, `bleed`,
`frame` and `pinned`. This entry is load-bearing: `narrowOps` rewrites a whole-section `set` op
into per-element `data` ops whenever the shell is unchanged, so without it a notes-only edit
produced zero data ops and never reached the row — a silent failure on the save path. The unit
test asserting a notes-only edit survives `narrowOps` was written before the field was added.

`artifactSearchText` and `artifactDigest` ignore notes deliberately: notes are not the artifact's
content and should not rank in library search, and the digest is what library covers and windowed
reads are built from, where notes have no place.

**Staleness is a fingerprint, not a guess.** `of` records `sectionFingerprint` at write time, so a
script that no longer describes what is on screen can be told from one that does (`staleNotes` in
`model/artifact.ts`). Recorded audio for a stale section is wrong rather than merely old, so the
player treats it as a miss: the host rewrites the script and records the new words over it. Notes
written before the field existed count as current, because a deploy must not rewrite everyone's
notes at once. This is what "re-narrate only what changed" turned into: the cache is per section,
so editing one script re-renders only that section, and the fingerprint is what notices the other
direction, content moving on under an unchanged script.

### 4.2 Audio is a derived cache in its own table

`narrations` (`services/db/schema.ts`): one row per `(artifact_id, section_id, hash)`, carrying
`voice_id` (the provider id that actually spoke), `model_id`, `mime`, base64 `data`, `bytes`,
measured `ms` (what auto-advance is timed from), the character `alignment` for the caption
overlay, and `chars` (what we billed). Cascades with the artifact.

It is a cache, not an asset. Assets are user media, deduped per workspace by content hash, counted
against the plan's storage cap, and browsable in the media picker; narration is derived output,
keyed by the text that produced it, invalidated when that text changes, and has no business
appearing in a picker whose contract is `image | video`. It never counts against the storage cap,
and the whole table is droppable and rebuildable, which is what makes its growth on the Neon
storage line safe. Storing base64 in Postgres follows `assets.data`; at `mp3_44100_64` (~8 KB per
second) a thirty-second narration is roughly 240 KB, a twelve-section deck a few MB. The read
path is one function, so moving the bytes to object storage later is one file's diff.

### 4.3 The privacy boundary

`GET /api/p/:slug/content` returns the read's content to anyone who clears the link's gate. If
notes sat in that payload, presenter cues would ship to the audience, which is the exact failure
the `spoken`/`cues` split exists to prevent.

The rule: **the public content payload carries no `notes` at all.** `withoutNotes` in
`model/artifact.ts` strips the field (identity-preserving for sections without notes), applied in
`services/core/links.ts` on the way out. The spoken text a caption needs is served from the
narration manifest instead, which is gated per link and only answers for sections that have
prepared audio. One gate, one place to reason about, and a link whose owner never prepared
narration reveals nothing. `ArtifactShell.voice`, by contrast, is not stripped: a voice id is not
a secret, and it is what lets a published player show who is speaking.

### 4.4 The cache key

`narrationHash` in `services/core/ai/speech.ts`:
`sha256(spoken \0 voice_id \0 model_id \0 output_format)` (NUL-escaped separators, since a raw NUL
would make the file binary to grep). Every input that changes the audio is in the key, so a hit is
always safe to serve. Editing one section's script invalidates that section and nothing else.
Changing the artifact's voice invalidates every section, which is correct. The hash rides the
audio URL as part of the path, so a re-render is a different URL rather than a stale cache entry,
and the audio read serves `cache-control: public, max-age=31536000, immutable`.

### 4.5 Voices are adopted once for the whole install, then shelved per workspace

A shared voice is not usable in text to speech until it has been adopted into the calling account
with `POST /v1/voices/add/{public_user_id}/{voice_id}`, and Galleo is one ElevenLabs account
serving every workspace. Adoption counts against a monthly voice-operation limit on that account
(roughly 95 a month on Creator, 290 on Pro, 1040 on Scale), so if each workspace adopted its own
copy of a popular voice we would burn the allowance on duplicates.

So adoption happens at most once per distinct voice, install-wide, and workspaces reference the
adopted row. Two tables (`services/db/schema.ts`):

- `voices` — the install-wide adoption cache: `external_id` (what this account speaks with),
  `library_id` (the community id we adopted from — dedup keys on this, not on `external_id`,
  because the add may exchange the community id for an account-local one, and a caller holds the
  community id), `source` (`library | designed | seeded`), name, description, labels, and either a
  provider `preview_url` (library) or base64 `preview_data` (designed voices have no hosted
  sample).
- `workspace_voices` — the shelf: a per-workspace rename, `is_default` with a partial unique index
  so exactly one default is enforced by the database rather than the UI.

Saving a library voice is cheap for us: adopted library voices do not consume the account's custom
voice slots, only the monthly operation, and only on first adoption across the whole install. A
**designed** voice is different, because it does take a slot and slots are finite (160 on Pro, 660
on Scale) for every workspace put together. That is why designed voices have an install-wide
ceiling and a reaper (§6.3).

The per-artifact override is `ArtifactShell.voice` (a shelf row id; absent means the workspace
default), carried through `asContent` so a section-op write does not drop it, and honored by
`voiceFor` in `services/core/voices.ts`: the artifact's choice, else the workspace default, else
the first shelf row. Because the voice is in the cache key, changing it makes every section stale.

## 5. Server

### 5.1 `services/core/ai/speech.ts` — synthesis

Owns the provider contract and nothing else. `NARRATION_MODEL = "eleven_multilingual_v2"`, chosen
because it is the most stable model on long-form generation and narration is long-form by
definition (`eleven_v3` is more expressive at the same price with a lower character ceiling;
`eleven_flash_v2_5` is half the price and audibly flatter). `MAX_CHARS = 10_000` is the provider's
own ceiling for the model; a longer script is refused rather than silently clipped.

`synthesize(text, voiceId, fetchFn)` always posts to the `with-timestamps` endpoint, because the
alignment cannot be reconstructed afterwards and it is what the caption overlay and the per-page
step timing are built from. It deliberately sends no `voice_settings`: the provider's defaults
were picked over a tuned set by listening to both across a section change — loosening stability
makes one take livelier _and_ makes the takes differ from each other, and a piece is spoken a
section at a time, so the second effect is the one you hear. `toAlignment` keeps the provider's
parallel arrays only when they line up (a ragged triple would put the caption highlight on the
wrong word, so it is dropped whole), and `durationMs` falls back to ~14 characters a second when
alignment is missing. `SpeechError` carries the difference between "this server is misconfigured"
(503) and "the provider refused" (502). The injected `fetchFn` is the test seam, as everywhere.

The voice registry deliberately does not live in `services/core/models.ts`:
`scripts/check-models.mjs` validates that file's ids against the installed `@ai-sdk/<provider>`
packages, and an ElevenLabs voice id there would rightly fail a guard that is checking a different
kind of registry. (The narration and music _models_ do appear in `MEDIA_MODELS` there, priced per
unit.)

### 5.2 `services/core/voices.ts` — discovery, adoption, design

A second concept, so a second file: `searchLibrary` (provider-native filters, §6.1), `adopt`
(idempotent on `voices.library_id` — the only path that calls the provider's add endpoint, which
is what keeps the monthly budget from being spent on duplicates), `design` /`keepDesigned`
(§6.2), `designedCount` against `DESIGN_CEILING = 120`, `reapDesigned`, `seedShelf`, `ensureVoice`
and `voiceFor`.

**`ensureVoice` is how narration works before anyone opens settings.** A hardcoded id cannot be
the answer (the 2026 expiry), so the first narration a workspace asks for takes the top narration
voice from the live library, adopts it install-wide like any other, and shelves it as the default.
Only the write path calls it — a manifest GET must never adopt, or reads would spend the monthly
add budget.

**`fallBackToPremade` is the shelf life we accepted.** Reaching a library voice needs two key
scopes _and_ a paid ElevenLabs account; on a free account adoption succeeds and only speaking is
refused, so a workspace can hold a shelved library voice it can never be heard in. The synthesis
path (where that failure actually shows) then moves the workspace onto one premade voice —
Matilda, `XrExE9yKIg1WjnnlVkGX`, chosen as female, middle-aged, `informative_educational`, the
register a deck, a document and a landing page can all be read in — and makes it the default so
the next run picks it directly. The code carries the KNOWN EXPIRY note: every premade voice
retires 31 December 2026, at which point an un-upgraded deployment fails with the provider's own
message and the fix is a paid account or a new id.

`pnpm seed` adopts and shelves six library voices (`seedShelf`, filtered to `narrative_story`) so
the demo can narrate; without a key it silently does nothing, per the unconfigured-means-invisible
rule.

### 5.3 Routes

Speaker notes stream over `POST /ai/notes` in `services/api/ai.ts` (SSE, one
`{ type: "notes", sectionId, spoken, cues }` per section as it lands). Narration and its reads
live in `services/api/narration.ts`; voices get a router of their own, `services/api/voices.ts`,
because voices are their own resource. Every priced action runs its catalog tool through the one
executor, inheriting reserve-then-settle and the `ai_action_*` events; bodies go through
`readJson(c, zSchema)` per the validation rule.

```
POST /artifacts/:id/narration                     SSE. Synthesizes the spoken script of each named
                                                  section (or all), skipping any whose hash is
                                                  cached. Estimates from the characters in front of
                                                  it, settles to what was really spoken, so a
                                                  mostly-cached deck refunds nearly all of it.
POST /artifacts/:id/narration/section/:sectionId  One section, cached or synthesized on the spot.
                                                  The player calls this for what it is about to
                                                  speak and prefetches the next, which is why there
                                                  is no separate prepare step. A cached hit reports
                                                  zero characters, so replaying costs nothing.
GET  /artifacts/:id/narration                     The manifest: per-section tracks (url, ms, spoken,
                                                  alignment), the voice name, the stale list, and
                                                  `ready` (whether this server can synthesize).
GET  /artifacts/:id/narration/:sectionId          The audio bytes, immutable cache, hash in the URL.
GET  /p/:slug/narration[/:sectionId]              The same pair through publicRead, so a password or
                                                  recipient token gates narration exactly as it
                                                  gates the content. 404 for a section with no
                                                  prepared audio rather than revealing notes exist.
```

The narration writes gate through `gateShared` and bill the **artifact's** workspace, not the
caller's: `gateShared` admits a collaborator invited from outside, and for them the two are
different tenants — billing the caller would drain their credits for someone else's deck and let
their plan decide whether the owner's artifact may narrate at all. The audio is cached on the
owner's rows, so the owner pays and the owner's plan governs; a grantee is capped as an ordinary
member.

```
GET    /voices                 The workspace shelf, default first.
GET    /voices/library         UNMETERED, rate-limited. Proxies GET /v1/shared-voices with the §6.1
                               filters; returns provider preview_urls, which cost nothing to play.
                               Proxied so the API key stays server-side, as /media/search does.
POST   /voices                 Save a voice to the shelf, adopting install-wide first if this
                               deployment has never seen it. Idempotent.
PATCH  /voices/:id             Rename, or make the workspace default.
DELETE /voices/:id             Remove from the shelf.
POST   /voices/design          Runs design-voice. Returns candidates { generatedVoiceId, audio, ms };
                               nothing is persisted until one is kept.
POST   /voices/design/keep     Turns a candidate into a real voice (the call that consumes a slot)
                               and shelves it. Refuses over the install ceiling.
POST   /voices/audition        Runs audition-voice: one short line in a candidate voice, capped at
                               200 characters server-side, whatever the client sends.
```

### 5.4 The notes writer

`services/core/ai/tools/notes.ts` implements `write-speaker-notes` (its prompt in
`services/core/ai/prompts/`). Two things shape it:

**One call over the whole piece.** A note for slide seven should not repeat what slide six already
said, and should hand off into slide eight. Continuity is the entire craft of speaker notes, so
the model sees the full section spine and writes the set; per-section regeneration passes the
neighbouring notes as context rather than writing in isolation.

**The section text comes from the same extraction search already uses** — the walk of a section's
tree into its visible strings — so a new element type is narratable the day it is registered.

The prompt has to earn the word "spoken": short sentences, spelled-out numbers where a reader
would say them, no bullet fragments, no parentheticals, no stage directions (those belong in
`cues`), and it knows the format, since a deck section is a beat in a talk and a doc section is
not. Because the tool is registered in the catalog it is available to the chat agent
automatically, so "write me speaker notes for this deck" works in the dock with no further wiring.

## 6. Voices: choosing, auditioning, designing

### 6.1 Browse the library, filtered

`GET /v1/shared-voices` exposes upwards of ten thousand user-contributed voices, every result
carrying a `preview_url` the provider already rendered, so playing one costs nothing — which is
what makes browsing the default path rather than a premium one. The filters are all
provider-native rather than invented (`libraryParams` in `services/core/voices.ts`): search,
gender, age, accent, language, use case, character (`descriptives`), page. Results render as cards
with a play button; save adds to the shelf, adopting install-wide on the way if needed.

### 6.2 Design a voice from a description

`POST /v1/text-to-voice/design` takes a written description and returns candidates, each with a
`generated_voice_id` and an audio sample. This is the path that fits Galleo: the whole product is
"describe what you want and get something back", and a voice is no different from a theme in that
respect. Keeping one calls `POST /v1/text-to-voice/create` and shelves it; discarding costs
nothing beyond the design call. One provider detail is wired rather than ignored: when the picker
is opened from an artifact, a real line from the open piece is passed as the sample text
(`auto_generate_text` otherwise), because candidates auditioning on the actual material is a much
better signal. `designedName` in `model/speech.ts` derives a short display name so a kept take is
not called "Untitled".

Designed voices are the expensive path in every sense: a design call each time, and a kept one
occupies one of the finite custom voice slots on the shared account. `DESIGN_CEILING = 120` is an
install-wide ceiling — ours, not any plan's, because one workspace must not exhaust a shared
resource for everyone — and `reapDesigned` deletes designed voices no shelf holds, so an
experiment nobody kept does not permanently occupy a slot.

### 6.3 Audition on your own words

Both paths answer "what does this voice sound like", but neither answers "what does this voice
sound like reading my deck", which is the question people actually have. `POST /voices/audition`
synthesizes one short line in a candidate voice — the open artifact's own words where there is
one — capped at 200 characters server-side, metered, and rate-limited, cheap enough to use freely
and metered so a script cannot be laundered through it.

### 6.4 The shelf, in workspace settings

Voice belongs to the workspace rather than the person, for the same reason themes do: it is part
of how a team's work sounds, and the next person to narrate a deck should get the same voice
without configuring anything. `VoiceShelf` (`app/components/VoiceShelf.tsx`) renders in
`app/views/WorkspaceSettingsView.tsx`: saved voices as rows with play, inline rename, a default
marker, and remove, over the picker modal. The picker itself is `@ui/voice-picker` — a `@ui`
component because a picker needed from settings and from the editor cannot live in either module —
with browse and design tabs; the design tab is **walled rather than hidden** when the plan lacks
`audio` (`designLocked`), so the upgrade path is visible.

### 6.5 Not built: the per-artifact voice control

`ArtifactShell.voice` exists, survives the write path, and is honored end-to-end by `voiceFor`,
and the editor store carries a registered voice-shelf host (`onVoiceShelf` in
`editor/core/store.ts`) — but no control writes the field today. In practice a piece speaks with
the workspace default (or the first shelf row). The data model and resolution order were built
first deliberately, so the control, when someone asks for it, is UI work only.

## 7. Client

### 7.1 One present surface

`editor/Present.tsx` is a thin caller of `@ui/present`'s `PresentSurface` — the editor's rehearsal
is the same paint and the same pagination its audience gets, which is what fixed the old defect
where the editor's present overlay showed only the first page of a tall section while
`/present/:id` showed every page. The overview grid lives in `PresentSurface` behind an
`overview` prop so the editor keeps it. This satisfies the rule that a Solid component shared by
editor and app lives in `@ui`, and means the narration player has exactly one home.

### 7.2 The narration seam

`@ui` may not fetch, so `PresentSurface` takes injected sources:

```ts
// ui/narration.tsx
export interface NarrationSource {
    load(): Promise<NarrationManifest>;
    /** Records a section on demand; absent on published links, which play only what exists. */
    ensure?(sectionId: string): Promise<NarrationTrack | null>;
}
```

`app/` implements it over the authenticated routes, `publish/` over the `/p/:slug` ones. No source
wired means no narration controls render at all — the same "no host, no feature" property the
editor's AI seams have, and what keeps a self-hosted instance without an ElevenLabs key from
showing dead buttons. The wire DTOs (`NarrationManifest`, `NarrationTrack`, `SpeechAlignment`) and
the caption math (`wordSpans`, `wordAt`) live in `model/speech.ts`, because the picker and the
player are in the browser while synthesis and its cache are in services, and this is the only
layer both may import.

### 7.3 The player

`createNarrationPlayer` in `ui/narration.tsx` owns one `<audio>` element: a track per section,
advance on `ended`, pause and resume with the deck, re-seek when the viewer navigates by hand.

- **A play gesture is mandatory.** Browsers block audio autoplay; playing starts from one press on
  the bar control. The control is honest about what the press does: a mic glyph when the section
  ahead is unrecorded ("Read this aloud (records it first)"), a play triangle when it is prepared
  ("Play with voice (voice name)"), a spinner while "Reading it in…".
- **A beat between sections.** `SECTION_BEAT_MS = 1200`: the section changes, then a pause, then
  the voice picks up. Chosen by listening to 0 / 500 / 800 / 1200 against two real consecutive
  sections; the shorter beats read as one continuous take with a stumble in it, where the pause
  reads as a presenter letting the room look at what it moved to.
- **Auto-advance is timed from the real duration**, which is the point of caching measured `ms`.
- **The caption overlay** highlights the current word from the character alignment, folded into
  word spans (`wordSpans` — a per-character sweep reads as noise at speaking speed). Off by
  default and toggled (`C`), because a caption under a slide the presenter is also speaking over
  is noise.
- **Manual navigation moves the narration.** Settling on a section retargets the audio there — how
  a video with chapters behaves. In a continuous format it is debounced at 400ms, so scrolling
  past six sections fires one track change rather than six.
- **Skip versus dwell.** A section with nothing to say is common on a site — a hero, a logo row, a
  footer — and the player skips it. A section that has notes but no current audio (the manifest's
  `stale` list, from the fingerprint) is the different case: on a host with `ensure` it is
  recorded on the spot; on a published link it dwells rather than being silently skipped, because
  skipping is right for a footer and wrong for a section someone meant to narrate.
- **Presenter notes stay presenter-side.** `N` toggles the notes pane (spoken text, cue chips, and
  the AI actions for a host that can author). It never renders at `/p/:slug`, and because the
  public payload has no notes, it structurally cannot.
- **Progress is elapsed against total narration time**, not a slide count, which is comparable
  across formats and is the number a listener actually wants.
- **One analytics event per listen, on the way out** — a session is a row, not a stream.

### 7.4 Navigation: one step model for both kinds of format

A paged artifact holds a flat slide index; a continuous one is a scroll offset over a painted
stack. Narration needs a single notion of "where are we and what is next", so the step model in
`canvas/render/present.ts` provides one:

**A step is one screenful of one section.** In a paged format that is a slide page; in a
continuous format a viewport-height chunk of the section, measured from the painter's section
tops (a section shorter than the viewport is one step, which is the common case and keeps a
normal doc from being chopped up).

```ts
export interface Step {
    sectionId: string;
    within: number; // 0-based, within the section
    of: number;
    top?: number; // continuous only: the scroll offset this step sits at
}
```

`pagedSteps` and `continuousSteps` build the list; `stepIndexOf` finds where a track change or an
overview jump lands; `stepHoldMs` divides a section's track evenly across its steps, so a slide
that spans three pages, or a doc section three screens tall, is traversed evenly while its audio
plays (`ms / of` — a three-page section over a thirty-second track turns a page every ten
seconds). That even division is what extends narration to docs and sites without a separate
scroll-sync mechanism.

**Space is play and pause while narration is active** — the universal media convention — and the
two meanings it displaces (next slide; scroll down) move to the arrow keys for the duration. With
narration off, every ordinary binding stays exactly as it is. Click-to-advance stays off in
continuous formats because a doc or a site has real links and running text, an asymmetry
`PresentSurface` already had. The section being spoken in a continuous format is marked as
overlay chrome positioned from the section tops — the same class as collaboration cursors, and
`../collab.md`'s overlay-only rule is what keeps it out of export, thumbnails and publish renders.

**Naming.** The entry point label still flips on format (`editor/Editor.tsx`): a deck says
"Present", a doc or a site says "Preview", because "presenting" a website reads wrong. The
narrated action is the play control inside the surface, labelled around "play" — the honest verb
for something that runs itself.

### 7.5 Where notes come from

There is no notes panel in the editor chrome and no hand-authoring textarea; the plan's editor
tab (a textarea, an editable cue list, a minimap coverage mark, dictation into the composer) was
not built. Notes are written by the AI — from the notes pane's actions in present mode, from the
chat agent, or just in time when play reaches an unscripted section — and committed through the
ordinary op path (`editor/core/notes.ts`, coalesced as `notes:ai`, so the fill-in pass that runs
behind the voice undoes as one step and dies with the route rather than writing into an artifact
nobody has open). The `N` pane is where a presenter reads them.

## 8. Credits and entitlements

**The `speech` cost unit** is flat-priced like `image` and `video` (`UNIT_TASK.speech = null`,
since voice models are not in the text-model registry and are not priced per token). One unit is
1,000 characters synthesized. Derived, not chosen: `eleven_multilingual_v2` is $0.10 per 1,000
characters (`MEDIA_MODELS`, priced 2026-08-30) and `CREDIT_USD` is $0.0025, so one unit bills 40
credits. A twelve-section deck at ~700 characters of script per section is 8,400 characters, 9
units, **360 credits** to narrate in full — expensive enough that the control says it records
before it spends, and an argument for keeping scripts tight, which is also what makes them better
narration. If it proves too heavy the lever is the model: `eleven_flash_v2_5` halves it at an
audible quality cost, and would be a `voiceModelTier` entitlement in the shape `textModelTier`
and `imageModelTier` already have.

Writing the notes is separate and much cheaper: `write-speaker-notes` meters `{ text: sections }`,
scaling by section count.

**The picker's own costs.** Browsing and playing provider previews are free and unmetered, which
is the point of leading with them. `audition-voice` prices as a flat `{ text: 1 }` — a `speech`
unit would round a 200-character sample up to a whole thousand, so the flat price is both closer
to the truth and easy to explain. `design-voice` is unmeasured by the provider (candidates carry
samples of 100 to 1000 characters each), so it estimates `{ speech: 1 }` and the settle bills the
real spend — the reserve-then-reconcile mechanism doing exactly what it exists for.

**One entitlement, not three.** The plan proposed `voiceNarration`, `voiceDesign` and
`maxWorkspaceVoices`; they collapsed into the single `audio` boolean in `model/billing.ts`, which
also covers background music. The three capabilities sell as one idea, and the finite shared
resource (designed-voice slots) is protected by the install-wide `DESIGN_CEILING` and the reaper
rather than by per-plan keys. There is no per-workspace shelf cap.

## 9. Analytics

The three `ai_action_*` events key on `tool_id`, so every tool here was instrumented the moment
its id existed. Playback and the picker add six events in `model/analytics.ts`: `notes_written`,
`narration_prepared`, `narration_played`, `voice_saved`, `voice_auditioned`, `voice_designed`.
Per the capture policy none carries a word of a script or of a voice description — both are the
customer's own writing — and length reports as a `CharsBucket`. `voice_auditioned` is the one
worth watching: if `preview` auditions dwarf `own_text` ones, the free library path is carrying
the feature and the design tab is decoration; the other way round, people do not trust a stock
sample and the audition line deserves more prominence.

## 10. Testing

Per `../testing.md`'s contract, the only thing faked is the external oracle: the ElevenLabs HTTP
call, injected as `fetchFn`, and the `ai` SDK for the notes writer. The tests worth naming for
their reasons: the notes-only edit surviving `narrowOps` (the silent-save failure this field
nearly shipped with); adopting a voice twice from two workspaces performing one provider call —
asserted on the call count, not the row count, because it is the monthly add budget being
protected; the audition truncating at 200 characters server-side whatever the client sends; and
the public narration route honouring a password gate and 404ing for unprepared sections.

## 11. Environment and operations

No new key: `ELEVENLABS_API_KEY` serves dictation, synthesis, voice design, and music. Synthesis
is slow, roughly a second of wall clock per ten seconds of audio; the just-in-time model hides
most of that behind the first section's spinner and the prefetch, and the SSE progress stream is
what makes the whole-piece pass tolerable. Narration bytes are the first thing in the product
that grows without an upload, so the Neon storage line moves; the `narrations` table being
droppable and rebuildable is the property that makes that safe.

## Not taken

- **Per-feature entitlement keys.** Collapsed into the one `audio` boolean (§8).
- **PPTX speaker-note export.** The format supports a notes part and `canvas/render/pptx.ts`
  writes none. It remains the deliberate exception to the notes strip — a PPTX file is the
  presenter's own copy — and a separate deliverable.
- **Voice cloning.** Instant cloning would let a founder narrate in their own voice, and with the
  picker built it is a third tab in a surface that already knows how to adopt, shelve and
  audition. What keeps it out is consent capture and the professional-clone slot budget (one slot
  on Creator and Pro, fifty on Scale), not the UI.
- **Per-section voice.** A two-speaker deck is expressible in the data model already (the cache
  key is per section and carries the voice); only the UI is missing. Worth doing if anyone asks;
  not worth guessing at first.
- **A rendered narrated video.** Combining slide renders with the audio into an MP4 is the obvious
  next ask and a genuinely separate project, needing a rendering pipeline that does not exist.
- **A true presenter view.** A second window with the next slide, the notes, and a timer. The `N`
  pane is the cheap version and covers most of the need.
- **Object storage.** Narration audio is the strongest argument yet for it; the read path is
  deliberately one function so the move stays contained.
