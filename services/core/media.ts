import { and, desc, eq, isNotNull, ne, sql } from "drizzle-orm";
import type {
    IconItem,
    IconPick,
    MediaAttribution,
    MediaGenStyle,
    MediaItem,
    MediaKind,
    MediaProvider,
    MediaSource,
} from "@model/media";
import { KIND_PROVIDERS } from "@model/media";
import type { FeatureOverrides, ModelTier } from "@model/billing";
import { featuresFor, isUnlimited } from "@model/billing";
import { db } from "../db/client";
import { schema } from "../db/schema";

// Everything media: the stock/icon provider proxies, AI image + video generation, and the workspace
// asset library those write into. api/media.ts is the HTTP surface over this.

const KEYS = {
    unsplash: () => process.env.UNSPLASH_ACCESS_KEY,
    pexels: () => process.env.PEXELS_API_KEY,
    pixabay: () => process.env.PIXABAY_API_KEY,
};

export function stockReady(): Record<MediaProvider, boolean> {
    return {
        openverse: true, // keyless — always available
        unsplash: !!KEYS.unsplash(),
        pexels: !!KEYS.pexels(),
        pixabay: !!KEYS.pixabay(),
    };
}

const PER_PAGE = 30;

export interface StockResult {
    items: MediaItem[];
    hasMore: boolean;
}

// provider response shapes (only the fields we read)
interface UnsplashPhoto {
    id: string;
    width: number;
    height: number;
    alt_description: string | null;
    urls: { regular: string; small: string };
    user: { name: string; links: { html: string } };
    links: { html: string; download_location: string };
}
interface PexelsPhoto {
    id: number;
    width: number;
    height: number;
    alt: string | null;
    url: string;
    photographer: string;
    photographer_url: string;
    src: { large2x?: string; large?: string; medium: string };
}
interface PixabayHit {
    id: number;
    imageWidth: number;
    imageHeight: number;
    tags: string;
    user: string;
    pageURL: string;
    webformatURL: string;
    largeImageURL: string;
}
interface PexelsVideoFile {
    link: string;
    file_type: string;
    width: number | null;
}
interface PexelsVideo {
    id: number;
    width: number;
    height: number;
    url: string;
    image: string; // poster frame
    user: { name: string; url: string };
    video_files: PexelsVideoFile[];
}
interface PixabayVideoSize {
    url: string;
    width: number;
    height: number;
    thumbnail: string;
}
interface PixabayVideoHit {
    id: number;
    tags: string;
    user: string;
    pageURL: string;
    videos: Partial<Record<"large" | "medium" | "small" | "tiny", PixabayVideoSize>>;
}
interface OpenversePhoto {
    id: string;
    url: string;
    thumbnail: string;
    width: number | null;
    height: number | null;
    title: string | null;
    creator: string | null;
    creator_url: string | null;
    foreign_landing_url: string | null;
    source: string | null;
}

// orientation values differ per provider
function orient(provider: MediaProvider, o: string | undefined): string | undefined {
    if (!o) return undefined;
    if (provider === "unsplash") return o === "square" ? "squarish" : o;
    if (provider === "pixabay")
        return o === "landscape" ? "horizontal" : o === "portrait" ? "vertical" : "all";
    return o; // pexels uses landscape|portrait|square directly
}

async function searchUnsplash(q: string, page: number, o?: string): Promise<StockResult> {
    const key = KEYS.unsplash()!;
    const u = new URL("https://api.unsplash.com/search/photos");
    u.searchParams.set("query", q);
    u.searchParams.set("page", String(page));
    u.searchParams.set("per_page", String(PER_PAGE));
    if (o) u.searchParams.set("orientation", o);
    const res = await fetch(u, { headers: { Authorization: `Client-ID ${key}` } });
    if (!res.ok) throw new Error(`unsplash ${res.status}`);
    const json = (await res.json()) as { results: UnsplashPhoto[]; total_pages: number };
    const items: MediaItem[] = json.results.map((p) => ({
        id: p.id,
        source: "stock",
        url: p.urls.regular,
        thumbUrl: p.urls.small,
        width: p.width,
        height: p.height,
        alt: p.alt_description ?? undefined,
        attribution: {
            provider: "Unsplash",
            author: p.user.name,
            authorUrl: `${p.user.links.html}?utm_source=galleo&utm_medium=referral`,
            sourceUrl: `${p.links.html}?utm_source=galleo&utm_medium=referral`,
            downloadLocation: p.links.download_location,
        },
    }));
    return { items, hasMore: page < json.total_pages };
}

