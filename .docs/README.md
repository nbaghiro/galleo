# Galleo — Docs

Every doc is checked against the actual implementation, not a plan. Start with **architecture.md** for "where
does X live".

| Doc                                                    | What it covers                                                                                                                                                                                |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **[product.md](product.md)**                           | What Galleo is and who it's for — the "why" behind the system.                                                                                                                                |
| **[architecture.md](architecture.md)**                 | The factual codebase map: every package + file, the `model → canvas → editor → app` layering (ESLint-enforced), path aliases, data flow, local ports. **Start here for "where does X live".** |
| **[rendering.md](rendering.md)**                       | How content becomes pixels: the Clay-style layout engine, format-as-view, compose, the element system, direct-manipulation editing, and the paint/export backends.                            |
| **[flex-format.md](flex-format.md)**                   | The content tree the AI + editor write: the recursive flex model (`Section.root`, `group` direction + `layout.width`), layout presets, and how it renders across deck/doc/web.                |
| **[elements-and-editing.md](elements-and-editing.md)** | The element library + the editing surface (selection, inspectors, drag-drop, inline text).                                                                                                    |
| **[data-model.md](data-model.md)**                     | Persistence: the Postgres/JSONB schema, the content tree, draft-vs-version publishing, indexing.                                                                                              |
| **[ai-module.md](ai-module.md)**                       | **How everything AI works, end to end:** the turn protocol, the tool catalog + pricing, the registry + runtime, the chat agent, the routes + credit gate, and the client wiring.              |
| **[ai-prompts.md](ai-prompts.md)**                     | The prompt playbook: how each prompt is composed, one call vs. a series, the context each pulls, and the quality bar (rubric + arcs).                                                         |
| **[billing.md](billing.md)**                           | Plans, credits, the metered-usage engine, and the Stripe integration.                                                                                                                         |
