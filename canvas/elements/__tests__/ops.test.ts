import "@elements/register";
import { describe, expect, it } from "vitest";
import type { ArtifactContent, ElementInstance } from "@model/artifact";
import { childrenRaw, colGroup, rowGroup, withWidth } from "@model/section";
import {
    addColumn,
    applyLayoutPreset,
    columnFractions,
    deleteElement,
    duplicateAt,
    duplicateSection,
    duplicatedAddr,
    getElementAt,
    insertChild,
    insertSection,
    moveSection,
    removeAt,
    removeSection,
    replaceAt,
    setArtifactFormat,
    setArtifactTheme,
    setElementAt,
    setElementLayout,
    setSectionBackground,
    setSectionBleed,
    splitSection,
    stripWidth,
    updateDataAt,
    wrapWith,
} from "@elements/ops";
import { artifactOf, inst, sectionOf } from "@canvas/testkit";

const txt = (t: string): ElementInstance => inst("text", { text: t });
const textOf = (i: ElementInstance | undefined): string | undefined =>
    (i?.data as { text?: string })?.text;
const artOf = (root: ElementInstance): ArtifactContent => artifactOf([sectionOf(root)]);
const rootOf = (art: ArtifactContent): ElementInstance => art.sections[0]!.root;
const at = (path: number[]): { section: string; path: number[] } => ({ section: "s1", path });
const isEmptyGroup = (i: ElementInstance): boolean =>
    i.type === "group" && (childrenRaw(i)?.length ?? -1) === 0;

describe("access + update", () => {
    it("getElementAt resolves a nested element by path, undefined when out of range", () => {
        const art = artOf(rowGroup([txt("a"), colGroup([txt("b"), txt("c")])]));
        expect(textOf(getElementAt(art, at([0])))).toBe("a");
        expect(textOf(getElementAt(art, at([1, 1])))).toBe("c");
        expect(getElementAt(art, at([9]))).toBeUndefined();
    });

    it("stripWidth removes the width, dropping an emptied layout", () => {
        expect(stripWidth(inst("text", {}, { width: { pct: 50 } })).layout).toBeUndefined();
        expect(
            stripWidth(inst("text", {}, { width: { pct: 50 }, align: "center" })).layout,
        ).toEqual({ align: "center" });
    });

    it("updateDataAt / setElementAt / setElementLayout replace parts of an element", () => {
        const base = artOf(rowGroup([txt("a"), txt("b")]));
        expect(textOf(getElementAt(updateDataAt(base, at([0]), { text: "Z" }), at([0])))).toBe("Z");
        expect(getElementAt(setElementAt(base, at([0]), txt("Q")), at([0]))?.data).toEqual({
            text: "Q",
        });
        expect(
            getElementAt(setElementLayout(base, at([0]), { align: "center" }), at([0]))?.layout,
        ).toEqual({ align: "center" });
    });

    it("ops do not mutate their input artifact", () => {
        const art = artOf(rowGroup([txt("a"), txt("b")]));
        const snapshot = JSON.stringify(art);
        deleteElement(art, at([0]));
        replaceAt(art, at([0]), txt("z"));
        expect(JSON.stringify(art)).toBe(snapshot);
    });
});

describe("removal + collapse", () => {
    it("removing the root clears the section to an empty region", () => {
        expect(isEmptyGroup(rootOf(removeAt(artOf(txt("a")), at([]))))).toBe(true);
    });

    it("deleteElement removes then collapses the single-child container to its survivor", () => {
        const art = deleteElement(artOf(rowGroup([txt("a"), txt("b")])), at([0]));
        expect(textOf(getElementAt(art, at([])))).toBe("b");
    });

    it("deleteElement renormalizes the surviving columns' widths", () => {
        const art = deleteElement(
            artOf(rowGroup([txt("a"), txt("b"), txt("c")], [1 / 3, 1 / 3, 1 / 3])),
            at([0]),
        );
        expect(columnFractions(art.sections[0]!)).toEqual([0.5, 0.5]);
    });

    it("collapsing an emptied nested column reflows the parent and unwraps the survivor", () => {
        const art = deleteElement(artOf(rowGroup([colGroup([txt("a")]), txt("b")])), at([0, 0]));
        expect(textOf(getElementAt(art, at([])))).toBe("b");
    });

    it("collapsing a single-child column hoists its width onto the survivor", () => {
        const art = deleteElement(
            artOf(rowGroup([colGroup([txt("a"), txt("b")]), txt("c")], [0.6, 0.4])),
            at([0, 1]),
        );
        expect(columnFractions(art.sections[0]!)).toEqual([0.6, 0.4]);
        expect(textOf(getElementAt(art, at([0])))).toBe("a");
    });
});

describe("insertion", () => {
    it("insertChild splices at a clamped index; no-ops on a non-container", () => {
        const art = insertChild(artOf(rowGroup([txt("a"), txt("b")])), at([]), 1, txt("x"));
        expect(childrenRaw(rootOf(art))?.map(textOf)).toEqual(["a", "x", "b"]);
        const noop = insertChild(artOf(txt("a")), at([]), 0, txt("x"));
        expect(rootOf(noop).type).toBe("text");
    });

    it("insertChild into a weighted row strips the newcomer's width and renormalizes to 100%", () => {
        const art = insertChild(
            artOf(rowGroup([txt("a"), txt("b")], [0.6, 0.4])),
            at([]),
            1,
            withWidth(txt("x"), 90), // a stale 90% width would otherwise blow past 100%
        );
        const fr = columnFractions(art.sections[0]!);
        expect(fr).toHaveLength(3);
        expect(fr.reduce((a, b) => a + b, 0)).toBeGreaterThan(0.98);
        expect(fr.reduce((a, b) => a + b, 0)).toBeLessThan(1.02);
    });

    it("wrapWith wraps a leaf and a new element into a group (after → [self, new])", () => {
        const art = wrapWith(artOf(txt("a")), at([]), txt("x"), false, "row");
        expect(rootOf(art).type).toBe("group");
        expect(childrenRaw(rootOf(art))?.map(textOf)).toEqual(["a", "x"]);
    });

    it("replaceAt swaps the instance at an address", () => {
        expect(textOf(getElementAt(replaceAt(artOf(txt("a")), at([]), txt("z")), at([])))).toBe(
            "z",
        );
    });
});

