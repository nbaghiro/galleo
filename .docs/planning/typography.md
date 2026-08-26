# Planning — typography round: line boxes, font metrics, truncation

> The executable spec for items 2, 13 and 14 of [`engine-gaps.md`](engine-gaps.md): the engine
> starts returning the line geometry it already computes and discards, `Measured` learns what a
> font actually is, and a text node can finally say "at most two lines". Every engine change is
> generic — a capability of the measure path and the command stream, never a feature hard-coded
> for one element.
>
> Status: proposed, not started. Verified against the tree 2026-08-26; line numbers cited are as
> of that date and the symbol is the authority where they drift.

Companion docs: `engine-gaps.md` (the inventory), `autofit.md` (the shipped mechanism item 14's
shrink question resolves against), `engine-round.md` (the workstream/eval-posture precedent),
`rendering.md` (the engine and the render bridge), `comments.md` (the `cm` mark and the anchor
seam), `collab.md` (why nothing on the wire is a pixel), `testing.md` (the mocking contract this
plan extends).

## Why

Three gaps, one root: line geometry is computed inside the render bridge and thrown away.

**A text leaf is one opaque command.** `emit` (`canvas/engine/layout.ts:473`) pushes one
`kind: "text"` command per leaf. The wrap that determined its height ran inside `measureText`
(`canvas/render/commands.ts:645` → `measureUncached:581` → `layoutRuns:514`), produced per-line,
per-fragment geometry (`RunLayout`), and returned only `{ width, height }`. Everything downstream
that needs a line re-derives it:

- the 2D-canvas backend calls `layoutRuns` again (`drawRuns`, `canvas/render/backends.ts:647`),
  and keeps a _third_ wrap implementation for plain leaves (`wrapLines`, `backends.ts:580`,
  mirroring `measureUncached`'s own plain-text loop);
- the PDF path calls it twice more (`emitText`, `canvas/render/pdf-draw.ts:242`; `buildFontBook`,
  `:323`);
- the PPTX path calls it per text command (`buildPptx`, `canvas/render/pptx.ts:495`) and emits the
  pre-wrapped lines with `wrap: false` so PowerPoint cannot re-flow;
- the comment overlay calls it from chrome (`runLayoutFor`, `editor/panels/Comments.tsx:390`) and
  then reconstructs character offsets with a "the wrap ate a space" heuristic
  (`lineOfOffset`/`rangeRects`, `editor/core/comments.ts:449`/`:472`, the `consumed += len + 1`
  walk) because fragments do not say which source characters they came from;
- the DOM backend does not call it at all: `paintText` (`backends.ts:66`) hands the text to CSS
  (`white-space: pre-wrap`) and bets that browser wrap agrees with canvas-`measureText` wrap — the
  same bet the inline editor's contenteditable overlay makes (`editor/panels/TextEditor.tsx`,
  the `style` memo copying font/line-height/width exactly, through `paintedCtx` in
  `editor/core/leaf.ts:23` so autofit's `fitScale` is honored).

**Pagination cuts mid-line.** `fragment` (`layout.ts:538`) breaks only at command bottom edges;
when no command boundary lands inside the page it falls through to the hard limit
(`cands.push(limit)`) and slices a paragraph through its glyphs. A doc export whose body copy is
one long paragraph is cut mid-line today, and `overflow.dom.test.ts` pins the current behavior
rather than a good one.

**`Measured` is `{ width, height }`** (`canvas/engine/node.ts:80`). No ascent, no descent, no
baseline as a layout input — `DrawTextStyle.baseline` (`node.ts:36`) is a paint hint for surfaces
only. So a headline next to a stat, or two column heads at different sizes, align by box, not by
baseline, and nothing in the engine could express the alternative.

**No overflow policy exists on any node.** The only overflow behavior is the implicit clip the
height pass sets when a resolved height is smaller than content (`layout.ts:279`, `:304`, `:334`),
which slices glyphs horizontally. There is no `maxLines`, no ellipsis, nowhere in the element
system to say "this card title is two lines at most" — one long model-written string degrades the
layout it lands in.

**Collab is _not_ a third re-deriver** — correcting the engine-gaps entry. Presence carries
element ids plus box fractions (`model/collab.ts:29`, `encodeElementCursor:297`), decoded against
the local client's regions (`editor/core/collab.ts`, `boxOfRegion:284`); selections and leases are
element-level `ElementRef`s. Nothing in collab touches a line today. It becomes a _consumer_ the
day remote text-range selections ship, and this round builds the geometry they would read.

## What the corpus says about cost

Measured with the deterministic testkit measurer over the seven corpus artifacts (probe script,
`layoutSection` at 1280px per section):

| artifact   | sections | commands | text commands | max text/section |
| ---------- | -------- | -------- | ------------- | ---------------- |
| aria       | 19       | 313      | 171           | 41               |
| fieldnotes | 19       | 123      | 77            | 12               |
| galleo     | 19       | 199      | 119           | 23               |
| helios     | 20       | 274      | 164           | 39               |
| lumen      | 20       | 228      | 143           | 33               |
| slowweb    | 18       | 84       | 55            | 7                |
| terra      | 20       | 211      | 124           | 25               |

~122 text commands per artifact, ~24 per section, worst section 41; ~1.3 lines per text command
at testkit metrics (≈1,100 line boxes for all seven artifacts together). Line boxes are small
(fragment strings are slices the cache key already retains) and the wrap that produces them
already runs on every measure. Attaching them is bookkeeping, not work.

## The design in one paragraph

`Measured` grows optional `lines`, `ascent`, `descent`; `measureUncached` computes them (it
already computes the lines; it currently returns two numbers and drops the rest) and the memo
cache keeps them. `emit` re-reads the memoized measurement at the node's assigned width (the
measurer threads into `emit`, or the height pass stashes it on `LayoutNode`) — a Map hit in the
common case, since `layoutHeights` (`layout.ts:245`) measured that exact key for every childless
text node; a leaf riding a container node measures once here instead — and attaches the line
boxes to the one text command. Fragments carry source character offsets, so every consumer that
today reconstructs offsets or re-wraps switches to reading the command (backends) or the same
cache entry (chrome). `fragment` gains line-boundary break candidates and splits a text command
into two commands sharing one leaf with a `lineRange` each. Baseline alignment becomes an
`alignY` value resolved from the new metrics. `maxLines`/`overflow` land on `TextLeaf`, honored
in measure (so layout, autofit, and every backend inherit them), with ellipsis materialized as a
final-line fragment.

