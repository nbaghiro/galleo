# Galleo — Shared UI Component Library (`@ui`)

> **Status: Phase 1 + Phase 2 complete.** The module is in (`ui/*`, wired via the
> `@ui` alias); typecheck/lint/build green. Phase 2 migrated ~113 clean call-sites across 25 files (after
> extending the atoms), **unified both icon systems onto `@ui/icons`** (deleted `editor/icons.tsx` +
> `app/components/icons.tsx`; stroke stays theme-reactive via `UiThemeProvider` at the app/editor/publish
> roots), adopted `ScaledSectionCanvas`, **consolidated the present surfaces into `@ui/present`
> `PresentSurface`**, and moved the cursor context-menus onto `Popover`. `@ui` is now imported by 30 files
> (was 10). Only genuinely-bespoke UI remains inline (see "Intentionally bespoke"). This doc is the build
> spec; it reflects the current code (not the earlier shelved sketch).

## Why

Generic Solid UI is scattered, mis-homed, and duplicated. Current-code audit:

- **Two literal copies** of `Dropdown` + `ColorPopover` + the portal-positioning scaffolding
  (`THEME_VARS`, `readThemeVars`, `CHEVRON`/`CHECK`) — `editor/inspect/widgets.tsx` ⟷
  `app/components/widgets.tsx`. Only diff: `data-galleo-toolbar` (editor-only). The app copy exists
  solely to avoid `app → @editor` (a layering leak).
- **~40** hand-inlined "eyebrow" labels; **~30** icon-buttons; **~19** buttons (no `danger` variant —
  red is injected via inline style); **~12** segmented toggles; **~10** chips/badges; **3** hand-rolled
  spinners — all raw Tailwind, drifting.
- **7** independent modal shells (6 z-values, 5 scrim opacities, 4 backdrop-dismiss idioms, no focus
  trap anywhere); **4 byte-identical** copies of the popover position math.
- **Two** icon systems (`editor/icons.tsx` `<Icon name>` renderer · `app/components/icons.tsx` named
  `<CheckIcon/>`), ~10 duplicated glyphs, `iconStyle()` written twice.
- The scaled-section-canvas cssText formula appears **5×**; `editor/canvas/Present.tsx` ⟷
  `app/views/PresentView.tsx` are **~80%** the same component.

## Layering — two homes, not one

A Solid component shared by `editor` + `app` can't live in `app/` (editor is below it) or `canvas/`
(framework-free). It needs a new low layer.

- **`canvas/render/` (pure TS, no Solid)** — the framework-free geometry/paint helpers. The rule the
  audit confirmed: strings assembled for `.style.cssText` + consumed by imperative `paint()` stay here.
- **`ui/` (`@ui`, new Solid module)** — every Solid component. Depends on `@themes` + `@canvas` (the
  shared section renderer paints through the canvas backends), nothing higher.

Layering becomes `model ← canvas ← ui ← editor ← app` (linear — `ui` is Solid and sits just above
`canvas`). ESLint zone: `ui` may import `model` + `canvas`, but not `editor`/`services`/`app`. Wiring =
`tsconfig.json` paths + `vite.config.ts` alias + the eslint zone + the `include` list.

## Module layout (Option A — flat category files)

```
ui/                @ui · Solid · depends only on @themes
  button.tsx       Button · IconButton · Chip · Badge · Spinner · Eyebrow
  inputs.tsx       TextField · TextArea · Toggle · Slider · Segmented · AlignField
                     · FieldRow · Group · PanelHeader · inputCls
  select.tsx       Dropdown · SelectField
  color.tsx        ColorPicker · ColorPopover · ColorSwatch · isHex · textColorSwatches · highlightSwatches
  overlay.tsx      Popover · Modal · ConfirmDialog · FloatingBar
  section.tsx      ScaledSectionCanvas · SlideProgress · backdropHostStyle
  icons.tsx        Icon (merged registry, ~70 glyphs) + generated named *Icon wrappers
  visual.tsx       Visual (+ visuals.css)
  tokens.css       field-surface · floating-panel · swatch/swatch-active · toolbar-btn
```

Base atoms come first in each file; composites below them import from the same or a sibling module.

## Component catalog

Legend: **B** base atom · **C** composite · _port_ = current source to lift.

### `button.tsx`

