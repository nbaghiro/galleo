import { createHash } from "node:crypto";
import { and, desc, eq, ilike, inArray, isNotNull, lt, notExists, or, sql } from "drizzle-orm";
import type {
    AssetMeta,
    MediaCredit,
    IconItem,
    IconPick,
    MediaGenStyle,
    MediaItem,
    MediaKind,
    MediaProvider,
    MediaSource,
} from "@model/media";
import { assetIdFromUrl, assetUrl, isEmbedVideoUrl, KIND_PROVIDERS } from "@model/media";
import { mapMediaRefs, mediaRefKinds, mediaRefs } from "@model/artifact";
import type { FeatureOverrides, ModelTier } from "@model/billing";
import { featuresFor, isUnlimited } from "@model/billing";
import type { Db } from "@services/db/client";
import { db } from "@services/db/client";
import { schema } from "@services/db/schema";

// Everything media: the stock/icon provider proxies, AI image + video generation, and the workspace
// asset library those write into. api/media.ts is the HTTP surface over this.

const KEYS = {
    unsplash: () => process.env.UNSPLASH_ACCESS_KEY,
    pexels: () => process.env.PEXELS_API_KEY,
    pixabay: () => process.env.PIXABAY_API_KEY,
    giphy: () => process.env.GIPHY_API_KEY,
};

