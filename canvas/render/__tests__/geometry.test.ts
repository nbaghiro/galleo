// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import { fitToViewport, scaledHostCss } from "@canvas/render/geometry";

// scaledHostCss is a pure string builder; fitToViewport reads the viewport (window), so this file runs in
// happy-dom with the dimensions pinned.

describe("scaledHostCss", () => {
    it("scales from the top-left in the base variant", () => {
        expect(scaledHostCss(400, 300, 0.5)).toBe(
            "width:400px;height:300px;transform:scale(0.5);transform-origin:top left",
        );
    });
    it("absolutely positions and centers within a frame in the center variant", () => {
        expect(scaledHostCss(400, 300, 0.5, { frameW: 800, frameH: 600 })).toBe(
            "position:absolute;width:400px;height:300px;transform:scale(0.5);transform-origin:top left;left:200px;top:225px",
        );
    });
});

describe("fitToViewport", () => {
    beforeEach(() => {
        Object.defineProperty(window, "innerWidth", { configurable: true, value: 1200 });
        Object.defineProperty(window, "innerHeight", { configurable: true, value: 800 });
    });
    it("is width-bound for a wide slide", () => {
        expect(fitToViewport(2000, 1000, 24)).toBeCloseTo((1200 - 24) / 2000, 5); // 0.588
    });
    it("is height-bound for a tall slide", () => {
        expect(fitToViewport(1000, 3000, 24)).toBeCloseTo((800 - 24) / 3000, 5); // ~0.2587
    });
});
