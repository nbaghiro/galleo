import "@elements/register";
import { describe, expect, it } from "vitest";
import type { ArtifactContent, ElementAddress, ElementInstance } from "@model/artifact";
import { contentWithElementIds, rowGroup, colGroup, elementRegionId } from "@model/artifact";
import {
    deleteElement,
    duplicateAt,
    duplicateSection,
    duplicatedAddr,
    elementIdMap,
    getElementAt,
    insertChild,
    insertSection,
    moveSection,
    removeAt,
    wrapWith,
} from "@elements/ops";
import { artifactOf, inst, sectionOf } from "@canvas/testkit";

const txt = (t: string): ElementInstance => inst("text", { text: t });
const at = (path: number[], section = "s1"): ElementAddress => ({ section, path });
const idAt = (art: ArtifactContent, path: number[], section = "s1"): string | undefined =>
    getElementAt(art, at(path, section))?.id;
const stamped = (root: ElementInstance): ArtifactContent =>
    contentWithElementIds(artifactOf([sectionOf(root)]));

describe("elementIdMap", () => {
    it("maps every stamped id to the path its region is tagged with", () => {
        const art = stamped(rowGroup([txt("a"), colGroup([txt("b"), txt("c")])]));
        const ids = elementIdMap(art);
        const deep = idAt(art, [1, 1])!;

        expect(ids.get(deep)).toEqual(at([1, 1]));
        expect(elementRegionId(ids.get(deep)!)).toBe("el:s1:1.1");
        expect(ids.get(idAt(art, [])!)).toEqual(at([]));
        expect(ids.size).toBe(5); // root, two columns, two nested leaves
    });

    it("stops resolving an id once its element is gone", () => {
        const art = stamped(rowGroup([txt("a"), txt("b")]));
        const gone = idAt(art, [1])!;
        const after = removeAt(art, at([1]));
        expect(elementIdMap(after).has(gone)).toBe(false);
    });

    it("spans every section", () => {
        const one = stamped(txt("a"));
        const two = contentWithElementIds(insertSection(one, 1, sectionOf(txt("b"), { id: "s2" })));
        const ids = elementIdMap(two);
        expect(ids.get(idAt(two, [], "s2")!)).toEqual(at([], "s2"));
    });
});

describe("ids through the ops", () => {
    it("survive an inserted sibling, which shifts the paths under them", () => {
        const art = stamped(rowGroup([txt("a"), txt("b")]));
        const b = idAt(art, [1])!;
        const after = insertChild(art, at([]), 0, txt("new"));
        expect(elementIdMap(after).get(b)).toEqual(at([2]));
    });

    it("survive a removed sibling", () => {
        const art = stamped(rowGroup([txt("a"), txt("b"), txt("c")]));
        const c = idAt(art, [2])!;
        const after = removeAt(art, at([0]));
        expect(elementIdMap(after).get(c)).toEqual(at([1]));
    });

    it("survive being wrapped into a new group", () => {
        const art = stamped(txt("only"));
        const only = idAt(art, [])!;
        const after = wrapWith(art, at([]), txt("beside"), false, "row");
        expect(elementIdMap(after).get(only)).toEqual(at([0]));
    });

    it("survive the collapse a delete triggers", () => {
        const art = stamped(rowGroup([txt("a"), colGroup([txt("b"), txt("c")])]));
        const c = idAt(art, [1, 1])!;
        // deleting b empties nothing, but removing the last sibling unwraps the column
        const afterB = deleteElement(art, at([1, 0]));
        expect(elementIdMap(afterB).get(c)).toEqual(at([1]));
    });

    it("survive a section move", () => {
        const one = stamped(txt("a"));
        const two = contentWithElementIds(insertSection(one, 1, sectionOf(txt("b"), { id: "s2" })));
        const id = idAt(two, [], "s2")!;
        const moved = moveSection(two, "s2", -1);
        expect(elementIdMap(moved).get(id)).toEqual(at([], "s2"));
    });

    it("give a duplicated element its own id", () => {
        const art = stamped(rowGroup([txt("a"), txt("b")]));
        const source = idAt(art, [0])!;
        const after = duplicateAt(art, at([0]));
        const copy = getElementAt(after, duplicatedAddr(at([0])))!;

        expect(copy.id).toBeDefined();
        expect(copy.id).not.toBe(source);
        expect(idAt(after, [0])).toBe(source); // the original keeps its own
    });

    it("give a duplicated section a whole fresh set", () => {
        const art = stamped(rowGroup([txt("a"), txt("b")]));
        const after = duplicateSection(art, "s1", "s2");
        const ids = elementIdMap(after);
        const original = [idAt(after, []), idAt(after, [0]), idAt(after, [1])];
        const copies = [idAt(after, [], "s2"), idAt(after, [0], "s2"), idAt(after, [1], "s2")];

        expect(copies.every((id) => !!id)).toBe(true);
        expect(copies.some((id) => original.includes(id))).toBe(false);
        expect(ids.size).toBe(6);
    });
});
