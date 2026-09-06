# Planning: where each control lives, the bar or the panel

> A per-element decision on which controls sit on the floating selection bar, which sit in the
> docked panel, which go, and which are missing altogether. The text bar is the ceiling: it is the
> densest bar we ship and it reads well, so no other bar gets denser than it. Everything an element
> can express on a bar of that size is a reason for the panel to stay closed, which it already does
> for any element whose controls all fit. Designed 2026-09-05. Supersedes the control half of
> [`element-surface.md`](element-surface.md) phase D; that doc's phases B, C, E and F stand, and its
> phase A (the inspector's gating bug) landed with this round.
>
> Status: built 2026-09-06, all six phases, awaiting manual QA. Deviations from the plan as written:
> the missing popup and tabs bars were a selection bug, not a bar bug (a press on a `hit:` affordance
> never selected anything; it now runs the affordance and selects what it landed on); the bar's
> widget budget counts the wide kinds only (select, segmented, align), so the chart toggles fit; the
> `custom` control kind became `action` (the tab and form buttons); phase A of `element-surface.md`
> and the control half of its phase D landed here. This file is deleted once QA signs off, per
> `README.md`.

Companion docs: `element-surface.md` (the round this belongs to), `form-elements.md` (the family
this doc extends its rules to), `inspector-occlusion.md` (the panel's placement; not touched here),
`rendering.md` section 6 (the current-state text that phase F rewrites).

## How this was read

Every registered element (72 registrations, 67 palette tiles including the six form entries) was
placed in a scratch doc-format artifact on the running dev server, selected with Playwright at
1440 × 900, and its bar and panel were captured as crops. Four passes, about 180 screenshots, in the
session scratchpad under `survey/`, `survey3/` and `survey4/`; the bar and panel code has not changed
since the first pass (the only edits in `SharedControlFields.tsx` since are the `thumbKey` sibling
write). The registry was dumped live for the routing table. Where a pass could not select an element
(the windowed loader unmounts far sections; a tab chip runs its affordance instead of selecting)
the code was read instead, and the entry says so.

## The ceiling, measured

The text bar while editing is one compact select (style), a three-icon segmented (align), a
colour swatch reading Auto, eight mark buttons (bold, italic, underline, strike, code, colour,
highlight, link), the sparkle, pin, duplicate and delete: sixteen items in about 640px. Selected
but not editing it drops the marks and is about 380px. Nothing wraps, nothing has a label, every
widget is one of: a compact select, an icon-only or short-word segmented, a swatch that opens a
popover, an icon button that opens a popover (link), or an icon toggle.

What the survey found on the other bars, against that ceiling:

- The graphic's bar carries the paste-SVG textarea, two lines tall, with "2 elements imported"
  under it. A `vector` control has no compact form, so `Field` renders the panel widget.
- The tabs and popup bars are declared with a `text` control (`labels`, `label`). A text input has
  no compact form either, and in three separate captures a selected popup showed its ring and its
  comment button but no bar at all; the tabs element could not be selected through its chips, since
  a chip press runs the tab affordance. The cause of the missing bar is not yet traced (no console
  error, the region resolves for the ring and the comment button, no spec's `layout` throws when
  probed without a region); it is the first checklist item below.
- The container's bar shows the Baseline segment truncated to "aselin", and the Surface select
  renders blank when `surface` is unset, on the bar and in the panel.
- The container's bar puts a slider on the bar (columns, grid only). It is the only slider on any
  bar and it reads as an outlier.
- A bar over a left-aligned, fit-width element (icon, button, badge) is clipped by the sections
  rail: the bar clamps its centre to 130px from the stage edge, the rail is wider than that.
- The docked panel repeats every bar control above its own (Tone on the callout, Fit on the image,
  Direction and Align on the container, Header, Lines and Zebra on the table, Type on every chart
  and diagram, Style on the button), then adds "Pin in place", which the bar also has as an icon.
- A group whose every field is hidden still paints its heading: a photo's panel shows an empty
  COLOR and an empty PLAYER heading, a consequence of the group being derived from the control list
  rather than from the visible fields.
- The text element's Max lines slider is unreachable: text is rich text, so it never opens the
  panel, and the slider is not on the bar.
- Code is edited only through a textarea in the panel; the block itself is not editable in place.
- The form family has no bar fields at all; every field edit is a panel trip.
- A bullet item's bar (and a diagram label's, an FAQ answer's, a table cell's) has no Duplicate and
  no Delete: the seal that stops a unit's child from being dragged out also gates the two actions,
  in `ControlBars.tsx` (`structural`), `commands.ts` (`actionableSet`) and the grip. The intent is
  that the two are universal (rule 8).

## The rules

1. The bar holds the element's identity switch (type, kind, style) and its most-used look toggles.
   Allowed kinds on a bar: `select` (compact), `segmented` (icon options, or words of one syllable
   with at most four segments), `align`, `color`, `toggle` with an `icon`, `media` (the Replace
   button), `icon`, `iconColor`. Never: `text`, `number`, `slider`, `vector`, multiline anything.
   `check:elements` enforces the allowlist so a spec cannot declare a bar the bar cannot draw.
2. Bar width stays at or under the text bar's: at most four field widgets before the actions, and
   a segmented with more than four segments becomes a select. A bar that would exceed it moves its
   least-used field to the panel rather than wrapping.
3. Text that a person reads on the canvas is edited on the canvas. A single string label is
   `inlineText` (button today; badge, popup trigger, form submit and field label below); a
   multiline block is inline too once `inlineText` learns newlines (code). A text control in a panel
   is for strings the canvas does not paint (a URL, an alt text, a success message, tab names until
   chips edit in place).
4. The panel shows the controls the bar does not, then the generic rows the schema cannot express
   (corner radius from `frame`, height from `resize`, column span under a grid, the position block).
   It does not repeat the bar. The panel header's Delete goes, since the bar has it on every tier.
5. The panel-skip rule stays as it is: rich text, or every control on the bar and no frame, keeps
   the panel closed. The work below is what makes more elements satisfy it.
6. Position: the bar's pin icon toggles; the panel shows the position block only while pinned
   (anchor grid, offset, layer, rotation) or when a dock is set. An unpinned element shows no
   position rows, so a panel with nothing else to say stays closed.
7. A control with no reachable surface is a bug, not a backlog item: `maxLines` on text today, and
   anything a phone cannot reach because the desktop handle is its only writer (heights, sizes).
8. Duplicate and Delete are on every bar, for every element, whatever its parent. They are generic
   actions, not structural privileges. Today a bullet item, a diagram label or an FAQ answer shows
   neither, because the bar, the keyboard commands and the drag grip all read the same `movable`
   predicate, which the 2026-08-18 seal introduced for drag-out and the 08-24 multi-select round
   extended to the actions. The seal stays what it was meant for, drag-out and foreign drops; the
   two actions get their own meaning per parent:
    - an open container (the layout container, a tabs panel, a form): splice, as today;
    - an open unit (bullets, quote, stat): splice the item through the unit's `withChildren`, the
      same path `unitItem` already reorders through;
    - a closed unit: the spec says what the actions mean through two new facet hooks,
      `container.removeChild(data, i)` and `container.duplicateChild(data, i)`. FAQ removes or
      duplicates the question-and-answer pair; a diagram removes or duplicates item i (label, detail
      and its `itemsMeta` entry); tabs removes or duplicates the tab with its label; a table cell,
      a comparison or testimonial slot, and a callout body clear their text on delete and hide
      Duplicate, since the slot count is the element's shape.
      The bar shows Delete always and Duplicate when the parent defines it; the keyboard commands and
      `actionableSet` follow the same table instead of refusing with "edit it in place".

## Per element

Bar and panel columns list fields only; every bar also carries the sparkle, pin, duplicate and
delete where the element is movable, and align where it has slack. "Panel: none" means the element
skips the panel by the rule above. Sizes are for the change, not the element.

### Text

| Element | Bar today                                  | Bar proposed                                                                   | Panel today                         | Panel proposed     | Cut                  | Added                                                          | Size |
| ------- | ------------------------------------------ | ------------------------------------------------------------------------------ | ----------------------------------- | ------------------ | -------------------- | -------------------------------------------------------------- | ---- |
| text    | style · align · color, marks while editing | same, plus a compact Lines select (Auto · 1 · 2 · 3 · 4 · 6) with a lines icon | never opens; Max lines slider dead  | none               | the dead slider      | a reachable clamp                                              | XS   |
| bullets | marker (six glyphs)                        | same                                                                           | none                                | none               |                      |                                                                |      |
| callout | tone                                       | same                                                                           | Tone (dup) · Corner radius · Pin    | Corner radius only | the dup, the pin row |                                                                | XS   |
| code    | none                                       | none                                                                           | Code textarea · Corner radius · Pin | Corner radius only | the textarea         | `inlineText: "code"` with newline support in the inline editor | S    |
| quote   | none                                       | none                                                                           | none                                | none               |                      |                                                                |      |

### Media

One element, seven palette kinds. Prerequisite: `element-surface.md` phase A, so the panel gates on
the real `kind`.

| Kind                              | Bar today                                         | Bar proposed                                       | Panel today                                                                                                                  | Panel proposed                                                                    | Cut                                          | Added                                                                                                  | Size   |
| --------------------------------- | ------------------------------------------------- | -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ------ |
| photo, gif, illustration, sticker | Replace · Fit                                     | Replace · Fit · Shape (Frame · Circle, photo only) | Source · Fit · empty COLOR · Zoom · Focus × 2 · Corner radius · empty PLAYER · Alt · Pin (Shape and Ring missing by the bug) | Zoom · Focus across · Focus down · Corner radius · Ring (circle) · Link · Alt     | Source and Fit dups, empty headings, pin row | `href` under Link (an image on a site is a link more often than not; `EngineNode.link` already exists) | S      |
| video                             | Replace                                           | Replace                                            | as above, Player headings empty by the bug                                                                                   | Controls · Autoplay · Loop · Mute · Alt                                           | dups                                         |                                                                                                        | with A |
| icon                              | Icon · colour dots                                | same                                               | wrong (photo panel)                                                                                                          | none; size through the generic Height row when the panel opens for another reason | the whole wrong panel                        |                                                                                                        | with A |
| graphic                           | paste-SVG textarea · (Match theme colours hidden) | none                                               | wrong (photo panel)                                                                                                          | SVG import · Match theme colours                                                  | the textarea from the bar                    |                                                                                                        | XS     |

### Table

| Element | Bar today              | Bar proposed | Panel today                                                                                       | Panel proposed                                   | Cut           | Added                                                                                                                              | Size        |
| ------- | ---------------------- | ------------ | ------------------------------------------------------------------------------------------------- | ------------------------------------------------ | ------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| table   | header · lines · zebra | same         | Rows · Columns · Header (dup) · Lines (dup) · Zebra (dup) · Clamp · Density · Corner radius · Pin | Rows · Columns · Clamp · Density · Corner radius | dups, pin row | column widths: a `slots` facet on the table so the divider gesture resizes columns, the mechanism the process diagram already uses | M for slots |
| stat    | none                   | none         | none                                                                                              | none                                             |               |                                                                                                                                    |             |

### Composite

| Element                                                      | Bar today                                                                                   | Bar proposed                                                                                                                                  | Panel today                                                                | Panel proposed                                                  | Cut                                                                        | Added                                                                                                               | Size |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | --------------------------------------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ---- |
| container                                                    | direction · columns slider · align (Baseline truncates) · surface select (blank when unset) | direction icons · columns as a compact select (2..6, grid only) · align icons with a baseline icon · surface select reading "None" when unset | Direction (dup) · Align (dup) · Surface (dup) · Corners · Background · Pin | Gap · Distribute · Corners · Background · Corner radius (frame) | dups, pin row                                                              | `gap`; `frame: true` (the container half of the audit's L6)                                                         | S    |
| feature · profile · testimonial · pricing · cta · comparison | none                                                                                        | none                                                                                                                                          | none                                                                       | none                                                            |                                                                            |                                                                                                                     |      |
| faq                                                          | collapse                                                                                    | same                                                                                                                                          | none                                                                       | none                                                            |                                                                            |                                                                                                                     |      |
| tabs                                                         | Tab names text field (bar never shows)                                                      | none                                                                                                                                          | none                                                                       | Tab names · Default tab · Add tab · Remove last tab             | the text control from the bar                                              | a way to add and remove tabs at all: today the labels string and the sealed children cannot be grown by any gesture | S    |
| popup                                                        | Trigger text field · Panel/Menu (bar never shows)                                           | Panel · Menu                                                                                                                                  | Show panel toggle                                                          | none                                                            | the text control and the toggle (the trigger press already toggles `open`) | `inlineText: "label"` on the trigger; and the missing bar traced and fixed first                                    | S    |

### Charts

| Element     | Bar today | Bar proposed                                                                                                                           | Panel today                                 | Panel proposed               | Cut           | Added                  | Size |
| ----------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- | ---------------------------- | ------------- | ---------------------- | ---- |
| every chart | type      | type · stacked · smooth · value labels · gridlines as icon toggles, each gated by the type's capability flag (`element-surface.md` C1) | Type (dup) · four toggles · Pin · Data grid | Data grid · Height (generic) | dups, pin row | phones gain the height | S    |

### Diagrams

| Element       | Bar today    | Bar proposed                                                 | Panel today                                                    | Panel proposed                                   | Cut           | Added | Size |
| ------------- | ------------ | ------------------------------------------------------------ | -------------------------------------------------------------- | ------------------------------------------------ | ------------- | ----- | ---- |
| every diagram | type · style | same (shape and numbers would push the bar past the ceiling) | Type (dup) · Style (dup) · Shape · Numbering · Pin · Data grid | Shape · Numbering · Data grid · Height (generic) | dups, pin row |       | XS   |

### Basic

| Element  | Bar today   | Bar proposed                                                                                                                     | Panel today                                                      | Panel proposed              | Cut                                      | Added                                                 | Size |
| -------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | --------------------------- | ---------------------------------------- | ----------------------------------------------------- | ---- |
| button   | variant     | variant select · size (S M L) · shape (three icons) · link (icon button opening the same popover the text link mark uses) · icon | Label · Style (dup) · Size · Shape · Link · Leading icon · Pin   | none                        | the whole panel; label is already inline |                                                       | S    |
| badge    | none        | none                                                                                                                             | Text · Pin                                                       | none                        | the panel                                | `inlineText: "text"`                                  | XS   |
| divider  | none        | thickness as a compact select (1 · 2 · 3 · 4 · 6 · 8 px) · colour                                                                | Thickness · Color override · Pin                                 | none                        | the panel                                |                                                       | XS   |
| embed    | none        | none                                                                                                                             | Title · URL · Corner radius · Pin                                | Title · URL · Corner radius | pin row                                  | aspect handle for video URLs (`element-surface.md` D) | XS   |
| gradient | none        | from · to swatches                                                                                                               | From · To · Angle · Height · Pin                                 | Angle · Height              | dups, pin row                            |                                                       | XS   |
| spacer   | none        | none                                                                                                                             | Height (number) · Pin                                            | Height                      | pin row                                  |                                                       |      |
| shape    | kind · fill | kind · fill · stroke                                                                                                             | Shape (dup) · Fill (dup) · Corner radius · Stroke · Weight · Pin | Corner radius · Weight      | dups, pin row                            |                                                       | XS   |

### Forms (new family, `form-elements.md`)

| Element        | Bar today | Bar proposed                         | Panel today                                           | Panel proposed                            | Cut           | Added                                                                                                                                                                                                         | Size |
| -------------- | --------- | ------------------------------------ | ----------------------------------------------------- | ----------------------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| field          | none      | kind select · required (icon toggle) | Kind · Label · Placeholder · Required · Options · Pin | Placeholder · Options (select and choice) | dups, pin row | `inlineText: "label"` on the painted label, so the field's caption edits on the canvas like a button's                                                                                                        | S    |
| the five forms | none      | none                                 | Submit label · After submitting · Pin                 | After submitting                          | pin row       | `inlineText: "submitLabel"` on the painted submit button; "Add field" in the panel that appends a `field` (the container is open, so a palette drop also works, but the panel action is the discoverable one) | S    |

### Section popup

Unchanged in shape (presets, then Width, Pin to top, Background); `element-surface.md` phase D
adds Shape and Contrast. One fix here: the WIDTH heading paints with nothing under it on a doc when
the width control is filtered out, the same empty-group bug as the panel.

## Cross-cutting fixes

1. Trace and fix the missing bar for popup (and confirm tabs once selectable). Reproduced in three
   captures; the suspects are the `text` control's compact rendering and the region lookup, neither
   proven. Rule 1's allowlist removes the text controls from those bars anyway, but the cause must be
   known: a bar that silently fails to mount is worse than a bar with a bad widget.
2. `SchemaFields` derives its groups from the visible fields, so a heading never paints alone.
3. The bar's horizontal clamp accounts for the sections rail: the left bound is the rail's right
   edge plus a margin while `leftOpen`, the stage edge otherwise. Same for the right rail.
4. A compact segmented never truncates: options on a bar carry an `icon`, or the bar variant drops
   `flex-1 truncate` for `flex-none`. Baseline gets an icon.
5. An unset select reads its default: the container's Surface shows "None", the Dropdown gets a
   `placeholder` from the field's first option or an explicit "None" option where unset is a state.
6. The panel omits bar controls, the pin row and the header's Delete. Two consumers change:
   `ElementInspector` filters `panelControls` by `!bar.includes(key)`, and the position block gates
   on `pin || dock`.
7. `inlineText` learns multiline (code) and applies to the four new sites (badge text, popup label,
   field label, form submit). The plain editor already flattens newlines to spaces; the code element
   needs them kept, so `inlineText` becomes `string | { key; multiline: true }`.
8. The bar-kind allowlist and a bar-width budget in `check:elements`: every `bar` key resolves to a
   control whose kind is allowed, and the count of field widgets is at most four. The width itself
   cannot be measured headlessly; the count is the proxy.
9. Tabs: add and remove. `withChildren` keeps `labels` and `children` in step; the panel's Add tab
   appends a container panel and a label, Remove drops the last of each. A chip press keeps running
   the affordance (that is what a reader expects), and the tabs element stays selectable through the
   strip's empty run and through Escape from a panel child.
10. Text's clamp reaches the bar as the compact Lines select; the slider goes.

## Phases

Each phase lands green through the full gate set (typecheck, lint, vitest, every `check:*`,
`eval:shots` unchanged, since nothing here moves geometry except a container that opts into `gap`).
The bar and the panel are the two files most of this touches, so the phases are cut by risk rather
than by file.

### Phase 1: make the bar honest (S)

- [ ] Trace the popup bar (fix 1); pin with a DOM test in `editor/core/__tests__` if the cause is
      in core, or a spec assertion if it is the `text` kind.
- [ ] Bar-kind allowlist and widget budget in `check:elements` (fix 8), failing on graphic, tabs,
      popup until the next items land.
- [ ] Graphic: `doc` off the bar. Tabs: `labels` off the bar. Popup: `label` off the bar,
      `inlineText: "label"`, `open` toggle removed.
- [ ] Bar clamp against the rails (fix 3). Segmented no-truncate and the baseline icon (fix 4).
      Unset select placeholder (fix 5).
- [ ] Container: columns as a compact select.
- [ ] Duplicate and Delete on every bar (rule 8): `removeChild` and `duplicateChild` on the
      container facet in `spec.ts`; implementations for bullets, quote and stat (generic splice
      through `withChildren`), faq (the pair), diagram (item i plus its meta), tabs (tab plus
      label), and the clear-on-delete fallback for table, the positional composites and callout.
      `ControlBars.tsx` `structural` splits into `canDelete` (always) and `canDuplicate` (parent
      defines it); `commands.ts` `deleteSelectedElements` and `duplicateSelectedElements` route
      through the same facet and `actionableSet` stops refusing; `movable` keeps gating drag, cut
      and paste-beside only. Tests in `canvas/elements/__tests__/ops.test.ts` per parent kind and
      `editor/core/__tests__/commands.test.ts` for the keyboard path.

Acceptance: every element with a `bar` shows one; no bar wider than the text bar in the survey
positions; the graphic's bar is actions only; "aselin" and the blank Surface are gone; a bullet
item, a diagram label and an FAQ answer each show Duplicate and Delete, and the actions do what
rule 8 says.

### Phase 2: make the panel the remainder (S)

- [ ] `ElementInspector` shows off-bar controls only; the position block gates on pinned or docked;
      the header's Delete goes (fix 6).
- [ ] Group headings follow visible fields (fix 2), in the panel and the section popup.
- [ ] Text's Lines select on the bar; `maxLines` slider removed from the panel list (fix 10).
- [ ] Callout, code, table, embed, shape, gradient, diagram panels shrink to the tables above by
      construction; check each against the survey crop.

Acceptance: selecting a callout shows a bar with Tone and a panel with Corner radius alone; a photo's
panel has no empty heading; text has a reachable clamp.

### Phase 3: inline what the canvas paints (S)

- [ ] `inlineText` multiline form; code element `inlineText: { key: "code", multiline: true }`, the
      code textarea removed.
- [ ] Badge `inlineText: "text"`; field `inlineText: "label"`; forms `inlineText: "submitLabel"`.
      Each arrange stamps the `label:` region the way the button does.
- [ ] Badge, popup and button drop to no panel; verify the routing dump agrees.

Acceptance: double-clicking a badge, a code block, a popup trigger, a field caption or a submit
button edits it in place; the registry routing dump lists badge, button, popup, divider, text,
bullets, faq, quote, stat and the six positional composites as bar-only.

### Phase 4: the bars that grow (S+)

- [ ] Button: variant select, size, shape icons, link popover (shared with the text link mark in
      `ControlBars.tsx`), icon button; panel gone.
- [ ] Divider: thickness select + colour; panel gone.
- [ ] Media: Shape on the bar for photos; `href` in the panel under Link, compiled to `node.link`.
- [ ] Charts: the four toggles as icon toggles on the bar, gated by the type flags from
      `element-surface.md` C1 (land C1 first or together).
- [ ] Shape: stroke swatch on the bar. Gradient: from and to on the bar.
- [ ] Field: kind and required on the bar.

Acceptance: the survey re-run shows each bar at or under the text bar's width at 1440; the routing
dump shows the panel closed for button and divider.

### Phase 5: the controls that were missing (M)

- [ ] Tabs add and remove (fix 9), Default tab select, tab names in the panel.
- [ ] Table column widths through a `slots` facet (the process diagram's `resizeSlots` is the
      template; the table's slot is a column, its data a per-column width array normalised to 100).
- [ ] Forms: "Add field" in the panel.
- [ ] Container `gap` and `frame`, embed aspect handle, generic Height row: taken from
      `element-surface.md` phase D as written; this doc owns the list, that doc's D now points here.

Acceptance: a person can grow a tabs element to four tabs and back without touching JSON; a table's
columns resize by drag like a row's; a form gains a field from its panel.

### Phase 6: docs and the survey as a fixture (XS)

- [ ] `rendering.md` section 6 rewritten from the tables above (folds into `element-surface.md`
      phase F if that lands first).
- [ ] The survey script becomes `scripts/survey-controls.ts` (untracked scratch today), so the
      next round can re-run it against a dev server in one command. Not a CI job; a tool.

## Order

1 before 2 (the panel filter assumes bars are honest). 3 before 4 (the button and popup bars
assume their label is inline). 5 is independent and can interleave. `element-surface.md` phase A is
a prerequisite for everything media, and C1 for the chart toggles.

## Open questions

- Whether the bar should show the `Lines` select for every text or only for headings, where a
  clamp is the common case. Every text is the simpler rule; revisit if the bar reads crowded.
- The button bar lands at roughly the text bar's editing width with variant as a select; with
  variant as a segmented it is wider. The table above chooses the select; a survey re-run decides.
- Whether tab chips should edit their label in place when the tabs element is selected (a second
  `label:` seam per chip), which would empty the tabs panel of Tab names. Deferred until the panel
  version has been used.
- Charts on the bar: five widgets (type plus four toggles) is one over the budget in rule 2. The
  toggles are icon-only and gated, so most types show two or three; the rule counts declared
  widgets, so either the budget counts visible widgets or charts get an exception. Prefer counting
  visible widgets over the type's default data.
