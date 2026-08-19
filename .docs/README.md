# Galleo — Docs

One current-state reference per domain. Each is the single source of truth for its area — start
here for "where does X live", then open the doc that owns it. Every doc ends with a **Planned / deferred**
section for work not yet built.

| Doc                                | Covers                                                                                                                                                                                             |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [architecture.md](architecture.md) | What Galleo is · the layering law · the codebase map (`model · canvas · ui · editor · app · services`) · the data model (Postgres + JSONB) · billing & credits · local dev + ports                 |
| [workspaces.md](workspaces.md)     | The tenant: the workspace row · plans + the entitlement resolver · Stripe + the webhook · the credit window/ledger · membership + seats · what `pnpm seed` builds                                  |
| [rendering.md](rendering.md)       | The Clay-style layout engine · format-as-view · compose · the element system + catalog · selection & direct manipulation · charts / diagrams · paint backends + export                             |
| [ai.md](ai.md)                     | The streamed turn protocol · the tool catalog + pricing · the runtime · the chat / workspace agent · the prompt playbook · routes + credit gate · client wiring                                    |
| [frontend.md](frontend.md)         | The shared `@ui` component library · keyboard control + the command palette                                                                                                                        |
| [search.md](search.md)             | Library search + ⌘K: the Postgres FTS index, extraction, ranking + snippets, the palette source registry                                                                                           |
| [loading.md](loading.md)           | Keyset pagination + infinite scroll · windowed artifact reads + section-op writes · paint windowing for the section stack                                                                          |
| [collab.md](collab.md)             | Live collaboration: collaborator grants · the room protocol over one WebSocket · presence + content-relative cursors · per-key op sync + inverse-op undo · the element edit lease · the scale path |
| [comments.md](comments.md)         | Threads anchored to elements and text ranges: the `cm` mark, id minting, degradation and the stored quote, the `comment` access level, the six routes, the editor seam                             |
| [testing.md](testing.md)           | The mocking contract · the seam budget · test doubles · the coverage map · the still-unbuilt test tracks                                                                                           |
| [e2e.md](e2e.md)                   | The Playwright browser suite as built: fixtures, the seeded state, and what each spec covers                                                                                                       |
| [hosting.md](hosting.md)           | Production deploy: Render + Neon · the single-origin topology · the env contract · the deploy pipeline · dev→prod repo changes · staging · cost · scale path                                       |
| [onboarding.md](onboarding.md)     | The first session: the signup grant · why the first artifact is a template · the format question · the activation checklist · the prefs schema · the events                                        |

Feature backlog and the specs they implement against live in [prompts/](prompts/).
