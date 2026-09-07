# Galleo — Background music

> One icon in the present control bar plays an instrumental bed under present, preview and a
> published link, in any format. A short house set of presets covers most pieces; a workspace can
> commission beds from a written description and keep them on a shelf; an artifact can have one
> written for it from its own content and mood.

Companion docs: `voice-narration.md` (the feature this reuses almost entirely), `../rendering.md`
(the present surface the player attaches to), `../workspaces.md` (entitlements and the credit
window).

## 1. Why this is a small feature rather than a large one

Galleo built this shape twice before. Speaker notes are derived from the content, cached, and
played. Narration is derived from the notes, cached, and played. Music is the same spine a third
time: derived from the artifact's mood, cached, and played.

| The spine       | Notes           | Narration                           | Music                            |
| --------------- | --------------- | ----------------------------------- | -------------------------------- |
| Intent lives in | `Section.notes` | `ArtifactShell.voice`               | `ArtifactShell.music`            |
| Audio cached in | (none)          | `narrations`                        | `soundtracks`                    |
| Keyed by        | (n/a)           | script + voice + model              | prompt + length + model          |
| Served through  | (n/a)           | gated route, immutable cache        | the same, one custom row a piece |
| Played by       | (n/a)           | `@ui/narration` in `PresentSurface` | a sibling player, same surface   |

What is genuinely new is one thing: two audio sources playing at once, which needs ducking.

## 2. The provider

`POST /v1/music`, wrapped by `compose` in `services/core/ai/music.ts` with an injectable `fetch`
for tests. `MUSIC_MODEL = "music_v1"`, `MUSIC_FORMAT = "mp3_44100_64"` (the same codec narration
uses), and the provider's bounds are `MIN_MS = 3_000` to `MAX_MS = 600_000`; `clampMs` clamps
before spending a call on a request the provider would refuse. The endpoint returns a complete
audio file; the `/detailed` and `/stream` variants exist and are not needed for a bed, since we
generate once and cache, exactly as narration does.

The API is gated on a paid ElevenLabs account. A free account refuses with
`402 {"code":"paid_plan_required","status":"limited_access"}` — the same wall library voices hit,
with no premade fallback to lean on, because there is no such thing as a stock generated track.
`providerBlocked` in `services/core/ai/speech.ts` recognises `limited_access` alongside
`missing_permissions`, `payment_required` and `feature_unavailable`, and treats it (like
`quota_exceeded`) as account-wide, so a music refusal reaches the client as the provider's own
sentence rather than a bare 502. The deployment's account is on a paid plan and `/v1/music`
answers 200; the free-tier refusal stays tested against a fake, since it is what any un-upgraded
deployment will meet.

## 3. Cost

Roughly 900 ElevenLabs credits per minute of generated music, about $0.15–0.16 a minute on their
Creator and Pro plans. `MEDIA_MODELS` in `services/core/models.ts` carries `music_v1` at $0.15 per
minute (priced 2026-08-30); at `CREDIT_USD = 0.0025` a minute of music bills 60 Galleo credits.

The `music` cost unit in `model/credits.ts` is flat-priced with `UNIT_TASK.music = null`, exactly
as `image`, `video` and `speech` are: it runs on a media model with its own per-unit price and has
no text task to scale by. Billing is by `bedMinutes` (`services/core/soundtrack.ts`),
`ceil(ms / 60_000)`, and a cached bed reports zero minutes and owes nothing.

The default bed is `DEFAULT_MS = 30_000`, cut down from an original two minutes. Generation is
charged and waited for by the second — measured at roughly two seconds fixed plus a quarter of a
second per second of music — so the two-minute default was a thirty-second wait behind a spinner
and 1,800 ElevenLabs credits per bed, with the five-preset house set a one-time 9,000 for the
deployment. Thirty seconds is a nine-second wait and about 450 credits per bed (roughly 2,250 for
the whole house set), and a bed written as a repeating idea loops without anyone counting the
bars. Provider spend is the number to watch here, which is why the bar button says it uses credits
before it spends them.

## 4. Where the prompt comes from

