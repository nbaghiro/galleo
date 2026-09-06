import "@elements/register";
import { describe, expect, it } from "vitest";
import type { Rect, Region } from "@engine/node";
import type { ArtifactContent, ElementInstance } from "@model/artifact";
import { colGroup, rowGroup } from "@model/artifact";
import { getElementAt } from "@elements/ops";
import { artifactOf, inst, sectionOf } from "@canvas/testkit";
import {
    applyDrop,
    classifyDrop,
    compensatePoint,
    marqueeTargets,
    movable,
    previewFor,
    movableAncestor,
    moveManyPayload,
    movePayloadFor,
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

// the behavioral contract, point → target; the classifier is the whole engine now
const targetAt = (
    art: ArtifactContent,
    regions: Region[],
    px: number,
    py: number,
    payload: DragPayload = NEW,
): DropTarget | null => classifyDrop(art, regions, payload, px, py, null)?.target ?? null;

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

    it("a windowed-out section offers only the gaps its neighbours materialize", () => {
        const art = artifactOf([
            sectionOf(txt("a"), { id: "s1" }),
            sectionOf(txt("b"), { id: "s2" }),
            sectionOf(txt("c"), { id: "s3" }), // scrolled out of the window: no region
        ]);
        const regions = [reg("el:s1", 0, 0, 400, 100), reg("el:s2", 0, 200, 400, 100)];
        expect(targetAt(art, regions, 200, -20)?.index).toBe(0);
        expect(targetAt(art, regions, 200, 150)?.index).toBe(1);
        // the gap below s2 needs s3's box, which is not materialized
        expect(targetAt(art, regions, 200, 320)).toBeNull();
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
        for (let px = 25; px < 375; px += 25)
            for (let py = 25; py < 115; py += 25)
                expect(
                    targetAt(nestedArt(), nestedRegions(), px, py),
                    `${px},${py}`,
                ).not.toBeNull();
    });
});

describe("edge strips yield to an open same-axis container's own gaps", () => {
    // a row of [paragraph, colGroup]: the col member's top band must mean "first item inside",
    // not "stack above the whole column" — the two paint identically and wrap only adds nesting
    const art = (): ArtifactContent =>
        artifactOf([
            sectionOf(rowGroup([txt("para"), colGroup([txt("label"), txt("head"), txt("card")])])),
        ]);
    const regions = (): Region[] => [
        reg("section:s1", 0, 0, 800, 600),
        reg("el:s1", 40, 40, 720, 520),
        reg("el:s1:0", 40, 40, 320, 200),
        reg("el:s1:1", 420, 40, 340, 520),
        reg("el:s1:1.0", 420, 40, 340, 20),
        reg("el:s1:1.1", 420, 80, 340, 120),
        reg("el:s1:1.2", 420, 240, 340, 320),
    ];

    it("the top band inserts at index 0 instead of wrapping the column", () => {
        expect(targetAt(art(), regions(), 590, 42)?.index).toBe(0);
        expect(targetAt(art(), regions(), 590, 48)?.index).toBe(0);
        expect(targetAt(art(), regions(), 590, 44)).toEqual({
            section: "s1",
            op: "insert",
            path: [1],
            index: 0,
            before: false,
            direction: "col",
        });
        expect(targetAt(art(), regions(), 590, 556)?.index).toBe(3);
    });

    it("the escalation claims only its interior sliver, never the open ground beside it", () => {
        // inside the column's left sliver: the root's gap beside it, escalated
        expect(targetAt(art(), regions(), 425, 70)).toMatchObject({ op: "insert", path: [] });
        // over the leaf's top band far away, the phantom used to steal this from the strip
        expect(targetAt(art(), regions(), 200, 42)).toMatchObject({ op: "wrap", path: [0] });
    });

    it("a leaf member keeps its wrap strips", () => {
        expect(targetAt(art(), regions(), 90, 42)).toMatchObject({
            op: "wrap",
            path: [0],
            direction: "col",
            before: true,
        });
    });
});

describe("slot resolution — a col root grows no phantom column bands", () => {
    // a stacked section: heading, then a nested row of two stats — the shape every stat band has.
    // Stacked children sorted "as columns" used to mint a full-height boundary at the section's
    // horizontal centre, stealing the nested row's own middle gap.
    const art = (): ArtifactContent =>
        artifactOf([sectionOf(colGroup([txt("heading"), rowGroup([txt("a"), txt("b")])]))]);
    const regions = (): Region[] => [
        reg("section:s1", 0, 0, 400, 300),
        reg("el:s1", 20, 20, 360, 260),
        reg("el:s1:0", 20, 20, 360, 60),
        reg("el:s1:1", 20, 100, 360, 180),
        reg("el:s1:1.0", 20, 100, 170, 180),
        reg("el:s1:1.1", 210, 100, 170, 180),
    ];

    it("the nested row's middle gap wins at the centre, not a section column", () => {
        expect(targetAt(art(), regions(), 200, 190)).toEqual({
            section: "s1",
            op: "insert",
            path: [1],
            index: 1,
            before: false,
            direction: "row",
        });
    });

    it("no interior point resolves to a column op; only the real edge bands do", () => {
        // clear of the two genuine edge bands (x = 20 and 380, each ±EDGE)
        for (let px = 60; px <= 340; px += 40)
            expect(targetAt(art(), regions(), px, 50)?.op, `x=${px}`).not.toBe("column");
    });

    it("the section's outer edges still offer the two-column wrap", () => {
        expect(targetAt(art(), regions(), 12, 150)?.op).toBe("column");
        expect(targetAt(art(), regions(), 388, 150)?.op).toBe("column");
    });
});

