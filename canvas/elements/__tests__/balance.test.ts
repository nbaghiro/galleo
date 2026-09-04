import "@elements/register";
import { describe, expect, it } from "vitest";
import { rowGroup } from "@model/artifact";
import { resolveProfile } from "@engine/profile";
import { composedNodeFor } from "@elements/compose";
import { inst, layoutCtx, sectionOf } from "@canvas/testkit";

// a split row: [i] addresses the i-th top-level column, so its composed node carries the alignSelf
// the balance default set (or did not).
const ctx = layoutCtx(960, resolveProfile("deck"));
const alignOf = (root: ReturnType<typeof rowGroup>, i: number): string | undefined =>
    composedNodeFor(sectionOf(root), { section: "s1", path: [i] }, ctx)?.alignSelf;

const textCol = () =>
    inst("container", {
        direction: "col",
        children: [
            inst("text", { text: "Heading", style: "h2" }),
            inst("text", {
                text: "A paragraph of body copy that runs on for a while.",
                style: "body",
            }),
        ],
    });
const chartCol = () =>
    inst("container", {
        direction: "col",
        children: [
            inst("text", { text: "SVP Hardness", style: "h2" }),
            inst("chart", { type: "line", series: [] }),
        ],
    });

describe("row balance", () => {
    it("centres a visual-led column beside a text column, so its gap is not stranded at the bottom", () => {
        const root = rowGroup([textCol(), chartCol()], [0.5, 0.5]);
        expect(alignOf(root, 0)).toBeUndefined(); // the text column keeps top alignment
        expect(alignOf(root, 1)).toBe("center"); // the chart column centres
    });

    it("leaves a visual column the author already placed alone", () => {
        const chart = chartCol();
        chart.layout = { width: { pct: 50 }, align: "start" };
        const root = rowGroup([textCol(), chart], [0.5, 0.5]);
        expect(alignOf(root, 1)).toBe("start");
    });

    it("does not centre a column that carries body copy, visual or not", () => {
        const mixed = inst("container", {
            direction: "col",
            children: [
                inst("chart", { type: "line", series: [] }),
                inst("text", {
                    text: "A paragraph explaining the chart in full sentences.",
                    style: "body",
                }),
            ],
        });
        const root = rowGroup([textCol(), mixed], [0.5, 0.5]);
        expect(alignOf(root, 1)).toBeUndefined();
    });

    it("leaves two text columns top-aligned, so their headings line up", () => {
        const root = rowGroup([textCol(), textCol()], [0.5, 0.5]);
        expect(alignOf(root, 0)).toBeUndefined();
        expect(alignOf(root, 1)).toBeUndefined();
    });
});

describe("fill never collapses", () => {
    // a chart carries a natural height (grow with a min); height:"fill" must keep that floor, so a
    // fill with nothing to stretch into (a fit column) renders the chart instead of collapsing it
    it("keeps a chart's height floor when it is told to fill inside a fit column", () => {
        const col = inst("container", {
            direction: "col",
            children: [
                inst("text", { text: "PATH LATENCY", style: "label" }),
                inst("chart", { type: "line", values: "42, 18, 12" }, { height: "fill" }),
                inst("text", { text: "caption", style: "caption" }),
            ],
        });
        const root = rowGroup([col, textCol()], [0.4, 0.6]);
        const chart = composedNodeFor(sectionOf(root), { section: "s1", path: [0, 1] }, ctx);
        expect(chart?.h.mode).toBe("grow");
        expect((chart?.h as { min?: number }).min ?? 0).toBeGreaterThan(0);
    });
});

describe("visual column centres its content", () => {
    it("centres a col whose content is a lone visual, so a fixed diagram is not top-stranded", () => {
        const col = inst("container", {
            direction: "col",
            children: [inst("diagram", { type: "funnel", items: "A | x\nB | y" })],
        });
        const node = composedNodeFor(sectionOf(col), { section: "s1", path: [] }, ctx);
        expect(node?.alignY).toBe("center");
    });

    it("leaves a col with body copy top-anchored", () => {
        const node = composedNodeFor(sectionOf(textCol()), { section: "s1", path: [] }, ctx);
        expect(node?.alignY).toBeUndefined();
    });
});
