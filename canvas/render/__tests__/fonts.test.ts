import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchFontTtf } from "@canvas/render/fonts";

const cssWithTtf = "/* latin */ @font-face { src: url(https://fonts.gstatic.com/f.ttf); }";

afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
});

describe("fetchFontTtf", () => {
    it("snaps an off-menu bold weight to 700 when css2 rejects it", async () => {
        const calls: string[] = [];
        vi.stubGlobal(
            "fetch",
            vi.fn(async (url: string) => {
                calls.push(String(url));
                if (String(url).includes("css2")) {
                    if (String(url).includes("0,600")) return { ok: false, status: 400 };
                    return { ok: true, text: async () => cssWithTtf };
                }
                return { ok: true, arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer };
            }),
        );
        const ttf = await fetchFontTtf("Space Mono", 600, false);
        expect(ttf).toEqual(new Uint8Array([1, 2, 3]));
        expect(calls.some((u) => u.includes("0,700"))).toBe(true);
    });

    it("returns null when the family fails at every weight", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => ({ ok: false, status: 400 })),
        );
        expect(await fetchFontTtf("Nope", 600, false)).toBeNull();
    });

    it("times out a stalled fetch instead of hanging the export", async () => {
        vi.useFakeTimers();
        vi.stubGlobal(
            "fetch",
            vi.fn(() => new Promise(() => {})),
        );
        const p = fetchFontTtf("Slow", 400, false);
        await vi.advanceTimersByTimeAsync(10_000);
        expect(await p).toBeNull();
    });
});
