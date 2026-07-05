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
constant, and (b) one new UI surface — the dimension editor.

## 2. Scope tiers

| Tier   | Outcome                                                                               | Sections         |
| ------ | ------------------------------------------------------------------------------------- | ---------------- |
| **T1** | Flex artifacts lay out, present, and export at their real size                        | §3, §4, §5.1, §8 |
| **T2** | Users pick the format + dimensions (presets + W×H); library/create/thumbnails correct | §6, §7           |
| **T3** | Fixed-aspect **WYSIWYG editing** (edit inside the true page frame)                    | §5.2, §11        |
| **T4** | Generate into a flex canvas                                                           | §10              |

T1+T2 are the MVP. T3 is the meaningful follow-up; T4 is optional.

---

## 3. Data model

### 3.1 `model/artifact.ts` — dimensions on the artifact

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
(undefined) and for non-flex formats (see §3.5).

### 3.2 `model/artifact.ts` — carry the size in the library summary

So thumbnails render at the true aspect without fetching full content:

```ts
export interface ArtifactSummary {
    // …existing fields…
    page?: { width: number; height: number }; // NEW
}
```

`app/api.ts:19-24` re-exports `ArtifactSummary` from `@model/artifact`, so the frontend type updates for free.

### 3.3 `model/geometry.ts` — extend `FormatDescriptor`

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
}
```

### 3.4 `canvas/engine/profile.ts` — one profile + a presets table

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
        splitMinWidth: 900,   // narrow canvases collapse splits (see §5)
        paginate: "always",
        group: "Custom",
        icon: "flex",
        fullBleed: true,
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

### 3.5 `canvas/engine/profile.ts` — the content-aware resolver + numeric accessor

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

### 3.6 `canvas/elements/ops.ts` — the content op

Follows the existing pure-op pattern (`setArtifactTheme`/`setArtifactFormat`, `ops.ts:249-255`):

```ts
export function setPageSize(art: ArtifactContent, width: number, height: number): ArtifactContent {
    return { ...art, page: { width: Math.round(width), height: Math.round(height) } };
}
```

`setArtifactFormat` needs **no change** — switching to `flex` leaves `page` undefined, and `profileFor`
falls back to the flex profile's default (1080×1350) so it renders immediately.

---

## 4. Rendering — un-hardcode the paged path (Tier 1)

`commands.ts` needs **no change** — its slide functions are already `(w, h)`-parameterized. Only the three
wrappers bake in 1280×720.

### 4.1 `canvas/render/present.ts` — read the profile it's already handed

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
§6.3 / §7.5.

### 4.2 `canvas/render/backends.ts` — two fixes

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

### 4.3 `canvas/render/export.ts` — profile-driven page + PDF geometry

Replace the constants `SLIDE_W/SLIDE_H/PAGE_W/PAGE_H` (`export.ts:15-16`) with a helper, and make the two
paged exporters read the artifact's profile:

```ts
import { pagedSize, resolveProfile } from "@engine/profile";

// PDF page points: preserve the format's aspect, cap the long edge at 960pt (matches today's deck).
function pdfPointsFor(w: number, h: number): { w: number; h: number } {
    const k = 960 / Math.max(w, h);
    return { w: w * k, h: h * k };
}

