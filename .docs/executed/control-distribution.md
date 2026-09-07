# Where each control lives: the bar or the panel

> The per-element contract for which controls sit on the floating selection bar, which sit in the
> docked panel, and what Duplicate and Delete mean under each parent. The text bar is the ceiling:
> it is the densest bar we ship and it reads well, so no other bar gets denser than it. Everything
> an element can express on a bar of that size is a reason for the panel to stay closed, which it
> does for any element whose controls all fit. The current per-element tables live in
> `.docs/rendering.md` §6; this doc records the rules and their reasons.

## The ceiling, measured

The text bar while editing is one compact select (style), a three-icon segmented (align), a colour
swatch reading Auto, eight mark buttons (bold, italic, underline, strike, code, colour, highlight,
link), the sparkle, pin, duplicate and delete: sixteen items in about 640px. Selected but not
editing it drops the marks and is about 380px. Nothing wraps, nothing has a label, every widget is
one of: a compact select, an icon-only or short-word segmented, a swatch that opens a popover, an
icon button that opens a popover (link), or an icon toggle. That density is the budget every other
bar is held to.

## The rules

1. **The bar holds the element's identity switch** (type, kind, style) **and its most-used look
   toggles.** The kinds a bar may draw are the `BAR_KINDS` set in `canvas/elements/spec.ts`:
   `select` (compact), `segmented` (icon options, or short words), `align`, `color`, `toggle` with
   an `icon`, `link` (an icon button opening the URL popover), `media` (the Replace button),
   `icon`, `iconColor`. Never: `text`, `number`, `slider`, `vector`, multiline anything — none has
   a compact form, and a spec naming one fails `check:elements` rather than rendering the panel
   widget over the canvas.
2. **Bar width stays at or under the text bar's.** `WIDE_BAR_KINDS` (`select`, `segmented`,
   `align`) are the widgets that take real width; a bar shows at most `BAR_WIDE_BUDGET` (4) of
   them, measured over `barControls(spec, spec.create())` — the controls visible for the default
   data, so `visibleWhen` gating counts. Narrow widgets (icon toggles, swatches) are free, which
   is what lets the chart bar carry its four capability-gated toggles beside the type select. A
   bar that would exceed the budget moves its least-used field to the panel rather than wrapping.
3. **Text that a person reads on the canvas is edited on the canvas.** A single string label is
   `inlineText`; a multiline block is inline too — `InlineText` is
   `string | { key; multiline: true }`, and the code element uses the multiline form. A text
   control in a panel is for strings the canvas does not paint (a URL, an alt text, a success
   message, tab names until chips edit in place).
4. **The panel shows the controls the bar does not**, then the generic rows the schema cannot
   express (corner radius from `frame`, height from `resize`, column span under a grid, the
   position block). It does not repeat the bar: `editor/panels/RightPanel.tsx` renders the
   remainder (`!bar.has(key)`). The panel has no pin row and no header Delete, since the bar
   carries both on every tier.
5. **The panel-skip rule:** rich text, or every control on the bar and no frame, keeps the panel
   closed. The distribution above is what makes most elements satisfy it.
6. **Position:** the bar's pin icon toggles; the panel shows the position block only while pinned
   (anchor grid, offset, layer, rotation) or when a dock is set (`pin() || dockable()` in
   `RightPanel.tsx`). An unpinned element shows no position rows, so a panel with nothing else to
   say stays closed.
7. **A control with no reachable surface is a bug, not a backlog item.** The canonical case was
   text's `maxLines`, reachable only through a panel that rich text never opens; it is now the
   compact Lines select on the text bar (`bar: ["style", "align", "maxLines", "color"]` in
   `canvas/elements/text/text.ts`).
8. **Duplicate and Delete are on every bar, for every element, whatever its parent.** They are
   generic actions, not structural privileges. The drag seal (`movable`) keeps gating exactly what
   it was meant for — drag-out and foreign drops — and the two actions get their own meaning per
   parent through two facet hooks in `canvas/elements/spec.ts`,
   `container.removeChild(data, i)` and `container.duplicateChild(data, i)`, routed through
   `canvas/elements/ops.ts` so the bar, the keyboard commands, and `actionableSet` all follow the
   same table:
    - an open container (the layout container, a tabs panel, a form): splice, the plain case;
    - an open unit (bullets, quote, stat): splice the item through the unit's `withChildren`, the
      same path `unitItem` already reorders through;
    - a closed unit: the spec's hooks say what the actions mean. FAQ removes or duplicates the
      question-and-answer pair; a diagram removes or duplicates item i (label, detail, and its
      `itemsMeta` entry); tabs removes or duplicates the tab with its label. Absent `removeChild`
      the slot empties instead of splicing — a text loses its words, anything else returns to its
      default — because a table cell, a comparison or testimonial slot, or a callout body cannot
      go: the slot count is the element's shape. Absent `duplicateChild` the bar hides Duplicate
      (`duplicableAt`).

