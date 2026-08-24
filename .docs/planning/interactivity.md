# Planning — interactivity: links, disclosure, and live overlays

> How a published doc or site becomes something a reader can use: real links, accordion and tab
> disclosure, playing video, and eventually popups and menus. Three mechanisms, chosen after a
> deliberate attempt to put all of it in the engine failed for two of the three: **semantics ride on
> the render command** (cross-backend), **disclosure is element data plus a viewer-side content
> patch** (the engine stays pure), and **floating or live behavior is a portaled overlay anchored to
> a painted region** (the one thing the engine structurally cannot host).
>
> Status: all four phases are built and green (2026-08-23), awaiting manual QA. Deviations taken
> during the build are recorded in the session notes and the significant ones inline below.

Companion docs: `rendering.md` (the engine and paint backends), `.docs/planning/engine-gaps.md`
(items 6 and 16 border this work), `.docs/planning/motion-build.md` (the painter-reports-its-nodes
seam this reuses), `frontend.md` (the `@ui` kit and layering law), `collab.md` and `comments.md`
(the systems that must not degrade), `ai.md` (the catalog every new authorable field must reach).

## 1. What is broken today, precisely

Verified against the code, not assumed:

- **Text links are authored and never rendered.** The mark bar writes `link` marks
  (`editor/panels/ControlBars.tsx:325-330`), `Run.link` carries the href (`model/text.ts`, with the
  comment "carried for hit-testing/editing, not painted here"), and no backend reads it: not
  `appendRuns`, not `drawRuns`, not `textSpec`, not the PDF path. Authors are setting links today
  that are silently dropped in every output.
- **The button's `href` is inert.** `canvas/elements/basic/button.ts:21` says "click-through wired
  per surface"; nothing reads it anywhere. `paint()` emits only `<div>`, never `<a>`.
- **Published video does not play.** The live player (`VideoEmbeds`) is `editor/Canvas.tsx`-only;
  present and publish paint the poster and a decorative triangle.
- **Published pages are not keyboard-navigable at all.** No painted node is focusable or carries
  `tabindex`, `role`, `aria-*`, or `alt`. Text exists as real DOM text but a screen reader cannot
  tell a title from a caption. The h1/h2/h3 semantic that `canvas/elements/text/text.ts:40` promises
  to "export + outline + a11y" is discarded at the `TextLeaf` boundary, which has no field for it.
- **No disclosure exists.** `faq` renders every answer permanently expanded; no element stores
  open/closed/active state; `PresentSurface` does no hit-testing on painted content.
- **Three stubs for an interaction layer were built and never wired**: `ElementSpec.fallback` (zero
  callers), `tier: "interactive"` (never read), and the `hit:` affordance system (one minted region,
  one hardcoded action, editor-only).

## 2. Architectures rejected, and the evidence

Recorded so they are not re-proposed. Both were investigated to code depth.

**A float-based popover (engine nodes with positive z).** Five independent barriers, each in a
different layer: `float.z` orders only within its own parent's subtree (`emit`,
`canvas/engine/layout.ts:302-341`), so later siblings and later sections always paint over it;
`composeSection`'s `clip:{x:true}` hard-crops it via `clip-path`; `bottom(commands)` counts the
float's box, so a "hovering" panel actually reserves space and pushes later sections down, and in
paged mode can cross `PAGINATE_ABOVE` and split the section; the slide's `overflow:hidden` plus two
nested `scale()` transforms clip it and re-anchor any `position:fixed` escape; and hit-testing
resolves by tree depth (`specificity`), not paint order, so a float can lose clicks to what it
covers. `ui/overlay.tsx:68` states the codebase's own conclusion: Popover portals precisely "so it
never clips in a scroller or shifts under a transform".

**Viewer state as a `LayoutCtx` input.** The `plain` flag is the honest precedent: one boolean,
threaded by hand through five signatures in `commands.ts` plus `fitSectionToFrame`, read at exactly
one line in the element library, set at one production call site, and silently omitted by every
export and eval path. Viewer state is worse than `plain` on every axis: it differs per viewer, so
the `SectionStackCache` key, the minimap effect, every preview surface, `fitSectionToFrame`'s six
probes, and every export would each need a policy. And a subtree that exists in data but not in
paint silently breaks selection, removes itself from drop-slot enumeration
(`editor/core/dnd.ts:350-351` stops descending at a missing region), degrades comment markers to the
section top, and hides the collab edit outline (`boxOfElement` has no section fallback). No element
today omits a child based on ambient context; `stacksAtWidth` reflows but never removes.

