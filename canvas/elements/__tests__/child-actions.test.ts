import "@elements/register";
import { describe, expect, it } from "vitest";
import type { ArtifactContent, ElementInstance } from "@model/artifact";
import { childrenRaw } from "@model/artifact";
import { getElement } from "@elements/spec";
import {
    childrenOf,
    deleteElement,
    duplicableAt,
    duplicateElement,
    duplicateMany,
    getElementAt,
    removeMany,
} from "@elements/ops";
import { artifactOf, sectionOf } from "@canvas/testkit";

// Delete and Duplicate reach every element: a child of a sealed container goes through what its
// container defines for them, so its shape survives.

const artOf = (root: ElementInstance): ArtifactContent => artifactOf([sectionOf(root)]);
const at = (path: number[]): { section: string; path: number[] } => ({ section: "s1", path });
const create = (type: string): ElementInstance => ({ type, data: getElement(type)!.create() });
const textOf = (i: ElementInstance | undefined): string | undefined =>
    (i?.data as { text?: string })?.text;
const kidsOf = (art: ArtifactContent, path: number[]): ElementInstance[] =>
    childrenOf(getElementAt(art, at(path))!) ?? [];

describe("an open unit's items splice", () => {
    it("deleting a bullet item removes that item; the last one removes the list", () => {
        const art = artOf(create("bullets"));
        const two = deleteElement(art, at([1]));
        expect(kidsOf(two, []).map(textOf)).toEqual(["First point", "Third point"]);
        const gone = deleteElement(deleteElement(two, at([1])), at([0]));
        expect(gone.sections[0]!.root.type).toBe("container");
        expect(childrenRaw(gone.sections[0]!.root)).toEqual([]);
    });

    it("duplicating a bullet item lands its copy right after it", () => {
        const { content, at: copy } = duplicateElement(artOf(create("bullets")), at([0]));
        expect(copy).toEqual(at([1]));
        expect(kidsOf(content, []).map(textOf)).toEqual([
            "First point",
            "First point",
            "Second point",
            "Third point",
        ]);
        expect(duplicableAt(content, at([0]))).toBe(true);
    });
});

describe("a sealed container defines what its children's actions mean", () => {
    it("an FAQ removes and copies the question with its answer, from either", () => {
        const art = artOf(create("faq"));
        const fromAnswer = deleteElement(art, at([1]));
        expect(kidsOf(fromAnswer, []).map(textOf)).toEqual([
            "Can I export?",
            "Yes: PDF, PNG, and print, pixel-for-pixel with what you edit.",
            "Is it themeable?",
            "Themes are data; switching one repaints every block instantly.",
        ]);
        const { content, at: copy } = duplicateElement(art, at([3]));
        expect(copy).toEqual(at([5]));
        const texts = kidsOf(content, []).map(textOf);
        expect(texts.length).toBe(8);
        expect(texts.slice(2, 6)).toEqual([texts[2], texts[3], texts[2], texts[3]]);
        // the copied pair answers to its own ids, never the original's
        const kids = kidsOf(content, []);
        expect(kids[4]!.id === undefined || kids[4]!.id !== kids[2]!.id).toBe(true);
    });

    it("a diagram removes and copies the item behind a label, meta included", () => {
        const art = artOf(create("pictogramDiagram"));
        const removed = deleteElement(art, at([2])); // the second item's label
        const data = getElementAt(removed, at([]))!.data as {
            items: string;
            itemsMeta?: unknown[];
        };
        expect(data.items.split("\n")).toHaveLength(2);
        expect(data.itemsMeta).toHaveLength(2);
        const { content, at: copy } = duplicateElement(art, at([1])); // the first item's detail
        const next = getElementAt(content, at([]))!.data as {
            items: string;
            itemsMeta?: unknown[];
        };
        expect(next.items.split("\n")).toHaveLength(4);
        expect(next.items.split("\n")[1]).toBe(next.items.split("\n")[0]);
        expect(next.itemsMeta).toHaveLength(4);
        expect(copy).toEqual(at([3]));
    });

    it("tabs remove and copy a panel together with its label", () => {
        const art = artOf(create("tabs"));
        const { content, at: copy } = duplicateElement(art, at([0]));
        const d = getElementAt(content, at([]))!.data as {
            labels: string;
            active: number;
            children: unknown[];
        };
        expect(d.labels).toBe("Overview, Overview, Details");
        expect(d.children).toHaveLength(3);
        expect(d.active).toBe(1);
        expect(copy).toEqual(at([1]));
        const fewer = getElementAt(deleteElement(content, at([1])), at([]))!.data as {
            labels: string;
            active: number;
            children: unknown[];
        };
        expect(fewer.labels).toBe("Overview, Details");
        expect(fewer.children).toHaveLength(2);
        expect(fewer.active).toBe(1); // the tab that moved into the removed one's place shows
    });

    it("a fixed slot empties on delete and offers no copy", () => {
        const table = artOf(create("table"));
        expect(duplicableAt(table, at([4]))).toBe(false);
        const cleared = deleteElement(table, at([4]));
        expect(textOf(kidsOf(cleared, [])[4])).toBe("");
        expect(kidsOf(cleared, [])).toHaveLength(12);
        expect(duplicateElement(table, at([4])).at).toBeNull();

        const testimonial = artOf(create("testimonial"));
        const avatar = kidsOf(deleteElement(testimonial, at([1])), [])[1]!;
        expect(avatar.type).toBe("media");
        expect((avatar.data as { src?: string }).src).toBe("");
    });

    it("a batch over sealed children goes through the same hooks", () => {
        const art = artOf(create("faq"));
        const out = removeMany(art, [at([0]), at([5])]);
        expect(kidsOf(out, []).map(textOf)).toEqual([
            "Can I export?",
            "Yes: PDF, PNG, and print, pixel-for-pixel with what you edit.",
        ]);
        const dup = duplicateMany(artOf(create("processDiagram")), [at([0])]);
        expect(dup.addresses).toEqual([at([2])]);
        const items = (getElementAt(dup.content, at([]))!.data as { items: string }).items;
        expect(items.startsWith("Research, Research, Design")).toBe(true);
    });
});
