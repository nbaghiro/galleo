# Galleo — Loading, paging, and windowed rendering

> How much of a library, and how much of an artifact, is fetched and materialized at any moment. Three
> mechanisms: keyset pagination for lists, windowed reads for long artifacts, and paint windowing for
> the section stack. Companion docs: `architecture.md` (data model), `rendering.md` (the engine and the
> section stack), `search.md` (the index these reads share), `testing.md`.

## The rule

Nothing loads or materializes because it exists. It loads because it is on screen, or about to be.

That plays out in three places: the library fetches a page of cards and each card fetches its own
sections when it nears the viewport; the editor fetches the sections around the viewport and holds the
rest open at their recorded size; and every surface that paints a section stack materializes only the
band it can see.

## Lists: keyset pagination

`GET /artifacts` takes `limit` (default 24, max 100), `cursor`, and the filters the library offers:
`folder`, `format`, `sort=az`, `trashed=1`. It answers `{ artifacts, nextCursor }`.

The cursor names the last row of the previous page rather than an offset, so an artifact edited while
someone is paging cannot repeat or vanish:

```sql
WHERE workspace_id = $ws AND trashed_at IS NULL
  AND (updated_at, id) < ($cursorTime::timestamp, $cursorId::uuid)
ORDER BY updated_at DESC, id DESC
LIMIT $limit + 1
```

The extra row is how "is there more" is answered without a count. A–Z sorts on `lower(title)` so it
reads the way the client's old `localeCompare` did, and carries the lowercased title as its cursor key.
A malformed or tampered cursor degrades to the first page rather than erroring.

Filters moved to the server because a page is only coherent if both ends agree on what the list holds:
filtering a page client-side would hide rows that the next page would have supplied.

`app/stores/library.ts` keeps the accumulated list, `nextCursor`, and the query the pages were drawn
under; a filter change refetches page one, and an epoch counter drops a page that arrives under filters
the user has already moved on from. `LibraryView` observes a sentinel below the last card at a 600px
margin and asks for the next page.

While a search query is active the list comes from `/search` instead, paged by `offset` (rank order is
stable for a query, so an offset is a real boundary there). The sort control hides, because ranked
results are already ordered.

Two things depended on the client holding the whole library and no longer do: folder counts come from
`GET /folders` (a grouped count), and the Shared view reads title, format, theme, and cover from the
link row, which the links query now joins.

## Artifacts: windowed reads

`GET /artifacts/:id?window=from:count` returns the artifact's shell (format, theme, background), the
full section index from the stored digest (id, kind, title, serialized size, per section), and only the
requested slice of sections. `GET /artifacts/:id/sections?ids=…` or `?window=from:count` fetches the
rest. Without a `window` parameter the route returns the whole artifact exactly as before, which is
what export, publishing, and every other consumer still use.

The editor always asks for `window=0:24`. An artifact with 24 sections or fewer arrives whole and
behaves exactly as it did before; a longer one arrives with placeholders after the first 24.

Note what this does and does not save. Postgres has to detoast the whole `draft_content` to slice it, so
the database read is unchanged; what shrinks is the response body, the JSON parse, and everything the
client would otherwise do with sections nobody is looking at.

### Placeholders

`loadArtifactWindow` (in `editor/core/store.ts`) builds the section array from the index: real sections
where they arrived, and a stub `{ id, root: emptyRegion() }` everywhere else, with the byte size the
digest recorded kept in a `pending` map. The canvas reserves each placeholder's estimated height and
requests it as the window approaches (`requestSections`). Resolution replaces the stub in place without
bumping `editSeq`, so a load is never mistaken for an edit and never triggers a save.

A history snapshot taken while a section was still a placeholder would un-load it on undo, so undo and
redo pass their content through `hydrate`, which swaps a stub for its resolved section **by object
identity**. A section that was genuinely edited keeps its edited value.

`ensureAllSections()` fills everything in, and is awaited by the operations that cannot work on part of
a document: export, Present, and any AI turn.

### Writing back

A client holding part of a document cannot save by replacing the tree. `PATCH /artifacts/:id/content`
takes section ops instead:

```ts
type SectionOp =
    | { kind: "set"; section: Section }
    | { kind: "insert"; section: Section; index: number }
    | { kind: "remove"; id: Id }
    | { kind: "order"; ids: Id[] }
    | { kind: "shell"; shell: ArtifactShell };
```

They apply in order inside one transaction (`SELECT … FOR UPDATE`, apply, re-derive digest and search
text). An op naming a section the server does not have fails the **whole** batch with 409: that means
the two sides disagree about the document, which is a resynchronization, not something to paper over.

Autosave produces those ops with `diffSections(before, after)`, comparing by section identity against
what the server is known to hold. Every editor op preserves the identity of untouched sections (the
paint cache already relies on this), so an unchanged section is free to detect and never sent. A
keystroke now rewrites one section instead of the entire jsonb document.

