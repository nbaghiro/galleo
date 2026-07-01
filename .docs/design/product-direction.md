# Galleo — Product Direction (draft v0.1)

> Working anchor for the design exploration. Everything here is a starting position to
> argue with, not a settled spec. The point right now is to align on **what the editor is**
> so the visual directions have something real to dress. (For the implemented shape of the
> engine, elements, and themes, see the sibling specs under `.docs/`.)

## One-liner

**Galleo turns a prompt into a beautiful, on-brand artifact — deck, document, magazine, or
website — and gives you a calm, AI-native editor to refine it.** A Gamma competitor, but with
a sharper editorial point of view and a design language that doesn't look like everyone else's.

The name comes from **galley** (a printer's proof — the artifact just before it's published)

- **gallery** (something made to be shown). The product is about getting from raw idea →
  publishable artifact, fast, without it looking generic.

## What you make (one engine, four output types)

| Type       | What it is                                           | Why it matters                                     |
| ---------- | ---------------------------------------------------- | -------------------------------------------------- |
| **Deck**   | Card-based presentation (reflowable, not fixed 16:9) | the wedge — competes with Gamma/Pitch/Beautiful.ai |
| **Doc**    | Long-form document / report / proposal               | the "magazine/editorial" surface                   |
| **Site**   | A shareable hosted page from the same content        | the Gamma "publish to web" move                    |
| **Social** | Charts, quote cards, infographics                    | the Gamma Imagine / marketing-asset move           |

**One content model underneath — the output type is just a layout.** Internally there is no
"deck" vs "doc": every artifact is an ordered tree of **blocks/sections**. Deck / Doc / Web /
Social are _positioning modes_ (type scale, column width, full-bleed vs paginated) over the same
blocks — a view concern and a positioning/marketing label, not a separate data structure. The
editor proves this with a Layout toggle that re-renders the same blocks as Deck / Doc / Web.

## The core model (carried over from the Gamma teardown)

1. **Outline-first generation.** Prompt → editable outline (cheap to reshape) → full artifact.
   The outline is the cheap intermediate representation before expensive generation.
2. **Cards & blocks, not slides.** Each card is a flexible, reflowable container of blocks
   (title, body, media, columns, stat row, chart, embed). Block-based editing like a doc, not
   pixel-positioning like PowerPoint.
3. **The Galleo agent.** A chat-native design partner that can restyle the whole artifact,
   rewrite tone, pull in web content with citations, and critique — sitting in the right panel.
4. **Theme is a per-artifact property — and a real product surface.** Color + type + radius +
   density are a theme the user picks/switches _live in the editor_ (the Themes panel), applied
   across every block. A large, genuinely distinctive **theme library** is the moat against "AI
   slop" decks. The editor ships a data-driven theme engine (each theme = a token set) so the
   library is easy to grow — currently **22 themes** spanning editorial → brutalist → neon →
   newsprint → couture, switchable instantly + a Shuffle.

## The editor anatomy (what we're styling)

This is the surface the explorer focuses on. Five regions:

```
┌──────────────────────────────────────────────────────────────────────┐
│ TOPBAR  Galleo · "Q3 Vision" · saved    ·    avatars · Share · ✦ Generate │
├────────────┬───────────────────────────────────────┬───────────────────┤
│ CARD RAIL  │           CANVAS  (the star)          │   AGENT / DESIGN   │
│ thumbnails │   the active card/page being edited   │   chat to restyle, │
│ + outline  │   editable blocks w/ hover affordances │   theme + layout   │
│ + add card │   inline + block toolbars, insert line │   controls         │
└────────────┴───────────────────────────────────────┴───────────────────┘
```

- **Topbar** — identity, doc title, collab presence, Share / Present, and the always-present
  **Generate** affordance (AI is a first-class verb, not a buried menu).
- **Card rail** (left) — card thumbnails with reorder, an Outline tab, "+ Add card".
- **Canvas** (center) — _the thing_. The active card with real editable blocks and the
  micro-interactions of editing: drag handles, block toolbar, the "+" insert line, inline
  text selection. This is where a design language lives or dies.
- **Agent panel** (right) — tabbed: **Themes** (the live theme gallery — default), **Galleo**
  (agent chat), **Layout** (Deck / Doc / Web positioning toggle).

## The theme engine (implemented — `kernel/themes/`)

Themes are **data, not CSS classes**: each is a token set (`{bg, canvas, ink, accent, fonts,
radius, …}`) and `applyTheme()` writes them as CSS custom properties on the editor root. That
makes the library trivial to grow and lets the gallery render itself. Current library = **22
themes**, deliberately wild, filterable (Light / Dark / Bold / Calm) with a Shuffle:

`Studio · Press · Noir · Signal · Aura · Canvas · Concrete (brutalist) · Neon · Sunset (70s) ·
Deco Gold · Swiss · Botanical · Candy · Terminal · Vapor · Memphis · Blueprint · Riso Zine ·
Couture · Sunrise · Ink Wash · Mineral`

This is the surface to push on: add/cut themes, refine palettes & type pairings, decide which
2–3 are the _defaults_ the brand ships with vs. the long tail users can opt into.

## Open questions for the back-and-forth

- Which 2–3 themes are the **shipped defaults** (the brand's face) vs. the opt-in long tail?
- **Light-first or dark-first** default? (lots of strong dark options now: Noir, Couture, Vapor…)
- Do themes need **per-theme structural tweaks** (e.g. Press = real masthead/rules, Neon = glow
  borders) beyond tokens — i.e. should a theme be able to change _layout_, not just style?
- Should users **author/save custom themes** (brand kit: drop a logo + 2 colors → a theme)?
- Where does the **agent** live — persistent right panel (current) vs summonable command bar?
- Do we want the canvas to feel like **paper** (Studio/Press/Aura) or like a **screen** (Signal/Noir/Canvas)?
