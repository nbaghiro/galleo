# Planning: the element surface round

> The implementation plan for what the element atlas found: the full inventory of configuration
> across the engine, the element specs, `ElementLayout` and the section, and the surfaces that
> control each option (the floating bar, the docked inspector, the canvas handles, the section
> popup, the AI catalog). The atlas was read from the working tree on 2026-09-03 and re-verified
> on 2026-09-04. Status: phase A, C1, part of B and the control half of D landed 2026-09-06 with
> [`control-distribution.md`](../executed/control-distribution.md); every claim below was
> re-verified against the working tree on 2026-09-07. What remains: the B guards and dead
> declarations, C2 to C5, the section popup and gesture half of D, E, and the `ai.md` piece of F.

Companion docs: `rendering.md` (the stated single reference for the element system, brought back
in line with the code on 2026-09-06), `ai.md` (the catalog and the tools that write content),
`engine-audit.md` (its L and U series overlap this round in six places, named where they do; the
rest of that inventory stays where it is), `testing.md` (the mocking contract).

The shape of the round, in one line: the guards that keep the registry, the palette and the
catalog telling one story, then the element fixes, then the remaining controls for fields an
author can end up holding but cannot reach, then the catalog, then the docs.

## The discipline

Each phase lands independently green: typecheck, lint, full vitest, every `check:*` guard, and
`eval:shots` unchanged unless the phase says which numbers move and why. The do-not-touch list in
`engine-audit.md` binds throughout; nothing here touches the solver, the measure path, the frozen
drag, or the region-id join. No suppressions, no `any`, terse comments, one file per concept, and
the layering law: a helper both the bar and the panel need lives in `canvas/elements/spec.ts` beside
the schema it reads, not in a sibling file under `editor/panels/`.

Copy rules apply to every label added: plain words, no em-dashes, checked by `check:copy`.

## Scope

In: the nine findings in the atlas, the two facts the atlas established that no finding names (the
bar and the panel evaluate `visibleWhen` against different inputs; six stored fields have no
control), and the audit items that are the same work: L1 (two HIDDEN lists), L2 (stale docs), L6
(radius in three regimes, the container half), L7 (chart capability sets), L8 (positional
composites open to the AI), L10 (the catalog guard runs one way), U2 (per-keystroke undo from the
inspector), U9 (rotation lives under Pin and nothing says so).

Out, with where each lives instead: the editor gesture gaps U1 and U3 to U8 (the audit's own
list), the L3 to L5 and L9 hygiene sweep (batched by the audit as one round), page-size presets and
the dimension editor (`rendering.md` section 10), diagram weights on types other than process
(`engine-gaps.md`), and a per-asset focal point (the focal point entry in `engine-gaps.md`).

---

## Landed (verified against the tree 2026-09-07)

- **Phase A, whole: the inspector reads the whole element.** `visibleControls` in
  `canvas/elements/spec.ts` is the one gating predicate, with `barControls` beside it and the
  full-data contract stated on `ControlField.visibleWhen`. `SchemaFields`
  (`editor/panels/SharedControlFields.tsx`) takes a `data` accessor and gates over
  `{ ...data(), ...snapshot }`; `ElementInspector` passes the element's data; the bar goes through
  the same predicate, so the two surfaces cannot drift again. The audit's U2 rode along:
  `coalesceFor` in `SharedControlFields.tsx` extends coalescing to `text` and `number`. Tests:
  `canvas/elements/__tests__/spec.test.ts` gates the media kinds through `visibleControls`;
  `editor/core/__tests__/store.test.ts` covers the folded undo entry.
