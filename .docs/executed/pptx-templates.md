# Bring your own deck: a PPTX as a reusable template

> Upload a PowerPoint template, keep its look, and generate new content into it. An import adopts
> the deck's own palette and type pairing as a workspace theme, its layouts become a labelled
> library of designs, and the planner writes each beat of a new piece into the design it names.
> Adoption is unconditional rather than gated on a "template" flag: a deck keeping its own palette
> is the better answer for a plain import too, which makes template use a picker rather than a
> behaviour change.

Companion docs: `ai.md` (the generation pipeline the shape source feeds), `workspaces.md` (custom
themes), `.docs/planning/engine-gaps.md` (nothing here; the feature is a services + prompt
composition).

## What it is built on

Four pillars, which is what made the feature a composition rather than a project:

- **A real OOXML parser** (`services/utils/pptx.ts`): unzips the package, walks
  `presentation.xml` → slides → layouts → masters — each master's `sldLayoutId` entries are
  resolved into `PptxLayout[]`, named slots included — resolves placeholder geometry through that
  inheritance chain, and reads the theme's **colour scheme** (`clrScheme` → dk1/lt1/dk2/lt2/
  accent1..6) and **font scheme** (major/minor typefaces). It also pulls backgrounds, tables,
  pictures, bullets and notes.
- **The import pipeline** (`services/core/import.ts`): `importPptx` turns a parsed deck into
  Galleo sections. `themeFromDeck` derives a real theme from the deck and `adoptDeckTheme` saves
  it as a workspace theme (reusing an identical existing one rather than adding a duplicate);
  `nearestThemeId` — a colour-distance match against the built-in library — remains only as the
  fallback when saving a theme fails, because failing to save a theme is not worth losing the
  import over.
- **Per-workspace custom themes** (`services/core/themes.ts` + the `themes` table).
  `artifacts.theme_id` accepts either a built-in slug or a custom row's uuid, so a theme derived
  from an upload has a home with no schema work.
- **Shape-following generation**: the intake's `shapeTemplateId` resolves through `shapeSource`
  (`services/core/ai/tools/plan.ts`) and the planner's beats inherit a picked design's `layout`,
  `blocks` and `image` flags via `sectionForms` (`model/artifact.ts`).

## What "a PPT template" is

Two different files arrive under that name, and they take different paths:

- **A .potx (or a deck of empty layouts).** The look lives in the master and its layouts; there
  are few or no slides. The shapes come from the **layouts** (`sldLayout*.xml`), each of which is
  a named arrangement of placeholders (Title Slide, Title and Content, Two Content, Comparison…).
- **An example deck.** The look lives in the master, and the shapes worth copying are the slides
  people actually made. `sectionForms` over the imported artifact covers this.

Both work, and they get the same treatment: a theme plus a set of section forms. `importPptx`
reads layouts whenever the file is imported as designs (`as: "designs"`) or has no slides at all,
and reads slides otherwise. Any `.pptx` is accepted; a `.potx` is the same OOXML package and
parses identically (the design picker's file dialog filters on `.pptx`, but drag-and-drop takes
any file).

## Adopting the theme instead of approximating it

`themeFromDeck` sits beside `nearestThemeId` in `services/core/import.ts` and maps OOXML to
`Tokens`. OOXML carries a palette and a type pairing and nothing else, so the shape tokens take
the library's defaults rather than an invented reading:

