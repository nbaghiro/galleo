# Planning — template refresh: pins in the catalog

> The executable design for introducing the positioning and typography rounds into the template
> catalog: which of the 90 templates gain a pinned badge, an overlap card, a negative-z photo, a
> group-rotated polaroid, a baseline row or a clamp, exactly where, with what copy, and which stay
> untouched. Grounded in the full catalog read and four rendered prototypes. Status: executed
> 2026-08-29. Deviations: the annual-report underlap was dropped (no quiet-enough catalog photo,
> and inside a 60% column the overlap cannot stay shallow); the wall-of-love notes hang fully
> below the flow row; several hero badges sit beside the h1 rather than below the nav (the
> subtitle owned that band); the guest-guide and photo-essay note cards moved onto their photos; the
> restaurant-menu note left `split` for a group, since split assigns its right child a width that
> overrides a pin's; the celebration polaroid recast to pic 978 and the speaker headshot to
> pic 1027; and `clampLines` shipped in the DSL but found no earning use in the touched set. Every
> surviving composition was shot and eyeballed; deck touches were re-shot as web.

Companion docs: `positioning.md` (the capabilities), `template-catalog.md` (the catalog design this
refresh must not disturb), `engine-gaps.md`.

## The law of the round

**Restraint.** 27 templates are touched with one to three moves each; 63 get nothing, and that is
the design. A pin lands because it says something true in the template's own story: a date that
exists, a scarcity that is real, a photo someone would actually tape to the page. A badge that is
merely decoration, or a rotation on a template whose voice is formal (a resume, a statement of
work, a board deck), is noise and stays out. Five more templates get a clamp on an existing table
as a wrap guard: mechanical, invisible until a long line needs it, not counted as design.

## DSL additions (`model/authoring.ts`)

The bodies stay in the authoring DSL, so the round starts by teaching it four small words:

```ts
/** Lift out of the flow, anchored to the parent's box; offsets in px at compose scale. */
export const pin = (
    el: ElementInstance,
    x: "start" | "center" | "end",
    y: "start" | "center" | "end",
    opts?: { dx?: number; dy?: number; z?: number; rotate?: number },
): ElementInstance => ({ ...el, layout: { width: "fit", ...el.layout, pin: { x, y, ...opts } } });

/** A photo and its caption on one small card, ready to pin and turn. */
export const polaroid = (src: string, aspect: number, caption: string): ElementInstance =>
    col({ surface: "solid" }, img(src, aspect, 8), t(caption, "caption"));

/** Clamp a text element to n painted lines. */
export const clampLines = (el: ElementInstance, lines: number): ElementInstance => ({
    ...el,
    data: { ...el.data, maxLines: lines },
});
```

Plus two widenings rather than new helpers: `table(data, header = true, clamp?: number)` threads
the cell clamp, and `ContainerOpts.align` widens to `"start" | "center" | "end" | "baseline"` so a
baseline row is just `row({ align: "baseline" }, ...)` — the container element already accepts it.

## Composition rules, paid for with prototypes

Four risk compositions were built as raw JSON and rendered through the shot pipeline
(`scratchpad/refresh/*.png`); two passed as designed and two taught rules:

- **A pinned label on a photo needs a chip ground.** The real-estate badge as a bare `t(...,
"label")` was unreadable over the busy cover (`cover-doc.png`, first cut). Rule: pin `badge()`
  or a small solid card, never bare text, whenever the ground is an image.
- **Pinned cards overlap chrome, never text.** The wall-of-love's first cut buried its own flow
  quotes under the pinned ones. The working form (`wall-web.png`, third iteration): the flow row
  stays whole, the rotated cards hang fully below it on band ground the section stretches to
  cover, and any overlap touches a card's border zone only. Final dx/dy are tuned in the
  implementation shot loop; the third iteration still clips one attribution and needs one nudge.
- **The polaroid pattern is safe in every format.** The rotated photo-plus-caption card held its
  corner and its legibility in deck and site renders (`sintra-deck.png`, `sintra-web.png`).
- **A hero overlap card can ride its own section.** Pinned `y:"end"` with positive `dy`, the
  band-stretch keeps it inside the hero's ground (`hero-web.png`); the Harborlight form (pinned on
  the following band with negative `dy`) remains the alternative when the card should cross the
  seam. Both are legitimate; pick per hero.

Rejected while prototyping: a "Most people pick this" badge on `pricing-page` — the pricing
element is one unit, so a pin anchors to its whole box and cannot track the middle tier across
widths. If tier badges are ever wanted, they belong inside the pricing element's own data.

## The touched list

Copy below is final draft (house rules: no em-dashes, varied construction, each template's own
voice). Formats checked at plan time are noted; every touched template gets the full shot pass at
implementation.

### Pitch & sell (4 of 15)

- **startup-pitch** (deck): the traction slide's headline becomes a baseline row, the h1 numeral
  and its qualifier on one line.
