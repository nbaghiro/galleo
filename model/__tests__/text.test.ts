import { describe, expect, it } from "vitest";
import {
    activeMarks,
    applyMark,
    comparePoints,
    isCollapsed,
    normalizeMarks,
    offsetRange,
    orderedPoints,
    removeMark,
    spliceText,
    toggleMark,
    toRuns,
} from "@model/text";
import type { Mark, Selection } from "@model/text";

describe("toRuns", () => {
    it("returns [] for empty text", () => {
        expect(toRuns("", [])).toEqual([]);
    });
    it("returns a single unstyled run when there are no marks", () => {
        expect(toRuns("hello", [])).toEqual([{ text: "hello" }]);
    });
    it("always concatenates back to the input text", () => {
        const marks: Mark[] = [
            { from: 1, to: 4, type: "b" },
            { from: 2, to: 6, type: "i" },
            { from: 0, to: 3, type: "color", value: "#111" },
        ];
        expect(
            toRuns("abcdefgh", marks)
                .map((r) => r.text)
                .join(""),
        ).toBe("abcdefgh");
    });
    it("stamps bold onto a run inside a bold mark", () => {
        const runs = toRuns("abcdef", [{ from: 1, to: 4, type: "b" }]);
        const mid = runs.find((r) => r.text === "bcd")!;
        expect(mid.bold).toBe(true);
    });
    it("lets a later overlapping value-mark win in the overlap zone", () => {
        const runs = toRuns("abcdef", [
            { from: 0, to: 4, type: "color", value: "#111" },
            { from: 2, to: 6, type: "color", value: "#222" },
        ]);
        expect(runs).toEqual([
            { text: "ab", color: "#111" },
            { text: "cdef", color: "#222" },
        ]);
    });
    it("merges adjacent runs that share a style", () => {
        const runs = toRuns("abcd", [
            { from: 0, to: 2, type: "b" },
            { from: 2, to: 4, type: "b" },
        ]);
        expect(runs).toEqual([{ text: "abcd", bold: true }]);
    });
});

describe("normalizeMarks", () => {
    it("drops empty ranges", () => {
        expect(normalizeMarks([{ from: 2, to: 2, type: "b" }])).toEqual([]);
    });
    it("merges touching same-type same-value marks", () => {
        expect(
            normalizeMarks([
                { from: 0, to: 3, type: "b" },
                { from: 3, to: 5, type: "b" },
            ]),
        ).toEqual([{ from: 0, to: 5, type: "b" }]);
    });
    it("does not merge same-type marks with different values", () => {
        const out = normalizeMarks([
            { from: 0, to: 3, type: "color", value: "#111" },
            { from: 3, to: 5, type: "color", value: "#222" },
        ]);
        expect(out).toHaveLength(2);
    });
    it("sorts by start offset", () => {
        const out = normalizeMarks([
            { from: 5, to: 8, type: "b" },
            { from: 0, to: 3, type: "b" },
        ]);
        expect(out.map((m) => m.from)).toEqual([0, 5]);
    });
});

describe("applyMark", () => {
    it("replaces a prior same-type value mark over the range", () => {
        const marks: Mark[] = [{ from: 0, to: 10, type: "color", value: "#111" }];
        const out = applyMark(marks, 3, 6, "color", "#222");
        expect(out).toEqual([
            { from: 0, to: 3, type: "color", value: "#111" },
            { from: 3, to: 6, type: "color", value: "#222" },
            { from: 6, to: 10, type: "color", value: "#111" },
        ]);
    });
    it("returns an unmutated copy for a collapsed range", () => {
        const marks: Mark[] = [{ from: 0, to: 5, type: "b" }];
        const out = applyMark(marks, 4, 4, "b");
        expect(out).not.toBe(marks);
        expect(out).toEqual(marks);
        expect(marks).toEqual([{ from: 0, to: 5, type: "b" }]);
    });
});

describe("removeMark", () => {
    it("splits a straddling mark around the removed range", () => {
        const out = removeMark([{ from: 0, to: 10, type: "b" }], 3, 6, "b");
        expect(out).toEqual([
            { from: 0, to: 3, type: "b" },
            { from: 6, to: 10, type: "b" },
        ]);
    });
});

