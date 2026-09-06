# Planning — the richer paint model

> Item 8 of [`engine-gaps.md`](engine-gaps.md), the "generated output looks engine-made" lever.
> The engine's paint vocabulary today: two-stop linear gradients, one uniform corner radius, one
> all-sides border, a shadow that is a CSS string on fills and structured on surfaces, and a
> rectangular clip. This plan grows the vocabulary to what the listed unlocks actually need —
> multi-stop and radial gradients, per-corner radius, per-side borders, one structured shadow,
> glass panels, and elliptical crops of composed content — with an explicit per-backend contract
> for every field. **Status: built 2026-09-06.** Deviations: the per-corner radius consumer is the tabs element
> (the open tab keeps square base corners) rather than a catalog field; `emitRect` in the PDF
> backend takes the whole `FillLeaf` instead of a widened inline shape; DOM side borders write
> through `setProperty` (kebab-case assignment is inert); and `backdropCss`'s canonical gradient
> string gained stop percentages, with its pin updated. Open questions resolved as proposed:
> `glass` is container-only, radial gradients centre in the box.

## Why this is cheaper than it looks (verified against the tree, 2026-09-06)

The hard problem of a paint model is four render targets agreeing, and the degrade lattice for
that already exists:

- **PPTX rasterizes what it cannot shape.** `emitKind` (`pptx.ts:186-193`) already sends gradient
  and clipped rects down the raster path. Every capability below reaches PPTX at full fidelity by
  extending one classifier function; no autoshape work at all.
- **PDF flattens by stated decision.** `pdf-draw.ts:60` already flattens gradients to a midpoint
  and drops shadows, with the comment saying so. New paint follows the same rule, per capability.
- **The 2D canvas (Present mirror, PNG export) is native-capable** for everything proposed:
  `createRadialGradient`, per-corner `roundRect`, real shadows, `ellipse()` clips.
- **The DOM is CSS** — full fidelity everywhere.
- **Contrast grading is already gradient-safe**: `diagnose.ts` skips non-hex paint as
  "unjudgeable without sampling", so richer fills cannot corrupt the corpus checks.

The pattern throughout is the one the semantics work set: shared field, per-backend
interpretation, explicit ignore where meaningless (`link` on PNG).

## The model (all additive; no stored-content migration)

One `Gradient` type, declared once in `model/artifact.ts` beside `SectionBackground` (the stored
contract that already carries the shape) and imported by the engine — today the same object
literal is written out three times (`DrawStyle`, `FillLeaf`, `SectionBackground`).

1. **Gradient**: `{ from, to, angle? }` stays as the stored two-stop sugar; gains
   `stops?: { at: number; color: string }[]` (0..1, wins over from/to when present) and
   `kind?: "linear" | "radial"` (radial is centre-out; angle ignored). No migration: every stored
   gradient already parses.
2. **Radius**: `radius?: number | [number, number, number, number]` (tl tr br bl, the CSS order).
   Uniform stays a number everywhere it is one today.
3. **Border**: gains `sides?: ("top" | "right" | "bottom" | "left")[]` — absent means all four,
   as today. One color and width for all drawn sides; per-side colors have no consumer and are
   not taken.
4. **Shadow**: `FillLeaf.shadow` becomes the structured `{ blur; dy; dx?; spread?; color }` the
   surface `DrawStyle` already uses — one shadow shape for the whole engine. FillLeaf is compose
   output, never stored, so the CSS-string form has no artifacts to migrate; its composers move
   with it. This supersedes half of the E7 note (shadow becomes canvas-honored, PDF drops it).
5. **Backdrop blur**: `FillLeaf.backdropBlur?: number` (px). A DOM enhancement over a translucent
   fill: exports degrade to the translucent fill itself, which is the same visual family rather
   than a hole.
6. **Elliptical clip**: `EngineNode.clip` config gains `shape?: "ellipse"`; the emitted command's
   `clip` rect gains the same flag. The clip stays a rect; the shape is how the rect crops.
   Arbitrary paths are not taken — the listed unlock is circular crops of composed content, and
   an ellipse in a rect is exactly that.

