# Planning: the element surface round

> The implementation plan for what the element atlas found: the full inventory of configuration
> across the engine, the element specs, `ElementLayout` and the section, and the surfaces that
> control each option (the floating bar, the docked inspector, the canvas handles, the section
> popup, the AI catalog). The atlas was read from the working tree on 2026-09-03 and every finding
> below was re-verified on 2026-09-04; none had been fixed by the sibling work in flight (the media
> merge, the focal point, the thumb assets). Status: designed, not started.

Companion docs: `rendering.md` (the stated single reference for the element system, which this
round brings back in line with the code), `ai.md` (the catalog and the tools that write content),
`engine-audit.md` (its L and U series overlap this round in six places, named where they do; the
rest of that inventory stays where it is), `testing.md` (the mocking contract).

The shape of the round, in one line: one confirmed inspector bug, then the guards that keep the
registry, the palette and the catalog telling one story, then the element fixes, then a control for
every field an author can end up holding but cannot reach, then the catalog, then the docs.

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

## Phase A: the inspector reads the whole element

### The finding

`SchemaFields` in `editor/panels/SharedControlFields.tsx` evaluates every `visibleWhen` against a
snapshot built from the control keys alone (`Object.fromEntries(controls.map(c => [c.key,
read(c.key)]))`). The media element's seventeen controls all gate on `d.kind`
(`canvas/elements/media/element.ts`, twenty reads), and `kind` is not a control, so in the docked
panel it reads as undefined. The floating bar (`barFields` in `ControlBars.tsx`) filters against the
whole data bag and is correct. The panel is reached for every media kind, since zoom, focus, shape,
ring, radius, the player toggles, alt and adoptTheme sit off the bar.

What a person sees: a video shows Fit and hides its four Player toggles; a photo cannot switch to
Circle; an icon shows Source, Fit, Corner radius and Alt text while hiding its glyph and colour; a
graphic hides its SVG field and Match theme colors. Every other spec gates on a key that is itself a
control (`type`, `direction`, `surface`, `shape`, `bgKind`), which is why only media trips. The
constraint is known and relied on elsewhere: the data editor's config strip keeps `type` in its
list for exactly this reason, and the new focal-point test in `canvas/elements/__tests__/spec.test.ts`
evaluates `visibleWhen({ kind: "photo" })` over a full bag, which is the bar's semantics, so it
passes while the panel is wrong.

This predates the uncommitted diff; both halves are in HEAD.

### Options

Merge the data in the inspector only (`RightPanel` passes `{...data(), ...snapshot}`). Smallest
diff, but it leaves two definitions of what `visibleWhen` receives, and the section popup and the
data editor keep the narrower one.

Make `kind` a hidden control. Abuses the schema to carry a dependency, and a hidden control has to
be filtered out of every renderer.

Give the schema one gating predicate and one contract. `visibleWhen` receives the element's full
data, stated on `ControlField`, and every surface asks the same function which controls to show.
This is the one we take.

### Design

- `canvas/elements/spec.ts` exports `visibleControls(controls, data)` and the comment on
  `ControlField.visibleWhen` says it receives the element's full data, control keys included.
- `SchemaFields` takes an optional `data: () => Record<string, unknown>`; gating evaluates over
  `{ ...data(), ...snapshot }` so a control key still wins where an adapter (the section popup)
  flattens a structured value under a key of its own. `ElementInspector` passes the element's data.
  The section popup and the data editor keep their adapters and pass nothing new; their gating keys
  are control keys already, and the data editor's comment about keeping `type` can go.
- The bar's `barFields` calls `visibleControls` instead of its own filter, so the two surfaces
  cannot drift again.
- The audit's U2 rides along because it lives in the same two writer functions: the coalesce key
  the panel and the bar compute (`slider | color` only) extends to `text` and `number`, moved into
  one `coalesceFor(control, scope, key)` helper next to `Field`. Typing a button label becomes one
  undo entry; the store's 500ms idle window already closes the group.

