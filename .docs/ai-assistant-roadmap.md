# AI Assistant — Workspace Capability Roadmap

A staged plan to close the gaps in the in-app assistant (`ChatPanel` + `services/ai/chat.ts`), so it
becomes a real workspace agent — not just a generate-a-new-artifact bot. Grounded in the current
architecture; each phase is independently shippable and verifiable.

> Sibling docs: `ai-module.md` (how the AI layer works today), `architecture.md` (the layering law).

---

## 1. Where we are

The chat is a global dock (`AppShell`) that runs a server-side `ToolLoopAgent` (`services/ai/chat.ts`).
Its surface is route-aware (`editorActive` → open artifact · live in-chat draft · else library).

**Today it can:** generate a new artifact from a brief (`propose-generation` → confirm card → streamed
draft → refine the draft → open), plan/shape ideas, and answer "what can you do / how many decks do I
have" (titles only).

**The root limitation:** in the library the agent has exactly **one** tool and its entire view of the
workspace is `ChatLibrary = { view, artifactCount, recent: {title, format}[], folder }` — **no IDs, no
content.** It is structurally _blind_ (can't read existing work) and _armless_ (can't act on the library).
Almost every gap below is therefore a **wiring** gap: the capability already exists in the app/API
(`app/stores/library.ts`, `folders.ts`, `billing.ts`, `api.getArtifact`, share/export) — the agent just
can't reach it.

---

## 2. The three architectural seams

Everything new lands on one of three seams. Getting these right up front is what keeps the tool count from
becoming a pile of special cases.

### Seam A — Read spine (server-side, DB-backed)

The agent gains _eyes_. The turn is already authenticated (`services/api/ai.ts` has the user), so
find/read run **server-side against Postgres** — no need to ship content from the client.

