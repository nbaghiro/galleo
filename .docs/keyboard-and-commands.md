# Galleo — Keyboard Control & Command Palette

> The product + technical spec for keyboard-driven control across the whole app: a **⌘K command
> palette**, a **⌘, keyboard-shortcuts sheet**, and one **generic, scoped command/binding system** that
> every surface registers into. Companion to `architecture.md` (the layering law), `ui-component-library.md`
> (the shared control kit these primitives extend), and `elements-and-editing.md` (the editor surfaces a
> selection drives). Status: **built** (Phases 1–5) — see §10 for the as-shipped summary and where it
> diverged from this spec.

The north star: **every flow is a named command; keyboard, the palette, and on-screen buttons are three
front-ends to the same command; a binding is data attached to a command, never a bespoke listener.** Adding
a shortcut becomes "register a command + (optionally) a binding" — the exact shape the element registry
already uses (`register(spec)` fired by `editor/register.ts`).

---

## 0. Goals & non-goals

**Goals**

1. **One shared module** owns key→action dispatch; no surface hand-rolls `window.addEventListener("keydown")`.
2. A **command palette** (⌘K) that lists every enabled action, fuzzy-searchable, grouped, showing each
   action's binding, with **sub-list providers** for "pick one of N" flows (insert element, apply theme, go
   to section, move to folder…).
3. A **⌘, shortcuts sheet** auto-generated from the registry — the single source of truth, so it can never
   drift from the real bindings.
4. **Comprehensive coverage** — a catalogued command for every user flow in the app (§4), reachable by
   keyboard and/or palette.
5. **Scoped & safe** — commands are gated by context (`editor`, `present`, `library`, `textEditing`,
   `inputFocused`…) so a shortcut only fires where it makes sense and never steals a key from a text field.
6. **Discoverable** — button tooltips render their binding from the registry (`bindingLabel(id)`), so
   `title="Undo (⌘Z)"` is generated, not hardcoded.
7. **Accessible** — the palette is a real combobox; overlays trap focus, set ARIA roles, and restore focus
   on close (today none do — §5).

**Non-goals (this phase)**

- User-rebindable keymaps / a settings UI for shortcuts (the model supports it; the UI is later).
- Vim/modal editing.
- Recording macros.

---

## 1. Today: the fragmented baseline

There is **no app-wide shortcut layer and no palette**. Keyboard behavior is ~12 independent global
`keydown` listeners plus ~10 input-local handlers, each re-implementing its own focus/typing guards:

| Global `keydown` listener  | Handles                                                      | Source                               |
| -------------------------- | ------------------------------------------------------------ | ------------------------------------ |
| Editor canvas              | Esc (walk up), ⌘Z/⌘⇧Z/⌘Y, Del/Backspace, ⌘D, ↑/↓ section-nav | `editor/canvas/Canvas.tsx:208`       |
| In-editor present          | slide nav (paged + continuous)                               | `editor/canvas/Present.tsx:113`      |
| Standalone present surface | arrows/space/F/O/Esc                                         | `ui/present.tsx:106`                 |
| Modal / Popover            | Esc-to-close (two listeners)                                 | `ui/overlay.tsx:97`, `:213`          |
| Dropdown                   | ↑/↓/Enter option nav                                         | `ui/select.tsx:73`                   |
| Library                    | Esc clears multi-select                                      | `app/views/LibraryView.tsx:215`      |
| Generate modal             | ⌘Enter submit                                                | `app/views/GenerateModal.tsx:350`    |
| Theme editor               | Esc close, ⌘Enter generate                                   | `app/views/ThemeEditor.tsx:393`      |
| Share modal                | Esc close                                                    | `app/components/ShareModal.tsx:54`   |
| Media picker               | Esc close                                                    | `app/components/MediaPicker.tsx:360` |
| Section-gen popup          | Esc (capture) close, Enter submit                            | `editor/ai/SectionGenPopup.tsx:65`   |
| Data editor                | Esc close                                                    | `editor/inspect/DataEditor.tsx:72`   |

Plus input-local Enter/Esc/⌘Enter in the Topbar title, Sidebar folder create/rename, ChatPanel send,
TextAiMenu, ShareModal recipient, format-bar link, MediaPicker search — and ⌘B/⌘I/⌘U inside the
contenteditable (`editor/text/text-editor.tsx:196`).

**Two guards to preserve verbatim** when centralizing: `Canvas.tsx:209` (skip all global keys while inline
text editing) and `Canvas.tsx:210-216,226` (skip destructive keys when focus is in any
`INPUT/TEXTAREA/SELECT/contentEditable`). The new dispatcher must reproduce both (§2.5).

---

## 2. Architecture — one system

### 2.1 Where it lives (respects `model ← canvas ← ui ← editor ← app`)

The **mechanism** is generic and lives in `ui/` (the only layer importable by both `editor` and `app`). The
**command definitions** — which close over editor/app state — register from above via side-effect modules,
mirroring `editor/register.ts` for elements:

```
ui/keys.ts             pure core: chord normalization, the command + binding registries, the
                       context/scope stack, the single global dispatcher, platform mod (⌘ vs Ctrl),
                       optional sequence chords ("g l"), bindingLabel()/formatChord() for labels
ui/CommandPalette.tsx  the ⌘K palette — combobox + fuzzy match + grouped results + recents + sub-providers
ui/ShortcutsSheet.tsx  the ⌘, reference — grouped, searchable, generated from the registry
ui/keys-context.ts     the reactive context keys + scope stack (thin Solid signals over the core)

editor/commands.ts     registers every editor command + binding (side-effect; imported by Studio/register)
app/commands.ts         registers every app-shell / navigation command (side-effect; imported by App)
```

