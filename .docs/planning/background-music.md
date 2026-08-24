# Galleo — Background music

> A switch in the present controls that plays an instrumental bed under present, preview and a
> published link, in any format. A short house set of presets covers most pieces; an artifact can
> also have one written for it from its own content and mood.

Companion docs: `voice-narration.md` (the feature this reuses almost entirely), `rendering.md` (the
present surface every player attaches to), `workspaces.md` (entitlements and the credit window).

## 1. Why this is a small feature rather than a large one

Galleo has already built this shape twice. Speaker notes are derived from the content, cached, and
played. Narration is derived from the notes, cached, and played. Music is the same spine a third
time: derived from the artifact's mood, cached, and played. Every piece it needs exists.

| The spine       | Notes           | Narration                           | Music                          |
| --------------- | --------------- | ----------------------------------- | ------------------------------ |
| Intent lives in | `Section.notes` | `ArtifactShell.voice`               | `ArtifactShell.music`          |
| Audio cached in | (none)          | `narrations`                        | `soundtracks`                  |
| Keyed by        | (n/a)           | script + voice + model              | prompt + length + model        |
| Served through  | (n/a)           | gated route, immutable cache        | the same, one row per artifact |
| Played by       | (n/a)           | `@ui/narration` in `PresentSurface` | a sibling player, same surface |

What is genuinely new is one thing: two audio sources playing at once, which needs ducking.

## 2. The provider

`POST /v1/music`, verified against the live API.

| Field              | Notes                                                              |
| ------------------ | ------------------------------------------------------------------ |
| `prompt`           | plain text, English recommended                                    |
| `music_length_ms`  | 3,000 to 600,000 (3s to 10 minutes)                                |
| `model_id`         | `music_v1` (default) or `music_v2`                                 |
| `output_format`    | same codec menu as speech, so `mp3_44100_64` again                 |
| `composition_plan` | optional structure (intro / verse / outro) with per-section styles |

Returns a complete audio file. A `/v1/music/detailed` variant returns the audio plus the composition
plan and song metadata as multipart, and a `/v1/music/stream` variant exists. Neither is needed for a
bed: we generate once and cache, exactly as narration does.

**It is gated on a paid ElevenLabs account.** Probed with the current key:

```
402  {"code":"paid_plan_required","status":"limited_access",
      "message":"Music API is not available for free users."}
```

That is the same wall library voices hit, and the same answer applies: a paid account, or the feature
stays dark. Unlike voices there is no premade fallback to lean on, because there is no such thing as
a stock generated track.

**One small defect this surfaced.** `providerBlocked` in `services/core/ai/speech.ts` recognises
`missing_permissions`, `payment_required` and `feature_unavailable`. Music refuses with
`status: "limited_access"`, which it does not match, so today a music refusal would reach the client
as a bare "refused (402)" rather than the provider's sentence. One entry in that set fixes it, and it
should be added when this is built rather than before, since nothing calls music yet.

## 3. Cost

Roughly 900 ElevenLabs credits per minute of generated music. On their Creator plan that is about
$0.16 a minute, on Pro about $0.15.

At `CREDIT_USD = 0.0142` that is **about 11 Galleo credits per minute**, so a two minute bed costs
around 22 credits, generated once per artifact and cached forever after. That is cheap next to
narration (63 credits for a twelve-section deck) and cheap next to a generation (about 40), which is
the right shape for something a person switches on and forgets.

A new `music` cost unit in `model/credits.ts`, flat-priced with `UNIT_TASK.music = null`, exactly as
`image`, `video` and `speech` already are: it runs on a media model with its own price and has no
text task to scale by.

## 4. Where the prompt comes from

The artifact already carries mood. A theme has a `tag` ("editorial"), a `mood` string and `isDark`;
the piece has a format, a title and a section spine. That is enough to write a decent bed prompt
without asking a model anything:

> "Calm minimal ambient underscore for an editorial business deck. Soft piano and warm pads,
> restrained, no drums, no melody in the foreground, suitable as a background bed."

**Settled: presets plus a bespoke option.** Most pieces are served by a short house set of named beds
(calm, warm, focused, uplifting, cinematic), which are ordinary prompts generated once for the whole
install and shared by every workspace after, exactly as an adopted voice is. That makes the common
case instant and nearly free: five presets at two minutes each is a one-time cost of about a hundred
credits for the entire deployment, not per artifact.

