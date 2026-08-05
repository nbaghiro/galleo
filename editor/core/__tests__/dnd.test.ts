import "@elements/register";
import { describe, expect, it } from "vitest";
import type { Region } from "@engine/node";
import type { ArtifactContent, ElementInstance } from "@model/artifact";
import { colGroup, rowGroup } from "@model/section";
import { DROP_GHOST } from "@elements/dropghost";
import { getElementAt } from "@elements/ops";
import { artifactOf, inst, sectionOf } from "@canvas/testkit";
import { applyDrop, computeDropTarget, previewDrop, type DropTarget } from "@editor/core/dnd";

const reg = (id: string, x: number, y: number, w: number, h: number): Region => ({
    id,
    box: { x, y, w, h },
});
const txt = (t: string): ElementInstance => inst("text", { text: t });
const textOf = (i: ElementInstance | undefined): string | undefined =>
    (i?.data as { text?: string })?.text;
const collectTexts = (el: ElementInstance | undefined, out: string[] = []): string[] => {
    if (!el) return out;
    const t = (el.data as { text?: string }).text;
    if (typeof t === "string") out.push(t);
    (el.data as { children?: ElementInstance[] }).children?.forEach((k) => collectTexts(k, out));
    return out;
};

const twoSections = (): ArtifactContent =>
    artifactOf([sectionOf(txt("a"), { id: "s1" }), sectionOf(txt("b"), { id: "s2" })]);
const sectionRegions = (): Region[] => [
    reg("el:s1", 0, 0, 400, 100),
    reg("el:s2", 0, 200, 400, 100),
];

const rowArt = (): ArtifactContent => artifactOf([sectionOf(rowGroup([txt("a"), txt("b")]))]);
const rowRegions = (): Region[] => [
    reg("section:s1", 0, 0, 400, 200),
    reg("el:s1", 20, 20, 360, 160),
    reg("el:s1:0", 20, 20, 170, 160),
    reg("el:s1:1", 210, 20, 170, 160),
];

const nestedArt = (): ArtifactContent =>
    artifactOf([sectionOf(colGroup([rowGroup([txt("a"), txt("b")])]))]);
const nestedRegions = (): Region[] => [
    reg("section:s1", 0, 0, 400, 200),
    reg("el:s1", 0, 0, 400, 200),
    reg("el:s1:0", 20, 20, 360, 100),
    reg("el:s1:0.0", 20, 20, 170, 100),
    reg("el:s1:0.1", 210, 20, 170, 100),
];

const leafArt = (): ArtifactContent => artifactOf([sectionOf(txt("root"))]);
const leafRegions = (): Region[] => [
    reg("section:s1", 0, 0, 400, 200),
    reg("el:s1", 40, 40, 320, 120),
];

// insert targets are built directly, so these exercise moveInto's rebasing, not region derivation
const insertAt = (path: number[], index: number): DropTarget => ({
    section: "s1",
    op: "insert",
    path,
    index,
    before: false,
    direction: "row",
});
const moveRow = (): ArtifactContent =>
    artifactOf([sectionOf(rowGroup([txt("a"), txt("b"), txt("c")]))]);
const moveNested = (): ArtifactContent =>
    artifactOf([sectionOf(rowGroup([txt("a"), txt("b"), colGroup([txt("c")])]))]);
const moveSoleCol = (): ArtifactContent =>
    artifactOf([sectionOf(rowGroup([colGroup([txt("a")]), txt("b"), txt("c")]))]);

describe("computeDropTarget — new section in the inter-section gap", () => {
    it("a point crossing the padding between two sections → a newSection there (not a replace)", () => {
        expect(computeDropTarget(twoSections(), sectionRegions(), 200, 150)).toEqual({
            section: "",
            op: "newSection",
            path: [],
            index: 1,
            before: false,
            direction: "col",
        });
    });

    it("above the first / below the last section → newSection at the stack ends", () => {
        expect(computeDropTarget(twoSections(), sectionRegions(), 200, -20)?.index).toBe(0);
        expect(computeDropTarget(twoSections(), sectionRegions(), 200, 320)?.index).toBe(2);
    });

    it("a point in the side gutter (px beyond the stack) is not a gap drop", () => {
        expect(computeDropTarget(twoSections(), sectionRegions(), 500, 150)).toBeNull();
    });
});

