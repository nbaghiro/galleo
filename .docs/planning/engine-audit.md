# Planning — engine audit, 2026-09-02

> A current-state review of the Clay-style layout engine and everything that stands on it: the
> solver, the node model, measurement, the element system, the editor's interaction surface, and
> the rendering/loading paths. Where [`engine-gaps.md`](engine-gaps.md) inventoried mechanisms the
> engine _lacks_, this audits what _exists_ and does not fit. Method: four parallel deep-read
> sweeps (engine core, element system, editor interaction, performance), their findings graded
> against the code; every entry below carries file:line evidence that was re-checked, and a ✔ marks
> a bug proven by an executed failing test rather than by reading. Status: inventory, nothing here
> is scheduled.

Companion docs: `rendering.md` (stale in places — see E2), `engine-gaps.md`, `loading.md`,
`container-merge.md`.

Note on the working tree: the media merge (eight picture elements folded into one `media` type) is
in flight in a sibling session. Findings marked **[media-merge]** land on that work and should be
checked against it before anyone acts.

## How to read an entry

Claim — evidence — why it matters — direction — size (XS/S/M/L). Ordered by severity inside each
section. "Direction" is one sentence, not a design.

---

# Verified bugs

The correctness list: each of these misbehaved on a shipped path when audited. **All eleven fixed
2026-09-02 — the round is recorded in [`engine-bugs.md`](engine-bugs.md), each fix pinned by a
test that was run red first.**

**B1 ✔ The measure cache poisons paint-only run attributes.** `measureKey`
(`canvas/render/commands.ts:744`) keys on the metric-affecting run fields only (bold/italic/code +
text), but the cached `Measured.lines[].frags[]` carry `color`, `highlight`, `link`, `underline`,
`strike` from whichever leaf was measured first. Two texts identical in metrics but different in a
paint-only mark collide, and the second paints with the first's attributes; sharper, toggling
underline/strike/highlight/color on existing text does not change the key at all, so the canvas
can keep painting the stale decoration until the cache is cleared (font load) or evicted. Proven
by an executed test: two leaves differing only in run color, the second returned the first's
frags. Direction: fold the paint-only run attrs into the key (cheap, slight cache dilution), or
strip paint attrs from the cached lines and re-derive at emit. Size: S.

**B2 The cover-fit fallback returns a mutated node; a stacked photo vanishes from paginated
output.** `coverFitMedia` mutates the composed tree in place (aspect stripped, media and cell
`h = grow()` — `commands.ts:180-186`) before the solve commits; when the solve is skipped or
fails, `prepareSlideNode` falls through (`commands.ts:354→367`) returning the mutated node without
the grow-promotion the success branches apply. In a column flow the media is then a min-less grow
child of a fit column → height 0: the photo disappears from Present/export of a tall media
section. Tests pin only the success paths. Direction: recompose clean on the fall-through, or
mutate a clone. Size: M consequence, S fix.

**B3 A pinned fill-height element makes its section ~100000px tall.** Floats resolve heights
against `contentH`, which for a fit-height parent derives from `assignedH`
(`canvas/engine/layout.ts:306-308`) — at a section root, the 100000 sentinel. The flow path is
guarded against exactly this (`layout.ts:374-380`); the float calls (`:343`, `:385`) are not. The
combination is authorable: the AI writes `height: "fill"`, pinning is one gesture, and
`pinnedLayout` strips `width: "fill"` but not height (`editor/core/pin.ts:181,186`). Direction:
resolve float heights against the parent's resolved height, or strip fill-height on pin like
width. Size: S.

**B4 `fragment` loses paint order across page breaks.** Pages are built by iterating the y-sorted
copy (`layout.ts:732`, `:779-791`), but emit order IS z-order (negative-z decoration under flow
under overlays). After the sort, a decoration whose top edge sits below overlapping flow content
paints over it on any paginated tall section (Present, PDF/PPTX export). Direction: keep the
sorted copy for break-finding, build pages by filtering the original order. Size: S.

