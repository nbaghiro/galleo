# Planning — generation quality: what the in-app pipeline learns from the agent runs

> The agent-side generation system (`.claude/skills/showcase-artifact/SKILL.md`) produced
> template-grade artifacts from written rules alone, three times, in fresh sessions. This plan
> holds the in-app generation pipeline against those rules and lists the exact changes that carry
> the learnings across. Status: slice 1 (items 1, 2, 4, 5, 6) and item 8 (streamed outline)
> executed 2026-08-29, followed the same day by item 3 (the client-side layout triage: audit on
> every landed section against the shared diagnose constants, a "Needs a look" chip, one-click
> repair through the section rework turn) and item 7 (a hand-authored reserved-moves exemplar,
> since the gold corpus predates the vocabulary and the picker can only show what the corpus
> holds). The before/after eval-judge measurement is still owed; items 9 and 10 remain planned. Item 8 as landed: `planOutlineTool` streams partials (`plan.partial` on the turn
> protocol, complete beats only, wholesale replacement), run.ts forwards tool events instead of
> draining them for this tool, and the studio flips to the outline board on the first partial.

## Current state, precisely (what is verified where)

The half-remembered "we test produced sections" is real, and it is two systems:

- **Live, at generation time** (`writeSectionFrom` in `services/core/ai/run.ts`): every section
  gets three attempts. Each reply is `zSection.safeParse`d, then held to
  `checkSection(section, surface)` (`services/core/ai/quality.ts`): the structural bar (every
  type is one the catalog declares, required fields present, no empty containers, one h1, no row
  layout the solver cannot honour) and the content bar (a headline, no placeholder copy, not too
  sparse). Failures are fed back into the retry as text. These are **text heuristics only**:
  `services` may not import `canvas`, so nothing here measures a box.
- **Offline only** (`canvas/render/fit-checks.ts`, run by the /eval UI and the CI visual job via
  `scripts/shot.entry.ts`): the layout half — `fits-frame` (overflow), `text-is-legible`
  (contrast floor), `fills-frame` (sparse), `aligns-to-a-grid`, `type-scale-holds`, shape rhythm
  and role fit — plus the vision rubric judge. **None of this runs when a user generates.** A
  section that overflows its slide or paints grey-on-grey ships silently today and is only caught
  if someone runs the eval.
- Malformed `layout` on a generated element is silently dropped
  (`zElementLayout.optional().catch(undefined)`, `schema.ts:58`) — a safe failure mode worth
  keeping as the new layout vocabulary is taught.

## The change list, ranked

Each entry: what changes → the learning it encodes → the benefit.

### 1. Stop teaching the em-dash (prompt-only, one line, highest value per character)

`prompts/rubric.ts` `VOICE` line 12 instructs "Use em-dash contrast", with em-dashed examples.
The house copy law, enforced over every template by `pnpm check:copy`, calls the em-dash the
clearest machine-written tell and bans it. The generator is currently _instructed to produce the
tell_. Replace the line with the comma/period constructions the templates use ("Made to last.
Made to return." already complies; drop the em-dash examples), and add the sibling rule from the
skill: vary sentence construction across adjacent blurbs, since thirty same-shaped lines read as
generated even when each is fine. **Benefit: generated artifacts stop carrying the #1 AI tell and
meet the same bar the templates are held to.**

### 2. Storyline-first grounding (prompt-only, outline stage)

The skill's first law is "commit to one business or occasion and every section serves it"; the
fresh-agent runs showed cohesion comes from that commitment, not from section-level rules. The
outline prompt (`outlineParts`, `prompts/generate.ts`) asks for title + backdrop + beats but
never demands the commitment. Add an OUTLINE_JOB fragment: before the beats, fix the concrete
world — a named subject, a place, a voice, three real odd numbers that later sections must reuse
— and carry it in the outline's `backdrop` so `sectionParts` (which already receives the whole
outline) writes against it. **Benefit: kills the generic-deck failure mode; numbers agree across
sections instead of each section inventing its own.**

### 3. A generation-time layout check, on the client (pipeline, the big one)

The skill's deepest learning: the look-and-iterate loop is where quality happens. Live checks
cannot measure layout on the server (invariant: services never import canvas), but the client
paints every generated section the moment its `addSection` patch lands — the measurement already
exists in the browser. Change: in the studio's build loop (`app/stores/generate.ts`), after a
section paints, run the cheap layout subset over just that section via `diagnoseSections`
(`canvas/render/diagnose.ts`, app → canvas is legal): overflow past the frame, sparse fill,
contrast under the floor. A failing section gets a "needs attention" chip on its card with
one-click "fix this" that reuses the existing section-edit turn, feeding the measured issues back
the same way `writeSectionFrom` feeds text issues today. V2 can auto-retry once with the credit
cost shown. **Benefit: the two worst visible failures (overflowing and illegible sections) stop
shipping silently; the repair loop finally sees what the user sees.**

### 4. Teach the settled new vocabulary, narrowly (prompt-only, catalog)

The editor now supports pins, group rotation, clamps and baseline rows end to end, but the
catalog teaches only text `maxLines`. Three additions to `prompts/catalog.ts`, each worded to
contain itself: table `clamp` (uniform one-line rows for price lists, schedules, menus);
container `align: "baseline"` (one big-number line mixing type sizes, the reports move); and one
guarded `layoutCatalog` paragraph for `pin` mirroring the schema description — a corner badge
carrying something true (a date, a price, a scarcity), at most one per artifact, never body
content. Rotation stays untaught for now: it needs taste the exemplars cannot yet show.
**Benefit: generated covers and tables gain the moves the showcase artifacts proved, with the
restraint written into the wording.**