export function stockReady(): Record<MediaProvider, boolean> {
    return {
        openverse: true, // keyless — always available
        unsplash: !!KEYS.unsplash(),
        pexels: !!KEYS.pexels(),
        pixabay: !!KEYS.pixabay(),
        giphy: !!KEYS.giphy(),
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

interface GiphyImage {
    url: string;
    width: string;
    height: string;
}
interface GiphyGif {
    id: string;
    title: string;
    url: string;
    username: string;
    images: { original: GiphyImage; fixed_width?: GiphyImage; downsized?: GiphyImage };
}

// Giphy pages by offset rather than page number, and serves stickers from a sibling endpoint: the
// same objects, cut out on transparency.
async function searchGiphy(q: string, page: number, kind: MediaKind): Promise<StockResult> {
    const path = kind === "sticker" ? "stickers" : "gifs";
    const u = new URL(`https://api.giphy.com/v1/${path}/search`);
    u.searchParams.set("api_key", KEYS.giphy()!);
    u.searchParams.set("q", q);
    u.searchParams.set("limit", String(PER_PAGE));
    u.searchParams.set("offset", String((page - 1) * PER_PAGE));
    u.searchParams.set("rating", "pg-13");
    u.searchParams.set("bundle", "messaging_non_clips");
    const res = await fetch(u);
    if (!res.ok) throw new Error(`giphy ${res.status}`);
    const json = (await res.json()) as {
        data: GiphyGif[];
        pagination?: { total_count?: number; count?: number; offset?: number };
    };
    const items: MediaItem[] = json.data.flatMap((g) => {
        const full = g.images.original;
        if (!full?.url) return [];
        return [
            {
                id: g.id,
                source: "stock" as const,
                url: full.url,
                thumbUrl: g.images.fixed_width?.url ?? g.images.downsized?.url ?? full.url,
                width: Number(full.width) || 0,
                height: Number(full.height) || 0,
                alt: g.title || undefined,
                // Giphy's terms ask for the mark and a link back to the gif's page
                attribution: {
                    provider: "GIPHY",
                    author: g.username || undefined,
                    sourceUrl: g.url,
                },
            },
        ];
    });
    const p = json.pagination;
    const seen = (p?.offset ?? 0) + (p?.count ?? items.length);
    return { items, hasMore: seen < (p?.total_count ?? 0) };
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
    if (provider === "giphy") return searchGiphy(q, page, kind);
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

const MB = 1024 * 1024;
export const LIBRARY_LIMIT = 48;

export interface WorkspaceStorage {
    id: string;
    plan: string | null;
    featureOverrides?: FeatureOverrides | null;
}

// Stored bytes only — adopted rows point at `origin` (data/bytes stay null) and cost nothing, so
// assetifying a template's placeholders or a deck's stock photos never eats anyone's quota.
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
    const meta = row.meta ?? {};
    const url = assetUrl(row.id);
    return {
        id: row.id,
        source: row.source as MediaSource,
        url,
        thumbUrl: meta.thumbUrl ?? url,
        width: row.width ?? 0,
        height: row.height ?? 0,
        alt: row.alt ?? undefined,
        prompt: meta.prompt,
        attribution: meta.attribution,
    };
}

const sha256Of = (base64: string): string =>
    createHash("sha256").update(Buffer.from(base64, "base64")).digest("hex");

export async function refImage(workspaceId: string, refId: string): Promise<GenRef | null> {
    const [a] = await db
        .select({ data: schema.assets.data, mime: schema.assets.mime })
        .from(schema.assets)
        .where(and(eq(schema.assets.id, refId), eq(schema.assets.workspaceId, workspaceId)));
    return a?.data ? { data: a.data, mime: a.mime ?? "image/png" } : null;
}

async function byDigest(
    workspaceId: string,
    sha256: string,
    tx: Db = db,
): Promise<AssetRow | undefined> {
    const [row] = await tx
        .select()
        .from(schema.assets)
        .where(and(eq(schema.assets.workspaceId, workspaceId), eq(schema.assets.sha256, sha256)));
    return row;
}

/** The bytes this workspace already holds, or null when they are new to it. */
export async function assetForBytes(
    workspaceId: string,
    base64: string,
): Promise<MediaItem | null> {
    const hit = await byDigest(workspaceId, sha256Of(base64));
    return hit ? toItem(hit) : null;
}

// Identical bytes are one asset: re-uploading the same logo returns the row we already hold, so it
// is charged against the storage cap once rather than once per pick.
async function storeBytes(
    workspaceId: string,
    row: {
        kind: "image" | "video";
        source: MediaSource;
        data: string;
        mime: string;
        width?: number | null;
        height?: number | null;
        alt?: string | null;
        meta?: AssetMeta;
    },
    tx: Db = db,
): Promise<MediaItem> {
    const sha256 = sha256Of(row.data);
    const hit = await byDigest(workspaceId, sha256, tx);
    if (hit) {
        await touchAsset(workspaceId, hit.id, tx);
        return toItem(hit);
    }
    const [inserted] = await tx
        .insert(schema.assets)
        .values({
            workspaceId,
            kind: row.kind,
            source: row.source,
            origin: null,
            data: row.data,
            sha256,
            mime: row.mime,
            bytes: Buffer.from(row.data, "base64").length,
            width: row.width ?? null,
            height: row.height ?? null,
            alt: row.alt ?? null,
            meta: row.meta ?? {},
        })
        .onConflictDoNothing()
        .returning();
    // lost the race for these bytes: the row the winner wrote is the one to use
    if (inserted) return toItem(inserted);
    const won = await byDigest(workspaceId, sha256, tx);
    return toItem(won!);
}

// Stores a generated image or clip and returns the picker item for it.
export async function storeGenerated(
    workspaceId: string,
    kind: "image" | "video",
    media: { dataBase64: string; mime: string; width: number; height: number },
    prompt: string,
    extra: Pick<AssetMeta, "style" | "model" | "refId"> = {},
    tx: Db = db,
): Promise<MediaItem> {
    return storeBytes(
        workspaceId,
        {
            kind,
            source: "generated",
            data: media.dataBase64,
            mime: media.mime,
            width: media.width,
            height: media.height,
            alt: prompt.slice(0, 160),
            meta: { prompt, ...extra },
        },
        tx,
    );
}

export async function storeUpload(
    workspaceId: string,
    body: { data: string; mime: string; name?: string; width?: number; height?: number },
    tx: Db = db,
): Promise<MediaItem> {
    return storeBytes(
        workspaceId,
        {
            kind: body.mime.startsWith("video/") ? "video" : "image",
            source: "upload",
            data: body.data,
            mime: body.mime,
            width: body.width,
            height: body.height,
            meta: body.name ? { name: body.name } : {},
        },
        tx,
    );
}

const touchAsset = (workspaceId: string, id: string, tx: Db = db): Promise<unknown> =>
    tx
        .update(schema.assets)
        .set({ usedAt: new Date() })
        .where(and(eq(schema.assets.workspaceId, workspaceId), eq(schema.assets.id, id)));

// The provider hosts we source from; anything else a url can point at is a plain link.
const STOCK_HOSTS =
    /(^|\.)(unsplash\.com|pexels\.com|pixabay\.com|openverse\.org|wikimedia\.org)$/i;

// a clip referenced as a plain file; the tree tells us the rest through `kinds`
const VIDEO_EXT = /\.(mp4|webm|ogg|mov|m4v)(\?|#|$)/i;
const kindForUrl = (url: string): "image" | "video" => (VIDEO_EXT.test(url) ? "video" : "image");

function sourceForUrl(url: string): MediaSource {
    try {
        return STOCK_HOSTS.test(new URL(url).hostname) ? "stock" : "link";
    } catch {
        return "link";
    }
}

// A url worth an asset row: one we can actually resolve to a picture later. Platform video pages
// stay links (there is no file), and blob:/relative urls mean nothing outside the tab that made them.
export function adoptable(url: string): boolean {
    if (!url || assetIdFromUrl(url)) return false;
    if (isEmbedVideoUrl(url)) return false;
    return /^https?:\/\//i.test(url) || url.startsWith("data:");
}

interface AdoptSeed {
    kind?: "image" | "video";
    source?: MediaSource;
    width?: number;
    height?: number;
    alt?: string;
    meta?: AssetMeta;
}

/**
 * Resolves external urls to asset ids, creating a row for any this workspace has not adopted yet.
 * Two statements regardless of how many urls come in, and none at all when every one is already
 * canonical, which is the steady state once content has been written once.
 */
export async function adoptUrls(
    workspaceId: string,
    urls: string[],
    seeds: Map<string, AdoptSeed> = new Map(),
    tx: Db = db,
): Promise<Map<string, string>> {
    const wanted = [...new Set(urls.filter(adoptable))];
    if (!wanted.length) return new Map();

    const dataUris = wanted.filter((u) => u.startsWith("data:"));
    const remote = wanted.filter((u) => !u.startsWith("data:"));
    const out = new Map<string, string>();

    if (remote.length) {
        // A url may already be here as a bare link adopted from content, and only later be picked
        // from a provider with its attribution. Enrich on conflict rather than ignoring it, or the
        // credit is lost and the row stays filtered out of the library as a placeholder.
        await tx
            .insert(schema.assets)
            .values(
                remote.map((url) => {
                    const seed = seeds.get(url) ?? {};
                    return {
                        workspaceId,
                        kind: seed.kind ?? kindForUrl(url),
                        source: seed.source ?? sourceForUrl(url),
                        origin: url,
                        width: seed.width || null,
                        height: seed.height || null,
                        alt: seed.alt ?? null,
                        meta: seed.meta ?? {},
                    };
                }),
            )
            .onConflictDoUpdate({
                target: [schema.assets.workspaceId, schema.assets.origin],
                // the unique index is partial, so the predicate is part of the conflict target
                targetWhere: sql`${schema.assets.origin} IS NOT NULL`,
                set: {
                    source: sql`CASE WHEN ${schema.assets.source} = 'link' THEN excluded.source ELSE ${schema.assets.source} END`,
                    kind: sql`CASE WHEN excluded.kind = 'video' THEN 'video' ELSE ${schema.assets.kind} END`,
                    width: sql`COALESCE(${schema.assets.width}, excluded.width)`,
                    height: sql`COALESCE(${schema.assets.height}, excluded.height)`,
                    alt: sql`COALESCE(${schema.assets.alt}, excluded.alt)`,
                    meta: sql`${schema.assets.meta} || excluded.meta`,
                },
                setWhere: sql`${schema.assets.source} = 'link' OR excluded.kind = 'video'
                    OR ${schema.assets.width} IS NULL OR ${schema.assets.alt} IS NULL
                    OR excluded.meta <> '{}'::jsonb`,
            });
        const rows = await tx
            .select({ id: schema.assets.id, origin: schema.assets.origin })
            .from(schema.assets)
            .where(
                and(
                    eq(schema.assets.workspaceId, workspaceId),
                    inArray(schema.assets.origin, remote),
                ),
            );
        for (const r of rows) if (r.origin) out.set(r.origin, r.id);
    }

    // a data: uri carries its own bytes, so it is an upload that happened to arrive inline
    for (const uri of dataUris) {
        const m = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(uri);
        if (!m?.[3]) continue;
        const mime = m[1] || "image/png";
        const data = m[2] ? m[3] : Buffer.from(decodeURIComponent(m[3])).toString("base64");
        const item = await storeUpload(workspaceId, { data, mime }, tx);
        out.set(uri, item.id);
    }
    return out;
}

/**
 * The invariant: content leaves here holding only canonical asset urls, so every picture in every
 * artifact has a row and the library is complete without scanning anything.
 */
export async function adoptContentMedia(
    workspaceId: string,
    content: unknown,
    tx: Db = db,
): Promise<unknown> {
    const kinds = mediaRefKinds(content);
    const refs = [...kinds.keys()];
    const foreign = refs.filter(adoptable);
    const owned = await ownedElsewhere(workspaceId, refs, tx);
    if (!foreign.length && !owned.size) return content;
    const seeds = new Map<string, AdoptSeed>(
        [...kinds].map(([url, kind]) => [url, { kind }] as const),
    );
    const ids = await adoptUrls(workspaceId, foreign, seeds, tx);
    for (const [url, id] of owned) ids.set(url, id);
    if (!ids.size) return content;
    return mapMediaRefs(content, (url) => {
        const id = ids.get(url);
        return id ? assetUrl(id) : url;
    });
}

/**
 * Canonical urls pointing at another workspace's rows, remapped to a copy this one owns. Content
 * can carry them the moment an artifact is copied across workspaces: the reference would still
 * resolve, since assets are public by uuid, while the picture belonged to someone else's library
 * and counted against their storage.
 */
async function ownedElsewhere(
    workspaceId: string,
    refs: string[],
    tx: Db,
): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    const ids = new Map<string, string>(); // asset id -> the url that referenced it
    for (const url of refs) {
        const id = assetIdFromUrl(url);
        if (id) ids.set(id, url);
    }
    if (!ids.size) return out;
    const rows = await tx
        .select()
        .from(schema.assets)
        .where(inArray(schema.assets.id, [...ids.keys()]));
    for (const row of rows) {
        if (row.workspaceId === workspaceId) continue;
        const url = ids.get(row.id)!;
        const copy = row.data
            ? await storeBytes(
                  workspaceId,
                  {
                      kind: row.kind as "image" | "video",
                      source: row.source as MediaSource,
                      data: row.data,
                      mime: row.mime ?? "image/png",
                      width: row.width,
                      height: row.height,
                      alt: row.alt,
                      meta: row.meta ?? {},
                  },
                  tx,
              )
            : await adoptOne(workspaceId, row, tx);
        out.set(url, copy.id);
    }
    return out;
}

async function adoptOne(workspaceId: string, row: AssetRow, tx: Db): Promise<MediaItem> {
    const seeds = new Map<string, AdoptSeed>([
        [
            row.origin!,
            {
                kind: row.kind as "image" | "video",
                source: row.source as MediaSource,
                width: row.width ?? undefined,
                height: row.height ?? undefined,
                alt: row.alt ?? undefined,
                meta: row.meta ?? {},
            },
        ],
    ]);
    const ids = await adoptUrls(workspaceId, [row.origin!], seeds, tx);
    const id = ids.get(row.origin!)!;
    return { ...toItem(row), id, url: assetUrl(id) };
}

/** The asset ids a tree references, for the reverse index. */
export const assetIdsOf = (content: unknown): string[] => [
    ...new Set(
        mediaRefs(content)
            .map(assetIdFromUrl)
            .filter((id): id is string => !!id),
    ),
];

export async function syncArtifactAssets(
    artifactId: string,
    assetIds: string[],
    tx: Db = db,
): Promise<void> {
    await tx.delete(schema.artifactAssets).where(eq(schema.artifactAssets.artifactId, artifactId));
    if (!assetIds.length) return;
    await tx
        .insert(schema.artifactAssets)
        .values(assetIds.map((assetId) => ({ artifactId, assetId })))
        .onConflictDoNothing();
}

// Records a pick: bumps an asset we already hold, or adopts the item with everything the provider
// told us about it. Stock also fires the Unsplash download trigger, which their API terms require.
export async function useItem(workspaceId: string, item: MediaItem): Promise<MediaItem> {
    const held = assetIdFromUrl(item.url);
    if (held) {
        await touchAsset(workspaceId, held);
        const [row] = await db
            .select()
            .from(schema.assets)
            .where(and(eq(schema.assets.workspaceId, workspaceId), eq(schema.assets.id, held)));
        return row ? toItem(row) : item;
    }
    if (item.source === "stock") void fireDownloadTrigger(item.attribution?.downloadLocation);
    const seeds = new Map<string, AdoptSeed>([
        [
            item.url,
            {
                // only a provider search result is stock; anything else external is a plain link,
                // and sourceForUrl decides which by host
                ...(item.source === "stock" ? { source: "stock" as const } : {}),
                width: item.width,
                height: item.height,
                alt: item.alt,
                meta: { attribution: item.attribution, thumbUrl: item.thumbUrl },
            },
        ],
    ]);
    const ids = await adoptUrls(workspaceId, [item.url], seeds);
    const id = ids.get(item.url);
    if (!id) return item;
    const [row] = await db
        .update(schema.assets)
        .set({ usedAt: new Date() })
        .where(and(eq(schema.assets.workspaceId, workspaceId), eq(schema.assets.id, id)))
        .returning();
    return row ? toItem(row) : item;
}

export interface LibraryQuery {
    kind?: "image" | "video";
    sources?: MediaSource[];
    q?: string;
    before?: Date;
    limit?: number;
}

/** The workspace's media, newest use first. Complete by construction: every picture in every
 *  artifact was adopted on the way in. */
export async function libraryAssets(
    workspaceId: string,
    q: LibraryQuery = {},
): Promise<{ items: MediaItem[]; nextBefore: string | null }> {
    const limit = Math.min(96, Math.max(1, q.limit ?? LIBRARY_LIMIT));
    const where = [eq(schema.assets.workspaceId, workspaceId)];
    if (q.kind) where.push(eq(schema.assets.kind, q.kind));
    if (q.sources?.length) where.push(inArray(schema.assets.source, q.sources));
    // what a person would remember about their own media: what it shows, or what they asked for
    if (q.q?.trim()) {
        const like = `%${q.q.trim()}%`;
        where.push(
            or(
                ilike(schema.assets.alt, like),
                sql`${schema.assets.meta} ->> 'prompt' ILIKE ${like}`,
                sql`${schema.assets.meta} ->> 'name' ILIKE ${like}`,
            )!,
        );
    }
    if (q.before) where.push(lt(schema.assets.usedAt, q.before));
    const rows = await db
        .select()
        .from(schema.assets)
        .where(and(...where))
        .orderBy(desc(schema.assets.usedAt))
        .limit(limit + 1);
    const page = rows.slice(0, limit);
    return {
        items: page.map(toItem),
        nextBefore:
            rows.length > limit ? (page[page.length - 1]?.usedAt.toISOString() ?? null) : null,
    };
}

/**
 * Who to credit for the pictures in an artifact. Resolved from the reverse index at read time
 * rather than denormalized into the tree: the row stays the only place provenance lives, and a
 * credit line cannot drift from the asset it belongs to.
 */
export async function artifactCredits(artifactId: string): Promise<MediaCredit[]> {
    const rows = await db
        .select({ meta: schema.assets.meta })
        .from(schema.artifactAssets)
        .innerJoin(schema.assets, eq(schema.assets.id, schema.artifactAssets.assetId))
        .where(eq(schema.artifactAssets.artifactId, artifactId));
    const seen = new Set<string>();
    const out: MediaCredit[] = [];
    for (const { meta } of rows) {
        const a = meta?.attribution;
        if (!a?.author && !a?.provider) continue;
        const key = `${a.author ?? ""}|${a.provider ?? ""}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({
            provider: a.provider,
            author: a.author,
            authorUrl: a.authorUrl,
            sourceUrl: a.sourceUrl,
        });
    }
    return out;
}

/** Which artifacts reference an asset. What makes deleting one a decision rather than a guess. */
export async function assetUsage(
    workspaceId: string,
    assetId: string,
): Promise<{ id: string; title: string }[]> {
    return db
        .select({ id: schema.artifacts.id, title: schema.artifacts.title })
        .from(schema.artifactAssets)
        .innerJoin(schema.artifacts, eq(schema.artifacts.id, schema.artifactAssets.artifactId))
        .where(
            and(
                eq(schema.artifactAssets.assetId, assetId),
                eq(schema.artifacts.workspaceId, workspaceId),
            ),
        );
}

/** Removes an asset nothing points at. Returns the blockers instead when something still does. */
export async function deleteAsset(
    workspaceId: string,
    assetId: string,
): Promise<{ ok: true } | { ok: false; usedBy: { id: string; title: string }[] }> {
    const usedBy = await assetUsage(workspaceId, assetId);
    if (usedBy.length) return { ok: false, usedBy };
    await db
        .delete(schema.assets)
        .where(and(eq(schema.assets.workspaceId, workspaceId), eq(schema.assets.id, assetId)));
    return { ok: true };
}

export interface CollectableAsset {
    id: string;
    kind: string;
    source: string;
    bytes: number | null;
    usedAt: Date;
}

/**
 * Assets no artifact references any more. Mostly generation takes nobody picked, which are stored
 * and charged the moment they stream in. Adopted rows are left alone: they hold no bytes, so they
 * cost nothing to keep, and dropping one would lose the attribution it carries.
 */
export async function collectableAssets(
    workspaceId: string,
    olderThan: Date,
): Promise<CollectableAsset[]> {
    return db
        .select({
            id: schema.assets.id,
            kind: schema.assets.kind,
            source: schema.assets.source,
            bytes: schema.assets.bytes,
            usedAt: schema.assets.usedAt,
        })
        .from(schema.assets)
        .where(
            and(
                eq(schema.assets.workspaceId, workspaceId),
                isNotNull(schema.assets.data),
                lt(schema.assets.usedAt, olderThan),
                notExists(
                    db
                        .select({ one: sql`1` })
                        .from(schema.artifactAssets)
                        .where(eq(schema.artifactAssets.assetId, schema.assets.id)),
                ),
            ),
        )
        .orderBy(desc(schema.assets.bytes));
}

export async function readAsset(
    id: string,
): Promise<{ data: string | null; mime: string | null; origin: string | null } | null> {
    const [a] = await db
        .select({
            data: schema.assets.data,
            mime: schema.assets.mime,
            origin: schema.assets.origin,
        })
        .from(schema.assets)
        .where(eq(schema.assets.id, id));
    return a ?? null;
}
