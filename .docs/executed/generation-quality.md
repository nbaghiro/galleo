# Generation quality: what the in-app pipeline carries from the agent runs

> The agent-side generation system (`.claude/skills/showcase-artifact/SKILL.md`) produced
> template-grade artifacts from written rules alone, three times, in fresh sessions. The in-app
> generation pipeline carries the same rules. This doc records where each learning lives, the
> check architecture around them, and the performance findings that shaped the outline and build
> paths.

## The check architecture

Produced sections are tested by two systems, split by an invariant: `services` may not import
`canvas`, so nothing server-side can measure a box.

- **Live, at generation time** (the section writer in `services/core/ai/tools/plan.ts`): every
  section gets `SECTION_ATTEMPTS` (3) attempts. Each reply is `zSection.safeParse`d, then held to
  `checkSection(section, surface)` (`services/core/ai/quality.ts`): the structural bar (every
  type is one the catalog declares, required fields present, no empty containers, one h1, no row
  layout the solver cannot honour) and the content bar (a headline, no placeholder copy, not too
  sparse). Failures go back into the retry as a repair prompt. These are **text heuristics
  only**. A section that parsed but never passed still ships — the checks describe a good
  section, not a valid one, and shipping it beats losing the beat — with an `unchecked` flag on
  its trace span, so the rate is readable from `pnpm traces`.
- **Live, on the client** (`app/stores/generate.ts`): the client paints every generated section
  the moment its patch lands, so the layout measurement the server cannot make already exists in
  the browser. After a section paints, the studio audits just that section via `diagnoseSection`
  (`canvas/render/diagnose.ts`; app → canvas is legal): overflow past the frame, contrast under
  `CONTRAST_FLOOR`, fill under `SPARSE_BELOW`. A failing section gets the "Needs a look" chip on
  its card (`app/views/generate/Board.tsx`), and one click (`fixSection`) feeds the measured
  problems back verbatim as the rework note, the same way the writer feeds text issues into its
  own retries. The look-and-iterate loop was the agent system's deepest learning, and this is
  where the repair loop finally sees what the user sees: the two worst visible failures
  (overflowing and illegible sections) no longer ship silently.
- **Offline** (`canvas/render/fit-checks.ts`, run by `scripts/shoot.ts` via
  `scripts/shot.entry.ts`): the full layout battery — `fits-frame`, `text-is-legible`,
  `fills-frame`, `aligns-to-a-grid`, `type-scale-holds`, shape rhythm and role fit — plus the
  vision rubric judge. The `/eval` playground that used to run these in the product was removed
  (migration 0047); judged measurement runs only through `pnpm eval:shots --judge` and
  `pnpm eval:ci`.
- **Failure posture**: a malformed `layout` on a generated element is silently dropped
  (`zElementLayout.optional().catch(undefined)` in `services/core/ai/schema.ts`, and
  `zSectionBackground` likewise) — the right failure mode while a layout vocabulary is being
  taught, since a bad optional field should cost the field, not the section.

## The learnings, and where each lives

### 1. The em-dash is untaught

The house copy law, enforced over every template by `pnpm check:copy`, calls the em-dash the
clearest machine-written tell — and the generator used to be instructed to produce it.
`prompts/rubric.ts` now teaches the constructions the templates use: contrast lands in short
sentences, not punctuation ("Made to last. Made to return."); never join clauses with an em-dash;
a comma, a period, or a middot between a label and a value. The sibling rule from the skill rides
with it: vary the construction of neighbouring blurbs, captions and card lines, since a row of
lines sharing one shape reads as generated even when each is fine alone. The exemplars comply too:
`prompts/exemplars.ts` rewrites the gold corpus at injection time (`plainDashes`), because the
corpus predates the ban and an exemplar teaches by imitation.

### 2. Storyline-first grounding

The skill's first law is "commit to one business or occasion and every section serves it"; the
fresh-agent runs showed cohesion comes from that commitment, not from section-level rules. The
outline prompt (`prompts/generate.ts`) demands it before anything else: commit to one concrete
world — a named subject, where it is, and two or three real, odd numbers that belong to it — and
weave that commitment into the `backdrop` and the beats' briefs, because every section is written
against them and sections that invent their own facts drift apart. This kills the generic-deck
failure mode; numbers agree across sections instead of each section inventing its own.

### 3. The settled vocabulary, taught narrowly

The editor supports pins, group rotation, clamps and baseline rows end to end, and
`prompts/catalog.ts` teaches the moves the showcase artifacts proved, each worded to contain
itself: table `clamp` (uniform one-line rows for price lists, schedules and menus, where a
wrapping cell would break the grid); container `align: "baseline"` (mixed type sizes on one shared
text baseline, the way a big number and its caption read as one line); and a guarded `pin`
paragraph — a small overlay carrying something true riding on a photo, width `fit`, one or two in
the whole piece, never body content, "a piece that needs none is the common case". The pin's
small `rotate` (about 2 degrees, a badge into a stamp) is the one place rotation is taught;
rotation otherwise stays untaught, since it needs taste the exemplars cannot yet show.