async function exportSlidePdf(artifact: ArtifactContent, tk: Tokens): Promise<void> {
    const profile = resolveProfile(artifact.format); // (or profileFor(artifact) once flex is wired)
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

> **Note:** these exporters take `artifact: ArtifactContent`, which now carries `page`, so they can call
> `profileFor(artifact)` directly. `exportDeckPng` gets the same `pagedSize`/`profile` treatment (canvas
> `w*SCALE` × `h*SCALE*count`, `renderSlide(..., { w, h, scale, profile })`). `exportPdfAuto` (line 87)
> already routes on `.kind === "continuous"`, so **flex flows to `exportSlidePdf` automatically** — no
> routing change.

### 4.4 `canvas/render/commands.ts` — no change

Confirmed: `layoutSlide`/`prepareSlideNode`/`fitSlideContent` are dimension-agnostic. Comments that say
"16:9" are cosmetic; optionally reword to "the frame".

---

## 5. Compose — bleed & narrow-width

### 5.1 MVP (Tier 1) — no change required

A paged non-`web` flex section composes exactly like a deck section (fills the cell, `pad(36)`, card
treatment in the editor stack). The `webBand = ctx.format.id === "web"` check (`compose.ts:216`) stays
web-specific (centered capped column), which is correct — flex doesn't want that. If we want flex content
to bleed to the frame edges in-editor, gate on `ctx.format.fullBleed` there too (optional).

### 5.2 Recommended (Tier 3) — wire the two dead fields

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

Both also fix latent gaps for the existing three formats, so they're worth doing — but are **not blockers**.

---

## 6. UI — editor chrome (Tier 2)

### 6.1 `editor/chrome/Topbar.tsx` — format picker + dimension editor

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

### 6.2 Icons

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

### 6.3 `editor/canvas/Present.tsx` — profile-derived fit (replaces the `SLIDE_W`/`SLIDE_H` import)

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

---

## 7. UI — app SPA (Tier 2)

### 7.1 `app/components/modals.tsx` — CreateModal

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

### 7.2 Library thumbnails — the "correct" aspect path

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

### 7.3 Labels

`app/stores/library.ts:157-160` `formatLabel` hardcodes deck/doc/web. Source from the registry, keeping the
`web → "Site"` product term as a small override:

```ts
const LABEL_OVERRIDE: Record<string, string> = { web: "Site" };
export const formatLabel = (id: string): string => LABEL_OVERRIDE[id] ?? resolveProfile(id).name;
export const formatLabelPlural = (id: string): string => `${formatLabel(id)}s`;
```

Also update the label map in `app/views/ThemeEditor.tsx:86-88` and the hardcoded preview-tab list in
`app/views/TemplatesView.tsx:163` to derive from `FORMAT_IDS` (templates without flex content simply show
none — see §14). The Library format-filter chips (`LibraryView.tsx:178-181`) are already `FORMAT_IDS`-
derived, so **flex appears automatically**.

### 7.4 `app/views/generate/IntakeView.tsx`

The surface picker is already `FORMAT_IDS`-derived (`IntakeView.tsx:23-26`), so "Flex" appears free. The
`Surface` unions (`model/agent.ts:17`, `app/views/generate/session.ts:12`) gain `"flex"`. Actually
generating into flex is Tier 4 (§10).

### 7.5 `app/views/PresentView.tsx` & `PreviewCanvas`

- `PresentView.tsx:16,67` imports `SLIDE_W/SLIDE_H` and computes the fit `k` from them — same change as
  §6.3, using `pagedSize(profileFor(props.artifact))`. It already resolves `profile` (`PresentView.tsx:50`)
  → switch to `profileFor`.
- `app/components/previews.tsx` `PreviewCanvas` (`previews.tsx:242-262`) uses `paintSectionStack` with the
  resolved profile — switch `resolveProfile(props.format())` → `profileFor(props.content)` so flex previews
  size correctly (it already has the full `content`).

---

## 8. Backend

Structurally **nothing new**:

- `artifacts.formatId` is free text defaulting to `"deck"` (`artifacts.ts:155`) — `"flex"` is just a string.
- `POST /artifacts` and `PATCH /artifacts/:id` set `draftContent` wholesale (`artifacts.ts:157,250`), so
  `page` inside it round-trips with no change.
- **Only change:** add `page` to the library-list summary derivation (§7.2) so thumbnails get the aspect.
- Optional hardening: validate `formatId ∈ Object.keys(PROFILES)` on create/patch (not required today).

The artifact-cap plan gate (`artifacts.ts:132`) is format-agnostic and unaffected.

---

## 9. Persistence — no change

Autosave sends the full `ArtifactContent` (`save.ts:39-43`: `draftContent: { ...art, theme: themeId }`),
so `page` is saved and re-loaded (`EditorView.loadId` → `loadArtifactContent`) automatically. `page` is
part of every history snapshot (`editor.ts` snapshots `editor.artifact`), so **resizing the page is
undoable** right alongside content edits — with coalescing, a drag is one step.

---

## 10. Generation (Tier 4 — optional)

The narrated simulator + the older `AgentPanel` generator work without this; do it only when AI should
target flex.

- `model/agent.ts:17` + `app/views/generate/session.ts:12` — add `"flex"` to `Surface`.
- `app/views/generate/build-canvases.tsx` — `layoutFor` (`build-canvases.tsx:47`) hardcodes
  `web = p.id === "web"` and its own `SLIDE_W/SLIDE_H = 1280/720` (line ~164); generalize `web` →
  `p.fullBleed ?? p.id === "web"` and derive slide dims from `pagedSize(profileFor(...))`.
- Intake needs a default `page` when the surface is flex (a preset dropdown next to the surface chip,
  defaulting to Poster) → seeded into the generated `ArtifactContent`.

---

## 11. Fixed-frame editing (Tier 3 — the WYSIWYG lift)

Today the editor paints a **continuous, content-height stack** at `maxContentWidth` (`Canvas.tsx:77-92` →
`paintSectionStack`). Deck already edits "loose" and only frames to 16:9 in Present/Export; flex inherits
that model for free in the MVP. But because flex _is_ a fixed-size canvas, editing inside the true frame is
the natural model. Two approaches, both non-trivial:

1. **Lay out each section at frame dims** — use `layoutSlide(section, w, w/aspect)` per section (fill +
   center) instead of `layoutSection`, painted 1:1 at column width. Keeps overlays correct (no scale), but
   `layoutSlide` currently returns only `{ commands, height }` — it discards regions, which
   `paintSectionStack` needs for hit-testing. Requires exposing regions from the slide path. Overflowing
   content grows the frame (same as deck today).
2. **Scale a fixed W×H layer to fit the column** — true WYSIWYG (content scales down to fit), but introduces
   a scale factor that **every overlay assumes is 1** — selection ring, `ResizeHandles`, `SpacingHandles`,
   `ColumnDividers`, the `TextEditor` caret, and the `computeDropTarget`/`hitTest` math all work in
   unscaled canvas coords (`Canvas.tsx`, `editor/select/*`). Correct but invasive.

Recommendation: ship MVP on the loose model; pursue **approach 1** for T3 (smaller blast radius — region
plumbing in the slide path, no overlay coordinate rework).

---

## 12. File-by-file change map

| File                                                                   | Change                                                                                | Tier  |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ----- |
| `model/artifact.ts`                                                    | `ArtifactContent.page`, `ArtifactSummary.page`                                        | T1/T2 |
| `model/geometry.ts`                                                    | `FormatDescriptor`: `group`/`icon`/`fullBleed`                                        | T1    |
| `canvas/engine/profile.ts`                                             | `flex` profile, `FLEX_PRESETS`, `profileFor`, `pagedSize`, `group`/`icon` on existing | T1    |
| `canvas/elements/ops.ts`                                               | `setPageSize`                                                                         | T1    |
| `canvas/render/present.ts`                                             | `slideElement` reads `pagedSize(profile)`; drop `SLIDE_W/H` exports                   | T1    |
| `canvas/render/backends.ts`                                            | `renderSlide` takes `profile`; `paintSectionStack` `fullBleed`                        | T1    |
| `canvas/render/export.ts`                                              | `pagedSize`/`profileFor`-driven slide + `pdfPointsFor`                                | T1    |
| `canvas/elements/compose.ts`                                           | (opt) `fullBleed`; (T3) wire `splitMinWidth`/`tokenScale`                             | T1/T3 |
| `editor/chrome/Topbar.tsx`                                             | grouped format dropdown + `DimensionEditor`; present-label by `kind`                  | T2    |
| `editor/icons.tsx`                                                     | `flex` (+ `deck`/`doc`/`site`) glyphs                                                 | T2    |
| `editor/canvas/Present.tsx`                                            | fit from `pagedSize(profileFor)`                                                      | T2    |
| `app/components/icons.tsx`                                             | `FlexIcon`                                                                            | T2    |
| `app/components/modals.tsx`                                            | registry-driven + Flex tile                                                           | T2    |
| `app/components/previews.tsx`                                          | `SectionThumb` aspect from `page`; `PreviewCanvas` `profileFor`                       | T2    |
| `app/stores/library.ts`                                                | `formatLabel` from registry; `blankArtifact(page?)`                                   | T2    |
| `app/views/LibraryView.tsx`                                            | pass `page` to `SectionThumb`                                                         | T2    |
| `app/views/PresentView.tsx`                                            | fit from `pagedSize(profileFor)`                                                      | T2    |
| `app/views/ThemeEditor.tsx`, `TemplatesView.tsx`                       | derive labels/list from `FORMAT_IDS`                                                  | T2    |
| `services/api/artifacts.ts`                                            | summary carries `page`                                                                | T2    |
| `model/agent.ts`, `session.ts`, `build-canvases.tsx`, `IntakeView.tsx` | flex surface + dims                                                                   | T4    |

## 13. Testing & verification

- `pnpm typecheck` + `pnpm lint` (the ESLint boundary rules stay satisfied — no new cross-layer imports;
  `profileFor` lives in `canvas/engine`, imports only `@model`).
- **Manual E2E** (per `verify` skill): create a Flex artifact → set Story dimensions → add content →
  confirm the editor stack renders → **Present** (fills a 9:16 frame, arrow-nav) → **Export PDF** (portrait
  pages at the right aspect) + **PNG** → reload and confirm size persisted → **Undo** restores the previous
  size in one step → switch Flex→Deck→Flex and confirm the size is retained.
- Library: the new format-filter chip appears; a flex card's thumbnails render portrait, not letterboxed.
- Regression: deck/doc/web export + present are byte-identical (they never set `page`; `profileFor` returns
  the base profile).

## 14. Sequencing (suggested PRs)

1. **PR1 (T1)** — `page` field + `flex` profile + `profileFor`/`pagedSize`/`setPageSize` + un-hardcode
   present/backends/export. Outcome: a flex artifact (created via a temporary hardcoded call or seed)
   renders, presents, and exports at its size. No user-facing picker yet.
2. **PR2 (T2)** — the dimension editor + grouped format picker + icons + create modal + library thumbnails
   (incl. the summary `page` field) + label sourcing. Outcome: fully usable.
3. **PR3 (T3)** — fixed-frame editing (approach 1) + wire `splitMinWidth` (and, separately, `tokenScale`).
4. **PR4 (T4)** — generation into flex.

Templates: the starter gallery (`services/templates/*`) is authored deck/doc/web content; **flex ships with
no templates** initially (blank-start only). Add flex templates as content later; `TemplatesView` should
filter to formats that actually have entries so it doesn't show an empty Flex tab.

## 15. Open decisions / risks

- **Field name** — `page` (chosen) vs `size`/`canvas`. `page` reads as "the fixed page geometry".
- **Custom size for any format?** — `profileFor` honors `page` only for `flex` today (safest). Flip to
  honor it for any paged format later to get "custom deck sizes" for free.
- **Very tall canvases (Story 9:16)** — content that doesn't fill scales up to center (existing slide
  behavior); content that overflows scales down. Wiring `splitMinWidth` (§5.2) is what makes two-column
  layouts usable on narrow widths — recommended alongside T2 even though it's labelled T3.
- **Thumbnail cost** — portrait thumbnails are the same lazy `layoutSlide` as today, just a different frame;
  no perf change (`SectionThumb` is IntersectionObserver-gated).
- **Fixed-frame editing** is the one genuinely large piece (overlay coordinate model); deliberately deferred
  so the MVP reuses deck's proven loose-editing model.