- **Phase B, the hidden set and the dead control kind (audit L1).** `ElementSpec.hidden` is the
  registry's own flag on the five internal registrations (container, chart, diagram, media,
  avatar); the palette (`Editor.tsx`, `Insert.tsx`) and `scripts/check-elements.ts` all read
  `listElements().filter((s) => !s.hidden)`, so no `paletteElements()` helper was needed, and the
  script now reads the tally line out of `AGENTS.md` and self-checks its own drift guard, so the
  doc and the registry cannot disagree silently. The registry stands at 72 registrations, 67
  palette-visible, after the form family. The `custom` control kind is gone, replaced by `action`
  (a panel button whose `run` rewrites the data whole).
- **C1: chart capability bits live on the type entry (audit L7).** `ChartType` in
  `chart/utils.ts` carries `stacked`/`smooth`/`values`/`grid` flags declared by each renderer's
  registration; the controls in `chart/element.ts` gate through `honours(flag)` over
  `getChart(type)`, and `normalize` masks `stacked` by the type's flag
  (`!!can?.stacked && (d.stacked ?? false)`) so a stale value cannot reach a renderer. The four
  hand-maintained sets are gone. No `legend` flag was needed.
- **Phase D, the control half** (the per-element distribution is
  [`../executed/control-distribution.md`](../executed/control-distribution.md)): the generic
  Height row in `ElementInspector` (`editor/panels/RightPanel.tsx`) derived from
  `resizeOf(spec, data).height`; the universal radius row writing `layout.radius`; the pin block
  under a "Position" heading; the dock toggle, offered wherever the flag is already set so an
  AI-written dock can be cleared; the container's `frame: true` and `gap` control with the
  arrange reading `d.gap ?? 14` (bare) and `d.gap ?? 12` (surfaced); the embed's conditional
  aspect resize (`isEmbedVideoUrl` in `basic/embed.ts`, the function form media uses).
  `element_pinned` / `element_resized` events exist in `model/analytics.ts`.
- **Phase F, the current-state halves.** `rendering.md` was rewritten against the tree
  (sections 5 and 6 now carry `visibleControls`, the `hidden` flag, the 72/67 tally, one media
  element under nine names) and the `AGENTS.md` tally is guard-checked by `check:elements`.

---

## Phase B remainder: the guard runs both ways

### The findings (re-verified 2026-09-07)

`check:elements` proves every catalog type is a registered spec and never the reverse (audit
L10): `scripts/check-elements.ts` only checks `ELEMENTS` against the registry. The catalog's 26
entries have nothing for `embed`, `shape`, `spacer`, `gradient` or the icon/graphic media kinds,
and the catalog is a hand-written table whose field keys nothing compares to the spec's controls;
a control added to a spec is invisible to the AI until someone remembers.

`ResizeSpec.width` is still declared in `spec.ts` and set to `false` by `spacer`
(`basic/spacer.ts`) and the sized media branch (`media/element.ts`), read by nothing, since width
is the divider system.

The chart Type dropdown lists renderers in registration order (`chart/render.ts` imports line
before column), while `CHART_TYPES` in `model/elements.ts` puts column second. The ids match, the
sequence does not, and `chart.test.ts` pins only sorted-set equality; the diagram side matches
exactly.

### Design

- `check-elements.ts` gains the reverse direction: every palette spec is either named in
  `ELEMENTS` or listed in an `UNTAUGHT` map with a reason (the fifteen chart and sixteen diagram
  variants resolve to `chart` and `diagram`; the media variants resolve to `media`; `graphic`
  cannot be authored by a model). It also checks keys: every catalog field key is a control key of
  the spec, a key of `create()`, or on the entry's own allow-list (`children`, the table's legacy
  `data`, `poster`, `aspect`). The script already crosses the layer law on purpose; a vitest under
  `services/` could not import canvas.
- Remove `width` from `ResizeSpec`, with the two writers. The compiler does the rest.
- Reorder the imports in `chart/render.ts` to `CHART_TYPES` order and strengthen the guard in
  `canvas/elements/chart/__tests__/chart.test.ts` from set equality to sequence equality, the way
  `diagram.test.ts` already pins it.

### Checklist

- [x] `hidden` on the five specs; three consumers on the registry flag; the `AGENTS.md` tally
      guard-checked (landed; see above).
