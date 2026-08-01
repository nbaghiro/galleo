import type { MediaItem, MediaKind, MediaProvider } from "@model/media";
import { KIND_PROVIDERS } from "@model/media";

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
