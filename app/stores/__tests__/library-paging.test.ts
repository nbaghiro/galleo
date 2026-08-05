import { afterEach, describe, expect, it, vi } from "vitest";
import type { ArtifactPage, ArtifactSummary, Section } from "@model/artifact";
import {
    artifacts,
    CARD_BATCH,
    cardSection,
    ensureCardSections,
    loadLibrary,
    loadMoreArtifacts,
    missingCardSections,
    nextCursor,
    seedCardSections,
} from "../library";

interface FetchCall {
    url: string;
}

const summary = (id: string, over: Partial<ArtifactSummary> = {}): ArtifactSummary => ({
    id,
    title: id,
    themeId: "studio",
    formatId: "deck",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...over,
});

const page = (ids: string[], nextCursor: string | null = null): ArtifactPage => ({
    artifacts: ids.map((id) => summary(id)),
    nextCursor,
});

// each call answers with the next queued body, repeating the last
function stubFetch(bodies: unknown[]): FetchCall[] {
    const calls: FetchCall[] = [];
    let i = 0;
    vi.stubGlobal(
        "fetch",
        vi.fn((url: string) => {
            calls.push({ url });
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

afterEach(async () => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    stubFetch([page([])]);
    await loadLibrary({}); // leave the store empty for the next test
    vi.unstubAllGlobals();
});

describe("loadLibrary", () => {
    it("puts the page filters on the wire rather than filtering in the client", async () => {
        const calls = stubFetch([page(["a"])]);
        await loadLibrary({ folderId: "f1", format: "web", sort: "az" });
        expect(calls[0]!.url).toBe("/api/artifacts?folder=f1&format=web&sort=az");
    });

    it("omits the format when it is the all-formats chip", async () => {
        const calls = stubFetch([page(["a"])]);
        await loadLibrary({ format: "all", sort: "recent" });
        expect(calls[0]!.url).toBe("/api/artifacts");
    });

    it("replaces the list and records the cursor", async () => {
        stubFetch([page(["a", "b"], "cur-1")]);
        await loadLibrary({});
        expect(artifacts().map((a) => a.id)).toEqual(["a", "b"]);
        expect(nextCursor()).toBe("cur-1");
    });
});

describe("loadMoreArtifacts", () => {
    it("appends the next page and carries the cursor forward", async () => {
        stubFetch([page(["a"], "cur-1")]);
        await loadLibrary({ sort: "az" });
        const calls = stubFetch([page(["b"], "cur-2")]);
        await loadMoreArtifacts();
        expect(calls[0]!.url).toBe("/api/artifacts?sort=az&cursor=cur-1");
        expect(artifacts().map((a) => a.id)).toEqual(["a", "b"]);
        expect(nextCursor()).toBe("cur-2");
    });

    it("never repeats a row that arrived on an earlier page", async () => {
        stubFetch([page(["a", "b"], "cur-1")]);
        await loadLibrary({});
        stubFetch([page(["b", "c"], null)]);
        await loadMoreArtifacts();
        expect(artifacts().map((a) => a.id)).toEqual(["a", "b", "c"]);
    });

    it("does nothing once the list is exhausted", async () => {
        stubFetch([page(["a"], null)]);
        await loadLibrary({});
        const calls = stubFetch([page(["never"])]);
        await loadMoreArtifacts();
        expect(calls).toHaveLength(0);
        expect(artifacts().map((a) => a.id)).toEqual(["a"]);
    });

    it("keeps the cursor when a page fails, so the sentinel can retry", async () => {
        stubFetch([page(["a"], "cur-1")]);
        await loadLibrary({});
        vi.stubGlobal(
            "fetch",
            vi.fn(() => Promise.reject(new Error("offline"))),
        );
        await loadMoreArtifacts();
        expect(nextCursor()).toBe("cur-1");
        expect(artifacts().map((a) => a.id)).toEqual(["a"]);
    });
});

describe("ensureCardSections", () => {
    const sections = (ids: string[]): { sections: Section[] } => ({
        sections: ids.map((id) => ({ id, root: { type: "text", data: { text: id } } })),
    });

    it("asks only for the tiles the strip is looking at", async () => {
        stubFetch([page(["a1"], null)]);
        await loadLibrary({});
        const calls = stubFetch([sections(["s2", "s3"])]);
        await ensureCardSections("a1", ["s2", "s3"]);
        expect(calls[0]!.url).toBe("/api/artifacts/a1/sections?ids=s2,s3");
        expect(cardSection("a1", "s2")?.id).toBe("s2");
        expect(cardSection("a1", "s9")).toBeUndefined();
    });

    it("merges a later batch into what the card already holds", async () => {
        stubFetch([page(["a2"], null)]);
        await loadLibrary({});
        stubFetch([sections(["s1"])]);
        await ensureCardSections("a2", ["s1"]);
        stubFetch([sections(["s2"])]);
        await ensureCardSections("a2", ["s2"]);
        expect(cardSection("a2", "s1")?.id).toBe("s1");
        expect(cardSection("a2", "s2")?.id).toBe("s2");
    });

    it("never asks twice for the same batch, or at all for what it holds", async () => {
        stubFetch([page(["a3"], null)]);
        await loadLibrary({});
        const calls = stubFetch([sections(["s1"])]);
        await Promise.all([ensureCardSections("a3", ["s1"]), ensureCardSections("a3", ["s1"])]);
        await ensureCardSections("a3", ["s1"]);
        expect(calls).toHaveLength(1);
    });

    it("splits a wide strip across requests rather than dropping the overflow", async () => {
        stubFetch([page(["a4"], null)]);
        await loadLibrary({});
        const want = Array.from({ length: CARD_BATCH * 2 + 3 }, (_, i) => `s${i}`);
        const calls = stubFetch([sections(want)]);
        await ensureCardSections("a4", want);

        expect(calls).toHaveLength(3); // every visible tile is asked for, none silently dropped
        const asked = calls.flatMap((c) => c.url.split("ids=")[1]!.split(","));
        expect(asked.sort()).toEqual([...want].sort());
        for (const c of calls)
            expect(c.url.split("ids=")[1]!.split(",").length).toBeLessThanOrEqual(CARD_BATCH);
    });

    it("asks for nothing it already holds", async () => {
        stubFetch([page(["a7"], null)]);
        await loadLibrary({});
        stubFetch([sections(["s1"])]);
        await ensureCardSections("a7", ["s1"]);
        const calls = stubFetch([sections(["s2"])]);
        await ensureCardSections("a7", ["s1", "s2"]);
        expect(calls[0]!.url).toBe("/api/artifacts/a7/sections?ids=s2");
        expect(missingCardSections("a7", ["s1", "s2"])).toEqual([]);
    });

    it("leaves the tiles as stand-ins when the fetch fails", async () => {
        stubFetch([page(["a5"], null)]);
        await loadLibrary({});
        vi.stubGlobal(
            "fetch",
            vi.fn(() => Promise.reject(new Error("offline"))),
        );
        await ensureCardSections("a5", ["s1"]);
        expect(cardSection("a5", "s1")).toBeUndefined();
    });

    it("takes sections the client just wrote without a round trip", async () => {
        seedCardSections("a6", [{ id: "s1", root: { type: "text", data: { text: "x" } } }]);
        expect(cardSection("a6", "s1")?.id).toBe("s1");
        expect(missingCardSections("a6", ["s1"])).toEqual([]);
    });

    it("forgets the least recently touched cards rather than growing forever", () => {
        for (let i = 0; i < 40; i++)
            seedCardSections(`card${i}`, [{ id: "s1", root: { type: "text", data: {} } }]);
        expect(cardSection("card0", "s1")).toBeUndefined();
        expect(cardSection("card39", "s1")?.id).toBe("s1");
    });
});