- [ ] Reverse guard + key guard in `check-elements.ts`, with `UNTAUGHT` filled honestly (phase E
      shrinks it).
- [x] `custom` removed (replaced by `action`).
- [ ] `ResizeSpec.width` removed with its two writers.
- [ ] Chart registration order; sequence guard.

### Acceptance

`pnpm check:elements` passes with the reverse guard live; adding a control to a spec without
teaching it, or teaching a key no spec has, fails the guard with the key named.

Size: S.

---

## Phase C: element fixes

Each of these is a place where a label, a value set or a renderer promises something the code does
not do. They change pixels in narrow cases, so the diagram gallery snapshots and the visual
invariants run are part of the acceptance. C1 landed (recorded above); C2 to C5 remain, each
re-verified in the tree on 2026-09-07.

### C2. The matrix honours its row headers

The `axes` field for a matrix is labelled "Headers (columns, then rows)", the SWOT preset
supplies four entries, and the comment in `diagram/matrix.ts` even promises "captions the columns,
then the rows", but the code reads only the first `ncol` entries (`axes.slice(0, ncol)`) as column
captions. Design: the next `nrow` entries caption the rows in a left gutter the arrange reserves
only when they exist, through the same `caption` leaf. The visual-invariants matrix gains a
row-header case; the caption clearance invariant already covers the geometry.

### C3. Hub spokes count from one

`hub.ts` badges spoke `s` with `badgeText(numbers, s + 1)` (the item index, via `const i = s + 1`
in the spoke loop), so the first spoke reads "2" or "B" while the centre carries no badge. The
badge counts spokes: `badgeText(numbers, s)`. Pin the first spoke's badge in `diagram.test.ts`.

### C4. Callout tones read on every ground

Six of the seven tones are fixed hex values (`toneColor` in `canvas/elements/text/callout.ts`)
and the section's contrast swap cannot reach them, so a dark band gets a dark stripe. The hues are
semantic and should not follow the accent, which rules out deriving them from the theme; adding
four semantic tokens to `Tokens` for one element's stripe touches every theme, the theme editor
and the AI theme schema, and is rejected for now. Design: move the two lightness helpers that
compose already uses for the accent (`readableAccentOnDark` and its light inverse, both still
private to `compose.ts`) into `model/theme.ts` as an exported `readableOn(hex, "dark" | "light")`,
and let the callout pick the side from the tokens it is handed (`inkIsLight(theme)` means a dark
ground). Compose calls the same export. Test the helper in `model/__tests__` and the callout
stripe on a contrast band in `spec.test.ts`.

### C5. Positional composites heal on read (audit L8)

The `children` accessor returns the array raw (`faq.ts`, and `composite/shared.ts` for the
factory-built ones), and `faq`, `comparison`, `testimonial` and `pricing` index it by position; a
model rewrite with an odd count pairs a question with the next question. Design: each positional
composite normalises in its `children` accessor, the way `table.grid()` already does (faq drops an
unpaired trailing child, comparison and testimonial pad to their slot count with empty body
texts), and `withChildren` writes the normalised array back on the next edit. `checkSection` in
`services/core/ai/quality.ts` reports an odd faq as a warning so the trace shows the model did it.
Tests extend `canvas/elements/composite/__tests__/composite.test.ts`, which exists and covers the
arrange behaviour (faq pairing included) but not healing.

### Checklist

- [x] C1 flags on `ChartType`, masked `normalize`, sets deleted, test (landed; see above).
- [ ] C2 row captions, invariant case, gallery snapshot updated deliberately.
- [ ] C3 badge index, test.
- [ ] C4 `readableOn` exported from `@themes`, compose and callout on it, tests.
- [ ] C5 accessor normalisation for the four composites, quality warning, tests.

### Acceptance

