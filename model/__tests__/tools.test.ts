import { describe, expect, it } from "vitest";
import {
    costRange,
    estimateCost,
    estimateUsage,
    isMetered,
    sectionsForLength,
    toolsFor,
    typicalCost,
} from "@model/tools";

describe("estimateUsage", () => {
    it("scales generate-artifact by the intake length (stock images are free)", () => {
        expect(estimateUsage("generate-artifact", { length: "Short" })).toEqual({
            plan: 1,
            section: 7,
            image: 0,
        });
    });
    it("meters AI images per image within a generation", () => {
        expect(estimateUsage("generate-artifact", { length: "Short", imageSource: "ai" })).toEqual({
            plan: 1,
            section: 7,
            image: 2,
        });
    });
    it("uses the default size when nothing is passed (stock — no image cost)", () => {
        expect(estimateUsage("generate-artifact", {})).toEqual({
            plan: 1,
            section: 12,
            image: 0,
        });
    });
    it("honors an explicit section count", () => {
        expect(estimateUsage("generate-artifact", { sections: 20 }).section).toBe(20);
    });
});

describe("estimateCost / typicalCost", () => {
    it("prices a default (stock) generate below an AI-image one", () => {
        // stock: plan 3 + 12 sections × 2 = 27; AI adds 3 images × 5 = 42
        expect(estimateCost("generate-artifact", {})).toBe(27);
        expect(estimateCost("generate-artifact", { imageSource: "ai" })).toBe(42);
        expect(typicalCost("generate-artifact")).toBe(42);
    });
    it("prices a single text rewrite at 1 credit", () => {
        expect(typicalCost("rewrite-text")).toBe(1);
    });
});

describe("sectionsForLength", () => {
    it("maps length chips to section counts (case-insensitive)", () => {
        expect(sectionsForLength("Short")).toBe(7);
        expect(sectionsForLength("SHORT")).toBe(7);
        expect(sectionsForLength("In-depth")).toBe(18);
        expect(sectionsForLength("deep")).toBe(18);
        expect(sectionsForLength("Standard")).toBe(12);
        expect(sectionsForLength(undefined)).toBe(12);
    });
});

describe("toolsFor", () => {
    it("returns the internal primitives for the internal surface", () => {
        const internal = toolsFor("internal");
        for (const id of [
            "plan-outline",
            "plan-section",
            "write-section",
            "source-image",
            "check-section",
            "pick-arc",
        ] as const)
            expect(internal).toContain(id);
        expect(internal).not.toContain("reorder-section");
    });
});

describe("costRange / isMetered", () => {
    it("collapses to a point for a fixed-cost tool", () => {
        const range = costRange("add-section");
        expect(range.min).toBe(range.max);
        expect(isMetered("add-section")).toBe(false);
    });
    it("spans small → large for a metered tool", () => {
        const range = costRange("generate-artifact");
        expect(range.min).toBeLessThanOrEqual(range.max);
        expect(isMetered("generate-artifact")).toBe(true);
    });
});