### Checklist

- [ ] `visibleControls` + the contract comment in `spec.ts`.
- [ ] `SchemaFields` `data` prop; `ElementInspector` passes it; `barFields` uses the predicate.
- [ ] `coalesceFor` in `SharedControlFields.tsx`, used by the panel and the bar; the data editor's
      config strip already coalesces its own way and stays.
- [ ] Test in `canvas/elements/__tests__/spec.test.ts`: for `media` with each of the seven kinds,
      the visible key set through `visibleControls` is the intended set (video: src, fit hidden,
      the four player toggles, alt; icon: glyph, color only; graphic: doc, adoptTheme only; photo:
      src, fit, zoom, focus, shape, ring, radius, alt). The focal-point test switches to the
      predicate too.
- [ ] Test in `editor/core/__tests__/store.test.ts` or beside the existing coalesce coverage: two
      `commit` calls under the same `text` key fold into one history entry.

### Acceptance

Select a video: the panel shows Player controls and no Fit. Select an icon: glyph and colour, no
Source, no Alt. Select a photo: Shape offers Circle. Type ten characters into a button's Label:
one undo step. `eval:shots` unchanged; no geometry moves.

Size: S.

---

## Phase B: one registry truth, guarded both ways

### The findings

The palette's hidden set is declared twice and the two disagree: `editor/Editor.tsx` hides five
types (container, avatar, chart, diagram, media), `scripts/check-elements.ts` hides four, and the
tally that script self-checks in `AGENTS.md` says 62 palette elements where a person sees 61 (audit
L1). The registry has 66 registrations.

`check:elements` proves every catalog type is a registered spec and never the reverse (audit L10).
Today the model is not taught `embed`, `shape`, or the media kinds beyond photo and video, and the
catalog is a hand-written table whose keys nothing compares to the spec's controls; a control added
to a spec is invisible to the AI until someone remembers.

Two declarations are dead: the `custom` control kind has no renderer in `Field` and falls through
to a text input; `ResizeSpec.width` is set to `false` by `spacer` and the sized media branch and
read by nothing, since width is the divider system.

The chart Type dropdown lists renderers in registration order (`chart/render.ts` imports line
before column), while `CHART_TYPES` in `model/elements.ts` puts column third. The ids match, the
sequence does not; the diagram side matches exactly.

### Design

- `ElementSpec.hidden?: boolean` set by the five registrations, and `paletteElements()` in
  `spec.ts` beside `listElements()`. `Editor.tsx`, `PhoneChrome` and `check-elements.ts` read it;
  the script's own `HIDDEN` goes. The AGENTS.md tally becomes 61 with 9 composite; the script's
  drift check is what forces the two edits to land together.
- `check-elements.ts` gains the reverse direction: every palette spec is either named in
  `ELEMENTS` or listed in an `UNTAUGHT` map with a reason (the fifteen chart and sixteen diagram
  variants resolve to `chart` and `diagram`; the media variants resolve to `media`; `graphic`
  cannot be authored by a model). It also checks keys: every catalog field key is a control key of
  the spec, a key of `create()`, or on the entry's own allow-list (`children`, the table's legacy
  `data`, `poster`, `aspect`). The script already crosses the layer law on purpose; a vitest under
  `services/` could not import canvas.
- Remove `custom` from `ControlKind` and `width` from `ResizeSpec`, with the two writers. The
  compiler does the rest.
- Reorder the imports in `chart/render.ts` to `CHART_TYPES` order and strengthen the guard in
  `canvas/elements/chart/__tests__/chart.test.ts` from set equality to sequence equality, the way
  `diagram.test.ts` already pins it.

### Checklist

- [ ] `hidden` on the five specs; `paletteElements()`; three consumers switched; `AGENTS.md` tally.
- [ ] Reverse guard + key guard in `check-elements.ts`, with `UNTAUGHT` filled honestly (phase E
      shrinks it).
