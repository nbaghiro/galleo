import { describe, it, expect } from "vitest";
import { ELEMENTS, LAYOUTS } from "@model/ai";
import { TEXT_STYLES } from "@model/elements";
import { THEME_LIST } from "@themes";
import { describeTheme, elementCatalog, layoutCatalog, themeCatalog } from "../catalog";

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
