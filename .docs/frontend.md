# Galleo — Frontend Platform

> The SolidJS frontend platform: the **shared component library** (`@ui`) every frontend module builds
> from, and the **keyboard-control + command-palette** system layered on top of it. Companion to
> `architecture.md` (the layering law), `rendering.md` (the framework-free paint layer these components
> drive), `ai.md` (the streamed turn protocol chat/generate commands wire to), and `testing.md` (the
> pure-logic test style everything here follows).

**The shell law.** `model` + `canvas` are framework-free; the layout engine paints render commands
imperatively into refs. **SolidJS owns only the shell + state.** Because the layering makes cross-module
reuse illegal (`app → @editor` is a boundary violation), **`ui/` is the only shared home** — any Solid
component used by more than one frontend module lives there, never duplicated per-module or reached across a
sibling boundary. The platform is **registry-driven**: elements (`canvas/elements/register.ts`), themes, and commands
all register a record, so _adding a shortcut / element / theme = adding a record_, and the palette, sheet,
and tooltips pick it up automatically.

**Layering law (stated once).** `model ← canvas ← ui ← editor ← app`, linear. `ui/` is Solid and sits just
above `canvas`: it may import `model` + `canvas` + `@themes`, and **nothing higher** (not `editor`,
`services`, or `app`) — ESLint enforces the zone. Command _definitions_ that close over editor/app state
register from above via side-effect modules (`editor/core/commands.ts`, `app/stores/commands.ts`), so the shared
registry holds only generic records and no upward import occurs.

---

# Part A — Shared UI component library (`@ui`)

Framework-level SolidJS primitives shared across editor + app (+ publish): Button · IconButton · Chip ·
Badge · Eyebrow · text inputs · Dropdown · color pickers · Popover · Modal · FloatingBar · the scaled
section canvas · the present surface · the unified `Icon` set — plus the keyboard/palette machinery (Part
B). Theme-reactive by construction: styled **only** through the theme CSS-var utilities, zero hardcoded
colors, so every primitive recolors with the active theme.

**The recipe (in order):** (1) **reuse** an existing `@ui` primitive; (2) **extend** it with a prop/variant
when it's ~90% there (grow the atom's variant/size/tone maps, don't fork styling); (3) **create** a new
primitive only when a genuinely shared one is missing (needed by ≥2 modules or ≥3 sites) — drop it into the
fitting flat category file, never a per-view copy; (4) **keep** true one-offs local, promote them the moment
a second module needs them.

## Module layout (flat category files, no barrels)

```
ui/                     @ui · Solid · imports model + canvas + @themes only
  button.tsx            Button · IconButton · Chip · Badge · Spinner · Eyebrow
  avatar.tsx            Avatar   (image or initial, three sizes)
  inputs.tsx            TextField · TextArea · CellInput · Toggle · Slider · Segmented · AlignField
                          · FieldRow · Group · PanelHeader · Separator · inputCls
  select.tsx            Dropdown · SelectField
  color.tsx             ColorPicker · ColorPopover · ColorSwatch · ThemeSwatch · isHex
                          · textColorSwatches · highlightSwatches
  overlay.tsx           Popover · Modal · ConfirmModal · FloatingBar · FloatingPanel
  menu.tsx              Menu · MenuItem · MenuLabel · MenuSeparator   (anchored dropdowns, on Popover)
  section.tsx           ScaledSectionCanvas · SlideProgress · backdropHostStyle   (canvas-backed)
  present.tsx           PresentSurface   (shared present paint + keyboard nav + control bar)
  gen-overlay.tsx       GenOverlay   (unified AI sweep/glow generation overlay)
  status.tsx            Meter · StatusDot · EmptyState
  icons.tsx             Icon (merged registry ~70 glyphs) + generated named *Icon wrappers + UiThemeProvider
  brand.tsx             Mark   (logo)
  markdown.tsx          Markdown   (chat/AI markdown renderer)
  z.ts                  Z   (the overlay stacking scale; z-* utilities in styles.css mirror it)
  time.ts               relativeTime   (the coarse "3d ago" stamp every list and thread reads)
  styles.css            shared class tokens + z-index utilities

  keys.ts               keyboard core — see Part B
  fuzzy.ts palette-model.ts CommandPalette.tsx ShortcutsSheet.tsx focus.ts   — see Part B
```

Base atoms come first in each file; composites below import from the same or a sibling module.

## Component catalog

Legend: **B** base atom · **C** composite. (Prop lists are the durable contract; the atoms were extended
during migration — `Button` gained `danger`/`dangerGhost`/`link` variants, `IconButton` gained `tool`/
`danger` tones + `2xs`/`auto`, `Chip`/`Badge`/`Eyebrow` gained size/tone variants, text inputs gained
`number`/`compact`/`icon`/`class` + native-attr passthrough, `Modal` gained `full`/`surface`, `Popover`
gained `at`/`align` — additive and backward-compatible.)

### `button.tsx`