describe("slot resolution — the padding ring", () => {
    it("the ring between the card and a row root maps to the root's own gaps", () => {
        // rowRegions: card 0,0,400x200; root content 20,20,360x160 — (200,10) is in the top ring
        const t = targetAt(rowArt(), rowRegions(), 200, 10);
        expect(t).toEqual({
            section: "s1",
            op: "insert",
            path: [],
            index: 1,
            before: false,
            direction: "row",
        });
        // the bottom ring appends past the last child
        expect(targetAt(rowArt(), rowRegions(), 350, 195)?.index).toBe(2);
    });

    it("a col root's first and last gaps reach the card's edges", () => {
        const art = artifactOf([sectionOf(colGroup([txt("a"), txt("b")]))]);
        const regions = [
            reg("section:s1", 0, 0, 400, 300),
            reg("el:s1", 20, 20, 360, 260),
            reg("el:s1:0", 20, 20, 360, 120),
            reg("el:s1:1", 20, 160, 360, 120),
        ];
        expect(targetAt(art, regions, 200, 10)?.index).toBe(0);
        expect(targetAt(art, regions, 200, 292)?.index).toBe(2);
    });

    it("the ring around a leaf root resolves to a wrap edge", () => {
        // leafRegions: card 0,0,400x200; the leaf at 40,40,320x120
        expect(targetAt(leafArt(), leafRegions(), 200, 10)?.op).toBe("wrap");
    });

    it("a point outside the section card still resolves to nothing", () => {
        expect(targetAt(rowArt(), rowRegions(), 200, -60)).toBeNull();
        expect(targetAt(rowArt(), rowRegions(), 460, 100)).toBeNull();
    });
});

describe("the perpendicular rule — wrap reaches every movable member", () => {
    it("a row member's top and bottom edges stack the payload onto it", () => {
        // rowArt member [0] box (20,20,170,160): 24px bands at both horizontal edges
        expect(targetAt(rowArt(), rowRegions(), 100, 25)).toMatchObject({
            op: "wrap",
            path: [0],
            direction: "col",
            before: true,
        });
        expect(targetAt(rowArt(), rowRegions(), 100, 175)).toMatchObject({
            op: "wrap",
            path: [0],
            direction: "col",
            before: false,
        });
    });

    it("a grid cell wraps at its horizontal edges, caption-under-an-image style", () => {
        const gridArt = artifactOf([
            sectionOf(
                inst("container", {
                    direction: "grid",
                    columns: 2,
                    children: [txt("a"), txt("b"), txt("c"), txt("d")],
                }),
                { id: "s1" },
            ),
        ]);
        const gridRegions = [
            reg("section:s1", 0, 0, 400, 220),
            reg("el:s1", 0, 0, 400, 220),
            reg("el:s1:0", 20, 20, 170, 80),
            reg("el:s1:1", 210, 20, 170, 80),
            reg("el:s1:2", 20, 120, 170, 80),
            reg("el:s1:3", 210, 120, 170, 80),
        ];
        // band = clamp(80 * 0.15, 8, 24) = 12
        expect(targetAt(gridArt, gridRegions, 100, 26)).toMatchObject({
            op: "wrap",
            path: [0],
            direction: "col",
            before: true,
        });
        expect(targetAt(gridArt, gridRegions, 100, 94)).toMatchObject({
            op: "wrap",
            path: [0],
            direction: "col",
            before: false,
        });
        // a cell's vertical edges stay insert territory
        expect(targetAt(gridArt, gridRegions, 200, 60)?.op).toBe("insert");
    });

    it("the strip is proportional: a narrow member's band shrinks instead of eating its gaps", () => {
        // second root column, so its members' edges sit clear of the first boundary band
        const art = artifactOf([sectionOf(rowGroup([txt("c"), colGroup([txt("a"), txt("b")])]))]);
        const regions = [
            reg("section:s1", 0, 0, 400, 200),
            reg("el:s1", 20, 20, 360, 160),
            reg("el:s1:0", 20, 20, 170, 160),
            reg("el:s1:1", 210, 20, 60, 160),
            reg("el:s1:1.0", 210, 20, 60, 70),
            reg("el:s1:1.1", 210, 110, 60, 70),
        ];
        // band = clamp(60 * 0.15, 8, 24) = 9: 6px in wraps, 22px in is the col's own gap
        expect(targetAt(art, regions, 216, 50)).toMatchObject({ op: "wrap", path: [1, 0] });
        expect(targetAt(art, regions, 232, 50)).toMatchObject({ op: "insert", path: [1] });
    });

    it("an open child's flush edge escapes to the parent's gap", () => {
        // nestedArt: the row [0] sits flush in the col root; 8px inside its top/bottom edges
        // means beside it in the root, not its own end gap
        expect(targetAt(nestedArt(), nestedRegions(), 200, 26)).toMatchObject({
            op: "insert",
            path: [],
            index: 0,
        });
        expect(targetAt(nestedArt(), nestedRegions(), 200, 114)).toMatchObject({
            op: "insert",
            path: [],
            index: 1,
        });
        // past the sliver, the row's own gap takes over again
        expect(targetAt(nestedArt(), nestedRegions(), 200, 60)).toMatchObject({
            op: "insert",
            path: [0],
        });
    });
});

