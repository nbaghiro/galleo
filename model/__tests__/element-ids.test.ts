import { describe, expect, it } from "vitest";
import type { ArtifactContent, ElementInstance, Section } from "@model/artifact";
import {
    contentWithElementIds,
    newElementId,
    sectionWithElementIds,
    withElementIds,
    withFreshElementIds,
} from "@model/artifact";

const leaf = (text: string, id?: string): ElementInstance => ({
    type: "text",
    data: { text },
    ...(id ? { id } : {}),
});

const group = (children: ElementInstance[], id?: string): ElementInstance => ({
    type: "group",
    data: { direction: "col", children },
    ...(id ? { id } : {}),
});

const idsIn = (el: ElementInstance): string[] => {
    const out: string[] = [];
    const walk = (node: ElementInstance): void => {
        if (node.id) out.push(node.id);
        const kids = (node.data as { children?: ElementInstance[] }).children;
        if (Array.isArray(kids)) kids.forEach(walk);
    };
    walk(el);
    return out;
};

describe("newElementId", () => {
    it("mints distinct, prefixed ids", () => {
        const a = newElementId();
        const b = newElementId();
        expect(a).toMatch(/^e-[0-9a-f]{8}$/);
        expect(a).not.toBe(b);
    });
});

describe("withElementIds", () => {
    it("returns the very same object when the whole subtree already has ids", () => {
        const tree = group([leaf("a", "e-1"), leaf("b", "e-2")], "e-0");
        expect(withElementIds(tree)).toBe(tree);
    });

    it("fills only what is missing, and leaves the rest by identity", () => {
        const kept = leaf("a", "e-1");
        const bare = leaf("b");
        const tree = group([kept, bare], "e-0");
        const stamped = withElementIds(tree);

        expect(stamped).not.toBe(tree);
        expect(stamped.id).toBe("e-0");
        const kids = (stamped.data as { children: ElementInstance[] }).children;
        expect(kids[0]).toBe(kept); // untouched branch keeps its identity
        expect(kids[1]!.id).toMatch(/^e-/);
        expect((kids[1]!.data as { text: string }).text).toBe("b");
    });

    it("stamps a container's stored cells as well as its children", () => {
        const table: ElementInstance = {
            type: "table",
            data: { cols: 2, cells: [leaf("r1c1"), leaf("r1c2")] },
        };
        const stamped = withElementIds(table);
        const cells = (stamped.data as { cells: ElementInstance[] }).cells;
        expect(cells.every((c) => !!c.id)).toBe(true);
        expect(new Set(cells.map((c) => c.id)).size).toBe(2);
    });

    it("leaves data arrays that are not elements alone", () => {
        const chart: ElementInstance = {
            type: "barChart",
            data: { series: [{ label: "a", value: 1 }] },
        };
        const stamped = withElementIds(chart);
        expect(stamped.data).toEqual({ series: [{ label: "a", value: 1 }] });
        expect(stamped.id).toMatch(/^e-/);
    });

    it("preserves section and content identity when nothing was missing", () => {
        const section: Section = { id: "s1", root: group([leaf("a", "e-1")], "e-0") };
        expect(sectionWithElementIds(section)).toBe(section);

        const content: ArtifactContent = { format: "deck", theme: "studio", sections: [section] };
        expect(contentWithElementIds(content)).toBe(content);
    });

    it("rebuilds only the sections that needed stamping", () => {
        const done: Section = { id: "s1", root: leaf("a", "e-1") };
        const todo: Section = { id: "s2", root: leaf("b") };
        const content: ArtifactContent = {
            format: "deck",
            theme: "studio",
            sections: [done, todo],
        };
        const stamped = contentWithElementIds(content);
        expect(stamped).not.toBe(content);
        expect(stamped.sections[0]).toBe(done);
        expect(stamped.sections[1]).not.toBe(todo);
        expect(stamped.sections[1]!.root.id).toMatch(/^e-/);
    });
});

describe("withFreshElementIds", () => {
    it("re-mints every id in the subtree, so a copy shares none with its source", () => {
        const tree = group([leaf("a", "e-1"), group([leaf("b", "e-2")], "e-3")], "e-0");
        const copy = withFreshElementIds(tree);
        const before = idsIn(tree);
        const after = idsIn(copy);

        expect(after).toHaveLength(before.length);
        expect(new Set(after).size).toBe(after.length);
        expect(after.some((id) => before.includes(id))).toBe(false);
        expect(idsIn(tree)).toEqual(before); // the source is untouched
    });

    it("mints ids for a subtree that had none", () => {
        const copy = withFreshElementIds(group([leaf("a")]));
        expect(idsIn(copy)).toHaveLength(2);
    });
});
