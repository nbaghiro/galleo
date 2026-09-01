# Planning: media serving, holding the bytes ourselves

> Every media reference in artifact content is `/api/media/asset/:id`, and for about 90% of production
> assets that route answers with a 302 to a third party. On 2026-08-29 picsum.photos went down and
> took most library covers, editor canvases and published pages with it. This plan removes the
> view-time dependency on providers: bytes we are allowed to hold get ingested into Cloudflare R2 at
> adoption time and served from our own CDN hostname, variants are cut at the edge, and providers are
> reached only when someone searches or when generation sources a new picture. Two providers
> (Unsplash, Giphy) forbid exactly that, so they keep a hotlink path and the policy becomes per
> provider rather than global. Unsplash publishes a route to an exception for products that host their
> own image infrastructure, and asking for it is the first item on the checklist. Pixabay is the
> opposite case: it forbids permanent hotlinking and its URLs expire after 24 hours, so ingest fixes a
> compliance problem and a correctness bug at the same time.
>
> Status: researched and designed, not started. Supersedes `media-storage.md`, which is kept as prior
> art: its target shape (bytes in R2, variants, a CDN) is right, but it treats sourced media as
> "nothing here needs changing", and that assumption is what the outage falsified.

Companion docs: `architecture.md` (the asset invariant, the `assets` table, the reserved object-storage
ports), `hosting.md` (Render + Neon, the single-origin rule this plan deliberately does not break, the
scale path), `workspaces.md` (the `storageMb` entitlement section 7 changes the meaning of),
`testing.md` (the mocking contract a storage adapter has to satisfy), `analytics.md` (the event
catalog section 12 adds to), `planning/media-storage.md` (the earlier plan this replaces).

## 0. Read this first, before doing anything