### 4. Restraint and rhythm

The rubric mandates element variety, and the skill's law bounds it: most sections get no special
move. `prompts/rubric.ts` says to alternate dense sections with breathing ones, let interior
sections be plain, and spend a flourish on at most two or three moments in the piece — rare is
what makes it land. This prevents the every-section-decorated output the variety checklist
accidentally encourages as pieces get longer.

### 5. Imagery casting discipline

The fresh runs' second failure mode was miscast photos with overclaiming captions ("Low bookcase
in ash" over shop shelving). Live images resolve art-director phrases through stock keyword search
(`services/core/ai/images.ts`: pexels → pixabay → unsplash, with keyless openverse as the
fallback, started on a stagger and taken in preference order) — nobody looks at what comes back.
The
rubric's image line holds the prompt half: a `src` is an art-director's brief for a photo stock
actually holds — a specific scene of real places and objects, never a brand, a product shot, or an
abstraction — and where the photo can only be approximate, caption the scene, not the exact item.
A client-side "image casting" pass beside the layout audit is not built.

### 6. The exemplars

The three gold sections injected into every generate turn come from the corpus
(deck = galleo · doc = helios · web = terra, `prompts/exemplars.ts`), joined by hand-authored
sections for what the corpus predates: `MOVES`, one compact section showing the reserved moves —
a pinned corner badge, a baseline number line, a clamped table — with the restraint written into
its framing line ("use each at most once in a whole piece … most pieces need none of them"); a
captioned gallery-and-people section; and the site anatomy. Hand-authoring was the way through a
chicken-and-egg: the corpus predates the vocabulary, and a picker can only show what the corpus
holds, while the model imitates what it sees far more reliably than what it is told.

### 7. The streamed outline

`planOutlineTool` (`services/core/ai/tools/plan.ts`) uses `streamObject` and forwards partial
outlines through the turn's SSE as `plan.partial` events — complete beats only, wholesale
replacement — and the studio flips to the outline board on the first partial. Total time is
unchanged, but the first beat is on screen in well under a second and the reader is reading while
the rest generates. The board paces the reveal itself (`REVEAL_STEP_MS`), one section at a time,
because the model's chunk rhythm is not one anyone wants to watch.

### 8. The trimmed outline

Output tokens are the outline's clock, so `zOutline`'s field descriptions cap the wordiness
("under eight words" for goal and audience, "one or two words" for tone, short noun phrases for
must-cover), and the prompt says the outline is a skeleton other calls flesh out: phrases and
single sentences, never paragraphs.

### 9. Pipelined image resolution

Section writes stay sequential — each beat sees the ones before it, which is the coherence
mechanism and worth keeping — but a beat's stock-API round trips no longer block the next beat's
model call. `write-beats` (`services/core/ai/tools/generation.ts`) rides image resolution on a
one-slot pipeline: beat _i+1_'s model call runs while beat _i_'s images resolve, and the patch
order is preserved, so an image-heavy build stops paying the stock APIs' latency once per section.

## Performance: where the outline's seconds went (measured 2026-08-28)

The observed 2–3s outline on Gemini 2.5 Flash decomposed cleanly, and the model was not the
problem:

- **Thinking was already off** (`provider.ts` sends `thinkingBudget: 0` to every non-Pro Google
  model), retrieval properly gated (no attached contexts → no embedding round trip), and the
  input modest (system ~2.1k tokens + prompt ~0.3k + the serialized `zOutline` response schema).
  TTFT was not the story.
- **The wait was full-completion decode of a non-streamed structured call**: a ~9-beat outline is
  600–1000 output tokens of constrained JSON, 2–4s at Flash's decode rate with nothing rendered
  until the last token, doubled by a schema miss. Streaming (item 7) and trimming (item 8) are
  the answers.
- **Image round trips are 300ms to 1.5s each**, one to four per section; the pipeline (item 9)
  takes them off the write chain.
- **The system prompt is byte-stable across briefs and section caps**, so Gemini's implicit
  prefix caching engages on repeat calls. Stability is an invariant to protect when editing
  prompts: static rubric/catalog first, per-run content only in `prompt`. The cache share is
  readable per run from the traces (`pnpm traces`).

## Verified and fine as-is

Scrim guidance teaches 0.5–0.65 over photos; the `backdrop` reaches every section write; steer
and build thread the brief; the three-attempt repair loop is sound; the `.catch(undefined)`
layout drop is the right failure posture for new layout fields.

## Not taken

- **The before/after eval-judge measurement of the prompt changes never ran**; the `/eval`
  playground was deleted before it happened, and judged measurement now runs only through
  `pnpm eval:shots --judge` and `pnpm eval:ci`.
- **The layout audit does not auto-retry.** The fix is one click on the chip, so spending a
  rework's credits stays the person's call.
- **No client-side image-casting pass**; the discipline is prompt-side only.
- **Rotation beyond the pin's stamp tilt stays untaught.**
