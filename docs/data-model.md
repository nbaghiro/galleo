# Galleo — Data Model (design, LOCKED)

> Status: **Decision locked (2026-06-24).** Engine = **PostgreSQL + JSONB** (relational integrity for
> everything; the flexible content tree lives in `JSONB`). Binaries (images/video/fonts) in **object
> storage (S3/R2)** — tables hold metadata only. Companion to `docs/element-system.md` (content
> shape) and `docs/text-element.md`.

---

## 1. Why PG + JSONB

Only the **content tree** (sections → cells → elements) is schema-flexible — and `JSONB` handles it
natively (GIN-indexable, FTS-searchable). Everything else (auth, sharing, billing, analytics) is
relational and wants foreign keys + transactions. One database does both → lowest ops burden.
Sections/cells/elements are **never their own tables**; they're embedded in the artifact's content JSON.

## 2. Conventions

- `snake_case`, **plural**, lowercase. Parent-owned tables use a **`parent_*` prefix** where it adds
  clarity (`members`, `versions`); short names kept where unambiguous (`shares`,
  `comments`).
- Every **workspace-scoped** table carries `workspace_id` → enables Postgres **Row-Level Security**
  for multi-tenancy.
- Standard columns on most tables: `id (uuid pk)`, `created_at`, `updated_at`. Omitted below for brevity.
- ⭐ = v1-core (the ~11 tables that ship the create → edit → share → publish loop).

---

## 3. The 29 tables (final, by domain)

### Domain 1 · Identity & tenancy

| ⭐  | Table          | Purpose                                | Key columns                                    |
| --- | -------------- | -------------------------------------- | ---------------------------------------------- |
| ⭐  | **users**      | a person / login                       | `email, name, avatar_url`                      |
| ⭐  | **workspaces** | the tenant that owns content + billing | `name, slug, owner_id→users, plan_id→plans`    |
| ⭐  | **members**    | user ↔ workspace + role (join)         | `workspace_id, user_id, role`                  |
|     | **invites**    | pending seat invitations               | `workspace_id, email, role, token, expires_at` |
|     | **api_keys**   | programmatic access                    | `workspace_id, hash, scopes, last_used_at`     |

### Domain 2 · Content

| ⭐  | Table          | Purpose                                               | Key columns                                                                                                                                    |
| --- | -------------- | ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| ⭐  | **artifacts**  | top-level deck/doc/site (metadata + working draft)    | `workspace_id, folder_id, title, format_id→formats, theme_id→themes, draft_content (jsonb), published_version_id→versions, status, created_by` |
| ⭐  | **versions**   | immutable content-tree snapshots (history/published)  | `artifact_id, content (jsonb), label, author_id, created_at`                                                                                   |
|     | **updates**    | live-collab CRDT (Yjs) update log (ships w/ collab)   | `artifact_id, update (bytea), seq`                                                                                                             |
| ⭐  | **folders**    | organize artifacts (tree)                             | `workspace_id, parent_id, name`                                                                                                                |
| ⭐  | **themes**     | theme library (built-in + custom)                     | `workspace_id (null=system), name, tokens (jsonb), mood, is_dark`                                                                              |
|     | **components** | saved/shareable element & section presets             | `workspace_id, kind, data (jsonb), thumbnail_asset_id, linked`                                                                                 |
|     | **templates**  | starter artifacts                                     | `workspace_id (null=system), content (jsonb), category`                                                                                        |
|     | **brand_kits** | logo + colors + fonts per workspace                   | `workspace_id, name, colors (jsonb), fonts (jsonb), logo_asset_id`                                                                             |
|     | **formats**    | Format Descriptors (deck/doc/web + custom sizes)      | `workspace_id (null=system), name, kind, width, height, resize, paginate`                                                                      |
|     | **fonts**      | uploaded/custom fonts (self-hosted for export parity) | `workspace_id, family, files (jsonb)`                                                                                                          |

### Domain 3 · Assets

| ⭐  | Table      | Purpose                                                               | Key columns                                                                             |
| --- | ---------- | --------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| ⭐  | **assets** | uploaded **& AI-generated** media metadata (binary in object storage) | `workspace_id, kind, source (upload\|ai), url, width, height, bytes, alt, meta (jsonb)` |

> **AI generation is not its own table in v1.** The old image-only `generations` was dropped as
> premature. v1 captures AI work across existing tables: async runs → `jobs`, agent turns + applied
> changes → `messages`, cost/usage → `credits`, and AI images → `assets` (`source='ai'` + prompt/model
> in `meta`). **Future (deferred): a unified AI-event log** — `generations` (or `ai_runs`):
> `{workspace_id, user_id, kind (artifact|image|element|edit|summary…), model, input (jsonb),
target_type, target_id, output (jsonb), tokens, cost, status, job_id→jobs}` — added when AI becomes
> a bigger surface (analytics · "my generations" · regenerate · model eval).

### Domain 4 · Sharing & publishing