async function searchPexels(q: string, page: number, o?: string): Promise<StockResult> {
    const key = KEYS.pexels()!;
    const u = new URL("https://api.pexels.com/v1/search");
    u.searchParams.set("query", q);
    u.searchParams.set("page", String(page));
    u.searchParams.set("per_page", String(PER_PAGE));
    if (o) u.searchParams.set("orientation", o);
    const res = await fetch(u, { headers: { Authorization: key } });
    if (!res.ok) throw new Error(`pexels ${res.status}`);
    const json = (await res.json()) as { photos: PexelsPhoto[]; next_page?: string };
    const items: MediaItem[] = json.photos.map((p) => ({
        id: String(p.id),
        source: "stock",
        url: p.src.large2x ?? p.src.large ?? p.src.medium,
        thumbUrl: p.src.medium,
        width: p.width,
        height: p.height,
        alt: p.alt ?? undefined,
        attribution: {
            provider: "Pexels",
            author: p.photographer,
            authorUrl: p.photographer_url,
            sourceUrl: p.url,
        },
    }));
    return { items, hasMore: !!json.next_page };
}

async function searchPixabay(
    q: string,
    page: number,
    o?: string,
    kind: MediaKind = "photo",
): Promise<StockResult> {
    const key = KEYS.pixabay()!;
    const u = new URL("https://pixabay.com/api/");
    u.searchParams.set("key", key);
    u.searchParams.set("q", q);
    u.searchParams.set("page", String(page));
    u.searchParams.set("per_page", String(PER_PAGE));
    // vector ≈ sticker-friendly clipart (transparent-friendly, delivered as PNG)
    u.searchParams.set(
        "image_type",
        kind === "illustration" ? "illustration" : kind === "sticker" ? "vector" : "photo",
    );
    if (o) u.searchParams.set("orientation", o);
    const res = await fetch(u);
    if (!res.ok) throw new Error(`pixabay ${res.status}`);
    const json = (await res.json()) as { hits: PixabayHit[]; totalHits: number };
    const items: MediaItem[] = json.hits.map((h) => ({
        id: String(h.id),
        source: "stock",
        url: h.largeImageURL,
        thumbUrl: h.webformatURL,
        width: h.imageWidth,
        height: h.imageHeight,
        alt: h.tags,
        attribution: { provider: "Pixabay", author: h.user, sourceUrl: h.pageURL },
    }));
    return { items, hasMore: page * PER_PAGE < json.totalHits };
}

// mid-size mp4: sharp enough inline, small enough to stream instantly
function bestPexelsFile(files: PexelsVideoFile[]): string | undefined {
    const mp4 = files.filter((f) => f.file_type === "video/mp4" && f.width);
    mp4.sort((a, b) => Math.abs((a.width ?? 0) - 1280) - Math.abs((b.width ?? 0) - 1280));
    return mp4[0]?.link;
}

async function searchPexelsVideos(q: string, page: number, o?: string): Promise<StockResult> {
    const key = KEYS.pexels()!;
    const u = new URL("https://api.pexels.com/videos/search");
    u.searchParams.set("query", q);
    u.searchParams.set("page", String(page));
    u.searchParams.set("per_page", String(PER_PAGE));
    if (o) u.searchParams.set("orientation", o);
    const res = await fetch(u, { headers: { Authorization: key } });
    if (!res.ok) throw new Error(`pexels ${res.status}`);
    const json = (await res.json()) as { videos: PexelsVideo[]; next_page?: string };
    const items: MediaItem[] = json.videos.flatMap((v) => {
        const file = bestPexelsFile(v.video_files);
        if (!file) return [];
        return [
            {
                id: String(v.id),
                source: "stock" as const,
                url: file,
                thumbUrl: v.image,
                width: v.width,
                height: v.height,
                attribution: {
                    provider: "Pexels",
                    author: v.user.name,
                    authorUrl: v.user.url,
                    sourceUrl: v.url,
                },
            },
        ];
    });
    return { items, hasMore: !!json.next_page };
}