Why `ui/` and not `model`/`canvas`: `KeyboardEvent` is DOM (rules out edge-safe `model`), and keyboard is an
editing/chrome concern, not a paint concern (rules out `canvas`). `ui/` already owns the overlay primitives
and the present-surface keyboard handler, so it is the natural home. The registry itself holds only generic
`Command`/`Binding` records; the `run` handlers are supplied by `editor`/`app`, so no upward import occurs.

### 2.2 Command vs Binding — keep them separate

Like VSCode's `commands` + `keybindings.json`, a **command** is _what happens_; a **binding** is _a key that
triggers it_. Decoupling them buys three things: one action is reachable from keyboard **and** palette **and**
a button; a command can have zero, one, or several bindings; and future user-rebinding is just editing the
binding table.

```ts
// ui/keys.ts
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

export interface Command {
    id: string; // "selection.delete" — namespace.verb-object
    title: string; // "Delete element"
    group: CommandGroup;
    keywords?: string[]; // fuzzy aliases ("remove", "rm")
    icon?: IconName; // @ui/icons name (palette + sheet)
    when?: (c: Ctx) => boolean; // gate: enabled AND palette-visible
    run: (c: Ctx) => void | Promise<void>;
    palette?: boolean; // show in ⌘K (default true; false = binding-only)
    provider?: (c: Ctx) => PaletteItem[] | Promise<PaletteItem[]>; // sub-list (see §2.6)
    dangerous?: boolean; // destructive → styled red, needs confirm affordance
}

export interface Binding {
    chord: Chord | Chord[]; // "mod+shift+z" | ["mod+z"]; "g l" = sequence (opt-in)
    command: string; // command id
    when?: string | ((c: Ctx) => boolean); // extra gate on top of the command's when
    allowInInput?: boolean; // fire even when an input/contenteditable is focused (⌘K, ⌘,, Esc)
}

export function registerCommand(cmd: Command): void;
export function registerCommands(cmds: Command[]): void;
export function registerBinding(b: Binding): void;
export function runCommand(id: string): void | Promise<void>;
export function listCommands(c: Ctx): Command[]; // palette source (filtered by when + palette flag)
export function bindingLabel(id: string): string | null; // "⌘Z" | "Ctrl+Z" | null — for tooltips + sheet
```

`Chord` is a normalized string: `mod` (⌘ on mac, Ctrl elsewhere), `shift`, `alt`, `ctrl` (literal, when you
truly mean Control on mac), then the key (`k`, `z`, `enter`, `escape`, `arrowup`, `/`, `?`). `matchChord(e)`
produces the same string from an event; matching is a map lookup, not a switch ladder.

### 2.3 The context/scope model

Every `when` reads **context keys** — booleans published reactively as state changes:

| Key                                          | True when                                        | Set by                       |
| -------------------------------------------- | ------------------------------------------------ | ---------------------------- |
| `app`                                        | in the product SPA shell (not present)           | route                        |
| `library`                                    | on `/`, `/folder/:id`                            | route                        |
| `templates` / `shared` / `trash` / `pricing` | on the matching route                            | route                        |
| `editor`                                     | the studio is mounted (`/edit/:id`)              | `EditorView`                 |
| `editor.hasSelection`                        | an element or section is selected                | `selection()`                |
| `editor.element` / `editor.section`          | selection kind                                   | `selection()`                |
| `editor.textEditing`                         | inline contenteditable active                    | `editing()`                  |
| `editor.canFrame` / `editor.canResize` …     | selected element's spec flags                    | selection + spec             |
| `present`                                    | present/preview mode active                      | `presenting()` / PresentView |
| `present.overview`                           | present overview grid open                       | Present                      |
| `overlay`                                    | any modal/palette/popup is topmost               | scope stack                  |
| `inputFocused`                               | focus in `INPUT/TEXTAREA/SELECT/contentEditable` | dispatcher (live, per-event) |

**Scope stack.** Modals, the palette, the present overview, and popovers `pushScope(name)` on mount and pop
on cleanup. The dispatcher evaluates bindings **top-of-stack first**; a scope may declare itself _exclusive_
(swallow unmatched keys — a true modal) or _transparent_ (fall through). This replaces every per-overlay
`window.addEventListener("keydown", esc)` with one registered `overlay.dismiss` binding scoped to the top
frame — so nested overlays stop double-handling Escape (the reason `SectionGenPopup` needs capture-phase +
`stopPropagation` today, `SectionGenPopup.tsx:66-74`).

```ts
export function pushScope(name: string, opts?: { exclusive?: boolean }): () => void; // returns disposer
export function setContext(key: string, value: boolean): void;
```

### 2.4 The dispatcher — one listener

`installKeyDispatcher()` (called once at app root) attaches a **single capture-phase** `keydown` on
`window`. Per event:

1. Build the chord via `matchChord(e)`; track sequence state for opt-in `g …` prefixes (timeout ~1s).
2. Walk the scope stack top→bottom; within each scope, find bindings whose `chord` matches and whose
   `when` + command `when` both pass in the current `Ctx`.
3. First match wins → `e.preventDefault()`, `runCommand(binding.command)`. If a scope is exclusive and no
   binding matched a _modifier/navigation_ key, swallow it.
