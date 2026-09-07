# Interactivity: links, disclosure, and live overlays

> How a published doc or site is something a reader can use: real links, accordion and tab
> disclosure, playing video, popups, menus and forms. Three mechanisms, chosen after a deliberate
> attempt to put all of it in the engine failed for two of the three: **semantics ride on the
> render command** (cross-backend), **disclosure is element data plus a viewer-side content patch**
> (the engine stays pure), and **floating or live behavior is a portaled overlay anchored to a
> painted region** (the one thing the engine structurally cannot host).

Companion docs: `../rendering.md` (the engine and paint backends),
[`engine-gaps.md`](../planning/engine-gaps.md) (items 6 and 16 border this work),
[`motion-build.md`](motion-build.md) (the painter-reports-its-nodes seam this reuses),
`../frontend.md` (the `@ui` kit and layering law), `../collab.md` and `../comments.md` (the
systems that must not degrade), `../ai.md` (the catalog every authorable field must reach),
[`hit-geometry.md`](hit-geometry.md) (the shaped regions the viewer scan resolves against).

## 1. Architectures rejected, and the evidence

Recorded so they are not re-proposed. Both were investigated to code depth.

**A float-based popover (engine nodes with positive z).** Five independent barriers, each in a
different layer: `float.z` orders only within its own parent's subtree (`emit`,
`canvas/engine/layout.ts`), so later siblings and later sections always paint over it;
`composeSection`'s `clip:{x:true}` hard-crops it via `clip-path`; `bottom(commands)` counts the
float's box, so a "hovering" panel actually reserves space and pushes later sections down, and in
paged mode can cross `PAGINATE_ABOVE` and split the section; the slide's `overflow:hidden` plus two
nested `scale()` transforms clip it and re-anchor any `position:fixed` escape; and hit-testing
resolves by tree depth (`specificity`), not paint order, so a float can lose clicks to what it
covers. `ui/overlay.tsx` states the codebase's own conclusion: Popover portals precisely "so it
never clips in a scroller or shifts under a transform".

**Viewer state as a `LayoutCtx` input.** The `plain` flag is the honest precedent: one boolean,
threaded by hand through five signatures in `commands.ts` plus `fitSectionToFrame`, read at exactly
one line in the element library, set at one production call site, and silently omitted by every
export and eval path. Viewer state is worse than `plain` on every axis: it differs per viewer, so
the `SectionStackCache` key, the minimap effect, every preview surface, `fitSectionToFrame`'s six
probes, and every export would each need a policy. And a subtree that exists in data but not in
paint silently breaks selection, removes itself from drop-slot enumeration (drop-slot walking
stops descending at a missing region), degrades comment markers to the section top, and hides the
collab edit outline (`boxOfElement` has no section fallback). No element omits a child based on
ambient context; `stacksAtWidth` reflows but never removes.

**What dissolves the problem**: `SectionStackCache` reuses on `prev.section === section`, object
identity. A viewer override applied by _patching the content tree_ before compose changes that
identity along exactly the touched path, so the cache misses correctly with no new key, no
`LayoutCtx` change, and no signature threading. Disclosure state therefore lives in element data,
and the playback surface applies per-viewer patches through a pure function.

## 2. Semantics on the render command

A small set of semantic fields flows from element data through the node to the command, honored
per backend the way `surface` renders through three emitters sharing one contract
(`canvas/render/svg-emit.ts`).

**Model and engine carriers**: `EngineNode.link` and `link` on every `RenderCommand` variant,
carried by `emit` the same way `id` and `opacity` are; `TextLeaf.level` (`1 | 2 | 3`, set by the
text element from its style map, `h1 → 1` and so on, absent otherwise); `ImageLeaf.alt`, backed by
an `alt` data field and inspector control on the image element. `Run.link` needed no model change;
it always carried the href — before this round it was authored and silently dropped by every
backend.

**Producers**: `button.layout()` sets `node.link = data.href` (its whole box is the anchor). Rich
text needs nothing at compose time; runs already carry it.

**Backends**:

- **DOM** (`applyCommand` / `paintText` / `appendRuns`): a command with `link` becomes an `<a>`
  with `href`, `target="_blank"`, `rel="noopener noreferrer"` instead of a div; a run with `link`
  becomes an anchor instead of a span, underlined per the theme's ink. A text command with `level`
  gets `role="heading"` and `aria-level`. An image with `alt` gets `role="img"` + `aria-label` on
  the background-image path and a real `alt` on the zoomed `<img>` path. Anchors are focusable
  natively, which gives published pages their keyboard path into content. `paintReconcile` treats
  the div/anchor tag change as a replace, not a style reset.
