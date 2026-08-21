import { describe, expect, it } from "vitest";
import { CHART_TYPES, DIAGRAM_TYPES } from "@model/elements";
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

    // One name, one home. A type present in both families is ambiguous to the LLM (which sees both
    // enums), to the palette (two tiles), and to dataShapeFor — the funnel taught us all three.
    it("shares no type name with the diagram family", () => {
        const both = CHART_TYPES.filter((t) => (DIAGRAM_TYPES as readonly string[]).includes(t));
        expect(both).toEqual([]);
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

    it("labels painted on a ramp fill clear contrast on it, whatever the theme", () => {
        // treemap inks each cell's label against that cell; the call stream pairs them in order
        const data = { type: "treemap", values: "420, 260, 180, 140", categories: "A, B, C, D" };
        for (const theme of [tokens, carbon]) {
            const { ctx, calls } = recordingDrawContext();
            renderChart(ctx, { x: 0, y: 0, w: 400, h: 300 }, data, theme);
            let cell: string | undefined;
            let checked = 0;
            for (const c of calls) {
                if (c.op === "rect") cell = (c.style as { fill?: string }).fill;
                if (c.op !== "text" || !cell) continue;
                const ink = (c.style as { fill: string }).fill;
                expect(contrastRatio(ink, cell), `ink ${ink} on ${cell}`).toBeGreaterThanOrEqual(3);
                checked++;
            }
            expect(checked).toBeGreaterThan(0);
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

describe("waterfall", () => {
    it("floats each bar between the running totals either side of it", () => {
        const { ctx, calls } = recordingDrawContext();
        renderChart(
            ctx,
            { x: 0, y: 0, w: 400, h: 300 },
            { type: "waterfall", values: "100, 50, -30", categories: "A, B, C" },
            tokens,
        );
        const bars = calls.filter((c) => c.op === "rect");
        expect(bars).toHaveLength(3);
        const y = bars.map((b) => b.y as number);
        const h = bars.map((b) => b.h as number);
        // the second rise stacks above the first, and the fall hangs from the running total
        expect(y[1]!).toBeLessThan(y[0]!);
        expect(y[2]!).toBeCloseTo(y[1]!, 1);
        expect(h[2]!).toBeLessThan(h[1]!);
    });
});