- Extend `ToolContext` (`services/ai/tools/registry.ts`) with an injected, user-scoped `workspace`
  reader (list/search summaries, load one artifact's content). The route supplies it (it holds the DB);
  `model` stays pure.
- New tools: **`find-artifacts`** (search titles/summaries/folders → `{id, title, format, updatedAt}[]`)
  and **`read-artifact`** (`id` → a compact digest via the existing `artifactDigest`/`artifactSpine`
  prompt helpers, never the raw tree).
- Presentation: a `find` result renders as a pick-list of artifact cards; `read` grounds the agent's prose.

### Seam B — Edit-a-target (proposal → any artifact)

Today a `proposal` block applies to the open editor artifact or the live draft. Generalize its target so
the **same proposal model** also edits a **library artifact by id** without opening it.

- Add an optional `targetArtifactId` to the `proposal` block (absent = open artifact / active draft, as
  now). `applyProposal` branches: draft → patch draft · target id → `getArtifact` + `applyPatch` +
  `api.saveArtifact(id, {draftContent})` + `loadLibrary()` refresh · else → editor `commit` (undoable).
- Preview stays a chat `MiniCanvas` of the changed section(s) — the user reviews before Apply, even though
  the artifact isn't on screen. This unifies **all three edit contexts** (open · draft · library) under one
  Apply/Discard widget.

### Seam C — Workspace actions (mutations + a confirm gate)

Management ops (rename, move, duplicate, folder, trash, share, export, open). Two execution styles:

- **Server-tool + client refresh** for reversible, low-stakes ops (rename, move, duplicate, create-folder):
  the tool hits the existing API; after the turn the client calls `loadLibrary()`/`loadFolders()`. Shown as
  "Renamed ✓" with undo where cheap. No pre-confirm.
- **Confirm card** (a new `action` block, modeled on the brief card) for **destructive or outward-facing**
  ops (trash/empty-trash/hard-delete, create-link/publish, export). The agent _proposes_; the client
  executes only on an explicit click. Never auto-run.
- **Client-only actions** for pure UI/navigation (open an artifact, switch view/filter): a lightweight
  client-executed action — the server agent can't drive the router, so it emits an `action` the client runs.

**Prohibited / hand-off (never build as an action):** upgrading/paying, permission or sharing-scope
changes beyond creating a link the user confirms. Surface these; don't execute them.

---

## 3. Tool catalog changes (`@model/tools`)

Several ids already exist (some `live:false`) and just need activating: `write-summary`,
`translate-artifact`, `generate-theme`, `suggest-title`, `revise-element`, `revise-artifact`.

**New ids to add** (with `surfaces`, `tier`, and pricing — reads/management are free; content-writes
metered):

| id                                   | tier      | metered  | seam                       |
| ------------------------------------ | --------- | -------- | -------------------------- |
| `find-artifacts`                     | action    | free     | A                          |
| `read-artifact`                      | action    | free     | A                          |
| `open-artifact`                      | action    | free     | C (client)                 |
| `rename-artifact`                    | action    | free     | C                          |
| `move-artifact`                      | action    | free     | C                          |
| `duplicate-artifact`                 | action    | free     | C (writes, but reversible) |
| `trash-artifact`                     | action    | free     | C (confirm)                |
| `restore-artifact`                   | action    | free     | C                          |
| `create-folder`                      | action    | free     | C                          |
| `apply-template`                     | composite | metered? | C+A                        |
| `create-link`                        | action    | free     | C (confirm, outward)       |
| `export-artifact`                    | action    | free     | C (confirm, outward)       |
| `reorder-section` / `remove-section` | action    | free     | B (patch ops exist)        |
| `set-theme` / `set-format`           | action    | free     | B (`setMeta` exists)       |

`moveSection` / `removeSection` / `setMeta` patch ops already exist in `@model/ai` — these tools just emit
them, so they work identically for the open artifact, a draft, or a library target (Seam B).

---

## 4. Phased delivery

Each phase is shippable on its own and ordered so the highest-frustration gaps close first.

### Phase 1 — Read spine _(unlocks: understand existing work; grounds everything after)_

- Seam A: `workspace` reader on `ToolContext`; `find-artifacts` + `read-artifact` tools; wire into both
  library and editor toolsets. Render a find-result pick-list in `ChatPanel`.
- Prompt: library persona learns it can _see_ the user's work now (summarize, compare, find).
- **Closes:** "summarize my Series A deck", "which decks mention pricing", "what's my Aria deck about".
- **Verify:** library-surface turn with a "summarize my X" ask returns real content-grounded prose (curl +
  browser).

### Phase 2 — Edit a named artifact + open/navigate _(the "make my Aria intro punchier" case, done right)_

- Seam B: `targetArtifactId` on proposals; `applyProposal` save-to-artifact path; `open-artifact` client
  action (navigate to `/edit/:id`).
- The agent chains `find-artifacts` → `read-artifact` → `rewrite-section`/`revise-element` with a target id;
  the user Applies in chat, or opens it.
- **Closes:** edit/translate/fix a specific library artifact without opening; "open my Series A deck".
- **Verify:** "make the intro of <deck> punchier" from the library → a targeted proposal that persists on
  Apply and shows in the library thumbnail.

### Phase 3 — Workspace management + confirm framework _(organize the library)_

- Seam C: `rename-`, `move-`, `duplicate-`, `create-folder` (optimistic + refresh); the **confirm `action`
  block** + `trash-`/`restore-` behind it. `ChatLibrary` gains folder list for grounding.
- **Closes:** rename, move-to-folder, duplicate, make-a-folder, delete/restore (guarded).
- **Verify:** destructive asks always render a confirm card and never mutate before the click.

### Phase 4 — Refine-loop completeness _(shared with editor chat)_

- Seam B: `reorder-section`, `remove-section`, `set-theme`, `set-format` (emit existing patch ops);
  wire `revise-element` + `generate-theme` into the chat toolset.
- **Closes:** "move pricing to the end", "delete the team slide", "swap to a warmer theme", "make it a doc",
  "regenerate the hero image" — for the open artifact, a draft, or a target.
- **Verify:** each op round-trips through Apply on all three edit contexts.

### Phase 5 — Templates + credit awareness

- `apply-template` (list in context via `listTemplates`, create-from-template through `persistArtifact`);
  surface plan/credit balance from `billing` into `ChatContext.plan` so the agent can answer "how many
  credits do I have" and warn before a big build.
- **Closes:** "start from the pitch template", "what templates exist", "will this cost a lot".

### Phase 6 — Sharing / export _(outward-facing, guarded)_

- `create-link` (→ the existing share flow, confirm card, **never auto-publish**), `export-artifact`
  (→ export pipeline, confirm). Read-only "who opened my link" via the links dashboard data.
- **Closes:** "make a public link", "export to PDF", "share stats". All confirm-gated.

### Phase 7 — Source-grounded generation _(net-new plumbing)_

- Real `contextRefs`: paste-as-source, URL fetch, and file/PDF upload feeding the generate brief so the
  deck is built _from_ the material, not just inspired by it. `theme` in the brief (per-build theme choice),
  and `variations` (N drafts to compare).
- **Closes:** "turn this into a deck", "build from example.com/post", "make it dark editorial", "give me 3
  versions".

### Phase 8 — Cross-artifact repurpose _(net-new; depends on Seam A + B)_

- Multi-artifact context + extract/merge: "turn my report into a deck", "one-pager from my pitch", "pull the
  charts from Q3 into a new update", "reuse the Aria theme", "merge these two".
- **Closes:** the repurposing category — the highest-leverage, highest-effort work, saved for last.

---

## 5. Cross-cutting concerns

- **Surfaces:** most tools serve **both** library and editor chat — build once, expose per surface via the
  toolset split already in `chat.ts`. The persona prompts (`prompts/chat.ts`) get per-phase updates.
- **Metering:** reads + management are free; content generation/edits stay metered through the existing
  `@model/tools` pricing + the `/ai/turn` credit gate. New content tools declare `usage`.
- **Safety (enforced, not optional):** destructive (trash/empty/hard-delete) and outward-facing
  (publish/link/export) **always** go through a confirm card; the agent proposes, the user commits.
  Upgrade/pay and permission-scope changes are **hand-off only**.
- **Refresh discipline:** any turn that mutates the library ends with `loadLibrary()`/`loadFolders()` so the
  optimistic client stores reflect server truth (mirrors today's `loadBilling()`).
- **Grounding honesty:** the agent must act only on real ids returned by `find-artifacts` — never invent an
  artifact or claim an action it didn't take (same rule as section ids today).

---

## 6. Status (implemented)

Phases 1–6 shipped in full. Phases 7–8 shipped their **core** (source-grounded generation), unified on one
mechanism: `GenerateInput.source` (raw text) + `sourceArtifactId` (repurpose), fed into the outline phase.

- **Done:** find/read spine · edit-a-named-artifact + open · rename/move/duplicate/folder/trash(confirm)/
  restore · reorder/remove/set-format/set-theme · templates + credit awareness · share/export routing
  (guarded) · **paste-as-source** ("turn THIS into a deck") · **repurpose** ("turn my report into a deck").
- **Deliberately deferred** (net-new infra that shouldn't be rushed — no band-aids): **URL fetch** and
  **PDF/file upload** as sources (need SSRF-safe fetching + robust extraction/upload), generation
  **variations** (N drafts to compare — a UX surface), and true multi-artifact **merge/extract** (combining
  two artifacts — repurpose already covers single-source "report → deck"). Each is a focused follow-up.

## 7. Sequencing rationale

Phases 1→2 are the spine (eyes, then hands on a named target) and kill the most user frustration. 3→6 are
mechanical tool-wiring over capabilities that already exist. 7→8 are the genuinely new plumbing, ordered
last because they depend on the read spine and carry the most surface area. Ship 1 and 2 first; the rest can
be picked up in any order the roadmap allows.
