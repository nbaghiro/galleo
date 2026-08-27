import { describe, it } from "vitest";
import type { EngineNode } from "@engine/node";
import { boxOf, near, runLayout, textNode } from "@canvas/testkit";

// testkit metrics: ascent = size·0.8, descent = size·0.2; lh 16 ⇒ baseline (16−size)/2 + size·0.8
const bl = (size: number, lh = 16): number => (lh - size) / 2 + size * 0.8;

const rowOf = (children: EngineNode[], extra?: Partial<EngineNode>): EngineNode => ({
    w: { mode: "fixed", value: 400 },
    h: { mode: "fit" },
    direction: "row",
    alignY: "baseline",
    children,
    ...extra,
});

describe("baseline alignment", () => {
    it("two texts of different sizes meet at the deeper first baseline", () => {
        const big = textNode("big", {
            id: "big",
            text: { text: "big", fontId: "f", size: 30, lineHeight: 40, wrap: "words" },
        });
        const small = textNode("small", { id: "small" });
        const { regions } = runLayout(rowOf([big, small]), 400, 200);
        const bb = boxOf(regions, "big");
        const sb = boxOf(regions, "small");
        near(bb.y + bl(30, 40), sb.y + bl(12, 16), 0.01);
    });

    it("a nested column answers with its first child's baseline through its padding", () => {
        const inner = textNode("x", { id: "inner" });
        const col: EngineNode = {
            id: "col",
            w: { mode: "fit" },
            h: { mode: "fit" },
            direction: "col",
            padding: { top: 10, right: 0, bottom: 0, left: 0 },
            children: [inner],
        };
        const big = textNode("big", {
            id: "big",
            text: { text: "big", fontId: "f", size: 30, lineHeight: 40, wrap: "words" },
        });
        const { regions } = runLayout(rowOf([big, col]), 400, 200);
        near(boxOf(regions, "big").y + bl(30, 40), boxOf(regions, "inner").y + bl(12, 16), 0.01);
    });

    it("a child with no text sits its box bottom on the shared baseline", () => {
        const big = textNode("big", {
            id: "big",
            text: { text: "big", fontId: "f", size: 30, lineHeight: 40, wrap: "words" },
        });
        const box: EngineNode = {
            id: "b",
            w: { mode: "fixed", value: 20 },
            h: { mode: "fixed", value: 8 },
            fill: { color: "#000" },
        };
        const { regions } = runLayout(rowOf([big, box]), 400, 200);
        const bb = boxOf(regions, "b");
        near(bb.y + bb.h, boxOf(regions, "big").y + bl(30, 40), 0.01);
    });

    it("alignSelf baseline opts one child in while siblings keep the row's alignment", () => {
        const a = textNode("aaa", { id: "a", alignSelf: "baseline" });
        const b = textNode("bbb", { id: "b", h: { mode: "fit" } });
        const big = textNode("big", {
            id: "big",
            alignSelf: "baseline",
            text: { text: "big", fontId: "f", size: 30, lineHeight: 40, wrap: "words" },
        });
        const { regions } = runLayout(
            rowOf([big, a, b], { alignY: "center", h: { mode: "fixed", value: 100 } }),
            400,
            200,
        );
        near(boxOf(regions, "a").y + bl(12, 16), boxOf(regions, "big").y + bl(30, 40), 0.01);
        near(boxOf(regions, "b").y, (100 - 16) / 2, 1); // centered, untouched by the baseline pair
    });
});
