# Galleo — Flex Format (Custom Dimensions) — Implementation Plan

> How to add a **`flex`** format: one paged format whose page size lives on the artifact, with a small
> table of one-click presets (poster, square, story, A4, …). This leans directly into the engine's
> existing bet — _"Because dimensions are data, a custom size … is a data change, not new layout code"_
> (`rendering.md` §3). Companion to `architecture.md` (file map), `rendering.md` (the engine), and
> `data-model.md` (persistence).

---

## 1. The core decision

A poster / social card is, architecturally, **a paged format like `deck`, but at a non-16:9 size, with each
`Section` as one page/card.** Instead of hardcoding N poster profiles, we add **one `flex` profile whose
`width`/`height` come from the artifact**, plus a presets table the UI reads.

Why this shape holds up against the code:

- The layout engine (`canvas/engine/layout.ts`) is dimension-agnostic — it lays out one box at one size.
- `layoutSlide` / `prepareSlideNode` (`canvas/render/commands.ts:122-166`) are already fully `(w, h)`-
  parameterized; the "16:9" is only in comments and in the _constants the callers pass_.
- `fitSlideContent` (`backends.ts:605`) and `renderSlide` (`backends.ts:450`) scale content (laid out at
  frame width) by the height ratio — aspect-agnostic.
- `paintSectionStack` derives the editor width from `profile.maxContentWidth` (`backends.ts:536`).
- `library.FORMAT_IDS = Object.keys(PROFILES)` (`library.ts:155`) already feeds the Intake surface picker
  and the Library filter chips from the registry.
- Autosave sends the **whole** `ArtifactContent` (`save.ts:39-43`); a new field round-trips for free.

So most of the work is (a) letting the paged renderers read the per-artifact size instead of a 1280×720
constant, and (b) one new UI surface — the dimension editor. How this reads _in the editor_ — and whether
these artifacts are single- or multi-section — is §2.

---

## 2. Editor model — section as page

Every format answers "what is one section?" differently, and it's already baked into the renderer
(`backends.ts` `paintSectionStack`):

- **deck** → section = one **slide** (paged, one-per-screen in Present).
- **doc / web** → sections **merge** into one continuous scroll (`gap: 0`, `backends.ts:535`).
- **flex** → `kind: "paged"`, so it inherits deck's rule exactly: **section = one page / card.**

So "single vs multi-section" is not a new decision for flex — it's just **N=1 vs N>1** of the same
page-per-section model:

| Use case                                    | Sections       |
| ------------------------------------------- | -------------- |
| A poster, flyer, or single card             | 1              |
| An Instagram **carousel** (swipeable cards) | N square pages |
| A **story sequence** (multi-frame 9:16)     | N story pages  |
| A 2-page flyer (front / back)               | 2              |

Multi-section is not an edge case for posters — **carousels and multi-frame stories are the reason to want
it.** A single poster is just N=1. Same machinery; nothing special-cased.

### 2.1 What it looks like

The editor (`Canvas.tsx` → `paintSectionStack`) paints a vertical stack of section-cards at the format's
content width, with the Minimap showing one thumbnail per section. Present (`Present.tsx`, gated on
`kind === "paged"`, which includes flex) swipes through them one page per screen; Export writes one PDF
page per section at the card aspect (§5.3).

```
   Minimap          Canvas (scrolls)            Present (per page)
  ┌───────┐   ┌────────────────────────┐
  │ ▢ 1   │   │     ┌────────────┐       │       ┌────────────┐
  │ ▢ 2   │   │     │  page 1    │ ←1080 │       │            │
  │ ▢ 3   │   │     └────────────┘  wide │   →   │   page 2   │  ← full
  └───────┘   │     ┌────────────┐       │       │            │    1080²
              │     │  page 2    │       │       └────────────┘    frame
              │     └────────────┘       │        ← / → swipe
              │     ┌────────────┐       │
              │     │  page 3    │       │
              │     └────────────┘       │
              └────────────────────────┘
```

### 2.2 Loose vs fixed-frame — and why flex wants fixed-frame

Today each card in that stack is drawn at its **content height**, not the fixed page height. A square
1080×1080 card holding only a title + subtitle shows as a **short banner** in the editor and snaps to the
full square only in Present/Export. This is the same drift deck has — but it is **more jarring for flex**,
because the shape _is_ the point: you expect to design inside the square / 9:16 boundary.

So, unlike the first draft, **flex adopts fixed-frame editing in the MVP** (approach 1, §12) — each flex
section renders as its true page frame in the editor stack — while **deck stays on the loose model**. The
split lives in `paintSectionStack`: a paged format flagged for framing lays out each section at frame dims
(`layoutSlide`), else content-height (`layoutSection`). Approach 1 needs no overlay-coordinate rework (it
paints 1:1, no scaling); the heavier full-scaling variant (approach 2) stays deferred.