- **wall-of-love** (site): a "Stuck to the fridge" band after `wall` — two flow quotes, two pinned
  rotated quote cards below them per the prototype rule. Copy reuses existing testimonial voice.
- **demo-page** (site): a small solid card pinned to the hero's lower right: label "TODAY", body
  "Four slots left. They go by lunchtime most days."
- **investor-update** (doc): the `headline` section's MRR figure as a baseline row.

### Launch & market (3 of 15)

- **product-launch** (site): `badge("Ships October 12")` pinned to the hero photo's top right,
  rotate -4.
- **landing-page** (site): a live-metrics mini card riding the hero's edge: label "LIVE", body
  "p95 at 42ms as you read this." (Northwind's whole story is live metrics.)
- **event-page** (site): `badge("Early bird ends Friday")` pinned rotated on the `tickets` band;
  agenda table gains `clamp: 1`.

### Client work (3 of 15)

- **agency-site** (site): a rotated polaroid in the `team` band, caption "The studio, mostly
  awake."; `badge("Booking spring projects")` pinned on the hero.
- **real-estate-listing** (doc): `badge("Open house · Sat 2 to 4")` pinned rotated on the cover
  photo (chip ground per the rule); the price line in `facts` becomes a baseline row.
- **case-study** (doc): the outcome figure as a baseline row.

### Reports & reviews (4 of 15)

- **annual-report** (doc): the chair's letter (`s2`) gains a quiet photo sliding under the text
  edge at z:-1, the Winter Making List move, overlap shallow enough that no word sits on texture.
- **qbr** (doc): "113% of plan" as a baseline row in the `q2` close-up.
- **all-hands** (deck): a stamp-style rotated badge on the `shipped` slide: "All four, on time."
  (foundry's industrial voice earns the stamp).
- **growth-review** (deck): the headline figure as a baseline row.

### Everyday & occasions (8 of 15)

- **event-invite** (site): "Save the date" badge pinned rotated over the hero photo.
- **restaurant-menu** (doc): a taped-note polaroid beside the `note` section, caption "The
  larder, photographed on Tuesday."
- **travel-itinerary** (doc): a polaroid in `aurora`, caption "What Kp 4 looked like from the hot
  tub."; `bookings` table gains `clamp: 1`.
- **guest-guide** (doc): a rotated note card pinned on the `arrival` section: "Door code 4417.
  The keypad sticks, push twice."
- **celebration-slideshow** (deck): the `sintra` slide gains the prototyped polaroid ("an hour
  before the vows"); the `dog` slide a small rotated label sticker.
- **travel-recap** (deck): one polaroid on the `best` slide, caption from the existing bronze
  line's voice.
- **restaurant-site** (site): the prototyped hero card: label "TONIGHT", body "Seatings at 6 and
  8:30. The 6 is nearly spoken for."; `badge("The menu turned over Thursday")` on the `menu` band.
- **rental-site** (site): `badge("June has three open weeks")` pinned on the hero.

### You & your work (5 of 15)

- **portfolio** (site): `badge("Taking Q1 commissions")` pinned on the hero.
- **photo-essay** (doc): one rotated taped caption on the `s3` photo: "Platform 6, four minutes
  between trains."
- **year-in-review** (deck): two of the `gallery` frames become rotated polaroids, keeping their
  existing captions.
- **speaker-kit** (doc): the headshot in `head` becomes a straight polaroid (no rotation; the kit
  is a working document).
- **app-site** (site): a mini card riding the hero edge: "4.9 on the App Store · 12,400 ratings."

### The clamp-guard batch (not design, just guards)

`release-notes` fixes table, `sow` milestones, `client-status` status table, `guest-guide`
arrival table, `product-sheet` spec table: `clamp: 1` each, so no future copy edit wraps a row.

### Left alone, deliberately

The remaining 58: formal documents whose plainness is the design (resume, cover-letter, sow
beyond its guard, board-deck, exec-summary, messaging-guide), templates already at their best
(announcement-keynote's minimalism, link-hub, status-page), and every case where a badge would
have nothing true to say. Restraint is what keeps the touched 27 legible as intent.

## Verification at implementation time

Per touched template: full per-section shot pass in its own format, plus the translation check
(deck touched → re-shot as web; doc stays in the reading column, no new bleeds). The wall and
both hero cards get a narrow-width render. Copy through `pnpm check:copy`. Heights legitimately
change for touched templates, so the height-probe baseline is re-cut after the round, not
compared; the 63 untouched templates must show zero drift against the current baseline.

## Phases

- **A — DSL (S):** the four additions + widenings, with authoring tests.
- **B — the badge/baseline/clamp majority (M):** every touch that is one pinned badge, one
  baseline row, or a clamp; shot pass per template.
- **C — the compositions (M):** the wall, three hero cards, five polaroids, the annual-report
  underlap; each tuned in the shot loop against the prototype rules.
- **D — re-cut the height baseline, update `template-catalog.md`, and run the full guard suite.**