The fallback matters: if a section op is rejected and the client holds the **whole** document, autosave
replaces it wholesale, which is always safe. A windowed client cannot do that (its placeholders would
be written as empty sections), so it surfaces the failure and retries on a timer with its baseline
unchanged.

`PATCH /artifacts/:id` with a whole `draftContent` is untouched and remains the path for generation,
chat, duplication, and renames.

## Rendering: paint windowing

Layout is cheap, materialization is not. Measured against the section stack (happy-dom, so paint is
DOM construction only, without style, layout, raster, or image decode):

| sections | layout | paint | repaint (cached) | DOM nodes |
| -------- | ------ | ----- | ---------------- | --------- |
| 20       | 2ms    | 26ms  | 0.7ms            | 375       |
| 100      | 2ms    | 107ms | 4.8ms            | 1,875     |
| 200      | 7ms    | 216ms | 14.4ms           | 3,750     |

So the design windows the paint, not the layout. `paintSectionStack` takes an optional
`window: { top, bottom }` in stage coordinates and lays every section out as before, which keeps `tops`,
the total height, and therefore the scrollbar exact, but only materializes the sections that intersect
it. Because layers are absolutely positioned, omitting one moves nothing: no spacers, no estimated
heights, no scroll jumps.

The cache splits accordingly. `SectionCacheEntry` always keeps the layout (commands, regions, height);
its `layer` is created when the section enters the window and dropped once it leaves the window plus a
400px retention margin, releasing that section's DOM, images, and chart SVGs. Regions are reported only
for materialized sections, so the hit-test array is bounded by the viewport rather than the document.

`editor/Canvas.tsx` computes the window from the scroller (1.5 viewports of overscan each way,
`canvas/render/window.ts`) and repaints when it has moved by more than a third of a viewport. When a
placeholder resolves at a height different from its estimate and it sat above the viewport, the canvas
absorbs the difference into `scrollTop` so the reader's place holds.

The same window drives the continuous Present surface (and therefore the public viewer) and the preview
canvas in the templates and share modals. Present's paged mode no longer lays out every section just to
compute the slide total: it counts up to one section ahead of the viewer and treats the rest as one
slide each until reached.

Images are no longer pinned for the session: `warmImage` is a 60-entry LRU, and a real `<img>` decodes
asynchronously.

Export, PDF, PPTX, and print pass no window, because they genuinely need every section.

**Known limitation:** browser find-in-page cannot find text in unmaterialized sections. Every windowed
editor has this. The model-level search built in `search.md` is the answer, as an in-app find.

## What this leaves for later

- **Server-rendered thumbnails.** Superseded for now: a card fetches 6 sections rather than a whole
  artifact, so a raster pipeline would buy little and needs a rasterizer decision (services cannot
  import `canvas`, so it would mean a node-side renderer or a client-side upload path).
- **Progressive first layout.** At 500-plus sections the single layout pass (a few hundred milliseconds
  with real text metrics) becomes the cost. The fix is to lay out the first window synchronously and
  continue in idle chunks, growing the stage below the scroll position. The `window` parameter is the
  hook; nothing else changes.
- **`btree_gin` for the list index**, if the workspace filter over a very large artifacts table starts
  to matter.

## Tests

| Area                             | File                                           | Covers                                                                                                                                                                           |
| -------------------------------- | ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Section ops                      | `model/__tests__/content.test.ts`              | apply (set/insert/remove/order/shell), whole-batch rejection, diff by identity, round-trip                                                                                       |
| Digest index                     | `model/__tests__/digest.test.ts`               | per-section id + serialized size                                                                                                                                                 |
| Paging, windowed read, ops route | `services/api/__tests__/paging.itest.ts`       | cursor walk with no repeats or gaps, A–Z keyset, folder/format/trash scoping, malformed cursor and window, section slices by id and range, op application and 409, folder counts |
| Paint windowing                  | `canvas/render/__tests__/backends.dom.test.ts` | identical geometry windowed vs not, only intersecting layers, regions filtered, layer released on exit, placeholder heights                                                      |
| Window math                      | `canvas/render/__tests__/window.test.ts`       | overscan band, repaint threshold, height estimates per format                                                                                                                    |
| Windowed store                   | `editor/core/__tests__/windowed.test.ts`       | placeholder placement, resolution without an edit, request dedupe, `ensureAllSections`, undo across a resolution                                                                 |
| Autosave                         | `app/stores/__tests__/save.test.ts`            | one-section diffs, baseline advance, structural ops, whole-document fallback, no fallback when windowed, retry                                                                   |
| Library paging                   | `app/stores/__tests__/library-paging.test.ts`  | filters on the wire, append and dedupe, exhaustion, failure keeps the cursor, per-card fetch and dedupe                                                                          |