### 2.3 Labeling & defaults

- **Rename "sections" → "pages" (or "cards") in the flex context.** The section chrome (the Minimap header,
  the section toolbar's "add section below") reads oddly on a poster. A label swap keyed off
  `profile.kind`/id is cheap and makes the carousel model obvious — the section-management _ops_ are
  unchanged, only the copy (`editor/chrome/Minimap.tsx`, `editor/select/selection.tsx`).
- **A new flex artifact defaults to one section**, with the "+ add page" affordance inline — single-poster
  users aren't confronted with a stack; carousels are one click away.

### 2.4 Scope boundary — fixed pages vs a long canvas

Flex covers **fixed-size page(s)**, section-per-page. It deliberately does **not** cover a
**custom-width, auto-height** single long-scroll canvas (a tall infographic / long social image) — that is
`web`/`doc` behavior at a custom width (`height: "auto"`, continuous), a separate profile if we ever want
it. Deciding this now keeps flex's model crisp: **flex = fixed frames you page through.**

---

## 3. Scope tiers

| Tier   | Outcome                                                                                            | Sections         |
| ------ | -------------------------------------------------------------------------------------------------- | ---------------- |
| **T1** | Flex artifacts lay out, present, and export at their real size                                     | §4, §5, §6.1, §9 |
| **T2** | Users pick the format + dimensions; library/create/thumbnails correct; **flex edits in its frame** | §7, §8, §12      |
| **T3** | Full scale-to-fit WYSIWYG (all paged) + wire `splitMinWidth`/`tokenScale`                          | §6.2, §12        |
| **T4** | Generate into a flex canvas                                                                        | §11              |

T1+T2 are the MVP (flex is fully usable, editing inside its true frame). T3 is the follow-up; T4 is optional.

---

## 4. Data model

### 4.1 `model/artifact.ts` — dimensions on the artifact

```ts
export interface ArtifactContent {
    format: Id;
    theme: Id;
    sections: Section[];
    background?: SectionBackground;
    page?: { width: number; height: number }; // NEW — custom page size; honored for `flex`
}
```

`page` is plain JSONB inside `draft_content` — **no migration**, and inert for existing artifacts
(undefined) and for non-flex formats (see §4.5).

### 4.2 `model/artifact.ts` — carry the size in the library summary

So thumbnails render at the true aspect without fetching full content:

```ts
export interface ArtifactSummary {
    // …existing fields…
    page?: { width: number; height: number }; // NEW
}
```

`app/api.ts:19-24` re-exports `ArtifactSummary` from `@model/artifact`, so the frontend type updates for free.

### 4.3 `model/geometry.ts` — extend `FormatDescriptor`

```ts
export interface FormatDescriptor {
    id: Id;
    name: string;
    kind: FormatKind;
    width: number | "fill";
    height: number | "auto";
    maxContentWidth?: number;
    tokenScale: number;
    splitMinWidth: number;
    paginate: "always" | "export" | "never";
    // NEW ↓
    group?: string; // picker grouping: "Presentation" | "Document" | "Web" | "Custom"
    icon?: string; // Icon name for the format pickers
    fullBleed?: boolean; // content fills the frame edge-to-edge (generalizes today's id === "web" checks)
    frame?: boolean; // editor renders each section at the page frame (fixed-frame editing, §12)
}
```

### 4.4 `canvas/engine/profile.ts` — one profile + a presets table

Add `group`/`icon` to the existing three (`deck`→`"Presentation"`/`"deck"`, `doc`→`"Document"`/`"doc"`,
`web`→`"Web"`/`"site"`), then append **one** profile:

```ts
    flex: {
        id: "flex",
        name: "Flex",
        kind: "paged",
        width: 1080,          // fallback size until the user picks one
        height: 1350,
        maxContentWidth: 1000,
        tokenScale: 1,
        splitMinWidth: 900,   // narrow canvases collapse splits (see §6)
        paginate: "always",
        group: "Custom",
        icon: "flex",
        fullBleed: true,
        frame: true,          // edit inside the true page frame (§2.2, §12)
    },
```

Presets are **data the UI reads**, not engine profiles:

```ts
export interface FlexPreset {
    label: string;
    group: string; // "Social" | "Print" | "Screen"
    width: number;
    height: number;
}

export const FLEX_PRESETS: FlexPreset[] = [
    { label: "Square", group: "Social", width: 1080, height: 1080 },
    { label: "Portrait 4:5", group: "Social", width: 1080, height: 1350 },
    { label: "Story 9:16", group: "Social", width: 1080, height: 1920 },
    { label: "Poster", group: "Print", width: 1240, height: 1754 },
    { label: "A4", group: "Print", width: 1240, height: 1754 },
    { label: "Letter", group: "Print", width: 1275, height: 1650 },
    { label: "Postcard", group: "Print", width: 1500, height: 1050 },
    { label: "Business card", group: "Print", width: 1050, height: 600 },
];
```

### 4.5 `canvas/engine/profile.ts` — the content-aware resolver + numeric accessor

`resolveProfile(id)` stays. Add one resolver that overlays the artifact's size — **the only new
indirection in the feature**:

```ts
import type { ArtifactContent } from "@model/artifact";

// The effective profile for an artifact: the base format, with the custom page size overlaid when the
// artifact is `flex`. `page` is honored ONLY for flex, so switching away from flex leaves it inert
// (and switching back restores it).
export function profileFor(content: ArtifactContent): FormatDescriptor {
    const base = resolveProfile(content.format);
    if (content.format !== "flex" || !content.page) return base;
    const { width, height } = content.page;
    return {
        ...base,
        width,
        height,
        maxContentWidth: Math.min(width, base.maxContentWidth ?? width),
    };
}

// width/height are typed `number | "fill" | "auto"`; paged renderers need a numeric accessor.
export const SLIDE_FALLBACK = { w: 1280, h: 720 };
export function pagedSize(p: FormatDescriptor): { w: number; h: number } {
    return {
        w: typeof p.width === "number" ? p.width : SLIDE_FALLBACK.w,
        h: typeof p.height === "number" ? p.height : SLIDE_FALLBACK.h,
    };
}
```

Honoring `page` only for `flex` keeps non-flex formats byte-identical today, while leaving room to later
allow custom sizes on any paged format (the mechanism is already general).

### 4.6 `canvas/elements/ops.ts` — the content op

Follows the existing pure-op pattern (`setArtifactTheme`/`setArtifactFormat`, `ops.ts:249-255`):

```ts
export function setPageSize(art: ArtifactContent, width: number, height: number): ArtifactContent {
    return { ...art, page: { width: Math.round(width), height: Math.round(height) } };
}
```

`setArtifactFormat` needs **no change** — switching to `flex` leaves `page` undefined, and `profileFor`
falls back to the flex profile's default (1080×1350) so it renders immediately.

---

## 5. Rendering — un-hardcode the paged path (Tier 1)

Only the three wrappers bake in 1280×720; `commands.ts` needs one small additive change (§5.4).

### 5.1 `canvas/render/present.ts` — read the profile it's already handed

```ts
import { pagedSize } from "@engine/profile";

export function slideElement(section, tokens, profile: FormatDescriptor): HTMLDivElement {
    const { w, h } = pagedSize(profile);
    const { commands, height } = layoutSlide(section, w, h, measureText, tokens, profile);
    const content = fitSlideContent(commands, height, w, h);
    const slide = document.createElement("div");
    slide.style.cssText = `position:relative;width:${w}px;height:${h}px;overflow:hidden;background:${tokens.bg}`;
    slide.appendChild(content);
    return slide;
}
```

Remove the exported `SLIDE_W`/`SLIDE_H` constants (`present.ts:8-9`); their two importers are updated in
§7.3 / §8.5.

### 5.2 `canvas/render/backends.ts` — two fixes

**`renderSlide` (line 462)** forces `resolveProfile("deck")`. Thread the profile through instead:

```ts
export async function renderSlide(
    section,
    tk,
    opts: { w: number; h: number; scale: number; profile: FormatDescriptor },
): Promise<SlideRender> {
    const { w, h, scale, profile } = opts;
    const { commands, height } = layoutSlide(section, w, h, measureText, tk, profile);
    // …unchanged: fit = Math.min(1, h / height) is already aspect-agnostic…
}
```

**`paintSectionStack` (line 534)** — generalize the full-bleed check from the hardcoded `web` id:

```ts
const bleedFmt = profile.fullBleed ?? profile.id === "web"; // was: profile.id === "web"
// …use bleedFmt wherever `web` gated full-bleed layout width / centering…
```

(The fixed-frame branch in this same function — lay out framed formats at page dims — is §12.)

### 5.3 `canvas/render/export.ts` — profile-driven page + PDF geometry

Replace the constants `SLIDE_W/SLIDE_H/PAGE_W/PAGE_H` (`export.ts:15-16`) with a helper, and make the two
paged exporters read the artifact's profile:

```ts
import { pagedSize, profileFor } from "@engine/profile";

// PDF page points: preserve the format's aspect, cap the long edge at 960pt (matches today's deck).
function pdfPointsFor(w: number, h: number): { w: number; h: number } {
    const k = 960 / Math.max(w, h);
    return { w: w * k, h: h * k };
}

async function exportSlidePdf(artifact: ArtifactContent, tk: Tokens): Promise<void> {
    const profile = profileFor(artifact); // honors the flex page size
    const { w, h } = pagedSize(profile);
    const pt = pdfPointsFor(w, h);
    const pdf = await PDFDocument.create();
    for (const section of artifact.sections) {
        const { canvas } = await renderSlide(section, tk, { w, h, scale: SCALE, profile });
        const img = await pdf.embedPng(await canvasPng(canvas));
        const page = pdf.addPage([pt.w, pt.h]);
        page.drawImage(img, { x: 0, y: 0, width: pt.w, height: pt.h });
    }
    download(await pdf.save(), `galleo-${profile.id}.pdf`, "application/pdf");
}
```

> **Note:** these exporters take `artifact: ArtifactContent`, which now carries `page`, so `profileFor`
> gives the right size. `exportDeckPng` gets the same `pagedSize`/`profile` treatment (canvas `w*SCALE` ×
> `h*SCALE*count`, `renderSlide(..., { w, h, scale, profile })`). `exportPdfAuto` (line 87) already routes
> on `.kind === "continuous"`, so **flex flows to `exportSlidePdf` automatically** — no routing change.

### 5.4 `canvas/render/commands.ts` — one small addition

`layoutSlide`/`prepareSlideNode`/`fitSlideContent` are already dimension-agnostic (comments say "16:9";
reword to "the frame"). The one change: for fixed-frame editing (§12), have **`layoutSlide` also return
`regions`** — it calls `layout()` (which produces them) but currently discards them, and the framed editor
needs them for hit-testing.

---

## 6. Compose — bleed & narrow-width

### 6.1 MVP (Tier 1) — no change required

A paged flex section composes exactly like a deck section (fills the cell, `pad(36)`). The
`webBand = ctx.format.id === "web"` check (`compose.ts:216`) stays web-specific (centered capped column),
which is correct — flex doesn't want that. If we want flex content to bleed to the frame edges in-editor,
gate on `ctx.format.fullBleed` there too (optional).

### 6.2 Recommended (Tier 3) — wire the two dead fields

`splitMinWidth` and `tokenScale` are declared on every profile but **never read** (verified: they appear
only in `profile.ts` + the type). Both matter more once users can make genuinely narrow/tall canvases:

- **`splitMinWidth`** — in `composeSection` (`compose.ts:238-245`), collapse the inner `row → col` when the
  composed content width `< ctx.format.splitMinWidth`, so a `split-6040` on a 1080-wide **Story** stacks
  instead of cramming two columns:
    ```ts
    const innerW = custom ? /* sum */ : innerMax;
    const stack = innerW < ctx.format.splitMinWidth;
    const inner: EngineNode = { …, direction: stack ? "col" : "row", … };
    ```
- **`tokenScale`** — thread into `LayoutCtx` and multiply element type/space sizes so a dense poster reads
  larger/smaller than a card without duplicating element specs. Bigger change (touches every element's
  `layout()` via `ctx`); scope as its own task.

Both also fix latent gaps for the existing three formats. Wiring `splitMinWidth` is **recommended alongside
T2** (narrow flex canvases need it to be usable), even though it's labelled T3 here.

---

## 7. UI — editor chrome (Tier 2)

### 7.1 `editor/chrome/Topbar.tsx` — format picker + dimension editor

Today: a flat `FORMATS` array (`Topbar.tsx:163-167`) and a segmented `FormatSwitcher` (219-234). Replace
with a **registry-driven dropdown** grouped by `profile.group`, and — when the active format is `flex` — a
**dimension sub-panel**. This follows the existing dropdown pattern in the same file (`ArtifactMenu`/
`ExportMenu`: a `createSignal(open)` + a `fixed inset-0` click-catcher + an absolute panel).

```
┌ Format ─────────────────────┐
│  Presentation                │
│    ▸ Deck                     │
│  Document                     │
│    ▸ Doc                      │
│  Web                          │
│    ▸ Site                     │
│  Custom                       │
│    ▸ Flex            ✓        │
│  ┌── Dimensions ───────────┐ │   ← shown only when format === "flex"
│  │  W [1080] × H [1350] px  │ │     two number inputs
│  │  ⇄ swap    🔗 lock ratio │ │
│  │  Social: [Square][4:5]   │ │     FLEX_PRESETS chips, grouped
│  │          [Story]         │ │
│  │  Print:  [Poster][A4]    │ │
│  │          [Letter][Card]  │ │
│  └──────────────────────────┘ │
└─────────────────────────────┘
```

Sketch:

```tsx
import { PROFILES, FLEX_PRESETS, resolveProfile, profileFor } from "@engine/profile";
import { setArtifactFormat, setPageSize } from "@elements/ops";
// remove the local FORMATS array

const FormatSwitcher: Component = () => {
    const [open, setOpen] = createSignal(false);
    const cur = createMemo(() => profileFor(editor.artifact));
    const groups = createMemo(() => {
        const by = new Map<string, FormatDescriptor[]>();
        for (const p of Object.values(PROFILES)) {
            const g = p.group ?? "Other";
            (by.get(g) ?? by.set(g, []).get(g)!).push(p);
        }
        return [...by];
    });
    const pickFormat = (id: string): void => commit(setArtifactFormat(editor.artifact, id));
    const setDim = (w: number, h: number): void =>
        commit(setPageSize(editor.artifact, w, h), { coalesce: "page-size" });

    return (
        <div class="relative">
            <button class={btn} onClick={() => setOpen((o) => !o)}>
                <Icon name={cur().icon ?? "deck"} size={14} />
                {cur().name}
                <Show when={editor.artifact.format === "flex"}>
                    <span class="ml-1 font-mono text-[11px] text-muted">
                        {cur().width}×{cur().height}
                    </span>
                </Show>
                <Icon name="chevron" size={11} />
            </button>
            <Show when={open()}>
                <div class="fixed inset-0 z-10" onClick={() => setOpen(false)} />
                <div class="absolute right-0 z-20 mt-2 w-64 rounded-xl border border-line bg-panel p-1.5 shadow-xl">
                    <For each={groups()}>
                        {([group, formats]) => (
                            <>
                                <div class="px-2.5 pb-1 pt-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-muted">
                                    {group}
                                </div>
                                <For each={formats}>
                                    {(p) => (
                                        <button
                                            class={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[13px] ${
                                                editor.artifact.format === p.id
                                                    ? "font-semibold text-accent"
                                                    : "text-soft hover:bg-canvas"
                                            }`}
                                            onClick={() => pickFormat(p.id)}
                                        >
                                            <Icon name={p.icon ?? "deck"} size={14} /> {p.name}
                                        </button>
                                    )}
                                </For>
                            </>
                        )}
                    </For>
                    <Show when={editor.artifact.format === "flex"}>
                        <DimensionEditor value={cur()} onChange={setDim} />
                    </Show>
                </div>
            </Show>
        </div>
    );
};
```

`DimensionEditor` is a small local component: two number `<input>`s (styled like the hex input in
`widgets.tsx` ColorPopover — `border border-line bg-canvas … text-ink`), a lock-aspect toggle (keeps the
current ratio when one field changes), a `⇄` swap button (`onChange(h, w)`), and the `FLEX_PRESETS` chips
grouped by `preset.group`, each calling `onChange(preset.width, preset.height)`. Every write goes through
`commit(..., { coalesce: "page-size" })` so dragging a number reads as **one undo step** (the editor store
already supports coalescing, `editor.ts:108-121`).

### 7.2 Icons

- **`editor/icons.tsx`** — the studio `Icon` uses a `PATHS` registry (`icons.tsx:5`). Add `flex`, `deck`,
  `doc`, `site` glyphs (the format dropdown now shows icons; only `flex` is strictly new, the format icons
  are new-to-this-registry):
    ```ts
    flex: () => (
        <>
            <rect x="4" y="6" width="16" height="12" rx="1.5" />
            <path d="M4 10h3M17 10h3M4 14h3M17 14h3" /> {/* resize ticks */}
        </>
    ),
    ```
- **`app/components/icons.tsx`** — add a `FlexIcon` component (mirrors `DeckIcon`/`DocIcon`/`SiteIcon`,
  `icons.tsx:77-100`) for the create modal.

### 7.3 `editor/canvas/Present.tsx` — profile-derived fit (replaces the `SLIDE_W`/`SLIDE_H` import)

```ts
import { slideElement } from "@canvas/render/present";
import { resolveProfile, pagedSize, profileFor } from "@engine/profile";

