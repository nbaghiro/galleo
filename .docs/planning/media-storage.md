# Planning — media storage: object storage, a CDN, and derived variants

> Stored media (uploads and generated images and clips) lives base64 in a Postgres text column and is
> decoded and served by the app process on every request, with no CDN and no smaller variant to paint
> a thumbnail from. This plan moves the bytes to Cloudflare R2, puts Cloudflare in front of the
> origin, and generates display and thumbnail variants on write. Sourced media (stock and link) is
> already served by the provider and is not affected.
>
> Status: designed, not started. Nothing depends on it, and it can ship in stages that each stand
> alone.

Companion docs: `architecture.md` (the asset invariant, the `assets` table, the ports table),
`hosting.md` (Render + Neon, the deploy pipeline, the scale path this expands on items 2 and 3 of),
`workspaces.md` (the `storageMb` entitlement this changes the economics of), `testing.md` (the
mocking contract any storage adapter has to satisfy).

## 0. Read this first, before doing anything

This plan was written on 2026-08-24, shortly after the asset invariant landed. **Everything below
that cites a file, a line, or a count is a snapshot and will have drifted.** Line numbers are given
so you can find the thing, not so you can trust the number.

Start by re-establishing the ground truth, because the shape of the problem may have changed more
than the plan has:

1. Read `architecture.md`'s media and data-model sections, and `hosting.md`'s scale path. If either
   already describes object storage as built, this plan is stale and the current-state description
   wins.
2. Re-read `services/core/media.ts` end to end. It is the single file that owns provider proxies, AI
   generation, and the workspace asset library. Every write and read this plan touches is in it.
3. Measure the real numbers against production, not against a seeded dev database:

    ```sql
    select source, count(*), pg_size_pretty(sum(length(data))::bigint) as base64,
           pg_size_pretty(sum(bytes)::bigint) as real_bytes
    from assets group by source;
    select pg_size_pretty(pg_total_relation_size('assets'));
    ```

    The urgency of this whole plan is a function of those numbers. If stored bytes are still a few
    megabytes, phases 2 and 3 can wait and phase 1 alone is worth doing.

4. Confirm the invariant still holds, since the entire migration strategy depends on it:

    ```sql
    -- must be zero: no artifact may hold a media url that is not one of ours
    select count(*) from artifacts where draft_content::text ~ '"(src|image|poster)":"https?://';
    ```

## 1. Why

Two paths exist today and only one of them is a problem.

**Sourced media** (`source` of `stock` or `link`) holds an `origin` and no bytes. `GET
/api/media/asset/:id` (`services/api/media.ts:276`) sees `data` is null and 302s to the provider, so
the image is served and cached by Unsplash, Pexels, Pixabay or picsum at their expense. Nothing here
needs changing, and a CDN in front only makes it better.

**Stored media** (`upload`, `generated`) holds base64 in `assets.data`. Every request pulls the whole
column out of TOAST over the network from Neon, materialises the base64 string in the app process,
decodes it to a Buffer, and writes the whole body at once. That has five costs:

1. **33% storage inflation.** Base64 is four characters per three bytes. Measured on a dev database:
   6,450 kB of real image bytes occupying 8,600 kB of column.
2. **No thumbnails.** `toItem` sets `thumbUrl: meta.thumbUrl ?? url` (`services/core/media.ts:671`).
   `meta.thumbUrl` is only ever set for stock rows, which get the provider's smaller variant. For a
   stored asset the thumbnail URL _is_ the original, so the picker's grid downloads full-size images
   to paint 200px tiles. A 1 MB upload costs 1 MB per grid cell.
3. **Image bytes on the app process.** The same Render instance runs SSE generation streams, PDF and
   PPTX export, and font subsetting, all of which `hosting.md` already flags as memory-hungry. Media
   competes with them for memory and event-loop time.
4. **No shared cache.** The route sets `cache-control: public, max-age=31536000, immutable`, which is
   correct and gives a returning browser a free ride, but there is nothing in front of the origin.
   Every cold visitor to a published page is a Render request and a Neon read.
5. **A ceiling that does not scale.** The Pro plan advertises `storageMb: 20000`
   (`model/billing.ts:227`). Twenty gigabytes of base64 in Postgres is not a viable shape, and Veo
   clips make it worse: an 8-second 720p video is several megabytes in one row.

Nothing here is urgent while stored assets number in the single digits. It becomes urgent the moment
uploads or generated images are used in earnest, which is why it is worth having designed in advance.

## 2. Why this is cheap now, and would not have been before