4. No match → let the event through (native behavior in inputs, etc.).

Because it is capture-phase and centralized, precedence is one place to reason about, and `preventDefault`
is applied exactly when a binding claims the key.

### 2.5 Input & text-editing rules (don't steal the keyboard)

The dispatcher reproduces today's two guards as **default binding policy**, not scattered `if`s:

- When `inputFocused`, a binding fires **only if** `allowInInput: true`. `⌘K`, `⌘,`, and `Escape`
  opt in; everything else defers to the field. (This preserves the Topbar-title `stopPropagation` intent,
  `Topbar.tsx:74-83`, without each input opting out by hand.)
- When `editor.textEditing`, the contenteditable owns the keyboard: only `format.*` marks (`⌘B/⌘I/⌘U`),
  `Escape`/`Enter` (stop editing), and `allowInInput` bindings fire. These `format.*` commands simply route
  to the existing `toggleTextMark` bridge (`editor/text/text-format.ts`), so ⌘B/I/U move onto the registry
  with zero behavior change.

**Two-tier boundary.** Global _commands_ live in the registry. **Local input affordances** —
Enter-to-submit / Esc-to-cancel _this specific field_ (folder rename, link URL, chat send, gen prompt) —
stay field-local, but move onto one shared helper for consistency instead of ad-hoc `onKeyDown`:

```ts
// ui/inputs.ts — a tiny, reused primitive; NOT the global dispatcher
export function submitCancel(opts: {
    onSubmit?: (e) => void;
    onCancel?: () => void;
    allowShiftEnter?: boolean;
}): JSX.EventHandler;
// usage: <TextField onKeyDown={submitCancel({ onSubmit: applyLink, onCancel: close })} />
```

### 2.6 The command palette (⌘K)

A centered combobox overlay (a new `ui/CommandPalette.tsx`, built on `FloatingPanel` + the a11y combobox
pattern):

- **Source** = `listCommands(ctx)` — only commands whose `when` passes and `palette !== false`.
- **Search** = fuzzy over `title` + `keywords`; results **grouped by `CommandGroup`** in the fixed group
  order; recents float to a "Recent" group when the query is empty.
- **Row** = icon + title + (right-aligned) `bindingLabel(id)`. Dangerous commands tint red.
- **Keyboard** = ↑/↓ move, Enter run, Esc close, ⌘K toggle. Type-ahead is immediate.
- **Sub-list providers = the "palette with options" model.** A command with a `provider` doesn't run on
  Enter — it **pushes a child list** the same widget renders. One mechanism powers every "pick one of N":

    | Palette command           | Provider yields                   | Backs                          |
    | ------------------------- | --------------------------------- | ------------------------------ |
    | `insert.element →`        | the element catalog (by category) | `Panel` palette / `insert.tsx` |
    | `theme.apply →`           | all themes (curated + custom)     | `ThemeEditor` pick             |
    | `nav.goToSection →`       | the artifact's sections           | `jumpToSection`                |
    | `doc.setFormat →`         | Deck / Doc / Web                  | Topbar format switch           |
    | `artifact.moveToFolder →` | the folder tree                   | `moveArtifact`                 |
    | `nav.openArtifact →`      | recent artifacts                  | library open                   |
    | `export.as →`             | allowed export formats (gated)    | Topbar export menu             |

    A provider item may itself run or push again (e.g. `insert.element → Charts → barChart`). Backspace at an
    empty query pops back up a level.

### 2.7 The shortcuts sheet (⌘,) + discoverability

`ui/ShortcutsSheet.tsx` renders the **binding table grouped by `CommandGroup`**, searchable, each row =
command title + `formatChord(chord)`. It reads the registry directly, so it is always current. A "Print /
copy" affordance is trivial since it's data.

Everywhere a button already advertises a shortcut in its `title` (`Topbar.tsx:93-98`, present controls), the
label comes from `bindingLabel(id)` instead of a string literal — one source of truth, no drift.

### 2.8 Naming & grouping conventions

- **Command id** = `namespace.verbObject`, lowerCamel after the dot: `doc.new`, `edit.undo`,
  `selection.delete`, `insert.element`, `arrange.moveSectionUp`, `format.bold`, `view.toggleSections`,
  `theme.open`, `ai.generateSection`, `present.start`, `nav.library`, `share.open`, `export.pdf`,
  `help.shortcuts`.
- **Group** = one of the fixed `CommandGroup` enum (below), which orders both the palette and the sheet.
- **Binding chords** use `mod` (never literal `cmd`/`ctrl` unless platform-specific is intended).

| Group      | Order | Scope it mostly lives in          |
| ---------- | ----- | --------------------------------- |
| `navigate` | 1     | app + editor                      |
| `file`     | 2     | app + editor (document lifecycle) |
| `edit`     | 3     | editor                            |
| `select`   | 4     | editor                            |
| `insert`   | 5     | editor                            |
| `arrange`  | 6     | editor                            |
| `format`   | 7     | editor (text editing)             |
| `view`     | 8     | editor                            |
| `theme`    | 9     | app + editor                      |
| `ai`       | 10    | editor + app (chat/generate)      |
| `present`  | 11    | present                           |
| `share`    | 12    | app + editor                      |
| `account`  | 13    | app                               |
| `help`     | 14    | global                            |

### 2.9 Extensibility