| Component    | Lvl | Props                                                                                                                                          | Port                                  |
| ------------ | --- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| `Button`     | B   | `variant: primary\|outline\|tool\|ghost\|danger` · `size: sm\|md\|lg` · `rounded?: md\|lg\|xl\|full` · `loading?` · `disabled?` · native attrs | 19 sites; danger new (modals.tsx:143) |
| `IconButton` | B   | `size: xs\|sm\|md\|lg\|xl` (h-5/6/7/8/9) · `rounded?` · `tone: muted\|soft\|onDark` · `active?` · `bordered?` · `title`                        | Topbar.tsx:122                        |
| `Chip`       | B   | `variant: outline\|solid` · `selected?` · `onClick?`                                                                                           | MediaPicker:612                       |
| `Badge`      | B   | `tone: accentSoft\|accentSolid\|muted`                                                                                                         | Topbar:209                            |
| `Spinner`    | B   | `size?` · `tone: accent\|current\|line`                                                                                                        | Topbar:227                            |
| `Eyebrow`    | B   | `tracking?: wide\|wider\|widest` · `size?` · `as?`                                                                                             | ~40 sites                             |

### `inputs.tsx`

| Component     | Lvl   | Props                                            | Port                                |
| ------------- | ----- | ------------------------------------------------ | ----------------------------------- |
| `TextField`   | B     | `value, placeholder?, onChange`                  | fields.tsx:168                      |
| `TextArea`    | B     | `value, placeholder?, rows?, onChange`           | fields.tsx:181                      |
| `Toggle`      | B     | `value, onChange`                                | fields.tsx:139 (was `ToggleSwitch`) |
| `Slider`      | B     | `value, min, max, step?, unit?, onChange`        | fields.tsx:114 (was `SliderRow`)    |
| `Segmented`   | B     | `value, options:{label,value,icon?}[], onChange` | fields.tsx:55                       |
| `AlignField`  | C     | `value, onChange` (Segmented preset)             | fields.tsx:88                       |
| `FieldRow`    | C     | `label?, children`                               | fields.tsx:44                       |
| `Group`       | C     | `label, divider?, children`                      | fields.tsx:29                       |
| `PanelHeader` | C     | `title, action?`                                 | fields.tsx:19                       |
| `inputCls`    | token | —                                                | fields.tsx:14                       |

### `select.tsx`

| `Dropdown` | B | `value, options:{label,value,font?}[], onChange, compact?, placeholder?, toolbar?` | widgets.tsx:80 (`toolbar?` replaces hardcoded `data-galleo-toolbar`) |
| `SelectField` | C | `value, options, onChange, compact?` | fields.tsx:154 |

### `color.tsx`

| `ColorPicker` | B | `value?, swatches, onChange, onPick?, clearLabel?, clearWhenEmpty?, keepFocus?` | widgets.tsx:227 |
| `ColorPopover` | C | `value?, swatches?, onChange, clearLabel?, toolbar?` | widgets.tsx:333 |
| `ColorSwatch` type · `isHex()` · `textColorSwatches(t)` · `highlightSwatches(t)` | — | | widgets.tsx:220/225/306/324 |

### `overlay.tsx`

| `Popover` | B | `anchor: ref\|point\|stageBox` · `estHeight?` · `toolbar?` · portal + up-flip + theme-var snapshot + backdrop-dismiss + esc · `children` | extracts the 4 position copies + insert.tsx:201 context menu |
| `Modal` | B | `onClose` · `size: sm\|md\|lg\|xl` · `scrim: dim\|blur\|light` · `z?` · `animate?` · `themeSnapshot?` · `children` | collapses 7 shells |
| `ConfirmDialog` | C | `title, body, confirmLabel, onConfirm, onCancel, danger?, busy?` | modals.tsx:113 |
| `FloatingBar` | C | `tone: dark\|panel` · `anchor: bottomCenter\|free` · `rounded?, shadow?` · `children` | present bars + popover family |

### `section.tsx` (canvas-backed, on `canvas/render/geometry.ts`)

| `ScaledSectionCanvas` | C | `section, theme, profile, width?, frame: slide\|natural, lazy?, selected?, as?, onOpen?, index?` | unifies MiniCanvas · SectionThumb · StoryTile · Thumb |
| `SlideProgress` | C | `index, total` | Present.tsx:199 |
| `backdropHostStyle()` | helper | `(paged, background, tokens) → JSX.CSSProperties` | Present.tsx:172 |

`PresentSurface` (full two-file consolidation) is Phase 2 — it's a migration, not a fresh atom.

