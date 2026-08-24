import { describe, expect, it } from "vitest";
import { CHART_TYPES, DIAGRAM_TYPES } from "@model/elements";
import { contrastRatio, resolveTheme } from "@themes";
import type { Region } from "@engine/node";
import { inRegion } from "@engine/node";
import { chartSpans, renderChart, chartTypeOptions } from "@elements/chart/render";
import type { DatumSpan } from "@elements/chart/render";
import {
    catList,
    fmt,
    getChart,
    HIT_R,
    normalize,
    polyBox,
    seriesColors,
    yMax,
} from "@elements/chart/utils";
import { measure, recordingDrawContext, tokens } from "@canvas/testkit";

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

describe("chartSpans", () => {
    const box = { x: 0, y: 0, w: 400, h: 300 };
    const spans = (data: Record<string, unknown>): DatumSpan[] =>
        chartSpans(box, data, tokens, measure);
    const cats = { values: "10, 20, 30", categories: "A, B, C" };
    const two = { values: "10, 20, 30\n5, 15, 25", categories: "A, B, C", seriesNames: "One, Two" };
    const inside = (s: DatumSpan): boolean =>
        s.box.x >= 0 && s.box.y >= 0 && s.box.x + s.box.w <= box.w && s.box.y + s.box.h <= box.h;

    // one span per (category × series) mark, addressed by the data-editor row
    for (const type of ["bar", "column"]) {
        it(`${type} reports one span per bar, indexed by category`, () => {
            expect(spans({ ...cats, type }).map((s) => s.index)).toEqual([0, 1, 2]);
            const grouped = spans({ ...two, type });
            expect(grouped).toHaveLength(6);
            expect(grouped.filter((s) => s.index === 1)).toHaveLength(2);
            expect(grouped.every(inside)).toBe(true);
        });

        it(`${type} stacks two series into the same slot when stacked`, () => {
            const stacked = spans({ ...two, type, stacked: true });
            expect(stacked).toHaveLength(6);
            const [a, b] = stacked.filter((s) => s.index === 0);
            // the second sits on top of (or beside) the first, never in the same place
            expect(a!.box.x === b!.box.x && a!.box.y === b!.box.y).toBe(false);
        });
    }

    for (const type of ["pie", "donut"]) {
        it(`${type} reports a wedge polygon, not a bounding box`, () => {
            const wedges = spans({ ...cats, type });
            expect(wedges.map((s) => s.index)).toEqual([0, 1, 2]);
            for (const w of wedges) {
                expect(w.points!.length).toBeGreaterThan(3);
                expect(w.box).toEqual(polyBox(w.points!));
            }
            // the three wedges cover a full turn, so their boxes together span the whole disc
            const union = polyBox(wedges.flatMap((w) => w.points!));
            expect(union.w).toBeGreaterThan(box.w / 4);
        });
    }

    it("a pie wedge answers point-in-polygon, not point-in-box", () => {
        // a single value is the whole disc, so a corner of its box is outside the circle
        const [whole] = spans({ values: "1", categories: "All", type: "pie" });
        const r: Region = {
            id: "d",
            box: whole!.box,
            shape: { kind: "poly", points: whole!.points! },
        };
        const cx = whole!.box.x + whole!.box.w / 2;
        const cy = whole!.box.y + whole!.box.h / 2;
        expect(inRegion(r, cx, cy)).toBe(true);
        expect(inRegion(r, whole!.box.x + 1, whole!.box.y + 1)).toBe(false);
    });

    it("line reports one span per point of every series", () => {
        const dots = spans({ ...two, type: "line" });
        expect(dots).toHaveLength(6);
        expect(dots.map((s) => s.index)).toEqual([0, 1, 2, 0, 1, 2]);
        expect(dots.every((s) => s.box.w === HIT_R * 2)).toBe(true);
    });

    it("scatter and bubble report one span per point", () => {
        const xy = { values: "1, 2, 3\n4, 5, 6", type: "scatter" };
        expect(spans(xy).map((s) => s.index)).toEqual([0, 1, 2]);
        const bubbles = spans({ values: "1, 2, 3\n4, 5, 6\n10, 20, 30", type: "bubble" });
        expect(bubbles.map((s) => s.index)).toEqual([0, 1, 2]);
        // bubble marks are sized by the third series, so they are not all the same box
        expect(new Set(bubbles.map((s) => s.box.w)).size).toBeGreaterThan(1);
    });

    it("reports nothing for a type that has no addressable datums, or for empty data", () => {
        for (const type of ["heatmap", "radar", "gauge", "treemap", "waterfall", "pack"])
            expect(spans({ ...cats, type })).toEqual([]);
        expect(spans({ values: "", type: "bar" })).toEqual([]);
    });

    // the whole point of a span: it is the geometry the painter used, not a re-guess of it
    it("puts every column span exactly where the painter drew its rect", () => {
        const { ctx, calls } = recordingDrawContext();
        const data = { ...cats, type: "column" };
        renderChart(ctx, box, data, tokens);
        const rects = calls.filter((c) => c.op === "rect");
        expect(rects).toHaveLength(3);
        expect(spans(data).map((s) => s.box)).toEqual(
            rects.map((r) => ({ x: r.x, y: r.y, w: r.w, h: r.h })),
        );
    });
});