async function searchPixabayVideos(q: string, page: number): Promise<StockResult> {
    const key = KEYS.pixabay()!;
    const u = new URL("https://pixabay.com/api/videos/");
    u.searchParams.set("key", key);
    u.searchParams.set("q", q);
    u.searchParams.set("page", String(page));
    u.searchParams.set("per_page", String(PER_PAGE));
    const res = await fetch(u);
    if (!res.ok) throw new Error(`pixabay ${res.status}`);
    const json = (await res.json()) as { hits: PixabayVideoHit[]; totalHits: number };
    const items: MediaItem[] = json.hits.flatMap((h) => {
        const v = h.videos.medium ?? h.videos.small ?? h.videos.large ?? h.videos.tiny;
        if (!v) return [];
        return [
            {
                id: String(h.id),
                source: "stock" as const,
                url: v.url,
                thumbUrl: v.thumbnail,
                width: v.width,
                height: v.height,
                alt: h.tags,
                attribution: { provider: "Pixabay", author: h.user, sourceUrl: h.pageURL },
            },
        ];
    });
    return { items, hasMore: page * PER_PAGE < json.totalHits };
}

const OPENVERSE_PAGE_SIZE = 20; // anonymous requests are capped here (page_size=30 → 401)

function openverseKind(u: URL, kind: MediaKind): void {
    if (kind === "gif") u.searchParams.set("extension", "gif");
    else if (kind === "illustration") u.searchParams.set("category", "illustration");
    else if (kind === "sticker") u.searchParams.set("extension", "png"); // best-effort transparent cutouts
    // "photo" → no filter
}

async function searchOpenverse(
    q: string,
    page: number,
    o?: string,
    kind: MediaKind = "photo",
): Promise<StockResult> {
    const u = new URL("https://api.openverse.org/v1/images/");
    u.searchParams.set("q", q);
    u.searchParams.set("page", String(page));
    u.searchParams.set("page_size", String(OPENVERSE_PAGE_SIZE));
    u.searchParams.set("license_type", "commercial,modification"); // freely usable in a deck / site
    if (o) u.searchParams.set("aspect_ratio", o);
    openverseKind(u, kind);
    const res = await fetch(u, {
        headers: { Accept: "application/json", "User-Agent": "Galleo/1.0 (+https://galleo.app)" },
    });
    if (!res.ok) throw new Error(`openverse ${res.status}`);
    const json = (await res.json()) as { results: OpenversePhoto[]; page_count: number };
    const items: MediaItem[] = json.results
        .filter((r) => r.url && r.thumbnail)
        .map((r) => ({
            id: r.id,
            source: "stock",
            url: r.url,
            thumbUrl: r.thumbnail,
            width: r.width ?? 0,
            height: r.height ?? 0,
            alt: r.title ?? undefined,
            attribution: {
                provider: "Openverse",
                author: r.creator ?? undefined,
                authorUrl: r.creator_url ?? undefined,
                sourceUrl: r.foreign_landing_url ?? undefined,
            },
        }));
    return { items, hasMore: page < json.page_count };
}

export async function searchStock(
    provider: MediaProvider,
    q: string,
    page: number,
    orientation?: string,
    kind: MediaKind = "photo",
): Promise<StockResult> {
    if (!stockReady()[provider] || !KIND_PROVIDERS[kind].includes(provider))
        return { items: [], hasMore: false };
    if (kind === "video")
        return provider === "pexels"
            ? searchPexelsVideos(q, page, orient(provider, orientation))
            : searchPixabayVideos(q, page);
    if (provider === "openverse")
        return searchOpenverse(
            q,
            page,
            orientation === "square"
                ? "square"
                : orientation === "portrait"
                  ? "tall"
                  : orientation === "landscape"
                    ? "wide"
                    : undefined,
            kind,
        );
    const o = orient(provider, orientation);
    if (provider === "unsplash") return searchUnsplash(q, page, o);
    if (provider === "pexels") return searchPexels(q, page, o);
    return searchPixabay(q, page, o, kind);
}

// Unsplash API guidelines require pinging the download-trigger when a photo is used; fire-and-forget
export async function fireDownloadTrigger(downloadLocation: string | undefined): Promise<void> {
    const key = KEYS.unsplash();
    if (!downloadLocation || !key) return;
    try {
        await fetch(downloadLocation, { headers: { Authorization: `Client-ID ${key}` } });
    } catch {
        // best-effort; must not break the user's pick
    }
}

const BASE = "https://api.iconify.design";
const UA = { "User-Agent": "Galleo/1.0 (+https://galleo.app)" };

export async function searchIcons(
    q: string,
    limit = 60,
): Promise<{ icons: IconItem[]; total: number }> {
    const u = new URL(`${BASE}/search`);
    u.searchParams.set("query", q);
    u.searchParams.set("limit", String(Math.min(120, Math.max(1, limit))));
    const res = await fetch(u, { headers: UA });
    if (!res.ok) throw new Error(`iconify ${res.status}`);
    const json = (await res.json()) as { icons?: string[]; total?: number };
    return { icons: (json.icons ?? []).map((id) => ({ id })), total: json.total ?? 0 };
}