describe("computeDropTarget — column boundary band", () => {
    it("a point near a column boundary → an op:column target at that boundary index", () => {
        // boundary between the two columns sits at x = 200
        expect(computeDropTarget(rowArt(), rowRegions(), 200, 100)).toEqual({
            section: "s1",
            op: "column",
            path: [],
            index: 1,
            before: false,
            direction: "row",
        });
    });

    it("the outer section edges are boundaries 0 and N", () => {
        expect(computeDropTarget(rowArt(), rowRegions(), 20, 100)?.index).toBe(0);
        expect(computeDropTarget(rowArt(), rowRegions(), 380, 100)?.index).toBe(2);
    });
});

describe("computeDropTarget — leaf inside a container", () => {
    it("inserts into the PARENT at the sibling gap nearest the cursor", () => {
        expect(computeDropTarget(nestedArt(), nestedRegions(), 250, 60)).toEqual({
            section: "s1",
            op: "insert",
            path: [0],
            index: 1,
            before: false,
            direction: "row",
        });
    });

    it("gapIndex is monotonic — crossing each sibling midpoint advances the index by exactly one", () => {
        const idx = (px: number): number | undefined =>
            computeDropTarget(nestedArt(), nestedRegions(), px, 60)?.index;
        expect(idx(50)).toBe(0); // before the first midpoint (x=105)
        expect(idx(250)).toBe(1); // past the first, before the second (x=295)
        expect(idx(350)).toBe(2); // past both, clamped to len
    });
});

describe("computeDropTarget — the section-root leaf wraps", () => {
    it("a horizontal cursor offset → wrap into a row, side from the cursor", () => {
        expect(computeDropTarget(leafArt(), leafRegions(), 330, 110)).toEqual({
            section: "s1",
            op: "wrap",
            path: [],
            index: 0,
            before: false,
            direction: "row",
        });
        expect(computeDropTarget(leafArt(), leafRegions(), 70, 100)).toMatchObject({
            op: "wrap",
            direction: "row",
            before: true,
        });
    });

    it("a vertical cursor offset → wrap into a column, side from the cursor", () => {
        expect(computeDropTarget(leafArt(), leafRegions(), 200, 150)).toMatchObject({
            op: "wrap",
            direction: "col",
            before: false,
        });
        expect(computeDropTarget(leafArt(), leafRegions(), 200, 50)).toMatchObject({
            op: "wrap",
            direction: "col",
            before: true,
        });
    });
});

describe("applyDrop — lands the element and returns the landed address", () => {
    it("insert → the element lands at [...path, index]; later siblings shift", () => {
        const target = computeDropTarget(nestedArt(), nestedRegions(), 250, 60)!;
        const { content, address } = applyDrop(nestedArt(), target, { kind: "new", type: "text" });
        expect(address).toEqual({ section: "s1", path: [0, 1] });
        expect(getElementAt(content, address!)?.type).toBe("text");
        expect(textOf(getElementAt(content, { section: "s1", path: [0, 2] }))).toBe("b");
    });

    it("wrap after → lands at [...path, 1], the original kept at [...path, 0]", () => {
        const target = computeDropTarget(leafArt(), leafRegions(), 330, 110)!;
        const { content, address } = applyDrop(leafArt(), target, { kind: "new", type: "text" });
        expect(address).toEqual({ section: "s1", path: [1] });
        expect(getElementAt(content, { section: "s1", path: [] })?.type).toBe("group");
        expect(textOf(getElementAt(content, { section: "s1", path: [0] }))).toBe("root");
        expect(getElementAt(content, { section: "s1", path: [1] })?.type).toBe("text");
    });

    it("wrap before → lands at [...path, 0], the original pushed to [...path, 1]", () => {
        const target = computeDropTarget(leafArt(), leafRegions(), 70, 100)!;
        const { content, address } = applyDrop(leafArt(), target, { kind: "new", type: "text" });
        expect(address).toEqual({ section: "s1", path: [0] });
        expect(getElementAt(content, { section: "s1", path: [0] })?.type).toBe("text");
        expect(textOf(getElementAt(content, { section: "s1", path: [1] }))).toBe("root");
    });

    it("newSection → a fresh section holding the element, address path []", () => {
        const target = computeDropTarget(twoSections(), sectionRegions(), 200, 150)!;
        const { content, address } = applyDrop(twoSections(), target, {
            kind: "new",
            type: "text",
        });
        expect(content.sections).toHaveLength(3);
        expect(address?.path).toEqual([]);
        expect(address?.section).toBe(content.sections[1]!.id);
        expect(content.sections[1]!.root.type).toBe("text");
    });
});