- [ ] `custom` and `ResizeSpec.width` removed.
- [ ] Chart registration order; sequence guard.

### Acceptance

`pnpm check:elements` reports 61 palette entries and passes; adding a control to a spec without
teaching it, or teaching a key no spec has, fails the guard with the key named.

Size: S.

---

## Phase C: element fixes

Each of these is a place where a label, a value set or a renderer promises something the code does
not do. They change pixels in narrow cases, so the diagram gallery snapshots and the visual
invariants run are part of the acceptance.

### C1. Chart capability bits live on the type entry (audit L7)

`chart/element.ts` keeps four hand-maintained sets (stacked, smooth, values, grid) that gate the
toggles, and `cartesianFrame` in `chart/utils.ts` reads `options.stacked` for every consumer, so a
column chart switched to a line keeps a summed y-axis until the hidden flag is cleared by hand.

Design: `ChartType` gains `stacked?`, `smooth?`, `values?`, `grid?`, `legend?` flags declared by
each renderer's `registerChart` call; the controls' `visibleWhen` read `getChart(type)`; `normalize`
masks each option by the type's flag so a stale value cannot reach a renderer. The four sets go.
Test: a `line` chart with `stacked: true` resolves `options.stacked === false` and its axis
maximum is the unstacked one.

### C2. The matrix honours its row headers

The `axes` field for a matrix is labelled "Headers (columns, then rows)" and the SWOT preset
supplies four entries, but `matrix.ts` reads only the first `ncol` as column captions. Design: the
next `nrow` entries caption the rows in a left gutter the arrange reserves only when they exist,
through the same `caption` leaf. The visual-invariants matrix gains a row-header case; the caption
clearance invariant already covers the geometry.

### C3. Hub spokes count from one

`hub.ts` badges spoke `s` with `badgeText(numbers, s + 1)`, the item index, so the first spoke
reads "2" or "B" while the centre carries no badge. The badge counts spokes: `badgeText(numbers,
s)`. Pin the first spoke's badge in `diagram.test.ts`.

### C4. Callout tones read on every ground

Six of the seven tones are fixed hex values (`callout.ts`, `toneColor`) and the section's contrast
swap cannot reach them, so a dark band gets a dark stripe. The hues are semantic and should not
follow the accent, which rules out deriving them from the theme; adding four semantic tokens to
`Tokens` for one element's stripe touches every theme, the theme editor and the AI theme schema,
and is rejected for now. Design: move the two lightness helpers that compose already uses for the
accent (`readableAccentOnDark` and its light inverse) into `model/theme.ts` as an exported
`readableOn(hex, "dark" | "light")`, and let the callout pick the side from the tokens it is handed
(`inkIsLight(theme)` means a dark ground). Compose calls the same export. Test the helper in
`model/__tests__` and the callout stripe on a contrast band in `spec.test.ts`.

### C5. Positional composites heal on read (audit L8)

The factory's `children` accessor returns the array raw, and `faq`, `comparison`, `testimonial`
and `pricing` index it by position; a model rewrite with an odd count pairs a question with the next
question. Design: each positional composite normalises in its `children` accessor, the way
`table.grid()` already does (faq drops an unpaired trailing child, comparison and testimonial pad
to their slot count with empty body texts), and `withChildren` writes the normalised array back on
the next edit. `checkSection` in `services/core/ai/quality.ts` reports an odd faq as a warning so
the trace shows the model did it. Tests beside the factory in
`canvas/elements/__tests__/composite.test.ts` (new, one topic).

### Checklist

- [ ] C1 flags on `ChartType`, masked `normalize`, sets deleted, test.
- [ ] C2 row captions, invariant case, gallery snapshot updated deliberately.
- [ ] C3 badge index, test.
- [ ] C4 `readableOn` exported from `@themes`, compose and callout on it, tests.
- [ ] C5 accessor normalisation for the four composites, quality warning, tests.

