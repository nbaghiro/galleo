// What each seeded document is called. Titles only: the bodies are the seven gold-standard
// artifacts in core/ai/corpus/, which the generate prompt also injects as few-shot exemplars, and
// db/ may not reach into core/. seed.ts joins a key here to the body it imports, the same way a
// DocRef in workspaces.ts names a document it does not carry.

export const CORPUS_TITLES: Record<string, string> = {
    galleo: "Galleo — Seed deck",
    aria: "Aria — Album launch",
    terra: "Terra — Brand site",
    lumen: "Lumen — Product launch",
    slowweb: "The Slow Web — Essay",
    helios: "Helios — Climate report",
    fieldnotes: "Field Notes — Faroe Islands",
};
