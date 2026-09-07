# Showcase learnings in the generation prompts

How the showcase-artifact playbook (`.claude/skills/showcase-artifact/SKILL.md`, the distillation
of a 30-piece visually-reviewed run) lives in the generation pipeline: nine items from the
cross-session handoff, folded into the prompts, the image seam, and the mechanical checks. Token
discipline governed the round — prompt lines are paid on every call — so the additions came to
about fourteen lines of prompt copy plus one exemplar section that deliberately carries three
lessons at once.

Two of the handoff's items did not land as sent, and the corrections matter:

- **The people-row sizing trap is a DSL-only hazard.** `row({opts}, …)` switching children to
  intrinsic width is an authoring-time fact about `@model/authoring`'s two builders; the model
  emits JSON containers, where width-less row children split evenly by the engine's own rule
  (`rowShares` falls back to even). The trap cannot fire on the generation path. What survives of
  the item: the 70/30 people-beside-polaroid split and equal-track people grids, which the grid
  container expresses directly and `SECTION_RULES` teaches for 5+.
- **The face seam had a post-media-merge hole.** Face detection matching only `type === "avatar"`
  was right for AI-written trees (the catalog teaches `avatar` as the nested child) but wrong for
  picker/DSL-written ones, where an avatar is `media` with `kind: "photo", shape: "circle"`. The
  detection is widened (below), which repairs face-term appending for both worlds at once.

## Rubric and voice lines (`services/core/ai/prompts/rubric.ts`)

- **Comma-free table cells** — the run's most-repeated defect, stated as mechanism, not style:
  cells split on commas, so "2,720 GBP" becomes two cells; write "2720 GBP", join a label to its
  value with a middot ("Coastal · two nights").
- **Numbers reconcile**: a chart's series sums to the stat that cites it, a use-of-funds table sums
  to the ask, hours times rate matches the price. Readers check.
- **The one interior mood band**: the background-image rule allows images on the emotional beats
  (cover, pull-quote, CTA) plus at most ONE interior exception — a full-bleed image section
  carrying a single h2 and nothing else, at the piece's emotional midpoint. The restriction stays;
  the exception is named inside it rather than deleted.
- **Middot over em-dash**: contrast lands in short sentences; a label joins its value with a comma,
  a period, or a middot, never an em-dash.

## Outline vocabulary (`OUTLINE_JOB` in `services/core/ai/prompts/generate.ts`)

- **The honest-objection beat**: `objection` is a named role in the beat-role toolbox — one section
  that answers the reader's strongest doubt plainly (seasonality, price, "why not more or faster");
  the playbook found it the most convincing section in every piece that had one. `objection` was
  added to `BEAT_ROLES` itself (`model/ai.ts`, with its layout affinities in `model/eval.ts`), so
  the outline editor's role dropdown and the analytics guard pick it up by derivation.
- **Tabs for parallel worlds**: when a beat's points are parallel voices (three menus, three
  seasons, three levels) rather than a sequence, the planner plans a `tabs` section instead of
  bullets. The catalog already taught tabs; the outline now reaches for them.

## The face seam (`services/core/ai/images.ts`)

A slot is a face when the element is `avatar` (legacy and AI-written) OR `media` with photo kind
and circle shape — both render as a fixed square masked to a circle whatever their data says.
`FACE_PROMPT`/`FACE_TERMS` then apply mechanically on both write paths: instrument the seam, don't
ask the model nicely. The catalog's profile/testimonial entries add one line: a deliberately
collective entry ("the committee") becomes a `container` card, never a faceless profile. Tests pin
slot detection for the media-circle shape and the original avatar case.

## The gallery exemplar (`services/core/ai/prompts/exemplars.ts`)

One curated section (`GALLERY`) in the reserved-moves style carries three lessons at bounded token
cost: a captioned gallery as a `grid` container of image+caption tiles where the captions carry the
personality (the grid guarding equal tracks), portrait briefs that name a FACE, and people beside a
polaroid on a 70/30 split so the polaroid can never starve the row. Its intro line states when to
reach for it.

## Mechanical checks

Only what is mechanically decidable landed as a check; reconciliation stays prompt-only.

- `services/core/ai/quality.ts` (`structureIssues`, the writer's own retry loop): a table whose
  rows disagree with the header's column count — the comma-in-cell defect caught where the model
  can self-repair, the seam the module already owns.
- `services/core/ai/eval/checks.ts`: two artifact checks, `no-photo-twice` (the same image src
  appearing twice in a piece) and `every-person-has-a-face` (a profile/testimonial whose face slot
  is empty renders the ghost avatar circle). Both were calibrated clean against the corpus and all
  90 templates before landing, per that file's own rule that a check the corpus fails is
  miscalibrated.

## Palette-subject pairing (`services/core/ai/prompts/theme.ts`)

The generate-theme prompt pairs the palette to the subject the way a printed piece would: luxe
goods take cream and near-black with a gold or oxblood accent; machines and concrete take graphite
and steel; heritage and night take parchment or deep navy; editorial daylight takes paper white
with one sharp accent; textile and craft take warm naturals. The pairing is stated in palette
language rather than built-in theme names, because the generate-theme tool designs tokens and never
picks a built-in.

## Not taken, and why

- The `row({opts})` sizing trap as a prompt rule: it cannot fire on the JSON generation path
  (recorded above).
- A numbers-reconcile mechanical check: not decidable without semantics; it stays a prompt rule.
- SKILL.md's Pexels sourcing and insert/shot scripts: generation resolves images through
  `resolveImages`, not Pexels URLs.
- The artifact-level background texture rule: the pipeline's backdrop already covers it.
