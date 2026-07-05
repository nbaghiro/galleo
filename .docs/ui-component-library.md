# Galleo — Shared UI Component Library (`@ui`) — deferred plan

> **Status: not built.** Shelved as overkill for now. The immediate leak (app reaching into
> `editor/inspect/widgets`) was instead fixed by **copying** `Dropdown` + `ColorPopover` into
> `app/components/widgets.tsx`. This doc captures the fuller plan for when it's worth doing.

## Why

Generic Solid components are scattered and mis-homed:

- `editor/inspect/widgets.tsx` holds `Dropdown` / `ColorPicker` / `ColorPopover` — and **app views import
  them** (`ThemeEditor`, `IntakeView`), i.e. `app` reaching _into_ an editor internal (a layering smell,
  since `editor` sits below `app`).
- `editor/inspect/fields.tsx` holds generic form primitives (`Segmented`, `Toggle`, `Slider`,
  `TextField`, `TextArea`, `AlignField`, `FieldRow`, `Group`, `PanelHeader`) tangled with the
  editor-schema dispatcher (`Field`, `SchemaFields`).
- `app/components/modals.tsx` has a generic `ConfirmModal`; `previews.tsx` has the generic `Visual`.
- Buttons, chips, spinners, tooltips are hand-rolled inline Tailwind in every view.
- **Two** icon systems: `editor/icons.tsx` (`<Icon name="…"/>`, a `PATHS` registry + a theme-reactive
  renderer) and `app/components/icons.tsx` (named `<CheckIcon/>` components).

A Solid component shared by both `editor` and `app` can't live in `app/` (editor sits below it) or in
`canvas/` (framework-free). It belongs in a new low layer that depends only on `@themes`.

## The module

`ui/` — a new top-level module, alias `@ui`, depending only on `@themes` (+ solid). Layering becomes
`model ← {canvas, ui} ← editor ← app`. ESLint zone: `ui` must not import canvas/editor/services/app.

```
ui/               @ui · shared Solid components · depends only on @themes
  button.tsx      Button (primary/ghost/outline/danger + sizes) · IconButton · Chip · Spinner
  inputs.tsx      TextField · TextArea · Toggle · Segmented · Slider · Dropdown · AlignField · FieldRow · Group · PanelHeader
  color.tsx       ColorPicker · ColorPopover · textColorSwatches · highlightSwatches
  overlay.tsx     Popover (extracted portaled-position primitive) · Modal (dialog shell) · ConfirmDialog · Tooltip
  icons.tsx       the unified icon set — one PATHS registry + the themed `Icon` renderer + named exports
  visual.tsx      Visual (9-variant animated backdrop) + visuals.css
  playground.tsx  the /ui showcase
```

### Components: move / create

- **Move out of `editor/inspect`:** `Dropdown`, `ColorPicker`, `ColorPopover`, swatch palettes; the form
  primitives from `fields.tsx` (`Segmented`, `Toggle`, `Slider`, `TextField`, `TextArea`, `AlignField`,
  `FieldRow`, `Group`, `PanelHeader`).
- **Move out of `app/components`:** `ConfirmModal` → `ConfirmDialog`; `Visual` (+ `visuals.css`).
- **Create (inline today):** `Button`, `IconButton`, `Chip`, `Spinner`, `Tooltip`, `Modal` (the shell
  `CreateModal`/`ConfirmDialog` re-implement), `Popover` (the portaled fixed-position primitive that
  `Dropdown` **and** `ColorPopover` each duplicate — extract once, both build on it).

### Icons — the widest-touching part

Unify by merging both path sets into one registry in `@ui/icons`, exposing **both** APIs — the `Icon`
renderer _and_ named component wrappers — so neither `editor` (`<Icon name>`) nor `app` (`<CheckIcon/>`)
changes its call-site style, only its import. This touches nearly every editor + app component, so it's
the reason to do the whole thing as one clean pass on a quiet tree.

### Stays put

`Field` + `SchemaFields` (interpret the editor's `ControlField` schema) → `editor/controls.tsx` importing
`@ui`. `CreateModal`, `SectionThumb`, `PreviewCanvas` stay in `app` (feature/canvas-specific), built on
`@ui` primitives.

## The playground

A dev route **`/ui`** rendering `ui/playground.tsx` — a mini-Storybook: every component grouped
(Buttons · Inputs · Color · Overlays · Icons · Decorative), each shown live with **controls to exercise
every prop** (variant, size, disabled, value…) built from the `@ui` inputs themselves (dogfooding), plus
a theme switcher to see the whole set across themes.

## Build sequencing

One clean pass — new components + all the moves + icon unification + playground — on a tree with no
in-flight edits to `editor/canvas/*`, `editor/inspect/*`, or the icon call-sites. Pairs naturally with the
editor 2-folder consolidation (see below).

## Related: the editor 2-folder consolidation (agreed, also pending a clean tree)

Collapse the five feature folders into two, consolidating small files into longer ones:

```
editor/
  editor.ts · Studio.tsx · icons.tsx · controls.tsx · register.ts
  canvas/   Canvas(+embeds) · select(selection+handles) · insert(+dnd) · text-editor(+text-format) · inspect(inspectors+format-bar) · Present
  chrome/   Topbar · Panel · Minimap · AgentPanel
```

`dnd → insert`, `embeds → Canvas`, `text-format → text-editor`, `selection+handles → select`,
`inspectors+format-bar → inspect`, `fields → controls` (widgets go to `@ui`). 25 files/5 folders →
15 files/2 folders.
