# The paint model: gradients, corners, borders, shadow, glass, crops

> The engine's paint vocabulary — item 8 of [`engine-gaps.md`](../planning/engine-gaps.md), the
> "generated output looks engine-made" lever: multi-stop linear and radial gradients, per-corner
> radius, side-selective borders, one structured shadow, backdrop blur for glass panels, and
> elliptical crops of composed content, with an explicit per-backend contract for every field.

## Why the degrade lattice makes this cheap

The hard problem of a paint model is four render targets agreeing, and the degrade lattice for
that exists once, not per capability:

- **PPTX rasterizes what it cannot shape.** `emitKind` (`canvas/render/pptx.ts`) classifies each
  command; rich paint reaches PPTX at full fidelity through the raster path, so no autoshape work
  is ever needed — the raster path is what keeps the export honest.
- **PDF flattens by stated decision.** `drawSvgPath` paints one flat color, so a gradient
  flattens to the midpoint of its stops and shadows drop, with the comment in
  `canvas/render/pdf-draw.ts` saying so. Every capability follows the same rule, per capability.
- **The 2D canvas (Present mirror, PNG export) is native-capable** for everything in the model:
  `createRadialGradient`, per-corner `roundRect`, real shadows, `ellipse()` clips.
- **The DOM is CSS** — full fidelity everywhere.
- **Contrast grading is gradient-safe**: `diagnose.ts` skips non-hex paint as "unjudgeable
  without sampling", so richer fills cannot corrupt the corpus checks.

The pattern throughout is the one the render-command semantics set: shared field, per-backend
interpretation, explicit ignore where meaningless (`link` on PNG).

## The model (all additive; no stored-content migration was needed)

One `Gradient` type, declared once in `model/artifact.ts` beside `SectionBackground` (the stored
contract that already carried the shape) and imported by the engine — where three object literals
(`DrawStyle`, `FillLeaf`, `SectionBackground`) used to spell it out separately.

1. **Gradient**: `{ from, to, angle? }` stays as the stored two-stop sugar; `stops` (0..1,
   ordered, wins over from/to when present) and `kind?: "linear" | "radial"` extend it. Radial is
   centre-out from the box centre and ignores `angle`; a focus point would be additive later.
   Every previously stored gradient still parses. `gradientStops`
   (`canvas/render/backends.ts`) is the one stop-list resolver every backend paints from, and
   `gradientCss` emits explicit stop percentages, so the editor and canvas exports agree on a
   gradient's run.
2. **Radius**: `Radius = number | [number, number, number, number]` (tl tr br bl, the CSS order),
   with the `corners`/`maxRadius` helpers in `canvas/engine/node.ts`. Uniform stays a number
   everywhere it is one.
3. **Border**: `sides?: ("top" | "right" | "bottom" | "left")[]` — absent draws all four, as
   ever; present draws only those, one color and width for all drawn sides. The DOM writes side
   borders through `setProperty` (kebab-case style assignment is inert).
4. **Shadow**: `FillLeaf.shadow` is the structured `{ blur; dy; dx?; spread?; color }` the surface
   `DrawStyle` always used — one shadow shape for the whole engine. FillLeaf is compose output,
   never stored, so the old CSS-string form had no artifacts to migrate.
5. **Backdrop blur**: `FillLeaf.backdropBlur` (px). A DOM enhancement over a translucent fill:
   exports degrade to the translucent fill itself, which is the same visual family rather than a
   hole.
6. **Elliptical clip**: `EngineNode.clip` carries `shape?: "ellipse"`, and the emitted command
   carries `clipShape` beside its clip rect. The clip stays a rect; the shape is how the rect
   crops. Arbitrary paths are not taken — the unlock is circular crops of composed content, and an
   ellipse in a rect is exactly that.

## The per-backend contract

| Capability                   | DOM             | 2D canvas / PNG       | PDF                              | PPTX                    |
| ---------------------------- | --------------- | --------------------- | -------------------------------- | ----------------------- |
| Multi-stop / radial gradient | CSS             | native                | flatten to stop average (stated) | raster                  |
| Per-corner radius            | CSS             | `roundRect` array     | real, via the path builder       | raster when non-uniform |
| Side-selective border        | CSS             | line strokes          | real, as lines                   | raster                  |
| Structured shadow            | box-shadow      | native                | dropped (stated)                 | raster                  |
| Backdrop blur                | backdrop-filter | translucent fill only | translucent fill                 | translucent fill        |
| Ellipse clip                 | clip-path       | `ellipse()` clip      | clip path                        | raster                  |

In PPTX, `richFill` gates the classifier: a rect with stops/radial, non-uniform radius,
side-selective border, shadow, or backdropBlur is `"raster"`, as is any clipped rect (which
already was). The PDF backend's `emitRect` takes the whole `FillLeaf`, so per-corner paths and
side-border lines draw for real while its stated flattens hold.

## Consumers (a capability without one is dead code)

- **Side borders**: `container`'s `sideline`/`topline` surface styles are real borders
  (`sides: ["left"]` / `["top"]`, accent, width 3, `canvas/elements/composite/container.ts`); the
  3px fill bars that faked them are gone. The internal consumer that proves the field.
- **Glass**: `glass` in `CARD_STYLES` (`model/elements.ts`): translucent surface fill
  (`hexA(t.surface, 0.55)`) + hairline line border + structured shadow + `backdropBlur: 14`,
  theme-reactive because it reads tokens. The editor's surface segmented control carries the
  option for free (value-set driven). Glass is container-only; composites can inherit it through
  their panels later if wanted.
- **Circle crop**: container `shape: "circle"` → ellipse clip on both axes plus full radius, so
  the crop clips composed children while the fill's own roundness stays the radius — the "avatar
  holding real composed content" unlock, one field.
- **Radial gradient**: `SectionBackground` accepts it through the shared type; `backdropCss` and
  the section ground painters (`canvas/render/backends.ts`, read by `ui/section.tsx`) render it —
  the vignette/spotlight backdrop without a supplied image. The theme editor's background control
  follows the value it already edits.
- **Per-corner radius**: the tabs element — the open tab keeps square base corners
  (`[r, r, 0, 0]`, `canvas/elements/composite/tabs.ts`).
- **AI catalog**: the container entry teaches `glass` ("a frosted card for text over an image
  band") and the circle shape ("crops the whole panel and its children round for a badge or a
  portrait medallion"); the site prompt teaches the radial band as a spotlight ground for one
  statement.

## Not taken, and why

Conic gradients (no listed unlock, hostile in PDF/PPTX). Blend modes (no cross-backend story that
is not raster-everything). Duotone image treatment (an image-pipeline concern, its own doc).
Arbitrary path clips (ellipse covers the unlocks; paths reopen hit-testing and fragment
questions). Per-side border colors (no consumer). Theme-level gradient/glass tokens (the theme
vocabulary deserves its own pass now that the paint exists; glass already recolors through
tokens). A subtle multi-stop in `nodePaint`'s solid treatment (possible later; nothing needs it).
A radial focus point (fixed centre covers the unlock; a focus field is additive).
