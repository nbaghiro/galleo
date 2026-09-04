import { describe, expect, it } from "vitest";
import { fit, fixed, grow } from "@model/geometry";
import type { EngineNode } from "@engine/node";
import { layout } from "@engine/layout";
import { measure } from "@canvas/testkit";

// sections are solved against an "unbounded" sentinel height, which is what makes the fit-column
// case below load-bearing rather than theoretical
const UNBOUNDED = 100_000;

const heightOf = (root: EngineNode, id: string): number | undefined =>
    layout(root, { x: 0, y: 0, w: 1000, h: UNBOUNDED }, measure).regions.find((r) => r.id === id)
        ?.box.h;

const row = (child: EngineNode, siblings: EngineNode[] = []): EngineNode => ({
    w: grow(),
    h: fit(),
    direction: "row",
    children: [...siblings, child],
});

const column = (child: EngineNode, siblings: EngineNode[] = []): EngineNode => ({
    w: grow(),
    h: fit(),
    direction: "col",
    children: [...siblings, child],
});

describe("a visual element in a row", () => {
    const visual = { w: grow(), h: grow(260), id: "visual" };

    it("fills the row's cross height instead of leaving a gap under itself", () => {
        expect(heightOf(row(visual, [{ w: grow(), h: fixed(400) }]), "visual")).toBe(400);
    });

    it("keeps its own height when it is the tallest thing there", () => {
        expect(heightOf(row(visual, [{ w: grow(), h: fixed(120) }]), "visual")).toBe(260);
    });

    it("keeps its own height when it stands alone", () => {
        expect(heightOf(row(visual), "visual")).toBe(260);
    });
});

describe("a grow child of a fit column", () => {
    const visual = { w: grow(), h: grow(260), id: "visual" };

    it("sits at its own height rather than swallowing the unbounded container", () => {
        expect(heightOf(column(visual), "visual")).toBe(260);
    });

    it("still does so once a row has stacked into a column on a narrow viewport", () => {
        expect(heightOf(column(visual, [{ w: grow(), h: fixed(400) }]), "visual")).toBe(260);
    });
});

describe("a grow child of a sized column", () => {
    it("takes the free space, which is what grow means when there is any", () => {
        const sized: EngineNode = {
            w: grow(),
            h: fixed(600),
            direction: "col",
            children: [
                { w: grow(), h: fixed(200) },
                { w: grow(), h: grow(100), id: "visual" },
            ],
        };
        expect(heightOf(sized, "visual")).toBe(400);
    });
});

// The comparison-panel shape: cards that equalize against each other, with no self-sized sibling
// to take the row's height from. Before the fit-first measure the row collapsed to zero and the
// overflow clip erased the cards' text (visible only through the inline editor's overlay).
describe("a fit row of only grow children", () => {
    const panel = (id: string, lines: string): EngineNode => ({
        w: grow(),
        h: grow(),
        id,
        direction: "col",
        padding: { top: 20, right: 20, bottom: 20, left: 20 },
        children: [
            {
                w: grow(),
                h: fit(),
                text: { text: lines, fontId: "f", size: 12, lineHeight: 16, wrap: "words" },
            },
        ],
    });

    it("takes its members' own measure instead of collapsing to zero", () => {
        const short = panel("short", "one line");
        const tall = panel(
            "tall",
            "enough words to wrap this text across several measured lines of the fake metrics",
        );
        const r: EngineNode = {
            w: grow(),
            h: fit(),
            direction: "row",
            gap: 16,
            children: [short, tall],
        };
        const { regions } = layout(r, { x: 0, y: 0, w: 600, h: UNBOUNDED }, measure);
        const hs = regions.find((x) => x.id === "short")!.box.h;
        const ht = regions.find((x) => x.id === "tall")!.box.h;
        expect(ht).toBeGreaterThan(40); // content plus padding, not zero
        expect(hs).toBe(ht); // the shorter card stretches to the taller one
    });

    it("still compresses to a self-sized sibling when the row has one", () => {
        const card = panel(
            "card",
            "enough words to wrap this text across several measured lines of the fake metrics",
        );
        const r: EngineNode = {
            w: grow(),
            h: fit(),
            direction: "row",
            children: [{ w: fixed(50), h: fixed(64) }, card],
        };
        expect(heightOf(r, "card")).toBe(64);
    });
});