Three sources, all deterministic — no LLM turn ever writes a music prompt.

**The house set.** `MUSIC_PRESETS` in `services/core/ai/music.ts` is five named beds (Calm, Warm,
Focused, Uplifting, Cinematic), ordinary prompts generated once for the whole install and shared by
every workspace after, exactly as an adopted voice is: the first person to pick "Calm" anywhere on
the deployment pays for it and nobody pays again (`ensurePreset` in `services/core/soundtrack.ts`,
raced only on the insert). Every preset prompt ends in `BED_RULES`, which says what a bed must
_not_ do — no vocals, no foreground melody, even level, end where it began — because the failure
mode of a generated backing track is a tune that competes with the person talking over it.
`DEFAULT_PRESET` (`model/speech.ts`) is `calm`.

**A bespoke bed for one piece.** `bespokePrompt` reads what the piece says about itself: the
opening line of each of the first few sections (`subjectOf` takes the longest string per section —
the headline — because reading from the top of the tree returns a site's nav labels one word at a
time), the theme's mood descriptor or tag, whether it is dark, the format, the title, and a pacing
line keyed to the section count. The subject is handed over as subject, never as words to sing:
`BED_RULES` rules out vocals and the prompt says to take the mood rather than the text.
Deterministic on purpose, so it costs nothing, cannot fail, and the same piece always asks for the
same bed.

**A workspace bed from a description.** `composeForWorkspace` takes what someone typed (capped at
400 characters), appends `BED_RULES`, and shelves the result under a short title derived by
`composedName` in `model/speech.ts` — two or three capitalised words, so a shelf of sentences does
not sit beside "Calm" and "Cinematic" as a different kind of thing. The description survives as the
row's `prompt`, so a listener can always see why it sounds like this.

## 5. Data model

```ts
// model/artifact.ts — ArtifactShell
export interface ArtifactMusic {
    on: boolean;
    trackId?: Id;
    volume?: number; // 0..1 of the bed's own level, before ducking; default MUSIC_VOLUME
}
```

The shell is the right home for the same reason `voice` is: it is artifact-wide, and
`diffSections` compares the shell generically, so a music-only change persists with no new
plumbing. That generic fix, made after `voice` silently failed to save, is what made this free.

```
soundtracks                 -- one cache, three kinds of row
  id           uuid pk
  source       text not null      -- preset | workspace | custom
  preset       text               -- the preset's stable id; set when source=preset, unique
  workspace_id uuid               -- set when source=workspace; cascades with the workspace
  artifact_id  uuid               -- set when source=custom; cascades with the artifact
  prompt       text not null      -- what produced it, so a listener can see why it sounds like this
  hash         text not null      -- musicHash: sha256(prompt + ms + model_id + output_format)
  model_id, mime, data, bytes, ms, created_at
  unique (preset) where preset is not null
  unique (artifact_id, hash)

workspace_soundtracks       -- the shelf: what one workspace keeps, and which is its default
  workspace_id, soundtrack_id, name, is_default
  primary key (workspace_id, soundtrack_id)
  unique index on (workspace_id) where is_default
```

Three kinds in one table because they are the same thing with different owners, the shape `voices`
already uses: a preset is generated once for the install and every workspace shares it; a
workspace bed was composed from a typed description and is reusable across that workspace's
pieces (it exists only for its shelf, so unshelving one deletes it); a custom bed belongs to its
artifact and dies with it, and a superseded custom bed is dropped on the next write, so an
artifact holds one at a time, like narration. `ArtifactShell.music.trackId` points at any of them,
and `Soundtrack.source` (`model/speech.ts`) carries the distinction to the client.

The shelf works like the voice shelf — `shelfFor`, `shelve`, `renameShelved`, `makeDefault`,
`unshelve` in `services/core/soundtrack.ts` — with one deliberate difference: a workspace may keep
no beds at all, because a piece with no bed simply plays no music, where a piece with no voice
cannot be narrated. Removing the default promotes whatever is left; the first bed on an empty
shelf becomes the default.

