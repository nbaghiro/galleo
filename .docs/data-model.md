# Galleo — Data Model

> Engine = **PostgreSQL + JSONB**: everything relational (auth, sharing, billing) gets foreign keys +
> transactions; the one schema-flexible thing — the artifact **content tree** — lives in a `jsonb`
> column. Binaries (images/video/fonts) live in object storage; tables hold only metadata + URLs.
> The schema is `services/data/schema.ts` (Drizzle); the content shape is `rendering.md`.

---

## 1. Why PG + JSONB

Only the **content tree** (sections → cells → elements) is schema-flexible, and `jsonb` handles it
natively (GIN-indexable, FTS-searchable). Everything else is relational and wants foreign keys. One
database does both → lowest ops burden. Sections/cells/elements are **never their own tables** — they're
embedded in the artifact's `draft_content` JSON.

## 2. Conventions

- `snake_case`, plural table names. Every workspace-scoped table carries `workspace_id` (the tenancy key).
- Standard columns: `id uuid pk`, `created_at`; edited entities also have `updated_at`.
- Content is JSON in `artifacts.draft_content` and `versions.content` — the two places an
  `ArtifactContent` is stored.

---

## 3. The tables (11, as implemented in `services/data/schema.ts`)

### Identity & tenancy

| Table          | Purpose                                      | Key columns                                                                 |
| -------------- | -------------------------------------------- | --------------------------------------------------------------------------- |
| **users**      | a person / login                             | `email` (unique), `name`, `avatar_url`, `password_hash` (null = OAuth-only) |
| **workspaces** | the tenant that owns content                 | `name`, `slug` (unique), `owner_id→users`, `plan` (text, default `free`)    |
| **members**    | user ↔ workspace + role (join, composite pk) | `workspace_id`, `user_id`, `role`                                           |

### Content

| Table         | Purpose                                                 | Key columns                                                                                                                                                            |
| ------------- | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **artifacts** | the deck/doc/site entity — metadata + the working draft | `workspace_id`, `folder_id`, `title`, `format_id`, `theme_id`, **`draft_content` (jsonb)**, `published_version_id`, `status`, `trashed_at` (soft delete), `created_by` |
| **versions**  | immutable content snapshots (history / published)       | `artifact_id`, **`content` (jsonb)**, `label`, `author_id`                                                                                                             |
| **folders**   | organize artifacts (tree via `parent_id`)               | `workspace_id`, `parent_id`, `name`                                                                                                                                    |
| **themes**    | custom themes (`workspace_id` null = system)            | `workspace_id`, `name`, **`tokens` (jsonb)**, `mood`, `is_dark`                                                                                                        |
| **assets**    | uploaded & AI media metadata (binary in object storage) | `workspace_id`, `kind`, `source` (`upload`\|`ai`), `url`, `width`, `height`, `bytes`, `alt`, `meta` (jsonb)                                                            |

### Sharing & publishing

| Table      | Purpose                             | Key columns                                                                               |
| ---------- | ----------------------------------- | ----------------------------------------------------------------------------------------- |
| **shares** | who can view/edit an artifact (ACL) | `artifact_id`, `subject_type` (user\|link\|workspace), `subject_id`, `role`               |
| **links**  | public / published link             | `artifact_id`, `slug` (unique), `visibility`, `password`, `published_version_id→versions` |

### Billing

| Table       | Purpose          | Key columns                                        |
| ----------- | ---------------- | -------------------------------------------------- |
| **credits** | AI-credit ledger | `workspace_id`, `delta`, `reason`, `balance_after` |

> **Not their own tables in v1:** billing plans (`workspaces.plan` is just a string), invites, api_keys,
> comments, activity, notifications, brand kits, custom formats/fonts, view analytics, custom domains, and
> live-collab (Yjs) update logs. They're deferred; add them when the feature lands.

---

## 4. The content JSON (`artifacts.draft_content` / `versions.content`)

The whole tree is one `jsonb` document — an `ArtifactContent` (see `rendering.md`):

```jsonc
{
    "format": "deck", // deck | doc | web  (→ engine profile)
    "theme": "studio", // → a built-in id, or a custom themes.id (uuid)
    "sections": [
        {
            "id": "s-1",
            "grid": "split-6040",
            "cells": {
                "a": {
                    "element": {
                        "type": "text",
                        "data": { "text": "Run the kitchen", "style": "h1" },
                    },
                },
                "b": {
                    "element": {
                        "type": "image",
                        "data": { "src": "https://…", "aspect": 0.8, "fit": "cover" },
                    },
                },
            },
        },
    ],
}
```

- **`format`** is a profile id (`deck`/`doc`/`web`) — the same tree renders three ways.
- **`theme`** is either a built-in theme id or a workspace `themes.id`; the app registers custom themes
  into the `@themes` registry so `resolveTheme` finds either.
- Images currently store a **raw URL** in `src` (stable `asset:` references are a future refinement).
- **Live editing** writes `artifacts.draft_content` (debounced autosave, `app/data/save.ts`);
  **saving/publishing a version** copies it into an immutable `versions` row, and
  `artifacts.published_version_id` / `links.published_version_id` point at what the public sees.

## 5. Indexing & search (as the data grows)

- **GIN index** on `draft_content` / `content` for JSONB containment (find artifacts using an asset or
  element type).
- **FTS** on `artifacts.title` + text extracted from the content tree.
- `workspace_id` indexed on every scoped table; composite indexes on hot paths
  (`shares(artifact_id, subject_id)`, `credits(workspace_id, created_at)`).

## 6. Relationship summary

```
workspaces ─┬─< members >─ users
            ├─< folders ─< artifacts ─┬─< versions
            │                         ├─< shares            (subject = user | link | workspace)
            │                         └─< links
            ├─< themes · assets
            └─< credits
users ─< artifacts.created_by
```
