# Plan: stop the inspector covering the canvas (slide-first docking)

Status: designed, not started. Execute when picked up; nothing depends on it.

## The problem

The right-rail inspector is a floating panel (`absolute right-3 top-1/2`, 240–284px + the 64px
rail) over a canvas that reserves only the rail. It auto-opens on every non-inline selection
(`useInspectorAutoOpen` in `editor/Editor.tsx`), so selecting an image summons a panel that can
cover the element it describes — worst on the exact controls whose point is live feedback (the
zoom and radius sliders).

## Options considered (kept for the record)

- **Dock and reflow** (reserve `padR` like `leftOpen` reserves `padL`): occlusion becomes
  impossible, but every auto-open reflows the stack — text re-wraps as a side effect of
  selecting. Viable with dampeners; superseded by the slide below.
- **Dodge** (float, slide the panel off the selection, auto-scroll otherwise): fixes the
  screenshot, still covers neighbours, horizontal occlusion can't be scrolled away, edge cases
  forever. Mitigation, not a fix; survives only as the degraded mode at tiny widths.
- **Auto-scroll only**: scroll is vertical, the occlusion is horizontal. Too weak alone.
- **Shrink the panel's role** (more controls in the context bar, no auto-open): good ongoing
  hygiene, not a solution — the long tail still needs the panel.
- **Peek-through transparency**: solves reading beneath, not adjusting-while-watching. Rejected.
- **Anchor the panel to the element**: a tall panel beside a small element covers the
  neighbourhood anyway. Rejected.

## The design: slide first, shrink only for the remainder

When the panel opens, TRANSLATE the whole section stack left instead of reflowing it. It works
because the painter centres each capped card (1000–1180px by format) inside `fullW`
(`x = (fullW − layoutW) / 2` in `paintSectionStack`), so most screens have real dead gutter on
both sides — and the panel is welcome to cover GUTTER; occlusion only means covering CONTENT.

Mechanics, and why it is seamless in this codebase:

- One CSS transform on the stage container (`translateX(-dx)`, ~180ms ease-out,
  compositor-only). Every overlay — rings, bars, drop indicators, the inline text editor — is
  an absolutely-positioned CHILD of the stage, so all of it rides the transform for free.
  Pointer math goes through `getBoundingClientRect`, which reflects transforms, so hit-testing
  stays correct even mid-animation. Nothing re-wraps, nothing resizes.
- `dx_needed = max(0, cardRight − panelLeft + gap)`;
  `dx_available = cardLeft − minLeftGutter` (plus the left panel's width where auto-collapsing
  it is acceptable). Apply `min(needed, available)`.
- **Tier 1 (viewports ≳ ~1350px, the common case)**: `available ≥ needed` — pure slide, zero
  reflow.
- **Tier 2 (narrow)**: slide what the gutter gives, then shrink `fullW` by the shortfall only —
  a small reflow softened by selection-anchored scroll (extend `anchorScroll` in
  `editor/Canvas.tsx` to hold the SELECTED element still, not just section tops).
- **Sticky per selection session**: opening slides once; switching selection never re-slides.
  Undock mirrors the slide back. Phone is untouched (sheets own that tier).

This dominates plain docking: the common case is a rigid, legible "content makes room" slide,
and reflow is paid only below the width where geometry forces it, and only for the shortfall.

## Execution checklist

- [ ] `dockShift` derivation in the editor store: panel width (240/284 by breakpoint) + card
      geometry (`sectionLayoutWidth`, `fullW`, centring) → `{slide, shrink}` per viewport;
      recompute on resize and on `rightTab` changes.
- [ ] Stage transform: apply `translateX(-slide)` with the transition on the stage container;
      confirm every overlay rides it (rings, ContextBar, DropIndicators, TextEditor,
      EmptyRegionAdd, video embeds).
- [ ] Tier 2: thread `shrink` into the canvas `padR`; extend `anchorScroll` to anchor the
      selected element's top through the reflow.
- [ ] Sticky/undock: slide on first open per selection session; grace period on deselect
      (see open questions); mirror back on close.
- [ ] Left-panel interplay: optionally auto-collapse `leftOpen` before entering tier 2
      (see open questions).
- [ ] E2E specs (editor project): panel ∩ selected-card = ∅ after selection at desktop width;
      tier-1 open/close causes zero re-wrap (region sizes identical before/after); slider drag
      in the panel with the element fully visible.
- [ ] `.docs/rendering.md` §6 note + this plan ticked.

## Acceptance

- With the inspector open, the panel never intersects the selected section card at any
  viewport ≥ the degraded-mode floor.
- At tier-1 widths, opening/closing the panel causes zero re-wrap: every region's size is
  identical before and after (only x offsets change).
- The slide is one transform: no per-frame paints, no layout thrash.

## Open questions (decide at pickup)

1. Does the palette flyout slide the stack too, or stay an overlay? (Browse-then-drag leaves
   the panel anyway; overlay may be fine there.)
2. When `leftOpen` and the gutter alone is short: auto-collapse the minimap panel before
   falling to tier 2?
3. Undock grace on deselect: immediate, or ~1s so click-around editing doesn't pump the slide?