| Component    | Lvl | Props                                                                                                                                                                                 |
| ------------ | --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Button`     | B   | `variant: primary\|outline\|tool\|ghost\|danger` · `size: sm\|md\|lg` · `rounded?: md\|lg\|xl\|full` · `loading?` · `disabled?` · native attrs                                        |
| `IconButton` | B   | `size: 2xs\|xs\|sm\|md\|lg\|xl\|touch` (h-3.5/5/6/7/8/9/11; `touch` is the 44px coarse-pointer target) · `rounded?` · `tone: muted\|soft\|onDark` · `active?` · `bordered?` · `title` |
| `Chip`       | B   | `variant: outline\|solid` · `selected?` · `onClick?`                                                                                                                                  |
| `Badge`      | B   | `tone: accentSoft\|accentSolid\|muted` · `size` · `class`                                                                                                                             |
| `Avatar`     | B   | `src?, name?, email?` · `size: sm\|md\|lg` · `tone: solid\|soft` · `rounded: lg\|full` (falls back to the initial)                                                                    |
| `Spinner`    | B   | `size?` · `tone: accent\|current\|line`                                                                                                                                               |
| `Eyebrow`    | B   | `tracking?: wide\|wider\|widest` · `size?` · `as?`                                                                                                                                    |

### `inputs.tsx`

| Component     | Lvl   | Props                                                       |
| ------------- | ----- | ----------------------------------------------------------- |
| `TextField`   | B     | `value, placeholder?, icon?, trailing?, compact?, onChange` |
| `TextArea`    | B     | `value, placeholder?, rows?, onChange`                      |
| `CellInput`   | B     | borderless grid-cell input                                  |
| `Toggle`      | B     | `value, onChange`                                           |
| `Slider`      | B     | `value, min, max, step?, unit?, onChange`                   |
| `Segmented`   | B     | `value, options:{label,value,icon?}[], onChange`            |
| `AlignField`  | C     | `value, onChange` (Segmented preset)                        |
| `FieldRow`    | C     | `label?, children`                                          |
| `Group`       | C     | `label, divider?, children`                                 |
| `PanelHeader` | C     | `title, action?`                                            |
| `Separator`   | C     | thin rule (`onDark?`)                                       |
| `inputCls`    | token | —                                                           |

### `select.tsx`

| Component     | Lvl | Props                                                                              |
| ------------- | --- | ---------------------------------------------------------------------------------- |
| `Dropdown`    | B   | `value, options:{label,value,font?}[], onChange, compact?, placeholder?, toolbar?` |
| `SelectField` | C   | `value, options, onChange, compact?`                                               |

### `color.tsx`

| Component      | Lvl | Props                                                                           |
| -------------- | --- | ------------------------------------------------------------------------------- |
| `ColorPicker`  | B   | `value?, swatches, onChange, onPick?, clearLabel?, clearWhenEmpty?, keepFocus?` |
| `ColorPopover` | C   | `value?, swatches?, onChange, clearLabel?, toolbar?`                            |
| `ThemeSwatch`  | C   | accent theme chip (ThemeEditor + LibraryView)                                   |

Plus `ColorSwatch` type · `isHex()` · `textColorSwatches(t)` · `highlightSwatches(t)`.

### `overlay.tsx`

| Component       | Lvl | Props                                                                                                                                                               |
| --------------- | --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Popover`       | B   | `anchor: ref\|point\|stageBox` · `estHeight?` · `toolbar?` · `at` · `align` · portal + up-flip + theme-var snapshot + backdrop-dismiss + scoped Esc · `children`    |
| `Modal`         | B   | `onClose` · `size: sm\|md\|lg\|xl\|full` · `scrim: dim\|blur\|light` · `z?` · `animate?` · `surface?` · exclusive scope + focus trap + `role="dialog"`/`aria-modal` |
| `ConfirmModal`  | C   | `title, body, confirmLabel, onConfirm, onCancel, danger?, busy?`                                                                                                    |
| `FloatingBar`   | C   | `tone: dark\|panel` · `anchor: bottomCenter\|free\|center` · `rounded?, shadow?, gap?` · `children`                                                                 |
| `FloatingPanel` | C   | inline surface shell (panel sibling of `FloatingBar`) — studio asides + inline toolbar/insert popovers                                                              |

### `menu.tsx`

`Menu` · `MenuItem` · `MenuLabel` · `MenuSeparator` — anchored dropdowns built on `Popover` (portaled,
Esc/backdrop dismiss, flip-up, `align="end"`), with `role="menu"`/`"menuitem"` + `↑`/`↓` roving focus.
Replaced all hand-rolled anchored dropdowns (Topbar Artifact/Export, LibraryView card + batch move menus).

### `section.tsx` (canvas-backed, on `canvas/render/backends.ts`)

| Component             | Lvl    | Props                                                                                                                                     |
| --------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `ScaledSectionCanvas` | C      | `section, theme, profile, width?, frame: slide\|natural, lazy?, selected?, as?, onOpen?, index?, radius?, bordered?, baseShadow?, title?` |
| `SlideProgress`       | C      | `index, total`                                                                                                                            |
| `backdropHostStyle()` | helper | `(paged, background, tokens) → JSX.CSSProperties`                                                                                         |

Unifies every thumbnail surface (MiniCanvas · SectionThumb · StoryTile · minimap `Thumb`).