An artifact can instead have a bed written for it, and that one does read the piece: its theme mood,
its format, its title and its section spine become a prompt describing what this particular thing
should sound like. That is where the bespoke feel lives, and it is opt-in per artifact rather than
the default path, so nobody pays for it who did not ask.

## 5. Data model

```ts
// model/artifact.ts — ArtifactShell
music?: {
    on: boolean;
    trackId?: Id; // a soundtracks row: a house preset, or one written for this artifact
    volume?: number; // 0..1, default 0.35
};
```

The shell is the right home for the same reason `voice` is: it is artifact-wide, and `diffSections`
now compares the shell generically, so a music-only change persists with no new plumbing. That
generic fix, made after `voice` silently failed to save, is what makes this free.

```
soundtracks                 -- one cache, two kinds of row
  id           uuid pk
  source       text not null      -- preset | custom
  preset       text               -- the preset's stable id; set when source=preset, unique
  artifact_id  uuid               -- set when source=custom; cascades with the artifact
  prompt       text not null      -- what produced it, so a listener can see why it sounds like this
  hash         text not null      -- sha256(prompt + length_ms + model_id + output_format)
  model_id, mime, data, bytes, ms, created_at
  unique (preset) where preset is not null
  unique (artifact_id, hash) where artifact_id is not null
```

Two kinds in one table because they are the same thing with different owners, which is the shape
`voices` already uses: a preset is generated once for the install and every workspace shares it, a
custom bed belongs to its artifact and dies with it. `ArtifactShell.music.trackId` points at either.

**Storage is the one place this is heavier than narration.** Two minutes at `mp3_44100_64` is roughly
1 MB, about 1.4 MB base64, per artifact that turns it on. Narration is a few MB spread across a deck;
this is a flat cost per artifact. It is another argument for `prompts/08-object-storage.md`, and the
read path should be one function from the start so the move stays contained.

## 6. Length, and the looping question

Two cases, and they want different answers:

