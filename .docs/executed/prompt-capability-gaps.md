# Prompt capabilities and showcase design principles

How the in-app generation prompts cover the element and layout engine, and which capabilities stay
dark on purpose. The round this records came from an audit of the prompts against the engine, plus
the design judgment distilled from the showcase-artifact run
(`.claude/skills/showcase-artifact/SKILL.md`, the visually-reviewed demo-library run): the live
section writer is taught the capabilities it already renders, and the beauty rules the showcase
pieces were built on.

## Why prompt text is the whole teaching surface (the mechanism)

The section writer runs `generateText` then parses with `zSection.safeParse(extractJson(text))`
(`services/core/ai/tools/plan.ts`). Two consequences decide everything below:

- The zod schema is a post-hoc parser, not a teacher. `zElementLayout`, `zSection`, and
  `zSectionBackground` carry rich `.describe()` strings, but a `generateText` call never sends
  them. They reach the model only on the structured-output paths: the outline
  (`streamObject(zOutline)`) and the single-section plan (`generateObject(zSectionPlan)`).
- Element data is an open bag: `zElement.data` is `z.record(z.string(), z.unknown())`
  (`services/core/ai/schema.ts`), so any key a renderer reads will render; nothing is stripped.

So for the section writer the text catalog is the only teacher: `elementCatalog()`,
`layoutCatalog()`, `SECTION_RULES`, `SECTION_OUTPUT`, `VOICE`, the web-only `siteAnatomy()`, and
the exemplars. Anything wired and parseable but absent from that text is dark.

## What the element catalog teaches (`services/core/ai/prompts/catalog.ts`)

- `text`: inline emphasis by markup — bold `**…**`, italic `*…*`, inline code, a `[label](url)`
  link — used sparingly on a key phrase, a number, a name, never a whole sentence.
- `chart`: `showValues` (data labels, for bar, column, heatmap, waterfall, when the reader wants
  the figure and not just the shape) and `height` (px, 160 to 460; omit to let the column size it,
  set it only for a deliberately tall or short chart).
