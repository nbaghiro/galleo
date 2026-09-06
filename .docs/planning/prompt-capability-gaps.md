# Prompt capability gaps and showcase design principles

An audit of the in-app generation prompts against the element and layout engine, plus the design
judgment distilled from the showcase-artifact run (`.claude/skills/showcase-artifact/SKILL.md`, the
27-artifact demo-library run). The goal: teach the live section writer the capabilities it already
renders but never uses, and the beauty rules the showcase pieces were built on.

## Why the gap exists (the mechanism)

The section writer runs `generateText` then parses with `zSection.safeParse(extractJson(text))`
(`services/core/ai/tools/plan.ts:342,357`). Two consequences decide the whole audit:

- The zod schema is a post-hoc parser, not a teacher. `zElementLayout`, `zSection`, and
  `zSectionBackground` carry rich `.describe()` strings, but a `generateText` call never sends them.
  They reach the model only on the structured-output paths: the outline (`streamObject(zOutline)`)
  and the single-section plan (`generateObject(zSectionPlan)`).
- Element data is an open bag: `zElement.data` is `z.record(z.string(), z.unknown())`
  (`schema.ts:71`), so any key a renderer reads will render; nothing is stripped.

So for the section writer the text catalog is the only teacher: `elementCatalog()`, `layoutCatalog()`,
`SECTION_RULES`, `SECTION_OUTPUT`, `VOICE`, the web-only `siteAnatomy()`, and the exemplars. Anything
wired and parseable but absent from that text is dark.

## Code-style mandate (applies to every change below)

- One file per concept. Each addition lands in the file that already owns the concept: catalog field
  text in `catalog.ts`, section rules in `system.ts`, the inline-markup parse in the text element's
  own file. No new small helper files, no sibling splits.
- Minimal comments. Names and types carry the meaning. A comment only for a real why (an invariant,
  a gotcha, a magic value). No restatement, no banners, no narration.
- Reuse before reinvent. Use the existing shared helpers and types (`model/text.ts` Mark/Run and its
  `stamp`/`span`, `@model/authoring`, the element normalizers) rather than new machinery. Grow an
  existing description or enum rather than forking one.
- No em-dashes anywhere in prompt copy: `check:copy` covers the prompts. Use commas, colons, or
  middots.
- No suppressions, no `any`, path aliases, canonical Tailwind scale (not that this touches UI).

## Concurrency note

`services/core/ai/prompts/generate.ts` and `model/tools.ts` are uncommitted under galleo-d3's billing
simplification. This plan touches neither: the section-rules additions go in `system.ts`
(`SECTION_RULES`/`SECTION_OUTPUT`), which is already in every surface's prompt, not in `generate.ts`.
All other target files (`catalog.ts`, `schema.ts`, the text and table element files) are clean.
Global `typecheck` may be red on galleo-d3's files while their rework is in flight; verify the changes
here with targeted tests and the guards, not only the whole-repo typecheck.

## Execution phases

Each phase ends green on its own tests before the next begins.

### Phase 1: element catalog fields (`services/core/ai/prompts/catalog.ts`, the `ELEMENTS` entries)

- `text`: teach inline emphasis. Once Phase 5 accepts inline markup, one line: bold with `**…**`,
  italic `*…*`, inline code `` `…` ``, a link `[label](url)`, highlight `==…==`; use it sparingly on
  a key phrase, a number, a name. (If Phase 5 is deferred, this line is deferred with it, not
  replaced by an offset-marks explanation.)
- `chart`: add `showValues` (data labels; note it applies to bar, column, heatmap, waterfall) and
  `height` (px, clamp 160-460; prefer sizing by the column, `height` only for a deliberate size).
- `diagram`: add `height` (px, clamp 140-480, same guidance).
- `table`: add `lines` (rows | grid | none), `zebra`, `density` (compact | cozy | roomy). Fix the
  header guidance (see Phase 5). Add the data contract: no commas inside a cell, write `2720` not
  `2,720`, join a label to its value with a middot (`Coastal · two nights`).
- `media`: add `autoplay` / `loop` / `muted` (doc and web only, a silent looping hero clip);
  `zoom` and `focusX`/`focusY` (which part of a cover photo survives the crop); `shape: "circle"`
  with `size` and `ring` (a portrait); and the `kind` values `gif`, `illustration`, `sticker`
  alongside `photo`/`video`. Leave out `icon`/`graphic` (need a glyph or vector object), and the
  color overrides (Exclusions).