**What dissolves the problem**: `SectionStackCache` reuses on `prev.section === section`, object
identity. A viewer override applied by _patching the content tree_ before compose changes that
identity along exactly the touched path, so the cache misses correctly with no new key, no
`LayoutCtx` change, and no signature threading. Disclosure state therefore lives in element data,
and the playback surface applies per-viewer patches through a pure function.

## 3. The three mechanisms

### W1. Semantics on the render command

A small set of semantic fields flows from element data through the node to the command, honored per
backend the way `surface` already renders through three emitters sharing one contract
(`canvas/render/svg-emit.ts`).

**Model and engine carriers** (additive, nothing existing moves):

- `EngineNode.link?: string` and `RenderCommand` gains `link?: string`, carried by `emit` the same
  way `id` and `opacity` are.
- `TextLeaf.level?: 1 | 2 | 3`, set by the text element from its style map (`h1 → 1`, `h2 → 2`,
  `h3 → 3`), absent otherwise.
- `ImageLeaf.alt?: string`, plus a new `alt` data field and inspector control on the image element
  (media/gif/illustration follow the same one-line pattern where it makes sense).
- `Run.link` needs no model change; it already exists.

**Producers**: `button.layout()` sets `node.link = data.href` (its whole box is the anchor). Rich
text needs nothing at compose time; runs already carry it.

**Backends**:

- **DOM** (`applyCommand` / `paintText` / `appendRuns`): a command with `link` becomes an `<a>` with
  `href`, `target="_blank"`, `rel="noopener noreferrer"` instead of a div; a run with `link` becomes
  an anchor instead of a span, underlined per the theme's ink. A text command with `level` gets
  `role="heading"` and `aria-level`. An image with `alt` gets `role="img"` + `aria-label` on the
  background-image path and a real `alt` on the zoomed `<img>` path. Anchors are focusable natively,
  which gives published pages their first keyboard path into content.
- **PDF** (`export.ts` / `pdf-draw.ts`): pdf-lib 1.17.1 has no helper but the low-level path is
  public: register a `Subtype: "Link"` dict with a URI action via `pdf.context.obj(...)` and
  `page.node.addAnnot(ref)`, one annotation per link-bearing command box, and per run fragment where
  `drawRuns` already has fragment geometry. Additive to the emit path.
- **PPTX** (`pptx.ts`): `textSpec()` already builds one `TextProps` per run; a linked run adds
  `options.hyperlink = { url }`. A link-bearing rect adds `ShapeProps.hyperlink`. Both are typed in
  pptxgenjs 4.0.1.
- **PNG / 2D canvas**: explicitly ignores `link`, by decision rather than omission.

**Surface interception, the one subtlety.** `applyCommand` is surface-agnostic, so navigation is
governed where the surfaces already own the pointer:

- The **editor** must not navigate on click (click means select). `Canvas.tsx` adds one
  capture-phase `click` listener on the stage that calls `preventDefault()` for anchors within it.
  Cmd/ctrl-click is allowed through, matching how design tools treat links.
- **Present and publish** must not advance the slide on a link click. The paged `onPointerUp`
  advance and the editor-present tap zones stand down when
  `(e.target as HTMLElement).closest("a")` is non-null.

### W2. Disclosure as element data, with a viewer-side patch

**The state model.** An element's disclosure state is an ordinary authored data field, exactly like
the checklist's `checked`-on-the-child. `layout()` stays a pure function of `data`. The authored
value is the default every static surface renders: export, eval, thumbnails and the corpus all need
zero changes, because the authored state is what they should show.

**The viewer layer.** Playback surfaces hold per-viewer overrides outside the DOM:

```ts
// ui/present.tsx, per surface instance
viewerPatches: Map<string, Record<string, unknown>>; // key = elementRegionId address key
```

`withViewerPatches(content, patches)` is a pure tree op in `canvas/elements/ops.ts` (beside its
siblings, registry-aware via `childrenOf`), returning fresh objects only along touched paths, so the
section paint cache invalidates exactly the toggled section and no other. Keys are address paths,
which is safe because published content is immutable; no lazy id minting is needed. Overrides live
in the surface, so they survive windowing evicting and rebuilding a section's DOM, and they are
deliberately per-session.