### Acceptance

`visual-invariants.test.ts` and `diagram-gallery.test.ts` pass with the matrix and hub snapshots
updated once and reviewed; `eval:shots` moves only on the corpus sections that hold a matrix, a hub
or a callout on a band, and each change is inspected.

Size: S for C1, C3, C4; S+ for C2 and C5.

---

## Phase D: a control for every authored field

### The finding

The atlas lists stored fields that only the AI, the importer or the authoring DSL can write, so a
person who receives one cannot see it, change it or clear it: `ElementLayout.dock` and
`ElementLayout.height` (AI only), `Section.frame.aspect` (PDF import, the AI, templates),
`SectionBackground.dark` (PPTX import), `embed.aspect` (nothing), the container's `gap` (the DSL).
Two more are reachable only by a handle the phone tier hides (`ResizeHandles` is desktop-only):
chart and diagram `height`, media `size` and `aspect`. The audit adds U7 (no vertical
self-alignment for a row child) and U9 (rotation is under Pin and nothing says so), and L6 (a
surfaced container has no fine radius).

Each field gets one of three answers: a control, a deliberate "the gesture is the control", or a
pointer to the plan that owns it.

### Design

Generic rows, derived from the spec the way the radius row is derived from `frame`:

- Height: `ElementInspector` appends a "Height" slider from `resizeOf(spec, data).height` (key,
  min, max, step) when the spec declares one and no control of that key exists (gradient and spacer
  carry their own). Charts, diagrams, shapes, icons and circle photos gain the control, and the
  phone gains its only way to size them. Aspect resizes get no slider; a ratio is not a number a
  person reasons about, and the handle stays.
- Alignment in a row: the bar's align group currently bails for a row parent because
  `alignSelf` is the cross axis. That is exactly the vertical control U7 asks for: in a row, show
  top, middle and bottom icons writing the same `layout.align`, and a "Fill height" toggle writing
  `layout.height: "fill"`. Column children keep the horizontal set. One field, two icon sets.
- Position block: the pin block gains "Dock to the section's top edge" for a direct child of the
  section root, offered on continuous formats and whenever the flag is already set (so an
  AI-written dock can be cleared on a deck), writing `layout.dock`. The block's heading becomes
  "Position", and a `Rotate` palette command pins if needed, opens the inspector and focuses the
  rotation row, which is the audit's U9 in one entry.