### Phase 2: layout grammar (`catalog.ts`, `layoutCatalog()`)

- `span`: promote to a first-class per-child layout field, not only a mention inside `columns`. One
  line with the featured-cell example (a card spanning the full first row of a grid, `span: 2`).
- `pin.rotate`: add to the pin line as the showcase badge idiom, one or two per piece, a small
  rotation (about 2 degrees) and small insets, on a photo. Re-ranked up from decorative because the
  showcase pieces used it as a signature move.
- `radius` (element corner override): one terse clause, or skip. Low value.

### Phase 3: section rules (`services/core/ai/prompts/system.ts`, `SECTION_RULES` and `SECTION_OUTPUT`)

This is where the showcase design principles land, taught to every surface (deck and doc, not just
web). Keep each rule tight.

- Tone and mood bands: a section can carry a `background` of `{ kind: "tone", tone }` with
  `bleed: true`, where `tone` is `tint` (a quiet wash for an alternating rhythm), `contrast` (the
  inverted band for a closing ask), or `accent` (the brand colour, sparingly). Name the tone, never
  a hex, so it stays theme-legible. Relax the `SECTION_OUTPUT` line that says to omit `background`
  otherwise, so a tone band is allowed, not just an image.
- Rhythm: do not run two dense sections (table, chart, dense grid) back to back, and do not run two
  full-photo sections back to back; alternate them. Include one full-bleed mood band (a photo with a
  single line) as a palette-cleanser. Open on a full-photo cover, close on a CTA that reads like a
  person.
- Density trigger: reach for a table only when there is a real allocation or price list, a chart
  only for a real series, a diagram only for a real process. Add an honest-objection section when the
  topic has a real doubt (seasonality, price, a waiting list); done plainly it is often the most
  convincing section.
- Imagery: vary photo subjects across the piece and never reuse a photo (image-level, alongside the
  text anti-repetition already in `writtenContext`). Background and scrim photos want atmospheric,
  open, low-detail compositions with room for type. Avoid photos with readable third-party brands,
  watermarks, or UI screens.
- Scrim numbers: for the artifact-level background texture, scrim about 0.05 to 0.1 on light themes
  and 0.45 to 0.55 on dark; a hero image behind text stays at 0.5 to 0.65 (the existing rule).

### Phase 4: outline schema nit (`services/core/ai/schema.ts`)

- `zBeat.layout` describe lists only five presets; add `four-up` so the planner stops underusing it.
  This reaches the model (the outline uses structured output).

### Phase 5: engine (only the two items a prompt line cannot cover)

- Inline text markup (`canvas/elements/text/text.ts`, in `toTextData` or the element's own data
  path): accept the markdown-ish markers from Phase 1 in the `text` string and convert them to
  `marks` (`model/text.ts` Mark/Run), so the model writes what it knows and never counts character
  offsets. Reuse `model/text.ts` primitives; keep the parser one small function in the text element's
  file. Verify existing marks (already-structured input) still pass through unchanged.
- Table header default (`canvas/elements/table/table.ts`): `toTableData` computes `header: !!d.header`
  so an omitted `header` yields no header row, contradicting the catalog's "First row is the header."
  Default it to `true` to match the contract and the manual `create()` path.

### Phase 6: verify

