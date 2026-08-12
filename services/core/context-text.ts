// The context system's pure text logic: chunking for the vector store and pack assembly for
// prompts. Split from context.ts, which opens the database at import time.

const CHUNK_SIZE = 1200;
const CHUNK_OVERLAP = 200;

// Paragraph-aware sliding window: paragraphs accumulate up to the size, each chunk carries the
// tail of the previous one so a fact straddling a boundary is findable from either side.
export function chunkText(text: string, size = CHUNK_SIZE, overlap = CHUNK_OVERLAP): string[] {
    const clean = text.replace(/\r\n?/g, "\n").trim();
    if (!clean) return [];
    if (clean.length <= size) return [clean];

    const paragraphs = clean.split(/\n{2,}/).flatMap((p) => {
        // a single paragraph longer than a whole chunk is split hard so nothing is dropped
        if (p.length <= size) return [p];
        const parts: string[] = [];
        for (let i = 0; i < p.length; i += size) parts.push(p.slice(i, i + size));
        return parts;
    });

    const chunks: string[] = [];
    let current = "";
    for (const p of paragraphs) {
        if (current && current.length + p.length + 2 > size) {
            chunks.push(current);
            current = current.slice(Math.max(0, current.length - overlap));
        }
        current = current ? `${current}\n\n${p}` : p;
    }
    if (current.trim()) chunks.push(current);
    return chunks;
}

export interface RetrievedChunk {
    title: string; // the item it came from
    kind: string; // "file" | "link" | "artifact" | "text"
    text: string;
}

const SOURCE_LABEL: Record<string, string> = {
    file: "an uploaded file",
    link: "a saved link",
    artifact: "your library",
    template: "a Galleo template",
    text: "pasted material",
};

// Rows arrive best-first; the pack keeps whole chunks until the budget is spent, grouped under a
// citation line per source so the model can attribute what it quotes.
export function assemblePack(rows: readonly RetrievedChunk[], budget = 4000): string | null {
    if (!rows.length) return null;
    const bySource = new Map<string, string[]>();
    let spent = 0;
    for (const row of rows) {
        if (spent + row.text.length > budget && spent > 0) continue;
        const key = `${row.title} (${SOURCE_LABEL[row.kind] ?? row.kind})`;
        const list = bySource.get(key) ?? [];
        list.push(row.text.trim());
        bySource.set(key, list);
        spent += row.text.length;
    }
    if (!bySource.size) return null;
    return [...bySource.entries()]
        .map(([source, texts]) => `From ${source}:\n${texts.map((t) => `> ${t}`).join("\n\n")}`)
        .join("\n\n");
}