`visual-invariants.test.ts` and `diagram.test.ts` (whose snapshot file carries the gallery) pass
with the matrix and hub snapshots updated once and reviewed; `eval:shots` moves only on the corpus
sections that hold a matrix, a hub or a callout on a band, and each change is inspected.

Size: S for C3, C4; S+ for C2 and C5.

---

## Phase D remainder: the section popup and the gesture half

Note (2026-09-05): the per-element decision on which controls sit on the bar, which in the panel
and which go is now [`control-distribution.md`](../executed/control-distribution.md), written from
a screenshot survey of every element. That work landed 2026-09-06 and carried most of this phase's
generic rows with it (recorded above). The section controls and the row-child gesture below are
what remain; the per-element bar and panel lists there win where the two disagree.

### The finding (re-verified 2026-09-07)

Stored fields still without a control: `Section.frame.aspect` (PDF import, the AI, templates
write it; nothing in the popup clears it), `SectionBackground.dark` (PPTX import), and
`ElementLayout.height` (the "fill" half; the data-height rows landed, but nothing writes
`layout.height`). The audit's U7 stands: `canAlign` in `editor/panels/ControlBars.tsx` still bails
for a row or grid parent, so a row child has no vertical self-alignment. U9 is half-done: rotation
now sits in the panel's Position block, but no palette command surfaces it. And
`ArtifactContent.voice` is now verified dead as an op: `setArtifactVoice` in
`canvas/elements/ops.ts` has zero callers, `EditorView` registers the voice shelf
(`onVoiceShelf`) but `shelfVoices` has no consumer, and `services/core/narration.ts` reads
`content.voice` server-side only; nothing in the product writes the field (only the generic shell
op could carry it in from a remote write).

### Design

- Alignment in a row: the bar's align group currently bails for a row parent because
  `alignSelf` is the cross axis. That is exactly the vertical control U7 asks for: in a row, show
  top, middle and bottom icons writing the same `layout.align`, and a "Fill height" toggle writing
  `layout.height: "fill"`. Column children keep the horizontal set. One field, two icon sets.
- A `Rotate` palette command pins if needed, opens the inspector and focuses the rotation row,
  which is the audit's U9 in one entry.
- Section popup: `SECTION_CONTROLS` gains `frame` and `bgContrast`. `frame` is a select whose
  options depend on the format, so the popup builds two lists the way it already filters
  `pinned` and `bleed` by profile: on a paged format Auto, 16:9, 4:3, 1:1, 9:16 (the slide's own
  shape); on a continuous one Auto, Hero 16:7, Tall 16:9, Slim 16:5 (a minimum band). Auto clears
  the field, which is the point: a person can undo what import or the AI wrote. Backed by a new
  `setSectionFrame(art, id, aspect | null)` in `ops.ts`. `bgContrast` is a segmented Auto, Light
  text, Dark text under Background, visible for colour, gradient and image, writing `dark`.
- Voice: delete `setArtifactVoice`, or wire the registered shelf into a real control; the
  verification above settles that nothing calls it today, so leaving it as-is is the one wrong
  answer.

Deliberate non-controls, recorded so they stop being re-raised: `tabs.active` (pressing a tab in
the editor commits the default, which is the control); diagram weights outside process (per-type
opt-in, `engine-gaps.md`); `ArtifactContent.page` (the formats plan); aspect resizes get no
slider, since a ratio is not a number a person reasons about, and the handle stays (the panel
Height row is what gave the phone its way to size charts and diagrams).

### Checklist

- [x] Generic Height row in `ElementInspector`, skipped when a same-key control exists (landed).
- [ ] Row-child alignment on the bar (vertical icons + Fill height), `layout.height` writer.
- [x] Dock toggle and "Position" heading (landed).
- [ ] `Rotate` command in `editor/core/commands.ts`.
- [x] Container `frame: true` + `gap` control; the arrange reads `d.gap ?? 14` (bare) and
      `d.gap ?? 12` (surfaced) (landed).
