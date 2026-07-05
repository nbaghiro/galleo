# Galleo — Docs

Four docs cover the system and the product; every one is checked against the actual implementation, not a
plan.

| Doc                                    | What it covers                                                                                                                                                                                |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **[product.md](product.md)**           | What Galleo is and who it's for — the "why" behind the system.                                                                                                                                |
| **[architecture.md](architecture.md)** | The factual codebase map: every package + file, the `model → canvas → editor → app` layering (ESLint-enforced), path aliases, data flow, local ports. **Start here for "where does X live".** |
| **[rendering.md](rendering.md)**       | How content becomes pixels: the Clay-style layout engine, format-as-view, compose, the element system, direct-manipulation editing, and the paint/export backends.                            |
| **[data-model.md](data-model.md)**     | Persistence: the Postgres/JSONB schema, the content tree, draft-vs-version publishing, indexing.                                                                                              |
