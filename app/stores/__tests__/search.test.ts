import { afterEach, describe, expect, it, vi } from "vitest";
import type { SearchHit } from "@model/artifact";
import { loadLibrary } from "../library";
import {
    cachedHits,
    clearSearchCache,
    fetchHits,
    hitMeta,
    hitSubtitle,
    localHits,
    putHits,
    reconcile,
    SEARCH_LIMIT,
} from "../search";

interface FetchCall {
    url: string;
    init: RequestInit | undefined;
}

const hit = (over: Partial<SearchHit> & { id: string; title: string }): SearchHit => ({
    themeId: "studio",
    formatId: "deck",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...over,
});

function stubFetch(bodies: unknown[]): FetchCall[] {
    const calls: FetchCall[] = [];
    let i = 0;
    vi.stubGlobal(
        "fetch",
        vi.fn((url: string, init?: RequestInit) => {
            calls.push({ url, init });
            const body = bodies[Math.min(i++, bodies.length - 1)];
            return Promise.resolve({
                ok: true,
                status: 200,
                statusText: "OK",
                headers: { get: () => "application/json" },
                text: async () => JSON.stringify(body),
            });
        }),
    );
    return calls;
}

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    clearSearchCache();
});

// the local pass reads the library store, so fill it the way the app does
async function seedLibrary(artifacts: unknown[]): Promise<void> {
    stubFetch([{ artifacts }]);
    await loadLibrary();
    vi.unstubAllGlobals();
}

describe("localHits", () => {
    it("ranks library titles and cover text without touching the network", async () => {
        await seedLibrary([
            hit({ id: "1", title: "Growth Playbook" }),
            hit({ id: "2", title: "Untitled", cover: { title: "Freemium pricing" } }),
            hit({ id: "3", title: "Board deck" }),
        ]);
        expect(localHits("growth").map((h) => h.id)).toEqual(["1"]);
        expect(localHits("freemium").map((h) => h.id)).toEqual(["2"]);
        expect(localHits("zzz")).toEqual([]);
    });

    it("falls back to most-recently-edited for an empty query", async () => {
        await seedLibrary([
            hit({ id: "old", title: "Old", updatedAt: "2020-01-01T00:00:00.000Z" }),
            hit({ id: "new", title: "New", updatedAt: "2026-06-01T00:00:00.000Z" }),
        ]);
        expect(localHits("").map((h) => h.id)).toEqual(["new", "old"]);
    });

    it("caps how many rows it produces", async () => {
        await seedLibrary(
            Array.from({ length: 20 }, (_, i) => hit({ id: `a${i}`, title: `Deck ${i}` })),
        );
        expect(localHits("deck")).toHaveLength(SEARCH_LIMIT);
        expect(localHits("deck", 3)).toHaveLength(3);
    });
});

describe("fetchHits", () => {
    it("asks the server with an encoded query and one row over the display limit", async () => {
        const calls = stubFetch([{ artifacts: [hit({ id: "1", title: "Q3" })], took: 3 }]);
        const hits = await fetchHits("q3 & beyond");
        expect(hits.map((h) => h.id)).toEqual(["1"]);
        expect(calls[0]!.url).toBe(`/api/search?q=q3%20%26%20beyond&limit=${SEARCH_LIMIT + 1}`);
    });

    it("serves a repeat query from cache instead of re-fetching", async () => {
        const calls = stubFetch([{ artifacts: [hit({ id: "1", title: "Cached" })], took: 1 }]);
        await fetchHits("cached");
        await fetchHits("CACHED "); // same query, different shape
        expect(calls).toHaveLength(1);
    });

    it("passes the abort signal through so a superseded keystroke is cancelled", async () => {
        const calls = stubFetch([{ artifacts: [], took: 0 }]);
        const ctrl = new AbortController();
        await fetchHits("anything", ctrl.signal);
        expect(calls[0]!.init?.signal).toBe(ctrl.signal);
    });
});

describe("the result cache", () => {
    it("expires entries rather than serving a stale library forever", () => {
        const now = 1_000_000;
        putHits("q", 9, [hit({ id: "1", title: "One" })], now);
        expect(cachedHits("q", 9, now + 29_000)).toHaveLength(1);
        expect(cachedHits("q", 9, now + 31_000)).toBeNull();
    });

    it("is dropped wholesale when the library changes", () => {
        putHits("q", 9, [hit({ id: "1", title: "One" })]);
        clearSearchCache();
        expect(cachedHits("q", 9)).toBeNull();
    });

    it("bounds its size", () => {
        for (let i = 0; i < 40; i++) putHits(`q${i}`, 9, []);
        expect(cachedHits("q0", 9)).toBeNull(); // evicted
        expect(cachedHits("q39", 9)).not.toBeNull();
    });
});

describe("reconcile", () => {
    it("takes the live title and cover from the library store", async () => {
        await seedLibrary([hit({ id: "1", title: "Renamed", cover: { title: "New cover" } })]);
        const [row] = reconcile([hit({ id: "1", title: "Stale", cover: { title: "Old cover" } })]);
        expect(row!.title).toBe("Renamed");
        expect(row!.cover?.title).toBe("New cover");
    });

    it("drops hits the library no longer holds, and keeps the snippet from the server", async () => {
        await seedLibrary([hit({ id: "1", title: "Still here" })]);
        const rows = reconcile([
            hit({ id: "1", title: "Still here", snippet: { text: "match", marks: [[0, 5]] } }),
            hit({ id: "gone", title: "Trashed" }),
        ]);
        expect(rows.map((r) => r.id)).toEqual(["1"]);
        expect(rows[0]!.snippet?.text).toBe("match");
    });
});

describe("row text", () => {
    it("reads author and format into the subtitle, and the edit time into the meta", () => {
        const h = hit({
            id: "1",
            title: "Deck",
            author: { name: "Ada Lovelace", avatarUrl: null },
            updatedAt: new Date(Date.now() - 3 * 3600_000).toISOString(),
        });
        expect(hitSubtitle(h)).toBe("Ada Lovelace · Deck");
        expect(hitMeta(h)).toBe("Edited 3h ago");
    });

    it("falls back to the format alone when the creator is unknown", () => {
        expect(hitSubtitle(hit({ id: "1", title: "x", formatId: "web" }))).toBe("Site");
    });
});