Adding a shortcut = one registration next to the feature that owns it (in `editor/commands.ts` /
`app/commands.ts`), grouped with its siblings. The palette, the sheet, and tooltips pick it up
automatically. This is the same "registry-driven, adding X is adding a record" ethos as elements and themes.

---

## 3. The reserved global keymap

The small set of chords that mean the same thing everywhere (all `allowInInput` except where noted):

| Chord             | Command                                   | Notes                                                              |
| ----------------- | ----------------------------------------- | ------------------------------------------------------------------ |
| **⌘K**            | `view.commandPalette`                     | open/close the palette; the one universal entry point              |
| **⌘,**            | `help.shortcuts`                          | open the keyboard-shortcuts sheet                                  |
| **?** (Shift+/)   | `help.shortcuts`                          | only when **not** `inputFocused`                                   |
| **Esc**           | `overlay.dismiss` → else context-specific | top overlay closes; else editor walks selection up / present exits |
| **⌘Z / ⌘⇧Z / ⌘Y** | `edit.undo` / `edit.redo`                 | unchanged from today                                               |
| **⌘S**            | `doc.save`                                | force `flushAutosave()` + a "Saved" toast (autosave still runs)    |

Reserved-but-native (never bound, to avoid fighting the browser/OS): `⌘N`, `⌘W`, `⌘T`, `⌘⇧T`, `⌘Q`, `⌘R`,
`⌘L`, `⌘+/−`. New-artifact etc. use `⌘⇧…` or single-key (library `c`) instead.

---

## 4. The comprehensive command library

Every user flow, as a command. **Binding** blank = palette-only (still fully keyboard-reachable via ⌘K).
`when` = the context gate. "Wires to" points at the existing action so this is a re-front, not a rewrite.

### 4.1 Navigate (`nav.*`)

| Command              | Binding | when    | Wires to                                               |
| -------------------- | ------- | ------- | ------------------------------------------------------ |
| `nav.library`        | `g l`   | app     | route `/` (`App.tsx:86`)                               |
| `nav.templates`      | `g t`   | app     | `/templates`                                           |
| `nav.shared`         | `g s`   | app     | `/shared` (`SharedView`)                               |
| `nav.trash`          | `g x`   | app     | `/trash`                                               |
| `nav.pricing`        | —       | app     | `/pricing`                                             |
| `nav.home`           | —       | editor  | `requestHome()` (`Topbar.tsx:213`) → flush + `/`       |
| `nav.openArtifact →` | `o`     | app     | provider: recent artifacts → `/edit/:id`               |
| `nav.goToSection →`  | —       | editor  | provider: sections → `jumpToSection` (`editor.ts:520`) |
| `nav.nextSection`    | `]`     | editor  | select+scroll next section (extends `Canvas.tsx:244`)  |
| `nav.prevSection`    | `[`     | editor  | select+scroll prev section                             |
| `nav.openFolder →`   | —       | library | provider: folder tree → `/folder/:id`                  |

### 4.2 File / document (`file.*`, `doc.*`)

| Command                           | Binding   | when       | Wires to                                                                       |
| --------------------------------- | --------- | ---------- | ------------------------------------------------------------------------------ |
| `doc.new →`                       | `c`       | library    | `CreateModal`: provider Deck/Doc/Web → `api.createArtifact` (`Sidebar.tsx:67`) |
| `doc.newViaAi`                    | —         | app        | `openGenerate()` (`stores/generate.ts:118`)                                    |
| `doc.save`                        | `⌘S`      | editor     | `flushAutosave()` (`stores/save.ts:15`)                                        |
| `doc.rename`                      | `⌘⇧R`     | editor     | open Topbar title rename (`Topbar.tsx:40`)                                     |
| `doc.setFormat →`                 | `⌘⌥1/2/3` | editor     | provider Deck/Doc/Web → `setArtifactFormat` (`Topbar.tsx:203`)                 |
| `artifact.duplicate`              | —         | app+editor | `duplicateArtifact` (`stores/library.ts:132`)                                  |
| `artifact.moveToFolder →`         | —         | app        | provider folders → `moveArtifact` (`library.ts:64`)                            |
| `artifact.delete`                 | —         | app        | soft-delete `removeArtifact` (`library.ts:84`), `dangerous`                    |
| `artifact.restore`                | —         | trash      | `restoreFromTrash` (`library.ts:112`)                                          |
| `artifact.purge`                  | —         | trash      | `purgeArtifact` (`library.ts:120`), `dangerous`                                |
| `trash.empty`                     | —         | trash      | `emptyTrash` (`library.ts:126`), `dangerous`                                   |
| `folder.new`                      | —         | library    | inline create (`Sidebar.tsx:100`)                                              |
| `folder.rename` / `folder.delete` | —         | library    | `renameFolderById` / `removeFolder` (`folders.ts:69,74`)                       |
| `template.use →`                  | —         | templates  | provider → create from template (`TemplatesView.tsx:43`)                       |

### 4.3 Edit / history (`edit.*`)

| Command                                 | Binding              | when                | Wires to                                               |
| --------------------------------------- | -------------------- | ------------------- | ------------------------------------------------------ |
| `edit.undo`                             | `⌘Z`                 | editor              | `undo()` (`editor.ts:211`)                             |
| `edit.redo`                             | `⌘⇧Z`, `⌘Y`          | editor              | `redo()` (`editor.ts:222`)                             |
| `edit.duplicate`                        | `⌘D`                 | editor.hasSelection | element/section duplicate (`Canvas.tsx:236`)           |
| `edit.delete`                           | `Delete`,`Backspace` | editor.hasSelection | delete element/section (`Canvas.tsx:228`), `dangerous` |
| `edit.copy` / `edit.cut` / `edit.paste` | `⌘C/⌘X/⌘V`           | editor.element      | **new** element clipboard (see §9)                     |

