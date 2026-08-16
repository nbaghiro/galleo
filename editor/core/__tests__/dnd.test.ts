import "@elements/register";
import { describe, expect, it } from "vitest";
import type { Region } from "@engine/node";
import type { ArtifactContent, ElementInstance } from "@model/artifact";
import { colGroup, rowGroup } from "@model/artifact";
import { getElementAt } from "@elements/ops";
import { artifactOf, inst, sectionOf } from "@canvas/testkit";
import {
    activeSlot,
    applyDrop,
    computeDropSlots,
    type DragPayload,
    type DropTarget,
} from "@editor/core/dnd";

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

const NEW: DragPayload = { kind: "new", type: "text" };

// the old computeDropTarget contract, expressed over the slot engine: enumerate once, resolve a point
const targetAt = (
    art: ArtifactContent,
    regions: Region[],
    px: number,
    py: number,
    payload: DragPayload = NEW,
): DropTarget | null =>
    activeSlot(computeDropSlots(art, regions, payload), px, py, null)?.target ?? null;

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

describe("slot resolution — new section in the inter-section gap", () => {
    it("a point crossing the padding between two sections → a newSection there (not a replace)", () => {
        expect(targetAt(twoSections(), sectionRegions(), 200, 150)).toEqual({
            section: "",
            op: "newSection",
            path: [],
            index: 1,
            before: false,
            direction: "col",
        });
    });

    it("above the first / below the last section → newSection at the stack ends", () => {
        expect(targetAt(twoSections(), sectionRegions(), 200, -20)?.index).toBe(0);
        expect(targetAt(twoSections(), sectionRegions(), 200, 320)?.index).toBe(2);
    });

    it("a point in the side gutter (px beyond the stack) is not a drop", () => {
        expect(targetAt(twoSections(), sectionRegions(), 500, 150)).toBeNull();
    });

    it("a windowed-out section drops only its own gaps, not the whole set", () => {
        const art = artifactOf([
            sectionOf(txt("a"), { id: "s1" }),
            sectionOf(txt("b"), { id: "s2" }),
            sectionOf(txt("c"), { id: "s3" }), // scrolled out of the window: no region
        ]);
        const regions = [reg("el:s1", 0, 0, 400, 100), reg("el:s2", 0, 200, 400, 100)];
        const gaps = computeDropSlots(art, regions, NEW).filter(
            (s) => s.target.op === "newSection",
        );
        expect(gaps.map((s) => s.target.index)).toEqual([0, 1]);
    });
});

describe("slot resolution — column boundary band", () => {
    it("a point near a column boundary → an op:column target at that boundary index", () => {
        // boundary between the two columns sits at x = 200
        expect(targetAt(rowArt(), rowRegions(), 200, 100)).toEqual({
            section: "s1",
            op: "column",
            path: [],
            index: 1,
            before: false,
            direction: "row",
        });
    });

    it("the outer section edges are boundaries 0 and N", () => {
        expect(targetAt(rowArt(), rowRegions(), 20, 100)?.index).toBe(0);
        expect(targetAt(rowArt(), rowRegions(), 380, 100)?.index).toBe(2);
    });
});

describe("slot resolution — leaf inside a container", () => {
    it("inserts into the PARENT at the sibling gap nearest the cursor", () => {
        expect(targetAt(nestedArt(), nestedRegions(), 250, 60)).toEqual({
            section: "s1",
            op: "insert",
            path: [0],
            index: 1,
            before: false,
            direction: "row",
        });
    });

    it("hitboxes tile at sibling midpoints — crossing each advances the index by exactly one", () => {
        const idx = (px: number): number | undefined =>
            targetAt(nestedArt(), nestedRegions(), px, 60)?.index;
        expect(idx(50)).toBe(0); // before the first midpoint (x=105)
        expect(idx(250)).toBe(1); // past the first, before the second (x=295)
        expect(idx(350)).toBe(2); // past both, clamped to len
    });

    it("no point inside a container is a dead zone", () => {
        const slots = computeDropSlots(nestedArt(), nestedRegions(), NEW);
        for (let px = 25; px < 375; px += 25)
            for (let py = 25; py < 115; py += 25)
                expect(activeSlot(slots, px, py, null), `${px},${py}`).not.toBeNull();
    });
});

describe("slot resolution — the section-root leaf wraps", () => {
    it("nearest vertical edge → wrap into a row, side from the edge", () => {
        expect(targetAt(leafArt(), leafRegions(), 330, 110)).toEqual({
            section: "s1",
            op: "wrap",
            path: [],
            index: 0,
            before: false,
            direction: "row",
        });
        expect(targetAt(leafArt(), leafRegions(), 70, 100)).toMatchObject({
            op: "wrap",
            direction: "row",
            before: true,
        });
    });

    it("nearest horizontal edge → wrap into a column, side from the edge", () => {
        expect(targetAt(leafArt(), leafRegions(), 200, 150)).toMatchObject({
            op: "wrap",
            direction: "col",
            before: false,
        });
        expect(targetAt(leafArt(), leafRegions(), 200, 50)).toMatchObject({
            op: "wrap",
            direction: "col",
            before: true,
        });
    });
});