### `status.tsx` · `gen-overlay.tsx` · `brand.tsx` · `markdown.tsx`

`Meter` (usage bars) · `StatusDot` (live / generation-step dots) · `EmptyState` (Trash + Library empties);
`GenOverlay` (the unified `SectionGenStage`/`ElementGenStage` sweep/glow overlay, keyframes defined once in
`theme/styles.css`); `Mark` (logo); `Markdown` (chat/AI renderer).

### `icons.tsx`

| Component            | Lvl | Detail                                                                         |
| -------------------- | --- | ------------------------------------------------------------------------------ |
| `Icon`               | B   | `name, size?` — renderer + merged `PATHS` (~70 glyphs) + theme-reactive stroke |
| Named wrappers (~26) | B   | `CloseIcon`, `PlusIcon`, `CheckIcon`… each `= (p) => <Icon name=…/>`           |

Both former icon systems (`editor/icons.tsx` + `app/components/icons.tsx`) were deleted and unified here.

## Theme awareness

The app themes **entirely through CSS variables**: `themeCssVars(tokens)` stamps the full token surface on a
root element — `--color-{canvas,panel,line,ink,soft,muted,accent,onaccent}`, `--radius`, `--border-width`,
`--shadow`, `--font-{display,body,mono}`, `--hw` (heading weight) — and Tailwind v4 `@theme` maps them to
utilities (`text-ink`, `bg-panel`, `border-line`, `bg-accent text-onaccent`, `font-display`…).

**The rule for every `@ui` component:** style only through these theme utilities + `var(--radius)`,
`var(--hw)`, `var(--shadow)`, `var(--border-width)`. **Zero hardcoded colors.** Such a component recolors
automatically to whatever theme vars an ancestor sets — the identical path the app uses, so parity is by
construction, not approximation. Three specifics:

- **Portaled surfaces** (`Popover`, portaled `Modal`) escape the themed subtree, so the primitive
  **snapshots the theme vars off its anchor** (`readThemeVars`/`overlayThemeVars` in `overlay.tsx`) and
  re-applies them on the portaled node — lifted into `Popover`/`Modal` once, so no consumer re-implements it.
- **`Icon`** derives stroke weight/cap from theme (`--hw`, `--radius`) read from a small `@ui` theme context;
  `UiThemeProvider` supplies it at the app / studio / public-viewer roots (`App.tsx`, `Studio.tsx`,
  `PublicView`). Portaled menus fall back to the atom's neutral mid weight (by design).
- **Non-color values** that vary by theme — corner radius, border width, shadow, heading weight — use
  `var(--radius)` etc. so shape tracks the theme too (a brutalist theme's square corners, a refined theme's
  round ones).

## Viewport tiers and the responsive policy

Galleo runs three kinds of surface, and they get different treatment on small screens rather than one
uniform responsive sweep. `ui/viewport.ts` holds the whole policy: the breakpoints, the tier a width maps
to, and which surfaces a tier admits.

| Tier      | Width      | Admits     |
| --------- | ---------- | ---------- |
| `phone`   | `< 768`    | everything |
| `tablet`  | `768–1023` | everything |
| `desktop` | `>= 1024`  | everything |

`Surface` names what could be withheld; today nothing is (`surfaceAllowed` returns true), and the seam
stays so a surface can be re-gated without touching its call sites. The tier decides layout, not access.

- **Consume** (published links `/p/*`, `/present/:id`, `PresentSurface`) works on every tier. This is where
  mobile traffic actually arrives, since someone shares a link and the recipient opens it on a phone, so it
  is the tier with no exceptions.
- **Manage** (library, templates, shared, trash, settings, pricing) is responsive down to phone: the
  sidebar becomes an overlay drawer below `md`, driven by `openSidebar`/`closeSidebar` with a
  `SidebarToggle` app bar that each view renders as the first child of its `<main>`.
- **Manipulate** (the editor studio) is direct manipulation on a canvas, with drag-drop, resize handles,
  and an inspector beside the work. The canvas itself was always full-bleed with floating chrome, so on a
  phone the chrome re-homes rather than crams: the minimap and right rail don't render; a bottom bar
  (Sections · Insert · the selected element) opens `@ui` `Sheet`s holding the section list, the palette,
  and the schema-generated inspector; the topbar keeps back · name · undo/redo · present and folds
  format/theme/share/export into an overflow sheet. Touch interaction (coarse-pointer hit targets, touch
  drag) was already built for the tablet tier and carries over unchanged. The engine reflows section
  content at phone width, exactly as the preview does, and the profile type ramp (`rendering.md` §3.3)
  scales type down with the container so sections keep sane heights. Phone-specific interaction rules:
  the first tap on rich text selects and only a tap on the already-selected text starts editing (no
  surprise keyboard); the floating format bar docks as a fixed scrollable strip under the topbar; the
  hover pill's section actions + layout presets live in the bottom bar's Section sheet; and the
  precision handles (drag grip · resize strip · column dividers) don't render — at reflowed width they
  would edit geometry the screen can't show truthfully.
