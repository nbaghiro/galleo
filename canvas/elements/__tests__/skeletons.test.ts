import { describe, expect, it } from "vitest";
import type { EngineNode } from "@engine/node";
import {
    bandsSkel,
    barsSkel,
    boxesSkel,
    discSkel,
    dotsSkel,
    gridSkel,
    treeSkel,
    twinDiscSkel,
} from "@elements/skeletons";

const kids = (n: EngineNode): EngineNode[] => n.children ?? [];

describe("skeleton builders", () => {
    it("barsSkel is a bottom-aligned row, one bar per height", () => {
        const s = barsSkel([10, 20, 30]);
        expect(s.direction).toBe("row");
        expect(s.alignY).toBe("end");
        expect(kids(s)).toHaveLength(3);
        expect(kids(s)[0]!.h).toEqual({ mode: "fixed", value: 10 });
    });
    it("discSkel is a single centered disc", () => {
        expect(kids(discSkel())).toHaveLength(1);
    });
    it("twinDiscSkel is two discs", () => {
        expect(kids(twinDiscSkel())).toHaveLength(2);
    });
    it("dotsSkel is three rows of scattered dots", () => {
        expect(kids(dotsSkel()).map((r) => kids(r).length)).toEqual([3, 4, 2]);
    });
    it("bandsSkel is one centered band per width fraction", () => {
        const s = bandsSkel([1, 0.6, 0.3]);
        expect(kids(s)).toHaveLength(3);
        expect(kids(s)[1]!.w).toEqual({ mode: "percent", value: 0.6 });
    });
    it("boxesSkel is a row of n boxes", () => {
        expect(kids(boxesSkel(4))).toHaveLength(4);
    });
    it("gridSkel is rows × cols cells", () => {
        const g = gridSkel(2, 3);
        expect(kids(g)).toHaveLength(2);
        expect(kids(kids(g)[0]!)).toHaveLength(3);
    });
    it("treeSkel is a node over a row of three children", () => {
        const t = treeSkel();
        expect(kids(t)).toHaveLength(2);
        expect(kids(kids(t)[1]!)).toHaveLength(3);
    });
});