**The interaction path.** The `hit:` affordance system generalizes from its single hardcoded case:

- Elements mint `hit:<action>:<addr>` regions exactly as `bullets.ts:84-87` already does, addressed
  at the child whose data carries the state.
- The **editor**'s `runAffordance` switch becomes a small action map (checkbox moves into it);
  editor dispatch keeps writing through `commit()`, because in the editor a toggle is the author
  setting the default.
- **`PresentSurface`** gains, for continuous formats, a pointer-up scan over the regions
  `paintSectionStack` already returns: parse `hit:` ids, box-test the point, resolve the action to a
  data patch, store it in `viewerPatches`, repaint. Same regions, same parser, a different writer.
  A viewer toggle is never a document write.

**The elements.**

- **`faq` grows a `collapse` variant** (segmented control: `expanded`, today's default, byte-
  identical output; `collapsible`). In collapse mode each answer child carries `open?: boolean` and
  the question wrapper mints `hit:disclose:<answer addr>`. The checklist pattern, verbatim.
- **`tabs`, one new element**: a closed container whose children are the panels, with per-child
  labels; `data.active: number` selects which panel `arrange()` includes. The tab strip mints
  `hit:tab:<panel-i addr>`; activating means patching `active` to that child's index. In the editor
  the author clicks tabs to switch while editing (the affordance map handles it), and every panel
  stays reachable for selection and comments by switching to it, which is how design tools resolve
  the hidden-subtree problem: hidden content is one authored click away, never unreachable.

**Scope guard**: viewer-side toggling ships for **continuous formats only** in this phase. The
paged path can author disclosure states fine, but `sectionSlides` pages carry commands without
regions today, and decks have builds rather than accordions; paged viewer toggling is deferred and
recorded, not silently included.

**One consequence to accept**: toggling above the viewport shifts content. The editor's
`anchorScroll` idea can be ported if QA finds it matters; accordion toggles are usually in view.

### W3. Live overlays: real DOM anchored to a painted region

The generalized `VideoEmbeds` pattern, moved where every surface can use it.

**`ui/live.tsx`** (new flat concept file, imports `model` + `canvas` only):

- A registry: `registerLive(type, component)`, where the component receives
  `{ data, box, radius, surface: "editor" | "present" | "publish", selected? }`.
- `LiveLayer`: walks the content for registered types, finds each element's painted region (editor:
  the `regions()` signal; continuous playback: `paintSectionStack`'s regions; paged: mounted inside
  the slide's content div so the two scale transforms apply for free), and mounts the component
  absolutely over the box. Identity-caches per element id so players survive repaints, exactly as
  `VideoEmbeds` does today.
- Pointer policy by surface: in the editor, interactive only when selected (current behavior); in
  playback, interactive always, with the wrapper `pointer-events: none` and only the player itself
  `auto`, plus the same `closest("a"), closest("[data-live]")` stand-down in the slide-advance
  handler.

**First consumers**: `video` and `embed`. `VideoEmbeds` in `editor/Canvas.tsx` is replaced by the
shared layer (a refactor, not a parallel copy), and `PresentSurface` mounts it, which is the change
that makes published video play. `embed` gets a real iframe in playback for whitelisted providers,
static card elsewhere. `tier: "interactive"` finally gets its reader: the `LiveLayer` mounts only
for elements whose spec declares it, and `fallback` gets its first caller in the export path for any
future live element whose static form differs from its data (video and embed keep identity).

**Popups and menus land here in phase D**, not in the engine: a `popup` element whose trigger paints
in flow and whose panel content is an authored subtree; in the editor, `open` paints the panel in
flow below the trigger (editable, selectable, commentable, ordinary nodes); in playback, the live
component renders the trigger state and, on open, composes the panel subtree via `composedNodeFor` +
`layoutNode` and paints it into a portaled `Popover` (`ui/` may import canvas, so this is legal),
inheriting Popover's positioning, collision handling, scrim dismissal, focus and Escape behavior for
free. This is sketched, deliberately: it is the one piece that gets a prototype gate before its
element is committed to the catalog, because the editor-flow-vs-playback-portal split needs to be
seen to be judged.

**Not in scope, recorded**: sticky/fixed positioning (a nav bar that holds while the page scrolls)
is a coordinate-semantics change to the layout contract, not an element, and stays out until it is
designed on its own. Reading-order a11y (DOM order vs visual order) is real and separate.