**B5 Rotated commands paginate by their flat box.** `fragment`'s inclusion and split tests use
`c.box` (`layout.ts:745,751,781`) while `lowest()` (`commands.ts:47-62`) exists because a turned
extent differs: a rotated element can lose its dipping corner at a page seam or be judged unsplit
while visibly split. Direction: reuse the rotated-AABB corner math in the crossing tests. Size: S.

**B6 `replaceAt` discards the target column's width.** Dropping into an empty column goes through
`replaceAt` (`editor/core/dnd.ts:663` → `canvas/elements/ops.ts:276-282`), which swaps the
instance wholesale: the placeholder's `layout.width` is lost, the incoming element's stale width
kept, and a 60/40 split silently resets to even (`rowShares` is all-or-even). This violates the
row-width invariant `insertChild` itself states. Direction: preserve the target's width and strip
the newcomer's in `replaceAt`. Size: S.

**B7 Editing any table cell silently resets the author's line clamp.** `table.container
.withChildren` rebuilds every data field except `clamp` (`canvas/elements/table/table.ts:187-198`),
and every in-table edit funnels through it. Direction: carry `clamp` through. Size: XS.

**B8 [media-merge] The media-bleed section preset is dead for saved artifacts.** `imageSrc` keys on
`inst.type === "image"` (`canvas/elements/layouts.ts:67`) while the write path normalizes every
picture to `type: "media"`; the preset never applies and its transform finds no image. Same
family: `sectionsOf` (`model/artifact.ts:1252-1259`) misses `media`, so post-merge sections digest
as `"content"` (wrong loading placeholders and library kind chips). Direction: read kind through
`mediaKindOf`. Size: XS each.

**B9 [media-merge] A stored icon loses its format bar and is titled "Image".** The merged media
spec's `get bar()` and `label` close over the _registered_ variant's kind
(`canvas/elements/media/element.ts:385-393,419-421`), not `data.kind`; after normalization to
`type:"media"`, `visibleWhen` hides the photo keys and the bar comes up empty, the inspector says
"Image" for icons/videos/graphics. `resize`/`live` already read `data.kind`. Direction: make
`bar`/`label` functions of data, like `resize`. Size: S.

**B10 The Shape element offers "Diamond", which the renderer cannot draw.** `SHAPE_KINDS` lists it
(`canvas/elements/media/vector.ts:864`) with no branch in `shapeVector`; picking it paints
nothing. Meanwhile `star` is drawable but unofferable. No value-set exists in `model/elements.ts`
for shape kinds, so no guard could catch it. Direction: add the value-set + the missing branch.
Size: XS.

**B11 A line-boundary page cut can slice a second crossing paragraph off its own grid.** The
chosen break `ly` is validated only for line-count on other crossing text (`layout.ts:763-768`),
never for lying on the other paragraph's grid; side-by-side columns with different line phases can
lose half a line to the page clip and be left with a widow. Narrow trigger, real edge. Direction:
validate `ly` per crossing command (on-grid, cut within [KEEP, count−KEEP]). Size: S.

---

# Engine misfits (solver · node model · measurement)

**E1 Three grow-height protocols, one per direction.** Grid measures grow members fit-first then
stretches to the row (`layout.ts:318-329`); a fit-height row of only grow children collapses to
their mins (`:346-357`); a column gives grow its distribute share. The same author intent answers
differently by direction, and the row-collapse workaround lives in the LLM prompt
(`catalog.ts:662`) rather than the engine. Direction: adopt the grid's fit-first measure for the
all-grow fit row (a behavior change; `crossfill.test.ts` pins the neighboring case). Size: S.

**E2 Grid ignores `alignX` and `distribute`.** The grid positions branch applies no main-axis
offset (`layout.ts:443-466`); both fields silently no-op under `direction:"grid"` — a half-honored
node field an element author discovers empirically. Direction: apply `alignX` to the track block,
or document the limit on `EngineNode.direction`. Size: XS-S.

**E3 The render bridge patches solver output by mutation.** Three post-passes rewrite solved or
composed trees in place: the section-ground stretch (`commands.ts:80-88`), `coverFitMedia` (B2),
`centreInFrame` (`:233-237`); `coverFitMedia` also recognizes content cells by sniffing
`id?.startsWith("el:")`, string-coupling the bridge to compose's region-id grammar. B2 is the
escaped consequence. Direction: contain mutations to the branch that commits to them. Size: S.

**E4 Node leaf co-existence is typed free-for-all, documented "one leaf", honored three ways.**
`intrinsicWidth` prefers text over children (`layout.ts:132`), the height pass prefers children
over text (`:297` — the text still paints, with no room reserved), `firstBaseline` prefers text.
Direction: state the precedence on `EngineNode`, or assert leaves are leaves. Size: S.

**E5 Small measurement debts.** The run serialization in `measureKey` concatenates flags+text with
no delimiter (`commands.ts:747-751`) — theoretical collisions; `intrinsicWidth` is O(n·depth)
unmemoized for fit chains (`layout.ts:131-156`) — latent, multiplied by autofit probes;
`layoutRuns` measures every word twice on a cache miss (`:641-645` then `:572-574`). Direction:
delimit the key; per-run WeakMap memo; carry box widths into frags. Size: XS each.

**E6 `layoutSection` counts clipped-away phantom height.** `bottom()` ignores `c.clip`, so content
clipped by a bounded column still stretches the section ground and leaves trailing whitespace
(`commands.ts:47-65,82-88`). Size: XS-S.

**E7 Field promises the paint doesn't keep.** `image.natural.h` is never read (fit-height images
collapse; use `aspect`); `FillLeaf.shadow` paints in the DOM backend only, acknowledged in a pptx
comment rather than on the field; regions ignore clip, so hover can land on invisible pixels.
Direction: one-line docs on the fields; decide the region-clip semantics and pin it. Size: XS.

**E8 The compose-scale formula is mirrored in pin math.** `compose.ts:506` and
`editor/core/pin.ts:102` both compute `rampScale × fitScale`; a third factor added to one drifts
the other silently, no test ties them. Direction: export one `composeScale()` from
`@engine/profile`. Size: XS.

---

# Element system

**L1 The two `HIDDEN` lists disagree, and the guarded palette tally counts a hidden element.**
`scripts/check-elements.ts:66` hides four types; `editor/Editor.tsx:695` also hides `container` —
the enforced "62 palette elements" overstates the real 61 and the guard verifies the wrong set.
Direction: one exported HIDDEN set (or `ElementSpec.hidden`). Size: XS.

**L2 `.docs/rendering.md` §5.1-5.2 describes the pre-merge element world** (separate picture
elements, 65 types, group/card unregistered). Doc-only, but it is the stated single reference.
Size: S.

**L3 The `group`/`card` legacy aliases mean two different things.** Compose honors them as rows
(`compose.ts:220` STACK_TYPES) while ops' `isRow`/`isGrid` and layouts' `flatten` test
`type === "container"` only — a legacy tree renders as a row but width renormalization and layout
presets treat it as a leaf. The prompt still teaches "group / card" (`prompts/generate.ts:350`).
Direction: normalize on read (the `withMediaKinds` precedent) and collapse the special cases, or
declare the alias render-only and fix the prompt. Size: S.

**L4 One element three times.** `stat`, `quote`, `feature` are the identical unit column stack
differing only in gap, kept apart because the `composite()` factory hardcodes category and
`closed` (`composite/shared.ts:47-57`). Direction: give the factory those options and fold them
in. Size: S.

**L5 Recurring compose patterns, hand-rolled.** The children-compose walk exists 9× (each
`children.map(inst => getElement(...)?.layout(...) ?? fallback)`, fallback height drifting); the
theme panel shell (surface fill + hairline + radius) 8× with 7 radius formulas; the chevron
painter twice with drifted constants; direction-of-a-container is read 4 ways (`rowShares`,
`isRow`, `dirOf`, `groupAxis`) with L3 living in their gaps. Direction: `layoutChildren()`,
`panelFill()`, `directionOf()` — three helpers, each replacing ≥3 sites. Size: S.

**L6 Corner radius lives in three regimes.** `frame:true` → the universal layout slider (four
elements); media → its own `data.radius`; container/button → a `shape` enum, with a surfaced
container having no fine radius control at all — the editor sweep hit the same wall from the user
side. Direction: converge on `frame`, starting with container. Size: S.

**L7 Capability bits split between hardcoded sets and the registry.** Chart keeps
STACKED/SMOOTH/VALUES/GRID_TYPES sets in `element.ts` while diagram carries flags on
`DiagramType` — and also keeps two sets. Adding a chart type means editing two files. Direction:
move capability bits onto the type entries. Size: S.

**L8 Positional-children composites are sealed against dnd but open to the AI.** testimonial /
comparison / faq / diagram index children by position; nothing stops an AI regenerate writing an
odd count, after which faq pairs a question with the next question. Direction: a shape guard at
the one entry point AI-written composites pass. Size: S.

**L9 Registration hygiene.** `walkElements` is dead and raw-reads children (misses owned cells);
`previews.ts` keeps `card:`/`group:` tiles nothing can request; the media LEGACY_TYPES aliases are
currently shadowed by live registrations; `tier:"primitive"` is read nowhere; `fallback` is
declared twice as identity and walked on every export for nothing; `bullets.ts` imports
`LINE_HEIGHT_FACTOR` from the render bridge above it. Direction: sweep. Size: XS each.

**L10 A new element can be forgotten silently in two places.** The register-manifest import and
the palette preview both fail silent; `check:elements` asserts catalog ⊆ registry but not the
reverse, and can't tell a deliberately-untaught element from an oversight. Direction: extend
`check:elements` (every `register(` caller reachable from register.ts; every non-hidden spec has a
non-fallback preview). Size: S.

---

# Editor interaction

**U1 A bullets list can never gain or lose an item by direct manipulation.** Delete/duplicate are
gated by `movable`, foreign drops rejected, paste re-anchors outside, and Enter ends editing
(`TextEditor.tsx:215-218`). A three-point list is stuck at three points. Direction:
Enter-splits-item / Backspace-at-start-merges inside the unit. Size: M.

**U2 Inspector and bar text/number fields commit one undo entry per keystroke.** Both writers
coalesce only `slider|color` (`RightPanel.tsx:76-79`, `ControlBars.tsx:111-114`); typing a button
label costs ~10 undo steps and room batches, where canvas typing costs one. Direction: extend the
coalesce key to `text`/`number`. Size: S.

**U3 The two insert surfaces have opposite gestures and neither supports the other.** Palette
tiles are drag-only (a click flashes a ghost and drops nothing, `Insert.tsx:137-145`); the
empty-region quick picker is click-only and hardcodes 10 types with no search. Direction: click on
a palette tile inserts at selection; reuse the searchable palette in the quick popover. Size: S+S.

**U4 The section padding ring is a dead zone for element drops.** Gap hitboxes stop at the root
container's box; only an empty root extends to the section card (`dnd.ts:449-452`) — a drop in a
populated section's padding does nothing, indicator gone. Direction: extend the root's first/last
gap hitboxes to the card, as the empty case already does. Size: S.

**U5 Wrap-beside exists only at the section root.** "Place this beside that" for a nested leaf is
group-then-flip-direction, two non-obvious steps, though `wrapWith` already takes any path
(`ops.ts:389-390`). Direction: edge wrap slots on non-root leaves. Size: M.

**U6 Column boundary bands outrank every nested gap within 24px** (`dnd.ts:315,620`) — honest
indicator, grabby feel. Direction: shrink `EDGE` when a deeper slot's hitbox overlaps. Size: S.

**U7 Width and vertical alignment have no control surface where they're most needed.** A lone
element in a column can't be made 60% wide (dividers need ≥2 siblings); row children have no
vertical self-alignment control (`canAlign` bails for row parents, `ControlBars.tsx:127-131`), the
only knob moving all children at once. Size: M+S.

**U8 No marquee selection**; multi-select is shift-click only and does not exist on phones. A
non-conforming grip grab silently collapses the set to a single drag (`Selection.tsx:240-246`).
Direction: rubber-band over the stage; a cue on collapse. Size: M+XS.

**U9 Rotation/layer live on Pin and nothing says so** — a user hunting "rotate" won't find
Pin → Rotation. Direction: a palette command or inspector copy. Size: XS.

**U10 Small asymmetries.** Copy works on sealed children but cut/paste don't (`commands.ts:214-223`);
multi-select block moves are confined to their parent with no hint why targets vanished;
`ungroupAt` gates on tier and so accepts `popup`, splicing its panel out and dropping the trigger
(`ops.ts:411`). Size: XS each.

---

# Performance

**Measured 2026-09-02** (Node + happy-dom, real measure machinery, the 7 corpus artifacts; a
follow-up quantification of the entries below): layout is essentially free — warm glyph calls are
zero, layout-everything at 200 sections is ~18ms, a keystroke's _layout_ share is 0.04ms, present's
worst slide advance at N=60 is 3.8ms, ghosts are 1.3ms at 200 pending, the measure cache reaches
~2.7k of its 6k cap in a heavy session. The costs that survive measurement are DOM and bytes:
**P4** (512KB pdf-lib parsed eagerly, the largest single number), **P7** (tiles fetch editor-grade
assets, the only network-side item), **P2** (the minimap's unbounded second DOM copy, ~216ms
cumulative build and ~3,750 retained nodes at 200 sections), **P1's Thumb teardown** (~1.3ms DOM
rebuild per keystroke where a reconcile would be ~0.07ms), and **P5** (promoted: publish keeps
_wrong_ fallback-metric layouts all session, a correctness item). P3/P6/P8 and the resize case are
demoted to hygiene — worth doing only when touching those files. The entries below keep the
original evidence.

**All eight fixed 2026-09-03**, in the round recorded in [`perf-round.md`](perf-round.md), which
also carries what each phase deviated from as planned. Two pieces are deliberately left: the inline
editor's third compose under P1, and the AI adopt path under P7.

**P1 (Thumb half) ✔ A keystroke costs three composes and 2-3 layouts of the edited section.** The
stack repaints once (per-section cache holds), but the minimap Thumb re-lays-out and teardown-repaints
(`Canvas.tsx:1057-1086`), and the inline editor overlay re-composes a third time
(`leaf.ts:101-118`); slide mode adds natural/collapsed probes even under `fitFreeze`. Direction:
reconcile or debounce the Thumb while editing; memo the composed node per (section, width, theme).
Size: S. **Fixed** (`perf-round.md` B1): the minimap repaints through the exported `paintReconcile`
instead of tearing its subtree down. The overlay's third compose is untouched.

**P2 ✔ The minimap paints everything it has seen, forever.** Thumbs latch `seen` and never evict
(`Canvas.tsx:1040-1055`): a 200-section doc accumulates a second full DOM copy of itself in the
rail. Direction: window the rail like the stack. Size: M. **Fixed** (`perf-round.md` B2): the rail
windows on two IntersectionObservers, painting in at 300px and releasing the subtree at 1500px.

**P3 ✔ Placeholder ghosts lay out on every stack repaint, cache hit or not.**
`opts.placeholder?.(section, layoutW)` runs before the reuse check (`backends.ts:1050`) — one
discarded engine layout per pending section per scroll repaint. Direction: cheap boolean for the
key, lay out on miss. Size: S. **Fixed** (`perf-round.md` E): a `pending` predicate keys the cache
and the ghost lays out only on a miss.

**P4 ✔ pdf-lib (~512KB pre-gzip) rides the main app bundle eagerly.** `export.ts:4-15` imports it
statically, ExportModal statically imported by Editor; pptxgenjs/jszip/wawoff2/fontkit are already
dynamic. Direction: `await import("pdf-lib")` in the export entries, matching the other four.
Size: S. **Fixed** (`perf-round.md` A): `loadPdfLib()` in `pdf-draw.ts`; the app entry dropped
420 KB (175 KB gzip).

**P5 ✔ Non-editor surfaces keep fallback-font layouts for the session.** Only the measure cache and
the editor/ThemeEditor stacks invalidate on `fonts.loadingdone`; publish, present, previews,
tiles, minimap keep stale wrap solved against fallback metrics — on publish this is first-load
wrap drift. Direction: a shared fonts-settled generation folded into the stack cache key. Size: S.
**Fixed** (`perf-round.md` C): `ui/fonts.ts` carries the settled generation, and each of those
surfaces reads it inside the paint effect it already owns.

**P6 ✔ Present costs that stack up.** Advancing slides recounts every prior section from scratch
(O(N²) over a run-through, `ui/present.tsx:147-154,577`); the overview lays out every section
eagerly on open; ExportModal lays out the whole deck to count pages. Direction: per-section count
memo keyed on identity. Size: S. **Fixed** (`perf-round.md` E): `sectionSlideCount` memoizes on
section, tokens and profile identity, and all three consumers read the one memo.

**P7 ✔ (picked media) Scaled surfaces fetch the full-size asset.** `thumbUrl` never reaches a
RenderCommand; a 176px library tile decodes the same photo the editor does. Direction: carry
`thumbUrl` in media data and pick by painted scale. Size: M. **Fixed** (`perf-round.md` D):
`MediaData.thumbSrc` reaches `ImageLeaf.thumb` and a small surface paints with `assets: "thumb"`.
The AI adopt path is deferred there, so an AI-sourced picture still paints its full asset.

**P8 ✔ Small fixed overheads per draw.** `openPopups()` walks the whole artifact with per-node
`getElementAt` before its early return (`Canvas.tsx:205-207`); `paintSectionStack` ends in
`host.replaceChildren` even when membership didn't change (`backends.ts:1153`); measure-cache
eviction is FIFO not LRU, so a multi-width session can evict hot editor entries in a burst.
Size: XS-S each. **Fixed** (`perf-round.md` B3 + E): all three, as a memoized `openPopups`, a
skipped `replaceChildren` when membership and order hold, and LRU eviction.

---

# Do not touch

Load-bearing designs every fix above must survive, merged from all four sweeps:

1. **One injected, memoized measurement path** — emit deliberately re-reads the cache rather than
   storing lines on nodes; the font-reload flush and editor/export fidelity both hang on it.
2. **Section-identity caches over immutable ops** — one keystroke re-lays-out one section;
   anything that clones untouched sections on write breaks paint, autosave, and undo at once.
3. **The frozen-document drag** — slots enumerated once from captured regions, no reflow
   mid-gesture, one mutation at drop with path re-aiming.
4. **The `movable`/`unitItem`/`movableAncestor` seal and the tier/closed contract triangle** — one
   predicate gates drag, delete, duplicate, cut, paste anchoring, and the grip's aim.
5. **The region-id join** — every overlay positions purely from engine Regions keyed by path ids;
   no overlay measures the DOM; path index symmetry across compose/ops/blueprint/popup.
6. **Paint-only rotation with a shared outer pivot** — solve flat, spin at paint, polygon regions;
   four consumers depend on it at once.
7. **The one `distribute()` solver** serving row widths, column heights, and grid tracks, plus the
   fit-column grow guard against the height sentinel and the spanner never-sizes-tracks rule.
8. **`profileFor`/`scaleTokens`/`resolveTheme` identity guarantees** — the paint caches compare by
   reference.
9. **Layout-everything, materialize-the-window** — with paint following the finger and fetch
   following the eye on two clocks.
10. **`fitFreeze` during inline edits** — type must not resize under the caret.
11. **The container arrange constants** (gap 14/no-pad vs gap 12/pad 24) — the merge's
    layout-neutrality proof depends on them.

---

# Priorities

Correctness first, then the fixes that pay on every session:

1. **B1** measure-cache mark poisoning (proven; user-visible on mark edits).
2. **B2 + B3 + B4** the three engine correctness bugs on shipped paths (vanishing media, sentinel
   sections, page-break z-order) — none pinned by a test today; pin then fix.
3. **B6-B10** the small verified bugs: replaceAt width, table clamp, media-bleed preset + digest
   kinds, media bar/label ([media-merge] — coordinate), Diamond.
4. **U2** per-keystroke undo, **P3** ghost layouts, **P4** pdf-lib — three S-sized wins with
   session-wide payoff.
5. **U1/U3/U4** the interaction gaps a first-session user hits (bullets, palette click, padding
   dead zone).
6. The L-series cleanups batched as one hygiene round (HIDDEN, aliases, factory fold, three
   helpers, guard extension), since each is small and they touch the same files.
7. **P2/P5/P6/P7** the loading round (minimap window, fonts-settled generation, present memo,
   thumb assets), best done together against `loading.md`'s measured table.
