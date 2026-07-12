import { describe, expect, it } from "vitest";
import type { ElementInstance } from "@model/artifact";
import {
    COLUMN_GAP,
    LAYOUT_PRESETS,
    childrenRaw,
    colGroup,
    emptyRegion,
    removeAtPath,
    rowGroup,
    updateAtPath,
    withWidth,
} from "@model/section";

// Pure, registry-free content-tree builders + path ops — the substrate the canvas ops mirror.

const leaf = (t: string): ElementInstance => ({ type: "text", data: { text: t } });
const textOf = (i: ElementInstance | undefined): string | undefined =>
    (i?.data as { text?: string })?.text;
const groupData = (i: ElementInstance): { direction?: string; align?: string; gap?: number } =>
    i.data as { direction?: string; align?: string; gap?: number };
const widthPct = (i: ElementInstance): number | undefined => {
    const w = i.layout?.width;
    return w && typeof w === "object" ? w.pct : undefined;
};

describe("LAYOUT_PRESETS", () => {
    it("maps preset ids to column fractions", () => {
        expect(LAYOUT_PRESETS.full).toEqual([1]);
        expect(LAYOUT_PRESETS["split-6040"]).toEqual([0.6, 0.4]);
        expect(LAYOUT_PRESETS["two-col"]).toEqual([0.5, 0.5]);
        expect(LAYOUT_PRESETS["three-up"]).toHaveLength(3);
    });
});

describe("withWidth", () => {
    it("sets an explicit column-width percent", () => {
        expect(widthPct(withWidth(leaf("a"), 60))).toBe(60);
    });
    it("preserves the rest of an existing layout", () => {
        expect(withWidth({ ...leaf("a"), layout: { align: "center" } }, 40).layout).toEqual({
            align: "center",
            width: { pct: 40 },
        });
    });
});

describe("rowGroup / colGroup / emptyRegion", () => {
    it("rowGroup with no widths keeps children as-is, centered with a gutter", () => {
        const g = rowGroup([leaf("a"), leaf("b")]);
        expect(groupData(g).direction).toBe("row");
        expect(groupData(g).align).toBe("center");
        expect(groupData(g).gap).toBe(COLUMN_GAP);
        expect(childrenRaw(g)?.map(textOf)).toEqual(["a", "b"]);
        expect(childrenRaw(g)?.map(widthPct)).toEqual([undefined, undefined]);
    });
    it("rowGroup with widths stamps each column's percent", () => {
        const g = rowGroup([leaf("a"), leaf("b")], [0.6, 0.4]);
        expect(childrenRaw(g)?.map(widthPct)).toEqual([60, 40]);
    });
    it("colGroup stacks vertically", () => {
        expect(groupData(colGroup([leaf("a")])).direction).toBe("col");
    });
    it("emptyRegion is a childless group", () => {
        expect(childrenRaw(emptyRegion())).toEqual([]);
    });
});

describe("childrenRaw", () => {
    it("returns a container's children, else undefined", () => {
        expect(childrenRaw(rowGroup([leaf("a")]))?.map(textOf)).toEqual(["a"]);
        expect(childrenRaw(leaf("a"))).toBeUndefined();
        expect(childrenRaw({ type: "x", data: { children: "not-an-array" } })).toBeUndefined();
    });
});

describe("updateAtPath", () => {
    it("an empty path targets the root", () => {
        expect(textOf(updateAtPath(leaf("a"), [], () => leaf("z")))).toBe("z");
    });
    it("replaces the node at a child path", () => {
        const root = rowGroup([leaf("a"), leaf("b")]);
        expect(childrenRaw(updateAtPath(root, [0], () => leaf("z")))?.map(textOf)).toEqual([
            "z",
            "b",
        ]);
    });
    it("is a no-op on a leaf (nothing to descend into)", () => {
        expect(textOf(updateAtPath(leaf("a"), [0], () => leaf("z")))).toBe("a");
    });
    it("leaves children untouched for an out-of-range index", () => {
        const root = rowGroup([leaf("a"), leaf("b")]);
        expect(childrenRaw(updateAtPath(root, [5], () => leaf("z")))?.map(textOf)).toEqual([
            "a",
            "b",
        ]);
    });
});

describe("removeAtPath", () => {
    it("removing the root yields an empty region", () => {
        expect(childrenRaw(removeAtPath(rowGroup([leaf("a")]), []))).toEqual([]);
    });
    it("removes the node at a child path", () => {
        const root = rowGroup([leaf("a"), leaf("b"), leaf("c")]);
        expect(childrenRaw(removeAtPath(root, [1]))?.map(textOf)).toEqual(["a", "c"]);
    });
});
