// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { dimsOf, probeImage } from "@editor/core/media";

describe("dimsOf — what the media control writes alongside a src", () => {
    it("takes a picked item's reported pixel size", () => {
        expect(dimsOf({ width: 1600, height: 900 })).toEqual({ w: 1600, h: 900 });
    });
    it("reports nothing when a provider left the size out or at zero", () => {
        expect(dimsOf(undefined)).toBeUndefined();
        expect(dimsOf({})).toBeUndefined();
        expect(dimsOf({ width: 0, height: 900 })).toBeUndefined();
        expect(dimsOf({ width: 1600, height: -1 })).toBeUndefined();
    });
});

describe("probeImage — a hand-typed url", () => {
    it("resolves undefined for a url that never loads, so the write keeps today's behavior", async () => {
        expect(await probeImage("https://example.invalid/never.png", 10)).toBeUndefined();
    });
});