`pnpm typecheck` (scoped awareness of galleo-d3's in-flight files), `pnpm lint`, the unit suites for
the touched areas (schema, text and table elements, prompt/catalog), `pnpm check:copy` (no
em-dashes), `pnpm check:elements` (no new element types added, so this stays green), and
`pnpm eval:shots` to confirm the corpus still renders. Manual QA by the author at the end.

## Design principles from the showcase run (source for Phase 3, and validation)

The showcase run credits its beauty to "the full element vocabulary including pins, rotation,
layering and clamps." Several of those are the dark capabilities above, so the pieces are proof the
levers are worth teaching, not proof of new features. The five judgment areas, as prompt-statable
rules (all folded into Phases 1 to 3):

1. Rhythm: alternate dense and full-photo, one mood band, cover and human close. (Phase 3)
2. Density trigger: a visual earns its place from a concrete reason in the brief. (Phase 3)
3. Imagery: vary subjects, never reuse, atmospheric backgrounds, no readable brands. (Phase 3)
4. Layout idioms and numbers: tone/scrim values, badge pins with small rotation, real-price tables
   with the no-comma contract; the people-row idiom is already in `SECTION_RULES`. (Phases 1 to 3)
5. Structural: rich text, tone bands, rotated badges, circle portraits were used and the in-app
   writer cannot currently produce them. That is exactly Phases 1, 2, 3, 5.

## Exclusions (dark on purpose, do not add)

- `text.color`, `divider.color`, `container.bg`, raw `background.color` hex: the prompt steers to
  theme tones so artifacts recolor with the theme; naming these invites hardcoded colors.
- `button.icon`, `media.color`/`adoptTheme`, `media.dims`/`thumbSrc`: a glyph or vector object, or
  control-written metadata, not authorable as text.
- `chart.showGrid` (default on), `media.controls`, the `gradient`/`shape`/`spacer`/`embed` elements:
  low value or better covered by tone bands; keep hidden.

## Execution status

Landed and green (typecheck 0, lint clean, check:copy / check:elements / check:suppressions clean,
unit 3398 pass, eval:shots 592/592):

- Phase 1: chart `showValues` and `height`; diagram `height`; table `lines` / `zebra` / `density`, the
  no-comma cell contract, and the header default now honored by the engine; media video
  `autoplay` / `loop` / `muted`, `zoom` / `focusX` / `focusY`, `shape:"circle"` + `size` + `ring`, and
  the `gif` / `illustration` / `sticker` kinds.
- Phase 2: `span` promoted to a first-class layout field; `pin.rotate` taught as the badge idiom.
- Phase 3: tone and mood bands for every surface, the rhythm rule, the density trigger and the
  honest-objection section, and the imagery variety and no-brands rules, all in `SECTION_RULES`, with
  `SECTION_OUTPUT` relaxed to allow a tone band.
- Phase 4: `four-up` added to the outline layout describe.
- Phase 5b: the table header default (`d.header !== false`).
- The reusable `parseInlineMarkup` primitive plus its unit tests are in `model/text.ts`.

Also landed (Phase 5a, after coordinating with the generation.ts owner):

- The inline-markup wiring and its Phase 1 `text` catalog line. The conversion must run before the
  written section streams to the client, or the live preview shows the raw `**` markers until a
  resync, so it belongs in the section writer in `services/core/ai/tools/generation.ts`. The owner
  (galleo-d3, the billing rework) confirmed their only change there is one finish-call line and the
  draftBeat region is theirs untouched, and invited the edit on the shared tree. So `withInlineMarkup`
  runs on the written section right after `writeSectionTool`, folding `parseInlineMarkup`'s markup to
  marks before the `section.partial` stream, and the `text` catalog line now teaches the writer to use
  it. generation.ts stays uncommitted (part of the billing rework's working tree); whichever commit
  lands first carries both changes.

## Form family coverage (added on request, coordinated with the form-element session)

A separate session shipped a `form` element family (`field` plus contactForm/signupForm/rsvpForm/
pollForm/feedbackForm, registered, live only on a published page). On the user's confirmation the
generation prompts were extended to reach for it:

- `catalog.ts`: a `signupForm` entry alongside the existing `contactForm` (email capture / waitlist,
  the same FormData shape).
- `catalog.ts` `siteAnatomy()` (web-only, which correctly scopes forms to published sites): teach the
  writer to make a section a `contactForm` (contact) or `signupForm` (waitlist / newsletter), each
  holding `field` children and live only on the published page.
- `quality.ts`: a select/choice field with no options is flagged (vacuous on the corpus). A form with
  no fields needs no new check, forms are `container: true` so an empty one already trips the
  empty-container check.
- The output schema already accepts the form types and the field kind (`zElement.type` is
  `z.string()`, `data` an open record), so no schema change.

Coupling to remember: `quality.ts` builds its type vocabulary from the catalog `ELEMENTS`, so a form
variant can only be taught by name if it is also a catalog entry, otherwise the vocabulary check
flags it as unknown and triggers the repair loop. Only `contactForm` and `signupForm` are taught for
that reason; the other three registered variants would each need an entry.
