import { describe, expect, it } from "vitest";
import { CREDIT_USD } from "@model/credits";
import type { PlanId } from "@model/billing";
import {
    CREDIT_BOUNDS,
    CREDIT_PRESETS,
    CREDIT_PRICE_USD,
    PLANS,
    PLAN_ORDER,
    ROLLOVER_CAP_MONTHS,
    can,
    canTopUp,
    canUpgradeFrom,
    clipGrant,
    featuresFor,
    grantFor,
    isCreditQuantity,
    limit,
    planFor,
    planRank,
    resolveFeatures,
    rolloverCapFor,
    upgradeFor,
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
    it("ranks plans by PLAN_ORDER", () => {
        expect(PLAN_ORDER.map(planRank)).toEqual([0, 1, 2]);
        expect(planRank("bogus")).toBe(0);
    });
});

describe("resolveFeatures", () => {
    it("resolves the free baseline", () => {
        const free = resolveFeatures("free");
        expect(free.maxArtifacts).toBe(10);
        expect(free.maxMembers).toBe(1);
        expect(free.exportFormats).toEqual(["png", "pdf"]);
        expect(free.audio).toBe(false);
    });
    it("holds a team only on the team plan", () => {
        expect(resolveFeatures("pro").maxMembers).toBe(1);
        expect(resolveFeatures("premium").maxMembers).toBe(-1);
    });
    it("grants analytics by plan and by override", () => {
        expect(resolveFeatures("premium").analytics).toBe(true);
        expect(resolveFeatures("pro").analytics).toBe(false);
        expect(resolveFeatures("free", { analytics: true }).analytics).toBe(true);
    });
    it("lets an override widen or narrow a feature", () => {
        expect(resolveFeatures("free", { removeBranding: true }).removeBranding).toBe(true);
        expect(resolveFeatures("premium", { maxArtifacts: 40 }).maxArtifacts).toBe(40);
        expect(resolveFeatures("pro", { maxMembers: 5 }).maxMembers).toBe(5);
    });
});

describe("enforcement accessors", () => {
    const free = resolveFeatures("free");
    const pro = resolveFeatures("pro");
    it("withinLimit treats -1 as unlimited", () => {
        expect(withinLimit(pro, "maxArtifacts", 999_999)).toBe(true);
        expect(withinLimit(resolveFeatures("premium"), "maxMembers", 999)).toBe(true);
    });
    it("withinLimit is strict against a finite cap", () => {
        expect(withinLimit(free, "maxArtifacts", 9)).toBe(true);
        expect(withinLimit(free, "maxArtifacts", 10)).toBe(false);
        expect(withinLimit(free, "maxMembers", 1)).toBe(false); // the owner already holds it
    });
    it("can / limit read the resolved set", () => {
        expect(can(free, "removeBranding")).toBe(false);
        expect(can(resolveFeatures("free", { removeBranding: true }), "removeBranding")).toBe(true);
        expect(limit(free, "maxArtifacts")).toBe(10);
    });
});

