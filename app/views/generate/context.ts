// Material the piece is built FROM: pasted text and dropped files, merged into one source blob.
// Pure — the file reading itself lives in `readAttachment` at the bottom.

export interface Attachment {
    id: string;
    name: string;
    kind: "paste" | "file";
    text: string;
}

// must stay in sync with sourceMaterial()'s clip in services/ai/prompts/generate.ts
export const SOURCE_LIMIT = 6000;

// text/* plus the structured formats that are text underneath but often typed as something else
const TEXT_EXTENSIONS = [
    "txt",
    "md",
    "markdown",
    "csv",
    "tsv",
    "json",
    "yaml",
    "yml",
    "html",
    "htm",
    "xml",
    "rtf",
    "log",
    "vtt",
    "srt",
];

export const extensionOf = (name: string): string =>
    name.includes(".") ? name.slice(name.lastIndexOf(".") + 1).toLowerCase() : "";

// We read files in the browser, so anything that isn't text arrives as mojibake. Refusing it with a
// reason beats silently feeding the planner binary noise.
export function isReadableFile(name: string, type: string): boolean {
    if (type.startsWith("text/")) return true;
    if (type === "application/json" || type === "application/xml") return true;
    return TEXT_EXTENSIONS.includes(extensionOf(name));
}

export function mergeAttachments(items: Attachment[]): string | undefined {
    const parts = items
        .map((a) => ({ ...a, text: a.text.trim() }))
        .filter((a) => a.text)
        .map((a) => (a.kind === "file" ? `--- ${a.name} ---\n${a.text}` : a.text));
    return parts.length ? parts.join("\n\n") : undefined;
}

export const sourceLength = (items: Attachment[]): number => (mergeAttachments(items) ?? "").length;

export function formatBytes(n: number): string {
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
    return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

let seq = 0;
export const nextAttachmentId = (): string => `a${++seq}`;

export interface ReadResult {
    attachment?: Attachment;
    error?: string;
}

export async function readAttachment(file: File): Promise<ReadResult> {
    if (!isReadableFile(file.name, file.type))
        return {
            error: `${file.name} isn't a text file — paste the text instead, or attach .txt, .md, .csv, or .json.`,
        };
    try {
        const text = await file.text();
        if (!text.trim()) return { error: `${file.name} is empty.` };
        return {
            attachment: { id: nextAttachmentId(), name: file.name, kind: "file", text },
        };
    } catch {
        return { error: `Couldn't read ${file.name}.` };
    }
}