- **PDF** (`canvas/render/export.ts` / `pdf-draw.ts`): `addLinkAnnot` registers a
  `Subtype: "Link"` dict with a URI action through pdf-lib's low-level context, one annotation per
  link-bearing command box, and per run fragment where `drawRuns` has fragment geometry.
- **PPTX** (`canvas/render/pptx.ts`): a linked run adds `options.hyperlink = { url }`; a
  link-bearing rect adds `ShapeProps.hyperlink`.
- **PNG / 2D canvas**: ignores `link`, by decision rather than omission.

**Surface interception, the one subtlety.** `applyCommand` is surface-agnostic, so navigation is
governed where the surfaces already own the pointer. The **editor** does not navigate on click
(click means select): `Canvas.tsx` has one capture-phase `click` listener on the stage that calls
`preventDefault()` for anchors within it; cmd/ctrl-click is allowed through, matching how design
tools treat links. **Present and publish** do not advance the slide on a link click: the paged
`onPointerUp` advance and the editor-present tap zones stand down when
`(e.target as HTMLElement).closest("a")` is non-null. Link policy in publish is new-tab always for
external hrefs.

**Internal links.** An href of `#<section id>` names a section of the same piece rather than a
URL, which is what a nav bar and a hero CTA need. `sectionLinkId` (`@model/artifact`) is the
single definition of the grammar, and three layers read it: the DOM backend paints such an href as
a plain anchor with no `target`/`rel` (external links keep both); `PresentSurface` delegates a
click on `a[href^="#"]` from its host to `goToSection`, which for a continuous format scrolls to
`sectionScrollTop` (the section's top less the height of anything pinned above it, so a stuck nav
does not cover the target's first line) and for a paged one steps to the section's first slide;
the editor's capture-phase interceptor scrolls to the section on cmd-click instead of navigating.
The popup's panel is painted into a portal outside the host, so the live component intercepts its
own anchors and hands the id back through `LiveProps.onSectionLink`. There is no section-picker
UI: the button's Link control takes the id by hand.

## 3. Disclosure as element data, with a viewer-side patch

**The state model.** An element's disclosure state is an ordinary authored data field, exactly
like the checklist's `checked`-on-the-child. `layout()` stays a pure function of `data`. The
authored value is the default every static surface renders: export, eval, thumbnails and the
corpus all show it, because the authored state is what they should show.

**The viewer layer.** Playback surfaces hold per-viewer overrides outside the DOM: a
`viewerPatches` map per surface instance (`ui/present.tsx`), keyed by the element's address key.
`withViewerPatches(content, patches)` is a pure tree op in `canvas/elements/ops.ts` (beside its
siblings, registry-aware via `childrenOf`), returning fresh objects only along touched paths, so
the section paint cache invalidates exactly the toggled section and no other. Keys are address
paths, which is safe because published content is immutable; no lazy id minting is needed.
Overrides live in the surface, so they survive windowing evicting and rebuilding a section's DOM,
and they are deliberately per-session.

**The interaction path.** The `hit:` affordance system, generalized from its original single
hardcoded case:

- Elements mint `hit:<action>:<addr>` regions exactly as `bullets.ts` does, addressed at the child
  whose data carries the state.
- The **editor**'s `runAffordance` is an action map (the checkbox lives in it); editor dispatch
  writes through `commit()`, because in the editor a toggle is the author setting the default.
- **`PresentSurface`**, for continuous formats, scans on pointer-up over the regions
  `paintSectionStack` returns: `viewerToggleAt` (`canvas/elements/ops.ts`) parses `hit:` ids,
  shape-tests the point through `inRegion`, and resolves the action to a data patch stored in
  `viewerPatches`, then repaints. Same regions, same parser, a different writer. A viewer toggle
  is never a document write, and a collab session shows zero outgoing ops during viewer toggling.

**The elements.**

- **`faq` has a `collapse` variant** (segmented control: `expanded`, the default, and
  `collapsible`, labeled "All open" / "Accordion"). In collapse mode each answer child carries
  `open` and the question wrapper mints `hit:disclose:<answer addr>`. The checklist pattern,
  verbatim.
- **`tabs`** (`canvas/elements/composite/tabs.ts`): a closed container whose children are the
  panels, with per-child labels; `data.active` selects which panel `arrange()` includes. The tab
  strip mints `hit:tab:<panel-i addr>`; activating means patching `active` to that child's index.
  In the editor the author clicks tabs to switch while editing (the affordance map handles it),
  and every panel stays reachable for selection and comments by switching to it, which is how
  design tools resolve the hidden-subtree problem: hidden content is one authored click away,
  never unreachable. Tabs is an ordinary palette element.

**Scope**: viewer-side toggling runs on **continuous formats only** (`toggleAt` sits on the
non-paged pointer path in `ui/present.tsx`). The paged path authors disclosure states fine, but a
tap on a slide advances the deck, and decks have builds rather than accordions; paged regions
travel now (`regionWindow`, see `hit-geometry.md`), so the remaining reason is the gesture, not
plumbing.

**One consequence, accepted**: toggling above the viewport shifts content. The editor's
`anchorScroll` idea can be ported if it turns out to matter; accordion toggles are usually in
view.

## 4. Live overlays: real DOM anchored to a painted region

The generalized video-player pattern, moved where every surface can use it.

**`ui/live.tsx`** (one flat concept file, imports `model` + `canvas` only):

- A registry: `registerLive(type, component)`, where the component receives `LiveProps` — `data`,
  `box`, `radius`, `surface` (`"editor" | "present" | "publish"`), `selected`, plus what portal
  composition needs: the resolved `theme` (after `sectionContentTokens` for the element's
  section), the `format`, the element's own `address`, and `onSectionLink` for internal links
  clicked inside a portal.
- `LiveLayer`: walks the content for live elements, finds each element's painted region (editor:
  the `regions()` signal; continuous playback: `paintSectionStack`'s regions; paged: mounted
  inside the slide's content div so the two scale transforms apply for free), and mounts the
  component absolutely over the box. Identity-caches per element id so players survive repaints.
- Pointer policy by surface: in the editor, interactive only when selected; in playback,
  interactive always, with the wrapper `pointer-events: none` and only the player itself `auto`,
  plus the `closest("a")` / `closest("[data-live]")` stand-down in the slide-advance handler.

**Selection and fallback.** `liveElements` (`canvas/elements/ops.ts`) selects
`tier === "interactive"` or a spec's `live` flag, which may be a data predicate
(`ElementSpec.live` in `canvas/elements/spec.ts`). `ElementSpec.fallback` reduces an interactive
element to what a surface with no live layer should show; `applyFallbacks`
(`canvas/elements/ops.ts`) applies it on the export path and is identity when nothing declares
one, so exports call it unconditionally.

**The registered live components**: `media` (covers every media kind; only a clip actually plays —
`liveElements` filters the rest), `embed` (a real iframe in playback only for providers `embedFor`
whitelists, YouTube and Vimeo; anything else keeps the static card — widening the whitelist is a
security review), `popup` (below), and the form elements (`FORM_TYPES`). The editor's old
`VideoEmbeds` layer is gone; the shared layer is the one implementation across editor, present and
publish.

**Not in scope, recorded**: sticky/fixed positioning (a nav bar that holds while the page scrolls)
is a coordinate-semantics change to the layout contract, not an element, and stays out until it is
designed on its own. Reading-order a11y (DOM order vs visual order) is real and separate.

## 5. The popup element

**One element, `popup`** (`canvas/elements/composite/popup.ts`), with a
`variant: "panel" | "menu"` (the container-merge lesson: no near-duplicate types). Data:
`{ children, label?, variant?, open? }`. The trigger paints in flow as a compact button-like chip
with a chevron; `menu` styles the panel as a tight column, and menu items are ordinary `button`
children, whose `link` makes them real anchors in the portal for free.

**The panel never paints in flow, on any surface.** An earlier form painted it in flow below the
trigger while open; that stretched the section's height and clipped the panel to the trigger's row
slot, which in a pinned nav (the main use case) is unusable. `arrange` paints the trigger alone
and `open` only turns the chevron. Export, thumbnails and the corpus therefore show the closed
trigger, which is correct, since a popup's content is transient UI rather than print content.

**Editor**: disclosure, exactly the faq pattern. `open` is authored data and the trigger mints
`hit:disclose:<self>` so the author toggles by click; the affordance map dispatches it.

**Playback**: the live layer owns it entirely. Popup keeps `tier: "container"` (editability) and
sets `live: true`. `seedViewerPatches` (`canvas/elements/ops.ts`) runs when `PresentSurface` loads
content and patches `{ open: false }` for live elements stored open, so playback always starts
closed regardless of the authored state — and only the ones actually left open are patched, since
a no-op override would rebuild that section's data on every repaint. The live component overlays
the trigger box; being `[data-live]` content, `pressOnContent` stands the slide-advance and the
viewer-toggle scan down, so a click never reaches the in-flow toggle path. On open it composes the
panel via `panelNode(data, ctx, address)` exported from the popup's own spec file, lays it out
with `layoutNode` at a clamped width (min 260, max `min(400, availWidth)`), and paints the
commands into a portaled `Popover` anchored to the trigger element, inheriting its positioning,
collision flip, scrim dismissal, Escape scope and theme-var bridge.

**Accepted, recorded**: in a scaled paged slide the portal paints unscaled (a popover reads as
chrome, and popups are a doc/site feature first); nothing inside the portal is selectable in
playback, which playback does not need. The painted chevron follows the authored state that
`seedViewerPatches` shuts, not the portal, so it does not flip as a reader opens the panel.

### 5.1 The floating panel

The panel is chrome on every surface. Playback floats it in the `Popover` portal already
described; the editor floats it over the canvas so it stays fully editable.

**The playback fall-through, root-caused.** A pinned layer stays in flow to stick, so
`paintSectionStack` gives it `z-index: 1` to ride over the absolutely positioned sections around
it (`PINNED_Z`, `canvas/render/backends.ts`). `PresentSurface`'s stage opens no stacking context,
so a live overlay host at `z-index: auto` would paint _under_ every stuck layer: a press on a
popup trigger in a pinned nav landed on the painted stack, `pressOnContent` saw no `[data-live]`
ancestor, and `toggleAt` flipped the popup's own `open` viewer patch, which is why the panel
appeared in flow and clipped to about 90px. The overlay host is therefore stacked at
`PINNED_Z + 1`. Two guards sit behind that fix: `toggleAt` carries a press on a pinned layer back
by the same `pinnedShift` the overlay uses (its regions are in the static layout), and it stands
down entirely on an element that has a live component, so the painted affordance and the portal
can never race.

**The editor overlay.** `editor/Canvas.tsx`'s `draw()` walks the artifact for open popups
(`openPopups` in `editor/core/leaf.ts`), composes each panel through the same `panelNode` at the
same clamped width (`panelFor`), lays it out and paints it into a per-popup absolutely positioned
host in the stage, anchored under the trigger's region box and flipped above it when it would
leave the viewport. The host sits after `paintHost` and before every piece of chrome, all of which
carries a `z-*` utility, so DOM order alone gets the stacking right.

What makes this cheap is that the panel's regions are **merged into the regions the canvas
publishes**, offset into stage coordinates. `panelNode` takes the popup's address and stamps its
children with exactly the ids `composeElement` would have given them in flow, so selection rings,
hover, the context menu, comments, multi-select, drag out of the panel and drop into it all work
with no per-feature code. Two seams were needed:

- Hit-testing resolves by specificity, not paint order, so panel regions carry a constant boost:
  a floating panel outranks whatever it covers, however deep that sits.
- Drop slots read a container's box to lay their hitboxes over it, and a popup's own box is its
  trigger. The panel publishes `contentRegionId(address)` (`content:<section>:<path>`, parsed by
  nothing else, `model/artifact.ts`) and dnd's `regionBox` prefers it, so slots follow the
  children rather than the chip.

Inline text editing inside the panel works because `paintedLeafFor`/`paintedNodeFor` resolve a
panel child through the same `panelFor` compose instead of `composeSection`, which no longer
contains it, and because the panel paint filters the edited element's text command the way
`paintSectionStack` does. One definition of the panel subtree, so the caret cannot sit at a size
the paint does not use.

## 6. What does not change

The engine's three passes, `compose`, `LayoutCtx`, `ctxFor` and every layout signature; the
`SectionStackCache` key; `fitSectionToFrame`; autofit's design; the eval corpus numbers (authored
defaults render exactly as static paint always did); collab, comments and drag-drop semantics in
the editor. Every authorable field this work added reaches the AI catalog
(`services/core/ai/prompts/catalog.ts`) — a field with no writer is dead surface, the
`SectionFrame` lesson.