### `icons.tsx`

| `Icon` | B | `name, size?` — renderer + merged `PATHS` (~70 glyphs: 54 editor + ~16 app-only) + theme-reactive stroke | editor/icons.tsx:297 |
| Named wrappers (~26) | B | `CloseIcon`, `PlusIcon`, `CheckIcon`… each `= (p) => <Icon name=…/>` | app/components/icons.tsx |

### `visual.tsx` · `tokens.css`

`Visual` (9-variant animated backdrop, previews.tsx:133) + `visuals.css`. Class tokens:
`field-surface` · `floating-panel` · `swatch`/`swatch-active` · `toolbar-btn`.

## Theme awareness (Phase 1, built in from the start)

The app themes **entirely through CSS variables**: `themeCssVars(tokens)` stamps the full token surface
on a root element —
`--color-{canvas,panel,line,ink,soft,muted,accent,onaccent}`, `--radius`, `--border-width`, `--shadow`,
`--font-{display,body,mono}`, `--hw` (heading weight) — and Tailwind v4 `@theme` maps them to utilities
(`text-ink`, `bg-panel`, `border-line`, `bg-accent text-onaccent`, `font-display`, …).

**The rule for every `@ui` component:** style only through these theme utilities + `var(--radius)`,
`var(--hw)`, `var(--shadow)`, `var(--border-width)`. **Zero hardcoded colors.** Such a component recolors
automatically to whatever theme's vars are set on an ancestor — the identical path the app uses, so
parity is by construction (not an approximation).

Three specifics:

- **Portaled surfaces** (`Popover`, and any portaled `Modal`) escape the themed subtree, so the base
  primitive **snapshots the theme vars off its anchor** (`readThemeVars`) and re-applies them on the
  portaled node — exactly today's `Dropdown`/`ColorPopover`/`overlayThemeVars` pattern, lifted into
  `Popover`/`Modal` once so no consumer re-implements it.
- **`Icon`** derives stroke weight / cap from theme (`--hw`, `--radius`), read from a small `@ui` theme
  context (with a sensible default). `UiThemeProvider` supplies it at the app / editor / publish roots.
