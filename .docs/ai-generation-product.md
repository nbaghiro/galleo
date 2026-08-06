# How generation works, prompt by prompt

A walkthrough of one whole run: what the user does, what Galleo sends to the model at each step, and
what comes back. Everything quoted here is the real text, produced by running the prompt builders in
`services/core/ai/prompts/` rather than transcribed by hand, so it can be trusted as what the model actually
receives. Where a block is generated at runtime and runs to several thousand characters, it is
excerpted and its real length noted.

Written for a product reader; it assumes no TypeScript. The engineering companion is `ai.md`.

## The example

One input, carried the whole way through:

```
Prompt   A launch deck for Aether, an AI note-taking app
Format   Deck
Length   Standard
Images   Stock
```

## The run at a glance

| Step             | Model calls   | Credits                 | What it settles                                       |
| ---------------- | ------------- | ----------------------- | ----------------------------------------------------- |
| Intake           | none          | 0                       | The prompt, format, length, and any attached material |
| Plan the outline | 1             | 3                       | Title, backdrop, the brief's reading, every beat      |
| Write a section  | 1 per beat    | 2 each                  | The actual content of one section                     |
| Source an image  | 1 lookup each | 0 stock, 5 per AI image | The picture behind a phrase                           |
| Chat             | 1 per message | 2 plus its tools        | Whatever the user asks for                            |

A ten-section deck with stock images costs 3 for the plan and 2 per section, so 23 credits, and the
user sees that price on the button before committing to it.

Two things are deliberately absent. There is no separate call to interpret the brief, because the
planner reports its own reading as part of planning. There is no review pass at the end. Both existed
and were removed, for reasons given at the end of this document.

## Step 1: Intake

The user types one sentence, picks a format, and optionally attaches material to build from: pasted
text, or dropped text files. No model call happens here. The attachments are merged into one block of
source material, and the first 6,000 characters reach the planner; anything beyond that is dropped,
and the interface says so rather than truncating silently.

Files are read in the browser, so only text formats work: `.txt`, `.md`, `.csv`, `.json`, `.vtt` and
similar. A PDF or a Word file is refused by name with a reason, because reading one in the browser
would produce mojibake and quietly poison the plan.

## Step 2: Plan the outline

One call. It is the only point at which the model sees the whole piece at once, which is why so much
is folded into it, and it is the largest single decision in the run: section count, order, roles,
layouts and substance are all settled here, and every later call works inside what it decided.

### What the model is told

The system half is assembled from six blocks. First the persona, which is identical in every content
call in the product:

> You are Galleo's content designer, a world-class writer and information designer who builds decks,
> documents, and websites that look like a top studio made them.
>
> You believe:
>
> - Specific beats generic. Real numbers, real names, concrete claims, never lorem ipsum, never
>   "insert X here", never hedged filler.
> - One idea per section. A section earns its place by making a single point land.
> - Show, don't tell. A stat, a chart, or an image often says more than a paragraph.
> - Rhythm matters. Vary section shapes and lengths so the piece has pace, not monotony.
> - Restraint reads as quality. Say less, mean more; trust whitespace and typography.
>
> You write the content only. You never think about pixels, CSS, or layout math, you choose an element
> and a grid, and the engine renders it perfectly across deck, doc, and web.

Then the voice for this particular format. Deck, document and website each get their own paragraph,
and this is where format changes the writing rather than just the rendering:

> This is a DECK: one section = one slide. Be punchy and visual, short headlines, few words per slide,
> let stats/images/charts carry weight. Every section must fit a 16:9 slide, so keep image grids WIDE,
> not tall: lay people/portraits/cards out in a single horizontal row, never a tall multi-row stack of
> big photos. 8-16 sections.

Then one line describing the active theme, so the register matches the design:

> The active theme is "Studio" (editorial, light). Write in a register that fits a editorial light
> design.

That sentence carries a grammar bug, visible above: "a editorial" rather than "an editorial". It is
built by joining the theme's tag and mode without checking the article, and it reaches every
generation call.

