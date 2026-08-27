import { describe, expect, it } from "vitest";
import type { EngineNode, Region } from "@engine/node";
import { fit, fixed, grow } from "@model/geometry";
import { boxNode, boxOf, near, runLayout, textNode } from "@canvas/testkit";

// the testkit measurer is 8px/char and 16px/line; 4-char words so the real wrap can break
const cell = (id: string, chars: number, extra?: Partial<EngineNode>): EngineNode =>
    textNode(
        Array.from({ length: Math.ceil(chars / 4) }, () => "xxxx")
            .join(" ")
            .slice(0, chars)
            .replace(/ $/, "x"),
        { id, w: fit(), h: fit(), ...extra },
    );

const gridNode = (
    children: EngineNode[],
    columns: number,
    extra?: Partial<EngineNode>,
): EngineNode => ({
    w: fixed(200),
    h: fit(),
    direction: "grid",
    columns,
    children,
    ...extra,
});

const reg = (n: EngineNode, w = 200, h = 200): Region[] => runLayout(n, w, h).regions;

describe("grid — shared column tracks", () => {
    it("a column is as wide as its widest member, across every row", () => {
        // col 0: 4 and 2 chars → 32; col 1: 2 and 8 chars → 64
        const r = reg(gridNode([cell("a", 4), cell("b", 2), cell("c", 2), cell("d", 8)], 2));
        near(boxOf(r, "a").w, 32);
        near(boxOf(r, "c").w, 32);
        near(boxOf(r, "b").w, 64);
        near(boxOf(r, "d").w, 64);
    });

    it("every member of a column starts at the same x", () => {
        const r = reg(gridNode([cell("a", 4), cell("b", 2), cell("c", 2), cell("d", 8)], 2));
        near(boxOf(r, "a").x, 0);
        near(boxOf(r, "c").x, 0);
        near(boxOf(r, "b").x, 32);
        near(boxOf(r, "d").x, 32);
    });

    it("a fixed member pins its column, whatever the other rows hold", () => {
        const r = reg(
            gridNode(
                [boxNode("a", fixed(50), fixed(10)), cell("b", 2), cell("c", 20), cell("d", 2)],
                2,
            ),
        );
        near(boxOf(r, "a").w, 50);
        near(boxOf(r, "c").w, 50); // the 160px-wide text does not widen a pinned column
    });

    it("a grow member makes the column take the leftover width", () => {
        const r = reg(
            gridNode(
                [cell("a", 4), boxNode("b", grow(), fixed(10)), cell("c", 2), cell("d", 2)],
                2,
            ),
        );
        near(boxOf(r, "a").w, 32);
        near(boxOf(r, "b").w, 168);
    });

    it("two grow columns share the leftover above their content widths", () => {
        const r = reg(gridNode([cell("a", 4, { w: grow() }), cell("b", 10, { w: grow() })], 2));
        // bases 32 and 80, 88 left to split evenly
        near(boxOf(r, "a").w, 76);
        near(boxOf(r, "b").w, 124);
    });

    it("tracks wider than the grid shrink to their floors", () => {
        const r = reg(gridNode([cell("a", 30, { w: fit(40) }), cell("b", 5, { w: fit(40) })], 2));
        near(boxOf(r, "a").w, 160);
        near(boxOf(r, "b").w, 40);
    });

    it("row heights are independent: each row is its tallest member", () => {
        const r = reg(
            gridNode(
                [
                    boxNode("a", grow(), fixed(30)),
                    boxNode("b", grow(), fixed(10)),
                    boxNode("c", grow(), fixed(12)),
                    boxNode("d", grow(), fixed(12)),
                ],
                2,
            ),
        );
        near(boxOf(r, "a").h, 30);
        near(boxOf(r, "c").y, 30); // row 1 starts under row 0's tallest
        near(boxOf(r, "c").h, 12);
    });

    it("a grow-height member stretches to its own row, not to the tallest row", () => {
        const r = reg(
            gridNode(
                [
                    boxNode("a", grow(), fixed(30)),
                    boxNode("b", grow(), grow()),
                    boxNode("c", grow(), fixed(12)),
                    boxNode("d", grow(), grow()),
                ],
                2,
            ),
        );
        near(boxOf(r, "b").h, 30);
        near(boxOf(r, "d").h, 12);
    });

    it("a row of only grow-height members takes its height from their content", () => {
        const r = reg(
            gridNode([cell("a", 4, { w: fit(40), h: grow() }), cell("b", 40, { h: grow() })], 2),
        );
        near(boxOf(r, "b").w, 160); // the wide track shrinks to what the 40px floor leaves
        near(boxOf(r, "b").h, 32); // 320px of text over a 160px track = two lines
        near(boxOf(r, "a").h, 32); // the one-line cell stretches to its row
    });

    it("gap is the column gap and rowGap the row gap", () => {
        const g = gridNode(
            [
                boxNode("a", fixed(40), fixed(10)),
                boxNode("b", fixed(40), fixed(10)),
                boxNode("c", fixed(40), fixed(10)),
                boxNode("d", fixed(40), fixed(10)),
            ],
            2,
            { gap: 12, rowGap: 4 },
        );
        const r = reg(g);
        near(boxOf(r, "b").x, 52);
        near(boxOf(r, "c").y, 14);
    });

    it("rowGap falls back to gap", () => {
        const r = reg(
            gridNode(
                ["a", "b", "c", "d"].map((id) => boxNode(id, fixed(40), fixed(10))),
                2,
                { gap: 12 },
            ),
        );
        near(boxOf(r, "c").y, 22);
    });

    it("the grid's fit height is the rows plus the row gaps", () => {
        const g = gridNode(
            ["a", "b", "c", "d"].map((id) => boxNode(id, fixed(40), fixed(10))),
            2,
            { id: "g", gap: 12 },
        );
        near(boxOf(reg(g), "g").h, 32); // 10 + 12 + 10
    });

    it("one column degenerates to a stack", () => {
        const r = reg(
            gridNode([boxNode("a", grow(), fixed(10)), boxNode("b", grow(), fixed(10))], 1),
        );
        near(boxOf(r, "a").w, 200);
        near(boxOf(r, "b").y, 10);
    });

    it("a ragged last row leaves its missing cells empty", () => {
        const r = reg(gridNode([cell("a", 4), cell("b", 8), cell("c", 2)], 2));
        near(boxOf(r, "c").x, 0);
        near(boxOf(r, "c").y, 16);
        near(boxOf(r, "a").w, 32);
    });

    it("an empty grid lays out without a track", () => {
        const g = gridNode([], 3, { id: "g", h: fit() });
        expect(boxOf(reg(g), "g").h).toBe(0);
    });

    it("a float is excluded from the row-major fill", () => {
        const r = reg(
            gridNode(
                [
                    cell("a", 4),
                    boxNode("f", fixed(20), fixed(20), { float: { x: "end", y: "start" } }),
                    cell("b", 8),
                    cell("c", 2),
                    cell("d", 2),
                ],
                2,
            ),
        );
        near(boxOf(r, "b").x, 32); // still the second column, the float took no slot
        near(boxOf(r, "f").x, 180);
    });

    it("a fit-width grid measures the sum of its tracks", () => {
        const g = gridNode([cell("a", 4), cell("b", 8), cell("c", 2), cell("d", 2)], 2, {
            id: "g",
            w: fit(),
            gap: 10,
        });
        const host: EngineNode = { w: fixed(400), h: fit(), direction: "col", children: [g] };
        near(boxOf(reg(host, 400, 400), "g").w, 106); // 32 + 64 + one 10px gap
    });
});
