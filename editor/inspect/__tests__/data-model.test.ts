import "@elements/register";
import { describe, expect, it } from "vitest";
import {
    dataShapeFor,
    invalidNumber,
    itemLimit,
    parseModel,
    serializeModel,
} from "@editor/inspect/data-model";

// The data-shape taxonomy + the parse↔serialize round-trip for the visual data editor. Pure string math
// over the chart/diagram normalizers — no registry needed, but registered for parity with the suite.

describe("dataShapeFor", () => {
    it("maps chart types, defaulting an unknown chart to series", () => {
        expect(dataShapeFor("chart", "bar")).toBe("series");
        expect(dataShapeFor("chart", "line")).toBe("series");
        expect(dataShapeFor("chart", "pie")).toBe("labelValue");
        expect(dataShapeFor("chart", "mystery")).toBe("series");
    });

    it("maps diagram types, defaulting an unknown diagram to list", () => {
        expect(dataShapeFor("diagram", "tree")).toBe("hierarchy");
        expect(dataShapeFor("diagram", "flow")).toBe("graph");
        expect(dataShapeFor("diagram", "process")).toBe("list");
        expect(dataShapeFor("diagram", "mystery")).toBe("list");
    });

    it("disambiguates the funnel collision by category, and returns undefined for other categories", () => {
        expect(dataShapeFor("chart", "funnel")).toBe("labelValue");
        expect(dataShapeFor("diagram", "funnel")).toBe("list");
        expect(dataShapeFor("text", "callout")).toBeUndefined();
    });
});

describe("parseModel ↔ serializeModel round-trip", () => {
    it("a bar series preserves values / categories / seriesNames", () => {
        const data = {
            type: "bar",
            values: "10, 20, 30\n40, 50, 60",
            categories: "A, B, C",
            seriesNames: "S1, S2",
        };
        const model = parseModel("chart", "series", data);
        expect(serializeModel("chart", "series", model)).toEqual({
            values: "10, 20, 30\n40, 50, 60",
            categories: "A, B, C",
            seriesNames: "S1, S2",
        });
    });

    it("a line series preserves its fields the same way", () => {
        const data = {
            type: "line",
            values: "1, 2, 3",
            categories: "Q1, Q2, Q3",
            seriesNames: "Revenue",
        };
        const model = parseModel("chart", "series", data);
        expect(serializeModel("chart", "series", model)).toEqual({
            values: "1, 2, 3",
            categories: "Q1, Q2, Q3",
            seriesNames: "Revenue",
        });
    });

    it("a graph (from->to:label) preserves items + links", () => {
        const data = { type: "flow", items: "A, B, C", links: "A->B:yes, B->C" };
        const model = parseModel("diagram", "graph", data);
        expect(serializeModel("diagram", "graph", model)).toEqual({
            items: "A, B, C",
            links: "A->B:yes, B->C",
        });
    });

    it("a hierarchy (parent>child) preserves items + links", () => {
        const data = {
            type: "tree",
            items: "Root, Child1, Child2",
            links: "Root>Child1, Root>Child2",
        };
        const model = parseModel("diagram", "hierarchy", data);
        expect(serializeModel("diagram", "hierarchy", model)).toEqual({
            items: "Root, Child1, Child2",
            links: "Root>Child1, Root>Child2",
        });
    });
});

describe("invalidNumber", () => {
    it("treats empty / whitespace as valid (they mean 0)", () => {
        expect(invalidNumber("")).toBe(false);
        expect(invalidNumber("   ")).toBe(false);
    });

    it("accepts finite numbers including exponent notation", () => {
        expect(invalidNumber("42")).toBe(false);
        expect(invalidNumber("1e3")).toBe(false);
    });

    it("rejects non-numeric text", () => {
        expect(invalidNumber("x")).toBe(true);
        expect(invalidNumber("1.2.3")).toBe(true);
    });
});

describe("itemLimit", () => {
    it("caps venn / quadrant diagrams and leaves other diagrams uncapped", () => {
        expect(itemLimit("diagram", "venn")).toBe(3);
        expect(itemLimit("diagram", "quadrant")).toBe(4);
        expect(itemLimit("diagram", "process")).toBeUndefined();
    });

    it("only applies to diagrams, never charts", () => {
        expect(itemLimit("chart", "venn")).toBeUndefined();
    });
});
