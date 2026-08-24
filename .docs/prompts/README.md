# Feature handoff prompts

One **self-contained** prompt per not-yet-built Galleo feature. Each file embeds the shared architecture
context it needs, so the intended use is to copy a whole file into a fresh session. `AGENTS.md` remains
the authority on conventions; where a prompt and `AGENTS.md` disagree, `AGENTS.md` wins and the prompt is
stale.

| File                    | Feature                         | Flag                            | State                                                                   |
| ----------------------- | ------------------------------- | ------------------------------- | ----------------------------------------------------------------------- |
| `03-brand-kit.md`       | Shared workspace theme          | `workspaceThemes`               | not started                                                             |
| `05-custom-domains.md`  | Custom domains                  | `customDomains`                 | not started; the publishing layer it sits on is in                      |
| `06-public-api.md`      | Public API + API keys           | `apiAccess`                     | built as part of the MCP work, not from this prompt; see `../mcp.md`    |
| `07-sso.md`             | Workspace SSO                   | `sso`                           | partially built (Google OIDC sign-in ships)                             |
| `08-object-storage.md`  | Source files to R2 + MinIO      | (infra)                         | not started                                                             |
| `10-voice-narration.md` | Speaker notes + voice narration | `voiceNarration`, `voiceDesign` | built, pending manual QA; rationale in `../planning/voice-narration.md` |

Each prompt tells its session to build the feature, gate it through the resolver in `model/billing.ts`,
and flip `FEATURES["<flag>"].status` from `"planned"` to `"live"` once it is verified end to end. The plan
grants are already set, so that one status line is normally the only edit `model/billing.ts` needs.

**Order.** These are independent of each other. `05` is the only one with a real prerequisite, public
links, and that shipped. `08` touches the context and media storage paths and nothing else, so it runs in
parallel with anything.

`10` is built across all nine phases and is waiting on manual QA; it stays here until that passes,
then it moves to the list below and the current-state docs own it. Its two incidental fixes have
landed: the editor now presents through the shared surface, so a tall section no longer loses every
page after the first, and `SECTION_SHELL_EQUAL` knows about `notes`, so a notes-only edit is no longer
discarded on the save path.

## Shipped, prompts removed

Three prompts were deleted in an audit against the current code, because the features they describe are
built and covered by integration tests. Recorded here so the numbering gaps do not read as lost files.

- **`01-public-links.md`** (`publicLinks`, now `live`): the `links`, `link_recipients`, and `link_views`
  tables, `services/core/links.ts`, `services/api/links.ts` (including the unauthenticated
  `GET /api/p/:slug/content` and the viewer heartbeat), the standalone `publish/` viewer at `/p/:slug`,
  `app/components/ShareModal.tsx`, and `services/api/__tests__/links.itest.ts`.
- **`02-members-roles.md`**: membership, invites, roles, and seats, in `services/api/workspace.ts` over
  `services/core/workspaces.ts`, the `members` and `invites` tables,
  `app/views/WorkspaceSettingsView.tsx` and `app/views/InviteView.tsx`, with
  `services/api/__tests__/workspace.itest.ts` and `roles.itest.ts`. Two things landed differently from
  that prompt's plan: the roles are `owner` / `admin` / `member` rather than four levels, and the seat cap
  is `workspaces.seats` (the cached Stripe quantity), not a `maxMembers` entitlement. There is no
  `maxMembers` key in `FEATURES` at all.
- **`04-analytics.md`** (`analytics`, now `live`): the `link_views` table, `recordView` inside the public
  read, `analyticsFor`, the two gated endpoints `GET /links/:id/analytics` and
  `GET /artifacts/:id/analytics`, and the analytics panel in `app/views/SharedView.tsx`.
- **`09-product-analytics.md`** and its spec `analytics-events.md`: internal product instrumentation,
  built in four phases. 99 of the 101 events in that spec fire from a real call site; the two that do not,
  and the properties that could not be filled, are listed under Planned / deferred in
  [`../analytics.md`](../analytics.md), which is now the current-state reference.
