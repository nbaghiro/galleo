import { afterEach, describe, expect, it, vi } from "vitest";
import { stockReady } from "../providers";

// `orient` (per-provider orientation dialect) and `openverseKind` (URL-param mutation) are module-private
// (not exported); `searchStock` and every per-provider `search*` fn are network. The one exported
// non-network seam is `stockReady`, which reports per-provider key presence — openverse is keyless, so it
// is always available.

describe("stockReady", () => {
    afterEach(() => {
        vi.unstubAllEnvs();
    });

    it("reports openverse available even with no keys set", () => {
        vi.stubEnv("UNSPLASH_ACCESS_KEY", undefined);
        vi.stubEnv("PEXELS_API_KEY", undefined);
        vi.stubEnv("PIXABAY_API_KEY", undefined);
        expect(stockReady()).toEqual({
            openverse: true,
            unsplash: false,
            pexels: false,
            pixabay: false,
        });
    });

    it("flips only the providers whose keys are present", () => {
        vi.stubEnv("UNSPLASH_ACCESS_KEY", "u-key");
        vi.stubEnv("PEXELS_API_KEY", undefined);
        vi.stubEnv("PIXABAY_API_KEY", "p-key");
        expect(stockReady()).toEqual({
            openverse: true,
            unsplash: true,
            pexels: false,
            pixabay: true,
        });
    });

    it("treats an empty key string as not configured", () => {
        vi.stubEnv("UNSPLASH_ACCESS_KEY", "");
        vi.stubEnv("PEXELS_API_KEY", "");
        vi.stubEnv("PIXABAY_API_KEY", "");
        const ready = stockReady();
        expect(ready.unsplash).toBe(false);
        expect(ready.pexels).toBe(false);
        expect(ready.pixabay).toBe(false);
        expect(ready.openverse).toBe(true);
    });
});
