# Galleo — Project-Management Process (Linear)

> The operating manual for keeping the Galleo backlog and the codebase in sync. The `galleo-pm`
> subagent (`.claude/agents/galleo-pm.md`) reads this before acting; humans can read it top-to-bottom.
> **Source of truth is live Linear (team `GAL`), queried via the `linear-server` MCP — never a snapshot.**

---

## 1. The shape of the backlog

- **Workspace:** `galleo` · **Team:** `Galleo` (key `GAL`).
- **Projects = tech epics.** 14 of them, each named `E# · <Name>` and colored. An issue belongs to exactly one epic-project.
- **Issues = chunky tickets.** Each is a cohesive, individually-ownable deliverable (~3–10 days), never a micro-task. Small fixes are rolled INTO a themed ticket as scope bullets, not split out.
- **Issue titles carry a stable epic-relative code:** `[E#-#] <outcome>` (e.g. `[E4-12] AI-side credit accounting…`). The `GAL-NN` identifier is Linear's; the `[E#-#]` code is ours, used to reference couplings in descriptions. **Keep the `[E#-#]` code stable across renames** — rename the prose after the code, never the code.

### The 14 epics → what they own (code map)

| Code    | Project                               | Primary code locations                                                                                                                                                                                                                |
| ------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **E1**  | Rendering & Layout Engine             | `canvas/engine/{layout,node,profile}.ts`, `canvas/render/{commands,backends,present,geometry}.ts`, `model/geometry.ts`                                                                                                                |
| **E2**  | Element Library                       | `canvas/elements/**` (`spec,compose,ops,skeletons,blueprint,dropghost` + `text/ media/ table/ basic/ composite/ chart/ diagram/`), `model/elements.ts`, `editor/register.ts`, `editor/inspect/{data-model,DataGrid,DataEditor}.*`     |
| **E3**  | Studio Editor                         | `editor/{Studio.tsx,editor.ts}`, `editor/canvas/{Canvas,dnd,insert,Present,embeds}.*`, `editor/select/{selection,handles}.*`, `editor/inspect/{inspectors,fields,format-bar}.*`, `editor/text/*`, `editor/chrome/*`                   |
| **E4**  | AI Generation & Agent                 | `model/{ai,tools}.ts`, `services/ai/**` (`run,provider,models,quality,schema,suggest,theme,chat,text`, `prompts/`, `tools/`), `services/api/ai.ts`, `editor/ai/**`, `app/views/generate/**`, `app/views/chat/**`                      |
| **E5**  | Theming & Design System               | `model/theme.ts`, `app/theme.ts`, `app/views/ThemeEditor.tsx`, `ui/**`                                                                                                                                                                |
| **E6**  | Export & Format Fidelity              | `canvas/render/export.ts`, `canvas/render/backends.ts`, `canvas/engine/layout.ts` (`fragment`)                                                                                                                                        |
| **E7**  | Publishing & Sharing                  | `services/api/links.ts`, `services/mail/send.ts`, `publish/**`, `app/{share.ts,components/ShareModal.tsx}`; schema `links`/`link_recipients`/`versions`/`shares`                                                                      |
| **E8**  | Library & Content Management          | `app/views/{LibraryView,TemplatesView,TrashView,EditorView}.tsx`, `app/components/{previews,Sidebar,modals}.tsx`, `app/stores/{library,folders,save}.ts`, `services/api/{artifacts,folders,templates}.ts`, `services/templates*`      |
| **E9**  | Accounts, Auth & Onboarding           | `services/auth.ts`, `services/api/{session,context}.ts`, `app/stores/auth.ts`, `app/views/AuthPage.tsx`; schema `users`/`members`                                                                                                     |
| **E10** | Teams & Collaboration                 | `services/api/context.ts`, `app/components/Sidebar.tsx`; schema `members`/`shares`/`workspaces` (comments/activity/realtime are greenfield)                                                                                           |
| **E11** | Billing, Plans & Credits              | `services/billing/stripe.ts`, `services/api/billing.ts`, `services/features.ts`, `model/{billing,credits,features}.ts`, `app/stores/{billing,features}.ts`, `app/views/PricingView.tsx`; schema `workspaces` billing cols + `credits` |
| **E12** | Media & Assets                        | `services/media/{providers,generate,icons}.ts`, `services/api/media.ts`, `model/media.ts`, `app/{media.ts,components/MediaPicker.tsx}`, `canvas/elements/media/**`; schema `assets`                                                   |
| **E13** | Backend Platform, Infra & Security    | `services/{schema,server,auth}.ts`, `services/api/**`, `services/queue` (reserved), `drizzle.config.ts` (no tests/observability/rate-limiting yet)                                                                                    |
| **E14** | Website, Docs & Cross-Cutting Quality | `website/**`, `.docs/**`, and app-wide concerns: a11y, i18n, error-handling, analytics, testing/CI                                                                                                                                    |

Read `CLAUDE.md` + `.docs/architecture.md` for the layering law (`model ← canvas ← ui ← editor ← app`; `services ← model`).

---

## 2. Field conventions