export async function getIcon(id: string): Promise<IconPick | null> {
    const [prefix, name] = id.split(":");
    if (!prefix || !name) return null;
    const res = await fetch(`${BASE}/${prefix}.json?icons=${encodeURIComponent(name)}`, {
        headers: UA,
    });
    if (!res.ok) throw new Error(`iconify ${res.status}`);
    const json = (await res.json()) as {
        icons?: Record<string, { body: string; width?: number; height?: number }>;
        width?: number;
        height?: number;
    };
    const ic = json.icons?.[name];
    if (!ic) return null;
    return {
        id,
        body: ic.body,
        width: ic.width ?? json.width ?? 24,
        height: ic.height ?? json.height ?? 24,
    };
}

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

// woven into the prompt as a leading phrase; "photo" is intentionally empty
const STYLE_PREFIX: Record<MediaGenStyle, string> = {
    photo: "",
    illustration: "Flat vector illustration, clean bold shapes, minimal, of ",
    "3d": "Soft 3D render, studio lighting, rounded forms, of ",
    line: "Minimal single-weight line-art drawing, monochrome on white, of ",
    watercolor: "Loose watercolor painting, soft washes, textured paper, of ",
};

const BASE_IMAGE_MODEL = "gemini-3.1-flash-image";
// basic tier always renders on the base model; paid tiers use the (possibly better) env override
const MODEL = (tier?: ModelTier): string =>
    tier === "basic" ? BASE_IMAGE_MODEL : process.env.GEMINI_IMAGE_MODEL || BASE_IMAGE_MODEL;
const VIDEO_MODEL = (): string => process.env.GEMINI_VIDEO_MODEL || "veo-3.1-fast-generate-preview";

export function imageGenReady(): boolean {
    return !!process.env.GOOGLE_API_KEY;
}

// same key as image gen; Veo needs the key's project on the paid tier
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

