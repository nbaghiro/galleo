import { describe, expect, it } from "vitest";
import { CREDIT_USD } from "@model/credits";
import type { PlanId } from "@model/billing";
import {
    CREDIT_PRESETS,
    CREDIT_PRICE_USD,
    PLANS,
    PLAN_ORDER,
    ROLLOVER_CAP_MONTHS,
    can,
    canTopUp,
    canUpgradeFrom,
    clampSeats,
    clipGrant,
    featuresFor,
    grantFor,
    isCreditPreset,
    limit,
    planFor,
    planRank,
    resolveFeatures,
    rolloverCapFor,
    sellsSeats,
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

describe("seats", () => {
    it("sells seats only on the plan that holds a team", () => {
        expect(PLAN_ORDER.filter(sellsSeats)).toEqual(["premium"]);
        expect(sellsSeats(null)).toBe(false);
    });
    it("clamps a seat count to the plan's bounds", () => {
        expect(clampSeats("pro", 4)).toBe(1);
        expect(clampSeats("premium", 1)).toBe(PLANS.premium.billing.minSeats);
        expect(clampSeats("premium", 7.9)).toBe(7);
        expect(clampSeats("premium", 10_000)).toBe(PLANS.premium.billing.maxSeats);
    });
});

describe("resolveFeatures", () => {
    it("resolves the free baseline", () => {
        const free = resolveFeatures("free");
        expect(free.maxArtifacts).toBe(10);
        expect(free.exportFormats).toEqual(["png", "pdf"]);
        expect(free.audio).toBe(false);
    });
    it("grants analytics by plan and by override", () => {
        expect(resolveFeatures("premium").analytics).toBe(true);
        expect(resolveFeatures("pro").analytics).toBe(false);
        expect(resolveFeatures("free", { analytics: true }).analytics).toBe(true);
    });
    it("lets an override widen or narrow a feature", () => {
        expect(resolveFeatures("free", { removeBranding: true }).removeBranding).toBe(true);
        expect(resolveFeatures("premium", { maxArtifacts: 40 }).maxArtifacts).toBe(40);
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
});

describe("grantFor", () => {
    const ws = (plan: string | null, seats: number) => ({ plan, seats });

    it("is the per-seat allowance times the seats", () => {
        expect(grantFor(ws("free", 1))).toBe(PLANS.free.ai.creditsPerSeat);
        expect(grantFor(ws("pro", 1))).toBe(PLANS.pro.ai.creditsPerSeat);
        expect(grantFor(ws("premium", 3))).toBe(3 * PLANS.premium.ai.creditsPerSeat);
        expect(grantFor(ws("premium", 5))).toBe(5 * PLANS.premium.ai.creditsPerSeat);
    });

    // a lapsed team keeps its seat count until the webhook resets it, and a solo plan is one seat
    it("clamps the seats to what the plan can hold", () => {
        expect(grantFor(ws("pro", 4))).toBe(PLANS.pro.ai.creditsPerSeat);
        expect(grantFor(ws("premium", 1))).toBe(3 * PLANS.premium.ai.creditsPerSeat);
        expect(grantFor(ws(null, 4))).toBe(PLANS.free.ai.creditsPerSeat);
    });

    it("lets an override replace the whole grant", () => {
        expect(
            grantFor({ plan: "premium", seats: 4, featureOverrides: { includedCredits: 100 } }),
        ).toBe(100);
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
            expect(CREDIT_PRICE_USD).toBeGreaterThan(p.billing.priceMonthly / p.ai.creditsPerSeat);
        }
    });

    it("offers presets and nothing else", () => {
        for (const n of CREDIT_PRESETS) expect(isCreditPreset(n)).toBe(true);
        expect(isCreditPreset(CREDIT_PRESETS[0]! + 1)).toBe(false);
        expect(isCreditPreset(Number.NaN)).toBe(false);
    });
});

describe("plan credit allowances", () => {
    // The floor the allowances were sized to, checked against the YEARLY price because that is the
    // thinnest way to pay: clearing it there clears it on every route.
    const FLOOR = 0.8;
    const paid = (): PlanId[] => PLAN_ORDER.filter((id) => PLANS[id].billing.priceMonthly > 0);

    it("leaves a fifth of the yearly price to serve a fully-used seat", () => {
        for (const id of paid()) {
            const p = PLANS[id];
            expect(p.ai.creditsPerSeat * CREDIT_USD).toBeLessThanOrEqual(
                p.billing.priceAnnualMonthly * (1 - FLOOR),
            );
        }
    });

    // near-parity is the goal: a credit should cost about the same wherever it comes from, so a
    // dearer plan may sit within a couple of points of a cheaper one but not materially below it
    it("keeps no plan's margin more than two points below a cheaper plan's", () => {
        const margin = (id: PlanId): number =>
            1 - (PLANS[id].ai.creditsPerSeat * CREDIT_USD) / PLANS[id].billing.priceMonthly;
        for (const dearer of paid())
            for (const cheaper of paid())
                if (PLANS[dearer].billing.priceMonthly > PLANS[cheaper].billing.priceMonthly)
                    expect(margin(dearer)).toBeGreaterThan(margin(cheaper) - 0.02);
    });

    it("prices a credit within a tight band across the plans", () => {
        const rates = paid().map(
            (id) => PLANS[id].billing.priceMonthly / PLANS[id].ai.creditsPerSeat,
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
    const pro = { plan: "pro", seats: 1 };
    const cap = rolloverCapFor(pro);
    const grant = grantFor(pro);

    it("is a whole number of monthly grants", () => {
        expect(ROLLOVER_CAP_MONTHS).toBeGreaterThanOrEqual(1);
        expect(cap).toBe(ROLLOVER_CAP_MONTHS * grant);
    });

    it("scales with the seats", () => {
        const team = { plan: "premium", seats: 5 };
        expect(rolloverCapFor(team)).toBe(ROLLOVER_CAP_MONTHS * grantFor(team));
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
        expect(PLANS.premium.highlights[0]).toBe("2,100 credits per seat each month");
    });
});