Then the job itself, the longest hand-written instruction in the product. It opens by asking for the
reading of the brief, which is what fills the goal, audience and tone fields the user sees:

> Plan the artifact: your reading of the brief, a title, a backdrop, and an ordered list of beats
> (sections). Start by stating what you take the piece to be, its `goal` (what it has to achieve),
> `audience` (who it's for), and `tone` (how it should sound), inferred from the prompt and any source
> material; these are shown to the user and every section is written against them, so make them
> specific rather than generic.

It insists the arc be chosen rather than templated:

> Give the piece a real narrative arc that fits the topic, the beat roles (scene, tension, turn, proof,
> momentum, close) are a toolbox to draw on, not a fixed sequence: use the ones the story needs, in the
> order it needs, and repeat proof/momentum beats where the argument earns them.

And it draws the distinction the whole plan turns on, between naming a topic and deciding what a
section argues:

> Then WRITE THE STORY, not a table of contents, for every beat give all three of: `brief` (one line
> naming the section's job), `takeaway` (a full sentence stating the one thing the reader leaves with),
> and `points` (the 2-4 concrete moves it makes, in order, the actual claims, numbers, comparisons, or
> steps, never topic labels like "benefits" or "overview"). Decide the real substance here: what each
> section actually argues, and with what. A section written from "Traction" is generic; one written from
> "1,900 studios joined in five months, four in five still active at week eight, and the curve steepened
> after the referral launch" is not.

Then the layout catalog, generated from the engine's own presets so it can never drift from what the
renderer supports:

> - `full` - one full-width column - a hero, a single statement, one big image, or a centered moment
> - `split-6040` - 60% / 40% - text-forward with a supporting image on the right
> - `split-4060` - 40% / 60% - an image on the left, text on the right
> - `two-col` - 50% / 50% - two balanced ideas or a compare/contrast
> - `three-up` - three equal thirds - three features, steps, stats, or cards side by side

And finally the quality bar, the rules that separate a competent deck from a generic one:

> - Open AND close on a `full` section carrying a background image; the closing section mirrors the
>   cover's shape (label, headline, subtitle, button). These are the emotional bookends.
> - Make the SECOND section restate the whole thing in one line, a single big headline or a thesis quote.
> - Alternate `split-6040` and `split-4060` so the image side zig-zags; use `three-up` only for genuine
>   triads (3 stats, 3 cards, 3 quotes); `two-col` only for pairs; `full` for covers, single quotes,
>   tables, and CTAs.
> - Across the piece include at least: one `three-up` of three `stat`s, one `three-up` of `card`s, one
>   `chart` in a split (with a `caption` naming its units/axes), one `diagram` (process or funnel), one
>   `table` with real columns, one standalone pull-`quote`, and one `callout` on the single most
>   important claim.
> - Put a background image ONLY on the emotional beats (cover, a big pull-quote or manifesto break, the
>   CTA). Interior sections ride the plain theme.

That is 6,021 characters of system prompt.

### What the user's turn carries

The user half is short, 1,346 characters, and almost all of it is the brief:

```
## The brief
Prompt: A launch deck for Aether, an AI note-taking app
Length: Standard

Let the topic decide how many sections it needs. A sharp, single-idea piece might be 5-7; a broad,
evidence-heavy one 15-20. Size it to the story, never pad to hit a number, never cut a beat the
argument needs, and don't default to a middle length out of habit.

Hard limit: plan at MOST 20 sections, anything beyond is discarded.

Name the 2-5 points this piece must cover for the brief to be satisfied (`mustInclude`), then give
each one a home: set each beat's `covers` to the point(s) it covers, copied VERBATIM from your own
list. Every point appears in at least one beat's `covers`; leave `covers` off beats that cover none.

## Design the structure for THIS brief
Decide the narrative this specific topic, goal, and audience need, then choose the sections and their
order to serve it, don't reach for a stock template. As one reference, a "General" often runs:
cover → one-line thesis → 3-5 body sections (alternating splits) → a stat-trio → a pull-quote break
→ close (CTA)
Treat that as a proven shape to draw from, remix, or set aside, not a checklist. Two different briefs
should not produce the same skeleton.

Produce the outline now.
```

Three things there are worth noticing. "Standard" is a nudge rather than a number, and the prompt
explicitly tells the model not to default to a middle length. The hard limit comes from the workspace's
plan and is enforced twice, once by asking and once by discarding the overflow. And the coverage
instruction asks the model to name its own must-cover points when the user gave none, which is what
makes coverage tags appear on the outline cards at all.

If the user attached material at intake, a "Source material" block sits between the brief and the
length guidance, telling the model to ground the outline in the real facts rather than inventing
competing ones.

### What comes back

One object: a title, a backdrop description, the reading (goal, audience, tone, must-cover points),
and every beat with its id, label, role, layout, per-column blocks, image flag, brief, takeaway,
points, and which must-cover points it addresses.

The canvas draws each beat as an editable card at the width of the section it will become, with a real
engine miniature showing the column split it chose. Nothing has been written yet, and nothing has been
charged beyond the 3 credits for this call.

## Step 3: Write one section

One call per beat, 2 credits each, billed as the section lands rather than reserved up front. The user
either writes them all in sequence or writes one at a time from its card.

The system half is the largest prompt in the product at 16,165 characters, because two of its blocks
are generated rather than written. The element catalog is 7,023 characters describing every element the
writer may use and the exact shape of its data, derived from the live element registry so it cannot
describe something the renderer does not support. The gold-standard examples are 2,200 characters of
real sections from the demo content, included so the model matches a known-good density rather than an
average one.

The hand-written parts are the interesting ones. The building rules are strict about honouring the
plan, because the user has already seen and approved that layout:

> Use the layout the plan assigned (its column count and widths) AND lead each column with the block the
> plan assigned to it, in order, don't change the column count or move a block to a different column; a
> live preview is already showing that exact layout, so the finished section must match it.

They cover images, including two rules that exist because of specific failures:

> For images, set `src` to a short, vivid description of the photo you want (e.g. "aerial view of a wind
> farm at dusk"), the module sources or generates it. For a PERSON (a testimonial, a headshot, a team
> member), describe them generically, e.g. "a confident businesswoman in her 40s, smiling", never a
> specific or named individual, so a real, fitting portrait turns up instead of a random placeholder face.

> A DECK section must fit a 16:9 slide, so a group of PEOPLE (a team, advisors, testimonials) goes in ONE
> HORIZONTAL ROW. NEVER stack people in a 2xN grid of large square photos: it makes the slide far too
> tall and it letterboxes when presented. (On doc/web there's no slide to fit, so a taller multi-row grid
> is fine.)

And the voice block, which is where the house style actually lives:

> - Concrete and sensory over abstract, "the same five templates, the same stock photos, the same
>   confident slop", not "low quality output".
> - Numbers are specific and odd, never round-and-vague, "1 in 6", "+1.49°C", "80 million streams",
>   "3h 58m", not "millions" or "a lot".
> - Headlines: punchy, declarative, usually 8 words or fewer, often a turn or contrast. Eyebrows: short,
>   ALL-CAPS or a numbered marker ("01 - The problem").
> - Stats: a tight value ("$1.1T", "12x", "-42%") with a label that is a full explanatory clause.
> - Body paragraphs: 40-75 words for decks/sites, 60-90 and sometimes doubled for documents. No filler,
>   no "in today's fast-paced world", never lorem ipsum.
> - Image `src` = an art-director's brief: a specific, hyphenated, vivid phrase
>   ("aerial-view-wind-farm-at-dusk", "quiet-desk-dawn-light"), not a generic noun.

### What changes per section

The user half is what varies, and it is where the plan's work pays off. For the second beat of our
example it reads in full:

```
## The brief
Prompt: A launch deck for Aether, an AI note-taking app
Length: Standard

## This section
Artifact title: Aether: Thought Without Friction
Beat 2 of 3: "The Friction" (role: tension)
What it must say: Name the cost of how note-taking works today.
The one thing the reader must leave with: Today's tools make you a librarian before they let you be
a thinker.
Make these moves, in this order, this is the section's substance, so write them out properly rather
than gesturing at them:
  1. Traditional apps require you to act like a database administrator rather than a creator.
  2. We spend 40% of our note-taking time managing the tool rather than reflecting on the thought.
Use EXACTLY this layout, the plan chose it and a live preview is already showing it: split-6040.
Fill the columns in this exact order, leading each with its assigned block: column 1: text,
column 2: image.

The full arc, for continuity:
1. The Cover
2. The Friction  ← writing this
3. Ambient Capture

Write section "s2" now, real, specific, finished content.
```

The writer is never asked what this section should be about. That was decided at plan time, is visible
to the user on the card, and is editable before a single credit is spent on writing it. The writer's
job is to execute a decision, which is why the same instruction appears twice in different words: write
the moves out properly rather than gesturing at them.

Two optional lines can join this block. If the user typed something into the steer field, it is
appended to every section written from that point on. If they asked for one section to be redone with a
note, that note is appended for that section only.

The full arc is included for continuity, so a section knows what precedes and follows it without being
sent the whole artifact.

## Step 4: Images

The model does not produce pictures. It produces phrases, in the `src` of an image element or the
`background` of a section, and those phrases are resolved after the section is written.

With stock images, the default, the phrase is searched across providers in order (Unsplash, Pexels,
Pixabay, Openverse, the last needing no key so there is always a fallback), and the result is a provider
URL. No storage, no credits.

With AI images, the phrase goes to the image model with an aspect ratio appended, the result is stored
as a workspace asset, and 5 credits are metered per variation actually produced. The run reconciles what
it reserved against what it really generated, so a phrase that fell back to stock is not billed.

One rough edge: when the runtime forces a background onto a cover or closer that the model left flat, it
uses the user's raw prompt as the image description. "A launch deck for Aether, an AI note-taking app" is
not an image phrase, and it produces a correspondingly literal picture.

## Step 5: The chat rail

The rail runs the same agent that edits finished artifacts, on a surface that knows a run is in
progress. Which prompt it gets is decided by what the context contains rather than by a label: a live
generation gets the generate prompt, otherwise an open artifact gets the editor prompt and nothing open
gets the library prompt.

The generate prompt opens by placing the agent:

> Right now you are sitting alongside the user IN a generation studio: a piece they asked for is being
> planned and written, one section at a time, on the canvas next to you.

Then it closes off the wrong move before the agent can reach for it:

> **You are never starting anything new here.** There is no tool for it and there is no reason for it:
> everything the user asks for is a change to the plan or the prose in front of you. If they describe
> something that sounds like a fresh idea ("actually, make it about X"), that is a re-brief of THIS
> piece, revise the outline.

That paragraph exists because of a real failure. Before the generate surface existed, the agent saw an
artifact with zero sections during the outline stage, correctly concluded there was nothing to edit, and
proposed building a separate deck. The fix was to show it the outline.

The whole run is described in the prompt, refreshed on every message:

```
## The piece being generated right now
A deck, currently at the "outline" step, 1 of 2 sections written.

Their prompt: "A launch deck for Aether, an AI note-taking app"
Goal: win a launch audience
Audience: product-minded founders
Tone: confident
Must cover: the cost of the status quo

The outline:
1. [s1] "The Cover" (scene) - WRITTEN
2. [s2] "The Friction" (tension) - not yet written
```

The written flag is what lets the agent choose correctly between changing the plan and changing the
prose, and the ids are what let it target one section rather than describing an intention.

### The distinction the tools turn on

The generate prompt teaches one distinction above all others:

> - **revise-outline** - change the PLAN: add a beat, remove one, reorder, retitle, or rewrite what a
>   beat must say. You write the new content yourself, in the same voice as the existing beats.
> - **write-section** - EXECUTE the plan: turn beats that are planned but NOT yet written into real
>   sections. This is what "write sections 2 to 5", "generate the rest", "build the next one", and
>   "draft section 4" all mean. **Never use add-section for this**, add-section invents a brand-new
>   section beside the plan, which leaves the planned beat still unwritten and the outline out of step
>   with the piece.

Writing is proposed, not performed: the agent names which beats to build, and the studio runs the same
calls the board runs, so a section is written by one path whoever asked for it.

Mid-run the library half of the toolset stands down entirely. There is nothing to create and nothing
else to reorganise, so the agent cannot rename, move, duplicate, trash, share or export while a piece is
being built.

### Thinking

Chat is the only capability that thinks; every other call runs with reasoning switched off for speed.
The thought summaries are markdown essays, so they are distilled into single-line step headlines and
only those cross the wire. The user sees one line at a time while the agent works, then a collapsed
"Thought in 3 steps" they can open. The prose itself is never sent.

## The rest of the calls

Everything above is the main line. These are available on demand and priced separately.

**Read the brief** (1 credit), optional, from the brief bar. It asks a smaller model to infer goal,
audience, tone and must-cover points from the prompt alone, and its instruction is unusually specific
about not interrogating the user:

> Infer, don't interrogate: read what the prompt implies about the goal, the audience, and the tone, and
> state each in one short, concrete line, plain inferences the person can correct, not questions. Only if
> something genuinely ambiguous would change the piece's STRUCTURE (not its wording) may you add ONE
> clarifying question.

Since the planner now reports its own reading, this exists for re-reading rather than first reading.
Asking twice deliberately lands somewhere different: the prompt hands back the previous reading and asks
for a genuinely different one.

**Rewrite a passage** (1 credit). Rewords one paragraph, headline or bullet inside a section, leaving
everything else alone. The passage is located by matching the quoted text, preferring the shortest node
that contains it, so a word appearing in both a heading and a paragraph resolves to the heading.

**Regenerate an element** (4 credits). A fresh version of one chart, stat, table or diagram in place.

**Replace an image** (free with stock). Re-sources a picture, or a section's backdrop, from a new
description, honouring whether the run was started with stock or AI images.

**Design a theme** (4 credits). Produces a full palette and font pairing from a description. The user
saves and applies it; it is not applied automatically.

## What we deliberately do not do

The model never touches layout mathematics. It picks an element and a grid; the engine renders them.
This is why the same content can be a deck, a document or a website without regenerating anything.

The model never invents a layout or an element type. Both catalogs are generated from the live registry,
so a prompt cannot describe something the renderer would fail on.

The model is not trusted about the artifact's structure. When the chat agent proposes an outline change,
ids it invented are re-assigned; when it names a section, the id is checked against the real piece; when
it claims a must-cover point is uncovered, that point is checked against the ones actually asked for. It
cannot report on something that does not exist.

Nothing is written without being shown first. The outline is fully editable before a credit is spent on
prose, every chat change arrives as a proposal, and a generated theme is saved only when applied.

Nothing is saved without being finished. A run lives in memory until it completes or the user opens it
in the editor, so an abandoned generation leaves nothing behind.

## Two things that were removed

**The brief stage.** Reading the prompt into goal, audience and tone was once a blocking step with its
own call, its own credit, and its own screen. It is now part of planning: the planner reports the reading
it already had to form, at no extra cost or latency. The screen is gone and the fields fill themselves.

**The review stage.** A pass at the end merged a deterministic structural sweep with a whole-piece
critique and offered to fix each finding. It was removed to simplify the flow. The structural checks
survive, but as a quality gate during writing rather than a report afterwards. Reworking a section,
switching between takes, and asking for changes in the rail all still work on a finished piece.

Both were real features that worked. They were removed because the run reads better as prompt, arc,
words, with everything else available on demand rather than staged.
