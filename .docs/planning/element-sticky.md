# Planning — element-level sticky positioning

> The closing round for item 17 of [`engine-gaps.md`](engine-gaps.md): an element that stays at
> the viewport top while the page scrolls, in two scopes — bounded by its own section (a table
> header, a following aside) or by the whole page (the nav in a hero, a persistent CTA). The
> engine's one-pass, stage-absolute layout never changes: stickiness is consumption-time
> behavior, honored only where a scroll exists, exactly as `Section.pinned` already is.
> Status: built 2026-09-07, pending one manual QA pass. Deviations from the approved sketch are
> recorded in §Deviations.

Companion docs: `engine-gaps.md` (item 17), `rendering.md` (the paint contract), the paint-model
round's per-backend degrade precedent, `.docs/collab.md` (why regions stay in laid-out space).

## Why

`layout.dock: "top"` places a row at its section band's top edge, and `Section.pinned` makes a
whole section stick — but nothing element-granular sticks. A published site cannot keep a table
header visible over thirty rows, follow the reader with an aside, or let the docked nav in a hero
keep following after the hero scrolls out. Users restructure content into dedicated pinned
sections to fake the nav case and simply cannot express the others.

## Options considered

- **A. DOM re-parenting at paint time** — extract the sticky element's painted subtree into a
  viewport-level host. Rejected: it breaks one-layer-per-section, which the section cache,
  `regionWindow`, comment anchors, the LiveLayer and windowed publish all lean on; every seam
  would grow a special case for the escaped subtree.
- **B. Scroll-driven JS repositioning** — a per-frame listener translating the element. Rejected:
  puts JS in the reader's scroll path the architecture deliberately keeps empty, janks on weak
  devices, and still needs every region correction A needs.
- **C. A derived pinned section** — normalize `stick: "page"` into a synthetic pinned section at
  read time. Rejected: the viewer's DOM would disagree with the stored tree (comments, collab
  addresses, the editor all point into a structure the reader is not showing). The visible
  variant (an editor affordance performing a real split) is obsoleted by D and recorded below.