### 4.4 Select (`select.*`)

| Command              | Binding | when                  | Wires to                                                 |
| -------------------- | ------- | --------------------- | -------------------------------------------------------- |
| `select.up`          | `Esc`   | editor.hasSelection   | `parentTarget` walk-up (`Canvas.tsx:218`)                |
| `select.nextSibling` | `Tab`   | editor.element        | **new** roving selection                                 |
| `select.prevSibling` | `⇧Tab`  | editor.element        | **new**                                                  |
| `select.enter`       | `Enter` | editor.element        | edit rich-text / activate (mirrors click→`startEditing`) |
| `select.clear`       | `Esc`   | library (select mode) | `clearSelection()` (`LibraryView.tsx:215`)               |

### 4.5 Insert (`insert.*`)

| Command               | Binding  | when   | Wires to                                                    |
| --------------------- | -------- | ------ | ----------------------------------------------------------- |
| `insert.element →`    | `/`      | editor | provider: element catalog → insert (`insert.tsx` / `Panel`) |
| `insert.sectionBelow` | `⌘Enter` | editor | `addSectionAfter` (`selection.tsx:127`)                     |
| `insert.sectionViaAi` | —        | editor | `openSectionPrompt` (`section-gen.ts:47`)                   |
| `insert.image`        | —        | editor | `requestMediaPicker` (`media.ts:28`)                        |

### 4.6 Arrange (`arrange.*`)

| Command                          | Binding | when                   | Wires to                                        |
| -------------------------------- | ------- | ---------------------- | ----------------------------------------------- |
| `arrange.moveSectionUp`          | `⌘⌥↑`   | editor.section         | `moveSectionBy(-1)` (`selection.tsx:192`)       |
| `arrange.moveSectionDown`        | `⌘⌥↓`   | editor.section         | `moveSectionBy(+1)`                             |
| `arrange.duplicateSection`       | —       | editor.section         | `duplicateSectionAt` (`selection.tsx:210`)      |
| `arrange.sectionLayout →`        | —       | editor.section         | provider layout presets (`SectionLayoutPopup`)  |
| `arrange.alignLeft/Center/Right` | —       | editor.element (slack) | `setElementLayout align` (`format-bar.tsx:142`) |

### 4.7 Format — text marks (`format.*`)

All gated `editor.textEditing`; route to `toggleTextMark` / `setTextMark` (`text-format.ts`).