**Storage is the one place this is heavier than a preset-only design.** At `mp3_44100_64` the
thirty-second default is roughly 240 KB before base64 expansion, a flat cost per bed. It is
another argument for the object-storage move, and the read path is one function (`audioFor`), so
moving the bytes later stays contained. A custom bed's bytes are only servable through the
artifact they belong to; a shelf bed's only to a member of the workspace whose shelf holds it.

## 6. Length, and the loop

Two cases, and they want different answers:

- **Narrated.** The manifest reports every track's duration, so the total is known. The bed is
  generated at exactly that length (`lengthMs` on the compose route, capped at the provider's ten
  minutes) and never loops.
- **Silent present or preview.** Nobody knows how long a person will look at it, so the bed is the
  thirty-second default and loops.

The loop seam is where the plan's design was reversed. The plan called for two `<audio>` elements
with a two-second gain crossfade over the wrap. What shipped instead is Web Audio
(`createSoundtrackPlayer` in `ui/narration.tsx`): an `AudioContext`, a `GainNode`, and a looping
`AudioBufferSourceNode`. An `<audio>` element loops by seeking back to zero, and an MP3 carries
encoder padding at both ends, so the element's seam is real silence — a bed that should run
underneath a talk instead stops and restarts every time round. A buffer source loops
sample-accurately, and `loopStart` is moved past whatever silence the decoder left at the head of
the file: `firstSound` scans the first half second for the first audible sample (>0.003) and the
loop starts there, which removes the gap at its source and makes a crossfade unnecessary. The
voice still plays through an ordinary `<audio>` element; only the bed needs the graph.

## 7. Ducking, the only genuinely new logic

Music and narration play at once, and an untouched bed under a voice is unlistenable. The rule is
ordinary broadcast practice: drop the bed while a voice speaks, lift it between.

```ts
// model/artifact.ts — beside ArtifactMusic, not in model/speech.ts: the shell field and the
// constants that give its volume meaning share the file
export const MUSIC_VOLUME = 0.55;
export const MUSIC_DUCK = 0.3;
export const duckedVolume = (base: number, speaking: boolean): number =>
    Math.max(0, Math.min(1, speaking ? base * MUSIC_DUCK : base));
```

`MUSIC_VOLUME` was raised from an original 0.35: at that level a bed written to sit in the
background was inaudible on laptop speakers, which is indistinguishable from music that failed to
start. The player ramps the gain over a quarter second rather than setting it, because a step
change in level is heard as a click where a short ramp reads as a mix. `duckedVolume` is pure,
lives beside the field it prices, and is tested directly, because getting it wrong is the
difference between a feature and an annoyance.

## 8. Surfaces

**The control is one icon-only button in the Present control bar**, sitting with play and
captions, and it carries the on-ramp as well as the mute. The first build gated the button on a
bed already existing, which meant it never appeared until music had been switched on somewhere
else, and there was nowhere else obvious — the same discoverability failure the notes and
narration controls went through. Now the button is offered whenever a bed exists _or_ the host can
start one; pressing it while music plays stops it, and pressing it otherwise opens the bed picker.

**The picker lives in the bar too.** An earlier picker sat in the editor's notes strip and went
when that strip was removed; its home now is a bare dark `Popover` off the music button itself,
borrowing the bar's own surface rather than opening a panel over someone's work: "No music", the
workspace's shelf, and "Write one for this piece (uses credits)". There is no prompt field and no
volume slider: the volume is `MUSIC_VOLUME`, ducking to `MUSIC_DUCK` under a voice, and a person
who wants a different mood picks a different bed.

**Music never starts on its own.** Autoplay was built (a piece with music on started its bed as
the surface opened) and then removed: the setting is sticky and the sound is not asked for again,
so reopening a deck to check one slide filled the room with music nobody had requested this time.
Browsers would have made it a gesture away regardless, but the deciding argument was that nobody
wants it. Loading a piece reads what it has and stops there; the button, or picking a bed from
the list, are the only ways sound starts.