- Container: `frame: true` (the universal radius slider writes `layout.radius`, which
  `applyLayout` already lays over the arrange's own radius) and a "Gap" slider under Layout,
  absent by default so the arrange constants the merge proof depends on stay untouched. The
  `shape` enum stays as the coarse control; `layout.radius` overrides it when set. Media keeps its
  data radius (it is per picture and the AI writes it) and the button keeps its shape; the
  convergence the audit asks for stops at the container in this round.
- Section popup: `SECTION_CONTROLS` gains `frame` and `bgContrast`. `frame` is a select whose
  options depend on the format, so the popup builds two lists the way it already filters
  `pinned` and `bleed` by profile: on a paged format Auto, 16:9, 4:3, 1:1, 9:16 (the slide's own
  shape); on a continuous one Auto, Hero 16:7, Tall 16:9, Slim 16:5 (a minimum band). Auto clears
  the field, which is the point: a person can undo what import or the AI wrote. Backed by a new
  `setSectionFrame(art, id, aspect | null)` in `ops.ts`. `bgContrast` is a segmented Auto, Light
  text, Dark text under Background, visible for colour, gradient and image, writing `dark`.
- Embed: `resize: (d) => isEmbedVideoUrl(d.url) ? { aspect: { min: 0.75, max: 2.6 } } :
undefined`, the function form media already uses.

Deliberate non-controls, recorded so they stop being re-raised: `tabs.active` (pressing a tab in
the editor commits the default, which is the control); diagram weights outside process (per-type
opt-in, `engine-gaps.md`); `ArtifactContent.page` (the formats plan); `ArtifactContent.voice`,
where the atlas found no caller of `setArtifactVoice` at all: verify whether the narration surface
writes the field through the API directly, and if nothing does, the op is dead and goes.

### Checklist

- [ ] Generic Height row in `ElementInspector`, skipped when a same-key control exists.
- [ ] Row-child alignment on the bar (vertical icons + Fill height), `layout.height` writer.
- [ ] Dock toggle, "Position" heading, `Rotate` command in `editor/core/commands.ts`.
- [ ] Container `frame: true` + `gap` control; the arrange reads `d.gap ?? 14` (bare) and
      `d.gap ?? 12` (surfaced).
- [ ] `setSectionFrame` in `ops.ts`; `frame` and `bgContrast` in `SECTION_CONTROLS`; the popup's
      per-format option lists and reader/writer cases.
- [ ] Embed resize function.
- [ ] Voice: verify, then wire or delete.
- [ ] Analytics: a new control that a person can use is an event (`model/analytics.ts`);
      `section_frame_set`, `element_docked`, and the existing `text_clamped` pattern for the rest.
- [ ] Tests: `ops.test.ts` for `setSectionFrame`; `spec.test.ts` for the embed resize and the
      container gap; `commands.test.ts` for `Rotate`.

### Acceptance

Every field in the atlas's "no writer" list is either controllable from the panel or the popup, or
named above as deliberate. On a phone a chart's height can be changed. A section that arrived from
a PDF at 4:3 can be returned to Auto. `eval:shots` unchanged (defaults are absent everywhere).

Size: M.

---

## Phase E: the catalog and the schema

### The finding

`services/core/ai/prompts/catalog.ts` is a second, hand-maintained description of the element
surface. It omits `embed`, `shape`, the media kinds beyond photo and video, and the container's
`bg` and `shape`; it teaches a standalone `avatar` inside two composites; `zElementLayout` in
`schema.ts` accepts `radius` that no prompt describes; `zSection` is a plain object and strips
`pinned` (which a docked nav needs) and `notes`; the layout's `.catch(undefined)` drops a malformed
layout with no trace. `write-alt-text` is in `TOOLS` with no `TOOL_SPEC` entry and no body, and
`check:tools` does not flag it, which itself needs explaining. `replaceElement` and
`setSectionBackground` exist as patch ops in `model/ai.ts` with no emitter; every element-level
change travels as a whole section.

### Design

- Teach what phase B's guard names: `embed` (title, url), `shape` (kind, fill, stroke, strokeWidth,
  radius, height), container `bg` and `shape`, and the media kinds whose `src` phrase the image
  pipeline can resolve. `icon` becomes teachable by name rather than by glyph body: a small
  `iconGlyphFor(name)` over `ICON_LIBRARY` lets the model write `{ kind: "icon", icon: "rocket" }`
  and the media element resolves it, the same vocabulary diagrams already use. `graphic` stays
  untaught, with the reason in `UNTAUGHT`.
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
- `write-alt-text`: find out why the tool guard passes, then implement it as the small thing it is
  (write `alt` on the nth image through `replaceElement`, the `reimage` locator) rather than remove
  it; every media element carries the field.

### Checklist

- [ ] Catalog entries for embed, shape, container bg and shape, the resolvable media kinds, icon by
      name; `iconGlyphFor` in `canvas/elements/media/vector.ts` beside `ICON_LIBRARY`.
- [ ] `radius` described; `pinned` accepted and taught; `notes` description.
- [ ] Quality warning for a dropped layout.
- [ ] `replaceElement` / `setSectionBackground` emitted by the three tools; proposal labels.
- [ ] `write-alt-text` explained, then built; `check:tools` made to catch the next one.
- [ ] Tests: `catalog.test.ts` (both files) for the new entries; `schema.test.ts` for `pinned`;
      `element-revise.test.ts` and `locate.test.ts` for the ops; `check-tools` self-test.