- **Instructed authoring** (the generation studio, the theme editor's prompt tabs) is a form plus a result,
  so it runs on every tier. The distinction that predicts whether a surface survives a small screen is how
  you author, not whether you create. An earlier version of this policy split on create-vs-not and was wrong
  twice, hiding both AI generation and the theme editor's Customize and Generate tabs from phones. On a
  phone the generation studio switches its console rail from a column beside the board to an alternate pane
  toggled from the transport bar, reorders the outline through the card's own move controls rather than
  drag-drop, and lets the engine reflow section content at phone width (`app/views/generate/layout.ts` holds
  the tier decisions, unit-tested). "New artifact" opens it directly on every device — the create modal is
  gone, and the intake itself carries the template row and the start-blank line, so phones get all
  three ways in, landing in the phone-chromed editor like any other route through `/edit/:id`.

```ts
import { canEditHere, isCoarsePointer, isPhone, tierFor } from "@ui/viewport";
```

`tierFor` and `surfaceAllowed` are pure and unit-tested (`ui/__tests__/viewport.test.ts`). The signals
behind `isPhone` / `isCoarsePointer` listen on the tier boundaries through `matchMedia`, so they fire once
per crossing rather than once per frame of a drag-resize. Breakpoints mirror Tailwind's default scale, so
`md:` in a class list and `isPhone()` in Solid agree on where a tier starts; changing one without the other
splits the layout.

**The rules for every `@ui` component:**

- **CSS first, signals second.** Use `md:` utilities for layout that only changes shape. Reach for the
  signals when a component should not mount at all, because the engine paints imperatively into refs and
  `hidden md:block` still costs a full paint.
- **Touch targets.** `IconButton size="touch"` is the 44px minimum. The other sizes run 14px to 36px, which
  is fine under a mouse and too small under a thumb, so anything a coarse pointer drives switches on
  `isCoarsePointer()`.
- **Safe areas.** All three HTML entries set `viewport-fit=cover`, so `env(safe-area-inset-*)` resolves to
  real values. `FloatingBar`'s `bottomCenter` anchor already clears the home indicator, and the insets
  collapse to zero everywhere else, so this costs desktop nothing.
- **Viewport height.** Use `h-dvh`, never `h-screen`. `100vh` on mobile resolves against the large viewport
  and hides content under the browser toolbar. The body never scrolls, so `dvh` settles instead of
  thrashing.
- **Gestures.** `ui/gesture.ts` holds the pure classification (`classifySwipe`, `tapZone`) with the
  thresholds as named constants; `PresentSurface` and the editor's `Present` feed it raw pointer deltas.
  Both keep the presenter convention on a fine pointer (click anywhere advances) and add swipe plus a
  leading-edge back zone on a coarse one.

**Engine reflow.** The tiers above are chrome. Content reflows in the paint layer instead, so every surface
(editor, present, publish, export) agrees without each one re-deciding. Each format profile carries a
`splitMinWidth`, and `stacksAtWidth` in `@engine/profile` turns a `row` group into a column below it,
dropping the column fractions so each block takes the full width.

| Format | `splitMinWidth` | Behavior on a phone                                                    |
| ------ | --------------- | ---------------------------------------------------------------------- |
| `deck` | 520             | never stacks: a slide lays out at its fixed page width and letterboxes |
| `doc`  | 560             | stacks (a 390px viewport leaves ~226px of content column)              |
| `web`  | 720             | stacks, and already stacks at tablet portrait                          |

The decision reads `ctx.availWidth`, which `composeSection` sets to the real content column (section width
minus padding and gutter). It is exact for the section's top-level row, the one that carries the split. A
nested row inherits that figure and so stacks a step late, which self-corrects: once the outer row stacks,
its children really do get the full width.

## Framework-free geometry helpers (`canvas/render/backends.ts`)

The strings assembled for `.style.cssText` + consumed by imperative `paint()` are pure TS and live in the
canvas layer (the former `render/geometry.ts` was folded into `backends.ts`):

- `scaledHostCss(layoutW, height, scale, center?)` → cssText for the scaled-canvas host; CSS-scale from
  top-left so text wraps identically (thumbnails). `center?` letterboxes into a fixed frame.
- `paintSectionStack(…)` → paints the continuous section stack (with `sectionLayoutWidth` +
  `createSectionStackCache`); `ScaledSectionCanvas` calls it + `scaledHostCss` directly.
- `fitSlideContent(commands, contentH, slideW, slideH)` → the scale-to-slide fit for Present (letterboxed).
- `backdropCss(bg, tokens)` → a section background's css.

## Intentionally bespoke (live guidance — what is _not_ in `@ui`, and why)

Most view UI is deliberately bespoke; migrate only the genuinely-clean instances and use `@ui` directly (no
wrappers).

- **Element-anchored action menus** whose layout `Menu`/`Popover`'s left-aligned-below model doesn't
  reproduce without added complexity keep their own inline dropdown; **cursor-positioned** menus did migrate.
- **`SectionGenPopup`** anchors off a canvas region box (not a DOM element or cursor point) with its own
  in-canvas dismiss — left inline; its atoms are migrated.
- **Website CTAs** (`.web` neo-brutalist design system), the editor's **direct-manipulation
  handles/overlays**, and the **auth form** are genuinely one-off.
- **Per-context format labels stay distinct** — the format switcher's copy differs by surface (Topbar "Web"
  · ThemeEditor "Site" · GenerateModal "Document/Website"); the shared `FORMATS`/`formatLabel` registry
  exists, but each switcher keeps its own labels intentionally (product copy, not a DRY).