describe("move exclusions — the source never targets itself", () => {
    const movingA: DragPayload = { kind: "move", from: { section: "s1", path: [0] } };

    it("the gaps flanking the source in its own parent are gone (no-op moves)", () => {
        const slots = computeDropSlots(rowArt(), rowRegions(), movingA);
        const gaps = slots.filter((s) => s.target.op === "insert" && s.target.path.length === 0);
        expect(gaps.map((s) => s.target.index)).toEqual([2]); // 0 and 1 flank the source
    });

    it("column boundaries beside the source column are gone", () => {
        const slots = computeDropSlots(rowArt(), rowRegions(), movingA);
        const cols = slots.filter((s) => s.target.op === "column");
        expect(cols.map((s) => s.target.index)).toEqual([2]);
    });

    it("no slots inside the dragged subtree", () => {
        // moveNested: row [txt a, txt b, col [txt c]] — drag the trailing column
        const regions = [
            reg("section:s1", 0, 0, 600, 200),
            reg("el:s1", 20, 20, 560, 160),
            reg("el:s1:0", 20, 20, 170, 160),
            reg("el:s1:1", 210, 20, 170, 160),
            reg("el:s1:2", 400, 20, 180, 160),
            reg("el:s1:2.0", 400, 20, 180, 160),
        ];
        const intoCol = (s: { target: DropTarget }): boolean =>
            s.target.path.length >= 1 && s.target.path[0] === 2;
        // sanity: a fresh drag does offer the column's interior gaps
        expect(computeDropSlots(moveNested(), regions, NEW).some(intoCol)).toBe(true);
        const movingCol: DragPayload = { kind: "move", from: { section: "s1", path: [2] } };
        expect(computeDropSlots(moveNested(), regions, movingCol).some(intoCol)).toBe(false);
    });

    it("dragging the section root offers no column or wrap slots in its own section", () => {
        const movingRoot: DragPayload = { kind: "move", from: { section: "s1", path: [] } };
        const slots = computeDropSlots(leafArt(), leafRegions(), movingRoot);
        expect(slots.every((s) => s.target.op === "newSection")).toBe(true);
    });
});

describe("section drags — reorder through the same gap slots", () => {
    const threeSections = (): ArtifactContent =>
        artifactOf([
            sectionOf(txt("a"), { id: "s1" }),
            sectionOf(txt("b"), { id: "s2" }),
            sectionOf(txt("c"), { id: "s3" }),
        ]);
    const threeRegions = (): Region[] => [
        reg("el:s1", 0, 0, 400, 100),
        reg("el:s2", 0, 200, 400, 100),
        reg("el:s3", 0, 400, 400, 100),
    ];

    it("offers only the stack gaps, minus the two flanking the dragged section", () => {
        const slots = computeDropSlots(threeSections(), threeRegions(), {
            kind: "section",
            id: "s2",
        });
        expect(slots.every((s) => s.target.op === "newSection")).toBe(true);
        expect(slots.map((s) => s.target.index)).toEqual([0, 3]); // gaps 1 and 2 flank s2
    });

    it("applyDrop reorders across the section's own removal and keeps its id", () => {
        const { content, address } = applyDrop(
            threeSections(),
            { section: "", op: "newSection", path: [], index: 3, before: false, direction: "col" },
            { kind: "section", id: "s1" },
        );
        expect(content.sections.map((s) => s.id)).toEqual(["s2", "s3", "s1"]);
        expect(address).toEqual({ section: "s1", path: [] });
    });

    it("dropping into an earlier gap moves the section up", () => {
        const { content } = applyDrop(
            threeSections(),
            { section: "", op: "newSection", path: [], index: 0, before: false, direction: "col" },
            { kind: "section", id: "s3" },
        );
        expect(content.sections.map((s) => s.id)).toEqual(["s3", "s1", "s2"]);
    });

    it("a stale flanking gap resolves as a no-op returning the original content", () => {
        const art = threeSections();
        const { content, address } = applyDrop(
            art,
            { section: "", op: "newSection", path: [], index: 1, before: false, direction: "col" },
            { kind: "section", id: "s1" },
        );
        expect(content).toBe(art);
        expect(address).toBeNull();
    });
});

describe("activeSlot — priority and hysteresis", () => {
    it("the column band outranks element gaps under the same point", () => {
        // x=200 sits in the column band AND the root row's gap-1 hitbox
        expect(targetAt(rowArt(), rowRegions(), 200, 100)?.op).toBe("column");
    });

    it("the current target holds within the hysteresis margin across a boundary", () => {
        const slots = computeDropSlots(nestedArt(), nestedRegions(), NEW);
        const at1 = activeSlot(slots, 110, 60, null)!; // just past the first midpoint (105)
        expect(at1.target.index).toBe(1);
        // nudge back 3px across the midpoint: without hysteresis this would flip to 0
        const held = activeSlot(slots, 102, 60, at1.target)!;
        expect(held.target.index).toBe(1);
        const fresh = activeSlot(slots, 102, 60, null)!;
        expect(fresh.target.index).toBe(0);
    });
});