## The per-backend contract

| Capability                   | DOM             | 2D canvas / PNG       | PDF                              | PPTX                    |
| ---------------------------- | --------------- | --------------------- | -------------------------------- | ----------------------- |
| Multi-stop / radial gradient | CSS             | native                | flatten to stop average (stated) | raster (already)        |
| Per-corner radius            | CSS             | `roundRect` array     | real, via the path builder       | raster when non-uniform |
| Side-selective border        | CSS             | line strokes          | real, as lines                   | raster                  |
| Structured shadow            | box-shadow      | native                | dropped (stated)                 | raster                  |
| Backdrop blur                | backdrop-filter | translucent fill only | translucent fill                 | translucent fill        |
| Ellipse clip                 | clip-path       | `ellipse()` clip      | clip path                        | raster (already)        |

`emitKind` grows exactly one clause: a rect with stops/radial, non-uniform radius, side-selective
border, shadow, backdropBlur, or a shaped clip is `"raster"`.

## Consumers (a capability without one is dead code)

- **Side borders**: `container`'s `sideline`/`topline` surface styles are today faked with 3px
  fill bars (`container.ts:145,155`); they become real borders and the fake bars go. The internal
  consumer that proves the field.
- **Glass**: a new `glass` container surface style (value-set `model/elements.ts`): translucent
  `surface` fill + structured shadow + `backdropBlur`, theme-reactive because it reads tokens.
  The editor's surface segmented control gains the option for free (value-set driven).
- **Circle crop**: container data gains `shape?: "circle"` → ellipse clip + full radius; the
  "avatar holding real composed content" unlock, one field.
- **Radial gradient**: `SectionBackground` accepts it through the shared type; `backdropCss` and
  the section ground painters render it — the vignette/spotlight backdrop without a supplied
  image. The theme editor's background control follows the value it already edits.
- **Depth**: `nodePaint`'s solid treatment may adopt a subtle multi-stop later; not required for
  the round.
- **AI catalog**: the container entry teaches `glass` and `shape: "circle"`; the section
  background teaches radial. Small `when` lines, no new entries.

## Phases

1. **Model + coerce (S)**: the shared `Gradient` in `model/artifact.ts`, the widened
   radius/border/shadow/backdropBlur/clip fields in `node.ts`, coercion where element data reaches
   them, the E7 shadow note updated.
2. **Backends (M)**: DOM + canvas full fidelity; `svg-emit` gradient defs learn stops; PDF gains
   per-corner paths and side-border lines, keeps its stated flattens; `emitKind`'s one new clause;
   pins per backend (`backends.test`, `backends.dom.test`, `pdfdraw`/`pptx` emit-kind pins),
   red-first where behavior changes.
3. **Consumers (M)**: sideline/topline on real borders (the fake bars deleted, existing container
   pins updated), `glass` + `shape: "circle"` on container, `SectionBackground` radial through
   `backdropCss` and the ground painters, catalog lines.
4. **Gates + docs (S)**: full suites, all guards, `eval:shots` before/after — paint-only, so the
   corpus geometry must not move at all and any color-derived check shift is examined, not
   accepted; `rendering.md` paint table; gaps item 8 closed with status.

## Not taken, and why

Conic gradients (no listed unlock, hostile in PDF/PPTX). Blend modes (no cross-backend story that
is not raster-everything). Duotone image treatment (an image-pipeline concern, its own doc).
Arbitrary path clips (ellipse covers the unlocks; paths reopen hit-testing and fragment
questions). Per-side border colors (no consumer). Theme-level gradient/glass tokens (the theme
vocabulary deserves its own pass once the paint exists; glass already recolors through tokens).

## Open questions

1. Does `glass` join `SURFACES` for every composite or container only? Proposal: container only;
   composites inherit through their panels later if wanted.
2. Radial gradient centre: fixed at the box centre v1, or an optional focus point? Proposal:
   fixed centre; a focus field is additive later.
