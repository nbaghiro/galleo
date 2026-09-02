import { describe, expect, it } from "vitest";
import type { ElementInstance } from "@model/artifact";
import type { PptxDeck, PptxLayout } from "@services/utils/pptx";
import {
    designCatalog,
    designId,
    designKindOf,
    designSection,
    designsToContent,
} from "@services/core/designs";
import { sectionForms } from "@model/artifact";
import { isArtifactContent } from "@services/core/artifacts";

const slot = (role: PptxLayout["slots"][number]["role"]): PptxLayout["slots"][number] => ({
    role,
    box: { x: 0, y: 0, w: 4, h: 3 },
});
const layout = (name: string, ...roles: PptxLayout["slots"][number]["role"][]): PptxLayout => ({
    name,
    slots: roles.map(slot),
});
const deck = (...layouts: PptxLayout[]): PptxDeck => ({
    w: 1280,
    h: 720,
    scheme: { lt1: "#ffffff", dk1: "#111111", accent1: "#005da5" },
    fonts: {},
    slides: [],
    layouts,
});

describe("designKindOf", () => {
    it("reads the layout's own name, which is what a real template names its designs by", () => {
        const cases: [string, string][] = [
            ["1_Master Title", "cover"],
            ["Table Of Content", "agenda"],
            ["Section Title_wBackground_2", "divider"],
            ["Quote", "quote"],
            ["1_Table Slide", "table"],
            ["Column Chart", "chart"],
            ["1_Timeline Chart", "timeline"],
            ["VS Slide_1", "comparison"],
            ["4 Text Column with Icons", "cards"],
            ["Full Pic Slide", "photo"],
            ["Thank you", "closing"],
            ["Overview_img_Left_G", "split"],
            ["Only Text Slide - Longer Header", "statement"],
        ];
        for (const [name, kind] of cases)
            expect([name, designKindOf(name, [slot("body")])]).toEqual([name, kind]);
    });

    it("is forgiving about spelling and strict about word boundaries", () => {
        // the deck this was built against spells it "coloumn", and "Graphic" is not a chart
        expect(designKindOf("3_coloumn Slide wSm-Header", [slot("body")])).toBe("cards");
        expect(designKindOf("Text & Graphic_1", [slot("body"), slot("media")])).toBe("split");
    });

    it("falls back to the shape when the name says nothing", () => {
        expect(designKindOf("Layout 7", [slot("media")])).toBe("photo");
        expect(designKindOf("Layout 7", [slot("body"), slot("media")])).toBe("split");
        expect(
            designKindOf("Layout 7", [slot("body"), slot("body"), slot("body"), slot("body")]),
        ).toBe("cards");
    });
});

describe("designCatalog", () => {
    it("keys designs by a slug of the file's own name and skips empty layouts", () => {
        const cat = designCatalog(deck(layout("Quote", "body"), layout("Blank")));
        expect(cat.map((d) => d.id)).toEqual(["quote"]);
        expect(cat[0]!.name).toBe("Quote");
    });

    it("takes a repeat count from the name, since the repeats are often drawn, not placed", () => {
        // "3_coloumn" declares one placeholder; its three columns are decoration on the slide
        const cat = designCatalog(deck(layout("3_coloumn Slide wSm-Header", "body")));
        expect(cat[0]!.columns).toBe(3);
        expect(
            designCatalog(deck(layout("4 Text Column with Icons", "body", "body")))[0]!.columns,
        ).toBe(4);
    });

    it("counts slots when the name states no number", () => {
        expect(designCatalog(deck(layout("Overview", "body", "media")))[0]!.columns).toBe(2);
    });

    it("never mints two designs under one id", () => {
        const cat = designCatalog(deck(layout("Quote", "body"), layout("Quote", "body")));
        expect(cat).toHaveLength(1);
    });
});

describe("designId", () => {
    it("slugs a name and falls back when there is nothing to slug", () => {
        expect(designId("Section Title_wBackground_2", 0)).toBe("section-title-wbackground-2");
        expect(designId("!!!", 3)).toBe("design-4");
    });
});

describe("a design wider than one row", () => {
    it("keeps the stated count up to six and builds its cards as a grid", () => {
        const cat = designCatalog(deck(layout("6 Column Icons", "body")));
        expect(cat[0]!.columns).toBe(6);
        const sec = designSection(cat[0]!);
        const kids = (sec.root.data as { children?: ElementInstance[] }).children!;
        const gridEl = kids[1]!;
        const g = gridEl.data as { direction?: string; columns?: number; children?: unknown[] };
        expect(g.direction).toBe("grid");
        expect(g.columns).toBe(3);
        expect(g.children).toHaveLength(6);
    });

    it("stays one row at four and under", () => {
        const cat = designCatalog(deck(layout("3_Coloumn", "body")));
        const sec = designSection(cat[0]!);
        const kids = (sec.root.data as { children?: ElementInstance[] }).children!;
        expect((kids[1]!.data as { direction?: string }).direction).toBe("row");
    });
});

describe("designsToContent", () => {
    const library = (): ReturnType<typeof designsToContent> =>
        designsToContent(
            deck(
                layout("1_Master Title", "title"),
                layout("Quote", "body"),
                layout("4 Text Column with Icons", "body", "body"),
                layout("1_Table Slide", "body"),
                layout("Overview_img_Left_G", "body", "media"),
            ),
            "studio",
        );

    it("is a valid artifact, one section per design, in the file's order", () => {
        const content = library();
        expect(isArtifactContent(content)).toBe(true);
        expect(content.sections.map((s) => s.id)).toEqual([
            "1-master-title",
            "quote",
            "4-text-column-with-icons",
            "1-table-slide",
            "overview-img-left-g",
        ]);
    });

    it("lends each design as a shape a beat can actually ask for", () => {
        const forms = new Map(sectionForms(library()).map((f) => [f.id, f]));
        expect(forms.get("quote")!.blocks).toEqual(["quote"]);
        expect(forms.get("1-table-slide")!.blocks).toEqual(["table"]);
        expect(forms.get("4-text-column-with-icons")!.layout).toBe("four-up");
        expect(forms.get("overview-img-left-g")!.blocks).toEqual(["text", "image"]);
    });

    it("builds every design from elements the engine already renders", () => {
        for (const d of designCatalog(deck(layout("Anything", "body"))))
            expect(designSection(d).root).toBeTruthy();
    });
});