- **Narrated.** The manifest already reports every track's duration, so the total is known. Generate a
  bed of exactly that length (capped at the provider's ten minutes) and there is no loop at all.
- **Silent present or preview.** Nobody knows how long a person will look at it. Generate a fixed bed
  (120s is a reasonable default) and loop it with a short crossfade.

The crossfade matters. A generated track has a real beginning and end, so a bare `loop` attribute is
audible every time it wraps. A two second gain crossfade over the seam is enough, and it is pure
math worth testing on its own rather than eyeballing.

## 7. Ducking, the only genuinely new logic

Music and narration play at once, and an untouched bed under a voice is unlistenable. The rule is
ordinary broadcast practice: drop the bed while a voice speaks, lift it between.

```ts
/** The bed's gain right now: its own level, cut hard while something is being said. */
export const duckedVolume = (base: number, speaking: boolean): number =>
    Math.max(0, Math.min(1, speaking ? base * DUCK : base));
```

Two `<audio>` elements, not Web Audio: the player already owns one for narration and a second for the
bed is enough. `DUCK` around 0.3 is a normal starting point. The ramp should be a short fade rather
than a jump, or each section boundary clicks.

This is pure and belongs in `model/speech.ts` beside `wordSpans`, tested directly, because getting it
wrong is the difference between a feature and an annoyance.

## 8. Surfaces

**The toggle lives in the present controls and nowhere else**: one small icon in the bar, on or off,
sitting with play and captions. Presentation is where a bed is heard, so that is where it is switched.

Choosing _which_ bed is a different question and belongs with the artifact's other "how this sounds"
decisions, beside the voice picker in the notes strip: a preset list and a "write one for this piece"
action. Keeping the choice there is what lets the present control stay a single icon.

`PresentSurface` gains a `soundtrack?: SoundtrackSource` prop beside `narration`, injected the same
way and for the same reason: `@ui` may not fetch.

- **Editor present and `/present/:id`**: the author can generate on demand, as narration does.
- **Published `/p/:slug`**: plays only what was already generated, because an anonymous viewer cannot
  be billed. Identical to the narration rule, and the same gated read serves the bytes.
- **The notes strip**: the preset picker and the bespoke action only, never playback.
- **Export**: nothing at all, the same as narration. Export has no audio and this does not change that.

**Autoplay still needs a gesture.** Browsers block audio without one, so a musical artifact opens on
the same play-first state a narrated one does. Worth being honest about in the copy: "auto-playing" is
one click away from true, always, and no amount of design changes that.

## 9. Entitlement and the switch

A `backgroundMusic` key in `model/billing.ts`, resolved the usual way. The control belongs with the
artifact's other presentation choices, which is where the voice picker already sits, so the notes
strip's voice row grows a sibling: a toggle, a prompt field behind it, and a volume slider.

That keeps every "how this piece sounds" decision in one place rather than scattering audio settings
across the editor.

## 10. Shape of the work

Four phases, each shippable, and much smaller than narration because the spine exists.

1. **The switch and the cache.** `ArtifactShell.music`, the `soundtracks` table and migration, the
   deterministic prompt builder, `services/core/ai/music.ts` with an injectable `fetch`, and the
   `music` cost unit. No UI.
2. **Generate and serve.** `POST /artifacts/:id/soundtrack` and the two gated reads, mirroring
   narration's routes exactly. Add `limited_access` to `providerBlocked` here.
3. **Playback and ducking.** The second `<audio>`, `duckedVolume`, the loop crossfade, and the
   `soundtrack` prop on `PresentSurface`, wired in the editor and at `/present/:id`.
4. **Publish and the control.** The `/p/:slug` read, the toggle and prompt field in the strip's
   presentation row, the `backgroundMusic` entitlement, and the analytics event.

## 11. What I would want answered before building

**The licence question is the real one.** ElevenLabs Music is trained on licensed data (Merlin and
Kobalt deals) and tracks are cleared for commercial use on paid plans, with film, TV and large game
rights reserved to Enterprise. Galleo would be generating on **our** account and then redistributing
the audio inside customer artifacts that get published to public URLs. Whether our plan's commercial
grant extends to that, or whether it needs to be Enterprise, is a question for their terms and
possibly for them directly. It is not a technical unknown and I would not guess at it: everything
else here is a week of ordinary work, and this is the only thing that could make it unshippable.

Two smaller ones: whether a bed should be generated per artifact or a small house set of moods should
be generated once and reused (much cheaper, less bespoke, and sidesteps per-artifact storage), and
whether music should survive into export, which today has no audio at all.

## 12. What was decided, and what shipped

Both smaller questions were answered: **both**, and **no**.

A house set of five presets (`MUSIC_PRESETS`) is generated once for the whole deployment and shared by
every workspace, which makes the common case one provider call ever. Alongside it, a piece can have a
bed written for itself from what it already says: the theme's mood or descriptor, whether it is dark,
the format, and the title. That prompt is deterministic, so a custom bed costs one generation and no
LLM turn. Export ignores music, exactly as it ignores narration.

The control is not the toggle-plus-prompt-field this doc proposed. It is **one icon-only button in the
Present control bar**, which is where music gets switched on: the first press builds the default bed
and records the choice on the piece, and later presses are play/pause. A picker chose which bed (off,
one of the presets, or "written for this piece"), since a single button cannot ask that; it lived in
the editor's notes strip, and went when that strip was removed as out of scope. Unparking music needs
a new home for it. There is no prompt field and no volume slider: the volume is `MUSIC_VOLUME` and ducks
to `MUSIC_DUCK` under a voice, and a person who wants a different mood picks a different preset.

The first build gated the bar button on a bed already existing, which meant it never appeared until
music had been switched on somewhere else, and there was nowhere else obvious. That is the same
discoverability failure the notes and narration controls went through, and it is why the button now
carries the on-ramp rather than only the mute.

The licence question is still open and is still the one thing that could make this unshippable as
described. Nothing about the build depends on the answer, but publishing generated audio inside
customer artifacts should not begin until it is settled.

**Not verifiable end to end yet.** The ElevenLabs account this deployment uses is on the free plan,
which answers `/v1/music` with `402 limited_access` ("Music API is not available for free users").
Everything is built and tested against fakes, including that exact refusal shape, and the refusal is
reported as a 503 naming the plan rather than as a gateway error. Real audio cannot be heard until the
account is upgraded.