| ⭐  | Table       | Purpose                              | Key columns                                                              |
| --- | ----------- | ------------------------------------ | ------------------------------------------------------------------------ |
| ⭐  | **shares**  | who can view/edit an artifact (ACL)  | `artifact_id, subject_type, subject_id, role`                            |
| ⭐  | **links**   | public/published link or hosted site | `artifact_id, slug, visibility, password, published_version_id→versions` |
|     | **domains** | custom domains on published sites    | `workspace_id, host, verified_at, link_id→links`                         |

### Domain 5 · Collaboration & activity

| ⭐  | Table             | Purpose                                       | Key columns                                                         |
| --- | ----------------- | --------------------------------------------- | ------------------------------------------------------------------- |
|     | **comments**      | threaded comments anchored to an element/cell | `artifact_id, anchor (jsonb), body, author_id, parent_id, resolved` |
|     | **activity**      | activity / audit feed (who did what)          | `workspace_id, actor_id, verb, target_type, target_id`              |
|     | **notifications** | per-user notices                              | `user_id, type, payload (jsonb), read_at`                           |

### Domain 6 · AI agent

| ⭐  | Table        | Purpose                              | Key columns                                                 |
| --- | ------------ | ------------------------------------ | ----------------------------------------------------------- |
|     | **chats**    | the Galleo-agent thread per artifact | `artifact_id, created_by`                                   |
|     | **messages** | agent/user turns + applied changes   | `chat_id, role, content, actions (jsonb)`                   |
|     | **jobs**     | long-running generation/export jobs  | `workspace_id, type, status, input (jsonb), result (jsonb)` |

### Domain 7 · Engagement

| ⭐  | Table         | Purpose                                      | Key columns                                        |
| --- | ------------- | -------------------------------------------- | -------------------------------------------------- |
|     | **views**     | view analytics on shared/published artifacts | `link_id, viewer, started_at, slide_stats (jsonb)` |
|     | **reactions** | emoji reactions on shared content            | `artifact_id, anchor (jsonb), user, emoji`         |

### Domain 8 · Billing & usage

| ⭐  | Table             | Purpose                                  | Key columns                                           |
| --- | ----------------- | ---------------------------------------- | ----------------------------------------------------- |
|     | **plans**         | plan catalog (Free/Plus/Pro/Ultra)       | `name, price, limits (jsonb)`                         |
|     | **subscriptions** | workspace's active plan (mirrors Stripe) | `workspace_id, plan_id, status, stripe_id, renews_at` |
| ⭐  | **credits**       | AI-credit ledger (Gamma-style)           | `workspace_id, delta, reason, balance_after`          |

---

## 4. The content JSON (in `artifacts.draft_content` / `versions.content`)

The whole tree in one `JSONB` document — elements stay schema-flexible (see `element-system.md`):

```jsonc
{
  "format": "deck-16-10",      // → formats.id (or inline descriptor)
  "theme":  "studio",          // → themes.id
  "sections": [
    { "id":"s1", "grid":"split-6040",
      "cells": {
        "left":  { "element": { "type":"heading", "data": { "paras":[…], "style":"h1" } } },
        "right": { "element": { "type":"image",   "data": { "src":"asset:abc123", "aspect":0.8 } } }
      }
    }
  ]
}
```

- **Asset references** use a stable id (`asset:abc123` → `assets.id`), never the raw URL, so re-hosting
  doesn't break documents.
- **Live editing** writes `artifacts.draft_content`; **publishing / "save version"** copies it into an
  immutable `versions` row; `links.published_version_id` / `artifacts.published_version_id`
  point at what the public sees. With collab on, the draft is reconstructed from `updates`
  (Yjs) and periodically snapshotted back into `draft_content`.

## 5. Indexing & search notes

- **GIN index** on `draft_content` / `content` for JSONB containment queries (find artifacts using an
  asset/font/element type).
- **Full-text search** on `artifacts.title` + extracted text from the content tree (a generated
  `tsvector` column or a sidecar search index later).
- `workspace_id` indexed on every scoped table; composite indexes for hot paths
  (`shares(artifact_id, subject_id)`, `credits(workspace_id, created_at)`).

## 6. v1-core (ship the loop with ~11 tables)

`users · workspaces · members · folders · artifacts · versions · themes · assets ·
shares · links · credits`. Add the rest as features land (components/brand_kits/formats/fonts →
comments/activity/notifications → chats/messages/jobs → domains/views/reactions →
plans/subscriptions/updates).

## 7. Relationship summary

```
workspaces ─┬─< members >─ users
            ├─< folders ─< artifacts ─┬─< versions
            │                         ├─< updates
            │                         ├─< shares          (subject = user | link | workspace)
            │                         ├─< links ─< domains
            │                         ├─< comments · chats ─< messages · views · reactions
            ├─< themes · components · templates · brand_kits · formats · fonts · assets
            ├─< subscriptions ─ plans
            └─< credits · activity · jobs
users ─< notifications
```

---

Next: generate the actual schema for the v1-core set — pick one and I'll produce it:
**Prisma schema**, **Drizzle (TS)**, or **raw Postgres DDL** (with RLS policies + indexes).
