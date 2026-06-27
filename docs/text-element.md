# Galleo — Text Editing Core (design, LOCKED · Path B)

> Status: **Decision locked (2026-06-24).** Approach = **Path B: engine-native text editing.**
> The Galleo layout engine owns text layout everywhere; a **hidden `contenteditable` is used only
> as the OS input/IME/a11y sink** (CodeMirror's "contenteditable input model"). **v1 is Latin-first,
> desktop-first**; bidi/RTL, complex-script shaping, full screen-reader a11y, and real-time
> collaboration are explicitly **deferred** (design stays CRDT-friendly). Companion to
> `docs/layout-engine.md` and `docs/element-system.md`.

---

## 1. Why Path B

The engine must lay out text in non-DOM contexts no matter what (thumbnails, all three formats at
once, Present, PDF/PPTX/PNG). So a contenteditable can never be our single text layout. Path B
makes the engine the **one** text layout, with **one model** — so _what you edit is exactly what
exports, in every format_, with no overlay seam and no "two layouts must agree" reconciliation.

The hard part people fear (IME) is **"consume composition events," not "implement IME"**: we park a
hidden, focused, transparent `contenteditable` at the caret and read `beforeinput` / `input` /
`composition*` from it — exactly how CodeMirror/Monaco/Google Docs work. The CE input model also
gives us most screen-reader support for relatively cheap.

---

## 2. Principles

1. **One model** (`Para[]` per text element), **one layout** (the engine), used everywhere.
2. **Input sink, not layout sink** — the hidden `contenteditable` captures keystrokes/IME/a11y; it
   never lays out content.
3. **Measurement parity is sacred** — the same `measure()`/`layoutText()` runs in the editor and in
   export; the same fonts are self-hosted. (See §6.)
4. **Shared core** — all text-bearing element types (`heading`, `body`, `eyebrow`, `quote`,
   `caption`) use this one **RichText core**; they only differ in default style token, allowed
   marks, and single- vs multi-paragraph.

---

## 3. Scope — v1 vs deferred

| Subsystem                                       | v1                                   | Deferred                              | When/with                   |
| ----------------------------------------------- | ------------------------------------ | ------------------------------------- | --------------------------- |
| Model + edit ops                                | ✅                                   | —                                     | —                           |
| Greedy line-break + measure (Latin)             | ✅                                   | Knuth–Plass quality                   | later, optional             |
| Glyph/line geometry, caret, selection, hit-test | ✅                                   | —                                     | —                           |
| Hidden-CE input sink, typing                    | ✅                                   | —                                     | —                           |
| **IME / composition**                           | ✅ basic (CJK via CE sink + preedit) | hardened Android/dictation edge cases | iterative                   |
| Marks (b/i/u/s/link/code/color/highlight)       | ✅                                   | —                                     | —                           |
| Undo/redo (coalesced)                           | ✅                                   | —                                     | —                           |
| Clipboard                                       | ✅ plain-text + internal HTML        | full paste-from-Word sanitize         | later                       |
| Accessibility                                   | ✅ minimal (CE mirror holds text)    | full doc ARIA model                   | later                       |
| **Bidi / RTL**                                  | ❌                                   | UBA reorder + RTL caret/selection     | bidi-js, when we target RTL |
| **Complex-script shaping**                      | ❌ (Latin/Canvas metrics)            | ligatures/Indic/Arabic shaping        | HarfBuzz-wasm               |
| **Collaboration**                               | ❌ (model is CRDT-ready)             | multiplayer                           | Yjs over the model          |

---

## 4. Data model (the RichText core)

```ts
type TextContent = {
    // a text element's content (heading/body/quote/…)
    paras: Para[];
    style: "display" | "h1" | "h2" | "body" | "eyebrow" | "quote" | "caption"; // → token scale
    multiline: boolean; // false for eyebrow/heading single-line; true for body
};
type Para = {
    text: string; // UTF-16; caret moves by GRAPHEME via Intl.Segmenter
    marks: Mark[]; // ranges over `text` (ProseMirror-style)
    align?: "start" | "center" | "end";
};
type Mark = {
    from: number;
    to: number;
    type: "b" | "i" | "u" | "s" | "code" | "link" | "color" | "hl";
    value?: string;
}; // link href · color/hl hex

type Point = { p: number; o: number }; // paragraph index, code-unit offset
type Selection = { anchor: Point; focus: Point; affinity: "up" | "down" }; // affinity disambiguates line-wrap boundary
```

**Rendering derives `runs[]`** by splitting each paragraph at mark boundaries → the engine `text`
node consumes runs (see `element-system.md` §3). Marks are stored as _ranges_ (not per-run) because
ranges are far easier to edit (insert/delete shifts range endpoints; toggling a mark is a range op).

---

## 5. Edit operations (the transform set)

All edits go through a small, invertible op set (enables undo + future CRDT):

```
insertText(at: Point, s: string)
deleteRange(from: Point, to: Point)
splitPara(at: Point)                 // Enter (only if multiline)
mergePara(p: number)                 // Backspace at para start
setMark(from, to, type, value)       // apply
clearMark(from, to, type)
toggleMark(sel, type, value)         // applied to selection
setAlign(p, align)
setStyle(style)                      // element-level (changes token scale)
```

Each op returns its **inverse** (for undo) and adjusts overlapping `Mark` ranges. Typing coalesces
consecutive `insertText` into one undo unit until a boundary (space, 1s pause, caret jump).

---

## 6. Layout & the shared measurement contract (editor == export)

The single most important invariant. **One function, used in the editor AND in export:**

```ts
// metrics for a styled string at a given font (v1: Canvas 2D measureText; export: node-canvas/skia, same metrics)
measure(text: string, font: FontKey): { advances: Float32Array; ascent; descent };

// greedy first-fit line layout at a width → positioned lines
layoutText(paras: Para[], width: number, tokens: Tokens): Line[];
type Line = { p: number; from: number; to: number;
              glyphs: { ch: number; x: number }[];  // per-grapheme x for caret/hit-test
              baseline: number; ascent; descent; width: number };
```

- v1 shaping = **Canvas 2D `measureText`** for advances (Latin); per-grapheme x via cumulative
  substring/word measurement, memoized per (string, font).
- **Line breaking** = greedy first-fit using `Intl.Segmenter('word')` break opportunities; long
  words/URLs hard-break. (Knuth–Plass is a later quality upgrade.)
- `Intl.Segmenter('grapheme')` defines caret stops and delete units.
- **Export parity:** the _same_ `measure`/`layoutText` runs server-side against the _same self-hosted
  fonts_. Golden-image tests per (theme, style) guard drift. Avoid justified text in v1.

`layoutText` output is what the engine's `MeasureText`/`text` node consume, what the caret/selection
read for geometry, and what every backend renders — **the one layout, everywhere.**

---

## 7. Caret & selection

- **Caret** = `Point + affinity`; render by looking up the glyph `x` at the offset on its line
  (affinity picks the line at a wrap boundary). Blink via CSS.
- **Movement:** left/right by **grapheme** (`Intl.Segmenter`), ctrl+arrow by **word**, up/down by
  **x-target** across lines (remember desired x), home/end via line geometry.
- **Selection** = `{anchor, focus}`; render as per-line highlight rects (split the range by line).
  Shift+move extends; double-click = word; triple-click = paragraph.

## 8. Hit-testing

Pixel → `Point`: find the line by y, then **binary search** the line's glyph `x[]` for the nearest
grapheme boundary. O(log n) per line; trivial because the geometry already exists.

## 9. Input layer — hidden `contenteditable` sink (the CodeMirror pattern)

A single, app-global, transparent, focused **`contenteditable`** is parked at the caret while a text
element is in edit mode. It is the _only_ place the browser thinks typing happens.

```
on focus(text element):   mount/position the hidden CE at the caret; mirror current text for AT
beforeinput / input    →  translate to edit op(s) → apply → re-layout → re-render
compositionstart       →  enter IME mode
compositionupdate      →  render PREEDIT inline at caret (styled, underlined) — not yet committed
compositionend         →  commit composed text as insertText → exit IME mode
keydown (nav/shortcuts)→  arrows/home/end/cmd+B etc. handled against our model (preventDefault)
paste / copy / cut     →  clipboard handlers (see §11)
```

We use the **contenteditable** input model (not a bare textarea) specifically because it yields
better IME + screen-reader behavior. Because browsers fire little/nothing _during_ IME composition,
we read `composition*` events and, where needed, fall back to reading the CE's text on a microtask.

## 10. Undo / redo

A transaction stack of `{op, inverse}` with typing coalescing. Redo stack cleared on new edit.
Selection is snapshotted per transaction so undo restores the caret. (Op-based → drop-in for Yjs later.)

## 11. Clipboard

- **Copy/cut:** serialize the selection to **plain text** + a minimal **internal HTML** (marks
  encoded) for round-trip fidelity within Galleo.
- **Paste:** v1 = plain text (sanitized) + internal-HTML when source is Galleo; full
  paste-from-Word/web HTML→marks sanitization is a later upgrade.

## 12. Accessibility (v1 minimal)

The hidden CE holds the editable text, so screen readers get _something_ during editing. v1 ships
that + proper roles/labels on text elements; a full document ARIA/virtual-cursor model is deferred.

## 13. Rendering

- **Editor (web):** the engine emits positioned text (DOM spans absolutely placed per `Line.glyphs`,
  or a text layer) + caret + selection rects. Editing mutates the model → re-`layoutText` → repaint.
- **Everywhere else** (thumbnails, other-format previews, Present, PDF/PPTX/PNG): the same
  `layoutText` output → the matching backend. No contenteditable involved.

## 14. Integration (element system + layout engine)

- Text-bearing element specs (`heading/body/eyebrow/quote/caption`) wrap the RichText core; their
  `layout(data, ctx)` returns the engine `text` node built from `layoutText(data.paras, ctx.box.w,
ctx.tokens)`. Surrounding boxes reflow because the engine resolves height from the text (height-out).
- Selection chrome (caret/handles/format toolbar) positions from the element's computed box + line
  geometry — both already produced by the engine.

## 15. The deferred tail — how each lands later (no rework)

| Deferred                   | How it plugs in                                                                                                                               |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| **Bidi / RTL**             | Insert a UBA reorder (bidi-js) between segmentation and line layout; caret/selection rect logic becomes run-direction-aware. Model unchanged. |
| **Complex-script shaping** | Swap `measure()` from Canvas metrics to **HarfBuzz-wasm** shaping (clusters + ligatures); `layoutText` interface unchanged.                   |
| **Full a11y**              | Add a virtual ARIA cursor/mirror over the same model.                                                                                         |
| **Collaboration**          | Bind **Yjs** to the op set (§5) — ops are already invertible/positional, so this is additive.                                                 |

---

## 16. Risks & mitigations

| Risk                                   | Mitigation                                                                                    |
| -------------------------------------- | --------------------------------------------------------------------------------------------- |
| Editor↔export text drift               | One `measure`/`layoutText`; self-host exact fonts; golden-image tests per theme/style.        |
| IME during composition (sparse events) | CE input model + `composition*` + microtask read-back; test CJK early even though "v1 basic". |
| Android `beforeinput` quirks           | Desktop-first v1; treat mobile editing as a later hardening pass.                             |
| Per-glyph measurement cost             | Memoize advances per (string,font); measure per word, not per char.                           |
| Multi-paragraph perf in long body copy | Element-sized text is small; incremental relayout per edited paragraph if needed.             |

## 17. Build plan & Definition of Done (v1)

| Step | Deliverable                                                                            |
| ---- | -------------------------------------------------------------------------------------- |
| T1   | Model + edit ops + undo (headless, unit-tested)                                        |
| T2   | `measure` + `layoutText` (greedy, Latin) + memoization; engine `text` node consumes it |
| T3   | Caret + selection geometry + movement (Intl.Segmenter) + hit-testing                   |
| T4   | Hidden-CE input sink: typing, nav, shortcuts, marks toolbar                            |
| T5   | IME composition + preedit; clipboard (plain + internal HTML); coalesced undo           |
| T6   | Export parity: same `layoutText` server-side → PDF text matches editor (golden tests)  |

**DoD (v1):** type/select/format Latin rich text (b/i/u/s/link/code/color/hl) across multiple
paragraphs in a Text element; caret/selection correct including at line wraps; basic CJK via IME;
undo/redo; copy/paste plain; and **the same paragraph renders identically in the editor, in all
three layout modes, and in a PDF export** (golden-image verified). Bidi/RTL, complex-script shaping,
full a11y, and collaboration are explicitly out of v1.

## 18. Open questions

- Editor text paint: **DOM spans** (selectable, simplest) vs a **canvas text layer** (closest to
  export). Lean: DOM spans for edit, canvas for Present/export.
- Multi-paragraph vs single-paragraph default per element type (eyebrow/heading = single; body = multi).
- Where export layout runs (client reuse of `layoutText` vs server worker) — see `layout-engine.md`.
