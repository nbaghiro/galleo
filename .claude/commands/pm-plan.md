---
description: Analyze a Linear ticket against the latest codebase and produce a review-ready implementation plan (no code changes).
argument-hint: "<GAL-NN | E#-#> [extra context]"
---
Use the **galleo-pm** subagent to run the **Plan** SOP from `.docs/pm-process.md §3.B` for: $ARGUMENTS

Pull the ticket from Linear (team GAL), read the current code it touches, and — if the ticket is stale vs the code — propose the corrected scope first. Then produce: problem recap → approach → files to add/change (with what) → build sequence → tests/verification → risks & open questions → acceptance criteria, honoring `CLAUDE.md` conventions. **Make no code changes.** Offer to save the plan onto the ticket on approval.
