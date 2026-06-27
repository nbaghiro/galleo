# Backend wiring — plan (2026-06-27)

Goal: real persistence. A demo user is **seeded into Postgres**; the app **logs in via real APIs**,
loads the user's decks, and **auto-saves edits to the backend** with a mechanism that won't bombard
the API. Plus a themed **auth page** (with Google/Microsoft placeholders).

## Stack (aligned with the existing scaffolding + ports.md)
- **DB:** Postgres in Docker on **host 8602** (container 5432) — schema already in `services/data/schema.ts`
  (users · workspaces · members · folders · **artifacts**(draftContent jsonb) · versions · …).
- **API:** **Hono** + `@hono/node-server` in `services/api`, on **8601**. Run with `tsx`.
- **Auth (demo):** signed **httpOnly session cookie** (HMAC, Node crypto — no extra dep). A
  "Continue as demo" button hits `POST /auth/demo`; **Google/Microsoft are placeholder buttons**
  (disabled, wired later). No passwords for v1.
- **Dev networking:** **Vite proxy** `/api → localhost:8601` so the frontend (8600) and API (8601)
  are same-origin in dev → cookies + no CORS pain.

## Module structure (answering "studio or a new module?")
**A new module — not studio.** The editor stays the editor; the app frame (auth, routing, deck
loading, API client) is separate:

```
app/                      ← NEW: frontend shell (Vite entry)
  index.html · main.tsx   ← routes: not-authed → AuthPage; authed → load deck → <Studio/>
  AuthPage.tsx            ← themed login (demo + Google/MS placeholders)
  api.ts                  ← typed fetch client (/api/*)
  session.ts              ← current-user signal, login/logout
surfaces/studio/          ← editor only (exports <Studio/> + load/save hooks) — unchanged role
services/{api,auth,data}  ← backend
```
`app/` is a plain app layer (not a kernel surface), so it may compose `surfaces/studio` without
breaking the "surface ⇏ surface" rule. The Vite root moves to `app/`; the studio's element
registration + `studio.css` are imported from there. (Phased so the editor keeps working throughout.)

## API surface (v1)
| Method | Path | Purpose |
|---|---|---|
| `POST` | `/auth/demo` | log in as the seeded demo user → set session cookie |
| `POST` | `/auth/logout` | clear session |
| `GET`  | `/me` | current user (or 401) |
| `GET`  | `/artifacts` | list the user's decks (id, title, theme, updatedAt) |
| `GET`  | `/artifacts/:id` | full draftContent for editing |
| `PATCH`| `/artifacts/:id` | save `{ title?, draftContent?, themeId?, formatId? }` (autosave) |

## Smart autosave (don't bombard the API)
A small save controller in `app/`:
1. **Dirty tracking** — edits mark the open artifact dirty (we already have `editSeq`).
2. **Debounce** — flush ~**1.2s** after the last edit (coalesces bursts into one PATCH).
3. **Max-interval flush** — during continuous editing, force a flush every **~10s** so long sessions
   still checkpoint.
4. **Flush on blur / `visibilitychange` / `beforeunload`** — never lose the tail.
5. **In-flight guard** — one PATCH at a time; if edits arrive mid-flight, re-flush after it returns.
6. **Optimistic + offline-safe** — keep the localStorage copy as a fallback cache; PATCH is the
   source of truth. (No per-keystroke saves; ~1 request per quiet period.)

## Phases
| Phase | Deliverable |
|---|---|
| **1 — DB up** | `docker-compose.yml` (Postgres 8602) + `.env` + `db:push` migration |
| **2 — API** | Hono server (auth + artifacts) on 8601 + session helpers |
| **3 — Seed** | demo user + workspace + the demo decks → DB |
| **4 — Shell** | `app/` module: AuthPage (themed) + routing + API client; Vite root → app |
| **5 — Wire** | studio loads from `/artifacts/:id`; smart autosave controller replaces localStorage-only |

Phases 1–3 are backend (verifiable as code; you run Docker). 4–5 are the frontend move.