describe("slot indicators — geometry the overlay draws", () => {
    it("row gaps get vertical lines, section gaps horizontal ones", () => {
        const slots = computeDropSlots(nestedArt(), nestedRegions(), NEW);
        const rowGap = slots.find(
            (s) => s.target.op === "insert" && s.target.path.length === 1 && s.target.index === 1,
        )!;
        expect(rowGap.indicator).toMatchObject({ kind: "line", axis: "v" });
        const gapSlots = computeDropSlots(twoSections(), sectionRegions(), NEW).filter(
            (s) => s.target.op === "newSection",
        );
        expect(gapSlots.length).toBe(3);
        for (const s of gapSlots) expect(s.indicator).toMatchObject({ kind: "line", axis: "h" });
    });

    it("an empty region advertises itself as a region highlight", () => {
        const art = artifactOf([
            sectionOf({ type: "group", data: { direction: "col", children: [] } }, { id: "s1" }),
        ]);
        const regions = [reg("section:s1", 0, 0, 400, 200), reg("el:s1", 20, 20, 360, 160)];
        const slots = computeDropSlots(art, regions, NEW);
        const replace = slots.find((s) => s.target.op === "replace")!;
        expect(replace.indicator.kind).toBe("region");
        // its reach extends to the bare section padding
        expect(targetAt(art, regions, 10, 100)?.op).toBe("replace");
    });
});

describe("applyDrop — lands the element and returns the landed address", () => {
    it("insert → the element lands at [...path, index]; later siblings shift", () => {
        const target = targetAt(nestedArt(), nestedRegions(), 250, 60)!;
        const { content, address } = applyDrop(nestedArt(), target, { kind: "new", type: "text" });
        expect(address).toEqual({ section: "s1", path: [0, 1] });
        expect(getElementAt(content, address!)?.type).toBe("text");
        expect(textOf(getElementAt(content, { section: "s1", path: [0, 2] }))).toBe("b");
    });

    it("wrap after → lands at [...path, 1], the original kept at [...path, 0]", () => {
        const target = targetAt(leafArt(), leafRegions(), 330, 110)!;
        const { content, address } = applyDrop(leafArt(), target, { kind: "new", type: "text" });
        expect(address).toEqual({ section: "s1", path: [1] });
        expect(getElementAt(content, { section: "s1", path: [] })?.type).toBe("group");
        expect(textOf(getElementAt(content, { section: "s1", path: [0] }))).toBe("root");
        expect(getElementAt(content, { section: "s1", path: [1] })?.type).toBe("text");
    });

    it("wrap before → lands at [...path, 0], the original pushed to [...path, 1]", () => {
        const target = targetAt(leafArt(), leafRegions(), 70, 100)!;
        const { content, address } = applyDrop(leafArt(), target, { kind: "new", type: "text" });
        expect(address).toEqual({ section: "s1", path: [0] });
        expect(getElementAt(content, { section: "s1", path: [0] })?.type).toBe("text");
        expect(textOf(getElementAt(content, { section: "s1", path: [1] }))).toBe("root");
    });

    it("newSection → a fresh section holding the element, address path []", () => {
        const target = targetAt(twoSections(), sectionRegions(), 200, 150)!;
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

// A closed container owns its own slots: dropping never targets it or reaches inside it.
describe("closed containers are leaves for drag-and-drop", () => {
    const diagramArt = (): ArtifactContent => ({
        format: "deck",
        theme: "base",
        sections: [
            {
                id: "s1",
                root: {
                    type: "group",
                    data: {
                        direction: "row",
                        children: [
                            {
                                type: "diagram",
                                data: { type: "process", items: "A, B", height: 200 },
                            },
                            txt("side"),
                        ],
                    },
                },
            },
        ],
    });
    const regionsOf = (): Region[] => [
        { id: "section:s1", box: { x: 0, y: 0, w: 600, h: 300 } },
        { id: "el:s1", box: { x: 0, y: 0, w: 600, h: 300 } },
        { id: "el:s1:0", box: { x: 0, y: 0, w: 300, h: 300 } }, // the diagram
        { id: "el:s1:0.0", box: { x: 20, y: 20, w: 100, h: 40 } }, // a label inside it
        { id: "el:s1:1", box: { x: 300, y: 0, w: 300, h: 300 } },
    ];

    it("no slot ever targets the diagram's interior", () => {
        const slots = computeDropSlots(diagramArt(), regionsOf(), NEW);
        for (const s of slots)
            expect(s.target.op === "replace" && s.target.path.length > 0, "inside closed").toBe(
                false,
            );
        for (const s of slots) expect(s.target.path.length <= 1).toBe(true);
    });

    it("a drop over the diagram targets the parent row, never the diagram itself", () => {
        const t = targetAt(diagramArt(), regionsOf(), 150, 150)!;
        expect(t.op).toBe("insert");
        expect(t.path).toEqual([]);
    });

    it("a drop over a label inside the diagram targets the diagram's parent, not the label", () => {
        const t = targetAt(diagramArt(), regionsOf(), 60, 40)!;
        expect(t.path).toEqual([]);
        expect(t.op).toBe("insert");
    });
});