- **D. Sticky proxy layers (chosen)** — the element paints in place exactly as today on every
  backend, and the continuous DOM stack additionally builds a small carrier as a sibling of the
  section layers: absolutely positioned in content space at the element's own spot, containing a
  `position: sticky` wrapper painted from the same commands. CSS containment gives the range
  bound free (the carrier's extent IS the stick range), no scroll listeners exist, exports and
  paged formats are correct by construction because they only ever see the in-place paint.

## The design

**Model.** `ElementLayout.stick?: "top" | "page"` beside `dock`/`pin` (`model/geometry.ts`).
Layout math never reads it. The write path passes it untouched (`isArtifactContent` is
structural; section ops carry whole elements); the AI schema mirror (`zElementLayout`) gains the
field so a generated site can author it; one catalog sentence teaches it where dock is taught.

**Engine.** `EngineNode.stick` set in `applyLayout` beside `docked`; `emit` threads a
`{ mode, key }` mark down the subtree the way it threads `link`, stamping every command of the
sticky element (key = the element's region id). Nothing else changes: no new pass, no geometry.

**DOM stack.** `paintSectionStack`, under the same `honorPin` playback gate
(`opts.pinned && kind === "continuous"`): for each distinct stick key in a painted section's
commands, build a carrier div appended after the section layers —

- carrier: absolute at the section's x, width = the section's layout width, `pointer-events`
  none, `z-index` = `PINNED_Z`; for `"top"` it spans exactly the section (top = section top,
  height = section height); for `"page"` it runs from the element's own stack-absolute y to the
  bottom of the stack.
- inside: a sticky wrapper at the element's box (margins place it; `position: sticky`,
  `top` = the accumulated offset of earlier page-scoped elements, pointer events restored), and
  inside that an inner div at (-elX, -elY) so the same section-local commands paint
  pixel-identically over the original.
- the original's painted nodes turn `visibility: hidden` while a carrier exists, so exactly one
  copy is ever visible — at rest the proxy sits exactly over the original, so there is no swap
  moment at all.
- a section holding a page-scoped element is windowing-exempt like a pinned section (its nav
  must exist however far the reader has scrolled); carriers are cached on the section's cache
  entry and rebuilt only when its commands change, with styles refreshed per pass.
- stick inside a pinned section is ignored (the section already sticks).

**Overlay correction.** The result gains `sticky: StickyEntry[]` (key, mode, stack-absolute box,
section extent, offset). `stickyShift` in `canvas/render/present.ts` is the generalized carriage
clamp — `pinnedShift` is now expressed through it — and the playback surface's `liveOffsetY`
adds the element-granular carriage for any live element inside a sticky subtree (prefix match on
the region id), so a form or live button in a stuck aside follows it. Plain links inside the
proxy are real anchors and work natively.

**Editor.** Renders in place (no carrier: the editor never passes the playback flag). One
control in the Position group beside Dock: "Stick while scrolling" — Off · In section · Whole
page — via the same `setElementLayout` strip-or-set idiom. Typed `element_stick_set` event at
that one writer.

**Per-backend contract** (paint-model style): continuous DOM playback honors both scopes; the
editor, paged present, PDF, PNG, PPTX and the 2D-canvas mirror paint in place and ignore the
field, the way PNG ignores a link.

## Phases

- **S-A** — model field + engine mark: geometry type, compose application, emit threading;
  red-first emit pins (subtree stamped, key = element id, siblings unmarked).
- **S-B** — the DOM carriers in `paintSectionStack` + windowing exemption + original hiding;
  red-first DOM pins (carrier geometry per scope, pixel-identical inner offset, hidden
  originals, no carrier without the playback flag, page carriers reach the stack bottom, two
  page elements accumulate offset, exempt windowing).
- **S-C** — `stickyShift` + `pinnedShift` re-expression + playback wiring + `sticky` in the
  result; pins: the clamp pure (rest, stuck, pushed-out), pinnedShift's existing pins stay
  green, prefix carriage.
- **S-D** — editor control + analytics event + AI schema field + catalog sentence + ledgers.

Gates per phase and at the end: `tsc` clean, lint on touched files, full `pnpm test`,
`check:elements`, `check:suppressions`, `check:copy`, and `eval:shots` exactly
"all 592 checks pass" (layout untouched by construction).

## Deviations

- **No IntersectionObserver.** The approved sketch hid the proxy until an observer reported the
  original crossing the viewport top. Unnecessary: the carrier starts at the element's laid-out
  spot, so the proxy at rest is pixel-identical over the original — hiding the original instead
  of the proxy removes the swap moment, the observer, and all scroll-time JS. Both tiers are
  zero-JS.
- **Both tiers are carriers.** The sketch put the `"top"` wrapper inside the section layer;
  `paintReconcile` trims a layer's children to its command count, so anything foreign inside a
  layer dies on the next reconcile. Carriers as scroller siblings keep the reconciled layers
  canonical for both scopes with one code path.

## The stuck-state round (2026-09-07, same day)

The bare proxy sticks as exactly what it was at rest, which a transparent nav row demonstrates
badly: a naked strip flush at the viewport edge. Two knobs landed, both consumption-time like the
stick itself:

- **`stickInset?: number`** — px kept between the viewport edge and the stuck element, both
  scopes; the wrapper's sticky `top` gains it, the carriage offset carries it, and page-scoped
  accumulation counts it so stacked chrome never overlaps. The detach reads as a short slide
  rather than a flush catch.
- **`stickBar?: boolean`** — page scope only: a 1px sentinel at the carrier's head watched by one
  IntersectionObserver (the continuous-reveals primitive; the only JS in the whole feature)
  reports the detach CSS cannot; past it the wrapper dresses as a full-width bar in the theme's
  surface with a hairline beneath and vertical breathing room, and at rest every property
  reverts, keeping the pixel-identical contract. The transition is a soft 160ms unless reduced
  motion, where the dress swaps instantly but still applies, since it is legibility rather than
  motion.
- **The detached hairline is general** (user feedback, same day): the separation-from-content
  concern is not bar-specific — the showcase artifact's transparent outline nav is exactly the
  case where a detached element needs to read apart from whatever scrolls beneath it. So EVERY
  page-stuck element grows the sentinel, and detached it draws a subtle token-derived hairline
  (the line color at 55 percent); the bar treatment layers the surface, full width and padding on
  top of that, opt-in as before. Rest state stays pixel-identical, so the contract holds; the
  cost is one observer per page-stuck element rather than per bar. Section-scoped elements stay
  bare, since they ride inside content that already frames them (a table header on its table); a
  QA verdict can extend them later without a contract change.

Contract choice, argued: two flat sibling fields rather than turning `stick` into an object. The
string already travels the zod mirror, the segmented control and the catalog teaching; an object
would churn all three surfaces to spare two optional primitives, and `dock`/`pin` set the flat
precedent. Surfaces: a "Stuck offset" slider whenever stick is set, a "Detach as a bar" toggle on
page scope, one clause extending the catalog's nav recipe.

## Not taken, and why

- The editor "split into a pinned section" affordance (option C's visible form): obsoleted — a
  layout field on the element the author already has does the job with no surgery.
- Viewer-toggle / datum-hover correction inside stuck elements: `viewerToggleAt`'s shift is
  section-granular; realistic sticky content (nav, header, CTA, aside) interacts through links
  and live overlays, both covered. Revisit if a chart ever lives in a sticky aside.
- Offsetting section-scoped elements below a stuck pinned-section nav: pinned sections already
  overlap each other by design (latest covers); composing the two chromes is a feel question for
  a QA round, not a correctness one.
- Cross-tier offset with `Section.pinned` bands, `stick` inside pinned sections, and a
  `stick: "bottom"`: recorded, unbuilt.
