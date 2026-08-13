import JSZip from "jszip";
import { extractText } from "unpdf";
import { decodeEntities } from "./webpage";

// Pure byte→text parsers for uploaded files: PDF text layers (unpdf), and the OOXML pair
// (docx/xlsx are zips of XML — walked by hand on jszip; the chunker needs plain prose, not
// fidelity, so structure beyond paragraphs/rows is deliberately dropped). Db-free, network-free.

export type UploadFormat = "text" | "pdf" | "docx" | "xlsx" | "image" | "legacy" | "unsupported";

export const MAX_DOC_BYTES = 15_000_000;
export const MAX_IMAGE_BYTES = 8_000_000;
// below this average per page, a PDF is effectively a scan with no text layer
export const SCANNED_CHARS_PER_PAGE = 40;

const IMAGE_MIME = /^image\/(png|jpe?g|webp)$/;
const IMAGE_EXT = ["png", "jpg", "jpeg", "webp"];
const TEXT_EXT = /^(txt|md|markdown|csv|tsv|json|yaml|yml|html|htm|xml|rtf|log|vtt|srt)$/;

const extOf = (name: string): string =>
    name.includes(".") ? name.slice(name.lastIndexOf(".") + 1).toLowerCase() : "";

export function sniffFormat(name: string, mime: string): UploadFormat {
    const ext = extOf(name);
    if (mime === "application/pdf" || ext === "pdf") return "pdf";
    if (
        mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
        ext === "docx"
    )
        return "docx";
    if (
        mime === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
        ext === "xlsx" ||
        ext === "xlsm"
    )
        return "xlsx";
    if (IMAGE_MIME.test(mime) || IMAGE_EXT.includes(ext)) return "image";
    if (ext === "doc" || ext === "xls" || ext === "ppt") return "legacy";
    if (mime.startsWith("text/") || mime === "application/json" || TEXT_EXT.test(ext))
        return "text";
    return "unsupported";
}

export interface PdfText {
    text: string; // pages joined with blank lines, so the chunker sees paragraph boundaries
    pages: number;
    charsPerPage: number; // the scanned-PDF heuristic input
}

export async function extractPdfText(bytes: Uint8Array): Promise<PdfText> {
    const { totalPages, text } = await extractText(bytes);
    const joined = text
        .map((p) => p.trim())
        .filter(Boolean)
        .join("\n\n")
        .trim();
    return {
        text: joined,
        pages: totalPages,
        charsPerPage: totalPages ? joined.length / totalPages : 0,
    };
}

async function zipFile(zip: JSZip, path: string): Promise<string | null> {
    const entry = zip.file(path);
    return entry ? entry.async("string") : null;
}

// concatenate <w:t> runs; paragraphs, breaks, and tabs become the whitespace they mean
export async function extractDocx(bytes: Uint8Array): Promise<string> {
    const zip = await JSZip.loadAsync(bytes);
    const xml = await zipFile(zip, "word/document.xml");
    if (!xml) throw new Error("not a Word document");
    const text = xml
        .replace(/<w:tab\b[^>]*\/?>/g, "\t")
        .replace(/<w:br\b[^>]*\/?>/g, "\n")
        .replace(/<\/w:p>/g, "\n\n")
        // keep only the literal text runs; every other tag is structure
        .replace(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g, (_, t: string) => t)
        .replace(/<[^>]+>/g, "");
    return decodeEntities(text)
        .replace(/[ \t]+\n/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
}

const ROWS_PER_SHEET = 500;

// "B2" → column index 1; rows are explicit in the XML, columns can be sparse
const colIndex = (ref: string): number => {
    let n = 0;
    for (const ch of ref) {
        if (ch < "A" || ch > "Z") break;
        n = n * 26 + (ch.charCodeAt(0) - 64);
    }
    return Math.max(0, n - 1);
};

const csvCell = (v: string): string => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

function sheetRows(xml: string, shared: string[]): string[][] {
    const rows: string[][] = [];
    for (const rowMatch of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
        const cells: string[] = [];
        for (const c of rowMatch[1]!.matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>|<c\b([^>]*)\/>/g)) {
            const attrs = c[1] ?? c[3] ?? "";
            const inner = c[2] ?? "";
            const ref = /r="([A-Z]+)\d+"/.exec(attrs)?.[1] ?? "";
            const type = /t="(\w+)"/.exec(attrs)?.[1];
            let value = "";
            if (type === "inlineStr") {
                value = [...inner.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)]
                    .map((m) => m[1]!)
                    .join("");
            } else {
                const v = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1] ?? "";
                if (type === "s") value = shared[Number(v)] ?? "";
                else if (type === "b") value = v === "1" ? "TRUE" : "FALSE";
                else value = v; // n, str (formula cache), or untyped — dates stay as serials
            }
            const decoded = decodeEntities(value).trim();
            if (!decoded) continue;
            const at = ref ? colIndex(ref) : cells.length;
            while (cells.length < at) cells.push("");
            cells[at] = decoded;
        }
        if (cells.some((v) => v !== "")) rows.push(cells);
        if (rows.length >= ROWS_PER_SHEET) break;
    }
    return rows;
}

// one "## Sheet" block per sheet, rows as CSV lines — tabular data the retriever can quote
export async function extractXlsx(bytes: Uint8Array): Promise<string> {
    const zip = await JSZip.loadAsync(bytes);
    const workbook = await zipFile(zip, "xl/workbook.xml");
    if (!workbook) throw new Error("not a spreadsheet");
    const sharedXml = (await zipFile(zip, "xl/sharedStrings.xml")) ?? "";
    const shared = [...sharedXml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((si) =>
        decodeEntities(
            [...si[1]!.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => m[1]!).join(""),
        ),
    );
    const names = [...workbook.matchAll(/<sheet\b[^>]*name="([^"]*)"[^>]*\/?>/g)].map((m) =>
        decodeEntities(m[1]!),
    );
    const blocks: string[] = [];
    for (let i = 0; i < names.length; i++) {
        const xml = await zipFile(zip, `xl/worksheets/sheet${i + 1}.xml`);
        if (!xml) continue;
        const rows = sheetRows(xml, shared);
        if (!rows.length) continue;
        blocks.push(`## ${names[i]}\n${rows.map((r) => r.map(csvCell).join(",")).join("\n")}`);
    }
    return blocks.join("\n\n").trim();
}
