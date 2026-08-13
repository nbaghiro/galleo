# Build: Object storage for source files (R2 + MinIO)

## Shared context

You're working in **Galleo** — a TypeScript AI content tool where one engine renders the same block
tree as a **deck, document, or website**. Read `.docs/architecture.md` and `AGENTS.md` before
starting; `.docs/ai.md` §10.5 covers the context system this feature serves.

**Layering law (ESLint-enforced):** `model ← canvas ← ui ← editor ← app`; `services` imports only
`model`. Inside services: `api → core → db → utils`; **`utils/` may not import `db/`** (that is what
keeps it unit-testable) and **`core/` may not import hono**. No `index.ts` barrels. No suppressions
of any kind (`eslint-disable` is inert and fails the build). Comments terse, only for what code
can't say.

**Style:** 4-space indent, double quotes, semicolons, `printWidth` 100, no `any`, no `console`
(backend output goes through `services/utils/env.ts` `out`/`warn`).

**Run/verify:** `pnpm dev` (SPA :8600, `/api/*` dev-proxied to the backend on :8601), Postgres in
docker (`docker compose up -d`, pgvector image). Schema: `services/db/schema.ts` with **generated
migration files** — `pnpm db:generate` then `pnpm db:migrate`. Seed login: `demo@galleo.app` /
`galleo-demo-2026` (`pnpm seed`). Gates before done: `pnpm typecheck · lint · test · test:int ·
build · check:suppressions · check:program · check:boundaries · check:models`.

> **Migrations are immutable once deployed.** Prod (Render, deploy runs `pnpm db:migrate`) tracks
> applied migrations by content hash. Never rename, edit, or squash a migration that has reached
> prod — it re-runs and fails the deploy. Only ever append new files.

**Testing contract** (`.docs/testing.md`): fake only true external oracles, run everything else
real. The context system's precedent is the `Embedder` seam — every core function takes
`embed: Embedder = embedTexts` as a trailing param so integration tests run real Postgres SQL with
a deterministic fake instead of a paid API. **This feature must introduce the same kind of seam
for the object store.**

## What exists today (verify each against the code before building — the repo moves fast)

The context library ingests files: text is extracted server-side (`services/core/extract.ts` over
`services/utils/extract.ts`), chunked + embedded into pgvector (`services/core/context.ts`). For
server-extracted binaries (pdf / docx / xlsx / images), the **original bytes are kept so the
inspector can render the real file** (browser PDF viewer in an iframe, `<img>` for images):

- **Storage:** base64 text columns `context_items.original` + `context_items.original_mime`
  (`services/db/schema.ts`). Written by `insertItem` via the `original?: OriginalFile` trailing
  param on `addTextItem` (`services/core/context.ts`).
- **Serving:** `GET /api/contexts/:id/items/:itemId/original` (`services/api/context.ts`) →
  `getItemOriginal` (workspace-scoped) → decodes base64, streams with `Content-Type` +
  `Cache-Control: private`. 404 when no original is stored.
- **Client:** `readAttachment` (`app/views/generate/context.ts`) keeps the base64 it produced for
  `POST /api/extract` and passes it as `original: { data, mime }` when the contexts pane attaches
  the item (`POST /contexts/:id/items`, capped by hono `bodyLimit` 32 MB). The inspector
  (`app/views/generate/ContextsPane.tsx`, `fetchSnapshot` → the `pdf` / `image` snapshot views)
  points an iframe / `<img>` at the endpoint; `item.original: boolean` on `ContextItemMeta` says
  whether bytes exist.
- **Caps:** 15 MB documents / 8 MB images (`services/utils/extract.ts`), enforced server-side in
  `services/core/extract.ts` and pre-checked client-side.
- **The same pattern elsewhere:** the media library stores uploaded images as base64 in
  `assets.data`, served at `GET /media/asset/:id` (`services/core/media.ts` `storeUpload`,
  `services/api/media.ts`). The plan's storage cap sums `assets.bytes` (`storageFull`).
- **Dev server quirk already fixed, don't regress it:** the SPA fallback in `vite.config.ts`
  excludes `/api/` — iframes send `Accept: text/html`, and without the exclusion the PDF iframe
  renders the app shell instead of the file.

This works and is the deliberate simple choice at today's scale. The job now is to move the bytes
to S3-compatible object storage **without changing any API shape or client behavior**: the
serving endpoint is the seam.

## Goal

1. Original context-item files live in object storage — **Cloudflare R2** in prod, **MinIO** in
   dev (host ports **8604** S3 API / **8605** console; the ports table in `architecture.md`
   reserves exactly these — flip them from `reserved` to `active` when you wire them).
2. The serving endpoint keeps its URL and auth, and becomes: workspace check → **302 redirect to a
   short-lived presigned GET** (~5 min). URL fragments (`#toolbar=0…`) survive redirects, so the
   PDF viewer params keep working.
3. **Graceful degradation:** with no object-store env configured, behavior is exactly today's
   (base64 in the DB). A fresh clone must work without MinIO running.
4. **Dual-read migration:** new uploads write to the store; reads prefer the store and fall back
   to the legacy DB column; a backfill command moves old rows; a **later, separate** migration
   drops the columns only after prod backfill is verified.