## 4. What does not change

The engine's three passes, `compose`, `LayoutCtx`, `ctxFor` and every layout signature; the
`SectionStackCache` key; `fitSectionToFrame`; autofit's design; the eval corpus numbers (every phase
below must leave `pnpm eval:shots` unchanged, since authored defaults render exactly as today);
collab, comments and drag-drop semantics in the editor.

## 5. Conventions binding the execution

The standing repo rules apply (AGENTS.md); the ones this work most touches: no suppressions ever;
one file per concept (`ui/live.tsx` is one concept; `withViewerPatches` goes in `ops.ts`, not a
sibling); comments terse and only where the code cannot speak (this whole plan should add fewer
than ten); copy without em-dashes (`check:copy` covers the new inspector strings); boundaries
enforced (an element spec still imports nothing above `model`; all Solid work lives in `ui/` or
above); request bodies through schemas (no new routes are added, so this is moot); canonical
Tailwind scale; `pnpm check:elements` must stay green as elements gain fields.

Every new authorable field reaches the AI catalog (`services/core/ai/prompts/catalog.ts`) in the
same change that adds it, per the `SectionFrame` lesson: a field with no writer is dead surface.
Data-level fields ride through `zElement` freely (`data` is `z.record`), so the catalog is the only
AI-side edit.

## 6. Phase A: links and the a11y floor

- [x] A1 `EngineNode.link` + `RenderCommand.link`, carried in `emit`; `TextLeaf.level`;
      `ImageLeaf.alt`.
- [x] A2 Producers: button sets `link`; text element sets `level` for h1/h2/h3; image element gains
      `alt` data + control + catalog line.
- [x] A3 DOM backend: anchor emission for linked commands and linked runs; heading roles; alt.
      `paintReconcile` handles the div/anchor tag change (its existing "kind change" reset covers
      style, but tag requires replace; extend the tag check beyond `DIV`).
- [x] A4 Editor: capture-phase click interception on the stage (cmd/ctrl-click passes). Present and
      publish: advance stands down inside `closest("a")`.
- [x] A5 PDF link annotations (command-level and run-fragment); PPTX run + shape hyperlinks.
- [x] A6 Tests: backends.dom (anchor emitted, rel/target, heading role, alt, reconcile across tag
      change), pptx (hyperlink option present), export (annotation registered), present.dom (advance
      suppressed on anchor click).
- [x] A7 Gates: full suite, all guards, `eval:shots` unchanged.

## 7. Phase B: disclosure

- [x] B1 `withViewerPatches` in `canvas/elements/ops.ts` + unit tests (fresh-path identity, cache
      correctness by reference).
- [x] B2 Editor affordance map (checkbox migrates; no behavior change).
- [x] B3 `PresentSurface` continuous hit scan + `viewerPatches` store + repaint-through-patch.
- [x] B4 `faq` collapse variant (default expanded, byte-identical), `hit:disclose` minting, chevron
      affordance in the question row, catalog + inspector strings.
- [x] B5 `tabs` element: spec, arrange, strip painting, `hit:tab`, editor palette entry, previews,
      skeleton, catalog. Register in `register.ts`; `check:elements` green.
- [x] B6 Tests: ops (patching), spec-level (active panel selection, region minting), present.dom
      (a viewer toggle repaints one section and writes no content), e2e spec for a published doc
      accordion.
- [x] B7 Gates as A7, plus: a collab session must show zero outgoing ops during viewer toggling.

## 8. Phase C: live overlays

- [x] C1 `ui/live.tsx`: registry + `LiveLayer` + identity cache + pointer policy.
- [x] C2 Video + embed live components; `editor/Canvas.tsx` `VideoEmbeds` replaced by the shared
      layer (one implementation, three surfaces).
- [x] C3 `PresentSurface` mounts `LiveLayer` for continuous and inside the paged slide content.
- [x] C4 `tier: "interactive"` read by the layer; `fallback` wired in export for future live
      elements (identity for video/embed, asserted by a test so the seam stays alive).
- [x] C5 Tests: live.dom (mount over region, identity survival across repaint, pointer policy per
      surface), present.dom (published video mounts a player).
- [x] C6 Gates as A7.

## 9. Phase D: the popup element