## Enforcement

Rules 1 and 2 are mechanical: `barProblems` in `scripts/check-elements.ts` fails a bar key that is
not one of the spec's controls, a kind outside `BAR_KINDS`, a bar toggle without an icon, and a
wide-widget count over the budget — and the check is self-verifying, planting a bad bar (a text
input plus five selects) that must be reported twice over or the script exits red. Rules 4 and 6
hold by construction in `RightPanel.tsx`; rule 8's per-parent semantics are pinned by tests
(`canvas/elements/__tests__/ops.test.ts` per parent kind,
`editor/core/__tests__/commands.test.ts` for the keyboard path). Rules 3, 5, and 7 hold by
convention: nothing machine-checks that a painted string is inline or that every control has a
reachable surface, so a new element is held to them in review.

## Where things landed

The bars, as declared (`bar:` in each spec): text `style · align · maxLines · color`; bullets
`marker`; callout `tone`; container `direction · columns · align · surface`; faq `collapse`; popup
`variant`; table `header · lines · zebra`; media `src · fit · shape · glyph · color`; charts
`type · stacked · smooth · showValues · showGrid` (the toggles gated per type capability via
`visibleWhen: honours(...)`); diagrams `type · style` (shape and numbering would push past the
ceiling, so they stay in the panel); button `variant · size · shape · href · icon`; divider
`thickness · color`; gradient `from · to`; shape `kind · fill · stroke`; field `kind · required`.
Code, quote, stat, spacer, badge, embed, and the positional composites declare no field widgets —
their bars are actions only.

Inline-on-canvas sites (`inlineText`): button `label`, badge `text`, popup trigger `label`, code
`{ key: "code", multiline: true }`, field `label`, every form `submitLabel`.

The controls that used to be missing altogether exist: tabs grow and shrink through `Add tab` /
`Remove last tab` actions plus a Default tab select (`canvas/elements/composite/tabs.ts`,
`withChildren` keeping `labels` and `children` in step); table columns resize by drag through a
`slots` facet (`canvas/elements/table/table.ts`, the same mechanism the process diagram's divider
gesture uses); forms gain a field through the panel's `Add field` action; the container has `gap`
and `frame: true`; the panel offers a generic Height row wherever `resize` declares one, which is
what gives phones a height writer. These panel buttons are the `action` control kind — a button
whose `run` rewrites the data whole.

## Cross-cutting mechanics

- **An affordance press selects.** The popup and tabs bars that never appeared were a selection
  bug, not a bar bug: a press on a `hit:` affordance ran the affordance and selected nothing. It
  now runs the affordance and selects what it landed on, so the element's bar mounts.
- **A heading never paints alone.** `SharedControlFields.tsx` derives groups from
  `visibleControls`, so a group whose every field is hidden contributes no heading — in the panel
  and the section popup both.
- **The bar clamps clear of the rails.** The bar measures its own width and keeps the whole of it
  clear of the sections rail on the left and the palette rail (plus its flyout) on the right, so a
  bar over a left-aligned fit-width element is never clipped.
- **A compact segmented never truncates** — options on a bar carry an icon (baseline included) —
  and **an unset select reads its placeholder** (the container's Surface shows "None").

## The survey tool

`scripts/survey-controls.ts` (`pnpm survey:controls`) drives a dev server with Playwright, places
every registered element in a scratch artifact, selects it, and captures its bar and panel as
crops — the instrument the original audit was read with, kept so the next round re-runs it in one
command. A tool, not a CI job.

## Open questions

- **The budget's basis.** `barProblems` measures the wide-widget count against the default data
  (`spec.create()`), so a kind switched away from the default can show a set the check never
  probed. Counting the visible widgets was the right call over counting declared keys, but whether
  the check should probe every kind's data rather than only the default's is undecided.
- **Tab-chip inline labels.** Whether tab chips should edit their label in place when the tabs
  element is selected (a second `label:` seam per chip), which would empty the tabs panel of Tab
  names. Deferred until the panel version has been used.