- Small documented one-offs: split-circle Topbar `Swatch`, example-prompt suggestion rows, danger-outline
  "Empty trash", the inverted Pricing billing toggle, TextAiMenu language pills, the MediaPicker source rail.

## Status: built

The library is fully built and in use (`@ui` alias; typecheck/lint/build green). Its three phases —
scaffold the module + base atoms + overlays + icons + section canvas; migrate ~113 clean call-sites across
25 files (deleting both `widgets.tsx` copies, both icon systems, and consolidating the present surfaces onto
`@ui/present PresentSurface`); then a deeper pattern-family sweep adding `menu` / `FloatingPanel` /
`gen-overlay` / `status` / `ThemeSwatch` — are all complete, taking `@ui` adoption from 10 → 30+ files and
hand-rolled spinners / dropdown backdrops / panel shadows to **0**. Only genuinely-bespoke UI remains inline
(above). Not built: a dedicated `@ui/visual` + `tokens.css` (specced as a Phase-1 leftover with no second
consumer — the `Visual` animated backdrop stays inline in `app/components/previews.tsx`); shared class
tokens live in `ui/styles.css`.

---

# Part B — Keyboard control & command palette

**The north star:** every flow is a named **command**; keyboard, the palette, and on-screen buttons are
three front-ends to the same command; a **binding** is data attached to a command, never a bespoke listener.
No surface hand-rolls `window.addEventListener("keydown")` — one dispatcher owns key→action dispatch.

## Model — Command vs Binding (the load-bearing contract, `ui/keys.ts`)

A **command** is _what happens_; a **binding** is _a key that triggers it_. Decoupling buys: one action
reachable from keyboard **and** palette **and** button; a command with zero, one, or several bindings; and
future user-rebinding as pure data.

```ts
export type CommandGroup =
    | "navigate"
    | "file"
    | "edit"
    | "select"
    | "insert"
    | "arrange"
    | "format"
    | "view"
    | "theme"
    | "ai"
    | "present"
    | "share"
    | "account"
    | "help";

export interface KeyCtx {
    has: (key: string) => boolean; // a named context key is set (e.g. "editor.element")
    scope: string | null;
    scopes: string[]; // outermost → innermost
    inputFocused: boolean; // in an <input>/<textarea>/<select>/contenteditable
    exclusive?: boolean; // a modal scope is active — only allowInInput bindings fire under it
}

export interface PaletteItem {
    id: string;
    title: string;
    hint?: string;
    icon?: string;
    keywords?: string[];
    dangerous?: boolean;
    run?: (ctx: KeyCtx) => void | Promise<void>;
    provider?: (ctx: KeyCtx) => PaletteItem[] | Promise<PaletteItem[]>;
}

export interface Command {
    id: string; // "selection.delete" — namespace.verbObject
    title: string;
    group: CommandGroup;
    keywords?: string[]; // fuzzy aliases
    icon?: string; // @ui/icons name
    when?: (ctx: KeyCtx) => boolean; // gate: enabled AND palette-visible
    run?: (ctx: KeyCtx) => void | Promise<void>; // omit for provider-only (sub-list) commands
    palette?: boolean; // show in ⌘K (default true; false = binding-only)
    provider?: (ctx: KeyCtx) => PaletteItem[] | Promise<PaletteItem[]>; // sub-list palette
    dangerous?: boolean;
}

export interface Binding {
    chord: string | string[]; // "mod+shift+z" | ["mod+z"]; a space = a sequence ("g l")
    command: string;
    when?: string | ((ctx: KeyCtx) => boolean); // extra gate; a string is a context-key check
    allowInInput?: boolean; // fire even when an input/contenteditable is focused (⌘K, ⌘,, Esc)
    priority?: number; // higher wins when several bindings match one chord (default 0)
}

// registry
export function registerCommand(cmd: Command): void;
export function registerCommands(cmds: Command[]): void;
export function registerBinding(b: Binding): void;
export function registerBindings(bs: Binding[]): void;
export function listCommands(ctx: KeyCtx): Command[]; // palette source (filtered by when + palette flag)
export function runCommand(id: string): void;
export function bindingLabel(id: string): string | null; // "⌘Z" | "Ctrl+Z" | null — tooltips + sheet
// context + scopes
export function setContext(key: string, value: boolean): void;
export function pushScope(
    name: string,
    opts?: { exclusive?: boolean; onEscape?: () => void },
): () => void;
// dispatch
export function installKeyDispatcher(): () => void; // one global capture-phase keydown; idempotent
```

`Chord` is a normalized string: `mod` (⌘ on mac, Ctrl elsewhere), `ctrl` (literal Control on mac), `alt`,
`shift`, then the key (`k`, `z`, `enter`, `escape`, `up`, `/`, `?`). `eventChord(e)` produces the same
string from an event; matching is a map lookup. `normalizeChord` / `toSteps` / `formatChord` handle
authoring aliases, sequence splitting, and platform-formatted labels.

