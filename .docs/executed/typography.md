# Typography: line boxes, font metrics, truncation

> The engine returns the line geometry it computes instead of discarding it, `Measured` knows what
> a font actually is, and a text node can say "at most two lines". Every engine change is generic —
> a capability of the measure path and the command stream, never a feature hard-coded for one
> element. This record covers items 2, 13 and 14 of `engine-gaps.md`.

Companion docs: `../planning/engine-gaps.md` (the inventory), `autofit.md` (the
mechanism the shrink question resolves against), `../rendering.md` (the engine and the render
bridge), `../comments.md` (the `cm` mark and the anchor seam), `../collab.md` (why nothing on the
wire is a pixel), `../testing.md` (the mocking contract).

## Why

Three gaps, one root: line geometry was computed inside the render bridge and thrown away.

**A text leaf was one opaque command.** `emit` pushes one `kind: "text"` command per leaf; the
wrap that determined its height ran inside `measureText` and returned only `{ width, height }`.
Everything downstream that needed a line re-derived it: the 2D-canvas backend called `layoutRuns`
again and kept a _third_ wrap implementation for plain leaves (`wrapLines`); the PDF path called
it twice more; the PPTX path called it per text command; the comment overlay called it from chrome
and then reconstructed character offsets with a "the wrap ate a space" heuristic (the
`consumed += len + 1` walk), because fragments did not say which source characters they came from;
and the DOM backend handed the text to CSS (`white-space: pre-wrap`) and bet that browser wrap
agrees with canvas-`measureText` wrap — the same bet the inline editor's contenteditable overlay
makes through `paintedCtx` (`editor/core/leaf.ts`) so autofit's `fitScale` is honored.

**Pagination cut mid-line.** `fragment` broke only at command bottom edges; when no command
boundary landed inside the page it fell through to the hard limit and sliced a paragraph through
its glyphs.

**`Measured` was `{ width, height }`.** No ascent, no descent, no baseline as a layout input — so
a headline next to a stat aligned by box, not by baseline, and nothing in the engine could express
the alternative.

**No overflow policy existed on any node.** The only overflow behavior was the implicit clip the
height pass sets, which slices glyphs horizontally; there was no way to say "this card title is
two lines at most", so one long model-written string degraded the layout it landed in.

**Collab was never a re-deriver.** Presence carries element ids plus box fractions
(`model/collab.ts`), decoded against the local client's regions; selections and leases are
element-level. Nothing in collab touches a line; it becomes a _consumer_ the day remote text-range
selections ship, and the geometry they would read now exists.

## What the corpus says about cost

Measured with the deterministic testkit measurer over the seven corpus artifacts (`layoutSection`
at 1280px per section):

| artifact   | sections | commands | text commands | max text/section |
| ---------- | -------- | -------- | ------------- | ---------------- |
| aria       | 19       | 313      | 171           | 41               |
| fieldnotes | 19       | 123      | 77            | 12               |
| galleo     | 19       | 199      | 119           | 23               |
| helios     | 20       | 274      | 164           | 39               |
| lumen      | 20       | 228      | 143           | 33               |
| slowweb    | 18       | 84       | 55            | 7                |
| terra      | 20       | 211      | 124           | 25               |

~122 text commands per artifact, ~24 per section, worst section 41; ~1.3 lines per text command at
testkit metrics (≈1,100 line boxes for all seven artifacts together). Line boxes are small
(fragment strings are slices the cache key already retains) and the wrap that produces them
already runs on every measure. Attaching them is bookkeeping, not work.

## The design in one paragraph

`Measured` carries optional `lines`, `ascent`, `descent` (`canvas/engine/node.ts`);
`measureUncached` computes them (it always computed the lines; it used to return two numbers and
drop the rest) and the memo cache keeps them. `emit` re-reads the memoized measurement at the
node's assigned width — a Map hit in the common case, since the height pass measured that exact
key for every childless text node — and attaches the line boxes to the one text command. Fragments
carry source character offsets, so every consumer that used to reconstruct offsets or re-wrap
reads the command (backends) or the same cache entry (chrome). `fragment` breaks at line
boundaries and splits a text command into two commands sharing one leaf with a `lineRange` each.
Baseline alignment is an `alignY` value resolved from the metrics. `maxLines`/`overflow` live on
`TextLeaf`, honored in measure, so layout, autofit and every backend inherit them, with the
ellipsis materialized as a final-line fragment.

