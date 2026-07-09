---
description: Reconcile the codebase against the Linear backlog for a scope (epic code, subsystem, or the working diff).
argument-hint: "[E4 | services/ai | \"diff\" | (empty = whole repo)]"
---
Use the **galleo-pm** subagent to run the **Sync / reconcile** SOP from `.docs/pm-process.md §3.A` for this scope: $ARGUMENTS

Compare the real code against the matching Linear issues (team GAL), then: update state/labels where reality changed, rename ticket prose for coherence (keep the `[E#-#]` code), tighten each description's remaining-scope + `Files:`, and create new well-formed issues for any real change not captured by a ticket (skip trivial noise). Finish with a concise changelog of updated / renamed / created / closed issues (with GAL-NN + why).

If no scope was given, propose a sensible one (e.g. the working diff, or ask which epic) before doing a full-repo pass.
