# Planning — showcase learnings into the generation prompts

> Consolidates the showcase-artifact playbook (`.claude/skills/showcase-artifact/SKILL.md`, the
> distillation of a 30-piece visually-reviewed run) into the generation pipeline, per the
> cross-session handoff of 2026-09-03. Nine items plus an eval-checklist mapping. **Status: built
> 2026-09-03**, all six workstreams green (typecheck, lint, 3370 tests, every guard, both new eval
> checks calibrated clean against the corpus and all 90 templates). Deviations: W6's pairing line
> was translated into palette language (cream/near-black, graphite/steel, parchment/navy) rather
> than built-in theme names, since the generate-theme prompt designs tokens and never picks a
> built-in; W2 added `objection` to `BEAT_ROLES` itself so the outline editor's role dropdown and
> the analytics guard pick it up by derivation.

State, re-verified 2026-09-03 before planning: a sibling session is refactoring this directory
live (`brief.ts` deleted, `chat.ts`/`system.ts` modified) but every target below — `rubric.ts`,
`generate.ts`, `exemplars.ts`, `catalog.ts`, `images.ts`, `quality.ts`, `eval/checks.ts` — is
currently untouched by it. Every edit is re-read-before-write and append-shaped, so the sibling's
refactor merges past this round.

Two of the handoff's items do not land as sent, and the corrections matter:

- **Item 8 (people-row sizing trap) is a DSL-only hazard.** `row({opts}, …)` switching children to
  intrinsic width is an authoring-time fact about `@model/authoring`'s two builders; the model
  emits JSON containers, where width-less row children split evenly by the engine's own rule
  (`rowShares` falls back to even). The trap cannot fire on the generation path. What survives of
  the item: the 70/30 people-beside-polaroid split, and equal-track people grids — which the grid
  container (built this session) expresses directly and `SECTION_RULES` already teaches for 5+.
- **Item 3's mechanical seam has a post-media-merge hole.** `FACE_TYPES` in `images.ts` matches
  `type === "avatar"` — right for AI-written trees (the catalog teaches `avatar` as the nested
  child), wrong for picker/DSL-written ones, where an avatar is now `media` with
  `kind: "photo", shape: "circle"`. The fix widens the detection, which repairs face-term
  appending for both worlds at once.

Token discipline: prompt lines are paid on every call, and the perf work just spent effort making
calls cheaper. Net budget for this round: about +14 lines of prompt copy and ONE added exemplar
section, which deliberately carries three items at once.

## W1 — rubric and voice lines (items 1, 2, 5)

`services/core/ai/prompts/rubric.ts`.

- **Comma-free table cells** (item 1, the run's most-repeated defect): one VOICE line stating the
  mechanism, not a style preference — cells split on commas, so "2,720 GBP" becomes two cells;
  write "2720 GBP", join label+value with a middot.
- **Numbers reconcile** (item 2): one VOICE line — a chart's series sums to the stat that cites
  it, a use-of-funds table sums to the ask; readers check.
- **The interior mood band** (item 5): the RUBRIC's background-image rule currently allows images
  only on cover/quote/CTA. Amend that line to name the one interior exception: a single full-bleed
  image band carrying ONE h2 and nothing else, at most one per piece, at the emotional midpoint.
  The restriction stays; the exception is named inside it rather than deleted.
- Rider: fix the stray `"` typo inside VOICE's varied-construction line (line 14) while the file
  is open.

## W2 — outline vocabulary (items 4, 7)

`services/core/ai/prompts/generate.ts`, the OUTLINE_JOB roles sentence.

- **The honest-objection beat** (item 4): the roles toolbox gains it by name — one section that
  answers the reader's strongest objection plainly (seasonality, price, "why not more"); the
  playbook found it the most convincing section in every piece that had one.
- **Tabs for parallel worlds** (item 7): one sentence — when a beat's points are parallel voices
  (three menus, three seasons, three levels) rather than a sequence, plan a `tabs` section instead
  of bullets. The catalog already teaches tabs; the outline never reaches for them.

## W3 — the face seam (item 3)

`services/core/ai/images.ts` + one catalog line.

- Widen the face detection: a slot is a face when the element is `avatar` (legacy + AI-written) OR
  `media` with photo kind and circle shape. `FACE_PROMPT`/`FACE_TERMS` then apply mechanically on
  both write paths — instrument the seam, don't ask the model nicely.
- One line on the catalog's profile/testimonial entries: a deliberately collective entry ("the
  committee") becomes a `container` card, never a faceless profile.
- Tests: slot detection for the media-circle shape (red today), and the existing avatar case
  pinned unchanged.

## W4 — one exemplar carrying three items (items 6, 8-residue, 3-reinforcement)

`services/core/ai/prompts/exemplars.ts`. One added curated section in the reserved-moves style: a
people/gallery hybrid — a `grid` container of image+caption tiles where the captions carry the
personality (item 6's captioned gallery, with the grid container guarding equal tracks, item 8's
residue), one profile row with face-explicit briefs, and a 70/30 people-beside-polaroid split.
One exemplar, three lessons, bounded token cost. Its intro line states when to reach for it.

## W5 — mechanical checks (the defect-checklist mapping)

Only what is mechanically decidable; reconciliation (item 2) stays prompt-only.

- `services/core/ai/quality.ts` (`structureIssues`, the writer's own retry loop): a table whose
  rows disagree with the header's column count — the comma-in-cell defect caught where the model
  can self-repair, which is the seam the module already owns.
- `services/core/ai/eval/checks.ts`: two artifact checks — the same image src appearing twice in a
  piece, and a profile/testimonial whose face slot is empty (the ghost avatar). Corpus must pass
  both before they land (run the suite; if a corpus artifact fails one, the check is miscalibrated
  per that file's own rule).
- Tests: red cases for all three, plus the corpus staying green.

## W6 — palette-subject pairing (item 9)

`services/core/ai/prompts/theme.ts` (the generate-theme tool's prompt) is the one place the
pipeline picks palettes; the generation input's theme is the reader's. One line of pairing hints
(couture=luxe goods, carbon/obsidian=machines and concrete, vellum/onyx=heritage and night,
studio/press=editorial daylight, atelier=textile and craft) if the prompt has a natural home for
it; recorded as not-taken otherwise.

## Gates and sequencing

W1 → W2 → W3 → W4 → W5 → W6, one commit-shaped diff per workstream, each green: typecheck, lint,
full vitest, `check:copy` (the prompts are in its scan — no em-dashes in any new line), all other
guards. Prompt snapshot tests in `prompts/__tests__/generate.test.ts` extended where they pin the
touched copy. `eval:shots` once at the end: W5's new checks must not fail the corpus, and nothing
else here touches geometry. Pre-flight re-read before every file the sibling could have reached in
the meantime; skip-and-record if one moved.

## Not taken, and why

Item 8's `row({opts})` trap as a prompt rule (cannot fire on this path — recorded above); a
numbers-reconcile mechanical check (not decidable without semantics); SKILL.md's Pexels sourcing
and insert/shot scripts (generation resolves images through `resolveImages`, not Pexels URLs); the
artifact-level background texture rule (the pipeline's backdrop already covers it).
