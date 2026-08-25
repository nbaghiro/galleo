import { describe, it, expect } from "vitest";
import { BUTTON_SHAPES, BUTTON_SIZES, TEXT_STYLES } from "@model/elements";
import { THEME_LIST } from "@themes";
import {
    ELEMENTS,
    LAYOUTS,
    describeTheme,
    elementCatalog,
    layoutCatalog,
    siteAnatomy,
    themeCatalog,
} from "@services/core/ai/prompts/catalog";

describe("elementCatalog", () => {
    const out = elementCatalog();

    it("has an Elements heading", () => {
        expect(out).toContain("## Elements");
    });
    it("lists EVERY registered element type (drift guard)", () => {
        for (const e of ELEMENTS) expect(out).toContain(`\`${e.type}\``);
    });
    it("lists the text style roles", () => {
        for (const style of TEXT_STYLES) expect(out).toContain(style);
    });
});

describe("the composites a site is assembled from", () => {
    const out = elementCatalog();

    // The templates build pricing, features, people and quotes from these; without a catalog entry
    // the model cannot name them and hand-rolls containers instead.
    it("offers every smart block the site templates use", () => {
        for (const type of ["pricing", "feature", "testimonial", "profile", "cta"])
            expect(out).toContain(`\`${type}\``);
    });

    it("gives the button its nav-bar fields", () => {
        const button = ELEMENTS.find((e) => e.type === "button")!;
        const keys = button.fields.map((f) => f.key);
        expect(keys).toContain("href");
        expect(button.fields.find((f) => f.key === "size")?.values).toEqual(BUTTON_SIZES);
        expect(button.fields.find((f) => f.key === "shape")?.values).toEqual(BUTTON_SHAPES);
    });

    it("tells the model a published video really plays, and needs a poster", () => {
        const video = ELEMENTS.find((e) => e.type === "video")!;
        expect(video.when).toContain("player");
        expect(video.fields.map((f) => f.key)).toContain("poster");
    });
});

describe("siteAnatomy", () => {
    const out = siteAnatomy();

    it("teaches the docked topbar as one per piece, in the first section", () => {
        expect(out).toContain('"dock": "top"');
        expect(out).toContain("first section");
        expect(out).toContain("no other section gets one");
    });

    it("teaches the band frame with real decimals, since JSON has no 16/7", () => {
        expect(out).toContain('"frame": { "aspect": 2.3 }');
        expect(out).toContain('"frame": { "aspect": 3.2 }');
    });

    it("ties nav hrefs to section ids the piece actually has", () => {
        expect(out).toContain("#<section id>");
        expect(out).toContain("only works if a section is called");
    });

    it("names the reader-facing blocks and the justified footer", () => {
        for (const bit of [
            "faq",
            "tabs",
            "video",
            "pricing",
            "testimonial",
            '"justify": "between"',
        ])
            expect(out).toContain(bit);
    });
});

describe("layoutCatalog", () => {
    const out = layoutCatalog();

    it("has a Section layout heading", () => {
        expect(out).toContain("## Section layout");
    });
    it("lists EVERY layout preset (drift guard)", () => {
        for (const g of LAYOUTS) expect(out).toContain(`\`${g.id}\``);
    });
});

describe("describeTheme", () => {
    it("names a built-in theme, its tag, and its mode", () => {
        const out = describeTheme("studio");
        expect(out).toContain("Studio");
        expect(out).toContain("editorial");
        expect(out).toContain("light");
    });
    it("reports the dark mode for a dark theme", () => {
        const dark = THEME_LIST.find((t) => t.dark)!;
        const out = describeTheme(dark.id);
        expect(out).toContain(dark.name);
        expect(out).toContain("dark");
    });
});

describe("themeCatalog", () => {
    it("lists EVERY built-in theme id", () => {
        const out = themeCatalog();
        for (const t of THEME_LIST) expect(out).toContain(`\`${t.id}\``);
    });
});