## Decisions

Each open question from `engine-gaps.md`, answered. Rejected options kept with their objection.

### (a) Line boxes: always, not on request

Attach lines to every text command unconditionally.

**Rejected: on request (a layout flag or a second entry point).** The cost argument for it
evaporates on measurement: the wrap already runs inside `measureUncached` for every text leaf on
every cache miss; retaining its output is allocation the miss already paid for, and attaching at
emit is one memoized lookup per text command (~24 per section, 41 worst). A flag would fork the
command shape into "sometimes has geometry", which is exactly the two-representations problem
this item exists to end, and `fragment` — a pure function over commands with no access to the
measurer — needs the lines present to break correctly, so the "request" would have to be
plumbed through every `layout()` caller anyway.

Memory: the section paint cache (`backends.ts:863`, `SectionCacheEntry.commands`) and the measure
cache (`MEASURE_CACHE_CAP` 6000, `commands.ts:627`) both grow by the retained fragments. At ~1.3
lines and a handful of fragments per text leaf this is noise against the DOM layers the same
cache holds.

### (b) One text command with line metadata, not per-line commands

The text command keeps its 1:1 relationship with the leaf and gains `lines?: TextLine[]` plus, on
fragmented pages only, `lineRange?: { start: number; end: number }`.

**Rejected: a list of per-line commands.** Counted, the blast radius is nine consumer sites, most
of which depend on "one command = one leaf":

1–4. all four backend text paths (`paintText`, `drawRuns`, `emitText`, `textSpec`); 5. `buildGroups` (`ui/motion.ts:50`) pairs commands to painted nodes index-parallel — survivable,
but every group's node list multiplies; 6. the `hideKey` filter that hides the leaf under an open inline edit
(`backends.ts`, `paintSectionStack`, `c.kind === "text" && c.id === hideKey`) would need to
drop N commands; 7. `commandRegions` (`canvas/render/present.ts:134`) rebuilds element boxes from commands byId,
first-wins — a per-line first command would hand overlays a one-line "element box"; 8. `diagnose.typography` (`canvas/render/diagnose.ts:86`) counts text commands for
`leftEdges`/`typeSizes` — per-line commands multiply both and silently re-baseline two eval
checks; 9. the DOM backend's semantics: `role="heading"` (`paintText`), run anchors that span a wrap
(`appendRuns`), and text selection all live on the one element per leaf; splitting a heading
into three line divs breaks all three.

