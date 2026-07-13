import { describe, expect, it } from "vitest";
import {
    CREDITS_PER_GENERATION,
    PLANS,
    isPerSeat,
    limitsFor,
    planFor,
    priceFor,
    visiblePlans,
} from "@model/billing";

describe("planFor", () => {
    it("falls back to Free for null / unknown ids", () => {
        expect(planFor(null)).toBe(PLANS.free);
        expect(planFor("bogus")).toBe(PLANS.free);
    });
    it("returns the plan for a known id", () => {
        expect(planFor("pro")).toBe(PLANS.pro);
    });
});

describe("priceFor", () => {
    it("reads the monthly vs annual-monthly rate", () => {
        expect(priceFor("pro", "month")).toBe(20);
        expect(priceFor("pro", "year")).toBe(16);
    });
    it("is 0 for Free at either interval", () => {
        expect(priceFor("free", "month")).toBe(0);
        expect(priceFor("free", "year")).toBe(0);
    });
});

describe("limitsFor", () => {
    it("projects the legacy flat limits for Free", () => {
        const free = limitsFor("free");
        expect(free.maxArtifacts).toBe(10);
        expect(free.exportFormats).toEqual(["png", "pdf"]);
        expect(free.customThemes).toBe(false);
    });
});

describe("isPerSeat", () => {
    it("is false for Free / null and true for Pro", () => {
        expect(isPerSeat("free")).toBe(false);
        expect(isPerSeat(null)).toBe(false);
        expect(isPerSeat("pro")).toBe(true);
    });
});

describe("catalog constants", () => {
    it("CREDITS_PER_GENERATION matches the metered generate cost", () => {
        expect(CREDITS_PER_GENERATION).toBe(42);
    });
    it("visiblePlans lists the three tiers in order", () => {
        const plans = visiblePlans();
        expect(plans).toHaveLength(3);
        expect(plans.map((p) => p.id)).toEqual(["free", "pro", "premium"]);
    });
});
