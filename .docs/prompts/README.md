# Feature handoff prompts

One **self-contained** prompt per not-yet-built Galleo feature. Each file already embeds the shared
architecture context — **copy a whole file and paste it into a fresh session**. Every feature wires into
the billing/features entitlement gating; a separate billing session owns billing itself.

| File                   | Feature                       | Flag              | Depends on           |
| ---------------------- | ----------------------------- | ----------------- | -------------------- |
| `01-public-links.md`   | Publish & public share links  | `publicLinks`     | — (foundational)     |
| `02-members-roles.md`  | Team members, roles & invites | `maxMembers`      | — (billing-adjacent) |
| `03-brand-kit.md`      | Shared workspace brand kit    | `workspaceThemes` | —                    |
| `04-analytics.md`      | View analytics                | `analytics`       | #01                  |
| `05-custom-domains.md` | Custom domains                | `customDomains`   | #01                  |
| `06-public-api.md`     | Public API + API keys         | `apiAccess`       | —                    |
| `07-sso.md`            | SSO                           | `sso`             | —                    |

**Recommended order:** `01` first (unblocks `04` + `05`); `02` / `03` / `06` / `07` are independent — run as
capacity allows.

Each prompt tells the session to: build the feature, gate it via `can(featuresFor(ws), "<flag>")`, and flip
`FEATURES["<flag>"].status` from `"planned"` → `"live"` once verified. Plan grants are already set in
`model/billing.ts`; billing internals are off-limits. Full spec + rationale lives in `.docs/billing.md`.