- [ ] `setSectionFrame` in `ops.ts`; `frame` and `bgContrast` in `SECTION_CONTROLS`; the popup's
      per-format option lists and reader/writer cases.
- [x] Embed resize function (landed).
- [ ] Voice: delete `setArtifactVoice` (or wire the shelf; decide at pickup).
- [ ] Analytics: a new control that a person can use is an event (`model/analytics.ts`);
      `section_frame_set` and `element_docked` are still absent, and the existing `text_clamped`
      pattern covers the rest.
- [ ] Tests: `ops.test.ts` for `setSectionFrame`; `commands.test.ts` for `Rotate`.

### Acceptance

Every field in the atlas's "no writer" list is either controllable from the panel or the popup, or
named above as deliberate. A section that arrived from a PDF at 4:3 can be returned to Auto.
`eval:shots` unchanged (defaults are absent everywhere).

Size: S+ (was M; the control half landed).

---

## Phase E: the catalog and the schema

### The finding (rewritten 2026-09-07; the original predated the generation-resource rebuild)

`services/core/ai/prompts/catalog.ts` is a second, hand-maintained description of the element
surface, and it has moved since the atlas: it now teaches the five resolvable media kinds (photo,
video, gif, illustration, sticker), the container's `shape`, `pin` and `dock` (`zElementLayout` in
`schema.ts` carries both, each with a full description), and `frame.aspect` on the section
(`zSection.frame` plus the site anatomy prose); a nested `avatar` inside two composites is now
deliberate, named in `NESTED_TYPES` and honoured by `quality.ts`.

What is still missing, each re-verified: no entry for `embed` or `shape`; `icon` is not teachable
by name (no `iconGlyphFor` exists); the container's `bg` control is untaught; `zElementLayout`
accepts `radius` that no prompt describes (zero mentions in the layout catalog); `zSection` still
strips `pinned` (which a docked nav needs) and `notes`; and the layout's `.catch(undefined)`
still drops a malformed layout with no trace.

`write-alt-text` is resolved by removal: the tool-catalog rebuild (`model/tools.ts`, one
`implement()` contract per tool) dropped it rather than implementing it, and `check:tools` now
fails a catalog entry without a body, so the original bodyless state cannot recur. Whether an
alt-text pass returns is a fresh decision, not a repair.

`replaceElement` and `setSectionBackground` still exist as patch ops in `model/ai.ts` with no
emitter; `revise-element` (`tools/element.ts`) and `reimage` (`tools/media.ts`) both emit a
whole-section `replaceSection`.

### Design

- Teach what phase B's guard names: `embed` (title, url), `shape` (kind, fill, stroke, strokeWidth,
  radius, height), and the container's `bg`. `icon` becomes teachable by name rather than by glyph
  body: a small `iconGlyphFor(name)` over `ICON_LIBRARY` lets the model write
  `{ kind: "icon", icon: "rocket" }` and the media element resolves it, the same vocabulary
  diagrams already use. `graphic` stays untaught, with the reason in `UNTAUGHT`.
- Describe `layout.radius` in the zod shape and the layout catalog, since it is now the universal
  frame control.
