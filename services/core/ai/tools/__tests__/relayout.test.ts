import { describe, it, expect } from "vitest";
import type { ElementInstance, Section } from "@model/artifact";
import { arrangementBriefs } from "@services/core/ai/tools/relayout";

const txt = (text: string): ElementInstance => ({ type: "text", data: { text } });
const img = (src: string): ElementInstance => ({ type: "image", data: { src } });
const sec = (children: ElementInstance[]): Section => ({
    id: "s1",
    root: { type: "group", data: { children } },
});

describe("arrangementBriefs", () => {
    it("a section with an image draws from the full pool, image-led briefs first", () => {
        const briefs = arrangementBriefs(sec([txt("Title"), img("https://x/a.jpg")]), 3);
        expect(briefs).toHaveLength(3);
        expect(briefs[0]).toMatch(/full-bleed/i);
    });

    it("a section without images never gets an image-led brief", () => {
        const briefs = arrangementBriefs(sec([txt("Title"), txt("Body")]), 4);
        expect(briefs.length).toBeGreaterThanOrEqual(3);
        for (const b of briefs) expect(b).not.toMatch(/^(Full-bleed|Split)/);
    });

    it("count caps the list", () => {
        expect(arrangementBriefs(sec([txt("T")]), 2)).toHaveLength(2);
    });
});