## Decisions

Each open question from `engine-gaps.md`, answered. Rejected options kept with their objection.

### (a) Line boxes: always, not on request

Lines attach to every text command unconditionally.

**Rejected: on request (a layout flag or a second entry point).** The cost argument for it
evaporates on measurement: the wrap already runs inside `measureUncached` for every text leaf on
every cache miss; retaining its output is allocation the miss already paid for, and attaching at
emit is one memoized lookup per text command (~24 per section, 41 worst). A flag would fork the
command shape into "sometimes has geometry", which is exactly the two-representations problem this
item existed to end, and `fragment` — a pure function over commands with no access to the
measurer — needs the lines present to break correctly, so the "request" would have to be plumbed
through every `layout()` caller anyway.

Memory: the section paint cache and the measure cache (`MEASURE_CACHE_CAP` 6000) both grow by the
retained fragments. At ~1.3 lines and a handful of fragments per text leaf this is noise against
the DOM layers the same cache holds.

### (b) One text command with line metadata, not per-line commands

The text command keeps its 1:1 relationship with the leaf and carries `lines?: TextLine[]` plus,
on fragmented pages only, `lineRange?: { start: number; end: number }`.

**Rejected: a list of per-line commands.** Counted, the blast radius is nine consumer sites, most
of which depend on "one command = one leaf":

1–4. all four backend text paths (`paintText`, `drawRuns`, `emitText`, `textSpec`);
5\. `buildGroups` (`ui/motion.ts`) pairs commands to painted nodes index-parallel — survivable,
but every group's node list multiplies;
6\. the `hideKey` filter that hides the leaf under an open inline edit would need to drop N
commands;
7\. `commandRegions` (`canvas/render/present.ts`) rebuilds element boxes from commands byId,
first-wins — a per-line first command would hand overlays a one-line "element box";
8\. `diagnose.typography` (`canvas/render/diagnose.ts`) counts text commands for
`leftEdges`/`typeSizes` — per-line commands multiply both and silently re-baseline two eval
checks;
9\. the DOM backend's semantics: `role="heading"`, run anchors that span a wrap, and text
selection all live on the one element per leaf; splitting a heading into three line divs breaks
all three.

Line metadata touches only the sites that consume the wrap's output, and leaves every identity,
a11y, and counting invariant untouched. The cost accepted in exchange: backends honor `lineRange`,
and "one command, sometimes partially painted" is an idea each backend states in one place.

