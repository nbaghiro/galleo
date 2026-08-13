import { generateText } from "ai";
import {
    extractDocx,
    extractPdfText,
    extractXlsx,
    sniffFormat,
    MAX_DOC_BYTES,
    MAX_IMAGE_BYTES,
    SCANNED_CHARS_PER_PAGE,
} from "../utils/extract";
import { modelCall, providerReady } from "./ai/provider";
import { defaultModelFor } from "./models";
import { BODY_CAP } from "./context";

// The decision layer over the pure parsers: which formats are allowed, how large, when a file
// needs the model to be read (images, scanned PDFs), and the one output shape both upload
// surfaces consume. `read` is injectable like Embedder, so tests never call the model.

export interface ExtractInput {
    name: string;
    mime: string;
    data: string; // base64
}

export interface Extracted {
    title: string;
    text: string;
    truncated: boolean;
    via: "text" | "vision";
}

/** Typed failure the route maps to a status; anything else is a real 500. */
export class ExtractError extends Error {
    constructor(
        message: string,
        readonly status: 400 | 503,
    ) {
        super(message);
    }
}

export type ImageReader = (file: { data: string; mime: string }) => Promise<string>;

const READ_PROMPT =
    "Transcribe all text in this file verbatim. Then describe what it shows — for charts, the " +
    "series and approximate values; for diagrams, the structure and relationships; for photos, " +
    "what is depicted — as plain factual notes. No preamble.";

// the same call shape for an image and a scanned PDF; Gemini reads both natively
const geminiRead: ImageReader = async (file) => {
    const { model, providerOptions } = modelCall(defaultModelFor("extract"));
    const { text } = await generateText({
        model,
        ...(providerOptions ? { providerOptions } : {}),
        messages: [
            {
                role: "user",
                content: [
                    { type: "file", data: file.data, mediaType: file.mime },
                    { type: "text", text: READ_PROMPT },
                ],
            },
        ],
    });
    return text;
};

const needsModel = (): ExtractError =>
    new ExtractError(
        "reading this file needs the AI model, which isn't configured on this server",
        503,
    );

const finish = (title: string, text: string, via: "text" | "vision"): Extracted => {
    const body = text.trim();
    if (!body) throw new ExtractError(`No readable text was found in ${title}.`, 400);
    return {
        title,
        text: body.slice(0, BODY_CAP),
        truncated: body.length > BODY_CAP,
        via,
    };
};

export async function extractUpload(
    input: ExtractInput,
    read: ImageReader = geminiRead,
): Promise<Extracted> {
    const format = sniffFormat(input.name, input.mime);
    if (format === "legacy")
        throw new ExtractError(
            `Legacy ${input.name.slice(input.name.lastIndexOf("."))} isn't supported — save it as .docx, .xlsx, or CSV and re-attach.`,
            400,
        );
    if (format === "unsupported")
        throw new ExtractError(
            `${input.name} isn't a supported file — attach text, .pdf, .docx, .xlsx, or an image.`,
            400,
        );

    const bytes = Buffer.from(input.data, "base64");
    const cap = format === "image" ? MAX_IMAGE_BYTES : MAX_DOC_BYTES;
    if (bytes.byteLength > cap)
        throw new ExtractError(
            `That file is too large to read (limit ${Math.round(cap / 1_000_000)} MB).`,
            400,
        );

    if (format === "text") return finish(input.name, bytes.toString("utf-8"), "text");
    if (format === "docx") return finish(input.name, await extractDocx(bytes), "text");
    if (format === "xlsx") return finish(input.name, await extractXlsx(bytes), "text");
    if (format === "image") {
        if (!providerReady("google")) throw needsModel();
        return finish(input.name, await read({ data: input.data, mime: input.mime }), "vision");
    }

    // pdf: try the text layer; a scan (no layer) falls back to the model reading the same bytes
    const pdf = await extractPdfText(new Uint8Array(bytes)).catch(() => {
        throw new ExtractError(`${input.name} couldn't be opened — is it a valid PDF?`, 400);
    });
    if (pdf.charsPerPage >= SCANNED_CHARS_PER_PAGE) return finish(input.name, pdf.text, "text");
    if (!providerReady("google")) throw needsModel();
    return finish(input.name, await read({ data: input.data, mime: "application/pdf" }), "vision");
}
