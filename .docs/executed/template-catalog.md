# The template catalog

> How the starter templates are grouped, and why. Two parts: the diagnosis, written against the
> original 36-template catalog, of why the site wing read stronger than the deck and doc wings —
> kept because it is the reason the catalog looks the way it does now — and the category scheme
> built around what a first-time user is trying to do rather than around format. The scheme
> shipped, and the catalog has since grown to 90 templates under it. Companion docs:
> `../onboarding.md` (the template-first path this catalog serves), `../analytics.md`
> (`template_previewed` / `template_used` carry `category` as a free-form string),
> `../architecture.md`.

## What the gallery imposes

Facts about the surface the scheme lives on:

- Categories render as horizontal scroll rows, in order of first appearance in `TEMPLATE_INDEX`
  (`model/templates.ts`; the memo in `app/components/TemplateGallery.tsx` derives them). The first
  row is the highest-intent shelf. Rows scroll, so a category of 15 shows a handful of tiles and
  hides the rest behind the scroll.
- Every card is a 16:9 cover (first unpinned section) painted in the **user's app theme**, not the
  template's (`SectionThumb themeId={appTheme()}`). Palette is normalized away in the gallery, so a
  shelf's visual identity comes from structure and imagery only.
- Each card carries a format chip (`formatLabel`) and a section count, so a mixed-format row is
  legible at a glance: the reader is never guessing what a tile becomes.
- The preview modal's format switcher is, per its own comment, "the point of previewing at all"
  (`app/components/TemplatePreview.tsx`): any template can be taken as a deck, a doc, or a site.
  Format is a view, not an identity, which is the structural fact no comparable product shares.
- Onboarding filters the offered templates by the user's chosen format (`../onboarding.md`), so the
  scheme has to degrade sensibly when a format filter empties parts of a shelf.

## The diagnosis (written against the 36-template catalog)