Line metadata touches only the sites that already consume `RunLayout`, and leaves every identity,
a11y, and counting invariant untouched. The cost accepted in exchange: backends must honor
`lineRange`, and "one command, sometimes partially painted" is a new idea each backend states in
one place.

**The line shape carries source offsets.** This is the load-bearing refinement:

```ts
// @engine/node — beside Measured; the concept is the measure contract, not the painter's
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
    x: number; // line-local, pre-align (as RunFrag today)
    width: number;
}
export interface TextLine {
    from: number;
    to: number; // source range this line renders, wrap-eaten whitespace included in the gap
    y: number; // top, relative to the leaf's box
    baseline: number; // relative to the line's own top; from metrics (phase B), synthesized before
    width: number;
    frags: TextFrag[]; // visual order (== logical order until item 12)
}
```

`RunLayout`/`RunFrag` in `commands.ts` are re-shaped onto these types (they are currently
exported to exactly two files: `editor/core/comments.ts`, `editor/panels/Comments.tsx`). Explicit
`from`/`to` deletes the `consumed += len + 1` reconstruction in `lineOfOffset`/`rangeRects` — the
one place the current chrome can drift from the wrap — and is what keeps the shape valid under a
future bidi pass, where one logical range maps to several visual fragments (see edge cases).

### (c) Baseline alignment is an `alignY` value, not a separate field

`EngineNode.alignY` (and `alignSelf`) widen from `Align` to `Align | "baseline"`; the `Align`
type itself stays three-valued, so `alignX` and `float` cannot name a baseline.

**Rejected: a separate `baselineAlign?: boolean` field.** Two fields answering one question
("where does this child sit on the cross axis") invites contradictory states (`alignY: "end"` +
`baselineAlign: true`) that the type system then cannot rule out. The union keeps illegal states
unrepresentable and reads as what it is: a fourth answer to the same question. The cost — every
`switch` over `alignY` gains an arm — is exactly the set of places that must decide what baseline
means there, which is the review we want forced.

