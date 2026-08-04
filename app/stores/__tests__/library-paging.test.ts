import { afterEach, describe, expect, it, vi } from "vitest";
import type { ArtifactPage, ArtifactSummary, Section } from "@model/artifact";
import {
    artifacts,
    CARD_SECTIONS,
    contents,
    ensureCardContent,
    loadLibrary,
    loadMoreArtifacts,
    nextCursor,
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

describe("ensureCardContent", () => {
    const sections = (ids: string[]): { sections: Section[] } => ({
        sections: ids.map((id) => ({ id, root: { type: "text", data: { text: id } } })),
    });

    it("asks only for the sections the card shows", async () => {
        stubFetch([page(["a1"], null)]);
        await loadLibrary({});
        const calls = stubFetch([sections(["s1", "s2"])]);
        await ensureCardContent("a1");
        expect(calls[0]!.url).toBe(`/api/artifacts/a1/sections?window=0:${CARD_SECTIONS}`);
        expect(contents()["a1"]!.sections.map((s) => s.id)).toEqual(["s1", "s2"]);
        expect(contents()["a1"]!.format).toBe("deck"); // shell comes from the row already in hand
    });

    it("fetches once for concurrent callers and not at all when already held", async () => {
        stubFetch([page(["a3"], null)]); // its own id: the content cache is process-wide
        await loadLibrary({});
        const calls = stubFetch([sections(["s1"])]);
        await Promise.all([ensureCardContent("a3"), ensureCardContent("a3")]);
        expect(calls).toHaveLength(1);
        await ensureCardContent("a3");
        expect(calls).toHaveLength(1);
    });

    it("leaves the card without content when the fetch fails", async () => {
        stubFetch([page(["a2"], null)]);
        await loadLibrary({});
        vi.stubGlobal(
            "fetch",
            vi.fn(() => Promise.reject(new Error("offline"))),
        );
        await ensureCardContent("a2");
        expect(contents()["a2"]).toBeUndefined();
    });
});
