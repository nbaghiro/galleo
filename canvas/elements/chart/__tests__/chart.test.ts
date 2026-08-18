import { describe, expect, it } from "vitest";
import { CHART_TYPES } from "@model/elements";
import { contrastRatio, resolveTheme } from "@themes";
import { renderChart, chartTypeOptions } from "@elements/chart/render";
import { catList, fmt, getChart, normalize, seriesColors, yMax } from "@elements/chart/utils";
import { recordingDrawContext, tokens } from "@canvas/testkit";

const carbon = resolveTheme("carbon").tokens;

describe("registry", () => {
    // drift guard: the model value-set and the canvas registry must name the same types
    it("matches the CHART_TYPES value-set exactly", () => {
        const ids = chartTypeOptions().map((o) => o.value);
        expect([...ids].sort()).toEqual([...CHART_TYPES].sort());
    });
});

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
    it("resolves the type, defaulting to bar", () => {
        expect(normalize({ values: "1", type: "line" }).type).toBe("line");
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
        expect(yMax(normalize({ values: "3, 4\n5, 6", stacked: true }))).toBe(10);
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
    it("steps the accent into n opaque hex colors", () => {
        const cols = seriesColors(tokens, 3);
        expect(cols).toHaveLength(3);
        expect(cols.every((c) => /^#[0-9a-fA-F]{6}$/.test(c))).toBe(true);
        expect(cols[0]!.toLowerCase()).toBe(tokens.accent.toLowerCase());
    });

    it("recedes toward the page on a dark theme, keeping every step distinct", () => {
        const cols = seriesColors(carbon, 5);
        expect(new Set(cols.map((c) => c.toLowerCase())).size).toBe(5);
        // each step moves away from the accent toward the page, never toward white
        for (const c of cols) expect(contrastRatio(c, carbon.bg)).toBeGreaterThan(1.2);
        expect(contrastRatio(cols[0]!, carbon.bg)).toBeGreaterThan(
            contrastRatio(cols[4]!, carbon.bg),
        );
    });

    it("funnel labels clear contrast on their band, whatever the theme", () => {
        const data = { type: "funnel", values: "1200, 680, 340, 120", categories: "A, B, C, D" };
        for (const theme of [tokens, carbon]) {
            const { ctx, calls } = recordingDrawContext();
            renderChart(ctx, { x: 0, y: 0, w: 400, h: 300 }, data, theme);
            const bands = seriesColors(theme, 4);
            const texts = calls.filter((c) => c.op === "text");
            expect(texts).toHaveLength(4);
            texts.forEach((t, i) => {
                const fill = (t.style as { fill: string }).fill;
                expect(
                    contrastRatio(fill, bands[i]!),
                    `label ${i} ink ${fill} on ${bands[i]}`,
                ).toBeGreaterThanOrEqual(3);
            });
        }
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