**Artifact content never holds a storage URL.** Since the asset invariant, every media reference in
every artifact is `/api/media/asset/<uuid>`, resolved through one route
(`ASSET_PATH` and `assetUrl` in `model/media.ts`). Backgrounds, posters, nested elements, published
pages, exports, thumbnails: all of them go through that one indirection.

So moving the bytes is invisible above the route. **No artifact is rewritten, no published link
changes, no export path changes, and nothing a user has already cached is invalidated.** Before the
invariant, every deck held a raw provider URL and this migration would have meant rewriting the
content of every artifact in the database.

Two other pieces of that work pay off here as well:

- `assets.sha256` already exists and is unique per workspace, so it is available as a
  content-addressed object key if you want cross-workspace deduplication later.
- `artifact_assets` already records which assets are reachable, so an R2 bucket can be swept for
  orphaned objects exactly the way `pnpm media:collect` sweeps rows.

## 3. Target shape

```
assets row          metadata only: kind, source, mime, bytes, width, height, sha256, alt, meta
  ├── origin        external url (stock/link)            → 302, provider serves it
  └── storage_key   object key in R2 (upload/generated)  → 302 to R2, or signed url
       └── variants derived sizes written beside it
```

- `data` is dropped. `storage_key` replaces it as the "we hold these bytes" marker, and every
  `data IS NULL` check in the codebase becomes `storage_key IS NULL`. Note the two check constraints
  on `assets` encode that assumption today and have to move with it.
- `/api/media/asset/:id` redirects for both kinds, so the app process stops handling bytes entirely.
- Cloudflare sits in front of the origin and caches the redirects and the objects.

### Why R2 rather than S3

Egress. Serving media is the entire cost model of this feature, and R2 charges nothing for it while
S3 charges per gigabyte. R2 speaks the S3 API, so the client library and the code are standard either
way; the difference is only the bill. Their Workers and Images products also sit adjacent if
on-the-fly resizing later looks better than storing variants.

MinIO is already reserved on ports 8604–8605 in `architecture.md`'s ports table for exactly this, and
is the natural local-development stand-in since it is S3-compatible too. That means one adapter and
one set of credentials shape, pointed at MinIO locally and R2 in production.

## 4. Phases

Each phase is independently shippable and independently valuable. Do them in this order; the first is
the cheapest and the third is the one that actually needs the second.

### Phase 1 — Cloudflare in front of the origin

No code. Put the domain behind Cloudflare, proxying to Render.

What it buys: an edge cache for `/api/media/asset/*` (both the redirect and, for sourced media, the
provider response), TLS, DDoS protection, and free bandwidth. `hosting.md`'s scale path already notes
the one property that made this safe to choose: Cloudflare passes SSE through unbuffered, which the
proxies rejected earlier in that doc did not.

Verify before trusting it: an AI generation turn still streams token by token rather than arriving in
one lump, and a published page's images come back with a cache status header showing an edge hit on
the second load.

Risks: caching a redirect is fine because the target of an asset id never changes; caching anything
authenticated is not, so confirm the cache rules scope to `/api/media/asset/*` and do not touch
`/api/*` generally.

### Phase 2 — Derived variants

Worth doing whether or not the bytes ever move, and it is the single biggest perceived-performance win
in the product.

On write, generate two derived images beside the original: a thumbnail (roughly 400px on the long
edge) for grid tiles, and a display size (roughly 1600px) for canvas rendering. Record them so
`toItem` can hand back a real `thumbUrl`, which is the field the picker already reads.

Notes for whoever builds it:

- No image library is installed today. `sharp` is the obvious choice and is a native dependency;
  check it builds on Render's Node runtime before committing to it. The alternative is to do this at
  the edge with Cloudflare Images and skip storing variants at all, which trades storage for
  per-request cost and removes the native dependency entirely. Decide before starting, it changes the
  shape of the work.
- Generation already knows its dimensions; uploads are decoded client-side for `width`/`height`
  before `POST /media/upload`, so the sizes are available without re-decoding.
- Variants are derived data. They should be regenerable from the original by a script, and their
  absence should degrade to the original rather than break, exactly as `meta.thumbUrl ?? url` does
  now.
- Backfill existing rows with the same script.

### Phase 3 — Bytes to R2

The main event, and mechanically small because of section 2.

1. **Adapter.** One module owning `put`, `get`, `delete`, and `signedUrl`, S3-API based, configured
   from env: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, and a public
   base URL. Follow the existing convention in `render.yaml`: declared with `sync: false`, and absent
   means the feature is off. Locally it points at MinIO.
2. **Schema.** Add `storage_key text`. Keep `data` until the backfill completes, then drop it in a
   later migration. Move the two check constraints over in that same later migration, since they
   currently assert on `data`.
