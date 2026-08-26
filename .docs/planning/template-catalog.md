# Planning — the template catalog

> A from-scratch redesign of how the 36 starter templates are grouped. Two parts: a diagnosis of
> why the site wing reads stronger than the deck and doc wings, and a category scheme rebuilt
> around what a first-time user is trying to do rather than around the six shelves we have. This is
> exploration only: nothing here is built, no template body changes, and the thin-spot lines name
> concepts, not commitments. Every claim is anchored to the file that shows it.

Status: exploration, written against the tree on 2026-08-26. Companion docs: `onboarding.md` (the
template-first path this catalog serves), `analytics.md` (`template_previewed` / `template_used`
carry `category` as a free-form string, so a rename is a dashboard-continuity note, not a schema
change), `architecture.md`.

## What the gallery imposes

Facts about the surface, because the scheme has to live on it:

- Categories render as horizontal scroll rows, in order of first appearance in `TEMPLATE_INDEX`
  (`model/templates.ts`; the memo in `app/components/TemplateGallery.tsx` derives them). The first
  row is the highest-intent shelf. Rows scroll, so a category of 7 is fine; a category of 12 hides
  most of itself.
- Every card is a 16:9 cover (first unpinned section) painted in the **user's app theme**, not the
  template's (`SectionThumb themeId={appTheme()}`). Palette is normalized away in the gallery, so a
  shelf's visual identity comes from structure and imagery only.
- Each card carries a format chip (`formatLabel`) and a section count, so a mixed-format row is
  legible at a glance: the reader is never guessing what a tile becomes.
- The preview modal's format switcher is, per its own comment, "the point of previewing at all"
  (`app/components/TemplatePreview.tsx`): any template can be taken as a deck, a doc, or a site.
  Format is a view, not an identity, which is the structural fact no comparable product shares.
- Onboarding filters the offered templates by the user's chosen format (`onboarding.md`), so the
  scheme should degrade sensibly when a format filter empties parts of a shelf.

## Diagnosis: why the sites feel stronger

The imagery and copy pass already landed per template. What remains is systematic, and it is a
property of the wings, not of individual templates.

**1. The site wing showcases the medium; the deck and doc wings only carry content.** Every site
body exercises site-only machinery: the pinned `siteNav` with `dock: "top"` and its dropdown
`menu()` (`services/core/templates.ts:54`), anchor links, full-bleed heroes with aspect frames,
interlude statement bands, collapsible FAQs, tabs, pricing columns, testimonial and profile rows,
`linked()` footers with mailto and tel. A user browsing site templates learns what a Galleo site
can do. The deck equivalents are unexercised: not one of the nine decks ships a speaker note, even
though the model carries a note fingerprint (`model/artifact.ts`), so Present opens on nothing;
none stages a "moment" the way a site stages an interlude. The decks demonstrate what a pitch deck
says, never what a Galleo deck does.

**2. One persona, one skeleton, one universe.** Seven of the nine decks share a single structure:
dark cover (label, h1, badge over a photo), problem split, stat row, solution bullets, process
diagram, traction chart with a success callout, pricing table, team triptych, closing ask
(`startupPitch` s1–s13, `salesDeck` f1–f11, `seriesA` a1–a12, `productDemo` p1–p12 are the clearest
four). Because the gallery normalizes palette, structure and imagery are all a tile has, and these
tiles are near-identical in a row. The fictions compound it: nine of the eighteen business deck
and doc templates are the same B2B-SaaS company retold (Mise, Fleetwise, Switchboard, Sift,
Tidepool, Tideline, Cadence, Tessera, Tempo), and the supporting cast crosses even the ones that
are not
(Northwind is a landing page at `templates.ts:1620`, an employer in the resume at :123, the
addressee of the cover letter at :800, a research institute at :5685, and a bank in the QBR at
:6215; Priya Raman gives the testimonial in both the landing page and the event page). The site
wing spans a wedding, a hardware launch, a noir teaser, an Oslo studio: register, rhythm, and
occasion all vary. The deck wing is one startup at nine stations of the same lifecycle.

