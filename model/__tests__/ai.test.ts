import { describe, expect, it } from "vitest";
import type { ArtifactContent, ElementInstance, Section } from "@model/artifact";
import { childrenRaw } from "@model/section";
import { ELEMENT_TYPES, ELEMENTS, LAYOUTS, applyPatch, isEmittableType, isKind } from "@model/ai";

// Tier-A pure: the immutable AI-edit reducer + the authoring catalog. Real trees in, real trees out.

const leaf = (text: string): ElementInstance => ({ type: "text", data: { text } });
const sect = (id: string): Section => ({ id, root: leaf(id) });
const textOf = (i: ElementInstance | undefined): string | undefined =>
    (i?.data as { text?: string })?.text;
const content = (sections: Section[], extra?: Partial<ArtifactContent>): ArtifactContent => ({
    format: "deck",
    theme: "base",
    sections,
    ...extra,
});
const ids = (c: ArtifactContent): string[] => c.sections.map((s) => s.id);

describe("applyPatch · setMeta", () => {
    it("only changes the fields the op provides", () => {
        const out = applyPatch(content([], { theme: "old", format: "deck" }), [
            { op: "setMeta", theme: "new" },
        ]);
        expect(out.theme).toBe("new");
        expect(out.format).toBe("deck");
    });
    it("clears background to undefined when given null", () => {
        const out = applyPatch(content([], { background: { kind: "color", color: "#fff" } }), [
            { op: "setMeta", background: null },
        ]);
        expect(out.background).toBeUndefined();
    });
});

describe("applyPatch · addSection", () => {
    it("prepends when afterId is null", () => {
        const out = applyPatch(content([sect("a")]), [
            { op: "addSection", afterId: null, section: sect("b") },
        ]);
        expect(ids(out)).toEqual(["b", "a"]);
    });
    it("appends when afterId is absent", () => {
        const out = applyPatch(content([sect("a")]), [{ op: "addSection", section: sect("b") }]);
        expect(ids(out)).toEqual(["a", "b"]);
    });
    it("appends when afterId is unknown", () => {
        const out = applyPatch(content([sect("a")]), [
            { op: "addSection", afterId: "zzz", section: sect("b") },
        ]);
        expect(ids(out)).toEqual(["a", "b"]);
    });
    it("inserts directly after a known afterId", () => {
        const out = applyPatch(content([sect("a"), sect("c")]), [
            { op: "addSection", afterId: "a", section: sect("b") },
        ]);
        expect(ids(out)).toEqual(["a", "b", "c"]);
    });
    it("moves + dedupes when re-adding an existing section id", () => {
        const out = applyPatch(content([sect("a"), sect("b"), sect("c")]), [
            { op: "addSection", afterId: "c", section: sect("a") },
        ]);
        expect(ids(out)).toEqual(["b", "c", "a"]);
    });
});

describe("applyPatch · replace/removeSection", () => {
    it("replaces the section with the matching id", () => {
        const out = applyPatch(content([sect("a"), sect("b")]), [
            { op: "replaceSection", id: "b", section: { id: "b", root: leaf("NEW") } },
        ]);
        expect(textOf(out.sections[1]!.root)).toBe("NEW");
    });
    it("replaceSection is a no-op for an unknown id", () => {
        const out = applyPatch(content([sect("a")]), [
            { op: "replaceSection", id: "zzz", section: sect("x") },
        ]);
        expect(ids(out)).toEqual(["a"]);
    });
    it("removes the section with the matching id", () => {
        const out = applyPatch(content([sect("a"), sect("b")]), [{ op: "removeSection", id: "a" }]);
        expect(ids(out)).toEqual(["b"]);
    });
    it("removeSection is a no-op for an unknown id", () => {
        const out = applyPatch(content([sect("a")]), [{ op: "removeSection", id: "zzz" }]);
        expect(ids(out)).toEqual(["a"]);
    });
});

describe("applyPatch · moveSection", () => {
    it("moves a section after the target", () => {
        const out = applyPatch(content([sect("a"), sect("b"), sect("c")]), [
            { op: "moveSection", id: "a", afterId: "c" },
        ]);
        expect(ids(out)).toEqual(["b", "c", "a"]);
    });
    it("moves a section to the front when afterId is null", () => {
        const out = applyPatch(content([sect("a"), sect("b")]), [
            { op: "moveSection", id: "b", afterId: null },
        ]);
        expect(ids(out)).toEqual(["b", "a"]);
    });
    it("returns the same section order when the target is missing", () => {
        const out = applyPatch(content([sect("a")]), [
            { op: "moveSection", id: "zzz", afterId: null },
        ]);
        expect(ids(out)).toEqual(["a"]);
    });
});

describe("applyPatch · replaceElement", () => {
    const group = (children: ElementInstance[]): Section => ({
        id: "s",
        root: { type: "group", data: { children } },
    });
    it("sets the element at the path when non-null", () => {
        const out = applyPatch(content([group([leaf("a"), leaf("b")])]), [
            { op: "replaceElement", sectionId: "s", path: [0], element: leaf("Z") },
        ]);
        expect(childrenRaw(out.sections[0]!.root)?.map(textOf)).toEqual(["Z", "b"]);
    });
    it("removes the element at the path when null", () => {
        const out = applyPatch(content([group([leaf("a"), leaf("b")])]), [
            { op: "replaceElement", sectionId: "s", path: [0], element: null },
        ]);
        expect(childrenRaw(out.sections[0]!.root)?.map(textOf)).toEqual(["b"]);
    });
});

describe("applyPatch · immutability", () => {
    it("never mutates the input content", () => {
        const input = content([sect("a"), sect("b")]);
        const snapshot = JSON.parse(JSON.stringify(input));
        applyPatch(input, [
            { op: "removeSection", id: "a" },
            { op: "addSection", section: sect("z") },
        ]);
        expect(input).toEqual(snapshot);
    });
});

describe("LAYOUTS", () => {
    const columnsOf = (id: string): number | undefined => LAYOUTS.find((l) => l.id === id)?.columns;
    it("maps preset column counts", () => {
        expect(columnsOf("full")).toBe(1);
        expect(columnsOf("two-col")).toBe(2);
        expect(columnsOf("three-up")).toBe(3);
    });
});

describe("ELEMENTS catalog", () => {
    it("has unique element types", () => {
        const types = ELEMENTS.map((e) => e.type);
        expect(new Set(types).size).toBe(types.length);
    });
    it("gives every container element a children field", () => {
        for (const e of ELEMENTS.filter((e) => e.container))
            expect(e.fields.some((f) => f.key === "children")).toBe(true);
    });
});

describe("ELEMENT_TYPES / isEmittableType / isKind", () => {
    it("emittable types cover the catalog but not the drop ghost", () => {
        expect(ELEMENT_TYPES).toContain("text");
        expect(isEmittableType("text")).toBe(true);
        expect(isEmittableType("__dropghost")).toBe(false);
    });
    it("isKind recognizes the four turn kinds", () => {
        expect(isKind("generate")).toBe(true);
        expect(isKind("chat")).toBe(true);
        expect(isKind("nope")).toBe(false);
    });
});
