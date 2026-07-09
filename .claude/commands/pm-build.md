---
description: Implement an approved plan / ticket, then update the ticket. Branches off main; runs typecheck + lint + verify.
argument-hint: "<GAL-NN> [notes / approved plan]"
---
Use the **galleo-pm** subagent to run the **Implement** SOP from `.docs/pm-process.md §3.C` for: $ARGUMENTS

Re-read the ticket (and any approved plan), branch off `main`, implement following repo conventions (4-space indent, double quotes, no `any`, no `console` in app code, shared UI → `@ui`, the ESLint boundary law). Verify with `pnpm typecheck` + `pnpm lint` and by exercising the change — don't rely on types alone. Then update the ticket (→ `In Review`, or `Done` only if verified) with a short note of what changed + the branch. Commit only if I explicitly ask.