- **State** (maps to reality): `Done` = shipped & working · `In Progress` = partially built, real remaining scope · `Backlog` = not started · (`Todo` = pulled in for a cycle · `In Review` = implemented, awaiting review).
- **Estimate** (points, Fibonacci): `S=1` (~1–3d) · `M=2` (~3–5d) · `L=3` (~5–8d) · `XL=5` (~8d+).
- **Priority:** `Urgent` = trust/correctness ship-blocker (P0) · `High` = first-slice / flagship / foundational · `Medium` = default · `Low` = nice-to-have · `None` = already shipped.
- **Labels:** `built` · `partial` · `not-built` (mirror the state for filtering) · `P0-trust` · `flagship` · `coupled` (shares work with another epic — see relations) · `hardening` · `greenfield`.
- **Relations:** couplings between epics are wired as Linear relations (`related` / `blocks`), and the shared work is **built once** in its home epic. Never create duplicate issues for the same body of work across two epics — create it once, relate it, and reference the `[E#-#]` code in both descriptions.

### Issue description shape

```
<one–three sentence what-it-delivers / what's-missing>

**Status/Scope (~Nd):** <the concrete remaining work as bullets or a sentence> Files: `path/a.ts`, `path/b/`.
```

Built issues note `**Status:** shipped.` + a `Files:` pointer + any small roll-in gap. Partial/backlog issues lead with what's missing, a rough size, and the key files.

---

## 3. Standard operating procedures

Pick the SOP matching the request. **Always query live Linear first** (`list_projects`, `list_issues`, `get_issue`) — the codebase moves; trust the code + live tickets, not this doc's examples.

### A. Sync / reconcile (`/pm-sync [epic-code | subsystem | "diff"]`)

Reconcile the code reality against the tickets for a scope.

1. Resolve scope → its epic-project(s) and code locations (§1 map). For `"diff"`, use `git diff` / recent commits.
2. Read the relevant code; list what actually exists / changed.
3. Pull the epic's issues from Linear; for each, compare description vs reality.
4. Apply updates via `save_issue`:
    - Flip **state**/labels when a `partial` shipped or a `built` regressed.
    - **Rename** the prose (keep the `[E#-#]` code) when the title no longer matches the work — do this freely to keep coherence.
    - Tighten the description's remaining-scope + `Files:` to match current code.
    - **Create a new issue** for a real change/capability not captured by any ticket — right epic-project, correct code/labels/estimate/state, next `[E#-#]` code in that epic, and a relation if it couples.
    - **Do NOT** create tickets for trivial noise (formatting, a renamed local var, a one-line fix that belongs inside an existing ticket).
5. Report a concise changelog: `updated / renamed / created / closed`, each with the `GAL-NN` + why.

### B. Plan (`/pm-plan <GAL-NN | E#-#>`)

Produce a comprehensive implementation plan for review. **No code changes.**

1. `get_issue` the ticket; read its scope + coupled/blocking tickets.
2. Read the current code it touches (grep/read the §1 locations; fan out with the Task tool for big surfaces).
3. If the ticket is stale vs the code, say so and propose the corrected scope first.
4. Output: **problem recap → approach → files to add/change (with what) → build sequence → tests/verification → risks & open questions → acceptance criteria.** Note the coding conventions from `CLAUDE.md` that apply.
5. Offer to save the plan onto the ticket (as a comment or appended to the description) on approval.

### C. Implement (`/pm-build <GAL-NN>`)

Implement an approved plan/ticket.

1. Re-read the ticket + plan; branch off `main` (never commit to `main` directly; branch name may follow the ticket's `gitBranchName`).
2. Implement following repo conventions (4-space indent, double quotes, no `any`, no `console` in app code, shared UI → `@ui`, boundary law).
3. Verify: `pnpm typecheck` + `pnpm lint`, and exercise the change (see the `verify` skill) — don't rely on types alone.
4. Update the ticket: move to `In Review` (or `Done` if the definition allows), append a short note of what changed + the branch. Only mark `Done` when verified.
5. Commit only when asked (single-line imperative, no co-author trailer — see `CLAUDE.md`).

### D. New ticket (`/pm-ticket <description>`)

Capture a change/idea/bug as one well-formed issue: right epic-project, `[E#-#]` code, chunky scope (roll in the small stuff), state/labels/estimate/priority per §2, `Files:` pointer, and a relation if it couples. Confirm the draft before creating if the placement is ambiguous.

---

## 4. Guardrails

- **Read live Linear + the actual code before editing anything.** This doc is orientation, not truth.
- **Renaming issues for coherence is encouraged**; deleting/closing issues, or bulk state changes across a whole epic, get a one-line confirmation first.
- **One body of work = one issue.** Use relations for couplings; never duplicate.
- Keep issues chunky — resist splitting into micro-tasks or fragmenting an epic.
- Respect the codebase conventions and the ESLint boundary law on any implementation.
- Never put secrets/tokens in issue text. The Linear workspace/team icon can't be set via MCP (workspace = custom image upload; team/project = built-in glyph + color).
- After nontrivial ticket edits or code changes, report a crisp summary (what changed + `GAL-NN`/paths), not a play-by-play.