This was written on 2026-08-31. **Every price, every quoted term of service, and every file reference
below is a snapshot and will have drifted.** Vendor pricing changed materially in the eight months
before this was written (Render's included bandwidth fell from 100 GB to 5 GB on 2026-04-23), and
provider API terms are edited without announcement. Treat the numbers as the shape of the answer, not
as the answer.

Re-establish ground truth in this order:

1. **Re-read the provider terms in section 8 from their live URLs.** They are the constraint on the
   whole design, not a footnote to it. If Unsplash has relaxed its hotlinking requirement, or granted
   us the beacon exception, or Pixabay has dropped its prohibition on permanent hotlinking, the
   per-provider policy in section 4.4 collapses into something simpler. If Pexels has added a caching
   clause, it gets harder. Note that two of these pages refuse automated clients: `unsplash.com/api-terms`
   answers 401 and `support.giphy.com` answers 403 to anything that is not a browser, so those two
   want a human with a browser rather than a fetch.
2. **Re-check the pricing in section 5.** The recommendation rests on R2 egress being free and on
   Render egress being expensive. Both are load-bearing and both are vendor decisions we do not
   control.
3. **Re-read `services/core/media.ts` and `services/api/media.ts` end to end.** They are the two files
   this plan touches. Line references below are for finding things, not for trusting.
4. **Re-measure production**, because the urgency is a function of the numbers:

    ```sql
    select source, count(*),
           count(*) filter (where data is not null) as with_bytes,
           count(*) filter (where origin is not null) as with_origin,
           pg_size_pretty(sum(length(data))::bigint) as base64
    from assets group by source;

    -- who we actually depend on at view time
    select split_part(split_part(origin, '://', 2), '/', 1) as host, count(*)
    from assets where origin is not null and data is null
    group by host order by count(*) desc;
    ```

5. **Confirm the invariant still holds**, since the migration depends on it:

    ```sql
    -- must be zero: no artifact may hold a media url that is not one of ours
    select count(*) from artifacts where draft_content::text ~ '"(src|image|poster)":"https?://';
    ```

6. Check whether `scripts/repicsum.ts` has been run against production. It was written during the
   outage and is uncommitted at the time of writing. If it has run, the picsum numbers in section 2
   are wrong and section 9 is partly done.

## 1. What broke, and what it proves

`GET /api/media/asset/:id` (`services/api/media.ts:289`) serves stored bytes when the row has `data`,
and otherwise 302s to `origin`. About 406 of 467 production assets have a picsum.photos origin, 55
have an Unsplash origin, and 3 hold their own bytes. When picsum went down (Cloudflare 522, then 503,
then connection refused) the browser followed our redirect to a host that was not answering, and
roughly 90% of production imagery went blank at once: library covers, editor canvases, minimap
thumbnails, present surfaces, published pages and exports, all of which paint the same URLs.

picsum.photos still answered HTTP 503 when fetched for this document on 2026-08-31, two days later.
Its own README describes it as "a service providing easy to use, stylish placeholders" and makes no
availability claim of any kind: no SLA, no status page, no rate-limit policy, no terms
([README](https://github.com/DMarby/picsum-photos)). It is a free hobby project on donated Fastly
bandwidth, and 90% of what our customers see was resolving through it.

Three things follow, and the third is the one that matters for design.

**A CDN in front of our origin would not have helped.** Cloudflare would have cached our 302, not the
picture. The viewer's browser still makes the second request, still to picsum, still directly. Any
design where the last hop is the provider's host inherits the provider's uptime, whatever we put in
front of ours. `hosting.md`'s scale-path item 3 ("CDN in front") and `media-storage.md`'s Phase 1 both
assume otherwise, and both are wrong about this specific failure.

**The redirect is the bug, not the storage.** Even with the bytes still in Postgres, streaming the
provider's response through our own route instead of redirecting to it would have let the edge hold
the picture, and a picture viewed once would have survived the outage. That is not the destination
(see section 5 on why serving bytes from Render is the most expensive option available), but it is
worth understanding that the storage question and the redirect question are separable.

**The dependency is wider than the asset route.** `toItem` (`services/core/media.ts:747`) returns
`thumbUrl: meta.thumbUrl ?? url`, and for a stock row `meta.thumbUrl` is the provider's own small
URL, written into `meta` by `useItem` (`:1133`). `MediaPicker.tsx:737` renders that string directly
in an `<img>`. So the media picker's library grid hotlinks providers even for assets we have already
adopted, entirely outside the asset invariant, with an `onError` handler that falls back to the
full-size original. That is a second provider dependency, a second failure mode, and a performance
problem in its own right.

## 2. Current state, verified

| Fact                                                                                                            | Where                                      |
| --------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| Every media reference in content is `/api/media/asset/<uuid>`. Hard invariant, enforced at every write path.    | `model/media.ts:64`, `architecture.md:522` |
| An asset row has `data` (base64) **or** `origin` (external url), never neither. Two check constraints say so.   | `services/db/schema.ts:355`                |
| The route serves bytes, or 302s to `origin`. Range requests (206) are supported on the bytes path.              | `services/api/media.ts:289`                |
| Adoption runs **inside the caller's write transaction**, so it must stay row-only and fast.                     | `services/core/artifacts.ts:256`           |
| `storageFull` counts `bytes` where `data IS NOT NULL`, and gates AI image and video generation with a 402.      | `services/core/media.ts:728`               |
| `refImage` reads `data` back as base64 to feed image-conditioned refinement to Gemini.                          | `services/core/media.ts:759`               |
| `ownedElsewhere` copies `data` row to row when an artifact crosses workspaces.                                  | `services/core/media.ts:1048`              |
| `collectableAssets` only ever considers rows with `data`, on the stated grounds that adopted rows cost nothing. | `services/core/media.ts:1280`              |
| Export sets `crossOrigin = "anonymous"` on every image and silently drops any that fails the CORS check.        | `canvas/render/backends.ts:806`            |
| The picker grid paints up to 48 tiles from `thumbUrl`, which for a stored asset is the full-size original.      | `services/core/media.ts:747`               |
| Library covers paint `digest.cover.image` as a CSS background, which is an asset URL.                           | `app/components/previews.tsx:206`          |
| No image library, no S3 client, no object-storage code exists. Node 22, Render Hobby workspace.                 | `package.json`, `.node-version`            |
| MinIO is reserved on ports 8604 to 8605 for exactly this.                                                       | `architecture.md:861`                      |

Production, as reported on 2026-08-31: 467 assets, roughly 406 with a picsum origin, 55 Unsplash, 3
with stored bytes. Re-measure per section 0 before acting.

## 3. The rule we are adopting

> Once a picture has been chosen, we hold it and we serve it. A provider is reached when someone
> searches, when generation sources a new image, and at ingest. Never at view time.

With one exception forced on us from outside, stated here rather than buried in section 8: **Unsplash
and Giphy contractually forbid this.** Unsplash requires hotlinking, Giphy forbids caching and
proxying without written approval. So the rule is per provider, and the two exceptions carry the
provider's uptime as an accepted risk. Sections 8 and 13 cover what to do about that.

## 4. Target architecture

### 4.1 Where the bytes live

Cloudflare R2, one bucket, one object per asset, keyed by the asset uuid.

```
assets row       metadata + provenance: kind, source, mime, bytes, width, height, sha256, alt, meta
  ├── origin     where it came from. Provenance and re-fetch source. NOT a serving path any more.
  └── storage_key  the R2 object key. Present = we hold it = we serve it.
       (data)    dropped after backfill; storage_key replaces it as the "we hold these bytes" marker
```

`origin` stops being a fallback and becomes history. That is the single conceptual change in the data
model, and everything else follows from it. A row that has both `origin` and `storage_key` is the
normal state for adopted stock: we know where it came from, and we serve our own copy.

**The object key is the asset uuid**, not the sha256. The uuid makes the id-to-key mapping the
identity function, which means anything sitting in front of the bucket can resolve a request without
touching Postgres. Cross-workspace deduplication (the sha256 idea in `media-storage.md`) is given up
for that, and it is a good trade: storage is $0.015/GB-month, so a duplicated object costs
approximately nothing, while a lookup on the serving path costs a round trip on every image. The
per-workspace sha256 unique index stays and keeps doing what it does today.

### 4.2 Topology: a separate media hostname, not the whole zone behind a proxy

```
galleo.app          DNS only (grey cloud) → Render.  SSE, WebSockets, the SPA, /api/*.
media.galleo.app    proxied (orange cloud) → R2 custom domain.  Every media byte.
```

`hosting.md`'s scale path says to put Cloudflare in front of the whole service, on the grounds that
"Cloudflare passes SSE through un-buffered". That is half right and worth correcting here, because the
correction is what drives this topology.

Cloudflare's Response Buffering setting is genuinely off by default and dynamic traffic is genuinely
streamed
([docs](https://developers.cloudflare.com/network/response-buffering/)). What breaks streaming in
practice is automatic compression: browsers send `Accept-Encoding`, Cloudflare compresses, and
compression forces the response to be buffered rather than chunked. Mintlify debugged exactly this
and the fix was to turn compression off in the dashboard
([writeup](https://www.mintlify.com/blog/debugging-a-mysterious-http-streaming-issue-when-cloudflare-compression-breaks-everything)).
There are also 2025 and 2026 community reports of `text/event-stream` being buffered indefinitely
behind the proxy. Separately, WebSocket connections through the proxy have a 100 second idle timeout
on Free and Pro
([docs](https://developers.cloudflare.com/network/websockets/)), which the collaboration room's
heartbeat should already survive but which is one more thing to be right about.

None of that is unmanageable. It is simply not a risk worth taking on the AI streaming path and the
collaboration socket in order to fix an image problem. Putting only `media.galleo.app` behind the
proxy gets the entire benefit and none of the exposure, and it leaves `hosting.md`'s single-origin
decision untouched: the SPA, the API, the session cookie and the publish links all still live on one
origin, and media is an asset host, which is what asset hosts are.

The cost of this choice is that `/api/media/asset/:id` keeps issuing a redirect, now to
`media.galleo.app` instead of to a provider. That is a real cost and it is small: the redirect is
`immutable` and cached by the browser for a year, it points at infrastructure we control, and it
carries no bytes. Section 13 records the two ways to remove it later if request volume ever makes it
worth doing.

### 4.3 How bytes get there: ingest at adoption, read-through as the backstop

Adoption is the right moment. The user has just chosen the picture, so the provider is up by
construction, we already have the URL, and nothing is being rendered yet. But adoption
(`adoptContentMedia`) runs **inside the content-write transaction**
(`services/core/artifacts.ts:256`), and a template use adopts dozens of URLs in one write. Fetching 30
images with a Postgres transaction open is not an option.

So the write path stays exactly as it is (rows only, two statements, no network), and ingest is a
separate step:

1. **After the transaction commits**, the new asset ids are handed to an in-process ingest pool:
   bounded concurrency, per-URL timeout, size cap, and a `storage_key` written on success. Fire and
   forget from the caller's point of view.
2. **A read-through path on the route** covers everything the pool missed. There is no job queue in
   the repo (the Redis slot on 8603 is still reserved), so an in-process pool loses its work on every
   deploy. That is acceptable only because the read-through exists, which makes it not optional.
3. **A sweep script** (`pnpm media:ingest`, in the style of `collect-media-assets.ts`: dry by default,
   `--write` to act, idempotent) covers the backfill and anything both of the above dropped.

Two things the ingest fetcher must get right, neither of which exists in the codebase today because
nothing currently fetches an arbitrary URL server-side:

- **SSRF.** `POST /media/link` lets a user paste any URL and stores it as `origin`. Ingesting that
  URL server-side is a request from inside our network to an address the user chose. Automatic ingest
  is allowlisted to the provider hosts (`STOCK_HOSTS` already exists at
  `services/core/media.ts:886`); anything else goes through a fetcher that refuses private and
  link-local address ranges, caps redirects, caps body size, and caps time.
- **Failure is normal.** A provider 404s, rate-limits, or is down. Ingest failing must leave the row
  exactly as it was and must be retryable, never poison it. Record the attempt count so a permanently
  dead origin stops being retried on every view.

### 4.4 What `/api/media/asset/:id` becomes

```
readAsset(id)
  ├── storage_key present   → 302 to https://media.galleo.app/<key>, cache-control immutable
  ├── data present          → stream the bytes (the pre-backfill state), enqueue ingest
  ├── origin, hotlink-only  → 302 to origin, as today (Unsplash, Giphy: see section 8)
  ├── origin, ingestable    → enqueue ingest, and for this one request stream the origin through
  │                            rather than redirect to it, so the edge holds the picture
  └── nothing servable      → 404
```

The hotlink-only case is decided by a per-provider policy value, not by a hostname check scattered
through the code: one table beside the provider list in `services/core/media.ts` saying, per provider,
whether we may hold the bytes, with the terms URL and the date it was last checked as a comment. A
terms change then becomes a one-line diff, and there is exactly one place to look when someone asks
why Unsplash is different.

The `?w=` variant contract lands on the same route (section 6). `assetIdFromUrl` already tolerates a
query string (`model/media.ts:67`), and a query parameter is picker and chrome metadata only. It is
never written into artifact content, which continues to hold the bare form.

## 5. Vendor choice

The dominant cost of this feature is egress, and the second consideration is how much operational
surface it adds. Prices below were read from the vendors' own pages on 2026-08-31.

| Option                                     | Storage           | Egress to viewers                                     | Transformations                     | Ops burden                                                            | Verdict                      |
| ------------------------------------------ | ----------------- | ----------------------------------------------------- | ----------------------------------- | --------------------------------------------------------------------- | ---------------------------- |
| **Cloudflare R2 + CDN + Images**           | $0.015/GB-mo      | **$0**                                                | 5,000 unique/mo free, then $0.50/1k | One vendor, `wrangler` CLI, S3 API, MinIO stands in locally           | **Recommended**              |
| Bunny.net Storage + CDN + Optimizer        | $0.01/GB-mo (HDD) | $0.01/GB (EU/NA), $1/mo minimum                       | Optimizer $9.50/mo flat, unlimited  | One vendor, good API, storage-to-CDN traffic free                     | Strong runner-up             |
| Backblaze B2 + Cloudflare                  | ~$0.00695/GB-mo   | Free through partner CDNs (Cloudflare, Bunny, Fastly) | None; needs a CDN that does it      | Two vendors to get R2's shape                                         | R2 with extra steps          |
| AWS S3 + CloudFront                        | ~$0.023/GB-mo     | Free tier then metered; S3 to CloudFront waived       | CloudFront functions or Lambda@Edge | IAM, distributions, OAC, cache policies. The heaviest setup here      | Against the ergonomics bar   |
| Render disk                                | Priced per GB     | **$0.15/GB**, 5 GB included on Hobby                  | None                                | Pins the service to one instance, kills zero-downtime deploys, no CDN | Disqualified                 |
| Serve from Postgres through Render (today) | Neon storage      | **$0.15/GB**, 5 GB included on Hobby                  | None                                | Zero, and that is its only merit                                      | The status quo, and it bites |
| Cloudinary / imgix / Uploadcare            | Bundled           | Bundled, and the bundles are the expensive part       | Excellent                           | Least code, most lock-in, steepest cost curve                         | Overkill at this scale       |

Five things decide it.

**Egress is the whole cost model, and Render's is the worst number on the page.** On 2026-04-23 Render
cut included outbound bandwidth to 5 GB on Hobby and 25 GB on Pro, with $0.15 for each additional GB
([docs](https://render.com/docs/new-workspace-plans)). A published deck with twelve images at 400 KB
is roughly 5 MB per cold view, so about a thousand cold views is the entire monthly Hobby allowance,
and the thousand-and-first costs $0.15 per GB from there. Serving media through the app process is not
a scaling concern for later, it is a bill starting now. R2 charges nothing for egress: "Egressing
directly from R2, including via the Workers API, S3 API, and r2.dev domains does not incur data
transfer (egress) charges and is free"
([pricing](https://developers.cloudflare.com/r2/pricing/)).

**Cloudflare's CDN terms permit R2-hosted media and restrict everything else.** The Service-Specific
Terms say Cloudflare "reserves the right to disable or limit your access to or use of the CDN ... if
you use or are suspected of using the CDN without such Paid Services to serve video or a
disproportionate percentage of pictures, audio files, or other large files"
([terms](https://www.cloudflare.com/service-specific-terms-application-services/)), and the blog post
retiring old section 2.8 is explicit that "customers can serve video and other large files using the
CDN so long as that content is hosted by a Cloudflare service like Stream, Images, or R2", while
"video and large files hosted outside of Cloudflare will still be restricted on our CDN"
([blog](https://blog.cloudflare.com/updated-tos/)). So the plan of putting the free Cloudflare CDN in
front of Render and serving image bytes from the app process is against the terms. Putting the bytes
in R2 is the sanctioned path, and it is free.

**We are inside the free tier and will be for a long time.** R2's free tier is 10 GB-month of storage,
1 million Class A operations and 10 million Class B operations per month. 467 assets is well under a
gigabyte. The realistic monthly bill at current scale is zero.

**The CLI is in the right register.** `wrangler r2 bucket create`, `wrangler r2 bucket cors set
<bucket> --file cors.json`, `wrangler r2 object put`. That is the Neon and Render ergonomic: a real
CLI over a real API, no console clicking required to reproduce an environment. R2 also speaks the S3
API, so the adapter is standard, and MinIO is the local stand-in on the ports `architecture.md`
already reserves.

**Bunny is a genuine alternative and should be reconsidered if Cloudflare becomes a problem.** Storage
at $0.01/GB-month, CDN bandwidth at $0.01/GB in Europe and North America with a $1 monthly minimum,
free storage-to-CDN traffic, and Optimizer at a flat $9.50/month per zone for unlimited
transformations. It has no equivalent of Cloudflare's content restriction, and at large scale a flat
optimizer fee beats per-transformation billing. It loses here on two points only: bandwidth is priced
rather than free, and it is a vendor we do not already have a reason to be on.

What we could not verify: whether Cloudflare Images Transformations can read directly from an R2
binding inside a Worker, or whether it needs the object to be reachable at a URL first (the Workers
transform docs do not mention R2 as a source). This does not change the choice, since the custom
domain gives us a URL either way, but it may change how the variant path is wired.

## 6. Derived variants: transform at the edge, do not install sharp

The picker grid paints up to 48 tiles and the library grid paints one cover per card, all from
full-size originals. A 1 MB upload costs 1 MB per 200px tile. This is the single biggest perceived
performance problem in the product and it is worth fixing on its own merits.

**Recommendation: Cloudflare Images Transformations, from the media hostname, no stored variants.**

Cloudflare Images bills 5,000 unique transformations per month free, then $0.50 per 1,000 unique
transformations, where "unique" means a distinct image-plus-parameters pair, counted once per calendar
month, with cached transformations not re-billed
([pricing](https://developers.cloudflare.com/images/pricing/)). At 467 assets and two sizes that is
under a thousand uniques, which is free. Note this is the Transformations product, not "Images
Stored", which is $5 per 100,000 images stored and $1 per 100,000 delivered on paid plans only and is
not what we want: R2 is the store.

Against generating variants on write with `sharp`. The usual objection, that it is a native dependency
and nothing in `package.json` is native today, is weaker than it sounds and should not be the argument:
sharp has shipped prebuilt binaries since 0.33.0 (November 2023, current 0.35.4), its linux-x64 floor is
glibc 2.28, and Render's Debian 12 image is glibc 2.36, so it clears the bar. The `sharp@0.35.4`
registry manifest declares no `install` or `postinstall` script, so pnpm v10's default block on native
build scripts should not apply either, though there is a recent field report of that block biting sharp
(`vercel/next.js#83158`) that disagrees with the manifest, so it would need a smoke test on Render
rather than an assumption. The real arguments are these:

- Stored variants are derived data that has to be written, backfilled, garbage-collected alongside the
  original, and kept in sync. Edge transformation has none of that: there is nothing to backfill and
  nothing to collect.
- Adding a third size later is a query parameter at the edge, or a re-encode of every object on disk.
- Memory. libvips needs roughly 94 MB RSS for a 10,000 by 10,000 image, which is fine once and not fine
  several times at once on a 512 MB Render instance that also runs SSE generation streams, PDF export
  and font subsetting. Resizing on write would mean capping concurrency explicitly, which is a
  scheduling problem we do not currently have and would rather not acquire.
- The wasm alternatives do not rescue it. jSquash's own README says "there is limited support for
  Node.js environments ... the experimental Node.js support is provided for convenience and is not the
  primary focus of this project", and points at sharp for Node production use. The gap is structural
  rather than incidental: `liborc`, the SIMD code generator libvips uses for resize, does not compile
  to wasm.

Against edge transformation, honestly: the billing unit is unique transformations per month, so a
library of 100,000 assets all viewed monthly at two sizes would be 200,000 uniques, about $100/month.
Bunny's flat $9.50 would win at that point. That is a good problem to have and a reversible decision,
which is the main reason to define the contract as a URL shape rather than as a mechanism:

```
/api/media/asset/<id>            the original. What content stores. Never changes.
/api/media/asset/<id>?w=400      thumbnail. What the picker grid and library covers request.
/api/media/asset/<id>?w=1600     display. What the canvas requests.
```

Whether that resolves to an edge transform or to a stored variant is an implementation detail behind
one route, and switching later touches no caller. `toItem` returns the `?w=400` form as `thumbUrl`,
which is the field the picker already reads, and `meta.thumbUrl` stops holding a provider URL (see
section 1). Absence of a variant must degrade to the original rather than break, exactly as
`meta.thumbUrl ?? url` does today.

## 7. Storage accounting: count what the user contributed, not what we cache

`storageFull` (`services/core/media.ts:728`) sums `bytes` where `data IS NOT NULL`, and it gates AI
image and video generation with a 402. Today that means uploads and generations count, and adopted
stock does not, which is correct and is documented on the function.

If ingest sets `storage_key` on every row and the cap keeps asking "do we hold bytes", then adopting a
template's stock photos starts consuming the workspace's quota, and a Free workspace on 500 MB could
be pushed toward its cap purely because we changed where we keep a copy. Worse, the cap gates
generation, so a caching decision of ours would start refusing a customer's work.

**Recommendation: the cap counts `source IN ('upload', 'generated')`, regardless of where the bytes
live.** Not "do we hold bytes". This is the predicate that survives the migration with its meaning
intact, and it is what the entitlement's own description already claims: "Uploaded-media storage per
workspace" (`model/billing.ts:447`). The code would finally match the copy.

Two consequences to be honest about:

- Ingested stock is an uncapped cost to us. At R2's price it is invisible at this scale (a few
  gigabytes is a few cents a month) and it is bounded by the number of artifacts, not by traffic. If
  it ever stops being invisible, the lever is a per-workspace ingest ceiling, not the storage cap,
  because the two are measuring different things.
- `collectableAssets` (`services/core/media.ts:1280`) currently excludes adopted rows on the stated
  grounds that "they hold no bytes, so keeping them is free". After ingest that reasoning no longer
  holds, and the sweep becomes the thing that actually reclaims space. Its predicate has to be
  revisited in the same change, deliberately, because the cost of a wrong predicate there is
  someone's media.

## 8. Provider terms, per provider

This is the section that constrains the design, so it is stated in full with sources. All fetched
2026-08-31. **Re-check before building.**

| Provider  | May we hold and re-serve the bytes?                            | Obligations that come with it                                                         |
| --------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Unsplash  | **No by default.** An exception exists and must be asked for   | Attribution with utm params, download-trigger ping, 50/hr demo or 1,000/hr production |
| Pexels    | **Yes.** License permits download, modification, commercial    | A prominent link to Pexels on results; no bulk collection for AI training             |
| Pixabay   | **Yes, and required.** Permanent hotlinking is forbidden       | Show where results come from; cache API responses 24h; no systematic mass download    |
| Openverse | **Per work.** Governed by each work's CC licence               | Attribute the CC work; respect the hosting platform's terms; 200 requests/day anon    |
| Giphy     | **No**, absent prior written approval. Proxying also forbidden | "Powered By GIPHY" mark; no mixed-provider grids; 100/hr on a beta key                |
| picsum    | Not a rights source at all. Its images are Unsplash's          | None stated, and no promises either. See section 9                                    |

**Unsplash.** The API Guidelines state: "All API uses must use the hotlinked image URLs returned by
the API under the `photo.urls` properties. This applies to all uses of the image and not just search
results", and separately "When your application performs something similar to a download ... you must
send a request to the download endpoint returned under the `photo.links.download_location` property"
([guidelines](https://help.unsplash.com/en/articles/2511245-unsplash-api-guidelines), page dated
2026-07-27). The documentation repeats it: "we require the image URLs returned by the API to be
directly used or embedded in your applications (generally referred to as hotlinking)"
([docs](https://unsplash.com/documentation)). The API Terms make it a termination matter: "Failure to
do any of the foregoing in this Section 6 will constitute a material breach of these API Terms"
([terms](https://unsplash.com/api-terms)).

**There is an escape hatch, and it is worth using.** The hotlinking guideline ends: "For companies
that need to use their own image infrastructure to host the images, contact our API team for a
potential photo views beacon alternative"
([guideline](https://help.unsplash.com/api-guidelines/guideline-hotlinking-images)). Galleo is exactly
the fact pattern that describes: images are composed into decks, exported to PDF and PPTX, and served
to anonymous viewers of published pages, none of which the hotlink model handles well. The same page
also exempts derivatives: "If the image is remixed to create a derivative creative image, these
results do not need to be hotlinked, as they are no longer the exact source image." Do not over-read
that. A resized thumbnail is not a remix, and treating it as one would be an argument we would lose.

Two practical notes. The stated reason for the rule is view counting for photographers, not bandwidth:
"Image file requests (images.unsplash.com) do not count against your rate limit"
([docs](https://unsplash.com/documentation)), so hotlinking costs us nothing in quota and the beacon
alternative is a like-for-like swap from their side. And do not reason from `unsplash.com/license`,
which says attribution is not required: that is the licence granted to end users, while the API Terms
are the instrument that binds us as a developer, and they are stricter. The API is alive and open in
2026, with no Getty-related restriction anywhere on the developer pages. Galleo already meets the
download-trigger and utm-parameter guidelines (`fireDownloadTrigger`, `searchUnsplash`), so the
compliance gap is specifically about holding bytes.

**Pexels.** The Pexels License permits download, modification and commercial use, states that
attribution is not required, and forbids selling unaltered copies and redistributing "on other stock
photo or wallpaper platforms" ([license](https://www.pexels.com/license/)). The API documentation adds
"Whenever you are doing an API request make sure to show a prominent link to Pexels" and "You may not
copy or replicate core functionality of Pexels", with 200 requests per hour and 20,000 per month by
default ([docs](https://www.pexels.com/api/documentation/)). Note `pexels.com/api/terms/` returns 404;
the operative documents are the general Terms of Service, the documentation, and the help centre.

Nothing forbids storing the bytes, and the help centre is explicitly favourable to our shape of
product: "if your platform primarily serves a different purpose, you're absolutely welcome to use our
API to include a feature that allows your users to select a background, header or wallpaper image",
and "usually if the user is selecting their own image within a program, the attribution to Pexels and
the photographers only needs to be in the search flow, not the final output"
([help](https://help.pexels.com/hc/en-us/articles/4405588861721-Can-I-use-the-API-as-a-wallpaper-app)).
That settles the published-page case: the credit is owed in the picker.

Two limits to respect. Terms of Service section 8 forbids "bulk, large-scale or systematic copying of
Content" and using content "to replicate a similar or competing service". And there is an AI clause
that matters for an AI product: "you may not use the API to collect Pexels photos/videos or metadata
at scale to train, fine-tune, evaluate, or otherwise develop ML/AI models or datasets, unless you have
explicit permission from Pexels"
([help](https://help.pexels.com/hc/en-us/articles/900005880463-What-are-the-Terms-and-Conditions)).
Ingesting the specific images a user picked is neither of those; a sweep that pulls the catalogue, or
feeding stock into a model, is.

**Pixabay.** The opposite of Unsplash, and we are currently on the wrong side of it: "Returned image
URLs may be used for temporarily displaying search results. However, permanent hotlinking of images
(using Pixabay URLs in your app) is not allowed. If you intend to use the images, please download them
to your server first." Also "requests must be cached for 24 hours" and "systematic mass downloads are
not allowed", with 100 requests per 60 seconds ([docs](https://pixabay.com/api/docs/)). Storing a
Pixabay URL in `assets.origin` and serving it forever is exactly the permanent hotlinking that clause
forbids, so **ingest brings us into compliance here rather than out of it.**

**And it is a correctness fix, not only a compliance one.** The same page documents `webformatURL` as
"URL valid for 24 hours". A Pixabay URL stored as an `origin` and served a week later is not a policy
risk, it is a broken image, and it will have been breaking silently for as long as Pixabay has been in
the picker. Worth checking against production while re-measuring section 0. Separately, the
high-resolution fields (`largeImageURL`, `fullHDURL`, `imageURL`) are gated behind a "full API access"
approval, and `searchPixabay` reads `largeImageURL` today (`services/core/media.ts:210`), so confirm
the key actually has it.

**Openverse.** Openverse aggregates metadata about openly licensed works hosted by third parties. Its
terms put the obligation on us: comply with the terms applicable to the content, provide proper
attribution to CC-licensed works, respect the terms of the platforms hosting them, verify
independently that we have the right to use the content, and do not scrape the catalog
([terms](https://docs.openverse.org/terms_of_service.html)). There is no Openverse CDN to hotlink: a
result's `url` points at the original host (Flickr, Wikimedia), and the only Openverse-hosted asset is
a compressed `/thumb/` proxy. So self-hosting is more reliable here than hotlinking, not less.

Galleo already filters to `license_type=commercial,modification`, which excludes the NC and ND
variants and leaves CC0, CC BY, CC BY-SA and public domain, all of which permit reproduction with
attribution. That filter is load-bearing for a commercial product and must not be relaxed. The API
also returns a ready-made per-work `attribution` string, which we do not currently persist and should:
CC BY requires attribution of whoever redistributes, and after ingest that is us. Published pages
render `MediaCredits` (`publish/PublicView.tsx:276`), so the surface exists.

Two operational notes. Anonymous requests are limited to 20 per minute and 200 per day (read from live
response headers; the docs do not state numbers), and Galleo uses Openverse keyless
(`services/core/media.ts:35`), so we are on the 200/day tier. That is low enough to be a real
constraint on both search and any ingest sweep, and registering for a token is the fix. Openverse also
"reserves the right to charge fees for commercial uses", which is a live commercial risk worth knowing
about.

**Giphy.** The strictest of the six, and both halves are explicit. From the docs' Prohibited
Integration Practices: "Do not cache media URLs or copies of GIPHY media assets unless your
integration has been explicitly approved by GIPHY for media caching and follows GIPHY's required cache
revalidation implementation", and "Do not proxy requests to GIPHY, either API calls or media URL
loads. All requests to GIPHY should be made directly from the client side." The dedicated caching
section adds that an approved partner cache "requires prior written approval from GIPHY" and must
implement their revalidation pattern, the stated reason being moderation: so that "removed, expired,
or restricted content is not served to end users"
([docs](https://developers.giphy.com/docs/api/)).

The API Terms of Service go further than caching: "You shall not use content you obtain through
Giphy's products and services to create a database, directory, or index containing GIFs or digital
stickers", which an `assets` table full of Giphy rows arguably is
([terms](https://support.giphy.com/hc/en-us/articles/360028134111-GIPHY-API-Terms-of-Service),
retrieved through the Zendesk content API; the HTML page 403s to automated clients).

Three obligations here are integration-shaped rather than storage-shaped and are easy to miss when
thinking about bytes:

- "We require all apps that use the GIPHY API to conspicuously display 'Powered By GIPHY' attribution
  marks where the API is utilized." Galleo does not display this anywhere. That is an existing gap,
  independent of this plan.
- "Do not mix GIPHY's content with content from other providers in the same grid." Galleo's picker
  queries one provider per request (`GET /media/search?provider=`), so results are not blended today,
  but `KIND_PROVIDERS` lists `giphy` and `openverse` together for GIFs and stickers and a future
  "search everything" tab would breach this.
- "Do not strip or modify URLs returned by the API. In particular, do not remove or modify query
  params in our media URLs." The redirect path preserves `origin` verbatim, so this holds.

Giphy is used for GIFs and stickers, the least load-bearing imagery in the product, so hotlinking it
is the cheapest of the exceptions to accept.

**What this means for the design.** The goal as stated ("serve and cache all media from our own
infrastructure") is not reachable today while Unsplash and Giphy are in the picker. The design
accommodates that with a per-provider policy rather than pretending otherwise. Section 13 records the
decision that is actually open, and it now has three options rather than two, because Unsplash
publishes a route to an exception and we have not asked.

## 9. picsum, and why ingest alone does not fix it

406 of 467 production assets point at a service with no SLA. Ingesting them would make the existing
ones safe, but it would not stop new ones appearing, because picsum is minted in four separate places:

1. **Template bodies.** ~~`services/core/templates.ts` calls `pic(id)` 688 times across 276 distinct
   picsum ids.~~ **Closed on 2026-08-31.** `pic()` now reads a `PHOTOS` map of 276 Pexels URLs, one
   per former picsum id, so an id is still the same photograph everywhere it appears, and applies the
   call site's width and height as crop parameters. Pexels rather than Unsplash because its licence
   lets us hold the bytes when template imagery moves to our own storage (section 13) and it asks for
   no visible credit. Every template use still adopts these URLs into the using workspace, which is
   where the 406 came from, so the adoption path is unchanged; what changed is that the origin it
   records now points at a service with terms we can rely on.
2. **The AI image fallback.** `services/core/ai/images.ts:51` and `:165`: when stock search finds
   nothing for a phrase, generation writes a picsum URL and warns.
3. **The authoring DSL.** `model/authoring.ts:51` and `:205`: `img()` and `bgImage()` build a picsum
   URL from a seed when given a slug rather than a URL. **Partly closed on 2026-08-31.** The 14 seed
   call sites in the template bodies now pass real texture URLs, so nothing the Templates gallery
   renders goes through the fallback. The fallback itself is still there, and 90 seeds still reach it
   from the AI eval corpus (81), the theme demo, `services/core/designs.ts`, and two test fixtures.
   Those render blank today, which is a live quality problem for `pnpm eval:shots`.
4. **The marketing site.** `website/WebsitePage.tsx:578` and `:780` hotlink picsum directly, outside
   the asset system entirely. Two `<img>` tags, and the second one is the face in the demo login.

Ingest handles (2) after the fact and does nothing about the rate at which they are created.
There is also an ordering trap: for the 406 existing rows, ingest can only work while picsum is up,
and picsum was answering 503 and 522 throughout the day this was written.

**And ingesting them would be the wrong thing anyway, because picsum is not a rights source.** Its own
homepage footer reads "Images from Unsplash", and the `/v2/list` records carry an `unsplash.com` URL
per image. So the 406 rows are Unsplash photographs redistributed by an unaffiliated hobby project,
which means holding their bytes inherits the Unsplash constraint from section 8 without any of the
compensating relationship: no API terms, no attribution data, no download beacon, no one to ask. The
MIT licence on the picsum repository covers the server software, not the photographs. The correct
move for these rows is to replace them, not to cache them.

The real fix is that template imagery should not name a third-party placeholder host at all. **The
repo has already made this exact decision once, for fonts.** `scripts/fonts-vendor.ts` vendors every
face a theme can name into `public/fonts` (5.3 MB, committed) with the reasoning: "a build-time fetch
would mean pulling hundreds of files from Google on every deploy, which is the flaky network path this
removes". Template imagery is the same argument with the same failure mode, and it just failed.

276 distinct images at roughly 200 KB each is 40 to 70 MB, which is too much to commit the way fonts
were. The natural home is a set of Galleo-owned objects at stable keys in the same R2 bucket, seeded
once by a script, with `pic(id)` emitting a URL on `media.galleo.app`. Adoption then behaves normally,
ingest copies into the workspace's own object, and the picture works from the first paint whether or
not ingest has run. That is a real piece of work and it belongs partly to the template catalog rather
than to this plan, so it is listed as a dependency rather than folded in.

`scripts/repicsum.ts` (written during the outage, uncommitted at the time of writing) repoints picsum
assets to real stock matched by intent, since the originals cannot be fetched to match by pixels. That
is the right immediate move for the existing rows and is independent of everything above.

## 10. Migration

Nothing rewrites artifact content, and no published link changes. That is what the asset invariant
bought, and it is the reason this is mechanically small.

1. **Additive schema.** `storage_key text`, plus a partial index on the ingest sweep's predicate
   (`origin IS NOT NULL AND storage_key IS NULL`). Keep `data` and both check constraints untouched.
2. **Adapter and bucket.** The storage module, `wrangler r2 bucket create`, a CORS policy set from a
   committed `cors.json`, the custom domain, and a Cache Rule (see section 11).
3. **Write path.** `storeBytes` writes the object and records `storage_key`; `refImage` reads bytes
   back through the adapter; `ownedElsewhere` becomes a server-side object copy rather than a
   base64 round trip through Node.
4. **Read path.** The route gains the branch table from section 4.4. Ship this with the per-provider
   policy already in place, so the Unsplash and Giphy behaviour never changes.
5. **Backfill, in two passes.** First the three rows that already hold bytes (trivial). Then the
   ingest sweep over ingestable origins: Pixabay, Pexels, Openverse, and whatever picsum rows survive
   `repicsum.ts`. Dry by default, `--write` to act, idempotent, resumable, and it must tolerate a dead
   origin without poisoning the row.
6. **Variants.** Turn on Transformations, change `toItem` to return the `?w=400` form, stop writing
   provider URLs into `meta.thumbUrl`, and stop reading them in the picker.
7. **Drop `data`.** A later migration, after the backfill is verified, that nulls and drops the column
   and moves the two check constraints onto `storage_key`. Note `hosting.md`'s migration-window
   warning: `db:migrate` finishes before cutover, so for about a minute the old code runs against the
   new schema. Constraint changes here need the same two-deploy treatment.
8. **Deletion.** `deleteAsset` and `pnpm media:collect` delete the object as well as the row, and the
   collect script gains a mode that finds objects with no matching row.

**Local and CI must work with no object store configured.** `pnpm test:int` and the Playwright suite
run without credentials, and `e2e/fixtures.ts` currently intercepts provider hosts on the assumption
that the asset route redirects to them. So the adapter needs a filesystem or in-memory mode selected
by absent configuration, following the existing convention that an unset key means the feature is off
rather than broken.

**The 406 picsum assets specifically**: `repicsum.ts` first, then ingest whatever remains, then fix
the four minting sites from section 9 so the count stops growing. In that order, because ingesting
them first spends bandwidth and storage on placeholder images we intend to replace anyway.

## 11. What must not change, and what will silently break

- **The reference form.** `/api/media/asset/:id` keeps resolving for every id ever handed out. Content,
  exports, published pages and thumbnails all depend on it.
- **The invariant.** Content holds asset references and nothing else. If a change here tempts you to
  put `media.galleo.app` into element data, that is the thing the invariant exists to prevent.
- **Public readability.** The route is deliberately unauthenticated so `<img>`, canvas and export load
  credential-less. A public bucket behind a custom domain matches that decision. A signed URL would
  keep a future private-media option open at the cost of uncacheable URLs, and it is not worth it now.

Three things fail quietly rather than loudly, so they need deliberate checks:

- **Export CORS.** `loadImages` sets `crossOrigin = "anonymous"` and silently drops any image that
  fails the check (`canvas/render/backends.ts:806`), so a regression looks like a slightly emptier PDF,
  not an error. Cross-origin media is new here, and R2 does not send CORS headers by default. R2 does
  support a CORS policy, set with `wrangler r2 bucket cors set`, and "custom domains connected to an
  R2 bucket with a CORS policy automatically return CORS response headers for cross-origin requests",
  with the caveat that "any existing cached assets will not reflect the CORS response headers until
  they are refreshed in cache"
  ([docs](https://developers.cloudflare.com/r2/buckets/cors/)). Set the policy before the first
  object is served, not after. A related trap if a custom video player is ever built: `Range` is a
  CORS-safelisted request header and needs no preflight, but `Content-Range` and `Accept-Ranges` are
  not safelisted response headers, so a player that reads them needs
  `Access-Control-Expose-Headers: Content-Range, Accept-Ranges`. A plain `<video src>` works with just
  the allow-origin header, which is what the product uses today.
- **Cloudflare will not cache what it does not recognise.** Cloudflare's CDN caches by file extension
  by default and does not cache HTML or JSON
  ([docs](https://developers.cloudflare.com/cache/concepts/default-cache-behavior/)), and the R2
  public-bucket docs repeat that "by default, only certain file types are cached". Object keys that
  are bare uuids have no extension, so **without an explicit Cache Rule nothing caches and the CDN
  appears to do nothing.** Either give the key an extension or write the rule, and verify with a
  cache-status header on the second request. This is the most likely reason someone concludes "the CDN
  is not working".
- **The r2.dev subdomain is not for this.** It is "rate-limited and should only be used for
  development purposes"; a custom domain is what gets caching, WAF and access control
  ([docs](https://developers.cloudflare.com/r2/buckets/public-buckets/)).

## 12. Verification

Per stage, and none of it is optional:

- **Export.** Load an asset in a real browser, draw it to a canvas, call `toDataURL`, confirm the
  canvas is not tainted. This is the single likeliest thing to break and the only one that fails
  silently.
- **Published pages.** Images load for a signed-out visitor in a fresh browser profile.
- **Present, minimap, library covers.** All paint from the same URLs.
- **Cache behaviour.** Second load of a published page shows an edge hit. If it does not, read the
  Cache Rule note in section 11 before anything else.
- **Range requests.** A stored clip seeks without refetching from byte zero. Cloudflare serves ranges
  from cache, and compression is what breaks that, but Cloudflare does not compress `video/*` by
  default, so this should only bite if someone adds a Compression Rule that catches video.
- **Provider outage drill.** Point the ingestable provider hosts at a black hole in `/etc/hosts` and
  confirm the product is completely unaffected. That drill is the whole point of this plan and it
  should be run before calling it done.
- **The suites.** Unit and integration, plus every `pnpm check:*` guard.

**Instrumentation.** `model/analytics.ts` has `media_searched`, `media_inserted` and
`media_upload_failed`, and nothing about serving or ingest. Per the repo rule that new functionality
gets an event, add ingest outcome (provider, ok or failed, reason, duration bucket) at the one seam
every ingest funnels through, so a provider quietly refusing us is visible without an audit. No URLs
and no content in the properties, per the capture policy.

## 13. Decisions, settled 2026-08-31

The table below is the record of what was decided and why. The forcing fact arrived after this doc
was first written: the picsum recuration (`scripts/recurate.ts`) moved imagery onto Unsplash for
quality, and Unsplash is the one provider we may not cache. Local finished at 327 Unsplash, 106
Pexels, 9 other, so a straight ingest would leave three quarters of the library hotlinked and the
outage this plan exists to prevent would still take most of it out.

The resolution is to decide by **role**, not by provider:

| Role                                | Where the bytes come from                                    | Why                                                                                                                                                         |
| ----------------------------------- | ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Template, seed and demo imagery** | Galleo-owned objects at stable R2 keys                       | This is what makes the product look broken when a provider dies, and it is the one class we can own outright. No provider, no terms, no outage.             |
| **AI-sourced imagery**              | Ingestable providers first (Pexels, then Pixabay, Openverse) | A generated deck should still render in a year. `PROVIDER_ORDER` in `services/core/ai/images.ts` currently leads with Unsplash and should lead with Pexels. |
| **User-picked from the picker**     | Whatever they picked; ingested where terms allow             | An explicit choice is theirs to make. Unsplash stays hotlinked and carries its provider's uptime, which is a risk the user opted into.                      |

| Decision                   | Settled                                                    | Note                                                                                                                                                                              |
| -------------------------- | ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Unsplash**               | Ask for the views-beacon exception; hotlink until answered | Their guideline invites our exact case and it costs an email. Not a blocker: the role split above means a refusal degrades quality of ownership, not availability of the library. |
| **Giphy**                  | Keep hotlinked                                             | GIFs are the least load-bearing imagery here and the exception is not worth chasing.                                                                                              |
| **Variants**               | Cloudflare Images Transformations at the edge              | Keeps `sharp` and its libvips memory off a 512 MB instance. The `?w=` URL contract keeps it reversible.                                                                           |
| **Template imagery**       | Galleo-owned objects, stable keys                          | Promoted from "bigger than this plan" to the centre of it. It is the only thing that stops the picsum count growing and the only imagery we fully control.                        |
| **The remaining redirect** | Live with it                                               | `immutable`, cached a year, carries no bytes, points at our own infrastructure.                                                                                                   |
| **Object URL**             | Public bucket behind the custom domain                     | Matches the route's existing public-by-opaque-uuid decision; signed URLs are uncacheable, which defeats the purpose.                                                              |
| **Link-source ingest**     | Allowlisted provider hosts only                            | Ingesting arbitrary pasted URLs is an SSRF and copyright surface we do not have today.                                                                                            |
| **Video**                  | R2 plus range requests, not Stream                         | Enough for 8-second Veo clips. Revisit if users upload long video.                                                                                                                |

## 14. Execution checklist

- [ ] P0 Re-verify section 0: provider terms, vendor pricing, production numbers, whether
      `repicsum.ts` has run. Update this doc where it has drifted.
- [ ] P0 Email the Unsplash API team asking for the photo-views-beacon alternative named in their
      hotlinking guideline. It costs one message, the answer takes weeks rather than days, and it is
      the only path that lets the rule in section 3 hold without exceptions. Start it before writing
      any code, then decide the Giphy question, which has no equivalent route.
- [ ] P1 Per-provider ingest policy table in `services/core/media.ts`, with terms URL and check date.
      No behaviour change yet, but it is the thing the rest reads from.
- [ ] P1 Stop the picker hotlinking providers: `meta.thumbUrl` stops holding a provider URL, `toItem`
      returns our own form, `MediaPicker` drops the provider fallback.
- [ ] P2 R2 bucket, CORS policy, `media.galleo.app` custom domain, Cache Rule, verified edge hit.
      `galleo.app` stays DNS-only.
- [ ] P2 Storage adapter (`put`, `get`, `copy`, `delete`), S3 API, MinIO locally, no-config local mode
      for tests and CI.
- [ ] P2 `storage_key` column plus the sweep's partial index. Additive only.
- [ ] P3 Ingest: post-commit pool, read-through on the route, the SSRF-safe fetcher, the sweep script,
      the analytics event.
- [ ] P3 Route branch table from section 4.4, including the hotlink-only path.
- [ ] P3 Storage accounting moves to `source IN ('upload','generated')`; revisit the collect predicate
      in the same change.
- [ ] P4 Variants: Transformations on, `?w=` contract, `toItem` returning a real `thumbUrl`.
- [ ] P4 Backfill, verify, then the migration that drops `data` and moves the two check constraints.
      Two deploys if the migration window matters.
- [ ] P4 Delete paths cover the object; `media:collect` gains an orphaned-object mode.
- [ ] P5 The four picsum minting sites (section 9), which is the only thing that stops the count
      growing.
- [ ] Gates at each stage: typecheck, lint, every `pnpm check:*`, unit and integration, the export
      CORS check, and the provider-outage drill from section 12.
