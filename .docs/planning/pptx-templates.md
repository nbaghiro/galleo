# Planning — bring your own deck: a PPTX as a reusable template

> Upload a PowerPoint template, keep its look, and generate new content into it. Status: P1 shipped
> 2026-08-30 (the font scheme is parsed, `themeFromDeck` derives a real theme, and every import now
> adopts it as a workspace theme rather than snapping to the nearest built-in). P2 to P4 proposed.
> One deviation: adoption is unconditional rather than waiting for a template flag, since a deck
> keeping its own palette is the better answer for a plain import too, and it makes P3 a picker
> rather than a behaviour change.
>
> P2 and P3 shipped 2026-08-30. P3 landed without the "mark as template" concept it assumed: an
> import is already an artifact, and any artifact of the reader's own can lend its shapes, so the
> picker lists their decks rather than a separate template shelf. No schema change was needed.

## Most of this already exists

Four pillars are built, which is what makes the feature a composition rather than a project:

- **A real OOXML parser** (`services/utils/pptx.ts`, 636 lines): unzips the package, walks
  `presentation.xml` → slides → layouts → masters, resolves placeholder geometry through that
  inheritance chain, and already reads the theme's **colour scheme** (`clrScheme` → dk1/lt1/dk2/lt2/
  accent1..6). It also pulls backgrounds, tables, pictures, bullets and notes.
- **An import pipeline** (`services/core/import.ts`) that turns a parsed deck into Galleo sections
  and picks a theme with `nearestThemeId`: a colour-distance match of the deck's bg/ink/accent
  against the built-in library. It approximates the look; it does not adopt it.
- **Per-workspace custom themes** (`services/core/themes.ts` + the `themes` table). `artifacts.
theme_id` already accepts either a built-in slug or a custom row's uuid, so a theme derived from
  an upload has a home today with no schema work.
- **Shape-following generation**: the intake's `shapeTemplateId` runs the picked starter's content
  through `sectionForms` (`model/artifact.ts`) and the planner's beats inherit each section's
  `layout`, `blocks` and `image` flags. "Generate into this deck's structure" is already a thing;
  it just only accepts built-in templates.

## The design question: what is "a PPT template"?

Two different files arrive under that name, and they take different paths:

- **A .potx (or a deck of empty layouts).** The look lives in the master and its layouts; there are
  few or no slides. Our importer walks _slides_, so this yields a theme and nothing else. The
  shapes have to come from the **layouts** (`sldLayout*.xml`), each of which is a named
  arrangement of placeholders (Title Slide, Title and Content, Two Content, Comparison...).
- **An example deck.** The look lives in the master, and the _shapes worth copying_ are the slides
  people actually made. `sectionForms` over the imported artifact covers this today.

Both should work, and they want the same treatment: a theme plus a set of section forms. The
difference is only where the forms are read from. Supporting layouts is the addition; supporting
example decks is nearly free.

## What has to be built

### 1. Adopt the theme instead of approximating it

A `themeFromDeck(parsed) => ThemeInput` beside `nearestThemeId`, mapping OOXML to `Tokens`:

