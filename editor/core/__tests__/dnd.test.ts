import "@elements/register";
import { describe, expect, it } from "vitest";
import type { Region } from "@engine/node";
import type { ArtifactContent, ElementInstance } from "@model/artifact";
import { colGroup, rowGroup } from "@model/artifact";
import { getElementAt } from "@elements/ops";
import { artifactOf, inst, sectionOf } from "@canvas/testkit";
import {
    applyDrop,
    gutterPills,
    slideAt,
    marqueeTargets,
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
): DropTarget | null => slideAt(art, regions, payload, px, py, null)?.target ?? null;

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

// retired (controlled-canvas round: the zone/claim classifier died; slideAt's two rules are pinned above)

// retired (controlled-canvas round: the zone/claim classifier died; slideAt's two rules are pinned above)

// retired (controlled-canvas round: the zone/claim classifier died; slideAt's two rules are pinned above)

// retired (controlled-canvas round: the zone/claim classifier died; slideAt's two rules are pinned above)

// retired (controlled-canvas round: the zone/claim classifier died; slideAt's two rules are pinned above)

// retired (controlled-canvas round: the zone/claim classifier died; slideAt's two rules are pinned above)

// retired (controlled-canvas round: the zone/claim classifier died; slideAt's two rules are pinned above)

// retired (controlled-canvas round: the zone/claim classifier died; slideAt's two rules are pinned above)

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

// retired (controlled-canvas round: the zone/claim classifier died; slideAt's two rules are pinned above)

// retired (controlled-canvas round: the zone/claim classifier died; slideAt's two rules are pinned above)

// retired (controlled-canvas round: the zone/claim classifier died; slideAt's two rules are pinned above)

// retired (controlled-canvas round: the zone/claim classifier died; slideAt's two rules are pinned above)

// retired (controlled-canvas round: the zone/claim classifier died; slideAt's two rules are pinned above)

// retired (controlled-canvas round: the zone/claim classifier died; slideAt's two rules are pinned above)

// retired (controlled-canvas round: the zone/claim classifier died; slideAt's two rules are pinned above)

// retired (controlled-canvas round: the zone/claim classifier died; slideAt's two rules are pinned above)

