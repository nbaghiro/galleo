import { describe, expect, it } from "vitest";
import {
    activeMarks,
    applyMark,
    comparePoints,
    diffRange,
    isCollapsed,
    marksWithValue,
    normalizeMarks,
    offsetRange,
    orderedPoints,
    rebaseMarks,
    removeMark,
    spliceText,
    toggleMark,
    toRuns,
    withoutMarkValue,
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

// A comment mark carries a thread id over a range and paints nothing: the editor draws the tint as
// an overlay, so the runs the engine and every exporter see must be identical either way.
describe("cm marks", () => {
    const cm = (from: number, to: number, value: string): Mark => ({ from, to, type: "cm", value });

    it("changes no run the renderer sees", () => {
        const text = "Run the kitchen well";
        const styled: Mark[] = [{ from: 0, to: 3, type: "b" }];
        expect(toRuns(text, [...styled, cm(4, 14, "t-1")])).toEqual(toRuns(text, styled));
        expect(toRuns(text, [cm(0, 20, "t-1")])).toEqual([{ text }]);
    });

    it("keeps two threads on the same words apart", () => {
        const marks = normalizeMarks([cm(0, 5, "t-1"), cm(0, 5, "t-2")]);
        expect(marks).toHaveLength(2);
        expect(marksWithValue(marks, "cm", "t-1")).toHaveLength(1);
    });

    it("still merges the same thread's touching ranges", () => {
        expect(normalizeMarks([cm(0, 5, "t-1"), cm(5, 9, "t-1")])).toEqual([cm(0, 9, "t-1")]);
    });

    it("shifts when text before it changes", () => {
        const { marks } = spliceText("hello world", [cm(6, 11, "t-1")], 0, 0, ">> ");
        expect(marksWithValue(marks, "cm", "t-1")).toEqual([cm(9, 14, "t-1")]);
    });

    it("splits when text inside it is replaced by something outside it", () => {
        // deleting the middle of a commented range keeps the two surviving halves marked
        const { text, marks } = spliceText("abcdefgh", [cm(1, 7, "t-1")], 3, 5, "");
        expect(text).toBe("abcfgh");
        expect(marksWithValue(marks, "cm", "t-1")).toEqual([cm(1, 5, "t-1")]);
    });

    it("disappears once its whole range is deleted", () => {
        const { marks } = spliceText("abcdef", [cm(2, 4, "t-1")], 2, 4, "");
        expect(marksWithValue(marks, "cm", "t-1")).toEqual([]);
    });

    it("survives an add / remove round-trip by value", () => {
        const added = applyMark([], 2, 6, "cm", "t-1");
        expect(added).toEqual([cm(2, 6, "t-1")]);
        expect(withoutMarkValue(added, "cm", "t-1")).toEqual([]);
        expect(withoutMarkValue(added, "cm", "t-2")).toEqual(added);
    });
});

describe("diffRange", () => {
    it("names the inserted span", () => {
        expect(diffRange("hello", "heXYllo")).toEqual({ from: 2, to: 2, insert: "XY" });
    });

    it("names the deleted span", () => {
        expect(diffRange("hello", "hlo")).toEqual({ from: 1, to: 3, insert: "" });
    });

    it("names a replacement", () => {
        expect(diffRange("hello", "hey")).toEqual({ from: 2, to: 5, insert: "y" });
    });

    it("is empty when nothing moved", () => {
        expect(diffRange("same", "same")).toEqual({ from: 4, to: 4, insert: "" });
    });
});

describe("rebaseMarks", () => {
    const cm = (from: number, to: number): Mark => ({ from, to, type: "cm", value: "t-1" });

    it("carries an invisible mark across an edit the DOM did report", () => {
        expect(rebaseMarks([cm(6, 11)], "hello world", ">> hello world")).toEqual([cm(9, 14)]);
    });

    it("grows the mark when text is typed inside it", () => {
        expect(rebaseMarks([cm(0, 5)], "hello", "heXllo")).toEqual([cm(0, 6)]);
    });

    it("returns the same list when the text did not change", () => {
        const marks = [cm(0, 5)];
        expect(rebaseMarks(marks, "hello", "hello")).toBe(marks);
    });
});