| Command                                              | Binding            | Wires to                                                                                       |
| ---------------------------------------------------- | ------------------ | ---------------------------------------------------------------------------------------------- |
| `format.bold` / `format.italic` / `format.underline` | `⌘B` / `⌘I` / `⌘U` | `text-editor.tsx:203`                                                                          |
| `format.strike`                                      | `⌘⇧S`              | `toggleTextMark("s")`                                                                          |
| `format.code`                                        | `⌘E`               | `toggleTextMark("code")`                                                                       |
| `format.link`                                        | `⌘K`\*             | link popover (`format-bar.tsx:439`) — \*scoped: ⌘K = link only while textEditing, else palette |
| `format.color →` / `format.highlight →`              | —                  | provider swatches (`format-bar.tsx:369`)                                                       |
| `format.clear`                                       | `⌘\`               | clear marks over selection                                                                     |

### 4.8 View (`view.*`)

| Command                  | Binding | when   | Wires to                                    |
| ------------------------ | ------- | ------ | ------------------------------------------- |
| `view.commandPalette`    | `⌘K`    | global | the palette                                 |
| `view.toggleSections`    | `⌘\`    | editor | `setLeftOpen` (`Studio.tsx:66` / `Minimap`) |
| `view.toggleInspector`   | `⌘⌥I`   | editor | `setRightTab("inspector")` (`Panel.tsx:59`) |
| `view.openSearchPalette` | —       | editor | `setRightTab("search")` element search      |
| `view.zoomToFit`         | —       | editor | (future) canvas fit                         |

### 4.9 Theme (`theme.*`)

| Command                                     | Binding | when                | Wires to                                                                 |
| ------------------------------------------- | ------- | ------------------- | ------------------------------------------------------------------------ |
| `theme.open`                                | —       | app+editor          | `openThemeEditor()` (`theme.ts:60`) / `requestThemePicker()`             |
| `theme.apply →`                             | —       | app+editor          | provider all themes → `pick(id)` (`ThemeEditor.tsx:285`) / `setAppTheme` |
| `theme.customize`                           | —       | app                 | Customize tab (`ThemeEditor.tsx:465`)                                    |
| `theme.generate`                            | —       | app                 | Generate tab → `runGenerate` (`ThemeEditor.tsx:729`)                     |
| `theme.keepPreview` / `theme.revertPreview` | —       | editor (previewing) | `keepPreviewedTheme` / `endThemePreview` (`EditorView.tsx:176`)          |

### 4.10 AI (`ai.*`)

| Command                | Binding | when            | Wires to                                                 |
| ---------------------- | ------- | --------------- | -------------------------------------------------------- |
| `ai.chat.toggle`       | `⌘J`    | app+editor      | `toggleChat` (`stores/chat.ts:125`)                      |
| `ai.chat.send`         | `Enter` | chat input      | `sendChat` (local submit, `ChatPanel.tsx:795`)           |
| `ai.chat.stop`         | `Esc`   | chat generating | `stopChat` (`chat.ts:331`)                               |
| `ai.chat.reset`        | —       | chat            | `resetThread` (`chat.ts:335`)                            |
| `ai.generateSection`   | —       | editor          | `openSectionPrompt` (`section-gen.ts:47`)                |
| `ai.regenerateElement` | —       | editor.element  | `regenerateElement` (`element-gen.ts:78`)                |
| `ai.rewriteText`       | —       | textEditing     | `TextAiMenu` (`format-bar.tsx:244`)                      |
| `ai.generateArtifact`  | —       | app             | `openGenerate` → ⌘Enter submit (`GenerateModal.tsx:350`) |

### 4.11 Present (`present.*`)

Gated `present`; consolidates the **two** present keymaps (`editor/canvas/Present.tsx:113` +
`ui/present.tsx:106`) onto one registered set.

| Command               | Binding            | Wires to                                                 |
| --------------------- | ------------------ | -------------------------------------------------------- |
| `present.start`       | `⌘⇧Enter` (editor) | `present()` (`Topbar.tsx:235`)                           |
| `present.next`        | `→` `Space` `↓`    | `nextSlide` / scroll                                     |
| `present.prev`        | `←` `↑`            | `prevSlide` / scroll                                     |
| `present.overview`    | `O`                | overview grid (`Present.tsx:224`)                        |
| `present.fullscreen`  | `F`                | `toggleFs` (`Present.tsx:234`)                           |
| `present.exit`        | `Esc`              | `exitPresent` / close overview first (`Present.tsx:243`) |
| `present.gotoSlide →` | `1-9`              | jump to slide N                                          |

### 4.12 Share & export (`share.*`, `export.*`)

| Command                                                      | Binding | when           | Wires to                                                                            |
| ------------------------------------------------------------ | ------- | -------------- | ----------------------------------------------------------------------------------- |
| `share.open`                                                 | —       | app+editor     | `openShare` (gated by `publicLinks`, else `requestUpgrade`) (`Topbar.tsx:225`)      |
| `share.copyLink`                                             | —       | shared         | copy public URL (`SharedView.tsx:236`)                                              |
| `export.open →`                                              | `⌘⇧E`   | editor         | provider allowed formats (`Topbar.tsx:164`)                                         |
| `export.pdf` / `export.pptx` / `export.png` / `export.print` | —       | editor (gated) | `exportPdfAuto` / `exportPptx` / `exportDeckPng` / `exportPrint` (`Topbar.tsx:189`) |
| `export.upgradeLocked`                                       | —       | editor (Free)  | `requestUpgrade()` for gated formats                                                |

### 4.13 Account & help (`account.*`, `help.*`)

| Command               | Binding   | when       | Wires to                              |
| --------------------- | --------- | ---------- | ------------------------------------- |
| `account.signOut`     | —         | app        | `logout()` (`Sidebar.tsx:387`)        |
| `account.billing`     | —         | app        | `openPortal` (`stores/billing.ts:42`) |
| `account.upgrade`     | —         | app+editor | `/pricing` (`Sidebar.tsx:369`)        |
| `help.shortcuts`      | `⌘,`, `?` | global     | the shortcuts sheet                   |
| `help.commandPalette` | `⌘K`      | global     | alias into the palette                |

### 4.14 Overlay-scoped (every modal/popup, one binding each)

Replaces ~8 per-overlay Esc listeners with scoped `overlay.dismiss` + `overlay.confirm`:

| Overlay                         | Dismiss (Esc)      | Confirm (Enter/⌘Enter)             | Source                      |
| ------------------------------- | ------------------ | ---------------------------------- | --------------------------- |
| Command palette                 | close              | run selected                       | new                         |
| Generate modal                  | `closeGenerate`    | `⌘Enter` → `go()`                  | `GenerateModal.tsx:364,350` |
| Theme editor                    | `closeThemeEditor` | `⌘Enter` → generate (Generate tab) | `ThemeEditor.tsx:393`       |
| Share modal                     | `closeShare`       | —                                  | `ShareModal.tsx:54`         |
| Media picker                    | `closeMediaPicker` | `Enter` → search                   | `MediaPicker.tsx:360`       |
| Section-gen popup               | `closeSectionGen`  | `Enter` → submit                   | `SectionGenPopup.tsx:65`    |
| Data editor                     | `close`            | —                                  | `DataEditor.tsx:72`         |
| Create / Confirm modals         | cancel             | Enter → confirm                    | `overlay.tsx`               |
| Dropdown / Menu / color popover | close              | ↑/↓ + Enter (Menu gains this — §5) | `select.tsx`, `menu.tsx`    |

---

## 5. Overlay keyboard & focus (accessibility) — gaps + target

The catalog found **no overlay traps focus, sets `role`/`aria-modal`, or restores focus on close**, and only
`Dropdown` does arrow/Enter nav (`Menu` is mouse-only). The keyboard system touches every overlay, so fold
the a11y fixes in:

| Primitive                                  | Today                           | Target                                                                                                          |
| ------------------------------------------ | ------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `Modal` (`overlay.tsx:203`)                | Esc close; no trap/role/restore | focus trap, `role="dialog" aria-modal`, focus first control, restore on close; Esc via scoped `overlay.dismiss` |
| `Popover` (`overlay.tsx:95`)               | Esc + backdrop close            | `role` per use; return focus to anchor                                                                          |
| `Menu` (`menu.tsx`)                        | click only, no roles            | roving `↑/↓/Home/End`, Enter/Space, `role="menu/menuitem"`                                                      |
| `Dropdown`/`SelectField` (`select.tsx:73`) | ↑/↓/Enter, no roles             | keep nav; add `role="listbox/option"`, `aria-selected`, type-ahead                                              |
| `CommandPalette` (new)                     | —                               | `role="combobox"` + `listbox`, `aria-activedescendant`, full trap                                               |
| Buttons/toggles (`inputs.tsx`)             | `title` only                    | `aria-pressed`/`aria-keyshortcuts` from `bindingLabel`                                                          |

Consolidating Esc/focus into the scope stack + a `useFocusTrap` helper (in `ui/`) means each overlay stops
carrying its own listener — the same de-duplication the command system brings to shortcuts.

---

## 6. Migration map (existing handler → command/binding)

| Existing                                                                                                                                       | Becomes                                                        | Notes                                    |
| ---------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | ---------------------------------------- |
| `Canvas.tsx:208-258` global keys                                                                                                               | `edit.*`, `select.up`, `arrange.*`, `nav.*Section` bindings    | behavior identical; guards → §2.5 policy |
| `editor/canvas/Present.tsx:113` + `ui/present.tsx:106`                                                                                         | `present.*` (one set, `present` scope)                         | de-dupes the two present keymaps         |
| `ui/overlay.tsx:97,213` Esc                                                                                                                    | scoped `overlay.dismiss`                                       | one binding, scope-aware                 |
| `ui/select.tsx:73`                                                                                                                             | `Dropdown` keeps local nav **or** adopts a shared `useListNav` | either way gains ARIA                    |
| `LibraryView.tsx:215`                                                                                                                          | `select.clear` (`library` select scope)                        |                                          |
| `GenerateModal.tsx:350` / `ThemeEditor.tsx:393` / `ShareModal.tsx:54` / `MediaPicker.tsx:360` / `DataEditor.tsx:72` / `SectionGenPopup.tsx:65` | scoped `overlay.dismiss` + `overlay.confirm`                   | drops 6 window listeners                 |
| `text-editor.tsx:196` ⌘B/I/U                                                                                                                   | `format.bold/italic/underline` (`textEditing` scope)           | routes to same bridge                    |
| `Topbar.tsx:93-98` hardcoded `title`                                                                                                           | `bindingLabel("edit.undo"/"edit.redo")`                        | generated labels                         |
| Input-local Enter/Esc (Topbar title, Sidebar, ChatPanel, link, recipient, search)                                                              | `submitCancel()` helper                                        | stay local, standardized                 |

---

## 7. Rollout phases

1. **Core + palette skeleton.** `ui/keys.ts` (registry, dispatcher, context/scope, `bindingLabel`),
   `ui/CommandPalette.tsx`, `⌘K`/`⌘,`. Register a first slice of commands (edit/undo/redo/delete/duplicate,
   nav). Prove the dispatcher coexists with the existing Canvas handler behind a flag.
2. **Migrate the editor keymap.** Move `Canvas.tsx` + both present keymaps + text marks onto the registry;
   delete those listeners. Tooltips read `bindingLabel`.
3. **Overlay scope + a11y.** Scope stack replaces per-modal Esc; add focus trap + ARIA to Modal/Popover/Menu;
   palette becomes a full combobox.
4. **Full command coverage + providers.** Register every §4 command; wire the sub-list providers (insert
   element, apply theme, go-to-section, move-to-folder, export-as). Generate the ⌘, sheet.
5. **Polish.** Sequence chords (`g …`), single-key library shortcuts (`c`, `/`, `o`), element clipboard,
   roving element selection (Tab/⇧Tab/Enter). Optional: user-rebinding UI.

---

## 8. Testing

- **Chord normalization** — `matchChord` unit tests across mac/win, dead keys, IME.
- **Precedence** — scoped dispatch: modal Esc beats editor Esc; `inputFocused` blocks non-`allowInInput`;
  `textEditing` allows only marks + Esc/Enter.
- **No-drift** — every command with a binding renders a label; the sheet enumerates the whole registry;
  no two enabled bindings collide within one scope (a registry lint).
- **Coverage** — a test asserts every catalogued flow in §4 has a registered command id.

---

## 9. Open decisions (need a call)

1. **Sequence chords (`g l`, `g s`, `1-9` slide jump).** In scope now (Phase 5) or cut? They add a small
   state machine to the dispatcher. _Recommended: include as opt-in Phase 5._
2. **`⌘K` double meaning.** `⌘K` is the palette globally, but the near-universal "insert link" while editing
   text. Proposal: `⌘K` = **link** only while `editor.textEditing`, palette everywhere else. OK, or give the
   palette a different in-editor chord?
3. **Element clipboard (`⌘C/⌘X/⌘V`).** Copy/cut/paste elements across sections/artifacts doesn't exist yet
   (`edit.copy/cut/paste` in §4.3). Build it as part of this, or defer?
4. **Single-key shortcuts in the library** (`c` create, `/` search, `o` open). Fast, but only safe when not
   `inputFocused`. Include, or keep everything modifier-based?
5. **Present `⌘⇧Enter` to start.** Matches Google Slides; confirm it doesn't clash with anything you use.
6. **Command-vs-binding split** and **core in `ui/keys.ts`** (vs a new top-level module). Confirm the home.
7. **Rebinding UI** — out of scope now (the model supports it). Confirm deferring.

---

## 10. Implementation status (as built)

Phases 1–5 shipped. The system lives where §2.1 proposed:

```
ui/keys.ts            core: Command/Binding registries · context keys + scope stack · one capture-phase
                      dispatcher (Esc→scope · sequences · single-chord · exclusive-swallow) · isMac ·
                      eventChord/normalizeChord/formatChord/bindingLabel · palette + sheet open state
