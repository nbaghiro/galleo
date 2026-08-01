import type { MediaGenStyle } from "@model/media";

export interface GeneratedImage {
    dataBase64: string;
    mime: string;
    width: number;
    height: number;
}

// a prior take fed back as the base image for refinement
export interface GenRef {
    data: string; // base64
    mime: string;
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
const VIDEO_MODEL = (): string => process.env.GEMINI_VIDEO_MODEL || "veo-3.1-fast-generate-preview";

export function imageGenReady(): boolean {
    return !!process.env.GOOGLE_API_KEY;
}

// same key as image gen; Veo needs the key's project on the paid tier (as does image gen)
export function videoGenReady(): boolean {
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

// aspect is sent as imageConfig and woven into the prompt, so it lands whether or not the model honors
// the field. With a ref image the prompt is an edit instruction — no style prefix (the image carries it).
async function generateOne(
    prompt: string,
    aspect: string | undefined,
    style: MediaGenStyle,
    ref?: GenRef,
): Promise<GeneratedImage | null> {
    const key = process.env.GOOGLE_API_KEY!;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL()}:generateContent`;
    const styled = `${STYLE_PREFIX[style]}${prompt}`;
    const parts = ref
        ? [{ inlineData: { mimeType: ref.mime, data: ref.data } }, { text: prompt }]
        : [{ text: `${styled} — aspect ratio ${aspect ?? "16:9"}, high detail` }];
    const body = {
        contents: [{ parts }],
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

export interface GeneratedVideo {
    dataBase64: string;
    mime: string;
    width: number;
    height: number;
}

interface VeoVideoRef {
    video?: { uri?: string };
}
interface VeoOperation {
    name?: string;
    done?: boolean;
    error?: { message?: string };
    response?: {
        generateVideoResponse?: { generatedSamples?: VeoVideoRef[] };
        generatedVideos?: VeoVideoRef[];
    };
}

const VIDEO_POLL_MS = 5000;
const VIDEO_TIMEOUT_MS = 6 * 60_000;
const GL_BASE = "https://generativelanguage.googleapis.com/v1beta";

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

// Veo is a long-running operation: start → poll (~1–3 min) → download the file-service uri
// (held ~2 days server-side, so the caller must persist the bytes). onPoll ticks each poll —
// the SSE route uses it to heartbeat progress. Returns null on timeout / empty result.
export async function generateVideo(
    prompt: string,
    aspect: "16:9" | "9:16" = "16:9",
    onPoll?: () => void | Promise<void>,
): Promise<GeneratedVideo | null> {
    const key = process.env.GOOGLE_API_KEY!;
    const start = await fetch(`${GL_BASE}/models/${VIDEO_MODEL()}:predictLongRunning`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({
            instances: [{ prompt }],
            parameters: { aspectRatio: aspect, resolution: "720p", durationSeconds: 8 },
        }),
    });
    const started = (await start.json().catch(() => ({}))) as VeoOperation;
    if (!start.ok || !started.name)
        throw new Error(started.error?.message || `video model ${start.status}`);

    const deadline = Date.now() + VIDEO_TIMEOUT_MS;
    let op: VeoOperation;
    for (;;) {
        await sleep(VIDEO_POLL_MS);
        await onPoll?.();
        const res = await fetch(`${GL_BASE}/${started.name}`, {
            headers: { "x-goog-api-key": key },
        });
        op = (await res.json().catch(() => ({}))) as VeoOperation;
        if (op.error?.message) throw new Error(op.error.message);
        if (op.done) break;
        if (Date.now() > deadline) return null;
    }
    const uri =
        op.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri ??
        op.response?.generatedVideos?.[0]?.video?.uri;
    if (!uri) return null;

    let dl = await fetch(uri, { headers: { "x-goog-api-key": key } });
    if (!dl.ok && !uri.includes("alt=media"))
        dl = await fetch(`${uri}${uri.includes("?") ? "&" : "?"}alt=media`, {
            headers: { "x-goog-api-key": key },
        });
    if (!dl.ok) throw new Error(`video download ${dl.status}`);
    const bytes = Buffer.from(await dl.arrayBuffer());
    const [w, h] = aspect === "9:16" ? [720, 1280] : [1280, 720];
    return {
        dataBase64: bytes.toString("base64"),
        mime: dl.headers.get("content-type") ?? "video/mp4",
        width: w,
        height: h,
    };
}

// yields each variation as it settles (not batched); a failed one yields null
export async function* streamImages(
    prompt: string,
    aspect: string | undefined,
    n: number,
    style: MediaGenStyle = "photo",
    ref?: GenRef,
): AsyncGenerator<GeneratedImage | null> {
    const count = Math.max(1, Math.min(4, n || 1));
    const pending = new Map<number, Promise<{ i: number; img: GeneratedImage | null }>>();
    for (let i = 0; i < count; i++)
        pending.set(
            i,
            generateOne(prompt, aspect, style, ref).then(
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
