import { describe, expect, it } from "vitest";
import { renderChart, chartTypeOptions } from "@elements/chart/render";
import { catList, fmt, getChart, normalize, seriesColors, yMax } from "@elements/chart/utils";
import { recordingDrawContext, tokens } from "@canvas/testkit";

// Pure parsing/palette logic + a render sweep. The renderers compute real geometry (real d3-scale/shape);
// we assert the call stream from a recording DrawContext, not pixels.

describe("normalize", () => {
    it("parses series (newline) and points (comma), naming unnamed series", () => {
        expect(normalize({ values: "1, 2, 3\n4, 5", seriesNames: "A" }).series).toEqual([
            { name: "A", points: [1, 2, 3] },
            { name: "Series 2", points: [4, 5] },
        ]);
    });
    it("drops non-finite cells and empty rows", () => {
        expect(normalize({ values: "1, x, 3\n\n , " }).series).toEqual([
            { name: "Series 1", points: [1, 3] },
        ]);
    });
    it("resolves the type: type → legacy kind → default bar", () => {
        expect(normalize({ values: "1", type: "line" }).type).toBe("line");
        expect(normalize({ values: "1", kind: "pie" }).type).toBe("pie");
        expect(normalize({ values: "1" }).type).toBe("bar");
    });
    it("defaults showGrid to true", () => {
        expect(normalize({ values: "1" }).options.showGrid).toBe(true);
        expect(normalize({ values: "1", showGrid: false }).options.showGrid).toBe(false);
    });
});

describe("catList", () => {
    it("uses authored categories, else 1..n from the longest series", () => {
        expect(catList(normalize({ values: "1,2", categories: "Jan, Feb" }))).toEqual([
            "Jan",
            "Feb",
        ]);
        expect(catList(normalize({ values: "1,2,3\n4,5" }))).toEqual(["1", "2", "3"]);
    });
});

describe("yMax", () => {
    it("is the overall max, floored at 1", () => {
        expect(yMax(normalize({ values: "3, 9, 5" }))).toBe(9);
        expect(yMax(normalize({ values: "0, 0" }))).toBe(1);
    });
    it("is the per-category sum when stacked", () => {
        expect(yMax(normalize({ values: "3, 4\n5, 6", stacked: true }))).toBe(10); // max(3+5, 4+6)
    });
});

describe("fmt", () => {
    it("compacts thousands and millions, trimming to one decimal", () => {
        expect(fmt(950)).toBe("950");
        expect(fmt(1200)).toBe("1.2k");
        expect(fmt(3_400_000)).toBe("3.4M");
        expect(fmt(42.34)).toBe("42.3");
    });
});

describe("seriesColors", () => {
    it("ramp steps the accent opacity into n colors", () => {
        const cols = seriesColors(tokens, 3, "ramp");
        expect(cols).toHaveLength(3);
        expect(cols.every((c) => c.startsWith("rgba("))).toBe(true);
    });
    it("categorical rotates the hue into n distinct colors", () => {
        const cols = seriesColors(tokens, 3, "categorical");
        expect(cols).toHaveLength(3);
        expect(new Set(cols).size).toBe(3);
    });
});

describe("registry", () => {
    it("registers every chart type", () => {
        const ids = chartTypeOptions().map((o) => o.value);
        expect(ids).toContain("bar");
        expect(ids).toContain("treemap");
        expect(getChart("bar")?.id).toBe("bar");
    });
});

describe("renderChart", () => {
    const box = { x: 0, y: 0, w: 400, h: 300 };
    const data = {
        values: "10, 20, 30\n5, 15, 25",
        categories: "A, B, C",
        seriesNames: "One, Two",
    };

    for (const { value: id } of chartTypeOptions()) {
        it(`${id} produces draw calls for valid data`, () => {
            const { ctx, calls } = recordingDrawContext();
            renderChart(ctx, box, { ...data, type: id }, tokens);
            expect(calls.length).toBeGreaterThan(0);
        });
    }

    it("renders nothing when there are no points", () => {
        const { ctx, calls } = recordingDrawContext();
        renderChart(ctx, box, { values: "", type: "bar" }, tokens);
        expect(calls).toHaveLength(0);
    });
});
