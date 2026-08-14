import { api } from "../api";

export interface Attachment {
    id: string;
    name: string;
    kind: "paste" | "file" | "link" | "artifact"; // artifact = a library piece or a template
    ref?: string; // link only: the fetched page's final URL
    text: string;
    // server-extracted binaries keep their bytes, so a context item can store the real file
    original?: { data: string; mime: string };
}

export const ATTACH_ICON: Record<Attachment["kind"], string> = {
    file: "doc",
    paste: "text",
    link: "link",
    artifact: "library",
};

// the "+" menu's source rows — one canonical label set, shared by every attach surface
export interface SourceOption {
    id: "files" | "paste" | "link" | "artifact";
    icon: string;
    label: string;
    tag: string;
}

export const SOURCE_OPTIONS: SourceOption[] = [
    { id: "files", icon: ATTACH_ICON.file, label: "Upload files", tag: ".txt .md .csv…" },
    { id: "paste", icon: ATTACH_ICON.paste, label: "Paste text", tag: "docs · email · slack" },
    { id: "link", icon: ATTACH_ICON.link, label: "Add a link", tag: "page → text" },
    {
        id: "artifact",
        icon: ATTACH_ICON.artifact,
        label: "Galleo artifact",
        tag: "library · template",
    },
];

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

// formats the server can read for us (POST /extract): parsed docs, and model-read images
const EXTRACT_EXTENSIONS = ["pdf", "docx", "xlsx", "xlsm", "png", "jpg", "jpeg", "webp"];
const EXTRACT_MIMES = [
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "image/png",
    "image/jpeg",
    "image/webp",
];

// documents cap at 15 MB server-side; the pre-check saves uploading a file that would bounce
export const EXTRACT_MAX_BYTES = 15_000_000;

// both file inputs share this, so the dialogs can't drift from what the gates accept
export const ACCEPT = [
    ...TEXT_EXTENSIONS.map((e) => `.${e}`),
    ...EXTRACT_EXTENSIONS.map((e) => `.${e}`),
    "text/*",
].join(",");

export const extensionOf = (name: string): string =>
    name.includes(".") ? name.slice(name.lastIndexOf(".") + 1).toLowerCase() : "";

// read in the browser, so anything that isn't text arrives as mojibake
export function isReadableFile(name: string, type: string): boolean {
    if (type.startsWith("text/")) return true;
    if (type === "application/json" || type === "application/xml") return true;
    return TEXT_EXTENSIONS.includes(extensionOf(name));
}

// needs the server to read it (binary formats; browsers often hand back an empty MIME)
export function isExtractableFile(name: string, type: string): boolean {
    if (EXTRACT_MIMES.includes(type)) return true;
    return EXTRACT_EXTENSIONS.includes(extensionOf(name));
}

export function mergeAttachments(items: Attachment[]): string | undefined {
    const parts = items
        .map((a) => ({ ...a, text: a.text.trim() }))
        .filter((a) => a.text)
        .map((a) => {
            if (a.kind === "file") return `--- ${a.name} ---\n${a.text}`;
            if (a.kind === "link") return `--- ${a.name} (${a.ref ?? "web page"}) ---\n${a.text}`;
            if (a.kind === "artifact") return `--- ${a.name} (a Galleo artifact) ---\n${a.text}`;
            return a.text;
        });
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

const base64Of = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
        const reader = new FileReader();
        // data:<mime>;base64,<payload> — the server wants only the payload
        reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
        reader.onerror = () => reject(new Error("read failed"));
        reader.readAsDataURL(file);
    });

export async function readAttachment(file: File): Promise<ReadResult> {
    if (isReadableFile(file.name, file.type)) {
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
    if (isExtractableFile(file.name, file.type)) {
        if (file.size > EXTRACT_MAX_BYTES)
            return {
                error: `${file.name} is too large to read (limit ${Math.round(EXTRACT_MAX_BYTES / 1_000_000)} MB).`,
            };
        try {
            const data = await base64Of(file);
            const { text } = await api.extractFile({ name: file.name, mime: file.type, data });
            return {
                attachment: {
                    id: nextAttachmentId(),
                    name: file.name,
                    kind: "file",
                    text,
                    original: { data, mime: file.type || "application/octet-stream" },
                },
            };
        } catch (e) {
            return {
                error: e instanceof Error ? e.message : `Couldn't read ${file.name}.`,
            };
        }
    }
    return {
        error: `${file.name} isn't a supported file — attach text (.txt, .md, .csv…), .pdf, .docx, .xlsx, or an image.`,
    };
}