- `zSection` accepts `pinned` and the site anatomy teaches it beside `dock` ("the first section
  holds the docked nav and is pinned"). `notes` stays stripped on purpose, and the description says
  so: `write-speaker-notes` owns it.
- A dropped layout becomes visible: `checkSection` runs the layout schema without the catch and
  reports the failure as a quality warning that lands in the trace.
- Element-level ops in use: `revise-element`, `rewrite-passage` and the image path of `reimage`
  emit `replaceElement`; the background path of `reimage` emits `setSectionBackground`. The patches
  shrink, the undo title can name the element, and the store's narrowing produces a per-key `data`
  op for collaboration instead of a whole-section `set`. The chat rail's proposal labels
  (`ChatPanel.tsx`) learn the two op names; `applyContentOps` already applies them.
- Alt text: if wanted, it is a new catalog entry in `model/tools.ts` (write `alt` on the nth image
  through `replaceElement`, the `reimage` locator), priced and bodied like any other; every media
  element carries the field. Decide at pickup whether it earns its entry.

### Checklist

- [ ] Catalog entries for embed, shape, container bg, icon by name; `iconGlyphFor` in
      `canvas/elements/media/vector.ts` beside `ICON_LIBRARY`.
- [ ] `radius` described; `pinned` accepted and taught; `notes` description.
- [ ] Quality warning for a dropped layout.
- [ ] `replaceElement` / `setSectionBackground` emitted by the three tools; proposal labels.
- [ ] Alt text: decide, and if built, a full catalog entry through the one executor.
- [ ] Tests: `catalog.test.ts` (both files) for the new entries; `schema.test.ts` for `pinned`;
      `element-revise.test.ts` and `locate.test.ts` for the ops.
- [ ] `UNTAUGHT` in `check-elements.ts` shrinks to `graphic` and the variant aliases.

### Acceptance

`pnpm check:elements` passes with the reduced `UNTAUGHT`; a `revise-element` turn streams one
`replaceElement`; a generated site's first section arrives pinned with a docked nav; a malformed
layout shows in the trace as a warning rather than vanishing.

Size: M.

---

## Phase F: the docs

The current-state halves landed: `rendering.md` was brought back in line with the tree (sections 5
and 6 now carry the media merge, `visibleControls` and the full-data contract, the `hidden` flag,
72 registrations and 67 tiles) and the `AGENTS.md` tally is guard-checked by `check:elements`, so
it cannot rot again. What remains is the re-sweep that each open phase owes and the `ai.md` piece:

- [ ] Section 3: `SECTION_CONTROLS` as they are after phase D (bleed, pinned, frame, background
      with tones, contrast).
- [ ] Sections 5 and 6: whatever C and D move (row headers, the popup's frame select, the
      row-child alignment set).
- [ ] `ai.md`: the catalog after phase E, the element-level ops (blocked on E).
- [ ] Rewrite this file as a final-state record in `../executed/` once F lands, per the
      lifecycle in `../README.md`.

Size: S.

---

## Order and sizing

| Phase | What                                                                   | Size | Status / moves geometry        |
| ----- | ---------------------------------------------------------------------- | ---- | ------------------------------ |
| A     | inspector gating + coalesced typing                                    | S    | landed 2026-09-06              |
| B     | hidden set + `custom` landed; two-way guard, `width`, chart order open | S    | no                             |
| C     | C1 landed; matrix rows, hub badges, callout tones, composite healing   | S+   | matrix, hub, callout on a band |
| D     | control half landed; popup frame/contrast, row alignment, Rotate open  | S+   | no (defaults absent)           |
| E     | catalog entries, schema, element-level ops, alt-text decision          | M    | no                             |
| F     | current-state halves landed; ai.md + per-phase re-sweep open           | S    | no                             |

B before E because E is what makes B's `UNTAUGHT` list shrink, and the guard should be in place to
prove it. C and D are independent of each other and of E; D before E only because E teaches the
fields D makes controllable (`pinned`, `frame`). F last.

## Open questions

- Whether the container's `shape` enum survives now that `layout.radius` is the fine control, or
  becomes a migration onto `radius: 2` (the audit's convergence). This round keeps both; a later
  migration is cheap now that the control exists.
- ~~Which media kinds the image pipeline can actually resolve from a phrase~~ settled: the catalog
  teaches gif, illustration and sticker alongside photo and video; `icon` and `graphic` are the
  two still untaught, and E1 covers icon.
- The section frame presets per format in D. The four paged shapes match the formats plan's
  intended matrix; the three band heights are the numbers the site anatomy already teaches.
- Whether an alt-text tool should also run on the media picker's adopt path, where `alt` is empty
  by default. Out of scope here; note it in `media-storage.md` if the E entry is built.