- `diagram`: `height` (px, 140 to 480, same guidance), and the terse-label contract (a node is a
  small shape; real explanation goes in the section's prose).
- `table`: `lines` (rows | grid | none), `zebra`, `density` (compact | cozy | roomy), and the data
  contract: no commas inside a cell (cells split on commas, so write `2720` not `2,720`), a label
  joined to its value with a middot (`Coastal · two nights`).
- `media`: `autoplay` / `loop` / `muted` (a silent looping hero clip on doc and web); `zoom` and
  `focusX`/`focusY` (which part of a cover photo survives the crop); `shape: "circle"` with `size`
  and `ring` (a portrait); and the `kind` values `gif`, `illustration`, `sticker` alongside
  `photo`/`video`.

## The layout grammar (`layoutCatalog()`)

- `span` is a first-class per-child layout field, not only a mention inside `columns`: a featured
  card taking the whole first row of a two-column grid is `span: 2`.
- `pin.rotate` is taught as the showcase badge idiom: a small overlay carrying something true,
  riding on a photo — a date badge, a corner price flash, a sold-out chip — width `"fit"`, insets
  of 16 to 32 px, a small rotation (about 2 degrees) that turns a badge into a stamp, one or two in
  the whole piece, and never body content. Re-ranked up from decorative because the showcase pieces
  used it as a signature move.

## The section rules (`services/core/ai/prompts/system.ts`)

The showcase design principles, taught to every surface (deck and doc, not just web):

- **Tone and mood bands.** A section can carry `background: { kind: "tone", tone }` with
  `bleed: true`, where `tone` is `tint` (a quiet wash for an alternating rhythm), `contrast` (the
  inverted band for a closing ask), or `accent` (the brand colour, at most once). The tone is
  named, never a hex, so the band stays theme-legible; `SECTION_OUTPUT` allows a tone band rather
  than restricting `background` to images.
- **Rhythm.** Never two dense sections (table, chart, packed grid) back to back, never two
  full-photo sections back to back; one full-bleed band of a single photo under one line of type as
  a palette-cleanser between dense stretches.
- **Density trigger.** A table only for a real allocation or price list, a chart only for a real
  series, a diagram only for a real process; and where the topic has a genuine doubt (seasonality,
  price, a waiting list), an honest-objection section answers it plainly — often the most
  convincing section in the piece.
- **Imagery.** Vary photo subjects across the piece and never reuse an image; background and scrim
  photos want atmospheric, open, low-detail compositions with room for type; no readable
  third-party brands, watermarks, or on-screen UI. A hero image behind text scrims at 0.5 to 0.65.

## The outline schema (`services/core/ai/schema.ts`)

`zBeat.layout`'s describe names all six presets including `four-up`, so the planner reaches for it.
This one does go through structured output, so the describe string is a real teaching surface.

## The two engine seams a prompt line could not cover

- **Inline text markup.** `parseInlineMarkup` in `model/text.ts` converts the markdown-ish markers
  to `marks` (Mark/Run), so the model writes what it knows and never counts character offsets;
  already-structured marks pass through unchanged. It is wired as `withInlineMarkup` in
  `services/core/ai/tools/generation.ts`, run on the written section right after the section writer
  and before the `section.partial` stream — the conversion must precede streaming, or the live
  preview shows raw `**` markers until a resync.
- **Table header default.** `toTableData` in `canvas/elements/table/table.ts` computes
  `header: d.header !== false`, so an omitted `header` yields a header row, matching the catalog's
  "First row is the header" and the manual `create()` path. (The old `!!d.header` contradicted the
  contract.)

## The form family

The `form` element family (`field` plus contactForm/signupForm/rsvpForm/pollForm/feedbackForm,
live only on a published page) is taught where it is scoped:

- `catalog.ts` carries a `signupForm` entry alongside `contactForm` (email capture / waitlist, the
  same FormData shape).
- `siteAnatomy()` (web-only, which correctly scopes forms to published sites) teaches making a
  section a `contactForm` (contact) or `signupForm` (waitlist / newsletter), each holding `field`
  children and live only on the published page.
- `services/core/ai/quality.ts` flags a select/choice field with no options (it renders an empty
  control). A form with no fields needs no new check: forms are `container: true`, so an empty one
  already trips the empty-container check.
- The output schema needed no change: `zElement.type` is `z.string()`, `data` an open record.

**Coupling to remember:** `quality.ts` builds its type vocabulary from the catalog `ELEMENTS`, so a
form variant can only be taught by name if it is also a catalog entry — otherwise the vocabulary
check flags it as unknown and triggers the repair loop. Only `contactForm` and `signupForm` are
taught for that reason; the other three registered variants would each need an entry.

## Exclusions (dark on purpose, do not add)

- `text.color`, `divider.color`, `container.bg`, raw `background.color` hex: the prompt steers to
  theme tones so artifacts recolor with the theme; naming these invites hardcoded colors.
- `button.icon`, `media.color`/`adoptTheme`, `media.dims`/`thumbSrc`: a glyph or vector object, or
  control-written metadata, not authorable as text.
- `chart.showGrid` (default on), `media.controls`, the `gradient`/`shape`/`spacer`/`embed`
  elements: low value or better covered by tone bands; kept hidden.

## Where the rules came from (the showcase run)

The showcase run credits its quality to "the full element vocabulary including pins, rotation,
layering and clamps." Several of those were exactly the dark capabilities above, so the pieces are
proof the levers are worth teaching, not proof of new features. The five judgment areas, as
prompt-statable rules: rhythm (alternate dense and full-photo, one mood band, cover and human
close); the density trigger (a visual earns its place from a concrete reason in the brief); imagery
(vary subjects, never reuse, atmospheric backgrounds, no readable brands); layout idioms and
numbers (tone/scrim values, badge pins with small rotation, real-price tables with the no-comma
contract; the people-row idiom lives in `SECTION_RULES`); and the structural capabilities the
showcase used that the writer previously could not produce (rich text, tone bands, rotated badges,
circle portraits), all of which are now taught above.
