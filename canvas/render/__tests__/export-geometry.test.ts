import { describe, expect, it } from "vitest";
import {
    A4_H,
    A4_W,
    DOC_MARGIN,
    EXPORT_SCALE,
    SLIDE_W,
    deckPngCanvasSize,
    docPageGeometry,
    slidePdfPageSize,
} from "@canvas/render/export-geometry";

describe("slidePdfPageSize", () => {
    it("keeps a fixed page width and preserves the slide aspect", () => {
        expect(slidePdfPageSize({ w: 1280, h: 720 })).toEqual({ w: 960, h: 540 }); // 960·720/1280
        expect(slidePdfPageSize({ w: 1000, h: 1000 })).toEqual({ w: 960, h: 960 });
    });
    it("honors a custom page width", () => {
        expect(slidePdfPageSize({ w: 1280, h: 720 }, 640)).toEqual({ w: 640, h: 360 });
    });
});

describe("docPageGeometry", () => {
    it("derives the A4 content width, px→pt scale, and page content height", () => {
        const g = docPageGeometry(1000);
        expect(g.contentPtW).toBe(A4_W - 2 * DOC_MARGIN); // 499
        expect(g.scale).toBeCloseTo(499 / 1000, 6);
        expect(g.pageContentPxH).toBeCloseTo((A4_H - 2 * DOC_MARGIN) / g.scale, 4);
    });
});

describe("deckPngCanvasSize", () => {
    it("is the widest slide × the summed heights, at scale", () => {
        const size = deckPngCanvasSize([
            { w: 1280, h: 720 },
            { w: 1280, h: 900 },
        ]);
        expect(size.width).toBe(1280 * EXPORT_SCALE);
        expect(size.height).toBe((720 + 900) * EXPORT_SCALE);
    });
    it("never falls below SLIDE_W", () => {
        expect(deckPngCanvasSize([{ w: 800, h: 400 }], 1).width).toBe(SLIDE_W);
    });
});