| token                                 | source                                                                                                                         |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `bg`, `surface`                       | `lt1` (or `dk1` when the master's background is dark); `surface` from the master background shape when it differs              |
| `ink`, `soft`, `muted`                | `dk1`, then derived steps toward `bg` (the theme library's own convention)                                                     |
| `accent`, `onAccent`                  | `accent1`; `onAccent` chosen for contrast, not read                                                                            |
| `line`                                | `dk2`/`lt2` if present, else a derived hairline                                                                                |
| `fontDisplay`, `fontBody`, `fontMono` | `fontScheme` major/minor typefaces, **mapped** (below)                                                                         |
| `headingWeight`                       | the master's title `txStyles` weight, defaulting to 700                                                                        |
| `radius`, `border`, `shadow`, `scrim` | no OOXML equivalent; derive `radius` from the master's rounded-rect adjust values when present, otherwise the library defaults |

`nearestThemeId` stays for plain imports; adopting is what an uploaded _template_ does.

### 2. Fonts: the one hard constraint

Galleo serves 319 vendored faces and `pnpm check:fonts` enforces that every family a theme can name
has one. A deck naming "Gill Sans MT" cannot be honoured, and shipping a font from someone's upload
is a licensing question we should not answer implicitly. So: parse `fontScheme`, then **map** the
named family to the closest vendored one by classification (serif / grotesque / geometric /
slab / mono) and metrics, keep the original name on the theme row for the UI to say "Gill Sans MT,
set in Albert Sans", and let the theme editor override. A mapping that is honest and visible beats
one that pretends.

### 3. A template that is not in the catalog

`TEMPLATE_INDEX` is a curated, code-resident list, and an upload does not belong in it. The
smallest correct move reuses what is there: the upload imports to an **artifact** (already
implemented), marked as a template source on the workspace, and the intake's shape picker accepts
an artifact id alongside a built-in id. `SessionStart` already carries `sourceArtifactId`, so the
plumbing is a widening rather than a new concept. For a .potx, the import produces one section per
**layout** instead of per slide, which is the only genuinely new parsing work.

### 4. Where it shows up

Intake gains "Use my template" beside the starter gallery: upload once, it appears in the picker
with the deck's own name and a thumbnail rendered from its first layout. Picking it sets both the
theme (the derived custom theme) and the shape source (its forms). Everything downstream is
unchanged: the planner already writes beats against forms, and the section writer already writes
against a theme it is handed.

## What we can and cannot preserve, honestly

Preserved: palette, type pairing (mapped), slide proportion, background treatment, per-layout column
structure and which blocks lead them, and the deck's own name.

Not preserved in v1, and worth saying out loud: master logos and other fixed furniture, exact type
sizes (Galleo's ramp owns those), non-rectangular placeholder geometry, gradients and effects on
placeholders, and anything that depends on a font we cannot serve. A generated deck will look like
it belongs to the same brand; it will not be pixel-identical to the customer's master, and the UI
should not imply otherwise.

## Phases

- **P1 — adopt the theme (S). Done.** `fontScheme` parsing, `themeFromDeck`, save as a workspace theme on
  import, use it instead of `nearestThemeId` when the upload is flagged as a template. Ships value
  alone: imported decks stop being recoloured to the nearest built-in.
- **P2 — layouts as forms (M). Done.** Parse `sldLayout*.xml` into sections, so a .potx with no slides
  still yields shapes; reuse `sectionForms` over the result.
- **P3 — the picker (M). Done.** Upload-as-template in intake, thumbnails, and widening `shapeTemplateId`
  to accept an artifact id.
- **P4 — the honest edges (S).** The font-mapping note in the theme editor, a "what carried over"
  summary after upload, and the licensing line about fonts.

## Open questions

Whether an uploaded template should be workspace-wide or per-person; whether to accept .potx only
or any .pptx (I would accept both and read layouts when slides are absent); and whether master
furniture like a logo should eventually become a pinned element on the cover, now that pinning
exists.

---

# Part two: matching content to a template's designs

> Written after reading a real customer template end to end (easyfinancial, 39 slides / 33 layouts /
> 1 master, 16:9 at 10 x 5.62in). Every slide was rendered from its own geometry, fills, text and
> images and reviewed. This part supersedes the "shape following" assumption in P3.
>
> D1 to D4 shipped 2026-08-30, verified against that same file: 33 designs classified, the catalog
> rendered, and the compositions painted. Four gaps in the surrounding vocabulary surfaced while
> building and were fixed at the source rather than worked around: a section's shape was read only
> off its root, so a heading above a row (which is nearly every slide) lent nothing; `media` was
> missing from the block vocabulary, so every stored image column read back as prose; a stack was
> named by its first child, so a heading above a chart lent "text"; and the presets stopped at
> three columns, so a four-column design had no name to be asked for.

## What the file actually is

A **labelled design library**, not a deck. The layouts carry names that say what each design is for:
Master Title, Table Of Content (x3), Section Title (x3, one with a photo), Overview (x3), Text &
Images, Only Text (5 header variants), Employee Spotlight, Employee Award, Quote, Table Slide,
3-column w/ small header, Text & Graphic, 4 Text Column with Icons, Column Chart, Column Slide,
VS Slide (x3), Timeline Chart, Full Pic, Q&A, Thank you. Roughly twenty distinct design types.

Its identity is a small, strict system: two brand colours (#005DA5 blue, #71BF43 green) over navy
and white, DIN Next LT Pro throughout, and one signature move repeated everywhere: **alternating
blue and green** across sibling elements (card header bars, icon tiles, timeline nodes, the two
panels of a VS slide). Its devices are numeral badges, colour-filled rounded cards, circular icon
chips, thin accent rules, a white circle holding the logo, and photo bands under a blue wash.

## Three findings that change the plan

**1. The name is the matching key.** We assumed matching would have to be inferred from geometry.
It does not: the layout names are semantic, and a model can be shown the catalog by name and asked
which design a beat wants. That turns the hard half of this problem into a prompt.

**2. The design lives in the decoration, and we throw the decoration away.** P2 reads a layout's
placeholder _slots_ and skips every non-placeholder shape. But those shapes are the design: the
"3-column" layout is 1 placeholder and 6 decoration shapes; the timeline is 11 and 5, and its
worked slide is 11 and 22. Slots alone give a skeleton that looks like nothing in particular.

**3. Both layouts and slides matter, differently.** The layout is the canonical definition; the
slide is a worked example with the decoration filled in and real counts (seven agenda items, four
icon columns, five timeline nodes). A catalog wants the layout for the frame and its slides for the
evidence.

## The approach

Not a PowerPoint renderer, and not the current positional form-following. A **design catalog**:

- **Derive it.** One entry per distinct design, keyed by the layout's name, carrying: the slot
  structure (roles, geometry, counts), the decoration reduced to what we can express (fills by
  brand colour, rounded surfaces, accent rules, alternation), and the worked example's counts.
- **Teach it by name.** The plan turn is given the catalog and each beat picks a design, so "a
  quote" lands on Quote and "three points" on the 3-column, rather than beat 3 taking design 3.
  The section writer then writes to that design's slots.
- **Compose through our own vocabulary, themed.** Each catalog entry maps to a Galleo composition
  built from elements we already have (container surfaces, cards, stat, table, chart, quote,
  diagram) and coloured from the derived theme, including the alternation rule. This is the same
  vocabulary the ninety refreshed templates use, so it is known to render, edit, export and
  reflow. What we cannot express (overlapping VS panels, arbitrary geometry) degrades to the
  nearest honest arrangement rather than being faked.

The bet: brand-faithful and fully editable beats pixel-faithful and inert. A customer should
recognise their deck; they should not expect PowerPoint's exact rendering of it.

## Phases

- **D1 — the catalog (M). Done.** Parse layouts _with_ decoration, group slides under their layout, and
  emit a catalog: name, slots, counts, palette usage, alternation. Store it beside the theme.
- **D2 — named matching (M). Done.** Put the catalog in the plan prompt; beats gain a `design` field;
  drop the positional overwrite. Falls back to today's behaviour when nothing matches.
- **D3 — composition mapping (L). Done.** The mapping table from catalog entry to a Galleo section,
  parameterised by slot counts and theme colours. Start with the eight most common types (title,
  agenda, section divider, quote, N-column cards, comparison, timeline, table/chart) and let the
  rest fall through to a generic split.
- **D4 — the honest edges (S). Done.** What carried over, which font was substituted, and what a design
  approximates rather than reproduces.

## What I would verify at each step

The same loop the template refresh used: render every catalog entry with real content at deck, doc
and site widths and look at it. A design that only works at 16:9 with a specific word count is not
a design we can offer.
