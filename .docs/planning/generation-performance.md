# Planning — generation performance: where the seconds go, and the plan for each

> The performance half of [`generation-quality.md`](generation-quality.md), grown into its own
> round after the streamed outline (item 8) shipped. Everything here is measured against the tree
> rather than assumed; the numbers below are from probes run 2026-08-29. Status: executed
> 2026-08-29, all phases. Deviations: P3's live preview lands in the single-section turns (the
> studio's per-beat builds and the chat section turn), while the pipelined write-all keeps its
> skeleton, since a background write cannot also yield into the parent stream without an event
> pump that was not worth its complexity; and the preview scanner rides `streamText` + a pure
> incremental child extractor (`sectionPreview`) rather than `streamObject`, because the tool
> deliberately uses free-text JSON and constrained decoding would have changed generation
> behaviour, not just its latency.

## Measured current state

What is already right, so nothing here re-solves it:

- **Thinking off** for Flash (`thinkingBudget: 0`), **retrieval gated** (no attached contexts, no
  embedding round trip), **one model call per beat** in the generate turn (`planSectionTool` runs
  only in the chat-driven single-section turn).
- **Prompt prefixes are byte-stable**: the outline system (~2.1k tokens) and the section system
  (~7.9k tokens, the catalog + rubric + exemplars) are each identical across briefs and beats, so
  Gemini's implicit prefix caching engages — the first section call of a run pays full TTFT, the
  next eight do not. This is now an invariant: static content first, per-run content only in
  `prompt`. A prompt edit that interpolates anything per-run into `system` silently forfeits it.
- **The outline streams** (item 8, shipped): perceived wait is gone; total decode time remains.
- **Images within one section resolve in parallel**, racing two query phrasings per provider.

What still costs real time:

1. **Outline decode length.** 600–1000 output tokens of constrained JSON is the clock; several
   described fields invite prose (`goal`, `audience`, `tone`, beat `brief`/`takeaway`/`points`),
   and all are genuinely consumed (the studio shows the first three; sections write against the
   rest), so the diet is verbosity, not deletion.
2. **The image chain sits between section writes.** `runGenerate` awaits `resolveImages(section)`
   — stock-API round trips plus `adopt` (downloading the chosen image into workspace media) —
   before starting the next beat's model call, though the next section's text depends only on the
   previous section's text. Same for the artifact backdrop after section 1. On an image-heavy
   piece this is seconds per section of pure serial waiting.
3. **Section writes are non-streamed.** Each section is a full `generateObject` of a whole
   element tree; the studio shows a skeleton until the last token. The same fix as the outline
   applies, with more care because the payload is a tree rather than a flat list.
4. **Provider fallback is serial per image**: unsplash, then pexels, then pixabay, then
   openverse. The happy path is one provider; a miss adds a full round trip per fallback step.

## The changes

### P1 — outline output diet (prompt + schema describes, S)

Cap the wordy fields where they are described: `goal`/`audience`/`tone` "a few words" becomes a
hard "under eight words"; beat `brief` capped at two sentences; `takeaway` one clause; `points`
at most three, each a phrase. `OUTLINE_JOB` gains one line telling the planner the outline is a
skeleton others flesh out, not prose. Measured by token counts on three fixed briefs before and
after; expected 20 to 40 percent off outline decode, compounding with the stream.

### P2 — pipeline images out of the write chain (engineering, M)

Restructure `runGenerate`'s loop into a two-stage pipeline:

- After `writeSection(i)` returns TEXT, push the unresolved section into `written` (the coherence
  context needs only the text) and immediately start `writeSection(i+1)`.
- Resolve images for section i concurrently; emit `patch(i)` only when its images land, awaiting
  in emission order so patches stay ordered and the studio's per-slot statuses stay truthful
  ("image" on slot i may now overlap "writing" on slot i+1, which the slots render fine).
- The backdrop lookup after section 1 joins the same pipeline.
- Abort flows through both arms via the existing signal; a failed image resolve degrades exactly
  as today (placeholder), never blocking the pipeline; metering is untouched (stock calls are not
  metered, model calls keep their step scopes).

The studio's per-beat build path keeps its shape (one turn per section is the product's control
model); it inherits P4's provider work but not the pipeline.

### P3 — stream the section writes (engineering, M–L)

`writeSectionTool` moves to `streamObject` the way the outline did. The payload is a tree, so
partial emission is by COMPLETE TOP-LEVEL CHILD: as each direct child of the section root parses
whole (per-child zod), emit a `section.partial` patch replacing the section with the children so
far, so a split fills its left column while the right is still decoding. The final full-section
patch replaces everything, and `checkSection`'s three-attempt loop still judges only the finished
object — a retry simply repaints from its own partials. The client-side layout triage keeps
auditing only landed (final) sections. Perceived section latency drops from full-decode to
first-child; total time unchanged.

### P4 — image provider race with a first-past-the-post pick (S)

Replace the serial provider fallback with a staggered race: fire the preferred provider
immediately, the next after ~350ms, taking the first acceptable hit (preserving today's provider
preference when both answer inside the stagger). Add a per-run phrase cache so a repeated phrase
(decks reuse motifs) never re-queries. `adopt` stays in the request path for now: moving it
behind the patch changes save semantics and is deliberately out of scope.

### P5 — timing truth (S)

The client already captures `generation_section_built.ms`. Add the missing halves so the wins
above are measurable in the wild rather than only in local probes: an `outline_ms` property on
the existing plan-step capture, and an `images_ms` property on `generation_section_built` (the
server yields a timing narration the client already parses; the property rides the same capture).
No new events; properties are durations only.

## Order and verification

P1 with P5 first (cheap, and P5 makes every later claim checkable), then P2, then P4, then P3.
Each lands with: the unit battery, the studio store tests, and a three-run local timing probe on
fixed briefs (medians reported honestly, including the runs where nothing improved). P3
additionally gets a manual QA pass in the studio, since partial paint is user-visible surface.

## Out of scope, stated

Parallel section writes (the sequential write is the coherence mechanism; a k-lookahead variant
trades exactly the property the storyline grounding just strengthened), moving `adopt` off the
request path, batching the studio's per-beat turns into one, and any model swap.
