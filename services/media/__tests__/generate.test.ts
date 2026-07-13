import { afterEach, describe, expect, it, vi } from "vitest";
import { imageGenReady } from "../generate";

describe("imageGenReady", () => {
    afterEach(() => {
        vi.unstubAllEnvs();
    });

    it("is true once GOOGLE_API_KEY is present", () => {
        vi.stubEnv("GOOGLE_API_KEY", "test-key");
        expect(imageGenReady()).toBe(true);
    });

    it("is false when GOOGLE_API_KEY is unset", () => {
        vi.stubEnv("GOOGLE_API_KEY", undefined);
        expect(imageGenReady()).toBe(false);
    });

    it("treats an empty GOOGLE_API_KEY as not configured", () => {
        vi.stubEnv("GOOGLE_API_KEY", "");
        expect(imageGenReady()).toBe(false);
    });
});
