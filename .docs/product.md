# Galleo — Product

Galleo is an AI content-creation tool built on one idea: **a single canonical artifact that renders as a
deck, a document, or a website** — authored once, presented / read / published anywhere, exported with
pixel fidelity.

## The bet

Most tools force the choice up front — slides in one app, docs in another, sites in a third — and lock
your content to that format's HTML/CSS. Galleo stores content as one **semantic tree** (sections → cells
→ elements) with no absolute coordinates, and renders it through a real layout engine. Changing the
_format_ is a data change, not a rewrite: the same content re-flows as a paged 16:9 deck, a continuous
reading document, or a full-bleed web page.

Four things fall out of that:

1. **One source of truth across formats.** Write it once; ship it as a deck for the meeting, a doc for
   the follow-up, a page for the web — no copy-paste between tools.
2. **High-fidelity, dimension-agnostic layout.** The engine lays out _one container at one pixel size_
   into backend-agnostic render commands, so "support a new size" or "make the canvas draggable /
   resizable" is data, not new code — Figma-frame / Canva-custom-size power for free. And because the
   same engine drives screen and export, **what you edit is what you export.**
3. **AI that speaks the content model, not a black box.** Generation streams structural patches into the
   _same_ editable artifact — narrated, watchable, and fully editable afterward. The AI works in
   data-space; the normal render path draws it. (A client-side simulator today; the real LLM runtime is
   scaffolded behind the same protocol.)
4. **Direct-manipulation editing.** Elements are spec-driven, so resizing, column splits, spacing, and
   alignment happen on the canvas via handles — and every element's inspector is generated from its
   schema, not hand-built.

## Who it's for

People who make decks, docs, and sites and want AI speed _without_ giving up design fidelity or
scattering one message across three tools — the Gamma / Canva / Beautiful.ai audience, but with a real
engine underneath and one artifact across every surface.

## How it feels to use

- **Themes are data.** A theme is a semantic token set (colors/fonts by role); switching re-paints every
  block instantly, and custom themes are first-class.
- **Canvas-first.** Select an element and drag its edges to resize, drag a column divider to re-split,
  adjust gap/padding with grips; drop elements anywhere and watch the section reflow live.
- **Format toggle.** Flip the same artifact between Deck / Doc / Web; present full-screen; export PDF/PNG.

## Built vs planned

**Built:** the layout engine + three format views; the studio editor (selection, inspectors,
drag-and-drop, direct-manipulation sizing, inline text); ~20 elements; the theme system + custom-theme
builder; a narrated AI-generation flow (simulated); a Hono/Postgres backend with a library, templates,
folders, trash, and autosave.

**Planned:** the real LLM generation pipeline (`kernel/protocol/agent` + `services/agent`); standalone
present / publish / export surfaces (present + PDF/PNG live inside the studio today); sharing &
publishing (immutable versions, public links); engine-native rich text; PPTX export.
