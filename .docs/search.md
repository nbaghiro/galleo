# Galleo — Library search & the ⌘K palette

> The current-state reference for finding things: how an artifact's text gets indexed, how the query
> runs, what the ⌘K overlay does with the results, and how the library search field reuses the same
> endpoint. Companion docs: `architecture.md` (data model, layering), `frontend.md` (the `@ui`
> component library and the keyboard/command system this extends), `testing.md`.

## What it does

⌘K opens on the workspace's recent artifacts and filters them as you type, matching titles, cover text,
and **every prose string inside the content tree**: body copy, table cells, chart categories, diagram
labels, image alt text. A content match shows the sentence it matched with the term highlighted.
Commands stay in the same overlay: the few you last ran sit under the results, and a leading `/`
turns the palette into the full command catalog, browsable and filterable by name or by the `/alias`
each command carries.

The library's search field runs the same query, so typing there also reaches body text rather than just
titles.

Scope is one workspace, live artifacts only (trash is excluded), and results never cross a tenancy
boundary.

## The pieces

| Concern                                                                   | File                        |
| ------------------------------------------------------------------------- | --------------------------- |
| Extraction + wire shapes (`SearchHit`, `SearchSnippet`, `ArtifactDigest`) | `model/artifact.ts`         |
| Columns, indexes, visit table                                             | `services/db/schema.ts`     |
| Query construction, ranking, snippets                                     | `services/core/search.ts`   |
| Route                                                                     | `services/core/search.ts`   |
| Write path (index maintenance)                                            | `services/api/artifacts.ts` |
| Derived-column write (digest + search_text)                               | `services/db/derived.ts`    |
| Palette source registry + list model                                      | `ui/palette-model.ts`       |
| Palette overlay                                                           | `ui/CommandPalette.tsx`     |
| Fetch, cache, local pass                                                  | `app/stores/search.ts`      |
| Row assembly (what a result looks like)                                   | `app/stores/palette.tsx`    |
| Library integration                                                       | `app/views/LibraryView.tsx` |

## Write path: what gets stored

Two derived columns are written on every content write, both from `model/artifact.ts`:

- `artifacts.digest` (jsonb): the cover snippet and the section filmstrip. `GET /artifacts` and search
  both read this instead of pulling `draft_content` back out and walking it per request.
- `artifacts.search_text` (text): every prose string in the tree, sections separated by a blank line,
  capped at 100KB (a tsvector is hard-limited to 1MB).

Extraction walks the raw jsonb rather than the element registry, because `services` cannot import
`canvas` and because an allowlist of known element types would silently stop indexing each new one. It
collects string leaves, skipping keys that only ever hold ids, enums, or paints (`src`, `href`, `color`,
`type`, `style`, `palette`, and the rest of the list in `artifact.ts`), values that look like URLs, data
URIs, or hex colors, and long unbroken runs that are tokens rather than sentences. Repeats within a
section are dropped.

The search vector is a **generated column**, so it cannot drift from the text no matter which code path
wrote the row:

```sql
search_tsv tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(search_text, '')), 'B')
) STORED
```

Indexes: `gin (search_tsv)` for the match, and `btree (workspace_id, updated_at DESC)` for the recents
list and the library listing.

Application code writes `search_text`; Postgres derives the vector. The rejected alternative was to
derive the vector straight from `draft_content` with `jsonb_to_tsvector`, which needs no backfill but
indexes every URL and hex color in the document, and would make a save **fail** on an artifact whose
strings exceed the tsvector limit. A generated column that can throw does not belong on the autosave
path.

Write cost: extraction is a few milliseconds on a large tree, against an autosave already debounced to
1.2s. When the extracted text is unchanged the generated value is unchanged too, so Postgres can keep
the update HOT and skip the GIN insert.

Every insert or content update goes through the same two derivations: `POST /artifacts`,
`PATCH /artifacts/:id` (content only, not a folder move), and `services/db/seed.ts`.

## Read path