| token                              | source                                                                                        |
| ---------------------------------- | --------------------------------------------------------------------------------------------- |
| `bg`                               | `lt1`; `isDark` from its luminance                                                            |
| `ink`                              | `dk1`                                                                                         |
| `surface`, `soft`, `muted`, `line` | derived steps between `ink` and `bg` (the theme library's own convention)                     |
| `accent`, `onAccent`               | `accent1`; `onAccent` chosen for contrast against it (white or ink), not read                 |
| `fontDisplay`, `fontBody`          | `fontScheme` major/minor typefaces, **mapped** to vendored faces (below); `fontMono` is fixed |
| `headingWeight`, `radius`          | library defaults (700, 12) — no OOXML equivalent worth reading                                |

`nearestThemeId` stays for the failure path; adopting is what every import does.

## Fonts: the one hard constraint

Galleo serves only vendored faces and `pnpm check:fonts` enforces that every family a theme can
name has one. A deck naming "Gill Sans MT" cannot be honoured, and shipping a font from someone's
upload is a licensing question we should not answer implicitly. So `vendoredFace` maps the named
family to the closest vendored one by classification (serif / grotesque / geometric / slab /
mono), per role (display / body). The import response carries what the template lent and what it could
not: `Imported.adopted` holds the derived designs (`{ id, name, kind }` each), the fonts as
`{ asked?, using }` pairs naming what the file asked for and what it is set in, and the
carried-over note. A mapping that is honest and visible beats one that pretends.

The honest edge stops at the wire today: the theme row stores only the vendored face, and no UI
surface — the theme editor included — displays the `asked`/`using` substitution note. The design
picker shows a static line ("Its colours, type pairing and slide designs come across…") rather
than the per-import payload. The theme editor can still override the mapped faces like any custom
theme's.

## A template that is not in the catalog

`TEMPLATE_INDEX` is a curated, code-resident list, and an upload does not belong in it. There is
no "mark as template" flag either: an import is already an artifact, and any artifact of the
reader's own can lend its shapes, so the picker lists their decks rather than a separate template
shelf. No schema change was needed. `shapeTemplateId` accepts a built-in template id or an
artifact id; an id the run does not recognise resolves to nothing and the run plans as it would
have anyway.

## Where it shows up

Intake's "Follow a design" opens `DesignPane` (`app/views/generate/DesignPane.tsx`): a drop zone
that imports a PowerPoint file as designs (`importFile(file, undefined, "designs")`), a band of
the reader's own artifacts, and the built-in templates. Each card renders its cover section in
**its own** theme, not the app's, because picking it adopts that palette — the card has to be the
thing the reader is choosing. Picking sets both the theme (`PickedShape.themeId`) and the shape
source (`shapeTemplateId`). Everything downstream is unchanged: the planner writes beats against
forms, and the section writer writes against the theme it is handed.

## What is and is not preserved, honestly

Preserved: palette, type pairing (mapped), background treatment, each layout's design as a named
entry in the library, and the deck's own name.

Not preserved, and worth saying out loud: master logos and other fixed furniture, exact type sizes
(Galleo's ramp owns those), non-rectangular placeholder geometry, gradients and effects on
placeholders, and anything that depends on a font we cannot serve. A generated deck looks like it
belongs to the same brand; it is not pixel-identical to the customer's master, and the UI does not
imply otherwise. `Imported.adopted.note` states this on the import response: colours and type
pairing carry over, each design is rebuilt from Galleo's own elements, and a fixed logo, exact
type sizes and drawn effects do not travel.

---

# Matching content to a template's designs

> Grounded in a real customer template read end to end (easyfinancial, 39 slides / 33 layouts /
> 1 master, 16:9): every slide was rendered from its own geometry, fills, text and images and
> reviewed. That teardown supersedes the positional "shape following" the feature first assumed.

## What a real template file is

A **labelled design library**, not a deck. The easyfinancial layouts carry names that say what
each design is for: Master Title, Table Of Content, Section Title, Overview, Text & Images, Only
Text, Employee Spotlight, Quote, Table Slide, 3-column w/ small header, 4 Text Column with Icons,
Column Chart, VS Slide, Timeline Chart, Full Pic, Q&A, Thank you — roughly twenty distinct design
types. Its identity is a small, strict system: two brand colours over navy and white, one typeface
throughout, and one signature move repeated everywhere (alternating brand colours across sibling
elements), expressed through numeral badges, colour-filled rounded cards, icon chips, accent rules
and photo bands.

Three findings from that read shaped the mechanism:

**1. The name is the matching key.** Matching does not have to be inferred from geometry: the
layout names are semantic, and the model is shown the catalog by name and asked which design a
beat wants. That turned the hard half of the problem into a prompt.

**2. The design lives in the decoration.** A layout's placeholder slots alone give a skeleton that
looks like nothing in particular — the "3-column" layout is 1 placeholder and 6 decoration shapes.
This is why designs are rebuilt as compositions rather than read as slot grids.

**3. Both layouts and slides matter, differently.** The layout is the canonical definition; the
slide is a worked example with real counts. The catalog is derived from the layouts.

## How it works

Not a PowerPoint renderer, and not positional form-following. A **design catalog**
(`services/core/designs.ts`):

- **Derive it.** `designCatalog(deck)` emits one `TemplateDesign` per distinct layout:
  `{ id, name, kind, columns, image }`. The id is a slug of the layout's own name — the id a beat
  names to choose the design. `designKindOf` classifies by name first (a forgiving regex table:
  "coloumn" is in a real deck; strict about word boundaries, since "Graphic" is not a chart) and
  by slot structure only where the name says nothing. `columns` prefers a count stated in the name
  ("4 Text Column with Icons") over counting slots, because the repeats are often drawn decoration
  and a visibly three-up layout declares one placeholder.
- **Teach it by name.** The plan prompt (`services/core/ai/prompts/generate.ts`) lists the
  library's designs as a set to choose from rather than an order to follow, with ids rendered back
  as words so the planner reads "1_Timeline Chart" as a timeline. Each beat carries
  `design?: string` (`model/ai.ts`); the planner picks one design per beat, reuses a design
  wherever the piece repeats that kind of moment, skips the ones the piece has no use for, and
  leaves `design` off when nothing fits — so "a quote" lands on Quote rather than beat 3 taking
  design 3. The prompt also states the honest cost: where a design asks for a number, a chart or a
  table and the brief gives nothing real, that column leads with text instead of invented data.
  `zBeat.design` is a free string, so the executor validates it: a beat takes the design it named
  only if the library has it, and only the three shape fields (`layout`, `blocks`, `image`)
  travel — the story and its length stay the planner's.
- **Compose through our own vocabulary, themed.** `designSection` maps each catalog entry to a
  Galleo section built from elements we already have (containers, cards, stat, table, chart,
  quote, diagram), and `designsToContent` stores the library as an ordinary artifact — one section
  per design, section id = design id — so `sectionForms` over it is the bridge into the planner.
  This is the same vocabulary the refreshed templates use, so it is known to render, edit, export
  and reflow. What the file expresses and we cannot (overlapping VS panels, arbitrary geometry)
  degrades to the nearest honest arrangement rather than being faked. The compositions carry no
  words of their own beyond slot labels, because invented copy would read as content rather than
  as a slot.

The bet: brand-faithful and fully editable beats pixel-faithful and inert. A customer should
recognise their deck; they should not expect PowerPoint's exact rendering of it. The standard each
composition is held to is the template-refresh loop: rendered with real content at deck, doc and
site widths and looked at — a design that only works at 16:9 with a specific word count is not a
design we can offer.

## Vocabulary gaps this surfaced, fixed at the source

Building the matching exposed four holes in the surrounding shape vocabulary, each fixed where it
lived rather than worked around: a section's shape was read only off its root, so a heading above
a row (nearly every slide) lent nothing; `media` was missing from the block vocabulary, so every
stored image column read back as prose; a stack was named by its first child, so a heading above a
chart lent "text"; and the layout presets stopped at three columns, so a four-column design had no
name to be asked for.

## Not taken

- **A richer catalog entry.** The derivation was sketched to carry slot geometry, decoration
  reduced to expressible devices (brand-colour fills, rounded surfaces, accent rules, the
  alternation move), and worked-example counts grouped from the slides. The shipped entry is
  name, kind, columns and image-lead, with the composition itself carrying the design's structure;
  the decoration devices — the alternation rule included — are not read from the file or replayed
  per-sibling. The kind classification plus the adopted theme carries the recognisability the
  teardown asked for.
- **Master furniture as pinned elements.** A logo from the master could become a pinned element on
  the cover now that pinning exists; it does not, and fixed furniture is named in the
  what-does-not-travel list instead.
- **The substitution note in the theme editor.** The `asked`/`using` font mapping travels on the
  import response and stops there; no editor surface renders it.
- **Per-person templates.** An uploaded template is a workspace artifact, so it is workspace-wide
  by construction — the picker lists the workspace library.