// aspect goes in imageConfig AND the prompt, so it lands whether or not the model honors the field;
// with a ref image the prompt is an edit instruction, so no style prefix (the image carries it)
async function generateOne(
    prompt: string,
    aspect: string | undefined,
    style: MediaGenStyle,
    ref?: GenRef,
    tier?: ModelTier,
): Promise<GeneratedImage | null> {
    const key = process.env.GOOGLE_API_KEY!;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL(tier)}:generateContent`;
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
    tier?: ModelTier,
    ref?: GenRef,
): Promise<GeneratedImage | null> {
    return generateOne(prompt, aspect, style, ref, tier).catch(() => null);
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

// Veo is a long-running operation: start → poll → download; the uri is held ~2 days, so the caller
// must persist the bytes. onPoll ticks each poll (the SSE route heartbeats with it); null on timeout.
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
    tier?: ModelTier,
): AsyncGenerator<GeneratedImage | null> {
    const count = Math.max(1, Math.min(4, n || 1));
    const pending = new Map<number, Promise<{ i: number; img: GeneratedImage | null }>>();
    for (let i = 0; i < count; i++)
        pending.set(
            i,
            generateOne(prompt, aspect, style, ref, tier).then(
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

// ---- the workspace asset library

const MB = 1024 * 1024;
export const RECENT_LIMIT = 48;
export const assetUrl = (id: string): string => `/api/media/asset/${id}`;

export interface AssetMeta {
    attribution?: MediaAttribution;
    prompt?: string;
    thumbUrl?: string;
}

export interface WorkspaceStorage {
    id: string;
    plan: string | null;
    featureOverrides?: FeatureOverrides | null;
}

// Stored bytes only — stock rows reference the provider CDN (data/bytes stay null) and cost nothing.
export async function storageFull(ws: WorkspaceStorage, incoming = 0): Promise<boolean> {
    const capMb = featuresFor(ws).storageMb;
    if (isUnlimited(capMb)) return false;
    const [row] = await db
        .select({ total: sql<string>`COALESCE(SUM(${schema.assets.bytes}), 0)` })
        .from(schema.assets)
        .where(and(eq(schema.assets.workspaceId, ws.id), isNotNull(schema.assets.data)));
    return Number(row?.total ?? 0) + incoming > capMb * MB;
}

type AssetRow = typeof schema.assets.$inferSelect;

export function toItem(row: AssetRow): MediaItem {
    const meta = (row.meta ?? {}) as AssetMeta;
    return {
        id: row.id,
        source: row.source as MediaSource,
        url: row.url,
        thumbUrl: meta.thumbUrl ?? row.url,
        width: row.width ?? 0,
        height: row.height ?? 0,
        alt: row.alt ?? undefined,
        prompt: meta.prompt,
        attribution: meta.attribution,
    };
}

export async function refImage(workspaceId: string, refId: string): Promise<GenRef | null> {
    const [a] = await db
        .select({ data: schema.assets.data, mime: schema.assets.mime })
        .from(schema.assets)
        .where(and(eq(schema.assets.id, refId), eq(schema.assets.workspaceId, workspaceId)));
    return a?.data ? { data: a.data, mime: a.mime ?? "image/png" } : null;
}

// Stores a generated image or clip and returns the picker item for it.
export async function storeGenerated(
    workspaceId: string,
    kind: "image" | "video",
    media: { dataBase64: string; mime: string; width: number; height: number },
    prompt: string,
): Promise<MediaItem> {
    const id = crypto.randomUUID();
    const alt = prompt.slice(0, 160);
    const meta: AssetMeta = { prompt };
    await db.insert(schema.assets).values({
        id,
        workspaceId,
        kind,
        source: "generated",
        url: assetUrl(id),
        width: media.width,
        height: media.height,
        bytes: Buffer.from(media.dataBase64, "base64").length,
        alt,
        meta,
        data: media.dataBase64,
        mime: media.mime,
    });
    return {
        id,
        source: "generated",
        url: assetUrl(id),
        thumbUrl: assetUrl(id),
        width: media.width,
        height: media.height,
        alt,
        prompt,
    };
}

export async function storeUpload(
    workspaceId: string,
    body: { data: string; mime: string; name?: string; width?: number; height?: number },
): Promise<MediaItem> {
    const id = crypto.randomUUID();
    await db.insert(schema.assets).values({
        id,
        workspaceId,
        kind: "image",
        source: "upload",
        url: assetUrl(id),
        width: body.width ?? null,
        height: body.height ?? null,
        bytes: Buffer.from(body.data, "base64").length,
        alt: body.name ?? null,
        meta: {},
        data: body.data,
        mime: body.mime,
    });
    return {
        id,
        source: "upload",
        url: assetUrl(id),
        thumbUrl: assetUrl(id),
        width: body.width ?? 0,
        height: body.height ?? 0,
        alt: body.name,
    };
}

const STORED_URL = /\/media\/asset\/([0-9a-f-]{36})$/i;

// Stock also fires the Unsplash download trigger, which their API terms require.
export async function useItem(workspaceId: string, item: MediaItem): Promise<void> {
    const storedId = STORED_URL.exec(item.url)?.[1];
    if (storedId) {
        // Already in the library — bump to the top of Recent.
        await db
            .update(schema.assets)
            .set({ createdAt: new Date() })
            .where(and(eq(schema.assets.workspaceId, workspaceId), eq(schema.assets.id, storedId)));
        return;
    }
    if (item.source !== "stock") return;
    void fireDownloadTrigger(item.attribution?.downloadLocation);
    // Dedupe: a re-used photo moves to the top rather than stacking duplicates.
    await db
        .delete(schema.assets)
        .where(and(eq(schema.assets.workspaceId, workspaceId), eq(schema.assets.url, item.url)));
    const meta: AssetMeta = { attribution: item.attribution, thumbUrl: item.thumbUrl };
    await db.insert(schema.assets).values({
        id: crypto.randomUUID(),
        workspaceId,
        kind: "image",
        source: "stock",
        url: item.url,
        width: item.width || null,
        height: item.height || null,
        bytes: null,
        alt: item.alt ?? null,
        meta,
        data: null,
        mime: null,
    });
}

// image recents only — the picker's Recent tab renders <img> tiles (no video surface there)
export async function recentAssets(workspaceId: string): Promise<MediaItem[]> {
    const rows = await db
        .select()
        .from(schema.assets)
        .where(and(eq(schema.assets.workspaceId, workspaceId), ne(schema.assets.kind, "video")))
        .orderBy(desc(schema.assets.createdAt))
        .limit(RECENT_LIMIT);
    return rows.map(toItem);
}

export async function readAssetBytes(
    id: string,
): Promise<{ data: string; mime: string | null } | null> {
    const [a] = await db
        .select({ data: schema.assets.data, mime: schema.assets.mime })
        .from(schema.assets)
        .where(eq(schema.assets.id, id));
    return a?.data ? { data: a.data, mime: a.mime } : null;
}