`toTsQuery` turns raw input into a tsquery: lowercased, everything outside letters, digits, and
whitespace dropped, terms ANDed, and the final term suffixed with `:*` so results narrow as you type.
Because operators cannot survive that filter, nothing the user types reaches the tsquery parser as
syntax. A query of pure punctuation returns null and the search degrades to the title match.

The match is `search_tsv @@ query OR title ILIKE %q%`. The ILIKE arm covers what FTS structurally
cannot: mid-word fragments ("econom" finding "Macroeconomics", since `:*` only matches at token start)
and queries that stem to nothing (a stop word like "the"). Typed `%` and `_` are escaped, so a wildcard
matches itself.

Ordering is deliberately explainable rather than a tuned score: title-prefix hits, then title hits, then
`ts_rank_cd` over the weighted vector, then most recently edited.

Snippets come from `ts_headline` over `search_text`, computed in an outer select over the already
limited row set. Markers are the control characters `U+0002`/`U+0003` rather than tags, and
`parseSnippet` converts them to `[start, end)` offsets before the response leaves the server, so the
client renders highlight spans from data and never interprets server-supplied markup. Whitespace
collapses during that parse, because a headline fragment can straddle the blank line between two
sections and the row renders on one line either way.

An empty query is not an error: it returns the recents list, ordered by
`GREATEST(visits.seen_at, artifacts.updated_at)`, which is why the visits table exists. `updated_at` is
an edit clock; "recent" in a jump-to list means recently opened. `POST /artifacts/:id/visit` upserts one
row per (user, artifact) and is called by `EditorView` on load, so every path that opens an artifact
records it exactly once.

## API

```
GET  /api/search?q=&limit=            → { artifacts: SearchHit[], took: number }
POST /api/artifacts/:id/visit         → { ok: true }
```

`SearchHit` is the library summary (id, title, format, theme, folder, updatedAt, cover, sections) plus
`author`, `lastViewedAt`, `matchedIn` (`title` | `content`), and `snippet`. Limit defaults to 20 and is
clamped to 50. The route is rate limited at 240/minute per client, which only exists to stop a runaway
loop; the client debounces.

## The palette

`ui/palette-model.ts` gained a **source registry**. A `PaletteSource` contributes rows to a labelled
section, with two optional halves: `local(query, ctx)` runs synchronously on every keystroke against
client state, and `remote(query, ctx, signal)` is debounced (130ms) and abortable. Once a remote result
lands for the current query it replaces that source's local rows; while a newer query is in flight the
local rows stay on screen, so the list never blanks. `@ui` still knows nothing about artifacts: rows
carry a `thumb` render prop, and the app supplies it.

Sections render in `order`, sources above commands. The landing list (no query) is the sources plus at
most three recently-run commands, because the whole catalog underneath a jump-to list buries it. While
searching, matching commands collapse into one ranked "Commands" section below the sources. A leading
`/` switches to command mode: the catalog alone, grouped by `CommandGroup` when the slash stands alone
and ranked once a term follows, with each row showing its `/alias` (derived from the command id, or set
explicitly where that reads badly).

Rows come in two densities, chosen by whether the row has a thumbnail: the original single-line command
row, and a card row with a 80x50 thumbnail, title, subtitle (author and format), a right-aligned edit
time, and the highlighted snippet when the match came from body text. Enter opens; ⌘Enter runs the row's
`altRun` (open in a new tab) and the footer names it.

The app registers four sources in `app/stores/palette.tsx`:

- artifacts (`minQuery: 0`, so the empty state is server-fed recents), capped at 8 rows with a "Show all
  results" row into `/?q=…` when there are more,
- folders, local only, from the folder store,
- one action row from three characters on: "Generate an artifact about …", which hands the query to the
  generation studio rather than dead-ending on no results,
- model runs, which only exists when the model picker is enabled and only answers a query starting
  "mod": each past run as an artifact row, with its per-step models where the snippet would be.

Server hits are reconciled against the library store before rendering (`reconcile` in
`app/stores/search.ts`): titles and covers are taken from the store so a rename is never stale, and hits
the store no longer holds (trashed, deleted) drop out. Results are cached for 30 seconds, keyed by query
and limit, which makes backspacing free.

