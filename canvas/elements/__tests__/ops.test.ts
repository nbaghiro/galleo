import "@elements/register";
import { describe, expect, it } from "vitest";
import type { ArtifactContent, ElementInstance } from "@model/artifact";
import { childrenRaw, colGroup, rowGroup, withWidth } from "@model/artifact";
import {
    addColumn,
    affordanceEdit,
    duplicateMany,
    groupSelection,
    moveChildrenTo,
    removeMany,
    sharedParent,
    ungroupAt,
    applyAffordance,
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
    withViewerPatches,
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
    i.type === "container" && (childrenRaw(i)?.length ?? -1) === 0;

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

    it("deleting a nested row's last sibling strips the survivor's stale column width", () => {
        const art = deleteElement(
            artOf(colGroup([txt("h"), rowGroup([txt("a"), txt("b")], [0.6, 0.4])])),
            at([1, 1]),
        );
        const survivor = getElementAt(art, at([1]));
        expect(textOf(survivor)).toBe("a");
        expect(survivor?.layout?.width).toBeUndefined();
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

    it("insertChild into a grid strips the newcomer's width and leaves the rest alone", () => {
        const gridRoot: ElementInstance = {
            type: "container",
            data: { direction: "grid", columns: 2, children: [txt("a"), txt("b"), txt("c")] },
        };
        const art = insertChild(artOf(gridRoot), at([]), 1, withWidth(txt("x"), 90));
        const kids = childrenRaw(rootOf(art))!;
        expect(kids.map(textOf)).toEqual(["a", "x", "b", "c"]);
        // a member width would pin its track; none may survive the insert or be invented for others
        expect(kids.every((k) => k.layout?.width === undefined)).toBe(true);
    });

    it("wrapWith wraps a leaf and a new element into a group (after → [self, new])", () => {
        const art = wrapWith(artOf(txt("a")), at([]), txt("x"), false, "row");
        expect(rootOf(art).type).toBe("container");
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
        expect(rootOf(root).type).toBe("container");
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

describe("withViewerPatches", () => {
    const two = (): ArtifactContent =>
        artifactOf([
            sectionOf(colGroup([txt("a"), txt("b")]), { id: "s1" }),
            sectionOf(colGroup([txt("c")]), { id: "s2" }),
        ]);

    it("is the identity when there is nothing to overlay", () => {
        const art = two();
        expect(withViewerPatches(art, new Map())).toBe(art);
    });

    it("merges the patch onto the addressed element's data", () => {
        const out = withViewerPatches(two(), new Map([["el:s1:1", { open: true }]]));
        const patched = getElementAt(out, { section: "s1", path: [1] });
        expect(patched!.data).toEqual({ text: "b", open: true });
    });

    it("returns fresh objects only along the touched path, so the paint cache misses one section", () => {
        const art = two();
        const out = withViewerPatches(art, new Map([["el:s1:1", { open: true }]]));
        expect(out).not.toBe(art);
        expect(out.sections[1]).toBe(art.sections[1]); // untouched section keeps its identity
        expect(out.sections[0]).not.toBe(art.sections[0]);
        const kids = childrenRaw(out.sections[0]!.root)!;
        expect(kids[0]).toBe(childrenRaw(art.sections[0]!.root)![0]); // untouched sibling
        expect(kids[1]).not.toBe(childrenRaw(art.sections[0]!.root)![1]);
    });

    it("leaves the stored content alone, so a viewer's view is never a document write", () => {
        const art = two();
        const before = JSON.stringify(art);
        withViewerPatches(art, new Map([["el:s1:1", { open: true }]]));
        expect(JSON.stringify(art)).toBe(before);
    });

    it("ignores a key that addresses nothing, in a missing section or a missing node", () => {
        const art = two();
        expect(withViewerPatches(art, new Map([["el:s9:3", { open: true }]]))).toBe(art);
        expect(withViewerPatches(art, new Map([["el:s1:7", { open: true }]]))).toBe(art);
    });
});

describe("affordances", () => {
    const list = (): ArtifactContent =>
        artOf({
            type: "bullets",
            data: { marker: "checkbox", children: [txt("one"), txt("two")] },
        });

    it("checkbox and disclose flip their own flag on the addressed element", () => {
        expect(affordanceEdit(list(), "checkbox", at([0]))).toEqual({
            address: at([0]),
            patch: { checked: true },
        });
        const checked = applyAffordance(list(), "checkbox", at([0]));
        expect(affordanceEdit(checked, "checkbox", at([0]))!.patch).toEqual({ checked: false });
        expect(affordanceEdit(list(), "disclose", at([1]))!.patch).toEqual({ open: true });
    });

    it("a tab press moves the container's active index, not the panel it addressed", () => {
        const art = artOf({
            type: "tabs",
            data: { children: [txt("one"), txt("two")], active: 0 },
        });
        expect(affordanceEdit(art, "tab", at([1]))).toEqual({
            address: at([]),
            patch: { active: 1 },
        });
        expect(getElementAt(applyAffordance(art, "tab", at([1])), at([])!)!.data).toMatchObject({
            active: 1,
        });
    });

    it("is inert for an unknown action, a missing element, or a rootless tab press", () => {
        expect(affordanceEdit(list(), "nope", at([0]))).toBeNull();
        expect(affordanceEdit(list(), "checkbox", at([9]))).toBeNull();
        expect(affordanceEdit(list(), "tab", at([]))).toBeNull();
        expect(applyAffordance(list(), "nope", at([0]))).toEqual(list());
    });
});

describe("batch ops", () => {
    const collectText = (el: ElementInstance, out: string[] = []): string[] => {
        const t = textOf(el);
        if (t !== undefined) out.push(t);
        for (const kid of childrenRaw(el) ?? []) collectText(kid, out);
        return out;
    };
    const widthsOf = (root: ElementInstance): (number | undefined)[] =>
        (childrenRaw(root) ?? []).map((c) => {
            const w = c.layout?.width;
            return w && typeof w === "object" ? w.pct : undefined;
        });

    it("removeMany deletes every address, whatever order it is handed them", () => {
        const art = artOf(colGroup([txt("a"), txt("b"), txt("c"), txt("d")]));
        const out = removeMany(art, [at([2]), at([0])]);
        expect((childrenRaw(rootOf(out)) ?? []).map(textOf)).toEqual(["b", "d"]);
    });

    it("removeMany empties two shared parents and collapses each one once", () => {
        const art = artOf(rowGroup([colGroup([txt("a")]), colGroup([txt("b")]), txt("keep")]));
        const out = removeMany(art, [at([0, 0]), at([1, 0])]);
        expect(textOf(rootOf(out))).toBe("keep");
    });

    it("removeMany takes siblings of one parent without losing the later ones", () => {
        const art = artOf(colGroup([colGroup([txt("a"), txt("b"), txt("c")]), txt("z")]));
        const out = removeMany(art, [at([0, 0]), at([0, 1])]);
        expect(collectText(rootOf(out))).toEqual(["c", "z"]);
    });

    it("duplicateMany copies every source, re-resolving the addresses the earlier copies moved", () => {
        const art = artOf(colGroup([txt("a"), txt("b")]));
        const res = duplicateMany(art, [at([0]), at([1])]);
        expect((childrenRaw(rootOf(res.content)) ?? []).map(textOf)).toEqual(["a", "a", "b", "b"]);
        expect(res.addresses).toEqual([at([1]), at([3])]);
    });

    it("duplicateMany mints fresh ids, so a copy never answers to its source's anchor", () => {
        const art = artOf(colGroup([txt("a"), txt("b")]));
        const res = duplicateMany(art, [at([0]), at([1])]);
        const ids = (childrenRaw(rootOf(res.content)) ?? []).map((c) => c.id);
        expect(new Set(ids).size).toBe(4);
    });

    it("sharedParent answers only for a set that sits under one parent", () => {
        expect(sharedParent([at([0, 1]), at([0, 2])])).toEqual(at([0]));
        expect(sharedParent([at([0, 1]), at([1, 0])])).toBeNull();
        expect(sharedParent([at([0]), at([])])).toBeNull();
        expect(sharedParent([])).toBeNull();
    });

    it("groupSelection wraps the members in place, along the parent's own axis", () => {
        const art = artOf(colGroup([txt("a"), txt("b"), txt("c")]));
        const res = groupSelection(art, [at([1]), at([2])]);
        expect(res.address).toEqual(at([1]));
        const root = rootOf(res.content);
        expect((childrenRaw(root) ?? []).map(textOf)).toEqual(["a", undefined]);
        expect(collectText(childrenRaw(root)![1]!)).toEqual(["b", "c"]);
    });

    it("groupSelection renormalizes the row it took columns out of", () => {
        const art = artOf(
            rowGroup([withWidth(txt("a"), 50), withWidth(txt("b"), 25), withWidth(txt("c"), 25)]),
        );
        const res = groupSelection(art, [at([1]), at([2])]);
        const widths = widthsOf(rootOf(res.content));
        expect(widths.reduce((n: number, w) => n + (w ?? 0), 0)).toBe(100);
        expect(widths.length).toBe(2);
    });

    it("groupSelection refuses a set with no shared parent or fewer than two members", () => {
        const art = artOf(colGroup([txt("a"), colGroup([txt("b")])]));
        expect(groupSelection(art, [at([0]), at([1, 0])]).address).toBeNull();
        expect(groupSelection(art, [at([0])]).address).toBeNull();
    });

    it("ungroupAt splices a group's children back where the group stood", () => {
        const art = artOf(colGroup([txt("a"), colGroup([txt("b"), txt("c")]), txt("d")]));
        const res = ungroupAt(art, at([1]));
        expect((childrenRaw(rootOf(res.content)) ?? []).map(textOf)).toEqual(["a", "b", "c", "d"]);
        expect(res.addresses).toEqual([at([1]), at([2])]);
    });

    it("ungroupAt is inert on the root, a leaf, and an empty group", () => {
        const art = artOf(colGroup([txt("a"), colGroup([])]));
        expect(ungroupAt(art, at([])).content).toBe(art);
        expect(ungroupAt(art, at([0])).content).toBe(art);
        expect(ungroupAt(art, at([1])).content).toBe(art);
    });

    it("moveChildrenTo shifts the gap by the sources removed before it", () => {
        const art = artOf(colGroup([txt("a"), txt("b"), txt("c"), txt("d")]));
        // [a, c] to the gap after d: two sources sit before index 4, so the block lands at 2
        const res = moveChildrenTo(art, at([]), [0, 2], 4);
        expect(res.at).toBe(2);
        expect((childrenRaw(rootOf(res.content)) ?? []).map(textOf)).toEqual(["b", "d", "a", "c"]);
    });

    it("moveChildrenTo keeps the block in its original order, whatever order it is given", () => {
        const art = artOf(colGroup([txt("a"), txt("b"), txt("c")]));
        const res = moveChildrenTo(art, at([]), [2, 0], 1);
        expect((childrenRaw(rootOf(res.content)) ?? []).map(textOf)).toEqual(["a", "c", "b"]);
    });

    it("moveChildrenTo is inert for an index that names no child", () => {
        const art = artOf(colGroup([txt("a"), txt("b")]));
        expect(moveChildrenTo(art, at([]), [0, 9], 2).content).toBe(art);
    });
});

describe("replaceAt and the row-width invariant", () => {
    it("the drop inherits the slot's column share and sheds its own stale width", () => {
        const row = rowGroup([txt("keep"), txt("slot")], [0.6, 0.4]);
        const art = replaceAt(artOf(row), at([1]), withWidth(txt("new"), 90));
        const fr = columnFractions(art.sections[0]!);
        expect(fr).toEqual([0.6, 0.4]);
        expect(textOf(getElementAt(art, at([1])))).toBe("new");
    });

    it("a width-less slot leaves the newcomer width-less", () => {
        const row = rowGroup([txt("a"), txt("b")]); // even split, no widths
        const art = replaceAt(artOf(row), at([0]), withWidth(txt("new"), 90));
        expect(getElementAt(art, at([0]))?.layout?.width).toBeUndefined();
    });
});

describe("table cell edits", () => {
    it("editing one cell carries the table's clamp through withChildren", () => {
        const table = inst("table", {
            cols: 2,
            rows: 2,
            header: true,
            lines: "rows",
            zebra: false,
            density: "cozy",
            clamp: 1,
            cells: Array.from({ length: 4 }, (_, i) => txt(`c${i}`)),
        });
        const art = updateDataAt(artOf(table), at([2]), { text: "edited" });
        const d = rootOf(art).data as { clamp?: number };
        expect(d.clamp).toBe(1);
    });
});