## Architecture — as built

The **mechanism** is generic and lives in `ui/`; the **command definitions** register from above via
side-effect modules, mirroring `canvas/elements/register.ts` for elements:

```
ui/keys.ts                 core: Command/Binding registries · context keys + scope stack · one capture-phase
                           dispatcher (Esc→scope · sequences · single-chord · exclusive-swallow) · isMac ·
                           eventChord/normalizeChord/formatChord/bindingLabel · palette + sheet open state
ui/fuzzy.ts                fuzzyScore + rankItems (palette ranking)
ui/palette-model.ts        paletteDisplay (grouping/ranking → display rows) — pure, tested
ui/CommandPalette.tsx      ⌘K combobox (fuzzy · grouped · recents · sub-list providers · a11y roles)
ui/ShortcutsSheet.tsx      ⌘, reference, generated from the registry (can't drift)
ui/focus.ts                focusables + trapFocus (focus trap + restore) for modals
editor/core/commands.ts    every studio command + the migrated keymap + editor.* context effect
editor/core/clipboard.ts   element copy/cut/paste store + pure pasteElement placement
app/stores/commands.ts     nav / workspace commands (palette-only; router-free via setNavigate injection)
app/stores/route-context.ts publishRoute — route → context keys (pure, tested)
```

Wired directly in `app/App.tsx`'s shell (no separate `AppCommands` component): it injects the router via
`setNavigate`, calls `installKeyDispatcher()` on mount, runs a `publishRoute(location.pathname)` effect, and
mounts `<CommandPalette/> <ShortcutsSheet/>`. Importing `app/stores/commands.ts` also _runs_ the app-command
registrations. `editor/Editor.tsx` also calls `installKeyDispatcher()` so the studio keymap works standalone.

**The dispatcher** (`installKeyDispatcher`) attaches a **single capture-phase** `keydown` on `window`; per
event, in order: **(1) Escape** → the topmost scope with an `onEscape` (modals / palette / popovers) claims
it; **(2)** continue an in-flight sequence (bare keys only, never mid-typing); **(3)** a single-chord
binding via `resolveChord` → `preventDefault` + `run`; **(4)** begin a sequence if the bare key starts one;
**(5)** an exclusive top scope swallows stray `mod+…` combos so lower-scope shortcuts don't leak while a
modal is open. Two guards are default policy, not scattered `if`s: when `inputFocused`, a binding fires only
if `allowInInput`; under an `exclusive` scope, only `allowInInput` globals fire.

**Context keys** — booleans published reactively as state changes; every `when` reads them:

| Key                                                      | True when                                        | Set by                               |
| -------------------------------------------------------- | ------------------------------------------------ | ------------------------------------ |
| `app`                                                    | in the product SPA shell                         | `publishRoute` (route)               |
| `library` / `templates` / `shared` / `trash` / `pricing` | on the matching route                            | `publishRoute`                       |
| `editor`                                                 | the studio is mounted (`/edit/*`)                | `publishRoute`                       |
| `editor.hasSelection`                                    | an element or section is selected                | `editor/core/commands.ts` effect     |
| `editor.element` / `editor.section`                      | selection kind                                   | effect over `selection()`            |
| `editor.textEditing`                                     | inline contenteditable active                    | effect over `editing()`              |
| `present`                                                | present/preview mode active                      | effect over `presenting()`           |
| `inputFocused`                                           | focus in `INPUT/TEXTAREA/SELECT/contentEditable` | dispatcher (computed live per-event) |

**Scope stack.** `pushScope(name, { exclusive?, onEscape? })` returns a disposer. `@ui/overlay` pushes it
once at the **primitive** level: `Modal` pushes an exclusive `"modal"` scope with `onEscape` + a focus trap

- `role="dialog"`/`aria-modal`; `Popover` pushes an exclusive `"popover"` scope with `onEscape`; the palette
  pushes an exclusive `"palette"` scope. So every dialog/dropdown/menu built on them gets central Esc-dismiss
  and shortcut-blocking for free (e.g. `⌘Z` never fires editor undo while a dialog is open), and nested
  overlays stop double-handling Escape.

## The as-shipped keymap (the real reference)

Deliberately minimal — muscle-memory chords only. **This is the complete bound set.**

| Chord                      | Command                        | Scope / gate                                   |
| -------------------------- | ------------------------------ | ---------------------------------------------- |
| **⌘K**                     | `view.commandPalette`          | global (`allowInInput`) — the one entry point  |
| **⌘,** / **?**             | `help.shortcuts`               | global (`⌘,` `allowInInput`; `?` not in input) |
| **⌘Z**                     | `edit.undo`                    | `editor` & not presenting & not text-editing   |
| **⌘⇧Z** / **⌘Y**           | `edit.redo`                    | ″                                              |
| **Delete** / **Backspace** | `edit.delete`                  | `editor` & has selection (dangerous)           |
| **⌘D**                     | `edit.duplicate`               | `editor` & has selection                       |
| **⌘C** / **⌘X** / **⌘V**   | `edit.copy/cut/paste`          | `editor` & element selected (paste: has clip)  |
| **Esc**                    | `select.up`                    | `editor` & has selection (walk selection up)   |
| **⌘B** / **⌘I** / **⌘U**   | `format.bold/italic/underline` | `editor.textEditing` (`allowInInput`)          |
| **⌘⇧Enter**                | `present.start`                | `editor`                                       |