**The line shape carries source offsets.** This is the load-bearing refinement
(`canvas/engine/node.ts`, beside `Measured` — the concept is the measure contract, not the
painter's):

```ts
export interface TextFrag {
    text: string;
    from: number; // source offset into TextLeaf.text (UTF-16, same space as Mark/cm)
    font: string;
    color?: string;
    underline: boolean;
    strike: boolean;
    code: boolean;
    highlight?: string;
    link?: string;
    x: number; // line-local, pre-align
    width: number;
}
export interface TextLine {
    from: number;
    to: number; // source range rendered; wrap-eaten whitespace falls in the gap to the next line
    y: number; // top, relative to the leaf's box
    baseline: number; // from the line's own top, from real font metrics
    width: number;
    frags: TextFrag[]; // visual order (== logical order until item 12)
}
```

`RunLayout` in `canvas/render/commands.ts` is shaped onto these types (its remaining consumers
are the comment chrome). Explicit `from`/`to` deleted the `consumed += len + 1` reconstruction in
`lineOfOffset`/`rangeRects` (`editor/core/comments.ts`) — the one place the chrome could drift
from the wrap — and is what keeps the shape valid under a future bidi pass, where one logical
range maps to several visual fragments (see edge cases).

### (c) Baseline alignment is an `alignY` value, not a separate field

`EngineNode.alignY` and `alignSelf` are `Align | "baseline"`; the `Align` type itself stays
three-valued, so `alignX` and `float` cannot name a baseline.

**Rejected: a separate `baselineAlign?: boolean` field.** Two fields answering one question
("where does this child sit on the cross axis") invites contradictory states (`alignY: "end"` +
`baselineAlign: true`) that the type system then cannot rule out. The union keeps illegal states
unrepresentable and reads as what it is: a fourth answer to the same question. The cost — every
`switch` over `alignY` gains an arm — is exactly the set of places that must decide what baseline
means there, which is the review the change forced.

Resolution, in `canvas/engine/layout.ts`: a row whose `alignY` (or a child whose `alignSelf`) is
`"baseline"` aligns flow children so their **first baselines** coincide at the deepest one. A
child's first baseline comes from `firstBaseline`: a text leaf answers from its measured first
line; a container answers with its first flow child's offset plus that child's baseline; a child
with no text in its first-child chain has no baseline and falls back to its box bottom sitting on
the shared baseline — the flexbox rule, predictable and already what an icon beside a label wants
to a first approximation. Grids and columns resolve `"baseline"` to `start` (`asBoxAlign` — a
column's cross axis is horizontal, where a baseline means nothing); a grid row baseline is
recorded as follow-up. The per-line baseline is computed from real metrics as
`(lineHeight − (ascent + descent)) / 2 + ascent` (`canvas/render/commands.ts`) — precisely where
all four backends already painted (`textBaseline: "middle"` at the line's midline), so attaching
metrics moved nothing. Metrics come per font string from `fontBoundingBoxAscent`/`Descent`,
cached in a sibling map and probed with `"Hg"` — the `actualBoundingBox*` alternative was rejected
because ink extents vary per string, so layout would jitter with content; the fallbacks are
`0.8`/`0.2` of the size where the font box is unsupported. `canvas/engine/__tests__/baseline.test.ts`
pins the math.

**Where baseline alignment is used today.** The one production surface is the container element's
cross-axis Align control (`canvas/elements/composite/container.ts`): its segmented control offers
"Baseline" and a row's `align` flows straight into engine `alignY`. The consumer the round named
to make the capability real — the stat/metric composite aligning value and label on a shared
baseline — was never wired: no element composes with `alignY: "baseline"` of its own accord. The
engine capability is built, tested and reachable from the inspector, and otherwise unused.

### (d) Item 14's shrink and autofit: one mechanism family, two scopes — build on, don't merge

Autofit re-composes a whole section at `fitScale` (`solveFitScale`, floors
`FIT_FLOOR`/`MIN_TEXT_PX` in `canvas/engine/profile.ts`); per-node shrink would solve a per-leaf
scale so one text fits its own box.

Decision: **`clip` and `ellipsis` + `maxLines` are shipped; per-node shrink is not built**, with
its design pinned: when it is, it reuses `solveFitScale` (the seeded bisection is a pure function
of `(frameH, natural, floor, probe)`) with a per-leaf probe, and the floor composes in final
pixels — `MIN_TEXT_PX / (composedSize × fitScale × nodeShrink)` — so the ramp, autofit and shrink
can never compound below legibility (the same reasoning `profile.ts` records for the first two).
They are not merged into one knob because their objectives differ — autofit preserves the
section's _relative_ hierarchy by scaling everything, shrink deliberately breaks it for one node —
and a single mechanism would have to carry both intents as modes.

**Rejected: build shrink first and express autofit through it.** Autofit is shipped, corpus-read,
and section-scoped by design (the `H(f) ≈ A·f² + B·f + C` argument in `autofit.md`
depends on the whole tree re-composing); rebuilding it per-node would be a regression in both.

### (e) Where `maxLines`/`overflow` live

- **Engine contract:** `TextLeaf` carries `maxLines?: number` and `overflow?: "clip" | "ellipsis"`
  (absent = unbounded). Honored inside the measure path (`truncate` in
  `canvas/render/commands.ts`), so height, layout, autofit's probes and every backend inherit the
  truncation from the one measurement path — invariant 1 by construction.
- **Element data:** a `maxLines?: number` field on the data of the text-bearing elements that
  expose it, mapped to the leaf in their `layout()`. No new `model/` file and no `ElementLayout`
  field: `ElementLayout` (`model/geometry.ts`) is the _box_ contract shared by all elements, and a
  line count is meaningless for an image — putting it there would make every element answer a text
  question. The concept owner is the element's own data, the same place `marks` lives.
- **Palette surface:** the `text` element (`canvas/elements/text/text.ts`, a bar control) and
  tables (`canvas/elements/table/table.ts`, the per-table "Clamp cells" slider, 0–4, mapped onto
  its cell leaves — the "one long cell" case). Cards inherit automatically where their titles are
  text elements. Defaults are **off** everywhere: no silent reflow of existing content, and the
  corpus did not move.
- **Ellipsis is always `"ellipsis"` for the palette controls**; bare `"clip"` exists for element
  internals (a chart label that must never grow) and is not offered in the inspector.
- **Analytics:** `text_clamped: { element_type; max_lines }` in `model/analytics.ts`, captured in
  the one inspector writer (`editor/panels/SharedControlFields.tsx` — the seam), not per control
  site. Counts and enums only, no content.
- **AI catalog:** `services/core/ai/prompts/catalog.ts` teaches `maxLines` on text. The model is
  not taught table clamping.

### Two consolidations decided alongside

- **One wrap implementation.** `measureUncached`'s plain-text loop and the backend's `wrapLines`
  both mirrored `layoutRuns`. Both are gone: a plain leaf wraps as one synthetic run through
  `leafForRuns` (which lives in `canvas/render/commands.ts`), and the repo contains exactly one
  wrap: `layoutRuns`. The PDF and PPTX emitters keep a `cmd.lines ?? layoutRuns(…)` fallback for a
  command that arrives without lines, which still goes through the same single implementation.
- **One line-height constant.** `size * 1.35` used to be written independently in seven places.
  `LINE_HEIGHT_FACTOR` is exported from `@model/text` (`model/text.ts`) — the model layer, so the
  render bridge, all backends and the inline editor read the same constant.

### The measure cache key — the invariant a future change breaks silently

`measureKey` (`canvas/render/commands.ts`) is keyed on
`size;weight;lineHeight;wrap;maxWidth;maxLines;overflow;fontId` + text/runs, with two NUL bytes
and a `\x02` as collision-proof separators (deliberate in function, invisible in review).

**Every metric-affecting input folds into `measureKey`, or invariant 1 is broken.** How each item
folded, so the key stays designed once:

- **Lines:** no key change — lines are a function of the same inputs as height.
- **Metrics:** no key change — ascent/descent are a function of `fontId`+`size`+`weight`, already
  in the key; they are cached per font string in a sibling map, not per text.
- **`maxLines`/`overflow`:** a mandatory key change, landed — `maxLines` changes the measured
  height and `overflow` changes the last line's fragments, both of which ride `Measured`. Both sit
  in the base segment (`…;${leaf.wrap};${mw};${leaf.maxLines ?? 0};${leaf.overflow ?? ""};…`),
  before the NUL separator, so the separator scheme is untouched.
- **A future locale field (item 11)** appends to the same base segment. The separators may be
  migrated to printable characters deliberately at zero cost (the cache is in-memory only, cleared
  on font `loadingdone`), but never silently as part of other work.

## Edge cases, enumerated

**Mixed-style and link runs at a truncation boundary.** Truncation happens at fragment level:
drop whole fragments past the cut, then trim the last kept fragment's text until the ellipsis
fits (re-measuring only that fragment's advance). The ellipsis is its own final fragment
inheriting the last visible fragment's `font` and `color` but **never** its `link`, `underline`,
`strike` or `highlight` — a decorated ellipsis reads as content, and a clickable one promises a
target it half-hides. Its `from` equals the cut offset, so offset math stays total. The DOM
backend clamps via `-webkit-line-clamp` (see export fidelity) and its UA-drawn ellipsis inherits
block styling — an accepted, invisible divergence.

**Ellipsis × the `cm` comment mark, and future search highlights.** `cm` stamps nothing on runs
(`model/text.ts`) so truncation cannot interact with it in paint. In chrome, `rangeRects` runs
over _visible_ lines only; a commented range past the clamp yields no tint rects and the thread's
margin marker falls back to the element (`lineOfOffset` clamps to the last visible line, which is
the existing degraded-anchor posture — the thread survives, per `anchorStateOf` in
`model/comments.ts`). Search-hit highlighting does not exist; when built it consumes the same
`rangeRects` and inherits the same rule.

**Empty text.** `layoutRuns` yields one empty line on no tokens, height one `lineHeight`. The
line-box output preserves this — one line, `from: 0, to: 0`, no fragments — so caret placement
and the inline editor's empty-field geometry are unchanged.

**A single word wider than the column.** It renders overwide and may be clipped by an ancestor
`clip.x`; a `TextLine.width` may exceed the command's `box.w` and consumers must not assume
otherwise. Break-anywhere is item 11 and not built, but nothing here paints it into a corner: a
future segmenter changes only _which_ fragments a line holds, not the line shape, and the
`from`/`to` mapping is precisely what a mid-word break needs to stay expressible.

**Fragmenting inside a paragraph, with widows.** `fragment` adds, for each text command with
enough lines, candidate break positions at `box.y + line.y` for interior lines — but only those
leaving at least `KEEP_LINES = 2` lines on each side of the cut. Candidates still prefer the
lowest command-boundary break (existing behavior wins where it worked); a line-boundary candidate
is taken only when the alternative is the hard limit. On a split, the command becomes two commands
sharing the leaf: page one carries `lineRange: {start: 0, end: k}` with its box height `k` lines;
page two carries `{start: k, end: n}`, box shifted so line `k` sits at the page top. Full
keep-with-next/orphan policy beyond the 2-line guard is not built.

**Autofit × pagination × truncation.** No compounding is possible by construction: autofit never
runs on the path to pagination (`prepareSlideNode` — a paginating section composes at `f = 1`), so
a fragmented section always has `fitScale = 1`, and a fitted section never fragments. `maxLines`
interacts with autofit only through the measurement path: a clamped leaf measures shorter,
`solveFitScale`'s probes see the truth, and the search lands on a larger `f`. The floor arithmetic
(decision d) keeps `MIN_TEXT_PX` binding on final pixels whatever multiplies. The editor's fit
freeze (`freezeFit`) is orthogonal: it pins `f` during an inline edit, and fragmentation never
runs on the editor canvas.

**Zoom.** Pure view transform, by construction: zoom is one CSS transform on the stage and
nothing re-wraps; line boxes are layout-space like every other box, and every overlay that
consumes them multiplies stage coordinates by `zoom()` the way region boxes are handled. No line
consumer reads client pixels.

**RTL future-proofing (item 12 out of scope).** `TextLine.frags` is defined as _visual order_
with per-fragment source offsets. Under bidi, visual ≠ logical and one logical range covers
several visual fragments — `rangeRects` returns one rect per covered fragment run, so highlights
and carets survive reordering without a shape change. Nothing in the shape encodes "x grows with
the reading direction"; alignment stays physical until item 12 introduces direction resolution.

**Export fidelity per backend** (the shared-field / per-backend-interpretation pattern):

| backend                           | whole command                                                                    | `lineRange` (fragmented)                                                                                  | `maxLines` + ellipsis                                                                       |
| --------------------------------- | -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| DOM (`paintText`)                 | unchanged: CSS wraps (the existing bet)                                          | an inner div shifted up `start·lh`, `overflow: hidden` on the element — CSS still wraps, the window moves | `-webkit-line-clamp` + `overflow: hidden` (UA ellipsis; measured ellipsis not painted here) |
| 2D canvas (`drawRuns`)            | consumes `cmd.lines`; the plain path and `wrapLines` are gone                    | slices `lines[start..end)`, draws at `y − start·lh`                                                       | lines arrive pre-truncated from measure; nothing to do                                      |
| PDF (`emitText`, `buildFontBook`) | consumes `cmd.lines` (with the `layoutRuns` fallback for a lineless command)     | slice                                                                                                     | pre-truncated; link annots skip the ellipsis frag (it carries no `link`)                    |
| PPTX (`textSpec`)                 | consumes `c.lines` (same fallback); pre-wrapped lines emitted with `wrap: false` | slice before `textSpec`                                                                                   | pre-truncated; still one text box                                                           |

The PNG path is the canvas path. Surfaces (`DrawContext.text`) are untouched — surface labels are
immediate-mode paint, not `TextLeaf` commands. PDF's baseline approximations in `drawTextAbs`
(`canvas/render/pdf-draw.ts`, the 0.8/0.3 factors) do not adopt the real metrics; recorded as
follow-up.

**Chrome reads what the engine wrote.** `paintedLinesFor(address, width)` in
`editor/core/leaf.ts` reads the memoized measurement through `paintedCtx` — the same cache entry
the paint consumed, so drift is structurally impossible — and the comment overlay
(`editor/panels/Comments.tsx`) consumes it; `lineOfOffset`/`rangeRects`
(`editor/core/comments.ts`) work on the lines' `from`/`to`. The inline editor is verified, not
changed: contenteditable stays CSS-wrapped (it must be editable); its contract remains
font/line-height/width/fitScale equality via `paintedCtx`.

**Skeletons, ghosts, placeholders, windowing.** `skeletonize` replaces text with bars, so
skeleton commands carry no leaf and `emit` attaches nothing. Placeholder entries build no
regions/lines. Windowed sections keep layout without DOM; their cached commands carry lines —
that is the point, chrome may read them without forcing a paint.

## The invariants, survived

1. **One measurement path** — strengthened: the two shadow wraps are gone; `layoutRuns` inside
   `measureText` is the only wrap, and metrics enter through the same memo.
2. **One layout feeds screen and export** — `sectionSlides` is the chokepoint; `fragment` runs
   inside it and nowhere else.
3. **Regions as the only pixel→tree bridge** — no id grammar changes; one command per leaf
   preserved (decision b exists mostly to protect this and its neighbors).
4. **`profileFor` identity / paint-cache keys** — no profile fields added; `SectionCacheEntry`
   keys unchanged (lines ride inside cached commands).
5. **Shell extension rule** — nothing artifact-level was introduced; `maxLines` is element data.
6. **The corpus is the gate** — line-count neutrality on the corpus was the acceptance bar for
   folding the plain wrap into `layoutRuns` (sub-pixel width deltas expected and fine); paged
   output for tall sections moved deliberately, breaks landing on line boundaries where they used
   to slice glyphs.
7. **Repo rules** — no new `model/` file (`TextLine` lives with the measure contract in
   `@engine/node`; the authoring field lives in each element's data); no barrels;
   suppression-free.

## Not taken

- **Item 11, script-aware breaking**: the segmenter drops into `tokenize` and the key gains a
  locale field per the key design above; the line-box shape is already segmentation-agnostic.
- **Item 12, bidi**: visual-order fragments with source offsets are the door; direction fields,
  logical insets and reordering are not built.
- **Per-node shrink**: not built, with its design pinned (decision d).
- **The stat/metric baseline consumer**: the value+label shared-baseline retrofit the round named
  as its proving consumer is not wired; baseline alignment ships as an engine capability with the
  container's Align control as its only production surface.
- **Card-title default clamps**: defaults stay off everywhere; needs corpus evidence first.
- **Drop caps / text-on-path**: both are consumers of line boxes (an exclusion shape per line; a
  per-line transform); the seam they would use now exists, and neither is designed.
- **Line-level Present reveals**: unlocked (a build group per `TextLine` window is expressible
  over one command), owned by the motion doc when scheduled.
- **Remote text-range selections**: collab stays element-level; the geometry they would read
  exists (`rangeRects` over engine lines).
- **The `measureKey` separator hygiene fix**: free to do any time, never smuggled in.
- **Grid-row baseline** and **exact PDF `drawTextAbs` baselines**: recorded follow-ups.