Promoted from sketch to spec (2026-08-23) against what phases B and C actually built; the original
prototype gate is folded into manual QA, since the mechanical risks it guarded are now resolved
below and the residual risk is visual judgment.

**One element, `popup`, with a `variant: "panel" | "menu"`** (the container-merge lesson: no
near-duplicate types). Data: `{ children, label?, variant?, open? }`. The trigger paints in flow as
a compact button-like chip with a chevron; `menu` styles the panel as a tight column, and menu items
are ordinary `button` children, whose Phase A `link` makes them real anchors in the portal for free.

**Editor**: disclosure, exactly the faq pattern. `open` is authored data; when open, `arrange`
paints the panel in flow below the trigger (a surfaced box: fill, border, radius, shadow), fully
editable, selectable, droppable. The trigger mints `hit:disclose:<self>` so the author toggles by
click; the affordance map already dispatches it. Export and eval render the authored state, so the
static story needs nothing.

**Playback**: the live layer owns it entirely.

- `ElementSpec` gains `live?: boolean`; `liveElements` selects `tier === "interactive" || spec.live`.
  Popup keeps `tier: "container"` (editability) and sets `live: true`.
- `PresentSurface` seeds `{ open: false }` viewer patches for popup elements when content loads, so
  playback always starts closed regardless of the authored state. Existing `withViewerPatches`
  machinery; no new mechanism.
- The popup live component overlays the trigger box, `pointer-events: auto` in playback; being
  `[data-live]` content, `pressOnContent` already stands the slide-advance and the viewer-toggle
  scan down, so the click never reaches the in-flow toggle path.
- On open it composes the panel via a pure `panelNode(data, ctx)` exported from the popup's own spec
  file (children through their specs' `layout`, no region ids needed), lays it out with `layoutNode`
  at a clamped width (min 260, max `min(400, availWidth)`), and paints the commands into a portaled
  `Popover` anchored to the trigger element, inheriting its positioning, collision flip, scrim
  dismissal, Escape scope and theme-var bridge.
- `LiveProps` gains what panel composition needs: the resolved `theme` (after
  `sectionContentTokens` for the popup's section) and `format`, resolved once in `LiveLayer`.

**Accepted for v1, recorded**: in a scaled paged slide the portal paints unscaled (a popover reads
as chrome, and popups are a doc/site feature first); panel content has no region ids in the portal,
so nothing inside it is selectable in playback, which playback does not need.

- [x] D1 `ElementSpec.live`; `liveElements` widened; `LiveProps` + `LiveLayer` carry theme/format.
- [x] D2 `canvas/elements/composite/popup.ts`: spec, both variants, in-flow open arrange,
      `hit:disclose` mint, `panelNode` export, preview, skeleton, palette + catalog entries.
- [x] D3 The live component in `ui/live.tsx` (or a sibling registration site if the file grows past
      one concept): trigger overlay, seed-closed patches in `PresentSurface`, `Popover` portal
      painting `panelNode` output.
- [x] D4 Tests: spec-level (variants, hit mint, panelNode composition), ops (`liveElements` with the
      `live` flag), present.dom (seeded-closed patches), plus the e2e spec extended.
- [x] D5 Gates as A7; corpus unchanged (popup appears in no corpus artifact).

## 10. Decisions needing approval before execution

1. **Link click policy in publish**: new tab always (`target="_blank"`, the plan's default), or
   same-tab for same-origin. Default stands unless overridden.
2. **`tabs` in the palette from day one**, or catalog-only until the editor affordance feels right.
   Plan default: palette from day one, since the editor toggle path ships in the same phase.
3. **Embed iframes in publish**: provider whitelist scope (YouTube/Vimeo only, matching `embedFor`,
   is the default; anything wider is a security review).
4. **Paged viewer toggling deferred** (section 3, W2 scope guard): confirm, or pull it in and accept
   the regions-through-`sectionSlides` plumbing now.

## 11. Execution notes for the implementing agent

Work the phases in order; each lands independently green before the next begins. Run the full gate
set per phase (typecheck, lint, vitest, all `check:*` guards, build); `eval:shots` runs on CI, so
assert the corpus invariant by leaving every layout-affecting path untouched and let CI confirm.
Never commit or push; leave the tree for review. Where this plan and discovered reality disagree,
stop and surface it rather than improvising past it, with one exception: purely mechanical details
(an import path, a test file name) follow the repo, not the plan.
