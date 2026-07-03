// Real photo sourcing for the generate pipeline. The writer emits a search phrase per image; this resolves
// it to an actual Unsplash photo URL so artifacts look composed, not stock-grey. It NEVER throws — missing
// key, rate limit, or no result all fall back to a deterministic placeholder, so generation never breaks.
// Results are cached per (query, orientation) for the process, so repeated subjects don't re-hit the API.

const ACCESS = process.env.UNSPLASH_ACCESS_KEY;
const cache = new Map<string, string>();

const slug = (s: string): string =>
    s
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 40) || "galleo";

const placeholder = (query: string, w: number, h: number): string =>
    `https://picsum.photos/seed/${slug(query)}/${w}/${h}`;

export interface ImageOpts {
    orientation?: "landscape" | "portrait" | "squarish";
    width?: number;
    height?: number;
}

interface UnsplashResult {
    results?: { urls?: { raw?: string; regular?: string } }[];
}

// Resolve one query → a photo URL. Cached; falls back to a deterministic placeholder on any failure.
export async function resolveImage(query: string, opts: ImageOpts = {}): Promise<string> {
    const q = query.trim() || "abstract texture";
    const { orientation = "landscape", width = 1400, height = 1000 } = opts;
    const key = `${q}|${orientation}|${width}x${height}`;
    const hit = cache.get(key);
    if (hit) return hit;
    if (!ACCESS) return placeholder(q, width, height);
    try {
        const url = new URL("https://api.unsplash.com/search/photos");
        url.searchParams.set("query", q);
        url.searchParams.set("per_page", "1");
        url.searchParams.set("orientation", orientation);
        url.searchParams.set("content_filter", "high");
        const res = await fetch(url, { headers: { Authorization: `Client-ID ${ACCESS}` } });
        if (!res.ok) return placeholder(q, width, height);
        const data = (await res.json()) as UnsplashResult;
        const urls = data.results?.[0]?.urls;
        const chosen = urls?.raw
            ? `${urls.raw}&w=${width}&h=${height}&fit=crop&crop=entropy&q=80&fm=jpg`
            : (urls?.regular ?? placeholder(q, width, height));
        cache.set(key, chosen);
        return chosen;
    } catch {
        return placeholder(q, width, height);
    }
}

// Resolve many queries in parallel → a Map from the (trimmed) query to its URL.
export async function resolveImages(
    queries: string[],
    opts: ImageOpts = {},
): Promise<Map<string, string>> {
    const uniq = [...new Set(queries.map((q) => q.trim() || "abstract texture"))];
    const entries = await Promise.all(
        uniq.map(async (q) => [q, await resolveImage(q, opts)] as const),
    );
    return new Map(entries);
}