Resolution: in `layoutPositions`, a row whose `alignY` (or a child whose `alignSelf`) is
`"baseline"` aligns flow children so their **first baselines** coincide at the deepest one. A
child's first baseline comes from `firstBaseline(ln)`: a text leaf answers from its measured
first line (`ascent` centered in the line box, i.e. `(lineHeight − (ascent+descent))/2 + ascent`,
which is precisely where all four backends already paint — `textBaseline: "middle"` at
`i·lh + lh/2`); a container answers with its first flow child's offset plus that child's
baseline, using the same lead math `layoutPositions` uses (factored into a shared helper rather
than duplicated); a child with no text in its first-child chain has no baseline and falls back to
its box bottom sitting on the shared baseline — the flexbox rule, predictable and already what an
icon beside a label wants to a first approximation. Floats and grids are untouched in this round;
a grid row baseline is recorded as follow-up (it is the same code path once `alignY` reaches the
grid's per-row offset at `layout.ts:380`).

### (d) Item 14's shrink and autofit: one mechanism family, two scopes — build on, don't merge

The question engine-gaps flags as "probably the same mechanism": autofit re-composes a whole
section at `fitScale` (`solveFitScale`, `commands.ts:216`; floors `FIT_FLOOR`/`MIN_TEXT_PX`,
`canvas/engine/profile.ts:17`); per-node shrink would solve a per-leaf scale so one text fits its
own box.

Decision: **ship `clip` and `ellipsis` + `maxLines` now; defer per-node shrink**, exactly as
autofit's own Phase D deferred per-element shrink priorities — and when it is built, it reuses
`solveFitScale` (the seeded bisection is already a pure function of `(frameH, natural, floor,
probe)`) with a per-leaf probe, and the floor composes in final pixels:
`MIN_TEXT_PX / (composedSize × fitScale × nodeShrink)`, so the ramp, autofit and shrink can never
compound below legibility (the same reasoning `profile.ts:11`'s comment records for the first
two). They are not merged into one knob because their objectives differ — autofit preserves the
section's _relative_ hierarchy by scaling everything, shrink deliberately breaks it for one node —
and a single mechanism would have to carry both intents as modes.

**Rejected: build shrink first and express autofit through it.** Autofit is shipped, corpus-read,
and section-scoped by design (the `H(f) ≈ A·f² + B·f + C` argument in `autofit.md` depends on the
whole tree re-composing); rebuilding it per-node would be a regression in both.

### (e) Where `maxLines`/`overflow` live

- **Engine contract:** `TextLeaf` gains `maxLines?: number` and `overflow?: "clip" | "ellipsis"`
  (absent = today's behavior, unbounded). Honored inside `measureUncached`, so height, layout,
  autofit's probes and every backend inherit the truncation from the one measurement path —
  invariant 1 by construction.
- **Element data:** a `maxLines?: number` field on the data of the text-bearing elements that
  expose it, mapped to the leaf in their `layout()`. No new `model/` file and no `ElementLayout`
  field: `ElementLayout` (`model/geometry.ts:22`) is the _box_ contract (width/height/align/
  radius) shared by all elements, and a line count is meaningless for an image — putting it there
  would make every element answer a text question. The concept owner is the element's own data,
  the same place `marks` lives.
- **Palette surface, this round:** the `text` element (`canvas/elements/text/text.ts`, via its
  `bar` controls) and table cells (`canvas/elements/table/table.ts`, a per-table "Clamp rows"
  control mapped onto its cell leaves — the "one long cell" case item 14 names). Cards inherit
  automatically where their titles are text elements. Defaults stay **off** everywhere: no silent
  reflow of existing content, and the corpus must not move.
- **Ellipsis is always `"ellipsis"` for the palette controls**; bare `"clip"` exists for element
  internals (a chart label that must never grow) and is not offered in the inspector.
- **Analytics:** new event in `model/analytics.ts`: `text_clamped: { element_type: string;
max_lines: number }`, captured in the one inspector writer (the seam), not per control site.
  Counts and enums only, no content — per the catalog's property rule.
- **AI catalog:** one line in `services/core/ai/prompts/catalog.ts` teaching `maxLines` on text,
  per the engine-gaps cross-cutting note that the catalog is part of an item's scope. The model
  is _not_ taught table clamping this round.

### Two consolidations decided alongside

- **One wrap implementation.** `measureUncached`'s plain-text loop and the backend's `wrapLines`
  both mirror `layoutRuns`. Fold both: `measureUncached` always goes through `layoutRuns` (a
  plain leaf wraps as one synthetic run — `leafForRuns` in `pptx.ts:217` already does this and
  moves down to `commands.ts`), and `drawCommands`' plain path + `wrapLines` are deleted in favor
  of the command's lines. After this round the repo contains exactly one wrap: `layoutRuns`.
  Risk: the plain loop measures whole line strings while `layoutRuns` sums per-piece advances, so
  widths can differ by sub-pixel shaping effects and flip a knife-edge wrap; see eval posture.
- **One line-height constant.** `size * 1.35` is written independently in seven places
  (`commands.ts:519`/`:583`, `backends.ts:76`/`:748`, `pptx.ts:132`/`:265`,
  `TextEditor.tsx:203`). Export `LINE_HEIGHT_FACTOR` from `commands.ts` and use it everywhere the
  files are already being touched.

### The measure cache key, designed once

`measureKey` (`commands.ts:629`) is keyed on
`size;weight;lineHeight;wrap;maxWidth;fontId` + text/runs, with two NUL bytes and a `\x02` as
collision-proof separators (the flagged hygiene item: lines 635–638; deliberate in function,
invisible in review). This round and the two future items touch it as follows:

- **Item 2 (lines):** no key change. Lines are a function of the same inputs as height.
- **Item 13 (metrics):** no key change. Ascent/descent are a function of `fontId`+`size`+`weight`,
  already in the key; they are cached per font string in a sibling map, not per text.
- **Item 14 (`maxLines`/`overflow`):** **key change, mandatory.** `maxLines` changes the measured
  height and `overflow` changes the last line's fragments, both of which now ride `Measured`.
  Fold both into the base segment: `…;${leaf.wrap};${leaf.maxLines ?? 0};${leaf.overflow ?? ""};…`
  — before the NUL separator, so the separator scheme is untouched.
- **Item 11, later (locale):** appends to the same base segment. Recorded here so the key is
  designed once: _every metric-affecting input folds into `measureKey` or invariant 1 is broken_;
  the separators may be migrated to printable characters in the hygiene fix at zero cost (the
  cache is in-memory only, cleared on font `loadingdone`), but not silently as part of this round.

## Edge cases, enumerated

**Mixed-style and link runs at a truncation boundary.** Truncation happens at fragment level
after `toRuns`: drop whole fragments past the cut, then trim the last kept fragment's text until
the ellipsis fits (re-measuring only that fragment's advance). The ellipsis is its own final
fragment inheriting the last visible fragment's `font` and `color` but **never** its `link`,
`underline`, `strike` or `highlight` — a decorated ellipsis reads as content, and a clickable one
promises a target it half-hides. Its `from` equals the cut offset, so offset math stays total.
The DOM backend clamps via `-webkit-line-clamp` (see export fidelity) and its UA-drawn ellipsis
inherits block styling — an accepted, invisible divergence.

**Ellipsis × the `cm` comment mark, and future search highlights.** `cm` stamps nothing on runs
(`model/text.ts:60`) so truncation cannot interact with it in paint. In chrome, `rangeRects` runs
over _visible_ lines only; a commented range past the clamp yields no tint rects and the thread's
margin marker falls back to the element (`lineOfOffset` clamps to the last visible line, which is
the existing degraded-anchor posture — the thread survives, per `anchorStateOf` in
`model/comments.ts:90`). Search-hit highlighting does not exist today (verified: no consumer);
when built it consumes the same `rangeRects` and inherits the same rule.

**Empty text.** `layoutRuns` already yields one empty line (`endLine` on no tokens), height one
`lineHeight`. The line-box output preserves this — one line, `from: 0, to: 0`, no fragments — so
caret placement and the inline editor's empty-field geometry are unchanged.

**A single word wider than the column.** Today it renders overwide and may be clipped by an
ancestor `clip.x`; a `TextLine.width` may exceed the command's `box.w` and consumers must not
assume otherwise. Break-anywhere is item 11 and out of scope, but nothing here paints it into a
corner: a future segmenter changes only _which_ fragments a line holds, not the line shape, and
the `from`/`to` mapping is precisely what a mid-word break needs to stay expressible.

**Fragmenting inside a paragraph, with widows.** `fragment` adds, for each text command with ≥ 2
lines, candidate break positions at `box.y + line.y` for each interior line — but only those
leaving at least `KEEP_LINES = 2` lines on each side of the cut. Candidates still prefer the
lowest command-boundary break (existing behavior wins where it worked); a line-boundary candidate
is taken only when the alternative is the hard limit. On a split, the command becomes two
commands sharing the leaf: page one carries `lineRange: {start: 0, end: k}` with its box height
`k` lines; page two carries `{start: k, end: n}`, box shifted so line `k` sits at the page top.
Full keep-with-next/orphan policy beyond the 2-line guard is out of scope, recorded.

**Autofit × pagination × truncation.** No compounding is possible by construction: autofit never
runs on the path to pagination (`prepareSlideNode`, `commands.ts:257` — a paginating section
composes at `f = 1`), so a fragmented section always has `fitScale = 1`, and a fitted section
never fragments (`targetH == h`). `maxLines` interacts with autofit only through the measurement
path: a clamped leaf measures shorter, `solveFitScale`'s probes see the truth, and the search
lands on a larger `f`. The floor arithmetic (decision d) keeps `MIN_TEXT_PX` binding on final
pixels whatever multiplies. The editor's fit freeze (`freezeFit`, `backends.ts` /
`editor/core/store.ts:566`) is orthogonal: it pins `f` during an inline edit and fragmentation
never runs on the editor canvas.

**Zoom.** Pure view transform, proven by construction: zoom is one CSS transform on the stage and
"nothing re-wraps" (`editor/core/store.ts:1478`); line boxes are layout-space like every other
box, and every overlay that consumes them already multiplies stage coordinates by `zoom()` the
way region boxes are handled today. No line consumer reads client pixels.

**RTL future-proofing (item 12 out of scope).** `TextLine.frags` is defined as _visual order_
with per-fragment source offsets. Under bidi, visual ≠ logical and one logical range covers
several visual fragments — `rangeRects` as specified already returns one rect per covered
fragment run, so highlights and carets survive reordering without a shape change. Nothing in the
shape encodes "x grows with the reading direction"; alignment stays physical until item 12
introduces direction resolution.

**Export fidelity per backend** (the shared-field / per-backend-interpretation pattern the
engine-gaps cross-cutting section blesses):

| backend                           | whole command                                                                                    | `lineRange` (fragmented)                                                                                                     | `maxLines` + ellipsis                                                                       |
| --------------------------------- | ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| DOM (`paintText`)                 | unchanged: CSS wraps (the existing bet)                                                          | inner content shifted up `start·lh`, element height `(end−start)·lh`, `overflow: hidden` — CSS still wraps, the window moves | `-webkit-line-clamp` + `overflow: hidden` (UA ellipsis; measured ellipsis not painted here) |
| 2D canvas (`drawRuns`)            | consumes `cmd.lines` instead of re-calling `layoutRuns`; plain path + `wrapLines` deleted        | slice `lines[start..end)`, draw at `y − start·lh`                                                                            | lines arrive pre-truncated from measure; nothing to do                                      |
| PDF (`emitText`, `buildFontBook`) | consumes `cmd.lines`; both re-wrap calls deleted                                                 | slice                                                                                                                        | pre-truncated; link annots skip the ellipsis frag (it carries no `link`)                    |
| PPTX (`textSpec`)                 | consumes `cmd.lines` (already takes a `lines` argument); `buildPptx`'s `layoutRuns` call deleted | slice before `textSpec`                                                                                                      | pre-truncated; still one text box, `wrap:false` as today                                    |

The PNG path is the canvas path. Surfaces (`DrawContext.text`) are untouched — surface labels are
immediate-mode paint, not `TextLeaf` commands. PDF's baseline approximations in `drawTextAbs`
(`pdf-draw.ts:199`, the 0.8/0.3 factors) _could_ adopt real metrics in phase B; deferred, so
phase B stays geometry-neutral everywhere at once.

**Collab and comment anchors under a wrap migration.** Verified content-relative, no persisted
pixels anywhere: a comment text anchor is an element id plus `cm` mark offsets in source space
(`model/comments.ts:9`, `model/text.ts:17`); presence is ids plus box fractions
(`model/collab.ts:29`); the room protocol "carries no pixel" by stated invariant. When phase A
shifts a wrap point, every anchor re-resolves against the new geometry on the next paint; nothing
stored can dangle. The only geometry-adjacent persistence in the artifact is `Section.frame`,
untouched here.

**Skeletons, ghosts, placeholders, windowing.** `skeletonize` replaces text with bars, so
skeleton commands carry no leaf and `emit` attaches nothing. Placeholder entries build no
regions/lines. Windowed sections keep layout without DOM (`paintSectionStack`); their cached
commands now carry lines — that is the point, chrome may read them without forcing a paint.

## The invariants, survived

1. **One measurement path** — strengthened: the two shadow wraps (`measureUncached` plain loop,
   backend `wrapLines`) are deleted; `layoutRuns` inside `measureText` becomes the only wrap, and
   metrics enter through the same memo.
2. **One layout feeds screen and export** — `sectionSlides` is untouched as the chokepoint;
   `fragment` still runs inside it and nowhere else (verified: no other caller).
3. **Regions as the only pixel→tree bridge** — no id grammar changes; one command per leaf
   preserved (decision b exists mostly to protect this and its neighbors).
4. **`profileFor` identity / paint-cache keys** — no profile fields added; `SectionCacheEntry`
   keys unchanged (lines ride inside cached commands).
5. **Shell extension rule** — nothing artifact-level is introduced; `maxLines` is element data.
6. **The corpus is the gate** — the posture section below is per-phase and explicit.
7. **Repo rules** — no new `model/` file (`TextLine` lives with the measure contract in
   `@engine/node`; the authoring field lives in each element's data); no barrels; suppression-free
   (the new `alignY` union and `Measured` fields are additive and typed).

## Phases

Sequential workstreams, the engine-round precedent: every phase overlaps in
`canvas/render/commands.ts`, and A–B also share `node.ts`/`layout.ts`/`backends.ts`, so nothing
here parallelizes. Order **2 → 13 → 14**, not the 13 → 2 → 14 the round's name suggests: item 2
rewrites the measure path that item 13 decorates (metrics attach per-line, and per-line baselines
only exist once lines do), and item 14's ellipsis is fragment surgery on line boxes — building 13
first would mean adding fields to a function A then rewrites. 13 before 14 because 14's key
change is the riskiest measure edit and benefits from the corpus being quiet again after A.

### W-A · item 2 — line boxes as an engine output (M overall)

**A1 — the measure path (S, highest risk per byte).**

- [ ] `TextFrag`/`TextLine` in `@engine/node`; `Measured.lines?: TextLine[]`.
- [ ] `layoutRuns` emits source offsets (`from`/`to`) per fragment and line; plain leaves route
      through it via a moved `leafForRuns`; `measureUncached`'s plain loop deleted; `RunLayout`/
      `RunFrag` re-shaped onto the new types; `LINE_HEIGHT_FACTOR` extracted.
- [ ] `emit` attaches `lines` to text commands via one memoized `measure(leaf, ln.w)` re-read.
- [ ] Testkit: the deterministic `measure` synthesizes lines (8px/char split at `maxWidth`, fixed
      16px line, deterministic offsets), per the `testing.md` contract — the algorithm runs for real,
      only glyph widths are fake.
- [ ] Tests: engine (`layout.test.ts` — lines present, offsets total, empty text, hard breaks,
      wrap:none), render (`commands.test.ts`/`commands.dom.test.ts` — plain≡runs equivalence on the
      same string, offsets against real `layoutRuns`), and a corpus width-diff probe (below).

**A2 — fragment + backends (M).**

- [ ] `RenderCommand(text).lineRange`; `fragment` line-boundary candidates + `KEEP_LINES = 2`;
      hard-limit fallback retained for lineless commands.
- [ ] The four backend slices per the fidelity table; `wrapLines` and the three duplicate
      `layoutRuns` calls (canvas, PDF ×2, PPTX) deleted; `buildFontBook` iterates command lines.
- [ ] Tests: `fragment.test.ts` (splits at line boundary, 2-line guard, no split under 4 lines,
      progress guard), `overflow.dom.test.ts` re-baselined knowingly, `pdf-draw.test.ts` /
      `pptx.test.ts` (sliced emission), `present.dom.test.ts` (paged step count where a paragraph now
      splits clean).

**A3 — chrome reads what the engine wrote (S).**

- [ ] `lineOfOffset`/`rangeRects` rewritten on `from`/`to` (heuristic deleted);
      `runLayoutFor` (`Comments.tsx`) replaced by a `paintedLinesFor(address)` accessor in
      `editor/core/leaf.ts` that reads the memoized measurement through `paintedCtx` — the same cache
      entry the paint consumed, so drift is structurally impossible; the `runs?.length` special case
      disappears (plain leaves now wrap as one synthetic run everywhere).
- [ ] The inline editor is _verified_, not changed: contenteditable stays CSS-wrapped (it must be
      editable); its contract remains font/line-height/width/fitScale equality via `paintedCtx`.
- [ ] Tests: `comment-anchors.test.ts` + a new offsets-based `rangeRects` case (multi-line range,
      range past a clamp, empty line).

### W-B · item 13 — real font metrics (S–M)

- [ ] Per-font-string metrics (`fontBoundingBoxAscent/Descent`, cached in a sibling map; the
      `actualBoundingBox*` alternative rejected — ink extents vary per string, so layout would jitter
      with content; fall back to an `Hg` probe where the font box is unsupported).
- [ ] `Measured.ascent/descent`; `TextLine.baseline` computed, matching the backends' painted
      midline exactly (see decision c) so attaching metrics moves nothing.
- [ ] `alignY: Align | "baseline"` + `firstBaseline(ln)` with the factored lead math; floats
      excluded; grid recorded as follow-up.
- [ ] Testkit metrics: deterministic ascent/descent constants.
- [ ] **The consumer that makes it real** (engine-round's table precedent): the stat/metric
      composite aligns value and label on the shared baseline, and this is the _only_ consumer this
      round — one element family's corpus movement, readable in isolation.
- [ ] Deferred, recorded: PDF `drawTextAbs` exact baselines; tight display leading from cap
      metrics (a theme/element decision, not an engine one); optical icon alignment.
- [ ] Tests: engine baseline math (text v text at two sizes, nested col, no-baseline fallback),
      stat spec re-baselined knowingly.

### W-C · item 14 — maxLines, ellipsis, overflow (S–M)

- [ ] `TextLeaf.maxLines/overflow`; truncation in `measureUncached` (fragment-drop + trim + the
      ellipsis fragment per the edge-case rules); **`measureKey` gains both fields** (the designed
      key change).
- [ ] Backends: canvas/PDF/PPTX inherit truncated lines for free; DOM adds
      `-webkit-line-clamp`.
- [ ] Element surface: `text` data + bar control, table "clamp rows" control; defaults off.
- [ ] `text_clamped` event in `model/analytics.ts`, captured in the inspector writer.
- [ ] One catalog line for text `maxLines`.
- [ ] Deferred, recorded: per-node shrink (reuses `solveFitScale`, floor composition per
      decision d); card-title default clamps (needs corpus evidence first).
- [ ] Tests: measure truncation (height, key sensitivity, ellipsis fits, ellipsis styling, empty
    - clamp), render per backend, comment-tint-past-clamp, autofit × clamp probe interplay
      (`autofit.dom.test.ts` extension), copy check untouched (an ellipsis character is a glyph, not
      prose).

## Eval posture

The engine-round rule, applied per workstream: a phase states what may move before it runs, and
the CI `eval:shots` diff is read against that statement, never against silence.

- **A1 may move wrap points by sub-pixels.** Folding the plain wrap into `layoutRuns` replaces
  whole-line `measureText` calls with summed per-piece advances; shaping across a space can differ
  minutely, and a knife-edge line can flip. Before landing: a throwaway probe renders every corpus
  text leaf through old and new paths and diffs line counts; the acceptance bar is **zero line-count
  changes** on the corpus (width deltas under 0.5px are expected and fine). If a corpus leaf does
  flip, the flip is examined by eye before acceptance, and `fits-frame`/`fills-frame`/`leftEdges`/
  `typeSizes` are re-read rather than assumed. The shot images themselves render the unframed
  stack (the autofit-round note), so pixels move only if a wrap does.
- **A2 moves paged output for tall sections, deliberately.** Page breaks in Present/PDF/PPTX land
  on line boundaries where they used to slice glyphs. No corpus number tracks break positions;
  the proof is the re-baselined `overflow.dom.test.ts` + `docpdf` assertions, and one manual
  before/after PDF of the longest-paragraph corpus doc read by eye.
- **A3, B (engine half) move nothing.** Corpus-unchanged is the claim and the check: metrics are
  outputs, heights remain `lines × lineHeight`, baselines are attached where paint already was.
- **B (stat retrofit) moves stat sections only**, visually obvious, read section by section —
  the table-retrofit pattern.
- **C moves nothing** (defaults off; the key change alters cache identity, not measurements — a
  cold cache re-measures to identical numbers, asserted by a test that measures with and without
  a warm cache).

Each workstream lands independently green: `pnpm typecheck`, `lint`, full `vitest`, every
`check:*` guard, `build`, then the CI `eval:shots` run is read against the statement above before
the next workstream starts. Per the shared-tree convention, the full suite and shots run in CI,
not locally.

## Out of scope, crisply

- **Item 11, script-aware breaking**: the segmenter drops into `tokenize` (`commands.ts:461`) and
  the key gains a locale field per the key design above; the line-box shape is already
  segmentation-agnostic. Nothing else here waits for it.
- **Item 12, bidi**: visual-order fragments with source offsets are the door; direction fields,
  logical insets and reordering are not built.
- **Per-node shrink**: deferred with its design pinned (decision d).
- **Drop caps / text-on-path**: both are consumers of line boxes (an exclusion shape per line; a
  per-line transform); the seam they would use now exists, and neither is designed here.
- **Line-level Present reveals**: unlocked (a build group per `TextLine` window is expressible
  over one command), owned by the motion doc when scheduled.
- **Remote text-range selections**: collab stays element-level; the geometry they would read now
  exists (`rangeRects` over engine lines).
- **The `measureKey` separator hygiene fix**: recorded, free to do any time, not smuggled in.
