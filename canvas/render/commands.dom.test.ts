// @vitest-environment happy-dom
import "@elements/register";
import { beforeAll, describe, expect, it } from "vitest";
import type { TextLeaf } from "@engine/node";
import { clearMeasureCache, measureText, sectionSlides } from "@canvas/render/commands";
import { resolveProfile } from "@engine/profile";
import { inst, installCanvas2D, sectionOf, tokens } from "@canvas/testkit";

// measureText + sectionSlides use the module-level canvas 2D context; installCanvas2D provides a
// deterministic one (glyph width = length × 8). The wrap/pagination logic is real.

beforeAll(() => installCanvas2D());

describe("measureText", () => {
    const leaf: TextLeaf = { text: "hello", fontId: "f", size: 12, wrap: "words" };
    it("measures a leaf and caches the result", () => {
        clearMeasureCache();
        const a = measureText(leaf, 999);
        const b = measureText(leaf, 999);
        expect(a.width).toBeGreaterThan(0);
        expect(a.height).toBeGreaterThan(0);
        expect(b).toBe(a); // cache hit returns the same object
    });
});

describe("sectionSlides", () => {
    const deck = resolveProfile("deck");
    it("a short section is a single 1280×720 page", () => {
        const pages = sectionSlides(sectionOf(inst("text", { text: "Title" })), tokens, deck);
        expect(pages).toHaveLength(1);
        expect(pages[0]!.w).toBe(1280);
        expect(pages[0]!.h).toBe(720);
    });
    it("a very tall section paginates into several pages", () => {
        const paras = Array.from({ length: 60 }, (_, i) => inst("text", { text: `Line ${i}` }));
        const section = sectionOf({ type: "group", data: { direction: "col", children: paras } });
        expect(sectionSlides(section, tokens, deck).length).toBeGreaterThan(1);
    });
});
