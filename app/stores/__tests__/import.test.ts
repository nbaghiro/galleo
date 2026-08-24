import { describe, expect, it } from "vitest";
import { importKindOf, pdfPagesContent } from "@app/stores/import";

const PPTX_MIME = "application/vnd.openxmlformats-officedocument.presentationml.presentation";

describe("importKindOf", () => {
    it("recognizes pdf and pptx by extension or mime", () => {
        expect(importKindOf(new File([""], "deck.PDF", { type: "" }))).toBe("pdf");
        expect(importKindOf(new File([""], "x", { type: "application/pdf" }))).toBe("pdf");
        expect(importKindOf(new File([""], "deck.pptx", { type: "" }))).toBe("pptx");
        expect(importKindOf(new File([""], "x", { type: PPTX_MIME }))).toBe("pptx");
        expect(importKindOf(new File([""], "notes.txt", { type: "text/plain" }))).toBeNull();
    });
});

describe("pdfPagesContent", () => {
    it("builds one static image section per page", () => {
        const content = pdfPagesContent([
            { url: "/api/media/asset/a", w: 1600, h: 900 },
            { url: "/api/media/asset/b", w: 1600, h: 900 },
        ]);
        expect(content.format).toBe("deck");
        expect(content.page).toBeUndefined(); // 16:9 needs no page override
        expect(content.sections).toHaveLength(2);
        const first = content.sections[0]!;
        expect(first.id).toBe("s-1");
        expect(first.root.type).toBe("image");
        expect(first.root.data).toMatchObject({
            src: "/api/media/asset/a",
            fit: "contain",
            radius: 0,
            dims: { w: 1600, h: 900 },
        });
    });

    it("sizes the artifact page from the first page's shape", () => {
        const content = pdfPagesContent([{ url: "/a", w: 1224, h: 1584 }]); // letter portrait
        expect(content.page).toEqual({ width: 1280, height: Math.round((1280 * 1584) / 1224) });
    });

    it("gives an odd page its own frame aspect", () => {
        const content = pdfPagesContent([
            { url: "/a", w: 1600, h: 900 },
            { url: "/b", w: 900, h: 1600 },
        ]);
        expect(content.sections[0]!.frame).toBeUndefined();
        expect(content.sections[1]!.frame).toEqual({
            aspect: Math.round((900 / 1600) * 100) / 100,
        });
    });
});
