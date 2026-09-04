import { describe, it, expect } from "vitest";
import type { Beat } from "@model/ai";
import { buildCost, coverageMap, pointFromQuestion } from "@app/stores/generate-plan";

const beats: Beat[] = [
    { id: "s1", label: "Cover", role: "scene", covers: ["the team"] },
    { id: "s2", label: "Proof", role: "proof", image: true },
    { id: "s3", label: "Close", role: "close" },
];

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