The ⌘, sheet lists exactly these, grouped View · Help · Edit · Select · Format · Present. **App-shell
commands carry no binding at all** — navigation, generate, theme, chat toggle, account are palette-only.
The earlier build additionally bound `g`-sequences (`g l`…), single-keys (`c` create, `/` search), roving
element selection (`Tab`/`⇧Tab`/`Enter`), `↑`/`↓` section-nav, `⌘⌥↑/↓` move-section, `⌘\`/`⌘⌥I` view
toggles — **all removed** as over-build (too many bindings; `Tab`-hijack was an a11y hazard). The
sequence-chord machinery in `keys.ts` remains but is **unused by any binding**.

## Palette-reachable commands (most carry no key binding)

The authoritative registered-command catalog (superseding the aspirational spec inventory). Everything below
is reachable through **⌘K** (fuzzy-searchable, grouped) and on-screen controls; only the ✚-marked ones also
carry a key binding (see the keymap above). "Wires to" makes clear each is a re-front, not a rewrite.

| Command                        | Group    | Bound | When / wires to                                                        |
| ------------------------------ | -------- | :---: | ---------------------------------------------------------------------- |
| `nav.library`                  | navigate |       | `go("/")`                                                              |
| `nav.templates`                | navigate |       | `go("/templates")`                                                     |
| `nav.shared`                   | navigate |       | `go("/shared")`                                                        |
| `nav.trash`                    | navigate |       | `go("/trash")`                                                         |
| `doc.newViaAi`                 | file     |       | `openGenerate()`                                                       |
| `doc.setFormat →`              | file     |       | editor · **provider**: Deck / Document / Website → `setArtifactFormat` |
| `edit.undo` / `edit.redo`      | edit     |   ✚   | `undo()` / `redo()`                                                    |
| `edit.delete`                  | edit     |   ✚   | delete element/section (dangerous)                                     |
| `edit.duplicate`               | edit     |   ✚   | element/section duplicate                                              |
| `edit.copy/cut/paste`          | edit     |   ✚   | element clipboard (`editor/core/clipboard.ts`)                         |
| `select.up`                    | select   |   ✚   | `parentTarget` walk-up                                                 |
| `insert.sectionBelow`          | insert   |       | `addSectionAfter`                                                      |
| `insert.sectionViaAi`          | insert   |       | `openSectionPrompt`                                                    |
| `arrange.moveSectionUp/Down`   | arrange  |       | `moveSectionBy(∓1)` (section selected)                                 |
| `arrange.duplicateSection`     | arrange  |       | `duplicateSectionAt`                                                   |
| `format.bold/italic/underline` | format   |   ✚   | `toggleTextMark` (while text-editing)                                  |
| `view.toggleSections`          | view     |       | `setLeftOpen`                                                          |
| `view.toggleInspector`         | view     |       | `setRightTab("inspector")`                                             |
| `view.commandPalette`          | view     |   ✚   | the palette                                                            |
| `theme.open`                   | theme    |       | `openThemeEditor()`                                                    |
| `ai.chat.toggle`               | ai       |       | `toggleChat()`                                                         |
| `ai.regenerateElement`         | ai       |       | `regenerateElement` (element selected + regenerable)                   |
| `present.start`                | present  |   ✚   | `present()`                                                            |
| `share.open`                   | share    |       | `requestShare()`                                                       |
| `account.upgrade`              | account  |       | `go("/pricing")`                                                       |
| `account.signOut`              | account  |       | `logout()` + `go("/")`                                                 |
| `help.shortcuts`               | help     |   ✚   | the shortcuts sheet                                                    |

## Palette (⌘K), shortcuts sheet (⌘,), and sub-list providers

- **`CommandPalette.tsx`** — a centered combobox overlay over two kinds of row. Commands come from
  `listCommands(ctx)` (only those whose `when` passes and `palette !== false`), fuzzy over `title` +
  `keywords` (`fuzzy.ts`), **grouped by `CommandGroup`** in fixed order with recents floating to a
  "Recent" group on an empty query, and collapsed into one ranked "Commands" section while searching.
  Results come from **palette sources** (below) and render above the commands. Row = icon + title +
  right-aligned `bindingLabel(id)`, or, when the row carries a `thumb`, a card with thumbnail, subtitle,
  trailing meta, and a highlighted snippet; dangerous commands tint red. `↑`/`↓` move, Enter run/descend,
  ⌘Enter runs the row's `altRun`, Esc close (scoped), ⌘K toggle, and a leading `/` switches to the
  command catalog (grouped while the slash stands alone, ranked once a term follows, each row showing
  its `/alias` from `slashAlias`). It pushes an exclusive `"palette"` scope, focuses its input, and restores focus on close
  (`role="combobox"`/`listbox`/`option`).
- **Palette sources** (`palette-model.ts`, pure + tested) — a registry the app contributes result streams
  to: `local(query, ctx)` runs on every keystroke against client state, `remote(query, ctx, signal)` is
  debounced and abortable and replaces the local rows once it answers the current query. Rows carry a
  `thumb` render prop, so `@ui` renders artifact results without knowing what an artifact is. The app
  registers artifacts, folders, and a "generate from this query" action in
  `app/components/palette-sources.tsx`; the search itself is documented in `search.md`.
- **Sub-list providers** — a command with a `provider` doesn't run on Enter; it **pushes a child list** the
  same widget renders (one mechanism for every "pick one of N"). Backspace at an empty query pops back a
  level. **Only `doc.setFormat` ships a provider today** (Deck / Document / Website).
- **`ShortcutsSheet.tsx`** — renders `allCommands()` filtered to those with a `bindingLabel`, grouped by
  `CommandGroup`, searchable, each row = title + `formatChord`. Reads the registry directly, so it can never
  drift from the real bindings.

## Overlay accessibility — state

The a11y baseline is done **at the `@ui` primitive level**, so consumers inherit it: `Modal` = exclusive
scope + focus trap/restore (`focus.ts`) + `role="dialog"`/`aria-modal`; `Popover` = exclusive scope +
scoped Esc; `Menu` = `role="menu"`/`"menuitem"` + `↑`/`↓` roving focus; `CommandPalette` = full combobox
roles + trap. **Legacy per-overlay `Escape` listeners are still present** in the individual view
components (harmless — idempotent close) and can be retired opportunistically (Part C).

---

# Part C — Planned / deferred

The honest not-yet-done, in rough priority order.

- **Sub-list providers (most).** The palette supports providers but only `doc.setFormat` ships one.
  Straightforward additions: `theme.apply →` (curated + custom themes), `nav.goToSection →` (artifact
  sections → `jumpToSection`), `artifact.moveToFolder →` (folder tree), `export.as →` (gated formats),
  `insert.element →` (element catalog by category), `template.use →`. (Opening an artifact is no longer
  one of them: it is a palette source, not a sub-list.)
- **`submitCancel()` helper — unbuilt.** The specced `ui/inputs.tsx submitCancel({ onSubmit, onCancel,
allowShiftEnter })` for standardizing input-local Enter-to-submit / Esc-to-cancel (Topbar title, Sidebar
  folder rename, ChatPanel send, link URL, gen prompt, recipient/search fields) was never added — those
  fields still use ad-hoc `onKeyDown`.
- **Retire redundant per-overlay Esc listeners.** Now that `Modal`/`Popover` push scopes with `onEscape`,
  the legacy `keydown`/Escape handlers in `MediaPicker`, `Sidebar`, `ShareModal`, `ThemeEditor`,
  `LibraryView`, `GenerateModal`, `DataEditor`, `Topbar`, `SectionGenPopup`, and `editor/canvas/Present`
  are redundant (harmless idempotent closes) and can be removed.
- **Remaining overlay-a11y gaps.** `Dropdown`/`SelectField` keep their local `↑`/`↓`/Enter nav but still
  need `role="listbox"`/`"option"` + `aria-selected` + type-ahead; `Popover` could set `role` per use and
  return focus to its anchor; buttons/toggles could expose `aria-pressed`/`aria-keyshortcuts` derived from
  `bindingLabel`.
- **Commands specced but not registered** (would extend the palette catalog): in-editor navigation
  (`nav.goToSection`, `nav.next/prevSection`), artifact ops (`artifact.duplicate/moveToFolder/delete/