3. **Writers.** `storeBytes` (`services/core/media.ts:714`), the one function both `storeUpload` and
   `storeGenerated` funnel through, writes to R2 and records the key instead of the column. Keep the
   digest lookup in front of it so identical bytes still resolve to one object.
4. **Reader.** `GET /api/media/asset/:id` redirects to the object. Public bucket plus a stable URL is
   simplest and matches the existing "public by opaque uuid" decision documented on that route; a
   signed URL with a short TTL is the alternative if you want the option of making media private
   later. Pick one deliberately and write down why, because it is hard to change once links are in
   the wild.
5. **Backfill.** A script in the style of `scripts/migrate-media-assets.ts`: dry by default, `--write`
   to act, idempotent, streaming each row's `data` into R2 and setting `storage_key`. Then a second
   migration nulls and drops the column.
6. **Deletion.** `deleteAsset` and `pnpm media:collect` must delete the object as well as the row, and
   the collect script gains a mode that finds objects in the bucket with no matching row.

### Phase 4 — Follow-ups, only if the numbers ask for it

Cross-workspace deduplication keyed on `sha256` (one object, many rows) would cut storage for shared
logos and template art, at the cost of making deletion refcounted rather than direct. Video needs
range requests to seek, which a redirect to R2 gives for free and the current Node path does not.
Neither is worth doing speculatively.

## 5. What must not change

- **The reference form.** `/api/media/asset/:id` is the contract every artifact, export, and published
  page depends on. Whatever happens behind it, that URL keeps resolving, for every id that has ever
  been handed out.
- **The invariant.** Content holds asset references and nothing else. If a change here tempts you to
  put an R2 URL into element data, that is the thing this design exists to prevent: it would make the
  library incomplete again and pin every artifact to a storage provider.
- **Quota accounting.** `storageFull` sums `bytes` where the row holds its own bytes. It must keep
  counting stored media and keep not counting sourced media, whichever column marks the difference.
- **Public readability.** The asset route is deliberately unauthenticated so `<img>`, canvas, and
  export can load credential-less, and published pages depend on it.

## 6. Verification

Per phase, and none of it is optional:

- **Export.** The single most fragile path, because `loadImages` (`canvas/render/backends.ts`) sets
  `crossOrigin = "anonymous"` and silently drops any image that fails the CORS check, so a regression
  is invisible rather than loud. Load an asset in a real browser, draw it to a canvas, call
  `toDataURL`, and confirm the canvas is not tainted. R2 must send permissive CORS headers for this;
  it does not by default, and this is the single likeliest thing to break.
- **Published pages.** Images load for a signed-out visitor in a fresh browser profile.
- **Present and thumbnails.** The minimap and library covers paint, since they use the same URLs.
- **Cache behaviour.** Second load of a published page shows edge hits.
- **The suites.** Unit and integration both, plus the guard scripts. Integration coverage exists for
  the asset library in `services/core/__tests__/`; any storage adapter needs a fake in the same shape,
  per the mocking contract in `testing.md`.

## 7. Open decisions

None blocking, but four to make deliberately at execution time rather than by accident:

| decision         | options                                             | note                                                                                                                 |
| ---------------- | --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Variant strategy | store derived sizes on write, or resize at the edge | Storing adds a native dependency; edge resizing adds per-request cost and removes it. Affects phase 2's whole shape. |
| Object URL       | public bucket, or short-TTL signed                  | Public matches today's stated decision on that route. Signed keeps a future private-media option open.               |
| Object key       | asset uuid, or `sha256`                             | uuid is simplest; sha256 opens cross-workspace dedupe but makes deletion refcounted.                                 |
| Video            | same path as images, or separate                    | Clips are the largest objects and the ones that most want range requests.                                            |

## 8. Execution checklist

- [ ] P0 Re-verify section 0 against the live codebase and production numbers; update this doc if the
      shape has moved.
- [ ] P1 Cloudflare in front; confirm SSE unbuffered, cache rules scoped to the asset route.
- [ ] P2 Variant generation on write, `toItem` returning a real `thumbUrl`, backfill script for
      existing rows.
- [ ] P3 Storage adapter, `storage_key` column, `storeBytes` writing to R2, route redirecting,
      backfill script, delete paths covering the object, follow-up migration dropping `data` and
      moving the check constraints.
- [ ] P4 Only if measured: sha256 dedupe, video range requests.
- [ ] Gates at each phase: typecheck, lint, the `pnpm check:*` guards, unit and integration suites,
      and the export CORS check from section 6.