ui/fuzzy.ts           fuzzyScore + rankItems (palette ranking)
ui/palette-model.ts   paletteDisplay (grouping/ranking → display rows) — pure, tested
ui/CommandPalette.tsx ⌘K combobox (fuzzy · grouped · recents · sub-list providers · a11y roles)
ui/ShortcutsSheet.tsx ⌘, reference, generated from the registry
ui/focus.ts           focusables + trapFocus (focus trap + restore) for modals
editor/commands.ts    every studio command + the migrated keymap + editor.* context effect
editor/clipboard.ts   element copy/cut/paste store + pure pasteElement placement
app/commands.ts       nav/workspace commands + g-sequences + single-key library chords (router-free)
app/route-context.ts  publishRoute — route → context keys (pure, tested)
app/AppCommands.tsx    installs the dispatcher, captures navigate, mirrors the route into context
```

Mounted once in `app/App.tsx`'s `AppShell` (`<AppCommands/> <CommandPalette/> <ShortcutsSheet/>`); the
studio also calls `installKeyDispatcher()` in `Studio.tsx` so its keymap works standalone.

**As-shipped bindings (deliberately minimal — muscle-memory only).** Global: `⌘K` palette · `⌘,`/`?`
shortcuts sheet. Editor: `⌘Z`/`⌘⇧Z`/`⌘Y` undo/redo · `Delete`/`Backspace` delete · `⌘D` duplicate ·
`⌘C`/`⌘X`/`⌘V` element clipboard · `Esc` select-parent · `⌘B`/`⌘I`/`⌘U` marks (while editing) · `⌘⇧↵`
present. The ⌘, sheet lists exactly these — grouped Edit · Select · Format · View · Present · Help.

Everything else stays reachable through the **⌘K palette** (searchable) and on-screen controls, but carries
**no key binding**: navigation (Go to library / templates / shared / trash), Generate with AI, change theme,
change format, share, move/duplicate section, toggle rails, regenerate element, strikethrough / inline-code
marks. The earlier build also bound `g`-sequences (`g l`…), single-keys (`c` create, `/` search), roving
element selection (`Tab`/`⇧Tab`/`Enter`), `↑`/`↓` section-nav, `⌘⌥↑/↓` move-section, `⌘\`/`⌘⌥I` view toggles
— all **removed** as over-build (too many bindings, and `Tab`-hijack was an a11y hazard). The sequence-chord
machinery in `ui/keys.ts` remains but is currently unused by any binding.

**Divergences from the spec above (decisions taken):**

- **§9.2 `⌘K`** — kept `⌘K` = the palette **everywhere**, including while editing text; insert-link stays on
  the format-bar button (a global link chord would need to reach into `MarkControls` local state). Simpler,
  no double meaning.
- **§4.11 / Phase 2 present keymaps** — **not** migrated onto the registry. The two present surfaces
  (`editor/canvas/Present.tsx`, `ui/present.tsx`) keep their own mode-scoped keydown handlers (they're
  coupled to local fullscreen/overview state and only fire in present mode). Instead, editor commands are
  gated off while presenting (`inEditor = has("editor") && !has("present")`), so nothing double-fires.
- **Overlay Esc** — migrated at the **primitive** level: `@ui/overlay` `Modal` (exclusive scope, focus trap +
  restore, `role="dialog"`/`aria-modal`) and `Popover` (exclusive scope) push scopes with `onEscape`, so
  every dialog/dropdown/menu built on them gets central Esc + shortcut-blocking for free. The individual
  overlay components' own legacy Esc listeners were left in place (harmless — idempotent close); they can be
  removed opportunistically. `Menu` gained `role="menu"`/`menuitem` + `↑`/`↓` roving focus.
- **Exclusive-scope gating** — a modal/popover scope blocks lower-scope bindings (only `allowInInput`
  globals like `⌘K` fire under it), so e.g. `⌘Z` never triggers editor undo while a dialog is open.
- **`o` (open)** single-key — deferred (ambiguous target); `c` and `/` shipped.

**Tests** (all green, in the repo's pure-logic style — no Solid render tests, per `vitest.config.ts`):
`ui/__tests__/keys.test.ts` (chords · resolution · guards · exclusive scope · sequence dispatch),
`fuzzy.test.ts`, `palette.test.ts`, `focus.test.ts` (trap/restore), `editor/__tests__/commands.test.ts`
(registry coverage), `keymap.test.ts` (migrated bindings + guard policy), `clipboard.test.ts` (paste
placement), `app/__tests__/route-context.test.ts`.

**Not yet done (follow-ups):** the sub-list **providers** are supported by the palette but only `doc.setFormat`
ships one — `theme.apply →`, `nav.goToSection →`, `artifact.moveToFolder →`, `export.as →` are straightforward
additions; retiring the redundant per-overlay Esc listeners; `submitCancel()` helper for input-local Enter/Esc;
user-rebinding UI.
