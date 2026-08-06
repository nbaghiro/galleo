import { describe, expect, it } from "vitest";
import {
    CREDITS_PER_GENERATION,
    PLANS,
    can,
    creditLimitFor,
    featureStatus,
    featuresFor,
    isPerSeat,
    limit,
    limitsFor,
    planFor,
    resolveFeatures,
    visiblePlans,
    withinLimit,
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

describe("resolveFeatures · launch status gates plan grants", () => {
    it("keeps a premium plan's planned features OFF", () => {
        const premium = resolveFeatures("premium");
        expect(premium.sso).toBe(false);
        expect(premium.customDomains).toBe(0);
    });
    it("won't let an override enable a planned feature", () => {
        expect(resolveFeatures("free", { sso: true }).sso).toBe(false);
    });
    it("grants live analytics by plan and by override", () => {
        expect(resolveFeatures("premium").analytics).toBe(true);
        expect(resolveFeatures("pro").analytics).toBe(false);
        expect(resolveFeatures("free", { analytics: true }).analytics).toBe(true);
    });
    it("lets an override widen a live feature", () => {
        expect(resolveFeatures("free", { removeBranding: true }).removeBranding).toBe(true);
    });
    it("resolves the free baseline", () => {
        const free = resolveFeatures("free");
        expect(free.maxArtifacts).toBe(10);
        expect(free.exportFormats).toEqual(["png", "pdf"]);
    });
});

describe("enforcement accessors", () => {
    const free = resolveFeatures("free");
    const pro = resolveFeatures("pro");
    it("withinLimit treats -1 as unlimited", () => {
        expect(withinLimit(pro, "maxArtifacts", 999_999)).toBe(true);
    });
    it("withinLimit is strict against a finite cap", () => {
        expect(withinLimit(free, "maxArtifacts", 9)).toBe(true);
        expect(withinLimit(free, "maxArtifacts", 10)).toBe(false);
    });
    it("can / limit read the resolved set", () => {
        expect(can(free, "removeBranding")).toBe(false);
        expect(can(resolveFeatures("free", { removeBranding: true }), "removeBranding")).toBe(true);
        expect(limit(free, "maxArtifacts")).toBe(10);
    });
    it("featureStatus reports each feature's launch status", () => {
        expect(featureStatus("removeBranding")).toBe("live");
        expect(featureStatus("maxSectionsPerGeneration")).toBe("beta");
        expect(featureStatus("analytics")).toBe("live");
        expect(featureStatus("sso")).toBe("planned");
    });
});

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
