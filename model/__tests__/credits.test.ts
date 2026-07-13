import { describe, expect, it } from "vitest";
import { costOf, describeUsage, mergeUsage } from "@model/credits";

// Tier-A pure: the metered-credit math. Unit prices: plan 3 · section 2 · image 5 · text 1.

describe("costOf", () => {
    it("floors an empty bag at 1 so nothing is free", () => {
        expect(costOf({})).toBe(1);
    });
    it("sums unit price × count (1 plan + 12 sections + 3 images = 42)", () => {
        expect(costOf({ plan: 1, section: 12, image: 3 })).toBe(42);
    });
});

describe("mergeUsage", () => {
    it("adds bags together key by key", () => {
        expect(mergeUsage({ section: 1 }, { section: 2, image: 1 })).toEqual({
            section: 3,
            image: 1,
        });
    });
});

describe("describeUsage", () => {
    it("renders a human breakdown, pluralizing counts > 1", () => {
        expect(describeUsage({ plan: 1, section: 12, image: 3 })).toBe(
            "1 plan · 12 sections · 3 images",
        );
    });
    it("renders an em dash for an empty bag", () => {
        expect(describeUsage({})).toBe("—");
    });
});