The reasoning that drove both the scheme and the catalog's growth, preserved in full. It described
the catalog as it stood at 36 templates; the thin spots it names have since been filled (see "How
the catalog grew").

**1. The site wing showcased the medium; the deck and doc wings only carried content.** Every site
body exercises site-only machinery: the pinned `siteNav` with `dock: "top"` and its dropdown
`menu()`, anchor links, full-bleed heroes with aspect frames, interlude statement bands,
collapsible FAQs, tabs, pricing columns, testimonial and profile rows, `linked()` footers with
mailto and tel. A user browsing site templates learns what a Galleo site can do. The deck
equivalents were unexercised: not one of the nine decks shipped a speaker note, even though the
model carries a note fingerprint (`model/artifact.ts`), so Present opened on nothing; none staged a
"moment" the way a site stages an interlude. The decks demonstrated what a pitch deck says, never
what a Galleo deck does.

**2. One persona, one skeleton, one universe.** Seven of the nine decks shared a single structure:
dark cover (label, h1, badge over a photo), problem split, stat row, solution bullets, process
diagram, traction chart with a success callout, pricing table, team triptych, closing ask. Because
the gallery normalizes palette, structure and imagery are all a tile has, and these tiles were
near-identical in a row. The fictions compounded it: nine of the eighteen business deck and doc
templates were the same B2B-SaaS company retold, and the supporting cast crossed even the ones that
were not (Northwind was a landing page, an employer in the resume, the addressee of the cover
letter, a research institute, and a bank in the QBR; Priya Raman gave the testimonial in both the
landing page and the event page). The site wing spanned a wedding, a hardware launch, a noir
teaser, an Oslo studio: register, rhythm, and occasion all varied. The deck wing was one startup at
nine stations of the same lifecycle.

**3. Curated slugs versus catalog picks.** Site imagery was art-directed by named asset slug
(`halvorsen-amber-hotel-lobby`, `aer-device-on-floor`); every deck and doc image was a Lorem Picsum
catalog pick by id, hand-chosen but generic — laptops, coffee cups, and bokeh standing in for
kitchens, fleets, and factories. Chosen-from-a-catalog is better than hashed, and still read
assembled next to a wing whose photos were cast for the fiction. (Today every template image
resolves through one hand-curated `PHOTOS` table of Pexels photographs, indexed by `pic()` in
`services/core/templates.ts`, so this asymmetry no longer exists in that form.)

**4. The warm shelf proved docs are not the problem.** The everyday-documents shelf (menu,
itinerary, listing, guest guide, recipes, program) already had the site wing's virtues in doc form:
distinct fictions, a voice, and format-fitting structure invented for the content (the `dish()`
price row serves both the menu and the concert program). The gap was therefore not "decks and docs
are weaker formats." It was that the business shelves never got range: there was no non-business
deck in the catalog at all, and no business doc with the everyday shelf's warmth.

Named plainly, what the deck/doc wings were missing as categories: **occasion range** (nine
business decks, zero teaching, storytelling, internal-comms, or celebration decks) and
**format-feature showcasing** (nothing demonstrated Present, speaker notes, or narration the way
every site demonstrates nav and anchors).

## What a scheme has to survive

The evaluation bar, tersely: (a) a first-time user with a concrete task finds their template in one
scan of the row names; (b) each category has a clear first tile and a coherent row identity under
palette normalization; (c) the scheme grows by adding rows or splitting one, never by reshuffling;
(d) no orphan rows of 2, no dump rows; (e) any format mixing inside a row has to earn itself, not
be assumed.

On (e): mixing helps exactly when the row mirrors a workflow that really crosses formats (a launch
is a plan, then a teaser page, then a launch page, then an announcement), because the format chip
keeps every tile legible and the switcher means the choice is not final anyway. It confuses when
the row is "everything about X," which is the vertical scheme's failure below. Format deserves no
place in the row names at all: the chip already says it per tile, and naming rows by format would
restate the one distinction the product exists to dissolve.

## Rejected schemes

**By format (Decks / Docs / Sites).** The doc row is a dump and the scheme says nothing about
intent. It also promotes to shelf level the distinction the preview switcher erases. Rejected.

**By audience or persona (For founders / For agencies / For creators / …).** Reads fast, but
memberships overlap so badly the mapping is arbitrary: a founder is also a person, an agency both
pitches and publishes, and most templates serve two personas or none. Rejected.

**By industry vertical (Restaurants & food / Real estate / Events / …).** The fictions are already
vertical-flavored and the mixing is natural (menu doc, launch site, pitch deck under one roof), but
a catalog cannot cover verticals honestly at this size: the result is many rows of 2 to 4, and the
vertical-agnostic templates (QBR, resume, SOW) fit nowhere. This is a filter or a search facet, not
shelving. Rejected as the primary axis; vertical variety stays a property of the fictions, and ⌘K
covers vertical queries.

**Pure occasion phrasing (When you're raising / When you're launching / …).** Substantively the
same as the shipped scheme with longer, wordier names that read as a campaign. Rejected on copy,
kept in spirit.

For context, not as the driver: Gamma, Canva, Pitch, and Notion all shelve format-first at the top
level and only then by use case, because in each of them an artifact is born one format. Galleo's
switcher removes the reason that top level exists, which is precisely the freedom the shipped
scheme spends.

## The scheme as shipped

Job-to-be-done rows, format-blind, with work and life both present. Six categories in
`model/templates.ts`, 15 templates each, 90 total, in gallery order:

| #   | Category             | Job                                                |
| --- | -------------------- | -------------------------------------------------- |
| 1   | Pitch & sell         | Raise a round, win a deal, introduce the company.  |
| 2   | Launch & market      | Take something new to the people it's for.         |
| 3   | Client work          | Win the engagement and set its terms.              |
| 4   | Reports & reviews    | The numbers, the findings, and what happens next.  |
| 5   | Everyday & occasions | Invitations, trips, food, and the places you host. |
| 6   | You & your work      | Your story, your work, told properly.              |

Pitch & sell stays first because it is the highest-intent shelf (the classic gateway task). Launch
& market second puts the strongest visual work (the site heroes) one scroll below the fold. The two
personal rows close the gallery, split by life versus career rather than by "creative" versus
"documents".

Placement decisions worth stating, with the objection where there was one:

- **Case Study sits in Client work.** As a genre it is a report; as a job it exists to win the next
  engagement. Client work is the shelf a freelancer or agency scans, and proof-of-work belongs next
  to the proposal it travels with.
- **Go-to-Market Plan (`gtm-plan`) sits in Launch & market.** It is the plan whose output is the
  rest of that row. The objection (it is internal, the row is outward-facing) is real but weaker
  than the workflow continuity.
- **Board Deck sits in Reports & reviews** — a cadence artifact, not an ask. **Investor Update sits
  in Pitch & sell**: the plan had moved it to Reports & reviews on the same cadence argument, but
  the objection it recorded (someone raising looks for it under Pitch & sell) won, and that is
  where the catalog keeps it.
- **The sponsorship deck sits in Pitch & sell.** It is a sale to a sponsor, and it widens the row
  beyond SaaS.
- **The site wing is deliberately broken up.** The old "Marketing & web" hoarded five of the eight
  sites. Distributing them (Agency Site to Client work, Portfolio and Personal Site to You & your
  work, Event Invite to Everyday & occasions) gives four rows a designed anchor tile instead of one
  row hoarding the product's best work.
- **The two flagged misfits both landed in Client work.** Company Overview (a brand book more than
  a sale) and Property Listing (a professional sales artifact the plan had parked on the warm
  shelf) both sit in Client work today; the plan flagged each as fitting nowhere perfectly, and a
  future brand or hospitality shelf remains where each would move.

## How the catalog grew

The thin spots the diagnosis named were built out, row by row: a product one-pager
(`product-sheet`) in Pitch & sell; `release-notes` and `pricing-page` in Launch & market;
`client-status` and `kickoff-deck` in Client work; `all-hands` (the internal-comms hole in one
item) in Reports & reviews; `conference-talk` and `link-hub` in You & your work; `party-invite` and
`celebration-slideshow` (a deck that is not business) in Everyday & occasions.

One prediction did not hold: the plan expected teaching to earn a seventh row ("Teach & explain")
at around 60 templates. The catalog passed that size and teaching never got its own row —
`teaching-deck` and `conference-talk` sit under You & your work, `workshop-deck` under Client work.
Growth so far has been rows filling to 15, not new rows or splits.

## Costs and interactions

- **Onboarding's format filter thins the rows unevenly.** Filtered to one format, some rows thin
  far more than others. If the filtered gallery looks sparse, the fix belongs to that surface (rank
  by format instead of hiding, or collapse to one row), not to the scheme.
- **Analytics continuity.** `category` on `template_previewed` / `template_used` is a free string
  (`model/analytics.ts`), so a rename compiles trivially, but any dashboard tile filtering on the
  old strings needs checking in `scripts/posthog-dashboards.ts` before a switch.
- **The scheme is one file.** Category strings and array order live in `model/templates.ts`; the
  bodies in `services/core/templates.ts` do not move when a category changes.

## What this does not fix

The categorization changes shelf labels and neighbors, not the wood.

- The oldest decks still share one skeleton and much of the original business set one fictional
  universe; the rows read better because the sameness is split across several of them and diluted
  by the newer, wider-occasion templates.
- No deck demonstrates Present, speaker notes, or narration — there is still not one speaker note
  in `services/core/templates.ts` — and no shelf can make one do so.
- The gallery paints every cover in the user's theme, so a row whose identity is palette-dependent
  will never read as intended there; identity has to keep coming from structure and photography.
