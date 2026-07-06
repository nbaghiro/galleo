import type { MediaItem, MediaKind, MediaProvider } from "@model/media";

// Stock-photo providers behind /api/media/search. Each is optional: a provider with no key is reported
// as "not configured" and simply skipped (like the billing routes degrade without Stripe). Every
// provider is normalized to the same MediaItem shape so the picker renders one grid regardless of source.

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

// --- provider response shapes (only the fields we read) ---
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

// Orientation values differ per provider; map the picker's shared "landscape|portrait|square".
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

async function searchPixabay(q: string, page: number, o?: string): Promise<StockResult> {
    const key = KEYS.pixabay()!;
    const u = new URL("https://pixabay.com/api/");
    u.searchParams.set("key", key);
    u.searchParams.set("q", q);
    u.searchParams.set("page", String(page));
    u.searchParams.set("per_page", String(PER_PAGE));
    u.searchParams.set("image_type", "photo");
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

// Openverse — free, keyless CC-image search (aggregates Wikimedia, Flickr, museums…). Anonymous requests
// are rate-limited; register a client for higher limits later. Thumbnails are served through Openverse's
// own CORS-friendly proxy; `url` is the original source.
const OPENVERSE_PAGE_SIZE = 20; // anonymous requests are capped here (page_size=30 → 401)

// Map the picker's media kind to Openverse's own filters — how we search gifs / illustrations keylessly.
function openverseKind(u: URL, kind: MediaKind): void {
    if (kind === "gif")
        u.searchParams.set("extension", "gif"); // animated
    else if (kind === "illustration")
        u.searchParams.set("category", "illustration"); // vector art / drawings
    else if (kind === "sticker") u.searchParams.set("extension", "png"); // best-effort transparent cutouts
    // "photo" → no filter (Openverse's default mix, unchanged)
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
    if (!stockReady()[provider]) return { items: [], hasMore: false };
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
    return searchPixabay(q, page, o);
}

// Unsplash requires pinging the download-trigger endpoint whenever a photo is actually used (their API
// guidelines). Fire-and-forget; never block the pick on it.
export async function fireDownloadTrigger(downloadLocation: string | undefined): Promise<void> {
    const key = KEYS.unsplash();
    if (!downloadLocation || !key) return;
    try {
        await fetch(downloadLocation, { headers: { Authorization: `Client-ID ${key}` } });
    } catch {
        // best-effort; a failed trigger must not break the user's pick
    }
}