**3. Curated slugs versus catalog picks.** Site imagery is art-directed by named asset slug
(`halvorsen-amber-hotel-lobby`, `aer-device-on-floor`); every deck and doc image is a Lorem Picsum
catalog pick by id (`pic()` at `templates.ts:72`), hand-chosen but generic. The file's own comment
names the failure mode it only half escapes: "an arbitrary photo is how a furniture studio ends up
illustrated by a jellyfish." The result on screen (see the rendered strips) is laptops, coffee
cups, and bokeh standing in for kitchens, fleets, and factories. Chosen-from-a-catalog is better
than hashed, and still reads assembled next to a wing whose photos were cast for the fiction.

**4. The warm shelf proves docs are not the problem.** "Everyday documents" (menu, itinerary,
listing, guest guide, recipes, program) already has the site wing's virtues in doc form: distinct
fictions, a voice, and format-fitting structure invented for the content (the `dish()` price row at
`templates.ts:6566` serves both the menu and the concert program). The gap is therefore not
"decks and docs are weaker formats." It is that the business shelves never got range: there is no
non-business deck in the catalog at all, and no business doc with the Everyday shelf's warmth.

Named plainly, the thing the deck/doc wings are missing as categories: **occasion range** (nine
business decks, zero teaching, storytelling, internal-comms, or celebration decks) and
**format-feature showcasing** (nothing demonstrates Present, speaker notes, or narration the way
every site demonstrates nav and anchors).

## What a scheme has to survive

The evaluation bar used below, restated tersely: (a) a first-time user with a concrete task finds
their template in one scan of the row names; (b) each category has a clear first tile and a
coherent row identity under palette normalization; (c) the scheme reaches ~60 templates by adding
rows or splitting one, never by reshuffling; (d) no orphan rows of 2, no dump rows of 12; (e) any
format mixing inside a row has to earn itself, not be assumed.

On (e): mixing helps exactly when the row mirrors a workflow that really crosses formats (a launch
is a plan, then a teaser page, then a launch page, then an announcement), because the format chip
keeps every tile legible and the switcher means the choice is not final anyway. It confuses when
the row is "everything about X," which is the vertical scheme's failure below. Format deserves no
place in the row names at all: the chip already says it per tile, and naming rows by format would
restate the one distinction the product exists to dissolve.

## Candidate schemes

**By format (Decks / Docs / Sites).** Three rows of 9, 19, and 8; the doc row is a dump and the
scheme says nothing about intent. It also promotes to shelf level the distinction the preview
switcher erases. Rejected.

**By audience or persona (For founders / For agencies / For creators / …).** Reads fast, but
memberships overlap so badly the mapping is arbitrary: a founder is also a person, an agency both
pitches and publishes, and most templates serve two personas or none. Rejected.

**By industry vertical (Restaurants & food / Real estate / Events / …).** The fictions are already
vertical-flavored and the mixing is natural (menu doc, launch site, pitch deck under one roof), but
36 templates cannot cover verticals honestly: the result is ten rows of 2 to 4, and the many
vertical-agnostic templates (QBR, resume, SOW) fit nowhere. At 60 this is a filter or a search
facet, not shelving. Rejected as the primary axis; vertical variety stays a property of the
fictions, and ⌘K covers vertical queries.

**Pure occasion phrasing (When you're raising / When you're launching / …).** Substantively the
same as the recommendation with longer, wordier names that read as a campaign. Rejected on copy,
kept in spirit.

**Job-to-be-done rows, format-blind, with work and life both present.** What a person is trying to
get done, one row per job, mixing formats where the job does. This is the recommendation; the rest
of the doc details it.

For context, not as the driver: Gamma, Canva, Pitch, and Notion all shelve format-first at the top
level (presentations versus docs versus sites) and only then by use case, because in each of them
an artifact is born one format. Galleo's switcher removes the reason that top level exists, which
is precisely the freedom the recommended scheme spends.

## The recommendation

Six rows, in gallery order. Sizes 5 to 7, no orphans, no dumps. Names are user-facing copy: plain
words, no format words, varied construction.