const profile = createMemo(() => profileFor(editor.artifact)); // was resolveProfile(editor.artifact.format)

// renderCurrent():
const { w, h } = pagedSize(profile());
const k = Math.min((window.innerWidth - 24) / w, (window.innerHeight - 24) / h);

// renderOverview(): const s = MINI_W / w;  cell height → `${h * s}px`;  drop the max-width:1280 cap
```

The `paged()` gate (`Present.tsx:29`, `kind === "paged"`) already includes flex, so the deck present UI
(arrows, progress, overview, keyboard nav) works unchanged.

Also in `Topbar.tsx:252-253`, switch the present/preview label from `format === "deck"` to
`resolveProfile(format).kind === "paged"` so flex shows **Present**, not Preview.

### 7.4 Page labels — "sections" → "pages" for flex (§2.3)

Copy-only: where the section chrome names the unit, use "page"/"card" for a framed format. Keyed off the
profile so no logic changes:

- `editor/chrome/Minimap.tsx` — the rail header + empty-state copy.
- `editor/select/selection.tsx` — the section toolbar's "add section below" / duplicate labels.

A tiny helper (e.g. `unitLabel(profile)` → `"page" | "section"`) keeps it in one place. The underlying
section ops (`addSectionAfter`, `duplicateSectionAt`, …) are untouched.

---

## 8. UI — app SPA (Tier 2)

### 8.1 `app/components/modals.tsx` — CreateModal

Replace the hardcoded `FORMATS` (`modals.tsx:11-15`) with a registry-derived, grouped list; add a "Flex —
custom size" tile using the new `FlexIcon`. MVP: clicking Flex creates at the default size and drops into
the editor (where the dimension control lives). Optional nicety: the Flex tile expands inline to the
`FLEX_PRESETS` chips first.

`app/components/Sidebar.tsx:62-70` `create(fmt)` already does `createArtifact({ …, draftContent:
blankArtifact(fmt) })` → `navigate('/edit/:id')`; no change for the default path. `blankArtifact`
(`library.ts:143`) gains an optional `page` for the preset-at-create path:

```ts
export function blankArtifact(
    format: string,
    theme = "studio",
    page?: { width: number; height: number },
): ArtifactContent {
    return {
        format,
        theme,
        sections: [{ id: "s-1", grid: "full", cells: { a: {} } }],
        ...(page ? { page } : {}),
    };
}
```

### 8.2 Library thumbnails — the "correct" aspect path

Chosen: **thumbnails render at the artifact's true aspect** (not a uniform 16:9).

- **`services/api/artifacts.ts`** — the list handler maps rows to summaries (`artifacts.ts:118-122`). Add
  `page` from the draft (one line; `draftContent` is already selected, so no new query):
    ```ts
    const list = rows.map(({ draftContent, ...meta }) => ({
        ...meta,
        cover: coverOf(draftContent),
        sections: sectionsSummary(draftContent),
        page: (draftContent as { page?: { width: number; height: number } }).page,
    }));
    ```
    (The `RawDraft` interface at `artifacts.ts:21` can also gain `page?` for typing.)
- **`app/components/previews.tsx`** — `SectionThumb` (`previews.tsx:173`) currently hardcodes `LW = 1280`,
  `SH = 720`, `ch() = round(cw()*9/16)`. Accept an optional `page` and derive the frame from it:
    ```ts
    export const SectionThumb: Component<{
        section: Section;
        themeId: string;
        formatId: string;
        page?: { width: number; height: number }; // NEW
        // …rest…
    }> = (props) => {
        const dims = () => {
            const p = props.page ?? pagedSize(resolveProfile(props.formatId));
            return { w: p.w ?? p.width, h: p.h ?? p.height };
        };
        const cw = () => props.width ?? DEFAULT_W;
        const ch = () => Math.round((cw() * dims().h) / dims().w); // was cw()*9/16
        // layoutSlide(props.section, dims().w, dims().h, …); scale = cw() / dims().w
    };
    ```
- **`app/views/LibraryView.tsx`** — pass it through where thumbnails render (`LibraryView.tsx:543-550`):
    ```tsx
    <SectionThumb section={sec} themeId={appTheme()} formatId={p.d.formatId} page={p.d.page} … />
    ```

### 8.3 Labels

`app/stores/library.ts:157-160` `formatLabel` hardcodes deck/doc/web. Source from the registry, keeping the
`web → "Site"` product term as a small override:

```ts
const LABEL_OVERRIDE: Record<string, string> = { web: "Site" };
export const formatLabel = (id: string): string => LABEL_OVERRIDE[id] ?? resolveProfile(id).name;
export const formatLabelPlural = (id: string): string => `${formatLabel(id)}s`;
```

Also update the label map in `app/views/ThemeEditor.tsx:86-88` and the hardcoded preview-tab list in
`app/views/TemplatesView.tsx:163` to derive from `FORMAT_IDS` (templates without flex content simply show
none — see §15). The Library format-filter chips (`LibraryView.tsx:178-181`) are already `FORMAT_IDS`-
derived, so **flex appears automatically**.

### 8.4 `app/views/generate/IntakeView.tsx`

The surface picker is already `FORMAT_IDS`-derived (`IntakeView.tsx:23-26`), so "Flex" appears free. The
`Surface` unions (`model/agent.ts:17`, `app/views/generate/session.ts:12`) gain `"flex"`. Actually
generating into flex is Tier 4 (§11).

### 8.5 `app/views/PresentView.tsx` & `PreviewCanvas`

- `PresentView.tsx:16,67` imports `SLIDE_W/SLIDE_H` and computes the fit `k` from them — same change as
  §7.3, using `pagedSize(profileFor(props.artifact))`. It already resolves `profile` (`PresentView.tsx:50`)
  → switch to `profileFor`.
- `app/components/previews.tsx` `PreviewCanvas` (`previews.tsx:242-262`) uses `paintSectionStack` with the
  resolved profile — switch `resolveProfile(props.format())` → `profileFor(props.content)` so flex previews
  size correctly (it already has the full `content`).

---

## 9. Backend

Structurally **nothing new**:

- `artifacts.formatId` is free text defaulting to `"deck"` (`artifacts.ts:155`) — `"flex"` is just a string.
- `POST /artifacts` and `PATCH /artifacts/:id` set `draftContent` wholesale (`artifacts.ts:157,250`), so
  `page` inside it round-trips with no change.
- **Only change:** add `page` to the library-list summary derivation (§8.2) so thumbnails get the aspect.
- Optional hardening: validate `formatId ∈ Object.keys(PROFILES)` on create/patch (not required today).

The artifact-cap plan gate (`artifacts.ts:132`) is format-agnostic and unaffected.

---

## 10. Persistence — no change

Autosave sends the full `ArtifactContent` (`save.ts:39-43`: `draftContent: { ...art, theme: themeId }`),
so `page` is saved and re-loaded (`EditorView.loadId` → `loadArtifactContent`) automatically. `page` is
part of every history snapshot (`editor.ts` snapshots `editor.artifact`), so **resizing the page is
undoable** right alongside content edits — with coalescing, a drag is one step.

---

## 11. Generation (Tier 4 — optional)

The narrated simulator + the older `AgentPanel` generator work without this; do it only when AI should
target flex.

- `model/agent.ts:17` + `app/views/generate/session.ts:12` — add `"flex"` to `Surface`.
- `app/views/generate/build-canvases.tsx` — `layoutFor` (`build-canvases.tsx:47`) hardcodes
  `web = p.id === "web"` and its own `SLIDE_W/SLIDE_H = 1280/720` (line ~164); generalize `web` →
  `p.fullBleed ?? p.id === "web"` and derive slide dims from `pagedSize(profileFor(...))`.
- Intake needs a default `page` when the surface is flex (a preset dropdown next to the surface chip,
  defaulting to Poster) → seeded into the generated `ArtifactContent`.

---

## 12. Fixed-frame editing (flex ships approach 1; approach 2 deferred)

Today the editor paints a **continuous, content-height stack** at `maxContentWidth` (`Canvas.tsx:77-92` →
`paintSectionStack`). Deck edits "loose" and frames to 16:9 only in Present/Export. **Flex instead edits
inside its true frame from the MVP** (§2.2) — two approaches, one shipping now, one deferred:

1. **Frame each section at page dims — flex MVP (T2).** In `paintSectionStack`, when
   `profile.frame` is set, lay out each section with `layoutSlide(section, w, w * h/w)` (fill + center) at
   the column width instead of `layoutSection`, painted **1:1**. No scale factor → every overlay (selection
   ring, resize/spacing/column handles, `TextEditor` caret, `hitTest`/`computeDropTarget`) keeps working in
   unscaled canvas coords. Needs `layoutSlide` to return `regions` (§5.4). Content that overflows grows the
   frame (same as deck today). Deck (no `frame` flag) stays on the loose model, unchanged.

2. **Scale a fixed W×H layer to fit the column — deferred (T3).** True WYSIWYG (short content stays inside
   the frame, tall content scales down), but introduces a scale factor that **every overlay assumes is 1** —
   the selection ring, `DragHandle`, `ResizeHandles`, `RegionDividers`, the `TextEditor` caret, and
   `computeDropTarget`/`hitTest` all work in unscaled coords (`Canvas.tsx`, `editor/select/*`). Correct but
   invasive — a coordinate-transform pass across the whole overlay layer. Deferred; would also let deck opt
   into framed editing.

So the MVP ships **approach 1** (frame flag + `layoutSlide` regions + a `paintSectionStack` branch);
**approach 2** is the T3 upgrade.

---

## 13. File-by-file change map

| File                                                                   | Change                                                                                    | Tier  |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ----- |
| `model/artifact.ts`                                                    | `ArtifactContent.page`, `ArtifactSummary.page`                                            | T1/T2 |
| `model/geometry.ts`                                                    | `FormatDescriptor`: `group`/`icon`/`fullBleed`/`frame`                                    | T1/T2 |
| `canvas/engine/profile.ts`                                             | `flex` profile, `FLEX_PRESETS`, `profileFor`, `pagedSize`, `group`/`icon` on existing     | T1    |
| `canvas/elements/ops.ts`                                               | `setPageSize`                                                                             | T1    |
| `canvas/render/commands.ts`                                            | `layoutSlide` also returns `regions` (for fixed-frame)                                    | T2    |
| `canvas/render/present.ts`                                             | `slideElement` reads `pagedSize(profile)`; drop `SLIDE_W/H` exports                       | T1    |
| `canvas/render/backends.ts`                                            | `renderSlide` takes `profile`; `paintSectionStack` `fullBleed` (T1) + `frame` branch (T2) | T1/T2 |
| `canvas/render/export.ts`                                              | `pagedSize`/`profileFor`-driven slide + `pdfPointsFor`                                    | T1    |
| `canvas/elements/compose.ts`                                           | (opt) `fullBleed`; (T3) wire `splitMinWidth`/`tokenScale`                                 | T1/T3 |
| `editor/chrome/Topbar.tsx`                                             | grouped format dropdown + `DimensionEditor`; present-label by `kind`                      | T2    |
| `editor/chrome/Minimap.tsx`, `editor/select/selection.tsx`             | "pages"/"cards" copy for framed formats (§7.4)                                            | T2    |
| `editor/icons.tsx`                                                     | `flex` (+ `deck`/`doc`/`site`) glyphs                                                     | T2    |
| `editor/canvas/Present.tsx`                                            | fit from `pagedSize(profileFor)`                                                          | T2    |
| `app/components/icons.tsx`                                             | `FlexIcon`                                                                                | T2    |
| `app/components/modals.tsx`                                            | registry-driven + Flex tile                                                               | T2    |
| `app/components/previews.tsx`                                          | `SectionThumb` aspect from `page`; `PreviewCanvas` `profileFor`                           | T2    |
| `app/stores/library.ts`                                                | `formatLabel` from registry; `blankArtifact(page?)`                                       | T2    |
| `app/views/LibraryView.tsx`                                            | pass `page` to `SectionThumb`                                                             | T2    |
| `app/views/PresentView.tsx`                                            | fit from `pagedSize(profileFor)`                                                          | T2    |
| `app/views/ThemeEditor.tsx`, `TemplatesView.tsx`                       | derive labels/list from `FORMAT_IDS`                                                      | T2    |
| `services/api/artifacts.ts`                                            | summary carries `page`                                                                    | T2    |
| `model/agent.ts`, `session.ts`, `build-canvases.tsx`, `IntakeView.tsx` | flex surface + dims                                                                       | T4    |

## 14. Testing & verification

- `pnpm typecheck` + `pnpm lint` (the ESLint boundary rules stay satisfied — no new cross-layer imports;
  `profileFor` lives in `canvas/engine`, imports only `@model`).
- **Manual E2E** (per `verify` skill): create a Flex artifact → set Story dimensions → confirm the editor
  renders each **page as a true 9:16 frame** (fixed-frame) → add a second page → **Present** (arrow-nav,
  fills the frame) → **Export PDF** (portrait pages at the right aspect) + **PNG** → reload and confirm the
  size persisted → **Undo** restores the previous size in one step → switch Flex→Deck→Flex and confirm the
  size is retained.
- Library: the new format-filter chip appears; a flex card's thumbnails render portrait, not letterboxed.
- Regression: deck/doc/web edit + present + export are byte-identical (no `frame` flag; `profileFor` returns
  the base profile; they never set `page`).

## 15. Sequencing (suggested PRs)

1. **PR1 (T1)** — `page` field + `flex` profile + `profileFor`/`pagedSize`/`setPageSize` + un-hardcode
   present/backends/export. Outcome: a flex artifact (created via a temporary hardcoded call or seed)
   renders, presents, and exports at its size. No user-facing picker yet.
2. **PR2 (T2)** — the dimension editor + grouped format picker + icons + create modal + library thumbnails
   (incl. the summary `page` field) + label sourcing + **fixed-frame editing (approach 1: `layoutSlide`
   regions + the `paintSectionStack` frame branch) + "pages" copy**. Outcome: fully usable, WYSIWYG.
3. **PR3 (T3)** — approach-2 scale-to-fit (all paged, incl. optional deck framing) + wire `splitMinWidth`
   (and, separately, `tokenScale`).
4. **PR4 (T4)** — generation into flex.

Templates: the starter gallery (`services/templates/*`) is authored deck/doc/web content; **flex ships with
no templates** initially (blank-start only). Add flex templates as content later; `TemplatesView` should
filter to formats that actually have entries so it doesn't show an empty Flex tab.

## 16. Open decisions / risks

- **Field name** — `page` (chosen) vs `size`/`canvas`. `page` reads as "the fixed page geometry".
- **Custom size for any format?** — `profileFor` honors `page` only for `flex` today (safest). Flip to
  honor it for any paged format later to get "custom deck sizes" for free.
- **Single- vs multi-section** — settled (§2): section = page, so both are the same model; a poster is N=1,
  a carousel is N>1. New flex artifacts default to one page.
- **Fixed pages vs a long canvas** — settled (§2.4): flex = fixed frames you page through. A custom-width,
  auto-height long-scroll canvas is a **separate** (continuous) profile, out of scope here.
- **Fixed-frame editing** — flex uses **approach 1** (frame each page, paint 1:1, no scaling) from the MVP;
  **approach 2** (scale-to-fit, true WYSIWYG for tall content, and letting deck opt in) is deferred because
  it rewrites every overlay's coordinate model (§12).
- **Narrow canvases (Story 9:16)** — wiring `splitMinWidth` (§6.2) is what makes two-column layouts usable
  on narrow widths — recommended alongside T2 even though it's labelled T3.
- **Thumbnail cost** — portrait thumbnails are the same lazy `layoutSlide` as today, just a different frame;
  no perf change (`SectionThumb` is IntersectionObserver-gated).
