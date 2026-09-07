# Template refresh — pins in the catalog

> How the positioning and typography rounds live in the template catalog: which templates carry a
> pinned badge, an overlap card, a group-rotated polaroid, or a baseline row, exactly where, and
> which stay untouched. Grounded in a full catalog read and four rendered prototypes; every
> surviving composition was shot and eyeballed in its own format, with deck touches re-shot as web.
> Companion docs: `positioning.md` (the capabilities), the executed `template-catalog.md` (the
> catalog design this refresh does not disturb), `engine-gaps.md`.

## The law of the round

**Restraint.** 27 templates carry one to three moves each; the rest get nothing, and that is the
design. A pin lands because it says something true in the template's own story: a date that exists,
a scarcity that is real, a photo someone would actually tape to the page. A badge that is merely
decoration, or a rotation on a template whose voice is formal (a resume, a statement of work, a
board deck), is noise and stays out.

## The DSL (`model/authoring.ts`)

The bodies live in the authoring DSL, so the round starts with four small words:

- `pin(el, x, y, opts?)` — lift out of the flow, anchored to the parent's box; offsets in px at
  compose scale; `opts` carries `dx`/`dy`/`z`/`rotate`.
- `polaroid(src, aspect, caption)` — a photo and its caption on one small solid card, ready to pin
  and turn.
- `clampLines(el, lines)` — clamp a text element to n painted lines (sets `maxLines`).
- Two widenings rather than new helpers: `table(data, header = true, clamp?)` threads the cell
  clamp, and `ContainerOpts.align` includes `"baseline"`, so a baseline row is just
  `row({ align: "baseline" }, …)` — the container element already accepted it.

All four are covered by the authoring tests. `clampLines` and the `table` clamp parameter are
DSL-complete but unused by the catalog (see "Not taken").

## Composition rules, paid for with prototypes

Four risk compositions were built as raw JSON and rendered through the shot pipeline; two passed as
designed and two taught rules. The prototype PNGs are gone; these rules are the residue, and they
are what any future pinned composition must hold to:

- **A pinned label on a photo needs a chip ground.** A badge as bare `t(..., "label")` was
  unreadable over a busy cover. Rule: pin `badge()` or a small solid card, never bare text,
  whenever the ground is an image.
- **Pinned cards overlap chrome, never text.** The wall-of-love's first cut buried its own flow
  quotes under the pinned ones. The working form: the flow row stays whole, the rotated cards hang
  fully below it on band ground the section stretches to cover, and any overlap touches a card's
  border zone only.
- **The polaroid pattern is safe in every format.** The rotated photo-plus-caption card held its
  corner and its legibility in deck and site renders.
- **A hero overlap card can ride its own section.** Pinned `y: "end"` with positive `dy`, the
  band-stretch keeps it inside the hero's ground; the alternative (pinned on the following band
  with negative `dy`) remains legitimate when the card should cross the seam. Pick per hero.

Rejected while prototyping: a "Most people pick this" badge on the pricing page — the pricing
element is one unit, so a pin anchors to its whole box and cannot track the middle tier across
widths. If tier badges are ever wanted, they belong inside the pricing element's own data.

One more rule, learned in implementation: **a `split` assigns its right child a width that
overrides a pin's**, so a pinned note beside a split's column goes in a `group` instead (the
restaurant-menu note is the example in the catalog).

## The touched set

The moves as they stand in `services/core/templates.ts` (25 `pin` calls, 8 `polaroid`s, 6 baseline
rows). Deviations from the plan that produced them are folded in as fact; copy follows the house
rules (no em-dashes, varied construction, each template's own voice).

- **Pitch & sell**: startup-pitch's traction headline and investor-update's MRR figure are baseline
  rows; wall-of-love carries the "Stuck to the fridge" band, its rotated quote cards hanging fully
  below the flow row per the prototype rule; demo-page pins the "TODAY / Four slots left" card on
  its hero.
- **Launch & market**: product-launch pins `badge("Ships October 12")` rotated on the hero;
  landing-page rides the "LIVE / p95 at 42ms as you read this" card on the hero edge; event-page
  pins `badge("Early bird ends Friday")` on the tickets band.
- **Client work**: agency-site carries a team polaroid and a "Booking spring projects" hero badge;
  real-estate-listing pins `badge("Open house · Sat 2 to 4")` on the cover (chip ground per the
  rule) and sets the price line as a baseline row; case-study's outcome figure is a baseline row.
- **Reports & reviews**: qbr's "113% of plan" and growth-review's headline figure are baseline
  rows; all-hands carries the stamp-style rotated "All four, on time." badge (foundry's industrial
  voice earns the stamp). The planned annual-report underlap (a photo sliding under the chair's
  letter at z:-1) was dropped: no catalog photo was quiet enough, and inside a 60% column the
  overlap could not stay shallow, so annual-report is untouched.
- **Everyday & occasions**: event-invite pins the "Save the date" badge on its hero; the
  restaurant-menu polaroid ("The larder, photographed on Tuesday.") sits in a group beside the note
  section; travel-itinerary carries the aurora polaroid ("What Kp 4 looked like from the hot tub.");
  guest-guide's door-code note card sits on the arrival photo; celebration-slideshow keeps the
  prototyped wedding polaroid ("an hour before the vows") and a rotated label sticker on the dog
  slide; travel-recap carries one polaroid; restaurant-site rides the "TONIGHT / Seatings at 6 and
  8:30" hero card and pins "The menu turned over Thursday" on the menu band; rental-site pins
  "June has three open weeks" on its hero.
- **You & your work**: portfolio pins "Taking Q1 commissions"; photo-essay's taped caption
  ("Platform 6, four minutes between trains.") sits on its photo; year-in-review turns two gallery
  frames into rotated polaroids; speaker-kit's headshot is a straight polaroid (no rotation; the
  kit is a working document); app-site rides the "4.9 on the App Store" mini card on the hero edge.

Several hero badges sit beside the h1 rather than below the nav, because the subtitle owned that
band; the guest-guide and photo-essay note cards moved onto their photos rather than beside them.

## Left alone, deliberately

The untouched majority: formal documents whose plainness is the design (resume, cover-letter, sow,
board-deck, exec-summary, messaging-guide), templates already at their best
(announcement-keynote's minimalism, link-hub, status-page), and every case where a badge would have
nothing true to say. Restraint is what keeps the touched 27 legible as intent.

## Not taken

The planned clamp-guard batch — `clamp: 1` on the release-notes fixes table, sow milestones,
client-status status, guest-guide arrival, product-sheet spec, event-page agenda, and
travel-itinerary bookings tables, as a wrap guard against future copy edits — was never applied:
`services/core/templates.ts` contains no `clampLines` call and passes no clamp to `table()`, so
none of those tables clamp today. The capability exists in the DSL and is exercised only by its own
unit test.