| #   | Category             | Description (gallery copy)                         | Size | Formats                 | First tile         |
| --- | -------------------- | -------------------------------------------------- | ---- | ----------------------- | ------------------ |
| 1   | Pitch & sell         | Raise a round, win a deal, introduce the company.  | 6    | 6 deck                  | Startup Pitch Deck |
| 2   | Launch & market      | Take something new to the people it's for.         | 6    | 1 deck · 1 doc · 4 site | Product Launch     |
| 3   | Client work          | Win the engagement and set its terms.              | 5    | 1 deck · 3 doc · 1 site | Agency Site        |
| 4   | Reports & reviews    | The numbers, the findings, and what happens next.  | 7    | 1 deck · 6 doc          | Annual Report      |
| 5   | You & your work      | Your story, your work, told properly.              | 5    | 3 doc · 2 site          | Portfolio          |
| 6   | Everyday & occasions | Invitations, trips, food, and the places you host. | 7    | 6 doc · 1 site          | Event Invite       |

Order rationale: Pitch & sell stays first because it is the highest-intent shelf (the classic
gateway task, and today's analytics category strings keep continuity for the most-tracked row).
Launch & market second puts the strongest visual work (the site heroes) one scroll below the fold
instead of third-row-down as today. The two personal rows close, as today, but split by career
versus life rather than by "creative" versus "documents."

### The full mapping

| Template                  | Format | Today               | Recommended          |
| ------------------------- | ------ | ------------------- | -------------------- |
| Startup Pitch Deck        | deck   | Pitch & sales       | Pitch & sell         |
| Series A Deck             | deck   | Pitch & sales       | Pitch & sell         |
| Sales Deck                | deck   | Pitch & sales       | Pitch & sell         |
| Product Demo Deck         | deck   | Pitch & sales       | Pitch & sell         |
| Company Overview          | deck   | Pitch & sales       | Pitch & sell         |
| Sponsorship Proposal      | deck   | Proposals & updates | Pitch & sell         |
| Go-to-Market Plan         | deck   | Pitch & sales       | Launch & market      |
| Product Launch            | site   | Marketing & web     | Launch & market      |
| Landing Page              | site   | Marketing & web     | Launch & market      |
| Waitlist Page             | site   | Marketing & web     | Launch & market      |
| Event Page                | site   | Marketing & web     | Launch & market      |
| Newsletter                | doc    | Marketing & web     | Launch & market      |
| Agency Site               | site   | Marketing & web     | Client work          |
| Project Proposal          | deck   | Proposals & updates | Client work          |
| Business Proposal         | doc    | Proposals & updates | Client work          |
| Statement of Work         | doc    | Proposals & updates | Client work          |
| Case Study                | doc    | Reports & research  | Client work          |
| Annual Report             | doc    | Reports & research  | Reports & reviews    |
| Research Report           | doc    | Reports & research  | Reports & reviews    |
| Market Analysis           | doc    | Reports & research  | Reports & reviews    |
| Industry Trends Report    | doc    | Reports & research  | Reports & reviews    |
| Quarterly Business Review | doc    | Reports & research  | Reports & reviews    |
| Board Deck                | deck   | Proposals & updates | Reports & reviews    |
| Investor Update           | doc    | Proposals & updates | Reports & reviews    |
| Resume / CV               | doc    | Personal & creative | You & your work      |
| Cover Letter              | doc    | Personal & creative | You & your work      |
| Portfolio                 | site   | Personal & creative | You & your work      |
| Personal Site             | site   | Personal & creative | You & your work      |
| Photo Essay               | doc    | Personal & creative | You & your work      |
| Event Invite              | site   | Personal & creative | Everyday & occasions |
| Event Program             | doc    | Everyday documents  | Everyday & occasions |
| Travel Itinerary          | doc    | Everyday documents  | Everyday & occasions |
| Recipe Collection         | doc    | Everyday documents  | Everyday & occasions |
| Restaurant Menu           | doc    | Everyday documents  | Everyday & occasions |
| Guest Guide               | doc    | Everyday documents  | Everyday & occasions |
| Property Listing          | doc    | Everyday documents  | Everyday & occasions |

Decisions worth stating, with the objection and the resolution:

- **Case Study moves to Client work.** As a genre it is a report; as a job it exists to win the
  next engagement, and the Tempo fiction is explicitly a vendor asset ("Book a demo"). Client work
  is the shelf a freelancer or agency scans, and proof-of-work belongs next to the proposal it
  travels with.
- **Go-to-Market Plan moves to Launch & market.** It is the plan whose output is the rest of that
  row, and it gives the row its deck. The objection (it is internal, the row is outward-facing) is
  real but weaker than the workflow continuity.
- **Investor Update and Board Deck leave "Proposals & updates" for Reports & reviews.** They are
  cadence artifacts, not asks. The objection: someone raising might look for Investor Update under
  Pitch & sell. Search and the description line carry that case.
- **Sponsorship Proposal joins Pitch & sell.** It is a sale to a sponsor, and it widens the row
  beyond SaaS (a festival is the row's one non-software fiction).
- **The site wing is deliberately broken up.** Today "Marketing & web" hoards five of the eight
  sites. Distributing them (Agency Site to Client work, Portfolio and Personal Site to You & your
  work, Event Invite to Everyday & occasions) gives four rows a designed anchor tile instead of
  one row hoarding the product's best work.

Two templates fit nowhere perfectly, flagged rather than forced:

- **Company Overview** (Fernwood) is a brand book more than a sale. It sits in Pitch & sell as
  "the deck you send before anyone buys," but it would move to a brand or about-us shelf the day
  one exists.
- **Property Listing** is a professional sales artifact on the warmest shelf. It stays in
  Everyday & occasions because its register (and its neighbors: guest guide, menu) is hospitality,
  not commerce; if a "Hospitality & places" row earns itself at ~60, it anchors that row instead.

### Where each row is thin

One line per missing concept; exploration only, nothing gets built from this list.

- **Pitch & sell**: a one-page leave-behind (doc) for after the meeting; and one deck that ships
  real speaker notes, so this row also demonstrates Present instead of only surviving it.
- **Launch & market**: release notes (doc) for the launch after the launch; a standalone pricing
  page (site).
- **Client work**: a weekly client status update (doc); a client kickoff guide (doc).
- **Reports & reviews**: an all-hands deck, the catalog's entire internal-comms hole in one item; a
  project post-mortem (doc).
- **You & your work**: a conference talk (deck), which would be the catalog's first non-business
  deck; a one-page link hub (site).
- **Everyday & occasions**: a celebration slideshow (deck) proving decks are not only business; a
  party invite (site) a weight class below the wedding.

Cross-cutting: teaching (a lecture deck, a workshop, a course outline) has no wing at all. At 36 it
is not a row; at ~60 it earns a seventh ("Teach & explain") without moving anything, which is the
scale test passing: growth is new rows or a clean split of Everyday & occasions into occasions
versus hospitality, never a reshuffle.

## Costs and interactions

- **Onboarding's format filter thins the rows unevenly.** Filtered to decks, only Pitch & sell
  survives at full strength (6), and four rows drop to 0 or 1. Today's scheme has the same property
  in a different shape. If the filtered gallery looks sparse, the fix belongs to that surface (rank
  by format instead of hiding, or collapse to one row), not to the scheme.
- **Analytics continuity.** `category` on `template_previewed` / `template_used` is a free string
  (`model/analytics.ts:368`), so renames compile trivially, but any dashboard tile filtering on the
  old strings needs checking in `scripts/posthog-dashboards.ts` before the switch.
- **Implementation cost, when it happens, is one file.** Category strings and array order in
  `model/templates.ts`; the bodies in `services/core/templates.ts` do not move.

## What this does not fix

Honestly: the categorization changes shelf labels and neighbors, not the wood.

- Seven decks still share one skeleton and half the business templates one fictional universe; the
  rows read better only because the sameness is split across three of them. The real fix is an
  occasion-range pass on the deck wing (the four thin-spot decks above) and at least one
  new-structure business deck.
- Deck and doc imagery stays Lorem Picsum catalog picks while the sites keep curated slugs. A shelf
  name cannot art-direct; parity needs the same named-asset treatment the sites got.
- No deck demonstrates Present, notes, or narration, and no shelf can make one do so.
- The gallery paints every cover in the user's theme, so rows whose identity is palette-dependent
  will never read as intended there; identity has to keep coming from structure and photography.
- The Go-to-Market Plan's positioning band renders as a patchwork of color blocks over its
  background image in the strip render; worth a look at the body regardless of any of this.