describe("totality — every point inside a card means something", () => {
    const gridFix = (): [ArtifactContent, Region[]] => [
        artifactOf([
            sectionOf(
                inst("container", {
                    direction: "grid",
                    columns: 2,
                    children: [txt("a"), txt("b"), txt("c"), txt("d")],
                }),
                { id: "s1" },
            ),
        ]),
        [
            reg("section:s1", 0, 0, 400, 220),
            reg("el:s1", 0, 0, 400, 220),
            reg("el:s1:0", 20, 20, 170, 80),
            reg("el:s1:1", 210, 20, 170, 80),
            reg("el:s1:2", 20, 120, 170, 80),
            reg("el:s1:3", 210, 120, 170, 80),
        ],
    ];

    it("classifies non-null on a fine lattice inside every fixture's card, null outside", () => {
        const fixtures: [string, ArtifactContent, Region[], Rect][] = [
            ["row", rowArt(), rowRegions(), { x: 0, y: 0, w: 400, h: 200 }],
            ["nested", nestedArt(), nestedRegions(), { x: 0, y: 0, w: 400, h: 200 }],
            ["leaf", leafArt(), leafRegions(), { x: 0, y: 0, w: 400, h: 200 }],
            ["grid", ...gridFix(), { x: 0, y: 0, w: 400, h: 220 }],
        ];
        for (const [name, art, regions, card] of fixtures) {
            for (let px = 5; px < card.w; px += 10)
                for (let py = 5; py < card.h; py += 10)
                    expect(targetAt(art, regions, px, py), `${name} ${px},${py}`).not.toBeNull();
            expect(targetAt(art, regions, card.w + 80, card.h / 2), name).toBeNull();
            expect(targetAt(art, regions, card.w / 2, card.h + 80), name).toBeNull();
        }
    });
});

describe("marqueeTargets — sweep resolution", () => {
    it("selects the root's direct children the rectangle crosses", () => {
        const hits = marqueeTargets(rowArt(), rowRegions(), { x: 10, y: 10, w: 380, h: 180 });
        expect(hits).toEqual([
            { section: "s1", path: [0] },
            { section: "s1", path: [1] },
        ]);
        const one = marqueeTargets(rowArt(), rowRegions(), { x: 10, y: 10, w: 100, h: 100 });
        expect(one).toEqual([{ section: "s1", path: [0] }]);
    });

    it("a swept branch answers as its depth-one ancestor, whole", () => {
        // nestedArt: colGroup root over row([a, b]) — crossing both leaves lands on the row
        const hits = marqueeTargets(nestedArt(), nestedRegions(), { x: 30, y: 30, w: 300, h: 60 });
        expect(hits).toEqual([{ section: "s1", path: [0] }]);
    });

    it("a leaf root answers as itself; a container root never does", () => {
        expect(marqueeTargets(leafArt(), leafRegions(), { x: 50, y: 50, w: 100, h: 60 })).toEqual([
            { section: "s1", path: [] },
        ]);
        // the ring between the card and the children belongs to no one
        expect(marqueeTargets(rowArt(), rowRegions(), { x: 2, y: 2, w: 10, h: 10 })).toEqual([]);
    });

    it("a rectangle crossing nothing selects nothing", () => {
        expect(marqueeTargets(rowArt(), rowRegions(), { x: 500, y: 500, w: 50, h: 50 })).toEqual(
            [],
        );
    });
});