describe("previewDrop — mirrors applyDrop", () => {
    it("a move lifts the source out immediately (no target → the dragged element is gone)", () => {
        const preview = previewDrop(rowArt(), null, {
            kind: "move",
            from: { section: "s1", path: [0] },
        });
        const texts = collectTexts(preview.sections[0]!.root);
        expect(texts).toContain("b");
        expect(texts).not.toContain("a");
    });

    it("with a target it splices a dimmed ghost where applyDrop lands the real element", () => {
        const target = computeDropTarget(nestedArt(), nestedRegions(), 250, 60)!;
        const applied = applyDrop(nestedArt(), target, { kind: "new", type: "text" });
        const preview = previewDrop(nestedArt(), target, { kind: "new", type: "text" });
        expect(getElementAt(preview, applied.address!)?.type).toBe(DROP_GHOST);
        expect(getElementAt(applied.content, applied.address!)?.type).toBe("text");
        expect(textOf(getElementAt(preview, { section: "s1", path: [0, 2] }))).toBe("b");
        expect(textOf(getElementAt(applied.content, { section: "s1", path: [0, 2] }))).toBe("b");
    });
});

describe("applyDrop — moving an existing element", () => {
    it("relocates a leaf into another container, rebasing the target past the removed source", () => {
        // move "a" [0] into the trailing column [2]; removing a first shifts that column down to [1]
        const { content, address } = applyDrop(moveNested(), insertAt([2], 1), {
            kind: "move",
            from: { section: "s1", path: [0] },
        });
        expect(collectTexts(content.sections[0]!.root)).toEqual(["b", "c", "a"]);
        expect(address).toEqual({ section: "s1", path: [1, 1] });
        expect(textOf(getElementAt(content, address!))).toBe("a");
    });

    it("dropping past the source in the same row compensates the index by one", () => {
        // move "a" [0] to index 2; since a sat before the drop point it lands at 1, not 2
        const { content, address } = applyDrop(moveRow(), insertAt([], 2), {
            kind: "move",
            from: { section: "s1", path: [0] },
        });
        expect(collectTexts(content.sections[0]!.root)).toEqual(["b", "a", "c"]);
        expect(address).toEqual({ section: "s1", path: [1] });
    });

    it("emptying the source column collapses it and re-aims the landed selection past it", () => {
        // move the sole child "a" [0,0] to the row's end; its now-empty column collapses away
        const { content, address } = applyDrop(moveSoleCol(), insertAt([], 3), {
            kind: "move",
            from: { section: "s1", path: [0, 0] },
        });
        expect(collectTexts(content.sections[0]!.root)).toEqual(["b", "c", "a"]);
        expect(address).toEqual({ section: "s1", path: [2] });
        expect(textOf(getElementAt(content, address!))).toBe("a");
    });

    it("a move whose source no longer exists is a no-op returning the original content", () => {
        const art = moveRow();
        const { content, address } = applyDrop(art, insertAt([], 1), {
            kind: "move",
            from: { section: "s1", path: [9] },
        });
        expect(content).toBe(art);
        expect(address).toBeNull();
    });
});

describe("previewDrop — a move ghost matches the real landing", () => {
    it("splices a dimmed ghost of the source exactly where applyDrop moves it", () => {
        const target = insertAt([2], 1);
        const from = { section: "s1", path: [0] };
        const applied = applyDrop(moveNested(), target, { kind: "move", from });
        const preview = previewDrop(moveNested(), target, { kind: "move", from });
        expect(getElementAt(preview, applied.address!)?.type).toBe(DROP_GHOST);
        expect(textOf(getElementAt(applied.content, applied.address!))).toBe("a");
    });
});
