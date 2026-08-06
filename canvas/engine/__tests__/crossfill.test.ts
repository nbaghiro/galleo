import { describe, expect, it } from "vitest";
import { fit, fixed, grow } from "@model/geometry";
import type { EngineNode } from "@engine/node";
import { layout } from "@engine/layout";
import { measure } from "../../testkit";

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
