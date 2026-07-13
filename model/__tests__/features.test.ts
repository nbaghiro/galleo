import { describe, expect, it } from "vitest";
import { can, featureStatus, limit, resolveFeatures, withinLimit } from "@model/features";

describe("resolveFeatures · launch status gates plan grants", () => {
    it("keeps a premium plan's planned features OFF", () => {
        const premium = resolveFeatures("premium");
        expect(premium.analytics).toBe(false);
        expect(premium.sso).toBe(false);
        expect(premium.customDomains).toBe(0);
    });
    it("won't let an override enable a planned feature", () => {
        expect(resolveFeatures("free", { analytics: true }).analytics).toBe(false);
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
        expect(featureStatus("analytics")).toBe("planned");
    });
});