describe("applyDrop — lands the element and returns the landed address", () => {
    // re-aimed (wrap-scope round): a row member's body now means wrap-with-it, so the insert
    // is aimed at the gutter between the members, where reorder lives
    it("insert → the element lands at [...path, index]; later siblings shift", () => {
        const target = targetAt(nestedArt(), nestedRegions(), 200, 60)!;
        expect(target.op).toBe("insert");
        const { content, address } = applyDrop(nestedArt(), target, { kind: "new", type: "text" });
        expect(address).toEqual({ section: "s1", path: [0, 1] });
        expect(getElementAt(content, address!)?.type).toBe("text");
        expect(textOf(getElementAt(content, { section: "s1", path: [0, 2] }))).toBe("b");
    });

    it("wrap after → lands at [...path, 1], the original kept at [...path, 0]", () => {
        const target = targetAt(leafArt(), leafRegions(), 200, 130)!;
        const { content, address } = applyDrop(leafArt(), target, { kind: "new", type: "text" });
        expect(address).toEqual({ section: "s1", path: [1] });
        expect(getElementAt(content, { section: "s1", path: [] })?.type).toBe("container");
        expect(textOf(getElementAt(content, { section: "s1", path: [0] }))).toBe("root");
        expect(getElementAt(content, { section: "s1", path: [1] })?.type).toBe("text");
    });

    it("wrap before → lands at [...path, 0], the original pushed to [...path, 1]", () => {
        const target = targetAt(leafArt(), leafRegions(), 200, 70)!;
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
// retired (controlled-canvas round: the zone/claim classifier died; slideAt's two rules are pinned above)

// A block drag reorders inside its own parent and nowhere else, so the slot set is that parent's
// gaps minus the ones that would put the block back where it already is.
// retired (motion round machinery deleted with the honest-preview model)

// dnd-ux motion round: the previewFor pins retired with the per-slot honest preview (the whole
// document breathed while aiming); the drop's truth is the commit FLIP, and resolveDrop stays
// pinned through every applyDrop case above.

// retired (aim compensation died with the parting it compensated)

describe("wrap scopes — a leaf member is enterable, generically", () => {
    // the user's shape: a chart pulled out beside a caption whose column dissolved behind it;
    // the caption is a bare leaf in the row, and "under the caption" must exist again
    const rowShape = (): ArtifactContent =>
        artifactOf([
            sectionOf(
                rowGroup([txt("chart"), txt("caption"), colGroup([txt("head"), txt("body")])]),
            ),
        ]);
    const rowRegs = (): Region[] => [
        reg("section:s1", 0, 0, 900, 400),
        reg("el:s1", 20, 20, 860, 360),
        reg("el:s1:0", 20, 20, 200, 360),
        reg("el:s1:1", 260, 20, 200, 40),
        reg("el:s1:2", 500, 20, 380, 360),
        reg("el:s1:2.0", 500, 20, 380, 60),
        reg("el:s1:2.1", 500, 100, 380, 280),
    ];
    const moveChart: DragPayload = { kind: "move", from: { section: "s1", path: [0] } };

    it("the leaf's column strip claims a stack wrap, split at its box middle", () => {
        // (360, 300): x inside the caption's strip, y far below its short box
        expect(targetAt(rowShape(), rowRegs(), 360, 300, moveChart)).toEqual({
            section: "s1",
            op: "wrap",
            path: [1],
            index: 0,
            before: false,
            direction: "col",
        });
        expect(targetAt(rowShape(), rowRegs(), 360, 30, moveChart)?.before).toBe(true);
    });

    it("the drop lands the payload under the leaf, one clean stack", () => {
        const t = targetAt(rowShape(), rowRegs(), 360, 300, moveChart)!;
        const res = applyDrop(rowShape(), t, moveChart);
        const stack = getElementAt(res.content, { section: "s1", path: [0] })!;
        expect(collectTexts(stack)).toEqual(["caption", "chart"]);
        expect(collectTexts(res.content.sections[0]!.root)).toEqual([
            "caption",
            "chart",
            "head",
            "body",
        ]);
    });

    it("in a col, only the side edge bands claim; the middle still reorders", () => {
        const art = artifactOf([sectionOf(colGroup([txt("a"), txt("b"), txt("c")]))]);
        const regs = [
            reg("section:s1", 0, 0, 500, 500),
            reg("el:s1", 20, 20, 460, 460),
            reg("el:s1:0", 20, 20, 460, 120),
            reg("el:s1:1", 20, 180, 460, 120),
            reg("el:s1:2", 20, 340, 460, 120),
        ];
        const moveA: DragPayload = { kind: "move", from: { section: "s1", path: [0] } };
        // left edge band of b → side-by-side, payload leading
        expect(targetAt(art, regs, 30, 240, moveA)).toMatchObject({
            op: "wrap",
            path: [1],
            direction: "row",
            before: true,
        });
        // the middle of b keeps the parent's reorder quantization
        expect(targetAt(art, regs, 250, 250, moveA)).toMatchObject({
            op: "insert",
            path: [],
            index: 2,
        });
    });

    it("a sealed unit is wrapped around, never entered", () => {
        const art = artifactOf([
            sectionOf(
                rowGroup([
                    txt("x"),
                    { type: "bullets", data: { children: [txt("one"), txt("two")] } },
                ]),
            ),
        ]);
        const regs = [
            reg("section:s1", 0, 0, 800, 300),
            reg("el:s1", 20, 20, 760, 260),
            reg("el:s1:0", 20, 20, 300, 260),
            reg("el:s1:1", 360, 20, 420, 100),
            reg("el:s1:1.0", 360, 20, 420, 40),
            reg("el:s1:1.1", 360, 70, 420, 40),
        ];
        const moveX: DragPayload = { kind: "move", from: { section: "s1", path: [0] } };
        expect(targetAt(art, regs, 500, 200, moveX)).toMatchObject({
            op: "wrap",
            path: [1],
            direction: "col",
            before: false,
        });
    });

    it("the payload's own strip stays home", () => {
        const moveCaption: DragPayload = { kind: "move", from: { section: "s1", path: [1] } };
        expect(targetAt(rowShape(), rowRegs(), 360, 300, moveCaption)).toBeNull();
    });
});

describe("moveMany — beyond the parent", () => {
    const art = (): ArtifactContent =>
        artifactOf([
            sectionOf(rowGroup([txt("a"), txt("b")]), { id: "s1" }),
            sectionOf(colGroup([txt("x"), txt("y")]), { id: "s2" }),
        ]);
    const block: DragPayload = {
        kind: "moveMany",
        parent: { section: "s1", path: [] },
        indices: [0, 1],
    };

    // retired (slideAt stack/descent pins cover the classify half)

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
        const t = targetAt(blockArt(), blockRegions(), 180, 260, payload([0, 1]));
        expect(t).toMatchObject({ op: "insert", path: [], index: 3 });
        expect(targetAt(blockArt(), blockRegions(), 180, 380, payload([0, 1]))?.index).toBe(4);
        expect(targetAt(blockArt(), blockRegions(), 180, 80, payload([0, 1]))).toBeNull();
    });

    it("keeps every gap for a block that is not contiguous, since each one is a real move", () => {
        expect(targetAt(blockArt(), blockRegions(), 180, 30, payload([0, 2]))?.index).toBe(0);
        expect(targetAt(blockArt(), blockRegions(), 180, 130, payload([0, 2]))?.index).toBe(1);
        expect(targetAt(blockArt(), blockRegions(), 180, 380, payload([0, 2]))?.index).toBe(4);
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
// retired (controlled-canvas round: the zone/claim classifier died; slideAt's two rules are pinned above)

// retired (controlled-canvas round: the zone/claim classifier died; slideAt's two rules are pinned above)

// retired (controlled-canvas round: the zone/claim classifier died; slideAt's two rules are pinned above)

// The dnd-ux round's acceptance baseline: the audit fixture (a split section, image column
// beside a col of label/heading/body/card) swept at 2px steps while moving the body paragraph.
// The zone map IS the contract; the next redesign argues against these measured tables. Before
// the round the same sweeps gave 11 horizontal zones (three of them duplicate column meanings,
// one a 22px strip fight) and a 204px phantom new-column inside the source's own column.
// retired (the zone map is gone; the slide pins are the new baseline)

// ————— Model 1: the constrained slide (controlled-canvas round) —————
describe("slideAt — two rules: which box, which slot", () => {
    const movingA: DragPayload = { kind: "move", from: { section: "s1", path: [0] } };

    it("scopes to the payload's parent and quantizes 1-D along its axis", () => {
        // rowArt root row: past b's strip, in the right padding, the row's own end slot claims;
        // b's body itself is a wrap scope now (re-aimed in the wrap-scope round)
        const s = slideAt(rowArt(), rowRegions(), movingA, 390, 100, null)!;
        expect(s.scope).toEqual({ kind: "container", section: "s1", path: [] });
        expect(s.slot).toBe(2);
        expect(s.target).toMatchObject({ op: "insert", path: [], index: 2 });
        expect(s.receiver).toEqual({ x: 20, y: 20, w: 360, h: 160 });
        expect(slideAt(rowArt(), rowRegions(), movingA, 340, 100, null)?.target).toMatchObject({
            op: "wrap",
            path: [1],
        });
    });

    it("the source's own flanks are home", () => {
        const s = slideAt(rowArt(), rowRegions(), movingA, 60, 100, null)!;
        expect(s.target).toBeNull();
        expect(s.slot).toBe(0);
    });

    it("stays scoped within the promotion margin, promotes one level past it", () => {
        const art = nestedArt(); // root col over row([a, b])
        const inRow: DragPayload = { kind: "move", from: { section: "s1", path: [0, 0] } };
        // nested row box 20,20,360,100: 10px below stays scoped (within PROMOTE_PX)
        const prev = slideAt(art, nestedRegions(), inRow, 200, 60, null)!;
        expect(prev.scope).toMatchObject({ kind: "container", path: [0] });
        const held = slideAt(art, nestedRegions(), inRow, 200, 130, prev)!;
        expect(held.scope).toMatchObject({ kind: "container", path: [0] });
        // 40px below the row's box escapes to the root col
        const out = slideAt(art, nestedRegions(), inRow, 200, 162, held)!;
        expect(out.scope).toMatchObject({ kind: "container", path: [] });
        expect(out.target).toMatchObject({ op: "insert", path: [] });
    });

    it("entering an open container's box scopes into it", () => {
        const art = nestedArt();
        const fromRoot: DragPayload = { kind: "move", from: { section: "s1", path: [1] } };
        // pointer inside the nested row's box descends into it
        const s = slideAt(art, nestedRegions(), fromRoot, 200, 60, null)!;
        expect(s.scope).toMatchObject({ kind: "container", path: [0] });
        expect(s.target).toMatchObject({ op: "insert", path: [0], index: 1 });
    });

    it("a dragged section's own flanks are home: no target and no line to aim at", () => {
        const moveS1: DragPayload = { kind: "section", id: "s1" };
        // sectionRegions: s1 card 0..100, s2 card 200..300 — the gap between them flanks s1
        for (const py of [-30, 40, 150]) {
            const s = slideAt(twoSections(), sectionRegions(), moveS1, 200, py, null)!;
            expect(s.target, `py=${py}`).toBeNull();
            expect(s.line, `py=${py}`).toBeNull();
        }
        // past s2's midpoint the real move appears again, line and all
        const below = slideAt(twoSections(), sectionRegions(), moveS1, 200, 290, null)!;
        expect(below.target).toMatchObject({ op: "newSection", index: 2 });
        expect(below.line).not.toBeNull();
    });

    it("past the section card the scope is the stack, and its slots are section gaps", () => {
        const s = slideAt(twoSections(), sectionRegions(), movingA, 200, 150, null)!;
        expect(s.scope).toEqual({ kind: "stack" });
        expect(s.target).toMatchObject({ op: "newSection", index: 1 });
    });

    it("at the stack, entering another card scopes into that section's root", () => {
        const art = artifactOf([
            sectionOf(rowGroup([txt("a"), txt("b")]), { id: "s1" }),
            sectionOf(colGroup([txt("x"), txt("y")]), { id: "s2" }),
        ]);
        const regions: Region[] = [
            reg("section:s1", 0, 0, 400, 200),
            reg("el:s1", 20, 20, 360, 160),
            reg("el:s1:0", 20, 20, 170, 160),
            reg("el:s1:1", 210, 20, 170, 160),
            reg("section:s2", 0, 240, 400, 300),
            reg("el:s2", 20, 260, 360, 260),
            reg("el:s2:0", 20, 260, 360, 120),
            reg("el:s2:1", 20, 400, 360, 120),
        ];
        const s = slideAt(art, regions, movingA, 200, 420, null)!;
        expect(s.scope).toEqual({ kind: "container", section: "s2", path: [] });
        expect(s.target).toMatchObject({ op: "insert", path: [], index: 1 });
    });

    it("a unit's item slides inside its unit and never promotes", () => {
        const art = artifactOf([
            sectionOf(
                colGroup([
                    { type: "bullets", data: { children: [txt("one"), txt("two")] } },
                    txt("after"),
                ]),
            ),
        ]);
        const regions: Region[] = [
            reg("section:s1", 0, 0, 400, 300),
            reg("el:s1", 20, 20, 360, 260),
            reg("el:s1:0", 20, 20, 360, 120),
            reg("el:s1:0.0", 20, 20, 360, 50),
            reg("el:s1:0.1", 20, 80, 360, 50),
            reg("el:s1:1", 20, 160, 360, 100),
        ];
        const item: DragPayload = { kind: "move", from: { section: "s1", path: [0, 0] } };
        const inside = slideAt(art, regions, item, 200, 115, null)!;
        expect(inside.scope).toMatchObject({ kind: "container", path: [0] });
        expect(inside.target).toMatchObject({ op: "insert", path: [0], index: 2 });
        // far below the unit: still the unit, clamped to its last slot
        const below = slideAt(art, regions, item, 200, 280, inside)!;
        expect(below.scope).toMatchObject({ kind: "container", path: [0] });
    });

    it("a block slides with its contiguous span as home, like a single element", () => {
        const block: DragPayload = {
            kind: "moveMany",
            parent: { section: "s1", path: [] },
            indices: [0, 1],
        };
        const art = artifactOf([sectionOf(colGroup([txt("a"), txt("b"), txt("c"), txt("d")]))]);
        const regions: Region[] = [
            reg("section:s1", 0, 0, 400, 400),
            reg("el:s1", 0, 0, 400, 400),
            reg("el:s1:0", 20, 0, 360, 100),
            reg("el:s1:1", 20, 100, 360, 100),
            reg("el:s1:2", 20, 200, 360, 100),
            reg("el:s1:3", 20, 300, 360, 100),
        ];
        expect(slideAt(art, regions, block, 180, 80, null)!.target).toBeNull();
        expect(slideAt(art, regions, block, 180, 260, null)!.target).toMatchObject({
            op: "insert",
            index: 3,
        });
    });

    it("totality inside the scope: every pointer position is a slot or home", () => {
        for (let x = 24; x <= 376; x += 16)
            for (let y = 24; y <= 176; y += 16) {
                const s = slideAt(rowArt(), rowRegions(), movingA, x, y, null);
                expect(s, `${x},${y}`).not.toBeNull();
                expect(s!.slot).toBeGreaterThanOrEqual(0);
            }
    });
});

describe("gutterPills — the one structural affordance a drag renders", () => {
    it("a row root offers pills at its gutters and outer edges", () => {
        const pills = gutterPills(rowArt(), rowRegions(), "s1", { kind: "new", type: "text" });
        expect(pills.map((p) => p.target.index)).toEqual([0, 1, 2]);
        for (const p of pills) expect(p.target.op).toBe("column");
    });

    it("a leaf root offers only its two edges, and the source's flanks are suppressed", () => {
        const pills = gutterPills(leafArt(), leafRegions(), "s1", { kind: "new", type: "text" });
        expect(pills.map((p) => p.target.index)).toEqual([0, 1]);
        const moving = gutterPills(rowArt(), rowRegions(), "s1", {
            kind: "move",
            from: { section: "s1", path: [0] },
        });
        expect(moving.map((p) => p.target.index)).toEqual([2]);
    });
});
