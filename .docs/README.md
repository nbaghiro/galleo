# Galleo — Docs

One current-state reference per domain. Each is the single source of truth for its area — start
here for "where does X live", then open the doc that owns it. Every doc ends with a **Planned / deferred**
section for work not yet built.

| Doc                                        | Covers                                                                                                                                                                                             |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [architecture.md](architecture.md)         | What Galleo is · the layering law · the codebase map (`model · canvas · ui · editor · app · services`) · the data model (Postgres + JSONB) · billing & credits · local dev + ports                 |
| [rendering.md](rendering.md)               | The Clay-style layout engine · format-as-view · compose · the element system + catalog · selection & direct manipulation · charts / diagrams · paint backends + export                             |
| [ai.md](ai.md)                             | The streamed turn protocol · the tool catalog + pricing · the runtime · the chat / workspace agent · the prompt playbook · routes + credit gate · client wiring                                    |
| [frontend.md](frontend.md)                 | The shared `@ui` component library · keyboard control + the command palette                                                                                                                        |
| [search.md](search.md)                     | Library search + ⌘K: the Postgres FTS index, extraction, ranking + snippets, the palette source registry                                                                                           |
| [loading.md](loading.md)                   | Keyset pagination + infinite scroll · windowed artifact reads + section-op writes · paint windowing for the section stack                                                                          |
| [collab.md](collab.md)                     | Live collaboration: collaborator grants · the room protocol over one WebSocket · presence + content-relative cursors · per-key op sync + inverse-op undo · the element edit lease · the scale path |
| [testing.md](testing.md)                   | The mocking contract · the seam budget · test doubles · the coverage map · the still-unbuilt test tracks                                                                                           |
| [hosting.md](hosting.md)                   | Production deploy: Render + Neon · the single-origin topology · the env contract · the deploy pipeline · dev→prod repo changes · staging · cost · scale path                                       |
| [onboarding.md](onboarding.md)             | The first session (planned, not built): the signup grant · why the first artifact is a template · the format question · the activation checklist · the prefs schema · the events                   |
| [analytics-events.md](analytics-events.md) | The product-analytics event contract (planned, not built): the eight questions · super-properties + identify/group traits · 101 events with typed properties · what we never collect               |