Thumbnails are the cover image, or a themed placeholder when the artifact has none (`ArtifactThumb` in
`app/components/previews.tsx`, shared with the library cards). Rendering a real section into each result
row would mean loading full content per hit; server-rendered thumbnails are the eventual answer and are
listed below.

## Library integration

`LibraryView` keeps its instant client-side filter over titles and covers, and widens it with the same
endpoint: a debounced call (160ms) collects the ids whose **content** matched, which join the visible set
while the format chips and the sort control keep working unchanged. The header line reports how many rows
are there because of a body-text match. The field is bound to `?q=`, so ⌘K's "Show all results" and a
shared URL both land on a real state.

## Performance

Measured locally against the seeded workspace (27 artifacts, largest `search_text` 8.4KB):

- `GET /search` for a content match: 10ms server-side (`took`).
- `ts_headline` over 20 rows of a synthetic 92KB document: 13ms, i.e. ~0.65ms per row. Bounding the
  headline input with `left(search_text, 8000)` cuts that to 2ms, and is the knob to reach for if p95
  degrades.

The GIN index is not exercised at this row count (Postgres picks a sequential scan for 27 rows, as it
should). The next scaling step, if a workspace filter over a large table becomes the bottleneck, is
`btree_gin` and a composite `gin (workspace_id, search_tsv)`.

## Operating it

```
pnpm db:migrate   # adds the columns, the generated vector, the indexes, visits
```

There is no backfill step: `search_text` + `digest` are derived from `draft_content` on every write via
`contentWrite` (`services/db/derived.ts`), which ESLint requires, so a row cannot be written unindexed. The
exception is changing what the extractors in `/digest` produce: stored rows keep the old shape, so
that change ships with a one-off re-derive (`set(contentWrite(row.draftContent))` over every row).

## Not built, and why

- **An external search engine** (Meilisearch, Typesense, Algolia). Better typo tolerance and relevance,
  but it adds a service, an index-sync pipeline with its own drift and failure modes, per-tenant filter
  configuration, and cost, to solve a problem Postgres solves at this scale. All query construction is
  confined to `services/core/search.ts` so swapping the engine stays a one-file change. Revisit for
  cross-workspace search, real typo tolerance, or past roughly 100k artifacts.
- **A pure client-side index.** It is only viable because the library currently downloads every
  artifact's content for thumbnails, which is the thing we want to stop doing. It survives as the local
  instant pass over titles and covers.
- **`pg_trgm`.** Worth adding for typo-tolerant titles later; a trigram GIN over full body text is large
  and slow, and the ILIKE arm already covers substring matching at current sizes.
- **pgvector / semantic search.** A different feature ("what did I write about pricing objections"),
  complementary rather than a replacement: jump-to wants literal prefix behavior.
- **Per-section index rows.** Would let a result deep-link to the slide that matched. The snippet already
  identifies it visually; the deep link needs a child table maintained on save.
- **Server-rendered thumbnails.** The real fix for both result fidelity and `loadContents()` downloading
  every artifact on library entry. Its own project.

## Tests

| Area                     | File                                        | Covers                                                                                                                                                                               |
| ------------------------ | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Extraction               | `model/__tests__/artifact.test.ts`          | cover/filmstrip derivation, nested and table/diagram text, url + color + blob exclusion, the size cap                                                                                |
| Query, route, index      | `services/api/__tests__/search.itest.ts`    | real Postgres and the real generated vector: sanitizer, ranking, tenancy isolation, trash exclusion, prefix narrowing, snippet offsets, wildcards, stop words, recents, visit upsert |
| Write path               | `services/api/__tests__/artifacts.itest.ts` | digest + search text derived on create, re-derived on a content edit, untouched by a metadata patch                                                                                  |
| Palette list model       | `ui/__tests__/palette.test.ts`              | section ordering, source registration and gating, command grouping, snippet run splitting                                                                                            |
| Fetch, cache, local pass | `app/stores/__tests__/search.test.ts`       | local ranking, request shape, abort passthrough, cache TTL and eviction, reconciliation against the store                                                                            |
