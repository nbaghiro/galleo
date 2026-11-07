import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchFontTtf } from "@canvas/render/fonts";

afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
});

describe("fetchFontTtf", () => {
    it("snaps an off-menu bold weight to 700, which is the one that was vendored", async () => {
        const calls: string[] = [];
        vi.stubGlobal(
            "fetch",
            vi.fn(async (url: string) => {
                calls.push(String(url));
                // Space Mono has no 600, so no face was vendored at that weight
                if (String(url).includes("-600")) return { ok: false, status: 404 };
                return { ok: true, arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer };
            }),
        );
        await fetchFontTtf("Space Mono", 600, false);
        expect(calls.some((u) => u === "/fonts/space-mono-700.woff2")).toBe(true);
        expect(calls.every((u) => u.startsWith("/fonts/"))).toBe(true);
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

    describe("on a page that loaded /fonts.css", () => {
        const faces = [
            { family: "Fraunces", style: "normal", weight: "500" },
            { family: "Fraunces", style: "normal", weight: "600" },
            { family: "Fraunces", style: "normal", weight: "700" },
            { family: "DM Mono", style: "normal", weight: "400" },
            { family: "DM Mono", style: "normal", weight: "500" },
        ];
        const stubPage = (): string[] => {
            const calls: string[] = [];
            vi.stubGlobal("document", { fonts: faces });
            vi.stubGlobal(
                "fetch",
                vi.fn(async (url: string) => {
                    calls.push(String(url));
                    return { ok: true, arrayBuffer: async () => new Uint8Array([1]).buffer };
                }),
            );
            return calls;
        };

        it("asks only for a weight that was vendored, nearest within the slot", async () => {
            const calls = stubPage();
            await fetchFontTtf("Fraunces", 560, false);
            expect(calls).toEqual(["/fonts/fraunces-500.woff2"]);
        });

        it("fetches nothing for a slot the family has no face in", async () => {
            const calls = stubPage();
            expect(await fetchFontTtf("DM Mono", 700, false)).toBeNull();
            expect(calls).toEqual([]);
        });
    });
});