`PresentSurface` takes a `soundtrack?: SoundtrackSource` prop beside `narration`, injected because
`@ui` may not fetch. The source's `enable` (turn music on, building the default bed), `shelf`,
`choose` and `composeForPiece` methods are wired only where the caller may edit; a source with
only `load` is playback alone, which is all a link viewer has over someone else's piece. No source
wired means no control at all, the same "unconfigured means invisible" property the dictation mic
has.

- **Editor present and `/present/:id`**: the author can generate on demand, as narration does.
- **Published `/p/:slug`**: plays only what was already generated, because an anonymous viewer
  cannot be billed. `soundtrackFor` never generates — a read must not spend — and the
  `/p/:slug/soundtrack` pair sits behind `publicRead`, so a password or recipient token gates the
  music exactly as it gates the content.
- **Export**: nothing at all, the same as narration. Export has no audio and this does not change
  that.

## 9. Routes, billing, and the entitlement

Every generation runs the `compose-soundtrack` catalog tool (`model/tools.ts`) through the one
executor, so it inherits reserve-then-settle, the entitlement gate, and the `ai_action_*` events.
Its estimate is the minutes in front of it and `produced` settles to `bedMinutes` of what was
really composed, so a cached bed bills nothing. The routes live in `services/api/narration.ts`
beside narration's, because they are one feature's surface:

```
POST /artifacts/:id/soundtrack          Build a bed for a piece: a preset by id (default preset
                                        when unnamed) or `custom: true` for a bespoke one;
                                        `lengthMs` is the narration's total so a narrated bed
                                        never loops. Returns the track itself, not just its id,
                                        because the caller's content write has not landed yet and
                                        reading back is a race it loses often enough to look broken.
POST /artifacts/:id/soundtrack/choose   Put a shelved bed on one piece, or take music off with
                                        null. A piece may play what its workspace shelves or what
                                        was written for the piece itself — a custom bed is never
                                        shelved, so shelf membership alone would refuse an
                                        artifact its own music (`bedBelongsTo`).
GET  /artifacts/:id/soundtrack[/:trackId]   The gated reads.
GET  /p/:slug/soundtrack[/:trackId]         The public pair, through publicRead.
GET  /music/presets                     The catalog: every preset and whether this deployment has
                                        built it yet.
GET  /music/shelf · /music/beds/:id     The workspace shelf and a shelved bed's bytes.
POST /music/shelf                       Shelve a house preset, building it on first use anywhere.
POST /music/shelf/compose               Commission a bed from a description, shelved on the way out.
PATCH/DELETE /music/shelf/:id           Rename, make default, unshelve.
```

The artifact routes gate through `gateShared` and bill the **artifact's** workspace, not the
caller's, for the same reason narration does: a collaborator invited from outside is a different
tenant, and the audio is cached on the owner's rows, so the owner pays and the owner's plan
governs.

There is no `backgroundMusic` entitlement key. The plan proposed one; it folded into the single
`audio` boolean in `model/billing.ts` ("Narration and music" — read a piece aloud, design a voice,
and play a bed under it), because the three audio capabilities sell as one idea and three keys
would have been three ways to half-buy it.

## 10. Analytics

Two events in `model/analytics.ts`. `soundtrack_chosen` carries the source, the preset id when
there is one (the id is ours rather than the customer's words, so it travels; a custom bed's
prompt is derived from their content and never does), whether the bed was cached, the credits
charged, and the length. `soundtrack_played` is one event per listen, on the way out — a session
is a row, not a stream — with where, format, source, duration, and `with_narration`: whether the
session spent time ducked under a voice.

## Open questions

**The licence question is the real one.** ElevenLabs Music is trained on licensed data (Merlin and
Kobalt deals) and tracks are cleared for commercial use on paid plans, with film, TV and large
game rights reserved to Enterprise. Galleo generates on **our** account and then redistributes the
audio inside customer artifacts that get published to public URLs. Whether our plan's commercial
grant extends to that, or whether it needs to be Enterprise, is a question for their terms and
possibly for them directly. Nothing about the build depends on the answer, but it is the one thing
that could make the feature unshippable as described, and publishing generated audio inside
customer artifacts at scale should not proceed until it is settled.
