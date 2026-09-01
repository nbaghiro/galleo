import { describe, it, expect } from "vitest";
import type { Beat } from "@model/ai";
import {
    blocksForLayout,
    withDerivedBlocks,
    buildCost,
    columnsFor,
    coverageMap,
    insertBeatAfter,
    makeBeat,
    moveBeat,
    newBeatId,
    pointFromQuestion,
    removeBeat,
    reorderBeat,
    updateBeat,
} from "@app/stores/generate-plan";

const beats: Beat[] = [
    { id: "s1", label: "Cover", role: "scene", covers: ["the team"] },
    { id: "s2", label: "Proof", role: "proof", image: true },
    { id: "s3", label: "Close", role: "close" },
];

describe("blocksForLayout", () => {
    it("resizes to the layout's column count, keeping what fits and padding with text", () => {
        expect(blocksForLayout("three-up", ["chart", "image"])).toEqual(["chart", "image", "text"]);
        expect(blocksForLayout("full", ["chart", "image"])).toEqual(["chart"]);
        expect(columnsFor("split-6040")).toBe(2);
    });
});

describe("beat list edits", () => {
    it("moves a beat by one step and clamps at the edges", () => {
        expect(moveBeat(beats, "s2", -1).map((b) => b.id)).toEqual(["s2", "s1", "s3"]);
        expect(moveBeat(beats, "s1", -1)).toBe(beats);
    });
    it("reorders a beat to an index", () => {
        expect(reorderBeat(beats, "s3", 0).map((b) => b.id)).toEqual(["s3", "s1", "s2"]);
    });
    it("removes and updates without touching ids", () => {
        expect(removeBeat(beats, "s2").map((b) => b.id)).toEqual(["s1", "s3"]);
        const renamed = updateBeat(beats, "s2", { label: "Numbers", id: "hacked" });
        expect(renamed[1]!.label).toBe("Numbers");
        expect(renamed[1]!.id).toBe("s2");
    });
    it("inserts after an anchor, at the front on null, and appends on unknown", () => {
        const b = makeBeat("s9");
        expect(insertBeatAfter(beats, "s1", b).map((x) => x.id)).toEqual(["s1", "s9", "s2", "s3"]);
        expect(insertBeatAfter(beats, null, b)[0]!.id).toBe("s9");
        expect(insertBeatAfter(beats, "nope", b).at(-1)!.id).toBe("s9");
    });
    it("mints a fresh non-colliding s<N> id", () => {
        expect(newBeatId(beats)).toBe("s4");
        expect(newBeatId([{ id: "s4", label: "x", role: "detail" }])).toBe("s2");
    });
});

describe("coverageMap", () => {
    it("matches covers verbatim, case-insensitively", () => {
        const map = coverageMap(["The Team", "pricing"], beats);
        expect(map.get("The Team")).toEqual(["s1"]);
        expect(map.get("pricing")).toEqual([]);
    });
});

describe("buildCost", () => {
    // priced over the whole build and rounded once: a section costs well under a credit, so
    // rounding each one first would quote several times the real charge
    it("prices the sections, and adds AI images per image-leading beat", () => {
        expect(buildCost(beats, "stock")).toBe(22);
        expect(buildCost(beats, "ai")).toBe(50);
    });

    it("costs nothing when there is nothing left to build", () => {
        expect(buildCost([], "stock")).toBe(0);
    });
});

describe("pointFromQuestion", () => {
    it("turns an include-this question into a must-cover point", () => {
        expect(
            pointFromQuestion("Should the deck also include a comparison to previous quarters?"),
        ).toBe("a comparison to previous quarters");
        expect(pointFromQuestion("Does it cover pricing tiers?")).toBe("pricing tiers");
    });
    it("returns null when the question isn't an include-this, so no point is invented", () => {
        expect(pointFromQuestion("Is this for a live pitch or an email attachment?")).toBeNull();
        expect(pointFromQuestion("Who is the audience?")).toBeNull();
    });
    it("returns null for an answer that would be too long to read as a chip", () => {
        expect(
            pointFromQuestion(
                `Should it include ${"a very detailed breakdown of every regional business unit ".repeat(3)}?`,
            ),
        ).toBeNull();
    });
});

// The agent's revise-outline sets `layout` on its own, while the outline card always set `blocks`
// beside it. One writer remembering and the other not is how a section became a split and kept a
// single column's worth of blocks.
describe("withDerivedBlocks", () => {
    it("brings the columns along when a layout changes", () => {
        expect(withDerivedBlocks({ layout: "three-up" }, ["chart"])).toEqual({
            layout: "three-up",
            blocks: ["chart", "text", "text"],
        });
    });

    it("leaves a patch that already decided alone", () => {
        const decided = { layout: "two-col", blocks: ["image"] };
        expect(withDerivedBlocks(decided, ["chart"])).toBe(decided);
    });

    it("touches nothing when the layout is not what changed", () => {
        const patch = { takeaway: "a sharper line" };
        expect(withDerivedBlocks(patch, ["chart"])).toBe(patch);
    });
});
