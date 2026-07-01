# Galleo — Docs

The system explained, one concern per file. Read **architecture.md** first for the map; the rest go deep
on a single subsystem. Every doc is checked against the actual implementation, not a plan.

| Doc                                                            | What it explains                                                                                                                                                                                                       |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **[architecture.md](architecture.md)**                         | The factual codebase map — every package + file, the `kernel → surfaces → services → app` layering law (ESLint-enforced), the path aliases, and the end-to-end data flow. **Start here.**                              |
| **[layout-engine.md](layout-engine.md)**                       | The rendering core: a custom Clay-style, immediate-mode box solver (3-pass widths → heights → positions), how the _same_ artifact renders as a deck / doc / web page, pagination, and the DOM-vs-canvas paint targets. |
| **[element-system.md](element-system.md)**                     | The content-component layer on top of the engine: the universal `ElementSpec` contract, how an element compiles to engine nodes, the section-grid solver, structural skeletons, and the 19 built-in elements.          |
| **[data-model.md](data-model.md)**                             | Persistence: the 13-table Postgres/Drizzle schema, why the artifact content tree lives in a JSONB column, the draft-vs-version publishing model, and indexing.                                                         |
| **[design/product-direction.md](design/product-direction.md)** | Product framing — what the editor is and who it's for; the "why" behind the specs above.                                                                                                                               |
| **[ports.md](ports.md)**                                       | The local dev host-port block (Galleo owns `86xx`).                                                                                                                                                                    |
| **[design/](design/)**                                         | Standalone HTML explorers — the theme / app-explorer, the generation-view mockups, and the marketing-layout studies used during design. Reference, not code.                                                           |