- [ ] `UNTAUGHT` in `check-elements.ts` shrinks to `graphic` and the variant aliases.

### Acceptance

`pnpm check:elements` passes with the reduced `UNTAUGHT`; a `revise-element` turn streams one
`replaceElement`; a generated site's first section arrives pinned with a docked nav; a malformed
layout shows in the trace as a warning rather than vanishing.

Size: M.

---

## Phase F: the docs

`rendering.md` sections 5 and 6 describe the tree before the media merge: separate picture
elements, 65 types, four hidden types, no `inlineText`, `labelFor`, `live` or `hidden`, section
controls without `pinned` and the three tones, framed editing called deferred although "Frame
sections as slides" shipped as a view toggle. The atlas is the current-state text; this phase
moves it into the doc that owns the area, per `README.md`.

- [ ] Section 2: the focal point on `ImageLeaf`; the thumb.
- [ ] Section 3: `SECTION_CONTROLS` as they are after phase D (bleed, pinned, frame, background
      with tones, contrast); the slide-frame view toggle in 3.3.
- [ ] Section 5: the spec fields table with every field and what it lights up; `visibleControls`
      and the full-data contract; 5.1 with one media element under nine names and `shape` in
      `media/vector.ts`; 5.2 with 66 registrations and 61 tiles; 5.3 with the value sets added
      since (`MEDIA_KINDS`, `MEDIA_SHAPES`, `SHAPE_KINDS`, `FAQ_COLLAPSE`, `POPUP_VARIANTS`,
      `FLEX_JUSTIFY`).
- [ ] Section 6: the bar's assembly order, the panel's composition (schema rows, then the generic
      rows: radius, height, span, position), the routing rule and the per-element routing table,
      the phone housing, and the on-canvas handles as they are.
- [ ] `AGENTS.md`: the tally and the media sentence in "Current state".
- [ ] `ai.md`: the catalog after phase E, the element-level ops.
- [ ] Delete this file once F lands, per the planning lifecycle in `README.md`.

Size: S.

---

## Order and sizing

| Phase | What                                                                                                       | Size | Moves geometry                 |
| ----- | ---------------------------------------------------------------------------------------------------------- | ---- | ------------------------------ |
| A     | inspector gating + coalesced typing                                                                        | S    | no                             |
| B     | hidden set, two-way guard, dead declarations, chart order                                                  | S    | no                             |
| C     | chart flags, matrix rows, hub badges, callout tones, composite healing                                     | S+   | matrix, hub, callout on a band |
| D     | generic height and alignment rows, dock, container frame and gap, section frame and contrast, embed aspect | M    | no (defaults absent)           |
| E     | catalog entries, schema, element-level ops, alt text                                                       | M    | no                             |
| F     | docs                                                                                                       | S    | no                             |

A before B because the guard in B pins the contract A introduces. B before E because E is what
makes B's `UNTAUGHT` list shrink, and the guard should be in place to prove it. C and D are
independent of each other and of E; D before E only because E teaches the fields D makes
controllable (`radius`, `pinned`, `dock`). F last.

## Open questions

- Whether the container's `shape` enum survives once `layout.radius` is the fine control, or
  becomes a migration onto `radius: 2` (the audit's convergence). This round keeps both; a later
  migration is cheap once the control exists.
- Which media kinds the image pipeline can actually resolve from a phrase (gif, illustration,
  sticker), which decides how much of E1 is teachable today. Check `services/core/ai/tools/media.ts`
  before writing the entries.
- The section frame presets per format in D. The four paged shapes match the formats plan's
  intended matrix; the three band heights are the numbers the site anatomy already teaches.
- Whether `write-alt-text` should also run on the media picker's adopt path, where `alt` is empty
  by default. Out of scope here; note it in `media-storage.md` if it is wanted.
