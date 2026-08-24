import { describe, expect, it } from "vitest";
import {
    A4_W,
    docSectionPageSize,
    rasterSlidePlacement,
    slidePdfPageSize,
} from "@canvas/render/export";

describe("slidePdfPageSize", () => {
    it("keeps a fixed page width and preserves the slide aspect", () => {
        expect(slidePdfPageSize({ w: 1280, h: 720 })).toEqual({ w: 960, h: 540 }); // 960·720/1280
        expect(slidePdfPageSize({ w: 1000, h: 1000 })).toEqual({ w: 960, h: 960 });
    });
    it("honors a custom page width", () => {
        expect(slidePdfPageSize({ w: 1280, h: 720 }, 640)).toEqual({ w: 640, h: 360 });
    });
});

describe("rasterSlidePlacement", () => {
    it("a page matching the slide box fills it exactly", () => {
        expect(rasterSlidePlacement({ w: 1280, h: 720 }, { w: 1280, h: 720 })).toEqual({
            x: 0,
            y: 0,
            w: 1280,
            h: 720,
        });
    });
    it("letterboxes a taller page (per-section frame aspect) centered horizontally", () => {
        // a square page onto 16:9: height-bound, so it pillar-boxes
        const at = rasterSlidePlacement({ w: 1280, h: 1280 }, { w: 1280, h: 720 });
        expect(at.h).toBe(720);
        expect(at.w).toBe(720);
        expect(at.x).toBeCloseTo((1280 - 720) / 2, 6);
        expect(at.y).toBe(0);
    });
    it("letterboxes a wider page centered vertically", () => {
        const at = rasterSlidePlacement({ w: 1280, h: 320 }, { w: 1280, h: 720 });
        expect(at.w).toBe(1280);
        expect(at.h).toBe(320);
        expect(at.x).toBe(0);
        expect(at.y).toBeCloseTo(200, 6);
    });
});

describe("docSectionPageSize", () => {
    it("keeps A4 width and scales the section height with the same px→pt factor", () => {
        const size = docSectionPageSize(744, 372);
        expect(size.w).toBe(A4_W);
        expect(size.h).toBeCloseTo((372 * A4_W) / 744, 6);
    });
    it("a section as tall as the layout is wide yields a square page", () => {
        expect(docSectionPageSize(1000, 1000)).toEqual({ w: A4_W, h: A4_W });
    });
});
