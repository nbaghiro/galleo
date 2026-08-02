import { describe, expect, it } from "vitest";
import { PLANS } from "@model/billing";
import { creditLimitFor, featuresFor } from "../features";

describe("creditLimitFor", () => {
    it("flat plans ignore seats", () => {
        expect(creditLimitFor({ plan: "free", seats: 5 })).toBe(PLANS.free.ai.creditsPerMonth);
    });

    it("per-seat plans scale the pool by purchased seats", () => {
        expect(creditLimitFor({ plan: "pro", seats: 3 })).toBe(PLANS.pro.ai.creditsPerMonth * 3);
        expect(creditLimitFor({ plan: "premium", seats: 2 })).toBe(
            PLANS.premium.ai.creditsPerMonth * 2,
        );
    });

    it("clamps seats to at least 1", () => {
        expect(creditLimitFor({ plan: "pro", seats: 0 })).toBe(PLANS.pro.ai.creditsPerMonth);
    });

    it("defaults unknown/null plans to free", () => {
        expect(creditLimitFor({ plan: null, seats: 4 })).toBe(PLANS.free.ai.creditsPerMonth);
    });

    it("applies a creditsPerMonth override to the per-seat base", () => {
        expect(
            creditLimitFor({ plan: "pro", seats: 2, featureOverrides: { creditsPerMonth: 100 } }),
        ).toBe(200);
    });
});

describe("featuresFor", () => {
    it("resolves plan grants with overrides folded in", () => {
        expect(featuresFor({ plan: "free" }).customThemes).toBe(false);
        expect(
            featuresFor({ plan: "free", featureOverrides: { customThemes: true } }).customThemes,
        ).toBe(true);
    });
});
