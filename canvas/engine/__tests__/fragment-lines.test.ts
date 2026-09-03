import { describe, expect, it } from "vitest";
import type { RenderCommand } from "@engine/node";
import { fragment } from "@engine/layout";
import { measure } from "@canvas/testkit";

// a paragraph command whose lines come from the real testkit wrap (16px lines)
const para = (
    words: number,
    y: number,
    extra?: Partial<Extract<RenderCommand, { kind: "text" }>>,
) => {
    const text = Array.from({ length: words }, () => "word").join(" ");
    const leaf = { text, fontId: "f", size: 12, lineHeight: 16, wrap: "words" as const };
    const m = measure(leaf, 80); // "word"(32) + " "(8): two words per 80px line
    const cmd: RenderCommand = {
        kind: "text",
        box: { x: 0, y, w: 80, h: m.height },
        text: leaf,
        lines: m.lines,
        ...extra,
    };
    return cmd;
};

describe("fragment at line boundaries", () => {
    it("splits a tall paragraph between lines instead of at the hard limit", () => {
        const p = para(20, 0); // 10 lines × 16 = 160
        const pages = fragment([p], 160, 100); // limit inside line 7
        expect(pages.length).toBe(2);
        const first = pages[0]![0]!;
        const second = pages[1]![0]!;
        if (first.kind !== "text" || second.kind !== "text") throw new Error("text expected");
        expect(first.lineRange).toEqual({ start: 0, end: 6 });
        expect(second.lineRange).toEqual({ start: 6, end: 10 });
        expect(first.box.h).toBe(96);
        expect(second.box.y).toBe(0);
        expect(second.box.h).toBe(64);
    });

    it("keeps at least two lines on each side of a cut", () => {
        const p = para(8, 0); // 4 lines × 16 = 64
        const pages = fragment([p], 64, 40); // limit at 2.5 lines; only cut allowed is at 2
        expect(pages.length).toBe(2);
        const first = pages[0]![0]!;
        if (first.kind !== "text") throw new Error("text expected");
        expect(first.lineRange).toEqual({ start: 0, end: 2 });
    });

    it("never line-splits a paragraph shorter than four lines", () => {
        const p = para(6, 0); // 3 lines = 48
        const pages = fragment([p], 48, 40);
        // no legal line break: falls to the hard limit, command clipped across pages as before
        expect(pages.length).toBe(2);
        expect(pages[0]![0]!.kind).toBe("text");
        if (pages[0]![0]!.kind === "text") expect(pages[0]![0]!.lineRange).toBeUndefined();
    });

    it("prefers a command boundary over a line boundary when one fits", () => {
        const a = para(4, 0); // 2 lines: 0..32
        const b = para(20, 40); // 10 lines: 40..200
        const pages = fragment([a, b], 200, 36); // a's bottom (32) is a clean break inside the page
        const firstPage = pages[0]!;
        expect(firstPage.length).toBe(1);
        if (firstPage[0]!.kind === "text") expect(firstPage[0]!.lineRange).toBeUndefined();
    });

    it("splits the same paragraph across three pages with consistent windows", () => {
        const p = para(30, 0); // 15 lines × 16 = 240
        const pages = fragment([p], 240, 100); // 6 lines per page
        expect(pages.length).toBe(3);
        const ranges = pages.map((pg) => {
            const c = pg[0]!;
            if (c.kind !== "text") throw new Error("text expected");
            return c.lineRange;
        });
        expect(ranges[0]).toEqual({ start: 0, end: 6 });
        expect(ranges[1]).toEqual({ start: 6, end: 12 });
        expect(ranges[2]).toEqual({ start: 12, end: 15 });
    });
});

describe("a line cut against two offset paragraphs", () => {
    // A at y=0 and B at y=12: 16px grids that never coincide (0 mod 16 vs 12 mod 16), both
    // forced past the hard limit, so any line candidate lies off one paragraph's grid.
    it("takes no line break when the candidate is off a crossing paragraph's grid", () => {
        const a = para(20, 0, { box: { x: 0, y: 0, w: 38, h: 160 }, id: "a" }); // 10 lines
        const b = para(20, 12, { box: { x: 42, y: 12, w: 38, h: 160 }, id: "b" }); // 10 lines
        const pages = fragment([a, b], 200, 100);
        for (const page of pages)
            for (const c of page) {
                if (c.kind !== "text" || !c.lineRange) continue; // whole crossers window via clip
                // a slice is a precise window: it must start on its own page, never above it
                expect(c.box.y).toBeGreaterThanOrEqual(-0.5);
            }
        // stronger: with grids that share no boundary, no slice may exist at all
        const sliced = pages.flat().filter((c) => c.kind === "text" && c.lineRange);
        expect(sliced).toHaveLength(0);
    });
});