### 5. Restraint and rhythm (prompt-only, rubric)

RUBRIC mandates element variety but never says when to stop; the skill's law is "most sections
get no move; the moves land because they are rare". Add two lines to RUBRIC: alternate dense and
breathing sections deliberately, and let interior sections be plain — decoration belongs to at
most two or three moments in a piece. **Benefit: prevents the every-section-decorated output the
variety checklist accidentally encourages as pieces get longer.**

### 6. Imagery casting discipline (prompt-only now, check later)

The fresh runs' second failure mode was miscast photos with overclaiming captions ("Low bookcase
in ash" over shop shelving). Live images resolve art-director phrases through stock keyword
search (`images.ts`: unsplash → pexels → pixabay → openverse) — nobody looks at what came back.
Prompt half now (VOICE image line): phrases must name subjects stock photography actually holds
(concrete scenes and objects, no brands, no abstractions), and captions must stay true if the
photo is approximate — caption the scene, not the SKU. A later slice can add a client-side
"image casting" pass beside change 3. **Benefit: fewer photos that visibly contradict their
captions.**

### 7. Refresh the exemplars once templates carry the new language (blocked on template-refresh)

The three gold sections injected into every generate turn (deck=galleo · doc=helios · web=terra,
`prompts/exemplars.ts`) predate the positioning and typography rounds. After the template-refresh
plan lands, swap in exemplars showing one restrained pin, one baseline row, one clamped table —
the model imitates what it sees far more reliably than what it is told. **Benefit: the new
vocabulary arrives by imitation, the strongest prompt channel this pipeline has.**

### Verified and fine as-is

Scrim guidance already teaches 0.5–0.65 over photos; the `backdrop` phrase already reaches every
section write; steer/build threads the brief; the three-attempt repair loop is sound; the
`.catch(undefined)` layout drop is the right failure posture for new layout fields.

## Performance: where the outline's seconds go (measured 2026-08-28)

The observed 2–3s outline on Gemini 2.5 Flash decomposes cleanly, and the model is not the
problem:

- **Thinking is already off** (`provider.ts` sends `thinkingBudget: 0` to every non-Pro Google
  model), retrieval is properly gated (no attached contexts → no embedding round trip), and the
  input is modest (system ~2.1k tokens + prompt ~0.3k + the serialized `zOutline` response
  schema). TTFT is not the story.
- **The wait is full-completion decode of a non-streamed structured call.** `planOutlineTool`
  uses `generateObject`: a ~9-beat outline is 600–1000 output tokens of constrained JSON, and at
  Flash's decode rate that is 2–4s the user spends staring at a spinner, because nothing renders
  until the last token. A schema miss doubles it (`withSchemaRetry`).
- **The build serializes image resolution into the write chain.** `runGenerate` writes sections
  sequentially by design (each beat sees the ones before it, which is the coherence mechanism and
  worth keeping), but `await resolveImages(section)` — one to four stock-API round trips, 300ms to
  1.5s each — blocks the _next_ beat's model call for no reason: the next section's text does not
  depend on this section's resolved image URLs.
- The system prompt is byte-stable across briefs and section caps (verified by construction),
  so Gemini's implicit prefix caching already engages on repeat calls; stability is now an
  invariant to protect when editing prompts (static rubric/catalog first, per-run content only in
  `prompt`).

### 8. Stream the outline (engineering, the perceived-latency fix)

Swap `generateObject` → `streamObject` in `planOutlineTool` and forward partial outlines through
the turn's existing SSE as the beats complete; the studio paints the title and each beat card as
it arrives. Total time is unchanged, but the first beat is on screen in well under a second and
the reader is reading while the rest generates. **Benefit: the outline stops feeling slow without
touching the model.**

### 9. Trim the outline's output (prompt/schema, real seconds)

Output tokens are the clock. `zOutline` carries five nullish described fields (goal, audience,
tone, mustInclude, covers) that invite prose, and beat fields whose descriptions encourage full
sentences. Cap the wordiness in the field descriptions ("under eight words"), drop what nothing
downstream reads, and the same outline arrives in materially fewer tokens. **Benefit: a real 20
to 40 percent cut in outline wall-clock, compounding with change 8.**

### 10. Pipeline image resolution out of the build's write chain (engineering)

Keep section writes sequential for coherence, but resolve a section's images concurrently with
the _next_ section's write (start the model call, then await the previous beat's images before
emitting its patch, preserving patch order). The artifact backdrop lookup joins the same
pipeline. **Benefit: on an image-heavy piece the build stops paying the stock APIs' latency once
per section; total build time drops by roughly the sum of image round trips.**

## Slices

- **Slice 1 (prompt-only, one change set):** items 1, 2, 4, 5, 6. No pipeline risk; measurable by
  running `pnpm eval:shots --judge` before and after on the same briefs.
- **Slice 2 (engineering):** item 3, the client-side check + repair chip.
- **Slice 2b (engineering, performance):** items 8, 9, 10 — streaming outline, trimmed output,
  pipelined images. Item 9's schema edits ride slice 1's prompt change set if convenient.
- **Slice 3 (blocked):** item 7, after the template refresh ships.
