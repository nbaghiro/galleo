import type { SearchHit } from "@model/artifact";
import { rankScored } from "@ui/fuzzy";
import { api } from "@app/api";
import { queryBucket } from "@model/analytics";
import { capture } from "@ui/analytics";
import { artifacts, artifactsLoaded, formatLabel } from "./library";
import { relativeTime } from "@ui/time";

export const SEARCH_LIMIT = 8; // artifact rows in the palette before "show all results"
export const LIBRARY_LIMIT = 50; // the library grid shows the long tail, not a top-N
const CACHE_TTL = 30_000; // ms; long enough to cover a typing session, short enough to stay honest
const CACHE_MAX = 24;

interface Entry {
    at: number;
    hits: SearchHit[];
}
const cache = new Map<string, Entry>();
// the limit is part of the key: the palette's 9 rows can't answer the library's 50
const key = (q: string, limit: number): string => `${limit}:${q.trim().toLowerCase()}`;

export function cachedHits(q: string, limit: number, now = Date.now()): SearchHit[] | null {
    const k = key(q, limit);
    const entry = cache.get(k);
    if (!entry) return null;
    if (now - entry.at > CACHE_TTL) {
        cache.delete(k);
        return null;
    }
    return entry.hits;
}

export function putHits(q: string, limit: number, hits: SearchHit[], now = Date.now()): void {
    cache.set(key(q, limit), { at: now, hits });
    if (cache.size > CACHE_MAX) {
        const oldest = cache.keys().next().value;
        if (oldest !== undefined) cache.delete(oldest);
    }
}

/** Dropped whenever the library changes under us, so a renamed or deleted artifact can't linger. */
export function clearSearchCache(): void {
    cache.clear();
}

export async function fetchHits(
    q: string,
    signal?: AbortSignal,
    limit = SEARCH_LIMIT + 1, // one over the display cap, so "show all results" knows there is more
    via: "field" | "palette" = "field",
): Promise<SearchHit[]> {
    const cached = cachedHits(q, limit);
    if (cached) return cached;
    const { artifacts: hits } = await api.search(q, limit, signal);
    putHits(q, limit, hits);
    // Only on a real fetch: a cache hit means the same query, so this counts distinct searches
    // rather than keystrokes. The query itself never travels, only how long it was.
    capture("library_searched", {
        result_count: hits.length,
        query_length_bucket: queryBucket(q.length),
        via,
    });
    return hits;
}

/** A later page of results. Rank order is stable per query, so an offset is a real page boundary. */
export async function fetchHitPage(
    q: string,
    offset: number,
    limit = LIBRARY_LIMIT,
    signal?: AbortSignal,
): Promise<SearchHit[]> {
    if (!offset) return fetchHits(q, signal, limit);
    const { artifacts: hits } = await api.search(q, limit, signal, offset);
    return hits;
}

/** Renames stay fresh, gone artifacts drop out; hits pass through until the store has loaded. */
export function reconcile(hits: SearchHit[]): SearchHit[] {
    if (!artifactsLoaded()) return hits;
    const live = new Map(artifacts().map((a) => [a.id, a]));
    return hits.flatMap((hit) => {
        const now = live.get(hit.id);
        return now ? [{ ...hit, ...now }] : [];
    });
}

const haystack = (a: SearchHit): string =>
    `${a.title} ${a.cover?.title ?? ""} ${a.cover?.eyebrow ?? ""} ${a.cover?.sub ?? ""}`;

/** Titles and covers only, so the first frame after a keystroke is never blank. */
export function localHits(query: string, limit = SEARCH_LIMIT): SearchHit[] {
    const list = artifacts();
    if (!query.trim())
        return [...list]
            .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
            .slice(0, limit)
            .map((a) => ({ ...a, matchedIn: "title" as const }));
    return rankScored(query, list, haystack)
        .slice(0, limit)
        .map(({ item }) => ({ ...item, matchedIn: "title" as const }));
}

export const hitSubtitle = (hit: SearchHit): string =>
    [hit.author?.name, formatLabel(hit.formatId)].filter(Boolean).join(" · ");

export const hitMeta = (hit: SearchHit): string => `Edited ${relativeTime(hit.updatedAt)}`;

/** Fire-and-forget read clock; a failure here must never block opening an artifact. */
export function recordVisit(id: string): void {
    clearSearchCache(); // the recents order just changed
    api.recordVisit(id).catch(() => {});
}