describe("grantFor", () => {
    it("is the plan's monthly allowance", () => {
        expect(grantFor({ plan: "free" })).toBe(PLANS.free.ai.monthlyCredits);
        expect(grantFor({ plan: "pro" })).toBe(PLANS.pro.ai.monthlyCredits);
        expect(grantFor({ plan: "premium" })).toBe(PLANS.premium.ai.monthlyCredits);
        expect(grantFor({ plan: null })).toBe(PLANS.free.ai.monthlyCredits);
    });

    it("lets an override replace the whole grant", () => {
        expect(grantFor({ plan: "premium", featureOverrides: { includedCredits: 100 } })).toBe(100);
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

describe("credit remedies", () => {
    it("offers an upgrade from every plan but the top one", () => {
        expect(canUpgradeFrom("free")).toBe(true);
        expect(canUpgradeFrom("pro")).toBe(true);
        expect(canUpgradeFrom("premium")).toBe(false);
    });

    it("sells credits on the paid plans, so the top plan still has a remedy", () => {
        expect(canTopUp("free")).toBe(false);
        expect(canTopUp("pro")).toBe(true);
        expect(canTopUp("premium")).toBe(true);
    });

    it("leaves no plan without a remedy when it runs dry", () => {
        for (const id of PLAN_ORDER) expect(canUpgradeFrom(id) || canTopUp(id)).toBe(true);
    });
});

describe("bought credits", () => {
    it("sells a credit above what it costs us", () => {
        expect(CREDIT_PRICE_USD).toBeGreaterThan(CREDIT_USD);
    });

    // buying outright must never beat subscribing, on ANY plan
    it("prices a bought credit above every plan's own per-credit rate", () => {
        for (const id of PLAN_ORDER) {
            const p = PLANS[id];
            if (!p.billing.priceMonthly) continue;
            expect(CREDIT_PRICE_USD).toBeGreaterThan(p.billing.priceMonthly / p.ai.monthlyCredits);
        }
    });

    it("sells any whole quantity within the bounds, the presets among them", () => {
        for (const n of CREDIT_PRESETS) expect(isCreditQuantity(n)).toBe(true);
        expect(isCreditQuantity(1250)).toBe(true);
        expect(isCreditQuantity(CREDIT_BOUNDS.min)).toBe(true);
        expect(isCreditQuantity(CREDIT_BOUNDS.max)).toBe(true);
        expect(isCreditQuantity(CREDIT_BOUNDS.min - 1)).toBe(false);
        expect(isCreditQuantity(CREDIT_BOUNDS.max + 1)).toBe(false);
        expect(isCreditQuantity(10.5)).toBe(false);
        expect(isCreditQuantity(Number.NaN)).toBe(false);
    });
});

describe("plan credit allowances", () => {
    // The floor the allowances were sized to, checked against the YEARLY price because that is the
    // thinnest way to pay: clearing it there clears it on every route.
    const FLOOR = 0.8;
    const paid = (): PlanId[] => PLAN_ORDER.filter((id) => PLANS[id].billing.priceMonthly > 0);

    it("leaves a fifth of the yearly price to serve a fully-used plan", () => {
        for (const id of paid()) {
            const p = PLANS[id];
            expect(p.ai.monthlyCredits * CREDIT_USD).toBeLessThanOrEqual(
                p.billing.priceAnnualMonthly * (1 - FLOOR),
            );
        }
    });

    // near-parity is the goal: a credit should cost about the same wherever it comes from, so a
    // dearer plan may sit within a couple of points of a cheaper one but not materially below it
    it("keeps no plan's margin more than two points below a cheaper plan's", () => {
        const margin = (id: PlanId): number =>
            1 - (PLANS[id].ai.monthlyCredits * CREDIT_USD) / PLANS[id].billing.priceMonthly;
        for (const dearer of paid())
            for (const cheaper of paid())
                if (PLANS[dearer].billing.priceMonthly > PLANS[cheaper].billing.priceMonthly)
                    expect(margin(dearer)).toBeGreaterThan(margin(cheaper) - 0.02);
    });

    it("prices a credit within a tight band across the plans", () => {
        const rates = paid().map(
            (id) => PLANS[id].billing.priceMonthly / PLANS[id].ai.monthlyCredits,
        );
        expect(Math.max(...rates) / Math.min(...rates)).toBeLessThanOrEqual(1.2);
    });

    it("discounts the annual price on every paid plan", () => {
        for (const id of paid())
            expect(PLANS[id].billing.priceAnnualMonthly).toBeLessThan(
                PLANS[id].billing.priceMonthly,
            );
    });
});

describe("the rollover cap", () => {
    const pro = { plan: "pro" };
    const cap = rolloverCapFor(pro);
    const grant = grantFor(pro);

    it("is a whole number of monthly grants", () => {
        expect(ROLLOVER_CAP_MONTHS).toBeGreaterThanOrEqual(1);
        expect(cap).toBe(ROLLOVER_CAP_MONTHS * grant);
    });

    it("grants in full under the cap", () => {
        expect(clipGrant(grant, 0, 0, cap)).toBe(grant);
        expect(clipGrant(grant, cap - grant, 0, cap)).toBe(grant);
    });

    it("clips to the remainder near the cap", () => {
        expect(clipGrant(grant, cap - 100, 0, cap)).toBe(100);
    });

    it("grants nothing at or beyond the cap", () => {
        expect(clipGrant(grant, cap, 0, cap)).toBe(0);
        expect(clipGrant(grant, cap + 500, 0, cap)).toBe(0);
    });

    it("keeps granting while the granted share is under the cap, pack banked or not", () => {
        expect(clipGrant(grant, 300 + 2000, 2000, cap)).toBe(grant);
        expect(clipGrant(grant, 200 + 1000, 1000, cap)).toBe(grant);
        expect(clipGrant(grant, 200, 2000, cap)).toBe(grant);
    });

    it("clips once the granted share reaches the cap, pack or no pack", () => {
        expect(clipGrant(grant, cap + 2000, 2000, cap)).toBe(0);
        expect(clipGrant(grant, cap + 100, 100, cap)).toBe(0);
        expect(clipGrant(grant, cap - 100 + 500, 500, cap)).toBe(100);
    });

    it("handles a zero grant and never returns a negative", () => {
        expect(clipGrant(0, 0, 0, cap)).toBe(0);
        expect(clipGrant(grant, cap * 3, 0, cap)).toBe(0);
    });
});

describe("upgradeFor across feature kinds", () => {
    it("finds the cheapest plan that turns a boolean on", () => {
        expect(upgradeFor("publicLinks", "free")?.id).toBe("pro");
        expect(upgradeFor("analytics", "free")?.id).toBe("premium");
        expect(upgradeFor("analytics", "premium")).toBeNull();
    });

    it("treats a bigger or unlimited number as an upgrade", () => {
        expect(upgradeFor("maxArtifacts", "free")?.id).toBe("pro"); // 10 -> unlimited
        expect(upgradeFor("maxArtifacts", "pro")).toBeNull(); // already unlimited
        expect(upgradeFor("storageMb", "pro")?.id).toBe("premium"); // 20 GB -> unlimited
        expect(upgradeFor("maxMembers", "pro")?.id).toBe("premium"); // solo -> a team
    });

    it("ranks export formats by count", () => {
        expect(upgradeFor("exportFormats", "free")?.id).toBe("pro");
        expect(upgradeFor("exportFormats", "pro")).toBeNull();
    });
});

describe("the catalog copy", () => {
    it("quotes each plan's own credits on its card", () => {
        expect(PLANS.free.highlights[0]).toBe("300 credits a month");
        expect(PLANS.pro.highlights[0]).toBe("1,200 credits a month");
        expect(PLANS.premium.highlights[0]).toBe(
            "5,000 credits a month, one pool for the whole team",
        );
    });
});