describe("slot resolution — grid container", () => {
    const gridArt = (): ArtifactContent =>
        artifactOf([
            sectionOf(
                inst("container", {
                    direction: "grid",
                    columns: 2,
                    children: [txt("a"), txt("b"), txt("c"), txt("d")],
                }),
                { id: "s1" },
            ),
        ]);
    // 2×2 cells inside a 400×220 root
    const gridRegions = (): Region[] => [
        reg("section:s1", 0, 0, 400, 220),
        reg("el:s1", 0, 0, 400, 220),
        reg("el:s1:0", 20, 20, 170, 80),
        reg("el:s1:1", 210, 20, 170, 80),
        reg("el:s1:2", 20, 120, 170, 80),
        reg("el:s1:3", 210, 120, 170, 80),
    ];
    const idx = (px: number, py: number): number | undefined =>
        targetAt(gridArt(), gridRegions(), px, py)?.index;

    it("inserts at the flat row-major index the cursor's cell gap names", () => {
        expect(idx(200, 60)).toBe(1); // between a and b
        expect(idx(30, 60)).toBe(0); // before a (clear of the outer column band)
        expect(idx(200, 160)).toBe(3); // between c and d
    });

    it("appending past a row inserts before the next row's first cell", () => {
        expect(idx(350, 60)).toBe(2); // after b = before c
        expect(idx(350, 160)).toBe(4); // after d = true append
    });

    it("no point inside the grid is a dead zone, the row gaps included", () => {
        for (let px = 25; px < 375; px += 25)
            for (let py = 25; py < 195; py += 25)
                expect(targetAt(gridArt(), gridRegions(), px, py), `${px},${py}`).not.toBeNull();
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
        // over the source's own tile nothing claims; past the far midpoint the real move remains
        const t = targetAt(rowArt(), rowRegions(), 100, 100, movingA);
        expect(t === null || (t.op === "insert" && t.index > 1)).toBe(true);
        expect(t?.op === "insert" && t.index <= 1).toBe(false);
        expect(targetAt(rowArt(), rowRegions(), 350, 100, movingA)?.index).toBe(2);
    });

    it("column boundaries beside the source column are gone", () => {
        expect(targetAt(rowArt(), rowRegions(), 20, 100, movingA)?.op).not.toBe("column");
        expect(targetAt(rowArt(), rowRegions(), 380, 100, movingA)).toMatchObject({
            op: "column",
            index: 2,
        });
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
        const intoCol = (t: DropTarget | null): boolean =>
            !!t && t.path.length >= 1 && t.path[0] === 2;
        // sanity: a fresh drag does land inside the column
        expect(intoCol(targetAt(moveNested(), regions, 480, 100))).toBe(true);
        const movingCol: DragPayload = { kind: "move", from: { section: "s1", path: [2] } };
        expect(intoCol(targetAt(moveNested(), regions, 480, 100, movingCol))).toBe(false);
    });

    it("dragging the section root offers no column or wrap targets in its own section", () => {
        const movingRoot: DragPayload = { kind: "move", from: { section: "s1", path: [] } };
        for (const [px, py] of [
            [200, 100],
            [50, 100],
            [200, 50],
        ] as const) {
            const t = targetAt(leafArt(), leafRegions(), px, py, movingRoot);
            expect(t === null || t.op === "newSection", `${px},${py}`).toBe(true);
        }
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
        const p: DragPayload = { kind: "section", id: "s2" };
        expect(targetAt(threeSections(), threeRegions(), 200, -20, p)?.index).toBe(0);
        expect(targetAt(threeSections(), threeRegions(), 200, 520, p)?.index).toBe(3);
        // the two gaps flanking s2 are no-op reinserts and claim nothing
        expect(targetAt(threeSections(), threeRegions(), 200, 150, p)).toBeNull();
        expect(targetAt(threeSections(), threeRegions(), 200, 350, p)).toBeNull();
        // a point inside a section is never a section-drop
        expect(targetAt(threeSections(), threeRegions(), 200, 250, p)).toBeNull();
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

describe("slot resolution — distance beats class", () => {
    // two root columns; the first is a nested row whose last gap sits just inside the column
    // boundary's 24px band, so the class veto used to eat a drop visibly aimed at the gap
    const art = (): ArtifactContent =>
        artifactOf([sectionOf(rowGroup([rowGroup([txt("a"), txt("b")]), txt("c")]))]);
    const regions = (): Region[] => [
        reg("section:s1", 0, 0, 400, 200),
        reg("el:s1", 20, 20, 360, 160),
        reg("el:s1:0", 20, 20, 170, 160),
        reg("el:s1:0.0", 20, 20, 70, 160),
        reg("el:s1:0.1", 100, 20, 85, 160),
        reg("el:s1:1", 210, 20, 170, 160),
    ];

    it("a drop nearer a nested gap goes to the gap, not the column band", () => {
        // nested append line ~x=191, column boundary line x=200: at x=185 the gap is nearer
        expect(targetAt(art(), regions(), 185, 100)).toEqual({
            section: "s1",
            op: "insert",
            path: [0],
            index: 2,
            before: false,
            direction: "row",
        });
    });

    it("at the boundary itself, the near-tie still falls to the column class", () => {
        expect(targetAt(art(), regions(), 198, 100)?.op).toBe("column");
    });
});

describe("slot resolution — wrap beside a nested col member", () => {
    // a two-column root; the first column stacks a and b, so each member's vertical edges take a
    // beside-drop that wraps member and payload into a row
    const art = (): ArtifactContent =>
        artifactOf([sectionOf(rowGroup([colGroup([txt("a"), txt("b")]), txt("c")]))]);
    const regions = (): Region[] => [
        reg("section:s1", 0, 0, 400, 200),
        reg("el:s1", 20, 20, 360, 160),
        reg("el:s1:0", 20, 20, 170, 160),
        reg("el:s1:0.0", 20, 20, 170, 70),
        reg("el:s1:0.1", 20, 110, 170, 70),
        reg("el:s1:1", 210, 20, 170, 160),
    ];

    it("a beside-drop on a nested member resolves to its wrap strip", () => {
        expect(targetAt(art(), regions(), 188, 50)).toEqual({
            section: "s1",
            op: "wrap",
            path: [0, 0],
            index: 0,
            before: false,
            direction: "row",
        });
    });

    it("the drop makes the row, member first, payload beside it", () => {
        const t = targetAt(art(), regions(), 188, 50)!;
        const res = applyDrop(art(), t, NEW);
        const wrapped = getElementAt(res.content, { section: "s1", path: [0, 0] })!;
        expect(collectTexts(wrapped)).toEqual(["a", "New text"]);
        expect(res.address).toEqual({ section: "s1", path: [0, 0, 1] });
    });

    it("at the column boundary itself the column class still takes it", () => {
        // member a's left edge x=20 IS the root's first column boundary
        expect(targetAt(art(), regions(), 22, 50)?.op).toBe("column");
    });

    it("a unit's items never grow wrap strips; the unit itself does", () => {
        const withList = artifactOf([
            sectionOf(
                rowGroup([
                    colGroup([
                        { type: "bullets", data: { children: [txt("one"), txt("two")] } },
                        txt("b"),
                    ]),
                    txt("c"),
                ]),
            ),
        ]);
        const listRegions = [
            ...regions(),
            reg("el:s1:0.0.0", 24, 24, 160, 30),
            reg("el:s1:0.0.1", 24, 58, 160, 30),
        ];
        // the bullets unit's own left edge wraps (path depth 2); an item's edge never does
        const onUnit = targetAt(withList, listRegions, 22, 40);
        expect(onUnit?.op === "wrap" ? onUnit.path.length : null).not.toBe(3);
        const t = targetAt(withList, listRegions, 188, 40);
        expect(t).toMatchObject({ op: "wrap", path: [0, 0] });
    });
});

describe("classification — priority and hysteresis", () => {
    it("the column band outranks element gaps under the same point", () => {
        // x=200 sits in the column band AND the root row's gap-1 hitbox
        expect(targetAt(rowArt(), rowRegions(), 200, 100)?.op).toBe("column");
    });

    it("the current target holds within the hysteresis margin across a boundary", () => {
        const at1 = classifyDrop(nestedArt(), nestedRegions(), NEW, 110, 60, null)!;
        expect(at1.target.index).toBe(1); // just past the first midpoint (105)
        // nudge back 3px across the midpoint: without hysteresis this would flip to 0
        const held = classifyDrop(nestedArt(), nestedRegions(), NEW, 102, 60, at1.target)!;
        expect(held.target.index).toBe(1);
        const fresh = classifyDrop(nestedArt(), nestedRegions(), NEW, 102, 60, null)!;
        expect(fresh.target.index).toBe(0);
    });
});

describe("classified indicators — geometry the overlay draws", () => {
    const hitAt = (
        art: ArtifactContent,
        regions: Region[],
        px: number,
        py: number,
    ): ReturnType<typeof classifyDrop> => classifyDrop(art, regions, NEW, px, py, null);

    it("row gaps get vertical lines, section gaps horizontal ones", () => {
        const rowGap = hitAt(nestedArt(), nestedRegions(), 250, 60)!;
        expect(rowGap.target).toMatchObject({ op: "insert", index: 1 });
        expect(rowGap.indicator).toMatchObject({ kind: "line", axis: "v" });
        for (const py of [-20, 150, 320]) {
            const gap = hitAt(twoSections(), sectionRegions(), 200, py)!;
            expect(gap.target.op, `y=${py}`).toBe("newSection");
            expect(gap.indicator).toMatchObject({ kind: "line", axis: "h" });
        }
    });

    it("an empty region advertises itself as a region highlight", () => {
        const art = artifactOf([
            sectionOf(
                { type: "container", data: { direction: "col", children: [] } },
                { id: "s1" },
            ),
        ]);
        const regions = [reg("section:s1", 0, 0, 400, 200), reg("el:s1", 20, 20, 360, 160)];
        const replace = hitAt(art, regions, 100, 100)!;
        expect(replace.target.op).toBe("replace");
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
        expect(getElementAt(content, { section: "s1", path: [] })?.type).toBe("container");
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
                    type: "container",
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

    it("no point over the diagram classifies into its interior", () => {
        for (let px = 10; px < 300; px += 40)
            for (let py = 10; py < 300; py += 40) {
                const t = targetAt(diagramArt(), regionsOf(), px, py);
                if (!t) continue;
                expect(t.path.length <= 1, `${px},${py}`).toBe(true);
                expect(t.op === "replace" && t.path.length > 0, `${px},${py}`).toBe(false);
            }
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

    it("a closed container's child is not movable; open-container children are", () => {
        const art = diagramArt();
        expect(movable(art, { section: "s1", path: [0, 0] })).toBe(false);
        expect(movable(art, { section: "s1", path: [0] })).toBe(true); // the diagram itself
        expect(movable(art, { section: "s1", path: [1] })).toBe(true); // group child
        expect(movable(art, { section: "s1", path: [] })).toBe(true); // the root
    });

    it("smart blocks and callouts are units; the freeform card stays open", () => {
        const artFor = (root: ElementInstance): ArtifactContent => artifactOf([sectionOf(root)]);
        for (const type of ["callout", "testimonial", "feature", "pricing", "cta", "faq"]) {
            const art = artFor(inst(type, { children: [txt("inside")] }));
            expect(movable(art, { section: "s1", path: [0] }), type).toBe(false);
        }
        const card = artFor(inst("card", { children: [txt("inside")] }));
        expect(movable(card, { section: "s1", path: [0] })).toBe(true);
    });

    it("movableAncestor hoists structural anchors out of the closed container", () => {
        const art = diagramArt();
        expect(movableAncestor(art, { section: "s1", path: [0, 3] })).toEqual({
            section: "s1",
            path: [0],
        });
        expect(movableAncestor(art, { section: "s1", path: [1] })).toEqual({
            section: "s1",
            path: [1],
        });
    });
});

// A block drag reorders inside its own parent and nowhere else, so the slot set is that parent's
// gaps minus the ones that would put the block back where it already is.
describe("previewFor — the parting preview is the drop's own path", () => {
    const target = (index: number): DropTarget => ({
        section: "s1",
        op: "insert",
        path: [],
        index,
        before: false,
        direction: "row",
    });

    it("builds the post-drop tree without touching the base, sharing identity off the path", () => {
        const art = twoSections();
        const p = previewFor(art, { ...target(1), section: "s1" }, NEW)!;
        expect(p).not.toBeNull();
        expect(art.sections[0]!.root.type).toBe("text"); // base untouched
        expect(p.sections[1]).toBe(art.sections[1]); // untouched section is the same object
        expect(p.sections[0]).not.toBe(art.sections[0]);
    });

    it("a move preview closes the source hole and lands the real content at the slot", () => {
        const art = rowArt();
        const p = previewFor(
            art,
            { section: "s1", op: "insert", path: [], index: 2, before: false, direction: "row" },
            { kind: "move", from: { section: "s1", path: [0] } },
        )!;
        const texts = collectTexts(p.sections[0]!.root);
        expect(texts).toEqual(["b", "a"]);
        expect(p.at).toEqual({ section: "s1", path: [1] });
    });

    it("section payloads and new-section targets stay frozen: no preview", () => {
        const art = twoSections();
        expect(previewFor(art, target(1), { kind: "section", id: "s1" })).toBeNull();
        expect(
            previewFor(
                art,
                {
                    section: "s1",
                    op: "newSection",
                    path: [],
                    index: 1,
                    before: false,
                    direction: "col",
                },
                NEW,
            ),
        ).toBeNull();
    });
});

describe("compensatePoint — aiming through the parting, per axis", () => {
    const shifts = [
        // content below an opened 40px gap: visually at y 140.., frozen 40 higher
        { box: { x: 0, y: 140, w: 400, h: 200 }, dx: 0, dy: -40 },
        // a row sibling pushed 60px right by a horizontal parting
        { box: { x: 260, y: 20, w: 120, h: 100 }, dx: -60, dy: 0 },
    ];

    it("above and outside every shifted box, the point passes through unchanged", () => {
        expect(compensatePoint(200, 100, shifts)).toEqual([200, 100]);
        expect(compensatePoint(200, 100, [])).toEqual([200, 100]);
    });

    it("below the gap the point maps back up by the ghost extent", () => {
        expect(compensatePoint(200, 200, shifts)).toEqual([200, 160]);
    });

    it("x compensates the same way: a pointer over the pushed row sibling maps back left", () => {
        expect(compensatePoint(300, 60, shifts)).toEqual([240, 60]);
    });

    it("the topmost painted shift wins where boxes overlap", () => {
        const stacked = [
            { box: { x: 0, y: 0, w: 100, h: 100 }, dx: 0, dy: -10 },
            { box: { x: 0, y: 0, w: 100, h: 100 }, dx: 0, dy: -30 },
        ];
        expect(compensatePoint(50, 50, stacked)).toEqual([50, 20]);
    });

    it("no-flap: the slot whose parting is showing is the slot the parted pointer resolves to", () => {
        // nested fixture: active gap at index 1 (midpoints 105/295); the parting pushed content
        // right of the gap 40px further right, so the pointer rides at visual x 130
        const active = classifyDrop(nestedArt(), nestedRegions(), NEW, 110, 60, null)!;
        expect(active.target.index).toBe(1);
        const parted = [{ box: { x: 145, y: 20, w: 235, h: 100 }, dx: -40, dy: 0 }];
        const [cx, cy] = compensatePoint(150, 60, parted);
        expect(
            classifyDrop(nestedArt(), nestedRegions(), NEW, cx, cy, active.target)!.target.index,
        ).toBe(1);
    });
});

describe("moveMany — beyond the parent", () => {
    const art = (): ArtifactContent =>
        artifactOf([
            sectionOf(rowGroup([txt("a"), txt("b")]), { id: "s1" }),
            sectionOf(colGroup([txt("x"), txt("y")]), { id: "s2" }),
        ]);
    const regions = (): Region[] => [
        reg("section:s1", 0, 0, 400, 200),
        reg("el:s1", 20, 20, 360, 160),
        reg("el:s1:0", 20, 20, 170, 160),
        reg("el:s1:1", 210, 20, 170, 160),
        reg("section:s2", 0, 240, 400, 300),
        reg("el:s2", 20, 260, 360, 260),
        reg("el:s2:0", 20, 260, 360, 120),
        reg("el:s2:1", 20, 400, 360, 120),
    ];
    const block: DragPayload = {
        kind: "moveMany",
        parent: { section: "s1", path: [] },
        indices: [0, 1],
    };

    it("classifies a foreign container's gap like any drag", () => {
        expect(targetAt(art(), regions(), 200, 395, block)).toMatchObject({
            section: "s2",
            op: "insert",
            path: [],
            index: 1,
        });
    });

    it("lands the members in order; the emptied source keeps its section as a placeholder", () => {
        const t: DropTarget = {
            section: "s2",
            op: "insert",
            path: [],
            index: 1,
            before: false,
            direction: "col",
        };
        const res = applyDrop(art(), t, block);
        expect(collectTexts(res.content.sections[1]!.root)).toEqual(["x", "a", "b", "y"]);
        expect(res.address).toEqual({ section: "s2", path: [1] });
        expect(collectTexts(res.content.sections[0]!.root)).toEqual([]);
    });

    it("a new-section band takes the block as one fresh section, source axis kept", () => {
        const t: DropTarget = {
            section: "s2",
            op: "newSection",
            path: [],
            index: 2,
            before: false,
            direction: "col",
        };
        const res = applyDrop(art(), t, block);
        expect(res.content.sections).toHaveLength(3);
        expect(collectTexts(res.content.sections[2]!.root)).toEqual(["a", "b"]);
    });
});

describe("movePayloadFor — the one precedence rule for a body grab", () => {
    const listArt = (): ArtifactContent =>
        artifactOf([
            sectionOf(
                colGroup([
                    { type: "bullets", data: { children: [txt("one"), txt("two")] } },
                    { type: "bullets", data: { children: [txt("three")] } },
                ]),
            ),
        ]);

    it("a multi-selection the grip belongs to drags as its block, set kept", () => {
        const d = movePayloadFor(listArt(), { section: "s1", path: [0, 0] }, [
            { section: "s1", path: [0] },
            { section: "s1", path: [1] },
        ]);
        expect(d.payload).toMatchObject({ kind: "moveMany", indices: [0, 1] });
        expect(d.clear).toBe(false);
    });

    it("a lone grab inside a unit still reorders the item", () => {
        const d = movePayloadFor(listArt(), { section: "s1", path: [0, 0] }, [
            { section: "s1", path: [0] },
        ]);
        expect(d.payload).toEqual({ kind: "move", from: { section: "s1", path: [0, 0] } });
        expect(d.clear).toBe(true);
    });

    it("a grab outside the set falls back to the ordinary single-drag rules", () => {
        // inside a foreign unit: the item reorder, exactly as a lone grab gets
        const d = movePayloadFor(listArt(), { section: "s1", path: [1, 0] }, [
            { section: "s1", path: [0] },
        ]);
        expect(d.payload).toEqual({ kind: "move", from: { section: "s1", path: [1, 0] } });
        expect(d.clear).toBe(true);
    });
});

describe("moveMany", () => {
    const blockArt = (): ArtifactContent =>
        artifactOf([sectionOf(colGroup([txt("a"), txt("b"), txt("c"), txt("d")]))]);
    const blockRegions = (): Region[] => [
        reg("section:s1", 0, 0, 400, 400),
        reg("el:s1", 0, 0, 400, 400),
        reg("el:s1:0", 20, 0, 360, 100),
        reg("el:s1:1", 20, 100, 360, 100),
        reg("el:s1:2", 20, 200, 360, 100),
        reg("el:s1:3", 20, 300, 360, 100),
    ];
    const root = { section: "s1", path: [] };
    const payload = (indices: number[]): DragPayload => ({
        kind: "moveMany",
        parent: root,
        indices,
    });

    it("classifies only against the shared parent's gaps", () => {
        // a contiguous block's own zone claims nothing; past it the parent's real gaps remain
        const t = targetAt(blockArt(), blockRegions(), 60, 250, payload([0, 1]));
        expect(t).toMatchObject({ op: "insert", path: [], index: 3 });
        expect(targetAt(blockArt(), blockRegions(), 60, 380, payload([0, 1]))?.index).toBe(4);
        expect(targetAt(blockArt(), blockRegions(), 60, 80, payload([0, 1]))).toBeNull();
    });

    it("keeps every gap for a block that is not contiguous, since each one is a real move", () => {
        expect(targetAt(blockArt(), blockRegions(), 60, 30, payload([0, 2]))?.index).toBe(0);
        expect(targetAt(blockArt(), blockRegions(), 60, 130, payload([0, 2]))?.index).toBe(1);
        expect(targetAt(blockArt(), blockRegions(), 60, 380, payload([0, 2]))?.index).toBe(4);
    });

    it("lands the block together, shifting the gap past the sources removed before it", () => {
        const art = blockArt();
        const target: DropTarget = {
            section: "s1",
            op: "insert",
            path: [],
            index: 3,
            before: false,
            direction: "col",
        };
        const res = applyDrop(art, target, payload([0, 1]));
        expect(collectTexts(res.content.sections[0]!.root)).toEqual(["c", "a", "b", "d"]);
        expect(res.address).toEqual({ section: "s1", path: [1] });
    });

    // flipped by design (2026-09-06): a block drags anywhere a single element can; the old
    // "refuses a target outside its own parent" confinement is the U10 residue this closes
    it("takes a column target, grouped by the source axis, index re-aimed past the lift", () => {
        const art = blockArt();
        const elsewhere: DropTarget = {
            section: "s1",
            op: "column",
            path: [],
            index: 0,
            before: false,
            direction: "row",
        };
        const res = applyDrop(art, elsewhere, payload([0, 1]));
        expect(collectTexts(res.content.sections[0]!.root)).toEqual(["a", "b", "c", "d"]);
        // the block rides in as one col group forming the new first column
        const first = getElementAt(res.content, { section: "s1", path: [0] })!;
        expect(collectTexts(first)).toEqual(["a", "b"]);
        expect(res.address).toEqual({ section: "s1", path: [0] });
    });

    it("a wrap on a later sibling re-aims the path across the lifted members", () => {
        const art = blockArt();
        // wrap onto d (frozen path [3]); after lifting [0,1] it lives at [1]
        const onD: DropTarget = {
            section: "s1",
            op: "wrap",
            path: [3],
            index: 0,
            before: false,
            direction: "col",
        };
        const res = applyDrop(art, onD, payload([0, 1]));
        expect(collectTexts(res.content.sections[0]!.root)).toEqual(["c", "d", "a", "b"]);
        const wrapped = getElementAt(res.content, { section: "s1", path: [1] })!;
        expect(collectTexts(wrapped)).toEqual(["d", "a", "b"]);
    });

    it("refuses only a target inside a dragged member", () => {
        const art = blockArt();
        const inside: DropTarget = {
            section: "s1",
            op: "wrap",
            path: [0],
            index: 0,
            before: false,
            direction: "row",
        };
        expect(applyDrop(art, inside, payload([0, 1])).content).toBe(art);
    });

    it("moveManyPayload gates on the grip being a member of one co-parented set", () => {
        const co = [
            { section: "s1", path: [0] },
            { section: "s1", path: [1] },
        ];
        expect(moveManyPayload(co[0]!, co)).toEqual({
            kind: "moveMany",
            parent: root,
            indices: [0, 1],
        });
        expect(moveManyPayload({ section: "s1", path: [2] }, co)).toBeNull();
        expect(moveManyPayload(co[0]!, [co[0]!])).toBeNull();
        expect(moveManyPayload(co[0]!, [co[0]!, { section: "s1", path: [1, 0] }])).toBeNull();
    });
});

// A popup's panel floats over the canvas, so the popup's own region is its trigger and the box its
// children occupy is published separately. Slots have to follow the children.
describe("a container whose children paint outside its own box", () => {
    const popupArt = (): ArtifactContent =>
        artifactOf([
            sectionOf(
                colGroup([
                    txt("in flow"),
                    inst("popup", {
                        label: "More",
                        open: true,
                        children: [txt("one"), txt("two")],
                    }),
                ]),
            ),
        ]);
    // trigger at the top, panel floating well below it
    const popupRegions = (): Region[] => [
        reg("section:s1", 0, 0, 400, 400),
        reg("el:s1", 0, 0, 400, 120),
        reg("el:s1:0", 20, 20, 360, 40),
        reg("el:s1:1", 20, 70, 90, 38),
        reg("content:s1:1", 20, 116, 260, 100),
        reg("el:s1:1.0", 34, 130, 232, 30),
        reg("el:s1:1.1", 34, 172, 232, 30),
    ];

    it("drops between the panel's children rather than around the trigger", () => {
        const target = targetAt(popupArt(), popupRegions(), 150, 168);
        expect(target).toEqual({
            section: "s1",
            op: "insert",
            path: [1],
            index: 1,
            before: false,
            direction: "col",
        });
    });

    it("still lands a drop on the trigger's own row in the section, not in the panel", () => {
        expect(targetAt(popupArt(), popupRegions(), 200, 40)?.path).toEqual([]);
    });

    it("moves a panel child out into the section", () => {
        const art = popupArt();
        const from = { section: "s1", path: [1, 0] };
        const target = targetAt(art, popupRegions(), 60, 25, { kind: "move", from });
        expect(target).not.toBeNull();
        const out = applyDrop(art, target!, { kind: "move", from });
        expect(collectTexts(out.content.sections[0]!.root)).toEqual(["one", "in flow", "two"]);
    });
});

describe("pinned siblings", () => {
    // root col: [flow "a", pinned badge, flow "b"]; the badge floats top-right, out of flow order
    const pinnedArt = (): ArtifactContent =>
        artifactOf([
            sectionOf(
                colGroup([
                    txt("a"),
                    {
                        ...txt("badge"),
                        layout: { width: "fit", pin: { x: "end", y: "start" } },
                    },
                    txt("b"),
                ]),
            ),
        ]);
    const pinnedRegions = (): Region[] => [
        reg("section:s1", 0, 0, 200, 200),
        reg("el:s1", 0, 0, 200, 200),
        reg("el:s1:0", 0, 0, 200, 40),
        reg("el:s1:1", 160, 0, 40, 20), // the pinned badge, overlapping "a"
        reg("el:s1:2", 0, 60, 200, 40),
    ];

    it("gap slots skip a pinned sibling's box and keep real array indices", () => {
        const t = targetAt(pinnedArt(), pinnedRegions(), 60, 50); // between "a" and "b"
        expect(t).toMatchObject({ op: "insert", path: [], index: 2 }); // before "b" at its array index
    });

    it("a drop below the last flow child appends at the full child count", () => {
        const t = targetAt(pinnedArt(), pinnedRegions(), 60, 95);
        expect(t).toMatchObject({ op: "insert", path: [], index: 3 });
    });

    it("a container of only pinned children is one droppable append region", () => {
        const art = artifactOf([
            sectionOf(
                colGroup([
                    txt("a"),
                    colGroup([
                        { ...txt("badge"), layout: { width: "fit", pin: { x: "end", y: "end" } } },
                    ]),
                ]),
            ),
        ]);
        const regions = [
            reg("section:s1", 0, 0, 200, 200),
            reg("el:s1", 0, 0, 200, 200),
            reg("el:s1:0", 0, 0, 200, 40),
            reg("el:s1:1", 0, 50, 200, 90),
            reg("el:s1:1.0", 160, 120, 40, 20),
        ];
        const t = targetAt(art, regions, 60, 95);
        expect(t).toMatchObject({ op: "insert", path: [1], index: 1 });
    });
});

describe("unit item reorder", () => {
    // a bullets unit with three items; items reorder inside it and nowhere else
    const bulletsArt = (): ArtifactContent =>
        artifactOf([
            sectionOf(
                colGroup([
                    {
                        type: "bullets",
                        data: { children: [txt("one"), txt("two"), txt("three")] },
                    },
                    txt("after the list"), // a sibling, so the root never collapses into the unit
                ]),
            ),
        ]);
    const regions = (): Region[] => [
        reg("section:s1", 0, 0, 400, 300),
        reg("el:s1", 0, 0, 400, 300),
        reg("el:s1:0", 0, 0, 400, 150),
        reg("el:s1:0.0", 20, 10, 380, 30),
        reg("el:s1:0.1", 20, 50, 380, 30),
        reg("el:s1:0.2", 20, 90, 380, 30),
    ];
    const movePayload = (i: number): DragPayload => ({
        kind: "move",
        from: { section: "s1", path: [0, i] },
    });

    it("an item's drag sees only its own list's gaps", () => {
        const t = targetAt(bulletsArt(), regions(), 200, 75, movePayload(0));
        expect(t).toMatchObject({ op: "insert", path: [0] });
        // outside the unit, the item's drag classifies to nothing at all
        expect(targetAt(bulletsArt(), regions(), 200, 250, movePayload(0))).toBeNull();
    });

    it("dropping between the later items reorders the list", () => {
        const t = targetAt(bulletsArt(), regions(), 200, 75, movePayload(0));
        expect(t).toMatchObject({ op: "insert", path: [0], index: 2 });
        const res = applyDrop(bulletsArt(), t!, movePayload(0));
        const list = getElementAt(res.content, { section: "s1", path: [0] });
        expect(collectTexts(list)).toEqual(["two", "one", "three"]);
    });

    it("a foreign drag still finds no target inside the unit", () => {
        for (const [px, py] of [
            [200, 25],
            [200, 45],
            [200, 75],
            [200, 105],
        ] as const) {
            const t = targetAt(bulletsArt(), regions(), px, py);
            expect(t, `${px},${py}`).not.toBeNull();
            expect(t!.path.length <= 1, `${px},${py}`).toBe(true);
        }
    });
});