restore/purge`, `trash.empty`), `folder.*`, `template.use`, roving element selection
  (`select.nextSibling/prevSibling/enter/clear`), `insert.element`/`insert.image`, `arrange.alignX`/
  `arrange.sectionLayout`, richer text marks (`format.strike/code/link/color/highlight/clear`),
  `view.openSearchPalette`/`view.zoomToFit`, `theme.apply/customize/generate/keepPreview/revertPreview`,
  chat controls (`ai.chat.send/stop/reset`), `ai.rewriteText`, `ai.generateArtifact`, `share.copyLink`,
  `export.*`, `account.billing`.
- **Present keymaps stay off the registry — deliberate.** Both present surfaces
  (`editor/Present.tsx`, `ui/present.tsx`) keep their own mode-scoped `keydown` handlers (coupled to
  local fullscreen/overview state, they only fire in present mode); editor commands are gated off while
  presenting (`inEditor = has("editor") && !has("present")`) so nothing double-fires. Migrating them to a
  `present.*` command set remains optional.
- **Sequence chords & single-key library shortcuts — parked.** The `g …` sequence machinery lives in
  `keys.ts` but is bound by nothing; `g l`/`c`/`/`/`Tab`-roving were built then removed as over-build. Any
  revival would re-register bindings, not rebuild the machinery.
- **User-rebindable keymaps + a settings UI.** The `Command`/`Binding` model already supports it (`priority`
  disambiguates collisions); the UI is deferred.
- **`@ui/visual` + `tokens.css`.** Specced but not built — the `Visual` animated backdrop stays inline in
  `app/components/previews.tsx`; shared class tokens live in `ui/styles.css`. Do it if/when a second
  consumer appears.