- **Non-color values** that vary by theme — corner radius, border width, shadow, heading weight — use
  `var(--radius)` etc. so shape tracks the theme too (a brutalist theme's square corners, a refined
  theme's round ones), matching the app.

## `canvas/render/geometry.ts` (framework-free)

- `scaledHostCss(layoutW, height, scale, center?)` → cssText for the scaled-canvas host (5 sites; the
  `center?` variant covers `fitSlideContent`).
- `fitToViewport(w, h)` → the scale-to-window `k` (Present ×2, verbatim today).
- `mountSectionStack(host, sections, profile, tokens, opts)` → wraps `paintSectionStack` + the
  relative-`fullW`-stage-then-set-height recipe (4 sites).

## Phase 1 — build order (fully additive; nothing existing is edited)

Both widget copies, both icon systems, and the two present files stay as-is → **no collision with the
active parallel session.**

1. Wire `@ui` (alias in tsconfig + vite, eslint zone, include list).
2. `canvas/render/geometry.ts`.
3. Base atoms — `button.tsx`, `inputs.tsx`, `select.tsx`, `color.tsx` (lift current impls, strip editor
   deps, theme via CSS-var classes only).
4. `overlay.tsx` — extract `Popover` (from the 4-copy math) + `Modal` (from the 7 shells) + `ConfirmDialog` + `FloatingBar`.
5. `icons.tsx` — merge registries, generate named wrappers, `@ui` theme context for stroke.
6. `section.tsx` — `ScaledSectionCanvas` + `SlideProgress` + `backdropHostStyle`.
7. `visual.tsx` + `tokens.css`.

**Verification:** `pnpm typecheck && lint && build`; sweep every component across
light/dark/brutalist + a custom theme to confirm app-exact theming.

## Phase 2 — migration

**Atoms extended first** (all additive / backward-compatible, so nothing existing changed behavior):
`Button` `dangerGhost` variant; `IconButton` tones `tool`/`danger` + size `2xs` + `auto` width + onDark-aware
`active`; `Chip` `soft` variant + `size`/`rounded`/`onRemove`; `Badge` `outline` tone + `size`/`uppercase`/`weight`;
`Eyebrow` `mono`/`weight`/`tone`; `TextField` `number`/`compact`/`icon`/`class` + ref & native-attr passthrough;
`TextArea` `rounded`/`class` + passthrough; new `CellInput` (borderless grid cell) + `Separator`; `Segmented`
`variant="accent"`; `SelectField` `toolbar`; `Modal` size `full` + `surface`; `FloatingBar` native-attr
passthrough + `center` anchor + `lg` pad + `gap`; `Popover` `at` cursor/point anchor; `ScaledSectionCanvas`
`radius`/`bordered`/`baseShadow`/`title`; new `@ui/icons` `agent` glyph + `AgentIcon`.

**Done (typecheck + lint + build green):**

- Deleted **both** `widgets.tsx` copies → `@ui/select` + `@ui/color`; `fields.tsx` generic primitives →
  `@ui/inputs` (re-exported under old names; its `SelectField` shim retired now that `@ui` `SelectField`
  has `toolbar`); `modals.tsx`/`ConfirmModal` direct at call sites.
- **~113 clean call-site swaps across 25 files** (Button · IconButton · Chip · Badge · Eyebrow · Spinner ·
  Segmented · TextField · TextArea · Modal · FloatingBar · SlideProgress · backdropHostStyle). Notables:
  the **three** present surfaces (`editor/canvas/Present`, `app/PresentView`, `publish/PublicView`) now
  share `@ui/section` `SlideProgress`+`backdropHostStyle` and `@ui/overlay` `FloatingBar` + onDark
  `IconButton`; workspace **modal shells** (`GenerateModal`, `ThemeEditor`, `DataEditor`, `MediaPicker`,
  `ShareModal`, `TemplatesView`) → `@ui/overlay Modal` (via new `size="full"`/`surface`); `Topbar`,
  `format-bar` (`iconBtn`/`btn` helpers deleted), `DataGrid` (`TOOL` const deleted), `ShareModal` (local
  `seg`/`input`/`primaryBtn`/`ghostBtn` deleted).
- **`ScaledSectionCanvas` adopted**: `previews.tsx` `MiniCanvas`+`SectionThumb` are now thin id-resolving
  wrappers over the atom (byte-identical paint via `scaledHostCss`), cascading to all 6 thumbnail consumers.
  The minimap `Thumb` (a fluid-width, live-canvas-width specialization — not the fixed-width atom) now
  shares the `scaledHostCss` formula.
- **Icon unification done**: repointed **24 files** + the `PresentView`/`PublicView` file-local svg maps onto
  `@ui/icons`; **deleted** `editor/icons.tsx` + `app/components/icons.tsx`. Stroke weight/cap stay
  theme-reactive via `UiThemeProvider` wired at the app root (App.tsx), the studio root (Studio.tsx), and
  the public viewer (PublicView) — portaled menus fall back to the atom's neutral mid weight (by design).
- **Present surfaces consolidated**: `app/PresentView` + `publish/PublicView` are now thin wrappers over
  `@ui/present` `PresentSurface` (shared paint + keyboard nav + control bar; ~145 lines of duplication
  removed). `editor/canvas/Present` stays separate (in-editor overview/exit variant) but shares the atoms.
- **Cursor menus on `Popover`**: `insert.tsx` `ContextMenu` + `LibraryView`'s "Open in…" menu rebuilt on
  `@ui/overlay Popover` (`at` cursor anchor + viewport clamp), dropping their hand-rolled backdrop/dismiss.
- Native `<select>` fully retired; hand-rolled spinners 6→**0**; `@ui` adoption 10→**30** files.

**Guidance learned:** most view UI is intentionally **bespoke** (auth form, hero panels, danger-_outline_ buttons, custom cards, dashed adds, drag handles, accent-filled segmenteds). Migrate only the genuinely-clean instances; leave bespoke. Use `@ui` directly, no wrappers (see [[galleo-ui-no-wrappers]]).

**Intentionally bespoke (not migrated, by design):**

- **Element-anchored action menus** — `Topbar` Artifact/Export menus, `LibraryView` card + batch "Move to"
  menus: right-aligned/upward dropdowns whose layout `Popover`'s left-aligned-below model doesn't reproduce
  without added complexity; they keep their own inline backdrop. (Cursor-positioned menus DID migrate.)
- **`SectionGenPopup` panel** anchors off a canvas region box (not a DOM element or cursor point) with its
  own in-canvas dismiss — left inline; its atoms (Spinner/Chip/Button/TextArea/Eyebrow) are migrated.
- Website CTAs (`.web` neo-brutalist design system), the editor's direct-manipulation handles/overlays, and
  the auth form.

**Optional tail:** `visual.tsx` (port `Visual` from `previews.tsx`) + `tokens.css` (shared class tokens) —
a Phase-1 leftover with no current consumer; do if/when a second consumer appears.

## Phase 3 — deeper consolidation (recurring patterns → shared primitives)

A second exhaustive pattern-family audit (menus · cards · loaders · indicators · floating panels · missed
reuse). New primitives built + adopted; typecheck/lint/build green.

**New `@ui` primitives:**

- **`@ui/menu`** — `Menu` · `MenuItem` · `MenuLabel` · `MenuSeparator` (on `Popover`; portaled, Esc/backdrop
  dismiss, flip-up, `role`-ready). Replaced **all** hand-rolled anchored dropdowns: Topbar Artifact/Export,
  LibraryView card + batch move menus (needed `Popover align="end"`, added). MenuItem reused in the
  cursor-menu rows. → hand-rolled `fixed inset-0` dropdown backdrops now **0**.
- **`@ui/overlay FloatingPanel`** — the inline surface shell (panel sibling of `FloatingBar`). Adopted by
  the studio asides (Panel flyout + rail, Minimap → `shadow="panel"`) and the inline toolbar/insert popover
  shells (format-bar color/link, insert picker, TextAiMenu, SectionGenPopup → `shadow="2xl"`). → hand-rolled
  `--panel-shadow` asides now **0**.
- **`@ui/gen-overlay GenOverlay`** — unified the byte-identical `SectionGenStage` (`gc-*`) + `ElementGenStage`
  (`eg-*`) sweep/glow overlays; keyframes defined **once** in `theme/styles.css` (`gen-lightsweep`/
  `gen-frameglow`, per-instance `--gen-speed`). Fixed the global `@keyframes gc-glow` name collision; deleted
  the dead `.gen-shimmer`/`.gen-spotbeam` CSS.
- **`@ui/status`** — `Meter` (Sidebar + Pricing usage bars), `StatusDot` (ShareModal "Live" + generate
  step/beat/narration/caption dots, incl. the ring marker), `EmptyState` (Trash + Library simple empties).
- **`@ui/color ThemeSwatch`** — the accent theme chip (ThemeEditor + LibraryView).
- **Atom extensions:** `Popover align`, `Button variant="link"`, `Separator onDark`.

**Missed-reuse cleanup:** `AuthPage` (was **zero** `@ui`) → `TextField`/`Eyebrow`/`Button`; `selection.tsx`
bars + `EditorView` toast → `FloatingBar`; TemplatesView format switcher → `Segmented` + the shared
`FORMATS` registry (`app/stores/library`); Sidebar folder inputs → `TextField`; +7 dividers → `Separator`,

- scattered Button/Eyebrow/link swaps.

**Intentionally NOT consolidated (documented):**

- **Per-context format labels stay distinct** — the format switcher's copy is deliberately different per
  surface (Topbar "Web" · ThemeEditor "Site" · GenerateModal "Document/Website"); homogenizing onto one
  label set would be a product-copy change, not a DRY. The shared `FORMATS`/`formatLabel` registry exists;
  each switcher keeps its own labels where intended.
- **Split-circle `Swatch`** (Topbar) — single site; the accent-square `ThemeSwatch` covers the 3 duplicated
  ones. **Example-prompt suggestion rows** (GenerateModal + ThemeEditor) — 2 sites/1 module, below the
  extraction bar; left as view content. **Danger-outline "Empty trash"**, the inverted Pricing billing
  toggle, TextAiMenu language pills / custom-instruction input (need `noBlur`/`disabled` on `Chip`), and the
  MediaPicker persistent source rail — each genuinely bespoke; reasons in the audit notes.

## Decisions

- **Layout:** Option A (flat category files) — matches the repo's grouped-named-files, shallow-nesting,
  no-barrels convention.
- **Renames:** `ToggleSwitch → Toggle`, `SliderRow → Slider` (Phase 2 updates imports regardless).
- **`toolbar?` prop** replaces the hardcoded `data-galleo-toolbar` on `Dropdown`/`ColorPopover`/`Popover`.
- **Theme:** CSS-var utilities only, zero hardcoded colors; portaled surfaces snapshot vars; `Icon`
  stroke via `@ui` theme context.
