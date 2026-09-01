---
name: galleo-themes
description: Design new Galleo themes that match this codebase owner's taste, and verify them on real content before proposing. Use when asked to add, replace, retune or evaluate themes in model/theme.ts, or when theme colour, typography, radius, border, shadow or scrim is in question.
---

# Designing Galleo themes

A theme is a token set in `model/theme.ts`: eight colours, three font families, a heading weight,
radius, border width, shadow, scrim, and optional motion. `THEME_LIST` is the curated library.

Two things make this hard, and both have been learned the expensive way. The owner's taste is
narrow and specific, and a theme cannot be judged on a swatch. Follow the recipe and the
verification loop below rather than designing by eye.

## The recipe

Derived by measuring the themes the owner picked out of the library (studio, press, gazette,
atelier, stark, couture, obsidian, arcade). Every one of them obeys all of it.

- **The ground is near-achromatic.** OKLCH chroma <= 0.013, near-white (L 0.94-0.99) or
  near-black (L 0.13-0.26). Never coloured paper. This is the rule most often broken and it is
  the single strongest predictor of rejection: the two themes the owner disliked most, pueblo and
  orchard, were the only two with coloured grounds (chroma 0.030 and 0.021).
- **Ink contrast is very high.** 15:1 or better against the ground; the picked themes run
  14.9-19.1:1. The disliked ones sat at 11.4 and 10.5.
- **The accent is one warm hue or none.** Either OKLCH hue 26-90 at chroma 0.10-0.19, or
  essentially achromatic (chroma < 0.02). Blues, teals and purples have all been rejected as
  accents; a low-chroma cool accent used as a near-neutral is fine.
- **The construction is flat and crisp.** Radius 0-6 for most, hairline or heavy rule, no soft
  lift unless the theme is deliberately the rounded one. Big radii and soft shadows are allowed
  as *the point of that theme*, never as a default.
- **Type carries the character.** A serif display over a neutral grotesque or a mono is the
  house pairing. The display face is the single largest differentiator available.

## Where variety actually comes from

Colour is nearly fixed by the recipe, so it cannot carry differentiation. These do:

- **scrim** (image treatment, 0.2-0.75). The most underused lever in the library. It decides
  whether a photograph stays bright or sinks under its type, and every artifact has a backdrop.
- **radius / border / shadow** as a triple. Pick a construction, do not mix at random:
  flat (r0, b1, none) · ruled (r0-2, b2-3, none) · block (r0, b3, hard offset) ·
  carded (r10-24, b0, soft lift) · glow (r6-16, b1, coloured halo).
- **ground temperature** within chroma <= 0.013, and ground *lightness* (a charcoal at L 0.26 is
  a different theme from a true black at L 0.13).
- **the type trio.**

Before adding one, check what is already occupied so the new theme fills a gap:

    pnpm exec tsx .local/themes/liked.ts     # profile any set of themes
    # radius/border/shadow/scrim spread, accent hues, unused display faces

## Verification, in order

Never propose a theme that has not been through all three.

1. **Contrast floors.** `pnpm exec tsx .local/themes/contrast.ts`. Measures ink, soft, muted,
   onAccent and accent against BOTH bg and surface, since a theme can pass on its page and fail
   on its own cards. Floors: ink >= 8, soft >= 4.5, muted >= 3, onAccent >= 4.5, accent >= 3.
   These are the hard floor; the recipe's 15:1 ink is the taste target and is higher.
2. **The full suite.** `pnpm -s test`. Real invariants live here, not just contrast:
   the tone-band guarantee in `compose.test.ts` (a caption on a tint band must not read worse
   than on the page), unique ids, and the templates guard.
3. **Real content.** `pnpm exec tsx .local/themes/shots.ts --themes a,b --artifacts brandGuidelines`
   then `python3 .local/themes/sheet.py a,b brandGuidelines 0 2300` to compare side by side.
   This is the only step that finds what the numbers miss.

**Judge on templates, never the corpus.** The corpus is 85% plain sections with zero tone bands,
zero bleed and zero framed heroes, so it cannot show what a theme does with its own vocabulary.
Templates are hand-authored and use it: `brandGuidelines` for decks, `landingPage` for websites,
`pressKit` for documents.

## Traps that have already cost time

- **`DEFAULT_THEME = THEME_LIST[0]`.** Inserting at the top silently changes the product default.
  Append.
- **Removing a theme breaks templates.** `services/core/templates.ts`, the AI corpus files and
  two test files name theme ids. `resolveTheme` falls back to the default silently, so the
  gallery flattens rather than failing; the guard in `services/core/__tests__/templates.test.ts`
  is what catches it. Ship a migration map with any removal.
- **On a dark theme the accent must be light, with a dark `onAccent`.** An accent doubles as a
  whole band ground under `tone: "accent"`. Darkening a dark theme's accent fails twice: it
  drops below 3:1 against the page and still cannot carry text.
- **Fonts must be on the picker lists** (`DISPLAY_FONTS`, `BODY_FONTS`, `MONO_FONTS`) or the
  theme editor becomes a one-way door: the field shows the current face but the list does not
  contain it. `pnpm fonts:vendor` can fetch any Google family a theme names, and
  `pnpm check:fonts` verifies every named family has a vendored face.
- **Structure only shows where sections are cards.** On the web format sections bleed
  edge-to-edge, so radius, border and shadow vanish and only scrim, colour and heading weight
  separate two themes. Check both a deck and a website.
- **A theme id must be unique.** `vellum` and `ember` have both been reinvented by accident.

## What has been rejected

Do not re-propose these; each was built, rendered and turned down.

- Coloured grounds: navy (harbor), bone (quarry), espresso (anvil v1), ochre (kiosk), cool grey
  (meridian).
- Card archetypes as a default: 16-18px radius with a soft lift on themes that had no reason to
  be the rounded one.
- Mid-chroma accents outside the warm band: blues, teals, purples, magenta.
- Any theme whose ink contrast is under about 14:1.