describe("duplicate", () => {
    it("duplicateAt clones after the original; a root dup wraps into a col group", () => {
        const row = duplicateAt(artOf(rowGroup([txt("a"), txt("b")])), at([0]));
        expect(childrenRaw(rootOf(row))?.map(textOf)).toEqual(["a", "a", "b"]);
        const root = duplicateAt(artOf(txt("a")), at([]));
        expect(rootOf(root).type).toBe("group");
        expect(childrenRaw(rootOf(root))?.map(textOf)).toEqual(["a", "a"]);
    });

    it("duplicating a weighted column renormalizes the row to 100% (no over-commit)", () => {
        const art = duplicateAt(artOf(rowGroup([txt("a"), txt("b")], [0.6, 0.4])), at([0]));
        const fr = columnFractions(art.sections[0]!);
        expect(fr).toHaveLength(3);
        expect(fr.reduce((a, b) => a + b, 0)).toBeGreaterThan(0.98);
        expect(fr.reduce((a, b) => a + b, 0)).toBeLessThan(1.02);
    });

    it("duplicatedAddr points at the clone's new sibling slot", () => {
        expect(duplicatedAddr(at([0]))).toEqual({ section: "s1", path: [1] });
        expect(duplicatedAddr(at([]))).toEqual({ section: "s1", path: [1] });
        expect(duplicatedAddr(at([2, 3]))).toEqual({ section: "s1", path: [2, 4] });
    });
});

describe("columns + presets", () => {
    it("addColumn wraps a single root into a row and returns the new slot", () => {
        const { art, path } = addColumn(artOf(txt("a")), "s1", 1, txt("b"));
        expect(childrenRaw(rootOf(art))?.map(textOf)).toEqual(["a", "b"]);
        expect(path).toEqual([1]);
    });

    it("splitSection pads to the fraction count with empty regions", () => {
        const cols = childrenRaw(splitSection(sectionOf(txt("a")), [0.6, 0.4]).root)!;
        expect(cols).toHaveLength(2);
        expect(textOf(cols[0])).toBe("a");
        expect(isEmptyGroup(cols[1]!)).toBe(true);
    });

    it("applyLayoutPreset merges into one column for an unknown preset", () => {
        const art = applyLayoutPreset(artOf(rowGroup([txt("a"), txt("b")])), "s1", "nope");
        expect(childrenRaw(rootOf(art))?.map(textOf)).toEqual(["a", "b"]);
    });

    it("columnFractions reports even vs explicit widths", () => {
        expect(columnFractions(sectionOf(txt("a")))).toEqual([1]);
        expect(columnFractions(sectionOf(rowGroup([txt("a"), txt("b")])))).toEqual([0.5, 0.5]);
        expect(columnFractions(sectionOf(rowGroup([txt("a"), txt("b")], [0.6, 0.4])))).toEqual([
            0.6, 0.4,
        ]);
    });
});

describe("section-level", () => {
    const two = (): ArtifactContent =>
        artifactOf([sectionOf(txt("a"), { id: "s1" }), sectionOf(txt("b"), { id: "s2" })]);

    it("setSectionBackground / setSectionBleed update the section", () => {
        const art = artOf(txt("a"));
        expect(
            setSectionBackground(art, "s1", { kind: "color", color: "#123456" }).sections[0]!
                .background,
        ).toEqual({ kind: "color", color: "#123456" });
        expect(setSectionBleed(art, "s1", true).sections[0]!.bleed).toBe(true);
    });

    it("removeSection keeps at least one section", () => {
        expect(removeSection(two(), "s1").sections.map((s) => s.id)).toEqual(["s2"]);
        expect(removeSection(artOf(txt("a")), "s1").sections).toHaveLength(1);
    });

    it("insertSection clamps the index", () => {
        const out = insertSection(artOf(txt("a")), 99, sectionOf(txt("b"), { id: "s2" }));
        expect(out.sections.map((s) => s.id)).toEqual(["s1", "s2"]);
    });

    it("moveSection reorders with a clamped delta", () => {
        const three = artifactOf([
            sectionOf(txt("a"), { id: "s1" }),
            sectionOf(txt("b"), { id: "s2" }),
            sectionOf(txt("c"), { id: "s3" }),
        ]);
        expect(moveSection(three, "s1", 1).sections.map((s) => s.id)).toEqual(["s2", "s1", "s3"]);
        expect(moveSection(three, "s1", -5).sections.map((s) => s.id)).toEqual(["s1", "s2", "s3"]);
    });

    it("duplicateSection inserts a clone with a new id after the original", () => {
        const out = duplicateSection(artOf(txt("a")), "s1", "s1-copy");
        expect(out.sections.map((s) => s.id)).toEqual(["s1", "s1-copy"]);
        expect(textOf(out.sections[1]!.root)).toBe("a");
    });

    it("setArtifactTheme / setArtifactFormat set the ids", () => {
        const art = artOf(txt("a"));
        expect(setArtifactTheme(art, "midnight").theme).toBe("midnight");
        expect(setArtifactFormat(art, "web").format).toBe("web");
    });
});