describe("toggleMark", () => {
    it("removes when the range is already fully covered", () => {
        const out = toggleMark([{ from: 0, to: 10, type: "b" }], 3, 6, "b");
        expect(out).toEqual([
            { from: 0, to: 3, type: "b" },
            { from: 6, to: 10, type: "b" },
        ]);
    });
    it("adds when the range is not covered", () => {
        expect(toggleMark([], 0, 5, "b")).toEqual([{ from: 0, to: 5, type: "b" }]);
    });
});

describe("spliceText", () => {
    it("re-applies a covering mark over the insert and shifts trailing marks", () => {
        const marks: Mark[] = [
            { from: 0, to: 5, type: "b" },
            { from: 6, to: 11, type: "i" },
        ];
        const out = spliceText("hello world", marks, 0, 5, "hey");
        expect(out.text).toBe("hey world");
        expect(out.marks).toEqual([
            { from: 0, to: 3, type: "b" },
            { from: 4, to: 9, type: "i" },
        ]);
        expect(marks).toEqual([
            { from: 0, to: 5, type: "b" },
            { from: 6, to: 11, type: "i" },
        ]);
    });
    it("keeps a mark entirely before the edit unchanged", () => {
        const marks: Mark[] = [{ from: 0, to: 2, type: "b" }];
        const out = spliceText("abcdef", marks, 4, 5, "XY");
        expect(out.text).toBe("abcdXYf");
        expect(out.marks).toEqual([{ from: 0, to: 2, type: "b" }]);
    });
    it("realizes text as prefix + insert + suffix", () => {
        const from = 2;
        const to = 5;
        const insert = "ZZZ";
        const src = "abcdefgh";
        const out = spliceText(src, [], from, to, insert);
        expect(out.text).toBe(src.slice(0, from) + insert + src.slice(to));
    });
});

describe("activeMarks", () => {
    const marks: Mark[] = [
        { from: 0, to: 10, type: "b" },
        { from: 0, to: 5, type: "i" },
    ];
    it("returns only types that fully cover the range", () => {
        expect(activeMarks(marks, 0, 5)).toEqual(["b", "i"]);
        expect(activeMarks(marks, 0, 10)).toEqual(["b"]);
    });
    it("returns types containing the caret for a collapsed selection", () => {
        expect(activeMarks(marks, 3, 3)).toEqual(["b", "i"]);
        expect(activeMarks(marks, 7, 7)).toEqual(["b"]);
    });
});

describe("selection helpers", () => {
    const sel = (aPara: number, aOff: number, fPara: number, fOff: number): Selection => ({
        anchor: { para: aPara, offset: aOff },
        focus: { para: fPara, offset: fOff },
        affinity: "down",
    });

    it("comparePoints orders by paragraph then offset", () => {
        expect(comparePoints({ para: 0, offset: 2 }, { para: 0, offset: 5 })).toBeLessThan(0);
        expect(comparePoints({ para: 0, offset: 5 }, { para: 0, offset: 5 })).toBe(0);
        expect(comparePoints({ para: 1, offset: 0 }, { para: 0, offset: 99 })).toBeGreaterThan(0);
    });

    it("isCollapsed is true only when anchor equals focus", () => {
        expect(isCollapsed(sel(0, 3, 0, 3))).toBe(true);
        expect(isCollapsed(sel(0, 3, 0, 5))).toBe(false);
    });

    it("orderedPoints returns endpoints in document order regardless of drag direction", () => {
        const { start, end } = orderedPoints(sel(0, 5, 0, 2));
        expect(start.offset).toBe(2);
        expect(end.offset).toBe(5);
    });

    it("offsetRange returns the range for a single-paragraph selection", () => {
        expect(offsetRange(sel(0, 5, 0, 2), 0)).toEqual({ from: 2, to: 5 });
    });

    it("offsetRange is undefined when the selection spans paragraphs", () => {
        expect(offsetRange(sel(0, 1, 1, 3), 0)).toBeUndefined();
    });
});
