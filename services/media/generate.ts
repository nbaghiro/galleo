import type { MediaGenStyle } from "@model/media";

export interface GeneratedImage {
    dataBase64: string;
    mime: string;
    width: number;
    height: number;
}

// woven into the prompt as a leading phrase (no structured "style" field); "photo" is intentionally empty
const STYLE_PREFIX: Record<MediaGenStyle, string> = {
    photo: "",
    illustration: "Flat vector illustration, clean bold shapes, minimal, of ",
    "3d": "Soft 3D render, studio lighting, rounded forms, of ",
    line: "Minimal single-weight line-art drawing, monochrome on white, of ",
    watercolor: "Loose watercolor painting, soft washes, textured paper, of ",
};

const MODEL = (): string => process.env.GEMINI_IMAGE_MODEL || "gemini-3.1-flash-image";

export function imageGenReady(): boolean {
    return !!process.env.GOOGLE_API_KEY;
}

// nominal dims for an aspect label — metadata only (the element sizes by aspect)
function dims(aspect: string | undefined): { width: number; height: number } {
    const [w, h] = (aspect ?? "16:9").split(":").map(Number);
    if (!w || !h) return { width: 1536, height: 1024 };
    const base = 1536;
    return w >= h
        ? { width: base, height: Math.round((base * h) / w) }
        : { width: Math.round((base * w) / h), height: base };
}

interface InlineData {
    data?: string;
    mimeType?: string;
    mime_type?: string;
}
interface GeminiPart {
    text?: string;
    inlineData?: InlineData;
    inline_data?: InlineData;
}
interface GeminiResponse {
    candidates?: { content?: { parts?: GeminiPart[] } }[];
    error?: { message?: string };
}

// tolerates camelCase / snake_case part shapes
function extractImage(json: GeminiResponse): { data: string; mime: string } | null {
    for (const cand of json.candidates ?? []) {
        for (const part of cand.content?.parts ?? []) {
            const inline = part.inlineData ?? part.inline_data;
            const data = inline?.data;
            if (data) return { data, mime: inline?.mimeType ?? inline?.mime_type ?? "image/png" };
        }
    }
    return null;
}

// aspect is sent as imageConfig and woven into the prompt, so it lands whether or not the model honors the field
async function generateOne(
    prompt: string,
    aspect: string | undefined,
    style: MediaGenStyle,
): Promise<GeneratedImage | null> {
    const key = process.env.GOOGLE_API_KEY!;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL()}:generateContent`;
    const styled = `${STYLE_PREFIX[style]}${prompt}`;
    const body = {
        contents: [
            { parts: [{ text: `${styled} — aspect ratio ${aspect ?? "16:9"}, high detail` }] },
        ],
        generationConfig: {
            responseModalities: ["IMAGE"],
            imageConfig: aspect ? { aspectRatio: aspect } : undefined,
        },
    };
    const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify(body),
    });
    const json = (await res.json().catch(() => ({}))) as GeminiResponse;
    if (!res.ok) throw new Error(json.error?.message || `image model ${res.status}`);
    const img = extractImage(json);
    if (!img) return null;
    return { dataBase64: img.data, mime: img.mime, ...dims(aspect) };
}

// never throws — returns null on failure so generation falls back to stock
export async function generateImage(
    prompt: string,
    aspect: string | undefined,
    style: MediaGenStyle = "photo",
): Promise<GeneratedImage | null> {
    return generateOne(prompt, aspect, style).catch(() => null);
}

// yields each variation as it settles (not batched); a failed one yields null
export async function* streamImages(
    prompt: string,
    aspect: string | undefined,
    n: number,
    style: MediaGenStyle = "photo",
): AsyncGenerator<GeneratedImage | null> {
    const count = Math.max(1, Math.min(4, n || 1));
    const pending = new Map<number, Promise<{ i: number; img: GeneratedImage | null }>>();
    for (let i = 0; i < count; i++)
        pending.set(
            i,
            generateOne(prompt, aspect, style).then(
                (img) => ({ i, img }),
                () => ({ i, img: null }),
            ),
        );
    while (pending.size) {
        const { i, img } = await Promise.race(pending.values());
        pending.delete(i);
        yield img;
    }
}