## Design decisions (already made — implement, don't relitigate)

- **HTTP client: `aws4fetch`** (tiny SigV4 signer over global fetch; works with R2 and MinIO).
  The repo prizes dependency minimalism — do not pull `@aws-sdk/client-s3`'s tree for four verbs.
  If `aws4fetch` proves genuinely unfit for streaming puts of ≤20 MB bodies, document why and fall
  back to the SDK.
- **`services/utils/objectstore.ts`** (db-free, network via fetch only):
    - env: `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_REGION`
      (`auto` for R2). `objectStoreReady(): boolean` mirrors `providerReady`.
    - `putObject(key, bytes, mime)`, `deleteObject(key)`, `presignGet(key, ttlSeconds)`, and a
      narrow `getObject` (backfill verification). Path-style URLs for MinIO compatibility.
- **The injectable seam:** define `ObjectStore` (the four functions) in the utils module; core
  functions that touch originals take `store: ObjectStore = realStore` as a trailing param, the
  `Embedder` pattern exactly. Integration tests use an in-memory Map-backed fake — the S3 API is
  the external oracle; everything else runs real.
- **Keys:** `contexts/{workspaceId}/{itemId}` — the workspace prefix makes per-workspace purge and
  lifecycle rules possible later. No extension in the key; mime lives in metadata/column.
- **Schema:** append a migration adding `context_items.original_key text`. Keep the existing
  `original` column for dual-read; **do not** drop it in this pass.
- **Write path** (`insertItem`): insert the row, then `putObject`; on success store `original_key`
  and null `original`; on put failure, warn and fall back to writing the base64 column (the user's
  upload must never fail because the bucket hiccuped).
- **Read path** (`getItemOriginal` / the route): `original_key` present → presign + 302;
  else legacy `original` column → stream as today; else 404. `ContextItemMeta.original` becomes
  `(original_key is not null or original is not null)`.
- **Deletes:** `removeItem` and `deleteContext` best-effort `deleteObject` the keys (collect keys
  before deleting rows). A failed object delete must not fail the user's action — warn and move on
  (orphans are acceptable; a lifecycle rule can sweep them).
- **docker-compose:** add `minio` (image `minio/minio`, `server /data --console-address :9001`,
  ports 8604:9000 / 8605:9001, credentials `galleo`/`galleo-minio`) plus a one-shot `mc` service
  that creates the bucket. Document the dev `.env` block in the compose comments and in
  `architecture.md`'s ports table.
- **Phase 2 (do only if phase 1 lands clean, same rules):** migrate `assets.data` the same way —
  keys `media/{workspaceId}/{assetId}`, same dual-read on `GET /media/asset/:id`. Keep
  `assets.bytes` authoritative for the storage cap; the cap's meaning doesn't change.
- **Explicitly out of scope:** presigned direct-from-browser uploads (would change request shapes
  and the extract flow), CDN domains, R2 lifecycle configuration.

## Backfill + rollout runbook (write this into the PR description too)

1. Land code with dual-read + env-gated writes. Without env vars, nothing changes anywhere.
2. Dev: `docker compose up -d`, set the S3 env block in `.env`, verify: upload a PDF → row has
   `original_key`, no base64; inspector iframe follows the 302 and renders; kill MinIO → legacy
   items still render (dual-read), new uploads fall back to DB with a warning.
3. Backfill entry point `services/db/backfill-originals.ts` (register as `pnpm backfill:originals`
   in package.json — entry points are the layering exemption, like `seed.ts`): batches rows where
   `original is not null`, puts each object, verifies with a ranged get, sets `original_key`,
   nulls `original`. Idempotent; safe to re-run; prints a summary via `out()`.
4. Prod: user creates the R2 bucket + API token and sets env on Render (the agent cannot do this —
   stop and ask). Deploy, run the backfill via a Render shell, verify a legacy item serves via
   redirect.
5. **Later, separate change:** migration dropping `original` (keep `original_mime` — the presign
   response type still needs it unless you store mime as object metadata and read it back; pick
   one and be consistent). Only after prod backfill is confirmed.

## Tests

- `services/utils/__tests__/objectstore.test.ts`: key building, env gating, presign URL shape —
  with an injected fake fetch capturing requests (assert SigV4 headers exist, not their values).
- Extend `services/core/__tests__/context.itest.ts` (or the extract itest, wherever originals are
  covered — find the existing original round-trip test and grow it): with a Map-backed fake
  `ObjectStore` — new item writes key not blob; route 302s to the fake's presigned URL; legacy
  blob row still streams (dual-read); removeItem deletes the key.
- Do not write tests that silently skip when MinIO is absent — a test that can lie about coverage
  is worse than none. Real-MinIO verification is the manual checklist above.

## Done means

All gates green (`typecheck · lint · test · test:int · build · check:suppressions ·
check:program · check:boundaries`), docs updated (`architecture.md` data-model + ports table,
`ai.md` §10.5 "keeps the original bytes" sentence now naming object storage with DB fallback),
the dev checklist in the runbook performed and true, and a single focused commit per repo
convention (single-line imperative, no co-author). If another session is active in the same
working tree, coordinate before staging — the index is shared.
