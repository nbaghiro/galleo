// AI image generation behind POST /api/media/generate — Google's Gemini image models via the
// generativelanguage REST API (the GOOGLE_API_KEY already in .env). Model + endpoint move around
// (Imagen is being retired; the flash-image models are native), so both are env-overridable and the
// response parsing is defensive: we hunt the base64 image out of whatever part shape comes back.

import type { MediaGenStyle } from "@model/media";

export interface GeneratedImage {
    dataBase64: string;
    mime: string;
    width: number;
    height: number;
}

// Each generation style is woven into the prompt as a leading art-direction phrase (the model has no
// structured "style" field). "photo" adds nothing so the default stays a straight photographic render.
const STYLE_PREFIX: Record<MediaGenStyle, string> = {
    photo: "",
    illustration: "Flat vector illustration, clean bold shapes, minimal, of ",
    "3d": "Soft 3D render, studio lighting, rounded forms, of ",
    line: "Minimal single-weight line-art drawing, monochrome on white, of ",
    watercolor: "Loose watercolor painting, soft washes, textured paper, of ",
};

// Default to the current native image model; override with GEMINI_IMAGE_MODEL if Google moves it again.
const MODEL = (): string => process.env.GEMINI_IMAGE_MODEL || "gemini-2.5-flash-image";

export function imageGenReady(): boolean {
    return !!process.env.GOOGLE_API_KEY;
}

// Nominal pixel dimensions for an aspect label (the element sizes by aspect anyway; this is metadata).
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

// Pull the first inline image out of a candidate's parts, tolerating camelCase / snake_case shapes.
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

// One image per call — call n times in parallel for variations. Aspect is passed as imageConfig and also
// woven into the prompt, so it lands whether or not the model honors the structured field.
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

export async function generateImages(
    prompt: string,
    aspect: string | undefined,
    n: number,
    style: MediaGenStyle = "photo",
): Promise<GeneratedImage[]> {
    const count = Math.max(1, Math.min(4, n || 1));
    const results = await Promise.all(
        Array.from({ length: count }, () => generateOne(prompt, aspect, style).catch(() => null)),
    );
    return results.filter((r): r is GeneratedImage => r !== null);
}
